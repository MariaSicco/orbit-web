/* Vuelta desde PayPal: confirma el pago y guarda el pedido. */
import { siteUrl } from './_lib/catalog.js';
import { paypalBase, paypalToken } from './_lib/paypal.js';
import { markPaid } from './_lib/orders.js';
import { setSessionCookie } from './_lib/auth.js';

export default async function handler(req, res) {
  const site = siteUrl(req);
  const orderToken = req.query?.token;
  if (!orderToken) return res.redirect(302, `${site}/productos`);
  try {
    const token = await paypalToken();
    const r = await fetch(`${paypalBase()}/v2/checkout/orders/${orderToken}/capture`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    const data = await r.json();
    const unit = data?.purchase_units?.[0];
    const orderId = unit?.custom_id;
    if (data?.status === 'COMPLETED' && orderId) {
      const order = await markPaid(orderId, {
        paymentId: data.id,
        amount: unit?.payments?.captures?.[0]?.amount?.value,
        currency: 'USD',
      });
      if (order) setSessionCookie(res, order.email);
      return res.redirect(302, `${site}/gracias?order=${orderId}`);
    }
  } catch (e) {}
  res.redirect(302, `${site}/gracias?pending=1`);
}
