/* Mimitos · agregar una segunda mascota (con color y foto recortada) pasa por el servidor real.
   Correr con: node --test test/mascotas-alta.test.mjs  (sin KV usa memoria) */
import { test } from 'node:test';
import assert from 'node:assert/strict';
process.env.SESSION_SECRET = 'prueba-secreta-de-mimitos-1234567890';
const { kvSet } = await import('../api/_lib/kv.js');
const { makeSession } = await import('../api/_lib/auth.js');
const { default: mascotas } = await import('../api/mascotas.js');
const EMAIL = 'alta@ejemplo.com', cookie = `orbit_session=${makeSession(EMAIL)}`;
const call = (method, query, body) => new Promise(ok => {
  const res = { code: 200, setHeader() {}, status(c) { this.code = c; return this; }, json(o) { ok({ code: this.code, body: o }); }, end() { ok({ code: this.code }); }, redirect() { ok({ code: 302 }); } };
  mascotas({ method, query, body, headers: { cookie } }, res);
});
const pet = (id, name, extra = {}) => ({ id, name, species: 'perro', records: [], ...extra });

test('alta: con una mascota cargada se puede agregar la segunda, con color y foto recortada', async () => {
  await kvSet(`orbit:purchases:${EMAIL}`, [{ productId: 'ob-018', date: '2026-10-12' }]);
  const first = await call('POST', {}, { doc: { pets: [pet('feliza01', 'Feliza', { hue: 'azul' })] }, rev: 0 });
  assert.equal(first.code, 200);
  /* foto recortada de ~400 KB (entra en el tope de 450 KB) y la original */
  const big = 'data:image/png;base64,' + 'A'.repeat(400 * 1024 - 40);
  const cut = await call('POST', { photo: '1' }, { data: big });
  assert.equal(cut.code, 200, JSON.stringify(cut.body));
  const full = await call('POST', { photo: '1' }, { data: 'data:image/jpeg;base64,' + 'B'.repeat(1000) });
  const second = await call('POST', {}, { doc: { pets: [...first.body.doc.pets, pet('toto0001', 'Toto', { hue: 'lila', photo: cut.body.u, photoFull: full.body.u })] }, rev: first.body.doc.rev });
  assert.equal(second.code, 200, JSON.stringify(second.body));
  assert.deepEqual(second.body.doc.pets.map(p => p.name), ['Feliza', 'Toto']);
  assert.equal(second.body.doc.pets[1].hue, 'lila');
  assert.equal(second.body.doc.pets[1].photoFull, full.body.u);
  /* un color que no existe no rompe: queda el predeterminado */
  const third = await call('POST', {}, { doc: { pets: [...second.body.doc.pets, pet('michi001', 'Michi', { hue: 'fucsia' })] }, rev: second.body.doc.rev });
  assert.equal(third.body.doc.pets[2].hue, '');
});

test('alta: la foto demasiado pesada se rechaza con un error claro', async () => {
  const r = await call('POST', { photo: '1' }, { data: 'data:image/png;base64,' + 'A'.repeat(460 * 1024) });
  assert.equal(r.code, 413); assert.equal(r.body.error, 'too_big');
});
