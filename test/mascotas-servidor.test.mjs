/* Mimitos · arreglos de servidor del QA del 14/10 (costos y seguridad):
   modelos sin ORBIT_MODEL, corte global de gasto (ai_paused), contadores atómicos, devolución solo si la IA no
   cobró, páginas con pdf-lib, ?upload con tamaño real, push solo a servicios reales, link del cuidador que vence,
   cupo de fotos, headers de vercel.json, desconectar el mail sin compra y los bajos (cron, PKCE, IPv6, ?img, IP).
   Correr con: node --test test/mascotas-servidor.test.mjs  (KV en memoria; Anthropic, Google y push simulados) */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import webpush from 'web-push';
for (const k of ['KV_REST_API_URL', 'KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'VERCEL_ENV', 'ORBIT_ASK_MODEL', 'ORBIT_VISION_MODEL', 'MIMITOS_AI_BUDGET_USD', 'BLOB_READ_WRITE_TOKEN', 'BLOB_STORE_ID', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'MIMITOS_TOKEN_KEY', 'MIMITOS_MAIL_ALLOW']) delete process.env[k];
process.env.SESSION_SECRET = 'prueba-secreta-de-mimitos-servidor-123456';
process.env.ANTHROPIC_API_KEY = 'clave-de-prueba';
/* la variable que usa Control (Sonnet u otro): Mimitos NO la tiene que heredar */
process.env.ORBIT_MODEL = 'claude-opus-5-5';
delete process.env.ADMIN_EMAILS;

const { kvGet, kvSet, kvIncrBy } = await import('../api/_lib/kv.js');
const { makeSession } = await import('../api/_lib/auth.js');
const AI = await import('../api/_lib/petai.js');
const Q = await import('../api/_lib/petquota.js');
const A = await import('../api/_lib/petask.js');
const F = await import('../api/_lib/petfiles.js');
const PP = await import('../api/_lib/petpush.js');
const L = await import('../api/_lib/petlinks.js');
const G = await import('../api/_lib/petgmail.js');
const { default: mascotas, cleanDoc, folder, sitterExpired } = await import('../api/mascotas.js');
const { default: cron } = await import('../api/cron/mascotas.js');

const DAY = 864e5;
const IMG = 'data:image/jpeg;base64,' + Buffer.from('foto').toString('base64');
const call = (method, query, body, email, headers = {}) => new Promise(ok => {
  const res = { code: 200, headers: {}, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, status(c) { this.code = c; return this; }, json(o) { ok({ code: this.code, body: o, headers: this.headers }); }, end(b) { ok({ code: this.code, headers: this.headers, raw: b }); }, redirect(c, u) { ok({ code: c, location: u }); } };
  mascotas({ method, query, body, headers: { ...(email ? { cookie: `orbit_session=${makeSession(email)}` } : {}), host: 'preview.orbitando.test', ...headers } }, res);
});
const buy = (email, date = new Date(Date.now() - 2 * DAY).toISOString()) => kvSet(`orbit:purchases:${email}`, [{ productId: 'ob-018', orderId: 'o-' + email, date }]);
const PET = (x = {}) => ({ id: 'aika0001', name: 'Aika', species: 'perro', records: [], meds: [{ id: 'med1', name: 'Pastilla', dose: '1', every: 24 }], log: [], ...x });
async function pdf(n, useObjectStreams = true) { const d = await PDFDocument.create(); for (let i = 0; i < n; i++) d.addPage([200, 200]); return Buffer.from(await d.save({ useObjectStreams })); }

/* Anthropic simulado: guarda cada pedido y responde lo que diga `ai` */
let aiCalls = [], ai = () => ({ status: 200, body: { content: [{ type: 'text', text: '{}' }], stop_reason: 'end_turn', usage: { input_tokens: 1000, output_tokens: 100 } } });
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  if (String(url).startsWith('https://api.anthropic.com/')) {
    const b = JSON.parse(init.body); aiCalls.push(b);
    const r = ai(b);
    if (r.network) throw new TypeError('fetch failed');
    return new Response(typeof r.body === 'string' ? r.body : JSON.stringify(r.body), { status: r.status, headers: { 'content-type': 'application/json' } });
  }
  return realFetch(url, init);
};
const okJson = (text, usage = { input_tokens: 1000, output_tokens: 100 }, stop = 'end_turn') => () => ({ status: 200, body: { content: [{ type: 'text', text }], stop_reason: stop, usage } });
const BOOKLET = '{"items":[{"type":"vacuna","name":"Antirrábica","date":"2026-05-02"}],"pet":{},"warnings":[]}';
const quiet = async fn => { const e = console.error, w = console.warn, logs = []; console.error = console.warn = (...a) => logs.push(a.join(' ')); try { await fn(); } finally { console.error = e; console.warn = w; } return logs; };

/* ---------- 1. modelos ---------- */
test('modelos: con ORBIT_MODEL definida, el chat usa Haiku y la lectura Sonnet (no la heredan)', async () => {
  const email = 'modelos@ejemplo.com';
  await buy(email); await kvSet(`orbit:pets:${email}`, { pets: [PET()], rev: 1 });
  assert.equal(AI.askModel(), 'claude-haiku-5-5');
  assert.equal(AI.visionModel(), 'claude-sonnet-5-5');
  assert.equal(A.askModel(), 'claude-haiku-5-5');
  aiCalls = []; ai = okJson('Hola.');
  assert.equal((await call('POST', { ask: '1' }, { question: '¿Cuándo le toca la vacuna?' }, email)).code, 200);
  ai = okJson(BOOKLET);
  assert.equal((await call('POST', { scan: '1' }, { images: [IMG] }, email)).code, 200);
  const [ask, scan] = aiCalls;
  assert.equal(ask.model, 'claude-haiku-5-5');
  assert.deepEqual(ask.output_config, { effort: 'low' });
  assert.equal(scan.model, 'claude-sonnet-5-5');
  assert.deepEqual(scan.output_config, { effort: 'low' }, 'la lectura va con esfuerzo bajo');
  assert.ok(scan.max_tokens >= 4000, 'max_tokens holgado para el JSON');
  /* las variables propias sí mandan */
  process.env.ORBIT_ASK_MODEL = 'claude-sonnet-5-5'; process.env.ORBIT_VISION_MODEL = 'claude-opus-5-5';
  try { assert.equal(AI.askModel(), 'claude-sonnet-5-5'); assert.equal(AI.visionModel(), 'claude-opus-5-5'); }
  finally { delete process.env.ORBIT_ASK_MODEL; delete process.env.ORBIT_VISION_MODEL; }
});

test('lectura cortada (stop_reason max_tokens): error de truncado y el crédito NO vuelve (ya se cobró)', async () => {
  const email = 'truncado@ejemplo.com';
  await buy(email); await kvSet(`orbit:pets:${email}`, { pets: [PET()], rev: 1 });
  ai = okJson('{"items":[{"type":"vac', { input_tokens: 2000, output_tokens: 8000 }, 'max_tokens');
  const r = await call('POST', { scan: '1' }, { images: [IMG] }, email);
  assert.equal(r.code, 502); assert.equal(r.body.error, 'ia_respuesta_truncada');
  assert.equal((await call('GET', {}, null, email)).body.ai.imports.left, 39);
  /* JSON inválido con 200: tampoco vuelve */
  ai = okJson('no es json');
  const r2 = await call('POST', { scan: '1' }, { images: [IMG] }, email);
  assert.equal(r2.body.error, 'ia_respuesta_invalida');
  assert.equal((await call('GET', {}, null, email)).body.ai.imports.left, 38);
});

/* ---------- 2. corte global de gasto ---------- */
test('corte global: pasado el tope del mes, ai_paused en preguntas y lectura, con console.error y sin llamar a la IA', async () => {
  const email = 'pausa@ejemplo.com';
  await buy(email); await kvSet(`orbit:pets:${email}`, { pets: [PET()], rev: 1 });
  process.env.MIMITOS_AI_BUDGET_USD = '1';
  const k = AI.spendKey();
  const before = (await kvGet(k)) || 0;
  try {
    /* tope ya alcanzado: ni se intenta */
    await kvSet(k, 1_000_000);
    aiCalls = []; ai = okJson('Hola.');
    const a = await call('POST', { ask: '1' }, { question: 'hola' }, email);
    assert.equal(a.code, 503); assert.equal(a.body.error, 'ai_paused'); assert.match(a.body.message, /pausa/);
    const s = await call('POST', { scan: '1' }, { images: [IMG] }, email);
    assert.equal(s.code, 503); assert.equal(s.body.error, 'ai_paused');
    assert.equal(aiCalls.length, 0);
    assert.equal((await call('GET', {}, null, email)).body.ai.paused, true, 'la app lo puede mostrar');
    assert.equal((await call('GET', {}, null, email)).body.ai.imports.left, 40, 'no se gastó crédito');
    /* casi en el tope: la reserva de esta llamada lo pasaría → pausa, aviso y la pregunta vuelve */
    await kvSet(k, 999_900);
    let r;
    const logs = await quiet(async () => { r = await call('POST', { ask: '1' }, { question: 'hola' }, email); });
    assert.equal(r.code, 503); assert.equal(r.body.error, 'ai_paused');
    assert.ok(logs.some(l => /IA EN PAUSA/.test(l)), 'console.error para que Majo se entere');
    assert.ok(logs.every(l => !l.includes(email)), 'sin datos de nadie en el log');
    assert.equal(await kvGet(k), 999_900, 'la reserva volvió');
    assert.equal((await A.askLeft(email)).month, A.ASK_PER_MONTH, 'la pregunta del mes volvió');
  } finally { delete process.env.MIMITOS_AI_BUDGET_USD; await kvSet(k, before); }
  assert.equal(AI.DEFAULT_BUDGET_USD, 150);
});

test('corte global: la reserva se ajusta al costo real que informa la API', async () => {
  const k = AI.spendKey(), before = (await kvGet(k)) || 0;
  ai = okJson('{}', { input_tokens: 10_000, output_tokens: 1_000 });
  const out = await AI.callClaude({ model: 'claude-sonnet-5-5', body: { max_tokens: 4000, messages: [{ role: 'user', content: 'x' }] }, estimate: 50_000 });
  /* Sonnet 5.5: USD 2 / 10 por millón → 10.000 × 2 + 1.000 × 10 = 30.000 micro-dólares */
  assert.equal(out.costMicro, 30_000);
  assert.equal((await kvGet(k)) - before, 30_000);
  /* sin 200 no hay cobro: la reserva vuelve entera */
  ai = () => ({ status: 529, body: '{}' });
  await assert.rejects(AI.callClaude({ model: 'claude-sonnet-5-5', body: { max_tokens: 4000, messages: [] }, estimate: 1000 }), e => e.billed === false && e.status === 503);
  ai = () => ({ network: true });
  await assert.rejects(AI.callClaude({ model: 'claude-sonnet-5-5', body: { max_tokens: 4000, messages: [] }, estimate: 1000 }), e => e.billed === false && e.message === 'ia_error_red');
  assert.equal((await kvGet(k)) - before, 30_000);
  assert.deepEqual(AI.priceOf('claude-haiku-5-5'), [0.10, 0.50]);
  assert.deepEqual(AI.priceOf('modelo-nuevo'), [10, 50], 'un modelo desconocido se estima caro');
});

/* ---------- 3. contadores atómicos ---------- */
test('contadores atómicos: 60 importaciones en paralelo el mismo día → exactamente 40 pasan', async () => {
  const email = 'paralelo@ejemplo.com', ctx = { purchaseDate: '2026-01-10T12:00:00Z' }, now = Date.parse('2026-06-01T15:00:00Z');
  const all = await Promise.all(Array.from({ length: 60 }, () => Q.takeImport(email, ctx, 1, now)));
  assert.equal(all.filter(x => x.ok).length, 40);
  assert.ok(all.filter(x => !x.ok).every(x => x.error === 'limite_diario'));
  assert.equal(await kvGet(`orbit:petaiday:${email}:2026-06-01`), 40, 'el diario no se pasa del tope');
});

test('contadores atómicos: 45 preguntas en paralelo → exactamente 30 por día', async () => {
  const email = 'ask-paralelo@ejemplo.com', d = new Date('2026-06-01T15:00:00Z');
  const all = await Promise.all(Array.from({ length: 45 }, () => A.reserveAsk(email, d)));
  assert.equal(all.filter(x => x.ok).length, 30);
  assert.equal((await A.askLeft(email, d)).month, A.ASK_PER_MONTH - 30);
});

test('mensajes del QR: tope por IP atómico', async () => {
  const kv = await import('../api/_lib/kv.js');
  assert.equal(typeof kv.kvIncrBy, 'function');
  const k = 'orbit:prueba:incr';
  const vals = await Promise.all(Array.from({ length: 10 }, () => kvIncrBy(k, 1, 60)));
  assert.deepEqual([...vals].sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(await kvIncrBy(k, -3), 7);
});

/* ---------- 4. devolución del crédito ---------- */
test('devolución: solo si la IA no cobró; el diario nunca vuelve; como mucho 10 por día', async () => {
  const email = 'devoluciones@ejemplo.com', ctx = { purchaseDate: '2026-01-10T12:00:00Z' }, now = Date.parse('2026-06-03T15:00:00Z');
  for (let i = 0; i < 12; i++) {
    const t = await Q.takeImport(email, ctx, 2, now);
    assert.ok(t.ok);
    assert.equal(await Q.refundImport(t.ticket, now), i < Q.REFUNDS_PER_DAY, 'devolución ' + (i + 1));
  }
  const st = await Q.aiStatus(email, ctx, now);
  assert.equal(st.imports.left, 180 - 2, 'las 10 primeras volvieron; las 2 últimas no');
  assert.equal(await kvGet(`orbit:petaiday:${email}:2026-06-03`), 12, 'el diario cuenta las 12');
  assert.equal(Q.REFUNDS_PER_DAY, 10);
});

test('devolución por el endpoint: 500 de la API vuelve; en preguntas vuelve la del mes, no la del día', async () => {
  const email = 'devuelve-ep@ejemplo.com';
  await buy(email); await kvSet(`orbit:pets:${email}`, { pets: [PET()], rev: 1 });
  ai = () => ({ status: 500, body: '{}' });
  let r;
  await quiet(async () => { r = await call('POST', { ask: '1' }, { question: 'hola' }, email); });
  assert.equal(r.code, 502);
  const left = await A.askLeft(email);
  assert.equal(left.month, A.ASK_PER_MONTH, 'la del mes volvió');
  assert.equal(left.day, A.ASK_PER_DAY - 1, 'la del día no');
  const s = await call('POST', { scan: '1' }, { images: [IMG] }, email);
  assert.equal(s.code, 502);
  assert.equal((await call('GET', {}, null, email)).body.ai.imports.left, 40);
});

/* ---------- 5. páginas ---------- */
test('páginas: siempre con pdf-lib; un PDF que muestra 1 página y tiene 30 se corta a 20 y se cobra 20', async () => {
  const real = await pdf(30);
  const fake = Buffer.concat([real, Buffer.from('\n% /Type /Page\n')]);
  assert.equal(Q.countPdfPagesFast(fake), 1, 'el conteo rápido se engaña');
  const p = await Q.prepareForAI(fake, 'application/pdf');
  assert.deepEqual([p.total, p.pages, p.truncated], [30, 20, true]);
  assert.equal((await PDFDocument.load(p.buf)).getPageCount(), 20);
  /* pdf-lib no lo puede abrir: no se manda */
  await assert.rejects(Q.prepareForAI(Buffer.from('%PDF-1.4 /Type /Page x'), 'application/pdf'), e => e.message === 'pdf_ilegible' && e.status === 422);
  assert.equal(Q.PDF_UNREADABLE, 'No pudimos leer el PDF.');
  const ok = await Q.prepareForAI(await pdf(3, false), 'application/pdf');
  assert.deepEqual([ok.total, ok.truncated], [3, false]);
});

/* ---------- 6. ?upload ---------- */
test('upload: rechaza tamaño 0, negativo o mayor al máximo, y tiene tope de 30 por día', async () => {
  const email = 'subidas@ejemplo.com';
  await buy(email);
  process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_prueba_no_se_usa';
  try {
    for (const size of [0, -5, 'x']) assert.equal((await call('POST', { upload: '1' }, { name: 'a.pdf', size, type: 'application/pdf' }, email)).body.error, 'tamano_invalido', String(size));
    assert.equal((await call('POST', { upload: '1' }, { name: 'a.pdf', size: 16 * 1024 * 1024, type: 'application/pdf' }, email)).code, 413);
    await kvSet(`orbit:petuploadday:${email}:${new Date().toISOString().slice(0, 10)}`, F.UPLOADS_PER_DAY);
    const r = await call('POST', { upload: '1' }, { name: 'a.pdf', size: 1000, type: 'application/pdf' }, email);
    assert.equal(r.code, 429); assert.equal(r.body.error, 'limite_diario'); assert.equal(r.body.limit, 30);
  } finally { delete process.env.BLOB_READ_WRITE_TOKEN; }
});

test('upload: al usar el archivo se anota el tamaño REAL; si es mayor al declarado se borra y se rechaza', async () => {
  const email = 'real@ejemplo.com', base = `blob:${folder(email)}/`;
  const a = base + 'aaaaaaaaaaaa-chico.pdf', b = base + 'bbbbbbbbbbbb-trampa.pdf', c = base + 'cccccccccccc-sin-subir.pdf';
  for (const [ref, n] of [[a, 5000], [b, 1], [c, 100]]) { await F.addUsage(email, ref, n); await F.addPending(email, ref, n); }
  const sizes = { [a.slice(5)]: 4000, [b.slice(5)]: 50 * 1024 * 1024, [c.slice(5)]: null }, removed = [];
  const out = await F.verifyUploads(email, [a, b, c], { size: async p => sizes[p], remove: async p => removed.push(p) });
  assert.deepEqual(out, { ok: false, ref: b, error: 'archivo_rechazado' });
  assert.deepEqual(removed, [b.slice(5)], 'se borró el que mintió');
  const u = await F.getUsage(email);
  assert.equal(u.items[a], 4000, 'queda el tamaño real');
  assert.equal(u.items[b], undefined);
  assert.equal(u.items[c], 100, 'el que no se subió sigue con lo declarado');
  /* ya verificado: no se vuelve a pedir el tamaño */
  let asked = 0;
  await F.verifyUploads(email, [a], { size: async () => { asked++; return 1; } });
  assert.equal(asked, 0);
});

test('cleanDoc: las refs de estudios tienen que ser de la carpeta de la cuenta', () => {
  const mine = `blob:${folder('duena@ejemplo.com')}/abc-x.pdf`, other = `blob:${folder('otra@ejemplo.com')}/abc-y.pdf`;
  const doc = { pets: [{ id: 'p1', name: 'P', studies: [{ id: 's1', date: '2026-01-01', title: 'Hemo', files: [{ ref: mine, name: 'x' }, { ref: other, name: 'y' }, { ref: 'blob:mascotas/0123456789abcdef/../z', name: 'z' }] }] }] };
  assert.deepEqual(cleanDoc(doc, 'duena@ejemplo.com').pets[0].studies[0].files.map(f => f.ref), [mine]);
});

/* ---------- 7. push ---------- */
test('push: solo endpoints https:443 de servicios reales; 401 y 403 también borran la suscripción', async () => {
  const sub = endpoint => ({ endpoint, keys: { p256dh: 'p', auth: 'a' } });
  for (const e of ['https://fcm.googleapis.com/fcm/send/abc', 'https://updates.push.services.mozilla.com/wpush/v2/x', 'https://web.push.apple.com/QK1', 'https://api.push.apple.com/x', 'https://db5p.notify.windows.com/w/?token=x'])
    assert.ok(PP.cleanSub(sub(e)), e);
  for (const e of ['http://fcm.googleapis.com/x', 'https://fcm.googleapis.com:8443/x', 'https://fcm.googleapis.com.evil.com/x', 'https://evil.com/fcm.googleapis.com', 'https://169.254.169.254/latest', 'https://user:pw@fcm.googleapis.com/x', 'https://push.example/x'])
    assert.equal(PP.cleanSub(sub(e)), null, e);
  const real = webpush.sendNotification, sent = [];
  const code = { a: 401, b: 403, c: 404, d: 500, e: 0 };
  webpush.sendNotification = async s => { sent.push(s.endpoint); const c = code[s.endpoint.slice(-1)]; if (c) throw Object.assign(new Error('x'), { statusCode: c }); };
  try {
    const n = { email: 'push@ejemplo.com', subs: ['a', 'b', 'c', 'd', 'e'].map(x => sub('https://fcm.googleapis.com/fcm/send/' + x)).concat([sub('https://evil.example/f')]), mail: false, off: {}, sent: {} };
    await PP.pushTo(n, { title: 't' });
    assert.ok(!sent.some(e => e.includes('evil')), 'a un host que no es de push no se le manda nada');
    assert.deepEqual(n.subs.map(s => s.endpoint.slice(-1)), ['d', 'e'], 'quedan solo la que dio 500 y la que anduvo');
  } finally { webpush.sendNotification = real; }
});

/* ---------- 8. link del cuidador ---------- */
async function sitterSetup(email, token, sitter = {}, at = new Date().toISOString()) {
  await buy(email);
  await kvSet(`orbit:pets:${email}`, { pets: [PET({ sitterToken: token, sitter: { name: 'Caro', key: 'Debajo de la maceta', where: 'En el sillón', ...sitter } })], rev: 5 });
  if (at !== undefined) await kvSet(`orbit:petsitter:${token}`, { email, petId: 'aika0001', ...(at ? { at } : {}) });
}
test('cuidador: con "hasta" vence al día siguiente; GET y POST dan 404 y el token se apaga solo', async () => {
  const email = 'cuida-vence@ejemplo.com', t = 'TOKcuidaVence01';
  await sitterSetup(email, t, { from: '2026-01-01', to: '2026-01-05' });
  const g = await call('GET', { c: t });
  assert.equal(g.code, 404); assert.equal(g.body.expired, true);
  assert.equal(await kvGet(`orbit:petsitter:${t}`), null, 'el token se borró');
  assert.equal((await call('POST', { c: t }, { kind: 'comida' })).code, 404);
  /* "hasta" en el futuro (o ayer): anda, y viajan la llave y dónde duerme */
  const ayer = new Date(Date.now() - DAY).toISOString().slice(0, 10);
  await sitterSetup(email, t, { to: ayer });
  const ok = await call('GET', { c: t });
  assert.equal(ok.code, 200);
  assert.equal(ok.body.pet.sitter.key, 'Debajo de la maceta');
  assert.equal(ok.body.pet.sitter.where, 'En el sillón');
  assert.ok(ok.body.until);
  assert.equal(sitterExpired({ sitter: { to: '2026-10-13' } }, {}, Date.parse('2026-10-14T15:00:00Z')), false, 'el día siguiente todavía anda');
  assert.equal(sitterExpired({ sitter: { to: '2026-10-13' } }, {}, Date.parse('2026-10-15T15:00:00Z')), true);
});

test('cuidador: sin "hasta" vence a los 30 días de creado', async () => {
  const email = 'cuida-30@ejemplo.com', t = 'TOKcuida30dias1';
  await sitterSetup(email, t, {}, new Date(Date.now() - 31 * DAY).toISOString());
  assert.equal((await call('GET', { c: t })).code, 404);
  await sitterSetup(email, t, {}, new Date(Date.now() - 29 * DAY).toISOString());
  assert.equal((await call('GET', { c: t })).code, 200);
  /* la dueña ve que venció y, al pedir el link de nuevo, recibe uno nuevo */
  await sitterSetup(email, t, {}, new Date(Date.now() - 31 * DAY).toISOString());
  const g = await call('GET', {}, null, email);
  assert.deepEqual(g.body.sitterLinks.aika0001, { active: false, expired: true });
  const n = await call('POST', { sitter: '1' }, { petId: 'aika0001' }, email);
  assert.notEqual(n.body.token, t);
  assert.ok(n.body.until);
  assert.equal((await call('GET', { c: n.body.token })).code, 200);
});

test('cuidador: el registro va a orbit:petlog:<token>, no pisa el doc y se une al leer; tope de 30 por hora', async () => {
  const email = 'cuida-log@ejemplo.com', t = 'TOKcuidaLog0001';
  await sitterSetup(email, t);
  const before = await kvGet(`orbit:pets:${email}`);
  const r = await call('POST', { c: t }, { kind: 'med', medId: 'med1', by: 'Caro' }, null, { 'x-real-ip': '9.9.9.9' });
  assert.equal(r.code, 200); assert.equal(r.body.pet.log.length, 1);
  assert.deepEqual(await kvGet(`orbit:pets:${email}`), before, 'el doc de la dueña no se tocó');
  assert.equal((await kvGet(`orbit:petlog:${t}`)).length, 1);
  /* la dueña lo ve al leer */
  const g = await call('GET', {}, null, email);
  assert.equal(g.body.doc.pets[0].log.length, 1); assert.equal(g.body.doc.pets[0].log[0].kind, 'med');
  assert.equal(g.body.sitterLinks.aika0001.active, true);
  /* la dueña guarda mientras tanto: no se pierde nada */
  const save = await call('POST', {}, { doc: { pets: [{ ...before.pets[0], notes: 'cambio' }] }, rev: 5 }, email);
  assert.equal(save.code, 200);
  assert.equal((await call('GET', { c: t })).body.pet.log.length, 1);
  /* tope por token e IP */
  for (let i = 0; i < 29; i++) await call('POST', { c: t }, { kind: 'comida' }, null, { 'x-real-ip': '9.9.9.9' });
  const stop = await call('POST', { c: t }, { kind: 'comida' }, null, { 'x-real-ip': '9.9.9.9' });
  assert.equal(stop.code, 429);
  assert.equal((await call('POST', { c: t }, { kind: 'comida' }, null, { 'x-real-ip': '8.8.8.8' })).code, 200, 'otra IP sigue');
  /* apagar el link borra también su registro aparte */
  await call('POST', { unsitter: '1' }, { petId: 'aika0001' }, email);
  assert.equal(await kvGet(`orbit:petlog:${t}`), null);
});

/* ---------- 9. fotos ---------- */
test('fotos: cupo propio de 20 MB y 30 por día', async () => {
  const email = 'fotos@ejemplo.com';
  await buy(email);
  assert.equal(F.PHOTO_QUOTA_BYTES, 20 * 1024 * 1024); assert.equal(F.PHOTOS_PER_DAY, 30);
  await F.addUsage(email, 'img:' + 'a'.repeat(20), 20 * 1024 * 1024 - 10);
  const full = await call('POST', { photo: '1' }, { data: IMG }, email);
  assert.equal(full.code, 413); assert.equal(full.body.error, 'cupo_lleno');
  /* un estudio grande no cuenta para el cupo de fotos */
  const email2 = 'fotos2@ejemplo.com';
  await buy(email2);
  await F.addUsage(email2, `blob:${folder(email2)}/x-estudio.pdf`, 100 * 1024 * 1024);
  assert.equal((await call('POST', { photo: '1' }, { data: IMG }, email2)).code, 200);
  await kvSet(`orbit:petphotoday:${email2}:${new Date().toISOString().slice(0, 10)}`, 30);
  const day = await call('POST', { photo: '1' }, { data: IMG }, email2);
  assert.equal(day.code, 429); assert.equal(day.body.limit, 30);
});

/* ---------- 10. headers de vercel.json ---------- */
test('vercel.json: Referrer-Policy, nosniff, frame-ancestors y CSP en la app, la ficha, el cuidador y la API', () => {
  const v = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url)));
  for (const src of ['/mascotas', '/mascota/(.*)', '/cuida/(.*)', '/api/mascotas']) {
    const h = Object.fromEntries((v.headers.find(x => x.source === src)?.headers || []).map(x => [x.key, x.value]));
    assert.equal(h['Referrer-Policy'], 'no-referrer', src);
    assert.equal(h['X-Content-Type-Options'], 'nosniff', src);
    assert.equal(h['X-Frame-Options'], 'DENY', src);
    assert.match(h['Content-Security-Policy'] || '', /frame-ancestors 'none'/, src);
    assert.match(h['Content-Security-Policy'], /default-src '(self|none)'/);
  }
  const csp = v.headers.find(x => x.source === '/mascotas').headers.find(x => x.key === 'Content-Security-Policy').value;
  for (const need of ['https://fonts.googleapis.com', 'https://fonts.gstatic.com', 'https://cdn.jsdelivr.net', 'https://storage.googleapis.com', 'https://cdnjs.cloudflare.com', 'blob:', 'data:', "'wasm-unsafe-eval'", 'https://*.blob.vercel-storage.com'])
    assert.ok(csp.includes(need), need);
  for (const src of ['/mascota/(.*)', '/cuida/(.*)']) assert.equal(Object.fromEntries(v.headers.find(x => x.source === src).headers.map(x => [x.key, x.value]))['X-Robots-Tag'], 'noindex, nofollow');
});

