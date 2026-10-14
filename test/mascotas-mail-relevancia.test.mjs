/* Mimitos · relevancia de "Conectar tu mail": qué entra como estudio veterinario y qué no.
   Caso real que lo motivó: una búsqueda de 12 meses trajo solo un certificado de un curso de IA de UdeSA.
   Correr con: node --test test/mascotas-mail-relevancia.test.mjs  (sin KV usa memoria; Google simulado) */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
process.env.SESSION_SECRET = 'prueba-secreta-de-mimitos-1234567890';
process.env.GOOGLE_CLIENT_ID = 'cliente.apps.googleusercontent.com';
process.env.GOOGLE_CLIENT_SECRET = 'secreto';
process.env.MIMITOS_TOKEN_KEY = randomBytes(32).toString('base64');
process.env.MIMITOS_MAIL_ALLOW = 'majo@ejemplo.com';
const { kvSet } = await import('../api/_lib/kv.js');
const { makeSession } = await import('../api/_lib/auth.js');
const M = await import('../api/_lib/petmail.js');
const G = await import('../api/_lib/petgmail.js');
const { default: mascotas } = await import('../api/mascotas.js');

const EMAIL = 'majo@ejemplo.com';
const doc = { pets: [
  { id: 'aika0001', name: 'Aika', species: 'perro', breed: 'Mestiza', vet: { name: 'Veterinaria Panda' }, records: [{ vet: 'Dra. Paz' }], visits: [], studies: [{ lab: 'Diagnovet' }] },
  { id: 'feliza01', name: 'Feliza', species: 'gato', breed: '', vet: { name: '' }, records: [], visits: [], studies: [] },
] };
const pdf = name => ({ part: '1', name, type: 'application/pdf', size: 90000 });
const judge = (c, senders) => M.relevance({ files: [], ...c }, M.relContext(doc, senders));

test('UdeSA: "certificado de MAD Laboratorio de IA Generativa" queda AFUERA (genérico solo no alcanza)', () => {
  const r = judge({ subject: 'Recordatorio: ¡Maria Jose Sicco, te enviamos tu certificado de MAD Laboratorio de IA Generativa!', from: 'UdeSA Educación Ejecutiva <educacionejecutiva@udesa.edu.ar>', files: [pdf('certificate.pdf')] });
  assert.equal(r.pass, false);
});

test('"Resultados de Aika - Laboratorio Veterinario X" con un PDF entra ADENTRO', () => {
  const r = judge({ subject: 'Resultados de Aika - Laboratorio Veterinario X', from: 'Lab X <resultados@labx.com.ar>', files: [pdf('resultados.pdf')] });
  assert.equal(r.pass, true);
  assert.ok(r.why.includes('mascota') && r.why.includes('veterinario'));
});

test('remitente conocido sin palabras veterinarias entra ADENTRO (aprendido, agregado a mano o cargado en el doc)', () => {
  const plain = { subject: 'Su informe', files: [pdf('informe-2026.pdf')] };
  assert.equal(judge({ ...plain, from: 'Resultados <resultados@vetsur.com.ar>' }).pass, false, 'sin conocerlo, no entra');
  assert.equal(judge({ ...plain, from: 'Resultados <resultados@vetsur.com.ar>' }, { manual: [], learned: ['resultados@vetsur.com.ar'] }).pass, true, 'aprendido de una importación');
  assert.equal(judge({ ...plain, from: 'Otro <otro@vetsur.com.ar>' }, { manual: ['vetsur.com.ar'], learned: [] }).pass, true, 'dominio agregado a mano');
  assert.equal(judge({ ...plain, from: 'Panda Turnos <turnos@pandaturnos.com>' }, { manual: ['Panda'], learned: [] }).pass, true, 'nombre agregado a mano');
  assert.equal(judge({ ...plain, from: 'Diagnovet <informes@diagnovet.com.ar>' }).pass, true, 'laboratorio ya cargado en el doc');
});

test('una casilla pública conocida no vuelve conocido a todo gmail.com', () => {
  const s = { manual: [], learned: ['dra.paz.vet@gmail.com'] };
  assert.equal(judge({ subject: 'Fotos del finde', from: 'Primo <primo@gmail.com>', files: [pdf('fotos.pdf')] }, s).pass, false);
  assert.equal(judge({ subject: 'Lo que hablamos', from: 'Paz <dra.paz.vet@gmail.com>', files: [pdf('receta.pdf')] }, s).pass, true);
});

test('las promos de pet shop puntúan bajo y lo más probable queda arriba', () => {
  const promo = judge({ subject: '¡Oferta! 20% de descuento en alimento para perro', from: 'Pet Shop <promo@petshop.com>', files: [pdf('catalogo.pdf')] });
  const real = judge({ subject: 'Ecografía de Aika', from: 'Diagnovet <informes@diagnovet.com.ar>', files: [pdf('eco-aika.pdf')] });
  assert.ok(real.score > promo.score);
  assert.equal(promo.pass, false, 'oferta + descuento le restan');
});

test('cleanSender: mail, dominio o nombre', () => {
  assert.equal(M.cleanSender(' Lab@VetSur.com.ar '), 'lab@vetsur.com.ar');
  assert.equal(M.cleanSender('@vetsur.com.ar'), 'vetsur.com.ar');
  assert.equal(M.cleanSender('Panda'), 'Panda');
});

