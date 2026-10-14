/* Mimitos · funciones inteligentes: topes del período (40 en 30 días + 180), tope diario, páginas,
   devolución del crédito si la IA falla, vencimiento a 12 meses (ai_expired), admin sin vencimiento,
   aviso de "te quedan" y "Avisame cuando pueda renovar".
   Correr con: node --test test/mascotas-quota.test.mjs  (sin KV usa memoria; no llama a Anthropic) */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
process.env.SESSION_SECRET = 'prueba-secreta-de-mimitos-1234567890';
process.env.ANTHROPIC_API_KEY = 'clave-de-prueba';
process.env.ADMIN_EMAILS = 'admin@ejemplo.com';
const { kvGet, kvSet } = await import('../api/_lib/kv.js');
const { makeSession } = await import('../api/_lib/auth.js');
const Q = await import('../api/_lib/petquota.js');
const M = await import('../api/_lib/petmail.js');
const { default: mascotas } = await import('../api/mascotas.js');

const DAY = 864e5;
const T = s => Date.parse(s);
const call = (method, query, body, email) => new Promise(ok => {
  const res = { code: 200, headers: {}, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, status(c) { this.code = c; return this; }, json(o) { ok({ code: this.code, body: o }); }, end() { ok({ code: this.code }); }, redirect(c, u) { ok({ code: c, location: u }); } };
  mascotas({ method, query, body, headers: { cookie: `orbit_session=${makeSession(email)}`, host: 'preview.orbitando.test' } }, res);
});
const buy = (email, date) => kvSet(`orbit:purchases:${email}`, [{ productId: 'ob-018', orderId: 'o-' + email, date }]);
const PET = { pets: [{ id: 'aika0001', name: 'Aika', species: 'perro', records: [] }], rev: 1 };
const IMG = 'data:image/jpeg;base64,' + Buffer.from('foto').toString('base64');
async function pdf(n, useObjectStreams = true) { const d = await PDFDocument.create(); for (let i = 0; i < n; i++) d.addPage([200, 200]); return Buffer.from(await d.save({ useObjectStreams })); }

/* ---------- topes del período ---------- */
test('topes: 40 en los primeros 30 días y 180 en el resto de los 12 meses (no se acumulan)', async () => {
  const email = 'topes@ejemplo.com', ctx = { purchaseDate: '2026-10-01T12:00:00Z' };
  const d5 = T('2026-10-05T12:00:00Z');
  let st = await Q.aiStatus(email, ctx, d5);
  assert.deepEqual([st.phase, st.imports.cap, st.imports.left, st.imports.show], [1, 40, 40, false]);
  for (let i = 0; i < 40; i++) assert.ok((await Q.takeImport(email, ctx, 1, d5 + i * 1000)).ok, 'importación ' + (i + 1));
  /* el tope diario anti-abuso también es 40: el 41.º del mismo día frena por el diario o por el período */
  const stop = await Q.takeImport(email, ctx, 1, T('2026-10-06T12:00:00Z'));
  assert.equal(stop.ok, false); assert.equal(stop.error, 'limite_periodo'); assert.equal(stop.limit, 40); assert.equal(stop.status, 429);
  assert.ok(stop.renews.startsWith('2026-10-31'), 'avisa cuándo arranca el resto del período');
  /* día 31: arranca el tramo de 180; lo que sobró (nada, acá) no se pasa */
  const d40 = T('2026-11-10T12:00:00Z');
  st = await Q.aiStatus(email, ctx, d40);
  assert.deepEqual([st.phase, st.imports.cap, st.imports.left], [2, 180, 180]);
  const t = await Q.takeImport(email, ctx, 1, d40);
  assert.ok(t.ok); assert.equal(t.left, 179);
  /* lleno el tramo de 180 → limite_periodo */
  const u = await kvGet(t.ticket.k); u.p2 = 180; await kvSet(t.ticket.k, u);
  const full = await Q.takeImport(email, ctx, 1, T('2027-01-10T12:00:00Z'));
  assert.equal(full.error, 'limite_periodo'); assert.equal(full.limit, 180);
  assert.equal(Q.IMPORTS_FIRST, 40); assert.equal(Q.IMPORTS_REST, 180); assert.equal(Q.FIRST_DAYS, 30);
});

