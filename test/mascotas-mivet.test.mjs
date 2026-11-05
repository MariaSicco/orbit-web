/* Mimitos · WhatsApp con fijos y "Mi veterinaria" / "Mi guardia 24 h" a la vista.
   - Parser waTarget con números reales de Corrientes, CABA, Córdoba, Rosario y Mendoza.
   - Botones: celular → "WhatsApp" principal; fijo o dudoso → "Llamar" + "Probar por WhatsApp" con aclaración.
   - Tarjetas en Inicio (compacta), arriba en "Veterinarias cerca" y en "Datos y veterinaria", con Cambiar y Quitar.
   - Guardar muestra el aviso con "Ver"; "Pedir turno" desde una vencida va directo a Mi veterinaria.
   Correr con: node --test test/mascotas-mivet.test.mjs */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

await import('../assets/js/mascotas-turnos.js');
const T = globalThis.MZTURNOS;

test('parser: celulares con 15 o +54 9 → 54 9 + área + número, sin 0 ni 15', () => {
  const cel = {
    '0379 15-412-3456': '5493794123456', '+54 9 379 412-3456': '5493794123456', '(0379) 154123456': '5493794123456',
    '011 15-2345-6789': '5491123456789', '+54 9 11 2345-6789': '5491123456789', '5491123456789': '5491123456789',
    '0351 15-512-3456': '5493515123456', '+54 9 351 512-3456': '5493515123456',
    '0341 15-612-3456': '5493416123456', '+54 9 341 612-3456': '5493416123456',
    '0261 15-412-3456': '5492614123456', '+54 9 261 412-3456': '5492614123456',
    '2944 15 12-3456': '5492944123456',
  };
  for (const [ph, n] of Object.entries(cel)) assert.deepEqual({ ...T.waTarget(ph) }, { n, mobile: true }, ph);
});

test('parser: fijos (o sin forma de saber) → 54 + área sin 0 + número', () => {
  const fijo = {
    '0379 442-1234': '543794421234', '+54 379 442-1234': '543794421234', '379 4421234': '543794421234', '(0379) 4421234': '543794421234',
    '011 4567-8901': '541145678901', '+54 11 4567-8901': '541145678901', '11 4567 8901': '541145678901',
    '0351 422-1234': '543514221234', '+54 351 422-1234': '543514221234',
    '0341 421-1234': '543414211234', '+54 341 421-1234': '543414211234',
    '0261 425-1234': '542614251234', '+54 261 425-1234': '542614251234',
  };
  for (const [ph, n] of Object.entries(fijo)) assert.deepEqual({ ...T.waTarget(ph) }, { n, mobile: false }, ph);
});

test('parser: lo que no sirve queda sin WhatsApp (solo Llamar)', () => {
  for (const ph of ['', '   ', '+598 99 123 456', '+1 305 555 0101', '4567-8901', '15 4123-4567', '0379 442-12', '0379 442-123456', '0800 333 1234', '911'])
    assert.equal(T.waTarget(ph), null, ph);
  assert.equal(T.waPhone('0379 442-1234'), '', 'waPhone sigue siendo solo celulares');
  assert.equal(T.waPhone('0379 15-412-3456'), '5493794123456');
});

/* ---------- front: mascotas-vets.js real en un DOM mínimo ---------- */
function front({ vet = {}, records = [], route = 'inicio' } = {}) {
  const L = { click: [] }, toasts = [], gone = [], panels = [], body = {};
  let saves = 0;
  const pet = { id: 'aika0001', name: 'Aika', species: 'perro', vet: { ...vet }, records };
  const doc = { pets: [pet], appointments: [] };
  const app = { name: route };
  const win = {
    MZ: { esc: x => String(x ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])), fmt: x => x, iso: d => new Date(d).toISOString().slice(0, 10), icon: n => `<svg data-i="${n}"></svg>`, today: () => new Date('2026-10-15T12:00:00'), TYPE: { vacuna: 'Vacuna' } },
    MZTURNOS: T,
    MZAPP: { render() {}, petById: () => pet, curPet: () => pet, toast: (m, a) => toasts.push({ m, a }), go: (n, a) => { gone.push([n, a]); app.name = n; }, changed() { saves++; }, panel: (t, h) => panels.push({ t, h }), dPanel: { close() {} }, get route() { return app; }, get doc() { return doc; } },
  };
  const ctx = { window: win, console, JSON, Math, Date, Number, String, Object, Array, Map, Set, Boolean, Promise, RegExp, encodeURIComponent, setTimeout, clearTimeout,
    crypto: { randomUUID: () => 'x' }, requestAnimationFrame: f => f(),
    document: { querySelector: s => s === '#app' ? { contains: () => true } : s === '#pBody' ? body : null, addEventListener: (t, f) => (L[t] ||= []).push(f) },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    fetch: async () => ({ ok: true, status: 200, json: async () => ({ ready: false }) }) };
  runInNewContext(readFileSync(new URL('../assets/js/mascotas-vets.js', import.meta.url), 'utf8'), ctx);
  const V = win.MZVETS;
  return { V, pet, toasts, gone, panels, saves: () => saves,
    sheet(vp) { const b = { dataset: { vp }, disabled: false, innerHTML: '' }; body.onclick({ target: { closest: s => s === '[data-vp]' ? b : null } }); return b; },
    click(vx, data = {}) { const b = { dataset: { vx, ...data } }; for (const f of L.click) f({ target: { closest: s => s === '[data-vx]' ? b : null }, preventDefault() {} }); } };
}
const btn = (html, ct) => (html.match(new RegExp(`<a [^>]*data-ct="${ct}"[^>]*>[^<]*(?:<svg[^>]*></svg>)?([^<]*)</a>`)) || [])[1]?.trim();
const href = (html, ct) => ((html.match(new RegExp(`<a [^>]*href="([^"]+)"[^>]*data-ct="${ct}"`)) || [])[1] || '').replace(/&amp;/g, '&');

