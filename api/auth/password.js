/* Definir o cambiar la contraseña (con sesión iniciada). */
import { readBody, hashPassword, passwordProblem, readSession, verifyPassword } from '../_lib/auth.js';
import { getUser, saveUser } from '../_lib/users.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  const s = readSession(req);
  if (!s) return res.status(401).json({ error: 'unauthorized' });
  const { password, current } = await readBody(req);
  const pw = passwordProblem(password);
  if (pw) return res.status(400).json({ error: 'weak_password', reason: pw });
  const user = (await getUser(s.email)) || { email: s.email, createdAt: new Date().toISOString() };
  /* si ya tenía contraseña, pedimos la anterior salvo que venga de un enlace de recuperación */
  if (user.hash && !verifyPassword(current || '', user.hash)) return res.status(403).json({ error: 'bad_current' });
  user.hash = hashPassword(password);
  await saveUser(user);
  res.status(200).json({ ok: true });
}
