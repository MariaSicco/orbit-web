/* Vencimientos de la Casa · hasta cuándo incluye lectura automática (decisión de Majo, 7/11).
   Vence a los 12 meses de la compra de ob-021, como en Mi Mes; la app y los datos siguen.
   Quien entró invitado usa la fecha de compra de quien creó la casa.
   Las cuentas admin no vencen. Sin fecha de compra, corre desde el primer uso (guardado en KV).
   Si la base no responde, no se frena la lectura. */
import { kvGet, kvSet } from './kv.js';
import { isAdmin } from './admin.js';
import { compraDe, accesoExtraKey } from './herramienta-acceso.js';
import { MESES_IA, TTL_DESDE_S, sumarMesesISO } from './mi-mes-ia.js';

export { mensajeVencida } from './mi-mes-ia.js';
const PRODUCTO = 'ob-021';
const SIN_VENCIMIENTO = { hasta: null, vencida: false };

export async function vigenciaLectura(acc, now = Date.now()) {
  if (acc?.admin) return SIN_VENCIMIENTO;
  try {
    let compra = acc?.compra || null;
    if (!compra && acc?.invitado) {
      const extra = await kvGet(accesoExtraKey(PRODUCTO, acc.email));
      const casa = extra?.casa ? await kvGet(`orbit:vencimientos:casa:${extra.casa}`) : null;
      if (casa?.dueno && isAdmin(casa.dueno)) return SIN_VENCIMIENTO;
      if (casa?.dueno) compra = await compraDe(casa.dueno, PRODUCTO);
    }
    let desde = Date.parse(compra?.date || '');
    if (!Number.isFinite(desde)) {
      const clave = `orbit:vencimientos:ia:desde:${String(acc?.email || '').toLowerCase()}`;
      const guardado = Number(await kvGet(clave));
      if (Number.isFinite(guardado) && guardado > 0) desde = guardado;
      else { desde = now; await kvSet(clave, now, TTL_DESDE_S).catch(() => {}); }
    }
    const hastaMs = sumarMesesISO(desde, MESES_IA);
    return { hasta: new Date(hastaMs).toISOString().slice(0, 10), vencida: now >= hastaMs };
  } catch { return SIN_VENCIMIENTO; }
}
