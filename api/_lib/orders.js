/* Pedidos: un pedido puede tener varios productos. */
import { kvGet, kvSet, addPurchase } from './kv.js';
import { getCatalog } from './catalog.js';
import { randomBytes } from 'node:crypto';
import { sendEmail, emailReady, layout, it } from './email.js';
import { upsertContact, listClientes } from './marketing.js';

const key = id => `orbit:order:${id}`;
const listKey = email => `orbit:orders:${email.toLowerCase()}`;

export async function normalizeItems(items) {
  if (!Array.isArray(items)) return [];
  const CAT = await getCatalog();
  const out = [];
  for (const it of items.slice(0, 20)) {
    const p = CAT[it?.id];
    const qty = Math.max(1, Math.min(10, parseInt(it?.qty, 10) || 1));
    if (p && !p.soon && !out.some(o => o.id === it.id)) out.push({ id: it.id, qty, name: p.name, code: p.code, usd: p.usd, ars: p.ars });
  }
  return out;
}
export const totalUsd = items => items.reduce((a, i) => a + i.usd * i.qty, 0);
export const totalArs = items => items.reduce((a, i) => a + i.ars * i.qty, 0);

export async function createOrder({ email, items, via }) {
  const id = 'OB' + randomBytes(6).toString('hex').toUpperCase();
  const order = {
    id, email: email.toLowerCase(), items, via, status: 'pending',
    usd: totalUsd(items), ars: totalArs(items), date: new Date().toISOString(),
  };
  await kvSet(key(id), order, 60 * 60 * 24 * 30);
  return order;
}
export const getOrder = id => kvGet(key(id));

export async function markPaid(id, { paymentId, amount, currency }) {
  const order = await getOrder(id);
  if (!order) return null;
  if (order.status === 'paid') return order;                 // idempotente
  order.status = 'paid'; order.paymentId = paymentId; order.paidAt = new Date().toISOString();
  if (amount) order.paidAmount = amount;
  if (currency) order.paidCurrency = currency;
  await kvSet(key(id), order, 60 * 60 * 24 * 365 * 3);
  const list = (await kvGet(listKey(order.email))) || [];
  if (!list.includes(id)) { list.unshift(id); await kvSet(listKey(order.email), list.slice(0, 200)); }
  for (const it of order.items) {
    await addPurchase(order.email, {
      productId: it.id, orderId: `${id}:${it.id}`, via: order.via,
      amount: order.via === 'paypal' ? it.usd : it.ars,
      currency: order.via === 'paypal' ? 'USD' : 'ARS',
      date: order.paidAt,
    });
  }
  /* Aviso al comprador y alta como cliente.
     Los dos se esperan: en Vercel, lo que queda pendiente cuando la función
     responde se muere con ella, y el correo no llegaba a salir. */
  const marca = await upsertContact({
    email: order.email,
    lists: listClientes(),
    attributes: { CLIENTE: 'si', ULTIMA_COMPRA: order.paidAt.slice(0, 10), PRODUCTOS: order.items.map(i => i.code).join(', ') },
  }).catch(() => ({ ok: false }));

  order.contacto = marca && marca.ok ? 'ok' : 'error';
  order.mail = await enviarComprobante(order);
  order.mailAt = new Date().toISOString();
  await kvSet(key(id), order, 60 * 60 * 24 * 365 * 3);
  return order;
}

/* Manda el comprobante de compra y cuenta qué pasó, para poder verlo en el
   panel y reintentarlo. Nunca tira error hacia afuera. */
export async function enviarComprobante(order) {
  if (!emailReady()) return 'sin servicio de email';
  const site = process.env.SITE_URL || 'https://www.orbitando.com.ar';
  const money = order.via === 'paypal'
    ? `USD ${order.usd}`
    : `ARS ${(order.ars || 0).toLocaleString('es-AR')}`;
  /* el servidor trabaja en UTC: sin la zona horaria, una compra de la
     noche se fecha al día siguiente */
  const ZONA = process.env.ORBIT_TZ || 'America/Argentina/Buenos_Aires';
  const cuando = new Date(order.paidAt || Date.now()).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: ZONA });
  const medio = order.via === 'paypal' ? 'PayPal' : 'Mercado Pago';
  try {
    await sendEmail({
      to: order.email,
      subject: `Ya es tuyo — pedido ${order.id}`,
      text: `Gracias por tu compra.\n\n${order.items.map(i => `${i.code} — ${i.name}${i.qty > 1 ? ` x${i.qty}` : ''}`).join('\n')}\n\nPedido ${order.id} · ${cuando} · ${medio} · ${money}\n\nDescargalo desde tu cuenta: ${site}/biblioteca`,
      html: layout({
        accent: 'blue',
        preheader: `Pedido ${order.id} confirmado. Ya podés descargarlo desde tu cuenta.`,
        eyebrow: `Pedido ${order.id} · Confirmado`,
        title: `Ya es ${it('tuyo.', '#3047FF')}`,
        body: '<p style="margin:0">Gracias por comprar en Orbit. Esto es lo que se sumó a tu cuenta:</p>',
        items: order.items,
        meta: [['Fecha', cuando], ['Medio de pago', medio], ['Total', money]],
        cta: 'Descargar ahora →', ctaUrl: `${site}/biblioteca`,
        foot: 'Licencia de uso comercial incluida. Las versiones nuevas te llegan sin cargo y aparecen en tu cuenta. ¿Algo no anda? Respondé este email.',
      }),
    });
    return 'ok';
  } catch (e) {
    return String(e).slice(0, 180);
  }
}
export async function listOrders(email) {
  const ids = (await kvGet(listKey(email))) || [];
  const orders = await Promise.all(ids.slice(0, 50).map(getOrder));
  return orders.filter(Boolean);
}
