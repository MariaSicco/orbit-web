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

test('estudios: no se puede leer con IA un archivo de otra cuenta', async () => {
  const r = await call('POST', { studyscan: '1' }, { ref: 'blob:mascotas/ffffffffffffffff/x-ajeno.pdf' });
  assert.equal(r.code, 403);
  const r2 = await call('POST', { studyscan: '1' }, { ref: 'https://evil.example/x.pdf' });
  assert.equal(r2.code, 403);
});

test('estudios: el resumen y el laboratorio se guardan en el estudio (sin modelo aparte)', async () => {
  const cur = await call('GET', {}, null);
  const pets = cur.body.doc.pets.map(p => p.id === 'toto0001' ? { ...p, studies: [{ id: 'st000001', date: '2026-09-01', kind: 'eco', title: 'Ecografía abdominal', lab: 'Diagnovet', notes: 'Conclusión: sin alteraciones.', files: [] }] } : p);
  const r = await call('POST', {}, { doc: { pets }, rev: cur.body.doc.rev });
  assert.equal(r.code, 200);
  const st = r.body.doc.pets.find(p => p.id === 'toto0001').studies[0];
  assert.equal(st.lab, 'Diagnovet'); assert.equal(st.kind, 'eco');
});