test('tope diario anti-abuso: 40 por día, aunque queden en el período', async () => {
  const email = 'diario@ejemplo.com', ctx = { purchaseDate: '2026-01-10T12:00:00Z' };
  const now = T('2026-06-01T15:00:00Z');
  await kvSet(`orbit:petaiday:${email}:2026-06-01`, 40);
  const r = await Q.takeImport(email, ctx, 1, now);
  assert.equal(r.error, 'limite_diario'); assert.equal(r.limit, 40);
  assert.ok((await Q.takeImport(email, ctx, 1, T('2026-06-02T15:00:00Z'))).ok, 'al día siguiente sigue');
});

/* ---------- páginas ---------- */
test('páginas: hasta 20 por documento cuentan como 1; presupuesto de 600 por período', async () => {
  const email = 'paginas@ejemplo.com', ctx = { purchaseDate: '2026-03-01T12:00:00Z' }, now = T('2026-08-01T12:00:00Z');
  const a = await Q.takeImport(email, ctx, 20, now);
  assert.ok(a.ok); assert.equal(a.ticket.pages, 20);
  const u = await kvGet(a.ticket.k);
  assert.deepEqual([u.p2, u.pages], [1, 20], 'un documento de 20 páginas es una importación');
  /* nunca cuenta más de 20 por documento (lo demás no se manda) */
  assert.equal((await Q.takeImport(email, ctx, 90, now)).ticket.pages, 20);
  u.pages = 595; u.p2 = 2; await kvSet(a.ticket.k, u);
  const over = await Q.takeImport(email, ctx, 20, now);
  assert.equal(over.error, 'limite_paginas'); assert.equal(over.limit, 600);
  assert.ok((await Q.takeImport(email, ctx, 5, now)).ok, 'entra justo hasta 600');
  assert.equal((await Q.takeImport(email, ctx, 1, now)).error, 'limite_paginas');
});

test('corte a 20 páginas: a la IA va un PDF con las primeras 20 y se avisa; el original queda guardado', async () => {
  const big = await pdf(27), small = await pdf(3, false);
  /* conteo liviano: objetos /Type /Page a la vista; con object streams no se ven y se usa pdf-lib */
  assert.equal(Q.countPdfPagesFast(small), 3);
  assert.equal(Q.countPdfPagesFast(big), 0);
  const p = await Q.prepareForAI(big, 'application/pdf');
  assert.deepEqual([p.truncated, p.pages, p.total], [true, 20, 27]);
  assert.equal((await PDFDocument.load(p.buf)).getPageCount(), 20);
  const s = await Q.prepareForAI(small, 'application/pdf');
  assert.deepEqual([s.truncated, s.pages, s.buf === small], [false, 3, true]);
  const img = await Q.prepareForAI(Buffer.from('x'), 'image/jpeg');
  assert.equal(img.pages, 1);
  assert.equal(Q.TRUNCATED_NOTE, 'Leímos las primeras 20 páginas; el archivo completo quedó guardado.');

  /* por el mismo camino que la importación desde el mail: se guarda el archivo entero y se lee el corte */
  const put = []; let sent = null, took = null;
  const P = { id: 'gmail', key: e => 'orbit:petgmail:' + e, validId: () => true, validPart: () => true, find: async () => ({ name: 'largo.pdf', type: 'application/pdf', size: big.length }), download: async () => big };
  const deps = {
    pets: PET.pets, fits: async () => true, addUsage: async () => {}, putFile: async (e, n, buf) => { put.push(buf.length); return 'blob:mascotas/0123456789abcdef/a-largo.pdf'; },
    peekScan: async () => null, takeScan: async (e, pages) => { took = pages; return { ticket: 't', left: 30, show: false }; },
    prepare: Q.prepareForAI, truncatedNote: Q.TRUNCATED_NOTE,
    scanStudy: async buf => { sent = (await PDFDocument.load(buf)).getPageCount(); return { date: '2026-09-01', kind: 'sangre', title: 'Hemograma', confidence: 'alta', warnings: [] }; },
  };
  const out = await withToken(P, 'corte@ejemplo.com', { m: 'm1', part: '1' }, deps);
  assert.deepEqual(put, [big.length], 'el archivo completo queda guardado');
  assert.equal(sent, 20); assert.equal(took, 20);
  assert.equal(out.body.truncated, true); assert.equal(out.body.note, Q.TRUNCATED_NOTE);
});

