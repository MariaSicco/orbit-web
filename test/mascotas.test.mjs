/* Mimitos · pruebas de las reglas de avisos, el cron y la limpieza de archivos.
   Correr con: node --test test/mascotas.test.mjs  (sin KV configurado usa memoria, no toca datos reales) */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dueToday } from '../api/_lib/petpush.js';
import { sweep, addUsage, photoRef, getUsage, TRASH_GRACE_MS } from '../api/_lib/petfiles.js';
import { kvGet, kvSet } from '../api/_lib/kv.js';
import cron, { runAvisos } from '../api/cron/mascotas.js';
import { saveNotify, localClock, DEFAULT_TZ } from '../api/_lib/petpush.js';
import '../assets/js/mascotas-rules.js';
import '../assets/js/mascotas-core.js';

const SUG = 'Calendario sugerido: referencia general, confirmalo con tu veterinario.';
const luna = records => ({ pets: [{ id: 'p1', name: 'Luna', records }] });

test('QA A1: con la Séxtuple real cargada no llega el aviso de la sugerida', () => {
  const doc = luna([
    { id: 'sug', type: 'vacuna', name: 'Séxtuple', date: '', next: '2026-11-12', notes: SUG },
    { id: 'real', type: 'vacuna', name: 'Séxtuple', date: '2026-03-20', next: '2027-03-20', notes: '' },
  ]);
  assert.equal(dueToday(doc, '2026-11-12').length, 0);
  assert.equal(dueToday(doc, '2026-11-09').length, 0);
  assert.equal(dueToday(doc, '2027-03-20').length, 1);
});

test('QA A1: una dosis adelantada reemplaza a la que estaba prevista', () => {
  const doc = luna([
    { id: 'a1', type: 'vacuna', name: 'Antirrábica', date: '2025-11-07', next: '2026-11-07' },
    { id: 'a2', type: 'vacuna', name: 'Antirrábica', date: '2026-11-02', next: '2027-11-02' },
  ]);
  assert.equal(dueToday(doc, '2026-11-07').length, 0);
  assert.equal(dueToday(doc, '2026-11-04').length, 0);
});

test('la app y el cron usan la misma regla', () => {
  const recs = [
    { id: 'sug', type: 'vacuna', name: 'Séxtuple', date: '', next: '2026-11-12', notes: SUG },
    { id: 'real', type: 'vacuna', name: 'séxtuple ', date: '2026-03-20', next: '2027-03-20' },
    { id: 'pip', type: 'desparasitacion', name: 'Pipeta antipulgas', date: '2026-10-01', next: '2026-11-01' },
  ];
  const app = globalThis.MZ.upcoming({ records: recs }).map(x => x.r.id);
  const srv = globalThis.MZRULES.dueRecords(recs).map(r => r.id);
  assert.deepEqual(app, srv);
  assert.deepEqual(srv, ['pip', 'real']);
});

test('una fecha sugerida avisa como sugerida, para confirmar con el veterinario', () => {
  const [a] = dueToday(luna([{ id: 's', type: 'vacuna', name: 'Séxtuple', date: '', next: '2026-11-12', notes: SUG }]), '2026-11-12');
  assert.ok(a.sug);
  assert.match(a.title, /sugerida/i);
  assert.match(a.body, /confirmala con tu veterinario/);
  const ev = globalThis.MZ.recordEvent({ id: 'p1', name: 'Luna' }, { id: 's', type: 'vacuna', name: 'Séxtuple', date: '', next: '2026-11-12', notes: SUG });
  assert.match(ev.title, /sugerida, confirmala con tu veterinario/);
});

test('.ics: el aviso de 3 días antes suena a las 9:00, no a las 00:00', () => {
  const ics = globalThis.MZ.ics([globalThis.MZ.recordEvent({ id: 'p1', name: 'Luna' }, { id: 'r', type: 'vacuna', name: 'Antirrábica', date: '2026-01-10', next: '2027-01-10' })]);
  assert.match(ics, /DTSTART;VALUE=DATE:20270110/);
  assert.match(ics, /TRIGGER:-P2DT15H/);   // 00:00 del día − 2 días y 15 h = 9:00 de 3 días antes
  assert.match(ics, /TRIGGER:PT9H/);
  assert.doesNotMatch(ics, /TRIGGER:-P3D\r\n/);
});

