/* Mimitos · adaptador de Gmail para "Conectar tu mail" (el motor común está en petmail.js).

   Permiso mínimo: solo https://www.googleapis.com/auth/gmail.readonly (leer). Mimitos no manda,
   no borra ni modifica mails. En modo "Prueba" (testing) de Google solo entran los test users cargados en
   Google Cloud y el refresh token vence a los 7 días. Publicada "En producción" sin verificar, entra cualquiera
   (con la pantalla de "app no verificada") hasta 100 usuarios en toda la vida del proyecto: por eso el cupo
   MIMITOS_GMAIL_CAP (petmail.js). Si el token vence o se revoca, la app lo detecta y pide reconectar.

   Rutas (todas bajo /api/mascotas):
   GET  ?gmail=status            → { allowed, ready, full, connected, address, lastSearch, range, expired, queue:[…] }
   GET  ?gmail=start&range=12m|3y|all → 302 a Google (state anti-CSRF ligado a la sesión, un solo uso, 10 min)
                                   o, si Gmail llegó al cupo, a /mascotas#/gmail/completo (y guarda el interés)
   POST ?gmail=interest          → con el cupo lleno, guarda que la cuenta quiere Gmail → { ok, full }
   GET  ?gmail=callback          → intercambia el code y vuelve a /mascotas#/gmail/<resultado>
        (también entra por /mascotas/gmail/callback, que es el redirect URI que se registra en Google)
   POST ?gmail=search {mode:'new'|'all', cursor?} → { candidates, cursor|null, more|null, scanned, done }
   POST ?gmail=import {m, part}  → baja el adjunto, lo sube a Blob y lo lee con IA → { ref, data, petId, manual? }
                                   si no queda tope de IA: 429 { error, limit, queued:true }
   POST ?gmail=queue {items}     → deja en cola lo elegido que no entró hoy
   POST ?gmail=disconnect        → revoca el token en Google y borra todo lo guardado de Gmail
                                   (anda con sesión aunque no haya compra ni configuración: api/mascotas.js)
   El cuerpo del mail se lee (format=full) SOLO en los mails veterinarios sin adjunto, para buscar el link
   al estudio; no se guarda ni se loguea (ver petmail.js). OAuth con state firmado + PKCE S256. */
import * as M from './petmail.js';

export const SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const GM = 'https://gmail.googleapis.com/gmail/v1/users/me';
const { fail, form } = M;

/* lo común, re-exportado para quien ya lo usaba desde acá */
export { MAX_MESSAGES, PAGE, TIME_BUDGET_MS, MAX_FILE, MIN_IMG, BASE_TERMS, tokenKey, seal, open, signCursor, readCursor, namesOf, typeOf, readable, dedupeKey, suggestPet, allowList } from './petmail.js';
export const gmailAllowed = email => M.mailAllowed(email, 'gmail');
export const RANGES = { '12m': 'newer_than:1y', '3y': 'newer_than:3y', all: '' };

export function redirectUri(req) { return process.env.GOOGLE_REDIRECT_URI || M.hostBase(req) + '/mascotas/gmail/callback'; }
export function gmailConfig(req) {
  const clientId = process.env.GOOGLE_CLIENT_ID || '', secret = process.env.GOOGLE_CLIENT_SECRET || '';
  const key = M.tokenKey();
  return { clientId, secret, key, redirect: redirectUri(req), ready: Boolean(clientId && secret && key && (process.env.SESSION_SECRET || '').length >= 16) };
}

/* ---------- consulta de Gmail ---------- */
/* QUIÉN: (señal veterinaria | nombre de mascota | veterinaria conocida) fuera de Promociones y Social,
          o un remitente conocido (aprendido, agregado a mano o la veterinaria de la ficha) esté donde esté;
   QUÉ:   un PDF o una foto adjunta | un asunto veterinario o que anuncia un estudio | un remitente conocido.
          Así también aparecen los mails sin adjunto (laboratorios que mandan un link) para listarlos aparte;
   y nunca los remitentes que la persona marcó "No es de la mascota". El resto lo decide el puntaje.
   Todo va entre paréntesis: en Gmail el OR liga más fuerte que el AND implícito. Con y sin tilde. */
