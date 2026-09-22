/* Pide el enlace de acceso: guarda un token de un solo uso y lo manda por email. */
import { kvSet } from '../_lib/kv.js';
import { isEmail, newToken, hasSecret, readBody } from '../_lib/auth.js';
import { siteUrl } from '../_lib/catalog.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  if (!hasSecret()) return res.status(503).json({ error: 'not_configured', message: 'Falta SESSION_SECRET' });
  const { email } = await readBody(req);
  if (!isEmail(email)) return res.status(400).json({ error: 'invalid_email' });

  const token = newToken();
  await kvSet(`orbit:magic:${token}`, { email: email.toLowerCase() }, 60 * 20); // 20 minutos
  const link = `${siteUrl(req)}/api/auth/verify?token=${token}`;

  const key = process.env.RESEND_API_KEY;
  if (!key) return res.status(200).json({ ok: true, emailSent: false, link });  // sin email configurado: se devuelve el enlace
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.RESEND_FROM || 'Orbit <hola@orbit.studio>',
      to: [email],
      subject: 'Tu acceso a Orbit',
      text: `Entrá a tu biblioteca Orbit:\n${link}\n\nEl enlace vence en 20 minutos.\nOrbit® — Ideas in motion`,
      html: `<div style="font-family:Helvetica,Arial,sans-serif;background:#0D0D0E;color:#F2EFE8;padding:40px">
        <p style="font:11px/1.5 monospace;letter-spacing:.08em;text-transform:uppercase;opacity:.6">Orbit® — Ideas in motion</p>
        <h1 style="font-size:34px;letter-spacing:-.03em;margin:18px 0">Tu acceso a Orbit</h1>
        <p style="opacity:.8">Entrá a tu biblioteca con este enlace. Vence en 20 minutos.</p>
        <p><a href="${link}" style="display:inline-block;background:#D9FF45;color:#0D0D0E;padding:14px 22px;text-decoration:none;font-weight:600">Entrar a mi biblioteca →</a></p>
        <p style="font:11px monospace;opacity:.5;margin-top:28px">Si no pediste este acceso, ignorá este email.</p>
      </div>`,
    }),
  });
  if (!r.ok) return res.status(502).json({ error: 'email_error', detail: await r.text() });
  res.status(200).json({ ok: true, emailSent: true });
}
