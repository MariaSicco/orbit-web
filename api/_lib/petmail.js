/* Mimitos · "Conectar tu mail": motor común para traer estudios veterinarios desde el mail personal
   (Gmail en petgmail.js, Outlook/Hotmail/Live/Microsoft 365 en petoutlook.js) al historial clínico,
   por el mismo camino que "Subir estudios": Blob privado + lectura con IA + revisión antes de guardar.

   Cada proveedor es un adaptador con: config, authUrl, exchange, refresh, revoke, list, candidate,
   find y download. Este módulo pone lo que es igual para todos:
   - quién puede usarlo (MIMITOS_MAIL_ALLOW, o la vieja MIMITOS_GMAIL_ALLOW, más admin);
   - el refresh token CIFRADO con AES-256-GCM (MIMITOS_TOKEN_KEY), atado a la cuenta de Orbit;
   - el state anti-CSRF firmado con la sesión, guardado en KV, de un solo uso (con PKCE si el proveedor lo usa);
   - la consulta (términos veterinarios + nombres de mascotas y veterinarias del doc);
   - la búsqueda por tandas con cursor firmado, tope de 200 mails y 8 s por llamada;
   - candidatos, dedupe, cola cuando no queda tope de IA, sugerencia de mascota y desconexión.

   Qué se guarda por proveedor (orbit:pet<proveedor>:<email de Orbit>), y nada más: el token cifrado,
   la dirección conectada, el rango, la fecha de la última búsqueda, los ids importados y la cola.
   Asunto, remitente y nombres de adjuntos viajan al navegador para elegir y se descartan; el cuerpo
   de los mails nunca se pide. */
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { kvGet, kvSet, kvDel } from './kv.js';
import { isAdmin } from './admin.js';

export const MAX_MESSAGES = 200;       // mails revisados por búsqueda
export const PAGE = 50;                // mails por página del listado
export const TIME_BUDGET_MS = 8000;    // cada llamada corta antes y devuelve un cursor para seguir
const PARALLEL = 10;
export const MAX_FILE = 15 * 1024 * 1024;
export const MIN_IMG = 20 * 1024;      // imágenes más chicas suelen ser logos o firmas
const MAX_IMPORTED = 3000, MAX_QUEUE = 100;
const STATE_TTL = 600;

export const RANGES = { '12m': 365, '3y': 3 * 365, all: 0 };   // días hacia atrás (0 = todo)
export const BASE_TERMS = ['veterinari*', 'laboratorio', 'análisis', 'analisis', 'hemograma', 'ecografía', 'ecografia', 'radiografía', 'radiografia', 'estudio', 'resultado', 'receta', 'informe'];

const sKey = nonce => `orbit:petmstate:${nonce}`;

/* ---------- quién puede usarlo ---------- */
export const allowList = () => (process.env.MIMITOS_MAIL_ALLOW || process.env.MIMITOS_GMAIL_ALLOW || '').split(/[,;\n]+/).map(s => s.replace(/\s+/g, '').toLowerCase()).filter(Boolean);
export const mailAllowed = email => Boolean(email) && (isAdmin(email) || allowList().includes(String(email).replace(/\s+/g, '').toLowerCase()));

