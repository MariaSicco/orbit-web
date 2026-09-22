/* Pedidos: un pedido puede tener varios productos. */
import { kvGet, kvSet, addPurchase } from './kv.js';
import { CATALOG } from './catalog.js';
import { randomBytes } from 'node:crypto';

const key = id => `orbit:order:${id}`;
const listKey = email => `orbit:orders:${email.toLowerCase()}`;

export function normalizeItems(items) {
  if (!Array.isArray(items)) return [];
  const out = [];
  for (const it of items.slice(0, 20)) {
    const p = CATALOG[it?.id];
    const qty = Math.max(1, Math.min(10, parseInt(it?.qty, 10) || 1));
    if (p && !p.soon && !out.some(o => o.id === it.id)) out.push({ id: it.id, qty, name: p.name, code: p.code, usd: p.usd, ars: p.ars });
  }
  return out;
}
export const totalUsd = items => items.reduce((a, i) => a + i.usd * i.qty, 0);
export const totalArs = items => items.reduce((a, i) => a + i.ars * i.qty, 0);

export async function createOrder({ email, items, via }) {
  const id = 'OB' + randomBytes(6).toString('hex').toUpperCase();
  const order = {
    id, email: email.toLowerCase(), items, via, status: 'pending',
    usd: totalUsd(items), ars: totalArs(items), date: new Date().toISOString(),
  };
  await kvSet(key(id), order, 60 * 60 * 24 * 30);
  return order;
}
export const getOrder = id => kvGet(key(id));

export async function markPaid(id, { paymentId, amount, currency }) {
  const order = await getOrder(id);
  if (!order) return null;
  if (order.status === 'paid') return order;                 // idempotente
  order.status = 'paid'; order.paymentId = paymentId; order.paidAt = new Date().toISOString();
  if (amount) order.paidAmount = amount;
  if (currency) order.paidCurrency = currency;
  await kvSet(key(id), order, 60 * 60 * 24 * 365 * 3);
  const list = (await kvGet(listKey(order.email))) || [];
  if (!list.includes(id)) { list.unshift(id); await kvSet(listKey(order.email), list.slice(0, 200)); }
  for (const it of order.items) {
    await addPurchase(order.email, {
      productId: it.id, orderId: `${id}:${it.id}`, via: order.via,
      amount: order.via === 'paypal' ? it.usd : it.ars,
      currency: order.via === 'paypal' ? 'USD' : 'ARS',
      date: order.paidAt,
    });
  }
  return order;
}
export async function listOrders(email) {
  const ids = (await kvGet(listKey(email))) || [];
  const orders = await Promise.all(ids.slice(0, 50).map(getOrder));
  return orders.filter(Boolean);
}
