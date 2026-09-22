/* Aviso de Mercado Pago: consulta el pago real y confirma el pedido. */
import { markPaid } from '../_lib/orders.js';
import { readBody } from '../_lib/auth.js';

export default async function handler(req, res) {
  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) return res.status(503).end();
  const body = await readBody(req);
  const paymentId = body?.data?.id || req.query?.['data.id'] || req.query?.id;
  if (!paymentId) return res.status(200).end();

  const r = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) return res.status(200).end();
  const pay = await r.json();
  if (pay.status !== 'approved') return res.status(200).end();

  const orderId = pay.external_reference || pay.metadata?.order_id;
  if (orderId) await markPaid(orderId, { paymentId: String(pay.id), amount: pay.transaction_amount, currency: pay.currency_id });
  res.status(200).json({ received: true });
}
