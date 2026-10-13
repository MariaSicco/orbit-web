/* Mi Mes by Orbit · avisos push (patrón de api/_lib/petpush.js de la rama
   mascotas-libreta, sin nada más de Mimitos).
   - Llaves VAPID: VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT (las
     mismas variables que Mimitos); si no están, se generan una vez y quedan
     en KV en orbit:vapid (la misma clave que usa Mimitos, así comparten).
   - Por cuenta: orbit:mi-mes:avisos:<email> = { email, subs: [...],
     tarjetas: [{ id, nombre, cierre, vencimiento, dolares, diaCierre?, diaVence? }],
     sent: { tag: fecha } }. Sin montos ni consumos. */
import webpushReal from 'web-push';
import { kvGet, kvSet, kvDel } from './kv.js';
import { limpiarTarjetasAvisos } from '../_herramientas/mi-mes/calculos.js';

let webpush = webpushReal;
export function __usarWebpush(w) { webpush = w; vapid = null; }

export const claveAvisos = email => `orbit:mi-mes:avisos:${String(email).toLowerCase()}`;
const TZ = 'America/Argentina/Buenos_Aires';
export const hoyAR = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d);

let vapid = null;
export async function getVapid() {
  if (vapid) return vapid;
  let v = process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY ? { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY } : await kvGet('orbit:vapid');
  if (!v) { v = webpush.generateVAPIDKeys(); await kvSet('orbit:vapid', v); }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:hola@orbitando.com.ar', v.publicKey, v.privateKey);
  return (vapid = v);
}

export async function leerAvisos(email) {
  const n = (await kvGet(claveAvisos(email))) || {};
  return { email: String(email).toLowerCase(), subs: Array.isArray(n.subs) ? n.subs : [], tarjetas: limpiarTarjetasAvisos(n.tarjetas), sent: n.sent || {} };
}
export const guardarAvisos = n => kvSet(claveAvisos(n.email), { email: n.email, subs: n.subs, tarjetas: limpiarTarjetasAvisos(n.tarjetas), sent: n.sent });
export const borrarAvisos = email => kvDel(claveAvisos(email));

export function limpiarSub(s) {
  const ok = s && typeof s.endpoint === 'string' && /^https:\/\//.test(s.endpoint) && s.endpoint.length < 1000 && s.keys && typeof s.keys.p256dh === 'string' && typeof s.keys.auth === 'string';
  return ok ? { endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh.slice(0, 200), auth: s.keys.auth.slice(0, 100) }, at: new Date().toISOString() } : null;
}

/* manda a todos los celus de la cuenta; saca los que ya no existen */
export async function mandarPush(n, payload) {
  if (!n.subs.length) return 0;
  await getVapid();
  let enviados = 0; const vivos = [];
  for (const s of n.subs) {
    try { await webpush.sendNotification(s, JSON.stringify(payload), { TTL: 60 * 60 * 24 }); enviados++; vivos.push(s); }
    catch (e) { if (e.statusCode !== 404 && e.statusCode !== 410) vivos.push(s); }
  }
  if (vivos.length !== n.subs.length) { n.subs = vivos; await guardarAvisos(n); }
  return enviados;
}
