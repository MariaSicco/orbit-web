/* Mimitos · estudios que llegan como LINK en el cuerpo del mail (no como adjunto).

   1) extractLinks: del HTML o texto de un mail que YA pasó el puntaje veterinario saca los links que
      parecen de un estudio (servicios de archivos, .pdf, rutas o textos como "resultado", "informe",
      "descargar"…) y tira desuscripción, redes, mapas y tracking. El cuerpo no se guarda: se lee,
      se sacan los links y se descarta.
   2) safeFetch: baja el archivo desde el servidor con defensas anti-SSRF:
      - solo https, sin usuario ni contraseña en la URL y solo puerto 443;
      - DNS resuelto por nosotros y conexión fijada a esa IP (sin rebinding); se bloquean IPs privadas,
        loopback, link-local (incluida 169.254.169.254), CGNAT, multicast, reservadas e IPv6 internas;
      - redirects a mano, como máximo 3, validando cada salto igual que el primero;
      - 8 s en total y 15 MB como máximo, cortando el stream;
      - solo PDF o imagen, comprobado por content-type Y por los primeros bytes;
      - sin cookies ni credenciales de la persona, con User-Agent propio.
      Si el sitio devuelve HTML (login, captcha, página intermedia), no se importa: se avisa.
   La URL que se baja nunca la manda el navegador: se vuelve a sacar del mail por su hash. */
import { createHash } from 'node:crypto';
import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import https from 'node:https';

export const MAX_BYTES = 15 * 1024 * 1024;
export const TIMEOUT_MS = 8000;
export const MAX_REDIRECTS = 3;
export const MAX_LINKS = 3;
const UA = 'MimitosBot/1.0 (+https://www.orbitando.com.ar/mascotas; descarga de estudios elegidos por su dueña o dueño)';

export const linkPart = url => 'u' + createHash('sha256').update(url).digest('hex').slice(0, 16);
export const isLinkPart = p => /^u[a-f0-9]{16}$/.test(String(p || ''));

