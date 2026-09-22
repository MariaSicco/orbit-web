/* Aviso de Mercado Pago: consulta el pago real y guarda la compra. */
import { CATALOG } from '../_lib/catalog.js';
import { addPurchase } from '../_lib/kv.js';
import { readBody } from '../_lib/auth.js';

export default async function handler(req, res) {
  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) return res.status(503).end();
  const body = await readBody(req);
  const paymentId = body?.data?.id || req.query?.['data.id'] || req.query?.id;
  if (!paymentId) return res.status(200).end();       // otros eventos: ignorar

  const r = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) return res.status(200).end();
  const pay = await r.json();
  if (pay.status !== 'approved') return res.status(200).end();

  const ref = String(pay.external_reference || pay.metadata?.product_id || '');
  const [productId, refEmail] = ref.includes('|') ? ref.split('|') : [ref, ''];
  const email = refEmail || pay.metadata?.email || pay.payer?.email;
  if (CATALOG[productId] && email) {
    await addPurchase(email, {
      productId, orderId: String(pay.id), via: 'mercadopago',
      amount: pay.transaction_amount, currency: pay.currency_id,
      date: new Date().toISOString(),
    });
  }
  res.status(200).json({ received: true });
}
