/* Mimitos · "Me fui": video en vivo del celu cámara (WebRTC P2P). Esto es SOLO la señalización:
   el video va directo de celu a celu y nunca pasa ni se guarda en el servidor. Nada se graba.

   Rutas (todas POST con JSON, por /api/mascotas?rtc=…; el token de la cámara va en el cuerpo, nunca en la URL):
   - offer   viewer {camId, sdp, takeover?}  → {sid, iceServers}. Abre la sesión. Un solo viewer por cámara:
                                               si ya hay otro, 409 busy; con takeover:true el último gana y el otro
                                               se entera en su poll (ended, reason 'replaced').
   - answer  cámara {token, sid, sdp}         → {ok}
   - ice     viewer {camId, sid, cands} | cámara {token, sid, cands} → {ok}
   - poll    cámara {token, sid?, since?, beat?} → {sid, offer?, ice, next, ended?}
             viewer {camId, sid, since?, connected?} → {answer?, ice, next, ended?, reason?}
   - hangup  cualquiera de los dos {sid, reason?} → {ok}. Borra todo lo de la sesión.

   Acceso:
   - interruptor apagado (MIMITOS_MEFUI) → 404 en todo; cuenta fuera de la lista → 404.
   - cámara: verifyCameraToken (api/_lib/petaway.js). Token inválido o revocado → 401.
   - viewer: sesión de Orbit + compra de Mimitos (401 / 402) + ownsCamera (cámara ajena → 403).
   - cada sesión (sid) queda atada a un camId y a un email: SDP e ICE solo se leen con esa cámara o esa cuenta.
   - tope por minuto en KV (por cámara, por cuenta y por IP para tokens malos) → 429.

   KV (todo con TTL corto; si nadie limpia, se borra solo):
   - orbit:rtc:up:<camId>           la cámara está prendida (la cámara lo renueva cada ~20 s)        TTL 30 s
   - orbit:rtc:lock:<camId>         {sid, email} el viewer actual (lo renueva su poll)               TTL 45 s
   - orbit:rtc:offer:<sid>          {camId, email, sdp}                                              TTL 120 s
   - orbit:rtc:answer:<sid>         {sdp}                                                            TTL 120 s
   - orbit:rtc:icen:<sid>:<v|c>     contador; orbit:rtc:ice:<sid>:<v|c>:<n> = [candidatos]           TTL 120 s
   - orbit:rtc:end:<sid>            {reason} para que el otro lado se entere del corte                TTL 120 s
   - orbit:rtc:stat:<AAAA-MM>:<ok|fail>  tasa de conexión sin TURN (la lee el panel o un kvGet)       TTL 400 d

   Costo de KV (Upstash): la cámara pregunta cada 5 s cuando nadie mira (1 GET + 1 INCR del tope; el token se
   valida contra KV como mucho cada 60 s por instancia). ≈ 35.000 comandos por día por cámara prendida todo el día.

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
import { kvGet, kvSet, kvDel, kvIncrBy, kvSetNX } from './kv.js';
import { readBody } from './auth.js';
import { accesoHerramienta } from './herramienta-acceso.js';
import { PRODUCT_ID } from './petpush.js';
import { verifyCameraToken, ownsCamera, mefuiOn, mefuiAllowed } from './petaway.js';

export const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];
export const TTL = { up: 30, lock: 45, sess: 120 };
export const LIMITS = { cam: 120, viewer: 120, offer: 12, badToken: 20 };   /* por minuto */
const MAX_SDP = 16000, MAX_CANDS = 24, MAX_CAND = 600, MAX_ICE_BATCHES = 60;

