/* Mimitos · aviso por mail del tope de gasto de IA (80 % y 100 %), con dedupe por mes en KV.
   Brevo y Anthropic simulados: ningún pedido sale a internet (cualquier otro fetch hace fallar el test).
   Correr con: node --test test/mascotas-tope-aviso.test.mjs */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
for (const k of ['KV_REST_API_URL', 'KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'MIMITOS_AI_BUDGET_USD', 'RESEND_API_KEY', 'BREVO_FROM']) delete process.env[k];
process.env.ANTHROPIC_API_KEY = 'clave-de-prueba';
process.env.BREVO_API_KEY = 'brevo-de-prueba';
process.env.ADMIN_EMAILS = 'majo@orbit.test, socia@orbit.test';

const { kvGet, kvSet, kvDel } = await import('../api/_lib/kv.js');
const AI = await import('../api/_lib/petai.js');

/* fetch simulado: Anthropic responde con el uso que diga `usage`; Brevo guarda el mail o falla si brevoFails */
let mails = [], brevoFails = false, usage = { input_tokens: 1000, output_tokens: 100 }, otros = [];
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  if (u === 'https://api.brevo.com/v3/smtp/email') {
    if (brevoFails) return new Response('{"message":"caído"}', { status: 500 });
    mails.push({ headers: init.headers, body: JSON.parse(init.body) });
    return new Response('{"messageId":"x"}', { status: 201, headers: { 'content-type': 'application/json' } });
  }
  if (u.startsWith('https://api.anthropic.com/')) {
    return new Response(JSON.stringify({ content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn', usage }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  otros.push(u);
  throw new Error('salida a internet no permitida en el test: ' + u);
};
const quiet = async fn => { const e = console.error, logs = []; console.error = (...a) => logs.push(a.join(' ')); try { return [await fn(), logs]; } finally { console.error = e; } };
const NOW = Date.parse('2026-10-20T15:00:00Z'), NEXT = Date.parse('2026-11-02T15:00:00Z');
const model = 'claude-haiku-5-5';
/* una llamada chica: con usage por defecto cuesta 1000*0,10 + 100*0,50 = 150 micro-dólares */
const call = (now = NOW, max_tokens = 100) => AI.callClaude({ model, body: { messages: [{ role: 'user', content: 'mi perra Aika tose' }], max_tokens }, estimate: 100, now });
const reset = async () => { for (const n of [NOW, NEXT]) { await kvDel(AI.spendKey(n)); for (const l of AI.ALERT_LEVELS) await kvDel(AI.alertKey(l, n)); } };
beforeEach(async () => { mails = []; brevoFails = false; otros = []; usage = { input_tokens: 1000, output_tokens: 100 }; delete process.env.MIMITOS_AI_BUDGET_USD; await reset(); });

test('tope por defecto: USD 50, y sigue siendo configurable', () => {
  assert.equal(AI.DEFAULT_BUDGET_USD, 50);
  assert.equal(AI.budgetUsd(), 50);
  process.env.MIMITOS_AI_BUDGET_USD = '120';
  assert.equal(AI.budgetUsd(), 120);
  process.env.MIMITOS_AI_BUDGET_USD = 'cualquiera';
  assert.equal(AI.budgetUsd(), 50, 'un valor inválido vuelve al de por defecto');
});

test('por debajo del 80 %: no sale ningún mail', async () => {
  await kvSet(AI.spendKey(NOW), 30_000_000); /* USD 30 de 50 = 60 % */
  await call();
  assert.equal(mails.length, 0);
});

test('al pasar el 80 %: un mail a cada admin por Brevo, con asunto, montos, techo, fecha y qué hacer, sin datos de usuarios', async () => {
  await kvSet(AI.spendKey(NOW), 39_999_900); /* justo debajo de USD 40 (80 % de 50); esta llamada lo pasa */
  await call();
  assert.equal(mails.length, 2);
  assert.deepEqual(mails.map(m => m.body.to[0].email).sort(), ['majo@orbit.test', 'socia@orbit.test']);
  const m = mails[0].body;
  assert.equal(mails[0].headers['api-key'], 'brevo-de-prueba', 'usa el mismo envío de Brevo que la web');
  assert.equal(m.subject, 'Mimitos: la IA ya usó el 80% del techo de este mes');
  for (const t of [m.textContent, m.htmlContent]) {
    assert.match(t, /USD 40,00/, 'gasto estimado');
    assert.match(t, /USD 50/, 'techo');
    assert.match(t, /20\/10\/2026/, 'fecha');
    assert.match(t, /MIMITOS_AI_BUDGET_USD/, 'qué hacer');
    assert.match(t, /Vercel/);
  }
  assert.ok(!/Aika|tose/.test(m.textContent + m.htmlContent), 'no lleva nada de lo que preguntó la persona');
  assert.ok(!/@(?!orbit)/.test(m.textContent), 'no lleva mails de usuarios');
  assert.ok(await kvGet(AI.alertKey(80, NOW)), 'queda el candado del mes');
});

test('dedupe: con el 80 % ya avisado, las llamadas siguientes no mandan otro mail ese mes', async () => {
  await kvSet(AI.spendKey(NOW), 41_000_000);
  await call(); await call(); await call();
  assert.equal(mails.length, 2, 'una sola tanda (dos admins)');
  /* aunque se llame directo y en paralelo, el SET NX deja pasar uno solo */
  mails = []; await kvDel(AI.alertKey(80, NOW));
  await Promise.all([AI.budgetAlert(80, 42e6, NOW), AI.budgetAlert(80, 42e6, NOW), AI.budgetAlert(80, 42e6, NOW)]);
  assert.equal(mails.length, 2);
});

test('al 100 %: se pausa la IA y sale un aviso aparte, una sola vez', async () => {
  await kvSet(AI.spendKey(NOW), 49_999_990);
  const [, logs] = await quiet(async () => {
    for (let i = 0; i < 3; i++) await assert.rejects(call(), e => e.code === 'ai_paused');
  });
  assert.ok(logs.some(l => /IA EN PAUSA/.test(l)));
  const subjects = mails.map(m => m.body.subject);
  assert.equal(subjects.filter(s => s === 'Mimitos: la IA llegó al techo de este mes y quedó en pausa').length, 2, 'uno por admin, una sola vez');
  assert.match(mails[0].body.textContent, /en pausa hasta el mes que viene/);
  assert.match(mails[0].body.textContent, /USD 50,00/);
  assert.equal(await kvGet(AI.spendKey(NOW)), 49_999_990, 'la reserva volvió');
});

test('si Brevo falla, el candado se suelta y se reintenta en la próxima llamada', async () => {
  await kvSet(AI.spendKey(NOW), 41_000_000);
  brevoFails = true;
  const [, logs] = await quiet(() => call());
  assert.equal(mails.length, 0);
  assert.ok(logs.some(l => /no salió el aviso del tope/.test(l)));
  assert.equal(await kvGet(AI.alertKey(80, NOW)), null);
  brevoFails = false;
  await call();
  assert.equal(mails.length, 2);
});

test('mes nuevo: el aviso vuelve a salir (el candado es por mes)', async () => {
  await kvSet(AI.spendKey(NOW), 41_000_000); await call();
  await kvSet(AI.spendKey(NEXT), 41_000_000); await call(NEXT);
  assert.equal(mails.length, 4);
  assert.match(mails[2].body.textContent, /02\/11\/2026/);
});

test('sin ADMIN_EMAILS o sin Brevo no se intenta mandar nada (y la llamada anda igual)', async () => {
  const admins = process.env.ADMIN_EMAILS;
  try {
    delete process.env.ADMIN_EMAILS;
    await kvSet(AI.spendKey(NOW), 41_000_000);
    const out = await call();
    assert.equal(out.text, 'ok');
    assert.equal(mails.length, 0);
    assert.equal(await kvGet(AI.alertKey(80, NOW)), null, 'no se gasta el aviso del mes');
  } finally { process.env.ADMIN_EMAILS = admins; }
  assert.equal(otros.length, 0, 'nada salió a internet');
});

test('el tope respeta MIMITOS_AI_BUDGET_USD también para los avisos', async () => {
  process.env.MIMITOS_AI_BUDGET_USD = '100';
  await kvSet(AI.spendKey(NOW), 50_000_000); /* 50 % de 100 */
  await call();
  assert.equal(mails.length, 0);
  await kvSet(AI.spendKey(NOW), 80_000_000); await call();
  assert.equal(mails.length, 2);
  assert.match(mails[0].body.textContent, /USD 100/);
  assert.equal(otros.length, 0);
});
