// Todos los JS de Mimitos tienen que parsear: un error de sintaxis deja la app en blanco y los demás tests no lo ven.
import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const dir = new URL('../assets/js/', import.meta.url).pathname;
const files = fs.readdirSync(dir).filter(f => /^mascotas.*\.js$/.test(f));

test('JS de Mimitos sin errores de sintaxis', () => {
  assert.ok(files.length > 5);
  for (const f of files) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    const ext = /^\s*(import|export)\s/m.test(src) || /import\.meta/.test(src) ? '.mjs' : '.cjs';
    const tmp = path.join(os.tmpdir(), `mz-check-${process.pid}-${f.replace(/\.js$/, ext)}`);
    fs.writeFileSync(tmp, src);
    try { execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' }); }
    catch (e) { assert.fail(`${f}: ${String(e.stderr).split('\n').slice(0, 5).join(' ')}`); }
    finally { fs.unlinkSync(tmp); }
  }
});
