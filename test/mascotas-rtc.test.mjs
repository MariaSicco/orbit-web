/* Mimitos · "Me fui": señalización del video en vivo (api/_lib/petrtc.js) por /api/mascotas?rtc=…
   TTL, acceso ajeno → 403, un viewer por vez, limpieza al colgar, topes y contador de fallos.
   Corre sin servicios: KV en memoria. Usa el emparejado real de api/_lib/petaway.js. */
import { test } from 'node:test';
import assert from 'node:assert/strict';

for (const k of ['KV_REST_API_URL', 'KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'VERCEL_ENV', 'MIMITOS_MEFUI', 'MIMITOS_MEFUI_ALLOW']) delete process.env[k];
process.env.SESSION_SECRET = 'prueba-secreta-de-mimitos-rtc-1234567890';
process.env.ADMIN_EMAILS = 'admin@orbit.test';
process.env.MIMITOS_MEFUI = '1';
process.env.MIMITOS_MEFUI_ALLOW = 'duena@x.com, otra@x.com';
globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({}), text: async () => '' });

const { makeSession } = await import('../api/_lib/auth.js');
const { kvSet, kvGet, kvKeys } = await import('../api/_lib/kv.js');
const W = await import('../api/_lib/petaway.js');
const R = await import('../api/_lib/petrtc.js');
const { default: mascotas } = await import('../api/mascotas.js');

const buy = email => kvSet(`orbit:purchases:${email}`, [{ productId: 'ob-018', orderId: 'o-' + email, date: '2026-10-01T00:00:00Z' }]);
const SDP = 'v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\ns=-\r\n';
let ip = 0;
const llamar = (action, body, { email, method = 'POST', addr } = {}) => new Promise(ok => {
  const res = {
    code: 200, headers: {},
    status(c) { this.code = c; return this; }, setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    json(b) { ok({ code: this.code, body: b }); return this; }, end() { ok({ code: this.code }); return this; },
  };
  const headers = { 'x-forwarded-for': addr || `10.0.0.${++ip % 250}` };
  if (email) headers.cookie = `orbit_session=${makeSession(email)}`;
  mascotas({ method, query: { rtc: action }, body, headers }, res);
});
async function pair(email) {
  await buy(email);
  const { code } = await W.createPairing(email, { petId: 'feliza01', name: 'Living' });
  return W.redeemPairing(code);
}

/* los topes reales se prueban al final; antes, holgados para que no se crucen los tests */
const REAL_LIMITS = { ...R.LIMITS };
Object.assign(R.LIMITS, { offer: 1000, viewer: 1000, cam: 1000 });
const A = await pair('duena@x.com');
const B = await pair('otra@x.com');
const cam = (action, body = {}) => llamar(action, { token: A.token, ...body });
const viewer = (action, body = {}, email = 'duena@x.com') => llamar(action, { camId: A.camId, ...body }, { email });

test('interruptor apagado: 404 en todo', async () => {
  process.env.MIMITOS_MEFUI = '0';
  assert.equal((await cam('poll', { beat: true })).code, 404);
  assert.equal((await viewer('offer', { sdp: SDP })).code, 404);
  process.env.MIMITOS_MEFUI = '1';
});

test('cámara: token malo → 401; GET → 405; acción desconocida → 404', async () => {
  assert.equal((await llamar('poll', { token: 'x'.repeat(43) })).code, 401);
  assert.equal((await llamar('poll', {}, { method: 'GET', email: 'duena@x.com' })).code, 405);
  assert.equal((await llamar('nada', {}, { email: 'duena@x.com' })).code, 404);
});

test('viewer: sin sesión 401, sin compra 402, cámara ajena 403, cámara apagada 409', async () => {
  assert.equal((await llamar('offer', { camId: A.camId, sdp: SDP })).code, 401);
  assert.equal((await viewer('offer', { sdp: SDP }, 'sincompra@x.com')).code, 402);
  assert.equal((await viewer('offer', { sdp: SDP }, 'otra@x.com')).code, 403, 'otra cuenta no puede mirar esta cámara');
  const r = await viewer('offer', { sdp: SDP });
  assert.deepEqual([r.code, r.body.error], [409, 'cam_offline']);
});

