/* Mi Mes by Orbit · mail conectado por 6 meses (decisión del socio, 23/10/2026).
   - Al autorizar, Mi Mes lee los últimos 6 meses del mail (adjuntos PDF de resúmenes, facturas,
     expensas y recibos) y el permiso queda activo 6 meses: un cron diario busca lo nuevo, lo lee
     con IA y lo deja listo para el teléfono, que lo baja al abrir la app.
   - 7 días y 1 día antes del vencimiento avisa (push y mail) para volver a autorizar. Al vencer,
     revoca el permiso y borra todo lo guardado. Renovar abre otros 6 meses.
   - Patrón de Mimitos (rama drop01/libreta-mascota, api/_lib/petmail.js): refresh token cifrado con
     AES-256-GCM atado a la cuenta de Orbit, OAuth con PKCE y state firmado de un solo uso, y el cupo
     de Gmail sin verificar compartido (Google cuenta los usuarios por proyecto, no por app).

   Qué se guarda por cuenta (orbit:mi-mes:mail:<email>), y nada más: proveedor, token cifrado,
   dirección conectada, fechas (autorizado, vence, última búsqueda), avisos de vencimiento ya enviados,
   los ids de adjuntos ya vistos (para no leerlos dos veces) y la cola de adjuntos por leer
   (id del mail, parte, nombre del archivo y fecha). Nunca el cuerpo, el asunto ni el remitente.
   Lo leído espera en una bandeja CIFRADA (orbit:mi-mes:mail-bandeja:<email>) que vence a los 30 días
   y se borra cuando el teléfono confirma que lo recibió. Los PDF no se guardan. */
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { kvGet, kvSet, kvDel, kvSAdd, kvSIsMember, kvSCard, kvKeys } from './kv.js';
import { isAdmin } from './admin.js';
import { leerDocumento, REINTENTAR } from './mi-mes-leer-core.js';

export const MESES_PERMISO = 6;
export const MESES_ATRAS = 6;
export const AVISOS_DIAS = [7, 1];
export const MAX_COLA = 60;            // adjuntos esperando lectura por cuenta
export const MAX_POR_BUSQUEDA = 40;    // adjuntos nuevos que entran por búsqueda
const MAX_VISTOS = 1500;
const MAX_BANDEJA = 80;
const BANDEJA_TTL = 30 * 86400;
const STATE_TTL = 600;
export const MAX_ARCHIVO = 4e6;        // como "Subí lo que tengas" (MAX_BYTES_DOC)

const norm = e => String(e || '').replace(/\s+/g, '').toLowerCase();
export const clave = email => `orbit:mi-mes:mail:${norm(email)}`;
export const claveBandeja = email => `orbit:mi-mes:mail-bandeja:${norm(email)}`;
const claveState = nonce => `orbit:mi-mes:mailstate:${nonce}`;
export const fail = (code, status = 400) => Object.assign(new Error(code), { code, status });
const form = o => new URLSearchParams(Object.entries(o).filter(([, v]) => v != null && v !== '')).toString();

