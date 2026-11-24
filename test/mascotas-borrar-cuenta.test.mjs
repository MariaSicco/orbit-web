/* Borrar la cuenta desde la app (api/_lib/petreset.js → handleDeleteAccount) */
import test from 'node:test';
import assert from 'node:assert/strict';
import { handleDeleteAccount } from '../api/_lib/petreset.js';

const res = () => { const r = { code: 0, body: null, status(c) { r.code = c; return r; }, json(b) { r.body = b; return r; } }; return r; };

test('sin escribir BORRAR no borra nada', async () => {
  const r = res();
  await handleDeleteAccount({ method: 'POST', headers: {} }, r, { email: 'a@b.com', body: { confirm: 'no' } });
  assert.equal(r.code, 400);
  assert.equal(r.body.word, 'BORRAR');
});

test('solo POST', async () => {
  const r = res();
  await handleDeleteAccount({ method: 'GET', headers: {} }, r, { email: 'a@b.com', body: { confirm: 'BORRAR' } });
  assert.equal(r.code, 405);
});
