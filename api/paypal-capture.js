/* Vuelta desde PayPal: confirma el pago y guarda el pedido. */
import { siteUrl } from './_lib/catalog.js';
import { paypalBase, paypalToken } from './_lib/paypal.js';
import { markPaid } from './_lib/orders.js';
import { setSessionCookie } from './_lib/auth.js';

/* PayPal devuelve el número de pedido en distintos lugares según el caso:
   a veces en la unidad de compra, a veces dentro del cobro. Los miramos todos. */
function numeroDePedido(data) {
  const u = data?.purchase_units?.[0];
  const c = u?.payments?.captures?.[0];
  return u?.custom_id || u?.invoice_id || c?.custom_id || c?.invoice_id || null;
}
const montoDe = data => data?.purchase_units?.[0]?.payments?.captures?.[0]?.amount?.value;

export default async function handler(req, res) {
  const site = siteUrl(req);
  const orderToken = req.query?.token;
  if (!orderToken) return res.redirect(302, `${site}/productos`);

  try {
    const token = await paypalToken();
    const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

    let r = await fetch(`${paypalBase()}/v2/checkout/orders/${orderToken}/capture`, { method: 'POST', headers: auth });
    let data = await r.json();

    /* si ya se había cobrado (doble vuelta, o el aviso llegó primero),
       leemos el pedido en vez de darlo por perdido */
    const yaCobrado = data?.details?.some?.(d => d.issue === 'ORDER_ALREADY_CAPTURED');
    if (!r.ok && yaCobrado) {
      r = await fetch(`${paypalBase()}/v2/checkout/orders/${orderToken}`, { headers: auth });
      data = await r.json();
    }

    const orderId = numeroDePedido(data);
    const completo = data?.status === 'COMPLETED' || yaCobrado;

    if (completo && orderId) {
      const order = await markPaid(orderId, { paymentId: data.id, amount: montoDe(data), currency: 'USD' });
      if (order) setSessionCookie(res, order.email);
      return res.redirect(302, `${site}/gracias?order=${orderId}`);
    }
    /* si el cobro salió bien pero no encontramos el número, el aviso de
       PayPal lo va a resolver: no lo damos por fallado */
    if (completo) return res.redirect(302, `${site}/gracias?pending=1`);
  } catch (e) {}
  res.redirect(302, `${site}/gracias?pending=1`);
}
