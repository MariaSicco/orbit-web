/* Avisos nativos de la app de Mimitos para iPhone (Apple Push Notification service).
   La app (Capacitor, ~/OrbitStudio/mimitos-app) registra el iPhone y nos manda su token; acá se lo
   mandamos a Apple por HTTP/2 firmado con la clave .p8 de la cuenta de desarrolladora.
   Variables: APNS_KEY (contenido del .p8, con o sin saltos de línea), APNS_KEY_ID (10 caracteres),
   APNS_TEAM_ID (por defecto LL5M8XA2QY) y APNS_TOPIC (por defecto com.bymajostudio.mimitos).
   Sin APNS_KEY / APNS_KEY_ID no se manda nada (falla cerrado) y el resto de los avisos sigue igual. */
import http2 from 'node:http2';
import crypto from 'node:crypto';

const TEAM = () => process.env.APNS_TEAM_ID || 'LL5M8XA2QY';
const TOPIC = () => process.env.APNS_TOPIC || 'com.bymajostudio.mimitos';
const HOSTS = { production: 'https://api.push.apple.com', development: 'https://api.sandbox.push.apple.com' };

export const apnsReady = () => Boolean(process.env.APNS_KEY && process.env.APNS_KEY_ID);

/* el .p8 pegado en Vercel a veces pierde los saltos de línea: lo rearmamos */
function pem() {
  const raw = String(process.env.APNS_KEY || '').replace(/\\n/g, '\n').trim();
  if (raw.includes('\n')) return raw;
  const body = raw.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '').replace(/\s+/g, '');
  return `-----BEGIN PRIVATE KEY-----\n${body.match(/.{1,64}/g).join('\n')}\n-----END PRIVATE KEY-----`;
}

/* Apple pide renovar el JWT entre 20 y 60 minutos: lo reusamos 50 */
let jwt = null;
const b64u = b => Buffer.from(b).toString('base64url');
export function apnsJwt(now = Date.now()) {
  if (jwt && now - jwt.at < 50 * 60e3) return jwt.token;
  const head = b64u(JSON.stringify({ alg: 'ES256', kid: process.env.APNS_KEY_ID }));
  const claims = b64u(JSON.stringify({ iss: TEAM(), iat: Math.floor(now / 1000) }));
  const sig = crypto.sign('sha256', Buffer.from(`${head}.${claims}`), { key: pem(), dsaEncoding: 'ieee-p1363' });
  jwt = { token: `${head}.${claims}.${b64u(sig)}`, at: now };
  return jwt.token;
}

/* token del iPhone: 64 a 200 caracteres hexadecimales */
export const cleanApnsToken = t => typeof t === 'string' && /^[0-9a-f]{64,200}$/i.test(t) ? t.toLowerCase() : null;
export const cleanApnsList = list => (Array.isArray(list) ? list : [])
  .map(x => x && cleanApnsToken(x.token) ? { token: x.token.toLowerCase(), env: x.env === 'development' ? 'development' : x.env === 'production' ? 'production' : null, at: x.at || null } : null)
  .filter(Boolean).slice(-6);

/* el mismo aviso que el web push: { title, body, url, tag } */
export const apnsPayload = p => JSON.stringify({
  aps: { alert: { title: String(p.title || 'Mimitos'), body: String(p.body || '') }, sound: 'default', 'thread-id': String(p.tag || 'mimitos').slice(0, 64) },
  url: p.url || '/mascotas',
});

function post(env, token, body, tag) {
  return new Promise(resolve => {
    let s;
    try { s = http2.connect(HOSTS[env]); } catch { return resolve({ status: 0 }); }
    s.on('error', () => resolve({ status: 0 }));
    const headers = {
      ':method': 'POST', ':path': `/3/device/${token}`, authorization: `bearer ${apnsJwt()}`,
      'apns-topic': TOPIC(), 'apns-push-type': 'alert', 'apns-priority': '10',
      'apns-expiration': String(Math.floor(Date.now() / 1000) + 60 * 60 * 24),
    };
    if (tag) headers['apns-collapse-id'] = String(tag).slice(0, 64);
    const r = s.request(headers);
    let status = 0, data = '';
    r.setEncoding('utf8');
    r.on('response', h => { status = h[':status']; });
    r.on('data', c => { data += c; });
    r.on('end', () => { s.close(); let reason = ''; try { reason = JSON.parse(data).reason || ''; } catch {} resolve({ status, reason }); });
    r.on('error', () => { s.close(); resolve({ status: 0 }); });
    r.setTimeout(10000, () => { r.close(); s.close(); resolve({ status: 0 }); });
    r.end(body);
  });
}

/* Manda a un iPhone. La app instalada desde Xcode usa el ambiente de prueba (sandbox) y la de TestFlight o
   la App Store el de producción: si no sabemos cuál es, probamos producción y, ante BadDeviceToken, sandbox.
   Devuelve { ok, env } con el ambiente que funcionó, o { gone: true } si el token ya no existe. */
export async function apnsSend(dev, p, deps = { post }) {
  if (!apnsReady()) return { ok: false };
  const body = apnsPayload(p);
  const envs = dev.env ? [dev.env] : ['production', 'development'];
  for (const env of envs) {
    const r = await deps.post(env, dev.token, body, p.tag);
    if (r.status === 200) return { ok: true, env };
    if (r.status === 410 || r.reason === 'Unregistered') return { gone: true };
    if (r.reason === 'BadDeviceToken' && envs.length > 1) continue;
    if (r.reason === 'BadDeviceToken') return { gone: true };
    return { ok: false };
  }
  return { gone: true };
}
