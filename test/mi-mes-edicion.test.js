/* Mi Mes · editar no pierde lo que el formulario no muestra, y dos gastos parecidos no se pisan sin avisar.
   Todos los datos son INVENTADOS. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
const M = await import('../api/_herramientas/mi-mes/calculos.js');
const D = await import('../api/_herramientas/mi-mes/documentos.js');
const $ = p => Math.round(p * 100);
const delForm = (id, monto, extra = {}) => ({ id, nombre: 'Luz', categoria: 'Luz', monto: $(monto), repite: true, desde: '2026-10', ...extra });

test('editar un gasto conserva frecuencia, suba y factura, y sigue contando cada dos meses', () => {
  const previo = delForm('g', 40_000, { frecuencia: 2, sube: { desde: '2027-01', monto: $(50_000) }, doc: { fecha: '2026-10-01' } });
  const editado = M.gastoEditado(previo, delForm('g', 40_000));
  assert.equal(editado.frecuencia, 2);
  assert.deepEqual(editado.sube, previo.sube);
  assert.deepEqual(editado.doc, previo.doc);
  const datos = M.migrar({ ingresos: [], gastos: [editado], tarjetas: [], cuotas: [] });
  assert.deepEqual(['2026-10', '2026-11', '2026-12'].map(mes => M.resumenMes(datos, mes).gastos.length), [1, 0, 1]);
});
test('corregir el monto saca la marca de estimado, pero conserva la fecha de la factura', () => {
  const previo = delForm('g', 40_000, { doc: { fecha: '2026-08-20', estimado: true } });
  assert.deepEqual(M.gastoEditado(previo, delForm('g', 40_000)).doc, { fecha: '2026-08-20', estimado: true });
  assert.deepEqual(M.gastoEditado(previo, delForm('g', 45_000)).doc, { fecha: '2026-08-20' });
});
test('un gasto que deja de repetirse no se lleva frecuencia ni suba; alta nueva queda igual', () => {
  const previo = delForm('g', 40_000, { frecuencia: 2, sube: { desde: '2027-01', monto: $(50_000) } });
  const editado = M.gastoEditado(previo, delForm('g', 40_000, { repite: false }));
  assert.equal(editado.frecuencia, undefined);
  assert.equal(editado.sube, undefined);
  const nuevo = delForm('h', 10_000);
  assert.deepEqual(M.gastoEditado(undefined, nuevo), nuevo);
});
test('editar un ingreso conserva la fecha del recibo: uno viejo no pisa al nuevo', () => {
  const previo = { id: 'i', nombre: 'Sueldo', monto: $(1_800_000), repite: true, desde: '2026-10', hasta: '2027-06', doc: { fecha: '2026-10-31' } };
  const editado = M.ingresoEditado(previo, { id: 'i', nombre: 'Sueldo', monto: $(1_850_000), repite: true, desde: '2026-10' });
  assert.deepEqual(editado.doc, previo.doc);
  assert.equal(editado.hasta, '2027-06');
  assert.equal(editado.monto, $(1_850_000));
  const [viejo] = D.itemsDeRecibo({ neto: $(1_500_000), moneda: 'ARS', fechaPago: '2026-08-05', periodo: '2026-07', clase: 'mensual' }, { ingresos: [editado], gastos: [] }, { archivo: 'a' });
  assert.equal(viejo.accion, 'viejo');
});
const factura = { tipo: 'factura', nombre: 'Luz', categoria: 'Luz', monto: $(70_000), vence: '2026-11-20' };
test('con dos gastos parecidos la factura pregunta de cuál es, y aplica sobre el elegido', () => {
  const datos = { ingresos: [], tarjetas: [], cuotas: [], gastos: [delForm('a', 40_000), delForm('b', 60_000, { nombre: 'Luz del local' })] };
  const [it] = D.itemsDeFactura(factura, datos, { archivo: 'f', hoy: '2026-11-06' });
  assert.deepEqual(it.candidatos.map(c => c.id), ['a', 'b']);
  assert.equal(it.previoId, 'a');
  const elegido = { ...it, previoId: 'b', antes: it.candidatos[1].antes, accion: it.candidatos[1].accion };
  let n = 0;
  const r = D.aplicarItems(datos, [elegido], { nuevoId: () => `n${++n}`, hoy: '2026-11-06' }).datos;
  assert.equal(r.gastos.find(g => g.id === 'a').monto, $(40_000));
  assert.equal(r.gastos.find(g => g.id === 'b').monto, $(70_000));
  assert.equal(r.gastos.length, 2);
});
test('con un solo gasto parecido no pregunta nada, y "Es otro gasto" suma uno nuevo', () => {
  const uno = { ingresos: [], tarjetas: [], cuotas: [], gastos: [delForm('a', 40_000)] };
  const [it] = D.itemsDeFactura(factura, uno, { archivo: 'f', hoy: '2026-11-06' });
  assert.equal(it.candidatos, undefined);
  assert.equal(it.accion, 'actualizar');
  const dos = { ...uno, gastos: [delForm('a', 40_000), delForm('b', 60_000)] };
  const [it2] = D.itemsDeFactura(factura, dos, { archivo: 'f', hoy: '2026-11-06' });
  let n = 0;
  const r = D.aplicarItems(dos, [{ ...it2, previoId: null, antes: null, accion: 'nuevo' }], { nuevoId: () => `n${++n}`, hoy: '2026-11-06' }).datos;
  assert.equal(r.gastos.length, 3);
});
