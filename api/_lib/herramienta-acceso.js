/* Acceso a una herramienta online: sesión de Orbit + compra del producto.
   Las cuentas administradoras entran sin comprar (para probar y dar soporte).
   Sirve para la página (api/herramienta.js) y para cualquier función
   /api/... de una herramienta: `const acc = await requireHerramienta(req, res, 'ob-0XX'); if (!acc) return;` */
import { readSession } from './auth.js';
import { getPurchases } from './kv.js';
import { isAdmin } from './admin.js';

/* Compra vigente de un producto para un email: la primera, sin contar las
   reintegradas (refunded o status 'refunded'). null si no hay. Tira error si
   la base no responde. Sirve también sin request (cron, links públicos). */
const vigente = (p, productId) => Boolean(p) && p.productId === productId && !p.refunded && p.status !== 'refunded';
export async function compraDe(email, productId) {
  if (!email) return null;
  const compras = (await getPurchases(String(email))).filter(p => vigente(p, productId));
  return compras.sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')))[0] || null;
}

export async function accesoHerramienta(req, productId) {
  const s = readSession(req);
  if (!s) return { ok: false, status: 401, motivo: 'sin_sesion', error: 'Entrá con tu cuenta de Orbit para usar esta herramienta.' };
  if (isAdmin(s.email)) return { ok: true, email: s.email, admin: true, compra: null };
  let compra;
  try { compra = await compraDe(s.email, productId); }
  catch { return { ok: false, status: 503, motivo: 'sin_base', error: 'No pudimos revisar tu compra. Probá de nuevo en un rato.' }; }
  if (!compra) {
    return { ok: false, status: 403, motivo: 'sin_compra', email: s.email, error: 'Esta herramienta es para quienes la compraron.' };
  }
  return { ok: true, email: s.email, admin: false, compra };
}

/* Para funciones de API: responde el error en JSON y devuelve null, o devuelve el acceso. */
export async function requireHerramienta(req, res, productId) {
  const acc = await accesoHerramienta(req, productId);
  if (acc.ok) return acc;
  res.setHeader('Cache-Control', 'no-store');
  res.status(acc.status).json({ ok: false, error: acc.error, motivo: acc.motivo });
  return null;
}

/* Para páginas: sin sesión, al login (después cae en la biblioteca, con el botón "Abrir");
   sin compra, a la ficha del producto. */
export const destinoSinAcceso = (acc, productId) =>
  acc.motivo === 'sin_sesion' ? '/acceso' : `/p/${encodeURIComponent(productId)}`;