/* ---------- fechas: la ventana de 6 meses ---------- */
export function sumarMesesISO(iso, n) {
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00Z`);
  const dia = d.getUTCDate();
  d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n);
  const ultimo = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(dia, ultimo));
  return d.toISOString().slice(0, 10);
}
export const diasEntre = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 864e5);
export const hoyISO = (now = Date.now()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date(now));
/* qué toca hoy con el vencimiento del permiso: null, 'aviso7', 'aviso1' o 'vencido' (sin repetir avisos) */
export function estadoVencimiento(conn, hoy) {
  if (!conn?.venceEl) return null;
  const faltan = diasEntre(hoy, conn.venceEl);
  if (faltan <= 0) return 'vencido';
  const enviados = conn.avisos || {};
  for (const d of [...AVISOS_DIAS].sort((a, b) => a - b)) if (faltan <= d && !enviados[`d${d}`]) return `aviso${d}`;
  return null;
}

/* ---------- quién puede usarlo ----------
   MI_MES_MAIL: "0/false/no/off" lo apaga del lado del servidor (además del interruptor conectarMail de la app).
   Cupo de Gmail sin verificar: el mismo SET que Mimitos (orbit:petmail:gmail:users), porque Google cuenta los
   usuarios del proyecto. MI_MES_GMAIL_CAP (o MIMITOS_GMAIL_CAP), 90 por defecto. Admin no cuenta. */
export const mailEncendido = () => !/^(0|false|no|off)$/i.test(String(process.env.MI_MES_MAIL || '').trim());
export const GMAIL_USERS = 'orbit:petmail:gmail:users';
export const gmailCap = () => { const v = String(process.env.MI_MES_GMAIL_CAP ?? process.env.MIMITOS_GMAIL_CAP ?? '').trim(); const n = Math.floor(Number(v)); return v !== '' && Number.isFinite(n) && n >= 0 ? n : 90; };
export async function cupoLleno(prov, email) {
  if (prov !== 'gmail' || isAdmin(email)) return false;
  if (await kvSIsMember(GMAIL_USERS, norm(email))) return false;
  return (await kvSCard(GMAIL_USERS)) >= gmailCap();
}

/* ---------- cifrado del token: AES-256-GCM, la cuenta de Orbit como dato asociado ---------- */
export function tokenKey(raw = process.env.MI_MES_TOKEN_KEY || process.env.MIMITOS_TOKEN_KEY) {
  const v = String(raw || '').trim();
  if (!v) return null;
  const buf = /^[0-9a-f]{64}$/i.test(v) ? Buffer.from(v, 'hex') : Buffer.from(v.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  return buf.length === 32 ? buf : null;
}
export function seal(text, key, aad) {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  c.setAAD(Buffer.from(norm(aad)));
  const ct = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
  return ['v1', iv.toString('base64url'), c.getAuthTag().toString('base64url'), ct.toString('base64url')].join('.');
}
export function open(sealed, key, aad) {
  const [v, iv, tag, ct] = String(sealed || '').split('.');
  if (v !== 'v1' || !iv || !tag || !ct) throw fail('token_invalido');
  const d = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
  d.setAAD(Buffer.from(norm(aad)));
  d.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([d.update(Buffer.from(ct, 'base64url')), d.final()]).toString('utf8');
}

/* ---------- state anti-CSRF (firmado con la sesión, en KV, un solo uso) + PKCE ---------- */
const mac = (secret, data) => createHmac('sha256', secret).update(data).digest('base64url');
export async function crearState(email, prov, secret = process.env.SESSION_SECRET || '') {
  const nonce = randomBytes(18).toString('base64url');
  const verifier = randomBytes(32).toString('base64url');
  await kvSet(claveState(nonce), { email: norm(email), prov, verifier }, STATE_TTL);
  return { state: `${nonce}.${mac(secret, `mimes|${prov}|${nonce}|${norm(email)}`)}`, challenge: createHash('sha256').update(verifier).digest('base64url') };
}
export async function revisarState(state, email, prov, secret = process.env.SESSION_SECRET || '') {
  const [nonce, sig] = String(state || '').split('.');
  if (!nonce || !sig || !/^[A-Za-z0-9_-]{20,40}$/.test(nonce)) return null;
  const want = Buffer.from(mac(secret, `mimes|${prov}|${nonce}|${norm(email)}`)), got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  const s = await kvGet(claveState(nonce));
  if (!s || s.email !== norm(email) || s.prov !== prov) return null;
  await kvDel(claveState(nonce));
  return { verifier: s.verifier };
}

/* ---------- qué se busca ---------- */
const TERMINOS = ['resumen', '"estado de cuenta"', 'factura', 'boleta', 'expensas', '"recibo de sueldo"', 'haberes', 'liquidación', 'liquidacion', 'vencimiento'];
export const consultaGmail = desdeMs => `has:attachment filename:pdf after:${Math.floor(desdeMs / 1000)} (${TERMINOS.join(' OR ')}) -category:promotions -category:social`;
const ymd = ms => new Date(ms).toISOString().slice(0, 10);
export const consultaOutlook = desdeMs => `(${TERMINOS.join(' OR ')}) AND hasattachment:true AND received>=${ymd(desdeMs)}`;
const nombreLimpio = n => String(n || 'archivo.pdf').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 100);
const esPdf = (nombre, tipo) => /\.pdf$/i.test(nombre || '') || /application\/pdf/i.test(tipo || '');
const host = req => {
  const h = String(req?.headers?.['x-forwarded-host'] || req?.headers?.host || '').split(',')[0].trim();
  const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(h);
  return (h ? `${local ? 'http' : 'https'}://${h}` : (process.env.SITE_URL || 'https://www.orbitando.com.ar')).replace(/\/$/, '');
};
export const redirectUri = (req, prov) => (prov === 'gmail' ? process.env.MI_MES_GOOGLE_REDIRECT_URI : process.env.MI_MES_MS_REDIRECT_URI) || `${host(req)}/mi-mes/mail/${prov}`;

