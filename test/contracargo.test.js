/* Contracargo marcado a mano desde el panel: corta el acceso a la herramienta,
   guarda motivo y fecha en la compra y se puede deshacer.
   Corre sin base ni servicios (la base cae a memoria). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

for (const k of ['KV_REST_API_URL', 'KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'VERCEL_ENV']) delete process.env[k];
process.env.SESSION_SECRET = 'secreto-de-prueba-0123456789';
process.env.ADMIN_EMAILS = 'admin@orbit.test';

const { makeSession } = await import('../api/_lib/auth.js');
const { kvSet, kvGet, addPurchase, getPurchases, setPurchases } = await import('../api/_lib/kv.js');
const { accesoHerramienta, compraDe } = await import('../api/_lib/herramienta-acceso.js');
const { default: contracargo } = await import('../api/admin/contracargo.js');

const DEMO = 'ob-demo';
const conSesion = email => ({ cookie: `orbit_session=${makeSession(email)}` });
const pedido = email => ({ headers: conSesion(email) });
function respuesta() {
  const r = { code: 200, headers: {}, body: null };
  r.status = c => { r.code = c; return r; };
  r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; };
  r.json = b => { r.body = b; return r; };
  return r;
}
async function llamar(body, { email = 'admin@orbit.test', method = 'POST' } = {}) {
  const res = respuesta();
  await contracargo({ method, headers: email ? conSesion(email) : {}, body }, res);
  return res;
}
/* Un pedido pagado con sus compras, como lo deja markPaid */
async function pagado(id, email, items = [DEMO], extra = {}) {
  const order = { id, email, items: items.map(i => ({ id: i, code: i, name: i, qty: 1, usd: 1, ars: 1 })), via: 'mercadopago', status: 'paid', ars: 1, usd: 1, paidAt: '2026-10-10T12:00:00.000Z', date: '2026-10-10T11:59:00.000Z', ...extra };
  await kvSet(`orbit:order:${id}`, order);
  for (const i of items) await addPurchase(email, { productId: i, orderId: `${id}:${i}`, via: 'mercadopago', amount: 1, currency: 'ARS', date: order.paidAt });
  return order;
}

test('marcar: corta el acceso y guarda motivo, fecha y quién en la compra', async () => {
  await pagado('OBAAAAAAAAAA01', 'cc1@orbit.test');
  assert.equal((await accesoHerramienta(pedido('cc1@orbit.test'), DEMO)).ok, true);

  const r = await llamar({ orderId: 'OBAAAAAAAAAA01', accion: 'marcar', confirmar: 'OBAAAAAAAAAA01' });
  assert.equal(r.code, 200);
  assert.deepEqual([r.body.ok, r.body.compras], [true, 1]);

  const [c] = await getPurchases('cc1@orbit.test');
  assert.equal(c.refunded, true);
  assert.equal(c.refundReason, 'contracargo');
  assert.ok(!Number.isNaN(Date.parse(c.refundedAt)));
  assert.equal(c.refundedBy, 'admin@orbit.test');
  const a = await accesoHerramienta(pedido('cc1@orbit.test'), DEMO);
  assert.deepEqual([a.ok, a.status, a.motivo], [false, 403, 'sin_compra']);
  assert.equal(await compraDe('cc1@orbit.test', DEMO), null);

  const o = await kvGet('orbit:order:OBAAAAAAAAAA01');
  assert.equal(o.contracargo.motivo, 'contracargo');
  assert.equal(o.status, 'paid');   // la venta no se borra: queda marcada
});

test('deshacer: devuelve el acceso y saca la marca', async () => {
  await pagado('OBAAAAAAAAAA02', 'cc2@orbit.test');
  await llamar({ orderId: 'OBAAAAAAAAAA02', accion: 'marcar', confirmar: 'OBAAAAAAAAAA02' });
  assert.equal((await accesoHerramienta(pedido('cc2@orbit.test'), DEMO)).ok, false);

  const r = await llamar({ orderId: 'obaaaaaaaaaa02', accion: 'deshacer', confirmar: 'OBAAAAAAAAAA02' });
  assert.deepEqual([r.code, r.body.compras, r.body.pedido.contracargo], [200, 1, null]);
  const [c] = await getPurchases('cc2@orbit.test');
  assert.equal('refunded' in c, false);
  assert.equal('refundReason' in c, false);
  assert.equal((await accesoHerramienta(pedido('cc2@orbit.test'), DEMO)).ok, true);
  const o = await kvGet('orbit:order:OBAAAAAAAAAA02');
  assert.deepEqual(o.contracargoLog.map(l => l.accion), ['marcar', 'deshacer']);
});

test('solo toca las compras de ese pedido, no otras del mismo email', async () => {
  await pagado('OBAAAAAAAAAA03', 'cc3@orbit.test', [DEMO]);
  await pagado('OBAAAAAAAAAA04', 'cc3@orbit.test', ['ob-018']);
  await llamar({ orderId: 'OBAAAAAAAAAA03', accion: 'marcar', confirmar: 'OBAAAAAAAAAA03' });
  const list = await getPurchases('cc3@orbit.test');
  assert.equal(list.find(p => p.productId === DEMO).refunded, true);
  assert.equal(list.find(p => p.productId === 'ob-018').refunded, undefined);
  assert.notEqual(await compraDe('cc3@orbit.test', 'ob-018'), null);
});

