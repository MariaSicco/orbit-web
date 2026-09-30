/* Acceso a Orbit IVA (herramienta online): sesión de Orbit + compra de ob-005.
   Las cuentas administradoras entran sin comprar y sin gastar lecturas (para probar y dar soporte). */
import { readSession } from './auth.js';
import { getPurchases, kvIncr } from './kv.js';
import { isAdmin } from './admin.js';
import { getUser } from './users.js';
import { saldo } from './creditos.js';
import { getCatalog } from './catalog.js';

export const PRODUCTO_IVA = 'ob-005';
export const RECARGA_IVA = 'ob-005-r';

export async function accesoIva(req) {
  const s = readSession(req);
  if (!s) return { status: 401, error: 'Entrá con tu cuenta de Orbit para usar Orbit IVA.', motivo: 'sin_sesion' };
  const admin = isAdmin(s.email);
  const compras = await getPurchases(s.email);
  if (!admin && !compras.some(p => p.productId === PRODUCTO_IVA)) {
    return { status: 403, error: 'Orbit IVA es para quienes la compraron.', motivo: 'sin_compra' };
  }
  const user = await getUser(s.email).catch(() => null);
  return { email: s.email, nombre: String(user?.name || '').split(/\s+/)[0] || s.email.split('@')[0], ilimitado: admin };
}

// Estado para la herramienta: saldo y precio de la recarga (sale del catálogo, así lo cambia el panel)
export async function estadoIva(acc) {
  const CAT = await getCatalog();
  const r = CAT[RECARGA_IVA];
  return {
    ok: true, modo: 'cuenta', nombre: acc.nombre, email: acc.email, ilimitado: acc.ilimitado,
    saldo: await saldo(acc.email),
    recarga: r ? { id: RECARGA_IVA, lecturas: r.creditos, usd: r.usd, ars: r.ars } : null,
  };
}

// El asistente del conciliador no gasta lecturas, pero tiene un tope diario por cuenta para cuidar el costo.
export const TOPE_ASISTENTE_DIARIO = Number(process.env.ORBIT_IVA_TOPE_ASISTENTE) || 150;
export async function usarAsistente(email) {
  const dia = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
  return (await kvIncr(`orbit:iva:asistente:${email.toLowerCase()}:${dia}`, 1, 60 * 60 * 36)) <= TOPE_ASISTENTE_DIARIO;
}
