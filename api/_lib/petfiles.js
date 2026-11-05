/* Mimitos · fotos y estudios de cada cuenta: cupo y limpieza.
   - Fotos (mascota y sticker): data URL en KV, orbit:petimg:<id>.
   - Estudios: archivos privados en Vercel Blob (blob:mascotas/<carpeta>/...).
   Cada subida se anota en orbit:petusage:<email> con su tamaño. Lo que deja de estar en el doc
   (se borró el registro o la mascota) pasa a orbit:pettrash:<email> y se borra de verdad después de
   un rato de gracia: así "Deshacer" sigue andando y no se borra algo que todavía se está guardando. */
import { kvGet, kvSet, kvDel, kvKeys, kvIncrBy } from './kv.js';
import { isBlobRef, refPath, borrarPrueba, blobSize } from './blob.js';

export const QUOTA_BYTES = 200 * 1024 * 1024;   // cupo por cuenta: 200 MB entre fotos y estudios
export const PHOTO_QUOTA_BYTES = 20 * 1024 * 1024;   // de esos 200, las fotos (data URL en KV) como mucho 20 MB
export const PHOTOS_PER_DAY = 30, UPLOADS_PER_DAY = 30;
/* Pendiente (anotado): las fotos siguen en KV como data URL. Pasarlas a Blob cambia las URLs que ya
   guardó el doc (/api/mascotas?img=…), la ficha pública y el cartel: no es un cambio chico para el drop. */
export const TRASH_GRACE_MS = 30 * 60 * 1000;   // 30 minutos antes de borrar algo que quedó sin usar

const usageKey = email => `orbit:petusage:${String(email).toLowerCase()}`;
const trashKey = email => `orbit:pettrash:${String(email).toLowerCase()}`;
const imgKey = id => `orbit:petimg:${id}`;
const imgRef = url => { const m = /\?img=([a-f0-9]{8,32})$/.exec(String(url || '')); return m ? 'img:' + m[1] : ''; };

/* todo lo que el doc usa hoy: fotos de mascotas, stickers y archivos de estudios */
export function refsOf(doc) {
  const out = new Set();
  for (const p of doc?.pets || []) {
    for (const u of [p.photo, p.photoFull, ...(p.photos || []), ...(p.records || []).map(r => r.sticker)]) { const r = imgRef(u); if (r) out.add(r); }
    for (const x of p.studies || []) for (const f of x.files || []) if (isBlobRef(f.ref)) out.add(f.ref);
    /* "+ Algo pasó": fotos y videos del episodio (y la miniatura del video) */
    for (const x of p.symptoms || []) for (const m of x.media || []) for (const r of [m.ref, m.thumb]) if (isBlobRef(r)) out.add(r);
  }
  return out;
}

export async function getUsage(email) {
  const u = (await kvGet(usageKey(email))) || {};
  const items = u.items && typeof u.items === 'object' ? u.items : {};
  return { items, bytes: Object.values(items).reduce((a, b) => a + (Number(b) || 0), 0) };
}
/* ¿entra un archivo de este tamaño? */
export async function fits(email, bytes) { const u = await getUsage(email); return u.bytes + bytes <= QUOTA_BYTES; }
export async function addUsage(email, ref, bytes) {
  const u = await getUsage(email);
  u.items[ref] = Math.max(0, Math.round(Number(bytes) || 0));
  await kvSet(usageKey(email), { items: u.items });
}
export const photoRef = id => 'img:' + id;
/* ¿entra una foto? cupo propio de fotos dentro del total */
export async function photoFits(email, bytes) {
  const u = await getUsage(email);
  const photos = Object.entries(u.items).filter(([k]) => k.startsWith('img:')).reduce((a, [, b]) => a + (Number(b) || 0), 0);
  return u.bytes + bytes <= QUOTA_BYTES && photos + bytes <= PHOTO_QUOTA_BYTES;
}
/* tope diario por cuenta (fotos o subidas): suma y compara; no se devuelve */
export async function dailyCount(kind, email, limit, now = Date.now()) {
  const n = await kvIncrBy(`orbit:pet${kind}day:${String(email).toLowerCase()}:${new Date(now).toISOString().slice(0, 10)}`, 1, 60 * 60 * 26);
  return n <= limit;
}

/* ---------- subidas a Blob: el tamaño que declara el navegador se verifica al usarlas ----------
   ?upload anota el tamaño declarado y deja la ref en orbit:petpending:<email>. La primera vez que la ref
   se usa (?studyscan o al guardar el doc), se pide el tamaño REAL a Blob: queda ese en el cupo; si es
   mayor que el declarado, se borra el archivo y se rechaza. */
