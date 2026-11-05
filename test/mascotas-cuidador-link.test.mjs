/* Mimitos · "Quién la cuida": crear y guardar el link del cuidador (bugs del 15/10 en el celu de Majo).
   - POST ?sitter=1 guarda los datos del cuidador que viajan con el pedido (aunque el guardado general haya fallado)
   - "hasta" ya pasado: 400 hasta_pasado (antes nacía un link vencido)
   - docs con un sitter viejo (link sin fecha de creación): se reusa y queda fechado; vencido: se crea uno nuevo
   - la vista del cuidador manda el sexo (Gracias por cuidarla/cuidarlo) y el front lo usa
   Correr con: node --test test/mascotas-cuidador-link.test.mjs */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
for (const k of ['KV_REST_API_URL', 'KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'VERCEL_ENV']) delete process.env[k];
process.env.SESSION_SECRET = 'prueba-secreta-de-mimitos-cuidador-1234567';

const { kvGet, kvSet } = await import('../api/_lib/kv.js');
const { makeSession } = await import('../api/_lib/auth.js');
const { default: mascotas, sitterView, cleanSitter } = await import('../api/mascotas.js');

const DAY = 864e5;
const ymd = ms => new Date(ms).toISOString().slice(0, 10);
const call = (method, query, body, email) => new Promise(ok => {
  const res = { code: 200, headers: {}, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, status(c) { this.code = c; return this; }, json(o) { ok({ code: this.code, body: o }); }, end(b) { ok({ code: this.code, raw: b }); } };
  mascotas({ method, query, body, headers: { ...(email ? { cookie: `orbit_session=${makeSession(email)}` } : {}), host: 'preview.orbitando.test' } }, res);
});
const PET = (x = {}) => ({ id: 'aika0001', name: 'Aika', species: 'perro', sex: 'h', records: [], meds: [], log: [], ...x });
async function setup(email, pet = PET(), rev = 3) {
  await kvSet(`orbit:purchases:${email}`, [{ productId: 'ob-018', orderId: 'o-' + email, date: new Date(Date.now() - 2 * DAY).toISOString() }]);
  await kvSet(`orbit:pets:${email}`, { pets: [pet], rev });
}

test('crear link: guarda nombre y "hasta" que viajan con el pedido y responde token + vigencia', async () => {
  const email = 'cl-crear@ejemplo.com'; await setup(email);
  const to = ymd(Date.now() + 5 * DAY);
  const r = await call('POST', { sitter: '1' }, { petId: 'aika0001', sitter: { name: '  Caro ', to, food: '200 g', vetAuth: 1, extra: 'x' } }, email);
  assert.equal(r.code, 200);
  assert.match(r.body.token, /^[A-Za-z0-9_-]{12}$/);
  assert.equal(r.body.until, ymd(Date.parse(to + 'T12:00:00Z') + DAY), 'vigente hasta el día siguiente al "hasta"');
  const saved = await kvGet(`orbit:pets:${email}`);
  assert.deepEqual(saved.pets[0].sitter, cleanSitter({ name: 'Caro', to, food: '200 g', vetAuth: true }));
  assert.equal(saved.pets[0].sitterToken, r.body.token);
  assert.equal(saved.rev, 4, 'el doc sube de versión');
  const link = await kvGet(`orbit:petsitter:${r.body.token}`);
  assert.equal(link.email, email); assert.ok(Number.isFinite(Date.parse(link.at)), 'link con fecha de creación');
  /* el cuidador entra y ve el nombre, la comida y el sexo */
  const g = await call('GET', { c: r.body.token });
  assert.equal(g.code, 200); assert.equal(g.body.pet.sitter.name, 'Caro'); assert.equal(g.body.pet.sex, 'h');
  /* la dueña ve el link activo en el GET */
  const me = await call('GET', {}, null, email);
  assert.deepEqual(me.body.sitterLinks.aika0001, { active: true, until: r.body.until });
});

test('crear link aunque el guardado general haya quedado atrás (rev viejo): los datos van igual', async () => {
  const email = 'cl-conflicto@ejemplo.com'; await setup(email, PET(), 9);
  const r = await call('POST', { sitter: '1' }, { petId: 'aika0001', sitter: { name: 'Luca' } }, email);
  assert.equal(r.code, 200); assert.equal(r.body.doc.pets[0].sitter.name, 'Luca');
  assert.ok(r.body.until, 'sin "hasta": 30 días');
});

test('"hasta" ya pasado: 400 hasta_pasado y no se crea nada', async () => {
  const email = 'cl-pasado@ejemplo.com'; await setup(email);
  const to = ymd(Date.now() - 5 * DAY);
  const r = await call('POST', { sitter: '1' }, { petId: 'aika0001', sitter: { name: 'Caro', to } }, email);
  assert.equal(r.code, 400); assert.equal(r.body.error, 'hasta_pasado'); assert.equal(r.body.to, to);
  assert.equal((await kvGet(`orbit:pets:${email}`)).pets[0].sitterToken || '', '');
  const inv = await call('POST', { sitter: '1' }, { petId: 'aika0001', sitter: { from: ymd(Date.now() + 3 * DAY), to: ymd(Date.now() + DAY) } }, email);
  assert.equal(inv.code, 400); assert.equal(inv.body.error, 'fechas_invertidas');
});

test('sitter viejo sin fecha de creación: con "hasta" vigente se reusa y queda fechado; vencido, se crea otro', async () => {
  const email = 'cl-viejo@ejemplo.com', t = 'TOKviejoSinAt01';
  await setup(email, PET({ sitterToken: t, sitter: { name: 'Caro' } }));
  await kvSet(`orbit:petsitter:${t}`, { email, petId: 'aika0001' });
  /* el GET de la dueña lo marca vencido (sin "hasta" y sin fecha) */
  assert.deepEqual((await call('GET', {}, null, email)).body.sitterLinks.aika0001, { active: false, expired: true });
  /* con "hasta" en el futuro, el mismo token vuelve a andar y queda con fecha */
  const r = await call('POST', { sitter: '1' }, { petId: 'aika0001', sitter: { name: 'Caro', to: ymd(Date.now() + 3 * DAY) } }, email);
  assert.equal(r.code, 200); assert.equal(r.body.token, t);
  assert.ok(Number.isFinite(Date.parse((await kvGet(`orbit:petsitter:${t}`)).at)));
  /* sin "hasta": el link sin fecha estaba vencido → token nuevo, el viejo se borra */
  const email2 = 'cl-viejo2@ejemplo.com', t2 = 'TOKviejoSinAt02';
  await setup(email2, PET({ sitterToken: t2, sitter: { name: 'Caro' } }));
  await kvSet(`orbit:petsitter:${t2}`, { email: email2, petId: 'aika0001' });
  const r2 = await call('POST', { sitter: '1' }, { petId: 'aika0001', sitter: { name: 'Caro' } }, email2);
  assert.equal(r2.code, 200); assert.notEqual(r2.body.token, t2);
  assert.equal(await kvGet(`orbit:petsitter:${t2}`), null);
  /* sitter de docs muy viejos (sin objeto sitter): crear igual */
  const email3 = 'cl-viejo3@ejemplo.com'; await setup(email3, { id: 'aika0001', name: 'Aika', species: 'perro' });
  const r3 = await call('POST', { sitter: '1' }, { petId: 'aika0001', sitter: { name: 'Sofi' } }, email3);
  assert.equal(r3.code, 200); assert.ok(r3.body.token);
});

test('errores claros: sin sesión 401, mascota que no existe 404', async () => {
  assert.equal((await call('POST', { sitter: '1' }, { petId: 'aika0001' })).code, 401);
  const email = 'cl-404@ejemplo.com'; await setup(email);
  assert.equal((await call('POST', { sitter: '1' }, { petId: 'otra' }, email)).code, 404);
});

test('vista del cuidador: manda sex solo si es m o h', () => {
  const base = { name: 'X', meds: [], log: [], sitter: {} };
  assert.equal(sitterView({ ...base, sex: 'm' }).sex, 'm');
  assert.equal(sitterView({ ...base, sex: 'h' }).sex, 'h');
  assert.equal(sitterView({ ...base, sex: 'z' }).sex, '');
  assert.equal(sitterView(base).sex, '');
});

test('front: el link nace con Copiar, Compartir por WhatsApp, Abrir y "Vigente hasta"; los errores se muestran', () => {
  const js = readFileSync(new URL('../assets/js/mascotas-app.js', import.meta.url), 'utf8');
  const panel = js.slice(js.indexOf('function sitterPanel'), js.indexOf('/* ---------- rutina de "Hoy con…"'));
  for (const s of ['id="sCp"', 'Compartir por WhatsApp', 'id="sOpen"', 'Vigente hasta el', 'id="sErr"', "makeLink(p, 'sitter', { sitter: v })"]) assert.ok(panel.includes(s), s);
  assert.ok(panel.indexOf('sl-box') < panel.indexOf('sl-form'), 'el link va arriba del formulario');
  const mk = js.slice(js.indexOf('async function makeLink'), js.indexOf('function copyBtn'));
  assert.ok(mk.includes("credentials: 'same-origin'") && !js.includes("credentials: 'omit'"));
  assert.ok(mk.includes('linkErr(r.status, d)'), 'el error del servidor llega a la pantalla');
  for (const e of ['hasta_pasado', '401', '404']) assert.ok(mk.includes(e), e);
  const pub = readFileSync(new URL('../mascota.html', import.meta.url), 'utf8');
  assert.match(pub, /p\.sex === 'm' \? 'Gracias por cuidarlo' : p\.sex === 'h' \? 'Gracias por cuidarla'/);
});
