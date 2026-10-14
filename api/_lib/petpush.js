/* Avisos de Mimitos: push en el celu (web push, gratis) y mail por Brevo.
   - Las llaves VAPID salen de las variables VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY;
     si no están, se generan una vez y quedan guardadas en KV (no hay que configurar nada).
   - Por cuenta: orbit:petnotify:<email> = { subs: [...], mail, off: {vac,pip,food,check,qr}, tz, sent: {tag: fecha} }
     (tz: zona horaria IANA del navegador; sent: solo lectura, lo usaba el cron diario anterior)
   - orbit:petidx: conjunto de emails con avisos activos (push o mail), para que el cron horario no recorra todo. */
import webpush from 'web-push';
import { kvGet, kvSet, kvSAdd, kvSRem } from './kv.js';
import { compraDe } from './herramienta-acceso.js';
import { isAdmin } from './admin.js';
/* reglas compartidas con la app (define globalThis.MZRULES): qué fecha está vigente y cuál es sugerida */
import '../../assets/js/mascotas-rules.js';
const R = globalThis.MZRULES;
import { sendEmail, emailReady } from './email.js';

/* Mimitos es paga: sin compra del producto no hay app, avisos ni links públicos.
   Administración entra sin compra. Una compra marcada como reintegrada no cuenta. */
export const PRODUCT_ID = process.env.MASCOTAS_PRODUCT_ID || 'ob-018';
/* La regla de "tiene la compra" es la de la base de herramientas (api/_lib/herramienta-acceso.js) */
export async function mimitosPurchase(email) {
  if (!email) return null;
  const p = await compraDe(email, PRODUCT_ID);
  if (p) return { date: p.date || null };
  return isAdmin(email) ? { date: null, admin: true } : null;
}
export const hasMimitos = async email => Boolean(await mimitosPurchase(email));

export const notifyKey = email => `orbit:petnotify:${String(email).toLowerCase()}`;
export const KINDS = ['vac', 'pip', 'food', 'check', 'qr'];
const SITE = () => process.env.SITE_URL || 'https://www.orbitando.com.ar';

let vapid = null;
/* En producción las llaves salen SOLO de VAPID_PUBLIC_KEY y VAPID_PRIVATE_KEY: si faltan, el push falla
   cerrado (nunca se generan ni se guardan en KV, porque cambiarlas después rompe todas las suscripciones).
   En preview y local se pueden autogenerar para probar. */
export const isProd = () => process.env.VERCEL_ENV === 'production';
export async function getVapid() {
  if (vapid) return vapid;
  const envKeys = process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY ? { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY } : null;
  if (!envKeys && isProd()) {
    console.error('[mimitos] push desactivado: faltan VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY en producción');
    throw Object.assign(new Error('vapid_no_configurado'), { status: 503 });
  }
  let v = envKeys || await kvGet('orbit:vapid');
  if (!v) { v = webpush.generateVAPIDKeys(); await kvSet('orbit:vapid', v); }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:hola@orbitando.com.ar', v.publicKey, v.privateKey);
  return (vapid = v);
}

export const shapeNotify = (email, n = {}) => ({ email: String(email).toLowerCase(), subs: Array.isArray(n.subs) ? n.subs : [], mail: Boolean(n.mail), off: n.off || {}, tz: cleanTz(n.tz), sent: n.sent || {} });
export async function getNotify(email) { return shapeNotify(email, (await kvGet(notifyKey(email))) || {}); }
/* guarda y mantiene el índice de cuentas con avisos activos */
export const INDEX_KEY = 'orbit:petidx';
export const notifyActive = n => Boolean(n && ((Array.isArray(n.subs) && n.subs.length) || n.mail));
export async function saveNotify(n) {
  await kvSet(notifyKey(n.email), n);
  await (notifyActive(n) ? kvSAdd(INDEX_KEY, n.email) : kvSRem(INDEX_KEY, n.email));
}

/* Solo endpoints de servicios de push reales (https, puerto 443): así el servidor (y el cron) nunca le
   hace un POST a una URL cualquiera. Chrome/Edge/Android: FCM; Firefox: Mozilla; Safari/iOS: Apple;
   Edge viejo/Windows: WNS. */
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /^web\.push\.apple\.com$/, /^([a-z0-9-]+\.)+push\.apple\.com$/, /^([a-z0-9-]+\.)+notify\.windows\.com$/];
export function pushEndpointOk(endpoint) {
  if (typeof endpoint !== 'string' || endpoint.length >= 1000) return false;
  let u; try { u = new URL(endpoint); } catch { return false; }
  if (u.protocol !== 'https:' || (u.port && u.port !== '443') || u.username || u.password) return false;
  return PUSH_HOSTS.some(re => re.test(u.hostname.toLowerCase()));
}
export function cleanSub(s) {
  const ok = s && pushEndpointOk(s.endpoint) && s.keys && typeof s.keys.p256dh === 'string' && typeof s.keys.auth === 'string';
  return ok ? { endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh.slice(0, 200), auth: s.keys.auth.slice(0, 100) }, at: new Date().toISOString() } : null;
}

