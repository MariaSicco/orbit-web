/* Mimitos: corre cada hora (vercel.json → crons, "0 * * * *").
   A cada cuenta con avisos le manda lo que toca hoy, una sola vez y a la mañana de la persona:
   en la primera corrida en que en su zona horaria sean las 9 o más y todavía no se le mandó hoy.
   Vacunas y pipetas (3 días antes y el día), alimento (5 días antes y el día) y el chequeo del mes.
   Solo avisa a quien tiene la compra de Mimitos. Los avisos del QR no pasan por acá.

   Para que una corrida sin nada que mandar salga rápido:
   - solo mira las cuentas del índice orbit:petidx (las que tienen push o mail activos);
   - orbit:petday:<email> = fecha local ya resuelta (vence sola), así no relee el doc cada hora;
   - cada aviso toma antes un candado orbit:petsent:<email>:<mascota>:<aviso>:<fecha local> con SET NX,
     así una corrida repetida o un reintento no lo manda dos veces. */
import { timingSafeEqual } from 'node:crypto';
import { kvKeys, kvMGet, kvGet, kvSet, kvSetNX, kvSAdd, kvSRem, kvSMembers } from '../_lib/kv.js';
import { sweepAll } from '../_lib/petfiles.js';
import { dueToday, pushTo, mailDigest, hasMimitos, notifyKey, shapeNotify, notifyActive, localClock, INDEX_KEY } from '../_lib/petpush.js';

export const SEND_HOUR = 9;
const DAY_TTL = 2 * 86400;      // la marca del día alcanza con que dure hasta pasado mañana
const SENT_TTL = 4 * 86400;     // el candado de cada aviso, algunos días
const READY_KEY = 'orbit:petidx:ready';
export const dayKey = email => `orbit:petday:${email}`;
export const sentKey = (email, i, date) => `orbit:petsent:${email}:${i.petId || 'todas'}:${i.tag}:${date}`;

/* la primera vez arma el índice con las cuentas que ya tenían avisos (antes del cron horario) */
async function ensureIndex() {
  if (await kvGet(READY_KEY)) return;
  const keys = await kvKeys('orbit:petnotify:*');
  const vals = await kvMGet(keys);
  for (const v of vals) if (v && v.email && notifyActive(v)) await kvSAdd(INDEX_KEY, String(v.email).toLowerCase());
  await kvSet(READY_KEY, { at: new Date().toISOString() });
}

/* now: instante de la corrida. hoy: fecha forzada (solo pruebas fuera de producción; ignora la hora).
   send: para las pruebas, reemplaza el push y el mail. */
export async function runAvisos({ now = new Date(), hoy = '', send = {} } = {}) {
  const push = send.push || pushTo, mail = send.mail || mailDigest;
  const out = { cuentas: 0, enHora: 0, avisos: 0, push: 0, mails: 0, sinCompra: 0, errores: 0 };
  await ensureIndex();
  const emails = await kvSMembers(INDEX_KEY);
  out.cuentas = emails.length;
  if (!emails.length) return out;

  /* a quién le toca ahora: hora local ≥ 9 (o fecha forzada) */
  const raws = await kvMGet(emails.map(notifyKey));
  const cands = [];
  emails.forEach((email, k) => {
    const raw = raws[k];
    if (!notifyActive(raw)) { kvSRem(INDEX_KEY, email).catch(() => {}); return; }
    const n = shapeNotify(email, raw);
    const clock = hoy ? { date: hoy, hour: 24 } : localClock(n.tz, now);
    if (clock.hour >= SEND_HOUR) cands.push({ n, date: clock.date });
  });
  if (!cands.length) return out;
  /* los que ya se resolvieron hoy (en su fecha local) no se vuelven a mirar */
  const done = await kvMGet(cands.map(c => dayKey(c.n.email)));
  const todo = cands.filter((c, k) => done[k] !== c.date);
  out.enHora = todo.length;

  for (const { n, date } of todo) {
    try {
      if (!(await hasMimitos(n.email))) { out.sinCompra++; await kvSet(dayKey(n.email), date, DAY_TTL); continue; }
      const doc = await kvGet(`orbit:pets:${n.email}`);
      const due = dueToday(doc, date).filter(i => !n.off[i.kind] && !n.sent[i.tag]);   // sent: lo que ya mandó el cron diario anterior
      const items = [];
      for (const i of due) if (await kvSetNX(sentKey(n.email, i, date), 1, SENT_TTL)) items.push(i);
      for (const i of items) out.push += await push(n, { title: i.title, body: i.body, url: i.url || '/mascotas', tag: i.tag, ...(i.action ? { actions: [{ action: 'renew', title: i.action }] } : {}) });
      if (items.length && n.mail && await mail(n.email, items)) out.mails++;
      out.avisos += items.length;
      await kvSet(dayKey(n.email), date, DAY_TTL);
    } catch (e) { out.errores++; console.error('[mimitos] aviso fallido', e?.message || e); }
  }
  return out;
}

export default async function handler(req, res) {
  /* Siempre con Authorization: Bearer ${CRON_SECRET} (Vercel lo manda solo si la variable existe).
     Sin la variable, falla cerrado: no alcanza con el User-Agent, que se falsifica. */
  const secret = process.env.CRON_SECRET;
  if (!secret) { console.error('[mimitos] cron bloqueado: falta CRON_SECRET'); return res.status(503).json({ error: 'cron_secret_no_configurado' }); }
  const got = Buffer.from(String(req.headers.authorization || '')), want = Buffer.from(`Bearer ${secret}`);
  if (got.length !== want.length || !timingSafeEqual(got, want)) return res.status(401).json({ error: 'unauthorized' });

  /* ?hoy=AAAA-MM-DD solo para probar fuera de producción (y siempre con el secreto, chequeado arriba) */
  const q = String(req.query?.hoy || '');
  const hoy = /^\d{4}-\d{2}-\d{2}$/.test(q) && process.env.VERCEL_ENV !== 'production' ? q : '';
  let out;
  try { out = await runAvisos({ hoy }); }
  catch (e) { console.error('[mimitos] cron falló', e?.message || e); return res.status(500).json({ error: 'cron_fallo' }); }
  /* fotos y estudios borrados que quedaron en la papelera: una vez por día alcanza */
  if (await kvSetNX(`orbit:petsweep:${localClock(null).date}`, 1, DAY_TTL).catch(() => false)) {
    try { out.archivosBorrados = await sweepAll(email => kvGet(`orbit:pets:${email}`)); } catch { out.errores++; }
  }
  res.status(200).json(out);
}
