/* Mimitos · "Me fui" y "Cámara Mimitos" (un celu viejo como cámara).
   TODO detrás de MIMITOS_MEFUI=1 y de la lista MIMITOS_MEFUI_ALLOW (vacía = nadie salvo admin). Apagado por defecto:
   con el interruptor apagado, todas las rutas dan 404 y el cron no toca KV.

   Cámaras (lo que usan los otros módulos, firma estable):
   - verifyCameraToken(token) → { email, camId, petId } | null
       el token del dispositivo NUNCA se guarda: en KV está su sha256 (orbit:petcam:dev:<hash>).
       null si el formato no va, si se revocó, si la cuenta perdió la compra o si el interruptor no la deja.
   - ownsCamera(email, camId) → bool
       true solo si esa cámara está emparejada (y no revocada) en esa cuenta.

   KV:
   - orbit:petcam:list:<email>  = [{ camId, petId, name, hash, at, seen }]  (máx. MAX_CAMS)
   - orbit:petcam:dev:<hash>    = { email, camId, petId, at }               (sin vencimiento; se borra al revocar)
   - orbit:petcam:pair:<hash>   = { email, petId, name, exp }               (código de un solo uso, vence a los 10 min) */
import { randomBytes, createHash } from 'node:crypto';
import { kvGet, kvSet, kvDel, kvSetNX, kvIncrBy, kvSAdd, kvSRem, kvSMembers } from './kv.js';
import { isAdmin } from './admin.js';
import { readBody, isEmail } from './auth.js';
import { accesoHerramienta } from './herramienta-acceso.js';
import { hasMimitos, getNotify, pushTo, PRODUCT_ID } from './petpush.js';
import { sendEmail, emailReady } from './email.js';
/* reglas compartidas con la app (define globalThis.MZAWAYR) */
import '../../assets/js/mascotas-away-rules.js';
const AR = globalThis.MZAWAYR;

/* ---------- interruptor ---------- */
const normMail = e => String(e || '').replace(/\s+/g, '').toLowerCase();
const listOf = v => String(v || '').split(/[,;\n]+/).map(normMail).filter(Boolean);
export const mefuiOn = () => String(process.env.MIMITOS_MEFUI || '').trim() === '1';
export function mefuiAllowed(email) {
  if (!mefuiOn() || !email) return false;
  if (isAdmin(email)) return true;
  return listOf(process.env.MIMITOS_MEFUI_ALLOW).includes(normMail(email));
}

/* ---------- cámaras: claves y tokens ---------- */
export const MAX_CAMS = 4;
export const PAIR_MINUTES = 10;
const sha = s => createHash('sha256').update('orbit-petcam:' + s).digest('hex');
export const camListKey = email => `orbit:petcam:list:${normMail(email)}`;
export const camDevKey = hash => `orbit:petcam:dev:${hash}`;
export const pairKey = hash => `orbit:petcam:pair:${hash}`;
/* token del dispositivo: 32 bytes base64url (43 caracteres) */
export const camTokenOk = t => typeof t === 'string' && /^[A-Za-z0-9_-]{43}$/.test(t);
const camIdOk = v => typeof v === 'string' && /^c[a-f0-9]{11}$/.test(v);

export async function listCameras(email) {
  const l = await kvGet(camListKey(email));
  return Array.isArray(l) ? l : [];
}

/* validación cacheada por instancia (10 min, como petrtc): una cámara prendida todo el día no relee KV en cada
   consulta. Revocar limpia el caché de esta instancia; en otra instancia, el token deja de valer en ≤ 10 min
   (y la dueña ya no la ve en su lista ni puede abrir el video: ownsCamera no se cachea). */