test('botón: celular → "Pedir turno por WhatsApp" principal y Llamar secundario', () => {
  const f = front({ vet: { name: 'Veterinaria del Litoral', phone: '0379 15-412-3456', address: 'Junín 1200, Corrientes' } });
  const h = f.V.mineCards(f.pet, 'datos');
  assert.equal(btn(h, 'wa-cel'), 'Pedir turno por WhatsApp');
  assert.ok(!/data-ct="wa-fijo"/.test(h) && !/Si no tiene WhatsApp/.test(h));
  assert.match(href(h, 'wa-cel'), /^https:\/\/wa\.me\/5493794123456\?text=Hola%2C%20quer%C3%ADa%20pedir%20un%20turno%20para%20Aika%20\(perro\)/);
  assert.match(h, /class="btn ghost" href="tel:037915-?4123456"|class="btn ghost" href="tel:0379154123456"/);
  assert.ok(h.indexOf('data-ct="wa-cel"') < h.indexOf('data-ct="tel"'), 'WhatsApp primero');
});

test('botón: fijo de Corrientes → Llamar primero y "Probar por WhatsApp" con la aclaración', () => {
  const f = front({ vet: { name: 'Veterinaria Centro', phone: '0379 442-1234' } });
  const h = f.V.mineCards(f.pet, 'datos');
  assert.equal(btn(h, 'wa-fijo'), 'Probar por WhatsApp');
  assert.match(h, /Si no tiene WhatsApp, te va a avisar la app\./);
  assert.match(href(h, 'wa-fijo'), /^https:\/\/wa\.me\/543794421234\?text=/);
  assert.ok(h.indexOf('data-ct="tel"') < h.indexOf('data-ct="wa-fijo"'), 'Llamar primero');
  assert.match(h, /<a class="btn ghost" [^>]*data-ct="wa-fijo"/, 'WhatsApp secundario');
});

test('ficha de una veterinaria de Google con fijo: "Probar por WhatsApp", mensaje armado con el motivo de la vencida', async () => {
  const rec = { id: 'r1', type: 'vacuna', name: 'Antirrábica', next: '2026-10-02' };
  const f = front({ records: [rec], route: 'vets' });
  f.V.render(f.pet, 'aika0001|r1');
  f.V.state.res = { 'vet|-27.473,-58.835': [{ id: 'ChIJcentro', name: 'Veterinaria Centro', phone: '0379 442-1234', intl: '+54 379 442-1234', address: 'Junín 1200', detailed: true }] };
  f.V.state.coords = { lat: -27.473, lng: -58.835 };
  f.click('place', { i: '0' }); await new Promise(r => setTimeout(r, 0));
  const p = f.panels.at(-1); assert.ok(p, 'abrió la ficha');
  assert.equal(btn(p.h, 'wa-fijo'), 'Probar por WhatsApp');
  assert.match(p.h, /id="vxMsg"/, 'el mensaje se puede editar también para el fijo');
  assert.match(decodeURIComponent(href(p.h, 'wa-fijo')), /wa\.me\/543794421234\?text=Hola, quería pedir un turno para Aika \(perro\)\. Le toca la Antirrábica — vencida el 2 de octubre\./);
  assert.match(p.h, /data-ct="wa-fijo"[^>]*>|id="vxWa"/);
});

