/* Vencimientos de la Casa · la lectura automática vence a los 12 meses de la compra. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';

for (const k of ['KV_REST_API_URL', 'KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'VERCEL_ENV', 'ANTHROPIC_API_KEY']) delete process.env[k];
process.env.SESSION_SECRET = 'secreto-de-prueba-0123456789';
process.env.ADMIN_EMAILS = 'admin@orbit.test';

const { makeSession } = await import('../api/_lib/auth.js');
const { addPurchase, kvSet } = await import('../api/_lib/kv.js');
const { accesoExtraKey } = await import('../api/_lib/herramienta-acceso.js');
const { vigenciaLectura } = await import('../api/_lib/vencimientos-ia.js');
const factura = (await import('../api/leer-factura.js')).default;
const resumen = (await import('../api/vencimientos-resumen.js')).default;

const DIA = 86400e3;
const comprar = (email, date) => addPurchase(email, { productId: 'ob-021', orderId: `OBTEST:${email}`, via: 'mercadopago', amount: 0, currency: 'ARS', date });
const hace = dias => new Date(Date.now() - dias * DIA).toISOString();
const JPG = Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]), Buffer.alloc(200, 1)]);
const PDF = Buffer.from('%PDF-1.4\n3 0 obj << /Type /Page >> endobj\n%%EOF', 'latin1');
const pedido = (email, cuerpo, metodo = 'POST') => {
  const r = Readable.from(cuerpo ? [cuerpo] : []);
  r.method = metodo; r.query = {};
  r.headers = { cookie: `orbit_session=${makeSession(email)}`, 'content-length': String(cuerpo?.length || 0) };
  return r;
};
const llamar = async (fn, req) => {
  const res = { code: 200, headers: {}, body: null };
  res.status = c => { res.code = c; return res; };
  res.setHeader = (k, v) => { res.headers[k.toLowerCase()] = v; };
  res.json = b => { res.body = b; return res; };
  await fn(req, res);
  return res;
};

test('la compra de hace menos de 12 meses lee y GET dice hasta cuándo', async () => {
  await comprar('vigente@orbit.test', '2026-06-15T12:00:00.000Z');
  const ahora = Date.parse('2026-11-07T12:00:00.000Z');
  assert.deepEqual(await vigenciaLectura({ email: 'vigente@orbit.test', compra: { date: '2026-06-15T12:00:00.000Z' } }, ahora), { hasta: '2027-06-15', vencida: false });
  await comprar('reciente@orbit.test', hace(30));
  const g = await llamar(factura, pedido('reciente@orbit.test', null, 'GET'));
  assert.equal(g.body.iaVencida, false);
  assert.match(g.body.iaHasta, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal((await llamar(factura, pedido('reciente@orbit.test', JPG))).code, 200);
});

test('pasados los 12 meses no lee factura ni resumen, y la herramienta sigue abierta', async () => {
  await comprar('vieja@orbit.test', hace(400));
  for (const [fn, archivo] of [[factura, JPG], [resumen, PDF]]) {
    const r = await llamar(fn, pedido('vieja@orbit.test', archivo));
    assert.deepEqual([r.code, r.body.motivo], [403, 'ia_vencida']);
    assert.match(r.body.error, /venció.*podés cargar a mano/);
  }
  const g = await llamar(factura, pedido('vieja@orbit.test', null, 'GET'));
  assert.deepEqual([g.code, g.body.iaVencida], [200, true]);
});

test('quien entró invitado usa la fecha de compra de quien creó la casa', async () => {
  await comprar('duena-vieja@orbit.test', hace(400));
  await kvSet('orbit:vencimientos:casa:vieja', { id: 'vieja', dueno: 'duena-vieja@orbit.test', miembros: [] });
  await kvSet(accesoExtraKey('ob-021', 'invitada-vieja@orbit.test'), { casa: 'vieja' });
  const r = await llamar(factura, pedido('invitada-vieja@orbit.test', JPG));
  assert.deepEqual([r.code, r.body.motivo], [403, 'ia_vencida']);

  await comprar('duena-nueva@orbit.test', hace(10));
  await kvSet('orbit:vencimientos:casa:nueva', { id: 'nueva', dueno: 'duena-nueva@orbit.test', miembros: [] });
  await kvSet(accesoExtraKey('ob-021', 'invitada-nueva@orbit.test'), { casa: 'nueva' });
  assert.equal((await llamar(factura, pedido('invitada-nueva@orbit.test', JPG))).code, 200);
});

test('las cuentas admin y sus invitados no vencen', async () => {
  assert.deepEqual(await vigenciaLectura({ email: 'admin@orbit.test', admin: true }), { hasta: null, vencida: false });
  await kvSet('orbit:vencimientos:casa:admin', { id: 'admin', dueno: 'admin@orbit.test', miembros: [] });
  await kvSet(accesoExtraKey('ob-021', 'invitada-admin@orbit.test'), { casa: 'admin' });
  assert.deepEqual(await vigenciaLectura({ email: 'invitada-admin@orbit.test', invitado: true }), { hasta: null, vencida: false });
});

test('sin fecha de compra corre desde el primer uso', async () => {
  const ahora = Date.parse('2026-11-07T12:00:00.000Z');
  const acc = { email: 'sinfecha@orbit.test', compra: {} };
  assert.deepEqual(await vigenciaLectura(acc, ahora), { hasta: '2027-11-07', vencida: false });
  assert.equal((await vigenciaLectura(acc, ahora + 400 * DIA)).vencida, true);
});
