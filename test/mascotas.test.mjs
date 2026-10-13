/* Mimitos · pruebas de las reglas de avisos, el cron y la limpieza de archivos.
   Correr con: node --test test/mascotas.test.mjs  (sin KV configurado usa memoria, no toca datos reales) */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dueToday } from '../api/_lib/petpush.js';
import { sweep, addUsage, photoRef, getUsage, TRASH_GRACE_MS } from '../api/_lib/petfiles.js';
import { kvGet, kvSet } from '../api/_lib/kv.js';
import cron from '../api/cron/mascotas.js';
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
  assert.equal(await call({ 'user-agent': 'vercel-cron/1.0' }), 503);
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
