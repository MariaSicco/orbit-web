/* Funciones nuevas de Mimitos detrás de un interruptor: todas apagadas por defecto y sin bajar nada si están apagadas */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const js = readFileSync(new URL('../assets/js/mascotas-app.js', import.meta.url), 'utf8');

test('FEATURES: todas apagadas por defecto', () => {
  const m = js.match(/const FEATURES = (\{[^}]*\});/); assert.ok(m);
  const f = Function(`return ${m[1]}`)();
  assert.deepEqual(Object.keys(f).sort(), ['avisosAlta', 'restaurar', 'salud', 'vete']);
  assert.ok(Object.values(f).every(v => v === false));
});

test('solo se baja el archivo de una función si está prendida; ?funciones= la prende en este navegador', () => {
  assert.match(js, /for \(const k in FEATURES\) if \(FEATURES\[k\]\) \{/);
  assert.match(js, /mascotas-f-\$\{k\}\.js/); assert.match(js, /mascotas-f-\$\{k\}\.css/);
  assert.match(js, /get\('funciones'\)/); assert.match(js, /q === 'no' \? '' : q/);
});

test('los ganchos están en su lugar (rutas, acciones, Cuenta, Libreta, Inicio y fin del alta)', () => {
  assert.match(js, /if \(FEAT\.routes\[route\.name\]\) return FEAT\.routes\[route\.name\]\(p\);/);
  assert.match(js, /default: if \(FEAT\.actions\[b\.dataset\.act\]\)/);
  for (const h of ['exportSub', 'cuentaAjustes', 'libretaTools', 'antecedentesLabel', 'inicioQuick', 'afterOnboard']) assert.ok(js.includes(h), h);
  /* con todo apagado, Cuenta sigue diciendo que la copia no se puede volver a cargar */
  assert.match(js, /Todavía no se puede volver a cargar en la app\./);
});
