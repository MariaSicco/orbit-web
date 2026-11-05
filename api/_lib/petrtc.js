/* Mimitos · "Me fui": video en vivo del celu cámara (WebRTC P2P). Esto es SOLO la señalización:
   el video va directo de celu a celu y nunca pasa ni se guarda en el servidor. Nada se graba.

   Rutas (todas POST con JSON, por /api/mascotas?rtc=…; el token de la cámara va en el cuerpo, nunca en la URL):
   - offer   viewer {camId, sdp, takeover?}  → {sid, iceServers, wake}. Abre la sesión y toca el TIMBRE de la
                                               cámara. Un solo viewer por cámara: si ya hay otro, 409 busy; con
                                               takeover:true el último gana y el otro se entera (ended, 'replaced').
   - answer  cámara {token, sid, sdp}         → {ok}
   - ice     viewer {camId, sid, cands} | cámara {token, sid, cands} → {ok}
   - poll    cámara {token, sid?, since?, beat?} → {sid, offer?, ice, next, ended?, wait}
             viewer {camId, sid, since?, connected?} → {answer?, ice, next, ended?, reason?}
   - hangup  cualquiera de los dos {sid, reason?} → {ok}. Borra todo lo de la sesión.

   Cámara en reposo (nadie mirando): pregunta cada IDLE_MS (40 s, con ±10 % de variación en el navegador) y cada
   pregunta es UN solo comando de KV: SET orbit:rtc:up:<camId> … EX 150 GET. Ese SET la marca prendida y, con GET,
   devuelve lo que había: si un viewer dejó el timbre (ring), la cámara recién ahí lee la sesión y pasa a preguntar
   cada 1 s. Por eso el primer "Ver en vivo" tarda hasta ~40 s (el viewer muestra "Despertando la cámara…").
   El token se valida contra KV como mucho cada 10 min por instancia (3 GET); revocar tarda eso como mucho, pero
   una cámara revocada no puede abrir sesiones: el viewer necesita ownsCamera, que no se cachea.
   Medido en test/mascotas-rtc.test.mjs (KV simulado que cuenta comandos): cámara en reposo 24 h ≈ 2.600 comandos.

   Acceso:
   - interruptor apagado (MIMITOS_MEFUI) → 404 en todo; cuenta fuera de la lista → 404.
   - cámara: verifyCameraToken (api/_lib/petaway.js). Token inválido o revocado → 401.
   - viewer: sesión de Orbit + compra de Mimitos (401 / 402) + ownsCamera (cámara ajena → 403).
   - cada sesión (sid) queda atada a un camId y a un email: SDP e ICE solo se leen con esa cámara o esa cuenta.
   - topes: ofertas por cuenta y tokens malos por IP en KV (→ 429); las consultas de cámara y viewer, por instancia
     (en memoria, para no gastar un comando por consulta).

   KV (todo con TTL corto; si nadie limpia, se borra solo):
   - orbit:rtc:up:<camId>           {at, ring?} la cámara está prendida; ring = un viewer la espera   TTL 150 s
   - orbit:rtc:lock:<camId>         {sid, email} el viewer actual (lo renueva su poll)               TTL 45 s
   - orbit:rtc:offer:<sid>          {camId, email, sdp}                                              TTL 120 s
   - orbit:rtc:answer:<sid>         {sdp}                                                            TTL 120 s
   - orbit:rtc:icen:<sid>:<v|c>     contador; orbit:rtc:ice:<sid>:<v|c>:<n> = [candidatos]           TTL 120 s
   - orbit:rtc:end:<sid>            {reason} para que el otro lado se entere del corte                TTL 120 s
   - orbit:rtc:stat:<AAAA-MM>:<ok|fail>  tasa de conexión sin TURN                                    TTL 400 d
   - orbit:rtc:cmds:<camId>:<AAAA-MM-DD>  comandos de KV que gastó esa cámara ese día (aproximado: se suma
                                    por instancia y se vuelca cada 30 min o cada 300 comandos) → rtcUsage()  TTL 8 d
     Cada volcado también sale en los logs: "[mimitos-rtc] kv cam=<camId> +N".

   ICE: solo STUN público de Google (gratis). Sin TURN, las redes con NAT simétrico o CGNAT estricto (datos
   móviles de algunas operadoras, wifi corporativo) no conectan: el viewer avisa a los 15 s y suma un "fail".

   Cómo enchufar un TURN después (decide Majo; NO está contratado ni configurado). Precios vistos el 14/10/2026:
   1. Cloudflare Realtime TURN — https://developers.cloudflare.com/realtime/turn/ . USD 0,05 por GB que sale
      de Cloudflare al cliente (la página no muestra cupo gratis). Credenciales efímeras por su API (ver la doc).
      Es la opción recomendada por precio.
   2. metered.ca — https://www.metered.ca/stun-turn . Gratis hasta 0,5 GB/mes; Growth USD 99/mes con 150 GB
      (excedente USD 0,40/GB).
   3. Twilio Network Traversal — https://www.twilio.com/en-us/stun-turn/pricing . USD 0,40/GB (EE. UU., Europa),
      USD 0,80/GB en São Paulo (la región más cercana a Argentina).
   Referencia de consumo: 640x480 a 15 fps ≈ 450 kbps ≈ 200 MB por hora mirando, y solo pasa por TURN la fracción
   que no conecta directo. Para enchufarlo: generar las credenciales acá (función turnServers con la API del
   proveedor y las claves en variables de entorno) y sumarlas a ICE_SERVERS en las respuestas de offer y poll;
   el navegador ya usa los iceServers que le devuelve el servidor. */
