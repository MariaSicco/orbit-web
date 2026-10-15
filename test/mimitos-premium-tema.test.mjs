/* Mimitos premium (E3/E4/E7): un solo tema en tokens, escala de 6 tamaños y 3 pesos, y la cabecera con el color de la mascota.
   Correr con: node --test test/mimitos-premium-tema.test.mjs */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../assets/css/mascotas.css', import.meta.url), 'utf8');
const js = readFileSync(new URL('../assets/js/mascotas-app.js', import.meta.url), 'utf8');
const rootEnd = css.indexOf('}', css.indexOf(':root{'));
const body = css.slice(rootEnd + 1);
/* stickers, libreta impresa, pasaporte y PDF tienen su propia letra chica a propósito */
const KEEP = /\.stk|\.sheetdoc|\.lrib|\.cover|\.pp-|\.page-f|\.mf-code|\.ph-ini|#print|\.cref|\.cite \.n|\.pdf|\.passport|big-input/;
const rules = [...body.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(m => ({ sel: m[1].trim(), decl: m[2] }));

test('un solo :root y ningún color suelto fuera de los tokens', () => {
  assert.equal((css.match(/:root\{/g) || []).length, 1);
  assert.deepEqual(body.match(/#[0-9a-fA-F]{3,8}\b/g) || [], []);
  const hex = new Set((css.slice(0, rootEnd).match(/#[0-9a-fA-F]{6}\b/g) || []).map(h => h.toUpperCase()));
  assert.ok(hex.size <= 28, `${hex.size} colores en :root`);
  assert.doesNotMatch(css, /^(<{7}|={7}|>{7})/m, 'sin marcas de conflicto');
});

test('tipo: 12 / 14 / 16 / 20 / 28 / 40 px y pesos 500 / 700 / 800 (salvo stickers, libreta impresa y PDF)', () => {
  const sizes = new Set(), weights = new Set();
  for (const r of rules) {
    if (KEEP.test(r.sel)) continue;
    for (const m of r.decl.matchAll(/font-size:([\d.]+)px/g)) sizes.add(+m[1]);
    for (const m of r.decl.matchAll(/font:(\d{3})\s+([\d.]+)px/g)) { weights.add(+m[1]); sizes.add(+m[2]); }
    for (const m of r.decl.matchAll(/font-weight:(\d{3})/g)) weights.add(+m[1]);
  }
  assert.deepEqual([...sizes].filter(s => ![12, 14, 16, 20, 28, 40].includes(s)), []);
  assert.deepEqual([...weights].filter(w => ![500, 700, 800].includes(w)), []);
});

test('E7: Libreta, Agenda, Gastos, Cuenta y subpáginas arrancan con la cabecera de la mascota', () => {
  for (const f of ['renderLibreta', 'renderPdf', 'renderAgenda', 'renderGastos', 'renderCuenta', 'renderAvisos', 'renderHoy', 'renderHistorial', 'renderViajes', 'renderDatos']) {
    const i = js.indexOf(`function ${f}(`); assert.ok(i > 0, f);
    assert.match(js.slice(i, js.indexOf('\n}\n', i)), /secHead\(/, f);
  }
  assert.match(js, /document\.body\.dataset\.band = /);
  assert.match(css, /body\[data-band="1"\] \.top\{background:var\(--hero\)/);
  assert.match(css, /\.shead\{[^}]*background:var\(--hero\)/);
});

test('E6 y E12: chips siempre llenos y vacíos sin punteado', () => {
  assert.match(css, /\.chip\{background:var\(--sunk\);box-shadow:none/);
  assert.match(css, /\.empty\.dash\{border:0;background:var\(--card\)\}/);
});
