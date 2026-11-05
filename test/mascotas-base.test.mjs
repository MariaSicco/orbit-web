/* Mimitos (ob-018) conectado a la base de herramientas: una compra pagada de verdad
   (createOrder + markPaid, como la cierran Mercado Pago y PayPal) tiene que quedar
   reconocida por la biblioteca (/api/me + "Abrir"), por el email "Ya es tuyo" y por
   /api/mascotas. Sin compra → 402; admin sin compra → entra.
   Corre sin servicios: KV en memoria y fetch interceptado (Brevo, Meta). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

for (const k of ['KV_REST_API_URL', 'KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'VERCEL_ENV', 'RESEND_API_KEY', 'META_CAPI_TOKEN', 'MASCOTAS_PRODUCT_ID']) delete process.env[k];
process.env.SESSION_SECRET = 'secreto-de-prueba-mimitos-base-0123456789';
process.env.ADMIN_EMAILS = 'admin@orbit.test';
process.env.SITE_URL = 'https://x.test';
process.env.BREVO_API_KEY = 'clave-de-prueba';

/* nada sale a internet: guardamos los mails que se habrían mandado */
const mails = [];
globalThis.fetch = async (url, opt = {}) => {
  if (String(url).includes('/smtp/email')) mails.push(JSON.parse(opt.body));
  return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
};

const { makeSession } = await import('../api/_lib/auth.js');
const { getPurchases } = await import('../api/_lib/kv.js');
const { createOrder, markPaid } = await import('../api/_lib/orders.js');
const { getCatalog } = await import('../api/_lib/catalog.js');
const { herramientaDe, productoPorSlug } = await import('../api/_lib/herramientas.js');
const { accesoHerramienta, compraDe } = await import('../api/_lib/herramienta-acceso.js');
const { mimitosPurchase, hasMimitos } = await import('../api/_lib/petpush.js');
const { default: me } = await import('../api/me.js');
const { default: mascotas } = await import('../api/mascotas.js');

const ID = 'ob-018';
const COMPRADORA = 'Compradora@Orbit.test';
const SIN_COMPRA = 'curiosa@orbit.test';
const cookie = email => `orbit_session=${makeSession(email)}`;
const llamar = (handler, { email, method = 'GET', query = {}, body } = {}) => new Promise(ok => {
  const res = {
    code: 200, headers: {}, location: null,
    status(c) { this.code = c; return this; }, setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    json(b) { ok({ code: this.code, body: b, res: this }); return this; },
    send(b) { ok({ code: this.code, body: b, res: this }); return this; },
    end() { ok({ code: this.code, res: this }); return this; },
    redirect(c, u) { this.location = u; ok({ code: c, location: u }); return this; },
  };
  handler({ method, query, body, headers: email ? { cookie: cookie(email) } : {} }, res);
});

/* La compra, como la cierra el webhook: orden pendiente → pagada */
const CAT = await getCatalog();
const item = { id: ID, code: CAT[ID].code, name: CAT[ID].name, usd: CAT[ID].usd, ars: CAT[ID].ars, qty: 1 };
const orden = await createOrder({ email: COMPRADORA, items: [item], via: 'mercadopago' });
const pagada = await markPaid(orden.id, { paymentId: 'pago-prueba-1', amount: CAT[ID].ars, currency: 'ARS' });

test('orden: queda pagada y la compra se guarda con productId ob-018 en el email en minúscula', async () => {
  assert.equal(pagada.status, 'paid');
  const compras = await getPurchases(COMPRADORA.toLowerCase());
  assert.equal(compras.length, 1);
  assert.deepEqual([compras[0].productId, compras[0].orderId], [ID, `${orden.id}:${ID}`]);
  assert.equal((await compraDe(COMPRADORA, ID)).orderId, `${orden.id}:${ID}`);
});

test('catálogo: ob-018 es herramienta en /mascotas, sigue sin venta y no lo sirve /herramientas/', () => {
  assert.equal(herramientaDe(CAT, ID), '/mascotas');
  assert.equal(CAT[ID].soon, true);
  assert.equal(productoPorSlug(CAT, 'mascotas'), null);
});

