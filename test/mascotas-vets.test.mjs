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

/* ---------- autocompletar de direcciones (Places Autocomplete (New) + Place Details Essentials) ---------- */
const SUG = (id, main, sub) => ({ placePrediction: { placeId: id, text: { text: `${main}, ${sub}` }, structuredFormat: { mainText: { text: main }, secondaryText: { text: sub } } } });
const LOCS = { ChIJcorrientes0001: [-34.0, -58.0], ChIJcorrientes2786: [-27.473456, -58.834567], ChIJsanmartinmza1: [-32.889, -68.845], ChIJsanmartincaba: [-34.603, -58.381], ChIJpalermocaba01: [-34.588, -58.43] };
function googleDirs() {
  google = u => {
    const b = gcalls.at(-1).body || {};
    if (u.endsWith('places:autocomplete')) {
      const q = b.input || '';
      if (/Inventada/.test(q)) return { status: 200, body: {} };
      if (/^Gobernador Mart/i.test(q)) return { status: 200, body: { suggestions: [SUG('ChIJcorrientes2786', 'Gobernador Martínez 2786', 'W3400 Corrientes, Argentina')] } };
      if (/^San Mart/i.test(q)) return { status: 200, body: { suggestions: [SUG('ChIJsanmartincaba', 'San Martín 100', 'CABA, Argentina'), SUG('ChIJsanmartinmza1', 'San Martín 100', 'Mendoza, Argentina')] } };
      return { status: 200, body: { suggestions: [SUG('ChIJpalermocaba01', 'Palermo', 'CABA, Argentina'), SUG('ChIJcorrientes0001', 'Palermo Chico', 'CABA, Argentina')] } };
    }
    const m = u.match(/\/places\/([^?]+)\?/);
    if (m) { const [lat, lng] = LOCS[m[1]] || [-34.6, -58.4]; return { status: 200, body: { location: { latitude: lat, longitude: lng }, formattedAddress: 'Gobernador Martínez 2786, W3400 Corrientes, Argentina', shortFormattedAddress: 'Gobernador Martínez 2786, Corrientes' } }; }
    const near = b.locationRestriction?.circle.center.latitude ?? b.locationBias?.circle.center.latitude;
    const cte = near > -28;
    return { status: 200, body: { places: [PLACE({ id: cte ? 'ChIJvetcorrientes01' : 'ChIJvet00000001', displayName: { text: cte ? (b.includedTypes?.[0] === 'pet_store' ? 'Pet Shop Corrientes' : 'Veterinaria del Litoral') : 'Veterinaria San Roque' }, location: cte ? { latitude: -27.4739, longitude: -58.8341 } : PLACE().location })] } };
  };
}
const TOKEN = '0f8b6c2e-5d1a-4c3b-9e7f-1a2b3c4d5e6f';

