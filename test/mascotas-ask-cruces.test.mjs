/* Mimitos · Preguntale: preguntas cruzadas por fecha (±30 días), sin causas ni diagnósticos, y tamaño del contexto.
   Correr con: node --test test/mascotas-ask-cruces.test.mjs  (KV en memoria y la IA simulada: no llama a Anthropic) */
import { test } from 'node:test';
import assert from 'node:assert/strict';
process.env.SESSION_SECRET = 'prueba-secreta-de-mimitos-1234567890';
process.env.ANTHROPIC_API_KEY = 'sk-prueba-no-se-usa';
delete process.env.ADMIN_EMAILS;
const { kvSet } = await import('../api/_lib/kv.js');
const { makeSession } = await import('../api/_lib/auth.js');
const { estimateTokens } = await import('../api/_lib/petai.js');
const A = await import('../api/_lib/petask.js');
const { default: handler } = await import('../api/mascotas.js');
const { bigDoc } = await import('./fixtures/mimitos-cuenta-grande.mjs');

const NOW = new Date('2026-10-14T15:00:00Z');
const TZ = 'America/Argentina/Buenos_Aires';
const pet = (id, name, extra = {}) => ({ id, name, species: 'perro', speciesOther: '', breed: '', sex: 'h', birth: '2021-05-02', allergies: '', notes: '', chronic: '', neutered: '',
  vet: {}, food: {}, records: [], visits: [], studies: [], weights: [], conditions: [], surgeries: [], symptoms: [], meds: [], expenses: [], log: [], ...extra });
/* bajó de peso el 12/08; ±30 días: cambio de alimento (25/07), diarrea (01/08), consulta (05/08), remedio (05/08), estudio (06/08).
   Afuera: síntoma de mayo y consulta de octubre */
const AIKA = pet('aika0001', 'Aika', {
  weights: [{ date: '2026-05-10', kg: 9.4 }, { date: '2026-06-20', kg: 9.5 }, { date: '2026-08-12', kg: 8.7 }, { date: '2026-10-01', kg: 9.1 }],
  food: { brand: 'Croqueta Dos', bagKg: 15, dailyG: 250, opened: '2026-07-25', bags: [{ date: '2026-06-01', kg: 15, brand: 'Croqueta Uno' }, { date: '2026-07-25', kg: 15, brand: 'Croqueta Dos' }] },
  symptoms: [{ id: 'syOld', date: '2026-05-02', text: 'Estornudos' }, { id: 'syDia', date: '2026-08-01', text: 'Diarrea dos días' }],
  visits: [{ id: 'viAgo', date: '2026-08-05', reason: 'Diarrea', vet: 'Veterinaria Panda', findings: '', plan: '' }, { id: 'viOct', date: '2026-10-05', reason: 'Control', vet: '', findings: '', plan: '' }],
  meds: [{ id: 'mdAgo', name: 'Probiótico', dose: '1 sobre', every: 24, start: '2026-08-05T12:00:00Z', days: 5 }],
  studies: [{ id: 'stAgo', date: '2026-08-06', kind: 'materia', title: 'Coproparasitológico', lab: '', notes: '' }],
});
const DOC = { pets: [AIKA, pet('feliza01', 'Feliza', { species: 'gato' })] };
const Q = '¿Qué pasó alrededor de la última vez que Aika bajó de peso?';
const lineOf = (text, needle) => text.split('\n').find(l => l.includes(needle)) || '';

