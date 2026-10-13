/* Herramientas online: acceso, entrega de archivos, email y biblioteca.
   Corre sin base ni servicios: la base cae a memoria (api/_lib/kv.js) y la
   sesión se firma con un secreto de prueba. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

for (const k of ['KV_REST_API_URL', 'KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'VERCEL_ENV']) delete process.env[k];
process.env.SESSION_SECRET = 'secreto-de-prueba-0123456789';
process.env.ADMIN_EMAILS = 'admin@orbit.test';

const { makeSession } = await import('../api/_lib/auth.js');
const { addPurchase } = await import('../api/_lib/kv.js');
const { getCatalog } = await import('../api/_lib/catalog.js');
const { accesoHerramienta, requireHerramienta, destinoSinAcceso } = await import('../api/_lib/herramienta-acceso.js');
const { productoPorSlug, archivoSeguro, destinoComprobante, herramientaDe, tipoDe } = await import('../api/_lib/herramientas.js');
const { default: herramienta } = await import('../api/herramienta.js');

const DEMO = 'ob-demo';
const pedido = email => ({ headers: { cookie: `otra=1; orbit_session=${makeSession(email)}` } });
const sinSesion = () => ({ headers: {} });
function respuesta() {
  const r = { code: 200, headers: {}, body: null, location: null };
  r.status = c => { r.code = c; return r; };
  r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; };
  r.send = b => { r.body = b; return r; };
  r.json = b => { r.body = b; return r; };
  r.redirect = (c, u) => { r.code = c; r.location = u; return r; };
  return r;
}

await addPurchase('compro@orbit.test', { productId: DEMO, orderId: 'OBTEST:ob-demo', via: 'mercadopago', amount: 0, currency: 'ARS', date: new Date().toISOString() });
await addPurchase('otro@orbit.test', { productId: 'ob-012', orderId: 'OBTEST:ob-012', via: 'mercadopago', amount: 5990, currency: 'ARS', date: new Date().toISOString() });

/* ── helper de acceso ── */
test('acceso: con compra entra', async () => {
  const a = await accesoHerramienta(pedido('Compro@Orbit.test'.toLowerCase()), DEMO);
  assert.equal(a.ok, true);
  assert.equal(a.admin, false);
});
test('acceso: sin compra de ESE producto, 403 sin_compra', async () => {
  const a = await accesoHerramienta(pedido('otro@orbit.test'), DEMO);
  assert.deepEqual([a.ok, a.status, a.motivo], [false, 403, 'sin_compra']);
  assert.equal(destinoSinAcceso(a, DEMO), '/p/ob-demo');
});
test('acceso: sin sesión, 401 y al login', async () => {
  const a = await accesoHerramienta(sinSesion(), DEMO);
  assert.deepEqual([a.ok, a.status, a.motivo], [false, 401, 'sin_sesion']);
  assert.equal(destinoSinAcceso(a, DEMO), '/acceso');
});
test('acceso: cookie con firma trucha no cuenta como sesión', async () => {
  const [payload] = makeSession('compro@orbit.test').split('.');
  const a = await accesoHerramienta({ headers: { cookie: `orbit_session=${payload}.firmaFalsa` } }, DEMO);
  assert.equal(a.motivo, 'sin_sesion');
});
test('acceso: admin entra sin comprar', async () => {
  const a = await accesoHerramienta(pedido('admin@orbit.test'), DEMO);
  assert.deepEqual([a.ok, a.admin], [true, true]);
});
test('requireHerramienta: responde JSON con el error y devuelve null', async () => {
  const res = respuesta();
  assert.equal(await requireHerramienta(pedido('otro@orbit.test'), res, DEMO), null);
  assert.equal(res.code, 403);
  assert.equal(res.body.motivo, 'sin_compra');
  assert.equal(res.headers['cache-control'], 'no-store');
  const ok = await requireHerramienta(pedido('compro@orbit.test'), respuesta(), DEMO);
  assert.equal(ok.email, 'compro@orbit.test');
});

/* ── catálogo y rutas ── */
test('catálogo: la herramienta de prueba existe fuera de producción y no se puede comprar', async () => {
  const CAT = await getCatalog();
  assert.equal(herramientaDe(CAT, DEMO), '/herramientas/demo');
  assert.equal(CAT[DEMO].soon, true);
  assert.equal(herramientaDe(CAT, 'ob-012'), null);
  assert.equal(productoPorSlug(CAT, 'demo').id, DEMO);
  assert.equal(productoPorSlug(CAT, 'no-existe'), null);
  assert.equal(productoPorSlug(CAT, '../demo'), null);
});
test('catálogo: en producción la herramienta de prueba no existe', async () => {
  process.env.VERCEL_ENV = 'production';
  try {
    const prod = await import('../api/_lib/catalog.js?produccion');
    assert.equal(prod.CATALOG[DEMO], undefined);
  } finally { delete process.env.VERCEL_ENV; }
});
test('archivoSeguro: index por defecto, cleanUrls y nada de salir de la carpeta', () => {
  assert.equal(archivoSeguro(undefined), 'index.html');
  assert.equal(archivoSeguro(''), 'index.html');
  assert.equal(archivoSeguro('demo.js'), 'demo.js');
  assert.equal(archivoSeguro('ayuda'), 'ayuda.html');
  assert.equal(archivoSeguro(['img', 'logo.svg']), 'img/logo.svg');
  for (const malo of ['../catalog.js', 'a/../../x', '.env', 'a/.git/config', 'a\\b', '%2e%2e/x']) assert.equal(archivoSeguro(malo), null, malo);
  assert.equal(tipoDe('index.html'), 'text/html; charset=utf-8');
});

