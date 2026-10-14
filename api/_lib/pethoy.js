/* Mimitos · "Hoy con {mascota}" en el servidor: lista del día, tildes y la alerta de dosis repetida.

   Cada tilde se toma con SET NX en orbit:hoy:<mascota>:<día>:<ítem>: si dos personas marcan el mismo
   ítem a la vez, gana una sola y la otra recibe 409 { error: 'ya_marcado', by, at, who }. Antes del NX se
   mira además el registro (app, cuidador y "Ya se la di"): una toma de remedio ya anotada dentro de su
   ventana, o una comida anotada hace menos de 3 horas, también da 409. Con { force: true } (la persona
   confirmó) se anota igual como repetida.

   Cada tilde deja una entrada en orbit:petcare:<mascota> (lista, se une al registro al leer, como el del
   cuidador): por eso los remedios marcados cuentan como dados en la app y en medState, sin duplicar.
   "Deshacer" anda 60 segundos y solo para quien marcó (orbit:hoyundo:<id>).
   <mascota> es un hash de la cuenta y el id de la mascota: la clave no expone el mail. */
import { createHash, randomBytes } from 'node:crypto';
import { kvGet, kvSet, kvDel, kvSetNX, kvMGet, kvRPush, kvLRange, kvLRem } from './kv.js';
import '../../assets/js/mascotas-hoy-rules.js';

export const H = globalThis.MZHOY;
export const UNDO_SECONDS = 60;
const MARK_TTL = 3 * 86400, CARE_TTL = 90 * 86400, MAX_CARE = 300;
export const petKey = (email, petId) => createHash('sha256').update('orbit-hoy:' + String(email).toLowerCase() + ':' + petId).digest('hex').slice(0, 16);
export const markKey = (pk, ymd, item) => `orbit:hoy:${pk}:${ymd}:${item}`;
export const careKey = pk => `orbit:petcare:${pk}`;
const undoKey = id => `orbit:hoyundo:${id}`;
const LOG_KIND = { comida: 'comida', paseo: 'paseo', med: 'med', otro: 'otro' };

/* registro de "Hoy" de una mascota (para unir al log al leer) */
export async function careLog(email, petId) {
  const raw = await kvLRange(careKey(petKey(email, petId))).catch(() => []);
  return raw.map(x => { try { return JSON.parse(x); } catch { return null; } }).filter(l => l && l.id && l.at);
}

/* el día, con quién hizo cada cosa. viewer: 'owner' (ve "Vos") o 'sitter' (ve el nombre de la familia) */
export async function dayView(pet, email, ymd, log, viewer = 'owner') {
  const pk = petKey(email, pet.id), items = H.plan(pet, ymd);
  const vals = items.length ? await kvMGet(items.map(i => markKey(pk, ymd, i.key))) : [];
  const family = pet.contact?.name || 'La familia';
  const name = d => d.who === 'owner' ? (viewer === 'owner' ? 'Vos' : family) : d.by;
  return {
    ymd, today: H.todayAR(),
    items: items.map((i, n) => {
      let d = vals[n] ? { at: vals[n].at, by: vals[n].by, who: vals[n].who } : null;
      if (!d && i.kind === 'med') { const l = H.medGiven(i, log); if (l) d = { at: l.at, by: l.by || 'Vos', who: l.by === 'Vos' ? 'owner' : 'sitter' }; }
      return { key: i.key, kind: i.kind, time: i.time, label: i.label, qty: i.qty, done: d ? { at: d.at, by: name(d) } : null };
    }),
  };
}

/* marcar un ítem. actor: 'owner' o 't:<token>' (solo él puede deshacer) */
export async function mark({ pet, email, ymd, item, by, who, actor, force, log, now = Date.now() }) {
  const today = H.todayAR(now);
  if (![H.addDays(today, -1), today, H.addDays(today, 1)].includes(ymd)) return { status: 400, error: 'dia_invalido' };
  const it = H.find(pet, ymd, String(item || ''));
  if (!it) return { status: 400, error: 'item_invalido' };
  const pk = petKey(email, pet.id), key = markKey(pk, ymd, it.key);
  const family = pet.contact?.name || 'la familia';
  const shown = d => d.who === 'owner' ? (who === 'owner' ? 'Vos' : family) : d.by;
  if (!force) {
    const prev = await kvGet(key);
    if (prev) return { status: 409, error: 'ya_marcado', kind: it.kind, by: shown(prev), at: prev.at };
    const dup = it.kind === 'med' ? H.medGiven(it, log) : it.kind === 'comida' ? H.recentMeal(log, now) : null;
    if (dup) return { status: 409, error: 'ya_marcado', kind: it.kind, by: dup.by === 'Vos' ? shown({ who: 'owner' }) : dup.by || family, at: dup.at };
  }
  const id = randomBytes(6).toString('hex'), at = new Date(now).toISOString();
  const entry = { id, at, kind: LOG_KIND[it.kind], medId: it.medId || '', by: who === 'owner' ? 'Vos' : by, note: '', item: it.key, ymd, ...(force ? { repeat: true } : {}) };
  const m = { id, at, by: entry.by, who };
  let took = false;
  if (!force) {
    took = await kvSetNX(key, m, MARK_TTL);
    if (!took) { const prev = await kvGet(key); return { status: 409, error: 'ya_marcado', kind: it.kind, by: prev ? shown(prev) : family, at: prev?.at || at }; }
  }
  const s = JSON.stringify(entry);
  await kvRPush(careKey(pk), s, MAX_CARE, CARE_TTL);
  await kvSet(undoKey(id), { pk, key: took ? key : '', entry: s, actor, at }, UNDO_SECONDS + 30);
  return { status: 200, entry, undo: id };
}

export async function undo({ pet, email, id, actor, now = Date.now() }) {
  const u = /^[a-f0-9]{12}$/.test(String(id || '')) ? await kvGet(undoKey(id)) : null;
  if (!u || u.actor !== actor || u.pk !== petKey(email, pet.id)) return { status: 404, error: 'no_encontrado' };
  if (now - Date.parse(u.at) > UNDO_SECONDS * 1000) return { status: 410, error: 'tarde' };
  if (u.key) { const cur = await kvGet(u.key); if (cur?.id === id) await kvDel(u.key); }
  await kvLRem(careKey(u.pk), u.entry);
  await kvDel(undoKey(id));
  return { status: 200, id };
}
