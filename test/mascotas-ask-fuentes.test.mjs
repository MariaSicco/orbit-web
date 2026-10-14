/* Mimitos · Preguntale: de dónde sale cada dato (sección + ruta legible) y "Según tu libreta, …".
   Correr con: node --test test/mascotas-ask-fuentes.test.mjs  (sin red: la IA no se llama) */
import { test } from 'node:test';
import assert from 'node:assert/strict';
const A = await import('../api/_lib/petask.js');

const NOW = new Date('2026-10-14T15:00:00Z');
const TZ = 'America/Argentina/Buenos_Aires';
const pet = (id, name, extra = {}) => ({ id, name, species: 'perro', speciesOther: '', breed: '', sex: 'h', birth: '2021-05-02', allergies: '', notes: '', chronic: '', neutered: '',
  vet: { name: 'Veterinaria Panda', er: 'Guardia Sur' }, food: { brand: 'Croqueta Uno', bagKg: 15, dailyG: 300, opened: '2026-10-01' }, ...extra });
const AIKA = pet('aika0001', 'Aika', {
  records: [
    { id: 'pip', type: 'desparasitacion', scope: 'externa', name: 'Pipeta antipulgas', date: '2026-09-14', next: '2026-10-14' },
    { id: 'int', type: 'desparasitacion', scope: 'interna', name: 'Comprimido', date: '2026-06-01', next: '' },
    { id: 'rab', type: 'vacuna', name: 'Antirrábica', date: '2025-11-02', next: '2026-11-02' },
    { id: 'ctl', type: 'control', name: 'Control anual', date: '2026-03-03', next: '' },
  ],
  visits: [{ id: 'vi1', date: '2026-10-02', reason: 'Vómitos', vet: 'Veterinaria Panda', findings: '', plan: '' }],
  studies: [{ id: 'st1', date: '2026-10-03', kind: 'sangre', title: 'Hemograma', lab: '', notes: '' }],
  symptoms: [{ id: 'sy1', date: '2026-10-01', text: 'Vomitó dos veces' }],
  meds: [{ id: 'md1', name: 'Omeprazol', dose: '1/2', every: 24, start: '2026-10-02T12:00:00Z', days: 7 }],
  weights: [{ date: '2026-08-12', kg: 9 }],
  expenses: [{ id: 'ex1', date: '2026-10-09', cat: 'alimento', amount: 40000, note: '' }],
  conditions: [{ id: 'co1', name: 'Otitis', status: 'activa', since: '', notes: '' }],
  surgeries: [{ id: 'su1', name: 'Castración', date: '2024-02-10', notes: '' }],
  log: [{ id: 'lg1', at: '2026-10-13T22:10:00-03:00', by: 'Sofi', kind: 'comida', note: '' }, { id: 'lg0', at: '2026-10-14T09:05:00-03:00', by: 'Vos', kind: 'nota' }],
});
const DOC = { pets: [AIKA], appointments: [{ id: 'ap1', petId: 'aika0001', date: '2026-10-20', time: '18:30', place: { name: 'Veterinaria Panda' }, reason: 'Control' }] };

const byItem = (c, itemId, section) => Object.values(c.refs).find(r => r.itemId === itemId && (!section || r.section === section));

