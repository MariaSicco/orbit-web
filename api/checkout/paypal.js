import { CATALOG, siteUrl } from '../_lib/catalog.js';
import { isEmail, readBody } from '../_lib/auth.js';
import { paypalBase, paypalToken } from '../_lib/paypal.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_SECRET)
    return res.status(503).json({ error: 'not_configured', message: 'Faltan PAYPAL_CLIENT_ID / PAYPAL_SECRET' });

  const { productId, email } = await readBody(req);
  const p = CATALOG[productId];
  if (!p || p.soon) return res.status(400).json({ error: 'invalid_product' });
  if (!isEmail(email)) return res.status(400).json({ error: 'invalid_email' });

  const site = siteUrl(req);
  const token = await paypalToken();
  const r = await fetch(`${paypalBase()}/v2/checkout/orders`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [{
        custom_id: `${productId}|${email}`,
        description: `Orbit ${p.code} — ${p.name}`,
        amount: { currency_code: 'USD', value: p.usd.toFixed(2) },
      }],
      payment_source: { paypal: { experience_context: {
        brand_name: 'Orbit', user_action: 'PAY_NOW',
        return_url: `${site}/api/paypal-capture`, cancel_url: `${site}/productos`,
      } } },
    }),
  });
  const data = await r.json();
  if (!r.ok) return res.status(502).json({ error: 'paypal_error', detail: data });
  const approve = (data.links || []).find(l => l.rel === 'payer-action' || l.rel === 'approve');
  res.status(200).json({ url: approve?.href });
}
