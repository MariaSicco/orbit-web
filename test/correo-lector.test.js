/* Vencimientos · "Buscar en mi mail": reconocer facturas en el texto de los mails.
   Los mails de acá son inventados (formatos típicos), no copias de empresas reales. */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const C = await import('../api/_herramientas/vencimientos/correo-lector.js');
const HOY = '2026-10-14';
const $ = p => Math.round(p * 100);

const luz = (vence, monto, fecha) => ({ id: `l${vence}`, de: 'Facturación <facturadigital@edenor.com>', asunto: 'Tu factura de luz ya está disponible', fecha,
  texto: `Hola, ya podés ver tu factura.\nTotal a pagar: $ ${monto}\nVencimiento: ${vence}\n2° vencimiento: con recargo` });

test('fechas en varios formatos', () => {
  const f = C.fechasEn('vence el 22/10/2026, segundo 29-10-26 y el 5 de noviembre de 2026; también 3 dic. 2026');
  assert.deepEqual(f.map(x => x.fecha), ['2026-10-22', '2026-10-29', '2026-11-05', '2026-12-03']);
});

test('montos en formato argentino', () => {
  assert.deepEqual(C.montosEn('Total $ 47.830,55 y $12345 y ARS 1.234 y $ 99.5').map(x => x.monto), [4783055, 1234500, 123400, 9950]);
});

test('leerMail: toma la fecha cercana a "vencimiento" y el monto cercano a "total"', () => {
  const r = C.leerMail({ asunto: 'Factura', fecha: '2026-10-05', texto: 'Emitida el 01/10/2026. Período 01/08/2026 al 30/09/2026.\nTotal a pagar $ 47.830,55\nFecha de vencimiento: 22/10/2026\nSegundo vencimiento 29/10/2026' });
  assert.equal(r.vence, '2026-10-22');
  assert.equal(r.segundo, '2026-10-29');
  assert.equal(r.monto, 4783055);
});

test('leerMail: un mail sin factura devuelve null', () => {
  assert.equal(C.leerMail({ asunto: 'Novedades', fecha: '2026-10-05', texto: 'Conocé nuestros nuevos planes.' }), null);
});

test('servicio por remitente', () => {
  assert.equal(C.servicioDelRemitente('Edenor <facturadigital@edenor.com>'), 'edenor');
  assert.equal(C.servicioDelRemitente('avisos@mail.metrogas.com.ar'), 'metrogas');
  assert.equal(C.servicioDelRemitente('alguien@gmail.com'), null);
});

test('cuentasDesdeMails: agrupa, deduce la frecuencia y proyecta el próximo vencimiento', () => {
  const mails = [
    luz('20/07/2026', '31.000', '2026-07-05'), luz('20/08/2026', '36.500', '2026-08-05'), luz('20/09/2026', '41.000', '2026-09-05'),
    { id: 'a1', de: 'facturas@aysa.com.ar', asunto: 'Factura AySA', fecha: '2026-08-01', texto: 'Importe $ 18.000\nVence 15/08/2026' },
    { id: 'a2', de: 'facturas@aysa.com.ar', asunto: 'Factura AySA', fecha: '2026-10-01', texto: 'Importe $ 21.000\nVence 15/10/2026' },
    { id: 'x', de: 'admin@consorcio-libertad.com.ar', asunto: 'Liquidación de expensas octubre', fecha: '2026-10-02', texto: 'Total a pagar $ 185.000,00 — vence el 10/10/2026' },
    { id: 'n', de: 'promos@tienda.com', asunto: 'Ofertas', fecha: '2026-10-02', texto: 'Hasta 50% off, vence el 31/10/2026' },
  ];
  const cs = C.cuentasDesdeMails(mails, HOY);
  const luzC = cs.find(c => c.preset === 'edenor');
  assert.equal(luzC.frecuencia, 1);
  assert.equal(luzC.encontradas, 3);
  assert.equal(luzC.proximo, '2026-10-20');       // 20/9 + 1 mes, porque ya pasó
  assert.equal(luzC.proximoEstimado, true);
  assert.equal(luzC.monto, $(41000));
  assert.deepEqual(luzC.historia.map(h => h.monto), [$(31000), $(36500), $(41000)]);
  const agua = cs.find(c => c.preset === 'aysa');
  assert.equal(agua.frecuencia, 2);
  assert.equal(agua.proximo, '2026-10-15');
  assert.equal(agua.proximoEstimado, false);
  const exp = cs.find(c => c.nombre === 'Expensas');
  assert.ok(exp);
  assert.equal(exp.proximo, '2026-11-10');
  assert.ok(!cs.some(c => /tienda/i.test(c.clave)));  // promo sin palabra de factura: afuera
  assert.equal(cs[0].conocido, true);                // conocidos primero
});

test('consultaGmail arma la búsqueda con remitentes y asuntos', () => {
  const q = C.consultaGmail(6);
  assert.match(q, /^newer_than:6m/);
  assert.match(q, /edenor\.com/);
  assert.match(q, /"liquidación de expensas"/);
});

test('textoDeHtml limpia el HTML del mail', () => {
  const t = C.textoDeHtml('<html><head><style>p{}</style></head><body><p>Total&nbsp;a pagar: <b>&#36; 1.234,50</b></p><div>Vence 22/10/2026</div></body></html>');
  assert.match(t, /Total a pagar: \$ 1\.234,50/);
  assert.match(t, /Vence 22\/10\/2026/);
});