export const CAM_CACHE_MS = 10 * 60e3;
const camCache = new Map();
export const _clearCamCache = () => camCache.clear();
export async function verifyCameraToken(token) {
  if (!camTokenOk(token)) return null;
  const hash = sha(token);
  const hit = camCache.get(hash);
  if (hit && hit.until > Date.now() && mefuiAllowed(hit.cam.email)) return { ...hit.cam };
  camCache.delete(hash);
  const cam = await verifyUncached(hash);
  if (cam) { camCache.set(hash, { cam, until: Date.now() + CAM_CACHE_MS }); if (camCache.size > 500) camCache.delete(camCache.keys().next().value); }
  return cam ? { ...cam } : null;
}
async function verifyUncached(hash) {
  const dev = await kvGet(camDevKey(hash));
  if (!dev || !dev.email || !camIdOk(dev.camId)) return null;
  if (!mefuiAllowed(dev.email)) return null;
  const cams = await listCameras(dev.email);
  if (!cams.some(c => c.camId === dev.camId && c.hash === hash)) return null;
  if (!(await hasMimitos(dev.email).catch(() => false))) return null;
  return { email: normMail(dev.email), camId: dev.camId, petId: String(dev.petId || '') };
}

export async function ownsCamera(email, camId) {
  if (!email || !camIdOk(camId)) return false;
  return (await listCameras(email)).some(c => c.camId === camId);
}

/* ---------- emparejado: código de un solo uso ---------- */
/* 8 caracteres sin letras que se confunden (sin 0/O, 1/I/L); el QR lleva el mismo código */
const ALPH = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const pairCodeOk = c => typeof c === 'string' && new RegExp(`^[${ALPH}]{8}$`).test(c);
export const cleanCode = c => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
function newCode() { const b = randomBytes(8); let s = ''; for (const x of b) s += ALPH[x % ALPH.length]; return s; }

export async function createPairing(email, { petId = '', name = '' } = {}, now = Date.now()) {
  const code = newCode();
  const exp = now + PAIR_MINUTES * 60e3;
  await kvSet(pairKey(sha('code:' + code)), { email: normMail(email), petId: String(petId).slice(0, 24), name: String(name).slice(0, 40), exp }, PAIR_MINUTES * 60);
  return { code, exp: new Date(exp).toISOString() };
}

/* canjea el código: un solo uso (candado SET NX), vencido → null. Devuelve el token (se muestra UNA vez) */
export async function redeemPairing(code, { label = '' } = {}, now = Date.now()) {
  code = cleanCode(code);
  if (!pairCodeOk(code)) return { error: 'codigo_invalido' };
  const h = sha('code:' + code);
  const p = await kvGet(pairKey(h));
  if (!p || !p.email || !(p.exp > now)) return { error: 'codigo_vencido' };
  if (!(await kvSetNX(`orbit:petcam:used:${h}`, 1, PAIR_MINUTES * 60 + 60))) return { error: 'codigo_usado' };
  await kvDel(pairKey(h));
  if (!mefuiAllowed(p.email)) return { error: 'no_disponible' };
  const cams = await listCameras(p.email);
  if (cams.length >= MAX_CAMS) return { error: 'demasiadas_camaras', max: MAX_CAMS };
  const token = randomBytes(32).toString('base64url');
  const hash = sha(token);
  const camId = 'c' + randomBytes(6).toString('hex').slice(0, 11);
  const at = new Date(now).toISOString();
  const name = String(label || p.name || 'Celu cámara').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 40) || 'Celu cámara';
  await kvSet(camDevKey(hash), { email: p.email, camId, petId: p.petId, at });
  await kvSet(camListKey(p.email), [...cams, { camId, petId: p.petId, name, hash, at, seen: at }]);
  return { token, camId, petId: p.petId, name };
}

export async function revokeCamera(email, camId) {
  const cams = await listCameras(email);
  const c = cams.find(x => x.camId === camId);
  if (!c) return false;
  camCache.delete(c.hash);
  await kvDel(camDevKey(c.hash));
  await kvSet(camListKey(email), cams.filter(x => x.camId !== camId));
  return true;
}

/* lo que ve la dueña en Cuenta → Cámaras (nunca el hash) */
export const SENS = ['baja', 'media', 'alta'];
const sensOf = c => SENS.includes(c?.sens) ? c.sens : 'media';
export const publicCam = c => ({ camId: c.camId, petId: c.petId, name: c.name, at: c.at, seen: c.seen || c.at, sens: sensOf(c) });
/* sensibilidad de la detección (la elige la persona en la cámara o en "Me fui"; "media" por defecto) */
export async function setCamSens(email, camId, sens) {
  if (!SENS.includes(sens)) return false;
  const cams = await listCameras(email), c = cams.find(x => x.camId === camId);
  if (!c) return false;
  c.sens = sens; await kvSet(camListKey(email), cams);
  return true;
}