import { randomBytes, createHash } from 'node:crypto';
import { kvGet, kvSet, kvDel, kvIncrBy, kvSetNX, kvMGet, hasKV } from './kv.js';
import { readBody } from './auth.js';
import { accesoHerramienta } from './herramienta-acceso.js';
import { PRODUCT_ID } from './petpush.js';
import { verifyCameraToken, ownsCamera, mefuiOn, mefuiAllowed } from './petaway.js';

export const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];
export const TTL = { up: 150, lock: 45, sess: 120 };
/* cada cuánto pregunta la cámara: en reposo y mientras negocia o hay alguien mirando */
export const IDLE_MS = 40000, FAST_MS = 1000;
/* por minuto: cam y viewer por instancia (memoria); offer y badToken en KV */
export const LIMITS = { cam: 120, viewer: 120, offer: 12, badToken: 20 };
const CAM_CACHE_MS = 10 * 60e3;
const FLUSH_MS = 30 * 60e3, FLUSH_CMDS = 300;
const MAX_SDP = 16000, MAX_CANDS = 24, MAX_CAND = 600, MAX_ICE_BATCHES = 60;

const P = 'orbit:rtc:';
const K = {
  up: c => `${P}up:${c}`, lock: c => `${P}lock:${c}`, offer: s => `${P}offer:${s}`, answer: s => `${P}answer:${s}`,
  icen: (s, side) => `${P}icen:${s}:${side}`, ice: (s, side, n) => `${P}ice:${s}:${side}:${n}`, end: s => `${P}end:${s}`,
  stat: (kind, d = new Date()) => `${P}stat:${d.toISOString().slice(0, 7)}:${kind}`,
  cmds: (c, day) => `${P}cmds:${c}:${day}`,
};
const sidOk = v => typeof v === 'string' && /^[a-f0-9]{24}$/.test(v);
const camIdOk = v => typeof v === 'string' && /^c[a-f0-9]{11}$/.test(v);
const sdpOk = v => typeof v === 'string' && v.length <= MAX_SDP && v.startsWith('v=0');
const minute = () => new Date(Date.now()).toISOString().slice(0, 16);
const today = () => new Date(Date.now()).toISOString().slice(0, 10);
const ipHash = req => createHash('sha256').update('orbit-rtc:' + String(req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim()).digest('hex').slice(0, 16);

/* SET … EX … GET: marca la cámara prendida y devuelve lo que había (el timbre), en UN comando */
async function kvSetGet(key, val, ttl) {
  if (!hasKV) { const old = await kvGet(key); await kvSet(key, val, ttl); return old; }
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  const r = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(['SET', key, JSON.stringify(val), 'EX', String(ttl), 'GET']) });
  if (!r.ok) throw new Error(`KV ${r.status}`);
  const { result } = await r.json();
  try { return result ? JSON.parse(result) : null; } catch { return null; }
}

