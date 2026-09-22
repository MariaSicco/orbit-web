/* Crear cuenta con email y contraseña. */
import { isEmail, readBody, hashPassword, passwordProblem, setSessionCookie, hasSecret } from '../_lib/auth.js';
import { getUser, saveUser } from '../_lib/users.js';
import { sendEmail, emailReady, layout } from '../_lib/email.js';
import { upsertContact, listNews } from '../_lib/marketing.js';
import { siteUrl } from '../_lib/catalog.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  if (!hasSecret()) return res.status(503).json({ error: 'not_configured' });
  const { email, password, name, news } = await readBody(req);
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
  setSessionCookie(res, email.toLowerCase(), name);

  /* alta en la lista de novedades solo si lo aceptó */
  if (news) await upsertContact({ email, name, lists: listNews(), attributes: { ORIGEN: 'cuenta', IDIOMA: 'es' } }).catch(() => {});

  if (emailReady()) {
    const site = siteUrl(req);
    sendEmail({
      to: email,
      subject: 'Bienvenida a Orbit',
      text: `Tu cuenta ya está creada. Entrá a tu biblioteca: ${site}/biblioteca`,
      html: layout({
        eyebrow: 'OB—000 · Bienvenida',
        title: 'Entraste<br>en órbita.',
        body: '<p>Tu cuenta ya está creada. Todo lo que compres queda guardado en tu biblioteca, para siempre y con actualizaciones sin cargo.</p><p style="opacity:.7">Problema → herramienta. Ese es el método.</p>',
        cta: 'Ver mi biblioteca →', ctaUrl: `${site}/biblioteca`,
      }),
    }).catch(() => {});
  }
  res.status(200).json({ ok: true, email: email.toLowerCase() });
}