/* ======================================================================
   Fase 1 · "Me fui"
   ====================================================================== */
const str = (v, n = 120) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
const stamp = v => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$/.test(v || '') && Number.isFinite(Date.parse(v)) ? v : '';
const sid = v => /^[a-z0-9]{4,24}$/i.test(v || '') ? v : randomBytes(6).toString('hex');

/* limpia lo de "Me fui" que viene del navegador (lo llama cleanDoc). petIds: ids de las mascotas del doc */
export function cleanAway(d, petIds = []) {
  const ids = new Set(petIds);
  const pets = v => (Array.isArray(v) ? v : []).map(x => String(x)).filter(x => ids.has(x)).slice(0, 12);
  const a = d?.away || {};
  const since = stamp(a.since);
  const on = Boolean(a.on) && Boolean(since);
  const away = {
    on, id: on ? sid(a.id) : '', since: on ? since : '', pets: on ? pets(a.pets) : [],
    check: Object.fromEntries(AR.CHECKS.map(([k]) => [k, Boolean(a.check?.[k])])),
  };
  const st = d?.awaySet || {};
  const h = Number(st.alertH);
  const mail = str(st.sitterMail, 120).toLowerCase();
  const awaySet = { alertH: AR.ALERT_HOURS.includes(h) ? h : AR.DEFAULT_ALERT, sitter: Boolean(st.sitter) && isEmail(mail), sitterMail: isEmail(mail) ? mail : '' };
  const awayLog = (Array.isArray(d?.awayLog) ? d.awayLog : []).map(x => ({ id: sid(x?.id), from: stamp(x?.from), to: stamp(x?.to), pets: pets(x?.pets) }))
    .filter(x => x.from && x.to && Date.parse(x.to) > Date.parse(x.from) && Date.parse(x.to) - Date.parse(x.from) < 7 * AR.DAY)
    .sort((x, y) => x.from.localeCompare(y.from)).slice(-AR.MAX_LOG);
  return { away, awaySet, awayLog };
}

/* índice de cuentas con una salida en curso (el cron no recorre todo) */
export const AWAY_INDEX = 'orbit:petaway:idx';
export async function syncAwayIndex(email, doc) {
  const e = normMail(email);
  const on = Boolean(doc?.away?.on) && mefuiAllowed(e);
  await (on ? kvSAdd(AWAY_INDEX, e) : kvSRem(AWAY_INDEX, e));
  return on;
}

const hhmm = (ms, tz) => new Intl.DateTimeFormat('es-AR', { timeZone: tz || 'America/Argentina/Buenos_Aires', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ms));
const SITE = () => process.env.SITE_URL || 'https://www.orbitando.com.ar';
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/* mail suelto de "Me fui" y de la cámara, con la estética de Mimitos y su propio pie */
export async function awayMail(to, { title, body, footer, cta = true }) {
  if (!emailReady()) return false;
  const url = `${SITE()}/mascotas#/mefui`;
  const html = `<!doctype html><html><body style="margin:0;background:#F7F3EE;font-family:Helvetica,Arial,sans-serif;color:#1F1A17">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#F7F3EE"><tr><td align="center" style="padding:28px 16px">
<table role="presentation" width="100%" style="max-width:480px" cellpadding="0" cellspacing="0">
<tr><td style="padding:0 0 16px;font:700 22px Helvetica,Arial,sans-serif;color:#1F1A17">mimitos</td></tr>
<tr><td bgcolor="#FFFFFF" style="background:#FFFFFF;border-radius:18px;padding:18px 20px"><b style="font-size:17px">${esc(title)}</b><br><span style="font-size:14px;line-height:1.55;color:#5E554E">${esc(body)}</span></td></tr>
${cta ? `<tr><td style="padding:16px 0 0"><a href="${url}" style="display:inline-block;background:#1F4D40;color:#FFFFFF;text-decoration:none;font-weight:700;font-size:15px;border-radius:999px;padding:13px 22px">Abrir Mimitos</a></td></tr>` : ''}
<tr><td style="padding:18px 0 0;font-size:12px;color:#5E554E;line-height:1.5">${esc(footer)} Hecho con Orbit.</td></tr>
</table></td></tr></table></body></html>`;
  await sendEmail({ to, subject: title, html, text: `${title}\n${body}${cta ? `\n\nAbrir Mimitos: ${url}` : ''}\n\n${footer}` });
  return true;
}
const OWNER_FOOTER = 'Te llega porque activaste los avisos por mail en Mimitos y usaste "Me fui". Los apagás desde Avisos en la app.';

