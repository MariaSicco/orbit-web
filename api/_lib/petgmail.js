/* Mimitos · "Conectar Gmail": busca estudios veterinarios en el mail personal de la dueña o el dueño
   y los importa al historial clínico por el mismo motor de los estudios (Blob privado + lectura con IA
   + revisión antes de guardar).

   Permiso mínimo: solo https://www.googleapis.com/auth/gmail.readonly (leer). Mimitos no manda,
   no borra ni modifica mails.

   Qué se guarda (orbit:petgmail:<email de Orbit>), y nada más:
   - el refresh token de Google, CIFRADO con AES-256-GCM (clave MIMITOS_TOKEN_KEY) y atado a la cuenta;
   - la dirección de Gmail conectada (para mostrar "Conectado como …"), el rango elegido y la fecha de la última búsqueda;
   - los ids de los adjuntos ya importados (messageId:partId), para no volver a ofrecerlos;
   - la cola: los adjuntos que la persona eligió importar y no entraron en el tope de IA del día (ids y nombre del archivo).
   Del resto de los mails no se guarda nada: asunto, remitente y nombres de adjuntos viajan al navegador
   para elegir y se descartan. El cuerpo de los mails nunca se pide (las consultas piden solo encabezados
   y la estructura de adjuntos).

   Acceso: sesión de Orbit + compra de Mimitos (lo valida api/mascotas.js) + estar en MIMITOS_GMAIL_ALLOW
   o ser admin. Mientras la app de Google esté en modo "testing", solo entran los test users cargados en
   Google Cloud y el refresh token vence a los 7 días: la app lo detecta y pide volver a conectar.

   Rutas (todas bajo /api/mascotas):
   GET  ?gmail=status            → { allowed, ready, connected, address, lastSearch, range, expired, queue:[…] }
   GET  ?gmail=start&range=12m|3y|all → 302 a Google (state anti-CSRF ligado a la sesión, un solo uso, 10 min)
   GET  ?gmail=callback          → intercambia el code y vuelve a /mascotas#/gmail/<resultado>
        (también entra por /mascotas/gmail/callback, que es el redirect URI que se registra en Google)
   POST ?gmail=search {mode:'new'|'all', cursor?} → { candidates, cursor|null, more|null, scanned, done }
   POST ?gmail=import {m, part}  → baja el adjunto, lo sube a Blob y lo lee con IA → { ref, data, petId, manual? }
                                   si no queda tope de IA: 429 { error, limit, queued:true }
   POST ?gmail=queue {items}     → deja en cola lo elegido que no entró hoy
   POST ?gmail=disconnect        → revoca el token en Google y borra todo lo guardado de Gmail */
import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { kvGet, kvSet, kvDel } from './kv.js';
import { isAdmin } from './admin.js';

export const SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const GM = 'https://gmail.googleapis.com/gmail/v1/users/me';

export const MAX_MESSAGES = 200;       // mails revisados por búsqueda
export const PAGE = 50;                // ids por página de messages.list
export const TIME_BUDGET_MS = 8000;    // cada llamada corta antes y devuelve un cursor para seguir
const PARALLEL = 10;                   // messages.get en paralelo (5 unidades c/u: muy debajo del tope por usuario)
export const MAX_FILE = 15 * 1024 * 1024;
export const MIN_IMG = 20 * 1024;      // imágenes más chicas suelen ser logos o firmas
const MAX_IMPORTED = 3000, MAX_QUEUE = 100;
const STATE_TTL = 600;

export const RANGES = { '12m': 'newer_than:1y', '3y': 'newer_than:3y', all: '' };
export const BASE_TERMS = ['veterinari*', 'laboratorio', 'análisis', 'analisis', 'hemograma', 'ecografía', 'ecografia', 'radiografía', 'radiografia', 'estudio', 'resultado', 'receta', 'informe'];

const gKey = email => `orbit:petgmail:${String(email).toLowerCase()}`;
const sKey = nonce => `orbit:petgstate:${nonce}`;

