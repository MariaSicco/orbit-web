/* Vencimientos · "Subí el resumen de tu tarjeta": de la lectura (esquema de Mi Mes) a cuentas,
   y /api/vencimientos-resumen en modo prueba. Datos inventados. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';

for (const k of ['KV_REST_API_URL', 'KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'VERCEL_ENV', 'ANTHROPIC_API_KEY']) delete process.env[k];
process.env.SESSION_SECRET = 'secreto-de-prueba-0123456789';
process.env.ADMIN_EMAILS = 'admin@orbit.test';

const R = await import('../api/_herramientas/vencimientos/resumen-tarjeta.js');
const { resumenEjemplo } = await import('../api/_herramientas/mi-mes/ejemplo.js');
const { makeSession } = await import('../api/_lib/auth.js');
const { addPurchase } = await import('../api/_lib/kv.js');
const api = await import('../api/vencimientos-resumen.js');
const $ = p => Math.round(p * 100);
const HOY = '2026-10-14';

const lectura = {
  tarjeta: { banco: 'Banco Galicia', red: 'Visa', ultimos4: '1234' },
  vencimiento: '2026-10-20', proximoVencimiento: '2026-11-19',
  totales: [{ moneda: 'ARS', monto: 612340.55 }, { moneda: 'USD', monto: 9.99 }],
  consumos: [
    { fecha: '2026-09-14', comercio: 'NETFLIX.COM', monto: 18149, moneda: 'ARS', rubro: 'Suscripciones', cuota: null },
    { fecha: '2026-09-05', comercio: 'SPOTIFY P2B3C4', monto: 5443.79, moneda: 'ARS', rubro: 'Suscripciones', cuota: null },
    { fecha: '2026-09-02', comercio: 'APPLE.COM/BILL', monto: 9.99, moneda: 'USD', rubro: 'Suscripciones', cuota: null },
    { fecha: '2026-09-10', comercio: 'OSDE 210 PLAN', monto: 160400, moneda: 'ARS', rubro: 'Salud', cuota: null },
    { fecha: '2026-09-11', comercio: 'DEB AUT EDENOR', monto: 44800, moneda: 'ARS', rubro: 'Servicios', cuota: null },
    { fecha: '2026-09-12', comercio: 'CLUB DE LECTURA MENSUAL', monto: 7000, moneda: 'ARS', rubro: 'Suscripciones', cuota: null },
    { fecha: '2026-09-03', comercio: 'SUPERMERCADO EJEMPLO', monto: 86430.5, moneda: 'ARS', rubro: 'Supermercado', cuota: null },
    { fecha: '2026-08-01', comercio: 'ELECTRO HOGAR', monto: 95000, moneda: 'ARS', rubro: 'Otros', cuota: { n: 3, de: 6 } },
  ],
};

test('la tarjeta misma: vence el día del resumen con el total en pesos', () => {
  const cs = R.cuentasDesdeResumen(lectura, HOY);
  const t = cs[0];
  assert.equal(t.tarjeta, true);
  assert.equal(t.nombre, 'Tarjeta Visa Galicia ·1234');
  assert.equal(t.proximo, '2026-10-20');
  assert.equal(t.proximoEstimado, false);
  assert.equal(t.monto, 61234055);
  assert.match(t.nota, /US\$ 9.99/);
  assert.equal(t.categoria, 'Tarjetas');
});

test('lo que se repite: suscripciones, prepaga y servicios adheridos; afuera cuotas y compras', () => {
  const cs = R.cuentasDesdeResumen(lectura, HOY);
  const por = id => cs.find(c => c.preset === id);
  assert.equal(por('netflix').monto, $(18149));
  assert.equal(por('netflix').proximo, '2026-10-14');
  assert.equal(por('netflix').debito, true);
  assert.equal(por('spotify').monto, 544379);
  assert.equal(por('icloud').moneda, 'USD');
  assert.equal(por('prepaga').monto, $(160400));
  assert.equal(por('edenor').proximo, '2026-11-11'); // 11/9 + 1 mes ya pasó → 11/11
  assert.ok(cs.some(c => c.nombre.startsWith('Club de lectura')));            // rubro Suscripciones, aunque no esté precargado
  assert.ok(!cs.some(c => /supermercado|electro/i.test(c.nombre)));
});

test('servicioDelComercio reconoce nombres de resumen', () => {
  assert.equal(R.servicioDelComercio('MERPAGO*NETFLIX'), 'netflix');
  assert.equal(R.servicioDelComercio('GOOGLE *YouTubePremium'), 'youtube');
  assert.equal(R.servicioDelComercio('OPENAI *CHATGPT SUBSCR'), 'chatgpt');
  assert.equal(R.servicioDelComercio('PAGO TELEPEAJE AUSA'), 'peaje');
  assert.equal(R.servicioDelComercio('PANADERIA LA ESPIGA'), null);
});

test('el resumen de ejemplo de Mi Mes se convierte sin romperse', () => {
  const cs = R.cuentasDesdeResumen(resumenEjemplo(new Date(`${HOY}T12:00:00`)), HOY);
  assert.ok(cs[0].tarjeta);
  assert.ok(cs.every(c => c.proximo >= HOY));
});

/* ── /api/vencimientos-resumen ── */
await addPurchase('compro@orbit.test', { productId: 'ob-021', orderId: 'OBTEST:ob-021', via: 'mercadopago', amount: 0, currency: 'ARS', date: new Date().toISOString() });
const PDF = Buffer.from('%PDF-1.4\n3 0 obj << /Type /Page >> endobj\n%%EOF', 'latin1');
const pedido = (email, cuerpo) => { const r = Readable.from(cuerpo ? [cuerpo] : []); r.method = 'POST'; r.headers = { ...(email ? { cookie: `orbit_session=${makeSession(email)}` } : {}), 'content-length': String(cuerpo?.length || 0) }; return r; };
const respuesta = () => { const r = { code: 200, headers: {}, body: null }; r.status = c => { r.code = c; return r; }; r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; }; r.json = b => { r.body = b; return r; }; return r; };
const llamar = async req => { const res = respuesta(); await api.default(req, res); return res; };

test('vencimientos-resumen: pide compra de ob-021, solo PDF, y sin key responde el ejemplo', async () => {
  assert.equal((await llamar(pedido(null, PDF))).code, 401);
  const noPdf = await llamar(pedido('compro@orbit.test', Buffer.from('hola, esto no es un pdf')));
  assert.equal(noPdf.code, 415);
  const ok = await llamar(pedido('compro@orbit.test', PDF));
  assert.equal(ok.code, 200);
  assert.equal(ok.body.modo, 'prueba');
  assert.ok(R.cuentasDesdeResumen(ok.body.lectura, HOY).length > 0);
});

test('vencimientos-resumen: detecta PDF con contraseña', () => {
  assert.equal(api.conClave(Buffer.from('%PDF-1.4\ntrailer << /Encrypt 12 0 R /Root 1 0 R >>', 'latin1')), true);
  assert.equal(api.conClave(PDF), false);
});
