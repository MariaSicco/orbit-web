/* Envío de emails: Brevo (o Resend como alternativa). */
const FROM = () => {
  const raw = process.env.BREVO_FROM || process.env.RESEND_FROM || 'Orbit <hola@orbitando.com.ar>';
  const m = raw.match(/^(.*?)\s*<(.+)>$/);
  return m ? { name: m[1] || 'Orbit', email: m[2] } : { name: 'Orbit', email: raw };
};
export const emailReady = () => Boolean(process.env.BREVO_API_KEY || process.env.RESEND_API_KEY);

export async function sendEmail({ to, subject, html, text }) {
  const from = FROM();
  if (process.env.BREVO_API_KEY) {
    const r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ sender: from, to: [{ email: to }], subject, htmlContent: html, textContent: text }),
    });
    if (!r.ok) throw new Error(`brevo ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return { sent: true, via: 'brevo' };
  }
  if (process.env.RESEND_API_KEY) {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: `${from.name} <${from.email}>`, to: [to], subject, html, text }),
    });
    if (!r.ok) throw new Error(`resend ${r.status}`);
    return { sent: true, via: 'resend' };
  }
  return { sent: false };
}

/* plantilla con la estética Orbit */
export const layout = ({ eyebrow, title, body, cta, ctaUrl, foot }) => `
<div style="background:#0D0D0E;color:#F2EFE8;font-family:Helvetica,Arial,sans-serif;padding:40px 28px">
  <p style="font:11px/1.5 ui-monospace,monospace;letter-spacing:.08em;text-transform:uppercase;opacity:.6;margin:0">${eyebrow}</p>
  <h1 style="font-size:34px;line-height:1.02;letter-spacing:-.03em;margin:18px 0 14px;text-transform:uppercase">${title}</h1>
  <div style="font-size:15px;line-height:1.5;opacity:.85">${body}</div>
  ${cta ? `<p style="margin:26px 0"><a href="${ctaUrl}" style="display:inline-block;background:#D9FF45;color:#0D0D0E;padding:14px 22px;text-decoration:none;font-weight:600">${cta}</a></p>` : ''}
  <p style="font:11px/1.6 ui-monospace,monospace;opacity:.5;margin-top:30px;border-top:1px solid #242426;padding-top:16px">
    ORBIT® — IDEAS IN MOTION · orbitando.com.ar${foot ? `<br>${foot}` : ''}
  </p>
</div>`;