/* ---------- Gmail ---------- */
const G_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
const GM = 'https://gmail.googleapis.com/gmail/v1/users/me';
async function gget(path, at) {
  const r = await fetch(GM + path, { headers: { Authorization: `Bearer ${at}` } });
  if (r.status === 401) throw fail('mail_vencido', 401);
  if (r.status === 429 || r.status === 403) throw fail('mail_limite', 429);
  if (!r.ok) throw fail('mail_error', 502);
  return r.json();
}
const gToken = async params => {
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form(params) });
  return { ok: r.ok, d: await r.json().catch(() => ({})) };
};
const partesPdf = payload => {
  const out = [];
  const walk = (p, n) => { if (!p || n > 6) return; if (p.body?.attachmentId && esPdf(p.filename, p.mimeType) && (Number(p.body.size) || 0) <= MAX_ARCHIVO) out.push({ part: String(p.partId ?? ''), nombre: nombreLimpio(p.filename) }); (p.parts || []).forEach(c => walk(c, n + 1)); };
  walk(payload, 0);
  return out.filter(x => /^[0-9.]{1,20}$/.test(x.part));
};
const G_FIELDS = 'id,internalDate,payload(partId,mimeType,filename,body(attachmentId,size),parts(partId,mimeType,filename,body(attachmentId,size),parts(partId,mimeType,filename,body(attachmentId,size),parts(partId,mimeType,filename,body(attachmentId,size)))))';
export const gmail = {
  id: 'gmail',
  config: req => { const clientId = process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_OAUTH_CLIENT_ID || '', secret = process.env.GOOGLE_CLIENT_SECRET || ''; return { clientId, secret, redirect: redirectUri(req, 'gmail'), listo: Boolean(clientId && secret) }; },
  authUrl: (cfg, state, challenge) => 'https://accounts.google.com/o/oauth2/v2/auth?' + form({ client_id: cfg.clientId, redirect_uri: cfg.redirect, response_type: 'code', scope: G_SCOPE, access_type: 'offline', prompt: 'consent', include_granted_scopes: 'false', state, code_challenge: challenge, code_challenge_method: 'S256' }),
  async canjear(cfg, code, verifier) {
    const { ok, d } = await gToken({ code, client_id: cfg.clientId, client_secret: cfg.secret, redirect_uri: cfg.redirect, grant_type: 'authorization_code', code_verifier: verifier });
    if (!ok || !d.access_token) return { error: 'error' };
    if (!String(d.scope || '').split(/\s+/).includes(G_SCOPE)) { await gmail.revocar(cfg, d.refresh_token || d.access_token).catch(() => {}); return { error: 'sinpermiso' }; }
    if (!d.refresh_token) return { error: 'error' };
    let direccion = '';
    try { direccion = String((await gget('/profile', d.access_token)).emailAddress || ''); } catch {}
    return { refresh: d.refresh_token, direccion };
  },
  async renovar(cfg, refresh) {
    const { ok, d } = await gToken({ client_id: cfg.clientId, client_secret: cfg.secret, refresh_token: refresh, grant_type: 'refresh_token' });
    if (!ok) { if (d.error === 'invalid_grant') return { vencido: true }; throw fail('mail_error', 502); }
    return { access: d.access_token };
  },
  async revocar(cfg, refresh) { const r = await fetch('https://oauth2.googleapis.com/revoke', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form({ token: refresh }) }); return r.ok || r.status === 400; },
  async buscar(at, desdeMs, max = MAX_POR_BUSQUEDA) {
    const out = [];
    let page = '';
    for (let vueltas = 0; vueltas < 4 && out.length < max; vueltas++) {
      const l = await gget(`/messages?maxResults=50&q=${encodeURIComponent(consultaGmail(desdeMs))}${page ? '&pageToken=' + encodeURIComponent(page) : ''}`, at);
      for (const { id } of l.messages || []) {
        if (out.length >= max || !/^[A-Za-z0-9]{6,40}$/.test(id)) continue;
        const m = await gget(`/messages/${id}?format=full&fields=${encodeURIComponent(G_FIELDS)}`, at);
        const fecha = Number(m.internalDate) ? new Date(Number(m.internalDate)).toISOString().slice(0, 10) : '';
        for (const p of partesPdf(m.payload).slice(0, 3)) out.push({ m: id, part: p.part, nombre: p.nombre, fecha });
      }
      page = l.nextPageToken || '';
      if (!page) break;
    }
    return out.slice(0, max);
  },
  /* el attachmentId de Gmail cambia entre lecturas: se busca por partId, que es estable dentro del mail */
  async bajar(at, m, part) {
    const msg = await gget(`/messages/${encodeURIComponent(m)}?format=full&fields=${encodeURIComponent(G_FIELDS)}`, at);
    const find = p => { if (!p) return null; if (String(p.partId) === part) return p; for (const c of p.parts || []) { const x = find(c); if (x) return x; } return null; };
    const p = find(msg.payload);
    if (!p?.body?.attachmentId || (Number(p.body.size) || 0) > MAX_ARCHIVO) throw fail('mail_no_encontrado', 404);
    const raw = await gget(`/messages/${encodeURIComponent(m)}/attachments/${encodeURIComponent(p.body.attachmentId)}`, at);
    return Buffer.from(String(raw.data || '').replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  },
};

