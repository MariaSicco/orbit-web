import { kvGet, kvSet } from './kv.js';
const key = email => `orbit:user:${email.toLowerCase()}`;
export const getUser = email => kvGet(key(email));
export const saveUser = user => kvSet(key(user.email), user);
/* límite simple de intentos por email */
export async function tooManyAttempts(email) {
  const k = `orbit:try:${email.toLowerCase()}`;
  const n = (await kvGet(k)) || 0;
  if (n >= 8) return true;
  await kvSet(k, n + 1, 60 * 15);
  return false;
}
