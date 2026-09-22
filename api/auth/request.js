/* Pide el enlace de acceso: token de un solo uso enviado por email. */
import { kvSet } from '../_lib/kv.js';
import { isEmail, newToken, hasSecret, readBody } from '../_lib/auth.js';
import { siteUrl } from '../_lib/catalog.js';
import { sendEmail, emailReady, layout } from '../_lib/email.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  if (!hasSecret()) return res.status(503).json({ error: 'not_configured', message: 'Falta SESSION_SECRET' });
  const { email } = await readBody(req);
  if (!isEmail(email)) return res.status(400).json({ error: 'invalid_email' });

  const token = newToken();
  await kvSet(`orbit:magic:${token}`, { email: email.toLowerCase() }, 60 * 20);
  const link = `${siteUrl(req)}/api/auth/verify?token=${token}`;

  if (!emailReady()) return res.status(200).json({ ok: true, emailSent: false, link });
  try {
    await sendEmail({
      to: email,
      subject: 'Tu acceso a Orbit',
      text: `Entrá a tu biblioteca Orbit:\n${link}\n\nEl enlace vence en 20 minutos.`,
      html: layout({
        eyebrow: 'OB—000 · Acceso',
        title: 'Tu acceso a Orbit',
        body: '<p>Entrá a tu biblioteca con este enlace. Vence en 20 minutos y sirve una sola vez.</p>',
        cta: 'Entrar a mi biblioteca →', ctaUrl: link,
        foot: 'Si no pediste este acceso, ignorá este email.',
      }),
    });
  } catch (e) {
    return res.status(502).json({ error: 'email_error', detail: String(e).slice(0, 200) });
  }
  res.status(200).json({ ok: true, emailSent: true });
}