/* manda a todos los celus de la cuenta; borra los que ya no existen */
export async function pushTo(n, payload) {
  if (!n.subs.length) return 0;
  try { await getVapid(); } catch { return 0; }
  let sent = 0; const alive = [];
  for (const s of n.subs) {
    /* una suscripción vieja guardada antes del filtro de hosts se descarta sin mandarle nada */
    if (!pushEndpointOk(s?.endpoint)) continue;
    try { await webpush.sendNotification(s, JSON.stringify(payload), { TTL: 60 * 60 * 24 }); sent++; alive.push(s); }
    /* 404/410: ya no existe; 401/403: las llaves no corresponden (VAPID cambió o la suscripción es ajena) */
    catch (e) { if (![401, 403, 404, 410].includes(e.statusCode)) alive.push(s); }
  }
  if (alive.length !== n.subs.length) { n.subs = alive; await saveNotify(n); }
  return sent;
}

/* ---------- qué toca avisar hoy ---------- */
const TZ = 'America/Argentina/Buenos_Aires';
export const DEFAULT_TZ = TZ;
export const todayAR = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d);
/* zona horaria IANA válida, o null */
export function cleanTz(tz) {
  if (typeof tz !== 'string' || !tz || tz.length > 64 || !/^[A-Za-z0-9_+\-/]+$/.test(tz)) return null;
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return tz; } catch { return null; }
}
/* fecha (AAAA-MM-DD) y hora (0-23) locales de la persona; sin zona guardada, Buenos Aires */
export function localClock(tz, d = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: cleanTz(tz) || TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(d).map(p => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) % 24 };
}
const pd = s => new Date(s + 'T12:00:00Z');
const diff = (a, b) => Math.round((pd(a) - pd(b)) / 864e5);
const dayName = s => new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', timeZone: 'UTC' }).format(pd(s));
/* "la vacuna antirrábica", "la pipeta antipulgas", "el control anual" */
function phrase(r) {
  let n = String(r.name || '').trim().toLowerCase() || (r.type === 'vacuna' ? 'vacuna' : 'el control');
  if (r.type === 'vacuna' && !n.startsWith('vacuna')) n = 'vacuna ' + n;
  if (/^(el|la|los|las) /.test(n)) return n;
  return (/a$/.test(n.split(' ')[0]) ? 'la ' : 'el ') + n;
}
const KIND_OF = { vacuna: 'vac', desparasitacion: 'pip', control: 'vac', otro: 'vac' };

export function dueToday(doc, today = todayAR()) {
  const out = [];
  for (const p of doc?.pets || []) {
    /* solo la próxima fecha vigente de cada tipo + nombre (la misma regla que muestra la app) */
    for (const r of R.dueRecords(p.records)) {
      const d = diff(r.next, today);
      if (d !== 3 && d !== 0) continue;
      const what = phrase(r);
      const sug = R.isSug(r);
      out.push({
        tag: `rec:${p.id}:${r.id}:${r.next}:${d}`, kind: KIND_OF[r.type] || 'vac', petId: p.id, pet: p.name, sug,
        title: sug
          ? (d ? `Fecha sugerida para ${p.name}: ${String(r.name || '').trim()}, el ${dayName(r.next)}` : `Fecha sugerida para ${p.name}: ${String(r.name || '').trim()}, hoy`)
          : (d ? `A ${p.name} le toca ${what} el ${dayName(r.next)}` : `Hoy a ${p.name} le toca ${what}`),
        body: sug
          ? 'Es una fecha sugerida, de referencia general: confirmala con tu veterinario. Cuando la confirmes, editala en Mimitos.'
          : (d ? '¿Ya sacaste turno? Cuando se la pongan, marcala en Mimitos.' : 'Cuando esté hecho, marcalo en Mimitos y te avisamos de la próxima.'),
      });
    }
    const f = p.food || {};
    if (f.opened && f.bagKg && f.dailyG) {
      const left = Math.floor(f.bagKg * 1000 / f.dailyG) - diff(today, f.opened);
      if (left === 5 || left === 0) out.push({ tag: `food:${p.id}:${f.opened}:${left}`, kind: 'food', petId: p.id, pet: p.name, title: left ? `A ${p.name} le quedan 5 días de alimento` : `Hoy se termina el alimento de ${p.name}`, body: left ? 'Buen momento para comprar la bolsa nueva.' : 'Si ya compraste, marcá "bolsa nueva" en Mimitos.' });
    }
  }
  const t = pd(today);
  if (t.getUTCDay() === 0 && t.getUTCDate() <= 7 && (doc?.pets || []).length) {
    const names = doc.pets.map(p => p.name);
    out.push({ tag: `check:${today.slice(0, 7)}`, kind: 'check', petId: 'todas', pet: names[0], title: `Chequeo del mes de ${names.length > 1 ? 'tus mascotas' : names[0]}`, body: 'Son 2 minutos: dientes, orejas, piel, peso y cómo come.' });
  }
  return out;
}

