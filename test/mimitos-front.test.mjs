// Front de Mimitos: el sello de la ficha (producto.html + products.js) sin tocar a las demás herramientas.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const ctx = { window: {} };
runInNewContext(readFileSync(new URL('../assets/js/products.js', import.meta.url), 'utf8'), ctx);
const P = ctx.window.ORBIT_PRODUCTS || ctx.window.ORBIT || [];
const list = Array.isArray(P) ? P : P.list || [];
const html = readFileSync(new URL('../producto.html', import.meta.url), 'utf8');
const src = ['TRUST_ARCHIVO', 'TRUST_HERRAMIENTA', 'TRUST'].map(k => html.match(new RegExp(`const ${k} = [^\\n]+`))[0]).join('\n');
const TRUST = runInNewContext(src + '\nTRUST');

test('ficha: Mimitos muestra "12 meses de funciones inteligentes" en vez de actualizaciones', () => {
  const m = list.find(p => p.id === 'ob-018');
  assert.ok(m, 'ob-018 está en products.js');
  const t = TRUST(m).map(x => x[0]);
  assert.ok(t.includes('12 meses de funciones inteligentes'));
  assert.ok(!t.includes('12 meses de actualizaciones'));
  assert.equal(JSON.stringify(TRUST(m)[2]), JSON.stringify(['12 meses de funciones inteligentes', '12 months of smart features']));
});

test('ficha: las demás herramientas con acceso siguen con "12 meses de actualizaciones"', () => {
  /* Mi Mes (ob-019) también tiene sello propio desde main; las que no tienen sello siguen con el genérico */
  const otras = list.filter(p => p.acceso && !p.sello);
  for (const p of otras.length ? otras : [{ id: 'x', acceso: '/x' }]) assert.equal(TRUST(p)[2][0], '12 meses de actualizaciones');
  assert.equal(TRUST({ id: 'archivo' })[0][0], 'Descarga inmediata');
  assert.ok(list.filter(p => p.sello).every(p => ['ob-018', 'ob-019'].includes(p.id)), 'solo Mimitos y Mi Mes tienen sello propio');
  assert.equal(TRUST(list.find(p => p.id === 'ob-018'))[2][0], '12 meses de funciones inteligentes');
});