/* ---------- por el endpoint real, con Gmail simulado ---------- */
const call = (method, query, body) => new Promise(ok => {
  const res = { code: 200, headers: {}, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, status(c) { this.code = c; return this; }, json(o) { ok({ code: this.code, body: o, headers: this.headers }); }, end() { ok({ code: this.code, headers: this.headers }); }, redirect(c, u) { ok({ code: c, headers: { location: u } }); } };
  mascotas({ method, query, body, headers: { cookie: `orbit_session=${makeSession(EMAIL)}`, host: 'preview.orbitando.test' } }, res);
});
const H = (n, v) => ({ name: n, value: v });
const MAILS = {
  udesa001: { id: 'udesa001', threadId: 'thudesa1', internalDate: String(Date.parse('2026-10-01')), payload: { headers: [H('Subject', 'Recordatorio: ¡Maria Jose Sicco, te enviamos tu certificado de MAD Laboratorio de IA Generativa!'), H('From', 'UdeSA <educacionejecutiva@udesa.edu.ar>')], parts: [{ partId: '1', mimeType: 'application/pdf', filename: 'certificate.pdf', body: { attachmentId: 'X', size: 80000 } }] } },
  aika0001: { id: 'aika0001', threadId: 'thaika01', internalDate: String(Date.parse('2026-09-20')), payload: { headers: [H('Subject', 'Resultados de Aika - Laboratorio Veterinario X'), H('From', 'Lab X <resultados@labx.com.ar>')], parts: [{ partId: '1', mimeType: 'application/pdf', filename: 'resultados.pdf', body: { attachmentId: 'Y', size: 90000 } }] } },
  link0001: { id: 'link0001', threadId: 'thlink01', internalDate: String(Date.parse('2026-09-10')), payload: { headers: [H('Subject', 'Veterinaria Panda: tus resultados ya están disponibles'), H('From', 'Veterinaria Panda <info@vetpanda.com>')], mimeType: 'text/html', body: { size: 3000 } } },
  known001: { id: 'known001', threadId: 'thknown1', internalDate: String(Date.parse('2026-08-10')), payload: { headers: [H('Subject', 'Su informe'), H('From', 'Resultados <resultados@vetsur.com.ar>')], parts: [{ partId: '2', mimeType: 'application/pdf', filename: 'informe.pdf', body: { attachmentId: 'Z', size: 70000 } }] } },
};
let lastQ = '';
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(String(url));
  const json = o => new Response(JSON.stringify(o), { status: 200, headers: { 'content-type': 'application/json' } });
  if (u.href.startsWith('https://oauth2.googleapis.com/token')) {
    const f = Object.fromEntries(new URLSearchParams(String(init.body)));
    return f.grant_type === 'authorization_code' ? json({ access_token: 'AT', refresh_token: 'RT', scope: G.SCOPE }) : json({ access_token: 'AT' });
  }
  const p = u.pathname.replace('/gmail/v1/users/me', '');
  if (p === '/profile') return json({ emailAddress: 'siccomaria@gmail.com' });
  if (p === '/messages') { lastQ = u.searchParams.get('q'); return json({ messages: Object.keys(MAILS).map(id => ({ id })) }); }
  const m = /^\/messages\/([^/]+)$/.exec(p);
  if (m) return json(MAILS[m[1]]);
  throw new Error('inesperado ' + url);
};

test('búsqueda real: UdeSA afuera, Aika adentro, el remitente agregado a mano adentro y el mail sin adjunto aparte con link a Gmail', async () => {
  await kvSet(`orbit:purchases:${EMAIL}`, [{ productId: 'ob-018', date: '2026-10-12' }]);
  await kvSet(`orbit:pets:${EMAIL}`, { ...doc, rev: 1 });
  const go = await call('GET', { gmail: 'start' });
  await call('GET', { gmail: 'callback', code: 'x', state: new URL(go.headers.location).searchParams.get('state') });

  /* "¿De dónde te llegan los estudios?" */
  const add = await call('POST', { gmail: 'senders' }, { add: 'resultados@vetsur.com.ar' });
  assert.deepEqual(add.body.senders, ['resultados@vetsur.com.ar']);
  const st = await call('GET', { gmail: 'status' });
  assert.deepEqual(st.body.senders, ['resultados@vetsur.com.ar']);

  const s = await call('POST', { gmail: 'search' }, { mode: 'all' });
  assert.equal(s.code, 200, JSON.stringify(s.body));
  assert.ok(lastQ.includes('from:resultados@vetsur.com.ar'), 'el remitente agregado va a la consulta');
  assert.deepEqual(s.body.candidates.map(c => c.m), ['aika0001', 'known001'], 'UdeSA afuera; lo más probable primero');
  assert.deepEqual(s.body.noFile.map(x => [x.m, x.link]), [['link0001', 'https://mail.google.com/mail/u/0/#all/thlink01']]);

  const rm = await call('POST', { gmail: 'senders' }, { remove: 'resultados@vetsur.com.ar' });
  assert.deepEqual(rm.body.senders, []);
});
