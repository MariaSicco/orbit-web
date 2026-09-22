/* Vuelta desde PayPal: confirma el pago y guarda la compra. */
import { CATALOG, siteUrl } from './_lib/catalog.js';
import { paypalBase, paypalToken } from './_lib/paypal.js';
import { addPurchase } from './_lib/kv.js';
import { setSessionCookie } from './_lib/auth.js';

export default async function handler(req, res) {
  const site = siteUrl(req);
  const orderId = req.query?.token;
  if (!orderId) return res.redirect(302, `${site}/productos`);
  try {
    const token = await paypalToken();
    const r = await fetch(`${paypalBase()}/v2/checkout/orders/${orderId}/capture`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    const data = await r.json();
    const unit = data?.purchase_units?.[0];
    const [productId, email] = String(unit?.custom_id || '').split('|');
    const paid = data?.status === 'COMPLETED';
    if (paid && CATALOG[productId] && email) {
      await addPurchase(email, {
        productId, orderId: data.id, via: 'paypal',
        amount: unit?.payments?.captures?.[0]?.amount?.value, currency: 'USD',
        date: new Date().toISOString(),
      });
      setSessionCookie(res, email);
      return res.redirect(302, `${site}/gracias?via=paypal&p=${productId}`);
    }
  } catch (e) {}
  res.redirect(302, `${site}/gracias?via=paypal&pending=1`);
}