/* ── la página protegida, de punta a punta ── */
test('página: con compra devuelve el HTML de la herramienta, sin caché y noindex', async () => {
  const res = respuesta();
  await herramienta({ ...pedido('compro@orbit.test'), query: { slug: 'demo' } }, res);
  assert.equal(res.code, 200);
  assert.match(String(res.body), /Acceso <span class="it">validado/);
  assert.equal(res.headers['content-type'], 'text/html; charset=utf-8');
  assert.equal(res.headers['cache-control'], 'private, no-store');
  assert.equal(res.headers['x-robots-tag'], 'noindex, nofollow');
});
test('página: los archivos de la herramienta también pasan por el control', async () => {
  const ok = respuesta();
  await herramienta({ ...pedido('admin@orbit.test'), query: { slug: 'demo', path: 'demo.js' } }, ok);
  assert.equal(ok.code, 200);
  assert.equal(ok.headers['content-type'], 'text/javascript; charset=utf-8');
  const no = respuesta();
  await herramienta({ ...sinSesion(), query: { slug: 'demo', path: 'demo.js' } }, no);
  assert.deepEqual([no.code, no.location], [302, '/acceso']);
});
test('página: sin compra va a la ficha, sin sesión al login', async () => {
  const a = respuesta();
  await herramienta({ ...pedido('otro@orbit.test'), query: { slug: 'demo' } }, a);
  assert.deepEqual([a.code, a.location], [302, '/p/ob-demo']);
  const b = respuesta();
  await herramienta({ ...sinSesion(), query: { slug: 'demo' } }, b);
  assert.deepEqual([b.code, b.location], [302, '/acceso']);
});
test('página: slug desconocido o archivo inexistente, 404', async () => {
  const a = respuesta();
  await herramienta({ ...pedido('admin@orbit.test'), query: { slug: 'no-existe' } }, a);
  assert.equal(a.code, 404);
  const b = respuesta();
  await herramienta({ ...pedido('admin@orbit.test'), query: { slug: 'demo', path: 'no-esta.js' } }, b);
  assert.equal(b.code, 404);
  const c = respuesta();
  await herramienta({ ...pedido('admin@orbit.test'), query: { slug: 'demo', path: '../../_lib/auth.js' } }, c);
  assert.equal(c.code, 404);
});

/* ── email "Ya es tuyo" ── */
test('email: solo descargas sigue igual que antes', async () => {
  const d = destinoComprobante([{ id: 'ob-012' }], await getCatalog(), 'https://x.test');
  assert.deepEqual([d.cta, d.url, d.texto], ['Descargar ahora →', 'https://x.test/biblioteca', 'Descargalo desde tu cuenta']);
  assert.equal(d.preheader, 'Ya podés descargarlo desde tu cuenta.');
});
test('email: una herramienta sola, "Abrir" directo a la herramienta', async () => {
  const d = destinoComprobante([{ id: DEMO }], await getCatalog(), 'https://x.test');
  assert.deepEqual([d.tipo, d.cta, d.url], ['herramienta', 'Abrir ahora →', 'https://x.test/herramientas/demo']);
});
test('email: varias herramientas distintas, "Abrir" a la biblioteca', () => {
  const CAT = { a: { herramienta: '/herramientas/a' }, b: { herramienta: '/herramientas/b' } };
  const d = destinoComprobante([{ id: 'a' }, { id: 'b' }], CAT, 'https://x.test');
  assert.deepEqual([d.cta, d.url], ['Abrir ahora →', 'https://x.test/biblioteca']);
});
test('email: herramienta + descarga, a la biblioteca', async () => {
  const d = destinoComprobante([{ id: DEMO }, { id: 'ob-012' }], await getCatalog(), 'https://x.test');
  assert.deepEqual([d.tipo, d.url], ['mixto', 'https://x.test/biblioteca']);
});

/* ── biblioteca (script del navegador) ── */
const ctx = {};
runInNewContext(readFileSync(new URL('../assets/js/herramientas.js', import.meta.url), 'utf8'), ctx);
const H = ctx.OrbitHerramientas;
const L = (es, en) => (typeof es === 'object' && es) ? es.es : es;

test('biblioteca: herramienta muestra "Abrir" con link a su ruta', () => {
  const html = H.accion({ id: DEMO }, { herramienta: '/herramientas/demo' }, L);
  assert.match(html, /href="\/herramientas\/demo"/);
  assert.match(html, /Abrir/);
  assert.doesNotMatch(html, /data-dl/);
  assert.equal(H.estado({ herramienta: '/herramientas/demo' }, L), 'Herramienta online · lista para usar');
});
test('biblioteca: el resto sigue con "Descargar"', () => {
  const html = H.accion({ id: 'ob-012' }, { herramienta: null, downloadable: true }, L);
  assert.match(html, /data-dl="ob-012"/);
  assert.match(html, /Descargar/);
  assert.equal(H.estado({ downloadable: true }, L), 'Listo para descargar');
  assert.equal(H.estado({ downloadable: false }, L), 'Archivo en preparación');
});
test('biblioteca: una ruta rara no se convierte en link', () => {
  const html = H.accion({ id: 'x' }, { herramienta: 'javascript:alert(1)' }, L);
  assert.match(html, /data-dl/);
});
test('biblioteca: herramienta que no está en products.js igual aparece', () => {
  const p = H.productoMinimo({ productId: DEMO, code: 'OB—DEMO', name: 'Herramienta de prueba', herramienta: '/herramientas/demo' });
  assert.equal(p.id, DEMO);
  assert.equal(p.specs.length, 3);
  assert.equal(H.productoMinimo({ productId: 'ob-012' }), null);
});
