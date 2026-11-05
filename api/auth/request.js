/* Pide el enlace de acceso: token de un solo uso enviado por email.
   Con reset:true el enlace además habilita definir una contraseña nueva. */
import { kvSet } from '../_lib/kv.js';
import { isEmail, cleanEmail, newToken, hasSecret, readBody } from '../_lib/auth.js';
import { siteUrl } from '../_lib/catalog.js';
import { sendEmail, emailReady, layout, it } from '../_lib/email.js';
import { esMimitos } from '../_lib/marca.js';

/* El enlace para entrar a Mimitos desde el dominio de By Majo, con su estética. */
const mailMimitos = link => `<!doctype html><html lang="es"><body style="margin:0;background:#37261e;font-family:Helvetica,Arial,sans-serif;color:#37261e"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#37261e"><tr><td align="center" style="padding:28px 16px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#fffeef" style="max-width:480px;background:#fffeef;border-radius:22px"><tr><td style="padding:28px 24px"><h1 style="margin:0 0 12px;font-size:32px;line-height:1.05;letter-spacing:-.03em">Entrá a Mimitos</h1><p style="margin:0 0 20px;font-size:16px;line-height:1.5">Tocá el botón y entrás directo, sin contraseña. El enlace vence en 20 minutos y sirve una sola vez.</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" bgcolor="#6b1f30" style="background:#6b1f30;border-radius:999px"><a href="${link}" style="display:block;padding:17px 20px;color:#fffeef;text-decoration:none;font-size:17px;font-weight:bold">Abrir Mimitos →</a></td></tr></table><p style="margin:18px 0 0;font-size:13px;color:#6f5a4c">Si no lo pediste, ignorá este mail. — Majo</p></td></tr></table></td></tr></table></body></html>`;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  if (!hasSecret()) return res.status(503).json({ error: 'not_configured', message: 'Falta SESSION_SECRET' });
  const body = await readBody(req);
  const email = cleanEmail(body.email);
  const reset = body.reset;
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
    if (esMimitos(req)) {
      await sendEmail({ to: email, fromName: 'Mimitos', subject: 'Tu acceso a Mimitos', text: `Entrá a Mimitos con este enlace:\n${link}\n\nVence en 20 minutos y sirve una sola vez.`, html: mailMimitos(link) });
      return res.status(200).json({ ok: true, emailSent: true });
    }
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
