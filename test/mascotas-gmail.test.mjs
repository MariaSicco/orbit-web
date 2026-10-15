/* Mimitos · Conectar Gmail: query, state anti-CSRF, cifrado del token, dedupe, gating y el flujo
   completo contra un Google simulado (no se llama a Google ni a Anthropic de verdad).
   Correr con: node --test test/mascotas-gmail.test.mjs  (sin KV usa memoria) */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
process.env.SESSION_SECRET = 'prueba-secreta-de-mimitos-1234567890';
process.env.GOOGLE_CLIENT_ID = 'cliente-de-prueba.apps.googleusercontent.com';
process.env.GOOGLE_CLIENT_SECRET = 'secreto-de-prueba';
process.env.MIMITOS_TOKEN_KEY = randomBytes(32).toString('base64');
/* lista restringida (modo prueba): con valores, solo esas cuentas y admin */
process.env.MIMITOS_MAIL_ALLOW = 'majo@ejemplo.com, socia@ejemplo.com';
delete process.env.MIMITOS_GMAIL_ALLOW; delete process.env.MIMITOS_GMAIL_OPEN; delete process.env.MIMITOS_GMAIL_CAP;
process.env.ADMIN_EMAILS = 'admin@ejemplo.com';
const { kvGet, kvSet } = await import('../api/_lib/kv.js');
const { makeSession } = await import('../api/_lib/auth.js');
const G = await import('../api/_lib/petgmail.js');
const { default: mascotas } = await import('../api/mascotas.js');

const EMAIL = 'majo@ejemplo.com';
const call = (method, query, body, email = EMAIL, host = 'preview.orbitando.test') => new Promise(ok => {
  const res = { code: 200, headers: {}, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, status(c) { this.code = c; return this; }, json(o) { ok({ code: this.code, body: o, headers: this.headers }); }, end() { ok({ code: this.code, headers: this.headers }); }, redirect(c, u) { ok({ code: c, headers: { location: u } }); } };
  mascotas({ method, query, body, headers: { cookie: `orbit_session=${makeSession(email)}`, host } }, res);
});

