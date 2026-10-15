/* Mi Mes by Orbit · regla central: compra ≠ compromiso ≠ pago. Datos inventados, montos en centavos. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const M = await import('../api/_herramientas/mi-mes/calculos.js');
const $ = p => Math.round(p * 100);
const fixture = n => JSON.parse(readFileSync(new URL(`./fixtures/mi-mes/${n}.json`, import.meta.url), 'utf8'));
let k = 0;
const id = () => `id${k++}`;

/* Un resumen inventado de la tarjeta 1111 que vence en `venc` con estos consumos y pagos. */
function lectura(venc, cierre, consumos, pagos = [], saldoAnterior = 0) {
  const total = saldoAnterior + consumos.reduce((a, c) => a + c.monto, 0) + pagos.reduce((a, p) => a + p.monto, 0);
  const l = { ...fixture('simple'), tarjetas: [], cierre, vencimiento: venc, proximoCierre: null, proximoVencimiento: null, cuotasAVencer: [],
    consumos, pagosYCreditos: pagos, cargos: [], saldoAnterior: [{ moneda: 'ARS', monto: saldoAnterior }], totales: [{ moneda: 'ARS', monto: total }] };
  const v = M.validarLectura(l);
  assert.ok(v.lectura, 'la lectura inventada es válida');
  return v.lectura;
}
const heladera = n => ({ fecha: '2026-09-28', comercio: 'ELECTRO INVENTADO', monto: 40_000, moneda: 'ARS', rubro: 'Hogar', cuota: { n, de: 3 }, tarjeta: null });
const base = () => {
  const d = M.datosVacios();
  d.ingresos.push({ id: 'i', nombre: 'Sueldo', monto: $(1_000_000), repite: true, desde: '2026-09' });
  d.tarjetas.push({ id: 't', nombre: 'Visa', red: 'Visa', banco: 'Banco Inventado Uno', ultimos4: '1111', color: 'azul', diaCierre: 30, diaVence: 10 });
  return d;
};
const compra = { id: 'c', descripcion: 'Heladera', total: $(120_000), moneda: 'ARS', cantidad: 3, tarjetaId: 't', primerMes: '2026-10', fecha: '2026-09-28', origen: 'manual' };

test('compra ≠ compromiso: $ 120.000 en 3 cuotas es una compra de $ 120.000 y 3 obligaciones de $ 40.000', () => {
  const d = base(); d.cuotas.push(compra);
  const f = M.fichaCompra(d, 'c', '2026-10-15');
  assert.equal(f.compra, $(120_000));
  assert.deepEqual(f.obligaciones.map(o => [o.n, o.mes, o.monto]), [[1, '2026-10', $(40_000)], [2, '2026-11', $(40_000)], [3, '2026-12', $(40_000)]]);
  // ningún mes carga la compra entera: cada mes, una obligación
  for (const m of ['2026-10', '2026-11', '2026-12']) assert.equal(M.resumenMes(d, m).totTarjetas, $(40_000), m);
  assert.equal(M.resumenMes(d, '2027-01').totTarjetas, 0);
  // sin resumen todavía: cada obligación dice en qué resumen se paga (proyectado por los días de la tarjeta)
  assert.deepEqual(f.obligaciones.map(o => [o.estado, o.vencimiento]), [['proyectada', '2026-10-10'], ['proyectada', '2026-11-10'], ['proyectada', '2026-12-10']]);
});

test('el mes del resumen se cuenta una sola vez (no resumen + cuotas)', () => {
  const d = base();
  const r = M.importarResumen(d, lectura('2026-10-10', '2026-09-30', [heladera(1), { fecha: '2026-09-20', comercio: 'SUPER INVENTADO', monto: 60_000, moneda: 'ARS', rubro: 'Supermercado', cuota: null, tarjeta: null }]), { tarjetaId: 't', nuevoId: id });
  const oct = M.resumenMes(r.datos, '2026-10');
  assert.equal(oct.totTarjetas, $(100_000), 'el total del resumen, nada más');
  assert.equal(M.resumenMes(r.datos, '2026-11').totTarjetas, $(40_000), 'la cuota 2, una vez');
  assert.equal(M.resumenMes(r.datos, '2026-12').totTarjetas, $(40_000), 'la cuota 3, una vez');
});

test('pagar el resumen no es un gasto nuevo', () => {
  const d = base();
  const r1 = M.importarResumen(d, lectura('2026-10-10', '2026-09-30', [heladera(1)]), { tarjetaId: 't', nuevoId: id });
  // el resumen de noviembre trae el pago del de octubre (−40.000) y el saldo anterior (+40.000)
  const r2 = M.importarResumen(r1.datos, lectura('2026-11-10', '2026-10-30', [heladera(2)], [{ fecha: '2026-10-10', concepto: 'SU PAGO EN PESOS', monto: -40_000, moneda: 'ARS', tipo: 'pago' }], 40_000), { tarjetaId: 't', nuevoId: id });
  const nov = M.resumenMes(r2.datos, '2026-11');
  assert.equal(nov.totTarjetas, $(40_000), 'noviembre paga la cuota 2; el pago de octubre no suma');
  assert.equal(nov.totGastos, 0, 'el pago no aparece como gasto fijo');
  const rubros = M.gastoPorRubro(r2.datos.resumenes.find(x => x.mes === '2026-11'), r2.datos);
  assert.equal(JSON.stringify(rubros).includes('PAGO'), false);
});

test('importar el resumen siguiente no duplica nada', () => {
  const d = base();
  const r1 = M.importarResumen(d, lectura('2026-10-10', '2026-09-30', [heladera(1)]), { tarjetaId: 't', nuevoId: id });
  const r2 = M.importarResumen(r1.datos, lectura('2026-11-10', '2026-10-30', [heladera(2)]), { tarjetaId: 't', nuevoId: id });
  assert.equal(r2.datos.cuotas.filter(c => c.tarjetaId === 't').length, 1, 'una sola compra');
  assert.equal(r2.datos.tarjetas.length, 1, 'una sola tarjeta');
  assert.deepEqual(['2026-10', '2026-11', '2026-12', '2027-01'].map(m => M.resumenMes(r2.datos, m).totTarjetas), [$(40_000), $(40_000), $(40_000), 0]);
  // reimportar el mismo resumen tampoco
  const r3 = M.importarResumen(r2.datos, lectura('2026-11-10', '2026-10-30', [heladera(2)]), { tarjetaId: 't', nuevoId: id });
  assert.equal(r3.datos.resumenes.length, 2);
  assert.equal(r3.datos.cuotas.length, 1);
});

test('la compra nueva conciliada no se duplica, y la ficha dice en qué resumen se paga cada cuota', () => {
  const d = base(); d.cuotas.push(compra);
  const r = M.importarResumen(d, lectura('2026-10-10', '2026-09-30', [heladera(1)]), { tarjetaId: 't', nuevoId: id });
  assert.deepEqual(r.conciliadas, ['c']);
  assert.equal(r.datos.cuotas.length, 1);
  assert.deepEqual(['2026-10', '2026-11', '2026-12'].map(m => M.resumenMes(r.datos, m).totTarjetas), [$(40_000), $(40_000), $(40_000)]);
  const c = r.datos.cuotas[0];
  const f = M.fichaCompra(r.datos, c.id, '2026-10-15');
  assert.equal(f.compra, $(120_000));
  assert.deepEqual(f.obligaciones.map(o => [o.n, o.estado, o.vencimiento]), [[1, 'resumen', '2026-10-10'], [2, 'proyectada', '2026-11-10'], [3, 'proyectada', '2026-12-10']]);
});