/* ---------- 11. desconectar el mail ---------- */
test('desconectar el mail: anda sin compra y sin configuración; borra lo guardado', async () => {
  const email = 'sin-compra-mail@ejemplo.com';
  await kvSet(`orbit:petgmail:${email}`, { tok: 'v1.x.y.z', address: 'yo@gmail.com', imported: ['a'], queue: [] });
  await kvSet(`orbit:petoutlook:${email}`, { tok: 'v1.x.y.z', address: 'yo@outlook.com', imported: [], queue: [] });
  const g = await call('POST', { gmail: 'disconnect' }, {}, email);
  assert.equal(g.code, 200); assert.equal(g.body.ok, true); assert.equal(g.body.revoked, false, 'sin clave no se puede revocar, pero se borra');
  assert.equal(await kvGet(`orbit:petgmail:${email}`), null);
  const o = await call('POST', { outlook: 'disconnect' }, {}, email);
  assert.equal(o.code, 200);
  assert.equal(await kvGet(`orbit:petoutlook:${email}`), null);
  assert.equal((await call('POST', { gmail: 'disconnect' }, {}, null)).code, 401, 'sin sesión no');
});

/* ---------- 12. bajos ---------- */
test('cron: el secreto se compara en tiempo constante y un secreto del mismo largo no entra', async () => {
  process.env.CRON_SECRET = 'secreto-del-cron-123';
  const run = auth => new Promise(ok => cron({ headers: { authorization: auth }, query: {} }, { status(c) { this.c = c; return this; }, json(o) { ok({ code: this.c || 200, body: o }); } }));
  try {
    assert.equal((await run('Bearer secreto-del-cron-124')).code, 401);
    assert.equal((await run('Bearer x')).code, 401);
    assert.equal((await run(undefined)).code, 401);
    assert.equal((await run('Bearer secreto-del-cron-123')).code, 200);
  } finally { delete process.env.CRON_SECRET; }
  assert.match(readFileSync(new URL('../api/cron/mascotas.js', import.meta.url), 'utf8'), /timingSafeEqual/);
});