/* ---------- Google y Gmail simulados ---------- */
const PDF = Buffer.from('%PDF-1.4 estudio de prueba');
const b64u = b => b.toString('base64url');
let google;
function fakeGoogle() {
  const g = { calls: [], revoked: [], refreshOk: true, scope: G.SCOPE, attachVersion: 0 };
  g.mails = {
    m0000001: { id: 'm0000001', internalDate: String(Date.parse('2026-09-02T12:00:00Z')), payload: { headers: [{ name: 'From', value: 'Diagnovet <informes@diagnovet.com>' }, { name: 'Subject', value: 'Ecografía de Feliza' }, { name: 'Received', value: 'x' }], partId: '', mimeType: 'multipart/mixed', filename: '', body: { size: 0 }, parts: [
      { partId: '0', mimeType: 'text/plain', filename: '', body: { size: 120 } },
      { partId: '1', mimeType: 'application/pdf', filename: 'eco-feliza.pdf', body: { attachmentId: 'ATT-A', size: 180000 } },
      { partId: '2', mimeType: 'image/png', filename: 'logo.png', body: { attachmentId: 'ATT-L', size: 4000 } },
    ] } },
    m0000002: { id: 'm0000002', internalDate: String(Date.parse('2026-08-10T12:00:00Z')), payload: { headers: [{ name: 'From', value: 'Lab Vet Sur <lab@vetsur.com>' }, { name: 'Subject', value: 'Resultados' }], mimeType: 'multipart/mixed', filename: '', body: { size: 0 }, parts: [
      { partId: '1', mimeType: 'multipart/alternative', filename: '', body: { size: 0 }, parts: [{ partId: '1.0', mimeType: 'text/html', filename: '', body: { size: 900 } }] },
      { partId: '2', mimeType: 'application/octet-stream', filename: 'hemograma.PDF', body: { attachmentId: 'ATT-B', size: 90000 } },
      { partId: '3', mimeType: 'image/jpeg', filename: 'foto-placa.jpg', body: { attachmentId: 'ATT-C', size: 240000 } },
    ] } },
    m0000003: { id: 'm0000003', internalDate: String(Date.parse('2026-07-01T12:00:00Z')), payload: { headers: [{ name: 'Subject', value: 'Newsletter' }], mimeType: 'text/html', filename: '', body: { size: 3000 } } },
  };
  g.fetch = async (url, init = {}) => {
    const u = new URL(String(url)); g.calls.push(u.origin + u.pathname + (u.search ? '?' : ''));
    const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
    const form = Object.fromEntries(new URLSearchParams(String(init.body || '')));
    if (u.href.startsWith('https://oauth2.googleapis.com/token')) {
      if (form.grant_type === 'authorization_code') return form.code === 'buen-code' ? json({ access_token: 'AT1', expires_in: 3599, refresh_token: 'RT-secreto', scope: g.scope, token_type: 'Bearer' }) : json({ error: 'invalid_grant' }, 400);
      if (form.grant_type === 'refresh_token') return g.refreshOk && form.refresh_token === 'RT-secreto' ? json({ access_token: 'AT2', expires_in: 3599 }) : json({ error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }, 400);
    }
    if (u.href.startsWith('https://oauth2.googleapis.com/revoke')) { g.revoked.push(form.token); return new Response('', { status: 200 }); }
    if (u.origin === 'https://gmail.googleapis.com') {
      if (!/^Bearer AT[12]$/.test(init.headers?.Authorization || '')) return json({ error: { code: 401 } }, 401);
      const p = u.pathname.replace('/gmail/v1/users/me', '');
      if (p === '/profile') return json({ emailAddress: 'majo.personal@gmail.com', messagesTotal: 3 });
      if (p === '/messages') { g.lastQ = u.searchParams.get('q'); return json({ messages: Object.keys(g.mails).map(id => ({ id, threadId: id })), resultSizeEstimate: 3 }); }
      let m = /^\/messages\/([^/]+)$/.exec(p);
      if (m) {
        assert.equal(u.searchParams.get('format'), 'full');
        assert.ok(u.searchParams.get('fields').startsWith('id,threadId,internalDate,labelIds,payload('), 'pide solo la estructura y las etiquetas, no el cuerpo');
        assert.ok(!/snippet|body\/data|raw/.test(u.searchParams.get('fields')), 'ni el snippet ni el texto');
        /* como Gmail: el attachmentId cambia en cada lectura */
        g.attachVersion++;
        const msg = JSON.parse(JSON.stringify(g.mails[m[1]]));
        const bump = x => { if (x.body?.attachmentId) x.body.attachmentId += '-v' + g.attachVersion; (x.parts || []).forEach(bump); };
        bump(msg.payload);
        return msg ? json(msg) : json({}, 404);
      }
      m = /^\/messages\/([^/]+)\/attachments\/(.+)$/.exec(p);
      if (m) return json({ size: PDF.length, data: b64u(PDF) });
    }
    throw new Error('llamada inesperada: ' + url);
  };
  return g;
}
const realFetch = globalThis.fetch;
beforeEach(() => { google = fakeGoogle(); globalThis.fetch = google.fetch; });
process.on('exit', () => { globalThis.fetch = realFetch; });

const doc = { pets: [
  { id: 'feliza01', name: 'Feliza', species: 'gato', breed: 'Siamés', vet: { name: 'Veterinaria San Roque' }, records: [{ vet: 'Dra. Paz' }], visits: [], studies: [{ lab: 'Diagnovet' }] },
  { id: 'toto0001', name: 'Toto', species: 'perro', breed: 'Caniche', vet: { name: '' }, records: [], visits: [], studies: [] },
] };