test('flujo completo: oferta, respuesta, ICE de los dos lados y nada de otras cuentas', async () => {
  await cam('poll', { beat: true });
  const o = await viewer('offer', { sdp: SDP });
  assert.equal(o.code, 200);
  const sid = o.body.sid;
  assert.match(sid, /^[a-f0-9]{24}$/);
  assert.deepEqual(o.body.iceServers, [{ urls: 'stun:stun.l.google.com:19302' }]);
  assert.equal((await viewer('ice', { sid, cands: [{ candidate: 'candidate:1 1 udp 1 1.2.3.4 5 typ host', sdpMid: '0', sdpMLineIndex: 0 }] })).code, 200);

  /* la cámara ve la oferta y el ICE del viewer */
  const p = await cam('poll');
  assert.equal(p.body.sid, sid);
  assert.equal(p.body.offer, SDP);
  assert.equal(p.body.ice.length, 1);
  assert.equal(JSON.stringify(p.body).includes('duena@x.com'), false, 'el email nunca viaja a la cámara');

  assert.equal((await cam('answer', { sid, sdp: SDP + 'a=x\r\n' })).code, 200);
  await cam('ice', { sid, cands: [{ candidate: 'candidate:2 1 udp 1 5.6.7.8 9 typ srflx', sdpMid: '0', sdpMLineIndex: 0 }, { candidate: '<script>' }] });
  const v = await viewer('poll', { sid });
  assert.equal(v.body.answer, SDP + 'a=x\r\n');
  assert.equal(v.body.ice.length, 1, 'un candidato que no es ICE se descarta');
  const v2 = await viewer('poll', { sid, since: v.body.next });
  assert.equal(v2.body.ice.length, 0, 'since no repite candidatos');

  /* otra cuenta, aunque sepa el sid, no ve nada */
  assert.equal((await llamar('poll', { camId: A.camId, sid }, { email: 'otra@x.com' })).code, 403);
  assert.equal((await llamar('poll', { camId: B.camId, sid }, { email: 'otra@x.com' })).code, 403, 'sid de otra cuenta con su propia cámara');
  /* otra cámara, aunque sepa el sid, tampoco */
  assert.equal((await llamar('answer', { token: B.token, sid, sdp: SDP })).code, 403);
  assert.equal((await llamar('ice', { token: B.token, sid, cands: [] })).code, 403);
  const pB = await llamar('poll', { token: B.token, beat: true });
  assert.equal(pB.body.sid, null, 'la cámara B no ve sesiones de A');

  await viewer('hangup', { sid });
});

test('un viewer por vez: el segundo recibe 409; con takeover el último gana y el otro se entera', async () => {
  await cam('poll', { beat: true });
  const a = await viewer('offer', { sdp: SDP });
  const b = await viewer('offer', { sdp: SDP });
  assert.deepEqual([b.code, b.body.error], [409, 'busy']);
  const c = await viewer('offer', { sdp: SDP, takeover: true });
  assert.equal(c.code, 200);
  const old = await viewer('poll', { sid: a.body.sid });
  assert.deepEqual([old.body.ended, old.body.reason], [true, 'replaced']);
  assert.equal(await kvGet(`orbit:rtc:offer:${a.body.sid}`), null, 'la sesión vieja se limpió');
  assert.equal((await cam('poll', { sid: a.body.sid })).body.sid, c.body.sid, 'la cámara pasa a la sesión nueva');
  await viewer('hangup', { sid: c.body.sid });
});

test('colgar limpia todo y la cámara se entera', async () => {
  await cam('poll', { beat: true });
  const { body: { sid } } = await viewer('offer', { sdp: SDP });
  await viewer('ice', { sid, cands: [{ candidate: 'candidate:1 1 udp 1 1.2.3.4 5 typ host', sdpMid: '0', sdpMLineIndex: 0 }] });
  await cam('poll');
  await cam('answer', { sid, sdp: SDP });
  assert.equal((await viewer('hangup', { sid })).code, 200);
  for (const k of [`orbit:rtc:lock:${A.camId}`, `orbit:rtc:offer:${sid}`, `orbit:rtc:answer:${sid}`, `orbit:rtc:icen:${sid}:v`]) assert.equal(await kvGet(k), null, k);
  const p = await cam('poll', { sid });
  assert.deepEqual([p.body.sid, p.body.ended, p.body.reason], [null, true, 'viewer']);
  /* la cámara también puede colgar */
  const s2 = (await viewer('offer', { sdp: SDP })).body.sid;
  await cam('poll');
  assert.equal((await cam('hangup', { sid: s2 })).code, 200);
  const v = await viewer('poll', { sid: s2 });
  assert.deepEqual([v.body.ended, v.body.reason], [true, 'camera']);
});