const qt = t => /\s/.test(t) ? `"${t}"` : t;
const SUBJECT_VET = ['veterinaria', 'veterinario', 'vet', 'mascota', 'canino', 'canina', 'felino', 'felina', 'antirrábica', 'antirrabica', 'vacuna', 'desparasitación', 'desparasitacion'];
const SUBJECT_DOC = ['resultado', 'resultados', 'estudio', 'estudios', 'informe', 'análisis', 'analisis', 'hemograma', 'ecografía', 'ecografia', 'radiografía', 'radiografia', 'receta', 'protocolo'];
export const FILE_TYPES = ['pdf', 'jpg', 'jpeg', 'png', 'heic', 'webp'];
export const MAX_QUERY = 1500;
export function buildQuery(doc, { range = '12m', after = 0, senders } = {}) {
  const P = M.queryParts(doc, senders);
  const names = P.names.map(n => `"${n}"`), known = P.knownNames.map(n => `"${n}"`);
  const froms = P.froms.map(f => `from:${f}`), muted = (P.muted || []).map(f => `-from:${f}`);
  const pets = P.petNames?.length ?? (doc?.pets?.length || 0);
  const when = after ? `after:${Math.floor(after / 1000)}` : (RANGES[range] ?? RANGES['12m']);
  const make = () => {
    const trusted = [...froms, ...known.map(k => `from:${k}`)];
    const who = `((${[...P.vet.map(qt), ...names, ...known].join(' OR ')}) -category:promotions -category:social)`;
    const what = `(${[...FILE_TYPES.map(t => `filename:${t}`), `subject:(${[...SUBJECT_VET, ...SUBJECT_DOC, ...names].join(' OR ')})`, ...froms].join(' OR ')})`;
    return [trusted.length ? `(${who} OR ${trusted.join(' OR ')})` : who, what, when, ...muted].filter(Boolean).join(' ');
  };
  let q = make();
  /* Gmail corta consultas muy largas: si se pasa, saca silenciados, nombres de veterinarias, razas y remitentes */
  while (q.length > MAX_QUERY && (muted.length || known.length || names.length > pets || froms.length)) {
    if (muted.length) muted.shift(); else if (known.length) known.pop(); else if (names.length > pets) names.pop(); else froms.pop();
    q = make();
  }
  return q;
}

/* ---------- adjuntos de un mail (acá solo la estructura; el cuerpo lo pide body(), más abajo) ---------- */
const PF = 'partId,mimeType,filename,body(attachmentId,size)';
/* labelIds: la categoría de Gmail (Promociones, Social) es un metadato, como los encabezados; no es el cuerpo */
export const MSG_FIELDS = `id,threadId,internalDate,labelIds,payload(headers,${PF},parts(${PF},parts(${PF},parts(${PF},parts(${PF})))))`;
export function partsOf(payload) {
  const out = [];
  const walk = (p, depth) => {
    if (!p || depth > 6) return;
    const name = String(p.filename || '').trim();
    const f = { part: String(p.partId ?? ''), name: name.slice(0, 120), type: M.typeOf(p.mimeType, name), size: Number(p.body?.size) || 0 };
    if (p.body?.attachmentId && M.fileOk(f)) out.push(f);
    for (const c of p.parts || []) walk(c, depth + 1);
  };
  walk(payload, 0);
  return out.filter(f => /^[0-9.]{1,20}$/.test(f.part));
}
const header = (h, n) => String((h || []).find(x => String(x.name).toLowerCase() === n)?.value || '').replace(/[\u0000-\u001f]/g, ' ').trim();
export function candidateOf(msg, imported = new Set()) {
  const files = partsOf(msg?.payload).filter(f => !imported.has(M.dedupeKey(msg.id, f.part)));
  if (!files.length) return null;
  const ms = Number(msg.internalDate) || Date.parse(header(msg.payload?.headers, 'date')) || 0;
  return { m: msg.id, date: ms ? new Date(ms).toISOString() : '', from: header(msg.payload?.headers, 'from').slice(0, 120), subject: header(msg.payload?.headers, 'subject').slice(0, 160), files };
}

