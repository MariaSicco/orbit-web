/* Mimitos · piso de calidad de "Conectar tu mail": corre scripts/mimitos-mail-eval.mjs sobre el set de ajuste
   (test/fixtures/mail-eval.json) y el de control (mail-eval-control.json) y exige precisión ≥ 0,95 y recall ≥ 0,90
   de punta a punta en Gmail y Outlook, sin leer el cuerpo de ningún mail que no sea un estudio.
   Si un cambio de términos o pesos baja algo, este test lo frena. Correr: node --test test/mascotas-mail-eval.test.mjs */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../scripts/mimitos-mail-eval.mjs', import.meta.url));
const run = (...a) => JSON.parse(execFileSync(process.execPath, [script, '--json', ...a], { encoding: 'utf8' }));

for (const [label, args] of [['ajuste', []], ['control', ['--set', 'control']]]) {
  test(`set de ${label}: precisión ≥ 0,95 y recall ≥ 0,90 en Gmail y Outlook; ningún cuerpo de un mail que no es estudio`, () => {
    const r = run(...args).A;
    for (const v of ['gmail_e2e', 'outlook_e2e']) {
      assert.ok(r.views[v].precision >= 0.95, `${v} precisión ${r.views[v].precision}`);
      assert.ok(r.views[v].recall >= 0.90, `${v} recall ${r.views[v].recall}`);
    }
    assert.equal(r.bodies.gmail.negativos, 0, 'cuerpos leídos de mails que no son estudios (Gmail)');
    assert.equal(r.bodies.outlook.negativos, 0, 'cuerpos leídos de mails que no son estudios (Outlook)');
    assert.ok(r.largo.gmail <= 1800, 'la consulta de Gmail entra en el largo (MAX_QUERY)');
  });
}

test('el simulador ignora o no las tildes: con tildes iguales el recall no baja', () => {
  const a = run().A.views.gmail_e2e, b = run('--acentos').A.views.gmail_e2e;
  assert.ok(b.recall >= a.recall);
});
