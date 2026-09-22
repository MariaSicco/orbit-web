import { CATALOG, siteUrl } from '../_lib/catalog.js';
import { isEmail, readBody } from '../_lib/auth.js';
import { normalizeItems, createOrder } from '../_lib/orders.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) return res.status(503).json({ error: 'not_configured', message: 'Falta MP_ACCESS_TOKEN' });

  const body = await readBody(req);
  const email = body?.email;
  const items = normalizeItems(body?.items || (body?.productId ? [{ id: body.productId, qty: 1 }] : []));
  if (!items.length) return res.status(400).json({ error: 'empty_cart' });
  if (!isEmail(email)) return res.status(400).json({ error: 'invalid_email' });

  const order = await createOrder({ email, items, via: 'mercadopago' });
  const site = siteUrl(req);
  const r = await fetch('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: items.map(i => ({ id: i.id, title: `Orbit ${i.code} — ${i.name}`, quantity: i.qty, currency_id: 'ARS', unit_price: i.ars })),
      payer: { email },
      external_reference: order.id,
      metadata: { order_id: order.id, email },
      back_urls: { success: `${site}/gracias?order=${order.id}`, pending: `${site}/gracias?order=${order.id}&pending=1`, failure: `${site}/productos` },
      auto_return: 'approved',
      notification_url: `${site}/api/webhooks/mercadopago`,
      statement_descriptor: 'ORBIT',
    }),
  });
  const data = await r.json();
  if (!r.ok) return res.status(502).json({ error: 'mp_error', detail: data });
  res.status(200).json({ url: data.init_point || data.sandbox_init_point, orderId: order.id });
}
