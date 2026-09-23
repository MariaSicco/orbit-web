/* Aviso de PayPal (respaldo del retorno): verifica la firma y guarda la compra. */
import { markPaid } from '../_lib/orders.js';
import { readBody } from '../_lib/auth.js';
import { paypalBase, paypalToken } from '../_lib/paypal.js';

export default async function handler(req, res) {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) return res.status(503).end();

  /* readBody sirve tanto si Vercel ya procesó el cuerpo como si llega crudo.
     Leerlo como flujo a secas devolvía vacío y el aviso se perdía. */
  const event = await readBody(req);
  if (!event?.event_type) return res.status(200).json({ ignorado: 'sin evento' });

  /* lo que no es un cobro lo descartamos antes de gastar llamadas */
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
  if (verification_status !== 'SUCCESS') return res.status(400).json({ error: 'firma_invalida' });

  const orderId = event.resource?.custom_id || event.resource?.invoice_id;
  if (!orderId) return res.status(200).json({ ignorado: 'sin número de pedido' });

  await markPaid(orderId, {
    paymentId: event.resource.id,
    amount: event.resource?.amount?.value,
    currency: event.resource?.amount?.currency_code,
  });
  res.status(200).json({ received: true });
}
