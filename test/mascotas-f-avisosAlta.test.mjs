/* F4 Avisos como último paso del alta (interruptor FEATURES.avisosAlta) */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const src = readFileSync(new URL('../assets/js/mascotas-f-avisosAlta.js', import.meta.url), 'utf8');
function load(on, env = {}) {
  const went = [], F = { on: { avisosAlta: on }, routes: {}, actions: {}, hooks: {}, bare: ['alta'] };
  const pet = { id: 'l', name: 'Luna' };
  const A = { notify: null, pushHere: false, isIOS: false, standalone: () => false, pushSupported: () => true, me: { email: 'x@y.com' }, petById: () => pet, curPet: () => pet, go: r => went.push(r), toast: () => {}, bubble: () => '', enablePush: () => went.push('push'), notifyPost: async () => {}, ...env };
  const window = { MZAPP: A, MZFEAT: F, MZ: { esc: s => String(s), fmt: () => '14 nov', icon: () => '' } };
  runInNewContext(src, { window, document: { querySelector: () => null } });
  return { F, went, pet };
}

test('apagada no engancha nada: el alta termina como siempre', () => {
  const { F } = load(false); assert.deepEqual(F.hooks, {}); assert.deepEqual(F.bare, ['alta']);
});

test('con los avisos apagados, el alta termina en "¿Te avisamos antes de cada fecha?"; con avisos ya activos, no', () => {
  const { F, went, pet } = load(true);
  assert.ok(F.bare.includes('alta-avisos'));
  assert.equal(F.hooks.afterOnboard[0](pet, null, false), false);
  assert.equal(F.hooks.afterOnboard[0](pet, { r: { name: 'Antirrábica', next: '2026-11-14' } }, true), true);
  assert.deepEqual(went, ['alta-avisos']);
  const h = F.routes['alta-avisos']();
  assert.match(h, /¿Te avisamos antes de cada fecha\?/); assert.match(h, /data-act="aaPush"/); assert.match(h, /Antirrábica/);
  F.actions.aaPush(); assert.equal(went.at(-1), 'push');
});

test('en iPhone sin instalar muestra los 3 pasos de "Agregar a inicio" y ofrece el mail tildado', () => {
  const { F } = load(true, { isIOS: true });
  const h = F.routes['alta-avisos']();
  assert.match(h, /Agregar a inicio/); assert.doesNotMatch(h, /data-act="aaPush"/); assert.match(h, /id="aaMail" checked/);
});
