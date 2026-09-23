/* Aviso de PayPal (respaldo del retorno): verifica la firma y guarda la compra. */
import { markPaid } from '../_lib/orders.js';
import { paypalBase, paypalToken } from '../_lib/paypal.js';

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) return res.status(503).end();
  const chunks = []; for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString();
  let event; try { event = JSON.parse(raw); } catch { return res.status(400).end(); }

  /* si el evento no es el del cobro, cortamos acá: no gastamos dos llamadas
     a PayPal verificando algo que igual íbamos a ignorar */
  if (event.event_type !== 'PAYMENT.CAPTURE.COMPLETED') return res.status(200).json({ ignorado: event.event_type });

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

  const orderId = event.resource?.custom_id || event.resource?.invoice_id;
  if (orderId) await markPaid(orderId, { paymentId: event.resource.id, amount: event.resource?.amount?.value, currency: event.resource?.amount?.currency_code });
  res.status(200).json({ received: true });
}
