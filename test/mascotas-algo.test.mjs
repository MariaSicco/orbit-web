/* Mimitos · "+ Algo pasó": modelo del episodio, compatibilidad con las notas viejas y archivos del Blob privado.
   Correr con: node --test test/mascotas-algo.test.mjs  (KV en memoria; no toca datos reales) */
import { test } from 'node:test';
import assert from 'node:assert/strict';
for (const k of ['KV_REST_API_URL', 'KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'BLOB_READ_WRITE_TOKEN', 'BLOB_STORE_ID']) delete process.env[k];
process.env.SESSION_SECRET = 'prueba-secreta-de-mimitos-algo-1234567890';
await import('../assets/js/mascotas-rules.js');
await import('../assets/js/mascotas-core.js');
const Z = globalThis.MZ;
const { default: mascotas, cleanDoc, folder, EPISODE_KINDS, MAX_VIDEO } = await import('../api/mascotas.js');
const F = await import('../api/_lib/petfiles.js');
const { kvSet } = await import('../api/_lib/kv.js');
const { makeSession } = await import('../api/_lib/auth.js');
const call = (method, query, body, email) => new Promise(ok => {
  const res = { code: 200, headers: {}, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, status(c) { this.code = c; return this; }, json(o) { ok({ code: this.code, body: o }); }, end(b) { ok({ code: this.code, raw: b }); }, redirect(c, u) { ok({ code: c, location: u }); } };
  mascotas({ method, query, body, headers: { cookie: `orbit_session=${makeSession(email)}`, host: 'preview.orbitando.test' } }, res);
});

const EMAIL = 'duena@ejemplo.com';
const mine = n => `blob:${folder(EMAIL)}/abc${n}-foto.jpg`;
const docWith = symptoms => ({ pets: [{ id: 'luna0001', name: 'Luna', species: 'perro', symptoms }] });

test('compatibilidad: una nota vieja { id, date, text } queda igual, sin campos nuevos', () => {
  const out = cleanDoc(docWith([{ id: 'sy01aa', date: '2026-07-03', text: 'Diarrea dos días' }]), EMAIL).pets[0].symptoms;
  assert.deepEqual(out, [{ id: 'sy01aa', date: '2026-07-03', text: 'Diarrea dos días' }]);
});

test('episodio: guarda tipo, hora, intensidad, nota y foto propia; el día sale de la hora si falta', () => {
  const ep = { id: 'ep01aa', at: '2026-10-14T09:30', kind: 'vomito', sev: 'moderada', text: 'Después de comer', media: [{ ref: mine(1), type: 'image/jpeg', name: 'foto.jpg' }] };
  const [x] = cleanDoc(docWith([ep]), EMAIL).pets[0].symptoms;
  assert.deepEqual(x, { id: 'ep01aa', date: '2026-10-14', text: 'Después de comer', kind: 'vomito', at: '2026-10-14T09:30', sev: 'moderada', media: [{ ref: mine(1), type: 'image/jpeg', name: 'foto.jpg' }] });
});

test('episodio: en 2 toques alcanza con tipo y hora (sin nota)', () => {
  const [x] = cleanDoc(docWith([{ id: 'ep02aa', date: '2026-10-14', at: '2026-10-14T10:00', kind: 'diarrea', text: '' }]), EMAIL).pets[0].symptoms;
  assert.equal(x.kind, 'diarrea');
  assert.equal(x.text, '');
});

test('episodio: tipo, intensidad y hora inválidos se descartan; sin tipo ni texto no se guarda', () => {
  const out = cleanDoc(docWith([
    { id: 'ep03aa', date: '2026-10-14', at: '14/10 10:00', kind: 'convulsion', sev: 'grave', text: 'algo' },
    { id: 'ep04aa', date: '2026-10-14', kind: 'nada', text: '' },
  ]), EMAIL).pets[0].symptoms;
  assert.equal(out.length, 1);
  assert.deepEqual(out[0], { id: 'ep03aa', date: '2026-10-14', text: 'algo' });
  assert.deepEqual(EPISODE_KINDS, Z.ALGO.map(a => a[0]), 'el servidor y la app usan los mismos tipos');
});

test('episodio: solo archivos de la carpeta de la cuenta, máximo 4, tipo imagen o video', () => {
  const other = `blob:${folder('otra@ejemplo.com')}/x-foto.jpg`;
  const media = [{ ref: other, type: 'image/jpeg' }, { ref: mine(1), type: 'text/html' }, { ref: mine(2), type: 'image/jpeg' }, { ref: mine(3), type: 'video/mp4', dur: 12.4, thumb: mine(4) },
    { ref: mine(5), type: 'image/jpeg' }, { ref: mine(6), type: 'image/jpeg' }, { ref: mine(7), type: 'image/jpeg' }];
  const [x] = cleanDoc(docWith([{ id: 'ep05aa', date: '2026-10-14', kind: 'herida', media }]), EMAIL).pets[0].symptoms;
  assert.deepEqual(x.media.map(m => m.ref), [mine(2), mine(3)]);
  assert.equal(x.media[1].thumb, mine(4));
  assert.equal(x.media[1].dur, 12.4);
});

test('archivos: las fotos y videos de los episodios cuentan como usados (la limpieza no los borra)', () => {
  const doc = cleanDoc(docWith([{ id: 'ep06aa', date: '2026-10-14', kind: 'herida', media: [{ ref: mine(1), type: 'image/jpeg' }, { ref: mine(2), type: 'video/mp4', thumb: mine(3) }] }]), EMAIL);
  const used = F.refsOf(doc);
  for (const n of [1, 2, 3]) assert.ok(used.has(mine(n)), 'usa ' + n);
});

test('línea de tiempo: el episodio se titula por su tipo y lleva hora e intensidad; la nota vieja sigue igual', () => {
  const p = { symptoms: [{ id: 'a', date: '2026-10-13', text: 'Se rasca la oreja' }, { id: 'b', date: '2026-10-14', at: '2026-10-14T08:05', kind: 'vomito', sev: 'leve', text: '' }, { id: 'c', date: '2026-10-14', at: '2026-10-14T18:40', kind: 'otro', text: 'Comió una media' }] };
  const tl = Z.timeline(p);
  assert.deepEqual(tl.map(e => e.title), ['Comió una media', 'Vómito', 'Se rasca la oreja']);
  assert.match(tl[1].sub, /Algo pasó · 08:05 · Leve/);
  assert.equal(tl[2].sub, 'Algo que notaste');
});

test('horas rápidas: ahora, hace 1 h y hoy a la mañana (9:00, o ahora si es más temprano)', () => {
  const now = new Date(2026, 9, 14, 15, 20, 33);
  assert.equal(Z.quickAt('now', now), '2026-10-14T15:20');
  assert.equal(Z.quickAt('1h', now), '2026-10-14T14:20');
  assert.equal(Z.quickAt('manana', now), '2026-10-14T09:00');
  assert.equal(Z.quickAt('manana', new Date(2026, 9, 14, 7, 5)), '2026-10-14T07:05');
});

test('sin diagnóstico: el texto fijo de la hoja no cambia', () => {
  assert.equal(Z.ALGO_NOTE, 'Mimitos solo lo anota. Si te preocupa, consultá con tu vete; si es urgente, buscá una guardia.');
});

const MB = 1024 * 1024;
test('video: hasta 15 s y 20 MB, solo mp4, mov o webm (lo mide el navegador antes de subir)', () => {
  assert.equal(Z.videoCheck({ type: 'video/mp4', size: 12 * MB, dur: 14.9 }), '');
  assert.equal(Z.videoCheck({ type: 'video/quicktime', size: 20 * MB, dur: 15.4 }), '', 'medio segundo de tolerancia');
  assert.match(Z.videoCheck({ type: 'video/mp4', size: 5 * MB, dur: 16 }), /dura 16 segundos: puede durar hasta 15/);
  assert.match(Z.videoCheck({ type: 'video/mp4', size: 20 * MB + 1, dur: 10 }), /más de 20 MB/);
  assert.match(Z.videoCheck({ type: 'video/x-msvideo', size: MB, dur: 5 }), /formato/);
  assert.match(Z.videoCheck({ type: 'video/mp4', size: MB, dur: NaN }), /No pudimos leer/);
  assert.equal(Z.VIDEO_MAX_BYTES, MAX_VIDEO, 'la app y el servidor usan el mismo tope');
});

test('video: el servidor acepta video solo para "Algo pasó", hasta 20 MB, y con cupo y tope diario', async () => {
  const email = 'videos@ejemplo.com';
  await kvSet(`orbit:purchases:${email}`, [{ productId: 'ob-018', orderId: 'o-v', date: new Date(Date.now() - 864e5).toISOString() }]);
  process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_prueba_no_se_usa';
  try {
    const up = b => call('POST', { upload: '1' }, b, email);
    assert.equal((await up({ name: 'v.mp4', size: MB, type: 'video/mp4' })).body.error, 'tipo_no_permitido', 'sin purpose no es un estudio válido');
    assert.equal((await up({ name: 'v.avi', size: MB, type: 'video/x-msvideo', purpose: 'episodio' })).body.error, 'tipo_no_permitido');
    const big = await up({ name: 'v.mp4', size: 20 * MB + 1, type: 'video/mp4', purpose: 'episodio' });
    assert.equal(big.code, 413); assert.equal(big.body.max, 20 * MB);
    assert.equal((await up({ name: 'a.pdf', size: 16 * MB, type: 'application/pdf', purpose: 'episodio' })).code, 413, 'los estudios siguen en 15 MB');
    const ok = await up({ name: 'v.mp4', size: 19 * MB, type: 'video/mp4', purpose: 'episodio' });
    assert.ok(![400, 413].includes(ok.code), 'un video de 19 MB pasa los controles: ' + ok.code);
    await F.addUsage(email, `blob:${folder(email)}/lleno.pdf`, F.QUOTA_BYTES - MB);
    assert.equal((await up({ name: 'v.mp4', size: 2 * MB, type: 'video/mp4', purpose: 'episodio' })).body.error, 'cupo_lleno');
    await F.addUsage(email, `blob:${folder(email)}/lleno.pdf`, 0);
    await kvSet(`orbit:petuploadday:${email}:${new Date().toISOString().slice(0, 10)}`, F.UPLOADS_PER_DAY);
    assert.equal((await up({ name: 'v.mp4', size: MB, type: 'video/mp4', purpose: 'episodio' })).body.error, 'limite_diario');
  } finally { delete process.env.BLOB_READ_WRITE_TOKEN; }
});

/* ---------- seguimiento: 72 h, "¿Sigue igual?" y últimos 7 días ---------- */
const ep = (id, at, kind = 'vomito', x = {}) => ({ id, date: at.slice(0, 10), at, kind, text: '', ...x });
const NOW = new Date(2026, 9, 14, 20, 0);   /* miércoles 14/10/2026, 20:00 */

test('72 h: cuenta las veces del mismo tipo y dice desde cuándo ("Es la 3.ª vez desde ayer")', () => {
  const p = { symptoms: [ep('a', '2026-10-13T22:10'), ep('b', '2026-10-14T08:00'), ep('x', '2026-10-14T09:00', 'diarrea'), ep('c', '2026-10-14T19:30')] };
  const r = Z.epRepeat(p, p.symptoms[3]);
  assert.equal(r.n, 3);
  assert.equal(Z.repeatText(r, NOW), 'Es la 3.ª vez desde ayer');
  assert.equal(Z.repeatText(Z.epRepeat(p, p.symptoms[0]), NOW), '', 'la primera vez no dice nada');
  assert.equal(Z.epRepeat(p, p.symptoms[2]).n, 1, 'otro tipo no suma');
});

test('72 h: lo de hace más de 72 h no cuenta; el límite es estricto', () => {
  const p = { symptoms: [ep('a', '2026-10-11T19:30'), ep('b', '2026-10-11T19:31'), ep('c', '2026-10-14T19:30')] };
  assert.equal(Z.epRepeat(p, p.symptoms[2]).n, 2);
  assert.equal(Z.repeatText(Z.epRepeat(p, p.symptoms[2]), NOW), 'Es la 2.ª vez desde el domingo');
});

test('72 h: la línea de tiempo junta el mismo tipo encadenado (cada uno a menos de 72 h del anterior)', () => {
  const p = { symptoms: [ep('a', '2026-10-01T10:00'), ep('b', '2026-10-12T10:00'), ep('c', '2026-10-13T10:00'), ep('d', '2026-10-14T09:00', 'tos'), ep('e', '2026-10-14T10:00'), { id: 'n', date: '2026-10-12', text: 'Nota vieja' }] };
  const g = Z.epGroups(p);
  assert.deepEqual(g.map(x => [x.kind, x.n]), [['vomito', 1], ['vomito', 3], ['tos', 1]]);
  const tl = Z.timeline(p);
  assert.deepEqual(tl.map(e => e.title), ['Vómito · 3 veces', 'Tos o estornudos', 'Nota vieja', 'Vómito']);
  assert.match(tl[0].sub, /3 veces, del 12 oct\.? al 14 oct/);
  assert.equal(tl[0].ref.id, 'e', 'la entrada abre el último');
});

test('¿Sigue igual?: solo si lo pidió, al día siguiente (o el otro), sobre el último de cada tipo y sin respuesta', () => {
  const p = { symptoms: [ep('a', '2026-10-13T08:00', 'vomito', { check: true }), ep('b', '2026-10-13T09:00', 'vomito', { check: true }),
    ep('c', '2026-10-13T10:00', 'tos'), ep('d', '2026-10-14T10:00', 'diarrea', { check: true }), ep('e', '2026-10-10T10:00', 'herida', { check: true }),
    ep('f', '2026-10-12T10:00', 'cojea', { check: true, res: 'mejor' })] };
  assert.deepEqual(Z.followUps(p, NOW).map(s => s.id), ['b']);
  p.symptoms[1].res = 'igual';
  assert.deepEqual(Z.followUps(p, NOW), []);
});

test('Últimos 7 días: hoy y los 6 anteriores, de lo más nuevo a lo más viejo, agrupado', () => {
  const p = { symptoms: [ep('a', '2026-10-07T10:00', 'herida'), ep('b', '2026-10-08T10:00', 'tos'), ep('c', '2026-10-13T10:00'), ep('d', '2026-10-14T10:00')] };
  assert.deepEqual(Z.lastWeek(p, NOW).map(g => [g.last.id, g.n]), [['d', 2], ['b', 1]]);
});

test('compatibilidad: "¿Sigue igual?" y la respuesta se guardan; valores raros se descartan', () => {
  const [x, y] = cleanDoc(docWith([ep('ep10aa', '2026-10-14T10:00', 'tos', { check: true, res: 'mejor' }), ep('ep11aa', '2026-10-14T10:00', 'tos', { check: 'si', res: 'peor' })]), EMAIL).pets[0].symptoms;
  assert.equal(x.check, true); assert.equal(x.res, 'mejor');
  assert.ok(!('check' in y) && !('res' in y));
});

/* ---------- PDF para el veterinario ---------- */
test('PDF: "Episodios recientes" trae los últimos 60 días agrupados, con notas, intensidades y hasta 4 adjuntos', () => {
  const img = n => ({ ref: mine(n), type: 'image/jpeg' });
  const p = { symptoms: [
    ep('old', '2026-08-01T10:00', 'tos'),
    ep('a', '2026-10-13T22:10', 'vomito', { sev: 'leve', text: 'Con pasto', media: [img(1), img(2)] }),
    ep('b', '2026-10-14T08:00', 'vomito', { sev: 'fuerte', media: [img(3), { ref: mine(4), type: 'video/mp4', dur: 9, thumb: mine(5) }, img(6)] }),
    ep('c', '2026-10-12T10:00', 'otro', { text: 'Comió una media', res: 'paso' }),
    { id: 'n', date: '2026-10-13', text: 'Nota vieja' } ] };
  const r = Z.recentEpisodes(p, 60, NOW);
  assert.deepEqual(r.map(g => [g.last.id, g.n]), [['b', 2], ['c', 1]], 'sin lo de agosto ni las notas viejas');
  assert.deepEqual(r[0].notes, ['Con pasto']);
  assert.deepEqual(r[0].sevs, ['Leve', 'Fuerte']);
  assert.equal(r[0].media.length, 4);
  assert.equal(r[0].media[3].type, 'video/mp4');
  assert.equal(r[0].hours, 10);
  assert.deepEqual(r[1].notes, [], '"Otro" usa la nota como título, no la repite');
  assert.equal(r[1].last.res, 'paso');
});

/* ---------- Preguntale a Mimitos ---------- */
const A = await import('../api/_lib/petask.js');
test('Preguntale: los episodios entran citables, con su sección "Algo pasó → Vómito · ayer 22:10" y las veces en 72 h', () => {
  const pet = { id: 'luna0001', name: 'Luna', species: 'perro', records: [], weights: [{ date: '2026-09-20', kg: 10 }, { date: '2026-10-12', kg: 9.4 }],
    food: { brand: 'Marca X', bags: [{ date: '2026-10-01', kg: 3, brand: 'Marca Nueva' }] },
    symptoms: [ep('ep1aaa', '2026-10-13T22:10', 'vomito', { sev: 'fuerte', text: 'Con pasto', media: [{ ref: mine(1), type: 'image/jpeg' }, { ref: mine(2), type: 'video/mp4' }] }),
      ep('ep2aaa', '2026-10-14T08:00', 'vomito', { res: 'mejor' }), { id: 'old1aa', date: '2026-10-02', text: 'Se rasca' }] };
  const now = new Date('2026-10-14T23:00:00Z');
  const ctx = A.buildContext({ pets: [pet] }, { question: '¿Cuándo vomitó?', petId: pet.id, tz: 'America/Argentina/Buenos_Aires', now });
  const id1 = Object.keys(ctx.refs).find(k => ctx.refs[k].itemId === 'ep1aaa'), id2 = Object.keys(ctx.refs).find(k => ctx.refs[k].itemId === 'ep2aaa');
  assert.equal(ctx.refs[id1].source, 'Algo pasó → Vómito · ayer 22:10');
  assert.equal(ctx.refs[id1].area, 'Algo pasó');
  assert.equal(ctx.refs[id1].section, 'sym', 'el chip abre el detalle del episodio');
  const line = ctx.text.split('\n').find(l => l.includes(`[r:${id1}]`));
  assert.match(line, /^2026-10-13 \[r:\w+\] \(Algo pasó\) Algo pasó: Vómito a las 22:10 · intensidad fuerte · nota "Con pasto" · 1 foto\(s\) · 1 video\(s\)$/);
  const line2 = ctx.text.split('\n').find(l => l.includes(`[r:${id2}]`));
  assert.match(line2, /es la 2\.ª vez en 72 h \(desde 2026-10-13\) · al día siguiente: está mejor/);
  assert.ok(ctx.text.includes('(Historial) Síntoma o nota: "Se rasca"'), 'las notas viejas siguen como antes');
  assert.ok(A.ASK_SYSTEM.includes('Algo pasó → "Según lo que anotaste en Algo pasó"'));
  const r = A.resolveCitations(`Vomitó anoche [r:${id1}] y hoy [r:${id2}].`, ctx.refs);
  assert.deepEqual(r.citations.map(c => c.source), ['Algo pasó → Vómito · ayer 22:10', 'Algo pasó → Vómito · hoy 08:00']);
});

test('Preguntale: una pregunta cruzada sobre un episodio trae lo registrado ±30 días (peso, alimento) a la línea de tiempo', () => {
  const pet = { id: 'luna0001', name: 'Luna', species: 'perro', records: [], weights: [{ date: '2026-09-20', kg: 10 }, { date: '2026-10-12', kg: 9.4 }],
    expenses: Array.from({ length: 400 }, (_, i) => ({ id: 'g' + i, date: '2025-0' + (1 + (i % 8)) + '-1' + (i % 9), cat: 'otros', amount: 1000 + i, note: 'Algo bastante largo para ocupar lugar en el contexto ' + i })),
    symptoms: [ep('ep1aaa', '2026-10-13T22:10', 'diarrea'), ep('ep9aaa', '2026-06-01T10:00', 'tos')] };
  const ctx = A.buildContext({ pets: [pet] }, { question: '¿Qué más registré alrededor de la diarrea?', petId: pet.id, tz: 'America/Argentina/Buenos_Aires', now: new Date('2026-10-14T23:00:00Z'), maxChars: 3000 });
  assert.match(ctx.text, /PREGUNTA CRUZADA: se incluyó todo lo registrado entre 2026-09-13 y 2026-11-12/);
  assert.match(ctx.text, /\(Algo pasó\) Algo pasó: Diarrea a las 22:10/);
  assert.match(ctx.text, /2026-10-12 \[r:\w+\] \(Peso\)/, 'el peso de esas semanas entra aunque falte lugar');
});