/* ---------- clave y cifrado del token: AES-256-GCM, la cuenta de Orbit va como dato asociado ---------- */
export function tokenKey(raw = process.env.MIMITOS_TOKEN_KEY) {
  const v = String(raw || '').trim();
  if (!v) return null;
  const buf = /^[0-9a-f]{64}$/i.test(v) ? Buffer.from(v, 'hex') : Buffer.from(v.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  return buf.length === 32 ? buf : null;
}
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
/* el mismo host que abrió el flujo: así la cookie de sesión vuelve con el callback (preview o producción) */
export function hostBase(req) {
  const host = String(req?.headers?.['x-forwarded-host'] || req?.headers?.host || '').split(',')[0].trim();
  const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
  return (host ? `${local ? 'http' : 'https'}://${host}` : (process.env.SITE_URL || 'https://www.orbitando.com.ar')).replace(/\/$/, '');
}

/* ---------- state anti-CSRF: firmado con la sesión, guardado en KV, un solo uso ---------- */
const mac = (secret, data) => createHmac('sha256', secret).update(data).digest('base64url');
export async function makeState(email, range, provider = 'gmail', secret = process.env.SESSION_SECRET || '') {
  const nonce = randomBytes(18).toString('base64url');
  const verifier = randomBytes(32).toString('base64url');   // PKCE, para el proveedor que lo use
  await kvSet(sKey(nonce), { email: String(email).toLowerCase(), range, provider, verifier }, STATE_TTL);
  return { state: `${nonce}.${mac(secret, `${provider}|${nonce}|${String(email).toLowerCase()}`)}`, challenge: createHash('sha256').update(verifier).digest('base64url') };
}
export async function checkState(state, email, provider = 'gmail', secret = process.env.SESSION_SECRET || '') {
  const [nonce, sig] = String(state || '').split('.');
  if (!nonce || !sig || !/^[A-Za-z0-9_-]{20,40}$/.test(nonce)) return null;
  const want = Buffer.from(mac(secret, `${provider}|${nonce}|${String(email).toLowerCase()}`)), got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  const saved = await kvGet(sKey(nonce));
  if (!saved || saved.email !== String(email).toLowerCase() || saved.provider !== provider) return null;
  await kvDel(sKey(nonce));   // un solo uso
  return { range: RANGES[saved.range] !== undefined ? saved.range : '12m', verifier: saved.verifier };
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

/* ---------- términos de búsqueda ---------- */
/* nombre seguro para meter entre comillas: letras, números, espacios y . ' - */
export const term = v => String(v || '').normalize('NFC').replace(/["()\\{}:]/g, ' ').replace(/[^\p{L}\p{N} .'-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);
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
/* desde cuándo buscar: "buscar de nuevo" usa la última búsqueda (con un día de margen; lo repetido lo filtra el dedupe) */
export function sinceOf({ range = '12m', after = 0 } = {}, now = Date.now()) {
  if (after) return after;
  const days = RANGES[range] ?? RANGES['12m'];
  return days ? now - days * 864e5 : 0;
}
/* para el modo sin búsqueda de texto: ¿el asunto, el remitente o un adjunto suenan veterinarios? */
const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export function matchesTerms(text, doc) {
  const t = fold(text);
  const words = [...BASE_TERMS.map(w => fold(w.replace('*', ''))), ...namesOf(doc).map(fold)];
  return words.some(w => w && t.includes(w));
}

/* ---------- adjuntos ---------- */
const EXT = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif' };
export const typeOf = (mime, name) => {
  const m = String(mime || '').toLowerCase().split(';')[0].trim();
  if (/^(application\/pdf|image\/(jpeg|png|webp|heic|heif))$/.test(m)) return m;
  if (m === 'image/jpg') return 'image/jpeg';
  return EXT[(String(name || '').split('.').pop() || '').toLowerCase()] || '';
};
export const readable = t => /^(image\/(jpeg|png|webp)|application\/pdf)$/.test(t);
/* ¿vale la pena ofrecerlo? PDF o foto real, con nombre, que entra en el tope */
export function fileOk({ name, type, size }) {
  return Boolean(name && type && size <= MAX_FILE && !(type.startsWith('image/') && size < MIN_IMG));
}
/* clave de dedupe: legible si es corta (Gmail), con hash si el proveedor usa ids largos (Outlook) */
export const dedupeKey = (m, part) => { const k = `${m}:${part}`; return k.length <= 64 ? k : 'h:' + createHash('sha256').update(k).digest('hex').slice(0, 32); };

/* ---------- a qué mascota corresponde ---------- */
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
export async function getState(P, email) {
  const s = (await kvGet(P.key(email))) || {};
  return { tok: s.tok || '', address: s.address || '', connectedAt: s.connectedAt || '', range: RANGES[s.range] !== undefined ? s.range : '12m', lastSearch: s.lastSearch || '', expired: Boolean(s.expired), imported: Array.isArray(s.imported) ? s.imported : [], queue: Array.isArray(s.queue) ? s.queue : [] };
}
export async function saveState(P, email, s) {
  s.imported = s.imported.slice(-MAX_IMPORTED); s.queue = s.queue.slice(0, MAX_QUEUE);
  await kvSet(P.key(email), s);
}
export const statusView = (P, s, allowed, ready) => ({
  provider: P.id, allowed, ready, connected: Boolean(s.tok), address: s.address, lastSearch: s.lastSearch, range: s.range, expired: s.expired,
  revokes: Boolean(P.revokes), consentUrl: P.consentUrl || '',
  queue: s.queue.map(x => ({ m: x.m, part: x.part, name: x.name, type: x.type })),
});

/* ---------- errores comunes ---------- */
export const fail = (error, status) => Object.assign(new Error(error), { status, code: error });
export const form = o => new URLSearchParams(o).toString();

/* access token de un rato, a partir del refresh token cifrado. Si el proveedor rota el refresh token, se guarda el nuevo */
export async function accessToken(P, email, st, cfg) {
  if (!st.tok) throw fail('mail_no_conectado', 409);
  let refresh;
  try { refresh = open(st.tok, cfg.key, email); } catch { throw fail('mail_vencido', 401); }
  const out = await P.refresh(cfg, refresh);
  if (out.expired) { st.tok = ''; st.expired = true; await saveState(P, email, st); throw fail('mail_vencido', 401); }
  if (!out.access) throw fail('mail_error', 502);
  if (out.refresh && out.refresh !== refresh) { st.tok = seal(out.refresh, cfg.key, email); await saveState(P, email, st); }
  return out.access;
}

/* ---------- búsqueda por tandas ---------- */
export async function search(P, email, doc, st, cfg, body, now = Date.now) {
  const t0 = now();
  let cur = body?.cursor ? readCursor(body.cursor, email) : null;
  if (body?.cursor && (!cur || cur.p !== P.id)) throw fail('cursor_invalido', 400);
  if (!cur) {
    const mode = body?.mode === 'new' && st.lastSearch ? 'new' : 'all';
    const after = mode === 'new' ? Date.parse(st.lastSearch) - 864e5 : 0;
    cur = { p: P.id, q: P.query(doc, { range: st.range, after }, t0), page: '', skip: 0, scanned: 0, started: new Date(t0).toISOString(), mode };
  }
  const at = await accessToken(P, email, st, cfg);
  /* lo ya importado y lo que está en cola no se vuelve a ofrecer */
  const imported = new Set([...st.imported, ...st.queue.map(x => dedupeKey(x.m, x.part))]);
  const candidates = [];
  for (;;) {
    const list = await P.list(at, cur);
    const items = list.items || [];
    for (let i = cur.skip; i < items.length;) {
      if (now() - t0 > TIME_BUDGET_MS) return { candidates, cursor: signCursor({ ...cur, skip: i }, email), more: null, scanned: cur.scanned, done: false };
      /* tope de 200 por búsqueda: se puede seguir con "Buscar más" */
      if (cur.scanned >= MAX_MESSAGES) return { candidates, cursor: null, more: signCursor({ ...cur, skip: i, scanned: 0 }, email), scanned: cur.scanned, done: true };
      const n = Math.min(PARALLEL, items.length - i, MAX_MESSAGES - cur.scanned);
      const got = await Promise.all(items.slice(i, i + n).map(it => P.candidate(at, it, doc, cur).catch(e => { if (e.code === 'mail_vencido' || e.code === 'mail_limite') throw e; return null; })));
      for (const c of got) {
        if (!c) continue;
        const files = c.files.filter(f => !imported.has(dedupeKey(c.m, f.part)));
        if (files.length) candidates.push({ ...c, files });
      }
      i += n; cur.scanned += n;
    }
    if (!list.next) break;
    if (now() - t0 > TIME_BUDGET_MS) return { candidates, cursor: signCursor({ ...cur, page: list.next, skip: 0 }, email), more: null, scanned: cur.scanned, done: false };
    if (cur.scanned >= MAX_MESSAGES) return { candidates, cursor: null, more: signCursor({ ...cur, page: list.next, skip: 0, scanned: 0 }, email), scanned: cur.scanned, done: true };
    cur.page = list.next; cur.skip = 0;
  }
  st.lastSearch = cur.started; st.expired = false;
  await saveState(P, email, st);
  return { candidates, cursor: null, more: null, scanned: cur.scanned, done: true };
}

/* ---------- importar un adjunto elegido ---------- */
export async function importOne(P, email, st, cfg, body, deps) {
  const m = String(body?.m || ''), part = String(body?.part || '');
  if (!P.validId(m) || !P.validPart(part)) throw fail('invalid', 400);
  const key = dedupeKey(m, part);
  if (st.imported.includes(key)) throw fail('ya_importado', 409);
  const at = await accessToken(P, email, st, cfg);
  const meta = await P.find(at, m, part);
  if (!meta || !fileOk(meta)) throw fail('adjunto_no_encontrado', 404);
  const canRead = readable(meta.type);
  /* el tope de IA se mira antes de bajar nada: si no hay lugar, queda en cola */
  if (canRead) {
    const stop = await deps.peekScan(email);
    if (stop) {
      if (!st.queue.some(x => dedupeKey(x.m, x.part) === key)) st.queue.push({ m, part, name: meta.name, type: meta.type });
      await saveState(P, email, st);
      return { status: 429, body: { ...stop, queued: true } };
    }
  }
  if (!(await deps.fits(email, meta.size))) throw fail('cupo_lleno', 413);
  const buf = await P.download(at, m, part, meta);
  if (!buf?.length) throw fail('adjunto_vacio', 422);
  if (buf.length > MAX_FILE) throw fail('too_big', 413);
  const ref = await deps.putFile(email, meta.name, buf, meta.type);
  await deps.addUsage(email, ref, buf.length);
  st.imported.push(key);
  st.queue = st.queue.filter(x => dedupeKey(x.m, x.part) !== key);
  await saveState(P, email, st);
  const file = { ref, name: meta.name, type: meta.type };
  const only = deps.pets.length === 1 ? deps.pets[0].id : '';
  if (!canRead) return { status: 200, body: { ref: file, data: null, manual: 'tipo_no_legible', petId: only } };
  const stop = await deps.takeScan(email);
  if (stop) return { status: 200, body: { ref: file, data: null, manual: stop.error, limit: stop.limit, petId: only } };
  try {
    const data = await deps.scanStudy(buf, meta.type, deps.pets);
    return { status: 200, body: { ref: file, data, petId: suggestPet(deps.pets, { petName: data.pet?.name, species: data.pet?.species, breed: data.pet?.breed, lab: data.lab }, meta.name) } };
  } catch (e) {
    return { status: 200, body: { ref: file, data: null, manual: e.message || 'ia_error', petId: suggestPet(deps.pets, {}, meta.name) } };
  }
}

/* ---------- desconectar: revoca si el proveedor lo permite y borra todo ---------- */
export async function disconnect(P, email, st, cfg) {
  let revoked = false;
  if (P.revokes && st.tok && cfg.key) {
    try { revoked = await P.revoke(cfg, open(st.tok, cfg.key, email)); } catch { /* igual se borra */ }
  }
  await kvDel(P.key(email));
  return { ok: true, revoked, revokes: Boolean(P.revokes), consentUrl: P.consentUrl || '' };
}

/* ---------- handler común ---------- */
const back = (res, to) => { res.setHeader('Location', '/mascotas#/' + to); return res.status(302).end(); };
export async function handleMail(P, req, res, ctx) {
  const q = req.query || {}, action = String(q[P.id]);
  const { email } = ctx;
  const allowed = mailAllowed(email), cfg = P.config(req);
  const nav = action === 'start' || action === 'callback';
  if (!allowed) return nav ? back(res, 'cuenta') : res.status(403).json({ error: P.id + '_no_habilitado', allowed: false });
  const st = await getState(P, email);

  if (action === 'status') return res.status(200).json(statusView(P, st, true, cfg.ready));
  if (!cfg.ready) return nav ? back(res, `${P.id}/sinconfig`) : res.status(503).json({ error: P.id + '_no_configurado' });

  if (action === 'start') {
    const range = RANGES[q.range] !== undefined ? String(q.range) : '12m';
    const { state, challenge } = await makeState(email, range, P.id);
    res.setHeader('Location', P.authUrl(cfg, state, challenge));
    return res.status(302).end();
  }

  if (action === 'callback') {
    const ok = await checkState(q.state, email, P.id);
    if (!ok) return back(res, `${P.id}/error`);
    if (q.error) return back(res, `${P.id}/${q.error === 'access_denied' ? 'cancelado' : 'error'}`);
    if (!q.code) return back(res, `${P.id}/error`);
    const got = await P.exchange(cfg, String(q.code), ok.verifier).catch(() => ({ error: 'error' }));
    if (got.error) return back(res, `${P.id}/${got.error}`);
    const next = { ...st, tok: seal(got.refresh, cfg.key, email), address: String(got.address || '').slice(0, 120), connectedAt: new Date().toISOString(), range: ok.range, expired: false };
    /* conectar otra casilla arranca de cero; reconectar la misma conserva lo ya importado */
    if (st.address && next.address && st.address.toLowerCase() !== next.address.toLowerCase()) { next.imported = []; next.queue = []; next.lastSearch = ''; }
    if (st.range !== ok.range) next.lastSearch = '';
    await saveState(P, email, next);
    return back(res, `${P.id}/conectado`);
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  const body = ctx.body || {};
  try {
    if (action === 'search') return res.status(200).json(await search(P, email, await ctx.getDoc(), st, cfg, body));
    if (action === 'import') {
      const doc = await ctx.getDoc();
      const out = await importOne(P, email, st, cfg, body, { ...ctx.deps, pets: doc.pets || [] });
      return res.status(out.status).json(out.body);
    }
    if (action === 'queue') {
      for (const x of (Array.isArray(body.items) ? body.items : []).slice(0, MAX_QUEUE)) {
        const m = String(x?.m || ''), part = String(x?.part || '');
        if (!P.validId(m) || !P.validPart(part)) continue;
        const key = dedupeKey(m, part);
        if (st.imported.includes(key) || st.queue.some(y => dedupeKey(y.m, y.part) === key)) continue;
        st.queue.push({ m, part, name: String(x.name || 'adjunto').slice(0, 120), type: typeOf(x.type, x.name) });
      }
      await saveState(P, email, st);
      return res.status(200).json(statusView(P, st, true, true));
    }
    if (action === 'unqueue') {
      const keys = new Set((Array.isArray(body.items) ? body.items : []).map(x => dedupeKey(x?.m, x?.part)));
      st.queue = st.queue.filter(x => !keys.has(dedupeKey(x.m, x.part)));
      await saveState(P, email, st);
      return res.status(200).json(statusView(P, st, true, true));
    }
    if (action === 'disconnect') return res.status(200).json(await disconnect(P, email, st, cfg));
    return res.status(400).json({ error: 'invalid' });
  } catch (e) {
    /* los códigos llevan el nombre del proveedor (gmail_vencido, outlook_vencido…) */
    return res.status(e.status || 502).json({ error: String(e.code || 'mail_error').replace(/^mail_/, P.id + '_') });
  }
}