test('autocompletar: solo Argentina, session token, sesgo redondeado, mínimo 4 letras, techo (USD 2,83/1.000) y tope diario aparte', async () => {
  googleDirs();
  const email = await fresh();
  const r = await call('POST', { places: 'autocomplete' }, { q: 'Gobernador Martínez 2786', token: TOKEN, lat: -27.4712345, lng: -58.8398765 }, email);
  assert.equal(r.code, 200);
  const g = gcalls[0];
  assert.equal(g.url, 'https://places.googleapis.com/v1/places:autocomplete');
  assert.deepEqual(g.body.includedRegionCodes, ['ar']);
  assert.equal(g.body.sessionToken, TOKEN);
  assert.equal(g.body.input, 'Gobernador Martínez 2786');
  assert.deepEqual(g.body.locationBias.circle.center, { latitude: -27.471, longitude: -58.84 });
  assert.equal(g.headers['X-Goog-Api-Key'], 'clave-servidor-secreta');
  assert.deepEqual(r.body.suggestions, [{ id: 'ChIJcorrientes2786', text: 'Gobernador Martínez 2786, W3400 Corrientes, Argentina', main: 'Gobernador Martínez 2786', sub: 'W3400 Corrientes, Argentina' }]);
  assert.equal(Number(await kvGet(P.spendKey())), P.SKUS.auto.micro);
  assert.equal(P.SKUS.auto.micro, 2830);
  /* sin sesgo si no hay ubicación; menos de 4 letras o token raro: 400 sin llamar a Google */
  await call('POST', { places: 'autocomplete' }, { q: 'Palermo', token: TOKEN }, email);
  assert.equal(gcalls[1].body.locationBias, undefined);
  assert.equal((await call('POST', { places: 'autocomplete' }, { q: 'Pal', token: TOKEN }, email)).code, 400);
  assert.equal((await call('POST', { places: 'autocomplete' }, { q: 'Palermo', token: 'x y' }, email)).code, 400);
  assert.equal(gcalls.length, 2);
  /* tope diario de sugerencias: 10 × MIMITOS_MAPS_PER_DAY */
  process.env.MIMITOS_MAPS_PER_DAY = '1';
  const e2 = await fresh();
  for (let i = 0; i < 10; i++) assert.equal((await call('POST', { places: 'autocomplete' }, { q: 'Palermo ' + i, token: TOKEN }, e2)).code, 200);
  const lim = await call('POST', { places: 'autocomplete' }, { q: 'Gobernador Martínez', token: TOKEN }, e2);
  assert.equal(lim.code, 429); assert.equal(lim.body.limit, 10);
  assert.match(lim.body.mapsUrl, /query=veterinaria%20Gobernador%20Mart%C3%ADnez$/, 'link gratis con la dirección escrita');
  /* techo: en pausa no sale nada y vuelve el link con lo escrito */
  delete process.env.MIMITOS_MAPS_PER_DAY;
  await kvSet(P.spendKey(), 19_990_000);
  const n = gcalls.length;
  const pz = await call('POST', { places: 'autocomplete' }, { q: 'Gobernador Martínez 2786', token: TOKEN }, email);
  assert.equal(pz.code, 503); assert.equal(pz.body.error, 'maps_paused');
  assert.match(pz.body.mapsUrl, /Gobernador%20Mart%C3%ADnez%202786/);
  assert.equal(gcalls.length, n);
});

test('elegir sugerencia: Place Details solo Essentials (location, formattedAddress, shortFormattedAddress) con el mismo token; coordenadas a 3 decimales; solo ids vistos', async () => {
  googleDirs();
  const email = await fresh();
  assert.equal((await call('POST', { places: 'pick' }, { id: 'ChIJcorrientes2786', token: TOKEN }, email)).code, 403, 'sin haberla visto en sugerencias');
  await call('POST', { places: 'autocomplete' }, { q: 'Gobernador Martínez 2786', token: TOKEN }, email);
  const r = await call('POST', { places: 'pick' }, { id: 'ChIJcorrientes2786', token: TOKEN }, email);
  assert.equal(r.code, 200);
  const g = gcalls.at(-1);
  assert.equal(g.method, 'GET');
  assert.equal(g.url, `https://places.googleapis.com/v1/places/ChIJcorrientes2786?languageCode=es&regionCode=AR&sessionToken=${TOKEN}`);
  assert.equal(g.headers['X-Goog-FieldMask'], 'location,formattedAddress,shortFormattedAddress');
  assert.deepEqual(r.body.place, { lat: -27.473, lng: -58.835, address: 'Gobernador Martínez 2786, Corrientes' });
  assert.equal(Number(await kvGet(P.spendKey())), P.SKUS.auto.micro + P.SKUS['pick:essentials'].micro, 'USD 0,00283 + USD 0,005');
  /* después, Nearby alrededor de esas coordenadas */
  const nb = await near(email, 'vet', r.body.place.lat, r.body.place.lng);
  assert.equal(nb.body.places[0].name, 'Veterinaria del Litoral');
  assert.deepEqual(gcalls.at(-1).body.locationRestriction.circle.center, { latitude: -27.473, longitude: -58.835 });
});

test('mi zona: cleanDoc guarda solo texto corto y coordenadas redondeadas; docs sin zona siguen andando; se puede borrar', () => {
  const z = cleanDoc({ pets: [], zone: { label: '  Corrientes <b>', lat: -27.4734567, lng: -58.8345678, address: 'Gobernador Martínez 2786', evil: 1 } });
  assert.deepEqual(z.zone, { label: 'Corrientes b', lat: -27.473, lng: -58.835 });
  assert.equal('zone' in cleanDoc({ pets: [] }), false);
  assert.equal('zone' in cleanDoc({ pets: [], zone: { label: 'X', lat: 'a', lng: 2 } }), false);
  assert.equal('zone' in cleanDoc({ pets: [], zone: { label: '', lat: 1, lng: 2 } }), false);
});