test('email "Ya es tuyo": botón "Abrir ahora" directo a /mascotas', () => {
  assert.equal(pagada.mail, 'ok');
  const m = mails.find(x => x.to[0].email === COMPRADORA.toLowerCase());
  assert.ok(m, 'no salió el comprobante');
  assert.match(m.htmlContent, /href="https:\/\/x\.test\/mascotas"/);
  assert.match(m.htmlContent, /Abrir ahora/);
  assert.doesNotMatch(m.htmlContent, /Descargar ahora/);
  assert.match(m.textContent, /Abrilo desde acá: https:\/\/x\.test\/mascotas/);
});

/* biblioteca: el script real del navegador, con lo que devuelve /api/me */
const ctx = {};
runInNewContext(readFileSync(new URL('../assets/js/herramientas.js', import.meta.url), 'utf8'), ctx);
const H = ctx.OrbitHerramientas;
const L = (es, en) => (typeof es === 'object' && es) ? es.es : es;

test('biblioteca: /api/me trae Mimitos con herramienta /mascotas y la tarjeta muestra "Abrir"', async () => {
  const r = await llamar(me, { email: COMPRADORA.toLowerCase() });
  assert.equal(r.code, 200);
  const compra = r.body.purchases.find(p => p.productId === ID);
  assert.ok(compra, 'la compra no aparece en la biblioteca');
  assert.deepEqual([compra.name, compra.herramienta, compra.downloadable], ['Mimitos', '/mascotas', false]);
  const html = H.accion({ id: ID }, compra, L);
  assert.match(html, /href="\/mascotas"/);
  assert.match(html, /Abrir/);
  assert.doesNotMatch(html, /data-dl/);
  assert.equal(H.estado(compra, L), 'Herramienta online · lista para usar');
});

test('/api/mascotas: con la compra, acceso full y la fecha de compra', async () => {
  const r = await llamar(mascotas, { email: COMPRADORA.toLowerCase() });
  assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.equal(r.body.access, 'full');
  assert.equal(r.body.purchase.date, pagada.paidAt);
  assert.equal(await hasMimitos(COMPRADORA), true);
});

test('/api/mascotas: sin compra, 402 no_purchase (lo que espera la app)', async () => {
  const r = await llamar(mascotas, { email: SIN_COMPRA });
  assert.equal(r.code, 402);
  assert.deepEqual(r.body, { error: 'no_purchase', email: SIN_COMPRA, product: ID });
  const a = await accesoHerramienta({ headers: { cookie: cookie(SIN_COMPRA) } }, ID);
  assert.equal(a.motivo, 'sin_compra');
  assert.equal(await hasMimitos(SIN_COMPRA), false);
  /* conectar el mail sin compra es navegación: vuelve a la app */
  const g = await llamar(mascotas, { email: SIN_COMPRA, query: { gmail: 'start' } });
  assert.deepEqual([g.code, g.location], [302, '/mascotas']);
});

test('/api/mascotas: sin sesión, 401 (o al login si es navegación)', async () => {
  assert.equal((await llamar(mascotas, {})).code, 401);
  const g = await llamar(mascotas, { query: { outlook: 'callback' } });
  assert.deepEqual([g.code, g.location], [302, '/acceso?next=mascotas']);
});

test('/api/mascotas: admin sin compra entra con acceso full', async () => {
  const r = await llamar(mascotas, { email: 'admin@orbit.test' });
  assert.equal(r.code, 200, JSON.stringify(r.body));
  assert.equal(r.body.access, 'full');
  assert.deepEqual(r.body.purchase, { date: null, admin: true });
});

test('una compra reintegrada no cuenta, ni en la base ni en Mimitos', async () => {
  const { kvSet } = await import('../api/_lib/kv.js');
  await kvSet('orbit:purchases:reintegro@orbit.test', [{ productId: ID, orderId: 'OBX:ob-018', date: '2026-10-12', refunded: true }]);
  assert.equal(await compraDe('reintegro@orbit.test', ID), null);
  assert.equal(await mimitosPurchase('reintegro@orbit.test'), null);
  assert.equal((await llamar(mascotas, { email: 'reintegro@orbit.test' })).code, 402);
});
