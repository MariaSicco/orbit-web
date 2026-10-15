/* Mimitos · "Empezar de cero": herramienta de PRUEBA para volver a probar la app desde el alta.
   No es una función para clientes: la política de privacidad dice que el borrado total se pide por mail.
   Por eso anda solo fuera de producción (VERCEL_ENV !== 'production') o para cuentas administradoras
   (ADMIN_EMAILS). En producción, para cualquier otra cuenta, el botón no aparece y el endpoint da 403.

   POST /api/mascotas?reset=1 { confirm: 'BORRAR' } (con sesión y compra, como todo lo de la dueña)
   Tope: RESET_PER_DAY por cuenta y por día.

   Borra:
   - el doc de mascotas (queda vacío, con rev nueva: otro celu con la versión vieja recibe 409 y se pone al día);
   - fotos y estudios (Blob y KV), por el camino de api/_lib/petfiles.js, sin esperar la gracia;
   - las cámaras de "Me fui" (revocadas), sus eventos, lo agrupado para el resumen y el índice de salida en curso;
   - los links del cuidador y los públicos del QR (con lo que anotó el cuidador) y el registro de escaneos;
   - Gmail y Outlook (el mismo camino que "Desconectar") y los remitentes escritos, aprendidos y silenciados;
   - los tildes de "Hoy con…" y los índices y candados de los avisos programados del cron.
   Turnos, veterinarias guardadas y la zona viven en el doc: se van con él.
   NO borra: la compra ni la cuenta de Orbit, los contadores de IA, de Maps ni el cupo de Gmail (si no, se podría
   resetear el tope y gastar de más), ni la suscripción push del celu (los avisos siguen andando al volver a cargar). */
import { kvGet, kvSet, kvDel, kvKeys, kvIncrBy, kvSRem, kvSMembers } from './kv.js';
import { isAdmin } from './admin.js';
import { purgeAll } from './petfiles.js';
import { listCameras, revokeCamera, evKey, AWAY_INDEX, PEND_INDEX } from './petaway.js';
import { APPT_INDEX } from './petturnos.js';
import { petKey, careKey } from './pethoy.js';
import { getNotify, saveNotify } from './petpush.js';
import { disconnectAnyway, clearSenders } from './petmail.js';
import { gmail } from './petgmail.js';
import { outlook } from './petoutlook.js';

export const RESET_PER_DAY = 3;
export const RESET_WORD = 'BORRAR';
const lc = e => String(e || '').replace(/\s+/g, '').toLowerCase();
export const docKey = email => `orbit:pets:${lc(email)}`;
export const shareKey = t => `orbit:petshare:${t}`;
export const sitterKey = t => `orbit:petsitter:${t}`;
export const sitterLogKey = t => `orbit:petlog:${t}`;
export const scansKey = email => `orbit:petscans:${lc(email)}`;
export const resetDayKey = (email, now = Date.now()) => `orbit:petreset:${lc(email)}:${new Date(now).toISOString().slice(0, 10)}`;

/* ¿se puede usar en este entorno y con esta cuenta? */
export const resetAllowed = email => process.env.VERCEL_ENV !== 'production' || isAdmin(email);

/* claves por patrón (SCAN): un mail con caracteres de patrón no se busca, para no tocar otras cuentas */
const safeForPattern = e => !/[*?[\]\\]/.test(e);
async function delPattern(pattern) {
  const keys = await kvKeys(pattern);
  for (const k of keys) await kvDel(k);
  return keys.length;
}

/* borra todo lo de Mimitos de la cuenta. deps (para las pruebas): { req, destroyFn } */
export async function resetAccount(email, { req = { headers: {}, query: {} }, destroyFn } = {}) {
  const e = lc(email), out = {};
  const current = (await kvGet(docKey(e))) || { pets: [], rev: 0 };

  /* links públicos del QR y del cuidador (con lo que anotó), y los tildes de "Hoy con…" */
  out.links = 0;
  for (const p of current.pets || []) {
    if (p.share) { await kvDel(shareKey(p.share)); out.links++; }
    if (p.sitterToken) { await kvDel(sitterKey(p.sitterToken)); await kvDel(sitterLogKey(p.sitterToken)); out.links++; }
    if (p.id) {
      const pk = petKey(e, p.id);
      await kvDel(careKey(pk));
      await delPattern(`orbit:hoy:${pk}:*`);
    }
  }
  await kvDel(scansKey(e));

  /* fotos y estudios */
  out.files = await purgeAll(e, destroyFn ? { destroyFn } : {});

  /* "Me fui": cámaras revocadas (el celu-cámara deja de andar), sus eventos y lo pendiente de resumir */
  out.cams = 0;
  for (const c of await listCameras(e)) { await kvDel(evKey(c.camId)); if (await revokeCamera(e, c.camId)) out.cams++; }
  await kvDel(`orbit:petcam:list:${e}`);
  await kvSRem(AWAY_INDEX, e);
  for (const k of await kvSMembers(PEND_INDEX)) if (String(k).split('|')[0] === e) await kvSRem(PEND_INDEX, k);

  /* el mail: el mismo camino que "Desconectar" (revoca si se puede) y los remitentes */
  out.mail = {};
  for (const P of [gmail, outlook]) {
    try { const r = await disconnectAnyway(P, req, e); out.mail[P.id] = Boolean(r?.ok); }
    catch { await kvDel(P.key(e)); out.mail[P.id] = true; }
  }
  await clearSenders(e);
  /* "Veterinarias cerca": qué lugares vio (no es un contador; el tope diario y el gasto quedan) */
  await kvDel(`orbit:petmaps:seen:${e}`);

  /* avisos programados: índices del cron y candados de deduplicación. La suscripción push queda */
  await kvSRem(APPT_INDEX, e);
  await kvDel(`orbit:petday:${e}`);
  if (safeForPattern(e)) {
    out.sent = await delPattern(`orbit:petsent:${e}:*`);
    await delPattern(`orbit:petaway:sent:${e}:*`);
    await delPattern(`orbit:petcam:pend:${e}:*`);
    await delPattern(`orbit:petcam:ping:${e}:*`);
  }
  const n = await getNotify(e);
  if (Object.keys(n.sent || {}).length) { n.sent = {}; await saveNotify(n); }

  /* el doc, vacío y con rev nueva (se va también lo de "ya vio la introducción") */
  const doc = { pets: [], appointments: [], rev: (current.rev || 0) + 1, updatedAt: new Date().toISOString() };
  await kvSet(docKey(e), doc);
  return { doc, out };
}

/* handler: el de api/mascotas.js ya resolvió sesión y compra (o admin) */
export async function handleReset(req, res, { email, body = {}, now = Date.now(), destroyFn } = {}) {
  if (!resetAllowed(email)) return res.status(403).json({ error: 'forbidden' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  if (String(body.confirm || '').trim().toUpperCase() !== RESET_WORD) return res.status(400).json({ error: 'confirmar', word: RESET_WORD });
  const used = await kvIncrBy(resetDayKey(email, now), 1, 26 * 3600);
  if (used > RESET_PER_DAY) return res.status(429).json({ error: 'limite_diario', limit: RESET_PER_DAY });
  try {
    const { doc, out } = await resetAccount(email, { req, destroyFn });
    return res.status(200).json({ ok: true, doc, done: out, left: RESET_PER_DAY - used });
  } catch (e) {
    console.error('[mimitos] empezar de cero', e?.message);
    return res.status(500).json({ error: 'no_pudimos_borrar' });
  }
}
