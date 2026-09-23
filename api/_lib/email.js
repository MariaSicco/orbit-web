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

   Va sobre fondo claro a propósito: Gmail en el celular invierte los
   correos diseñados en negro y los desarma. Todo en tablas, con padding
   en cada celda, para que a 320px nada se pegue ni se encime.
 * ------------------------------------------------------------------ */
const TINTA = '#0D0D0E', HUESO = '#F2EFE8', PAPEL = '#E4E0D6', GRIS = '#6F6D68', SUAVE = '#D6D2C7';
const SANS = "'Helvetica Neue',Helvetica,Arial,sans-serif";
const MONO = "'IBM Plex Mono','Courier New',Courier,monospace";
const SERIF = "Georgia,'Times New Roman',serif";
const ACENTOS = {
  acid:  { barra: '#D9FF45', fondo: TINTA,     texto: HUESO, tinta: TINTA },
  blue:  { barra: '#3047FF', fondo: '#3047FF', texto: '#FFFFFF', tinta: '#2438CC' },
  fuego: { barra: '#FF4F2E', fondo: '#FF4F2E', texto: TINTA, tinta: '#D63A1C' },
  bone:  { barra: TINTA,     fondo: TINTA,     texto: HUESO, tinta: TINTA },
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
  const a = ACENTOS[accent] || ACENTOS.acid;
  const url = site();

  /* cada producto en su fila: código arriba, nombre abajo, cantidad a la
     derecha. Así no se pegan aunque la pantalla sea angosta. */
  const itemsHtml = items && items.length ? `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:26px 0 0;border-collapse:collapse">
          <tr><td colspan="2" height="1" bgcolor="${SUAVE}" style="height:1px;line-height:1px;font-size:0">&nbsp;</td></tr>
          ${items.map(i => `<tr>
            <td style="padding:14px 12px 13px 0;border-bottom:1px solid ${SUAVE};vertical-align:top">
              <span style="font-family:${MONO};font-size:11px;letter-spacing:1.2px;color:${GRIS};display:block;padding-bottom:4px">${esc(i.code || '')}</span>
              <span style="font-family:${SANS};font-size:16px;font-weight:700;letter-spacing:-.3px;text-transform:uppercase;color:${TINTA}">${esc(i.name || '')}</span>
            </td>
            <td width="52" style="padding:14px 0 13px 12px;border-bottom:1px solid ${SUAVE};vertical-align:top;text-align:right;font-family:${MONO};font-size:12px;letter-spacing:1px;color:${GRIS};white-space:nowrap">${i.qty > 1 ? '&times;&nbsp;' + i.qty : '01'}</td>
          </tr>`).join('')}
        </table>` : '';

  const metaHtml = meta && meta.length ? `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:22px 0 0;border-collapse:collapse">
          ${meta.map(([k, v]) => `<tr>
            <td style="padding:7px 14px 7px 0;font-family:${MONO};font-size:11px;letter-spacing:1.2px;text-transform:uppercase;color:${GRIS};vertical-align:top;white-space:nowrap">${esc(k)}</td>
            <td style="padding:7px 0;font-family:${SANS};font-size:15px;font-weight:700;color:${TINTA};text-align:right;vertical-align:top">${esc(v)}</td>
          </tr>`).join('')}
        </table>` : '';

  const ctaHtml = cta && ctaUrl ? `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:30px 0 4px">
          <tr><td bgcolor="${a.fondo}">
            <a href="${ctaUrl}" style="display:block;padding:17px 30px;font-family:${SANS};font-size:16px;font-weight:700;letter-spacing:-.2px;color:${a.texto};text-decoration:none">${esc(cta)}</a>
          </td></tr>
        </table>` : '';

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">
<title>${esc(title.replace(/<[^>]+>/g, ''))}</title></head>
<body style="margin:0;padding:0;background:${PAPEL};-webkit-font-smoothing:antialiased">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;font-size:1px;line-height:1px">${esc(preheader)}&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${PAPEL}">
 <tr><td align="center" style="padding:20px 12px 40px">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:100%;max-width:600px">

   <tr><td height="5" bgcolor="${a.barra}" style="height:5px;line-height:5px;font-size:0">&nbsp;</td></tr>

   <tr><td style="background:${HUESO};padding:22px 26px 0">
     <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
       <td style="vertical-align:middle"><img src="${url}/icon-192.png" width="32" height="32" alt="" style="display:block;width:32px;height:32px;border:0"></td>
       <td style="vertical-align:middle;padding-left:10px;font-family:${SANS};font-size:22px;font-weight:800;letter-spacing:-1px;color:${TINTA};white-space:nowrap">ORBIT<span style="font-size:9px;font-weight:600;letter-spacing:0;vertical-align:super">&reg;</span></td>
     </tr></table>
   </td></tr>

   <tr><td style="background:${HUESO};padding:26px 26px 34px">
     <p style="margin:0;font-family:${MONO};font-size:11px;line-height:1.5;letter-spacing:1.4px;text-transform:uppercase;color:${a.tinta}">${esc(eyebrow)}</p>
     <h1 style="margin:14px 0 0;font-family:${SANS};font-size:34px;line-height:1.04;font-weight:800;letter-spacing:-1.4px;text-transform:uppercase;color:${TINTA}">${title}</h1>
     <div style="margin:18px 0 0;font-family:${SANS};font-size:16px;line-height:1.6;color:#3C3A36">${body}</div>
     ${itemsHtml}
     ${metaHtml}
     ${ctaHtml}
   </td></tr>

   <tr><td style="background:${PAPEL};padding:22px 26px 0">
     ${sign ? `<p style="margin:0 0 12px;font-family:${SERIF};font-style:italic;font-size:17px;line-height:1.4;color:${TINTA}">Problema &rarr; herramienta.</p>` : ''}
     ${foot ? `<p style="margin:0 0 14px;font-family:${SANS};font-size:13.5px;line-height:1.55;color:${GRIS}">${foot}</p>` : ''}
     <p style="margin:0;font-family:${MONO};font-size:10.5px;line-height:1.8;letter-spacing:1px;text-transform:uppercase;color:${GRIS}">
       ORBIT® &mdash; Orden en movimiento<br>
       <a href="${url}" style="color:${GRIS};text-decoration:none">orbitando.com.ar</a><br>
       <a href="mailto:hola@orbitando.com.ar" style="color:${GRIS};text-decoration:none">hola@orbitando.com.ar</a>
     </p>
   </td></tr>

  </table>
 </td></tr>
</table>
</body></html>`;
};
