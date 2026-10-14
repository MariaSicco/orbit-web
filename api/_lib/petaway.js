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
import { kvGet, kvSet, kvDel, kvSetNX } from './kv.js';
import { isAdmin } from './admin.js';
import { hasMimitos } from './petpush.js';

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

export async function verifyCameraToken(token) {
  if (!camTokenOk(token)) return null;
  const hash = sha(token);
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
  await kvDel(camDevKey(c.hash));
  await kvSet(camListKey(email), cams.filter(x => x.camId !== camId));
  return true;
}

/* lo que ve la dueña en Cuenta → Cámaras (nunca el hash) */
export const publicCam = c => ({ camId: c.camId, petId: c.petId, name: c.name, at: c.at, seen: c.seen || c.at });