/* ---------- quién puede usarlo ---------- */
export const allowList = () => (process.env.MIMITOS_GMAIL_ALLOW || '').split(/[,;\n]+/).map(s => s.replace(/\s+/g, '').toLowerCase()).filter(Boolean);
export const gmailAllowed = email => Boolean(email) && (isAdmin(email) || allowList().includes(String(email).replace(/\s+/g, '').toLowerCase()));

/* ---------- configuración (solo se lee: no se inventa ni se carga nada) ---------- */
export function tokenKey(raw = process.env.MIMITOS_TOKEN_KEY) {
  const v = String(raw || '').trim();
  if (!v) return null;
  const buf = /^[0-9a-f]{64}$/i.test(v) ? Buffer.from(v, 'hex') : Buffer.from(v.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  return buf.length === 32 ? buf : null;
}
export function redirectUri(req) {
  if (process.env.GOOGLE_REDIRECT_URI) return process.env.GOOGLE_REDIRECT_URI;
  /* el mismo host que abrió el flujo: así la cookie de sesión vuelve con el callback (preview o producción) */
  const host = String(req?.headers?.['x-forwarded-host'] || req?.headers?.host || '').split(',')[0].trim();
  const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
  const base = host ? `${local ? 'http' : 'https'}://${host}` : (process.env.SITE_URL || 'https://www.orbitando.com.ar');
  return base.replace(/\/$/, '') + '/mascotas/gmail/callback';
}
export function gmailConfig(req) {
  const clientId = process.env.GOOGLE_CLIENT_ID || '', secret = process.env.GOOGLE_CLIENT_SECRET || '';
  const key = tokenKey();
  return { clientId, secret, key, redirect: redirectUri(req), ready: Boolean(clientId && secret && key && (process.env.SESSION_SECRET || '').length >= 16) };
}

/* ---------- cifrado del token: AES-256-GCM, la cuenta de Orbit va como dato asociado ---------- */
export function seal(text, key, aad) {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  c.setAAD(Buffer.from(String(aad).toLowerCase()));
  const ct = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
  return ['v1', iv.toString('base64url'), c.getAuthTag().toString('base64url'), ct.toString('base64url')].join('.');
}
export function open(sealed, key, aad) {
  const [v, iv, tag, ct] = String(sealed || '').split('.');
  if (v !== 'v1' || !iv || !tag || !ct) throw new Error('token_invalido');
  const d = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
  d.setAAD(Buffer.from(String(aad).toLowerCase()));
  d.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([d.update(Buffer.from(ct, 'base64url')), d.final()]).toString('utf8');
}

/* ---------- state anti-CSRF: firmado con la sesión, guardado en KV, un solo uso ---------- */
const mac = (secret, data) => createHmac('sha256', secret).update(data).digest('base64url');
export async function makeState(email, range, secret = process.env.SESSION_SECRET || '') {
  const nonce = randomBytes(18).toString('base64url');
  await kvSet(sKey(nonce), { email: String(email).toLowerCase(), range }, STATE_TTL);
  return `${nonce}.${mac(secret, `gmail|${nonce}|${String(email).toLowerCase()}`)}`;
}
export async function checkState(state, email, secret = process.env.SESSION_SECRET || '') {
  const [nonce, sig] = String(state || '').split('.');
  if (!nonce || !sig || !/^[A-Za-z0-9_-]{20,40}$/.test(nonce)) return null;
  const want = Buffer.from(mac(secret, `gmail|${nonce}|${String(email).toLowerCase()}`)), got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  const saved = await kvGet(sKey(nonce));
  if (!saved || saved.email !== String(email).toLowerCase()) return null;
  await kvDel(sKey(nonce));   // un solo uso
  return { range: RANGES[saved.range] !== undefined ? saved.range : '12m' };
}

/* cursor de búsqueda: viaja al navegador y vuelve, firmado para que no se pueda cambiar la consulta */
export function signCursor(obj, email, secret = process.env.SESSION_SECRET || '') {
  const p = Buffer.from(JSON.stringify(obj)).toString('base64url');
  return `${p}.${mac(secret, `cur|${p}|${String(email).toLowerCase()}`)}`;
}
export function readCursor(c, email, secret = process.env.SESSION_SECRET || '') {
  const [p, sig] = String(c || '').split('.');
  if (!p || !sig) return null;
  const want = Buffer.from(mac(secret, `cur|${p}|${String(email).toLowerCase()}`)), got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try { return JSON.parse(Buffer.from(p, 'base64url').toString()); } catch { return null; }
}

/* ---------- consulta de Gmail ---------- */
/* nombre seguro para meter entre comillas en la búsqueda: letras, números, espacios y . ' - */
const term = v => String(v || '').normalize('NFC').replace(/["()\\{}:]/g, ' ').replace(/[^\p{L}\p{N} .'-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);
export function namesOf(doc) {
  const pets = [], vets = [];
  for (const p of doc?.pets || []) {
    pets.push(p.name);
    vets.push(p.vet?.name, p.vet?.er);
    for (const r of p.records || []) vets.push(r.vet);
    for (const v of p.visits || []) vets.push(v.vet);
    for (const x of p.studies || []) vets.push(x.lab);
  }
  const seen = new Set(), out = [];
  for (const n of [...pets, ...vets].map(term)) {
    const k = n.toLowerCase();
    if (n.length < 3 || /^sin nombre$/i.test(n) || seen.has(k)) continue;
    seen.add(k); out.push(n);
  }
  return out.slice(0, 20);
}
export function buildQuery(doc, { range = '12m', after = 0 } = {}) {
  const extra = namesOf(doc).map(n => `"${n}"`);
  const when = after ? `after:${Math.floor(after / 1000)}` : (RANGES[range] ?? RANGES['12m']);
  let q = `has:attachment (${[...BASE_TERMS, ...extra].join(' OR ')})${when ? ' ' + when : ''}`;
  /* Gmail corta consultas muy largas: si se pasa, saca nombres del final */
  while (q.length > 1500 && extra.length) { extra.pop(); q = `has:attachment (${[...BASE_TERMS, ...extra].join(' OR ')})${when ? ' ' + when : ''}`; }
  return q;
}

/* ---------- adjuntos de un mail (solo la estructura: nunca el cuerpo) ---------- */
const PF = 'partId,mimeType,filename,body(attachmentId,size)';
export const MSG_FIELDS = `id,internalDate,payload(headers,${PF},parts(${PF},parts(${PF},parts(${PF},parts(${PF})))))`;
const EXT = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif' };
export const typeOf = (mime, name) => {
  const m = String(mime || '').toLowerCase();
  if (/^(application\/pdf|image\/(jpeg|png|webp|heic|heif))$/.test(m)) return m;
  if (m === 'image/jpg') return 'image/jpeg';
  return EXT[(String(name || '').split('.').pop() || '').toLowerCase()] || '';
};
export const readable = t => /^(image\/(jpeg|png|webp)|application\/pdf)$/.test(t);
export function partsOf(payload) {
  const out = [];
  const walk = (p, depth) => {
    if (!p || depth > 6) return;
    const name = String(p.filename || '').trim();
    const t = typeOf(p.mimeType, name), size = Number(p.body?.size) || 0;
    if (name && p.body?.attachmentId && t && size <= MAX_FILE && !(t.startsWith('image/') && size < MIN_IMG)) {
      out.push({ part: String(p.partId ?? ''), name: name.slice(0, 120), type: t, size });
    }
    for (const c of p.parts || []) walk(c, depth + 1);
  };
  walk(payload, 0);
  return out.filter(f => /^[0-9.]{1,20}$/.test(f.part));
}
export const dedupeKey = (m, part) => `${m}:${part}`;
const header = (h, n) => String((h || []).find(x => String(x.name).toLowerCase() === n)?.value || '').replace(/[\u0000-\u001f]/g, ' ').trim();
export function candidateOf(msg, imported) {
  const files = partsOf(msg?.payload).filter(f => !imported.has(dedupeKey(msg.id, f.part)));
  if (!files.length) return null;
  const ms = Number(msg.internalDate) || Date.parse(header(msg.payload?.headers, 'date')) || 0;
  return { m: msg.id, date: ms ? new Date(ms).toISOString() : '', from: header(msg.payload?.headers, 'from').slice(0, 120), subject: header(msg.payload?.headers, 'subject').slice(0, 160), files };
}

/* ---------- a qué mascota corresponde ---------- */
const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const hasWord = (hay, w) => w.length >= 3 && new RegExp(`(^|[^a-z0-9])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`).test(hay);
export function suggestPet(pets, ai = {}, extra = '') {
  if (!pets?.length) return '';
  if (pets.length === 1) return pets[0].id;
  const said = fold([ai.petName, extra].join(' ')), sp = fold(ai.species), br = fold(ai.breed), vet = fold(ai.vet || ai.lab);
  let best = '', top = 0, tie = false;
  for (const p of pets) {
    let s = 0;
    if (hasWord(said, fold(p.name))) s += 10;
    if (br && p.breed && (fold(p.breed).includes(br) || br.includes(fold(p.breed)))) s += 3;
    if (sp && /perr|canin/.test(sp) && p.species === 'perro') s += 2;
    if (sp && /gat|felin/.test(sp) && p.species === 'gato') s += 2;
    const vets = [p.vet?.name, ...(p.records || []).map(r => r.vet), ...(p.visits || []).map(v => v.vet), ...(p.studies || []).map(x => x.lab)].map(fold).filter(v => v.length >= 3);
    if (vet && vets.some(v => vet.includes(v) || v.includes(vet))) s += 1;
    if (s > top) { top = s; best = p.id; tie = false; } else if (s === top && s > 0) tie = true;
  }
  return top > 0 && !tie ? best : '';
}

/* ---------- estado guardado ---------- */
export async function getState(email) {
  const s = (await kvGet(gKey(email))) || {};
  return { tok: s.tok || '', address: s.address || '', connectedAt: s.connectedAt || '', range: RANGES[s.range] !== undefined ? s.range : '12m', lastSearch: s.lastSearch || '', expired: Boolean(s.expired), imported: Array.isArray(s.imported) ? s.imported : [], queue: Array.isArray(s.queue) ? s.queue : [] };
}
export async function saveState(email, s) {
  s.imported = s.imported.slice(-MAX_IMPORTED); s.queue = s.queue.slice(0, MAX_QUEUE);
  await kvSet(gKey(email), s);
}
export const statusView = (s, allowed, ready) => ({
  allowed, ready, connected: Boolean(s.tok), address: s.address, lastSearch: s.lastSearch, range: s.range, expired: s.expired,
  queue: s.queue.map(x => ({ m: x.m, part: x.part, name: x.name, type: x.type })),
});

/* ---------- Google ---------- */
const fail = (error, status) => Object.assign(new Error(error), { status, code: error });
const form = o => new URLSearchParams(o).toString();
async function tokenCall(params) {
  const r = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form(params) });
  const d = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, d };
}
/* access token de un rato: siempre se pide con el refresh token, no se guarda */
export async function accessToken(email, st, cfg) {
  if (!st.tok) throw fail('gmail_no_conectado', 409);
  let refresh;
  try { refresh = open(st.tok, cfg.key, email); } catch { throw fail('gmail_vencido', 401); }
  const { ok, d } = await tokenCall({ client_id: cfg.clientId, client_secret: cfg.secret, refresh_token: refresh, grant_type: 'refresh_token' });
  if (!ok) {
    /* invalid_grant: lo revocaron o venció (en modo testing, a los 7 días) */
    if (d.error === 'invalid_grant') { st.tok = ''; st.expired = true; await saveState(email, st); throw fail('gmail_vencido', 401); }
    throw fail('gmail_error', 502);
  }
  return d.access_token;
}
async function gget(path, at) {
  const r = await fetch(GM + path, { headers: { Authorization: `Bearer ${at}` } });
  if (r.status === 401) throw fail('gmail_vencido', 401);
  if (r.status === 429 || (r.status === 403 && /rate|quota|limit/i.test(await r.clone().text().catch(() => '')))) throw fail('gmail_limite', 429);
  if (r.status === 404) throw fail('gmail_no_encontrado', 404);
  if (!r.ok) throw fail('gmail_error', 502);
  return r.json();
}
const getMsg = (id, at) => gget(`/messages/${encodeURIComponent(id)}?format=full&fields=${encodeURIComponent(MSG_FIELDS)}`, at);

