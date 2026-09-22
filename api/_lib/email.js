/* Envío de emails: Brevo (o Resend como alternativa). */
export const FROM = () => {
  const raw = (process.env.BREVO_FROM || process.env.RESEND_FROM || 'Orbit <hola@orbitando.com.ar>')
    .replace(/[​-‍﻿]/g, '')
    .split(/[\r\n]+/).map(l => l.trim()).find(l => l.includes('@')) /* si se pegó de más, nos quedamos con la línea del email */
    || 'Orbit <hola@orbitando.com.ar>';
  const m = raw.trim().replace(/^["']|["']$/g, '').trim().match(/^(.*?)\s*<\s*([^<>\s]+)\s*>$/);
  const name = (m ? m[1] : '').replace(/^["']|["']$/g, '').trim() || 'Orbit';
  const email = (m ? m[2] : raw).trim();
  return { name, email };
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

/* ------------------------------------------------------------------ *
   Plantilla Orbit para email.
   Todo en tablas y con estilos escritos a mano: es lo único que
   respetan Gmail, Outlook y Apple Mail por igual.
 * ------------------------------------------------------------------ */
const K = '#0D0D0E', K2 = '#151516', K3 = '#26262A', BONE = '#F2EFE8', DIM = '#A8A49C', GREY = '#6F6D68';
const SANS = "'Helvetica Neue',Helvetica,Arial,sans-serif";
const MONO = "'IBM Plex Mono','Courier New',Courier,monospace";
const SERIF = "Georgia,'Times New Roman',serif";
const ACCENTS = {
  acid: { bg: '#D9FF45', on: K },
  blue: { bg: '#3047FF', on: BONE },
  fuego: { bg: '#FF4F2E', on: K },
  bone: { bg: BONE, on: K },
};
const site = () => process.env.SITE_URL || 'https://www.orbitando.com.ar';
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* una palabra en serif itálica, para el acento editorial de la marca */
export const it = (text, color) =>
  `<i style="font-family:${SERIF};font-style:italic;font-weight:400;letter-spacing:-.5px;text-transform:none;color:${color || 'inherit'}">${text}</i>`;

export const layout = ({
  eyebrow = 'ORBIT®', title = '', body = '', cta, ctaUrl, foot,
  accent = 'acid', preheader = '', items = null, meta = null, sign = true,
} = {}) => {
  const a = ACCENTS[accent] || ACCENTS.acid;
  const url = site();

  const itemsHtml = items && items.length ? `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:26px 0 0;border-top:1px solid ${K3}">
          ${items.map(i => `<tr>
            <td style="padding:14px 0 13px;border-bottom:1px solid ${K3};font-family:${MONO};font-size:11px;letter-spacing:1.2px;color:${GREY};white-space:nowrap;vertical-align:top;width:74px">${esc(i.code || '')}</td>
            <td style="padding:14px 0 13px;border-bottom:1px solid ${K3};font-family:${SANS};font-size:15px;font-weight:700;letter-spacing:-.3px;text-transform:uppercase;color:${BONE}">${esc(i.name || '')}</td>
            <td style="padding:14px 0 13px;border-bottom:1px solid ${K3};font-family:${MONO};font-size:11px;letter-spacing:1.2px;color:${DIM};text-align:right;white-space:nowrap">${i.qty > 1 ? '&times;' + i.qty : '01'}</td>
          </tr>`).join('')}
        </table>` : '';

  const metaHtml = meta && meta.length ? `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:22px 0 0">
          ${meta.map(([k, v]) => `<tr>
            <td style="padding:5px 0;font-family:${MONO};font-size:11px;letter-spacing:1.2px;text-transform:uppercase;color:${GREY}">${esc(k)}</td>
            <td style="padding:5px 0;font-family:${SANS};font-size:14px;font-weight:600;color:${BONE};text-align:right">${esc(v)}</td>
          </tr>`).join('')}
        </table>` : '';

  const ctaHtml = cta && ctaUrl ? `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:30px 0 4px">
          <tr><td bgcolor="${a.bg}" style="border-radius:0">
            <a href="${ctaUrl}" style="display:inline-block;padding:16px 28px;font-family:${SANS};font-size:15px;font-weight:700;letter-spacing:-.2px;color:${a.on};text-decoration:none">${esc(cta)}</a>
          </td></tr>
        </table>` : '';

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><title>${esc(title.replace(/<[^>]+>/g, ''))}</title></head>
<body style="margin:0;padding:0;background:${K};-webkit-font-smoothing:antialiased">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;font-size:1px;line-height:1px">${esc(preheader)}&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${K}">
 <tr><td align="center" style="padding:24px 14px 44px">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px;max-width:600px">

   <tr><td height="4" bgcolor="${a.bg}" style="height:4px;line-height:4px;font-size:0">&nbsp;</td></tr>

   <tr><td style="background:${K2};padding:20px 30px 18px">
     <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
       <td style="vertical-align:middle;width:38px"><img src="${url}/icon-192.png" width="34" height="34" alt="" style="display:block;width:34px;height:34px;border:0"></td>
       <td style="vertical-align:middle;padding-left:11px;font-family:${SANS};font-size:23px;font-weight:800;letter-spacing:-1px;color:${BONE}">ORBIT<span style="font-size:9px;font-weight:600;letter-spacing:0;vertical-align:super">®</span></td>
       <td style="vertical-align:middle;text-align:right;font-family:${MONO};font-size:10px;letter-spacing:1.4px;text-transform:uppercase;color:${GREY}">Ideas in motion</td>
     </tr></table>
   </td></tr>

   <tr><td style="background:${K2};padding:6px 30px 36px">
     <p style="margin:0;font-family:${MONO};font-size:11px;line-height:1.4;letter-spacing:1.6px;text-transform:uppercase;color:${a.bg}">${esc(eyebrow)}</p>
     <h1 style="margin:16px 0 0;font-family:${SANS};font-size:38px;line-height:1.02;font-weight:800;letter-spacing:-1.6px;text-transform:uppercase;color:${BONE}">${title}</h1>
     <div style="margin:18px 0 0;font-family:${SANS};font-size:15px;line-height:1.62;color:${DIM}">${body}</div>
     ${itemsHtml}
     ${metaHtml}
     ${ctaHtml}
   </td></tr>

   <tr><td style="background:${K};padding:20px 30px 0">
     <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr><td height="1" bgcolor="${K3}" style="height:1px;line-height:1px;font-size:0">&nbsp;</td></tr></table>
   </td></tr>

   <tr><td style="background:${K};padding:18px 30px 6px">
     ${sign ? `<p style="margin:0 0 10px;font-family:${SERIF};font-style:italic;font-size:16px;line-height:1.4;color:${BONE};opacity:.9">Problema &rarr; herramienta.</p>` : ''}
     ${foot ? `<p style="margin:0 0 12px;font-family:${SANS};font-size:13px;line-height:1.55;color:${GREY}">${foot}</p>` : ''}
     <p style="margin:0;font-family:${MONO};font-size:10px;line-height:1.7;letter-spacing:1.2px;text-transform:uppercase;color:${GREY}">
       ORBIT® &mdash; Digital goods for creative people<br>
       <a href="${url}" style="color:${GREY};text-decoration:none">orbitando.com.ar</a> &nbsp;·&nbsp;
       <a href="mailto:hola@orbitando.com.ar" style="color:${GREY};text-decoration:none">hola@orbitando.com.ar</a>
     </p>
   </td></tr>

  </table>
 </td></tr>
</table>
</body></html>`;
};
