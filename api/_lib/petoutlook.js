/* Mimitos · adaptador de Outlook (Outlook.com, Hotmail, Live y Microsoft 365) para "Conectar tu mail".
   El motor común está en petmail.js; este archivo solo habla con Microsoft.

   Permisos delegados: Mail.Read (leer mails y adjuntos) + offline_access (refresh token) +
   openid/email (solo para mostrar "Conectado como …" con la dirección del id_token). Nada de enviar
   ni modificar. Endpoint "common": entran cuentas personales y de trabajo o estudio.

   Microsoft no tiene un endpoint para que una app revoque su propio refresh token: "Desconectar"
   borra lo guardado y la app le indica a la persona dónde quitar el permiso
   (account.live.com/consent/Manage en cuentas personales; myapps.microsoft.com en las de trabajo).

   Rutas: las mismas que Gmail con ?outlook=… (status, start, callback, search, import, queue, unqueue,
   disconnect). Redirect URI: /mascotas/outlook/callback. */
import * as M from './petmail.js';

const LOGIN = 'https://login.microsoftonline.com/common/oauth2/v2.0';
const GRAPH = 'https://graph.microsoft.com/v1.0';
export const SCOPES = ['openid', 'email', 'offline_access', 'https://graph.microsoft.com/Mail.Read'];
const { fail, form } = M;

export function redirectUri(req) { return process.env.MS_REDIRECT_URI || M.hostBase(req) + '/mascotas/outlook/callback'; }
export function outlookConfig(req) {
  const clientId = process.env.MS_CLIENT_ID || '', secret = process.env.MS_CLIENT_SECRET || '';
  const key = M.tokenKey();
  return { clientId, secret, key, redirect: redirectUri(req), ready: Boolean(clientId && secret && key && (process.env.SESSION_SECRET || '').length >= 16) };
}

/* ---------- consulta (KQL de $search) ---------- */
const ymd = ms => new Date(ms).toISOString().slice(0, 10);
/* señal veterinaria, nombres de mascotas, veterinarias y remitentes conocidos (con y sin acento); el resto lo decide el puntaje.
   Sin exigir adjunto: los mails veterinarios sin archivo se listan aparte para abrirlos en Outlook. */
export function buildKql(doc, since, senders) {
  const P = M.queryParts(doc, senders);
  const names = P.names.map(n => `"${n}"`), known = P.knownNames.map(n => `"${n}"`), froms = P.froms.map(f => `from:${f}`);
  const make = () => `(${[...P.vet.map(t => /\s/.test(t) ? `"${t}"` : t), ...names, ...known, ...froms].join(' OR ')})${since ? ` AND received>=${ymd(since)}` : ''}`;
  let k = make();
  while (k.length > 1400 && (known.length || froms.length)) { if (known.length) known.pop(); else froms.pop(); k = make(); }
  return k;
}
/* $search="…": las comillas y barras de adentro van escapadas */
export const searchParam = kql => '"' + kql.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
const SELECT = 'id,subject,from,receivedDateTime,hasAttachments,webLink';
const ATT_SELECT = 'id,name,contentType,size,isInline';

/* ---------- Microsoft ---------- */
async function tokenCall(params) {
  const r = await fetch(LOGIN + '/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form(params) });
  const d = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, d };
}
/* ids inmutables: así un mail que se mueve de carpeta conserva su id (y el dedupe sigue andando) */
async function graph(url, at, { raw = false } = {}) {
  const r = await fetch(url.startsWith('https://') ? url : GRAPH + url, { headers: { Authorization: `Bearer ${at}`, Prefer: 'IdType="ImmutableId"' } });
  if (r.status === 401) throw fail('mail_vencido', 401);
  if (r.status === 429 || r.status === 503) throw fail('mail_limite', 429);
  if (r.status === 404) throw fail('mail_no_encontrado', 404);
  if (r.status === 400) throw fail('mail_consulta', 400);
  if (!r.ok) throw fail('mail_error', 502);
  return raw ? Buffer.from(await r.arrayBuffer()) : r.json();
}
/* la dirección para mostrar sale del id_token (lo manda Microsoft por TLS a nuestro servidor; solo se usa para mostrarla) */
export function addressOf(idToken) {
  try { const p = JSON.parse(Buffer.from(String(idToken).split('.')[1], 'base64url').toString()); return String(p.email || p.preferred_username || '').slice(0, 120); } catch { return ''; }
}
const okId = v => /^[A-Za-z0-9+/=_-]{16,400}$/.test(v);
const isFile = a => String(a?.['@odata.type'] || '').toLowerCase() === '#microsoft.graph.fileattachment' && !a.isInline;
const metaOf = a => ({ part: String(a.id), name: String(a.name || '').trim().slice(0, 120), type: M.typeOf(a.contentType, a.name), size: Number(a.size) || 0 });
const fromOf = f => { const e = f?.emailAddress || {}; return [e.name, e.address ? `<${e.address}>` : ''].filter(Boolean).join(' ').slice(0, 120); };