/* ---------- búsqueda por tandas ---------- */
export async function search(email, doc, st, cfg, body, now = Date.now) {
  const t0 = now();
  let cur = body?.cursor ? readCursor(body.cursor, email) : null;
  if (body?.cursor && !cur) throw fail('cursor_invalido', 400);
  if (!cur) {
    const mode = body?.mode === 'new' && st.lastSearch ? 'new' : 'all';
    const after = mode === 'new' ? Date.parse(st.lastSearch) - 864e5 : 0;   // un día de margen; lo repetido lo filtra el dedupe
    cur = { q: buildQuery(doc, { range: st.range, after }), page: '', skip: 0, scanned: 0, started: new Date(t0).toISOString(), mode };
  }
  const at = await accessToken(email, st, cfg);
  /* lo ya importado y lo que está en cola no se vuelve a ofrecer */
  const imported = new Set([...st.imported, ...st.queue.map(x => dedupeKey(x.m, x.part))]);
  const candidates = [];
  for (;;) {
    const list = await gget(`/messages?maxResults=${PAGE}&q=${encodeURIComponent(cur.q)}${cur.page ? '&pageToken=' + encodeURIComponent(cur.page) : ''}`, at);
    const ids = (list.messages || []).map(x => x.id).filter(x => /^[A-Za-z0-9]{6,40}$/.test(x));
    for (let i = cur.skip; i < ids.length;) {
      if (now() - t0 > TIME_BUDGET_MS) return { candidates, cursor: signCursor({ ...cur, skip: i }, email), more: null, scanned: cur.scanned, done: false };
      /* tope de 200 por búsqueda: se puede seguir con "Buscar más" */
      if (cur.scanned >= MAX_MESSAGES) return { candidates, cursor: null, more: signCursor({ ...cur, skip: i, scanned: 0 }, email), scanned: cur.scanned, done: true };
      const n = Math.min(PARALLEL, ids.length - i, MAX_MESSAGES - cur.scanned);
      const msgs = await Promise.all(ids.slice(i, i + n).map(id => getMsg(id, at).catch(e => { if (e.code === 'gmail_vencido' || e.code === 'gmail_limite') throw e; return null; })));
      for (const m of msgs) { const c = m && candidateOf(m, imported); if (c) candidates.push(c); }
      i += n; cur.scanned += n;
    }
    if (!list.nextPageToken) break;
    if (now() - t0 > TIME_BUDGET_MS) return { candidates, cursor: signCursor({ ...cur, page: list.nextPageToken, skip: 0 }, email), more: null, scanned: cur.scanned, done: false };
    if (cur.scanned >= MAX_MESSAGES) return { candidates, cursor: null, more: signCursor({ ...cur, page: list.nextPageToken, skip: 0, scanned: 0 }, email), scanned: cur.scanned, done: true };
    cur.page = list.nextPageToken; cur.skip = 0;
  }
  st.lastSearch = cur.started; st.expired = false;
  await saveState(email, st);
  return { candidates, cursor: null, more: null, scanned: cur.scanned, done: true };
}

