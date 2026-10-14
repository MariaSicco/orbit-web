/* Mimitos · Modo Me fui · detección de sonidos: mapeo de clases de AudioSet a nuestros 5 tipos,
   umbrales por sensibilidad y agrupación de episodios (ventana de ~10 s sin sonido).
   El modelo y el micrófono se prueban aparte en Chrome headless con audios inyectados como micrófono.
   Correr con: node --test test/mascotas-audio.test.mjs */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';

const A = await import('../assets/js/mascotas-audio.js');
const { mapScores, detect, createEpisodeTracker, SENS, TYPES, LABELS, GAP_MS, rms, isSupported } = A;

const top = (m) => Object.entries(m).sort((a, b) => b[1] - a[1])[0][0];

test('carga en Node sin window ni AudioWorklet y no se rompe', () => {
  assert.equal(isSupported(), false);
  assert.deepEqual(TYPES, ['ladrido', 'aullido', 'maullido', 'gemido', 'llanto']);
  assert.equal(GAP_MS, 10000);
});

test('no usa URL ni DOM al cargar (el mismo archivo corre como módulo del AudioWorklet)', () => {
  const src = readFileSync(new URL('../assets/js/mascotas-audio.js', import.meta.url), 'utf8');
  const topLevel = src.split('\n').filter((l) => /^(const|let|var) /.test(l) && !l.includes('=>'));
  for (const l of topLevel) assert.doesNotMatch(l, /new URL\(|document\.|window\./, l);
  assert.match(src, /registerProcessor\('mz-audio-tap'/);
});

test('el audio no sale del navegador: el módulo no hace fetch ni sube nada', () => {
  const src = readFileSync(new URL('../assets/js/mascotas-audio.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|MediaRecorder/);
});

test('el modelo está en el repo, con su aviso de licencia', () => {
  const m = statSync(new URL('../assets/models/audio/yamnet.tflite', import.meta.url));
  assert.equal(m.size, 4126810);
  const n = readFileSync(new URL('../assets/models/audio/NOTICE.txt', import.meta.url), 'utf8');
  assert.match(n, /Apache-2\.0/);
});

test('todas las clases que se miran existen con el nombre exacto de YAMNet', () => {
  const buf = readFileSync(new URL('../assets/models/audio/yamnet.tflite', import.meta.url));
  for (const l of LABELS) assert.ok(buf.includes(Buffer.from(l + '\n')) || buf.includes(Buffer.from('\n' + l)), l);
});

test('mapeo: ladrido', () => {
  const m = mapScores({ Dog: 0.97, Bark: 0.92, 'Bow-wow': 0.33, Animal: 0.99, 'Domestic animals, pets': 0.98 });
  assert.equal(top(m), 'ladrido');
  assert.equal(m.ladrido, 0.92);
  // Yip, Bow-wow y Growling también son ladrido
  assert.equal(mapScores({ Yip: 0.6 }).ladrido, 0.6);
  assert.equal(mapScores({ Growling: 0.5 }).ladrido, 0.5);
  // "Dog" solo, sin otra pista, cuenta como ladrido atenuado
  assert.ok(Math.abs(mapScores({ Dog: 0.6 }).ladrido - 0.42) < 1e-9);
});

test('mapeo: aullido', () => {
  const m = mapScores({ Dog: 0.94, Howl: 0.74, Bark: 0.5 });
  assert.equal(m.aullido, 0.74);
  // "Wail, moan" solo cuenta como aullido si hay contexto de perro
  assert.equal(mapScores({ 'Wail, moan': 0.6 }).aullido, 0);
  assert.ok(mapScores({ 'Wail, moan': 0.6, Dog: 0.3 }).aullido > 0.4);
});

test('mapeo: maullido, y el ronroneo no es alerta', () => {
  assert.equal(top(mapScores({ Cat: 0.97, Meow: 0.74, Caterwaul: 0.26 })), 'maullido');
  assert.equal(mapScores({ Caterwaul: 0.5 }).maullido, 0.5);
  assert.equal(mapScores({ Purr: 0.9 }).maullido, 0);
});

test('mapeo: el siseo de una aspiradora no es un gato (Hiss solo con contexto de gato)', () => {
  assert.equal(mapScores({ Hiss: 0.5, Speech: 0.11 }).maullido, 0);
  assert.ok(mapScores({ Hiss: 0.5, Cat: 0.3 }).maullido >= 0.4);
});

test('mapeo: gemido', () => {
  assert.equal(mapScores({ 'Whimper (dog)': 0.2, Dog: 0.6 }).gemido, 0.2);
  // "Whimper" genérico (puede ser una persona) solo con contexto de mascota
  assert.equal(mapScores({ Whimper: 0.4 }).gemido, 0);
  assert.equal(mapScores({ Whimper: 0.4, Dog: 0.2 }).gemido, 0.4);
  // si hay gemido, el "Dog" genérico no se cuenta además como ladrido
  assert.equal(mapScores({ 'Whimper (dog)': 0.2, Dog: 0.6 }).ladrido, 0);
});

test('mapeo: llanto con contexto de animal vale entero; sin contexto (TV, bebé) vale la mitad', () => {
  assert.equal(mapScores({ 'Crying, sobbing': 0.8, Cat: 0.5 }).llanto, 0.8);
  assert.equal(mapScores({ 'Baby cry, infant cry': 0.8 }).llanto, 0.4);
});

test('mapeo: voces, música, TV, timbre y silencio no dan nada', () => {
  for (const s of [{ Speech: 0.98, Music: 0.94 }, { Television: 0.6, Speech: 0.5 }, {}, { Music: 0.15 }]) {
    const m = mapScores(s);
    for (const t of TYPES) assert.equal(m[t], 0, JSON.stringify(s) + ' ' + t);
  }
});

test('umbrales: alta detecta más que media y media más que baja', () => {
  for (const t of TYPES) {
    assert.ok(SENS.alta.th[t] < SENS.media.th[t] && SENS.media.th[t] < SENS.baja.th[t], t);
  }
  assert.ok(SENS.baja.minHits >= SENS.media.minHits);
  const m = { ladrido: 0.3, aullido: 0, maullido: 0, gemido: 0, llanto: 0 };
  assert.deepEqual(detect(m, 'alta').map((d) => d.type), ['ladrido']);
  assert.deepEqual(detect(m, 'media').map((d) => d.type), ['ladrido']);
  assert.deepEqual(detect(m, 'baja'), []);
  assert.deepEqual(detect(m, 'cualquiera').map((d) => d.type), ['ladrido'], 'sensibilidad desconocida = media');
});

test('rms', () => {
  assert.equal(rms(new Float32Array(10)), 0);
  assert.ok(Math.abs(rms(Float32Array.from([1, -1, 1, -1])) - 1) < 1e-9);
});

/* ---------- Episodios ---------- */
const S = 1000;
function run(hits, opts = {}) {
  const out = [];
  const tr = createEpisodeTracker({ onEvent: (e) => out.push(e), ...opts });
  return { out, tr };
}

test('episodio: ladridos seguidos con pausas cortas son un solo episodio', () => {
  const { out, tr } = run();
  const t0 = 1_700_000_000_000;
  for (const s of [0, 1, 2, 5, 9, 14]) { tr.add('ladrido', 0.5 + s / 100, t0 + s * S - 975, t0 + s * S); tr.tick(t0 + s * S); }
  assert.equal(out.length, 0, 'todavía abierto');
  tr.tick(t0 + 23 * S);
  assert.equal(out.length, 0, '9 s sin sonido: sigue abierto');
  tr.tick(t0 + 24 * S);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0], { type: 'ladrido', start: t0 - 975, end: t0 + 14 * S, durationSec: 15, confidence: 0.64, hits: 6 });
});

test('episodio: más de 10 s de silencio abre un episodio nuevo', () => {
  const { out, tr } = run();
  tr.add('ladrido', 0.8, 0, 1 * S);
  tr.tick(5 * S);
  tr.add('ladrido', 0.7, 12 * S, 13 * S); // 11 s después del final del anterior
  assert.equal(out.length, 1, 'el primero se cerró al llegar el nuevo');
  tr.flush();
  assert.equal(out.length, 2);
  assert.equal(out[0].end, 1 * S);
  assert.equal(out[1].start, 12 * S);
});

test('episodio: cada tipo lleva su propio episodio', () => {
  const { out, tr } = run();
  tr.add('ladrido', 0.9, 0, 1 * S);
  tr.add('aullido', 0.6, 0, 1 * S);
  tr.add('ladrido', 0.9, 2 * S, 3 * S);
  tr.tick(14 * S);
  assert.deepEqual(out.map((e) => e.type).sort(), ['aullido', 'ladrido']);
  assert.equal(out.find((e) => e.type === 'ladrido').hits, 2);
});

test('episodio: con minHits, un fragmento suelto se descarta (sensibilidad baja)', () => {
  const { out, tr } = run(null, { minHits: 2 });
  tr.add('maullido', 0.9, 0, 1 * S);
  tr.tick(20 * S);
  assert.equal(out.length, 0);
  tr.add('maullido', 0.6, 30 * S, 31 * S);
  tr.add('maullido', 0.7, 32 * S, 33 * S);
  tr.flush();
  assert.equal(out.length, 1);
  assert.equal(out[0].hits, 2);
  assert.equal(out[0].confidence, 0.7);
});

test('episodio: flush cierra todo al parar o pausar', () => {
  const out = [];
  const tr = createEpisodeTracker({ onEvent: (e) => out.push(e) });
  tr.add('gemido', 0.2, 0, 1 * S);
  tr.add('llanto', 0.3, 0, 1 * S);
  assert.equal(tr.open, 2);
  tr.flush();
  assert.equal(tr.open, 0);
  assert.equal(out.length, 2);
  for (const e of out) assert.equal(e.durationSec, 1);
});

test('episodio: gap configurable', () => {
  const { out, tr } = run(null, { gapMs: 3000 });
  tr.add('ladrido', 0.5, 0, 1 * S);
  tr.tick(3.5 * S);
  assert.equal(out.length, 0);
  tr.tick(4 * S);
  assert.equal(out.length, 1);
});

/* Ventanas reales: el puntaje de YAMNet en la ventana más fuerte de cada audio de prueba
   (audios CC0 de freesound inyectados como micrófono en Chrome headless, 14/10/2026). */
const REAL = [
  ['ladrido_823094', 'ladrido', {"Animal":0.988,"Domestic animals, pets":0.984,"Dog":0.969,"Bark":0.918,"Bow-wow":0.199,"Canidae, dogs, wolves":0.148,"Yip":0.082,"Growling":0.043,"Whimper (dog)":0.016}],
  ['mezcla_ladrido-sobre-tv', 'ladrido', {"Animal":0.992,"Domestic animals, pets":0.988,"Dog":0.98,"Bark":0.941,"Canidae, dogs, wolves":0.148,"Bow-wow":0.109,"Yip":0.059,"Growling":0.059}],
  ['aullido_115357', 'aullido', {"Animal":0.801,"Dog":0.801,"Domestic animals, pets":0.738,"Howl":0.738,"Canidae, dogs, wolves":0.5,"Yip":0.262,"Bark":0.199,"Bow-wow":0.109,"Growling":0.109,"Whimper (dog)":0.109,"Whimper":0.02,"Crying, sobbing":0.012}],
  ['maullido_455493', 'maullido', {"Domestic animals, pets":0.969,"Cat":0.969,"Animal":0.957,"Meow":0.738,"Caterwaul":0.02}],
  ['maullido_66518', 'maullido', {"Cat":0.891,"Animal":0.801,"Meow":0.738,"Domestic animals, pets":0.668,"Caterwaul":0.5,"Purr":0.059,"Speech":0.016,"Dog":0.012}],
  ['gemido_417144', 'gemido', {"Dog":0.586,"Animal":0.5,"Domestic animals, pets":0.5,"Bark":0.262,"Yip":0.199,"Growling":0.199,"Whimper (dog)":0.199,"Bow-wow":0.148,"Canidae, dogs, wolves":0.148,"Crying, sobbing":0.109,"Whimper":0.082,"Speech":0.059,"Baby cry, infant cry":0.059,"Howl":0.02,"Cat":0.02,"Meow":0.012,"Music":0.012}],
  ['maullido_724090', 'llanto', {"Crying, sobbing":0.801,"Baby cry, infant cry":0.668,"Whimper":0.262,"Speech":0.031,"Wail, moan":0.016,"Animal":0.016,"Domestic animals, pets":0.016,"Cat":0.016}],
  ['aspiradora_159347', null, {"Speech":0.059,"Animal":0.059,"Domestic animals, pets":0.031,"Dog":0.02,"Bark":0.016,"Cat":0.012,"Television":0.012}],
  ['conversacion_411888', null, {"Speech":0.668,"Animal":0.148,"Domestic animals, pets":0.109,"Dog":0.109,"Canidae, dogs, wolves":0.031,"Yip":0.02,"Bow-wow":0.02,"Whimper (dog)":0.02}],
  ['tv_702205', null, {"Speech":0.891}],
  ['timbre_417858', null, {"Animal":0.109,"Domestic animals, pets":0.043,"Dog":0.043,"Speech":0.016,"Whimper (dog)":0.012}],
  ['silencio_565536', null, {"Animal":0.082,"Cat":0.043,"Domestic animals, pets":0.031,"Speech":0.02,"Purr":0.012,"Meow":0.012}],
];

test('ventanas reales: en sensibilidad media cada sonido de mascota da su tipo y lo demás no da nada', () => {
  for (const [name, type, scores] of REAL) {
    const got = detect(mapScores(scores), 'media').map((d) => d.type);
    if (type) assert.ok(got.includes(type), `${name}: esperaba ${type}, dio ${got.join(',') || 'nada'}`);
    else assert.deepEqual(got, [], `${name}: falso positivo ${got.join(',')}`);
  }
});

test('ventanas reales: ni en sensibilidad alta hay falsos positivos con voces, TV, aspiradora, timbre o silencio', () => {
  for (const [name, type, scores] of REAL) if (!type) assert.deepEqual(detect(mapScores(scores), 'alta'), [], name);
});
