/* Mimitos · Cámara (emparejado): código de un solo uso que vence a los 10 min, token de dispositivo con hash,
   revocar, interruptor MIMITOS_MEFUI y lista MIMITOS_MEFUI_ALLOW.
   Correr con: node --test test/mascotas-mefui-camara.test.mjs (KV en memoria) */
import { test } from 'node:test';
import assert from 'node:assert/strict';
for (const k of ['KV_REST_API_URL', 'KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'VERCEL_ENV', 'MIMITOS_MEFUI', 'MIMITOS_MEFUI_ALLOW']) delete process.env[k];
process.env.SESSION_SECRET = 'prueba-secreta-de-mimitos-camara-123456';
process.env.ADMIN_EMAILS = 'admin@orbit.test';
const { kvSet, kvGet, kvKeys } = await import('../api/_lib/kv.js');
const W = await import('../api/_lib/petaway.js');
const buy = email => kvSet(`orbit:purchases:${email}`, [{ productId: 'ob-018', orderId: 'o-' + email, date: '2026-10-01T00:00:00Z' }]);

test('interruptor: apagado por defecto; prendido solo admin y la lista', () => {
  assert.equal(W.mefuiAllowed('admin@orbit.test'), false);
  process.env.MIMITOS_MEFUI = '1';
  assert.equal(W.mefuiAllowed('admin@orbit.test'), true);
  assert.equal(W.mefuiAllowed('majo@x.com'), false, 'lista vacía = nadie salvo admin');
  process.env.MIMITOS_MEFUI_ALLOW = 'otra@x.com; Majo@X.com';
  assert.equal(W.mefuiAllowed('majo@x.com'), true);
  delete process.env.MIMITOS_MEFUI_ALLOW;
});

test('emparejado: un solo uso, token con hash, verify, owns y revocar', async () => {
  process.env.MIMITOS_MEFUI = '1'; process.env.MIMITOS_MEFUI_ALLOW = 'cam@x.com';
  await buy('cam@x.com');
  const { code } = await W.createPairing('cam@x.com', { petId: 'feliza01', name: 'Living' });
  assert.ok(W.pairCodeOk(code));
  const r = await W.redeemPairing(code.toLowerCase().replace(/(.{4})/, '$1-'));
  assert.ok(r.token && r.camId, 'canjea aunque venga en minúscula y con guion');
  assert.deepEqual(await W.redeemPairing(code), { error: 'codigo_vencido' }, 'segundo uso: ya no existe');
  /* el token en claro no está en KV */
  const all = JSON.stringify(await Promise.all((await kvKeys('orbit:petcam:*')).map(kvGet)));
  assert.ok(!all.includes(r.token));
  assert.deepEqual(await W.verifyCameraToken(r.token), { email: 'cam@x.com', camId: r.camId, petId: 'feliza01' });
  assert.equal(await W.ownsCamera('cam@x.com', r.camId), true);
  assert.equal(await W.ownsCamera('ajena@x.com', r.camId), false);
  assert.equal(await W.verifyCameraToken('x'.repeat(43)), null);
  /* interruptor apagado: el token deja de valer */
  process.env.MIMITOS_MEFUI = '0'; assert.equal(await W.verifyCameraToken(r.token), null); process.env.MIMITOS_MEFUI = '1';
  assert.equal(await W.revokeCamera('cam@x.com', r.camId), true);
  assert.equal(await W.verifyCameraToken(r.token), null);
  assert.equal(await W.ownsCamera('cam@x.com', r.camId), false);
});

test('emparejado: el código vence a los 10 minutos y dos canjes a la vez dan uno solo', async () => {
  process.env.MIMITOS_MEFUI = '1'; process.env.MIMITOS_MEFUI_ALLOW = 'cam2@x.com';
  await buy('cam2@x.com');
  const t0 = Date.now();
  const a = await W.createPairing('cam2@x.com', {}, t0);
  assert.deepEqual(await W.redeemPairing(a.code, {}, t0 + 10 * 60e3 + 1), { error: 'codigo_vencido' });
  const b = await W.createPairing('cam2@x.com');
  const rs = await Promise.all([W.redeemPairing(b.code), W.redeemPairing(b.code)]);
  assert.equal(rs.filter(x => x.token).length, 1);
});

/* ---------- rutas ?cam=… de punta a punta (api/mascotas.js) ---------- */
const { makeSession } = await import('../api/_lib/auth.js');
const { default: mascotas } = await import('../api/mascotas.js');
const call = (method, query, body, { email, token, ip = '1.2.3.4' } = {}) => new Promise(ok => {
  const res = { code: 200, headers: {}, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, status(c) { this.code = c; return this; }, json(o) { ok({ code: this.code, body: o }); }, end(b) { ok({ code: this.code, raw: b }); }, redirect(c, u) { ok({ code: c, location: u }); } };
  mascotas({ method, query, body, headers: { ...(email ? { cookie: `orbit_session=${makeSession(email)}` } : {}), ...(token ? { authorization: 'Bearer ' + token } : {}), 'x-forwarded-for': ip } }, res);
});
async function paired(email, petId = 'feliza01') {
  await buy(email);
  await kvSet(`orbit:pets:${email}`, { rev: 1, pets: [{ id: petId, name: 'Feliza', species: 'gato', sex: 'h', records: [], meds: [], log: [] }], away: { on: true, id: 'sal1', since: new Date(Date.now() - 3600e3).toISOString(), pets: [] } });
  const p = await call('POST', { cam: 'pair' }, { petId, name: 'Living' }, { email });
  assert.equal(p.code, 200);
  const r = await call('POST', { cam: 'redeem' }, { code: p.body.code, label: 'Living' });
  assert.equal(r.code, 200); assert.equal(r.body.pet, 'Feliza');
  return r.body;
}
const ev = (type, offsetS = 0, dur = 20) => ({ type, start: new Date(Date.now() - 600e3 + offsetS * 1000).toISOString(), dur, conf: 0.8 });

test('rutas: emparejar, me, ping, lista, eventos con agrupación y avisos (1 cada 15 min por tipo)', async () => {
  process.env.MIMITOS_MEFUI = '1'; process.env.MIMITOS_MEFUI_ALLOW = 'ruta@x.com, ajena@x.com';
  const cam = await paired('ruta@x.com');
  assert.equal((await call('GET', { cam: 'me' }, null, { token: cam.token })).body.pet, 'Feliza');
  assert.equal((await call('GET', { cam: 'me' }, null, { token: 'x'.repeat(43) })).code, 401);
  const list = await call('GET', { cam: 'list' }, null, { email: 'ruta@x.com' });
  assert.equal(list.body.cams.length, 1); assert.equal(list.body.cams[0].online, true);
  assert.ok(!JSON.stringify(list.body).includes('hash'), 'la lista nunca muestra el hash');
  /* evento: primero avisa; el mismo tipo a menos de 1 min se agrupa; otro tipo avisa aparte; el mismo tipo después de 1 min queda pendiente para el resumen */
  const a = await call('POST', { cam: 'event' }, ev('ladrido', 0), { token: cam.token });
  assert.equal(a.code, 200); assert.equal(a.body.notify, 'avisado');
  const b = await call('POST', { cam: 'event' }, ev('ladrido', 40), { token: cam.token });
  assert.equal(b.body.merged, true);
  const c = await call('POST', { cam: 'event' }, ev('aullido', 50), { token: cam.token });
  assert.equal(c.body.notify, 'avisado');
  const d = await call('POST', { cam: 'event' }, { ...ev('ladrido', 0), start: new Date(Date.now() - 10e3).toISOString() }, { token: cam.token });
  assert.equal(d.body.notify, 'agrupado');
  const evs = (await call('GET', { cam: 'events' }, null, { email: 'ruta@x.com' })).body.events;
  assert.deepEqual(evs.map(e => [e.type, e.n]), [['ladrido', 2], ['aullido', 1], ['ladrido', 1]]);
  assert.equal(evs[0].dur, 60, 'el agrupado va del primero al último');
  /* evento inválido o del futuro → 400; el audio no tiene lugar en el cuerpo */
  assert.equal((await call('POST', { cam: 'event' }, { type: 'grito', start: new Date().toISOString(), dur: 3, conf: 0.5 }, { token: cam.token })).code, 400);
  assert.equal((await call('POST', { cam: 'event' }, { ...ev('ladrido'), start: new Date(Date.now() + 3600e3).toISOString() }, { token: cam.token })).code, 400);
  /* resumen de lo agrupado: sale con el cron cuando pasan los 15 min */
  const sent = [];
  const send = { push: async (n, p) => { sent.push(p.title); return 1; }, mail: async () => true };
  assert.equal((await W.flushPending({ send })).resumenes, 0, 'todavía no pasaron 15 min');
  await kvSet('orbit:petcam:ping:ruta@x.com:ladrido', null, 1); const { kvDel } = await import('../api/_lib/kv.js'); await kvDel('orbit:petcam:ping:ruta@x.com:ladrido');
  assert.equal((await W.flushPending({ send })).resumenes, 1);
  assert.match(sent[0], /^Feliza ladró 1 vez más desde las \d\d:\d\d$/);
});

test('rutas: tope de eventos por cámara (60 por hora → 429)', async () => {
  process.env.MIMITOS_MEFUI = '1'; process.env.MIMITOS_MEFUI_ALLOW = 'tope@x.com';
  const cam = await paired('tope@x.com');
  let last;
  for (let i = 0; i < W.EV_PER_HOUR + 1; i++) last = await call('POST', { cam: 'event' }, ev(i % 2 ? 'maullido' : 'llanto', i * 70, 5), { token: cam.token });
  assert.equal(last.code, 429);
});

test('rutas: una cuenta ajena no ve ni desconecta cámaras de otra; revocar y desvincular cortan el token', async () => {
  process.env.MIMITOS_MEFUI = '1'; process.env.MIMITOS_MEFUI_ALLOW = 'duena@x.com, ajena@x.com';
  const cam = await paired('duena@x.com');
  await buy('ajena@x.com');
  assert.equal((await call('POST', { cam: 'revoke' }, { camId: cam.camId }, { email: 'ajena@x.com' })).code, 404);
  assert.deepEqual((await call('GET', { cam: 'list' }, null, { email: 'ajena@x.com' })).body.cams, []);
  assert.equal(await W.ownsCamera('ajena@x.com', cam.camId), false);
  await call('POST', { cam: 'event' }, ev('ladrido'), { token: cam.token });
  assert.deepEqual((await call('GET', { cam: 'events' }, null, { email: 'ajena@x.com' })).body.events, []);
  /* sin sesión, las rutas de la dueña → 401 */
  assert.equal((await call('GET', { cam: 'list' }, null, {})).code, 401);
  assert.equal((await call('POST', { cam: 'revoke' }, { camId: cam.camId }, { email: 'duena@x.com' })).code, 200);
  assert.equal((await call('POST', { cam: 'ping' }, {}, { token: cam.token })).code, 401);
  const cam2 = await paired('duena@x.com');
  assert.equal((await call('POST', { cam: 'unpair' }, {}, { token: cam2.token })).code, 200);
  assert.equal((await call('GET', { cam: 'me' }, null, { token: cam2.token })).code, 401);
});

test('rutas: canje con tope por IP (fuerza bruta de códigos → 429)', async () => {
  process.env.MIMITOS_MEFUI = '1';
  let last;
  for (let i = 0; i < 11; i++) last = await call('POST', { cam: 'redeem' }, { code: 'AAAAAAAA' }, { ip: '9.9.9.9' });
  assert.equal(last.code, 429);
});

test('sensibilidad: media por defecto; la cambia la dueña o la cámara y viaja en el ping', async () => {
  process.env.MIMITOS_MEFUI = '1'; process.env.MIMITOS_MEFUI_ALLOW = 'sens@x.com, ajena@x.com';
  const cam = await paired('sens@x.com');
  assert.equal((await call('GET', { cam: 'me' }, null, { token: cam.token })).body.sens, 'media');
  assert.equal((await call('POST', { cam: 'sens' }, { camId: cam.camId, sens: 'alta' }, { email: 'sens@x.com' })).code, 200);
  assert.equal((await call('POST', { cam: 'ping' }, {}, { token: cam.token })).body.sens, 'alta');
  assert.equal((await call('POST', { cam: 'sens' }, { camId: cam.camId, sens: 'altísima' }, { email: 'sens@x.com' })).code, 400);
  assert.equal((await call('POST', { cam: 'sens' }, { camId: cam.camId, sens: 'baja' }, { email: 'ajena@x.com' })).code, 404, 'otra cuenta no la toca');
  assert.equal((await call('POST', { cam: 'csens' }, { sens: 'baja' }, { token: cam.token })).code, 200);
  assert.equal((await call('GET', { cam: 'list' }, null, { email: 'sens@x.com' })).body.cams[0].sens, 'baja');
});

test('textos: gemido y llanto van como "posible"', () => {
  const start = '2026-10-14T18:20:00Z';
  assert.equal(W.eventText({ type: 'ladrido', dur: 240, start }, 'America/Argentina/Buenos_Aires', 'Feliza'), 'Feliza ladró 4 minutos a las 15:20');
  assert.equal(W.eventText({ type: 'llanto', dur: 30, start }, 'America/Argentina/Buenos_Aires', 'Feliza'), 'Feliza: posible llanto de 30 segundos a las 15:20');
  assert.equal(W.eventText({ type: 'gemido', dur: 120, start }, 'America/Argentina/Buenos_Aires', ''), 'Posible gemido de 2 minutos a las 15:20');
});

test('estado de la escucha: viaja en el ping y la dueña lo ve en la lista (sin consultas nuevas)', async () => {
  process.env.MIMITOS_MEFUI = '1'; process.env.MIMITOS_MEFUI_ALLOW = 'escucha@x.com';
  const cam = await paired('escucha@x.com');
  assert.equal((await call('POST', { cam: 'ping' }, { listen: 'pausado' }, { token: cam.token })).code, 200);
  assert.equal((await call('GET', { cam: 'list' }, null, { email: 'escucha@x.com' })).body.cams[0].listen, 'pausado');
  await call('POST', { cam: 'ping' }, { listen: 'cualquiera' }, { token: cam.token });
  assert.equal((await call('GET', { cam: 'list' }, null, { email: 'escucha@x.com' })).body.cams[0].listen, 'pausado', 'un valor raro no se guarda');
});

test('en casa (sin "Me fui"): el evento se guarda y aparece en la línea de tiempo, pero no avisa', async () => {
  process.env.MIMITOS_MEFUI = '1'; process.env.MIMITOS_MEFUI_ALLOW = 'casa@x.com';
  const cam = await paired('casa@x.com');
  const doc = await kvGet('orbit:pets:casa@x.com'); doc.away = { on: false }; await kvSet('orbit:pets:casa@x.com', doc);
  const r = await call('POST', { cam: 'event' }, ev('ladrido', 0, 2), { token: cam.token });
  assert.equal(r.code, 200); assert.equal(r.body.notify, 'en_casa'); assert.equal(r.body.away, false);
  const evs = (await call('GET', { cam: 'events', since: new Date(Date.now() - 864e5).toISOString() }, null, { email: 'casa@x.com' })).body.events;
  assert.deepEqual(evs.map(e => e.type), ['ladrido']);
  assert.equal(await kvGet('orbit:petcam:ping:casa@x.com:ladrido'), null, 'sin "Me fui" no arranca la ventana de 15 min de avisos');
});
