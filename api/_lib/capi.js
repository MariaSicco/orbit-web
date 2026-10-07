/* API de Conversiones de Meta: el servidor avisa "hubo una compra" cuando el
   pago se acredita. Usa el mismo event_id que el Píxel (el número de pedido),
   así Meta no la cuenta dos veces si la persona también aceptó cookies.
   Sin META_CAPI_TOKEN no hace nada. Nunca tira error hacia afuera. */
import { createHash } from 'node:crypto';

const PIXEL = () => process.env.META_PIXEL_ID || '867844293081970';
const sha = v => createHash('sha256').update(String(v).trim().toLowerCase()).digest('hex');

export async function capiPurchase(order) {
  const token = process.env.META_CAPI_TOKEN;
  if (!token) return 'sin token';
  if (!order || order.status !== 'paid') return 'no pagado';
  const site = process.env.SITE_URL || 'https://www.orbitando.com.ar';
  const usd = order.via === 'paypal';
  const user_data = { em: [sha(order.email)], country: [sha('ar')] };
  if (order.ip) user_data.client_ip_address = order.ip;
  if (order.ua) user_data.client_user_agent = order.ua;
  if (order.fbc) user_data.fbc = order.fbc;
  const event = {
    event_name: 'Purchase',
    event_time: Math.floor(new Date(order.paidAt || Date.now()).getTime() / 1000),
    event_id: order.id,
    action_source: 'website',
    event_source_url: `${site}/gracias`,
    user_data,
    custom_data: {
      currency: usd ? 'USD' : 'ARS',
      value: usd ? order.usd : order.ars,
      content_ids: order.items.map(i => i.id),
      content_type: 'product',
      num_items: order.items.reduce((a, i) => a + i.qty, 0),
    },
  };
  const body = { data: [event] };
  if (process.env.META_TEST_EVENT_CODE) body.test_event_code = process.env.META_TEST_EVENT_CODE;
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 6000);
    const r = await fetch(`https://graph.facebook.com/v21.0/${PIXEL()}/events?access_token=${encodeURIComponent(token)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctl.signal,
    });
    clearTimeout(t);
    const j = await r.json().catch(() => ({}));
    return r.ok ? `ok (${j.events_received ?? '?'})` : `error ${r.status}: ${(j.error && j.error.message || '').slice(0, 140)}`;
  } catch (e) { return String(e).slice(0, 140); }
}
