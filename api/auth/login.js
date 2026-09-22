/* Entrar con email y contraseña. */
import { isEmail, readBody, verifyPassword, setSessionCookie, hasSecret } from '../_lib/auth.js';
import { getUser, tooManyAttempts } from '../_lib/users.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  if (!hasSecret()) return res.status(503).json({ error: 'not_configured' });
  const { email, password } = await readBody(req);
  if (!isEmail(email)) return res.status(400).json({ error: 'invalid_email' });
  if (await tooManyAttempts(email)) return res.status(429).json({ error: 'too_many_attempts' });
  const user = await getUser(email);
  /* misma respuesta exista o no la cuenta: no revelamos qué emails están registrados */
  if (!user?.hash || !verifyPassword(password, user.hash)) return res.status(401).json({ error: 'bad_credentials' });
  setSessionCookie(res, user.email);
  res.status(200).json({ ok: true, email: user.email });
}
