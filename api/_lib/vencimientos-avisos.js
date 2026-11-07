/* Vencimientos de la Casa · avisos push (mismo patrón que Mi Mes y Mimitos).
   - Llaves VAPID compartidas: VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT o, si no
     están, orbit:vapid en KV (la misma que usan Mi Mes y Mimitos).
   - Por cuenta: orbit:vencimientos:avisos:<email> = { email, subs, items, dias, sent }.
     items: [{ n: nombre, v: 'AAAA-MM-DD', c: casa?, t: 'tramite'|'debito'|'' }] de los próximos
     45 días de todas las casas del teléfono. Sin montos. */
import webpushReal from 'web-push';
import { kvGet, kvSet, kvDel } from './kv.js';

let webpush = webpushReal;
export function __usarWebpush(w) { webpush = w; vapid = null; }

export const claveAvisos = email => `orbit:vencimientos:avisos:${String(email).toLowerCase()}`;
const TZ = 'America/Argentina/Buenos_Aires';
export const hoyAR = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d);
const esFecha = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const dif = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5);

export const MAX_ITEMS = 150;
export function limpiarItems(l) {
  return (Array.isArray(l) ? l : []).filter(x => x && esFecha(x.v) && typeof x.n === 'string' && x.n.trim())
    .map(x => ({ n: x.n.trim().slice(0, 40), v: x.v, ...(x.c ? { c: String(x.c).trim().slice(0, 30) } : {}), ...(x.t === 'tramite' || x.t === 'debito' ? { t: x.t } : {}) }))
    .slice(0, MAX_ITEMS);
}
export const limpiarDias = l => { const v = [...new Set((Array.isArray(l) ? l : []).map(Number).filter(n => [0, 1, 3, 7].includes(n)))].sort((a, b) => b - a).slice(0, 3); return v.length ? v : [3, 0]; };

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
  return { email: String(email).toLowerCase(), subs: Array.isArray(n.subs) ? n.subs : [], items: limpiarItems(n.items), dias: limpiarDias(n.dias), sent: n.sent || {} };
}
export const guardarAvisos = n => kvSet(claveAvisos(n.email), { email: n.email, subs: n.subs, items: limpiarItems(n.items), dias: limpiarDias(n.dias), sent: n.sent });
export const borrarAvisos = email => kvDel(claveAvisos(email));

export function limpiarSub(s) {
  const ok = s && typeof s.endpoint === 'string' && /^https:\/\//.test(s.endpoint) && s.endpoint.length < 1000 && s.keys && typeof s.keys.p256dh === 'string' && typeof s.keys.auth === 'string';
  return ok ? { endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh.slice(0, 200), auth: s.keys.auth.slice(0, 100) }, at: new Date().toISOString() } : null;
}

export async function mandarPush(n, payload) {
  if (!n.subs.length) return 0;
  await getVapid();
  let enviados = 0; const vivos = [];
  for (const s of n.subs) {
    try { await webpush.sendNotification(s, JSON.stringify(payload), { TTL: 60 * 60 * 20 }); enviados++; vivos.push(s); }
    catch (e) { if (e.statusCode !== 404 && e.statusCode !== 410) vivos.push(s); }
  }
  if (vivos.length !== n.subs.length) { n.subs = vivos; await guardarAvisos(n); }
  return enviados;
}

/* Qué avisar hoy: lo que vence en alguno de los días elegidos (3 días antes, el mismo día…).
   Si el mismo día hay varios, va un solo aviso con todos. Nunca repite (tag). */
const lista = xs => xs.length <= 2 ? xs.join(' y ') : `${xs.slice(0, 2).join(', ')} y ${xs.length - 2} más`;
const conCasa = (x, varias) => varias && x.c ? `${x.n} (${x.c})` : x.n;
export function avisosDeHoy(items, dias, hoy) {
  const varias = new Set(items.map(x => x.c).filter(Boolean)).size > 1;
  const out = [];
  for (const d of limpiarDias(dias)) {
    const hoyVence = items.filter(x => dif(hoy, x.v) === d);
    if (!hoyVence.length) continue;
    const nombres = hoyVence.map(x => conCasa(x, varias));
    const cuando = d === 0 ? 'hoy' : d === 1 ? 'mañana' : `en ${d} días`;
    const soloDebitos = hoyVence.every(x => x.t === 'debito');
    const title = hoyVence.length === 1
      ? `${soloDebitos ? 'Se debita' : hoyVence[0].t === 'tramite' ? 'Toca' : 'Vence'} ${cuando}: ${nombres[0]}`
      : `${hoyVence.length} vencimientos ${cuando}`;
    const body = hoyVence.length === 1
      ? (soloDebitos ? 'Revisá que haya saldo en la cuenta.' : d === 0 ? 'Tocá para marcarlo pagado.' : 'Tocá para verlo.')
      : `${lista(nombres)}.${d === 0 ? ' Tocá para marcarlos pagados.' : ''}`;
    out.push({ tag: `venc|${hoy}|${d}`, title, body });
  }
  return out;
}
