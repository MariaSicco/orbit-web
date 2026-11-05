/* By Majo concede Mimitos en Orbit (api/conceder.js) */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';

process.env.ORBIT_CONCEDER_CLAVE = 'clave-de-prueba-de-32-caracteres!!';
const { default: handler } = await import('../api/conceder.js');
const { getPurchases } = await import('../api/_lib/kv.js');

function call(body, { auth = process.env.ORBIT_CONCEDER_CLAVE, method = 'POST' } = {}) {
  const req = Readable.from([Buffer.from(JSON.stringify(body))]);
  req.method = method; req.headers = auth ? { authorization: `Bearer ${auth}`, 'content-type': 'application/json' } : {};
  req.body = body;
  return new Promise(resolve => {
    const res = { code: 200, status(c) { this.code = c; return this; }, json(d) { resolve({ code: this.code, data: d }); } };
    handler(req, res);
  });
}
const ok = { email: 'Ana@Mail.com', productoOrbit: 'ob-018', pedido: 'BM-1001', monto: 43990, moneda: 'ARS', fecha: '2026-11-05' };

test('sin clave o con clave mala: 401; GET: 405', async () => {
  assert.equal((await call(ok, { auth: '' })).code, 401);
  assert.equal((await call(ok, { auth: 'otra-clave-cualquiera-de-32-chars!!' })).code, 401);
  assert.equal((await call(ok, { method: 'GET' })).code, 405);
});

test('solo concede ob-018 y pide email y pedido', async () => {
  assert.equal((await call({ ...ok, productoOrbit: 'ob-019' })).code, 400);
  assert.equal((await call({ ...ok, email: 'no-es-mail' })).code, 400);
  assert.equal((await call({ ...ok, pedido: '' })).code, 400);
});

test('suma la compra una sola vez por pedido', async () => {
  assert.equal((await call(ok)).code, 200);
  assert.equal((await call(ok)).code, 200);
  const list = (await getPurchases('ana@mail.com')).filter(p => p.orderId === 'bymajo:BM-1001');
  assert.equal(list.length, 1);
  assert.equal(list[0].productId, 'ob-018'); assert.equal(list[0].via, 'bymajo');
});
