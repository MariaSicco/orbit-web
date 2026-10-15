/* Mimitos v33: los 4 arreglos chicos antes del congelamiento (revisión integral, bloque 6) */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

const rd = f => readFile(new URL('../' + f, import.meta.url), 'utf8');
const app = await rd('assets/js/mascotas-app.js'), mf = await rd('assets/js/mascotas-mefui.js'), css = await rd('assets/css/mascotas.css');
const inicio = app.slice(app.indexOf('function renderInicio('), app.indexOf('/* Inicio: foto grande'));

test('E8: "Algo pasó" sale de la barra de escritorio (sigue en Inicio y primero en "Cargar algo") y el logo no se tapa', () => {
  assert.doesNotMatch(app, /al-top/);
  assert.match(app, /opt\('algo', 'alert', 'perdida', 'Algo pasó'/);
  assert.match(inicio, /class="algo-cta span2" data-act="algo"/);
  assert.match(css, /\.top>\.tnav-box\{justify-content:safe center\}/);
  assert.doesNotMatch(css, /\.brand \.by\{display:none\}\n/, '"by Orbit" se ve desde 1024');
});

test('E9: "Me fui" sin emojis; la casa con la puerta abierta es un ícono de línea', async () => {
  assert.doesNotMatch(mf, /🏠|📷/);
  assert.match(mf, /mf-cam-ic" aria-hidden="true">\$\{I\('away'\)\}/);
  assert.match(await rd('assets/js/mascotas-core.js'), /away: '<path/);
});

test('Inicio: sin el bloque "Salud" ni la tarjeta de la libreta, sin perder lo que mostraban', () => {
  assert.doesNotMatch(inicio, /h-health|bookcard/);
  assert.match(inicio, /activeMeds\.map\(m => \(\{ html: medRow\(p, m\) \}\)\)/, 'los remedios en curso pasan a "Hoy y estos días"');
  assert.match(inicio, /Problemas: \$\{sm\.active/); assert.match(inicio, /Alergias: \$\{p\.allergies\}/);
  assert.match(inicio, /'Antecedentes', salud \? esc\(salud\)/);
});

test('Exportar copia: nada promete que se restaura (app, ficha, mails y toasts)', async () => {
  const files = ['assets/js/mascotas-app.js', 'assets/js/products.js', 'api/_lib/catalog.js', 'mascotas.html', 'producto.html', 'privacidad.html', 'terminos.html',
    ...(await readdir(new URL('../api/', import.meta.url), { recursive: true })).filter(f => f.endsWith('.js')).map(f => 'api/' + f)];
  for (const f of files) {
    const s = await rd(f).catch(() => '');
    assert.doesNotMatch(s, /te la restauramos|la restauramos|te la recuperamos|restaurar (desde )?(una|la|tu) copia|volver a cargar(la)? cuando/i, f);
  }
  assert.match(app, /Todavía no se puede volver a cargar en la app\./);
});