/* ---------- importar un adjunto elegido ---------- */
export async function importOne(email, st, cfg, body, deps) {
  const m = String(body?.m || ''), part = String(body?.part || '');
  if (!/^[A-Za-z0-9]{6,40}$/.test(m) || !/^[0-9.]{1,20}$/.test(part)) throw fail('invalid', 400);
  const key = dedupeKey(m, part);
  if (st.imported.includes(key)) throw fail('ya_importado', 409);
  const at = await accessToken(email, st, cfg);
  const msg = await getMsg(m, at);
  /* el attachmentId de Gmail cambia entre lecturas: se busca por partId, que es estable dentro del mail */
  const find = p => { if (!p) return null; if (String(p.partId) === part) return p; for (const c of p.parts || []) { const x = find(c); if (x) return x; } return null; };
  const p = find(msg.payload);
  const meta = p && partsOf({ ...p, parts: [] })[0];
  if (!meta) throw fail('adjunto_no_encontrado', 404);
  const canRead = readable(meta.type);
  const queueIt = async stop => {
    if (!st.queue.some(x => dedupeKey(x.m, x.part) === key)) st.queue.push({ m, part, name: meta.name, type: meta.type });
    await saveState(email, st);
    return { ...stop, queued: true };
  };
  /* el tope de IA se mira antes de bajar nada: si no hay lugar, queda en cola */
  if (canRead) { const stop = await deps.peekScan(email); if (stop) return { status: 429, body: await queueIt(stop) }; }
  if (!(await deps.fits(email, meta.size))) throw fail('cupo_lleno', 413);
  const raw = await gget(`/messages/${encodeURIComponent(m)}/attachments/${encodeURIComponent(p.body.attachmentId)}`, at);
  const buf = Buffer.from(String(raw.data || '').replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  if (!buf.length) throw fail('adjunto_vacio', 422);
  if (buf.length > MAX_FILE) throw fail('too_big', 413);
  const ref = await deps.putFile(email, meta.name, buf, meta.type);
  await deps.addUsage(email, ref, buf.length);
  st.imported.push(key);
  st.queue = st.queue.filter(x => dedupeKey(x.m, x.part) !== key);
  await saveState(email, st);
  const file = { ref, name: meta.name, type: meta.type };
  if (!canRead) return { status: 200, body: { ref: file, data: null, manual: 'tipo_no_legible', petId: deps.pets.length === 1 ? deps.pets[0].id : '' } };
  const stop = await deps.takeScan(email);
  if (stop) return { status: 200, body: { ref: file, data: null, manual: stop.error, limit: stop.limit, petId: deps.pets.length === 1 ? deps.pets[0].id : '' } };
  try {
    const data = await deps.scanStudy(buf, meta.type, deps.pets);
    return { status: 200, body: { ref: file, data, petId: suggestPet(deps.pets, { petName: data.pet?.name, species: data.pet?.species, breed: data.pet?.breed, lab: data.lab }, meta.name) } };
  } catch (e) {
    return { status: 200, body: { ref: file, data: null, manual: e.message || 'ia_error', petId: suggestPet(deps.pets, {}, meta.name) } };
  }
}

/* ---------- desconectar: revoca en Google y borra todo ---------- */
export async function disconnect(email, st, cfg) {
  let revoked = false;
  if (st.tok && cfg.key) {
    try {
      const refresh = open(st.tok, cfg.key, email);
      const r = await fetch(REVOKE_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form({ token: refresh }) });
      revoked = r.ok || r.status === 400;   // 400 = ya estaba revocado o vencido
    } catch { /* igual se borra */ }
  }
  await kvDel(gKey(email));
  return { ok: true, revoked };
}

