/* Vencimientos · avisos push: qué se avisa cada día, la API y el cron (web-push de mentira). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
for (const k of ['KV_REST_API_URL', 'KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'VERCEL_ENV', 'CRON_SECRET', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY']) delete process.env[k];
process.env.SESSION_SECRET = 'secreto-de-prueba-0123456789';
const A = await import('../api/_lib/vencimientos-avisos.js');
const { makeSession } = await import('../api/_lib/auth.js');
const { addPurchase } = await import('../api/_lib/kv.js');
const api = await import('../api/vencimientos-avisos.js');
const cron = await import('../api/cron/vencimientos.js');
const enviados = [];
A.__usarWebpush({ generateVAPIDKeys: () => ({ publicKey: 'PUB', privateKey: 'PRIV' }), setVapidDetails() {}, sendNotification: async (s, p) => { enviados.push(JSON.parse(p)); } });

test('avisosDeHoy: 3 días antes y el mismo día, agrupado, con la casa si hay varias', () => {
  const items = [{ n: 'Edenor', v: '2026-10-21', c: 'Mi casa' }, { n: 'ABL', v: '2026-10-21', c: 'La quinta' }, { n: 'Netflix', v: '2026-10-18', t: 'debito' }];
  const a = A.avisosDeHoy(items, [3, 0], '2026-10-18');
  assert.equal(a.length, 2);
  assert.equal(a.find(x => x.title.startsWith('2 vencimientos')).body, 'Edenor (Mi casa) y ABL (La quinta).');
  assert.equal(a.find(x => x.title.startsWith('Se debita')).title, 'Se debita hoy: Netflix');
  assert.equal(A.avisosDeHoy(items, [3, 0], '2026-10-19').length, 0);
  assert.deepEqual(A.limpiarItems([{ n: 'X', v: 'mal' }, { n: 'Luz', v: '2026-10-21', monto: 999 }]), [{ n: 'Luz', v: '2026-10-21' }]);
});

const pedido = (email, metodo, cuerpo) => { const r = Readable.from(cuerpo ? [Buffer.from(JSON.stringify(cuerpo))] : []); r.method = metodo; r.query = {}; r.headers = { cookie: `orbit_session=${makeSession(email)}`, 'content-type': 'application/json' }; return r; };
const respuesta = () => { const r = { code: 200, body: null, headers: {} }; r.status = c => { r.code = c; return r; }; r.setHeader = (k, v) => { r.headers[k] = v; }; r.json = b => { r.body = b; return r; }; return r; };

test('API y cron: activar, mandar una vez, no repetir y desactivar', async () => {
  await addPurchase('ana@orbit.test', { productId: 'ob-021', orderId: 'OBTEST:a', via: 'mercadopago', amount: 0, currency: 'ARS', date: new Date().toISOString() });
  let res = respuesta(); await api.default(pedido('ana@orbit.test', 'GET'), res);
  assert.equal(res.body.publicKey, 'PUB');
  res = respuesta(); await api.default(pedido('ana@orbit.test', 'POST', { accion: 'activar', sub: { endpoint: 'https://push.test/1', keys: { p256dh: 'p', auth: 'a' } }, items: [{ n: 'Edenor', v: '2026-10-21' }], dias: [3, 0] }), res);
  assert.equal(res.body.activo, true);
  const correr = async () => { const r = respuesta(); const q = Readable.from([]); q.query = { hoy: '2026-10-21' }; q.headers = { 'user-agent': 'vercel-cron/1.0' }; await cron.default(q, r); return r.body; };
  assert.equal((await correr()).push, 1);
  assert.equal(enviados.at(-1).title, 'Vence hoy: Edenor');
  assert.equal((await correr()).push, 0);
  res = respuesta(); await api.default(pedido('ana@orbit.test', 'DELETE', {}), res);
  assert.equal(res.body.borrado, 'todo');
});
