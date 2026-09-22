/* Pide el enlace de acceso: token de un solo uso enviado por email.
   Con reset:true el enlace además habilita definir una contraseña nueva. */
import { kvSet } from '../_lib/kv.js';
import { isEmail, newToken, hasSecret, readBody } from '../_lib/auth.js';
import { siteUrl } from '../_lib/catalog.js';
import { sendEmail, emailReady, layout, it } from '../_lib/email.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  if (!hasSecret()) return res.status(503).json({ error: 'not_configured', message: 'Falta SESSION_SECRET' });
  const { email, reset } = await readBody(req);
  if (!isEmail(email)) return res.status(400).json({ error: 'invalid_email' });

  const token = newToken();
  await kvSet(`orbit:magic:${token}`, { email: email.toLowerCase(), reset: reset === true }, 60 * 20);
  const link = `${siteUrl(req)}/api/auth/verify?token=${token}${reset === true ? '&reset=1' : ''}`;

  if (!emailReady()) return res.status(200).json({ ok: true, emailSent: false, link });
  const copy = reset === true
    ? {
        subject: 'Elegí una contraseña nueva',
        text: `Entrá con este enlace y elegí una contraseña nueva:\n${link}\n\nVence en 20 minutos y sirve una sola vez.`,
        accent: 'fuego',
        preheader: 'Un enlace de un solo uso para definir tu contraseña nueva.',
        eyebrow: 'OB—000 · Contraseña',
        title: `Elegí una<br>contraseña ${it('nueva.', '#FF4F2E')}`,
        body: '<p style="margin:0 0 14px">Tocá el botón y definí tu contraseña nueva.</p><p style="margin:0">Este enlace vence en 20 minutos y sirve una sola vez.</p>',
        cta: 'Cambiar mi contraseña →',
        foot: 'Si no pediste este cambio, ignorá este email: tu contraseña actual sigue funcionando.',
      }
    : {
        subject: 'Tu acceso a Orbit',
        text: `Entrá a tu cuenta Orbit con este enlace:\n${link}\n\nVence en 20 minutos y sirve una sola vez.`,
        accent: 'bone',
        preheader: 'Tu enlace de acceso, válido por 20 minutos.',
        eyebrow: 'OB—000 · Acceso',
        title: `Tu puerta<br>de ${it('entrada.', '#F2EFE8')}`,
        body: '<p style="margin:0 0 14px">Tocá el botón y entrás directo a tu cuenta, sin escribir contraseña.</p><p style="margin:0">Este enlace vence en 20 minutos y sirve una sola vez.</p>',
        cta: 'Entrar a mi cuenta →',
        foot: 'Si no pediste este acceso, ignorá este email.',
      };
  try {
    await sendEmail({
      to: email,
      subject: copy.subject,
      text: copy.text,
      html: layout({
        accent: copy.accent, preheader: copy.preheader, eyebrow: copy.eyebrow,
        title: copy.title, body: copy.body, cta: copy.cta, ctaUrl: link, foot: copy.foot, sign: false,
      }),
    });
  } catch (e) {
    return res.status(502).json({ error: 'email_error', detail: String(e).slice(0, 200) });
  }
  res.status(200).json({ ok: true, emailSent: true });
}
