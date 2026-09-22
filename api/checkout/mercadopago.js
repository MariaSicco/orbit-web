import { CATALOG, siteUrl } from '../_lib/catalog.js';
import { isEmail, readBody } from '../_lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) return res.status(503).json({ error: 'not_configured', message: 'Falta MP_ACCESS_TOKEN' });

  const { productId, email } = await readBody(req);
  const p = CATALOG[productId];
  if (!p || p.soon) return res.status(400).json({ error: 'invalid_product' });
  if (!isEmail(email)) return res.status(400).json({ error: 'invalid_email' });

  const site = siteUrl(req);
  const r = await fetch('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: [{ id: productId, title: `Orbit ${p.code} — ${p.name}`, quantity: 1, currency_id: 'ARS', unit_price: p.ars }],
      payer: { email },
      metadata: { product_id: productId, email },
      external_reference: `${productId}|${email}`,
      back_urls: { success: `${site}/gracias?via=mp`, pending: `${site}/gracias?via=mp`, failure: `${site}/productos` },
      auto_return: 'approved',
      notification_url: `${site}/api/webhooks/mercadopago`,
      statement_descriptor: 'ORBIT',
    }),
  });
  const data = await r.json();
  if (!r.ok) return res.status(502).json({ error: 'mp_error', detail: data });
  res.status(200).json({ url: data.init_point || data.sandbox_init_point });
}