/* el mail como lo usa el motor (también sin adjuntos, con el link para abrirlo en Gmail) */
export function messageOf(msg) {
  const ms = Number(msg.internalDate) || Date.parse(header(msg.payload?.headers, 'date')) || 0;
  const h = msg.payload?.headers;
  return { m: msg.id, date: ms ? new Date(ms).toISOString() : '', from: header(h, 'from').slice(0, 120), subject: header(h, 'subject').slice(0, 160), files: partsOf(msg.payload),
    labels: (msg.labelIds || []).filter(l => /^CATEGORY_[A-Z]+$/.test(l)), unsub: Boolean(header(h, 'list-unsubscribe')),
    link: /^[A-Za-z0-9]{6,40}$/.test(msg.threadId || '') ? `https://mail.google.com/mail/u/0/#all/${msg.threadId}` : '' };
}

/* ---------- Google ---------- */
async function tokenCall(params) {
  const r = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form(params) });
  const d = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, d };
}
async function gget(path, at) {
  const r = await fetch(GM + path, { headers: { Authorization: `Bearer ${at}` } });
  if (r.status === 401) throw fail('mail_vencido', 401);
  if (r.status === 429 || (r.status === 403 && /rate|quota|limit/i.test(await r.clone().text().catch(() => '')))) throw fail('mail_limite', 429);
  if (r.status === 404) throw fail('mail_no_encontrado', 404);
  if (!r.ok) throw fail('mail_error', 502);
  return r.json();
}
/* el texto del mail, SOLO para buscar el link a un estudio en mails que ya parecen veterinarios; no se guarda */
const BF = 'mimeType,body/data';
export const BODY_FIELDS = `payload(headers,${BF},parts(${BF},parts(${BF},parts(${BF},parts(${BF})))))`;
export function bodyOf(msg) {
  let html = '', text = '';
  const dec = d => Buffer.from(String(d || '').replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
  const walk = (p, depth) => {
    if (!p || depth > 6) return;
    const t = String(p.mimeType || '').toLowerCase();
    if (p.body?.data && t === 'text/html' && html.length < 400000) html += dec(p.body.data);
    else if (p.body?.data && t === 'text/plain' && text.length < 200000) text += dec(p.body.data);
    for (const c of p.parts || []) walk(c, depth + 1);
  };
  walk(msg?.payload, 0);
  return { html, text, from: header(msg?.payload?.headers, 'from') };
}
const getMsg = (id, at) => gget(`/messages/${encodeURIComponent(id)}?format=full&fields=${encodeURIComponent(MSG_FIELDS)}`, at);
const revokeToken = token => fetch(REVOKE_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form({ token }) });