/* ---------- Outlook (Outlook.com, Hotmail, Live y Microsoft 365) ---------- */
const MS_LOGIN = 'https://login.microsoftonline.com/common/oauth2/v2.0';
const GRAPH = 'https://graph.microsoft.com/v1.0';
const MS_SCOPES = ['openid', 'email', 'offline_access', 'https://graph.microsoft.com/Mail.Read'];
async function graph(url, at, raw = false) {
  const r = await fetch(url.startsWith('https://') ? url : GRAPH + url, { headers: { Authorization: `Bearer ${at}`, Prefer: 'IdType="ImmutableId"' } });
  if (r.status === 401) throw fail('mail_vencido', 401);
  if (r.status === 429 || r.status === 503) throw fail('mail_limite', 429);
  if (!r.ok) throw fail('mail_error', 502);
  return raw ? Buffer.from(await r.arrayBuffer()) : r.json();
}
const msToken = async params => {
  const r = await fetch(MS_LOGIN + '/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form(params) });
  return { ok: r.ok, d: await r.json().catch(() => ({})) };
};
const direccionDe = idToken => { try { const p = JSON.parse(Buffer.from(String(idToken).split('.')[1], 'base64url').toString()); return String(p.email || p.preferred_username || '').slice(0, 120); } catch { return ''; } };
const okId = v => /^[A-Za-z0-9+/=_-]{16,400}$/.test(v);
export const outlook = {
  id: 'outlook',
  config: req => { const clientId = process.env.MS_CLIENT_ID || process.env.MS_OAUTH_CLIENT_ID || '', secret = process.env.MS_CLIENT_SECRET || ''; return { clientId, secret, redirect: redirectUri(req, 'outlook'), listo: Boolean(clientId && secret) }; },
  authUrl: (cfg, state, challenge) => MS_LOGIN + '/authorize?' + form({ client_id: cfg.clientId, response_type: 'code', redirect_uri: cfg.redirect, response_mode: 'query', scope: MS_SCOPES.join(' '), state, prompt: 'select_account', code_challenge: challenge, code_challenge_method: 'S256' }),
  async canjear(cfg, code, verifier) {
    const { ok, d } = await msToken({ client_id: cfg.clientId, client_secret: cfg.secret, code, redirect_uri: cfg.redirect, grant_type: 'authorization_code', code_verifier: verifier, scope: MS_SCOPES.join(' ') });
    if (!ok || !d.access_token) return { error: d.error === 'consent_required' ? 'sinpermiso' : 'error' };
    if (!/(^|\s|\/)mail\.read(\s|$)/i.test(String(d.scope || ''))) return { error: 'sinpermiso' };
    if (!d.refresh_token) return { error: 'error' };
    return { refresh: d.refresh_token, direccion: direccionDe(d.id_token) };
  },
  /* Microsoft rota el refresh token en cada uso: se guarda el nuevo */
  async renovar(cfg, refresh) {
    const { ok, d } = await msToken({ client_id: cfg.clientId, client_secret: cfg.secret, refresh_token: refresh, grant_type: 'refresh_token', scope: MS_SCOPES.join(' ') });
    if (!ok) { if (['invalid_grant', 'interaction_required', 'consent_required'].includes(d.error)) return { vencido: true }; throw fail('mail_error', 502); }
    return { access: d.access_token, refresh: d.refresh_token || '' };
  },
  /* Microsoft no tiene un endpoint para que la app revoque su propio permiso: se borra lo guardado y la app
     explica dónde quitarlo (account.live.com/consent/Manage o myapps.microsoft.com) */
  async revocar() { return false; },
  async buscar(at, desdeMs, max = MAX_POR_BUSQUEDA) {
    const out = [];
    let url = `/me/messages?$search=${encodeURIComponent('"' + consultaOutlook(desdeMs).replace(/"/g, '\\"') + '"')}&$select=id,receivedDateTime,hasAttachments&$top=50`;
    for (let vueltas = 0; vueltas < 4 && url && out.length < max; vueltas++) {
      const l = await graph(url, at);
      for (const m of l.value || []) {
        if (out.length >= max || !m.hasAttachments || !okId(m.id)) continue;
        const a = await graph(`/me/messages/${encodeURIComponent(m.id)}/attachments?$select=id,name,contentType,size,isInline`, at);
        for (const x of (a.value || []).filter(x => String(x['@odata.type'] || '').toLowerCase() === '#microsoft.graph.fileattachment' && !x.isInline && esPdf(x.name, x.contentType) && (Number(x.size) || 0) <= MAX_ARCHIVO && okId(x.id)).slice(0, 3)) {
          out.push({ m: m.id, part: x.id, nombre: nombreLimpio(x.name), fecha: String(m.receivedDateTime || '').slice(0, 10) });
        }
      }
      url = l['@odata.nextLink'] || '';
      if (url && !url.startsWith(GRAPH + '/me/messages')) url = '';
    }
    return out.slice(0, max);
  },
  async bajar(at, m, part) { return graph(`/me/messages/${encodeURIComponent(m)}/attachments/${encodeURIComponent(part)}/$value`, at, true); },
};

export const PROVEEDORES = { gmail, outlook };

/* ---------- conexión guardada ---------- */
export async function leerConexion(email) { return (await kvGet(clave(email))) || null; }
export const guardarConexion = (email, c) => kvSet(clave(email), c);
const vistoId = x => createHash('sha256').update(`${x.m}|${x.part}`).digest('base64url').slice(0, 22);

/* Lo que ve la app (sin token ni ids) */
export function resumenConexion(c, hoy = hoyISO()) {
  if (!c) return { conectado: false };
  return { conectado: true, prov: c.prov, direccion: c.direccion || '', autorizadoEl: c.autorizadoEl, venceEl: c.venceEl, faltan: diasEntre(hoy, c.venceEl),
    pendientes: (c.cola || []).length, ultimaBusqueda: c.ultimaBusqueda || null, desde: c.desde };
}

/* Después de que la persona autorizó: se guarda la conexión con la ventana de 6 meses y la primera búsqueda arranca 6 meses atrás */
export async function conectar(email, prov, { refresh, direccion }, { key = tokenKey(), now = Date.now() } = {}) {
  if (!key) throw fail('sin_clave', 503);
  const hoy = hoyISO(now), previa = await leerConexion(email);
  if (previa && previa.prov !== prov) await desconectar(email, previa).catch(() => {});   // un solo mail por cuenta
  const c = {
    prov, tok: seal(refresh, key, email), direccion: String(direccion || '').slice(0, 120),
    autorizadoEl: hoy, venceEl: sumarMesesISO(hoy, MESES_PERMISO), desde: sumarMesesISO(hoy, -MESES_ATRAS),
    ultimaBusqueda: null, avisos: {},
    /* al renovar con el mismo proveedor se conserva lo ya visto y lo que espera lectura: no se lee dos veces */
    vistos: previa?.prov === prov ? (previa.vistos || []) : [], cola: previa?.prov === prov ? (previa.cola || []) : [],
  };
  await guardarConexion(email, c);
  if (prov === 'gmail' && !isAdmin(email)) await kvSAdd(GMAIL_USERS, norm(email));
  return c;
}

export async function desconectar(email, c = null, { key = tokenKey(), cfgDe = p => PROVEEDORES[p].config() } = {}) {
  c ||= await leerConexion(email);
  if (c?.tok && key) { try { await PROVEEDORES[c.prov].revocar(cfgDe(c.prov), open(c.tok, key, email)); } catch {} }
  await kvDel(clave(email)); await kvDel(claveBandeja(email));
  return { ok: true, revocado: c?.prov === 'gmail' };
}

/* token de acceso (y el refresh rotado de Microsoft) */
async function acceso(email, c, { key = tokenKey(), cfgDe = p => PROVEEDORES[p].config() } = {}) {
  if (!key) throw fail('sin_clave', 503);
  const P = PROVEEDORES[c.prov], cfg = cfgDe(c.prov);
  const r = await P.renovar(cfg, open(c.tok, key, email));
  if (r.vencido) throw fail('mail_vencido', 401);
  if (r.refresh) c.tok = seal(r.refresh, key, email);
  return r.access;
}

/* Busca lo nuevo desde la última búsqueda (o 6 meses atrás) y lo suma a la cola, sin repetidos */
export async function sincronizar(email, { now = Date.now(), ...deps } = {}) {
  const c = await leerConexion(email);
  if (!c) return { ok: false, motivo: 'sin_conexion' };
  const at = await acceso(email, c, deps);
  const desdeMs = Math.max(Date.parse(`${c.desde}T00:00:00-03:00`), c.ultimaBusqueda ? Date.parse(c.ultimaBusqueda) - 2 * 864e5 : 0);
  const encontrados = await PROVEEDORES[c.prov].buscar(at, desdeMs);
  const vistos = new Set(c.vistos || []), enCola = new Set((c.cola || []).map(vistoId));
  let nuevos = 0;
  for (const x of encontrados) {
    const id = vistoId(x);
    if (vistos.has(id) || enCola.has(id) || (c.cola || []).length >= MAX_COLA) continue;
    (c.cola ||= []).push(x); enCola.add(id); nuevos++;
  }
  c.ultimaBusqueda = new Date(now).toISOString();
  await guardarConexion(email, c);
  return { ok: true, nuevos, cola: c.cola.length };
}

/* Lee el primer adjunto de la cola y deja el resultado en la bandeja. Si es por un tope (de la persona o
   el techo global) o un corte de la IA, vuelve a la cola para otro día. */
export async function procesarUno(email, { leer = leerDocumento, ...deps } = {}) {
  const c = await leerConexion(email);
  if (!c?.cola?.length) return { ok: true, procesado: false, quedan: 0 };
  const x = c.cola[0];
  const at = await acceso(email, c, deps);
  let r;
  try {
    const buf = await PROVEEDORES[c.prov].bajar(at, x.m, x.part);
    r = await leer({ email, buf, nombre: x.nombre });
  } catch (e) {
    if (e.code === 'mail_no_encontrado') r = { ok: false, motivo: 'no_esta' };
    else { await guardarConexion(email, c); throw e; }
  }
  if (!r.ok && REINTENTAR.has(r.motivo)) { await guardarConexion(email, c); return { ok: true, procesado: false, espera: r.motivo, hasta: r.hasta || null, quedan: c.cola.length }; }
  c.cola.shift();
  c.vistos = [...(c.vistos || []), vistoId(x)].slice(-MAX_VISTOS);
  await guardarConexion(email, c);
  if (r.ok && r.tipo !== 'otro') await agregarBandeja(email, { id: vistoId(x), nombre: x.nombre, fecha: x.fecha, tipo: r.tipo, lectura: r.lectura || null, propuesta: r.propuesta || null, confiable: r.confiable !== false, huella: r.huella, modo: r.modo }, deps);
  return { ok: true, procesado: true, tipo: r.ok ? r.tipo : null, motivo: r.ok ? null : r.motivo, quedan: c.cola.length };
}

/* ---------- bandeja cifrada: lo leído que espera que el teléfono lo baje ---------- */
export async function leerBandeja(email, { key = tokenKey() } = {}) {
  const s = await kvGet(claveBandeja(email));
  if (!s || !key) return [];
  try { const v = JSON.parse(open(s, key, `${email}|bandeja`)); return Array.isArray(v) ? v : []; } catch { return []; }
}
async function guardarBandeja(email, items, { key = tokenKey() } = {}) {
  if (!items.length) return kvDel(claveBandeja(email));
  return kvSet(claveBandeja(email), seal(JSON.stringify(items.slice(-MAX_BANDEJA)), key, `${email}|bandeja`), BANDEJA_TTL);
}
export async function agregarBandeja(email, item, deps = {}) {
  const items = (await leerBandeja(email, deps)).filter(i => i.id !== item.id);
  items.push(item);
  await guardarBandeja(email, items, deps);
}
export async function confirmarBandeja(email, ids, deps = {}) {
  const fuera = new Set((Array.isArray(ids) ? ids : []).map(String));
  const quedan = (await leerBandeja(email, deps)).filter(i => !fuera.has(i.id));
  await guardarBandeja(email, quedan, deps);
  return quedan.length;
}

/* ---------- avisos del vencimiento del permiso ---------- */
export const fechaAR = iso => { const [a, m, d] = String(iso).split('-').map(Number); return `${d}/${m}/${a}`; };
export function textoAviso(tipo, c) {
  if (tipo === 'vencido') return { title: 'Se venció el permiso para leer tu mail', body: 'Tus resúmenes y facturas ya no entran solos a Mi Mes. Volvé a conectar tu mail para otros 6 meses.' };
  const d = tipo === 'aviso1' ? 'mañana' : `el ${fechaAR(c.venceEl)}`;
  return { title: `Tu permiso para leer el mail vence ${d}`, body: 'Renovalo en Mi Mes para que tus resúmenes y facturas sigan entrando solos otros 6 meses.' };
}

/* Para el cron: todas las cuentas conectadas */
export async function cuentasConectadas() {
  const claves = await kvKeys('orbit:mi-mes:mail:*');
  return claves.filter(k => !k.startsWith('orbit:mi-mes:mail-bandeja:')).map(k => k.slice('orbit:mi-mes:mail:'.length));
}

/* ---------- el trabajo diario (lo llama api/cron/mi-mes.js) ----------
   Por cada cuenta conectada: (1) si no tiene la compra o venció su lectura automática, no se lee nada;
   (2) avisos de vencimiento del permiso (7 días y 1 día antes) y, al vencer, revoca y borra;
   (3) busca lo nuevo. Después lee la cola de todas las cuentas por turnos hasta el tope de tiempo.
   deps: { avisar(email, {title, body}, tipo), habilitada(email) → bool, leer, now, finMs } */
export async function trabajoDiario({ hoy = hoyISO(), now = Date.now(), finMs = now + 200_000, avisar = async () => {}, habilitada = async () => true, leer, ...deps } = {}) {
  const out = { cuentas: 0, avisos: 0, vencidas: 0, busquedas: 0, nuevos: 0, leidos: 0, errores: 0 };
  if (!mailEncendido()) return { ...out, apagado: true };
  const emails = await cuentasConectadas();
  const activas = [];
  for (const email of emails) {
    out.cuentas++;
    try {
      const c = await leerConexion(email);
      if (!c) continue;
      const v = estadoVencimiento(c, hoy);
      if (v === 'vencido') { await desconectar(email, c, deps); await avisar(email, textoAviso('vencido', c), 'vencido'); out.vencidas++; continue; }
      if (v) { await avisar(email, textoAviso(v, c), v); c.avisos = { ...(c.avisos || {}), [`d${v.slice(5)}`]: hoy }; await guardarConexion(email, c); out.avisos++; }
      if (!(await habilitada(email))) continue;
      if (Date.now() < finMs) { const s = await sincronizar(email, { now, ...deps }); out.busquedas++; out.nuevos += s.nuevos || 0; }
      activas.push(email);
    } catch (e) {
      if (e.code === 'mail_vencido') { const c = await leerConexion(email).catch(() => null); await desconectar(email, c, deps).catch(() => {}); if (c) await avisar(email, textoAviso('vencido', c), 'vencido').catch(() => {}); out.vencidas++; }
      else out.errores++;
    }
  }
  /* lectura por turnos: una por cuenta por vuelta, hasta que se acabe el tiempo o no quede nada */
  let quedan = new Set(activas);
  while (quedan.size && Date.now() < finMs) {
    for (const email of [...quedan]) {
      if (Date.now() >= finMs) break;
      try {
        const r = await procesarUno(email, { leer, ...deps });
        if (r.procesado) out.leidos++;
        if (!r.procesado || !r.quedan) quedan.delete(email);   // vacía o en espera (tope/pausa): sigue mañana
      } catch (e) { quedan.delete(email); if (e.code !== 'mail_limite') out.errores++; }
    }
  }
  return out;
}
