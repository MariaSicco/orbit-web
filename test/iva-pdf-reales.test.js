// Facturas reales en PDF (texto que trae el PDF + su QR): cada sistema de facturación escribe distinto.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { leerTextoOcr } from '../api/_herramientas/iva/engine/ocr-reglas.js';
import { leerQrArca } from '../api/_herramientas/iva/engine/qr.js';
import { combinarLectura } from '../api/_herramientas/iva/engine/lectura.js';

const texto = n => readFileSync(new URL(`./fixtures/iva/${n}.txt`, import.meta.url), 'utf8');
const CLARG = '30708368012';
const QR_CIANBOX = 'https://www.afip.gob.ar/fe/qr/?p=eyJ2ZXIiOjEsImZlY2hhIjoiMjAyNi0xMS0xMiIsImN1aXQiOjIwMzMyNTc3MDAwLCJwdG9WdGEiOjYsInRpcG9DbXAiOjEsIm5yb0NtcCI6MzY2MjUsImltcG9ydGUiOjE3OTMyNiwibW9uZWRhIjoiUEVTIiwiY3R6IjoxLCJ0aXBvRG9jUmVjIjo4MCwibnJvRG9jUmVjIjozMDcwODM2ODAxMiwidGlwb0NvZEF1dCI6IkUiLCJjb2RBdXQiOjg2NDYyMzYwNTAzOTY0fQ==';
const QR_KALMA = 'https://serviciosweb.afip.gob.ar/genericos/comprobantes/cae.aspx?p=eyJ2ZXIiOjEsImZlY2hhIjoiMjAyNi0xMS0xMCIsImN1aXQiOjI3MzU5ODU5NjY1LCJwdG9WdGEiOjQsInRpcG9DbXAiOjEsIm5yb0NtcCI6MTE4LCJpbXBvcnRlIjo4NjU3Ny4zLCJtb25lZGEiOiJQRVMiLCJjdHoiOjEsInRpcG9Eb2NSZWMiOjgwLCJucm9Eb2NSZWMiOjMwNzA4MzY4MDEyLCJ0aXBvQ29kZUF1dCI6IkUiLCJjb2RBdXQiOjg2NDUxOTcwNzcxMTQ4fQ==';

test('QR con la dirección serviciosweb.afip.gob.ar/…/cae.aspx se acepta', () => {
  const q = leerQrArca(QR_KALMA);
  assert.ok(q);
  assert.deepEqual([q.cuit, q.ptoVta, q.numero, q.total, q.tipo], ['27359859665', 4, 118, 8657730, '001']);
});

test('QR de otra página que no es de AFIP/ARCA sigue rechazado', () => {
  assert.equal(leerQrArca(QR_KALMA.replace('serviciosweb.afip.gob.ar', 'afip.gob.ar.ejemplo.com')), null);
  assert.equal(leerQrArca('https://www.afip.gob.ar/fe/qr/?x=1'), null);
});

const casos = [
  { n: 'texto-cianbox', qr: QR_CIANBOX, emisor: 'de Amarilla Sebastián', cuit: '20332577000', pv: 6, num: 36625, neto: 14820331, iva: 3112269, total: 17932600 },
  { n: 'texto-kalma', qr: QR_KALMA, emisor: 'VALLINA EVELIN', cuit: '27359859665', pv: 4, num: 118, neto: 7155149, iva: 1502581, total: 8657730 },
];

for (const c of casos) {
  test(`${c.n}: el texto del PDF da neto e IVA reales (sin estimar), número y emisor`, () => {
    const l = leerTextoOcr(texto(c.n), { cuitCliente: CLARG });
    assert.equal(l.razon_social_emisor, c.emisor);
    assert.equal(l.punto_venta, c.pv);
    assert.equal(l.numero, c.num);
    const r = combinarLectura(l, leerQrArca(c.qr), { cuitCliente: CLARG, id: 'x' });
    assert.deepEqual(r.comprobante.alicuotas, [{ tasa: 21, neto: c.neto, iva: c.iva }]);
    assert.equal(r.comprobante.total, c.total);
    assert.equal(r.comprobante.cuit, c.cuit);
    assert.equal(r.comprobante.lado, 'compra');
    assert.ok(!r.alertas.some(a => ['iva_estimado', 'sin_desglose', 'no_cierra', 'sin_numero'].includes(a.tipo)), JSON.stringify(r.alertas));
  });
}
