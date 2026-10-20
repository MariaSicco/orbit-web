import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const M = await import('../api/_herramientas/mi-mes/calculos.js');
const $ = p => Math.round(p * 100);
const fixture = n => JSON.parse(readFileSync(new URL(`./fixtures/mi-mes/${n}.json`, import.meta.url), 'utf8'));
function lectura(venc, consumos, pagos = []) {
  const total = consumos.reduce((a, c) => a + c.monto, 0) + pagos.reduce((a, p) => a + p.monto, 0);
  return M.validarLectura({ ...fixture('simple'), tarjetas: [], cierre: null, vencimiento: venc, proximoCierre: null, proximoVencimiento: null, cuotasAVencer: [],
    consumos, pagosYCreditos: pagos, cargos: [], saldoAnterior: [], totales: [{ moneda: 'ARS', monto: total }] }).lectura;
}
const base = () => {
  const d = M.datosVacios();
  d.tarjetas.push({ id: 't', nombre: 'Visa', red: 'Visa', banco: 'Banco Inventado Uno', ultimos4: '1111', color: 'azul' });
  d.cuotas.push({ id: 'c', descripcion: 'Heladera', total: $(120_000), moneda: 'ARS', cantidad: 3, tarjetaId: 't', primerMes: '2026-10', fecha: '2026-09-28', origen: 'manual',
    compartida: { con: 'Juli', tipo: '%', valor: 50 } });
  return d;
};
const hel = n => ({ fecha: '2026-09-28', comercio: 'ELECTRO INVENTADO SA', monto: 40_000, moneda: 'ARS', rubro: 'Hogar', cuota: { n, de: 3 }, tarjeta: null });
let k = 0; const id = () => `x${k++}`;
test('historia: la compra cargada y su consumo en cada resumen son la misma compra (mismo id, conserva lo compartido)', () => {
  const r1 = M.importarResumen(base(), lectura('2026-10-10', [hel(1)]), { tarjetaId: 't', nuevoId: id });
  assert.equal(r1.datos.cuotas.length, 1);
  const c = r1.datos.cuotas[0];
  assert.equal(c.id, 'c');
  assert.equal(c.compartida.con, 'Juli');
  assert.deepEqual(c.evidencias.map(e => [e.tipo, e.mes || null]), [['compra', null], ['resumen', '2026-10']]);
  const r2 = M.importarResumen(r1.datos, lectura('2026-11-10', [hel(2)]), { tarjetaId: 't', nuevoId: id });
  assert.equal(r2.datos.cuotas.length, 1, 'el resumen siguiente reconoce la misma compra');
  assert.deepEqual(r2.datos.cuotas[0].evidencias.map(e => [e.tipo, e.n ?? null]), [['compra', null], ['resumen', 1], ['resumen', 2]]);
  // reimportar no duplica la evidencia
  const r3 = M.importarResumen(r2.datos, lectura('2026-11-10', [hel(2)]), { tarjetaId: 't', nuevoId: id });
  assert.equal(r3.datos.cuotas[0].evidencias.length, 3);
});
test('historia: la devolución del comercio se propone (comercio + monto + fecha), nunca solo por monto', () => {
  const r1 = M.importarResumen(base(), lectura('2026-10-10', [hel(1)]), { tarjetaId: 't', nuevoId: id });
  const otro = { fecha: '2026-10-05', concepto: 'CREDITO OTRO COMERCIO', monto: -40_000, moneda: 'ARS', tipo: 'credito' };
  const mismo = { fecha: '2026-10-06', concepto: 'DEVOLUCION ELECTRO INVENTADO', monto: -40_000, moneda: 'ARS', tipo: 'credito' };
  const r2 = M.importarResumen(r1.datos, lectura('2026-11-10', [hel(2)], [otro, mismo]), { tarjetaId: 't', nuevoId: id });
  const h = M.historiaCompra(r2.datos, 'c');
  assert.deepEqual(h.propuestas.map(p => [p.concepto, p.seguro]), [['DEVOLUCION ELECTRO INVENTADO', true]]);
  const d3 = M.vincularCredito(r2.datos, 'c', h.propuestas[0].resumenId, h.propuestas[0].i);
  const h3 = M.historiaCompra(d3, 'c');
  assert.equal(h3.propuestas.length, 0);
  assert.ok(h3.evidencias.some(e => e.tipo === 'credito' && e.concepto === 'DEVOLUCION ELECTRO INVENTADO'));
  // vincular no cambia ninguna cuenta: el crédito ya está en el total del resumen
  assert.deepEqual(['2026-10', '2026-11', '2026-12'].map(m => M.resumenMes(d3, m).totTarjetas), ['2026-10', '2026-11', '2026-12'].map(m => M.resumenMes(r2.datos, m).totTarjetas));
});
test('historia: reintegro de la bandeja y devoluciones de lo compartido entran en la ficha; mail y ticket ya caben en el modelo', () => {
  const d = base();
  d.devolver = [{ id: 'r', tipo: 'reintegro', motivo: 'Promo 10 %', monto: $(12_000), fecha: '2026-09-28', esperada: '2026-11-01', cuotaId: 'c' }];
  d.cuotas[0].compartida.devoluciones = [{ fecha: '2026-10-02', monto: $(20_000) }];
  d.cuotas[0].evidencias = [{ tipo: 'ticket', origen: 'foto-1', fecha: '2026-09-28' }, { tipo: 'mail', origen: 'aviso', fecha: '2026-09-28' }, { tipo: 'raro' }];
  const m = M.migrar(d);
  assert.deepEqual(m.cuotas[0].evidencias.map(e => e.tipo), ['ticket', 'mail']);
  const h = M.historiaCompra(m, 'c');
  assert.deepEqual(h.evidencias.map(e => e.tipo).sort(), ['credito', 'mail', 'reintegro', 'ticket']);
});