export const outlook = {
  id: 'outlook', label: 'Outlook', revokes: false, consentUrl: 'https://account.live.com/consent/Manage',
  key: email => `orbit:petoutlook:${String(email).toLowerCase()}`,
  config: outlookConfig,
  validId: okId,
  validPart: okId,
  query: (doc, opts, now) => { const since = M.sinceOf(opts, now); return { kql: buildKql(doc, since, opts.senders), since }; },
  authUrl: (cfg, state, challenge) => LOGIN + '/authorize?' + form({
    client_id: cfg.clientId, response_type: 'code', redirect_uri: cfg.redirect, response_mode: 'query',
    scope: SCOPES.join(' '), state, prompt: 'select_account', code_challenge: challenge, code_challenge_method: 'S256',
  }),
  async exchange(cfg, code, verifier) {
    const { ok, d } = await tokenCall({ client_id: cfg.clientId, client_secret: cfg.secret, code, redirect_uri: cfg.redirect, grant_type: 'authorization_code', code_verifier: verifier, scope: SCOPES.join(' ') });
    if (!ok || !d.access_token) return { error: d.error === 'consent_required' ? 'sinpermiso' : 'error' };
    if (!/(^|\s|\/)mail\.read(\s|$)/i.test(String(d.scope || ''))) return { error: 'sinpermiso' };
    if (!d.refresh_token) return { error: 'error' };
    return { refresh: d.refresh_token, address: addressOf(d.id_token) };
  },
  /* Microsoft rota el refresh token en cada uso: el motor guarda el nuevo */
  async refresh(cfg, refresh) {
    const { ok, d } = await tokenCall({ client_id: cfg.clientId, client_secret: cfg.secret, refresh_token: refresh, grant_type: 'refresh_token', scope: SCOPES.join(' ') });
    if (!ok) { if (['invalid_grant', 'interaction_required', 'consent_required'].includes(d.error)) return { expired: true }; throw fail('mail_error', 502); }
    return { access: d.access_token, refresh: d.refresh_token || '' };
  },
  async revoke() { return false; },
  async list(at, cur) {
    let url = cur.page;
    if (url && !url.startsWith(GRAPH + '/me/messages')) throw fail('cursor_invalido', 400);
    if (!url) {
      if (!cur.f) {
        url = `/me/messages?$search=${encodeURIComponent(searchParam(cur.q.kql))}&$select=${SELECT}&$top=${M.PAGE}`;
        try { const d = await graph(url, at); return { items: d.value || [], next: d['@odata.nextLink'] || '' }; }
        catch (e) { if (e.code !== 'mail_consulta') throw e; cur.f = 1; }   // si la búsqueda no está disponible en esa casilla, va el filtro
      }
      /* modo filtro: adjuntos y fecha en el servidor; la relevancia (asunto, remitente y nombres de archivo) la decide el puntaje */
      const since = new Date(cur.q.since || Date.parse('2000-01-01')).toISOString();
      url = `/me/messages?$filter=${encodeURIComponent(`receivedDateTime ge ${since} and hasAttachments eq true`)}&$orderby=${encodeURIComponent('receivedDateTime desc')}&$select=${SELECT}&$top=${M.PAGE}`;
    }
    const d = await graph(url, at);
    return { items: d.value || [], next: d['@odata.nextLink'] || '' };
  },
  async candidate(at, msg) {
    if (!okId(msg?.id)) return null;
    const base = { m: msg.id, date: msg.receivedDateTime || '', from: fromOf(msg.from), subject: String(msg.subject || '').slice(0, 160), link: /^https:\/\/outlook\.(live|office|office365)\.com\//.test(msg.webLink || '') ? msg.webLink : '' };
    if (!msg.hasAttachments) return { ...base, files: [] };
    const d = await graph(`/me/messages/${encodeURIComponent(msg.id)}/attachments?$select=${ATT_SELECT}`, at);
    const files = (d.value || []).filter(isFile).map(metaOf).filter(f => okId(f.part) && M.fileOk(f));
    /* tenía adjuntos pero ninguno es PDF o foto: no hay nada para traer ni un "sin adjunto" que mostrar */
    return files.length ? { ...base, files } : null;
  },
  async find(at, m, part) {
    const a = await graph(`/me/messages/${encodeURIComponent(m)}/attachments/${encodeURIComponent(part)}?$select=${ATT_SELECT}`, at);
    if (!isFile(a)) return null;
    const msg = await graph(`/me/messages/${encodeURIComponent(m)}?$select=from`, at).catch(() => ({}));
    return { ...metaOf(a), from: fromOf(msg.from) };
  },
  /* el contenido se baja recién al importar, crudo con /$value */
  download: (at, m, part) => graph(`/me/messages/${encodeURIComponent(m)}/attachments/${encodeURIComponent(part)}/$value`, at, { raw: true }),
};