/* textos de los avisos de "Me fui" (los usa el cron y los tests) */
export function awayTexts(doc, step, tz, now = Date.now()) {
  const pets = (doc.pets || []).filter(p => AR.covers(doc.away, p.id));
  const since = Date.parse(doc.away.since);
  const head = AR.soloText(pets.length ? pets : doc.pets || [], now - since);
  const out = {
    owner: { title: step.step === 1 ? head : `Sigue: ${head.charAt(0).toLowerCase() + head.slice(1)}`, body: `Saliste a las ${hhmm(since, tz)}. Si ya volviste, tocá "Volví" en Mimitos para cerrar la salida.` },
  };
  if (step.sitter) {
    const names = pets.map(p => p.name).join(' y ') || 'tu mascota';
    out.sitter = { title: head, body: `La familia de ${names} salió a las ${hhmm(since, tz)} y te anotó para avisarte si pasaban ${step.hours} h. Si podés, escribiles o pasá a ver cómo está.`,
      footer: `Te llega porque la familia de ${names} te anotó como contacto en Mimitos. Si no corresponde, respondé este mail y te sacamos.` };
  }
  return out;
}

/* cron (cada 10 min): avisos de "Me fui" con dedupe por (cuenta, salida, escalón) */
export async function runAway({ now = Date.now(), send = {} } = {}) {
  const out = { cuentas: 0, avisos: 0, push: 0, mails: 0, cuidador: 0, errores: 0 };
  if (!mefuiOn()) return { ...out, apagado: true };
  const push = send.push || pushTo, mail = send.mail || awayMail;
  const emails = await kvSMembers(AWAY_INDEX);
  out.cuentas = emails.length;
  for (const email of emails) {
    try {
      const doc = await kvGet(`orbit:pets:${email}`);
      if (!doc?.away?.on || !mefuiAllowed(email) || !(await hasMimitos(email))) { await kvSRem(AWAY_INDEX, email); continue; }
      const steps = AR.dueSteps(doc.away, doc.awaySet || AR.blankSet(), now);
      if (!steps.length) continue;
      const n = await getNotify(email);
      for (const st of steps) {
        if (!(await kvSetNX(`orbit:petaway:sent:${email}:${doc.away.id}:${st.step}`, 1, 3 * 86400))) continue;
        const tx = awayTexts(doc, st, n.tz, now);
        out.avisos++;
        out.push += await push(n, { title: tx.owner.title, body: tx.owner.body, url: '/mascotas#/mefui', tag: `away-${doc.away.id}` });
        if (n.mail && await mail(email, { ...tx.owner, footer: OWNER_FOOTER }).catch(() => false)) out.mails++;
        if (tx.sitter && doc.awaySet?.sitterMail && await mail(doc.awaySet.sitterMail, { ...tx.sitter, cta: false }).catch(() => false)) out.cuidador++;
      }
    } catch (e) { out.errores++; console.error('[mimitos] me fui', e?.message || e); }
  }
  return out;
}

/* contexto para "Preguntale a Mimitos": una línea por mascota con lo de los últimos 7 días */
export function awayContextLines(doc, petId, tz, now = Date.now()) {
  const fmtDay = ms => new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'America/Argentina/Buenos_Aires' }).format(new Date(ms));
  const w = AR.week(doc.awayLog || [], doc.away, petId, now, fmtDay, 7);
  if (!w.count && !AR.covers(doc.away, petId)) return null;
  const days = Object.entries(w.byDay).sort(([a], [b]) => a.localeCompare(b)).map(([d, ms]) => `${d}: ${AR.dur(ms)}`).join('; ');
  const live = AR.covers(doc.away, petId) ? ` · AHORA está sola/o desde las ${hhmm(Date.parse(doc.away.since), tz)} (hace ${AR.dur(now - Date.parse(doc.away.since))}, salida en curso)` : '';
  return `Tiempo sola/o en casa en los últimos 7 días (calculado por la app con "Me fui", ${w.count} salida(s)): ${AR.dur(w.total)} en total${w.longest ? ` · la más larga ${AR.dur(w.longest.ms)}` : ''}${days ? ` · por día: ${days}` : ''}${live}`;
}

