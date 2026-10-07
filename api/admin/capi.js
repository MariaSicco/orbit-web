/* Vuelve a informar a Meta una compra pagada (por ejemplo, las que se
   acreditaron antes de cargar META_CAPI_TOKEN). Meta acepta hasta 7 días. */
import { requireAdmin } from '../_lib/admin.js';
import { readBody } from '../_lib/auth.js';
import { getOrder } from '../_lib/orders.js';
import { capiPurchase } from '../_lib/capi.js';
import { kvSet } from '../_lib/kv.js';

export default async function handler(req, res) {
  const s = requireAdmin(req, res); if (!s) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  const { orderId } = await readBody(req);
  const order = await getOrder(String(orderId || ''));
  if (!order) return res.status(404).json({ error: 'pedido_desconocido' });
  if (order.status !== 'paid') return res.status(400).json({ error: 'pedido_no_pagado' });
  order.capi = await capiPurchase(order);
  await kvSet(`orbit:order:${order.id}`, order, 60 * 60 * 24 * 365 * 3);
  res.status(200).json({ ok: String(order.capi).startsWith('ok'), resultado: order.capi });
}