/* ---------- unidades ---------- */
test('query: señales veterinarias (con y sin acento) + nombres de mascotas y veterinarias del doc + rango; nada genérico', () => {
  const q = G.buildQuery(doc, { range: '3y' });
  assert.ok(q.startsWith('(((veterinaria OR veterinario'));
  for (const t of ['vet', 'mascota', 'antirrábica', 'antirrabica', 'desparasitación', 'desparasitacion', '"Feliza"', '"Toto"', '"veterinaria san roque"', '"dra. paz"', '"diagnovet"', 'filename:pdf OR filename:jpg', 'subject:(']) assert.ok(q.includes(t), t);
  /* Promociones y Social afuera, salvo los remitentes conocidos (la veterinaria de la ficha entra esté donde esté) */
  assert.ok(q.includes(') -category:promotions -category:social) OR from:"veterinaria san roque"'), q);
  /* los genéricos no alcanzan para traer un mail: solo van dentro de subject:(…), junto a la señal veterinaria o el nombre */
  const who = q.slice(0, q.indexOf('-category:promotions'));
  for (const t of [' informe ', ' estudio ', ' resultado ', ' receta ', ' laboratorio ']) assert.ok(!who.includes(t), t);
  assert.ok(!q.includes(' laboratorio '));
  /* sin adjuntos en general: solo PDF y fotos (un .ics o un .docx no traen el mail) */
  assert.ok(!q.includes('has:attachment'));
  assert.ok(q.endsWith(' newer_than:3y'));
  assert.ok(G.buildQuery(doc, { range: '12m' }).endsWith(' newer_than:1y'));
  assert.ok(!/newer_than|after:/.test(G.buildQuery(doc, { range: 'all' })));
  /* buscar de nuevo: solo desde la última búsqueda */
  assert.ok(G.buildQuery(doc, { after: Date.parse('2026-10-01T00:00:00Z') }).endsWith(' after:1790812800'));
  /* lo que escribió la persona no rompe la consulta */
  const raro = G.buildQuery({ pets: [{ name: 'Lu") OR from:(x', vet: { name: 'ab' } }] });
  assert.ok(!/from:\(/.test(raro) && !raro.includes('"ab"'));
});

test('cifrado: el token se guarda cifrado, se abre solo con la clave y la cuenta correctas', () => {
  const key = G.tokenKey();
  const sealed = G.seal('RT-secreto', key, 'Majo@Ejemplo.com');
  assert.ok(!sealed.includes('RT-secreto') && sealed.startsWith('v1.'));
  assert.equal(G.open(sealed, key, 'majo@ejemplo.com'), 'RT-secreto');
  assert.throws(() => G.open(sealed, key, 'otra@ejemplo.com'));
  assert.throws(() => G.open(sealed, randomBytes(32), 'majo@ejemplo.com'));
  const [v, iv, tag, ct] = sealed.split('.');
  assert.throws(() => G.open([v, iv, tag, ct.slice(0, -2) + (ct.endsWith('A') ? 'BB' : 'AA')].join('.'), key, 'majo@ejemplo.com'));
  assert.equal(G.tokenKey('corta'), null);
  assert.equal(G.tokenKey('a'.repeat(64)).length, 32);
});

test('state anti-CSRF: ligado a la sesión, de un solo uso', async () => {
  const s = await G.makeState(EMAIL, '3y');
  assert.equal(await G.checkState(s, 'otra@ejemplo.com'), null, 'otra sesión no lo puede usar');
  assert.deepEqual(await G.checkState(s, EMAIL), { range: '3y' });
  assert.equal(await G.checkState(s, EMAIL), null, 'no se puede reusar');
  assert.equal(await G.checkState('inventado.xxx', EMAIL), null);
  const [n] = (await G.makeState(EMAIL, '12m')).split('.');
  assert.equal(await G.checkState(n + '.firmaFalsa', EMAIL), null);
});

test('gating: con MIMITOS_MAIL_ALLOW cargada, solo esa lista y admin', () => {
  assert.ok(G.gmailAllowed('majo@ejemplo.com'));
  assert.ok(G.gmailAllowed(' Socia@Ejemplo.com '));
  assert.ok(G.gmailAllowed('admin@ejemplo.com'));
  assert.ok(!G.gmailAllowed('cualquiera@ejemplo.com'));
  assert.ok(!G.gmailAllowed(''));
});

test('candidatos: solo PDF e imágenes reales, sin logos, sin los ya importados', () => {
  const g = fakeGoogle();
  const c1 = G.candidateOf(g.mails.m0000001, new Set());
  assert.deepEqual(c1.files.map(f => f.name), ['eco-feliza.pdf']);
  assert.equal(c1.from, 'Diagnovet <informes@diagnovet.com>');
  const c2 = G.candidateOf(g.mails.m0000002, new Set([G.dedupeKey('m0000002', '3')]));
  assert.deepEqual(c2.files.map(f => [f.part, f.type]), [['2', 'application/pdf']]);
  assert.equal(G.candidateOf(g.mails.m0000003, new Set()), null);
});

test('a qué mascota: por nombre, después raza o especie; si no está claro, no adivina', () => {
  assert.equal(G.suggestPet(doc.pets, { petName: 'FELIZA' }), 'feliza01');
  assert.equal(G.suggestPet(doc.pets, { species: 'Canino', breed: 'caniche toy' }), 'toto0001');
  assert.equal(G.suggestPet(doc.pets, {}, 'eco-toto.pdf'), 'toto0001');
  assert.equal(G.suggestPet(doc.pets, {}), '');
  assert.equal(G.suggestPet([doc.pets[0]], {}), 'feliza01');
});

/* ---------- flujo completo por el endpoint real ---------- */
const purchase = async email => kvSet(`orbit:purchases:${email}`, [{ productId: 'ob-018', date: '2026-10-12' }]);

test('sin habilitar: status dice que no y start vuelve a Cuenta sin ir a Google', async () => {
  await purchase('cualquiera@ejemplo.com');
  const st = await call('GET', { gmail: 'status' }, null, 'cualquiera@ejemplo.com');
  assert.equal(st.code, 403); assert.equal(st.body.allowed, false);
  const go = await call('GET', { gmail: 'start' }, null, 'cualquiera@ejemplo.com');
  assert.equal(go.code, 302); assert.equal(go.headers.location, '/mascotas#/cuenta');
});

test('conectar → buscar → importar → no se vuelve a ofrecer → desconectar', async () => {
  await purchase(EMAIL);
  await kvSet(`orbit:pets:${EMAIL}`, { ...doc, rev: 3 });
  let st = await call('GET', { gmail: 'status' });
  assert.deepEqual([st.body.allowed, st.body.ready, st.body.connected], [true, true, false]);

  /* start: solo gmail.readonly, offline y con state */
  const go = await call('GET', { gmail: 'start', range: '3y' });
  const auth = new URL(go.headers.location);
  assert.equal(auth.origin + auth.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.equal(auth.searchParams.get('scope'), 'https://www.googleapis.com/auth/gmail.readonly');
  assert.equal(auth.searchParams.get('access_type'), 'offline');
  assert.equal(auth.searchParams.get('redirect_uri'), 'https://preview.orbitando.test/mascotas/gmail/callback');
  const state = auth.searchParams.get('state');

  /* un state ajeno no sirve */
  const bad = await call('GET', { gmail: 'callback', code: 'buen-code', state: 'x'.repeat(24) + '.y' });
  assert.equal(bad.headers.location, '/mascotas#/gmail/error');

  const cb = await call('GET', { gmail: 'callback', code: 'buen-code', state });
  assert.equal(cb.headers.location, '/mascotas#/gmail/conectado');
  const saved = await kvGet(`orbit:petgmail:${EMAIL}`);
  assert.ok(!JSON.stringify(saved).includes('RT-secreto'), 'el refresh token no queda en claro');
  assert.equal(saved.address, 'majo.personal@gmail.com');
  assert.equal(saved.range, '3y');
  assert.deepEqual(Object.keys(saved).sort(), ['address', 'connectedAt', 'expired', 'imported', 'lastSearch', 'queue', 'range', 'tok']);

  /* buscar: candidatos al navegador, nada de los mails guardado */
  const s1 = await call('POST', { gmail: 'search' }, { mode: 'all' });
  assert.equal(s1.code, 200, JSON.stringify(s1.body));
  assert.ok(s1.body.done);
  assert.ok(google.lastQ.includes('"Feliza"') && google.lastQ.endsWith('newer_than:3y'));
  assert.deepEqual(s1.body.candidates.flatMap(c => c.files.map(f => `${c.m}:${f.part}`)), ['m0000001:1', 'm0000002:2', 'm0000002:3']);
  const after = await kvGet(`orbit:petgmail:${EMAIL}`);
  assert.ok(after.lastSearch);
  /* buscar, filtrar y clasificar no consume importaciones inteligentes */
  const Q = await import('../api/_lib/petquota.js');
  assert.equal((await Q.aiStatus(EMAIL, { purchaseDate: '2026-10-12' })).imports.left, Q.IMPORTS_FIRST, 'buscar no consume');
  assert.equal(await kvGet(`orbit:petaiday:${EMAIL}:${new Date().toISOString().slice(0, 10)}`), null);
  assert.ok(!JSON.stringify(after).includes('Ecografía de Feliza') && !JSON.stringify(after).includes('diagnovet.com'), 'no guarda asunto ni remitente');

  /* importar uno con dependencias falsas (Blob y la IA), por la misma función que usa el endpoint */
  const stG = await G.getState(EMAIL), cfg = G.gmailConfig({ headers: { host: 'preview.orbitando.test' } });
  const put = []; let scans = 0;
  const deps = {
    pets: doc.pets, peekScan: async () => null, takeScan: async () => { scans++; return null; },
    fits: async () => true, addUsage: async () => {},
    putFile: async (e, name, buf, type) => { put.push({ name, bytes: buf.length, type }); return 'blob:mascotas/0123456789abcdef/abc-' + name; },
    scanStudy: async (buf, type, pets) => { assert.equal(pets.length, 2); return { date: '2026-09-01', kind: 'eco', title: 'Ecografía abdominal', lab: 'Diagnovet', summary: 'Conclusión: sin cambios.', confidence: 'alta', warnings: [], pet: { name: 'Feliza', species: 'felino', breed: '' } }; },
  };
  const imp = await G.importOne(EMAIL, stG, cfg, { m: 'm0000001', part: '1' }, deps);
  assert.equal(imp.status, 200);
  assert.equal(imp.body.petId, 'feliza01');
  assert.equal(imp.body.data.kind, 'eco');
  assert.deepEqual(put, [{ name: 'eco-feliza.pdf', bytes: PDF.length, type: 'application/pdf' }]);
  assert.equal(scans, 1);
  /* el attachmentId cambió entre la búsqueda y la importación: igual lo encontró por partId */
  assert.ok(google.calls.some(c => c.includes('/attachments/ATT-A-v')));
  await assert.rejects(G.importOne(EMAIL, stG, cfg, { m: 'm0000001', part: '1' }, deps), e => e.code === 'ya_importado');

  /* sin tope de IA: queda en cola y no se baja nada */
  const before = put.length;
  const q = await G.importOne(EMAIL, stG, cfg, { m: 'm0000002', part: '2' }, { ...deps, peekScan: async () => ({ error: 'limite_diario', limit: 10 }) });
  assert.equal(q.status, 429); assert.ok(q.body.queued); assert.equal(put.length, before);
  st = await call('GET', { gmail: 'status' });
  assert.deepEqual(st.body.queue.map(x => x.name), ['hemograma.PDF']);

  /* buscar de nuevo: solo lo nuevo, y lo importado no vuelve */
  const s2 = await call('POST', { gmail: 'search' }, { mode: 'new' });
  assert.match(google.lastQ, / after:\d+$/);
  assert.ok(!s2.body.candidates.some(c => c.m === 'm0000001'));
  assert.equal((await Q.aiStatus(EMAIL, { purchaseDate: '2026-10-12' })).imports.left, Q.IMPORTS_FIRST, 'buscar de nuevo tampoco');

  /* desconectar: revoca en Google y borra todo */
  const off = await call('POST', { gmail: 'disconnect' }, {});
  assert.equal(off.body.revoked, true);
  assert.deepEqual(google.revoked, ['RT-secreto']);
  assert.equal(await kvGet(`orbit:petgmail:${EMAIL}`), null);
  st = await call('GET', { gmail: 'status' });
  assert.equal(st.body.connected, false);
});

test('token vencido (7 días en modo testing): avisa y pide reconectar', async () => {
  await purchase(EMAIL);
  const go = await call('GET', { gmail: 'start' });
  await call('GET', { gmail: 'callback', code: 'buen-code', state: new URL(go.headers.location).searchParams.get('state') });
  google.refreshOk = false;
  const s = await call('POST', { gmail: 'search' }, { mode: 'all' });
  assert.equal(s.code, 401); assert.equal(s.body.error, 'gmail_vencido');
  const st = await call('GET', { gmail: 'status' });
  assert.deepEqual([st.body.connected, st.body.expired], [false, true]);
});

test('si la persona destilda el permiso de Gmail en Google, no queda conectada', async () => {
  await purchase(EMAIL);
  google.scope = 'openid';
  const go = await call('GET', { gmail: 'start' });
  const cb = await call('GET', { gmail: 'callback', code: 'buen-code', state: new URL(go.headers.location).searchParams.get('state') });
  assert.equal(cb.headers.location, '/mascotas#/gmail/sinpermiso');
  assert.ok(google.revoked.length === 1);
});

test('cursor: no se puede cambiar la consulta desde el navegador', async () => {
  const c = G.signCursor({ q: 'has:attachment', page: '' }, EMAIL);
  assert.deepEqual(G.readCursor(c, EMAIL).q, 'has:attachment');
  assert.equal(G.readCursor(c, 'otra@ejemplo.com'), null);
  const [p, sig] = c.split('.');
  const forged = Buffer.from(JSON.stringify({ q: 'in:anywhere', page: '' })).toString('base64url') + '.' + sig;
  assert.equal(G.readCursor(forged, EMAIL), null);
});

test('si Gmail rechaza la consulta nueva (400), busca una vez con la de antes y no falla', async () => {
  await purchase(EMAIL);
  await kvSet(`orbit:pets:${EMAIL}`, { ...doc, rev: 3 });
  const go = await call('GET', { gmail: 'start', range: '3y' });
  const state = new URL(go.headers.location).searchParams.get('state');
  await call('GET', { gmail: 'callback', code: 'buen-code', state });
  const inner = globalThis.fetch; let rejected = 0, legacy = 0;
  globalThis.fetch = async (url, opts) => {
    const u = String(url);
    if (/gmail\/v1\/users\/me\/messages\?/.test(u)) {
      const q = new URL(u).searchParams.get('q') || '';
      if (q.includes('category:')) { rejected++; return new Response(JSON.stringify({ error: { status: 'INVALID_ARGUMENT', message: 'Invalid query' } }), { status: 400, headers: { 'Content-Type': 'application/json' } }); }
      legacy++;
    }
    return inner(url, opts);
  };
  try {
    const s = await call('POST', { gmail: 'search' }, { mode: 'all' });
    assert.equal(s.code, 200, JSON.stringify(s.body));
    assert.equal(rejected, 1); assert.ok(legacy >= 1);
    assert.ok(s.body.candidates.length > 0);
  } finally { globalThis.fetch = inner; }
});