test('fuentes: cada tipo de registro trae su sección y su ruta legible', () => {
  const c = A.buildContext(DOC, { question: 'todo', petId: 'aika0001', tz: TZ, now: NOW });
  const want = [
    ['pip', 'rec', 'Libreta', 'Libreta → Desparasitación externa · 14/09'],
    ['int', 'rec', 'Libreta', 'Libreta → Desparasitación interna · 01/06'],
    ['rab', 'rec', 'Libreta', 'Libreta → Vacuna Antirrábica · 02/11/25'],
    ['ctl', 'rec', 'Libreta', 'Libreta → Control · 03/03'],
    ['vi1', 'visit', 'Historial', 'Historial → Consulta · Veterinaria Panda · 02/10'],
    ['st1', 'study', 'Historial', 'Historial → Estudio · Análisis de sangre · 03/10'],
    ['sy1', 'sym', 'Historial', 'Historial → Síntoma o nota · 01/10'],
    ['md1', 'med', 'Historial', 'Historial → Remedio · Omeprazol · desde 02/10'],
    ['2026-08-12', 'weight', 'Peso', 'Peso · 12/08'],
    ['ex1', 'expense', 'Gastos', 'Gastos → Alimento · 09/10'],
    ['2026-10', 'gastos', 'Gastos', 'Gastos → Total · octubre'],
    ['co1', 'antecedentes', 'Antecedentes', 'Antecedentes → Problema de salud · Otitis'],
    ['su1', 'surg', 'Antecedentes', 'Antecedentes → Cirugía · Castración · 10/02/24'],
    ['ap1', 'appt', 'Agenda', 'Agenda → Turno · Veterinaria Panda · 20/10 18:30'],
    ['lg1', 'sitter', 'Cuidador', 'Cuidador → Sofi · ayer 22:10'],
  ];
  for (const [item, section, area, source] of want) {
    const r = byItem(c, item, section);
    assert.ok(r, 'falta ' + item);
    assert.equal(r.area, area, item);
    assert.equal(r.source, source, item);
    assert.equal(r.go, A.AREA[area].go, item);
  }
  const ficha = Object.values(c.refs).find(r => r.label === 'Ficha');
  assert.equal(ficha.source, 'Datos → Ficha');
  assert.equal(Object.values(c.refs).find(r => r.label === 'Veterinaria').source, 'Datos → Veterinaria y guardia');
  assert.equal(Object.values(c.refs).find(r => r.label === 'Alimento').source, 'Alimento → Croqueta Uno · abierta 01/10');
  /* lo que anota la misma persona no entra como cuidador */
  assert.ok(!byItem(c, 'lg0'));
  /* la sección también va en la línea, para que la IA diga "Según tu libreta" */
  const pip = Object.entries(c.refs).find(([, r]) => r.itemId === 'pip')[0];
  assert.match(c.text, new RegExp(`\\[r:${pip}\\] \\(Libreta\\) Antiparasitario externa`));
  for (const line of c.text.split('\n').filter(l => l.includes('[r:'))) assert.match(line, /\] \((Libreta|Historial|Antecedentes|Peso|Gastos|Datos|Alimento|Agenda|Cuidador|Me fui|Algo pasó|QR)\) /, line);
});

test('fuentes: una fecha sugerida lo dice, y el QR y "hoy" llevan hora', () => {
  const sug = pet('t', 'Toto', { records: [{ id: 'sg', type: 'vacuna', name: 'Séxtuple', date: '', next: '2026-12-01', sug: true, notes: '' }] });
  const c = A.buildContext({ pets: [sug] }, { tz: TZ, now: NOW, scans: [{ id: 'q1', petId: 't', kind: 'msg', at: '2026-10-14T10:00:00-03:00', name: 'Ana' }] });
  assert.equal(Object.values(c.refs).find(r => r.section === 'qr').source, 'QR → Aviso · hoy 10:00');
  const rec = byItem(c, 'sg');
  assert.match(rec.source, /^Libreta → Vacuna Séxtuple · 01\/12/);
});

test('fuentes: un área desconocida cae en Datos, y las nuevas se suman en AREA', () => {
  assert.equal(A.sourceOf({ area: 'Me fui', detail: '', when: '13/10' }), 'Me fui · 13/10');
  assert.equal(A.sourceOf({ area: 'Algo pasó', detail: 'Vómito', when: 'ayer 22:10' }), 'Algo pasó → Vómito · ayer 22:10');
  assert.equal(A.shortDay('2026-09-14', '2026-10-14'), '14/09');
  assert.equal(A.shortDay('2025-09-14', '2026-10-14'), '14/09/25');
  assert.equal(A.shortMonth('2025-12', '2026-10-14'), 'diciembre 2025');
  for (const v of Object.values(A.AREA)) assert.ok(v.say && v.go);
});

test('prompt: pide decir de dónde sale un dato solo ("Según tu libreta, …") con las frases de cada sección', () => {
  assert.match(A.ASK_SYSTEM, /Según tu libreta, la última pipeta fue el 14\/09/);
  for (const [k, v] of Object.entries(A.AREA)) assert.ok(A.ASK_SYSTEM.includes(`${k} → "${v.say}"`), k);
});

test('citas: la ruta legible viaja con cada cita validada', () => {
  const c = A.buildContext(DOC, { question: 'pipeta', petId: 'aika0001', tz: TZ, now: NOW });
  const pip = Object.entries(c.refs).find(([, r]) => r.itemId === 'pip')[0];
  const out = A.resolveCitations(`Según tu libreta, la última pipeta fue el 14/09 [r:${pip}] [r:nope1].`, c.refs);
  assert.equal(out.text, `Según tu libreta, la última pipeta fue el 14/09 [r:${pip}].`);
  assert.equal(out.citations[0].source, 'Libreta → Desparasitación externa · 14/09');
  assert.equal(out.citations[0].area, 'Libreta');
});