const pendingKey = email => `orbit:petpending:${String(email).toLowerCase()}`;
export async function addPending(email, ref, declared) {
  const p = (await kvGet(pendingKey(email))) || {};
  p[ref] = { declared: Math.round(Number(declared) || 0), at: Date.now() };
  /* la URL firmada vence a los 15 minutos: lo pendiente de más de un día ya no se puede subir */
  for (const [k, v] of Object.entries(p)) if (Date.now() - (v?.at || 0) > 864e5 && k !== ref) delete p[k];
  await kvSet(pendingKey(email), p, 3 * 86400);
}
/* → { ok: true } o { ok: false, ref, error } para el primer archivo rechazado */
export async function verifyUploads(email, refs, { size = blobSize, remove = borrarPrueba } = {}) {
  const p = (await kvGet(pendingKey(email))) || {};
  const todo = [...new Set(refs)].filter(r => p[r]);
  if (!todo.length) return { ok: true };
  let bad = null;
  for (const ref of todo) {
    let real;
    try { real = await size(refPath(ref)); } catch { continue; }   // Blob no respondió: se vuelve a mirar la próxima
    if (real == null) continue;                                     // todavía no se subió: sigue pendiente
    if (real > p[ref].declared) {
      await remove(refPath(ref)).catch(() => {});
      const u = await getUsage(email); delete u.items[ref]; await kvSet(usageKey(email), { items: u.items });
      delete p[ref];
      bad ||= { ok: false, ref, error: 'archivo_rechazado' };
      continue;
    }
    await addUsage(email, ref, real);
    delete p[ref];
  }
  await kvSet(pendingKey(email), p, 3 * 86400);
  return bad || { ok: true };
}

async function destroy(ref) {
  if (ref.startsWith('img:')) await kvDel(imgKey(ref.slice(4)));
  else if (isBlobRef(ref) && /^mascotas\/[a-f0-9]{16}\//.test(refPath(ref)) && !refPath(ref).includes('..')) await borrarPrueba(refPath(ref));
}

/* Al guardar: lo que quedó sin usar entra a la papelera; lo que vuelve a usarse sale; lo vencido se borra. */
export async function sweep(email, nextDoc, now = Date.now()) {
  const used = refsOf(nextDoc);
  const u = await getUsage(email);
  const trash = (await kvGet(trashKey(email))) || {};
  for (const ref of Object.keys(u.items)) if (!used.has(ref) && !trash[ref]) trash[ref] = now;
  for (const ref of Object.keys(trash)) if (used.has(ref)) delete trash[ref];
  let removed = 0;
  for (const [ref, since] of Object.entries(trash)) {
    if (now - since < TRASH_GRACE_MS) continue;
    try { await destroy(ref); } catch { continue; }
    delete trash[ref]; delete u.items[ref]; removed++;
  }
  await kvSet(trashKey(email), trash);
  if (removed) await kvSet(usageKey(email), { items: u.items });
  return removed;
}

/* Para el cron: vacía lo vencido de todas las cuentas aunque no vuelvan a guardar. */
export async function sweepAll(getDoc, now = Date.now()) {
  let removed = 0;
  for (const k of await kvKeys('orbit:pettrash:*')) {
    const email = k.slice('orbit:pettrash:'.length);
    try { removed += await sweep(email, await getDoc(email), now); } catch {}
  }
  return removed;
}

/* "Empezar de cero" (herramienta de prueba, api/_lib/petreset.js): todo lo que la cuenta tiene anotado
   (en uso, en la papelera o recién subido) se borra ahora, sin esperar la gracia. Lo que Blob no deja
   borrar en el momento queda en la papelera con fecha vieja y lo termina el cron (sweepAll). */
export async function purgeAll(email, { destroyFn = destroy } = {}) {
  const u = await getUsage(email);
  const trash = (await kvGet(trashKey(email))) || {};
  const pending = (await kvGet(pendingKey(email))) || {};
  const refs = new Set([...Object.keys(u.items), ...Object.keys(trash), ...Object.keys(pending)]);
  const left = {};
  let removed = 0;
  for (const ref of refs) {
    try { await destroyFn(ref); removed++; delete u.items[ref]; }
    catch { left[ref] = 1; }
  }
  if (Object.keys(left).length) await kvSet(trashKey(email), left); else await kvDel(trashKey(email));
  if (Object.keys(u.items).length) await kvSet(usageKey(email), { items: u.items }); else await kvDel(usageKey(email));
  await kvDel(pendingKey(email));
  return { removed, left: Object.keys(left).length };
}
