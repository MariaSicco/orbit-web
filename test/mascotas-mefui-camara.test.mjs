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