const call = async (headers = {}, query = {}) => { let st = 0; const res = { status(c) { st = c; return this; }, json() { return this; } }; await cron({ headers, query }, res); return st; };
test('QA A2: el cron sin CRON_SECRET falla cerrado y no alcanza con el User-Agent', async () => {
  delete process.env.CRON_SECRET;
  const err = console.error; console.error = () => {};   // el aviso de "falta CRON_SECRET" es esperado acá
  try { assert.equal(await call({ 'user-agent': 'vercel-cron/1.0' }), 503); } finally { console.error = err; }
  process.env.CRON_SECRET = 'prueba';
  assert.equal(await call({ 'user-agent': 'vercel-cron/1.0' }), 401);
  assert.equal(await call({ authorization: 'Bearer otro' }), 401);
  assert.equal(await call({ authorization: 'Bearer prueba' }), 200);
});

test('limpieza: lo que se borra del doc se elimina después del rato de gracia', async () => {
  const email = 'test@ejemplo.com';
  await kvSet('orbit:petimg:abcdef0123', 'data:image/jpeg;base64,AAAA');
  await addUsage(email, photoRef('abcdef0123'), 4);
  const withPhoto = { pets: [{ id: 'p', records: [{ sticker: '/api/mascotas?img=abcdef0123' }] }] };
  const t0 = Date.now();
  assert.equal(await sweep(email, withPhoto, t0), 0);
  assert.equal(await sweep(email, { pets: [] }, t0), 0);           // pasa a la papelera, todavía no se borra (Deshacer)
  assert.ok(await kvGet('orbit:petimg:abcdef0123'));
  assert.equal(await sweep(email, { pets: [] }, t0 + TRASH_GRACE_MS + 1), 1);
  assert.equal(await kvGet('orbit:petimg:abcdef0123'), null);
  assert.equal((await getUsage(email)).bytes, 0);
});

/* ---------- QR del collar ---------- */
import mascotas, { publicPet, cleanDoc } from '../api/mascotas.js';
const QR_EMAIL = 'qr@ejemplo.com', QR_TOKEN = 'tokQRprueba123';
async function qrSetup() {
  const pet = cleanDoc({ pets: [{ id: 'luna01', name: 'Luna', species: 'perro', sex: 'h', birth: '2022-01-01', chip: '123', allergies: 'pollo', color: 'Marrón', marks: 'Mancha en el ojo',
    vet: { name: 'Vete', phone: '1' }, conditions: [{ name: 'Otitis' }], surgeries: [{ name: 'Castración' }], records: [{ type: 'vacuna', name: 'Antirrábica', date: '2026-01-01' }],
    contact: { show: true, name: 'Majo', phone: '+54 9 11 5555-5555' }, qrNote: { show: false, text: 'Toma fenobarbital' } }] }).pets[0];
  pet.share = QR_TOKEN;
  await kvSet(`orbit:pets:${QR_EMAIL}`, { pets: [pet], rev: 1 });
  await kvSet(`orbit:petshare:${QR_TOKEN}`, { email: QR_EMAIL, petId: 'luna01' });
  await kvSet(`orbit:purchases:${QR_EMAIL}`, [{ productId: 'ob-018', date: '2026-10-12' }]);
  return pet;
}
const qrCall = (method, query, body, ip = '1.1.1.1', city = 'Palermo') => new Promise(ok => {
  const res = { code: 200, setHeader() {}, status(c) { this.code = c; return this; }, json(o) { ok({ code: this.code, body: o }); }, end() { ok({ code: this.code }); } };
  mascotas({ method, query, body, headers: { 'x-forwarded-for': ip, 'x-vercel-ip-city': city, 'x-vercel-ip-country-region': 'C' } }, res);
});

test('QR: la ficha pública muestra solo lo necesario para devolverla', async () => {
  const pet = await qrSetup();
  const pub = publicPet(pet);
  for (const k of ['birth', 'chip', 'vet', 'conditions', 'surgeries', 'records', 'allergies', 'weight', 'neutered']) assert.equal(pub[k], undefined, k);
  assert.equal(pub.urgent, '');
  assert.equal(pub.contact.phone, '+54 9 11 5555-5555');
  assert.equal(publicPet({ ...pet, qrNote: { show: true, text: 'Toma fenobarbital' } }).urgent, 'Toma fenobarbital');
});

