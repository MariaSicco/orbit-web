/* Entrar con email y contraseña. */
import { isEmail, cleanEmail, readBody, verifyPassword, setSessionCookie, hasSecret } from '../_lib/auth.js';
import { getUser, tooManyAttempts } from '../_lib/users.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  if (!hasSecret()) return res.status(503).json({ error: 'not_configured' });
  const body = await readBody(req);
  const email = cleanEmail(body.email);
  const password = body.password;
  if (!isEmail(email)) return res.status(400).json({ error: 'invalid_email' });
  if (await tooManyAttempts(email)) return res.status(429).json({ error: 'too_many_attempts' });
  const user = await getUser(email);
  /* misma respuesta exista o no la cuenta: no revelamos qué emails están registrados */
  if (!user?.hash || !verifyPassword(password, user.hash)) return res.status(401).json({ error: 'bad_credentials' });
  setSessionCookie(res, user.email, user.name);
  res.status(200).json({ ok: true, email: user.email });
}
