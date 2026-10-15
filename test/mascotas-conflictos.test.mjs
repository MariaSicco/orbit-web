/* Ningún marcador de conflicto de git en lo que se despliega (assets/, mascota*.html y api/).
   Un "=======" suelto en mascotas.css anulaba en silencio la regla siguiente. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

const ROOT = new URL('../', import.meta.url);
const TEXT = /\.(js|mjs|css|html|svg|json|webmanifest)$/;
async function files(dir) {
  const out = [];
  for (const e of await readdir(new URL(dir, ROOT), { withFileTypes: true, recursive: true })) {
    if (!e.isFile() || !TEXT.test(e.name)) continue;
    const p = (e.parentPath || e.path).replace(new URL('.', ROOT).pathname, '') + '/' + e.name;
    if (!p.includes('node_modules')) out.push(p.replace(/^\/+/, ''));
  }
  return out;
}

test('sin <<<<<<<, ======= ni >>>>>>> al principio de una línea en assets/, mascota*.html y api/', async () => {
  const list = [...await files('assets/'), ...await files('api/'), ...(await readdir(ROOT)).filter(f => /^mascota.*\.html$/.test(f))];
  assert.ok(list.length > 20, `revisó ${list.length} archivos`);
  const bad = [];
  for (const f of list) {
    const s = await readFile(new URL(f, ROOT), 'utf8');
    s.split('\n').forEach((l, i) => { if (/^(<{7}|={7}|>{7})(\s|$)/.test(l)) bad.push(`${f}:${i + 1}`); });
  }
  assert.deepEqual(bad, []);
});