test('QR: escaneo anotado una vez por celu y aviso con tope de 10 minutos', async () => {
  await qrSetup();
  await kvSet(`orbit:petscans:${QR_EMAIL}`, []);
  const r = await qrCall('GET', { s: QR_TOKEN });
  assert.equal(r.code, 200); assert.equal(r.body.pet.chip, undefined);
  await qrCall('GET', { s: QR_TOKEN });                 /* mismo celu: no se duplica */
  await qrCall('GET', { s: QR_TOKEN }, null, '2.2.2.2'); /* otro celu: se anota */
  const list = await kvGet(`orbit:petscans:${QR_EMAIL}`);
  assert.equal(list.length, 2); assert.equal(list[0].city, 'Palermo'); assert.equal(list[0].kind, 'scan');
  assert.ok(await kvGet(`orbit:petqrping:scan:${QR_TOKEN}`));
  assert.ok(!JSON.stringify(list).includes('1.1.1.1'), 'la IP no se guarda');
});

test('QR: quien la encuentra avisa con ubicación; 5 mensajes por hora por IP', async () => {
  await qrSetup();
  await kvSet(`orbit:petscans:${QR_EMAIL}`, []);
  assert.equal((await qrCall('POST', { s: QR_TOKEN, found: '1' }, {}, '3.3.3.3')).code, 400);
  const ok = await qrCall('POST', { s: QR_TOKEN, found: '1' }, { loc: { lat: -34.58712345, lng: -58.4301, acc: 25 }, name: 'Caro', phone: '11 4444<b>', msg: 'La tengo en casa' }, '3.3.3.3');
  assert.equal(ok.code, 200);
  const e = (await kvGet(`orbit:petscans:${QR_EMAIL}`)).at(-1);
  assert.deepEqual(e.loc, { lat: -34.58712, lng: -58.4301, acc: 25 });
  assert.equal(e.phone, '11 4444'); assert.equal(e.kind, 'msg');
  for (let i = 0; i < 4; i++) assert.equal((await qrCall('POST', { s: QR_TOKEN, found: '1' }, { msg: 'hola ' + i }, '3.3.3.3')).code, 200);
  assert.equal((await qrCall('POST', { s: QR_TOKEN, found: '1' }, { msg: 'spam' }, '3.3.3.3')).code, 429);
  assert.equal((await qrCall('POST', { s: QR_TOKEN, found: '1' }, { msg: 'otra persona' }, '4.4.4.4')).code, 200);
  assert.equal((await qrCall('POST', { s: QR_TOKEN, found: '1' }, { website: 'bot', msg: 'x' }, '5.5.5.5')).code, 200);
  const fin = await kvGet(`orbit:petscans:${QR_EMAIL}`); assert.equal(fin.length, 6, "el bot no queda anotado");
});

test('QR: sin la compra el link deja de andar', async () => {
  await qrSetup();
  await kvSet(`orbit:purchases:${QR_EMAIL}`, []);
  assert.equal((await qrCall('GET', { s: QR_TOKEN })).code, 404);
  assert.equal((await qrCall('POST', { s: QR_TOKEN, found: '1' }, { msg: 'x' })).code, 404);
});

/* ---------- cron cada hora: una sola vez y a las 9 de cada persona ---------- */
const sendSpy = () => { const log = []; return { log, send: { push: async (n, p) => { log.push(['push', n.email, p.tag]); return 1; }, mail: async (email, items) => { log.push(['mail', email, items.length]); return true; } } }; };
const vacunaEn = (date, next) => ({ pets: [{ id: 'p1', name: 'Luna', records: [{ id: 'r1', type: 'vacuna', name: 'Antirrábica', date, next }] }] });
async function cuenta(email, tz, docDate) {
  await kvSet(`orbit:purchases:${email}`, [{ productId: 'ob-018', orderId: 'o-' + email, date: '2026-10-01' }]);
  await kvSet(`orbit:pets:${email}`, vacunaEn('2025-10-16', docDate));
  await saveNotify({ email, subs: [{ endpoint: 'https://push.example/' + email, keys: { p256dh: 'x', auth: 'y' } }], mail: true, off: {}, tz, sent: {} });
}

