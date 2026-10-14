/* Mimitos · catálogo de alimentos de Argentina (assets/data/alimentos-ar.json + mascotas-food.js).
   Autocompleta la bolsa y muestra un precio de referencia con su fuente. No recomienda nada. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import '../assets/js/mascotas-rules.js';
import '../assets/js/mascotas-core.js';
import '../assets/js/mascotas-food.js';
import { cleanDoc } from '../api/mascotas.js';
import { buildContext, ASK_SYSTEM } from '../api/_lib/petask.js';

const R = globalThis.MZRULES, Z = globalThis.MZ, F = globalThis.MZFOOD;
const DIR = new URL('../assets/data/', import.meta.url);
const index = JSON.parse(readFileSync(new URL('alimentos-ar.json', DIR), 'utf8'));
const parts = Object.fromEntries(Object.entries(index.parts).map(([sp, f]) => [sp, { file: new URL(f, DIR), data: JSON.parse(readFileSync(new URL(f, DIR), 'utf8')) }]));

/* catálogo chico de prueba: no son precios reales */
const FIX = { updated: '2026-10-14', items: [
  { id: 'marca-a-adulto-15', brand: 'Marca A', line: 'Linea', variant: 'Adulto', species: 'perro', stage: 'adulto', sizeKg: 15, priceArs: 50000, priceSource: { store: 'Tienda X', url: 'https://tienda.example/a15', date: '2026-10-14' } },
  { id: 'marca-a-cachorro-3', brand: 'Marca A', line: 'Linea', variant: 'Cachorro', species: 'perro', stage: 'cachorro', sizeKg: 3, priceArs: 15000, priceSource: { store: 'Tienda X', url: 'https://tienda.example/a3', date: '2026-10-14' } },
  { id: 'marca-a-senior-7-5', brand: 'Marca A', line: 'Linea', variant: 'Senior', species: 'perro', stage: 'senior', sizeKg: 7.5 },
  { id: 'marca-a-gato-1', brand: 'Marca A', line: 'Linea', variant: 'Gato adulto', species: 'gato', stage: 'adulto', sizeKg: 1, priceArs: 9000, priceSource: { store: 'Tienda Y', url: 'https://tienda.example/g1', date: '2026-10-14' } },
  { id: 'marca-b-todas-20', brand: 'Marca B', line: '', variant: 'Todas las edades', species: 'perro', stage: 'todas', sizeKg: 20 },
  { id: 'mala-sin-especie', brand: 'Mala', variant: 'x', species: 'loro', sizeKg: 1 },
  { id: 'mala-precio-http', brand: 'Mala', variant: 'y', species: 'perro', stage: 'adulto', sizeKg: 2, priceArs: 100, priceSource: { store: 'Z', url: 'http://inseguro', date: '2026-10-14' } },
] };

