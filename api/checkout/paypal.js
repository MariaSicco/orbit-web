import { siteUrl } from '../_lib/catalog.js';
import { isEmail, readBody } from '../_lib/auth.js';
import { paypalBase, paypalToken } from '../_lib/paypal.js';
import { normalizeItems, createOrder, totalUsd } from '../_lib/orders.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_SECRET)
    return res.status(503).json({ error: 'not_configured', message: 'Faltan PAYPAL_CLIENT_ID / PAYPAL_SECRET' });

  const body = await readBody(req);
  const email = body?.email;
  const items = await normalizeItems(body?.items || (body?.productId ? [{ id: body.productId, qty: 1 }] : []));
  if (!items.length) return res.status(400).json({ error: 'empty_cart' });
  if (!isEmail(email)) return res.status(400).json({ error: 'invalid_email' });

  const order = await createOrder({ email, items, via: 'paypal' });
  const site = siteUrl(req);
  const token = await paypalToken();
  const total = totalUsd(items).toFixed(2);
  const r = await fetch(`${paypalBase()}/v2/checkout/orders`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [{
        custom_id: order.id,
        invoice_id: order.id,
        description: `Orbit — ${items.length} ${items.length === 1 ? 'producto' : 'productos'}`,
        amount: { currency_code: 'USD', value: total, breakdown: { item_total: { currency_code: 'USD', value: total } } },
        items: items.map(i => ({ name: `${i.code} ${i.name}`.slice(0, 127), quantity: String(i.qty), unit_amount: { currency_code: 'USD', value: i.usd.toFixed(2) }, category: 'DIGITAL_GOODS' })),
      }],
      /* Sin payment_source fijo: PayPal muestra su billetera y además deja
         pagar con tarjeta sin tener cuenta, que es como compra mucha gente. */
      application_context: {
        brand_name: 'Orbit', user_action: 'PAY_NOW',
        shipping_preference: 'NO_SHIPPING',   /* son productos digitales */
        landing_page: 'GUEST_CHECKOUT',
        return_url: `${site}/api/paypal-capture`, cancel_url: `${site}/productos`,
      },
    }),
  });
  const data = await r.json();
  if (!r.ok) return res.status(502).json({ error: 'paypal_error', detail: data });
  const approve = (data.links || []).find(l => l.rel === 'payer-action' || l.rel === 'approve');
  res.status(200).json({ url: approve?.href, orderId: order.id });
}
