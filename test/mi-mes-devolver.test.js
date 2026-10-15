import { test } from 'node:test';
import assert from 'node:assert/strict';
const M = await import('../api/_herramientas/mi-mes/calculos.js');
const $ = p => Math.round(p * 100);
function persona() {
  const d = M.datosVacios();
  d.ingresos.push({ id: 'i', nombre: 'Sueldo', monto: $(1_000_000), repite: true, desde: '2026-01' });
  d.tarjetas.push({ id: 'v', nombre: 'Visa', red: 'Visa', banco: '', ultimos4: '', color: 'azul' });
  d.cuotas.push({ id: 'c', descripcion: 'Heladera', total: $(120_000), moneda: 'ARS', cantidad: 3, tarjetaId: 'v', primerMes: '2026-10', origen: 'manual', fecha: '2026-09-20',
    compartida: { con: 'Juli', tipo: '%', valor: 50 } });
  d.devolver = [{ id: 'r1', tipo: 'reintegro', motivo: 'Promo súper 20 %', monto: $(8_000), fecha: '2026-09-10', esperada: '2026-10-10' },
    { id: 'l1', tipo: 'laboral', motivo: 'Taxi a cliente', monto: $(15_000), fecha: '2026-10-01', esperada: '2026-11-05' }];
  d.resumenes.push({ id: 'rs', tarjetaId: 'v', mes: '2026-10', cierre: '2026-10-01', vencimiento: '2026-10-12', totales: { ARS: $(100_000) }, consumos: [], cargos: [],
    pagosYCreditos: [{ fecha: '2026-09-25', concepto: 'REINTEGRO PROMO SUPER', monto: -8_000 * 100, moneda: 'ARS', tipo: 'credito' },
      { fecha: '2026-09-12', concepto: 'SU PAGO EN PESOS', monto: -50_000 * 100, moneda: 'ARS', tipo: 'pago' }] });
  return M.migrar(d);
}
test('bandeja: lo cargado y lo que te deben de una compartida, con vencidos', () => {
  const b = M.bandejaDevolver(persona(), '2026-10-15');
  assert.deepEqual(b.pendientes.map(x => [x.id, x.monto, x.vencido]), [['r1', $(8_000), true], ['l1', $(15_000), false], ['comp:c', $(60_000), true]]);
  assert.equal(b.total, $(83_000));
});
test('bandeja: el crédito del resumen es candidato (nunca el pago), y propone el reintegro parecido', () => {
  const b = M.bandejaDevolver(persona(), '2026-10-15');
  assert.deepEqual(b.candidatos.map(c => [c.concepto, c.monto, c.parecido]), [['REINTEGRO PROMO SUPER', $(8_000), ['r1']]]);
  const d = persona();
  d.devolver[0].acreditado = '2026-10-15'; d.devolver[0].credito = { resumenId: 'rs', i: 0 };
  const b2 = M.bandejaDevolver(M.migrar(d), '2026-10-15');
  assert.equal(b2.candidatos.length, 0, 'ya vinculado');
  assert.deepEqual(b2.acreditados.map(x => x.id), ['r1']);
});
test('bandeja: nada suma al disponible ni a ingresos/gastos', () => {
  const d = persona();
  const sin = M.resumenMes({ ...d, devolver: [] }, '2026-10');
  const con = M.resumenMes(d, '2026-10');
  assert.deepEqual([con.totIngresos, con.totGastos, con.libres], [sin.totIngresos, sin.totGastos, sin.libres]);
});
test('reclamo: mensaje armado para copiar, con motivo, monto y fechas', () => {
  const b = M.bandejaDevolver(persona(), '2026-10-15');
  const t = M.mensajeReclamo(b.pendientes[0], { tarjeta: 'Visa' });
  assert.equal(t, 'Hola. Les escribo por reintegro de promo: Promo súper 20 %, del 10/9/2026, pagado con Visa, por $ 8.000. Tendría que haberse acreditado el 10/10/2026 y todavía no lo veo. ¿Me confirman cuándo se acredita? Gracias.');
  assert.match(M.mensajeReclamo(b.pendientes[2]), /^Hola Juli! Te escribo por su parte de Heladera: quedan \$ 60\.000 pendientes/);
});
