/* Vuelve a mandar el comprobante de una compra pagada. */
import { requireAdmin } from '../_lib/admin.js';
import { readBody } from '../_lib/auth.js';
import { getOrder, enviarComprobante } from '../_lib/orders.js';
import { kvSet } from '../_lib/kv.js';

export default async function handler(req, res) {
  const s = requireAdmin(req, res); if (!s) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const { orderId } = await readBody(req);
  const order = await getOrder(String(orderId || ''));
  if (!order) return res.status(404).json({ error: 'pedido_desconocido' });
  if (order.status !== 'paid') return res.status(400).json({ error: 'pedido_no_pagado' });

  const resultado = await enviarComprobante(order);
  order.mail = resultado;
  order.mailAt = new Date().toISOString();
  await kvSet(`orbit:order:${order.id}`, order, 60 * 60 * 24 * 365 * 3);

  res.status(200).json({ ok: resultado === 'ok', resultado, para: order.email });
}
