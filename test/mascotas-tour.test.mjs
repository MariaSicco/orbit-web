/* Mimitos · introducción de bienvenida (assets/js/mascotas-f-tour.js, interruptor FEATURES.tour).
   El recorrido en sí se prueba en Chrome (capturas en reports/qa/2026-10-15-mimitos-tour/ del workspace);
   acá: que el doc guarde doc.seen.tour, que se enganche donde corresponde y que cumpla lo de accesibilidad. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
for (const k of ['KV_REST_API_URL', 'KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN']) delete process.env[k];
const { cleanDoc } = await import('../api/mascotas.js');
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const tour = read('assets/js/mascotas-f-tour.js'), app = read('assets/js/mascotas-app.js');

test('el doc guarda solo la fecha en que vio la introducción', () => {
  assert.deepEqual(cleanDoc({ pets: [], seen: { tour: '2026-10-15', otra: 'x' } }).seen, { tour: '2026-10-15' });
  assert.equal(cleanDoc({ pets: [], seen: { tour: '<script>' } }).seen, undefined);
  assert.equal(cleanDoc({ pets: [] }).seen, undefined);
});

test('interruptor prendido, con versión y archivos propios', () => {
  assert.match(app, /const FEATURES = \{[^}]*tour: true[^}]*\}/);
  assert.match(app, /const FEATV = \{[^}]*tour: 1[^}]*\}/);
  assert.ok(existsSync(new URL('../assets/css/mascotas-f-tour.css', import.meta.url)));
  assert.match(tour, /if \(!A \|\| !Z \|\| !F \|\| !F\.on\.tour\) return;/);
  assert.match(app, /\(FEAT\.hooks\.afterRender \|\| \[\]\)\.forEach/);
  assert.match(app, /\(FEAT\.hooks\.afterReset \|\| \[\]\)\.forEach/);
});

test('una sola vez: doc.seen.tour y localStorage; Ver de nuevo en Cuenta; Empezar de cero la vuelve a mostrar', () => {
  assert.match(tour, /A\.doc\?\.seen\?\.tour\) \|\| Boolean\(A\.store\.get\(KEY\)\)/);
  assert.match(tour, /A\.doc\.seen = \{ \.\.\.\(A\.doc\.seen \|\| \{\}\), tour: d \};\s*A\.changed\(\);/);
  assert.match(tour, /Ver la introducción de nuevo/);
  assert.match(tour, /afterReset[\s\S]*removeItem\('mimitos:' \+ KEY\)/);
});

test('accesible: dialog modal, Esc salta, foco atrapado, anuncio del paso y movimiento reducido', () => {
  assert.match(tour, /role="dialog" aria-modal="true" aria-labelledby="tourT" aria-describedby="tourD"/);
  assert.match(tour, /e\.key === 'Escape'[^\n]*close\(\)/);
  assert.match(tour, /e\.key === 'Tab'/);
  assert.match(tour, /aria-live="polite"/);
  assert.match(tour, /setAttribute\('inert', ''\)/);
  assert.match(read('assets/css/mascotas-f-tour.css'), /prefers-reduced-motion:reduce/);
  for (const t of ['Siguiente', 'Atrás', 'Saltar', '${s.i + 1} de ${total}']) assert.ok(tour.includes(t), t);
});

test('paradas: celu y compu, Me fui solo si está habilitado, y cierra con una acción', () => {
  for (const id of ['ficha', 'estado', 'cargar', 'libreta', 'agenda', 'preguntar', 'mefui', 'cuenta']) assert.match(tour, new RegExp(`id: '${id}'`));
  assert.match(tour, /'\.top \.btn\.lime\[data-act=add\]', '#nav \.nav-plus'/);
  assert.match(tour, /when: \(\) => A\.mefui/);
  assert.match(tour, /Cargar su vacuna/);
  assert.match(tour, /A\.recForm\(p\)/);
  assert.match(app, /petForm, recForm, exportCopy/);
  /* que el archivo compile: un string partido en dos líneas dejaba la app en blanco */
  assert.doesNotThrow(() => new Function(tour));
});
