import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const M = await import('../api/_herramientas/mi-mes/calculos.js');
const $ = p => Math.round(p * 100);
function persona() {
  const d = M.datosVacios();
  d.ingresos.push({ id: 'i', nombre: 'Sueldo', monto: $(1_000_000), repite: true, desde: '2026-01' });
  d.gastos.push({ id: 'net', nombre: 'Internet', categoria: 'Servicios', monto: $(30_000), repite: true, desde: '2026-01' });
  d.tarjetas.push({ id: 'v', nombre: 'Visa', red: 'Visa', banco: '', ultimos4: '', color: 'azul', diaCierre: 28, diaVence: 8 });
  return M.migrar(d);
}
test('qué cambió: noviembre tiene $ 38.000 más comprometidos, explicado por origen', () => {
  const d = persona();
  const foto = M.fotoProyeccion(d, '2026-10');
  d.cuotas.push({ id: 'h', descripcion: 'Heladera', total: $(36_000), moneda: 'ARS', cantidad: 3, tarjetaId: 'v', primerMes: '2026-11', origen: 'manual' });
  d.gastos[0].monto = $(48_000);                        // internet subió 18.000
  d.gastos.push({ id: 'x', nombre: 'Seguro', categoria: 'Seguros', monto: $(8_000), repite: true, desde: '2026-11' });
  const c = M.cambiosDesde(foto, d).find(x => x.mes === '2026-11');
  assert.equal(c.comprometido, $(38_000));
  assert.equal(c.deltaLibres, $(-38_000));
  assert.equal(c.texto, 'Noviembre tiene $ 38.000 más comprometidos: $ 18.000 de Internet, $ 12.000 de una compra nueva (Heladera) y $ 8.000 de un gasto fijo nuevo (Seguro).');
  // cada línea lleva a su origen
  assert.deepEqual(c.lineas.map(l => l.ref), [{ editar: 'gasto', id: 'net' }, { editar: 'cuota', id: 'h' }, { editar: 'gasto', id: 'x' }]);
});
test('qué cambió: si la compra se borra, se recalcula solo y no queda nada', () => {
  const d = persona();
  const foto = M.fotoProyeccion(d, '2026-10');
  d.cuotas.push({ id: 'h', descripcion: 'Heladera', total: $(36_000), moneda: 'ARS', cantidad: 3, tarjetaId: 'v', primerMes: '2026-11', origen: 'manual' });
  assert.equal(M.cambiosDesde(foto, d).length, 2);
  d.cuotas = [];
  assert.deepEqual(M.cambiosDesde(foto, d), []);
});
test('qué cambió: cambios chicos (menos de $ 1.000) no molestan; ingresos aparte', () => {
  const d = persona();
  const foto = M.fotoProyeccion(d, '2026-10');
  d.gastos[0].monto = $(30_500);
  assert.deepEqual(M.cambiosDesde(foto, d), []);
  d.ingresos[0].monto = $(1_100_000);
  const c = M.cambiosDesde(foto, d)[0];
  assert.match(c.texto, /\$ 100\.000 más de ingresos/);
  assert.equal(c.comprometido, $(500));
});
test('qué cambió: la foto sobrevive a migrar', () => {
  const d = persona();
  d.fotoBase = M.fotoProyeccion(d, '2026-10');
  d.cambios = [{ motivo: 'Importaste un resumen', fecha: '2026-10-15T10:00' }];
  const m = M.migrar(d);
  assert.deepEqual(Object.keys(m.fotoBase.meses), ['2026-10', '2026-11', '2026-12']);
  assert.equal(m.cambios.length, 1);
});
