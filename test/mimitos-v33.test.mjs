/* Mimitos v33: los 4 arreglos chicos antes del congelamiento (revisión integral, bloque 6) */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

const rd = f => readFile(new URL('../' + f, import.meta.url), 'utf8');
const app = await rd('assets/js/mascotas-app.js'), mf = await rd('assets/js/mascotas-mefui.js'), css = await rd('assets/css/mascotas.css');
/* premium: Inicio se arma con varias funciones (hero, Esta semana, Algo pasó…) */
const inicio = app.slice(app.indexOf('/* ---------- INICIO (premium)'), app.indexOf('/* ---------- "Hoy con {mascota}"'));

test('E8: "Algo pasó" sale de la barra de escritorio (sigue en Inicio y primero en "Cargar algo") y el logo no se tapa', () => {
  assert.doesNotMatch(app, /al-top/);
  assert.match(app, /opt\('algo', 'alert', 'perdida', 'Algo pasó'/);
  assert.match(inicio, /class="algo-cta" data-act="algo"/);
  assert.match(css, /\.top>\.tnav-box\{justify-content:safe center\}/);
  /* premium: la hoja de estilos quedó una regla por línea; "by Orbit" solo se esconde por debajo de 400 px */
  for (const m of css.matchAll(/\.brand \.by\{display:none\}/g)) assert.match(css.slice(0, m.index).split('@media').pop(), /^\(max-width:400px\)/, '"by Orbit" se ve desde 1024');
});

test('E9: "Me fui" sin emojis; la casa con la puerta abierta es un ícono de línea', async () => {
  assert.doesNotMatch(mf, /🏠|📷/);
  assert.match(mf, /mf-cam-ic" aria-hidden="true">\$\{I\('away'\)\}/);
  assert.match(await rd('assets/js/mascotas-core.js'), /away: '<path/);
});

test('Inicio: sin el bloque "Salud" ni la tarjeta de la libreta, sin perder lo que mostraban', () => {
  assert.doesNotMatch(inicio, /h-health|bookcard/);
  /* premium: los remedios que tocan van a "Esta semana" con su "Ya está"; problemas, alergias y remedios de siempre viven en Salud */
  assert.match(inicio, /function weekItems[\s\S]*?medRow\(p, m\)/);
  assert.match(inicio, /data-act="give"/);
});

test('Exportar copia: nada promete que se restaura (app, ficha, mails y toasts)', async () => {
  const files = ['assets/js/mascotas-app.js', 'assets/js/products.js', 'api/_lib/catalog.js', 'mascotas.html', 'producto.html', 'privacidad.html', 'terminos.html',
    ...(await readdir(new URL('../api/', import.meta.url), { recursive: true })).filter(f => f.endsWith('.js')).map(f => 'api/' + f)];
  for (const f of files) {
    const s = await rd(f).catch(() => '');
    /* premium (F2): la app ya restaura sola desde Cuenta; nadie promete que "se la restauramos" nosotros */
    assert.doesNotMatch(s, /te la restauramos|la restauramos|te la recuperamos|volver a cargar(la)? cuando/i, f);
    if (f !== 'assets/js/mascotas-app.js') assert.doesNotMatch(s, /restaurar (desde )?(una|la|tu) copia/i, f);
  }
  assert.match(app, /function restorePreview\(/);
});
