/* Mimitos · "Ya se la di": marcar una fecha vencida, de hoy o pronto, sin pasar por el formulario completo.
   La lógica vive en mascotas-core.js (app) y la regla de "lo último manda" en mascotas-rules.js (app y cron). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../assets/js/mascotas-rules.js';
import '../assets/js/mascotas-core.js';
import { dueToday } from '../api/_lib/petpush.js';

const Z = globalThis.MZ;
const hoy = Z.iso(Z.today());
const haceDias = n => Z.inDays(-n);
const feliza = records => ({ id: 'p1', name: 'Feliza', species: 'gato', birth: '2020-03-01', vet: { name: '' }, records });
const vencida = () => ({ id: 'v1', type: 'vacuna', name: 'Triple felina', date: Z.addMonths(haceDias(10), -12), next: haceDias(10), vet: 'Veterinaria San Roque', lot: 'Nobivac · A12', scope: '', notes: '', sticker: '' });

test('marcar una vencida crea el registro con fecha de hoy y la próxima con el mismo intervalo', () => {
  const p = feliza([vencida()]), old = p.records[0];
  assert.ok(Z.renewable(old));
  const plan = Z.renewPlan(p, old);
  assert.equal(plan.date, hoy);
  assert.equal(plan.gap, 12);
  assert.equal(plan.src, 'anterior');
  assert.equal(plan.next, Z.addMonths(hoy, 12));
  assert.equal(plan.vet, 'Veterinaria San Roque');
  assert.equal(plan.lot, 'Nobivac · A12');
  assert.equal(Z.renewCheck(old, plan), '');
  const { rec } = Z.applyRenew(p, old, plan, 'n1');
  assert.equal(p.records.length, 2);
  assert.deepEqual([rec.type, rec.name, rec.date, rec.next, rec.vet, rec.lot], ['vacuna', 'Triple felina', hoy, Z.addMonths(hoy, 12), 'Veterinaria San Roque', 'Nobivac · A12']);
});

test('la vieja deja de figurar como vencida: la nueva queda vigente', () => {
  const p = feliza([vencida()]);
  assert.equal(Z.summary(p).vacc, 'late');
  Z.applyRenew(p, p.records[0], Z.renewPlan(p, p.records[0]), 'n1');
  const up = Z.upcoming(p);
  assert.deepEqual(up.map(x => x.r.id), ['n1']);
  assert.ok(up[0].s.days > 300);
  assert.equal(Z.summary(p).vacc, 'ok');
  assert.ok(!Z.agenda([p]).some(x => x.date < hoy));
});

test('el cron no avisa más por la fecha renovada (misma regla que la app)', () => {
  const r = { ...vencida(), next: hoy, date: Z.addMonths(hoy, -12) };   // le tocaba hoy
  const p = feliza([r]), doc = { pets: [p] };
  assert.equal(dueToday(doc, hoy).length, 1);
  const [a] = dueToday(doc, hoy);
  assert.equal(a.url, `/mascotas#/renovar/${encodeURIComponent('p1|v1')}`);
  assert.equal(a.action, 'Ya se la di');
  Z.applyRenew(p, r, Z.renewPlan(p, r), 'n1');
  assert.equal(dueToday(doc, hoy).length, 0);
  assert.deepEqual(globalThis.MZRULES.dueRecords(p.records).map(x => x.id), ['n1']);
});

test('con la misma fecha de aplicación manda la cargada después', () => {
  const a = { id: 'a', type: 'vacuna', name: 'Antirrábica', date: hoy, next: hoy };
  const b = { id: 'b', type: 'vacuna', name: 'Antirrábica', date: hoy, next: Z.addMonths(hoy, 12) };
  assert.deepEqual(globalThis.MZRULES.latest([a, b]).map(x => x.id), ['b']);
});

test('sin intervalo propio usa el calendario sugerido; sin calendario, pregunta', () => {
  const pip = { id: 'x', type: 'desparasitacion', name: 'Pipeta antipulgas', date: '', next: haceDias(2), notes: '' };
  const g = Z.renewPlan(feliza([pip]), pip);
  assert.equal(g.gap, 1); assert.equal(g.src, 'calendario'); assert.equal(g.next, Z.addMonths(hoy, 1));
  assert.equal(Z.renewLabel(pip), 'Ya se la puse');
  const raro = { id: 'y', type: 'vacuna', name: 'Una que no está', date: '', next: haceDias(1), notes: '' };
  const q = Z.renewPlan(feliza([raro]), raro);
  assert.equal(q.gap, 0); assert.equal(q.next, '');
  assert.equal(Z.renewLabel({ type: 'control' }), 'Ya fue');
});

test('una fecha sugerida se completa en el lugar, sin duplicar', () => {
  const sug = { id: 's', type: 'vacuna', name: 'Triple felina', date: '', next: haceDias(3), notes: Z.SUG_NOTE, sticker: '' };
  const p = feliza([sug]);
  const { rec, undo } = Z.applyRenew(p, sug, Z.renewPlan(p, sug), 'n1');
  assert.equal(rec, sug); assert.equal(p.records.length, 1);
  assert.equal(sug.date, hoy); assert.ok(!Z.isSug(sug));
  undo();
  assert.equal(sug.date, ''); assert.ok(Z.isSug(sug));
});

test('validaciones: ni futura ni anterior a la dosis que ya estaba', () => {
  const r = vencida();
  assert.match(Z.renewCheck(r, { date: Z.inDays(1) }), /futura/);
  assert.match(Z.renewCheck(r, { date: Z.addMonths(r.date, -1) }), /anterior/);
  assert.match(Z.renewCheck(r, { date: hoy, next: hoy }), /después/);
  assert.equal(Z.renewCheck(r, { date: haceDias(1), next: '' }), '');
});

test('posponer cambia la fecha del registro vigente y no crea una dosis', () => {
  const p = feliza([vencida()]), r = p.records[0], antes = r.next;
  const undo = Z.postpone(r, Z.inDays(7));
  assert.equal(p.records.length, 1);
  assert.equal(r.next, Z.inDays(7));
  assert.equal(Z.summary(p).vacc, 'ok');
  undo();
  assert.equal(r.next, antes);
});

test('deshacer deja todo como estaba', () => {
  const p = feliza([vencida()]), antes = JSON.stringify(p);
  const { undo } = Z.applyRenew(p, p.records[0], Z.renewPlan(p, p.records[0]), 'n1');
  assert.notEqual(JSON.stringify(p), antes);
  undo();
  assert.equal(JSON.stringify(p), antes);
  assert.equal(Z.summary(p).vacc, 'late');
});

test('solo se ofrece en vencidas, de hoy o de los próximos 14 días', () => {
  assert.ok(Z.renewable({ next: hoy }));
  assert.ok(Z.renewable({ next: Z.inDays(14) }));
  assert.ok(!Z.renewable({ next: Z.inDays(15) }));
  assert.ok(!Z.renewable({ next: '' }));
  assert.equal(Z.art({ type: 'vacuna', name: 'Triple felina' }), 'la Triple felina');
  assert.equal(Z.art({ type: 'control', name: 'Control anual' }), 'el Control anual');
  assert.equal(Z.art({ type: 'desparasitacion', name: 'Pipeta antipulgas' }), 'la Pipeta antipulgas');
});
