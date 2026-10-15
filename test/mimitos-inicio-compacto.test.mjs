/* Mimitos · Inicio compacto (15/10): "Hoy con…" en una línea con la próxima tarea a un toque, historial con los
   últimos 3 y "Ver todo", y topes en las secciones que crecían sin límite.
   Correr con: node --test test/mimitos-inicio-compacto.test.mjs */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const window = { MZ: { esc, icon: n => `<svg class="i" data-i="${n}"></svg>` } };
runInNewContext(readFileSync(new URL('../assets/js/mascotas-hoy.js', import.meta.url), 'utf8'), { window, document: {} });
const UI = window.MZHOYUI;
const it = (key, time, label, kind = 'comida', done = null) => ({ key, time, label, kind, done });

test('Hoy compacto: cuántas van, la próxima sin marcar con su tilde y "Ver el día"', () => {
  const hoy = { ymd: '2026-10-15', items: [it('a', '08:00', 'Desayuno', 'comida', { by: 'Vos', at: '2026-10-15T11:00:00Z' }), it('b', '09:00', 'Gotas', 'med'), it('c', '20:00', 'Cena')] };
  const h = UI.compact(hoy, 'Aika');
  assert.match(h, /1 de 3 hechas/);
  assert.equal((h.match(/data-hoy="/g) || []).length, 1, 'una sola tarea en Inicio');
  assert.match(h, /data-hoy="b"/, 'la próxima es la primera sin marcar (aunque esté atrasada)');
  assert.match(h, /aria-valuenow="1"/);
  assert.match(h, /data-to="hoy"[^>]*>Ver el día \(3\)/);
  const all = UI.compact({ items: hoy.items.map(i => ({ ...i, done: { by: 'Caro', at: '2026-10-15T23:00:00Z' } })) }, 'Aika');
  assert.match(all, /Todo hecho por hoy/); assert.doesNotMatch(all, /data-hoy=/);
  assert.match(UI.compact(null, 'Aika'), /Cargando el día/);
  assert.match(UI.compact({ items: [] }, 'Aika'), /No hay nada para hoy/);
  /* la lista completa sigue igual (pantalla Hoy y link del cuidador) */
  assert.equal((UI.html(hoy, 'Aika').match(/data-hoy="/g) || []).length, 3);
});

const js = readFileSync(new URL('../assets/js/mascotas-app.js', import.meta.url), 'utf8');
const fn = name => { const i = js.indexOf(`function ${name}(`); return js.slice(i, js.indexOf('\n}\n', i)); };

test('Inicio usa la versión compacta y hay pantallas completas de Hoy e Historial', () => {
  assert.match(fn('hoyBox'), /MZHOYUI\.compact\(/);
  assert.match(js, /case 'hoy': return renderHoy\(p\);/);
  assert.match(js, /case 'historial': return renderHistorial\(p\);/);
  assert.match(js, /TAB_OF = \{ hoy: 'inicio', historial: 'inicio',/);
  assert.match(fn('renderHoy'), /MZHOYUI\.html\(/, 'la pantalla Hoy muestra la lista entera');
  assert.match(fn('renderHistorial'), /historySection\(p, true\)/);
});

test('Historial en Inicio: los últimos 3 con "Ver todo el historial"; filtros y búsqueda en la pantalla completa', () => {
  assert.match(js, /const HIST_HOME = 3;/);
  const h = fn('historySection');
  assert.match(h, /all\.slice\(0, HIST_HOME\)/);
  assert.match(h, /Ver todo el historial/);
  const full = h.slice(h.indexOf('const years'));
  for (const s of ['id="histQ"', 'id="histY"', 'data-act="hfilter"']) assert.ok(full.includes(s), s);
  assert.match(fn('historyList'), /data-act="hmore"/, 'el historial completo pagina de a 60');
});

test('topes en Inicio: Últimos 7 días 3, Esta semana 5, Lo que anotó el cuidador 3, todos con "Ver más"', () => {
  assert.match(fn('weekCard'), /gs\.slice\(0, 3\)/); assert.match(fn('weekCard'), /data-act="histOf" data-f="sintoma"/);
  assert.match(js, /const WEEK_DAYS = 7, WEEK_MAX = 5;/);
  assert.match(fn('weekSection'), /items\.slice\(0, WEEK_MAX\)/); assert.match(fn('weekSection'), /en la Agenda/);
  assert.match(fn('sitterLog'), /all\.slice\(ui\.slogAll \? -30 : -3\)/); assert.match(fn('sitterLog'), /data-act="slogAll"/);
  const mf = readFileSync(new URL('../assets/js/mascotas-mefui.js', import.meta.url), 'utf8');
  assert.match(mf, /st\.events\.slice\(-3\)/, '"Lo último que escuchó": 3');
});

test('Inicio premium: 6 bloques, el estado solo en las tarjetas del hero y nada infantil', () => {
  const r = fn('renderInicio');
  for (const b of ['petHero(', 'weekSection(', 'algoBlock(', 'hoyBox(', 'MZAWAY.homeCard(', 'weightCard(', 'spendCard(']) assert.ok(r.includes(b), b);
  for (const gone of ['historySection(', 'bookcard', 'list quick', 'askBtn(', 'careCard(', 'h-health']) assert.ok(!r.includes(gone), gone);
  assert.match(r, /MZAWAY\.inUse/, 'Me fui en Inicio solo si está en uso');
  assert.match(fn('weekItems'), /heroIds\(p\)/, 'lo que tiene tarjeta arriba no se repite en Esta semana');
  const h = fn('petHero');
  assert.match(h, /p\.photoFull \|\| p\.photo/, 'la foto entera, a sangre');
  assert.match(h, /ph-ini/); assert.match(h, /Subí su foto/);
  assert.doesNotMatch(js, /CLOUDS|sin-foto\.svg|bienvenida\.svg/, 'sin nubes ni dibujos');
  assert.match(fn('hoyBox'), /items\?\.length/, 'Hoy con… solo si hay rutina');
  assert.match(fn('petMenu'), /sharePanel\(p\)/); assert.match(fn('petMenu'), /sitterPanel\(p\)/); assert.match(fn('petMenu'), /lostPanel\(p\)/);
});

test('CSS: Peso y Gastos lado a lado, tarjetas de estado por color y hojas con dvh', () => {
  const css = readFileSync(new URL('../assets/css/mascotas.css', import.meta.url), 'utf8');
  assert.match(css, /\.ms-pair\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  for (const t of ['late', 'soon', 'ok', 'none']) assert.match(css, new RegExp(`\\.pstat\\.t-${t}\\{--tc:`), t);
  assert.match(css, /max-height:94dvh/);
  assert.match(css, /\.two\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
});