/* KV con cuenta de comandos (para medir el costo por cámara) */
function counted() {
  let n = 0;
  return {
    get n() { return n; }, add(x) { n += x; },
    get: k => { n++; return kvGet(k); },
    set: (k, v, t) => { n++; return kvSet(k, v, t); },
    del: k => { n++; return kvDel(k); },
    mget: ks => { n++; return kvMGet(ks); },
    setnx: (k, v, t) => { n++; return kvSetNX(k, v, t); },
    setGet: (k, v, t) => { n++; return kvSetGet(k, v, t); },
    incr: async (k, by, t) => { const v = await kvIncrBy(k, by, t); n += t && v === by ? 2 : 1; return v; },
  };
}

/* comandos por cámara y por día: se suman en la instancia y se vuelcan de a tandas (cada volcado gasta 1-2) */
const usage = new Map();
async function track(camId, n) {
  if (!camId || !n) return;
  const u = usage.get(camId) || { n: 0, since: Date.now() };
  u.n += n; usage.set(camId, u);
  if (u.n < FLUSH_CMDS && Date.now() - u.since < FLUSH_MS) return;
  usage.delete(camId);
  const day = today(), add = u.n + 1;
  const total = await kvIncrBy(K.cmds(camId, day), add, 8 * 86400).catch(() => null);
  console.log(`[mimitos-rtc] kv cam=${camId} +${add} (hoy ${total ?? '?'})`);
}
export async function rtcUsage(camId, day = today()) {
  const stored = Number(await kvGet(K.cmds(camId, day))) || 0;
  return { camId, day, stored, pending: usage.get(camId)?.n || 0, total: stored + (usage.get(camId)?.n || 0) };
}
export const _resetUsage = () => usage.clear();

/* candidatos ICE: solo los tres campos del estándar, recortados */
function cleanCands(list) {
  return (Array.isArray(list) ? list : []).slice(0, MAX_CANDS).map(c => {
    const candidate = typeof c?.candidate === 'string' ? c.candidate.slice(0, MAX_CAND) : '';
    if (!/^(candidate:|$)/.test(candidate)) return null;
    const sdpMid = c?.sdpMid == null ? null : String(c.sdpMid).slice(0, 16);
    const i = Number(c?.sdpMLineIndex);
    return { candidate, sdpMid, sdpMLineIndex: Number.isInteger(i) && i >= 0 && i < 8 ? i : null };
  }).filter(Boolean);
}

/* topes: en KV (ofertas, tokens malos) o por instancia (consultas frecuentes) */
async function under(C, key, max) { return (await C.incr(`${P}rl:${key}:${minute()}`, 1, 70)) <= max; }
const memRl = new Map();
function underMem(key, max) {
  const k = key + ':' + minute();
  const v = (memRl.get(k) || 0) + 1;
  if (memRl.size > 5000) memRl.clear();
  memRl.set(k, v);
  return v <= max;
}

/* validar el token contra KV cuesta 3 comandos: se recuerda 10 min por instancia */
const camCache = new Map();
export const _clearCamCache = () => camCache.clear();
async function camOf(C, token) {
  if (typeof token !== 'string') return null;
  const h = createHash('sha256').update(token).digest('hex');
  const hit = camCache.get(h);
  if (hit && hit.until > Date.now()) return hit.cam;
  C.add(3);
  const cam = await verifyCameraToken(token);
  if (camCache.size > 500) camCache.clear();
  if (cam) camCache.set(h, { cam, until: Date.now() + CAM_CACHE_MS });
  return cam;
}

async function pushIce(C, sid, side, cands) {
  const list = cleanCands(cands);
  if (!list.length) return true;
  const n = await C.incr(K.icen(sid, side), 1, TTL.sess);
  if (n > MAX_ICE_BATCHES) return false;
  await C.set(K.ice(sid, side, n), list, TTL.sess);
  return true;
}
/* nKnown: el contador ya leído en el mismo MGET (ahorra un comando) */
async function readIce(C, sid, side, since, nKnown) {
  const n = Math.min(Number(nKnown === undefined ? await C.get(K.icen(sid, side)) : nKnown) || 0, MAX_ICE_BATCHES);
  const from = Math.max(0, Math.trunc(Number(since) || 0));
  if (n <= from) return { ice: [], next: Math.max(n, from) };
  const keys = []; for (let i = from + 1; i <= n; i++) keys.push(K.ice(sid, side, i));
  const lists = await C.mget(keys);
  return { ice: lists.flatMap(l => Array.isArray(l) ? l : []), next: n };
}

