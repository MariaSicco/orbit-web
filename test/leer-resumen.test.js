/* Mi Mes by Orbit · /api/leer-resumen en modo prueba (sin base ni Claude). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';

for (const k of ['KV_REST_API_URL', 'KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'VERCEL_ENV', 'ANTHROPIC_API_KEY']) delete process.env[k];
process.env.SESSION_SECRET = 'secreto-de-prueba-0123456789';
process.env.ADMIN_EMAILS = 'admin@orbit.test';

const { makeSession } = await import('../api/_lib/auth.js');
const { addPurchase } = await import('../api/_lib/kv.js');
const api = await import('../api/leer-resumen.js');
const { validarLectura, MONEDAS } = await import('../api/_herramientas/mi-mes/calculos.js');
const leer = api.default;

await addPurchase('compro@orbit.test', { productId: 'ob-019', orderId: 'OBTEST:ob-019', via: 'mercadopago', amount: 0, currency: 'ARS', date: new Date().toISOString() });
await addPurchase('otro@orbit.test', { productId: 'ob-012', orderId: 'OBTEST:ob-012', via: 'mercadopago', amount: 0, currency: 'ARS', date: new Date().toISOString() });

const PDF = (paginas = 2) => Buffer.from(`%PDF-1.4\n${Array.from({ length: paginas }, (_, i) => `${i + 3} 0 obj << /Type /Page /Parent 2 0 R >> endobj`).join('\n')}\n2 0 obj << /Type /Pages /Count ${paginas} >> endobj\n%%EOF`, 'latin1');
const pedido = (email, cuerpo, extra = {}) => {
  const r = Readable.from(cuerpo ? [cuerpo] : []);
  r.method = 'POST';
  r.headers = { ...(email ? { cookie: `orbit_session=${makeSession(email)}` } : {}), 'content-length': String(cuerpo?.length || 0), ...extra };
  return r;
};
function respuesta() {
  const r = { code: 200, headers: {}, body: null };
  r.status = c => { r.code = c; return r; };
  r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; };
  r.json = b => { r.body = b; return r; };
  r.send = b => { r.body = b; return r; };
  return r;
}
const llamar = async req => { const res = respuesta(); await leer(req, res); return res; };

test('leer-resumen: sin sesión 401 y sin compra 403, en JSON', async () => {
  assert.equal((await llamar(pedido(null, PDF()))).code, 401);
  const r = await llamar(pedido('otro@orbit.test', PDF()));
  assert.deepEqual([r.code, r.body.motivo], [403, 'sin_compra']);
});
test('leer-resumen: solo POST', async () => {
  const req = pedido('compro@orbit.test', PDF());
  req.method = 'GET';
  const r = await llamar(req);
  assert.equal(r.code, 405);
});
test('leer-resumen: rechaza lo que no es PDF, lo muy pesado y lo de muchas páginas', async () => {
  assert.equal((await llamar(pedido('compro@orbit.test', Buffer.from('hola, no soy un pdf')))).body.motivo, 'no_pdf');
  const grande = Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(api.MAX_BYTES)]);
  assert.equal((await llamar(pedido('compro@orbit.test', grande))).code, 413);
  const mentiroso = pedido('compro@orbit.test', grande, { 'content-length': '10' });
  assert.equal((await llamar(mentiroso)).body.motivo, 'grande', 'corta aunque el content-length mienta');
  const r = await llamar(pedido('compro@orbit.test', PDF(api.MAX_PAGINAS + 1)));
  assert.deepEqual([r.code, r.body.motivo], [413, 'paginas']);
  assert.equal(api.contarPaginas(PDF(3)), 3);
});
test('leer-resumen: con compra responde el ejemplo en modo prueba, con el esquema final', async () => {
  const r = await llamar(pedido('compro@orbit.test', PDF()));
  assert.equal(r.code, 200);
  assert.equal(r.body.modo, 'prueba');
  assert.equal(r.headers['cache-control'], 'no-store');
  const l = r.body.lectura;
  for (const k of ['tarjeta', 'periodo', 'cierre', 'vencimiento', 'totales', 'consumos', 'pagoMinimo']) assert.ok(k in l, k);
  for (const k of ['banco', 'red', 'ultimos4']) assert.ok(l.tarjeta[k], k);
  const monedas = new Set(l.consumos.map(c => c.moneda));
  assert.ok(monedas.has('USD') && [...monedas].some(m => m !== 'ARS' && m !== 'USD'), 'trae USD y otra moneda');
  assert.ok(l.consumos.every(c => c.fecha && c.comercio && typeof c.monto === 'number' && MONEDAS[c.moneda] && c.rubro && 'cuota' in c));
  // los totales por moneda cierran con la suma de los consumos del ejemplo
  for (const t of l.totales) {
    const suma = l.consumos.filter(c => c.moneda === t.moneda).reduce((s, c) => s + Math.round(c.monto * 100), 0);
    assert.equal(suma, Math.round(t.monto * 100), t.moneda);
  }
  assert.equal(validarLectura(l).ok, true);
});
test('leer-resumen: tope de lecturas por día', async () => {
  const { kvSet } = await import('../api/_lib/kv.js');
  const dia = new Date().toISOString().slice(0, 10);
  await kvSet(`orbit:mi-mes:lecturas:admin@orbit.test:${dia}`, api.TOPE_DIA);
  const r = await llamar(pedido('admin@orbit.test', PDF()));
  assert.deepEqual([r.code, r.body.motivo], [429, 'tope']);
});