/* ---------- devolución del crédito ---------- */
test('si la IA falla, la importación se devuelve (libreta por foto, por el endpoint)', async () => {
  const email = 'devuelve@ejemplo.com';
  await buy(email, new Date(Date.now() - 2 * DAY).toISOString());
  await kvSet(`orbit:pets:${email}`, PET);
  const real = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response('{}', { status: 500 });
    const r = await call('POST', { scan: '1' }, { images: [IMG, IMG] }, email);
    assert.equal(r.code, 502);
    let g = await call('GET', {}, null, email);
    assert.equal(g.body.ai.imports.left, 40, 'no se gastó nada');
    globalThis.fetch = async () => new Response(JSON.stringify({ content: [{ type: 'text', text: '{"items":[{"type":"vacuna","name":"Antirrábica","date":"2026-05-02"}],"pet":{},"warnings":[]}' }] }), { status: 200 });
    const ok = await call('POST', { scan: '1' }, { images: [IMG, IMG] }, email);
    assert.equal(ok.code, 200); assert.equal(ok.body.items.length, 1);
    assert.deepEqual(ok.body.quota, { left: 39, show: false });
    g = await call('GET', {}, null, email);
    assert.equal(g.body.ai.imports.left, 39);
  } finally { globalThis.fetch = real; }
});

test('si la IA falla en una importación del mail, se llama a refundScan con el ticket', async () => {
  const email = 'devuelve-mail@ejemplo.com', ctx = { purchaseDate: new Date(Date.now() - 2 * DAY).toISOString() };
  const P = { id: 'gmail', key: e => 'orbit:petgmail:' + e, validId: () => true, validPart: () => true, find: async () => ({ name: 'eco.pdf', type: 'application/pdf', size: 10 }), download: async () => Buffer.from('%PDF-1.4 /Type /Page x') };
  const deps = {
    pets: PET.pets, fits: async () => true, addUsage: async () => {}, putFile: async () => 'blob:mascotas/0123456789abcdef/a-eco.pdf',
    peekScan: e => Q.checkImport(e, ctx, 1),
    takeScan: async (e, pages) => { const t = await Q.takeImport(e, ctx, pages); return t.ok ? { ticket: t.ticket, left: t.left, show: t.show } : t; },
    refundScan: Q.refundImport, prepare: Q.prepareForAI,
    scanStudy: async () => { throw Object.assign(new Error('ia_error_500'), { status: 502 }); },
  };
  const out = await withToken(P, email, { m: 'm1', part: '1' }, deps);
  assert.equal(out.body.manual, 'ia_error_500');
  assert.equal((await Q.aiStatus(email, ctx)).imports.left, 40, 'la importación volvió');
});

/* importOne con un token simulado: el adaptador falso devuelve el access token sin ir a Google */
async function withToken(P, email, body, deps) {
  process.env.MIMITOS_TOKEN_KEY ||= Buffer.alloc(32, 7).toString('base64');
  const key = M.tokenKey();
  const st = { tok: M.seal('RT', key, email), imported: [], queue: [], address: 'x' };
  const cfg = { key, ready: true };
  return M.importOne({ ...P, refresh: async () => ({ access: 'AT', expires: 3600 }) }, email, st, cfg, body, deps);
}

