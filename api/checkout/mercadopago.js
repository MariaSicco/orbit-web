import { siteUrl } from '../_lib/catalog.js';
import { mpPreference } from '../_lib/mp.js';
import { isEmail, readBody } from '../_lib/auth.js';
import { normalizeItems, createOrder, readAttr, readClient } from '../_lib/orders.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) return res.status(503).json({ error: 'not_configured', message: 'Falta MP_ACCESS_TOKEN' });

  const body = await readBody(req);
  const email = body?.email;
  const items = await normalizeItems(body?.items || (body?.productId ? [{ id: body.productId, qty: 1 }] : []));
  if (!items.length) return res.status(400).json({ error: 'empty_cart' });
  if (!isEmail(email)) return res.status(400).json({ error: 'invalid_email' });

  const order = await createOrder({ email, items, via: 'mercadopago', ...readAttr(body), ...readClient(req) });
  const site = siteUrl(req);
  const pref = await mpPreference(order, site);
  if (pref.error) return res.status(502).json({ error: pref.error, detail: pref.detail });
  res.status(200).json({ url: pref.url, orderId: order.id });
}
