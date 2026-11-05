/* Mimitos · QR (15/10): la ciudad por IP es "zona aproximada" (Majo escaneó en Corrientes y el aviso dijo Buenos Aires,
   por la salida de la operadora móvil). Quien escanea manda la ubicación exacta con un toque y llega un SEGUNDO aviso
   aunque estemos dentro de los 10 minutos; el tope queda para escaneos repetidos y el mismo contenido repetido.
   Correr con: node --test test/mascotas-qr-ubicacion.test.mjs */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import webpush from 'web-push';
for (const k of ['KV_REST_API_URL', 'KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'VERCEL_ENV', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'BREVO_API_KEY']) delete process.env[k];
process.env.SESSION_SECRET = 'prueba-secreta-de-mimitos-qr-ubicacion-1234';

const { kvSet, kvGet, kvDel } = await import('../api/_lib/kv.js');
const { default: mascotas, zoneText, exactText, mapUrl } = await import('../api/mascotas.js');

const EMAIL = 'qr-ubi@ejemplo.com', TOKEN = 'QRubicacion0001';
let sent = [];
webpush.sendNotification = async (sub, payload) => { sent.push(JSON.parse(payload)); };
async function setup(lost = false) {
  sent = [];
  await kvSet(`orbit:purchases:${EMAIL}`, [{ productId: 'ob-018', orderId: 'o1', date: '2026-10-01' }]);
  await kvSet(`orbit:petshare:${TOKEN}`, { email: EMAIL, petId: 'aika0001' });
  await kvSet(`orbit:pets:${EMAIL}`, { rev: 1, pets: [{ id: 'aika0001', name: 'Aika', species: 'perro', sex: 'h', share: TOKEN, lost: { on: lost }, contact: { show: true, name: 'Majo', phone: '+54 9 379 555-5555' } }] });
  await kvSet(`orbit:petnotify:${EMAIL}`, { subs: [{ endpoint: 'https://fcm.googleapis.com/fcm/send/x', keys: { p256dh: 'x', auth: 'y' } }], mail: false, off: {}, tz: 'America/Argentina/Buenos_Aires' });
  await kvSet(`orbit:petscans:${EMAIL}`, []);
}
const call = (method, query, body, ip = '9.9.9.9') => new Promise(ok => {
  const res = { code: 200, setHeader() {}, status(c) { this.code = c; return this; }, json(o) { ok({ code: this.code, body: o }); }, end() { ok({ code: this.code }); } };
  mascotas({ method, query, body, headers: { 'x-forwarded-for': ip, 'x-vercel-ip-city': 'Buenos Aires', 'x-vercel-ip-country-region': 'C' } }, res);
});

test('textos: zona aproximada por IP y ubicación exacta con Google Maps y precisión', () => {
  assert.equal(zoneText({ city: 'Buenos Aires', region: 'C' }), 'Zona aproximada según la conexión: Buenos Aires, C (puede no ser exacta)');
  assert.equal(zoneText({}), '');
  assert.equal(mapUrl({ lat: -27.4692, lng: -58.8306 }), 'https://www.google.com/maps?q=-27.4692,-58.8306');
  assert.equal(exactText({ lat: -27.4692, lng: -58.8306, acc: 18 }), '📍 Ubicación exacta (precisión de unos 18 m): https://www.google.com/maps?q=-27.4692,-58.8306');
  assert.equal(exactText({ lat: 1, lng: 2, acc: null }), '📍 Ubicación exacta: https://www.google.com/maps?q=1,2');
});

test('escaneo: el aviso dice "zona aproximada según la conexión", no "cerca de"', async () => {
  await setup();
  assert.equal((await call('GET', { s: TOKEN })).code, 200);
  assert.equal(sent.length, 1);
  assert.match(sent[0].body, /^Zona aproximada según la conexión: Buenos Aires, C \(puede no ser exacta\)/);
  assert.doesNotMatch(sent[0].body, /Cerca de/);
});

test('compartir después de escanear: segundo aviso con la ubicación exacta aunque estemos dentro de los 10 min', async () => {
  await setup();
  await kvDel(`orbit:petqrping:scan:${TOKEN}`);
  await call('GET', { s: TOKEN }, null, '7.1.1.1');
  assert.equal(sent.length, 1, 'aviso del escaneo');
  const r = await call('POST', { s: TOKEN, found: '1' }, { loc: { lat: -27.46921, lng: -58.83061, acc: 18 } });
  assert.equal(r.code, 200);
  assert.equal(sent.length, 2, 'escaneo + ubicación');
  const n = sent[1];
  assert.match(n.title, /^📍 Alguien compartió dónde está Aika/);
  assert.match(n.body, /📍 Ubicación exacta \(precisión de unos 18 m\): https:\/\/www\.google\.com\/maps\?q=-27\.46921,-58\.83061/);
  assert.equal(n.url, 'https://www.google.com/maps?q=-27.46921,-58.83061', 'tocar el aviso abre el mapa');
  /* el mismo contenido repetido no vuelve a avisar; un teléfono nuevo sí */
  await call('POST', { s: TOKEN, found: '1' }, { loc: { lat: -27.46922, lng: -58.83062, acc: 20 } });
  assert.equal(sent.length, 2, 'misma ubicación (±100 m) en 10 min: sin aviso repetido');
  await call('POST', { s: TOKEN, found: '1' }, { loc: { lat: -27.46921, lng: -58.83061, acc: 18 }, phone: '379 444-4444', name: 'Juli' });
  assert.equal(sent.length, 3); assert.match(sent[2].body, /Tel\.: 379 444-4444/);
  /* el escaneo repetido sigue con su tope de 10 min */
  await call('GET', { s: TOKEN }, null, '8.8.8.8');
  assert.equal(sent.length, 3);
  const log = await kvGet(`orbit:petscans:${EMAIL}`);
  assert.deepEqual(log.find(x => x.kind === 'msg').loc, { lat: -27.46921, lng: -58.83061, acc: 18 });
});

test('sin permiso de ubicación: "dónde estoy" en texto llega como aviso; sin datos, 400; tope por IP intacto', async () => {
  await setup(true);
  const r = await call('POST', { s: TOKEN, found: '1' }, { place: 'Junín y 3 de Abril, frente a la plaza' }, '6.6.6.6');
  assert.equal(r.code, 200);
  assert.match(sent.at(-1).body, /Dónde: "Junín y 3 de Abril, frente a la plaza"/);
  assert.equal((await kvGet(`orbit:petscans:${EMAIL}`)).at(-1).place, 'Junín y 3 de Abril, frente a la plaza');
  assert.equal((await call('POST', { s: TOKEN, found: '1' }, {}, '6.6.6.6')).code, 400);
  for (let i = 0; i < 4; i++) await call('POST', { s: TOKEN, found: '1' }, { place: 'Esquina ' + i }, '6.6.6.6');
  assert.equal((await call('POST', { s: TOKEN, found: '1' }, { place: 'otra' }, '6.6.6.6')).code, 429, '5 por hora por IP');
});

test('ficha pública: "Avisale a su familia dónde estás" primero, con texto de modo perdida y alternativa en texto', () => {
  const html = readFileSync(new URL('../mascota.html', import.meta.url), 'utf8');
  const ficha = html.slice(html.indexOf('function ficha('), html.indexOf('function hereHtml'));
  const iHero = ficha.indexOf('qr-hero'), iHere = ficha.indexOf('id="hereBox"'), iCall = ficha.indexOf('qr-contact'), iForm = ficha.indexOf('qr-form');
  assert.ok(iHero < iHere && iHere < iCall && iCall < iForm, 'foto/nombre → ubicación → llamar/WhatsApp → formulario opcional');
  const here = html.slice(html.indexOf('function hereHtml'), html.indexOf('async function sendFound'));
  assert.ok(here.includes("'Avisale a su familia dónde estás'"));
  assert.ok(here.includes('Si ${ella} encontraste, tocá acá: su familia ${ella} está buscando'));
  assert.ok(here.includes('getCurrentPosition') && here.includes('postFound({ loc: here'), 'un toque manda las coordenadas');
  assert.ok(here.includes("hereView('texto')") && here.includes('postFound({ place: v'), 'sin permiso: dirección en texto');
  assert.ok(ficha.includes('Mandar WhatsApp') || html.includes('Mandar WhatsApp'));
  const sw = readFileSync(new URL('../mascotas-sw.js', import.meta.url), 'utf8');
  assert.match(sw, /google\\.com\\\/maps/, 'el service worker abre el mapa al tocar el aviso');
});
