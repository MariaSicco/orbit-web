/* Ventas de Mimitos cobradas en Impultienda (checkout de Majo, cobra con Stripe/PayPal/MP afuera).
   Impultienda nos hace un POST firmado por cada evento (docs: impultienda.ar/docs/webhooks):
   - order.approved → se suma la compra de Mimitos a ese email (entra a /mascotas con enlace al mail)
   - order.refunded / order.chargeback → la compra queda reintegrada y deja de dar acceso
   Firma: X-Impultienda-Signature = HMAC-SHA256 hex de "{X-Impultienda-Timestamp}.{cuerpo crudo}" con
   IMPULTIENDA_WEBHOOK_SECRET (la clave que muestra el panel al crear el endpoint). Timestamps de más de
   5 minutos se rechazan. Qué producto de Impultienda es Mimitos: IMPULTIENDA_MIMITOS_PRODUCTOS (ids
   separados por coma, se copian con «copiar ID» en el panel). Lo que no es Mimitos responde 200 sin hacer nada. */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { addPurchase, getPurchases, kvSet } from '../_lib/kv.js';
import { cleanEmail, isEmail } from '../_lib/auth.js';

export const config = { api: { bodyParser: false } };
const PRODUCTO_ORBIT = 'ob-018';

async function crudo(req) {
  if (typeof req.body === 'string') return req.body;
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8');
  const chunks = []; for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks).toString('utf8');
}

export function firmaOk(secret, timestamp, body, firma, ahora = Date.now()) {
  if (!secret || !/^\d{9,11}$/.test(String(timestamp || '')) || !/^[0-9a-f]{64}$/i.test(String(firma || ''))) return false;
  if (Math.abs(ahora / 1000 - Number(timestamp)) > 300) return false;
  const esperada = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  return timingSafeEqual(Buffer.from(esperada), Buffer.from(String(firma).toLowerCase()));
}

export const productosMimitos = () => new Set(String(process.env.IMPULTIENDA_MIMITOS_PRODUCTOS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean));
const orderIdDe = d => `impultienda:${String(d.order_id || '').replace(/[^A-Za-z0-9-]/g, '').slice(0, 60)}`;

/* deja la compra reintegrada (herramienta-acceso.js ya no la cuenta) */
export async function reintegrar(email, orderId, deps = { getPurchases, kvSet }) {
  const list = await deps.getPurchases(email);
  let cambio = false;
  for (const p of list) if (p.orderId === orderId && !p.refunded) { p.refunded = true; p.refundedAt = new Date().toISOString(); cambio = true; }
  if (cambio) await deps.kvSet(`orbit:purchases:${email.toLowerCase()}`, list);
  return cambio;
}

export async function procesar(payload, deps = { addPurchase, reintegrar }) {
  const d = payload?.data || {};
  const email = cleanEmail(d.customer?.email);
  const ids = productosMimitos();
  const esMimitos = (d.items || []).some(i => ids.has(String(i.product_id || '').toLowerCase()));
  if (!esMimitos) return { ok: false, reason: 'product_not_mapped' };
  if (!isEmail(email) || !d.order_id) return { ok: false, reason: 'invalid' };
  /* el botón «Probar» del panel: simulacro, no se guarda nada */
  if (payload.test === true || String(d.order_id).startsWith('TEST-')) return { ok: true, test: true };
  const orderId = orderIdDe(d);
  if (payload.event === 'order.approved') {
    const item = (d.items || []).find(i => ids.has(String(i.product_id || '').toLowerCase()));
    await deps.addPurchase(email, {
      productId: PRODUCTO_ORBIT, orderId, via: 'bymajo', source: 'impultienda',
      amount: Number(item?.price) || Number(d.total) || 0, currency: String(d.currency || 'USD').slice(0, 3),
      country: String(d.buyer_country || '').slice(0, 2), number: d.order_number || null,
      date: typeof d.order_created_at === 'string' ? d.order_created_at.slice(0, 40) : new Date().toISOString(),
    });
    return { ok: true, granted: true };
  }
  if (payload.event === 'order.refunded' || payload.event === 'order.chargeback') {
    return { ok: true, revoked: await deps.reintegrar(email, orderId) };
  }
  return { ok: true, ignored: payload.event };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  const body = await crudo(req);
  const ok = firmaOk(process.env.IMPULTIENDA_WEBHOOK_SECRET, req.headers['x-impultienda-timestamp'], body, req.headers['x-impultienda-signature']);
  if (!ok) return res.status(401).json({ error: 'bad_signature' });
  let payload; try { payload = JSON.parse(body); } catch { return res.status(400).json({ error: 'invalid_json' }); }
  try { return res.status(200).json(await procesar(payload)); }
  catch (e) { console.error('[impultienda] error', e?.message); return res.status(500).json({ error: 'retry' }); }
}
