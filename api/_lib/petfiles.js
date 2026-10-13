/* Mimitos · fotos y estudios de cada cuenta: cupo y limpieza.
   - Fotos (mascota y sticker): data URL en KV, orbit:petimg:<id>.
   - Estudios: archivos privados en Vercel Blob (blob:mascotas/<carpeta>/...).
   Cada subida se anota en orbit:petusage:<email> con su tamaño. Lo que deja de estar en el doc
   (se borró el registro o la mascota) pasa a orbit:pettrash:<email> y se borra de verdad después de
   un rato de gracia: así "Deshacer" sigue andando y no se borra algo que todavía se está guardando. */
import { kvGet, kvSet, kvDel, kvKeys } from './kv.js';
import { isBlobRef, refPath, borrarPrueba } from './blob.js';

export const QUOTA_BYTES = 200 * 1024 * 1024;   // cupo por cuenta: 200 MB entre fotos y estudios
export const TRASH_GRACE_MS = 30 * 60 * 1000;   // 30 minutos antes de borrar algo que quedó sin usar

const usageKey = email => `orbit:petusage:${String(email).toLowerCase()}`;
const trashKey = email => `orbit:pettrash:${String(email).toLowerCase()}`;
const imgKey = id => `orbit:petimg:${id}`;
const imgRef = url => { const m = /\?img=([a-f0-9]{8,32})$/.exec(String(url || '')); return m ? 'img:' + m[1] : ''; };

/* todo lo que el doc usa hoy: fotos de mascotas, stickers y archivos de estudios */
export function refsOf(doc) {
  const out = new Set();
  for (const p of doc?.pets || []) {
    for (const u of [p.photo, ...(p.photos || []), ...(p.records || []).map(r => r.sticker)]) { const r = imgRef(u); if (r) out.add(r); }
    for (const x of p.studies || []) for (const f of x.files || []) if (isBlobRef(f.ref)) out.add(f.ref);
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