/* ======================================================================
   Fase 2 · cámara: emparejado, dispositivo, eventos de sonido
   ====================================================================== */
export const SOUND_TYPES = ['ladrido', 'aullido', 'maullido', 'gemido', 'llanto'];
const VERB = { ladrido: 'ladró', aullido: 'aulló', maullido: 'maulló', gemido: 'gimió', llanto: 'lloró' };
export const EV_PER_HOUR = 60, EV_PER_DAY = 400, EV_KEEP = 300, EV_DAYS = 7;
export const NOTIFY_EVERY_MIN = 15;
const MERGE_GAP = 60e3;   /* dos eventos del mismo tipo a menos de 1 min se agrupan en uno */
export const evKey = camId => `orbit:petcam:ev:${camId}`;
const pendKey = (email, type) => `orbit:petcam:pend:${email}:${type}`;
const pingKey = (email, type) => `orbit:petcam:ping:${email}:${type}`;
export const PEND_INDEX = 'orbit:petcam:pendidx';
const ipHash = req => {
  const h = req.headers || {};
  const ip = String(h['x-vercel-forwarded-for'] || h['x-real-ip'] || h['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
  return createHash('sha256').update('orbit-cam:' + (process.env.SESSION_SECRET || 'mimitos') + ':' + ip).digest('hex').slice(0, 20);
};
const bearer = req => { const m = /^Bearer\s+([A-Za-z0-9_-]{43})$/.exec(String(req.headers?.authorization || '')); return m ? m[1] : ''; };

/* "Feliza ladró 4 minutos a las 15:20". Gemido y llanto son los menos confiables del detector:
   van como "posible gemido" / "posible llanto" */
export const UNSURE = ['gemido', 'llanto'];
export function eventText(ev, tz, pet) {
  const mins = Math.round(ev.dur / 60);
  const len = ev.dur < 60 ? `${Math.max(1, Math.round(ev.dur))} segundos` : `${mins} ${mins === 1 ? 'minuto' : 'minutos'}`;
  const at = hhmm(Date.parse(ev.start), tz);
  if (UNSURE.includes(ev.type)) return `${pet ? pet + ': p' : 'P'}osible ${ev.type} de ${len} a las ${at}`;
  const v = VERB[ev.type] || 'hizo ruido';
  return `${pet ? pet + ' ' : ''}${pet ? v : v.charAt(0).toUpperCase() + v.slice(1)} ${len} a las ${at}`;
}

export function cleanEvent(b, now = Date.now()) {
  const type = SOUND_TYPES.includes(b?.type) ? b.type : '';
  const start = stamp(b?.start);
  const dur = Number(b?.dur), conf = Number(b?.conf);
  if (!type || !start || !Number.isFinite(dur) || dur <= 0 || dur > 3600 || !Number.isFinite(conf) || conf < 0 || conf > 1) return null;
  const t0 = Date.parse(start);
  /* nada del futuro ni de hace más de un día */
  if (t0 > now + 5 * 60e3 || t0 < now - 86400e3) return null;
  return { type, start: new Date(t0).toISOString(), dur: Math.round(dur), conf: Math.round(conf * 100) / 100 };
}

async function addEvent(cam, ev, now) {
  const list = ((await kvGet(evKey(cam.camId))) || []).filter(x => Date.parse(x.start) > now - EV_DAYS * 86400e3);
  const last = [...list].reverse().find(x => x.type === ev.type);
  if (last && Date.parse(ev.start) - (Date.parse(last.start) + last.dur * 1000) <= MERGE_GAP && Date.parse(ev.start) >= Date.parse(last.start)) {
    const end = Math.max(Date.parse(last.start) + last.dur * 1000, Date.parse(ev.start) + ev.dur * 1000);
    last.dur = Math.round((end - Date.parse(last.start)) / 1000); last.conf = Math.max(last.conf, ev.conf); last.n = (last.n || 1) + 1;
    await kvSet(evKey(cam.camId), list.slice(-EV_KEEP), EV_DAYS * 86400);
    return { ev: last, merged: true };
  }
  const e = { id: randomBytes(5).toString('hex'), camId: cam.camId, petId: cam.petId, ...ev, n: 1, at: new Date(now).toISOString() };
  list.push(e);
  await kvSet(evKey(cam.camId), list.slice(-EV_KEEP), EV_DAYS * 86400);
  return { ev: e, merged: false };
}

/* avisos agrupados: el primero de cada tipo sale al toque; los que siguen dentro de 15 min se juntan y los manda
   el cron (o el próximo evento) como un resumen. Solo con "Me fui" activo: estando en casa, solo se registra. */
async function notifyEvent(cam, ev, doc, deps, now) {
  const email = cam.email;
  const pet = (doc?.pets || []).find(p => p.id === cam.petId)?.name || '';
  if (!(await kvSetNX(pingKey(email, ev.type), now, NOTIFY_EVERY_MIN * 60))) {
    const pend = (await kvGet(pendKey(email, ev.type))) || [];
    pend.push({ start: ev.start, dur: ev.dur, pet });
    await kvSet(pendKey(email, ev.type), pend.slice(-100), 2 * 86400);
    await kvSAdd(PEND_INDEX, `${email}|${ev.type}`);
    return 'agrupado';
  }
  const n = await getNotify(email);
  const title = eventText(ev, n.tz, pet);
  const body = 'Lo detectó la Cámara Mimitos (el audio no sale del celu). Si sigue, te mandamos un resumen cada 15 minutos.';
  await (deps.push || pushTo)(n, { title, body, url: '/mascotas#/mefui', tag: `cam-${ev.type}` });
  if (n.mail) await (deps.mail || awayMail)(email, { title, body, footer: 'Te llega porque activaste los avisos por mail en Mimitos y la Cámara Mimitos. Los apagás desde Avisos en la app.' }).catch(() => false);
  return 'avisado';
}

/* resumen de lo agrupado: lo llama el cron cada 10 min. Sale cuando ya pasaron 15 min del último aviso de ese tipo */
export async function flushPending({ now = Date.now(), send = {} } = {}) {
  const out = { resumenes: 0 };
  if (!mefuiOn()) return out;
  for (const k of await kvSMembers(PEND_INDEX)) {
    const [email, type] = k.split('|');
    const pend = (await kvGet(pendKey(email, type))) || [];
    if (!pend.length) { await kvSRem(PEND_INDEX, k); continue; }
    if (!(await kvSetNX(pingKey(email, type), now, NOTIFY_EVERY_MIN * 60))) continue;
    await kvDel(pendKey(email, type)); await kvSRem(PEND_INDEX, k);
    const doc = await kvGet(`orbit:pets:${email}`);
    if (!doc?.away?.on || !mefuiAllowed(email)) continue;
    const n = await getNotify(email);
    const total = pend.reduce((a, x) => a + x.dur, 0), first = Math.min(...pend.map(x => Date.parse(x.start)));
    const pet = pend[0].pet;
    const veces = `${pend.length} ${pend.length === 1 ? 'vez' : 'veces'} más desde las ${hhmm(first, n.tz)}`;
    const title = UNSURE.includes(type) ? `${pet || 'Tu mascota'}: posible ${type}, ${veces}` : `${pet || 'Tu mascota'} ${VERB[type]} ${veces}`;
    const body = `En total, ${AR.dur(total * 1000)}. Mirá la línea de tiempo en Mimitos.`;
    await (send.push || pushTo)(n, { title, body, url: '/mascotas#/mefui', tag: `cam-${type}` });
    if (n.mail) await (send.mail || awayMail)(email, { title, body, footer: 'Te llega porque activaste los avisos por mail en Mimitos y la Cámara Mimitos. Los apagás desde Avisos en la app.' }).catch(() => false);
    out.resumenes++;
  }
  return out;
}

/* eventos de todas las cámaras de la cuenta desde `since` (para la línea de tiempo y el resumen al volver) */
export async function eventsOf(email, since = 0) {
  const cams = await listCameras(email);
  const lists = await Promise.all(cams.map(c => kvGet(evKey(c.camId))));
  return lists.flatMap(l => l || []).filter(x => Date.parse(x.start) + x.dur * 1000 >= since).sort((a, b) => a.start.localeCompare(b.start))
    .map(x => ({ id: x.id, camId: x.camId, petId: x.petId, type: x.type, start: x.start, dur: x.dur, conf: x.conf, n: x.n || 1 }));
}

/* ---------- rutas ?cam=… (una sola línea en api/mascotas.js) ----------
   Sin sesión (celu cámara):
   POST ?cam=redeem {code, label}            → { token, camId, pet }   (tope por IP: 10 por hora)
   GET  ?cam=me      (Bearer token)          → { camId, name, pet, away }
   POST ?cam=ping    (Bearer token)          → { ok, sens }            (cada 5 min; 1 lectura + 1 escritura de "visto")
   POST ?cam=unpair  (Bearer token)          → { ok }            (el celu cámara se desvincula solo)
   POST ?cam=csens   (Bearer token) {sens}   → { ok }            (sensibilidad elegida en la cámara)
   POST ?cam=event   (Bearer token) {type, start, dur, conf} → { ok, merged, notify }  (solo el evento: el audio nunca viaja)
   Dueña o dueño (sesión + compra, y la cuenta habilitada):
   POST ?cam=pair {petId, name}              → { code, exp }
   GET  ?cam=list                            → { cams: [...] }
   POST ?cam=revoke {camId}                  → { ok }
   POST ?cam=sens {camId, sens}              → { ok }   (baja | media | alta; la cámara la toma en el próximo ping)
   GET  ?cam=events&since=ISO                → { events }
   Interruptor apagado o cuenta fuera de la lista → 404 en todas. */
/* la cámara avisa "sigo acá" cada 5 min (PING_MS en mascotas-camara.js): activa = vista en los últimos 11 min */
const CAM_ONLINE_MS = 11 * 60e3;
export async function handleCam(req, res, deps = {}) {
  res.setHeader('Cache-Control', 'no-store');
  const notFound = () => res.status(404).json({ error: 'not_found' });
  if (!mefuiOn()) return notFound();
  const act = String(req.query?.cam || '');
  const now = deps.now ? deps.now() : Date.now();

  if (act === 'redeem') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
    const n = await kvIncrBy(`orbit:petcam:rl:redeem:${ipHash(req)}:${new Date(now).toISOString().slice(0, 13)}`, 1, 3600);
    if (n > 10) return res.status(429).json({ error: 'limite' });
    const b = await readBody(req);
    const r = await redeemPairing(b.code, { label: str(b.label, 40) }, now);
    if (r.error) return res.status(r.error === 'demasiadas_camaras' ? 409 : r.error === 'no_disponible' ? 404 : 400).json(r);
    const doc = await kvGet(`orbit:pets:${(await verifyCameraToken(r.token))?.email || ''}`);
    return res.status(200).json({ token: r.token, camId: r.camId, name: r.name, pet: (doc?.pets || []).find(p => p.id === r.petId)?.name || '' });
  }

  if (['me', 'ping', 'event', 'unpair', 'csens'].includes(act)) {
    const cam = await verifyCameraToken(bearer(req));
    if (!cam) return res.status(401).json({ error: 'camara_no_valida' });
    /* la lista se lee siempre: si la revocaron en otra instancia, corta acá aunque la validación esté en caché */
    const cams = await listCameras(cam.email), me = cams.find(c => c.camId === cam.camId);
    if (!me) { camCache.clear(); return res.status(401).json({ error: 'camara_no_valida' }); }
    /* el ping (cada 5 min) no lee el doc: 1 lectura + 1 escritura */
    const doc = act === 'ping' || act === 'csens' || act === 'unpair' ? null : await kvGet(`orbit:pets:${cam.email}`);
    const away = Boolean(doc?.away?.on);
    const pet = (doc?.pets || []).find(p => p.id === cam.petId)?.name || '';
    const touch = async () => { if (me && now - Date.parse(me.seen || 0) > 4 * 60e3) { me.seen = new Date(now).toISOString(); await kvSet(camListKey(cam.email), cams); } };
    if (act === 'me') { await touch(); return res.status(200).json({ camId: cam.camId, name: me?.name || '', pet, away, sens: sensOf(me) }); }
    if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
    if (act === 'ping') { await touch(); return res.status(200).json({ ok: true, sens: sensOf(me) }); }
    if (act === 'csens') { const b = await readBody(req); return (await setCamSens(cam.email, cam.camId, b.sens)) ? res.status(200).json({ ok: true, sens: b.sens }) : res.status(400).json({ error: 'invalid' }); }
    /* "Desvincular este celu" desde la cámara misma */
    if (act === 'unpair') { await revokeCamera(cam.email, cam.camId); return res.status(200).json({ ok: true }); }
    /* evento: tope por cámara (hora y día) */
    const hr = new Date(now).toISOString().slice(0, 13);
    const nh = await kvIncrBy(`orbit:petcam:rl:ev:${cam.camId}:${hr}`, 1, 3600);
    const nd = await kvIncrBy(`orbit:petcam:rl:evd:${cam.camId}:${hr.slice(0, 10)}`, 1, 86400);
    if (nh > EV_PER_HOUR || nd > EV_PER_DAY) return res.status(429).json({ error: 'limite' });
    const ev = cleanEvent(await readBody(req), now);
    if (!ev) return res.status(400).json({ error: 'invalid' });
    await touch();
    const { ev: saved, merged } = await addEvent(cam, ev, now);
    /* un evento que se agrupó con el anterior no avisa de nuevo */
    const notify = away && !merged ? await notifyEvent(cam, ev, doc, deps, now) : merged ? 'agrupado' : 'en_casa';
    return res.status(200).json({ ok: true, id: saved.id, merged, notify, away });
  }

  /* dueña o dueño */
  const acc = await accesoHerramienta(req, PRODUCT_ID);
  if (!acc.ok) return acc.motivo === 'sin_sesion' ? res.status(401).json({ error: 'unauthorized' }) : notFound();
  const email = normMail(acc.email);
  if (!mefuiAllowed(email)) return notFound();
  if (act === 'list' && req.method === 'GET') {
    const cams = await listCameras(email);
    return res.status(200).json({ cams: cams.map(c => ({ ...publicCam(c), online: now - Date.parse(c.seen || 0) < CAM_ONLINE_MS })), max: MAX_CAMS });
  }
  if (act === 'events' && req.method === 'GET') {
    const since = Date.parse(String(req.query?.since || '')) || now - 86400e3;
    return res.status(200).json({ events: await eventsOf(email, Math.max(since, now - EV_DAYS * 86400e3)) });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  const b = await readBody(req);
  if (act === 'pair') {
    const doc = await kvGet(`orbit:pets:${email}`);
    const petId = (doc?.pets || []).some(p => p.id === b.petId) ? b.petId : (doc?.pets?.[0]?.id || '');
    if ((await listCameras(email)).length >= MAX_CAMS) return res.status(409).json({ error: 'demasiadas_camaras', max: MAX_CAMS });
    /* tope: 20 códigos por hora por cuenta */
    if ((await kvIncrBy(`orbit:petcam:rl:pair:${email}:${new Date(now).toISOString().slice(0, 13)}`, 1, 3600)) > 20) return res.status(429).json({ error: 'limite' });
    return res.status(200).json(await createPairing(email, { petId, name: str(b.name, 40) }, now));
  }
  if (act === 'sens') {
    return (await setCamSens(email, String(b.camId || ''), b.sens)) ? res.status(200).json({ ok: true }) : res.status(SENS.includes(b.sens) ? 404 : 400).json({ error: 'invalid' });
  }
  if (act === 'revoke') {
    const ok = await revokeCamera(email, String(b.camId || ''));
    return ok ? res.status(200).json({ ok: true }) : notFound();
  }
  return notFound();
}
