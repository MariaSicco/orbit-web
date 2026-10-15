/* Funciones nuevas de Mimitos detrás de un interruptor: todas apagadas por defecto y sin bajar nada si están apagadas */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const js = readFileSync(new URL('../assets/js/mascotas-app.js', import.meta.url), 'utf8');

test('FEATURES: para el 19/10 salen prendidas Salud y Para el vete (decisión de Majo, 15/10); el resto apagado', () => {
  const m = js.match(/const FEATURES = (\{[^}]*\});/); assert.ok(m);
  const f = Function(`return ${m[1]}`)();
  assert.deepEqual(Object.keys(f).sort(), ['avisosAlta', 'restaurar', 'salud', 'vete']);
  assert.deepEqual(f, { salud: true, restaurar: false, avisosAlta: false, vete: true });
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

/* corre el bloque de interruptores tal cual, con un location y un localStorage falsos */
function flags(hostname, search, saved) {
  const i = js.indexOf('const FEATURES = '), j = js.indexOf('/* lo que cada función engancha');
  const mem = new Map(saved == null ? [] : [['mimitos:funciones', saved]]);
  const localStorage = { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k) };
  const FEATURES = Function('location', 'localStorage', 'URLSearchParams', js.slice(i, j) + '\nreturn FEATURES;')({ hostname, search }, localStorage, URLSearchParams);
  return { on: Object.keys(FEATURES).filter(k => FEATURES[k]), saved: mem.get('mimitos:funciones') };
}

test('en producción (orbitando.com.ar) se ignora ?funciones= y se borra lo guardado', () => {
  for (const h of ['www.orbitando.com.ar', 'orbitando.com.ar']) {
    const r = flags(h, '?funciones=restaurar,avisosAlta', 'restaurar');
    assert.deepEqual(r.on, ['salud', 'vete'], h); assert.equal(r.saved, undefined, h);
  }
});

test('en local y en previews de Vercel el override sí anda', () => {
  const base = ['salud', 'vete'];
  assert.deepEqual(flags('localhost', '?funciones=salud,vete').on, base);
  assert.deepEqual(flags('127.0.0.1', '', 'restaurar').on, ['salud', 'restaurar', 'vete']);
  assert.deepEqual(flags('orbit-web-git-drop01-libreta-funciones-mariasiccos-projects.vercel.app', '?funciones=avisosAlta').on, ['salud', 'avisosAlta', 'vete']);
  assert.deepEqual(flags('localhost', '?funciones=no', 'restaurar').on, base);
  assert.deepEqual(flags('evil.vercel.app.example.com', '?funciones=restaurar').on, base, 'no alcanza con que diga vercel.app en el medio');
});