test('TTL: la cámara deja de figurar a los 30 s; la sesión y el candado vencen solos', async () => {
  const real = Date.now;
  try {
    await cam('poll', { beat: true });
    const { body: { sid } } = await viewer('offer', { sdp: SDP });
    let t = real();
    Date.now = () => t;
    t += (R.TTL.lock + 1) * 1000;
    assert.equal(await kvGet(`orbit:rtc:lock:${A.camId}`), null, 'el candado vence si el viewer deja de preguntar');
    assert.equal(await kvGet(`orbit:rtc:up:${A.camId}`), null, 'la cámara apagada deja de figurar');
    assert.equal((await viewer('offer', { sdp: SDP })).body.error, 'cam_offline');
    t += (R.TTL.sess + 1) * 1000;
    assert.equal(await kvGet(`orbit:rtc:offer:${sid}`), null, 'el SDP no queda guardado');
    const left = (await kvKeys('orbit:rtc:*')).filter(k => !/:stat|:rl:|statmark|:end:/.test(k));
    const alive = (await Promise.all(left.map(kvGet))).filter(v => v != null);
    assert.equal(alive.length, 0, 'nada de la señalización sobrevive al TTL');
  } finally { Date.now = real; }
  /* con el reloj de vuelta, lo que se creó antes "revive": se cuelga para no ensuciar los otros tests */
  const lock = await kvGet(`orbit:rtc:lock:${A.camId}`);
  if (lock) await viewer('hangup', { sid: lock.sid });
});

test('tasa de conexión: un ok y un fail por sesión, una sola vez cada uno', async () => {
  const before = await R.rtcStats();
  await cam('poll', { beat: true });
  const s1 = (await viewer('offer', { sdp: SDP })).body.sid;
  await viewer('poll', { sid: s1, connected: true });
  await viewer('poll', { sid: s1, connected: true });
  await viewer('hangup', { sid: s1 });
  const s2 = (await viewer('offer', { sdp: SDP })).body.sid;
  await viewer('hangup', { sid: s2, reason: 'timeout' });
  await viewer('hangup', { sid: s2, reason: 'timeout' });
  const after = await R.rtcStats();
  assert.deepEqual([after.ok - before.ok, after.fail - before.fail], [1, 1]);
});

test('validación: SDP que no es SDP, sid mal formado y camId raro → 400', async () => {
  await cam('poll', { beat: true });
  assert.equal((await viewer('offer', { sdp: '<html>' })).code, 400);
  assert.equal((await viewer('offer', { sdp: 'v=0' + 'x'.repeat(20000) })).code, 400);
  assert.equal((await viewer('poll', { sid: '../../x' })).code, 400);
  assert.equal((await llamar('poll', { camId: 'orbit:*', sid: 'a'.repeat(24) }, { email: 'duena@x.com' })).code, 400);
});

test('topes: muchas ofertas por minuto → 429; tokens malos desde una IP → 429', async () => {
  Object.assign(R.LIMITS, REAL_LIMITS);
  await cam('poll', { beat: true });
  let last;
  for (let i = 0; i < R.LIMITS.offer + 2; i++) {
    last = await viewer('offer', { sdp: SDP, takeover: true });
  }
  assert.equal(last.code, 429);
  let bad;
  for (let i = 0; i < R.LIMITS.badToken + 2; i++) bad = await llamar('poll', { token: 'y'.repeat(43) }, { addr: '9.9.9.9' });
  assert.equal(bad.code, 429);
});

test('revocar la cámara corta su acceso (pasado el recuerdo de 60 s)', async () => {
  const C = await pair('duena@x.com');
  assert.equal((await llamar('poll', { token: C.token, beat: true })).code, 200);
  await W.revokeCamera('duena@x.com', C.camId);
  R._clearCamCache();
  assert.equal((await llamar('poll', { token: C.token })).code, 401);
  assert.equal((await llamar('offer', { camId: C.camId, sdp: SDP }, { email: 'duena@x.com' })).code, 403);
});