/* ---------- extracción ---------- */
const decode = s => String(s || '').replace(/&amp;/gi, '&').replace(/&#x2F;/gi, '/').replace(/&#47;/g, '/').replace(/&quot;/gi, '"').replace(/&#39;/g, "'").replace(/&lt;/gi, '<').replace(/&gt;/gi, '>');
const stripTags = s => decode(String(s || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const FILE_SERVICE = /(^|\.)(drive\.google\.com|docs\.google\.com|dropbox\.com|dl\.dropboxusercontent\.com|1drv\.ms|onedrive\.live\.com|sharepoint\.com|wetransfer\.com|we\.tl|box\.com|mega\.nz)$/;
const JUNK_HOST = /(^|\.)(facebook\.com|fb\.me|instagram\.com|twitter\.com|x\.com|linkedin\.com|youtube\.com|youtu\.be|tiktok\.com|wa\.me|whatsapp\.com|api\.whatsapp\.com|t\.me|pinterest\.com|maps\.google\.[a-z.]+|maps\.app\.goo\.gl|waze\.com|apple\.com|play\.google\.com|apps\.apple\.com|list-manage\.com|mailchi\.mp|sendgrid\.net|mandrillapp\.com|mailgun\.org|hubspotlinks\.com|hs-sites\.com|sparkpostmail\.com|mcusercontent\.com|doubleclick\.net|google-analytics\.com|w3\.org|schemas\.microsoft\.com)$/;
const JUNK_PATH = /(unsubscribe|desuscrib|darse-de-baja|dar-de-baja|\/baja|optout|opt-out|preferenc|manage-subscription|privacy|privacidad|terminos|terms|\/maps|google\.com\/maps|pixel|beacon|\/open\?|\/o\/|tracking)/i;
const STUDY_WORDS = /(resultado|informe|descarg|download|\bpdf\b|\.pdf|estudio|laborator|report|analisis|hemograma|ecograf|radiograf|placa|archivo|adjunto|ver-?resultado)/i;

export function extractLinks({ html = '', text = '' } = {}, { senderDomain = '' } = {}) {
  const found = new Map();
  const add = (raw, anchor) => {
    let u; try { u = new URL(decode(raw).trim()); } catch { return; }
    if (!/^https?:$/.test(u.protocol) || !u.hostname || u.username || u.password) return;
    u.hash = '';
    const host = u.hostname.toLowerCase(), href = u.href;
    if (JUNK_HOST.test(host) || JUNK_PATH.test(u.pathname + u.search) || JUNK_PATH.test(fold(anchor))) return;
    const hay = fold(`${decodeURIComponent(u.pathname + u.search).replace(/[-_]/g, ' ')} ${anchor}`);
    const service = FILE_SERVICE.test(host), file = /\.(pdf|jpe?g|png|webp)$/i.test(u.pathname), words = STUDY_WORDS.test(hay);
    if (!service && !file && !words) return;
    const fromSender = senderDomain && (host === senderDomain || host.endsWith('.' + senderDomain));
    const score = (file ? 4 : 0) + (service ? 3 : 0) + (words ? 2 : 0) + (fromSender ? 2 : 0) + (u.protocol === 'https:' ? 1 : 0);
    const prev = found.get(href);
    if (!prev || prev.score < score) found.set(href, { url: href, host: host.replace(/^www\./, ''), anchor: stripTags(anchor).slice(0, 80), score });
  };
  for (const m of String(html).matchAll(/<a\b[^>]*?href\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi)) add(m[2], m[3].replace(/<[^>]+>/g, ' '));
  const plain = text || stripTags(String(html).replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' '));
  for (const m of String(plain).matchAll(/https?:\/\/[^\s<>"')\]]+/g)) add(m[0].replace(/[.,;:!?]+$/, ''), '');
  return [...found.values()].sort((a, b) => b.score - a.score).slice(0, MAX_LINKS).map(l => ({ ...l, part: linkPart(l.url) }));
}

/* ---------- link de vista → descarga directa (si es público) ---------- */
export function directUrl(raw) {
  let u; try { u = new URL(raw); } catch { return raw; }
  const host = u.hostname.toLowerCase();
  if (host === 'drive.google.com' || host === 'docs.google.com') {
    const id = /\/file\/d\/([A-Za-z0-9_-]{10,})/.exec(u.pathname)?.[1] || (/^\/(open|uc)$/.test(u.pathname) ? u.searchParams.get('id') : '');
    if (id && /^[A-Za-z0-9_-]{10,}$/.test(id)) return `https://drive.google.com/uc?export=download&id=${id}`;
  }
  if (/(^|\.)dropbox\.com$/.test(host) && /^\/(s|scl|sh)\//.test(u.pathname)) { u.searchParams.delete('dl'); u.searchParams.set('dl', '1'); u.hostname = 'www.dropbox.com'; return u.href; }
  return u.href;
}

/* ---------- IPs prohibidas ---------- */
const v4 = ip => ip.split('.').map(Number);
export function isPrivateIp(ip) {
  const fam = isIP(ip);
  if (fam === 4) {
    const [a, b, c] = v4(ip);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168) || (a === 192 && b === 0 && (c === 0 || c === 2)) || (a === 198 && (b === 18 || b === 19)) || (a === 198 && b === 51 && c === 100)
      || (a === 203 && b === 0 && c === 113) || a >= 224;
  }
  if (fam === 6) {
    const x = ip.toLowerCase().replace(/^\[|\]$/g, '');
    if (x === '::' || x === '::1') return true;
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(x) || /^::(\d+\.\d+\.\d+\.\d+)$/.exec(x);
    if (mapped) return isPrivateIp(mapped[1]);
    if (/^::ffff:[0-9a-f]{1,4}:[0-9a-f]{1,4}$/.test(x)) return true;   // IPv4 mapeada en hexa: no arriesgamos
    const first = parseInt(x.split(':')[0] || '0', 16);
    return (first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80 || (first & 0xff00) === 0xff00 || x.startsWith('64:ff9b:') || x.startsWith('2001:db8:') || x.startsWith('100::');
  }
  return true;   // lo que no es una IP válida, no pasa
}

/* resuelve y valida TODAS las IPs del host; devuelve la que se va a usar para conectar */
export async function resolveSafe(host, lookup = dnsLookup) {
  if (isIP(host)) { if (isPrivateIp(host)) throw err('ip_privada'); return { address: host, family: isIP(host) }; }
  if (/^(localhost|.*\.local|.*\.internal|metadata\.google\.internal)$/i.test(host)) throw err('ip_privada');
  let list; try { list = await lookup(host, { all: true, verbatim: true }); } catch { throw err('dns'); }
  list = Array.isArray(list) ? list : [list];
  if (!list.length || list.some(a => isPrivateIp(a.address))) throw err('ip_privada');
  return list[0];
}
const err = code => Object.assign(new Error(code), { code });

/* tipo real por los primeros bytes */
export function sniff(buf) {
  if (buf.length >= 5 && buf.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length >= 12 && buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return '';
}
const looksHtml = buf => /^\s*(<!doctype|<html|<head|<body|<script|<\?xml)/i.test(buf.subarray(0, 512).toString('latin1'));

/* un GET por https conectando a la IP ya validada (el certificado se verifica contra el nombre real) */
export function httpsGet(url, ip, { signal, maxBytes }) {
  return new Promise((ok, no) => {
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname, servername: u.hostname, port: Number(u.port) || 443, path: u.pathname + u.search, method: 'GET', signal,
      lookup: (_h, opts, cb) => (opts && opts.all) ? cb(null, [{ address: ip.address, family: ip.family }]) : cb(null, ip.address, ip.family),
      headers: { 'User-Agent': UA, Accept: 'application/pdf,image/*;q=0.9,*/*;q=0.1', 'Accept-Encoding': 'identity' },
    }, res => {
      const status = res.statusCode || 0, headers = res.headers;
      if (status >= 300 && status < 400) { res.resume(); return ok({ status, headers, body: Buffer.alloc(0) }); }
      const chunks = []; let n = 0;
      if (Number(headers['content-length']) > maxBytes) { res.destroy(); return no(err('muy_grande')); }
      res.on('data', c => { n += c.length; if (n > maxBytes) { res.destroy(); no(err('muy_grande')); } else chunks.push(c); });
      res.on('end', () => ok({ status, headers, body: Buffer.concat(chunks) }));
      res.on('error', e => no(e.code === 'muy_grande' ? e : err('red')));
    });
    req.on('error', e => no(e.code === 'muy_grande' ? e : e.name === 'AbortError' ? err('tiempo') : err('red')));
    req.end();
  });
}

/* baja un estudio por link con todas las defensas. Devuelve { buf, type, name, finalUrl } o tira un error con code:
   http (no es https), ip_privada, dns, redirects, tiempo, muy_grande, html (pide login), tipo, http_<status>, red */
export async function safeFetch(rawUrl, { lookup = dnsLookup, get = httpsGet, maxBytes = MAX_BYTES, timeoutMs = TIMEOUT_MS } = {}) {
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    let url = directUrl(rawUrl);
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      let u; try { u = new URL(url); } catch { throw err('url'); }
      if (u.protocol !== 'https:') throw err('http');
      if (u.username || u.password || (u.port && u.port !== '443')) throw err('url');
      const ip = await resolveSafe(u.hostname, lookup);
      const r = await Promise.race([
        get(u.href, ip, { signal: ctl.signal, maxBytes }),
        new Promise((_, no) => ctl.signal.addEventListener('abort', () => no(err('tiempo')), { once: true })),
      ]);
      if (r.status >= 300 && r.status < 400 && r.headers.location) { url = new URL(r.headers.location, u).href; continue; }
      if (r.status !== 200) throw err('http_' + r.status);
      if (r.body.length > maxBytes) throw err('muy_grande');
      const ct = String(r.headers['content-type'] || '').toLowerCase().split(';')[0].trim();
      const real = sniff(r.body);
      if (!real) throw err(ct.includes('html') || looksHtml(r.body) ? 'html' : 'tipo');
      if (!(ct === 'application/pdf' || ct.startsWith('image/') || ct === 'application/octet-stream' || ct === 'binary/octet-stream' || ct === 'application/force-download' || ct === '')) throw err(ct.includes('html') ? 'html' : 'tipo');
      const cd = String(r.headers['content-disposition'] || '');
      const fromCd = /filename\*=(?:UTF-8'')?([^;]+)/i.exec(cd)?.[1] || /filename="?([^";]+)"?/i.exec(cd)?.[1] || '';
      let name = ''; try { name = decodeURIComponent(fromCd || u.pathname.split('/').pop() || ''); } catch { name = fromCd; }
      name = name.replace(/[\u0000-\u001f/\\]/g, ' ').trim().slice(0, 100);
      const ext = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[real];
      if (!name || !/\.[a-z0-9]{2,4}$/i.test(name)) name = `estudio-${u.hostname.replace(/^www\./, '')}.${ext}`;
      return { buf: r.body, type: real, name, finalUrl: u.href };
    }
    throw err('redirects');
  } finally { clearTimeout(timer); }
}
