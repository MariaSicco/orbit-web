import { test } from 'node:test';
import assert from 'node:assert/strict';
const M = await import('../api/_herramientas/mi-mes/calculos.js');
const $ = p => Math.round(p * 100);
function persona() {
  const d = M.datosVacios();
  d.ingresos.push({ id: 'i', nombre: 'Sueldo', monto: $(1_000_000), repite: true, desde: '2026-01' });
  d.gastos.push({ id: 'luz', nombre: 'Luz', categoria: 'Servicios', monto: $(60_000), repite: true, desde: '2026-01', dia: 12 },
    { id: 'gym', nombre: 'Gimnasio', categoria: 'Otros', monto: $(30_000), repite: true, desde: '2026-01', dia: 20 });
  return M.migrar(d);
}
test('estimado: hasta confirmar se reserva el estimado; el real reemplaza y explica la diferencia', () => {
  const d = persona();
  const antes = M.resumenMes(d, '2026-10');
  assert.equal(antes.libres, $(910_000));
  assert.deepEqual(antes.gastos.map(g => [g.id, g.confirmado]), [['luz', false], ['gym', false]]);
  const r = M.confirmarGasto(d, 'luz', '2026-10', $(72_000));
  assert.equal(r.texto, 'Luz vino $ 12.000 más que el estimado: te quedan libres $ 12.000 menos.');
  const desp = M.resumenMes(r.datos, '2026-10');
  assert.equal(desp.libres, $(898_000));
  assert.equal(desp.gastos[0].diferencia, $(12_000));
  // noviembre vuelve al estimado
  assert.equal(M.resumenMes(r.datos, '2026-11').libres, $(910_000));
  // menos que el estimado: recién al confirmar sube lo libre
  const r2 = M.confirmarGasto(d, 'luz', '2026-10', $(50_000));
  assert.match(r2.texto, /\$ 10\.000 menos que el estimado: te quedan libres \$ 10\.000 más/);
  // igual al estimado
  assert.match(M.confirmarGasto(d, 'luz', '2026-10').texto, /igual al estimado/);
  // sobrevive a migrar
  assert.deepEqual(M.migrar(r.datos).reales, { '2026-10': { luz: $(72_000) } });
});
test('estimado: lo di de baja deja de contar desde este mes, o desde el próximo si ya se pagó', () => {
  const d = persona();
  const b = M.darDeBajaGasto(d, 'gym', '2026-10');
  assert.equal(M.resumenMes(b.datos, '2026-10').totGastos, $(60_000));
  assert.match(b.texto, /deja de contar desde octubre 2026/);
  assert.equal(M.resumenMes(b.datos, '2026-09').totGastos, $(90_000), 'el pasado no cambia');
  const pagado = M.confirmarGasto(d, 'gym', '2026-10').datos;
  const b2 = M.darDeBajaGasto(pagado, 'gym', '2026-10');
  assert.equal(M.resumenMes(b2.datos, '2026-10').totGastos, $(90_000));
  assert.equal(M.resumenMes(b2.datos, '2026-11').totGastos, $(60_000));
});
test('estimado en el motor: pregunta cuando ya debería haber aparecido, ordenado por monto', () => {
  const d = persona();
  const p = M.preguntas(d, '2026-10-15', { gastoEstimado: true });
  assert.deepEqual(p.ahora.filter(x => x.tipo === 'estimado').map(x => x.gastoId), ['luz']);   // el gimnasio vence el 20
  const p2 = M.preguntas(M.confirmarGasto(d, 'luz', '2026-10').datos, '2026-10-21', { gastoEstimado: true });
  assert.deepEqual(p2.ahora.filter(x => x.tipo === 'estimado').map(x => x.gastoId), ['gym']);
});