test('Mi veterinaria y Mi guardia: tarjeta compacta en Inicio, arriba en Veterinarias cerca y en Datos, con Cambiar y Quitar', () => {
  const f = front({ vet: { name: 'Veterinaria Centro', phone: '0379 442-1234', address: 'Junín 1200', er: 'Guardia Litoral 24 h', erPhone: '0379 15-400-0000' } });
  const home = f.V.mineCards(f.pet, 'home');
  assert.equal((home.match(/class="card vx-mine vx-mine-home/g) || []).length, 2, 'veterinaria y guardia');
  assert.equal(btn(home, 'wa-fijo'), 'Probar por WhatsApp');
  assert.match(home, /data-ct="dir"/); assert.match(home, /data-ct="tel"/);
  assert.equal((home.match(/data-vx="mineChange"/g) || []).length, 2);
  assert.equal((home.match(/data-vx="mineDel"/g) || []).length, 2);
  assert.ok(!/<h2/.test(home), 'compacta: sin título grande');
  const vets = f.V.render(f.pet, 'aika0001');
  assert.ok(vets.indexOf('data-mine="vet"') > 0 && vets.indexOf('data-mine="vet"') < vets.indexOf('vx-tabs'), 'arriba, antes de las pestañas y la lista');
  f.V.state.kind = 'er';
  assert.match(f.V.render(f.pet, 'aika0001'), /data-mine="er"/, 'en Guardias 24 h, la guardia');
  f.V.state.kind = 'vet';
  const datos = f.V.mineCards(f.pet, 'datos');
  assert.match(datos, /Mi veterinaria/); assert.match(datos, /Mi guardia 24 h/); assert.match(datos, /Cambiar/); assert.match(datos, /Quitar/);
});

test('Quitar con Deshacer; Cambiar lleva a buscar en la pestaña que corresponde', () => {
  const f = front({ vet: { name: 'Veterinaria Centro', phone: '0379 442-1234', er: 'Guardia Litoral', erPhone: '0379 15-400-0000' } });
  f.pet.vetPlace = { name: 'Veterinaria Centro', placeId: 'ChIJcentro' };
  f.click('mineDel', { k: 'vet', pet: 'aika0001' });
  assert.equal(f.pet.vet.name, ''); assert.equal(f.pet.vetPlace, undefined); assert.equal(f.pet.vet.er, 'Guardia Litoral', 'la guardia queda');
  assert.equal(f.toasts.at(-1).a.label, 'Deshacer');
  f.toasts.at(-1).a.fn();
  assert.equal(f.pet.vet.name, 'Veterinaria Centro'); assert.equal(f.pet.vetPlace.placeId, 'ChIJcentro');
  f.click('mineChange', { k: 'er', pet: 'aika0001' });
  assert.deepEqual(f.gone.at(-1), ['vets', 'aika0001']); assert.equal(f.V.state.kind, 'er');
});

test('guardar como mi veterinaria (y mi guardia): aviso "La vas a ver en Inicio y en la ficha" con "Ver"', async () => {
  for (const kind of ['vet', 'er']) {
    const f = front({ route: 'vets' });
    f.V.state.kind = kind; f.V.render(f.pet, 'aika0001');
    f.V.state.res = { [`${kind}|-27.473,-58.835`]: [{ id: 'ChIJcentro', name: 'Veterinaria Centro', phone: '0379 442-1234', intl: '+54 379 442-1234', address: 'Junín 1200', detailed: true }] };
    f.V.state.coords = { lat: -27.473, lng: -58.835 };
    f.click('place', { i: '0' }); await new Promise(r => setTimeout(r, 0));
    const b = f.sheet('save');
    assert.ok(b.disabled);
    const t = f.toasts.at(-1);
    assert.equal(t.m, kind === 'vet' ? 'Listo, Veterinaria Centro es tu veterinaria. La vas a ver en Inicio y en la ficha de Aika.' : 'Listo, Veterinaria Centro es tu guardia 24 h. La vas a ver en Inicio y en la ficha de Aika.');
    assert.equal(t.a.label, 'Ver');
    assert.match(f.V.mineCards(f.pet, 'home'), new RegExp(`data-mine="${kind}"`), 'ya aparece en Inicio');
    t.a.fn(); assert.deepEqual(f.gone.at(-1), ['inicio', undefined]);
  }
});

test('"Pedir turno" desde una vencida va directo a Mi veterinaria (celular y fijo)', async () => {
  const rec = { id: 'r1', type: 'vacuna', name: 'Antirrábica', next: '2026-10-02' };
  for (const [phone, ct] of [['0379 15-412-3456', 'wa-cel'], ['0379 442-1234', 'wa-fijo']]) {
    const f = front({ vet: { name: 'Veterinaria Centro', phone }, records: [rec] });
    await f.V.start(f.pet, rec, 'inicio');
    const p = f.panels.at(-1);
    assert.equal(p.t, 'Pedir turno en Veterinaria Centro');
    assert.match(p.h, new RegExp(`data-ct="${ct}"`));
    assert.match(decodeURIComponent(href(p.h, ct)), /Le toca la Antirrábica — vencida el 2 de octubre/);
    assert.equal(f.gone.length, 0, 'no manda a buscar');
  }
  const f = front({ records: [rec] });
  await f.V.start(f.pet, rec, 'inicio');
  assert.deepEqual(f.gone.at(-1), ['vets', 'aika0001|r1'], 'sin Mi veterinaria: a buscar');
});
