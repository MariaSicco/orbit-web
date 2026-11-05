/* Mimitos · "Me fui" (fase 1): contador y semana (reglas compartidas), umbrales con dedupe en el cron, cuidador,
   modelo en el doc (cleanDoc), "Preguntale a Mimitos" y el interruptor.
   Correr con: node --test test/mascotas-mefui.test.mjs (KV en memoria; push y mail simulados) */
import { test } from 'node:test';
import assert from 'node:assert/strict';
for (const k of ['KV_REST_API_URL', 'KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'VERCEL_ENV', 'MIMITOS_MEFUI', 'MIMITOS_MEFUI_ALLOW']) delete process.env[k];
process.env.SESSION_SECRET = 'prueba-secreta-de-mimitos-mefui-1234567';
process.env.ADMIN_EMAILS = 'admin@orbit.test';
const { kvSet, kvGet, kvSMembers } = await import('../api/_lib/kv.js');
const { makeSession } = await import('../api/_lib/auth.js');
const W = await import('../api/_lib/petaway.js');
const A = await import('../api/_lib/petask.js');
const { default: mascotas, cleanDoc } = await import('../api/mascotas.js');
const { default: cron } = await import('../api/cron/mefui.js');
const R = globalThis.MZAWAYR;
const H = 36e5;
const buy = email => kvSet(`orbit:purchases:${email}`, [{ productId: 'ob-018', orderId: 'o-' + email, date: '2026-10-01T00:00:00Z' }]);
const call = (method, query, body, email, headers = {}) => new Promise(ok => {
  const res = { code: 200, headers: {}, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, status(c) { this.code = c; return this; }, json(o) { ok({ code: this.code, body: o }); }, end(b) { ok({ code: this.code, raw: b }); }, redirect(c, u) { ok({ code: c, location: u }); } };
  mascotas({ method, query, body, headers: { ...(email ? { cookie: `orbit_session=${makeSession(email)}` } : {}), ...headers } }, res);
});
const FELIZA = { id: 'feliza01', name: 'Feliza', species: 'gato', sex: 'h', records: [], meds: [], log: [] };
const TOTO = { id: 'toto0001', name: 'Toto', species: 'perro', sex: 'm', records: [], meds: [], log: [] };
const utcDay = ms => new Date(ms).toISOString().slice(0, 10);

test('contador: "Feliza lleva 3 h 20 min sola" y plural', () => {
  const now = Date.parse('2026-10-14T18:00:00Z');
  const away = { on: true, id: 'a1', since: new Date(now - (3 * H + 20 * 6e4)).toISOString(), pets: [] };
  assert.equal(R.soloText([FELIZA], R.elapsed(away, now)), 'Feliza lleva 3 h 20 min sola');
  assert.equal(R.soloText([TOTO], 45 * 6e4), 'Toto lleva 45 min solo');
  assert.equal(R.soloText([FELIZA, TOTO], 2 * H), 'Feliza y Toto llevan 2 h solos');
  assert.equal(R.elapsed({ ...away, on: false }, now), 0);
});

test('umbrales: escalón al umbral (con cuidador) y al doble; 0 = sin aviso', () => {
  const now = Date.parse('2026-10-14T18:00:00Z');
  const away = h => ({ on: true, id: 'a1', since: new Date(now - h * H).toISOString() });
  const set = { alertH: 4, sitter: true, sitterMail: 'cuida@x.com' };
  assert.deepEqual(R.dueSteps(away(3.9), set, now), []);
  assert.deepEqual(R.dueSteps(away(4), set, now).map(s => [s.step, s.sitter]), [[1, true]]);
  assert.deepEqual(R.dueSteps(away(8.5), set, now).map(s => [s.step, s.sitter]), [[1, true], [2, false]]);
  assert.deepEqual(R.dueSteps(away(9), { ...set, alertH: 0 }, now), []);
});

test('semana: suma los últimos 7 días, reparte la medianoche y suma la salida en curso', () => {
  const now = Date.parse('2026-10-14T12:00:00Z');
  const log = [
    { id: 'x1', from: '2026-10-13T22:00:00Z', to: '2026-10-14T02:00:00Z', pets: [] },      // 4 h cruzando la medianoche
    { id: 'x2', from: '2026-10-12T10:00:00Z', to: '2026-10-12T11:30:00Z', pets: ['toto0001'] }, // solo Toto
    { id: 'x3', from: '2026-10-01T10:00:00Z', to: '2026-10-01T15:00:00Z', pets: [] },      // fuera de la semana
  ];
  const away = { on: true, id: 'a9', since: '2026-10-14T11:00:00Z', pets: ['feliza01'] };
  const w = R.week(log, away, 'feliza01', now, utcDay);
  assert.equal(w.total, 5 * H);
  assert.equal(w.count, 2);
  assert.deepEqual(w.byDay, { '2026-10-13': 2 * H, '2026-10-14': 3 * H });
  assert.equal(w.longest.ms, 4 * H);
  assert.equal(R.week(log, away, 'toto0001', now, utcDay).total, 5.5 * H);
});

test('modelo: cleanDoc guarda away, awaySet y awayLog limpios (y los docs viejos quedan con lo de base)', () => {
  const d = cleanDoc({ pets: [FELIZA], away: { on: true, id: 'abc123', since: '2026-10-14T10:00:00Z', pets: ['feliza01', 'otra'], check: { agua: 1, puerta: true, raro: true } },
    awaySet: { alertH: 5, sitter: true, sitterMail: 'no es mail' }, awayLog: [{ id: 'log1', from: '2026-10-13T10:00:00Z', to: '2026-10-13T09:00:00Z' }, { id: 'log2', from: '2026-10-13T10:00:00Z', to: '2026-10-13T12:00:00Z', pets: ['feliza01'] }] }, 'x@x.com');
  assert.deepEqual(d.away, { on: true, id: 'abc123', since: '2026-10-14T10:00:00Z', pets: ['feliza01'], check: { agua: true, comida: false, puerta: true, ventanas: false } });
  assert.deepEqual(d.awaySet, { alertH: 4, sitter: false, sitterMail: '' }, 'umbral fuera de la lista vuelve a 4; sin mail válido no hay cuidador');
  assert.deepEqual(d.awayLog.map(x => x.id), ['log2']);
  const old = cleanDoc({ pets: [FELIZA] }, 'x@x.com');
  assert.equal(old.away.on, false); assert.equal(old.awaySet.alertH, 4); assert.deepEqual(old.awayLog, []);
});

test('cron: avisa al pasar el umbral, una sola vez por escalón, y al cuidador por mail', async () => {
  process.env.MIMITOS_MEFUI = '1'; process.env.MIMITOS_MEFUI_ALLOW = 'majo@x.com';
  const email = 'majo@x.com'; await buy(email);
  const now = Date.parse('2026-10-14T18:00:00Z');
  await kvSet(`orbit:petnotify:${email}`, { subs: [{ endpoint: 'https://fcm.googleapis.com/x' }], mail: true, off: {}, tz: 'America/Argentina/Buenos_Aires' });
  const doc = { pets: [FELIZA], rev: 1, away: { on: true, id: 'sal1', since: new Date(now - 4.2 * H).toISOString(), pets: [] }, awaySet: { alertH: 4, sitter: true, sitterMail: 'cuida@x.com' }, awayLog: [] };
  await kvSet(`orbit:pets:${email}`, doc);
  await W.syncAwayIndex(email, doc);
  const sent = { push: [], mail: [] };
  const send = { push: async (n, p) => { sent.push.push(p); return 1; }, mail: async (to, m) => { sent.mail.push([to, m.title]); return true; } };
  const o1 = await W.runAway({ now, send });
  assert.equal(o1.avisos, 1); assert.equal(o1.cuidador, 1);
  assert.equal(sent.push[0].title, 'Feliza lleva 4 h 12 min sola');
  assert.match(sent.push[0].body, /Saliste a las 10:48/);
  assert.deepEqual(sent.mail.map(x => x[0]), [email, 'cuida@x.com']);
  /* corrida repetida: nada nuevo */
  assert.equal((await W.runAway({ now: now + 10 * 6e4, send })).avisos, 0);
  /* al doble del umbral: solo a la persona */
  const o3 = await W.runAway({ now: now + 4 * H, send });
  assert.equal(o3.avisos, 1); assert.equal(o3.cuidador, 0);
  assert.match(sent.push[1].title, /^Sigue: feliza lleva 8 h 12 min sola/i);
  /* "Volví": sale del índice y no avisa más */
  doc.away = { on: false }; await kvSet(`orbit:pets:${email}`, doc); await W.syncAwayIndex(email, doc);
  assert.ok(!(await kvSMembers(W.AWAY_INDEX)).includes(email));
});

test('cron: interruptor apagado → no hace nada; sin CRON_SECRET → 503', async () => {
  process.env.MIMITOS_MEFUI = '0';
  assert.equal((await W.runAway()).apagado, true);
  const res = () => new Promise(ok => ({ status(c) { this.c = c; return this; }, json(o) { ok({ c: this.c, o }); } }));
  delete process.env.CRON_SECRET;
  const r1 = await new Promise(ok => cron({ headers: {} }, { status(c) { this.c = c; return this; }, json(o) { ok({ c: this.c, o }); } }));
  assert.equal(r1.c, 503);
  process.env.CRON_SECRET = 'secreto-cron';
  const r2 = await new Promise(ok => cron({ headers: { authorization: 'Bearer secreto-cron' } }, { status(c) { this.c = c; return this; }, json(o) { ok({ c: this.c, o }); } }));
  assert.deepEqual(r2.o, { apagado: true });
});

test('Preguntale: el contexto trae cuánto estuvo sola esta semana, citable', () => {
  const now = new Date('2026-10-14T15:00:00Z');
  const doc = { pets: [FELIZA], away: { on: true, id: 'a', since: '2026-10-14T13:00:00Z', pets: [] }, awayLog: [{ id: 'l', from: '2026-10-12T12:00:00Z', to: '2026-10-12T15:30:00Z', pets: [] }] };
  const ctx = A.buildContext(doc, { question: '¿Cuánto estuvo sola Feliza esta semana?', tz: 'America/Argentina/Buenos_Aires', now });
  const line = ctx.text.split('\n').find(l => l.includes('Tiempo sola'));
  assert.ok(line, 'hay una línea de "Me fui"');
  assert.match(line, /5 h 30 min en total/);
  assert.match(line, /2 salida\(s\)/);
  assert.match(line, /AHORA está sola\/o desde las 10:00/);
  const id = line.slice(3, line.indexOf(']'));
  assert.equal(ctx.refs[id].section, 'mefui');
});

test('API: el GET dice si "Me fui" está habilitado; ?cam con el interruptor apagado → 404', async () => {
  const email = 'majo@x.com'; await buy(email);
  process.env.MIMITOS_MEFUI = '1'; process.env.MIMITOS_MEFUI_ALLOW = 'majo@x.com';
  assert.equal((await call('GET', {}, null, email)).body.mefui, true);
  await buy('otra@x.com');
  assert.equal((await call('GET', {}, null, 'otra@x.com')).body.mefui, false);
  assert.equal((await call('GET', { cam: 'list' }, null, 'otra@x.com')).code, 404, 'fuera de la lista → 404');
  process.env.MIMITOS_MEFUI = '0';
  assert.equal((await call('GET', {}, null, email)).body.mefui, false);
  for (const [m, a] of [['GET', 'list'], ['POST', 'pair'], ['POST', 'redeem'], ['POST', 'event'], ['GET', 'me']]) assert.equal((await call(m, { cam: a }, {}, email)).code, 404, a);
  /* guardar con "Me fui" prendido y el interruptor apagado: se guarda, pero no entra al índice */
  const cur = (await call('GET', {}, null, email)).body.doc;
  const r = await call('POST', {}, { rev: cur.rev || 0, doc: { pets: [FELIZA], away: { on: true, id: 'zz11', since: new Date().toISOString() } } }, email);
  assert.equal(r.code, 200); assert.equal(r.body.doc.away.on, true);
  assert.ok(!(await kvSMembers(W.AWAY_INDEX)).includes(email));
  process.env.MIMITOS_MEFUI = '1';
  const r2 = await call('POST', {}, { rev: r.body.doc.rev, doc: r.body.doc }, email);
  assert.equal(r2.code, 200);
  assert.ok((await kvSMembers(W.AWAY_INDEX)).includes(email), 'con el interruptor, entra al índice');
});
