/* Mimitos premium (3/3): Salud con chips, Restaurar copia, Esta semana, alta en 4 pasos con avisos, Para el vete y Completá a…
   Correr con: node --test test/mimitos-premium-funciones.test.mjs */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const js = readFileSync(new URL('../assets/js/mascotas-app.js', import.meta.url), 'utf8');
const fn = name => { const i = js.indexOf(`function ${name}(`); assert.ok(i > 0, name); return js.slice(i, js.indexOf('\n}\n', i)); };

test('F1: Salud reemplaza a Antecedentes; cada problema con Lo tiene / Controlado / Ya pasó y los frecuentes a un toque', () => {
  assert.match(js, /case 'antecedentes': case 'salud': return renderSalud\(p\);/);
  assert.doesNotMatch(js, /function renderAntecedentes\(/);
  const s = fn('renderSalud');
  for (const x of ['data-act="condSet"', 'data-act="condAdd"', 'Alergias', 'Remedios en curso', 'Cirugías']) assert.ok(s.includes(x), x);
  assert.match(js, /COND_ST = \[\['activa', 'Lo tiene'\], \['controlada', 'Controlado'\], \['resuelta', 'Ya pasó'\]\]/);
  assert.match(fn('condSet'), /Deshacer/); assert.match(fn('condAdd'), /status: 'activa'/);
});

test('F2: Restaurar una copia: solo el JSON de Exportar, vista previa y doble confirmación, con deshacer', () => {
  assert.match(fn('restorePick'), /d\.app === 'mimitos-by-orbit' && Array\.isArray\(d\.pets\)/);
  const r = fn('restorePreview');
  assert.match(r, /Reemplazar todo/); assert.match(r, /dataset\.step === '1'/); assert.match(r, /Sí, reemplazar todo/);
  assert.match(r, /\.map\(x => norm\(/, 'normaliza lo que entra'); assert.match(r, /Deshacer/);
  assert.match(fn('exportCopy'), /app: 'mimitos-by-orbit'/, 'mismo formato que Exportar');
});

test('F4: alta en 4 pasos, color automático y los avisos (con la guía de iPhone) como último paso', () => {
  assert.match(js, /const OB_STEPS = 4;/);
  const o = fn('renderOnboard');
  assert.doesNotMatch(o, /swatches\(/, 'el color se asigna solo'); assert.match(js, /hue: freeHue\(\)/);
  assert.doesNotMatch(o, /ob_breed|tiles\('neutered'/, 'raza y castración, después');
  assert.ok(o.indexOf('scanbox main') < o.indexOf('ob_vname'), 'la foto de la libreta primero');
  assert.match(o, /¿Te avisamos antes de cada fecha\?/); assert.match(o, /Agregar a inicio/); assert.match(o, /data-ob="push"/);
  assert.match(js, /if \(a === 'push'\) return enablePush\(\);/);
});

test('F5: Para el vete arma una hoja con vacunas, antiparasitarios, peso, remedios, problemas y Algo pasó de 30 días', () => {
  const v = fn('renderVete');
  for (const x of ['Vacunas', 'Antiparasitarios', 'Peso', 'Remedios', 'Problemas de salud', 'recentEpisodes(p, 30)', 'no reemplaza al veterinario']) assert.ok(v.includes(x), x);
  assert.match(js, /case 'vete': return renderVete\(p\);/);
});

test('F12: "Completá a…" con foto, salud y veterinaria, y se puede esconder', () => {
  const c = fn('completeCard');
  assert.match(c, /'foto', 'Foto'/); assert.match(c, /'salud', 'Salud'/); assert.match(c, /'vete', 'Veterinaria'/);
  assert.match(js, /case 'compHide'/);
  assert.match(fn('renderInicio'), /completeCard\(p\)/);
});