test('cron horario: dos corridas en la misma hora mandan una sola vez', async () => {
  await cuenta('dedupe@prueba.com', 'America/Argentina/Buenos_Aires', '2026-10-16');   // 3 días después del 13/10
  const { log, send } = sendSpy();
  const now = new Date('2026-10-13T12:00:00Z');                                         // 9:00 en Buenos Aires
  const a = await runAvisos({ now, send });
  const b = await runAvisos({ now, send });
  const c = await runAvisos({ now: new Date('2026-10-13T15:00:00Z'), send });           // y tampoco más tarde ese día
  assert.equal(a.avisos, 1);
  assert.equal(b.avisos + c.avisos, 0);
  assert.deepEqual(log.filter(x => x[1] === 'dedupe@prueba.com'), [['push', 'dedupe@prueba.com', 'rec:p1:r1:2026-10-16:3'], ['mail', 'dedupe@prueba.com', 1]]);
  /* aunque se borre la marca del día (reintento a medias), el candado del aviso no deja repetir */
  await kvSet('orbit:petday:dedupe@prueba.com', null);
  assert.equal((await runAvisos({ now, send })).avisos, 0);
});

test('cron horario: cada persona recibe a las 9 de su zona (Madrid y Buenos Aires)', async () => {
  await cuenta('madrid@prueba.com', 'Europe/Madrid', '2026-11-05');
  await cuenta('baires@prueba.com', 'America/Argentina/Buenos_Aires', '2026-11-05');
  const { log, send } = sendSpy();
  const quien = () => log.filter(x => x[0] === 'push').map(x => x[1]).filter(e => e === 'madrid@prueba.com' || e === 'baires@prueba.com');
  await runAvisos({ now: new Date('2026-11-02T07:00:00Z'), send });   // 8:00 Madrid, 4:00 Buenos Aires
  assert.deepEqual(quien(), []);
  await runAvisos({ now: new Date('2026-11-02T08:00:00Z'), send });   // 9:00 Madrid (horario de invierno)
  assert.deepEqual(quien(), ['madrid@prueba.com']);
  await runAvisos({ now: new Date('2026-11-02T11:00:00Z'), send });   // 8:00 Buenos Aires
  assert.deepEqual(quien(), ['madrid@prueba.com']);
  await runAvisos({ now: new Date('2026-11-02T12:00:00Z'), send });   // 9:00 Buenos Aires
  assert.deepEqual(quien(), ['madrid@prueba.com', 'baires@prueba.com']);
});

test('cron horario: sin zona guardada usa Buenos Aires; una zona inválida también', async () => {
  assert.equal(DEFAULT_TZ, 'America/Argentina/Buenos_Aires');
  assert.deepEqual(localClock(undefined, new Date('2026-10-20T11:59:00Z')), { date: '2026-10-20', hour: 8 });
  assert.deepEqual(localClock('Nada/Inventada', new Date('2026-10-20T12:00:00Z')), { date: '2026-10-20', hour: 9 });
  await cuenta('sintz@prueba.com', undefined, '2026-10-23');
  const { log, send } = sendSpy();
  const mios = () => log.filter(x => x[1] === 'sintz@prueba.com');
  await runAvisos({ now: new Date('2026-10-20T11:00:00Z'), send });   // 8:00 en Buenos Aires: todavía no
  assert.equal(mios().length, 0);
  await runAvisos({ now: new Date('2026-10-20T12:00:00Z'), send });   // 9:00: sale
  assert.equal(mios().filter(x => x[0] === 'push').length, 1);
});

test('cron horario: quien apaga push y mail sale del índice y no se vuelve a mirar', async () => {
  await cuenta('baja@prueba.com', 'America/Argentina/Buenos_Aires', '2026-12-04');
  await saveNotify({ email: 'baja@prueba.com', subs: [], mail: false, off: {}, sent: {} });
  const { log, send } = sendSpy();
  await runAvisos({ now: new Date('2026-12-01T12:00:00Z'), send });
  assert.equal(log.filter(x => x[1] === 'baja@prueba.com').length, 0);
});