const P = 'orbit:rtc:';
const K = {
  up: c => `${P}up:${c}`, lock: c => `${P}lock:${c}`, offer: s => `${P}offer:${s}`, answer: s => `${P}answer:${s}`,
  icen: (s, side) => `${P}icen:${s}:${side}`, ice: (s, side, n) => `${P}ice:${s}:${side}:${n}`, end: s => `${P}end:${s}`,
  stat: (kind, d = new Date()) => `${P}stat:${d.toISOString().slice(0, 7)}:${kind}`,
};
const sidOk = v => typeof v === 'string' && /^[a-f0-9]{24}$/.test(v);
const camIdOk = v => typeof v === 'string' && /^c[a-f0-9]{11}$/.test(v);
const sdpOk = v => typeof v === 'string' && v.length <= MAX_SDP && v.startsWith('v=0');
const minute = () => new Date().toISOString().slice(0, 16);
const ipHash = req => createHash('sha256').update('orbit-rtc:' + String(req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim()).digest('hex').slice(0, 16);

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

/* tope por minuto; true = pasó */
async function under(key, max) { return (await kvIncrBy(`${P}rl:${key}:${minute()}`, 1, 70)) <= max; }

/* validar el token contra KV cuesta 3-4 comandos: se recuerda 60 s por instancia (revocar tarda como mucho eso) */
const camCache = new Map();
const CAM_CACHE_MS = 60e3;
export const _clearCamCache = () => camCache.clear();
async function camOf(token) {
  if (typeof token !== 'string') return null;
  const h = createHash('sha256').update(token).digest('hex');
  const hit = camCache.get(h);
  if (hit && hit.until > Date.now()) return hit.cam;
  const cam = await verifyCameraToken(token);
  if (camCache.size > 500) camCache.clear();
  if (cam) camCache.set(h, { cam, until: Date.now() + CAM_CACHE_MS });
  return cam;
}

async function pushIce(sid, side, cands) {
  const list = cleanCands(cands);
  if (!list.length) return true;
  const n = await kvIncrBy(K.icen(sid, side), 1, TTL.sess);
  if (n > MAX_ICE_BATCHES) return false;
  await kvSet(K.ice(sid, side, n), list, TTL.sess);
  return true;
}
async function readIce(sid, side, since) {
  const n = Math.min(Number(await kvGet(K.icen(sid, side))) || 0, MAX_ICE_BATCHES);
  const from = Math.max(0, Math.trunc(Number(since) || 0));
  const out = [];
  for (let i = from + 1; i <= n; i++) out.push(...((await kvGet(K.ice(sid, side, i))) || []));
  return { ice: out, next: Math.max(n, from) };
}

/* borra todo lo de una sesión; el candado solo si sigue siendo de esta sesión */
async function cleanup(sid, camId, reason) {
  const lock = camId ? await kvGet(K.lock(camId)) : null;
  if (lock?.sid === sid) await kvDel(K.lock(camId));
  await Promise.all([K.offer(sid), K.answer(sid), K.icen(sid, 'v'), K.icen(sid, 'c')].map(k => kvDel(k)));
  await kvSet(K.end(sid), { reason: String(reason || 'hangup').slice(0, 20) }, TTL.sess);
}

async function stat(kind, sid) {
  /* una vez por sesión */
  if (await kvSetNX(`${P}statmark:${sid}`, kind, TTL.sess * 2)) await kvIncrBy(K.stat(kind), 1, 400 * 86400);
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

  /* ---------- lado cámara: viene con token ---------- */
  if (b.token != null) {
    if (action === 'offer') return res.status(400).json({ error: 'invalid' });
    const cam = await camOf(b.token);
    if (!cam) {
      if (!(await under(`bad:${ipHash(req)}`, LIMITS.badToken))) return res.status(429).json({ error: 'limite' });
      return res.status(401).json({ error: 'camara_invalida' });
    }
    if (!(await under(`cam:${cam.camId}`, LIMITS.cam))) return res.status(429).json({ error: 'limite' });
    const camId = cam.camId;
    /* la sesión tiene que ser de ESTA cámara */
    const own = async () => { const o = await kvGet(K.offer(sid)); return o && o.camId === camId ? o : null; };

    if (action === 'poll') {
      if (b.beat) await kvSet(K.up(camId), { at: Date.now() }, TTL.up);
      const lock = await kvGet(K.lock(camId));
      if (!lock) {
        const end = sid ? await kvGet(K.end(sid)) : null;
        return res.status(200).json({ sid: null, ice: [], next: 0, ...(sid ? { ended: true, reason: end?.reason || 'expired' } : {}), iceServers: ICE_SERVERS });
      }
      if (lock.sid !== sid) {
        /* sesión nueva: va la oferta y todo el ICE del viewer desde el principio */
        const o = await kvGet(K.offer(lock.sid));
        if (!o || o.camId !== camId) return res.status(200).json({ sid: null, ice: [], next: 0, iceServers: ICE_SERVERS });
        const { ice, next } = await readIce(lock.sid, 'v', 0);
        return res.status(200).json({ sid: lock.sid, offer: o.sdp, ice, next, iceServers: ICE_SERVERS });
      }
      const { ice, next } = await readIce(sid, 'v', b.since);
      return res.status(200).json({ sid, ice, next });
    }
    if (!sid) return res.status(400).json({ error: 'invalid' });
    if (action === 'answer') {
      if (!sdpOk(b.sdp)) return res.status(400).json({ error: 'invalid' });
      if (!(await own())) return res.status(403).json({ error: 'forbidden' });
      await kvSet(K.answer(sid), { sdp: b.sdp }, TTL.sess);
      return res.status(200).json({ ok: true });
    }
    if (action === 'ice') {
      if (!(await own())) return res.status(403).json({ error: 'forbidden' });
      return (await pushIce(sid, 'c', b.cands)) ? res.status(200).json({ ok: true }) : res.status(429).json({ error: 'limite' });
    }
    /* hangup */
    if (await own()) await cleanup(sid, camId, 'camera');
    return res.status(200).json({ ok: true });
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
  if (!(await under(`v:${email}`, LIMITS.viewer))) return res.status(429).json({ error: 'limite' });

  if (action === 'offer') {
    if (!sdpOk(b.sdp)) return res.status(400).json({ error: 'invalid' });
    if (!(await under(`offer:${email}`, LIMITS.offer))) return res.status(429).json({ error: 'limite' });
    if (!(await kvGet(K.up(camId)))) return res.status(409).json({ error: 'cam_offline' });
    const nsid = randomBytes(12).toString('hex');
    await kvSet(K.offer(nsid), { camId, email, sdp: b.sdp }, TTL.sess);
    const mine = { sid: nsid, email, at: Date.now() };
    if (!(await kvSetNX(K.lock(camId), mine, TTL.lock))) {
      const cur = await kvGet(K.lock(camId));
      if (cur && !(b.takeover && cur.email === email)) { await kvDel(K.offer(nsid)); return res.status(409).json({ error: 'busy' }); }
      if (cur) await cleanup(cur.sid, null, 'replaced');
      await kvSet(K.lock(camId), mine, TTL.lock);
    }
    return res.status(200).json({ sid: nsid, iceServers: ICE_SERVERS });
  }
  if (!sid) return res.status(400).json({ error: 'invalid' });
  const lock = await kvGet(K.lock(camId));
  const mine = lock && lock.sid === sid && lock.email === email;

  if (action === 'hangup') {
    if (mine || (await kvGet(K.offer(sid)))?.email === email) {
      const reason = ['timeout', 'failed'].includes(b.reason) ? b.reason : 'viewer';
      if (reason !== 'viewer') await stat('fail', sid);
      await cleanup(sid, camId, reason);
    }
    return res.status(200).json({ ok: true });
  }
  if (!mine) {
    /* la sesión no es (o ya no es) de esta cuenta: no se muestra nada de ella */
    const o = await kvGet(K.offer(sid));
    if (o && o.email !== email) return res.status(403).json({ error: 'forbidden' });
    const end = await kvGet(K.end(sid));
    return res.status(200).json({ ended: true, reason: end?.reason || 'expired', ice: [], next: 0 });
  }
  if (action === 'ice') return (await pushIce(sid, 'v', b.cands)) ? res.status(200).json({ ok: true }) : res.status(429).json({ error: 'limite' });
  /* poll: renueva el candado (un viewer por vez mientras siga mirando) */
  await kvSet(K.lock(camId), { ...lock, at: Date.now() }, TTL.lock);
  if (b.connected) await stat('ok', sid);
  const ans = await kvGet(K.answer(sid));
  const { ice, next } = await readIce(sid, 'c', b.since);
  return res.status(200).json({ ...(ans ? { answer: ans.sdp } : {}), ice, next });
}
