/* F5 Para el vete (interruptor FEATURES.vete): hoja de una página a partir de lo cargado */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const src = readFileSync(new URL('../assets/js/mascotas-f-vete.js', import.meta.url), 'utf8');
const core = readFileSync(new URL('../assets/js/mascotas-core.js', import.meta.url), 'utf8');
const rules = readFileSync(new URL('../assets/js/mascotas-rules.js', import.meta.url), 'utf8');
function load(on) {
  const window = {};
  runInNewContext(rules + '\n' + core, { window, Intl, Date, Math, console });
  const F = { on: { vete: on }, routes: {}, actions: {}, hooks: {} };
  window.MZAPP = { dd: s => s, kg: n => n + ' kg', avatar: () => '', backTo: () => '', toast: () => {} };
  window.MZFEAT = F;
  runInNewContext(src, { window, document: {}, navigator: {} });
  return { F, Z: window.MZ };
}
const D = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

test('apagada no engancha nada', () => { const { F } = load(false); assert.deepEqual(F.routes, {}); assert.deepEqual(F.hooks, {}); });

test('prendida: botón en la Libreta y acceso en Inicio', () => {
  const { F } = load(true);
  assert.match(F.hooks.libretaTools[0](), /data-to="vete"/); assert.equal(F.hooks.inicioQuick[0]()[0][3], 'Para el vete');
});

test('la hoja trae vacunas (con la vencida marcada), antiparasitarios, peso, remedios, problemas, alergias y el aviso', () => {
  const { F } = load(true);
  const p = { id: 'a', name: 'Aika', species: 'perro', sex: 'h', breed: 'Mestiza', birth: '2021-03-10', allergies: 'Penicilina', chronic: '', neutered: 'si', chip: '',
    records: [{ id: 'r1', type: 'vacuna', name: 'Séxtuple', date: D(-380), next: D(-15) }, { id: 'r2', type: 'desparasitacion', name: 'Pipeta', scope: 'externa', date: D(-35), next: D(25) }],
    weights: [{ date: D(-90), kg: 8.7 }, { date: D(-10), kg: 9 }], meds: [], log: [], conditions: [{ id: 'c', name: 'Otitis', status: 'controlada', since: '2026-01' }], symptoms: [] };
  const h = F.routes.vete(p);
  for (const s of ['Séxtuple', 'vencida', 'Externo', 'Pipeta', '9 kg', 'Otitis', 'Controlado', 'Alergias:', 'Penicilina', 'castrada', 'desde ene 2026', 'no reemplaza al veterinario']) assert.ok(h.includes(s), s);
  assert.ok(!h.includes('castrado/a') && !h.includes('2026-01'), 'sexo y fecha formateados');
  assert.match(h, /Interno<\/b><span>Sin dato/);
});