export const gmail = {
  id: 'gmail', label: 'Gmail', revokes: true, consentUrl: 'https://myaccount.google.com/permissions',
  key: email => `orbit:petgmail:${String(email).toLowerCase()}`,
  config: gmailConfig,
  validId: m => /^[A-Za-z0-9]{6,40}$/.test(m),
  validPart: p => /^[0-9.]{1,20}$/.test(p),
  query: (doc, opts) => buildQuery(doc, opts),
  /* PKCE S256: el verifier se guarda con el state (petmail.makeState) y vuelve en el canje */
  authUrl: (cfg, state, challenge) => AUTH_URL + '?' + form({
    client_id: cfg.clientId, redirect_uri: cfg.redirect, response_type: 'code', scope: SCOPE,
    access_type: 'offline', prompt: 'consent', include_granted_scopes: 'false', state,
    ...(challenge ? { code_challenge: challenge, code_challenge_method: 'S256' } : {}),
  }),
  async exchange(cfg, code, verifier) {
    const { ok, d } = await tokenCall({ code, client_id: cfg.clientId, client_secret: cfg.secret, redirect_uri: cfg.redirect, grant_type: 'authorization_code', ...(verifier ? { code_verifier: verifier } : {}) });
    if (!ok || !d.access_token) { console.warn('gmail exchange:', d.error || 'sin_token', String(d.error_description || '').slice(0, 200)); return { error: 'error' }; }
    /* con el consentimiento granular la persona puede destildar el permiso: sin él no hay nada que hacer */
    if (!String(d.scope || '').split(/\s+/).includes(SCOPE)) { await revokeToken(d.refresh_token || d.access_token).catch(() => {}); return { error: 'sinpermiso' }; }
    if (!d.refresh_token) return { error: 'error' };
    let address = '';
    try { address = String((await gget('/profile', d.access_token)).emailAddress || ''); } catch {}
    return { refresh: d.refresh_token, address };
  },
  async refresh(cfg, refresh) {
    const { ok, d } = await tokenCall({ client_id: cfg.clientId, client_secret: cfg.secret, refresh_token: refresh, grant_type: 'refresh_token' });
    if (!ok) { if (d.error === 'invalid_grant') return { expired: true }; throw fail('mail_error', 502); }
    return { access: d.access_token };
  },
  async revoke(cfg, refresh) { const r = await revokeToken(refresh); return r.ok || r.status === 400; },   // 400 = ya estaba revocado
  async list(at, cur) {
    const list = await gget(`/messages?maxResults=${M.PAGE}&q=${encodeURIComponent(cur.q)}${cur.page ? '&pageToken=' + encodeURIComponent(cur.page) : ''}`, at);
    return { items: (list.messages || []).map(x => x.id).filter(x => /^[A-Za-z0-9]{6,40}$/.test(x)), next: list.nextPageToken || '' };
  },
  async candidate(at, id) { return messageOf(await getMsg(id, at)); },
  async body(at, id) { return bodyOf(await gget(`/messages/${encodeURIComponent(id)}?format=full&fields=${encodeURIComponent(BODY_FIELDS)}`, at)); },
  /* el attachmentId de Gmail cambia entre lecturas: se busca por partId, que es estable dentro del mail */
  async find(at, m, part) {
    const msg = await getMsg(m, at);
    const find = p => { if (!p) return null; if (String(p.partId) === part) return p; for (const c of p.parts || []) { const x = find(c); if (x) return x; } return null; };
    const p = find(msg.payload);
    const meta = p && p.body?.attachmentId && partsOf({ ...p, parts: [] })[0];
    return meta ? { ...meta, attachmentId: p.body.attachmentId, from: header(msg.payload?.headers, 'from') } : null;
  },
  async download(at, m, part, meta) {
    const raw = await gget(`/messages/${encodeURIComponent(m)}/attachments/${encodeURIComponent(meta.attachmentId)}`, at);
    return Buffer.from(String(raw.data || '').replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  },
};

/* ---------- API de siempre (la usan las pruebas y el handler) ---------- */
export async function makeState(email, range, secret) { return (await M.makeState(email, range, 'gmail', secret)).state; }
export async function checkState(state, email, secret) { const r = await M.checkState(state, email, 'gmail', secret); return r ? { range: r.range } : null; }
export const getState = email => M.getState(gmail, email);
export const saveState = (email, s) => M.saveState(gmail, email, s);
export const accessToken = (email, st, cfg) => M.accessToken(gmail, email, st, cfg);
export const search = (email, doc, st, cfg, body, now) => M.search(gmail, email, doc, st, cfg, body, now);
export const importOne = (email, st, cfg, body, deps) => M.importOne(gmail, email, st, cfg, body, deps);
export const disconnect = (email, st, cfg) => M.disconnect(gmail, email, st, cfg);
export const handleGmail = (req, res, ctx) => M.handleMail(gmail, req, res, ctx);
