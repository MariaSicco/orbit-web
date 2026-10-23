/* Mimitos · Conectar Outlook: el mismo motor que Gmail contra Microsoft Graph simulado
   (no se llama a Microsoft ni a Anthropic de verdad).
   Correr con: node --test test/mascotas-outlook.test.mjs  (sin KV usa memoria) */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
process.env.SESSION_SECRET = 'prueba-secreta-de-mimitos-1234567890';
process.env.MS_CLIENT_ID = '00001111-aaaa-2222-bbbb-3333cccc4444';
process.env.MS_CLIENT_SECRET = 'secreto-de-prueba';
process.env.MIMITOS_TOKEN_KEY = randomBytes(32).toString('base64');
process.env.MIMITOS_MAIL_ALLOW = 'majo@ejemplo.com';
delete process.env.MIMITOS_GMAIL_ALLOW;
const { kvGet, kvSet } = await import('../api/_lib/kv.js');
const { makeSession } = await import('../api/_lib/auth.js');
const M = await import('../api/_lib/petmail.js');
const O = await import('../api/_lib/petoutlook.js');
const { default: mascotas } = await import('../api/mascotas.js');

const EMAIL = 'majo@ejemplo.com';
const call = (method, query, body, email = EMAIL) => new Promise(ok => {
  const res = { code: 200, headers: {}, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, status(c) { this.code = c; return this; }, json(o) { ok({ code: this.code, body: o, headers: this.headers }); }, end() { ok({ code: this.code, headers: this.headers }); }, redirect(c, u) { ok({ code: c, headers: { location: u } }); } };
  mascotas({ method, query, body, headers: { cookie: `orbit_session=${makeSession(email)}`, host: 'orbit-web-git-drop01-libreta-mascota-mariasiccos-projects.vercel.app' } }, res);
});
const purchase = email => kvSet(`orbit:purchases:${email}`, [{ productId: 'ob-018', date: '2026-10-12' }]);

/* ---------- Microsoft simulado ---------- */
const PDF = Buffer.from('%PDF-1.4 estudio outlook');
const LONG = s => ('AAMkAGI2' + s).padEnd(152, 'x') + '=';   // los ids de Graph son largos
const jwt = o => ['e30', Buffer.from(JSON.stringify(o)).toString('base64url'), ''].join('.');
let ms;
function fakeMs() {
  const g = { calls: [], refreshN: 0, searchFails: false, scope: 'https://graph.microsoft.com/Mail.Read openid email', expired: false };
  g.msgs = [
    { id: LONG('m1'), subject: 'Ecografía de Feliza', from: { emailAddress: { name: 'Diagnovet', address: 'informes@diagnovet.com.ar' } }, receivedDateTime: '2026-09-22T14:10:00Z', hasAttachments: true },
    { id: LONG('m2'), subject: 'Turno confirmado', from: { emailAddress: { name: 'Vet San Roque', address: 'turnos@sanroque.vet' } }, receivedDateTime: '2026-09-01T10:00:00Z', hasAttachments: true },
    { id: LONG('m3'), subject: 'Newsletter', from: { emailAddress: { name: 'Tienda', address: 'news@tienda.com' } }, receivedDateTime: '2026-08-01T10:00:00Z', hasAttachments: false },
  ];
  g.atts = {
    [LONG('m1')]: [
      { '@odata.type': '#microsoft.graph.fileAttachment', id: LONG('a1'), name: 'eco-feliza.pdf', contentType: 'application/pdf', size: 200000, isInline: false },
      { '@odata.type': '#microsoft.graph.fileAttachment', id: LONG('a2'), name: 'image001.png', contentType: 'image/png', size: 90000, isInline: true },
      { '@odata.type': '#microsoft.graph.itemAttachment', id: LONG('a3'), name: 'Reenviado', contentType: null, size: 30000, isInline: false },
    ],
    [LONG('m2')]: [{ '@odata.type': '#microsoft.graph.fileAttachment', id: LONG('b1'), name: 'receta.jpg', contentType: 'image/jpeg', size: 300000, isInline: false }],
  };
  g.fetch = async (url, init = {}) => {
    const u = new URL(String(url)); g.calls.push(decodeURIComponent(u.href));
    const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
    const f = Object.fromEntries(new URLSearchParams(String(init.body || '')));
    if (u.href.startsWith('https://login.microsoftonline.com/common/oauth2/v2.0/token')) {
      assert.equal(f.client_secret, 'secreto-de-prueba');
      if (f.grant_type === 'authorization_code') {
        g.verifier = f.code_verifier;
        return f.code === 'buen-code' ? json({ access_token: 'AT0', token_type: 'Bearer', expires_in: 3599, scope: g.scope, refresh_token: 'RT-0', id_token: jwt({ preferred_username: 'majo.mascotas@outlook.com', email: 'majo.mascotas@outlook.com' }) }) : json({ error: 'invalid_grant' }, 400);
      }
      if (f.grant_type === 'refresh_token') {
        if (g.expired || f.refresh_token !== `RT-${g.refreshN}`) return json({ error: 'invalid_grant', error_description: 'AADSTS70000' }, 400);
        g.refreshN++;
        return json({ access_token: 'AT' + g.refreshN, expires_in: 3599, refresh_token: `RT-${g.refreshN}` });
      }
    }
    if (u.origin === 'https://graph.microsoft.com') {
      assert.match(init.headers?.Authorization || '', /^Bearer AT\d+$/);
      assert.equal(init.headers?.Prefer, 'IdType="ImmutableId"');
      const p = decodeURIComponent(u.pathname).replace('/v1.0', '');
      if (p === '/me/messages') {
        const sel = u.searchParams.get('$select');
        assert.ok(!/body/i.test(sel), 'no pide el cuerpo');
        if (u.searchParams.get('$search')) { const q = u.searchParams.get('$search'); if (g.searchFails || (g.noProps && /(attachment|subject|hasattachment):/.test(q))) return json({ error: { code: 'BadRequest' } }, 400); g.searches = [...(g.searches || []), q]; g.lastSearch = q; }
        else g.lastFilter = u.searchParams.get('$filter');
        return json({ value: g.msgs.filter(m => !u.searchParams.get('$filter') || m.hasAttachments) });
      }
      let m = /^\/me\/messages\/([^/]+)\/attachments$/.exec(p);
      if (m) { assert.equal(u.searchParams.get('$select'), 'id,name,contentType,size,isInline', 'solo metadata, sin contentBytes'); return json({ value: g.atts[m[1]] || [] }); }
      m = /^\/me\/messages\/([^/]+)\/attachments\/([^/]+)\/\$value$/.exec(p);
      if (m) { g.downloaded = (g.downloaded || 0) + 1; return new Response(PDF, { status: 200 }); }
      m = /^\/me\/messages\/([^/]+)\/attachments\/([^/]+)$/.exec(p);
      if (m) { const a = (g.atts[m[1]] || []).find(x => x.id === m[2]); return a ? json(a) : json({}, 404); }
    }
    throw new Error('llamada inesperada: ' + url);
  };
  return g;
}
const realFetch = globalThis.fetch;
beforeEach(() => { ms = fakeMs(); globalThis.fetch = ms.fetch; });
process.on('exit', () => { globalThis.fetch = realFetch; });

