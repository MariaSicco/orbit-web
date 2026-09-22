import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';

const SECRET = process.env.SESSION_SECRET || '';
const COOKIE = 'orbit_session';
const MAX_AGE = 60 * 60 * 24 * 60; // 60 días

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
export function setSessionCookie(res, email) {
  res.setHeader('Set-Cookie', `${COOKIE}=${makeSession(email)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${MAX_AGE}`);
}
export function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
}
export const isEmail = v => typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && v.length < 200;
export async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = []; for await (const c of req) chunks.push(c);
  try { return JSON.parse(Buffer.concat(chunks).toString() || '{}'); } catch { return {}; }
}