/* ---------- handler ---------- */
const back = (res, to) => { res.setHeader('Location', '/mascotas#/' + to); return res.status(302).end(); };
export async function handleGmail(req, res, ctx) {
  const q = req.query || {}, action = String(q.gmail);
  const { email } = ctx;
  const allowed = gmailAllowed(email), cfg = gmailConfig(req);
  const nav = action === 'start' || action === 'callback';
  if (!allowed) return nav ? back(res, 'cuenta') : res.status(403).json({ error: 'gmail_no_habilitado', allowed: false });
  const st = await getState(email);

  if (action === 'status') return res.status(200).json(statusView(st, true, cfg.ready));
  if (!cfg.ready) return nav ? back(res, 'gmail/sinconfig') : res.status(503).json({ error: 'gmail_no_configurado' });

  if (action === 'start') {
    const range = RANGES[q.range] !== undefined ? String(q.range) : '12m';
    const state = await makeState(email, range);
    const url = AUTH_URL + '?' + form({
      client_id: cfg.clientId, redirect_uri: cfg.redirect, response_type: 'code', scope: SCOPE,
      access_type: 'offline', prompt: 'consent', include_granted_scopes: 'false', state,
    });
    res.setHeader('Location', url);
    return res.status(302).end();
  }

  if (action === 'callback') {
    const ok = await checkState(q.state, email);
    if (!ok) return back(res, 'gmail/error');
    if (q.error) return back(res, q.error === 'access_denied' ? 'gmail/cancelado' : 'gmail/error');
    if (!q.code) return back(res, 'gmail/error');
    const { ok: tok, d } = await tokenCall({ code: String(q.code), client_id: cfg.clientId, client_secret: cfg.secret, redirect_uri: cfg.redirect, grant_type: 'authorization_code' });
    if (!tok || !d.access_token) return back(res, 'gmail/error');
    /* con el consentimiento granular la persona puede destildar el permiso: sin él no hay nada que hacer */
    const scopes = String(d.scope || '').split(/\s+/);
    if (!scopes.includes(SCOPE)) {
      await fetch(REVOKE_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form({ token: d.refresh_token || d.access_token }) }).catch(() => {});
      return back(res, 'gmail/sinpermiso');
    }
    if (!d.refresh_token) return back(res, 'gmail/error');
    let address = '';
    try { address = String((await gget('/profile', d.access_token)).emailAddress || '').slice(0, 120); } catch {}
    const next = { ...st, tok: seal(d.refresh_token, cfg.key, email), address, connectedAt: new Date().toISOString(), range: ok.range, expired: false };
    /* conectar otra casilla arranca de cero; reconectar la misma conserva lo ya importado */
    if (st.address && address && st.address.toLowerCase() !== address.toLowerCase()) { next.imported = []; next.queue = []; next.lastSearch = ''; }
    if (st.range !== ok.range) next.lastSearch = '';
    await saveState(email, next);
    return back(res, 'gmail/conectado');
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  const body = ctx.body || {};
  try {
    if (action === 'search') return res.status(200).json(await search(email, await ctx.getDoc(), st, cfg, body));
    if (action === 'import') {
      const doc = await ctx.getDoc();
      const out = await importOne(email, st, cfg, body, { ...ctx.deps, pets: doc.pets || [] });
      return res.status(out.status).json(out.body);
    }
    if (action === 'queue') {
      for (const x of (Array.isArray(body.items) ? body.items : []).slice(0, MAX_QUEUE)) {
        const m = String(x?.m || ''), part = String(x?.part || '');
        if (!/^[A-Za-z0-9]{6,40}$/.test(m) || !/^[0-9.]{1,20}$/.test(part)) continue;
        const key = dedupeKey(m, part);
        if (st.imported.includes(key) || st.queue.some(y => dedupeKey(y.m, y.part) === key)) continue;
        st.queue.push({ m, part, name: String(x.name || 'adjunto').slice(0, 120), type: typeOf(x.type, x.name) });
      }
      await saveState(email, st);
      return res.status(200).json(statusView(st, true, true));
    }
    if (action === 'unqueue') {
      const keys = new Set((Array.isArray(body.items) ? body.items : []).map(x => dedupeKey(x?.m, x?.part)));
      st.queue = st.queue.filter(x => !keys.has(dedupeKey(x.m, x.part)));
      await saveState(email, st);
      return res.status(200).json(statusView(st, true, true));
    }
    if (action === 'disconnect') return res.status(200).json(await disconnect(email, st, cfg));
    return res.status(400).json({ error: 'invalid' });
  } catch (e) {
    return res.status(e.status || 502).json({ error: e.code || 'gmail_error' });
  }
}