/* borra todo lo de una sesión; el candado solo si sigue siendo de esta sesión */
async function cleanup(C, sid, camId, reason) {
  const lock = camId ? await C.get(K.lock(camId)) : null;
  if (lock?.sid === sid) await C.del(K.lock(camId));
  await Promise.all([K.offer(sid), K.answer(sid), K.icen(sid, 'v'), K.icen(sid, 'c')].map(k => C.del(k)));
  await C.set(K.end(sid), { reason: String(reason || 'hangup').slice(0, 20) }, TTL.sess);
}

async function stat(C, kind, sid) {
  /* una vez por sesión */
  if (await C.setnx(`${P}statmark:${sid}`, kind, TTL.sess * 2)) await C.incr(K.stat(kind), 1, 400 * 86400);
}
export async function rtcStats(month = new Date().toISOString().slice(0, 7)) {
  const d = new Date(month + '-01T00:00:00Z');
  const ok = Number(await kvGet(K.stat('ok', d))) || 0, fail = Number(await kvGet(K.stat('fail', d))) || 0;
  return { month, ok, fail, rate: ok + fail ? Math.round((ok / (ok + fail)) * 1000) / 10 : null };
}

export async function handleRtc(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const action = String(req.query?.rtc || '');
  if (!mefuiOn()) return res.status(404).json({ error: 'not_found' });
  if (!['offer', 'answer', 'ice', 'poll', 'hangup'].includes(action)) return res.status(404).json({ error: 'not_found' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  const b = await readBody(req);
  const sid = b.sid == null ? null : String(b.sid);
  if (sid != null && !sidOk(sid)) return res.status(400).json({ error: 'invalid' });
  const C = counted();
  let who = null;
  const send = async (code, body) => { await track(who, C.n).catch(() => {}); return res.status(code).json(body); };

  /* ---------- lado cámara: viene con token ---------- */
  if (b.token != null) {
    if (action === 'offer') return send(400, { error: 'invalid' });
    const cam = await camOf(C, b.token);
    if (!cam) {
      if (!(await under(C, `bad:${ipHash(req)}`, LIMITS.badToken))) return send(429, { error: 'limite' });
      return send(401, { error: 'camara_invalida' });
    }
    const camId = who = cam.camId;
    if (!underMem(`cam:${camId}`, LIMITS.cam)) return send(429, { error: 'limite' });
    /* la sesión tiene que ser de ESTA cámara */
    const own = async () => { const o = await C.get(K.offer(sid)); return o && o.camId === camId ? o : null; };

    if (action === 'poll') {
      /* reposo: UN comando (se marca prendida y se lee el timbre) */
      let ring = false;
      if (!sid || b.beat) ring = Boolean((await C.setGet(K.up(camId), { at: Date.now() }, TTL.up))?.ring);
      if (!sid && !ring) return send(200, { sid: null, ice: [], next: 0, wait: IDLE_MS });
      const [lock, n, end] = await C.mget([K.lock(camId), K.icen(sid || '-', 'v'), K.end(sid || '-')]);
      if (!lock) return send(200, { sid: null, ice: [], next: 0, wait: IDLE_MS, ...(sid ? { ended: true, reason: end?.reason || 'expired' } : {}) });
      if (lock.sid !== sid) {
        /* sesión nueva: va la oferta y todo el ICE del viewer desde el principio */
        const [o, n2] = await C.mget([K.offer(lock.sid), K.icen(lock.sid, 'v')]);
        if (!o || o.camId !== camId) return send(200, { sid: null, ice: [], next: 0, wait: IDLE_MS });
        const { ice, next } = await readIce(C, lock.sid, 'v', 0, n2);
        return send(200, { sid: lock.sid, offer: o.sdp, ice, next, iceServers: ICE_SERVERS, wait: FAST_MS });
      }
      const { ice, next } = await readIce(C, sid, 'v', b.since, n);
      return send(200, { sid, ice, next, wait: FAST_MS });
    }
    if (!sid) return send(400, { error: 'invalid' });
    if (action === 'answer') {
      if (!sdpOk(b.sdp)) return send(400, { error: 'invalid' });
      if (!(await own())) return send(403, { error: 'forbidden' });
      await C.set(K.answer(sid), { sdp: b.sdp }, TTL.sess);
      return send(200, { ok: true });
    }
    if (action === 'ice') {
      if (!(await own())) return send(403, { error: 'forbidden' });
      return (await pushIce(C, sid, 'c', b.cands)) ? send(200, { ok: true }) : send(429, { error: 'limite' });
    }
    /* hangup */
    if (await own()) await cleanup(C, sid, camId, 'camera');
    return send(200, { ok: true });
  }

  /* ---------- lado viewer: sesión + compra + que la cámara sea suya ---------- */
  const acc = await accesoHerramienta(req, PRODUCT_ID);
  if (!acc.ok && acc.motivo === 'sin_sesion') return res.status(401).json({ error: 'unauthorized' });
  if (!acc.ok && acc.motivo === 'sin_compra') return res.status(402).json({ error: 'no_purchase' });
  if (!acc.ok) return res.status(acc.status || 503).json({ error: 'unavailable' });
  const email = String(acc.email).toLowerCase();
  if (!mefuiAllowed(email)) return res.status(404).json({ error: 'not_found' });
  const camId = String(b.camId || '');
  if (!camIdOk(camId)) return res.status(400).json({ error: 'invalid' });
  if (!(await ownsCamera(email, camId))) return res.status(403).json({ error: 'forbidden' });
  who = camId;
  C.add(acc.admin ? 1 : 2);   /* compra + lista de cámaras */
  if (!underMem(`v:${email}`, LIMITS.viewer)) return send(429, { error: 'limite' });

  if (action === 'offer') {
    if (!sdpOk(b.sdp)) return send(400, { error: 'invalid' });
    if (!(await under(C, `offer:${email}`, LIMITS.offer))) return send(429, { error: 'limite' });
    const up = await C.get(K.up(camId));
    if (!up) return send(409, { error: 'cam_offline' });
    const nsid = randomBytes(12).toString('hex');
    await C.set(K.offer(nsid), { camId, email, sdp: b.sdp }, TTL.sess);
    const mine = { sid: nsid, email, at: Date.now() };
    if (!(await C.setnx(K.lock(camId), mine, TTL.lock))) {
      const cur = await C.get(K.lock(camId));
      if (cur && !(b.takeover && cur.email === email)) { await C.del(K.offer(nsid)); return send(409, { error: 'busy' }); }
      if (cur) await cleanup(C, cur.sid, null, 'replaced');
      await C.set(K.lock(camId), mine, TTL.lock);
    }
    /* timbre: la cámara lo lee en su próxima consulta lenta (hasta IDLE_MS) */
    await C.set(K.up(camId), { ...up, ring: true }, TTL.up);
    return send(200, { sid: nsid, iceServers: ICE_SERVERS, wake: IDLE_MS });
  }
  if (!sid) return send(400, { error: 'invalid' });

  if (action === 'poll') {
    const [lock, ans, n] = await C.mget([K.lock(camId), K.answer(sid), K.icen(sid, 'c')]);
    if (!(lock && lock.sid === sid && lock.email === email)) return notMine();
    /* renueva el candado (un viewer por vez mientras siga mirando) */
    await C.set(K.lock(camId), { ...lock, at: Date.now() }, TTL.lock);
    if (b.connected) await stat(C, 'ok', sid);
    const { ice, next } = await readIce(C, sid, 'c', b.since, n);
    return send(200, { ...(ans ? { answer: ans.sdp } : {}), ice, next });
  }
  const lock = await C.get(K.lock(camId));
  const mine = lock && lock.sid === sid && lock.email === email;
  if (action === 'hangup') {
    if (mine || (await C.get(K.offer(sid)))?.email === email) {
      const reason = ['timeout', 'failed', 'nowake'].includes(b.reason) ? b.reason : 'viewer';
      if (reason === 'timeout' || reason === 'failed') await stat(C, 'fail', sid);
      await cleanup(C, sid, camId, reason);
    }
    return send(200, { ok: true });
  }
  if (!mine) return notMine();
  return (await pushIce(C, sid, 'v', b.cands)) ? send(200, { ok: true }) : send(429, { error: 'limite' });

  /* la sesión no es (o ya no es) de esta cuenta: no se muestra nada de ella */
  async function notMine() {
    const o = await C.get(K.offer(sid));
    if (o && o.email !== email) return send(403, { error: 'forbidden' });
    const end = await C.get(K.end(sid));
    return send(200, { ended: true, reason: end?.reason || 'expired', ice: [], next: 0 });
  }
}
