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
   Plantilla Orbit para email — sobre negro, como el sitio.

   Los fondos van como atributo bgcolor además de por estilo: es lo que
   mejor respeta el modo oscuro de Gmail, que tiende a reinterpretar los
   colores puestos solo por CSS.

   Todo en tablas, con padding en cada celda, para que a 320px de ancho
   nada se pegue ni se encime.
 * ------------------------------------------------------------------ */
const K = '#0D0D0E', K2 = '#151516', K3 = '#2A2A2E', BONE = '#F2EFE8', DIM = '#B4B0A8', GREY = '#77756F';
const SANS = "'Helvetica Neue',Helvetica,Arial,sans-serif";
const MONO = "'IBM Plex Mono','Courier New',Courier,monospace";
const SERIF = "Georgia,'Times New Roman',serif";
const ACENTOS = {
  acid:  { barra: '#D9FF45', fondo: '#D9FF45', texto: K },
  blue:  { barra: '#4F63FF', fondo: '#4F63FF', texto: '#FFFFFF' },
  fuego: { barra: '#FF4F2E', fondo: '#FF4F2E', texto: K },
  bone:  { barra: BONE,     fondo: BONE,      texto: K },
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

  /* cada producto en dos líneas, con la cantidad a la derecha: así no se
     pegan el nombre y el número en pantallas angostas */
  const itemsHtml = items && items.length ? `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:28px 0 0;border-collapse:collapse">
          <tr><td colspan="2" height="1" bgcolor="${K3}" style="height:1px;line-height:1px;font-size:0">&nbsp;</td></tr>
          ${items.map(i => `<tr>
            <td style="padding:15px 12px 14px 0;border-bottom:1px solid ${K3};vertical-align:top">
              <span style="font-family:${MONO};font-size:11px;letter-spacing:1.3px;color:${GREY};display:block;padding-bottom:5px">${esc(i.code || '')}</span>
              <span style="font-family:${SANS};font-size:16px;font-weight:700;letter-spacing:-.3px;text-transform:uppercase;color:${BONE}">${esc(i.name || '')}</span>
            </td>
            <td width="52" style="padding:15px 0 14px 12px;border-bottom:1px solid ${K3};vertical-align:top;text-align:right;font-family:${MONO};font-size:12px;letter-spacing:1px;color:${GREY};white-space:nowrap">${i.qty > 1 ? '&times;&nbsp;' + i.qty : '01'}</td>
          </tr>`).join('')}
        </table>` : '';

  const metaHtml = meta && meta.length ? `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:24px 0 0;border-collapse:collapse">
          ${meta.map(([k, v]) => `<tr>
            <td style="padding:7px 14px 7px 0;font-family:${MONO};font-size:11px;letter-spacing:1.3px;text-transform:uppercase;color:${GREY};vertical-align:top;white-space:nowrap">${esc(k)}</td>
            <td style="padding:7px 0;font-family:${SANS};font-size:15px;font-weight:700;color:${BONE};text-align:right;vertical-align:top">${esc(v)}</td>
          </tr>`).join('')}
        </table>` : '';

  const ctaHtml = cta && ctaUrl ? `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:32px 0 4px">
          <tr><td bgcolor="${a.fondo}" style="background:${a.fondo}">
            <a href="${ctaUrl}" style="display:block;padding:17px 30px;font-family:${SANS};font-size:16px;font-weight:700;letter-spacing:-.2px;color:${a.texto};text-decoration:none">${esc(cta)}</a>
          </td></tr>
        </table>` : '';

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark">
<style>:root{color-scheme:dark;supported-color-schemes:dark}</style>
<title>${esc(title.replace(/<[^>]+>/g, ''))}</title></head>
<body bgcolor="${K}" style="margin:0;padding:0;background:${K};-webkit-font-smoothing:antialiased">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;font-size:1px;line-height:1px">${esc(preheader)}&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${K}" style="background:${K}">
 <tr><td align="center" bgcolor="${K}" style="background:${K};padding:20px 12px 40px">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:100%;max-width:600px">

   <tr><td height="5" bgcolor="${a.barra}" style="background:${a.barra};height:5px;line-height:5px;font-size:0">&nbsp;</td></tr>

   <tr><td bgcolor="${K2}" style="background:${K2};padding:22px 26px 0">
     <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
       <td style="vertical-align:middle"><img src="${url}/icon-192.png" width="32" height="32" alt="" style="display:block;width:32px;height:32px;border:0"></td>
       <td style="vertical-align:middle;padding-left:10px;font-family:${SANS};font-size:22px;font-weight:800;letter-spacing:-1px;color:${BONE};white-space:nowrap">ORBIT<span style="font-size:9px;font-weight:600;letter-spacing:0;vertical-align:super">&reg;</span></td>
     </tr></table>
   </td></tr>

   <tr><td bgcolor="${K2}" style="background:${K2};padding:26px 26px 36px">
     <p style="margin:0;font-family:${MONO};font-size:11px;line-height:1.5;letter-spacing:1.4px;text-transform:uppercase;color:${a.barra}">${esc(eyebrow)}</p>
     <h1 style="margin:14px 0 0;font-family:${SANS};font-size:34px;line-height:1.04;font-weight:800;letter-spacing:-1.4px;text-transform:uppercase;color:${BONE}">${title}</h1>
     <div style="margin:18px 0 0;font-family:${SANS};font-size:16px;line-height:1.6;color:${DIM}">${body}</div>
     ${itemsHtml}
     ${metaHtml}
     ${ctaHtml}
   </td></tr>

   <tr><td bgcolor="${K}" style="background:${K};padding:24px 26px 0">
     ${sign ? `<p style="margin:0 0 12px;font-family:${SERIF};font-style:italic;font-size:17px;line-height:1.4;color:${BONE}">Problema &rarr; herramienta.</p>` : ''}
     ${foot ? `<p style="margin:0 0 14px;font-family:${SANS};font-size:13.5px;line-height:1.55;color:${GREY}">${foot}</p>` : ''}
     <p style="margin:0;font-family:${MONO};font-size:10.5px;line-height:1.8;letter-spacing:1px;text-transform:uppercase;color:${GREY}">
       ORBIT® &mdash; Orden en movimiento<br>
       <a href="${url}" style="color:${GREY};text-decoration:none">orbitando.com.ar</a><br>
       <a href="mailto:hola@orbitando.com.ar" style="color:${GREY};text-decoration:none">hola@orbitando.com.ar</a>
     </p>
   </td></tr>

  </table>
 </td></tr>
</table>
</body></html>`;
};