test('cruce: la pregunta encuentra la última bajada de peso y marca la ventana de ±30 días', () => {
  const c = A.buildContext(DOC, { question: Q, petId: 'aika0001', tz: TZ, now: NOW });
  assert.deepEqual([c.window.anchor, c.window.from, c.window.to], ['2026-08-12', '2026-07-13', '2026-09-11']);
  assert.ok(c.refs[c.window.id] && c.refs[c.window.id].kind === 'weight');
  assert.match(c.text, /PREGUNTA CRUZADA: se incluyó todo lo registrado entre 2026-07-13 y 2026-09-11 \(±30 días de la última vez que bajó de peso \(2026-08-12\) \[r:/);
  /* el peso ya trae cuánto bajó contra el anterior, y el cambio de alimento está marcado */
  assert.match(lineOf(c.text, '8,7 kg'), /^2026-08-12 \[r:[a-z0-9]+\] \(Peso\) Peso: 8,7 kg \(BAJÓ 0,8 kg vs\. el anterior\)$/);
  assert.match(lineOf(c.text, 'Bolsa de alimento abierta el 2026-07-25'), /CAMBIO DE ALIMENTO \(antes "Croqueta Uno"\)/);
  /* línea de tiempo unificada: fechas al principio, de lo más nuevo a lo más viejo */
  const dates = c.text.split('\n').map(l => /^(\d{4}-\d{2}(-\d{2})?) \[r:/.exec(l)?.[1]).filter(Boolean);
  assert.ok(dates.length >= 10);
  assert.deepEqual(dates, dates.slice().sort().reverse());
  assert.match(c.text, /Línea de tiempo de Aika \(de lo más nuevo a lo más viejo/);
  /* otras formas de preguntar */
  assert.equal(A.buildContext(DOC, { question: '¿Qué más registré cerca de la diarrea de Aika?', now: NOW, tz: TZ }).window.anchor, '2026-08-05');
  assert.equal(A.buildContext(DOC, { question: '¿Qué pasó antes del 12/08?', now: NOW, tz: TZ }).window.anchor, '2026-08-12');
  assert.equal(A.buildContext(DOC, { question: '¿Cuándo fue la última pipeta?', now: NOW, tz: TZ }).window, null, 'una pregunta común no es cruzada');
});

test('cruce: con una cuenta enorme, lo de la ventana entra igual aunque sea viejo', () => {
  const doc = bigDoc();
  const c = A.buildContext(doc, { question: '¿Qué pasó alrededor de la última vez que Aika bajó de peso?', petId: 'aika0001', tz: TZ, now: NOW, maxChars: 6000 });
  assert.ok(c.trimmed, 'se recortó');
  const { from, to } = c.window;
  const inWin = doc.pets[0].symptoms.concat(doc.pets[0].visits, doc.pets[0].studies).filter(x => x.date >= from && x.date <= to);
  assert.ok(inWin.length >= 1);
  for (const x of inWin) assert.ok(Object.values(c.refs).some(r => r.itemId === x.id), 'entra ' + x.id);
});

/* ---------- endpoint con la IA simulada ---------- */
const cookie = email => ({ cookie: `orbit_session=${makeSession(email)}` });
const call = async body => {
  let st = 0, out = null;
  const res = { setHeader() {}, status(c) { st = c; return this; }, json(o) { out = o; return this; }, end() { return this; } };
  await handler({ method: 'POST', query: { ask: '1' }, headers: cookie('cruce@ejemplo.com'), body }, res);
  return { st, out };
};
let ai = null, sent = [];
globalThis.fetch = async (url, init) => {
  if (!String(url).startsWith('https://api.anthropic.com/')) throw new Error('sin red en las pruebas');
  const b = JSON.parse(init.body); sent.push(b);
  return new Response(JSON.stringify({ content: [{ type: 'text', text: ai(b) }], stop_reason: 'end_turn', usage: { input_tokens: 1500, output_tokens: 120 } }), { status: 200, headers: { 'content-type': 'application/json' } });
};
const idOf = (b, needle) => (new RegExp(`\\[r:([a-z0-9]+)\\][^\\n]*${needle}`).exec(b.messages.at(-1).content) || [])[1];
await kvSet('orbit:purchases:cruce@ejemplo.com', [{ productId: 'ob-018', orderId: 'o9', date: '2026-10-12' }]);
await kvSet('orbit:pets:cruce@ejemplo.com', DOC);

test('cruce con la IA simulada: el contexto trae los ítems de ±30 días y las citas se validan', async () => {
  sent = [];
  ai = b => `Aika bajó a 8,7 kg el 12/08 [r:${idOf(b, '8,7 kg')}]. En esas semanas también registraste:
- 25/07: cambio de alimento a Croqueta Dos [r:${idOf(b, 'CAMBIO DE ALIMENTO')}]
- 01/08: diarrea dos días [r:${idOf(b, 'Diarrea dos días')}]
- 05/08: consulta en Veterinaria Panda [r:${idOf(b, 'motivo "Diarrea"')}] y probiótico [r:${idOf(b, 'Probiótico')}]
- 06/08: coproparasitológico [r:${idOf(b, 'Coproparasitológico')}] [r:zz999]
Para saber si tiene relación, consultalo con tu vete.`;
  const { st, out } = await call({ question: Q, petId: 'aika0001', tz: TZ });
  assert.equal(st, 200);
  const ctx = sent[0].messages.at(-1).content;
  for (const n of ['8,7 kg', 'CAMBIO DE ALIMENTO', 'Diarrea dos días', 'motivo "Diarrea"', 'Probiótico', 'Coproparasitológico']) assert.ok(idOf(sent[0], n), 'va al modelo: ' + n);
  assert.match(ctx, /PREGUNTA CRUZADA/);
  assert.equal(out.cross, true);
  assert.equal(out.citations.length, 6, 'la inventada no pasa');
  assert.doesNotMatch(out.answer, /zz999/);
  assert.deepEqual(out.citations.map(c => c.area), ['Peso', 'Gastos', 'Historial', 'Historial', 'Historial', 'Historial']);
  assert.equal(out.citations[0].source, 'Peso · 12/08');
  assert.equal(out.citations[1].source, 'Gastos → Cambio de alimento · 25/07');
  /* describe coincidencias y deriva: la red de seguridad no agrega nada */
  assert.ok(!out.answer.includes(A.CAUSE_NOTE) && !out.answer.includes(A.MEDICAL_NOTE));
  assert.match(A.ASK_SYSTEM, /SOLO coincidencias en el tiempo/);
  assert.match(A.ASK_SYSTEM, /Para saber si tiene relación, consultalo con tu vete\./);
});

test('red de seguridad: si la respuesta sugiere una causa o un tratamiento, deriva al vete igual', async () => {
  ai = b => `Bajó de peso [r:${idOf(b, '8,7 kg')}] probablemente por el cambio de alimento [r:${idOf(b, 'CAMBIO DE ALIMENTO')}].`;
  const r = await call({ question: Q, petId: 'aika0001', tz: TZ });
  assert.ok(r.out.answer.includes(A.CAUSE_NOTE));
  assert.equal(r.out.medical, true);
  assert.equal(r.out.citations.length, 2);
  /* aunque ya derive, una causa afirmada lleva la aclaración */
  assert.ok(A.safetyNet(Q, 'Fue por el alimento. Consultalo con tu vete.').endsWith(A.CAUSE_NOTE));
  for (const a of ['Se debe al cambio de alimento.', 'Seguramente la diarrea causó la baja.', 'Podría deberse al probiótico.', 'Están relacionadas.', 'La diarrea explica la baja de peso.'])
    assert.ok(A.safetyNet('¿Qué pasó alrededor de la diarrea?', a).includes(A.CAUSE_NOTE), a);
  /* tratamiento sugerido en una pregunta de datos → "consultá a tu vete" */
  for (const a of ['Te recomiendo volver a Croqueta Uno.', 'Podés darle probiótico otra vez.', 'Deberías cambiarle el alimento.'])
    assert.ok(A.safetyNet('¿Qué pasó en agosto?', a).endsWith(A.MEDICAL_NOTE), a);
  /* preguntar si una cosa tiene que ver con otra es médico */
  assert.ok(A.isMedical('¿La diarrea tiene que ver con el cambio de alimento?'));
  assert.ok(A.isMedical('¿Por qué bajó de peso Aika?'));
  /* describir fechas no dispara nada */
  const ok = 'El 25/07 cambiaste el alimento y el 01/08 anotaste diarrea.';
  assert.equal(A.safetyNet('¿Qué pasó alrededor del 12/08?', ok), ok);
});

test('tamaño: la línea de tiempo cabe en el tope y cuesta poco más que antes', () => {
  const doc = bigDoc();
  for (const q of ['¿Cuánto gasté este año?', '¿Qué pasó alrededor de la última vez que Aika bajó de peso?']) {
    const c = A.buildContext(doc, { question: q, petId: 'aika0001', tz: TZ, now: NOW });
    assert.ok(c.text.length <= A.CONTEXT_MAX_CHARS + 1500, 'con el tope: ' + c.text.length);
    const tok = estimateTokens({ chars: c.text.length + A.ASK_SYSTEM.length });
    assert.ok(tok <= 12000, 'tokens estimados (cuenta conservadora de petai: caracteres / 3) ' + tok);
  }
  /* medido el 14/10/2026 con esta cuenta (2 mascotas, ~2 años): sin tope ~37,5k caracteres (~12,5k tokens) contra ~31,7k
     antes de las fuentes y la línea de tiempo (+18%). Con el tope de 28k entran ~234 de ~280 registros, priorizando la ventana. */
  const full = A.buildContext(doc, { question: '¿Cuánto gasté este año?', petId: 'aika0001', tz: TZ, now: NOW, maxChars: 1e9 });
  assert.ok(full.text.length < 42000, 'sin tope: ' + full.text.length);
  /* la fecha al principio no se repite adentro de la línea */
  assert.doesNotMatch(full.text, /\(Peso\) Peso: [\d,]+ kg el \d{4}/);
  assert.doesNotMatch(full.text, /\(Historial\) Consulta \d{4}-/);
});
