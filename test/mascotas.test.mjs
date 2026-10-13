/* Mimitos · pruebas de las reglas de avisos, el cron y la limpieza de archivos.
   Correr con: node --test test/mascotas.test.mjs  (sin KV configurado usa memoria, no toca datos reales) */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dueToday } from '../api/_lib/petpush.js';
import { sweep, addUsage, photoRef, getUsage, TRASH_GRACE_MS } from '../api/_lib/petfiles.js';
import { kvGet, kvSet } from '../api/_lib/kv.js';
import cron from '../api/cron/mascotas.js';
import '../assets/js/mascotas-rules.js';
import '../assets/js/mascotas-core.js';

const SUG = 'Calendario sugerido: referencia general, confirmalo con tu veterinario.';
const luna = records => ({ pets: [{ id: 'p1', name: 'Luna', records }] });

test('QA A1: con la Séxtuple real cargada no llega el aviso de la sugerida', () => {
  const doc = luna([
    { id: 'sug', type: 'vacuna', name: 'Séxtuple', date: '', next: '2026-11-12', notes: SUG },
    { id: 'real', type: 'vacuna', name: 'Séxtuple', date: '2026-03-20', next: '2027-03-20', notes: '' },
  ]);
  assert.equal(dueToday(doc, '2026-11-12').length, 0);
  assert.equal(dueToday(doc, '2026-11-09').length, 0);
  assert.equal(dueToday(doc, '2027-03-20').length, 1);
});

test('QA A1: una dosis adelantada reemplaza a la que estaba prevista', () => {
  const doc = luna([
    { id: 'a1', type: 'vacuna', name: 'Antirrábica', date: '2025-11-07', next: '2026-11-07' },
    { id: 'a2', type: 'vacuna', name: 'Antirrábica', date: '2026-11-02', next: '2027-11-02' },
  ]);
  assert.equal(dueToday(doc, '2026-11-07').length, 0);
  assert.equal(dueToday(doc, '2026-11-04').length, 0);
});

test('la app y el cron usan la misma regla', () => {
  const recs = [
    { id: 'sug', type: 'vacuna', name: 'Séxtuple', date: '', next: '2026-11-12', notes: SUG },
    { id: 'real', type: 'vacuna', name: 'séxtuple ', date: '2026-03-20', next: '2027-03-20' },
    { id: 'pip', type: 'desparasitacion', name: 'Pipeta antipulgas', date: '2026-10-01', next: '2026-11-01' },
  ];
  const app = globalThis.MZ.upcoming({ records: recs }).map(x => x.r.id);
  const srv = globalThis.MZRULES.dueRecords(recs).map(r => r.id);
  assert.deepEqual(app, srv);
  assert.deepEqual(srv, ['pip', 'real']);
});

test('una fecha sugerida avisa como sugerida, para confirmar con el veterinario', () => {
  const [a] = dueToday(luna([{ id: 's', type: 'vacuna', name: 'Séxtuple', date: '', next: '2026-11-12', notes: SUG }]), '2026-11-12');
  assert.ok(a.sug);
  assert.match(a.title, /sugerida/i);
  assert.match(a.body, /confirmala con tu veterinario/);
  const ev = globalThis.MZ.recordEvent({ id: 'p1', name: 'Luna' }, { id: 's', type: 'vacuna', name: 'Séxtuple', date: '', next: '2026-11-12', notes: SUG });
  assert.match(ev.title, /sugerida, confirmala con tu veterinario/);
});

test('.ics: el aviso de 3 días antes suena a las 9:00, no a las 00:00', () => {
  const ics = globalThis.MZ.ics([globalThis.MZ.recordEvent({ id: 'p1', name: 'Luna' }, { id: 'r', type: 'vacuna', name: 'Antirrábica', date: '2026-01-10', next: '2027-01-10' })]);
  assert.match(ics, /DTSTART;VALUE=DATE:20270110/);
  assert.match(ics, /TRIGGER:-P2DT15H/);   // 00:00 del día − 2 días y 15 h = 9:00 de 3 días antes
  assert.match(ics, /TRIGGER:PT9H/);
  assert.doesNotMatch(ics, /TRIGGER:-P3D\r\n/);
});

const call = async (headers = {}, query = {}) => { let st = 0; const res = { status(c) { st = c; return this; }, json() { return this; } }; await cron({ headers, query }, res); return st; };
test('QA A2: el cron sin CRON_SECRET falla cerrado y no alcanza con el User-Agent', async () => {
  delete process.env.CRON_SECRET;
  assert.equal(await call({ 'user-agent': 'vercel-cron/1.0' }), 503);
  process.env.CRON_SECRET = 'prueba';
  assert.equal(await call({ 'user-agent': 'vercel-cron/1.0' }), 401);
  assert.equal(await call({ authorization: 'Bearer otro' }), 401);
  assert.equal(await call({ authorization: 'Bearer prueba' }), 200);
});

test('limpieza: lo que se borra del doc se elimina después del rato de gracia', async () => {
  const email = 'test@ejemplo.com';
  await kvSet('orbit:petimg:abcdef0123', 'data:image/jpeg;base64,AAAA');
  await addUsage(email, photoRef('abcdef0123'), 4);
  const withPhoto = { pets: [{ id: 'p', records: [{ sticker: '/api/mascotas?img=abcdef0123' }] }] };
  const t0 = Date.now();
  assert.equal(await sweep(email, withPhoto, t0), 0);
  assert.equal(await sweep(email, { pets: [] }, t0), 0);           // pasa a la papelera, todavía no se borra (Deshacer)
  assert.ok(await kvGet('orbit:petimg:abcdef0123'));
  assert.equal(await sweep(email, { pets: [] }, t0 + TRASH_GRACE_MS + 1), 1);
  assert.equal(await kvGet('orbit:petimg:abcdef0123'), null);
  assert.equal((await getUsage(email)).bytes, 0);
});