/* ---------- vencimiento ---------- */
test('vencimiento a 12 meses: ai_expired en libreta, estudios, preguntas y mail; la app sigue andando', async () => {
  const email = 'vencida@ejemplo.com';
  await buy(email, '2025-09-20T12:00:00Z');
  await kvSet(`orbit:pets:${email}`, PET);
  const g = await call('GET', {}, null, email);
  assert.equal(g.code, 200); assert.equal(g.body.access, 'full', 'la app y los datos siguen');
  assert.equal(g.body.ai.expired, true);
  assert.ok(g.body.ai.expiresAt.startsWith('2026-09-20'));
  const real = globalThis.fetch; let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response('{}', { status: 200 }); };
  try {
    const s = await call('POST', { scan: '1' }, { images: [IMG] }, email);
    assert.equal(s.code, 403); assert.equal(s.body.error, 'ai_expired');
    const a = await call('POST', { ask: '1' }, { question: '¿Cuándo le toca la vacuna?' }, email);
    assert.equal(a.code, 403); assert.equal(a.body.error, 'ai_expired'); assert.ok(a.body.expiredAt.startsWith('2026-09-20'));
    const m = await call('POST', { gmail: 'search' }, {}, email);
    assert.equal(m.code, 403); assert.equal(m.body.error, 'ai_expired');
    assert.equal(calls, 0, 'no se llamó a la IA');
    /* guardar la libreta sigue andando */
    const save = await call('POST', {}, { doc: PET, rev: 1 }, email);
    assert.equal(save.code, 200);
  } finally { globalThis.fetch = real; }
  /* "Avisame cuando pueda renovar": guarda el interés, sin cobrar */
  const r = await call('POST', { renew: '1' }, {}, email);
  assert.equal(r.code, 200);
  assert.ok(await kvGet(`orbit:petrenew:${email}`));
  assert.ok((await kvGet(Q.RENEW_LIST)).some(x => x.email === email));
  assert.equal((await call('GET', {}, null, email)).body.renew, true);
});

test('el día anterior al vencimiento todavía anda; el mismo día ya no', () => Promise.all([
  Q.period('borde@ejemplo.com', { purchaseDate: '2026-01-31T10:00:00Z' }, T('2027-01-31T09:59:00Z')).then(p => assert.equal(p.expired, false)),
  Q.period('borde@ejemplo.com', { purchaseDate: '2026-01-31T10:00:00Z' }, T('2027-01-31T10:00:00Z')).then(p => assert.equal(p.expired, true)),
]));

test('admin: sin vencimiento (el período se renueva cada 12 meses)', async () => {
  const p = await Q.period('admin@ejemplo.com', { admin: true, purchaseDate: '2024-01-01T00:00:00Z' }, T('2026-10-14T12:00:00Z'));
  assert.equal(p.expired, false); assert.equal(p.expiresAt, null);
  assert.equal(new Date(p.start).toISOString().slice(0, 10), '2026-01-01');
  const g = await call('GET', {}, null, 'admin@ejemplo.com');
  assert.equal(g.body.ai.expired, false); assert.equal(g.body.ai.admin, true); assert.equal(g.body.ai.expiresAt, null);
});

/* ---------- aviso de "te quedan" ---------- */
test('"te quedan": solo con 10 o menos (importaciones y preguntas)', async () => {
  const email = 'quedan@ejemplo.com', ctx = { purchaseDate: '2026-02-01T12:00:00Z' }, now = T('2026-07-01T12:00:00Z');
  const t = await Q.takeImport(email, ctx, 1, now);
  const u = await kvGet(t.ticket.k);
  u.p2 = 169; await kvSet(t.ticket.k, u);
  let st = await Q.aiStatus(email, ctx, now);
  assert.deepEqual([st.imports.left, st.imports.show], [11, false]);
  const n = await Q.takeImport(email, ctx, 1, now);
  assert.deepEqual([n.left, n.show], [10, true]);
  u.p2 = 172; await kvSet(t.ticket.k, u);
  st = await Q.aiStatus(email, ctx, now);
  assert.deepEqual([st.imports.left, st.imports.show], [8, true]);
  assert.equal(Q.SHOW_LEFT_AT, 10);
  const A = await import('../api/_lib/petask.js');
  assert.equal(A.LOW_LEFT, 10); assert.equal(A.ASK_PER_MONTH, 150); assert.equal(A.ASK_PER_DAY, 30);
});
