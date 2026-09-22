/* Aviso de PayPal (respaldo del retorno): verifica la firma y guarda la compra. */
import { CATALOG } from '../_lib/catalog.js';
import { addPurchase } from '../_lib/kv.js';
import { paypalBase, paypalToken } from '../_lib/paypal.js';

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) return res.status(503).end();
  const chunks = []; for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString();
  let event; try { event = JSON.parse(raw); } catch { return res.status(400).end(); }

  const token = await paypalToken();
  const v = await fetch(`${paypalBase()}/v1/notifications/verify-webhook-signature`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      auth_algo: req.headers['paypal-auth-algo'],
      cert_url: req.headers['paypal-cert-url'],
      transmission_id: req.headers['paypal-transmission-id'],
      transmission_sig: req.headers['paypal-transmission-sig'],
      transmission_time: req.headers['paypal-transmission-time'],
      webhook_id: webhookId,
      webhook_event: event,
    }),
  });
  const { verification_status } = await v.json();
  if (verification_status !== 'SUCCESS') return res.status(400).end();

  if (event.event_type === 'PAYMENT.CAPTURE.COMPLETED') {
    const [productId, email] = String(event.resource?.custom_id || '').split('|');
    if (CATALOG[productId] && email) {
      await addPurchase(email, {
        productId, orderId: event.resource.id, via: 'paypal',
        amount: event.resource?.amount?.value, currency: event.resource?.amount?.currency_code,
        date: new Date().toISOString(),
      });
    }
  }
  res.status(200).json({ received: true });
}
