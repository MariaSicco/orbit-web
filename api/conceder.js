/* Compras hechas en otra tienda de Majo (By Majo Studio, bymajostudio.com):
   cuando alguien paga Mimitos allá, By Majo avisa acá y la compra se suma a
   ese email, así entra a /mascotas con su cuenta de Orbit (enlace al mail).

   Lo llama solo el servidor de By Majo, con la clave ORBIT_CONCEDER_CLAVE
   (la misma en los dos proyectos de Vercel). Solo se pueden conceder los
   productos de la lista de abajo. Es idempotente: el mismo pedido no se suma dos veces. */
import { timingSafeEqual } from 'node:crypto';
import { addPurchase } from './_lib/kv.js';
import { cleanEmail, isEmail, readBody } from './_lib/auth.js';

const PERMITIDOS = new Set(['ob-018']);

function claveOk(req) {
  const clave = process.env.ORBIT_CONCEDER_CLAVE || '';
  const vino = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (clave.length < 24 || !vino) return false;
  const a = Buffer.from(vino), b = Buffer.from(clave);
  return a.length === b.length && timingSafeEqual(a, b);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  if (!claveOk(req)) return res.status(401).json({ error: 'unauthorized' });
  const body = await readBody(req);
  const email = cleanEmail(body.email);
  const productId = String(body.productoOrbit || '');
  const pedido = String(body.pedido || '').replace(/[^A-Za-z0-9:_-]/g, '').slice(0, 60);
  if (!isEmail(email) || !PERMITIDOS.has(productId) || !pedido) return res.status(400).json({ error: 'invalid' });
  const moneda = body.moneda === 'USD' ? 'USD' : 'ARS';
  await addPurchase(email, {
    productId,
    orderId: `bymajo:${pedido}`,
    via: 'bymajo',
    amount: Number(body.monto) || 0,
    currency: moneda,
    date: typeof body.fecha === 'string' ? body.fecha.slice(0, 40) : new Date().toISOString(),
  });
  res.status(200).json({ ok: true });
}