test('Gmail: PKCE S256 (code_challenge al ir y code_verifier al volver)', async () => {
  const u = new URL(G.gmail.authUrl({ clientId: 'cid', redirect: 'https://x.test/cb' }, 'st', 'CHALLENGE123'));
  assert.equal(u.searchParams.get('code_challenge'), 'CHALLENGE123');
  assert.equal(u.searchParams.get('code_challenge_method'), 'S256');
  let body = '';
  const prev = globalThis.fetch;
  globalThis.fetch = async (url, init) => { if (String(url).includes('oauth2.googleapis.com/token')) { body = String(init.body); return new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 }); } return prev(url, init); };
  try { await quiet(() => G.gmail.exchange({ clientId: 'cid', secret: 's', redirect: 'https://x.test/cb' }, 'CODE', 'VERIFIER-abc')); }
  finally { globalThis.fetch = prev; }
  assert.equal(new URLSearchParams(body).get('code_verifier'), 'VERIFIER-abc');
});

test('links del mail: IPv6 solo unicast global (sin 6to4, Teredo, documentación ni ORCHID)', () => {
  for (const ip of ['2002:c0a8:101::1', '2001:0:4136:e378::1', '2001:db8::1', '2001:10::1', '2001:20::5', '64:ff9b::a00:1', 'fc00::1', 'fe80::1', 'ff02::1', '::2', '100::1', '4000::1'])
    assert.ok(L.isPrivateIp(ip), ip);
  for (const ip of ['2800:3f0:4002:80b::200e', '2606:4700::1111', '2001:4860:4860::8888'])
    assert.ok(!L.isPrivateIp(ip), ip);
});

