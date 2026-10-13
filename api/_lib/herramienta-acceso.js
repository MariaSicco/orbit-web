/* Acceso a una herramienta online: sesión de Orbit + compra del producto.
   Las cuentas administradoras entran sin comprar (para probar y dar soporte).
   Sirve para la página (api/herramienta.js) y para cualquier función
   /api/... de una herramienta: `const acc = await requireHerramienta(req, res, 'ob-0XX'); if (!acc) return;` */
import { readSession } from './auth.js';
import { getPurchases } from './kv.js';
import { isAdmin } from './admin.js';

export async function accesoHerramienta(req, productId) {
  const s = readSession(req);
  if (!s) return { ok: false, status: 401, motivo: 'sin_sesion', error: 'Entrá con tu cuenta de Orbit para usar esta herramienta.' };
  if (isAdmin(s.email)) return { ok: true, email: s.email, admin: true };
  let compras;
  try { compras = await getPurchases(s.email); }
  catch { return { ok: false, status: 503, motivo: 'sin_base', error: 'No pudimos revisar tu compra. Probá de nuevo en un rato.' }; }
  if (!compras.some(p => p.productId === productId)) {
    return { ok: false, status: 403, motivo: 'sin_compra', error: 'Esta herramienta es para quienes la compraron.' };
  }
  return { ok: true, email: s.email, admin: false };
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
