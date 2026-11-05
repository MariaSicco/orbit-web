/* F1 Salud (interruptor FEATURES.salud): reemplaza a Antecedentes, problemas con 3 estados a un toque y deshacer */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const src = readFileSync(new URL('../assets/js/mascotas-f-salud.js', import.meta.url), 'utf8');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function load(on) {
  const toasts = [], F = { on: { salud: on }, routes: {}, actions: {}, hooks: {} };
  const pet = { id: 'a', name: 'Aika', species: 'perro', conditions: [{ id: 'c1', name: 'Otitis', status: 'activa' }], meds: [], log: [], surgeries: [], allergies: '', chronic: '', neutered: '' };
  const A = { changed: () => {}, toast: (t, a) => toasts.push([t, a]), uid: () => 'n' + toasts.length, drop: (arr, x) => () => arr.splice(arr.indexOf(x), 1), backTo: () => '', bubble: () => '', medRow: () => '', medForm: () => {} };
  const window = { MZAPP: A, MZFEAT: F, MZ: { esc, fmt: s => s, icon: n => `<i ${n}>`, CONDITIONS: { perro: ['Otitis', 'Sobrepeso'], otra: [] }, medState: () => ({ state: 'ok' }) } };
  runInNewContext(src, { window, document: {} });
  return { F, pet, toasts };
}

test('apagada no engancha nada', () => {
  const { F } = load(false);
  assert.deepEqual(Object.keys(F.routes), []); assert.deepEqual(Object.keys(F.actions), []);
});

test('prendida: Salud reemplaza a Antecedentes, con los frecuentes que faltan y los 3 estados', () => {
  const { F, pet } = load(true);
  assert.equal(F.routes.salud, F.routes.antecedentes);
  assert.equal(F.hooks.antecedentesLabel[0](), 'Salud');
  const h = F.routes.salud(pet);
  assert.match(h, /data-act="condSet" data-id="c1" data-st="activa" aria-pressed="true">Lo tiene/);
  assert.match(h, /data-st="controlada" aria-pressed="false">Controlado/); assert.match(h, /Ya pasó/);
  assert.match(h, /data-act="condAdd" data-n="Sobrepeso"/); assert.doesNotMatch(h, /data-n="Otitis"/, 'el que ya está no se repite');
  assert.match(h, /no diagnostica/);
});

test('un toque cambia el estado (con deshacer) y otro suma un frecuente como "Lo tiene"', () => {
  const { F, pet, toasts } = load(true);
  F.actions.condSet({ dataset: { id: 'c1', st: 'resuelta' } }, pet, pet);
  assert.equal(pet.conditions[0].status, 'resuelta'); toasts.at(-1)[1].fn(); assert.equal(pet.conditions[0].status, 'activa');
  F.actions.condAdd({ dataset: { n: 'Sobrepeso' } }, pet, pet);
  assert.equal(pet.conditions.at(-1).name, 'Sobrepeso'); assert.equal(pet.conditions.at(-1).status, 'activa');
  toasts.at(-1)[1].fn(); assert.equal(pet.conditions.length, 1);
});
