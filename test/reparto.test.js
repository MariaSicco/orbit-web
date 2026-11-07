/* Vencimientos · reparto de gastos en la casa compartida. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
const V = await import('../api/_herramientas/vencimientos/calculos.js');
const P = await import('../api/_herramientas/vencimientos/reparto.js');
const HOY = '2026-10-25';
const casa = () => {
  let d = V.estadoVacio();
  d.cuentas = [
    { id: 'alq', nombre: 'Alquiler', categoria: 'Casa', frecuencia: 1, primerVto: '2026-10-05', monto: 60000000 },
    { id: 'luz', nombre: 'Edenor', categoria: 'Luz, gas y agua', frecuencia: 1, primerVto: '2026-10-19', monto: 4000000 },
    { id: 'net', nombre: 'Netflix', categoria: 'Entretenimiento', frecuencia: 1, primerVto: '2026-10-14', monto: 1800000, debito: true },
  ];
  d = V.marcarPagado(d, 'alq', '2026-10-05', { monto: 60000000, fecha: '2026-10-04', por: 'Majo' });
  d = V.marcarPagado(d, 'luz', '2026-10-19', { monto: 4000000, fecha: '2026-10-18', por: 'Lu' });
  return d;
};

test('partes iguales: quien puso de menos le transfiere a quien puso de más', () => {
  const r = P.reparto(casa(), '2026-10', ['Majo', 'Lu'], HOY);
  assert.equal(r.total, 64000000);
  assert.deepEqual(r.transferencias, [{ de: 'Lu', a: 'Majo', monto: 28000000 }]);
});

test('porcentajes por persona y "saldar" deja en cero', () => {
  let d = casa();
  d.config.reparto = { modo: 'porcentajes', partes: { Majo: 60, Lu: 40 } };
  const r = P.reparto(d, '2026-10', ['Majo', 'Lu'], HOY);
  assert.deepEqual(r.transferencias, [{ de: 'Lu', a: 'Majo', monto: 21600000 }]);
  d = P.saldar(d, { mes: '2026-10', ...r.transferencias[0], fecha: HOY });
  assert.equal(P.reparto(d, '2026-10', ['Majo', 'Lu'], HOY).transferencias.length, 0);
});

test('tres personas y pagos sin "quién" aparte', () => {
  let d = casa();
  d = V.marcarPagado(d, 'net', '2026-10-14', { monto: 1800000, fecha: '2026-10-14' });
  const r = P.reparto(d, '2026-10', ['Majo', 'Lu', 'Tomi'], HOY);
  assert.equal(r.sinQuienCant, 1);
  const total = r.transferencias.reduce((a, t) => a + t.monto, 0);
  assert.ok(r.transferencias.every(t => t.a === 'Majo'));
  assert.ok(Math.abs(total - (60000000 - 64000000 / 3)) <= 200);
});

test('fusionar junta los saldos de los dos teléfonos', () => {
  const a = P.saldar(casa(), { mes: '2026-10', de: 'Lu', a: 'Majo', monto: 100, fecha: HOY });
  const b = P.saldar(casa(), { mes: '2026-10', de: 'Tomi', a: 'Majo', monto: 200, fecha: HOY });
  assert.equal(V.fusionar(a, b).saldos.length, 2);
});
