/* Ventas de Mimitos cobradas en Impultienda (api/webhooks/impultienda.js) */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { firmaOk, procesar, reintegrar } from '../api/webhooks/impultienda.js';

const SECRET = 's3creto-de-prueba';
const MIMITOS = 'f7e6d5c4-aaaa-bbbb-cccc-ddddeeeeffff';
process.env.IMPULTIENDA_MIMITOS_PRODUCTOS = ` ${MIMITOS.toUpperCase()} , otro-id`;
const venta = (event, extra = {}) => ({ id: 'w1', event, data: { order_id: 'd320394e-0ebd-4e77-9002-0680aba42f0e', order_number: 4821, customer: { email: 'Compradora@Mail.com' }, items: [{ product_id: MIMITOS, price: 29, type: 'main' }], total: 29, currency: 'USD', buyer_country: 'ES', ...extra } });

test('firma: HMAC de timestamp.cuerpo, con 5 minutos de margen', () => {
  const ts = String(Math.floor(Date.now() / 1000)), body = '{"a":1}';
  const sig = createHmac('sha256', SECRET).update(`${ts}.${body}`).digest('hex');
  assert.ok(firmaOk(SECRET, ts, body, sig));
  assert.ok(!firmaOk(SECRET, ts, body + ' ', sig), 'cuerpo cambiado');
  assert.ok(!firmaOk('otra', ts, body, sig), 'otra clave');
  assert.ok(!firmaOk(SECRET, ts, body, sig, Date.now() + 6 * 60e3), 'timestamp viejo');
  assert.ok(!firmaOk('', ts, body, sig), 'sin clave configurada');
});

test('pago confirmado: suma la compra de Mimitos con marca By Majo', async () => {
  const compras = [];
  const r = await procesar(venta('order.approved'), { addPurchase: async (e, p) => compras.push([e, p]) });
  assert.deepEqual(r, { ok: true, granted: true });
  assert.equal(compras[0][0], 'compradora@mail.com');
  assert.equal(compras[0][1].productId, 'ob-018');
  assert.equal(compras[0][1].via, 'bymajo');
  assert.equal(compras[0][1].orderId, 'impultienda:d320394e-0ebd-4e77-9002-0680aba42f0e');
});

test('otro producto de Impultienda: 200 sin tocar nada', async () => {
  const v = venta('order.approved'); v.data.items[0].product_id = 'no-es-mimitos';
  assert.deepEqual(await procesar(v, { addPurchase: async () => assert.fail('no debía guardar') }), { ok: false, reason: 'product_not_mapped' });
});

test('el botón Probar (simulacro) no guarda', async () => {
  assert.deepEqual(await procesar({ ...venta('order.approved'), test: true }, { addPurchase: async () => assert.fail('no debía guardar') }), { ok: true, test: true });
});

test('reembolso y contracargo: la compra queda reintegrada', async () => {
  const list = [{ orderId: 'impultienda:abc', productId: 'ob-018' }, { orderId: 'otra', productId: 'ob-018' }];
  let saved = null;
  assert.ok(await reintegrar('a@b.com', 'impultienda:abc', { getPurchases: async () => list, kvSet: async (k, v) => { saved = [k, v]; } }));
  assert.equal(saved[0], 'orbit:purchases:a@b.com');
  assert.ok(list[0].refunded); assert.ok(!list[1].refunded);
  const r = await procesar(venta('order.chargeback'), { reintegrar: async (e, id) => e === 'compradora@mail.com' && id.startsWith('impultienda:') });
  assert.deepEqual(r, { ok: true, revoked: true });
});
