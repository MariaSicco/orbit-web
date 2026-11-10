import { createHmac, timingSafeEqual, randomBytes, scryptSync } from 'node:crypto';

const SECRET = process.env.SESSION_SECRET || '';
const COOKIE = 'orbit_session';
const HINT = 'orbit_user'; /* pista legible por el sitio: solo dice que hay sesión y con qué nombre */
const MAX_AGE = 60 * 60 * 24 * 180; /* 180 días: la sesión sobrevive a cerrar el navegador o la app del celu */
const RENEW_AFTER = 60 * 60 * 24; /* se renueva sola, como mucho una vez por día, mientras se use */

const b64 = s => Buffer.from(s).toString('base64url');
const unb64 = s => Buffer.from(s, 'base64url').toString();
const sign = data => createHmac('sha256', SECRET).update(data).digest('base64url');

export const hasSecret = () => SECRET.length >= 16;
export const newToken = () => randomBytes(32).toString('base64url');

export function makeSession(email) {
  const payload = b64(JSON.stringify({ email, exp: Date.now() + MAX_AGE * 1000 }));
  return `${payload}.${sign(payload)}`;
}
export function readSession(req) {
  const raw = (req.headers.cookie || '').split(';').map(c => c.trim()).find(c => c.startsWith(COOKIE + '='));
  if (!raw || !hasSecret()) return null;
  const [payload, sig] = raw.slice(COOKIE.length + 1).split('.');
  if (!payload || !sig) return null;
  const expected = sign(payload);
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(unb64(payload));
    return data.exp > Date.now() ? data : null;
  } catch { return null; }
}
/* Con Max-Age: la sesión queda guardada aunque cierres el navegador o la app
   de la pantalla de inicio (en el iPhone, las cookies de sesión se pierden al cerrarla). */
const sessionCookies = (email, hint) => [
  `${COOKIE}=${makeSession(email)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${MAX_AGE}`,
  `${HINT}=${hint || '1'}; Path=/; Secure; SameSite=Lax; Max-Age=${MAX_AGE}`,
];
export function setSessionCookie(res, email, name = '') {
  const first = String(name || '').trim().split(/\s+/)[0].slice(0, 24);
  res.setHeader('Set-Cookie', sessionCookies(email, encodeURIComponent(first)));
}
/* Mientras se usa, la sesión se estira otros 180 días (una vez por día como mucho):
   quien entra seguido no vuelve a ver el login. Respeta las cookies que ya puso la respuesta. */
export function renewSessionCookie(req, res, session) {
  if (!session?.email || !hasSecret()) return;
  if (session.exp - Date.now() > (MAX_AGE - RENEW_AFTER) * 1000) return;
  const hint = (req.headers.cookie || '').split(';').map(c => c.trim()).find(c => c.startsWith(HINT + '='))?.slice(HINT.length + 1);
  const prev = res.getHeader('Set-Cookie');
  res.setHeader('Set-Cookie', [...(prev ? [].concat(prev) : []), ...sessionCookies(session.email, hint)]);
}
export function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', [
    `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
    `${HINT}=; Path=/; Secure; SameSite=Lax; Max-Age=0`,
  ]);
}
/* Saca espacios que meten los gestores de contraseñas y el autocompletado. */
export const cleanEmail = v => String(v == null ? '' : v).replace(/\s+/g, '').replace(/^mailto:/i, '').toLowerCase();
export const isEmail = v => typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && v.length < 200;
export async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = []; for await (const c of req) chunks.push(c);
  try { return JSON.parse(Buffer.concat(chunks).toString() || '{}'); } catch { return {}; }
}

/* ---------- contraseñas ---------- */
/* scrypt con sal por usuario: la contraseña nunca se guarda ni se puede recuperar. */
export function hashPassword(password) {
  const salt = randomBytes(16).toString('base64url');
  const hash = scryptSync(password.normalize('NFKC'), salt, 64).toString('base64url');
  return `scrypt$${salt}$${hash}`;
}
export function verifyPassword(password, stored) {
  try {
    const [algo, salt, hash] = String(stored).split('$');
    if (algo !== 'scrypt' || !salt || !hash) return false;
    const test = scryptSync(String(password).normalize('NFKC'), salt, 64);
    const a = Buffer.from(hash, 'base64url');
    return a.length === test.length && timingSafeEqual(a, test);
  } catch { return false; }
}
export const passwordProblem = pw =>
  typeof pw !== 'string' ? 'invalid'
  : pw.length < 8 ? 'short'
  : pw.length > 200 ? 'long'
  : null;