test('pedido reasignado: corta el acceso en el email nuevo y en el original', async () => {
  await pagado('OBAAAAAAAAAA05', 'viejo@orbit.test');
  await addPurchase('nuevo@orbit.test', { productId: DEMO, orderId: 'OBAAAAAAAAAA05:ob-demo', via: 'mercadopago', amount: 1, currency: 'ARS', date: '2026-10-10T12:00:00.000Z' });
  const o = await kvGet('orbit:order:OBAAAAAAAAAA05');
  await kvSet('orbit:order:OBAAAAAAAAAA05', { ...o, email: 'nuevo@orbit.test', emailOriginal: 'viejo@orbit.test' });

  const r = await llamar({ orderId: 'OBAAAAAAAAAA05', accion: 'marcar', confirmar: 'OBAAAAAAAAAA05' });
  assert.equal(r.body.compras, 2);
  assert.equal((await accesoHerramienta(pedido('nuevo@orbit.test'), DEMO)).ok, false);
  assert.equal((await accesoHerramienta(pedido('viejo@orbit.test'), DEMO)).ok, false);
});

test('deshacer no borra una marca de reintegro que no es contracargo', async () => {
  await pagado('OBAAAAAAAAAA06', 'cc6@orbit.test');
  const list = await getPurchases('cc6@orbit.test');
  await setPurchases('cc6@orbit.test', list.map(p => ({ ...p, refunded: true, refundReason: 'otro' })));
  await llamar({ orderId: 'OBAAAAAAAAAA06', accion: 'marcar', confirmar: 'OBAAAAAAAAAA06' });
  await llamar({ orderId: 'OBAAAAAAAAAA06', accion: 'deshacer', confirmar: 'OBAAAAAAAAAA06' });
  const [c] = await getPurchases('cc6@orbit.test');
  assert.deepEqual([c.refunded, c.refundReason], [true, 'otro']);
});

test('ver: devuelve el resumen para confirmar, sin tocar nada', async () => {
  await pagado('OBAAAAAAAAAA07', 'cc7@orbit.test');
  const r = await llamar({ orderId: 'OBAAAAAAAAAA07', accion: 'ver' });
  assert.equal(r.code, 200);
  assert.equal(r.body.pedido.email, 'cc7@orbit.test');
  assert.deepEqual(r.body.pedido.items.map(i => i.id), [DEMO]);
  assert.equal((await getPurchases('cc7@orbit.test'))[0].refunded, undefined);
});

test('guardas: confirmación, estados y errores', async () => {
  await pagado('OBAAAAAAAAAA08', 'cc8@orbit.test');
  await kvSet('orbit:order:OBAAAAAAAAAA09', { id: 'OBAAAAAAAAAA09', email: 'cc9@orbit.test', items: [], status: 'pending' });

  let r = await llamar({ orderId: 'OBAAAAAAAAAA08', accion: 'marcar' });
  assert.deepEqual([r.code, r.body.error], [400, 'falta_confirmar']);
  r = await llamar({ orderId: 'OBAAAAAAAAAA08', accion: 'marcar', confirmar: 'OBAAAAAAAAAA07' });
  assert.deepEqual([r.code, r.body.error], [400, 'falta_confirmar']);
  assert.equal((await getPurchases('cc8@orbit.test'))[0].refunded, undefined);

  r = await llamar({ orderId: 'OBAAAAAAAAAA08', accion: 'deshacer', confirmar: 'OBAAAAAAAAAA08' });
  assert.deepEqual([r.code, r.body.error], [409, 'no_marcado']);
  await llamar({ orderId: 'OBAAAAAAAAAA08', accion: 'marcar', confirmar: 'OBAAAAAAAAAA08' });
  r = await llamar({ orderId: 'OBAAAAAAAAAA08', accion: 'marcar', confirmar: 'OBAAAAAAAAAA08' });
  assert.deepEqual([r.code, r.body.error], [409, 'ya_marcado']);

  r = await llamar({ orderId: 'OBAAAAAAAAAA09', accion: 'marcar', confirmar: 'OBAAAAAAAAAA09' });
  assert.deepEqual([r.code, r.body.error], [400, 'pedido_no_pagado']);
  r = await llamar({ orderId: 'OBFFFFFFFFFFFF', accion: 'marcar', confirmar: 'OBFFFFFFFFFFFF' });
  assert.deepEqual([r.code, r.body.error], [404, 'pedido_desconocido']);
  r = await llamar({ orderId: '../x', accion: 'ver' });
  assert.deepEqual([r.code, r.body.error], [400, 'pedido_invalido']);
  r = await llamar({ orderId: 'OBAAAAAAAAAA08', accion: 'borrar' });
  assert.deepEqual([r.code, r.body.error], [400, 'accion_invalida']);
  r = await llamar({ orderId: 'OBAAAAAAAAAA08', accion: 'ver' }, { method: 'GET' });
  assert.equal(r.code, 405);
});

test('solo administración', async () => {
  await pagado('OBAAAAAAAAAA10', 'cc10@orbit.test');
  let r = await llamar({ orderId: 'OBAAAAAAAAAA10', accion: 'marcar', confirmar: 'OBAAAAAAAAAA10' }, { email: 'cc10@orbit.test' });
  assert.equal(r.code, 403);
  r = await llamar({ orderId: 'OBAAAAAAAAAA10', accion: 'marcar', confirmar: 'OBAAAAAAAAAA10' }, { email: null });
  assert.equal(r.code, 401);
  assert.equal((await getPurchases('cc10@orbit.test'))[0].refunded, undefined);
});

test('los webhooks de pago no marcan contracargos (solo el panel)', () => {
  for (const f of ['api/webhooks/mercadopago.js', 'api/webhooks/paypal.js', 'api/paypal-capture.js']) {
    const src = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
    assert.doesNotMatch(src, /contracargo|refunded/i, f);
  }
});
