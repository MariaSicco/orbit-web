/* Crear cuenta con email y contraseña. */
import { isEmail, readBody, hashPassword, passwordProblem, setSessionCookie, hasSecret } from '../_lib/auth.js';
import { getUser, saveUser } from '../_lib/users.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  if (!hasSecret()) return res.status(503).json({ error: 'not_configured' });
  const { email, password, name } = await readBody(req);
  if (!isEmail(email)) return res.status(400).json({ error: 'invalid_email' });
  const pw = passwordProblem(password);
  if (pw) return res.status(400).json({ error: 'weak_password', reason: pw });
  const existing = await getUser(email);
  if (existing?.hash) return res.status(409).json({ error: 'email_taken' });
  await saveUser({
    email: email.toLowerCase(),
    name: typeof name === 'string' ? name.slice(0, 80) : '',
    hash: hashPassword(password),
    createdAt: new Date().toISOString(),
  });
  setSessionCookie(res, email.toLowerCase());
  res.status(200).json({ ok: true, email: email.toLowerCase() });
}
