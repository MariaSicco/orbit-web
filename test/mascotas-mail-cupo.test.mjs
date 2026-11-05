/* Mimitos · "Conectar tu mail" para todos los compradores: apertura con MIMITOS_MAIL_ALLOW vacía,
   lista restringida con valores, interruptor MIMITOS_GMAIL_OPEN, cupo de Gmail sin verificar
   (MIMITOS_GMAIL_CAP, 90 por defecto), admin fuera del conteo y la ficha sin "próximamente".
   Contra un Google simulado. Correr con: node --test test/mascotas-mail-cupo.test.mjs  (sin KV usa memoria) */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
for (const k of ['KV_REST_API_URL', 'KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'MIMITOS_MAIL_ALLOW', 'MIMITOS_GMAIL_ALLOW', 'MIMITOS_GMAIL_OPEN', 'MIMITOS_GMAIL_CAP']) delete process.env[k];
process.env.SESSION_SECRET = 'prueba-secreta-de-mimitos-1234567890';
process.env.GOOGLE_CLIENT_ID = 'cliente-de-prueba.apps.googleusercontent.com';
process.env.GOOGLE_CLIENT_SECRET = 'secreto-de-prueba';
process.env.MS_CLIENT_ID = '00001111-aaaa-2222-bbbb-3333cccc4444';
process.env.MS_CLIENT_SECRET = 'secreto-de-prueba';
process.env.MIMITOS_TOKEN_KEY = randomBytes(32).toString('base64');
process.env.ADMIN_EMAILS = 'admin@ejemplo.com';
const { kvSet, kvSAdd, kvSCard, kvSIsMember, kvSMembers } = await import('../api/_lib/kv.js');
const { makeSession } = await import('../api/_lib/auth.js');
const M = await import('../api/_lib/petmail.js');
const { default: mascotas } = await import('../api/mascotas.js');

const call = (method, query, email, body) => new Promise(ok => {
  const res = { code: 200, headers: {}, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, status(c) { this.code = c; return this; }, json(o) { ok({ code: this.code, body: o, headers: this.headers }); }, end() { ok({ code: this.code, headers: this.headers }); }, redirect(c, u) { ok({ code: c, headers: { location: u } }); } };
  mascotas({ method, query, body, headers: { cookie: `orbit_session=${makeSession(email)}`, host: 'preview.orbitando.test' } }, res);
});
const purchase = email => kvSet(`orbit:purchases:${email}`, [{ productId: 'ob-018', date: '2026-10-12' }]);

/* Google simulado: solo lo que usa conectar (token + perfil) */
const realFetch = globalThis.fetch;
beforeEach(() => {
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(String(url));
    const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
    const form = Object.fromEntries(new URLSearchParams(String(init.body || '')));
    if (u.href.startsWith('https://oauth2.googleapis.com/token') && form.grant_type === 'authorization_code') return json({ access_token: 'AT1', expires_in: 3599, refresh_token: 'RT-secreto', scope: 'https://www.googleapis.com/auth/gmail.readonly', token_type: 'Bearer' });
    if (u.pathname.endsWith('/profile')) return json({ emailAddress: 'alguien@gmail.com' });
    return json({ error: 'no_simulado' }, 500);
  };
});
process.on('exit', () => { globalThis.fetch = realFetch; });

/* conecta Gmail por el endpoint real: start → callback */
async function connectGmail(email) {
  const go = await call('GET', { gmail: 'start', range: '12m' }, email);
  assert.equal(go.code, 302);
  const to = new URL(go.headers.location, 'https://preview.orbitando.test');
  if (to.origin !== 'https://accounts.google.com') return go.headers.location;
  const cb = await call('GET', { gmail: 'callback', code: 'buen-code', state: to.searchParams.get('state') }, email);
  return cb.headers.location;
}

test('MIMITOS_MAIL_ALLOW vacía: Gmail y Outlook abiertos para cualquier comprador', async () => {
  assert.ok(M.mailAllowed('cualquiera@ejemplo.com', 'gmail'));
  assert.ok(M.mailAllowed('cualquiera@ejemplo.com', 'outlook'));
  assert.ok(!M.mailAllowed('', 'gmail'));
  await purchase('cualquiera@ejemplo.com');
  for (const p of ['gmail', 'outlook']) {
    const st = await call('GET', { [p]: 'status' }, 'cualquiera@ejemplo.com');
    assert.equal(st.code, 200); assert.equal(st.body.allowed, true); assert.equal(st.body.full, false);
  }
  const main = await call('GET', {}, 'cualquiera@ejemplo.com');
  assert.equal(main.body.mail.allowed, true);
  /* sin compra no entra: lo resuelve la base de herramientas */
  const sin = await call('GET', { gmail: 'status' }, 'sincompra@ejemplo.com');
  assert.notEqual(sin.code, 200);
});

test('MIMITOS_MAIL_ALLOW con valores: lista restringida para los dos proveedores', async () => {
  process.env.MIMITOS_MAIL_ALLOW = 'majo@ejemplo.com; socia@ejemplo.com';
  try {
    assert.ok(M.mailAllowed(' Majo@Ejemplo.com ', 'gmail'));
    assert.ok(!M.mailAllowed('otra@ejemplo.com', 'gmail'));
    assert.ok(!M.mailAllowed('otra@ejemplo.com', 'outlook'));
    assert.ok(M.mailAllowed('admin@ejemplo.com', 'gmail'));
    await purchase('otra@ejemplo.com');
    const st = await call('GET', { gmail: 'status' }, 'otra@ejemplo.com');
    assert.equal(st.code, 403); assert.equal(st.body.allowed, false);
    const go = await call('GET', { outlook: 'start' }, 'otra@ejemplo.com');
    assert.equal(go.headers.location, '/mascotas#/cuenta');
  } finally { delete process.env.MIMITOS_MAIL_ALLOW; }
});

test('MIMITOS_GMAIL_OPEN=0: Gmail vuelve a la lista (MIMITOS_GMAIL_ALLOW + admin) y Outlook sigue abierto', () => {
  process.env.MIMITOS_GMAIL_OPEN = '0'; process.env.MIMITOS_GMAIL_ALLOW = 'tester@ejemplo.com';
  try {
    assert.ok(!M.mailAllowed('cualquiera@ejemplo.com', 'gmail'));
    assert.ok(M.mailAllowed('tester@ejemplo.com', 'gmail'));
    assert.ok(M.mailAllowed('admin@ejemplo.com', 'gmail'));
    assert.ok(M.mailAllowed('cualquiera@ejemplo.com', 'outlook'));
    for (const v of ['false', 'no', 'OFF']) { process.env.MIMITOS_GMAIL_OPEN = v; assert.ok(!M.gmailOpen()); }
    for (const v of ['1', 'true', '']) { process.env.MIMITOS_GMAIL_OPEN = v; assert.ok(M.gmailOpen()); }
  } finally { delete process.env.MIMITOS_GMAIL_OPEN; delete process.env.MIMITOS_GMAIL_ALLOW; }
});

test('cupo de Gmail: 90 por defecto; la 91 rebota con su interés guardado y las ya conectadas siguen', async () => {
  assert.equal(M.gmailCap(), 90);
  /* 89 cuentas que ya conectaron Gmail alguna vez */
  for (let i = 1; i <= 89; i++) await kvSAdd(M.GMAIL_USERS, `previa${i}@ejemplo.com`);
  /* la 90 entra por el flujo real y queda contada */
  await purchase('cuenta90@ejemplo.com');
  assert.equal(await connectGmail('cuenta90@ejemplo.com'), '/mascotas#/gmail/conectado');
  assert.equal(await kvSCard(M.GMAIL_USERS), 90);
  assert.ok(await kvSIsMember(M.GMAIL_USERS, 'cuenta90@ejemplo.com'));

  /* la 91 ve "completo", no va a Google y queda en la lista de espera */
  await purchase('cuenta91@ejemplo.com');
  const st = await call('GET', { gmail: 'status' }, 'cuenta91@ejemplo.com');
  assert.equal(st.code, 200); assert.equal(st.body.full, true);
  assert.equal(await connectGmail('cuenta91@ejemplo.com'), '/mascotas#/gmail/completo');
  assert.ok((await kvSMembers(M.GMAIL_WAIT)).includes('cuenta91@ejemplo.com'));
  assert.equal(await kvSCard(M.GMAIL_USERS), 90);
  const it = await call('POST', { gmail: 'interest' }, 'cuenta91@ejemplo.com', {});
  assert.deepEqual(it.body, { ok: true, full: true });
  /* Outlook no tiene cupo */
  const ol = await call('GET', { outlook: 'status' }, 'cuenta91@ejemplo.com');
  assert.equal(ol.body.full, false);

  /* la 90 sigue: no está "completo" para ella y puede reconectar */
  const st90 = await call('GET', { gmail: 'status' }, 'cuenta90@ejemplo.com');
  assert.equal(st90.body.full, false); assert.equal(st90.body.connected, true);
  assert.equal(await connectGmail('cuenta90@ejemplo.com'), '/mascotas#/gmail/conectado');
  /* desconectar no libera el lugar: para Google ese usuario ya cuenta */
  await call('POST', { gmail: 'disconnect' }, 'cuenta90@ejemplo.com', {});
  assert.ok(await kvSIsMember(M.GMAIL_USERS, 'cuenta90@ejemplo.com'));
  assert.equal((await call('GET', { gmail: 'status' }, 'cuenta90@ejemplo.com')).body.full, false);

  /* una cuenta conectada antes de que existiera el conteo sigue andando y se suma sola */
  await purchase('vieja@ejemplo.com');
  await kvSet('orbit:petgmail:vieja@ejemplo.com', { tok: 'v1.x.y.z', address: 'vieja@gmail.com', connectedAt: '2026-10-10T00:00:00Z' });
  const sv = await call('GET', { gmail: 'status' }, 'vieja@ejemplo.com');
  assert.equal(sv.body.full, false);
  assert.ok(await kvSIsMember(M.GMAIL_USERS, 'vieja@ejemplo.com'));

  /* admin no cuenta ni rebota */
  const before = await kvSCard(M.GMAIL_USERS);
  assert.equal((await call('GET', { gmail: 'status' }, 'admin@ejemplo.com')).body.full, false);
  assert.equal(await connectGmail('admin@ejemplo.com'), '/mascotas#/gmail/conectado');
  assert.equal(await kvSCard(M.GMAIL_USERS), before);
  assert.ok(!(await kvSIsMember(M.GMAIL_USERS, 'admin@ejemplo.com')));

  /* subir el cupo con la variable abre lugar sin tocar código */
  process.env.MIMITOS_GMAIL_CAP = '200';
  try { assert.equal((await call('GET', { gmail: 'status' }, 'cuenta91@ejemplo.com')).body.full, false); }
  finally { delete process.env.MIMITOS_GMAIL_CAP; }
});

test('revert de dcd91c5: la importación desde el mail figura incluida, sin "próximamente"', () => {
  const products = readFileSync(new URL('../assets/js/products.js', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../assets/js/mascotas-app.js', import.meta.url), 'utf8');
  assert.match(products, /importación desde el mail/);
  assert.match(products, /importing from your email/);
  assert.doesNotMatch(products, /Próximamente: traer estudios|Coming soon: bring in test results/);
  assert.doesNotMatch(app, /Próximamente: traer estudios/);
  assert.match(app, /lectura automática de la libreta y los estudios e importación desde el mail/);
});
