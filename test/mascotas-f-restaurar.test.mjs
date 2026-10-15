/* F2 Restaurar una copia (interruptor FEATURES.restaurar): solo el JSON de Exportar, doble confirmación y deshacer */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const src = readFileSync(new URL('../assets/js/mascotas-f-restaurar.js', import.meta.url), 'utf8');
const app = readFileSync(new URL('../assets/js/mascotas-app.js', import.meta.url), 'utf8');
function load(on) {
  const toasts = [], F = { on: { restaurar: on }, routes: {}, actions: {}, hooks: {} };
  const A = { doc: { pets: [{ id: 'x', name: 'Vieja' }] }, curId: 'x', changed: () => {}, go: () => {}, dPanel: { close() {} }, panel: () => {}, toast: (t, a) => toasts.push([t, a]), bubble: () => '', norm: p => ({ ...p, normed: true }) };
  const window = { MZAPP: A, MZFEAT: F, MZ: { esc: s => String(s), fmt: s => s, icon: () => '' } };
  runInNewContext(src, { window, document: {} });
  return { F, A, toasts, R: window.MZRESTORE };
}

test('apagada no engancha nada y Cuenta sigue igual', () => {
  const { F } = load(false); assert.deepEqual(F.hooks, {}); assert.deepEqual(F.actions, {});
});

test('solo acepta el formato de "Exportar copia"', () => {
  const { R } = load(true);
  const exp = app.match(/const data = (\{ app: 'mimitos-by-orbit'[^;]*\});/); assert.ok(exp, 'Exportar sigue con app: mimitos-by-orbit');
  assert.equal(R.valid({ app: 'mimitos-by-orbit', version: 2, pets: [{ name: 'Aika' }] }), true);
  for (const bad of [null, {}, { app: 'otra', pets: [] }, { app: 'mimitos-by-orbit', pets: 'x' }, { app: 'mimitos-by-orbit', pets: [{}] }]) assert.equal(R.valid(bad), false);
  assert.equal(R.count({ pets: [{ records: [1, 2], weights: [1] }, { meds: [1] }] }), 4);
});

test('reemplaza todo normalizado y se puede deshacer; la confirmación es doble', () => {
  const { A, toasts, R, F } = load(true);
  assert.match(F.hooks.cuentaAjustes[0](), /data-act="restore"/);
  assert.match(src, /dataset\.step === '1'/); assert.match(src, /Sí, reemplazar todo con la copia/);
  R.apply({ app: 'mimitos-by-orbit', pets: [{ id: 'a', name: 'Aika' }, { id: 'b', name: 'Toto' }] });
  assert.deepEqual(A.doc.pets.map(p => [p.name, p.normed]), [['Aika', true], ['Toto', true]]); assert.equal(A.curId, 'a');
  toasts.at(-1)[1].fn(); assert.deepEqual(A.doc.pets.map(p => p.name), ['Vieja']); assert.equal(A.curId, 'x');
});
