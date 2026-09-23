/* Crear cuenta con email y contraseña. */
import { isEmail, cleanEmail, readBody, hashPassword, passwordProblem, setSessionCookie, hasSecret } from '../_lib/auth.js';
import { getUser, saveUser } from '../_lib/users.js';
import { sendEmail, emailReady, layout, it } from '../_lib/email.js';
import { upsertContact, listNews } from '../_lib/marketing.js';
import { siteUrl } from '../_lib/catalog.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  if (!hasSecret()) return res.status(503).json({ error: 'not_configured' });
  const body = await readBody(req);
  const email = cleanEmail(body.email);
  const { password, name, news } = body;
  if (!isEmail(email)) return res.status(400).json({ error: 'invalid_email' });
  const pw = passwordProblem(password);
  if (pw) return res.status(400).json({ error: 'weak_password', reason: pw });
  const existing = await getUser(email);
  if (existing?.hash) return res.status(409).json({ error: 'email_taken' });
  await saveUser({
    email: email.toLowerCase(),
    name: typeof name === 'string' ? name.slice(0, 80) : '',
    hash: hashPassword(password),
    news: news === true,
    createdAt: new Date().toISOString(),
  });
  setSessionCookie(res, email.toLowerCase(), name);

  /* alta en la lista de novedades solo si lo aceptó */
  if (news) await upsertContact({ email, name, lists: listNews(), attributes: { ORIGEN: 'cuenta', IDIOMA: 'es' } }).catch(() => {});

  if (emailReady()) {
    const site = siteUrl(req);
    const hola = typeof name === 'string' && name.trim() ? `Hola, ${name.trim().split(/\s+/)[0]}. ` : '';
    sendEmail({
      to: email,
      subject: 'Entraste en órbita',
      text: `${hola}Tu cuenta de Orbit ya está creada.\n\nTodo lo que compres queda guardado en tu cuenta, para siempre y con las actualizaciones incluidas.\n\nTu cuenta: ${site}/biblioteca`,
      html: layout({
        accent: 'acid',
        preheader: 'Tu cuenta ya está creada. Todo lo que compres queda guardado ahí.',
        eyebrow: 'OB—000 · Bienvenida',
        title: `Entraste<br>en ${it('órbita.', '#D9FF45')}`,
        body: `<p style="margin:0 0 14px">${hola}Tu cuenta ya está creada.</p>
               <p style="margin:0 0 14px">Todo lo que compres queda guardado ahí: los archivos, las versiones nuevas y el historial de pedidos. Sin suscripción y sin vencimiento.</p>
               <p style="margin:0">Cuando quieras entrar, el ícono de cuenta está arriba a la derecha en todo el sitio.</p>`,
        cta: 'Ver mi cuenta →', ctaUrl: `${site}/biblioteca`,
        meta: [['Tu email', email.toLowerCase()]],
        foot: 'Cada herramienta de Orbit nace de un problema real. Si te falta una, escribinos y la armamos.',
      }),
    }).catch(() => {});
  }
  res.status(200).json({ ok: true, email: email.toLowerCase() });
}
