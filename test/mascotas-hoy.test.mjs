/* Mimitos · "Hoy con {mascota}": lista del día, tildes con quién y a qué hora, y la alerta de dosis repetida
   verificada en el servidor (SET NX por ítem, día y toma).
   Correr con: node --test test/mascotas-hoy.test.mjs  (KV en memoria) */
import { test } from 'node:test';
import assert from 'node:assert/strict';
for (const k of ['KV_REST_API_URL', 'KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'ADMIN_EMAILS']) delete process.env[k];
process.env.SESSION_SECRET = 'prueba-secreta-de-mimitos-hoy-1234567890';

const { kvGet, kvSet } = await import('../api/_lib/kv.js');
const { makeSession } = await import('../api/_lib/auth.js');
const HOY = await import('../api/_lib/pethoy.js');
const { default: mascotas } = await import('../api/mascotas.js');
const H = HOY.H;

const DAY = 864e5;
const call = (method, query, body, email, headers = {}) => new Promise(ok => {
  const res = { code: 200, headers: {}, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, status(c) { this.code = c; return this; }, json(o) { ok({ code: this.code, body: o }); }, end(b) { ok({ code: this.code, raw: b }); }, redirect(c, u) { ok({ code: c, location: u }); } };
  mascotas({ method, query, body, headers: { ...(email ? { cookie: `orbit_session=${makeSession(email)}` } : {}), host: 'preview.orbitando.test', 'x-real-ip': '7.7.7.7', ...headers } }, res);
});
const buy = email => kvSet(`orbit:purchases:${email}`, [{ productId: 'ob-018', orderId: 'o-' + email, date: new Date(Date.now() - 2 * DAY).toISOString() }]);
const today = H.todayAR();
/* remedio cada 4 horas desde las 00:00 de hoy: siempre hay una toma cuya ventana incluye "ahora" */
const PET = (x = {}) => ({ id: 'feli0001', name: 'Feliza', species: 'perro', sex: 'h', records: [], contact: { name: 'Majo', phone: '+5491100000000' },
  meds: [{ id: 'med1', name: 'Pastilla', dose: '1/2', every: 4, start: `${today}T00:00`, days: 0 }], food: { dailyG: 300 }, log: [], ...x });
async function setup(email, token, pet = PET(), link = { at: new Date().toISOString() }) {
  await buy(email);
  await kvSet(`orbit:pets:${email}`, { pets: [{ sitterToken: token, sitter: { name: 'Luca' }, ...pet }], rev: 3 });
  await kvSet(`orbit:petsitter:${token}`, { email, petId: pet.id, ...link });
}
const nowMed = (pet, now = Date.now()) => [today, H.addDays(today, 1)].flatMap(d => H.plan(pet, d).map(i => ({ ...i, ymd: d }))).find(i => i.kind === 'med' && i.from <= now && now < i.to);
const sit = (t, body, ip = '7.7.7.7') => call('POST', { c: t }, { hoy: 1, ...body }, null, { 'x-real-ip': ip });

test('plan: rutina armada sola (comidas con la mitad de la ración, paseos si es perro, agua) y una fila por toma', () => {
  const items = H.plan(PET(), today);
  const meals = items.filter(i => i.kind === 'comida');
  assert.deepEqual(meals.map(i => i.time), ['08:00', '20:00']);
  assert.equal(meals[0].qty, '150 g');
  assert.equal(items.filter(i => i.kind === 'paseo').length, 2);
  assert.equal(items.filter(i => i.kind === 'med').length, 6, 'cada 4 h: 6 tomas');
  assert.ok(items.some(i => i.key === 'm:med1:0800'));
  assert.equal(H.plan(PET({ species: 'gato' }), today).filter(i => i.kind === 'paseo').length, 0);
  /* la primera toma con zona horaria da lo mismo que en hora de reloj */
  const z = H.plan(PET({ meds: [{ id: 'm', name: 'X', every: 12, start: `${today}T12:00:00.000Z` }] }), today).filter(i => i.kind === 'med');
  assert.deepEqual(z.map(i => i.time), ['09:00', '21:00']);
  /* rutina editada manda; tratamiento terminado no aparece */
  assert.deepEqual(H.plan(PET({ routine: [{ id: 'x', kind: 'comida', time: '07:15', label: 'Balanceado' }], meds: [] }), today).map(i => i.key), ['c:x']);
  assert.equal(H.plan(PET({ meds: [{ id: 'm', name: 'X', every: 24, start: '2026-01-01T09:00', days: 3 }] }), today).filter(i => i.kind === 'med').length, 0);
});

test('doble marca simultánea: dos personas marcan la misma toma a la vez → gana una sola (SET NX)', async () => {
  const email = 'hoy-doble@ejemplo.com', t = 'TOKhoyDoble0001';
  await setup(email, t);
  const it = nowMed(PET());
  const [a, b] = await Promise.all([
    sit(t, { item: it.key, ymd: it.ymd, by: 'Luca' }),
    call('POST', { hoy: '1' }, { petId: 'feli0001', item: it.key, ymd: it.ymd }, email),
  ]);
  const codes = [a.code, b.code].sort();
  assert.deepEqual(codes, [200, 409]);
  const lose = a.code === 409 ? a : b;
  assert.equal(lose.body.error, 'ya_marcado'); assert.equal(lose.body.kind, 'med'); assert.ok(lose.body.at);
  /* una sola entrada en el registro */
  assert.equal((await HOY.careLog(email, 'feli0001')).length, 1);
  /* 20 a la vez desde distintas IP: igual una sola */
  const it2 = H.plan(PET(), today).find(i => i.kind === 'paseo');
  const many = await Promise.all(Array.from({ length: 20 }, (_, i) => sit(t, { item: it2.key, ymd: today, by: 'P' + i }, '10.0.0.' + i)));
  assert.equal(many.filter(r => r.code === 200).length, 1);
});

test('dosis repetida: 409 con quién y a qué hora; con la confirmación (force) se anota como repetida', async () => {
  const email = 'hoy-repe@ejemplo.com', t = 'TOKhoyRepe00001';
  await setup(email, t);
  const it = nowMed(PET());
  const ok = await sit(t, { item: it.key, ymd: it.ymd, by: 'Luca' });
  assert.equal(ok.code, 200); assert.ok(ok.body.undo);
  const done = ok.body.hoy.items.find(i => i.key === it.key)?.done;
  if (it.ymd === today) assert.equal(done.by, 'Luca');
  /* la dueña intenta marcarla: ve que la dio Luca */
  const again = await call('POST', { hoy: '1' }, { petId: 'feli0001', item: it.key, ymd: it.ymd }, email);
  assert.equal(again.code, 409); assert.equal(again.body.by, 'Luca'); assert.equal(again.body.kind, 'med');
  /* confirma */
  const forced = await call('POST', { hoy: '1' }, { petId: 'feli0001', item: it.key, ymd: it.ymd, force: true }, email);
  assert.equal(forced.code, 200); assert.equal(forced.body.entry.repeat, true); assert.equal(forced.body.entry.by, 'Vos');
  const log = await HOY.careLog(email, 'feli0001');
  assert.equal(log.filter(l => l.kind === 'med').length, 2);
  /* el cuidador ve a la dueña con su nombre, no "Vos" */
  const other = H.plan(PET(), today).find(i => i.kind === 'otro');
  await call('POST', { hoy: '1' }, { petId: 'feli0001', item: other.key, ymd: today }, email);
  const s409 = await sit(t, { item: other.key, ymd: today, by: 'Luca' });
  assert.equal(s409.code, 409); assert.equal(s409.body.by, 'Majo');
});

test('dosis ya dada por "Ya se la di" (registro del doc o del cuidador) también da 409; comida reciente también', async () => {
  const email = 'hoy-log@ejemplo.com', t = 'TOKhoyLog000001';
  const it = nowMed(PET());
  await setup(email, t, PET({ log: [{ id: 'l1', at: new Date(Date.now() - 60000).toISOString(), kind: 'med', medId: 'med1', by: 'Vos' }] }));
  const r = await sit(t, { item: it.key, ymd: it.ymd, by: 'Luca' });
  assert.equal(r.code, 409); assert.equal(r.body.by, 'Majo', 'la dueña aparece con su nombre para el cuidador');
  /* comida: marcó el desayuno hace un rato; marcar la cena enseguida avisa "ya comió" */
  const email2 = 'hoy-comida@ejemplo.com', t2 = 'TOKhoyComida001';
  await setup(email2, t2);
  const [c1, c2] = H.plan(PET(), today).filter(i => i.kind === 'comida');
  assert.equal((await sit(t2, { item: c1.key, ymd: today, by: 'Luca' })).code, 200);
  const c = await call('POST', { hoy: '1' }, { petId: 'feli0001', item: c2.key, ymd: today }, email2);
  assert.equal(c.code, 409); assert.equal(c.body.kind, 'comida'); assert.equal(c.body.by, 'Luca');
});

test('los remedios marcados cuentan como dados: la dueña los ve en su registro (misma fuente para medState)', async () => {
  const email = 'hoy-med@ejemplo.com', t = 'TOKhoyMed000001';
  await setup(email, t);
  const it = nowMed(PET());
  await sit(t, { item: it.key, ymd: it.ymd, by: 'Luca' });
  const g = await call('GET', {}, null, email);
  const l = g.body.doc.pets[0].log.find(x => x.kind === 'med');
  assert.ok(l); assert.equal(l.medId, 'med1'); assert.equal(l.by, 'Luca');
  const h = await call('GET', { hoy: '1', pet: 'feli0001', d: it.ymd }, null, email);
  assert.equal(h.body.items.find(i => i.key === it.key).done.by, 'Luca');
  /* el cuidador también lo ve en su vista */
  const s = await call('GET', { c: t });
  assert.ok(s.body.pet.log.some(x => x.kind === 'med'));
  assert.equal(s.body.hoy.ymd, today);
});

test('deshacer: solo quien marcó y por unos segundos; libera el ítem', async () => {
  const email = 'hoy-undo@ejemplo.com', t = 'TOKhoyUndo00001';
  await setup(email, t);
  const it = H.plan(PET(), today).find(i => i.kind === 'paseo');
  const ok = await sit(t, { item: it.key, ymd: today, by: 'Luca' });
  assert.equal((await call('POST', { hoy: '1' }, { petId: 'feli0001', undo: ok.body.undo, ymd: today }, email)).code, 404, 'la dueña no deshace lo del cuidador');
  const u = await sit(t, { undo: ok.body.undo });
  assert.equal(u.code, 200);
  assert.equal(u.body.hoy.items.find(i => i.key === it.key).done, null);
  assert.equal((await HOY.careLog(email, 'feli0001')).length, 0);
  assert.equal((await sit(t, { item: it.key, ymd: today, by: 'Luca' })).code, 200, 'se puede marcar de nuevo');
  /* vencido el rato */
  const late = await HOY.undo({ pet: PET(), email, id: (await sit(t, { item: H.plan(PET(), today).find(i => i.kind === 'otro').key, ymd: today, by: 'L' })).body.undo, actor: 't:' + t, now: Date.now() + 120000 });
  assert.equal(late.status, 410);
});

test('seguridad: token vencido → 404; solo ítems de esa mascota y de hoy ±1; tope por hora', async () => {
  const email = 'hoy-seg@ejemplo.com', t = 'TOKhoySeg000001';
  await setup(email, t, PET({ sitter: { name: 'Luca', to: '2026-01-05' } }));
  const v = await sit(t, { item: 'c:c1', ymd: today, by: 'Luca' });
  assert.equal(v.code, 404); assert.equal(v.body.expired, true);
  await setup(email, t);
  assert.equal((await sit(t, { item: 'c:c1', ymd: H.addDays(today, -3), by: 'Luca' })).body.error, 'dia_invalido');
  assert.equal((await sit(t, { item: 'm:otro:0800', ymd: today, by: 'Luca' })).body.error, 'item_invalido');
  assert.equal((await sit(t, { item: 'c:c1', ymd: H.addDays(today, -1), by: 'Luca' })).code, 200, 'ayer todavía se puede (se olvidó de marcar)');
  /* la dueña no puede marcar mascotas de otra cuenta */
  await buy('otra@ejemplo.com'); await kvSet('orbit:pets:otra@ejemplo.com', { pets: [], rev: 1 });
  assert.equal((await call('POST', { hoy: '1' }, { petId: 'feli0001', item: 'c:c1', ymd: today }, 'otra@ejemplo.com')).code, 404);
  /* nada de más en la vista del día: sin mails ni claves */
  const g = await call('GET', { c: t });
  assert.ok(!JSON.stringify(g.body.hoy).includes('@'));
  for (let i = 0; i < 40; i++) await sit(t, { item: 'c:c2', ymd: today, by: 'L' }, '6.6.6.6');
  assert.equal((await sit(t, { item: 'c:c2', ymd: today, by: 'L' }, '6.6.6.6')).code, 429);
});

test('compatibilidad con docs viejos: sin rutina, sin primera toma, sin contacto ni comida', async () => {
  const email = 'hoy-viejo@ejemplo.com', t = 'TOKhoyViejo0001';
  await buy(email);
  await kvSet(`orbit:pets:${email}`, { pets: [{ id: 'old00001', name: 'Tito', species: 'gato', sitterToken: t, sitter: {}, meds: [{ id: 'm1', name: 'Gotas', every: 12 }], log: [{ id: 'z', at: new Date().toISOString(), kind: 'comida', by: 'Caro' }] }], rev: 1 });
  await kvSet(`orbit:petsitter:${t}`, { email, petId: 'old00001', at: new Date().toISOString() });
  const g = await call('GET', { c: t });
  assert.equal(g.code, 200);
  assert.deepEqual(g.body.hoy.items.map(i => i.kind), ['comida', 'otro', 'comida'], 'sin remedio sin primera toma y sin paseos de gato');
  assert.equal(g.body.pet.log.length, 1, 'el registro viejo sigue');
  /* el POST viejo (sin hoy) sigue andando */
  assert.equal((await call('POST', { c: t }, { kind: 'ok', by: 'Caro' })).code, 200);
  const o = await call('GET', { hoy: '1', pet: 'old00001' }, null, email);
  assert.equal(o.code, 200); assert.equal(o.body.items.length, 3);
});

test('remedio sin marcar: aviso una hora después, una sola vez por toma (dedupe), solo si está prendido y no si se marcó', async () => {
  const email = 'hoy-miss@ejemplo.com', t = 'TOKhoyMiss00001';
  const pet = PET({ meds: [{ id: 'med1', name: 'Pastilla', dose: '1/2', every: 12, start: `${today}T09:00`, days: 0 }] });
  await setup(email, t, pet);
  const it = H.plan(pet, today).find(i => i.key === 'm:med1:0900');
  const sent = [], mails = [];
  let notify = { off: {}, mail: true };
  const deps = { emails: [email], getNotify: async () => ({ email, subs: [{}], ...notify }), getDoc: e => kvGet(`orbit:pets:${e}`), hasMimitos: async () => true,
    push: async (n, p) => { sent.push(p); return 1; }, mail: async (e, m) => { mails.push(m); return true; } };
  /* apagado por defecto (es opcional) */
  assert.equal((await HOY.runMedMiss({ now: it.at + 90 * 60000, deps })).avisos, 0);
  notify = { off: { med: false }, mail: true };
  /* antes de la hora + 1 h, nada */
  assert.equal((await HOY.runMedMiss({ now: it.at + 30 * 60000, deps })).avisos, 0);
  const r = await HOY.runMedMiss({ now: it.at + 70 * 60000, deps });
  assert.equal(r.avisos, 1);
  assert.equal(sent[0].title, 'El remedio de las 09:00 no está marcado');
  assert.match(sent[0].body, /Pastilla \(1\/2\) de Feliza/);
  assert.equal(mails.length, 1);
  /* la corrida siguiente no lo repite */
  assert.equal((await HOY.runMedMiss({ now: it.at + 130 * 60000, deps })).avisos, 0);
  /* marcada por el cuidador → no avisa (otra toma, otro día de prueba: la de las 21:00) */
  const it2 = H.plan(pet, today).find(i => i.key === 'm:med1:2100');
  const key = HOY.markKey(HOY.petKey(email, pet.id), today, it2.key);
  await kvSet(key, { id: 'x', at: new Date(it2.at).toISOString(), by: 'Luca', who: 'sitter' });
  assert.equal((await HOY.runMedMiss({ now: it2.at + 70 * 60000, deps })).avisos, 0);
  /* dada con "Ya se la di" (registro del doc) → tampoco */
  const email2 = 'hoy-miss2@ejemplo.com';
  await setup(email2, 'TOKhoyMiss00002', PET({ meds: pet.meds, log: [{ id: 'a', at: new Date(it.at + 5 * 60000).toISOString(), kind: 'med', medId: 'med1', by: 'Vos' }] }));
  assert.equal((await HOY.runMedMiss({ now: it.at + 70 * 60000, deps: { ...deps, emails: [email2] } })).avisos, 0);
});