const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export async function mailDigest(email, items) {
  if (!items.length || !emailReady()) return false;
  const url = `${SITE()}/mascotas`;
  const html = `<!doctype html><html><body style="margin:0;background:#FBF2E7;font-family:Helvetica,Arial,sans-serif;color:#2B2119">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#FBF2E7"><tr><td align="center" style="padding:28px 16px">
<table role="presentation" width="100%" style="max-width:480px" cellpadding="0" cellspacing="0">
<tr><td style="padding:0 0 16px;font:700 22px Georgia,serif;color:#2B2119">mimitos</td></tr>
${items.map(i => `<tr><td bgcolor="#FFFDF9" style="background:#FFFDF9;border-radius:18px;padding:16px 18px"><b style="font-size:16px">${esc(i.title)}</b><br><span style="font-size:14px;line-height:1.5;color:#6B5A4E">${esc(i.body)}</span></td></tr><tr><td style="height:10px"></td></tr>`).join('')}
<tr><td style="padding:8px 0 0"><a href="${url}" style="display:inline-block;background:#1E5D4C;color:#FFFFFF;text-decoration:none;font-weight:700;font-size:15px;border-radius:999px;padding:13px 22px">Abrir Mimitos</a></td></tr>
<tr><td style="padding:22px 0 0;font-size:12px;color:#6B5A4E;line-height:1.5">Te llega porque activaste los avisos por mail en Mimitos. Los apagás desde Avisos en la app. Hecho con Orbit.</td></tr>
</table></td></tr></table></body></html>`;
  const text = items.map(i => `${i.title}. ${i.body}`).join('\n') + `\n\nAbrir Mimitos: ${url}`;
  const subject = items.length === 1 ? items[0].title : `${items[0].title} y ${items.length - 1} aviso${items.length > 2 ? 's' : ''} más`;
  await sendEmail({ to: email, subject, html, text });
  return true;
}

/* aviso suelto por mail (escaneo del QR o mensaje de quien la encontró), con la estética de Mimitos */
export async function mailNotice(email, { title, body, map = '', phone = '' }) {
  if (!emailReady()) return false;
  const url = `${SITE()}/mascotas#/inicio`, tel = String(phone || '').replace(/[^\d+]/g, '');
  const btn = (href, label, bg, fg) => `<a href="${esc(href)}" style="display:inline-block;background:${bg};color:${fg};text-decoration:none;font-weight:700;font-size:15px;border-radius:999px;padding:13px 22px;margin:0 8px 8px 0">${label}</a>`;
  const html = `<!doctype html><html><body style="margin:0;background:#F7F3EE;font-family:Helvetica,Arial,sans-serif;color:#1F1A17">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#F7F3EE"><tr><td align="center" style="padding:28px 16px">
<table role="presentation" width="100%" style="max-width:480px" cellpadding="0" cellspacing="0">
<tr><td style="padding:0 0 16px;font:700 22px Helvetica,Arial,sans-serif;color:#1F1A17">mimitos</td></tr>
<tr><td bgcolor="#FFFFFF" style="background:#FFFFFF;border-radius:18px;padding:18px 20px"><b style="font-size:17px">${esc(title)}</b><br><span style="font-size:14px;line-height:1.55;color:#5E554E">${esc(body)}</span></td></tr>
<tr><td style="padding:16px 0 0">${map ? btn(map, 'Ver la ubicación', '#1F4D40', '#FFFFFF') : ''}${tel ? btn('tel:' + tel, 'Llamar', '#1F4D40', '#FFFFFF') : ''}${btn(url, 'Abrir Mimitos', map || tel ? '#E3EDE6' : '#1F4D40', map || tel ? '#1F4D40' : '#FFFFFF')}</td></tr>
<tr><td style="padding:18px 0 0;font-size:12px;color:#5E554E;line-height:1.5">Te llega porque activaste los avisos por mail en Mimitos y el aviso del QR. Los apagás desde Avisos en la app. Hecho con Orbit.</td></tr>
</table></td></tr></table></body></html>`;
  const text = `${title}\n${body}${map ? `\nUbicación: ${map}` : ''}\n\nAbrir Mimitos: ${url}`;
  await sendEmail({ to: email, subject: title, html, text });
  return true;
}
