/* Mimitos · el alimento aprende cuánto le dura a cada mascota.
   La cuenta vive en mascotas-rules.js: la usan la app (Z.food), el cron (dueToday) y Preguntale a Mimitos. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../assets/js/mascotas-rules.js';
import '../assets/js/mascotas-core.js';
import { dueToday } from '../api/_lib/petpush.js';
import { cleanDoc } from '../api/mascotas.js';
import { buildContext } from '../api/_lib/petask.js';

const R = globalThis.MZRULES, Z = globalThis.MZ;
const add = (s, n) => { const d = new Date(s + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const seq = (start, gaps, kg = 15) => gaps.reduce((a, g) => [...a, { date: add(a.at(-1).date, g), kg }], [{ date: start, kg }]);

test('promedio de días entre bolsas, sin los atípicos', () => {
  // 34, 33, 35 son normales; 5 (menos de la mitad) y 90 (más del doble) se ignoran
  const L = R.foodLearn({ bags: seq('2026-01-01', [34, 5, 33, 90, 35]) });
  assert.equal(L.src, 'aprendido');
  assert.equal(L.n, 3);
  assert.equal(L.days, 34);
  assert.equal(L.end, add(L.opened, 34));
});

test('si cambia el tamaño de la bolsa, normaliza por kg', () => {
  // dos bolsas de 15 kg duraron 30 días (2 días por kg); ahora abrió una de 7,5 kg: le dura 15
  const bags = [{ date: '2026-01-01', kg: 15 }, { date: '2026-01-31', kg: 15 }, { date: '2026-03-02', kg: 7.5 }];
  const L = R.foodLearn({ bags });
  assert.equal(L.days, 15);
  assert.equal(L.bagKg, 7.5);
  assert.equal(L.n, 2);
});

test('sin gramos por día: con una bolsa todavía no sabe, desde la segunda sí', () => {
  const p = { food: { bags: [] }, expenses: [] };
  Z.addBag(p, { date: '2026-09-01', kg: 15 });                     // "compré hoy, 15 kg"
  assert.equal(R.foodLearn(p.food).days, 0);
  assert.equal(Z.food(p.food), null);
  Z.addBag(p, { date: '2026-10-05', kg: 15 });
  const f = R.foodLearn(p.food);
  assert.equal(f.src, 'aprendido'); assert.equal(f.days, 34); assert.equal(p.food.opened, '2026-10-05');
});

test('lo aprendido manda sobre la cuenta por gramos', () => {
  const food = { bagKg: 15, dailyG: 300, opened: '2026-03-02', bags: seq('2026-01-01', [30, 30]) };
  assert.equal(Math.floor(15000 / 300), 50);
  assert.equal(R.foodLearn(food).days, 30);
  assert.equal(R.foodLearn({ bagKg: 15, dailyG: 300, opened: '2026-03-02' }).days, 50);   // sin historial, por gramos
});

test('el cron avisa 5 días antes y el día con la fecha aprendida, con el mismo tag', () => {
  const bags = seq('2026-07-01', [34, 34, 34]);      // última abierta el 2026-09-12
  const doc = { pets: [{ id: 'p1', name: 'Feliza', records: [], food: { bagKg: 15, dailyG: 200, opened: bags.at(-1).date, bags } }] };
  const end = add(bags.at(-1).date, 34);
  const five = dueToday(doc, add(end, -5)), zero = dueToday(doc, end);
  assert.equal(five.length, 1); assert.equal(zero.length, 1);
  assert.equal(five[0].tag, `food:p1:${bags.at(-1).date}:5`);
  assert.equal(zero[0].tag, `food:p1:${bags.at(-1).date}:0`);
  assert.equal(dueToday(doc, add(bags.at(-1).date, 75 - 5)).length, 0);   // por gramos (75 días) ya no avisa
  // la app calcula la misma fecha
  assert.equal(Z.iso(Z.food(doc.pets[0].food).end), end);
});

test('gasto de alimento → pregunta si abrió una bolsa, prellenada', () => {
  const p = { food: { bagKg: 15, brand: 'Royal Canin', opened: '2026-09-01', bags: [] }, expenses: [] };
  const e = { id: 'g', cat: 'alimento', amount: 38000, date: '2026-10-05' };
  assert.deepEqual(Z.bagPrompt(p, e), { date: '2026-10-05', kg: 15, brand: 'Royal Canin', price: 38000 });
  assert.equal(Z.bagPrompt(p, { ...e, cat: 'veterinaria' }), null);
  Z.addBag(p, Z.bagPrompt(p, e));
  assert.equal(Z.bagPrompt(p, e), null);                            // ya está anotada: no vuelve a preguntar
  assert.deepEqual(p.food.bags.map(b => b.date), ['2026-09-01', '2026-10-05']);
  assert.equal(R.foodLearn(p.food).days, 34);
  assert.equal(Math.round(R.foodLearn(p.food).perDay), Math.round(38000 / 34));   // la primera no tenía precio: usa la actual
});

test('gastos: alimento por mes y costo por día', () => {
  const p = { food: { bags: [{ date: '2026-08-01', kg: 15, price: 34000 }, { date: '2026-09-04', kg: 15, price: 36000 }, { date: '2026-10-08', kg: 15, price: 38000 }] },
    expenses: [{ cat: 'alimento', amount: 36000, date: '2026-09-04' }, { cat: 'alimento', amount: 38000, date: '2026-10-08' }, { cat: 'veterinaria', amount: 25000, date: '2026-10-03' }] };
  const sp = Z.foodSpend(p, '2026-10');
  assert.equal(sp.month, 38000); assert.equal(sp.avg, 37000); assert.equal(sp.months, 2);
  assert.equal(Math.round(sp.perDay), Math.round((34000 / 34 + 36000 / 34) / 2));
});

test('deshacer una bolsa deja el alimento como estaba', () => {
  const p = { food: { bagKg: 15, dailyG: 300, opened: '2026-09-01', brand: 'X', bags: [] } };
  const antes = JSON.stringify(p.food);
  const undo = Z.addBag(p, { date: '2026-10-01', kg: 10 });
  assert.equal(p.food.bagKg, 10);
  undo();
  assert.equal(JSON.stringify(p.food), antes);
});

test('docs viejos: sin bags siguen andando igual y cleanDoc agrega el historial vacío', () => {
  const viejo = { pets: [{ id: 'p1', name: 'Luna', food: { brand: 'X', bagKg: 15, dailyG: 300, opened: '2026-09-01' } }] };
  const c = cleanDoc(viejo);
  assert.deepEqual(c.pets[0].food.bags, []);
  assert.equal(R.foodLearn(c.pets[0].food).days, 50);
  assert.equal(R.foodLearn(c.pets[0].food).src, 'gramos');
  const many = cleanDoc({ pets: [{ id: 'p1', name: 'Luna', food: { bags: Array.from({ length: 70 }, (_, i) => ({ date: add('2020-01-01', i * 30), kg: 15, price: 'x' })) } }] });
  assert.equal(many.pets[0].food.bags.length, 50);
  assert.equal(many.pets[0].food.bags[0].price, null);
});

test('Preguntale a Mimitos: tiene la duración aprendida y cada bolsa para citar', () => {
  const bags = seq('2026-06-01', [34, 33, 35, 34]);
  const doc = { pets: [{ id: 'p1', name: 'Feliza', species: 'gato', records: [], food: { brand: 'Royal Canin', bagKg: 15, opened: bags.at(-1).date, bags } }] };
  const ctx = buildContext(doc, { question: '¿cuánto le dura la bolsa?', now: new Date('2026-10-14T15:00:00Z') });
  assert.match(ctx.text, /le dura en promedio 34 días \(según sus últimas 4 bolsas\)/);
  assert.match(ctx.text, new RegExp(`Bolsa de alimento abierta el ${bags[0].date}`));
  const bagRef = Object.values(ctx.refs).find(r => r.label === 'Bolsa de alimento');
  assert.equal(bagRef.section, 'gastos');
});
