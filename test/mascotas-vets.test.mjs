/* Mimitos · Veterinarias cerca y turnos: proxy de Google Places (simulado: nada sale a internet), field mask,
   techo de gasto con avisos y apagado, tope por cuenta, caché solo de place IDs, mensaje de WhatsApp,
   turnos con avisos y dedupe, y compatibilidad con docs viejos.
   Correr con: node --test test/mascotas-vets.test.mjs */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
for (const k of ['KV_REST_API_URL', 'KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'VERCEL_ENV', 'MIMITOS_MAPS_BUDGET_USD', 'MIMITOS_MAPS_PER_DAY', 'MIMITOS_PLACES_TIER', 'RESEND_API_KEY', 'BREVO_FROM', 'GOOGLE_MAPS_BROWSER_KEY']) delete process.env[k];
process.env.SESSION_SECRET = 'prueba-secreta-de-mimitos-vets-1234567890';
process.env.GOOGLE_MAPS_API_KEY = 'clave-servidor-secreta';
process.env.BREVO_API_KEY = 'brevo-de-prueba';
process.env.ADMIN_EMAILS = 'majo@orbit.test';

const { kvGet, kvSet, kvDel, kvKeys, kvMGet, kvSMembers } = await import('../api/_lib/kv.js');
const { makeSession } = await import('../api/_lib/auth.js');
const P = await import('../api/_lib/petplaces.js');
const TU = await import('../api/_lib/petturnos.js');
const A = await import('../api/_lib/petask.js');
const { default: mascotas, cleanDoc } = await import('../api/mascotas.js');
const T = globalThis.MZTURNOS;

/* Google y Brevo simulados: cualquier otro fetch hace fallar el test */
let gcalls = [], mails = [], google = () => ({ status: 200, body: { places: [PLACE()] } });
const PLACE = (x = {}) => ({ id: 'ChIJvet00000001', displayName: { text: 'Veterinaria San Roque', languageCode: 'es' }, shortFormattedAddress: 'Av. Corrientes 1234', location: { latitude: -34.6037, longitude: -58.3816 }, rating: 4.6, userRatingCount: 212, currentOpeningHours: { openNow: true }, nationalPhoneNumber: '011 15-2345-6789', internationalPhoneNumber: '+54 9 11 2345-6789', googleMapsUri: 'https://maps.google.com/?cid=123', ...x });
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  if (u.startsWith('https://places.googleapis.com/')) {
    gcalls.push({ url: u, method: init.method, headers: init.headers, body: init.body ? JSON.parse(init.body) : null });
    const r = google(u);
    if (r.network) throw new TypeError('fetch failed');
    return new Response(JSON.stringify(r.body || {}), { status: r.status, headers: { 'content-type': 'application/json' } });
  }
  if (u === 'https://api.brevo.com/v3/smtp/email') { mails.push(JSON.parse(init.body)); return new Response('{"messageId":"x"}', { status: 201, headers: { 'content-type': 'application/json' } }); }
  throw new Error('salida a internet no permitida en el test: ' + u);
};
const quiet = async fn => { const e = console.error, logs = []; console.error = (...a) => logs.push(a.join(' ')); try { return [await fn(), logs]; } finally { console.error = e; } };
const call = (method, query, body, email) => new Promise(ok => {
  const res = { code: 200, headers: {}, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, status(c) { this.code = c; return this; }, json(o) { ok({ code: this.code, body: o }); }, end(b) { ok({ code: this.code, raw: b }); }, redirect(c, u) { ok({ code: c, location: u }); } };
  mascotas({ method, query, body, headers: { ...(email ? { cookie: `orbit_session=${makeSession(email)}` } : {}), host: 'preview.orbitando.test' } }, res);
});
const buy = email => kvSet(`orbit:purchases:${email}`, [{ productId: 'ob-018', orderId: 'o-' + email, date: new Date(Date.now() - 2 * 864e5).toISOString() }]);
const near = (email, kind = 'vet', lat = -34.603722, lng = -58.381592) => call('POST', { places: 'nearby' }, { kind, lat, lng }, email);
let n = 0;
const fresh = async () => { const e = `vets${++n}@ejemplo.com`; await buy(e); return e; };
beforeEach(async () => {
  gcalls = []; mails = []; google = () => ({ status: 200, body: { places: [PLACE()] } });
  for (const k of ['MIMITOS_MAPS_BUDGET_USD', 'MIMITOS_MAPS_PER_DAY', 'MIMITOS_PLACES_TIER']) delete process.env[k];
  await kvDel(P.spendKey()); for (const l of [80, 100]) await kvDel(P.alertKey(l));
});

/* ---------- proxy ---------- */
test('acceso: sin sesión 401 y sin compra 402 (como el resto de la app)', async () => {
  assert.equal((await call('POST', { places: 'nearby' }, { lat: -34, lng: -58 })).code, 401);
  assert.equal((await near('sincompra@ejemplo.com')).code, 402);
  assert.equal(gcalls.length, 0);
});

test('Nearby Search: clave solo en el header del servidor, tipo, orden por distancia, 5 km y ubicación redondeada', async () => {
  const email = await fresh();
  const r = await near(email);
  assert.equal(r.code, 200);
  const g = gcalls[0];
  assert.equal(g.url, 'https://places.googleapis.com/v1/places:searchNearby');
  assert.equal(g.headers['X-Goog-Api-Key'], 'clave-servidor-secreta');
  assert.deepEqual(g.body.includedTypes, ['veterinary_care']);
  assert.equal(g.body.rankPreference, 'DISTANCE');
  assert.equal(g.body.maxResultCount, 20);
  assert.equal(g.body.languageCode, 'es'); assert.equal(g.body.regionCode, 'AR');
  assert.deepEqual(g.body.locationRestriction.circle.center, { latitude: -34.604, longitude: -58.382 }, 'a 3 decimales');
  assert.equal(g.body.locationRestriction.circle.radius, 5000);
  const pl = r.body.places[0];
  assert.deepEqual({ name: pl.name, address: pl.address, rating: pl.rating, ratings: pl.ratings, open: pl.open, phone: pl.phone, intl: pl.intl }, { name: 'Veterinaria San Roque', address: 'Av. Corrientes 1234', rating: 4.6, ratings: 212, open: true, phone: '011 15-2345-6789', intl: '+54 9 11 2345-6789' });
  assert.equal(r.body.attribution, 'Google Maps');
  assert.ok(!JSON.stringify(r.body).includes('clave-servidor-secreta'), 'la clave no viaja al navegador');
  assert.match(r.body.mapsUrl, /^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=veterinaria$/, 'el link gratis no lleva la ubicación');
});

test('Pet shops por Nearby (pet_store); guardias 24 h y barrio o ciudad por Text Search', async () => {
  const email = await fresh();
  await near(email, 'pet');
  assert.deepEqual(gcalls[0].body.includedTypes, ['pet_store']);
  await near(email, 'er');
  assert.equal(gcalls[1].url, 'https://places.googleapis.com/v1/places:searchText');
  assert.match(gcalls[1].body.textQuery, /guardia 24 horas/);
  assert.equal(gcalls[1].body.includedType, 'veterinary_care');
  assert.ok(gcalls[1].body.locationBias.circle, 'con la ubicación como sesgo');
  const t = await call('POST', { places: 'text' }, { kind: 'vet', q: 'Palermo, CABA' }, email);
  assert.equal(t.code, 200);
  assert.equal(gcalls[2].body.textQuery, 'veterinaria en Palermo, CABA');
  assert.equal(gcalls[2].body.locationBias, undefined, 'sin ubicación');
  assert.equal((await call('POST', { places: 'text' }, { q: 'a' }, email)).code, 400);
  assert.equal((await call('POST', { places: 'nearby' }, { lat: 'x' }, email)).code, 400);
});

test('field mask: Enterprise por defecto (estrellas, abierto ahora y teléfono); Pro sin esos campos; detalles en Enterprise', async () => {
  const email = await fresh();
  await near(email);
  const m = gcalls[0].headers['X-Goog-FieldMask'].split(',');
  for (const f of ['places.id', 'places.displayName', 'places.shortFormattedAddress', 'places.location', 'places.googleMapsUri', 'places.rating', 'places.userRatingCount', 'places.currentOpeningHours.openNow', 'places.nationalPhoneNumber', 'places.internationalPhoneNumber']) assert.ok(m.includes(f), f);
  assert.ok(!m.some(f => /photos|reviews|editorialSummary|websiteUri|regularOpeningHours|\*/.test(f)), 'nada de fotos, reseñas ni comodines');
  process.env.MIMITOS_PLACES_TIER = 'pro';
  google = () => ({ status: 200, body: { places: [{ id: 'ChIJvet00000002', displayName: { text: 'Vete Pro' }, location: { latitude: -34.6, longitude: -58.38 } }] } });
  const r = await near(email);
  const mp = gcalls[1].headers['X-Goog-FieldMask'];
  assert.ok(!/rating|PhoneNumber|OpeningHours/.test(mp), 'Pro: sin campos Enterprise');
  assert.equal(r.body.places[0].detailed, false, 'la app pide el detalle al tocar');
  assert.equal(r.body.sku, 'Nearby Search Pro');
  google = () => ({ status: 200, body: PLACE({ id: 'ChIJvet00000002' }) });
  const d = await call('POST', { places: 'details' }, { id: 'ChIJvet00000002' }, email);
  assert.equal(d.code, 200);
  assert.equal(gcalls[2].url, 'https://places.googleapis.com/v1/places/ChIJvet00000002?languageCode=es&regionCode=AR');
  assert.equal(gcalls[2].method, 'GET');
  assert.equal(gcalls[2].headers['X-Goog-FieldMask'], P.DETAILS_MASK);
  assert.ok(!P.DETAILS_MASK.includes('places.'), 'detalles va sin prefijo');
  assert.equal(d.body.place.phone, '011 15-2345-6789');
});

test('config: dice si está listo y da la clave del mapa (navegador), nunca la del servidor', async () => {
  const email = await fresh();
  process.env.GOOGLE_MAPS_BROWSER_KEY = 'clave-navegador';
  const r = await call('GET', { places: 'config' }, null, email);
  delete process.env.GOOGLE_MAPS_BROWSER_KEY;
  assert.equal(r.code, 200);
  assert.equal(r.body.ready, true); assert.equal(r.body.mapsKey, 'clave-navegador'); assert.equal(r.body.perDay, 20); assert.equal(r.body.left, 20);
  assert.ok(!JSON.stringify(r.body).includes('clave-servidor-secreta'));
  const key = process.env.GOOGLE_MAPS_API_KEY; delete process.env.GOOGLE_MAPS_API_KEY;
  const off = await near(email);
  process.env.GOOGLE_MAPS_API_KEY = key;
  assert.equal(off.code, 503); assert.equal(off.body.error, 'maps_no_configurado'); assert.ok(off.body.mapsUrl);
});

/* ---------- techo ---------- */
test('techo: cada llamada suma su SKU a precio de lista (Nearby/Text Enterprise USD 0,035; detalles USD 0,02)', async () => {
  const email = await fresh();
  await near(email); await near(email, 'er');
  assert.equal(await P.spentMicro(), 70000);
  await call('POST', { places: 'details' }, { id: 'ChIJvet00000001' }, email);
  assert.equal(await P.spentMicro(), 90000);
  assert.equal(P.DEFAULT_BUDGET_USD, 20); assert.equal(P.budgetUsd(), 20);
});

test('techo: al 80 % sale un mail a ADMIN_EMAILS una sola vez; al 100 % se apaga la lista, mail de pausa y no sale nada a Google', async () => {
  const email = await fresh();
  await kvSet(P.spendKey(), 15_990_000);   /* USD 15,99 de 20: esta llamada pasa el 80 % */
  await near(email);
  assert.equal(mails.length, 1);
  assert.match(mails[0].subject, /80%/);
  assert.match(mails[0].textContent, /MIMITOS_MAPS_BUDGET_USD/);
  assert.ok(!/vets\d+@|Corrientes|-34/.test(mails[0].textContent + mails[0].htmlContent), 'sin datos de la persona ni del lugar');
  await near(email);
  assert.equal(mails.length, 1, 'dedupe del 80 % en el mes');
  await kvSet(P.spendKey(), 19_990_000);
  const [r] = await quiet(() => near(email));
  assert.equal(r.code, 503); assert.equal(r.body.error, 'maps_paused');
  assert.match(r.body.message, /Google Maps/); assert.ok(r.body.mapsUrl.startsWith('https://www.google.com/maps/search/'));
  assert.equal(await P.spentMicro(), 19_990_000, 'la reserva vuelve');
  assert.equal(mails.length, 2); assert.match(mails[1].subject, /pausa/);
  const before = gcalls.length;
  const again = await near(email);
  assert.equal(again.body.error, 'maps_paused');
  assert.equal(gcalls.length, before, 'apagado: no sale a Google');
  assert.equal(mails.length, 2, 'dedupe del 100 %');
  const cfg = await call('GET', { places: 'config' }, null, email);
  assert.equal(cfg.body.paused, true);
});

test('techo: si Google no responde (red o 5xx) la reserva y la búsqueda del día vuelven', async () => {
  const email = await fresh();
  google = () => ({ network: true });
  const [r] = await quiet(() => near(email));
  assert.equal(r.code, 502);
  google = () => ({ status: 503, body: { error: { message: 'caído' } } });
  await quiet(() => near(email));
  assert.equal(await P.spentMicro(), 0);
  assert.equal(Number(await kvGet(P.rateKey(email, 'search'))), 0);
});

/* ---------- tope por cuenta y caché ---------- */
test('tope por cuenta: 20 búsquedas por día (MIMITOS_MAPS_PER_DAY), después 429 con el link gratis', async () => {
  const email = await fresh();
  process.env.MIMITOS_MAPS_PER_DAY = '3';
  for (let i = 0; i < 3; i++) assert.equal((await near(email)).code, 200);
  const r = await near(email);
  assert.equal(r.code, 429); assert.equal(r.body.error, 'limite_diario'); assert.ok(r.body.mapsUrl);
  assert.equal(gcalls.length, 3);
  assert.equal((await near(await fresh())).code, 200, 'es por cuenta');
});

test('caché: el servidor guarda solo place IDs (nada de nombres, teléfonos ni ubicaciones); detalles solo de lugares vistos o guardados', async () => {
  const email = await fresh();
  await near(email);
  const keys = await kvKeys('orbit:petmaps:*');
  const vals = JSON.stringify(await kvMGet(keys));
  assert.ok(!/San Roque|Corrientes|2345|-34\.6|-58\.3/.test(vals), 'sin contenido de Places ni la ubicación de la persona');
  assert.deepEqual(await kvGet(P.seenKey(email)), ['ChIJvet00000001']);
  assert.equal((await call('POST', { places: 'details' }, { id: 'ChIJotro0000009' }, email)).code, 403);
  /* guardado como "Mi veterinaria" en el doc: se puede pedir aunque no esté en lo visto */
  await kvSet(`orbit:pets:${email}`, { pets: [{ id: 'aika0001', name: 'Aika', vetPlace: { placeId: 'ChIJmia00000001' } }], rev: 1 });
  google = () => ({ status: 200, body: PLACE({ id: 'ChIJmia00000001' }) });
  assert.equal((await call('POST', { places: 'details' }, { id: 'ChIJmia00000001' }, email)).code, 200);
  assert.equal((await call('POST', { places: 'details' }, { id: '../../x' }, email)).code, 400);
});

/* ---------- WhatsApp ---------- */
test('WhatsApp: solo celulares argentinos van a wa.me; el mensaje lleva nombre, especie y motivo', () => {
  assert.equal(T.waPhone('+54 9 11 2345-6789'), '5491123456789');
  assert.equal(T.waPhone('011 15-2345-6789'), '5491123456789');
  assert.equal(T.waPhone('(0351) 15 123-4567'), '5493511234567');
  assert.equal(T.waPhone('2944 15 12-3456'), '5492944123456');
  assert.equal(T.waPhone('+54 11 4567-8901'), '', 'fijo');
  assert.equal(T.waPhone('011 4567-8901'), '', 'fijo');
  assert.equal(T.waPhone('+598 99 123 456'), '', 'otro país');
  assert.equal(T.waPhone(''), '');
  const pet = { name: 'Aika', species: 'perro' };
  const rec = { type: 'vacuna', name: 'Antirrábica', next: '2026-10-02' };
  const why = T.reasonFrom(rec, '2026-10-14');
  assert.equal(why, 'la Antirrábica — vencida el 2 de octubre');
  assert.equal(T.waMessage(pet, why), 'Hola, quería pedir un turno para Aika (perro). Le toca la Antirrábica — vencida el 2 de octubre. ¿Tienen disponibilidad?');
  assert.equal(T.reasonFrom({ type: 'control', name: 'Control anual', next: '2026-10-20' }, '2026-10-14'), 'el Control anual — para el 20 de octubre');
  assert.equal(T.waMessage({ name: 'Michi', species: 'otra', speciesOther: 'Conejo' }, ''), 'Hola, quería pedir un turno para Michi (conejo). ¿Tienen disponibilidad?');
  const link = T.waLink('011 15-2345-6789', 'Hola ¿hay turno?');
  assert.equal(link, 'https://wa.me/5491123456789?text=Hola%20%C2%BFhay%20turno%3F');
  assert.equal(T.waLink('011 4567-8901', 'x'), '');
});

/* ---------- turnos ---------- */
const APPT = (x = {}) => ({ id: 'turno001', petId: 'aika0001', date: '2026-10-20', time: '10:30', place: { name: 'Veterinaria San Roque', phone: '011 15-2345-6789', address: 'Av. Corrientes 1234', placeId: 'ChIJvet00000001' }, reason: 'Antirrábica', ...x });
test('regla de avisos de turnos (la misma en la app y el cron): el día anterior desde las 9, 2 horas antes, y sin hora el mismo día', () => {
  const a = APPT();
  const at = (date, h, m = 0) => T.reminders([a], { date, min: h * 60 + m }).map(x => x.kind);
  assert.deepEqual(at('2026-10-19', 8), []);
  assert.deepEqual(at('2026-10-19', 9), ['dia']);
  assert.deepEqual(at('2026-10-20', 8), [], 'a las 8 faltan 2 h 30');
  assert.deepEqual(at('2026-10-20', 8, 30), ['2h']);
  assert.deepEqual(at('2026-10-20', 9), ['2h']);
  assert.deepEqual(at('2026-10-20', 10, 30), [], 'ya empezó');
  const b = APPT({ time: '' });
  assert.deepEqual(T.reminders([b], { date: '2026-10-20', min: 9 * 60 }).map(x => x.kind), ['hoy']);
  assert.equal(T.notice(a, 'Aika', 'dia').title, 'Mañana Aika tiene turno a las 10:30');
  assert.equal(T.notice(APPT({ time: '17:00' }), 'Aika', '2h').title, 'En 2 horas: turno de Aika a las 17 h');
  /* ¿Cómo te fue?: una hora después del turno, hasta 30 días */
  assert.equal(T.toLog([a], { date: '2026-10-20', min: 11 * 60 }).length, 0);
  assert.equal(T.toLog([a], { date: '2026-10-20', min: 11 * 60 + 30 }).length, 1);
  assert.equal(T.toLog([{ ...a, logged: true }], { date: '2026-10-21', min: 0 }).length, 0);
  /* el reloj local de la persona */
  assert.deepEqual(T.localNow('America/Argentina/Buenos_Aires', new Date('2026-10-19T12:00:00Z')), { date: '2026-10-19', min: 9 * 60 });
});

test('cron de turnos: push y mail el día anterior y 2 h antes, una sola vez cada uno (dedupe), solo con compra', async () => {
  const email = await fresh();
  const doc = { pets: [{ id: 'aika0001', name: 'Aika', species: 'perro' }], appointments: [APPT({ id: 'turno777' })], rev: 1 };
  await kvSet(`orbit:pets:${email}`, doc);
  await TU.syncApptIndex(email, doc, new Date('2026-10-18T12:00:00Z'));
  assert.ok((await kvSMembers(TU.APPT_INDEX)).includes(email));
  const sent = [], mailed = [];
  const deps = { hasMimitos: async e => e === email, getNotify: async e => ({ email: e, subs: [{ endpoint: 'x' }], mail: true, off: {}, tz: 'America/Argentina/Buenos_Aires' }), push: async (n, p) => { if (n.email === email) sent.push(p); return 1; }, mail: async (e, items) => { if (e === email) mailed.push(items); return true; } };
  const run = iso => TU.runTurnos({ now: new Date(iso), deps });
  await run('2026-10-19T11:00:00Z');   /* 8:00 en Buenos Aires: todavía no */
  assert.equal(sent.length, 0);
  await run('2026-10-19T12:00:00Z');   /* 9:00 del día anterior */
  assert.equal(sent.length, 1); assert.equal(sent[0].title, 'Mañana Aika tiene turno a las 10:30');
  assert.match(sent[0].body, /Veterinaria San Roque · Antirrábica · Av\. Corrientes 1234/);
  assert.equal(sent[0].url, '/mascotas#/agenda');
  assert.equal(mailed.length, 1);
  await run('2026-10-19T13:00:00Z');   /* corrida siguiente: no repite */
  await run('2026-10-19T12:00:00Z');   /* reintento de la misma corrida */
  assert.equal(sent.length, 1);
  await run('2026-10-20T11:00:00Z');   /* 8:00 del día: faltan 2 h 30 */
  assert.equal(sent.length, 1);
  await run('2026-10-20T12:00:00Z');   /* 9:00: faltan 1 h 30 */
  assert.equal(sent.length, 2); assert.match(sent[1].title, /^En 2 horas/);
  await run('2026-10-20T12:30:00Z');
  assert.equal(sent.length, 2, 'dedupe del aviso de 2 h');
  /* sin turnos por venir sale del índice */
  await TU.syncApptIndex(email, doc, new Date('2026-10-25T12:00:00Z'));
  assert.ok(!(await kvSMembers(TU.APPT_INDEX)).includes(email));
});

/* ---------- doc: compatibilidad ---------- */
test('docs viejos: sin appointments ni vetPlace siguen andando; los turnos se limpian y validan', async () => {
  const old = cleanDoc({ pets: [{ id: 'aika0001', name: 'Aika', vet: { name: 'Vete', phone: '1' } }] });
  assert.deepEqual(old.appointments, []);
  assert.deepEqual(old.pets[0].vetPlace, { name: '', phone: '', address: '', placeId: '' });
  assert.equal(old.pets[0].vet.name, 'Vete');
  const c = cleanDoc({ pets: [{ id: 'aika0001', name: 'Aika', vetPlace: { name: 'San Roque', placeId: 'ChIJvet00000001', evil: 1 } }], appointments: [APPT(), APPT({ id: 'otra0001', petId: 'nadie000' }), APPT({ id: 'mala0001', date: 'mañana' }), APPT({ id: 'hora0001', time: '25:99', place: { name: 'X', placeId: '<script>' } })] });
  assert.equal(c.pets[0].vetPlace.placeId, 'ChIJvet00000001'); assert.equal(c.pets[0].vetPlace.evil, undefined);
  assert.deepEqual(c.appointments.map(a => a.id).sort(), ['hora0001', 'turno001'], 'sin mascota o sin fecha válida, afuera');
  const h = c.appointments.find(a => a.id === 'hora0001');
  assert.equal(h.time, ''); assert.equal(h.place.placeId, '');
});

test('guardar y leer un turno por la API; entra al índice del cron y a Preguntale a Mimitos', async () => {
  const email = await fresh();
  const doc = { pets: [{ id: 'aika0001', name: 'Aika', species: 'perro', records: [], meds: [], log: [] }], appointments: [APPT({ date: '2099-01-10' })] };
  const r = await call('POST', {}, { doc, rev: 0 }, email);
  assert.equal(r.code, 200);
  assert.equal(r.body.doc.appointments.length, 1);
  assert.ok((await kvSMembers(TU.APPT_INDEX)).includes(email));
  const g = await call('GET', {}, null, email);
  assert.equal(g.body.doc.appointments[0].place.name, 'Veterinaria San Roque');
  const ctx = A.buildContext(g.body.doc, { question: '¿cuándo es el turno de Aika?', tz: 'America/Argentina/Buenos_Aires', now: new Date('2026-10-14T12:00:00Z') });
  assert.match(ctx.text, /Turno 2099-01-10 a las 10:30 \(faltan \d+ días\) · lugar "Veterinaria San Roque"/);
  assert.ok(Object.values(ctx.refs).some(x => x.kind === 'appt' && x.itemId === 'turno001'));
});

test('front: scripts y CSP del mapa (Maps Embed, mínimo: frame-src https://www.google.com)', () => {
  const html = readFileSync(new URL('../mascotas.html', import.meta.url), 'utf8');
  assert.ok(html.indexOf('mascotas-turnos.js') < html.indexOf('mascotas-app.js') && html.indexOf('mascotas-app.js') < html.indexOf('mascotas-vets.js'), 'orden de carga');
  const v = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  const csp = v.headers.find(h => h.source === '/mascotas').headers.find(h => h.key === 'Content-Security-Policy').value;
  assert.match(csp, /frame-src https:\/\/www\.google\.com;/);
  assert.ok(!/maps\.googleapis\.com/.test(csp), 'el navegador no habla con la API de Places');
  const vets = readFileSync(new URL('../assets/js/mascotas-vets.js', import.meta.url), 'utf8');
  assert.ok(!/localStorage\./.test(vets), 'nada en localStorage');
  /* la última ubicación solo en sessionStorage y siempre dentro de try/catch */
  for (const m of vets.matchAll(/sessionStorage\.\w+/g)) {
    const t = vets.lastIndexOf('try {', m.index), c = vets.indexOf('catch', t);
    assert.ok(t > 0 && c > m.index, 'sessionStorage dentro de try/catch');
  }
  assert.match(vets, /referrerpolicy="strict-origin-when-cross-origin"/);
});

/* ---------- cambiar la ubicación (bug de Majo: después de buscar no se podía cambiar) ---------- */
test('Text Search: dirección con número va como "cerca de", sesgo opcional redondeado (mismo SKU) y sin sesgo si no lo mandan', async () => {
  const email = await fresh();
  await call('POST', { places: 'text' }, { kind: 'vet', q: 'Av. Cabildo 2000, Belgrano' }, email);
  assert.equal(gcalls[0].body.textQuery, 'veterinaria cerca de Av. Cabildo 2000, Belgrano');
  assert.equal(gcalls[0].body.locationBias, undefined);
  const r = await call('POST', { places: 'text' }, { kind: 'pet', q: 'Belgrano, CABA', lat: -34.562345, lng: -58.456789 }, email);
  assert.equal(r.code, 200);
  assert.equal(gcalls[1].url, 'https://places.googleapis.com/v1/places:searchText');
  assert.equal(gcalls[1].body.textQuery, 'pet shop en Belgrano, CABA');
  assert.deepEqual(gcalls[1].body.locationBias.circle, { center: { latitude: -34.562, longitude: -58.457 }, radius: 5000 }, 'sesgo a 3 decimales');
  assert.equal(r.body.sku, 'Text Search Enterprise', 'el sesgo no cambia el SKU');
  assert.equal(Number(await kvGet(P.spendKey())), 2 * P.SKUS['text:enterprise'].micro);
});

/* front real (assets/js/mascotas-vets.js) en un DOM mínimo, contra el handler real; Google simulado */
const { runInNewContext } = await import('node:vm');
async function front({ geo = 'ok', storage = {} } = {}) {
  const email = await fresh();
  const L = { click: [], submit: [], keydown: [] }, toasts = [], ss = storage === 'roto' ? {} : { ...storage };
  let html = '', inputVal = null;
  const pet = { id: 'aika0001', name: 'Aika', species: 'perro', vet: {}, records: [] };
  const el = sel => {
    if (sel === '#app') return { contains: () => true };
    if (sel === '#vxArea') { if (!html.includes('id="vxArea"')) return null; return { get value() { return inputVal ?? (html.match(/id="vxArea"[^>]*value="([^"]*)"/) || [])[1] ?? ''; }, set value(v) { inputVal = v; }, focus() {}, select() {} }; }
    return { focus() {} };
  };
  const win = {
    MZ: { esc: x => String(x ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])), fmt: x => x, iso: d => new Date(d).toISOString().slice(0, 10), icon: n => `<svg class="i" data-i="${n}"></svg>`, today: () => new Date(), status: () => null, TYPE: {} },
    MZTURNOS: { upcoming: () => [], toLog: () => [] },
    MZAPP: { render() { html = win.MZVETS.render(pet, ''); inputVal = null; }, petById: () => pet, curPet: () => pet, toast: m => toasts.push(m), go() {}, doc: { pets: [pet], appointments: [] } },
  };
  const ctx = {
    window: win, console, JSON, Math, Date, Number, String, Object, Array, Map, Set, Boolean, Promise, RegExp, encodeURIComponent, setTimeout,
    requestAnimationFrame: f => f(),
    document: { querySelector: el, addEventListener: (t, f) => L[t]?.push(f) },
    navigator: { geolocation: { getCurrentPosition: (ok, no) => setTimeout(() => geo === 'ok' ? ok({ coords: { latitude: -34.588912, longitude: -58.430621 } }) : no({ code: 1 }), 0) } },
    sessionStorage: storage === 'roto' ? { getItem() { throw new Error('SecurityError'); }, setItem() { throw new Error('QuotaExceededError'); }, removeItem() { throw new Error('SecurityError'); } }
      : { getItem: k => ss[k] ?? null, setItem: (k, v) => { ss[k] = String(v); }, removeItem: k => { delete ss[k]; } },
    fetch: async (url, init = {}) => {
      const q = Object.fromEntries(new URL(url, 'http://x').searchParams);
      const r = await call(init.method || 'GET', q, init.body ? JSON.parse(init.body) : undefined, email);
      return { ok: r.code < 400, status: r.code, json: async () => r.body };
    },
  };
  runInNewContext(readFileSync(new URL('../assets/js/mascotas-vets.js', import.meta.url), 'utf8'), ctx);
  const until = async (fn, what) => { for (let i = 0; i < 200; i++) { if (fn()) return; await new Promise(r => setTimeout(r, 5)); } assert.fail('no pasó: ' + what); };
  const btn = (vx, data = {}) => ({ dataset: { vx, ...data } });
  const api = {
    get html() { return html; }, ss, toasts, st: () => win.MZVETS.state,
    render: () => win.MZAPP.render(),
    click(vx, data) { const b = btn(vx, data); for (const f of L.click) f({ target: { closest: s => s === '[data-vx]' ? b : null } }); },
    submit(v) { inputVal = v; for (const f of L.submit) f({ target: { id: 'vxAreaF' }, preventDefault() {} }); },
    esc() { for (const f of L.keydown) f({ key: 'Escape', target: { closest: s => s === '#vxLoc' }, preventDefault() {} }); },
    until, names: () => [...html.matchAll(/class="what"><b>([^<]+)<\/b>/g)].map(m => m[1]),
    map: () => ((html.match(/<iframe[^>]*src="([^"]+)"/) || [])[1] || '').replace(/&amp;/g, '&'),
  };
  api.render(); await until(() => api.st().cfg, 'config'); api.render();
  return api;
}
const ZONAS = u => {
  if (!u.includes('searchText') && !u.includes('searchNearby')) return { status: 200, body: PLACE() };
  return null;
};
function googleZonas() {
  google = u => {
    const b = gcalls.at(-1).body || {}, q = b.textQuery || '';
    if (/Inventada/.test(q)) return { status: 200, body: {} };
    if (/Belgrano/.test(q) || (b.locationBias && b.locationBias.circle.center.latitude > -34.57 && !/Palermo/.test(q))) return { status: 200, body: { places: [PLACE({ id: 'ChIJbelgrano0001', displayName: { text: /pet/.test(q) ? 'Pet Shop Cabildo' : 'Veterinaria Cabildo' }, location: { latitude: -34.5621, longitude: -58.4569 } })] } };
    return ZONAS(u) || { status: 200, body: { places: [PLACE({ displayName: { text: b.includedTypes?.[0] === 'pet_store' || /pet/.test(q) ? 'Puppis Palermo' : 'Veterinaria San Roque' } })] } };
  };
}

test('flujo: buscar por barrio, "Cambiar" abre el campo con el texto, nueva dirección busca en la pestaña actual y limpia las otras', async () => {
  process.env.GOOGLE_MAPS_BROWSER_KEY = 'clave-navegador';
  googleZonas();
  const f = await front();
  assert.match(f.html, /¿Dónde buscamos\?/); assert.match(f.html, /Barrio, ciudad o dirección/);
  f.submit('Palermo, CABA');
  await f.until(() => f.names().length, 'resultados de Palermo');
  /* barra siempre visible arriba de la lista y del mapa, con "Cambiar" */
  assert.match(f.html, /Cerca de: <b>Palermo, CABA<\/b>/);
  assert.ok(f.html.indexOf('class="vx-bar"') < f.html.indexOf('class="vx-res"'), 'la barra va arriba de la lista y del mapa');
  assert.match(f.html, /class="btn sm ghost" data-vx="where"[^>]*>Cambiar</, 'botón Cambiar (btn.sm = 44 px)');
  /* la otra pestaña, con la misma ubicación */
  f.click('kind', { k: 'pet' }); await f.until(() => f.names()[0] === 'Puppis Palermo', 'pet shops de Palermo');
  assert.equal(gcalls.at(-1).body.textQuery, 'pet shop en Palermo, CABA');
  assert.ok(gcalls.at(-1).body.locationBias, 'la pestaña nueva usa el centro de la zona como sesgo');
  const antes = gcalls.length;
  f.click('kind', { k: 'vet' }); await f.until(() => f.names()[0] === 'Veterinaria San Roque', 'vuelve a veterinarias');
  assert.equal(gcalls.length, antes, 'volver a una pestaña ya buscada no paga de nuevo');
  /* Cambiar: campo con el texto actual + Usar mi ubicación + Cancelar */
  f.click('where');
  assert.match(f.html, /Cambiar ubicación/);
  assert.match(f.html, /id="vxArea"[^>]*value="Palermo, CABA"/);
  assert.match(f.html, /data-vx="locate"/); assert.match(f.html, /data-vx="cancel"/);
  assert.ok(f.names().length, 'mientras edita, los resultados siguen abajo');
  f.esc(); assert.ok(!f.html.includes('id="vxArea"'), 'Escape cierra sin cambiar'); assert.match(f.html, /Cerca de: <b>Palermo, CABA/);
  f.click('where');
  f.submit('Av. Cabildo 2000, Belgrano');
  await f.until(() => f.names()[0] === 'Veterinaria Cabildo', 'resultados nuevos en Belgrano');
  assert.equal(gcalls.at(-1).body.textQuery, 'veterinaria cerca de Av. Cabildo 2000, Belgrano');
  assert.equal(gcalls.at(-1).body.locationBias, undefined, 'la dirección nueva no arrastra el sesgo de la zona vieja');
  assert.match(f.html, /Cerca de: <b>Av. Cabildo 2000, Belgrano<\/b>/);
  assert.deepEqual(Object.keys(f.st().res), ['vet|q:av. cabildo 2000, belgrano'], 'la caché de las otras pestañas se limpió');
  assert.match(f.map(), /q=veterinaria\+en\+Av\.\+Cabildo|q=veterinaria%20en%20Av\.%20Cabildo/); assert.match(f.map(), /center=-34\.562,-58\.457/, 'el mapa se recentra');
  /* pet shops de nuevo: busca en Belgrano (no la caché de Palermo) */
  const n0 = gcalls.length;
  f.click('kind', { k: 'pet' }); await f.until(() => f.names()[0] === 'Pet Shop Cabildo', 'pet shops de Belgrano');
  assert.equal(gcalls.length, n0 + 1);
  assert.deepEqual(gcalls.at(-1).body.locationBias.circle.center, { latitude: -34.562, longitude: -58.457 });
  /* recordada solo en sessionStorage */
  assert.deepEqual(JSON.parse(f.ss['mimitos:vets:ubicacion']), { a: 'Av. Cabildo 2000, Belgrano', m: { lat: -34.562, lng: -58.457 } });
  delete process.env.GOOGLE_MAPS_BROWSER_KEY;
});

test('flujo: dirección que no existe → aviso claro, el campo queda y vuelve la ubicación anterior con sus resultados', async () => {
  googleZonas();
  const f = await front();
  f.submit('Palermo, CABA'); await f.until(() => f.names().length, 'Palermo');
  f.click('where'); f.submit('Calle Inventada 99999');
  await f.until(() => /No encontramos esa dirección, probá con barrio y ciudad\./.test(f.html), 'aviso de dirección');
  assert.match(f.html, /role="alert">No encontramos esa dirección/);
  assert.match(f.html, /id="vxArea"[^>]*value="Calle Inventada 99999"/, 'el campo queda con lo que escribió');
  assert.equal(f.names()[0], 'Veterinaria San Roque', 'los resultados de antes siguen');
  assert.equal(f.st().area, 'Palermo, CABA');
  assert.equal(JSON.parse(f.ss['mimitos:vets:ubicacion']).a, 'Palermo, CABA', 'no recuerda la dirección mala');
  f.click('cancel'); assert.match(f.html, /Cerca de: <b>Palermo, CABA/);
});

test('flujo: "Usar mi ubicación" desde Cambiar; si niega el permiso queda el campo de texto; recuerda la última en sessionStorage', async () => {
  googleZonas();
  const f = await front();
  f.click('locate'); await f.until(() => f.names().length, 'cerca tuyo');
  assert.match(f.html, /<b>Cerca de tu ubicación<\/b>/);
  assert.deepEqual(gcalls.at(-1).body.locationRestriction.circle.center, { latitude: -34.589, longitude: -58.431 });
  assert.deepEqual(JSON.parse(f.ss['mimitos:vets:ubicacion']), { c: { lat: -34.589, lng: -58.431 } }, 'solo redondeada');
  f.click('where'); assert.match(f.html, /id="vxArea"[^>]*value=""/);
  f.submit('Belgrano, CABA'); await f.until(() => f.names()[0] === 'Veterinaria Cabildo', 'Belgrano');
  assert.match(f.html, /Cerca de: <b>Belgrano, CABA/);
  /* otra pantalla nueva en la misma pestaña: arranca con la última ubicación y busca sola */
  const g = await front({ geo: 'no', storage: f.ss });
  await g.until(() => g.names()[0] === 'Veterinaria Cabildo', 'restaurada');
  assert.match(g.html, /Cerca de: <b>Belgrano, CABA/);
  g.click('where'); g.click('locate');
  await g.until(() => /No pudimos usar tu ubicación/.test(g.html), 'permiso negado');
  assert.match(g.html, /id="vxArea"/, 'queda el campo de texto');
  assert.ok(!/data-vx="locate"/.test(g.html), 'sin volver a ofrecer el GPS negado');
  assert.equal(g.st().area, 'Belgrano, CABA', 'no pierde la ubicación que tenía');
  /* sessionStorage roto (modo privado): todo sigue andando */
  const h = await front({ storage: 'roto' });
  h.submit('Palermo, CABA'); await h.until(() => h.names().length, 'sin storage');
  assert.match(h.html, /Cerca de: <b>Palermo, CABA/);
});
