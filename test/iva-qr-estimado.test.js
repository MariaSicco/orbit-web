// El QR de ARCA trae el total pero no el neto ni el IVA: en una factura A se proponen al 21 %, marcados para revisar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { combinarLectura } from '../api/_herramientas/iva/engine/lectura.js';

const vacia = { es_comprobante: true, alicuotas: [], campos_dudosos: [] };
const qr = (tipo, total) => ({ tipo, ptoVta: 7, numero: 22272, fecha: '2026-08-20', cuit: '30712345671', moneda: 'PES', cotizacion: 1, total, cae: '1' });

test('Factura A solo con QR: neto e IVA al 21 % que suman el total', () => {
  const r = combinarLectura(vacia, qr('001', 2370742), { cuitCliente: '20111111112', id: 'x' });
  const [a] = r.comprobante.alicuotas;
  assert.equal(a.tasa, 21);
  assert.equal(a.neto + a.iva, 2370742);
  assert.ok(Math.abs(a.iva - Math.round(a.neto * 0.21)) <= 1);
  assert.ok(r.alertas.some(x => x.tipo === 'iva_estimado'));
  assert.ok(!r.alertas.some(x => x.tipo === 'sin_desglose'));
  assert.equal(r.comprobante.confianza.alicuotas, 'baja');
  assert.equal(r.revisionRapida, false);
});

test('Factura B o C solo con QR: no se estima IVA (no da crédito fiscal)', () => {
  for (const t of ['006', '011']) {
    const r = combinarLectura(vacia, qr(t, 121000), { id: 'x' });
    assert.equal(r.comprobante.alicuotas.length, 0);
    assert.ok(!r.alertas.some(x => x.tipo === 'iva_estimado'));
  }
});

test('Si ya hay neto e IVA cargados, el QR no los pisa', () => {
  const r = combinarLectura({ ...vacia, alicuotas: [{ tasa: 10.5, neto: 1000, iva: 105 }] }, qr('001', 110500), { id: 'x' });
  assert.deepEqual(r.comprobante.alicuotas, [{ tasa: 10.5, neto: 100000, iva: 10500 }]);
});

test('Sin QR, una A sin desglose sigue pidiendo completar (no se inventa)', () => {
  const r = combinarLectura({ ...vacia, tipo_codigo: '001', total: 1210 }, null, { id: 'x' });
  assert.equal(r.comprobante.alicuotas.length, 0);
  assert.ok(r.alertas.some(x => x.tipo === 'sin_desglose'));
});