const doc = { pets: [
  { id: 'feliza01', name: 'Feliza', species: 'gato', breed: 'Siamés', vet: { name: 'Veterinaria San Roque' }, records: [], visits: [], studies: [{ lab: 'Diagnovet' }] },
  { id: 'toto0001', name: 'Toto', species: 'perro', breed: 'Caniche', vet: { name: '' }, records: [], visits: [], studies: [] },
] };

test('KQL: adjuntos + términos + nombres + fecha, con comillas escapadas para $search', () => {
  const k = O.buildKql(doc, Date.parse('2025-10-13T00:00:00Z'));
  assert.ok(k.startsWith('(veterinaria OR veterinario'));
  assert.ok(k.includes('"Feliza"') && k.includes('"veterinaria san roque"') && k.includes('antirrabica') && k.includes('antirrábica'));
  assert.ok(!/ laboratorio | informe /.test(k));
  assert.ok(k.endsWith(' AND received>=2025-10-13'));
  assert.ok(!/received/.test(O.buildKql(doc, 0)));
  assert.equal(O.searchParam('a "b" c'), '"a \\"b\\" c"');
});

test('gating: MIMITOS_MAIL_ALLOW con valores es lista para Outlook; la vieja MIMITOS_GMAIL_ALLOW ya no restringe a Outlook', () => {
  assert.ok(M.mailAllowed('majo@ejemplo.com', 'outlook'));
  assert.ok(!M.mailAllowed('otra@ejemplo.com', 'outlook'));
  delete process.env.MIMITOS_MAIL_ALLOW; process.env.MIMITOS_GMAIL_ALLOW = 'vieja@ejemplo.com'; process.env.MIMITOS_GMAIL_OPEN = '0';
  assert.ok(M.mailAllowed('otra@ejemplo.com', 'outlook'));
  delete process.env.MIMITOS_GMAIL_ALLOW; delete process.env.MIMITOS_GMAIL_OPEN; process.env.MIMITOS_MAIL_ALLOW = 'majo@ejemplo.com';
});

test('dedupe: los ids largos de Outlook se guardan con hash; los de Gmail quedan legibles', () => {
  assert.equal(M.dedupeKey('m0000001', '1'), 'm0000001:1');
  const k = M.dedupeKey(LONG('m1'), LONG('a1'));
  assert.match(k, /^h:[a-f0-9]{32}$/);
  assert.equal(k, M.dedupeKey(LONG('m1'), LONG('a1')));
});

