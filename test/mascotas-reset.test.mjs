/* Mimitos · "Empezar de cero" (herramienta de prueba, api/_lib/petreset.js).
   Borra lo de Mimitos de la cuenta; no toca compra, contadores de IA, de Maps ni el cupo de Gmail; 403 en
   producción para quien no es admin; pide BORRAR y tiene tope diario.
   Correr con: node --test test/mascotas-reset.test.mjs  (KV en memoria) */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
for (const k of ['KV_REST_API_URL', 'KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'VERCEL_ENV', 'BLOB_READ_WRITE_TOKEN', 'BLOB_STORE_ID', 'MIMITOS_MEFUI', 'ADMIN_EMAILS']) delete process.env[k];
process.env.SESSION_SECRET = 'prueba-secreta-de-mimitos-reset-123456';

const { kvGet, kvSet, kvSAdd, kvSMembers, kvSIsMember, kvRPush, kvKeys } = await import('../api/_lib/kv.js');
const { makeSession } = await import('../api/_lib/auth.js');
const R = await import('../api/_lib/petreset.js');
const { petKey, careKey } = await import('../api/_lib/pethoy.js');
const { camListKey, camDevKey, evKey, AWAY_INDEX, PEND_INDEX } = await import('../api/_lib/petaway.js');
const { APPT_INDEX } = await import('../api/_lib/petturnos.js');
const { INDEX_KEY } = await import('../api/_lib/petpush.js');
const { GMAIL_USERS } = await import('../api/_lib/petmail.js');
const { default: mascotas } = await import('../api/mascotas.js');

const call = (method, query, body, email) => new Promise(ok => {
  const res = { code: 200, headers: {}, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, status(c) { this.code = c; return this; }, json(o) { ok({ code: this.code, body: o }); }, end(b) { ok({ code: this.code, raw: b }); }, redirect(c, u) { ok({ code: c, location: u }); } };
  mascotas({ method, query, body, headers: { ...(email ? { cookie: `orbit_session=${makeSession(email)}` } : {}), host: 'preview.orbitando.test' } }, res);
});
const DAY = 864e5;
const buy = email => kvSet(`orbit:purchases:${email}`, [{ productId: 'ob-018', orderId: 'o-' + email, date: new Date(Date.now() - 2 * DAY).toISOString() }]);

/* una cuenta con un poco de todo */
async function seed(email) {
  await buy(email);
  const doc = {
    rev: 7, seen: { tour: '2026-10-15' }, zone: { label: 'Palermo', lat: -34.58, lng: -58.42 },
    appointments: [{ id: 'turno01', petId: 'aika0001', date: '2099-01-02', time: '10:00', place: { name: 'Vete' } }],
    away: { on: true, id: 'sal1', since: new Date().toISOString(), pets: ['aika0001'] },
    pets: [{ id: 'aika0001', name: 'Aika', species: 'perro', share: 'tokShare0001', sitterToken: 'tokSitter001', photo: '/api/mascotas?img=abcdef0123',
      vetPlace: { name: 'Vete', placeId: 'ChIJ1234567890' }, records: [], meds: [], log: [],
      studies: [{ id: 'est1', date: '2026-10-01', title: 'Hemograma', files: [{ ref: 'blob:mascotas/0123456789abcdef/a-hemo.pdf', name: 'hemo.pdf' }] }] }],
  };
  await kvSet(`orbit:pets:${email}`, doc);
  await kvSet('orbit:petshare:tokShare0001', { email, petId: 'aika0001' });
  await kvSet('orbit:petsitter:tokSitter001', { email, petId: 'aika0001', at: new Date().toISOString() });
  await kvSet('orbit:petlog:tokSitter001', [{ id: 'l1', at: new Date().toISOString(), kind: 'comida' }]);
  await kvSet(`orbit:petscans:${email}`, [{ id: 's1', at: new Date().toISOString(), petId: 'aika0001', kind: 'scan' }]);
  await kvSet('orbit:petimg:abcdef0123', 'data:image/jpeg;base64,AAAA');
  await kvSet(`orbit:petusage:${email}`, { items: { 'img:abcdef0123': 4, 'blob:mascotas/0123456789abcdef/a-hemo.pdf': 1000 } });
  await kvSet(`orbit:pettrash:${email}`, { 'blob:mascotas/0123456789abcdef/viejo.pdf': Date.now() });
  await kvSet(`orbit:petpending:${email}`, { 'blob:mascotas/0123456789abcdef/nuevo.pdf': { declared: 10, at: Date.now() } });
  /* "Me fui": una cámara emparejada, sus eventos y un resumen pendiente */
  await kvSet(camListKey(email), [{ camId: 'cam1', petId: 'aika0001', name: 'Living', hash: 'h1', at: new Date().toISOString() }]);
  await kvSet(camDevKey('h1'), { email, camId: 'cam1', petId: 'aika0001' });
  await kvSet(evKey('cam1'), [{ type: 'ladrido', start: new Date().toISOString(), dur: 30 }]);
  await kvSAdd(AWAY_INDEX, email); await kvSAdd(PEND_INDEX, `${email}|ladrido`); await kvSAdd(PEND_INDEX, 'otra@ejemplo.com|ladrido');
  await kvSet(`orbit:petcam:pend:${email}:ladrido`, [{ dur: 30 }]);
  await kvSet(`orbit:petaway:sent:${email}:sal1:1`, 1);
  /* el mail: Gmail conectado, remitentes y el cupo de Gmail */
  await kvSet(`orbit:petgmail:${email}`, { address: 'yo@gmail.com', connectedAt: Date.now() });
  await kvSet(`orbit:petoutlook:${email}`, { address: 'yo@outlook.com', connectedAt: Date.now() });
  await kvSet(`orbit:petmailsenders:${email}`, { manual: ['vete'], learned: ['lab@vete.com'], muted: ['promo@vete.com'] });
  await kvSAdd(GMAIL_USERS, email);
  /* "Hoy con…" */
  const pk = petKey(email, 'aika0001');
  await kvRPush(careKey(pk), JSON.stringify({ id: 'c1', at: new Date().toISOString() }));
  await kvSet(`orbit:hoy:${pk}:2026-10-15:comida-1`, { by: 'Vos' });
  /* avisos: push del celu (queda), índices y candados del cron (se van) */
  await kvSet(`orbit:petnotify:${email}`, { subs: [{ endpoint: 'https://fcm.googleapis.com/x', keys: {} }], mail: true, off: {}, tz: 'America/Argentina/Buenos_Aires', sent: { vieja: '2026-10-01' } });
  await kvSAdd(INDEX_KEY, email); await kvSAdd(APPT_INDEX, email);
  await kvSet(`orbit:petday:${email}`, '2026-10-15');
  await kvSet(`orbit:petsent:${email}:aika0001:vac:2026-10-15`, 1);
  await kvSet(`orbit:petmaps:seen:${email}`, ['ChIJ1234567890']);
  /* contadores que NO se tocan */
  await kvSet(`orbit:petai:anchor:${email}`, Date.now() - DAY);
  await kvSet(`orbit:petai:${email}:2026-10-13`, 12);
  await kvSet(`orbit:petaiday:${email}:2026-10-15`, 3);
  await kvSet(`orbit:petask:${email}:2026-10-15`, 4);
  await kvSet(`orbit:petaskm:${email}:2026-10`, 40);
  await kvSet(`orbit:petmaps:rl:search:${email}:2026-10-15`, 5);
  await kvSet('orbit:petmaps:spend:2026-10', 123456);
}

test('borra todo lo de Mimitos y deja la compra, los contadores y el push', async () => {
  const email = 'reset@ejemplo.com';
  await seed(email);
  const borrados = [];
  const r = await new Promise(ok => {
    const res = { code: 200, setHeader() {}, status(c) { this.code = c; return this; }, json(o) { ok({ code: this.code, body: o }); } };
    R.handleReset({ method: 'POST', headers: {}, query: {} }, res, { email, body: { confirm: 'BORRAR' }, destroyFn: async ref => { borrados.push(ref); } });
  });
  assert.equal(r.code, 200);
  /* doc vacío, con rev nueva y sin "ya vio la introducción" */
  const doc = await kvGet(`orbit:pets:${email}`);
  assert.deepEqual(doc.pets, []); assert.deepEqual(doc.appointments, []);
  assert.equal(doc.rev, 8); assert.equal(doc.seen, undefined); assert.equal(doc.zone, undefined); assert.equal(doc.away, undefined);
  assert.equal(r.body.doc.rev, 8);
  /* links, escaneos y registro del cuidador */
  for (const k of ['orbit:petshare:tokShare0001', 'orbit:petsitter:tokSitter001', 'orbit:petlog:tokSitter001', `orbit:petscans:${email}`]) assert.equal(await kvGet(k), null, k);
  /* archivos: los de uso, papelera y recién subidos, por el camino de petfiles */
  assert.deepEqual(borrados.sort(), ['blob:mascotas/0123456789abcdef/a-hemo.pdf', 'blob:mascotas/0123456789abcdef/nuevo.pdf', 'blob:mascotas/0123456789abcdef/viejo.pdf', 'img:abcdef0123']);
  for (const k of [`orbit:petusage:${email}`, `orbit:pettrash:${email}`, `orbit:petpending:${email}`]) assert.equal(await kvGet(k), null, k);
  /* Me fui: cámara revocada, eventos y pendientes fuera; lo de otra cuenta queda */
  assert.equal(await kvGet(camDevKey('h1')), null);
  assert.equal(await kvGet(camListKey(email)), null);
  assert.equal(await kvGet(evKey('cam1')), null);
  assert.equal(await kvSIsMember(AWAY_INDEX, email), false);
  assert.deepEqual(await kvSMembers(PEND_INDEX), ['otra@ejemplo.com|ladrido']);
  assert.equal(await kvGet(`orbit:petcam:pend:${email}:ladrido`), null);
  assert.equal(await kvGet(`orbit:petaway:sent:${email}:sal1:1`), null);
  /* mail desconectado y remitentes borrados; el cupo de Gmail sigue contando a esta cuenta */
  assert.equal(await kvGet(`orbit:petgmail:${email}`), null);
  assert.equal(await kvGet(`orbit:petoutlook:${email}`), null);
  assert.equal(await kvGet(`orbit:petmailsenders:${email}`), null);
  assert.equal(await kvSIsMember(GMAIL_USERS, email), true);
  /* Hoy con… */
  const pk = petKey(email, 'aika0001');
  assert.deepEqual(await kvKeys(`orbit:hoy:${pk}:*`), []);
  assert.deepEqual(await kvKeys(careKey(pk)).then(async ks => (await Promise.all(ks.map(kvGet))).filter(v => v && v.length)), []);
  /* avisos: el push y sus ajustes quedan; índices de turnos y candados del cron, no */
  const n = await kvGet(`orbit:petnotify:${email}`);
  assert.equal(n.subs.length, 1); assert.equal(n.mail, true); assert.deepEqual(n.sent, {});
  assert.equal(await kvSIsMember(INDEX_KEY, email), true);
  assert.equal(await kvSIsMember(APPT_INDEX, email), false);
  assert.equal(await kvGet(`orbit:petday:${email}`), null);
  assert.deepEqual(await kvKeys(`orbit:petsent:${email}:*`), []);
  assert.equal(await kvGet(`orbit:petmaps:seen:${email}`), null);
  /* compra y contadores intactos */
  assert.equal((await kvGet(`orbit:purchases:${email}`)).length, 1);
  assert.equal(await kvGet(`orbit:petai:${email}:2026-10-13`), 12);
  assert.equal(await kvGet(`orbit:petaiday:${email}:2026-10-15`), 3);
  assert.ok(await kvGet(`orbit:petai:anchor:${email}`));
  assert.equal(await kvGet(`orbit:petask:${email}:2026-10-15`), 4);
  assert.equal(await kvGet(`orbit:petaskm:${email}:2026-10`), 40);
  assert.equal(await kvGet(`orbit:petmaps:rl:search:${email}:2026-10-15`), 5);
  assert.equal(await kvGet('orbit:petmaps:spend:2026-10'), 123456);
});

test('un archivo que Blob no deja borrar queda en la papelera para el cron', async () => {
  const email = 'reset-blob@ejemplo.com';
  await seed(email);
  const { out } = await R.resetAccount(email, { destroyFn: async ref => { if (ref.endsWith('a-hemo.pdf')) throw new Error('blob caído'); } });
  assert.equal(out.files.left, 1);
  assert.deepEqual(Object.keys(await kvGet(`orbit:pettrash:${email}`)), ['blob:mascotas/0123456789abcdef/a-hemo.pdf']);
  assert.deepEqual(Object.keys((await kvGet(`orbit:petusage:${email}`)).items), ['blob:mascotas/0123456789abcdef/a-hemo.pdf']);
});

test('endpoint: pide BORRAR, tiene tope de 3 por día y el GET avisa si está disponible', async () => {
  const email = 'reset-tope@ejemplo.com';
  await seed(email);
  assert.equal((await call('GET', {}, null, email)).body.reset, true, 'fuera de producción se ofrece');
  assert.equal((await call('POST', { reset: '1' }, {}, email)).code, 400);
  assert.equal((await call('POST', { reset: '1' }, { confirm: 'borra' }, email)).code, 400);
  assert.equal((await kvGet(`orbit:pets:${email}`)).pets.length, 1, 'sin confirmar no borra nada');
  for (let i = 0; i < 3; i++) assert.equal((await call('POST', { reset: '1' }, { confirm: i ? 'BORRAR' : ' borrar ' }, email)).code, 200);
  const r = await call('POST', { reset: '1' }, { confirm: 'BORRAR' }, email);
  assert.equal(r.code, 429); assert.equal(r.body.limit, 3);
  /* sin sesión, 401; sin compra, 402 */
  assert.equal((await call('POST', { reset: '1' }, { confirm: 'BORRAR' })).code, 401);
  assert.equal((await call('POST', { reset: '1' }, { confirm: 'BORRAR' }, 'sin-compra@ejemplo.com')).code, 402);
});

test('en producción: 403 y sin botón para quien no es admin; la admin sí puede', async () => {
  const email = 'cliente@ejemplo.com', admin = 'majo@ejemplo.com';
  await seed(email);
  process.env.VERCEL_ENV = 'production'; process.env.ADMIN_EMAILS = admin;
  try {
    assert.equal((await call('GET', {}, null, email)).body.reset, false);
    const r = await call('POST', { reset: '1' }, { confirm: 'BORRAR' }, email);
    assert.equal(r.code, 403);
    assert.equal((await kvGet(`orbit:pets:${email}`)).pets.length, 1, 'no borró nada');
    assert.equal(await kvGet(R.resetDayKey(email)), null, 'tampoco gastó un uso');
    assert.equal((await call('GET', {}, null, admin)).body.reset, true);
    await kvSet(`orbit:pets:${admin}`, { pets: [{ id: 'mila0001', name: 'Mila', species: 'gato' }], rev: 2 });
    assert.equal((await call('POST', { reset: '1' }, { confirm: 'BORRAR' }, admin)).code, 200);
    assert.deepEqual((await kvGet(`orbit:pets:${admin}`)).pets, []);
  } finally { delete process.env.VERCEL_ENV; delete process.env.ADMIN_EMAILS; }
});

test('la app: el botón sale solo si el servidor lo habilita, con BORRAR y botón rojo, y vuelve a la bienvenida', () => {
  const src = readFileSync(new URL('../assets/js/mascotas-app.js', import.meta.url), 'utf8');
  assert.match(src, /resetOk = Boolean\(d\.reset\)/);
  assert.match(src, /\$\{resetOk \? resetSection\(\) : ''\}/);
  assert.match(src, /Borrar todo y empezar de cero/);
  assert.match(src, /btn big wide orange" id="rsYes" disabled/);
  assert.match(src, /fetch\('\/api\/mascotas\?reset=1'/);
  assert.match(src, /ob = null; go\('inicio'\);\s*toast\('Listo, Mimitos quedó vacía/);
});