/* front real (assets/js/mascotas-vets.js) en un DOM mínimo, contra el handler real; Google simulado */
const { runInNewContext } = await import('node:vm');
async function front({ geo = 'ok', storage = {}, doc = {} } = {}) {
  const email = await fresh();
  const L = { click: [], submit: [], keydown: [], input: [] }, toasts = [], ss = storage === 'roto' ? {} : { ...storage };
  let html = '', sugBox = null, inputVal = null, saves = 0;
  const pet = { id: 'aika0001', name: 'Aika', species: 'perro', vet: {}, records: [] };
  const appDoc = { pets: [pet], appointments: [], ...doc };
  const attrs = {};
  const el = sel => {
    if (sel === '#app') return { contains: () => true };
    if (sel === '#vxArea') { if (!html.includes('id="vxArea"')) return null; return { id: 'vxArea', get value() { return inputVal ?? (html.match(/id="vxArea"[^>]*value="([^"]*)"/) || [])[1] ?? ''; }, set value(v) { inputVal = v; }, focus() {}, select() {}, setAttribute(k, v) { attrs[k] = v; }, removeAttribute(k) { delete attrs[k]; } }; }
    if (sel === '#vxSugBox') { if (!html.includes('id="vxSugBox"')) return null; return { set innerHTML(v) { sugBox = v; } }; }
    return { focus() {} };
  };
  const win = {
    MZ: { esc: x => String(x ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])), fmt: x => x, iso: d => new Date(d).toISOString().slice(0, 10), icon: n => `<svg class="i" data-i="${n}"></svg>`, today: () => new Date(), status: () => null, TYPE: {} },
    MZTURNOS: { upcoming: () => [], toLog: () => [] },
    MZAPP: { render() { html = win.MZVETS.render(pet, ''); sugBox = null; inputVal = null; }, petById: () => pet, curPet: () => pet, toast: m => toasts.push(m), go() {}, changed() { saves++; }, get doc() { return appDoc; } },
  };
  const ctx = {
    window: win, console, JSON, Math, Date, Number, String, Object, Array, Map, Set, Boolean, Promise, RegExp, encodeURIComponent, setTimeout, clearTimeout,
    crypto: { randomUUID: () => TOKEN },
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
  const until = async (fn, what) => { for (let i = 0; i < 300; i++) { if (fn()) return; await new Promise(r => setTimeout(r, 5)); } assert.fail('no pasó: ' + what); };
  const target = (id, extra = {}) => ({ id, value: inputVal ?? '', closest: s => s === '#vxLoc' ? {} : null, ...extra });
  const api = {
    get html() { return html; }, get sug() { return sugBox ?? ''; }, get view() { return html + (sugBox ?? ''); }, attrs, ss, toasts, doc: appDoc, saves: () => saves, st: () => win.MZVETS.state,
    render: () => win.MZAPP.render(),
    click(vx, data = {}) { const b = { dataset: { vx, ...data } }; for (const f of L.click) f({ target: { closest: s => s === '[data-vx]' ? b : null }, preventDefault() {} }); },
    option(i) { const o = { dataset: { vxs: String(i) } }; for (const f of L.click) f({ target: { closest: s => s === '[data-vxs]' ? o : null }, preventDefault() {} }); },
    type(v) { inputVal = v; for (const f of L.input) f({ target: target('vxArea', { value: v }) }); },
    key(k) { for (const f of L.keydown) f({ key: k, target: target('vxArea'), preventDefault() {} }); },
    submit(v) { if (v != null) inputVal = v; for (const f of L.submit) f({ target: { id: 'vxAreaF' }, preventDefault() {} }); },
    until, names: () => [...html.matchAll(/class="what"><b>([^<]+)<\/b>/g)].map(m => m[1]),
    map: () => ((html.match(/<iframe[^>]*src="([^"]+)"/) || [])[1] || '').replace(/&amp;/g, '&'),
  };
  api.render(); await until(() => api.st().cfg, 'config'); api.render();
  return api;
}
const wait = ms => new Promise(r => setTimeout(r, ms));

test('flujo (bug de Majo): "Gobernador Martínez 2786" → sugerencia de Corrientes → Nearby ahí; barra, pestañas, mapa y sessionStorage', async () => {
  process.env.GOOGLE_MAPS_BROWSER_KEY = 'clave-navegador';
  googleDirs();
  const f = await front();
  assert.match(f.html, /role="combobox"/); assert.match(f.html, /aria-autocomplete="list"/); assert.match(f.html, /aria-controls="vxSug"/);
  /* debounce de 300 ms y mínimo 4 letras: tipear rápido manda un solo pedido */
  f.type('Gob'); f.type('Gobe'); f.type('Gobernador Mart'); f.type('Gobernador Martínez 2786');
  await wait(120); assert.equal(gcalls.length, 0, 'todavía no (300 ms)');
  await f.until(() => /Gobernador Martínez 2786/.test(f.sug), 'sugerencias');
  assert.equal(gcalls.filter(g => g.url.endsWith(':autocomplete')).length, 1, 'un solo pedido');
  assert.equal(gcalls[0].body.sessionToken, TOKEN);
  assert.match(f.sug, /role="listbox"/); assert.match(f.sug, /role="option" id="vxSug-0"/);
  assert.equal(f.attrs['aria-expanded'], 'true');
  f.key('ArrowDown'); assert.equal(f.attrs['aria-activedescendant'], 'vxSug-0');
  f.option(0);
  await f.until(() => f.names()[0] === 'Veterinaria del Litoral', 'veterinarias de Corrientes');
  const pick = gcalls.find(g => g.url.includes('/places/ChIJcorrientes2786'));
  assert.ok(pick.url.includes('sessionToken=' + TOKEN), 'el detalle cierra la sesión con el mismo token');
  assert.deepEqual(gcalls.at(-1).body.locationRestriction.circle.center, { latitude: -27.473, longitude: -58.835 });
  assert.match(f.html, /Cerca de: <b>Gobernador Martínez 2786, Corrientes<\/b>/);
  assert.ok(f.html.indexOf('class="vx-bar"') < f.html.indexOf('class="vx-res"'));
  assert.match(f.map(), /center=-27\.473,-58\.835/, 'el mapa se centra en la dirección');
  /* otra pestaña, mismas coordenadas */
  f.click('kind', { k: 'pet' }); await f.until(() => f.names()[0] === 'Pet Shop Corrientes', 'pet shops de Corrientes');
  assert.deepEqual(gcalls.at(-1).body.locationRestriction.circle.center, { latitude: -27.473, longitude: -58.835 });
  assert.deepEqual(JSON.parse(f.ss['mimitos:vets:ubicacion']), { c: { lat: -27.473, lng: -58.835 }, l: 'Gobernador Martínez 2786, Corrientes', z: 'Corrientes' });
  /* Cambiar: la sesión nueva arranca con otro token y la caché de las otras pestañas se limpia */
  f.click('where'); assert.match(f.html, /Cambiar ubicación/); assert.match(f.html, /data-vx="locate"/);
  f.type('Palermo'); await f.until(() => /Palermo Chico/.test(f.sug), 'sugerencias Palermo');
  assert.deepEqual(gcalls.at(-1).body.locationBias.circle.center, { latitude: -27.473, longitude: -58.835 }, 'sesgo por la última ubicación');
  f.submit(); /* Enter: la primera coincide con lo escrito y no hay otra igual → la usa */
  await f.until(() => f.names()[0] === 'Veterinaria San Roque' || /Pet shops/.test(f.html) && /Cerca de: <b>Palermo, CABA/.test(f.html), 'Palermo');
  assert.match(f.html, /Cerca de: <b>Palermo, CABA<\/b>/);
  assert.deepEqual(Object.keys(f.st().res), ['pet|-34.588,-58.430'], 'caché de las otras pestañas limpia');
  delete process.env.GOOGLE_MAPS_BROWSER_KEY;
});

test('flujo: Enter sin elegir — ambiguo pide elegir, sin resultados avisa, y nunca manda texto libre a Text Search', async () => {
  googleDirs();
  const f = await front();
  f.submit('San Martín 100');
  await f.until(() => /Elegí la tuya de la lista/.test(f.sug), 'pide elegir');
  assert.match(f.sug, /Mendoza/); assert.match(f.sug, /aria-selected="true"/);
  assert.equal(f.st().coords, null, 'no eligió nada por su cuenta');
  f.submit(); /* Enter con la primera marcada → esa */
  await f.until(() => /Cerca de: <b>San Martín 100, CABA/.test(f.html), 'elegida con Enter');
  f.click('where'); f.submit('Calle Inventada 99999');
  await f.until(() => /No encontramos esa dirección, probá con barrio y ciudad\./.test(f.sug), 'aviso');
  assert.equal(f.attrs['aria-invalid'], 'true');
  assert.match(f.html, /Cerca de|Cambiar ubicación/);
  assert.ok(!gcalls.some(g => g.url.endsWith('places:searchText')), 'ningún Text Search con la dirección');
  f.key('Escape'); f.key('Escape'); assert.match(f.html, /Cerca de: <b>San Martín 100, CABA/, 'Escape vuelve sin cambiar');
});

test('flujo: techo y tope en el autocompletar → "Buscar en Google Maps" con la dirección escrita', async () => {
  googleDirs();
  const f = await front();
  await kvSet(P.spendKey(), 19_990_000);
  f.type('Gobernador Martínez 2786');
  await f.until(() => /en pausa/.test(f.sug), 'pausa');
  assert.match(f.sug, /href="https:\/\/www\.google\.com\/maps\/search\/\?api=1&amp;query=veterinaria%20Gobernador%20Mart%C3%ADnez%202786"/);
  f.render(); assert.match(f.html, /id="vxMapsA" href="[^"]*Gobernador%20Mart%C3%ADnez%202786/, 'en pausa queda el campo con el link a Google Maps');
  await kvSet(P.spendKey(), 0);
  /* tope diario de sugerencias (10 × MIMITOS_MAPS_PER_DAY) */
  process.env.MIMITOS_MAPS_PER_DAY = '1';
  const g = await front();
  for (let i = 0; i < 10; i++) { g.type('Palermo ' + i); await g.until(() => g.st().sugFor === 'Palermo ' + i, 'sug ' + i); }
  g.type('Gobernador Martínez 2786');
  await g.until(() => /tope de sugerencias de hoy/.test(g.sug), 'tope');
  assert.match(g.sug, /query=veterinaria%20Gobernador%20Mart%C3%ADnez%202786/);
  delete process.env.MIMITOS_MAPS_PER_DAY;
});

test('flujo: "Guardar como mi zona" (cuenta), la próxima vez arranca ahí, y se puede borrar', async () => {
  googleDirs();
  const f = await front();
  f.type('Gobernador Martínez 2786'); await f.until(() => /vxSug-0/.test(f.sug), 'sugerencia');
  f.option(0); await f.until(() => f.names().length, 'resultados');
  assert.match(f.html, /data-vx="zoneSave"[^>]*>.*Guardar Corrientes como mi zona/);
  f.click('zoneSave');
  assert.equal(JSON.stringify(f.doc.zone), JSON.stringify({ label: 'Corrientes', lat: -27.473, lng: -58.835 })); assert.equal(f.saves(), 1);
  assert.match(f.html, /Tu zona/);
  /* pestaña nueva del navegador (sin sessionStorage) con la cuenta: arranca en Corrientes y busca sola */
  const g = await front({ doc: { zone: f.doc.zone } });
  await g.until(() => g.names()[0] === 'Veterinaria del Litoral', 'arranca en su zona');
  assert.match(g.html, /Cerca de: <b>Corrientes<\/b>/);
  g.click('where'); assert.match(g.html, /Mi zona: <b>Corrientes<\/b>/); assert.match(g.html, /data-vx="zoneDel"/);
  g.click('zoneDel');
  assert.equal('zone' in g.doc, false); assert.equal(g.saves(), 1);
  assert.ok(g.toasts.some(t => /Borramos tu zona/.test(t)));
});

test('flujo: "Usar mi ubicación"; si niega el permiso queda el campo; sessionStorage roto no rompe nada', async () => {
  googleDirs();
  const f = await front();
  f.click('locate'); await f.until(() => f.names().length, 'cerca tuyo');
  assert.match(f.html, /<b>Cerca de tu ubicación<\/b>/);
  assert.deepEqual(JSON.parse(f.ss['mimitos:vets:ubicacion']).c, { lat: -34.589, lng: -58.431 }, 'solo redondeada');
  const g = await front({ geo: 'no', storage: f.ss });
  await g.until(() => g.names().length, 'restaurada');
  g.click('where'); g.click('locate');
  await g.until(() => /No pudimos usar tu ubicación/.test(g.html), 'permiso negado');
  assert.match(g.html, /id="vxArea"/); assert.ok(!/data-vx="locate"/.test(g.html));
  const h = await front({ storage: 'roto' });
  h.type('Gobernador Martínez 2786'); await h.until(() => /vxSug-0/.test(h.sug), 'sug');
  h.option(0); await h.until(() => /Cerca de: <b>Gobernador/.test(h.html), 'sin storage');
});