test('?img=: caché privada de un día y nosniff', async () => {
  await kvSet('orbit:petimg:abcdef0123456789', IMG);
  const r = await call('GET', { img: 'abcdef0123456789' });
  assert.equal(r.code, 200);
  assert.equal(r.headers['cache-control'], 'private, max-age=86400');
  assert.equal(r.headers['x-content-type-options'], 'nosniff');
});

test('topes por IP: usan x-vercel-forwarded-for o x-real-ip (x-forwarded-for no alcanza para saltearlos)', async () => {
  const email = 'ip@ejemplo.com', t = 'TOKqrIpPrueba01';
  await buy(email);
  await kvSet(`orbit:pets:${email}`, { pets: [PET({ share: t })], rev: 1 });
  await kvSet(`orbit:petshare:${t}`, { email, petId: 'aika0001' });
  const codes = [];
  for (let i = 0; i < 6; i++) codes.push((await call('POST', { s: t, found: '1' }, { msg: 'La encontré ' + i }, null, { 'x-real-ip': '7.7.7.7', 'x-forwarded-for': `10.0.0.${i}` })).code);
  assert.deepEqual(codes, [200, 200, 200, 200, 200, 429]);
});

test('ficha pública del QR: sin photoFull ni updatedAt; hue y speciesOther (los usa mascota.html) sí', async () => {
  const email = 'ficha@ejemplo.com', t = 'TOKfichaPublic1';
  await buy(email);
  await kvSet(`orbit:pets:${email}`, { pets: [PET({ share: t, species: 'otra', speciesOther: 'Hurón', hue: 'verde', photo: '/api/mascotas?img=aaaaaaaa11', photoFull: '/api/mascotas?img=bbbbbbbb22' })], rev: 1, updatedAt: '2026-10-14T10:00:00Z' });
  await kvSet(`orbit:petshare:${t}`, { email, petId: 'aika0001' });
  const r = await call('GET', { s: t }, null, null, { 'x-real-ip': '5.5.5.5' });
  assert.equal(r.code, 200);
  assert.equal(r.body.pet.photoFull, undefined);
  assert.equal(r.body.updatedAt, undefined);
  assert.ok(!JSON.stringify(r.body).includes('bbbbbbbb22'), 'la foto original no viaja');
  assert.equal(r.body.pet.cut, true, 'solo el dato de que hay recorte');
  assert.equal(r.body.pet.hue, 'verde');
  assert.equal(r.body.pet.speciesOther, 'Hurón');
});
