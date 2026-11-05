/* Mimitos · turnos en el servidor: limpieza del doc, índice para el cron y avisos (el día anterior y 2 horas antes).
   La regla de qué aviso toca es la misma que usa la app: assets/js/mascotas-turnos.js (globalThis.MZTURNOS).

   - doc.appointments: [{ id, petId, date, time, place: { name, phone, address, placeId }, reason, logged }]
   - orbit:petapptidx: conjunto de cuentas con algún turno por venir (lo mantiene el guardado), así el cron
     horario relee solo esos docs.
   - Dedupe: cada aviso toma un candado orbit:petsent:<email>:<mascota>:appt:<id>:<tipo>:<fecha> con SET NX
     (mismo formato que el resto de los avisos), así una corrida repetida no lo manda dos veces. */
import { kvGet, kvSAdd, kvSRem, kvSMembers, kvMGet, kvSetNX } from './kv.js';
import '../../assets/js/mascotas-turnos.js';
const T = globalThis.MZTURNOS;

export const APPT_INDEX = 'orbit:petapptidx';
export const MAX_APPTS = 120;
const str = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u0009\u000b-\u001f]/g, ' ').trim().slice(0, n);
const okId = v => /^[a-z0-9]{4,24}$/i.test(v || '') ? v : '';

/* place: lo mínimo para llamar, escribir y llegar. placeId solo con el formato de Google */
export const cleanPlace = v => ({
  name: str(v?.name, 120), phone: str(v?.phone, 40), address: str(v?.address, 160),
  placeId: /^[A-Za-z0-9_-]{10,300}$/.test(v?.placeId || '') ? v.placeId : '',
});
/* compatible con docs viejos: sin appointments → [] */
export function cleanAppointments(list, pets) {
  const ids = new Set((pets || []).map(p => p.id));
  return (Array.isArray(list) ? list : []).map(a => ({
    id: okId(a?.id) || Math.random().toString(36).slice(2, 12),
    petId: str(a?.petId, 24), date: T.okDate(a?.date) ? a.date : '', time: T.okTime(a?.time) ? a.time : '',
    place: cleanPlace(a?.place), reason: str(a?.reason, 200), logged: Boolean(a?.logged),
  })).filter(a => a.date && ids.has(a.petId)).sort((x, y) => (x.date + x.time).localeCompare(y.date + y.time)).slice(-MAX_APPTS);
}

/* con turnos de ayer en adelante, la cuenta entra al índice del cron; si no, sale */
export async function syncApptIndex(email, doc, now = new Date()) {
  const y = T.addDays(T.localNow(null, now).date, -1);
  const has = (doc?.appointments || []).some(a => a.date >= y);
  await (has ? kvSAdd(APPT_INDEX, String(email).toLowerCase()) : kvSRem(APPT_INDEX, String(email).toLowerCase()));
  return has;
}

/* ---------- cron: avisos de turnos ----------
   deps: { hasMimitos, getNotify(email), push(n, payload), mail(email, items) } */
export async function runTurnos({ now = new Date(), deps }) {
  const out = { cuentas: 0, avisos: 0, push: 0, mails: 0, errores: 0 };
  const emails = await kvSMembers(APPT_INDEX);
  out.cuentas = emails.length;
  if (!emails.length) return out;
  const docs = await kvMGet(emails.map(e => `orbit:pets:${e}`));
  for (let i = 0; i < emails.length; i++) {
    const email = emails[i], doc = docs[i];
    try {
      if (!doc?.appointments?.length) { await kvSRem(APPT_INDEX, email); continue; }
      const n = await deps.getNotify(email);
      if (!n.subs.length && !n.mail) continue;
      const clock = T.localNow(n.tz, now);
      const due = T.reminders(doc.appointments, clock);
      if (!due.length) continue;
      if (!(await deps.hasMimitos(email))) continue;
      const items = [];
      for (const { a, kind } of due) {
        const pet = (doc.pets || []).find(p => p.id === a.petId);
        if (!pet) continue;
        const t = T.notice(a, pet.name, kind);
        /* candado por turno y tipo: la fecha del turno (no la de hoy) para que no se repita aunque cambie el día */
        if (await kvSetNX(`orbit:petsent:${email}:${pet.id}:${t.tag}:${a.date}`, 1, 4 * 86400)) items.push(t);
      }
      for (const t of items) out.push += await deps.push(n, { title: t.title, body: t.body, url: '/mascotas#/agenda', tag: t.tag });
      if (items.length && n.mail && await deps.mail(email, items)) out.mails++;
      out.avisos += items.length;
    } catch (e) { out.errores++; console.error('[mimitos] aviso de turno fallido', e?.message || e); }
  }
  return out;
}
