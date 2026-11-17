// La misma factura no se suma dos veces: se reconoce por CUIT del emisor + tipo + punto de venta + número.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { claveComprobante, buscarRepetida } from '../api/_herramientas/iva/engine/repetidas.js';

const fac = (extra = {}) => ({ id: 'a', cuit: '30707832971', tipo: '001', ptoVta: 27, numero: 13412, fecha: '2026-06-29', ...extra });
const per = (id, mes, fotos, extra = {}) => ({ id, clienteId: 'cli', mes, fotos, ...extra });

test('Clave igual aunque el CUIT venga con guiones y el tipo como número', () => {
  assert.equal(claveComprobante(fac()), claveComprobante(fac({ cuit: '30-70783297-1', tipo: 1 })));
});

test('Sin CUIT, tipo, punto de venta o número no hay clave (no se puede comparar)', () => {
  for (const falta of [{ cuit: '' }, { tipo: null }, { ptoVta: null }, { numero: null }, { numero: 0 }]) {
    assert.equal(claveComprobante(fac(falta)), null);
  }
});

test('Encuentra la repetida en el mismo mes o en otro mes de la misma empresa', () => {
  const junio = per('p6', '2026-06', [fac({ id: 'vieja' })]);
  const agosto = per('p8', '2026-08', []);
  const r = buscarRepetida([agosto, junio], 'cli', fac({ id: 'nueva' }));
  assert.equal(r.factura.id, 'vieja');
  assert.equal(r.periodo.mes, '2026-06');
});

test('No confunde facturas distintas ni de otra empresa', () => {
  const p = per('p6', '2026-06', [fac({ id: 'vieja' })]);
  assert.equal(buscarRepetida([p], 'cli', fac({ numero: 13413 })), null);
  assert.equal(buscarRepetida([p], 'cli', fac({ tipo: '006' })), null);
  assert.equal(buscarRepetida([p], 'cli', fac({ cuit: '30708368012' })), null);
  assert.equal(buscarRepetida([p], 'otra', fac()), null);
});

test('Al editar, la propia factura no cuenta como repetida', () => {
  const p = per('p6', '2026-06', [fac({ id: 'a' })]);
  assert.equal(buscarRepetida([p], 'cli', fac({ id: 'a' }), { excluirId: 'a' }), null);
});

test('Los períodos que todavía no se trajeron de la cuenta se saltean', () => {
  const p = per('p6', '2026-06', [fac({ id: 'vieja' })], { _pendiente: true });
  assert.equal(buscarRepetida([p], 'cli', fac({ id: 'nueva' })), null);
});
