/* Avisos nativos de la app de iPhone (api/_lib/apns.js) y su suma al envío de siempre */
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { apnsSend, apnsPayload, cleanApnsToken, cleanApnsList, apnsJwt } from '../api/_lib/apns.js';
import { shapeNotify, notifyActive, pushDevices } from '../api/_lib/petpush.js';

const TOKEN = 'a'.repeat(64);
const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
process.env.APNS_KEY = privateKey.export({ type: 'pkcs8', format: 'pem' }).replace(/\n/g, '\\n');
process.env.APNS_KEY_ID = 'ABC123DEFG';

test('token: solo hexadecimal de 64 a 200', () => {
  assert.equal(cleanApnsToken(TOKEN.toUpperCase()), TOKEN);
  assert.equal(cleanApnsToken('xyz'), null);
  assert.equal(cleanApnsToken('a'.repeat(63)), null);
  assert.deepEqual(cleanApnsList([{ token: TOKEN, env: 'raro' }, { token: 'mal' }]).map(x => [x.token, x.env]), [[TOKEN, null]]);
});

test('JWT firmado con la clave .p8 y verificable', () => {
  const [h, c, s] = apnsJwt(Date.now() + 99 * 60e3).split('.');
  assert.equal(JSON.parse(Buffer.from(h, 'base64url')).kid, 'ABC123DEFG');
  assert.equal(JSON.parse(Buffer.from(c, 'base64url')).iss, 'LL5M8XA2QY');
  assert.ok(crypto.verify('sha256', Buffer.from(`${h}.${c}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url')));
});

test('payload: el mismo aviso que el web push, con la url para abrir', () => {
  const p = JSON.parse(apnsPayload({ title: 'Ladró Aika', body: 'Hace 1 minuto', url: '/mascotas#/mefui', tag: 'cam-ladrido' }));
  assert.equal(p.aps.alert.title, 'Ladró Aika');
  assert.equal(p.url, '/mascotas#/mefui');
});

test('sin ambiente conocido prueba producción y, si el token es de prueba, sandbox', async () => {
  const calls = [];
  const post = async env => { calls.push(env); return env === 'production' ? { status: 400, reason: 'BadDeviceToken' } : { status: 200 }; };
  assert.deepEqual(await apnsSend({ token: TOKEN, env: null }, { title: 'x' }, { post }), { ok: true, env: 'development' });
  assert.deepEqual(calls, ['production', 'development']);
});

test('token dado de baja: se borra', async () => {
  assert.deepEqual(await apnsSend({ token: TOKEN, env: 'production' }, { title: 'x' }, { post: async () => ({ status: 410, reason: 'Unregistered' }) }), { gone: true });
});

test('un iPhone con la app cuenta como aparato con avisos', () => {
  const n = shapeNotify('a@b.com', { apns: [{ token: TOKEN }] });
  assert.equal(pushDevices(n), 1);
  assert.ok(notifyActive(n));
});