test('el state de Outlook no sirve para Gmail (y al revés)', async () => {
  const { state } = await M.makeState(EMAIL, '12m', 'outlook');
  assert.equal(await M.checkState(state, EMAIL, 'gmail'), null);
  const { state: s2 } = await M.makeState(EMAIL, '12m', 'outlook');
  assert.equal((await M.checkState(s2, EMAIL, 'outlook')).range, '12m');
});

test('Outlook de punta a punta: conectar con PKCE → buscar → importar → no se repite → desconectar', async () => {
  await purchase(EMAIL);
  await kvSet(`orbit:pets:${EMAIL}`, { ...doc, rev: 1 });
  let st = await call('GET', { outlook: 'status' });
  assert.deepEqual([st.body.provider, st.body.ready, st.body.connected, st.body.revokes], ['outlook', true, false, false]);

  const go = await call('GET', { outlook: 'start', range: '3y' });
  const auth = new URL(go.headers.location);
  assert.equal(auth.origin + auth.pathname, 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize');
  assert.equal(auth.searchParams.get('scope'), 'openid email offline_access https://graph.microsoft.com/Mail.Read');
  assert.equal(auth.searchParams.get('redirect_uri'), 'https://orbit-web-git-drop01-libreta-mascota-mariasiccos-projects.vercel.app/mascotas/outlook/callback');
  assert.equal(auth.searchParams.get('code_challenge_method'), 'S256');
  const challenge = auth.searchParams.get('code_challenge');

  const cb = await call('GET', { outlook: 'callback', code: 'buen-code', state: auth.searchParams.get('state') });
  assert.equal(cb.headers.location, '/mascotas#/outlook/conectado');
  assert.equal(createHash('sha256').update(ms.verifier).digest('base64url'), challenge, 'PKCE: el verifier corresponde al challenge');
  const saved = await kvGet(`orbit:petoutlook:${EMAIL}`);
  assert.ok(!JSON.stringify(saved).includes('RT-0'), 'el refresh token no queda en claro');
  assert.equal(saved.address, 'majo.mascotas@outlook.com');

  const s1 = await call('POST', { outlook: 'search' }, { mode: 'all' });
  assert.equal(s1.code, 200, JSON.stringify(s1.body));
  assert.ok(ms.lastSearch.startsWith('"(veterinaria OR ') && ms.lastSearch.includes('received>='));
  assert.deepEqual(s1.body.candidates.map(c => [c.subject, c.files.map(f => f.name)]), [['Ecografía de Feliza', ['eco-feliza.pdf']], ['Turno confirmado', ['receta.jpg']]]);
  assert.equal(ms.downloaded, undefined, 'buscar no baja ningún archivo');
  /* Microsoft rotó el refresh token: quedó guardado el nuevo, cifrado */
  const rotated = await kvGet(`orbit:petoutlook:${EMAIL}`);
  assert.notEqual(rotated.tok, saved.tok);
  assert.ok(rotated.lastSearch);

  const P = O.outlook, cfg = O.outlookConfig({ headers: { host: 'x.vercel.app' } });
  const stO = await M.getState(P, EMAIL); let scans = 0; const put = [];
  const deps = {
    pets: doc.pets, peekScan: async () => null, takeScan: async () => { scans++; return null; }, fits: async () => true, addUsage: async () => {},
    putFile: async (e, name, buf, type) => { put.push([name, buf.length, type]); return 'blob:mascotas/0123456789abcdef/x-' + name; },
    scanStudy: async () => ({ date: '2026-09-22', kind: 'eco', title: 'Ecografía', lab: 'Diagnovet', summary: '', confidence: 'alta', warnings: [], pet: { name: 'Feliza' } }),
  };
  const m1 = s1.body.candidates[0];
  const imp = await M.importOne(P, EMAIL, stO, cfg, { m: m1.m, part: m1.files[0].part }, deps);
  assert.equal(imp.status, 200); assert.equal(imp.body.petId, 'feliza01');
  assert.deepEqual(put, [['eco-feliza.pdf', PDF.length, 'application/pdf']]); assert.equal(scans, 1); assert.equal(ms.downloaded, 1);
  await assert.rejects(M.importOne(P, EMAIL, stO, cfg, { m: m1.m, part: m1.files[0].part }, deps), e => e.code === 'ya_importado');
  /* un adjunto en línea (logo) no se puede importar aunque alguien mande su id */
  await assert.rejects(M.importOne(P, EMAIL, stO, cfg, { m: m1.m, part: LONG('a2') }, deps), e => e.code === 'adjunto_no_encontrado');

  /* sin tope de IA: queda en cola sin bajar nada */
  const m2 = s1.body.candidates[1];
  const q = await M.importOne(P, EMAIL, stO, cfg, { m: m2.m, part: m2.files[0].part }, { ...deps, peekScan: async () => ({ error: 'limite_diario', limit: 10 }) });
  assert.equal(q.status, 429); assert.ok(q.body.queued); assert.equal(ms.downloaded, 1);

  const s2 = await call('POST', { outlook: 'search' }, { mode: 'new' });
  assert.equal(s2.body.candidates.length, 0, 'lo importado y lo que está en cola no se vuelve a ofrecer');

  /* Gmail sigue aparte */
  st = await call('GET', { gmail: 'status' });
  assert.equal(st.body.connected, false);

  const off = await call('POST', { outlook: 'disconnect' }, {});
  assert.deepEqual([off.body.revoked, off.body.revokes, off.body.consentUrl], [false, false, 'https://account.live.com/consent/Manage']);
  assert.equal(await kvGet(`orbit:petoutlook:${EMAIL}`), null);
});

test('si la casilla no acepta $search, busca con filtro y mira los términos en asunto, remitente y adjuntos', async () => {
  await purchase(EMAIL);
  await kvSet(`orbit:pets:${EMAIL}`, { ...doc, rev: 1 });
  const go = await call('GET', { outlook: 'start' });
  await call('GET', { outlook: 'callback', code: 'buen-code', state: new URL(go.headers.location).searchParams.get('state') });
  ms.searchFails = true;
  const s = await call('POST', { outlook: 'search' }, { mode: 'all' });
  assert.equal(s.code, 200, JSON.stringify(s.body));
  assert.match(ms.lastFilter, /^receivedDateTime ge .+ and hasAttachments eq true$/);
  /* "Ecografía de Feliza" entra por los términos; "Turno confirmado" con receta.jpg entra por "receta" */
  assert.deepEqual(s.body.candidates.map(c => c.subject), ['Ecografía de Feliza', 'Turno confirmado']);
});

test('sesión vencida o permiso quitado: avisa y pide reconectar', async () => {
  await purchase(EMAIL);
  const go = await call('GET', { outlook: 'start' });
  await call('GET', { outlook: 'callback', code: 'buen-code', state: new URL(go.headers.location).searchParams.get('state') });
  ms.expired = true;
  const s = await call('POST', { outlook: 'search' }, { mode: 'all' });
  assert.equal(s.code, 401); assert.equal(s.body.error, 'outlook_vencido');
  const st = await call('GET', { outlook: 'status' });
  assert.deepEqual([st.body.connected, st.body.expired], [false, true]);
});

test('si la persona no da Mail.Read, no queda conectada', async () => {
  await purchase(EMAIL);
  ms.scope = 'openid email';
  const go = await call('GET', { outlook: 'start' });
  const cb = await call('GET', { outlook: 'callback', code: 'buen-code', state: new URL(go.headers.location).searchParams.get('state') });
  assert.equal(cb.headers.location, '/mascotas#/outlook/sinpermiso');
});

test('si la casilla rechaza la consulta con propiedades (subject:, attachment:), prueba las simples antes del respaldo', async () => {
  await purchase(EMAIL);
  await kvSet(`orbit:pets:${EMAIL}`, { ...doc, rev: 1 });
  const go = await call('GET', { outlook: 'start' });
  await call('GET', { outlook: 'callback', code: 'buen-code', state: new URL(go.headers.location).searchParams.get('state') });
  ms.noProps = true;
  /* caso real (15/10): la plataforma de la veterinaria manda desde noreply@ con el asunto pelado */
  ms.msgs.push({ id: LONG('m9'), subject: 'Radiografia', from: { emailAddress: { name: '', address: 'noreply@myvete.com' } }, receivedDateTime: '2025-04-07T10:00:00Z', hasAttachments: true });
  ms.atts[LONG('m9')] = [{ '@odata.type': '#microsoft.graph.fileAttachment', id: LONG('c1'), name: 'estudio.pdf', contentType: 'application/pdf', size: 250000, isInline: false }];
  const s = await call('POST', { outlook: 'search' }, { mode: 'all' });
  assert.equal(s.code, 200, JSON.stringify(s.body));
  assert.equal(s.body.mode, 'simple');
  assert.equal(ms.lastFilter, undefined, 'no cae al respaldo');
  assert.equal(ms.searches.length, 2, 'la de siempre y la de asuntos de estudio');
  assert.ok(/radiografia/.test(ms.searches[1]) && !/subject:/.test(ms.searches[1]));
  assert.ok(s.body.candidates.some(c => c.subject === 'Radiografia'), JSON.stringify(s.body.candidates.map(c => c.subject)));
  assert.equal(new Set(s.body.candidates.map(c => c.m)).size, s.body.candidates.length);
});