test('el JSON real: índice + una parte por especie, cada una de menos de 150 KB, y cada precio con tienda, URL https y fecha', () => {
  assert.match(index.updated, /^\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual(Object.keys(index.parts).sort(), ['gato', 'perro']);
  const ids = new Set();
  for (const [sp, { file, data }] of Object.entries(parts)) {
    assert.ok(statSync(file).size < 150 * 1024, `${sp}: menos de 150 KB`);
    assert.equal(data.updated, index.updated); assert.equal(data.species, sp);
    const c = F.clean(data);
    assert.equal(c.items.length, data.items.length, `${sp}: ninguna fila se descarta por inválida`);
    assert.equal(index.counts[sp], data.items.length);
    for (const it of data.items) {
      assert.ok(!ids.has(it.id), 'id repetido ' + it.id); ids.add(it.id);
      assert.match(it.id, /^[a-z0-9][a-z0-9-]{1,63}$/, it.id);
      assert.equal(it.species, sp, it.id);
      assert.ok(['cachorro', 'adulto', 'senior', 'todas'].includes(it.stage), it.id);
      assert.ok(it.sizeKg > 0, it.id);
      if (it.priceArs != null) {
        assert.ok(Number.isInteger(it.priceArs) && it.priceArs > 0, it.id);
        assert.ok(it.priceSource && it.priceSource.store && /^https:\/\//.test(it.priceSource.url) && /^\d{4}-\d{2}-\d{2}$/.test(it.priceSource.date), it.id);
      } else assert.equal(it.priceSource, undefined, `${it.id}: sin precio no lleva fuente`);
    }
  }
});

test('load: trae el índice y solo la parte de la especie, una vez; si falla devuelve null (queda el texto libre)', async () => {
  F._reset(); const asked = [];
  const fake = async url => { asked.push(url); return { ok: true, json: async () => url.endsWith('/alimentos-ar.json') ? { updated: '2026-10-14', parts: { perro: 'p.json', gato: 'g.json' } } : FIX }; };
  const ok = await F.load('perro', fake);
  await F.load('perro', fake);
  assert.deepEqual(asked, ['/assets/data/alimentos-ar.json', '/assets/data/p.json']);
  assert.ok(ok.items.every(i => i.species === 'perro'), 'solo perro');
  assert.equal(ok.items.length, 5, 'descarta el gato y la fila sin especie válida');
  assert.equal(F.byId(ok, 'mala-precio-http').priceArs, undefined, 'un precio sin fuente https no se muestra');
  const gato = await F.load('gato', fake);
  assert.deepEqual(gato.items.map(i => i.id), ['marca-a-gato-1']);
  assert.equal(await F.load('otra', fake), null, 'otras especies: sin catálogo');
  F._reset();
  assert.equal(await F.load('perro', async () => { throw new Error('sin conexión'); }), null);
  assert.equal(await F.load('perro', async () => ({ ok: false })), null);
  assert.equal(await F.load('perro', async () => ({ ok: true, json: async () => ({ parts: { perro: '../../secreto' } }) })), null, 'nombre de parte raro');
  F._reset();
});

test('filtra por la especie de la mascota y prioriza su etapa', () => {
  const c = F.clean(FIX);
  assert.deepEqual(F.search(c, 'marca a', { species: 'gato' }).map(i => i.id), ['marca-a-gato-1']);
  assert.deepEqual(F.search(c, 'marca', { species: 'perro', stage: 'cachorro' }).map(i => i.id)[0], 'marca-a-cachorro-3');
  assert.deepEqual(F.search(c, 'marca', { species: 'perro', stage: 'senior' }).map(i => i.id).slice(0, 2), ['marca-a-senior-7-5', 'marca-b-todas-20']);
  assert.deepEqual(F.search(c, 'marca', { species: 'perro', stage: 'adulto' }).map(i => i.id).slice(0, 2), ['marca-a-adulto-15', 'marca-b-todas-20']);
  assert.deepEqual(F.search(c, 'linea 7,5', { species: 'perro' }).map(i => i.id), ['marca-a-senior-7-5'], 'busca por kg con coma');
  assert.deepEqual(F.search(c, 'línea ADULTO 15', { species: 'perro' }).map(i => i.id), ['marca-a-adulto-15'], 'sin tildes ni mayúsculas');
  assert.deepEqual(F.search(c, 'marca', { species: 'otra' }), [], 'otras especies: sin catálogo');
  assert.deepEqual(F.search(c, '', { species: 'perro' }), []);
  assert.deepEqual(F.search(null, 'marca', { species: 'perro' }), []);
});

test('etapa por la edad: cachorro hasta el año, senior desde los 7', () => {
  const hoy = new Date(2026, 9, 14);
  assert.equal(F.stageOf({ birth: '2026-03-01' }, hoy), 'cachorro');
  assert.equal(F.stageOf({ birth: '2025-10-14' }, hoy), 'adulto');
  assert.equal(F.stageOf({ birth: '2019-10-15' }, hoy), 'adulto');
  assert.equal(F.stageOf({ birth: '2019-10-14' }, hoy), 'senior');
  assert.equal(F.stageOf({ birth: '' }, hoy), '');
});

test('al elegir: completa marca y variedad, kg y el precio sugerido con su fuente', () => {
  const c = F.clean(FIX);
  const pf = F.prefill(F.byId(c, 'marca-a-adulto-15'));
  assert.deepEqual(pf, { brand: 'Marca A Linea Adulto', kg: 15, price: 50000, cat: 'marca-a-adulto-15', ref: { price: 50000, store: 'Tienda X', date: '2026-10-14', url: 'https://tienda.example/a15' } });
  assert.equal(F.refText(F.byId(c, 'marca-a-adulto-15')), 'Precio de referencia: $50.000 en Tienda X · al 14/10/2026');
  const sin = F.prefill(F.byId(c, 'marca-a-senior-7-5'));
  assert.equal(sin.price, null); assert.equal(sin.ref, null); assert.equal(sin.kg, 7.5);
  assert.equal(F.NOTE('2026-10-14'), 'Los precios son de referencia, sacados de tiendas online el 14/10/2026. Pueden variar.');
});

test('"Otro": sin resultados queda el texto libre y la bolsa se guarda sin id de catálogo', () => {
  const c = F.clean(FIX);
  assert.deepEqual(F.search(c, 'alimento casero de la vecina', { species: 'perro' }), []);
  const p = { food: { bags: [] }, expenses: [] };
  Z.addBag(p, { date: '2026-10-01', kg: 10, brand: 'Alimento casero de la vecina', price: 20000 });
  assert.deepEqual(p.food.bags[0], { date: '2026-10-01', kg: 10, brand: 'Alimento casero de la vecina', price: 20000 });
});

test('bolsa del catálogo: guarda el id y el precio de referencia; cleanDoc lo conserva y filtra ids raros', () => {
  const p = { food: { bags: [] }, expenses: [] };
  Z.addBag(p, { date: '2026-09-01', kg: 15, brand: 'Marca A Linea Adulto', price: 48000, cat: 'marca-a-adulto-15', refPrice: 50000, refStore: 'Tienda X', refDate: '2026-10-14' });
  assert.equal(R.bagsOf(p.food)[0].cat, 'marca-a-adulto-15');
  assert.equal(R.bagsOf(p.food)[0].refPrice, 50000);
  const c = cleanDoc({ pets: [{ id: 'p1', name: 'Toto', food: { ...p.food, bags: [...p.food.bags, { date: '2026-10-01', kg: 15, cat: '<script>', refPrice: 1 }] } }] });
  const b = c.pets[0].food.bags;
  assert.deepEqual(b[0], { date: '2026-09-01', kg: 15, brand: 'Marca A Linea Adulto', price: 48000, cat: 'marca-a-adulto-15', refPrice: 50000, refStore: 'Tienda X', refDate: '2026-10-14' });
  assert.equal(b[1].cat, undefined, 'un id inválido no entra'); assert.equal(b[1].refPrice, undefined);
});

test('bolsas viejas sin id de catálogo: siguen aprendiendo y Mimitos las cita igual', () => {
  const viejo = { pets: [{ id: 'p1', name: 'Luna', species: 'perro', food: { brand: 'Una marca', bagKg: 15, opened: '2026-09-05', bags: [{ date: '2026-08-01', kg: 15, brand: 'Una marca', price: 40000 }, { date: '2026-09-05', kg: 15, brand: 'Una marca', price: 42000 }] } }] };
  const c = cleanDoc(viejo);
  assert.deepEqual(c.pets[0].food.bags[1], { date: '2026-09-05', kg: 15, brand: 'Una marca', price: 42000 });
  assert.equal(R.foodLearn(c.pets[0].food).days, 35);
  const ctx = buildContext(c, { question: '¿cuánto pagué la bolsa?', now: new Date('2026-10-14T15:00:00Z') });
  assert.match(ctx.text || ctx.context || JSON.stringify(ctx), /Bolsa de alimento abierta el 2026-09-05 · 15 kg · \\?"Una marca\\?" · pagó \$42\.000/);
  assert.doesNotMatch(JSON.stringify(ctx), /precio de referencia/);
});

test('Preguntale a Mimitos: cita marca y precio de referencia de la bolsa, y no recomienda alimentos', () => {
  const doc = { pets: [{ id: 'p1', name: 'Toto', species: 'perro', food: { brand: 'Marca A Linea Adulto', bagKg: 15, opened: '2026-10-01', bags: [{ date: '2026-10-01', kg: 15, brand: 'Marca A Linea Adulto', price: 48000, cat: 'marca-a-adulto-15', refPrice: 50000, refStore: 'Tienda X', refDate: '2026-10-14' }] } }] };
  const ctx = JSON.stringify(buildContext(cleanDoc(doc), { question: '¿qué alimento le compro?', now: new Date('2026-10-14T15:00:00Z') }));
  assert.match(ctx, /pagó \$48\.000 · precio de referencia \$50\.000 en Tienda X al 2026-10-14 \(tienda online, puede variar\)/);
  assert.match(ASK_SYSTEM, /No recomiendes, compares ni sugieras marcas o alimentos/);
});
