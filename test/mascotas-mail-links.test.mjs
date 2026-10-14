/* Mimitos · estudios que llegan como LINK: extracción, conversión de Drive/Dropbox, defensas anti-SSRF
   e importación de punta a punta con Gmail y la red simulados (no sale nada a internet).
   Correr con: node --test test/mascotas-mail-links.test.mjs */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
process.env.SESSION_SECRET = 'prueba-secreta-de-mimitos-1234567890';
process.env.GOOGLE_CLIENT_ID = 'cliente.apps.googleusercontent.com';
process.env.GOOGLE_CLIENT_SECRET = 'secreto';
process.env.MIMITOS_TOKEN_KEY = randomBytes(32).toString('base64');
process.env.MIMITOS_MAIL_ALLOW = 'majo@ejemplo.com';
const { kvSet, kvGet } = await import('../api/_lib/kv.js');
const { makeSession } = await import('../api/_lib/auth.js');
const L = await import('../api/_lib/petlinks.js');
const M = await import('../api/_lib/petmail.js');
const G = await import('../api/_lib/petgmail.js');
const { default: mascotas } = await import('../api/mascotas.js');

const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), randomBytes(2000)]);
const HTML = Buffer.from('<!DOCTYPE html><html><body>Ingresá con tu usuario</body></html>');

/* ---------- extracción ---------- */
const MAIL_HTML = `<p>Hola, ya están los resultados de Aika.</p>
<a href="https://resultados.labpanda.com.ar/informes/descargar?id=98213&amp;t=x">Descargar informe</a>
<a href="https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUv/view?usp=sharing">Ver en Drive</a>
<a href="https://www.labpanda.com.ar/">Nuestra web</a>
<a href="https://labpanda.us1.list-manage.com/unsubscribe?u=1">Darse de baja</a>
<a href="https://www.facebook.com/labpanda">Facebook</a>
<a href="https://maps.google.com/?q=Av+Siempre+Viva">Cómo llegar</a>
<a href="https://www.labpanda.com.ar/preferencias">Preferencias</a>
<img src="https://open.labpanda.com.ar/o/pixel.gif">`;

test('extracción: se queda con el informe y el Drive; afuera web, desuscripción, redes, mapas y tracking', () => {
  const links = L.extractLinks({ html: MAIL_HTML }, { senderDomain: 'labpanda.com.ar' });
  assert.deepEqual(links.map(l => l.host).sort(), ['drive.google.com', 'resultados.labpanda.com.ar']);
  assert.ok(links.every(l => /^u[a-f0-9]{16}$/.test(l.part)));
  assert.equal(L.linkPart(links[0].url), links[0].part, 'el dedupe usa el hash del URL');
});

test('extracción: URLs en texto plano y .pdf directos; un mail sin links de estudio no trae nada', () => {
  const t = L.extractLinks({ text: 'Tu estudio: https://lab.example.com.ar/r/AIKA-2291.pdf. Saludos! https://instagram.com/lab' });
  assert.deepEqual(t.map(l => l.url), ['https://lab.example.com.ar/r/AIKA-2291.pdf']);
  assert.deepEqual(L.extractLinks({ html: '<a href="https://vet.com.ar/turnos">Pedí turno</a> <a href="mailto:a@b.c">mail</a>' }), []);
});

test('Drive y Dropbox: de link de vista a descarga directa', () => {
  assert.equal(L.directUrl('https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUv/view?usp=sharing'), 'https://drive.google.com/uc?export=download&id=1AbCdEfGhIjKlMnOpQrStUv');
  assert.equal(L.directUrl('https://drive.google.com/open?id=1AbCdEfGhIjKlMnOpQrStUv'), 'https://drive.google.com/uc?export=download&id=1AbCdEfGhIjKlMnOpQrStUv');
  assert.equal(L.directUrl('https://www.dropbox.com/s/abc123/informe.pdf?dl=0'), 'https://www.dropbox.com/s/abc123/informe.pdf?dl=1');
  assert.equal(L.directUrl('https://www.dropbox.com/scl/fi/xyz/eco.pdf?rlkey=k&dl=0'), 'https://www.dropbox.com/scl/fi/xyz/eco.pdf?rlkey=k&dl=1');
  assert.equal(L.directUrl('https://lab.com.ar/a.pdf'), 'https://lab.com.ar/a.pdf');
});

/* ---------- SSRF ---------- */
test('IPs prohibidas: privadas, loopback, link-local, metadata, CGNAT e IPv6 internas', () => {
  for (const ip of ['10.0.0.5', '127.0.0.1', '172.16.3.4', '192.168.1.10', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '::1', '::', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1', 'no-es-ip']) assert.ok(L.isPrivateIp(ip), ip);
  for (const ip of ['8.8.8.8', '200.45.12.3', '2800:3f0:4002:80b::200e']) assert.ok(!L.isPrivateIp(ip), ip);
});

const pub = async () => [{ address: '200.45.12.3', family: 4 }];
const reply = (status, headers, body = Buffer.alloc(0)) => async () => ({ status, headers, body });

test('SSRF: http plano, host que resuelve a IP privada, IP literal de metadata y localhost: bloqueados sin conectar', async () => {
  let conectó = 0; const get = async () => { conectó++; return { status: 200, headers: { 'content-type': 'application/pdf' }, body: PDF }; };
  await assert.rejects(L.safeFetch('http://lab.com.ar/a.pdf', { lookup: pub, get }), e => e.code === 'http');
  await assert.rejects(L.safeFetch('https://interno.lab.com.ar/a.pdf', { lookup: async () => [{ address: '10.0.0.7', family: 4 }], get }), e => e.code === 'ip_privada');
  await assert.rejects(L.safeFetch('https://dual.lab.com.ar/a.pdf', { lookup: async () => [{ address: '200.1.1.1', family: 4 }, { address: '127.0.0.1', family: 4 }], get }), e => e.code === 'ip_privada');
  await assert.rejects(L.safeFetch('https://169.254.169.254/latest/meta-data/', { lookup: pub, get }), e => e.code === 'ip_privada');
  await assert.rejects(L.safeFetch('https://localhost/a.pdf', { lookup: pub, get }), e => e.code === 'ip_privada');
  await assert.rejects(L.safeFetch('https://user:pw@lab.com.ar/a.pdf', { lookup: pub, get }), e => e.code === 'url');
  await assert.rejects(L.safeFetch('https://lab.com.ar:8443/a.pdf', { lookup: pub, get }), e => e.code === 'url');
  assert.equal(conectó, 0);
});

test('SSRF: un redirect a una IP privada se bloquea; a http también; más de 3 redirects, también', async () => {
  const lookup = async h => [{ address: h === 'interno.example' ? '192.168.0.10' : '200.45.12.3', family: 4 }];
  await assert.rejects(L.safeFetch('https://lab.com.ar/r', { lookup, get: reply(302, { location: 'https://interno.example/a.pdf' }) }), e => e.code === 'ip_privada');
  await assert.rejects(L.safeFetch('https://lab.com.ar/r', { lookup, get: reply(301, { location: 'http://lab.com.ar/a.pdf' }) }), e => e.code === 'http');
  await assert.rejects(L.safeFetch('https://lab.com.ar/r', { lookup, get: reply(302, { location: '/otra' }) }), e => e.code === 'redirects');
  /* y la conexión va a la IP validada, no a otra que devuelva el DNS después */
  const ips = [];
  const ok = await L.safeFetch('https://lab.com.ar/a', { lookup, get: async (url, ip) => { ips.push(ip.address); return { status: 200, headers: { 'content-type': 'application/pdf' }, body: PDF }; } });
  assert.deepEqual(ips, ['200.45.12.3']); assert.equal(ok.type, 'application/pdf');
});

test('SSRF: HTML (login o captcha), tipo que no es PDF/imagen, bytes que no coinciden y tamaño excedido', async () => {
  await assert.rejects(L.safeFetch('https://lab.com.ar/a', { lookup: pub, get: reply(200, { 'content-type': 'text/html; charset=utf-8' }, HTML) }), e => e.code === 'html');
  await assert.rejects(L.safeFetch('https://lab.com.ar/a.pdf', { lookup: pub, get: reply(200, { 'content-type': 'application/pdf' }, HTML) }), e => e.code === 'html', 'dice PDF pero es HTML');
  await assert.rejects(L.safeFetch('https://lab.com.ar/a.zip', { lookup: pub, get: reply(200, { 'content-type': 'application/zip' }, Buffer.from('PK\u0003\u0004xxxx')) }), e => e.code === 'tipo');
  await assert.rejects(L.safeFetch('https://lab.com.ar/a.pdf', { lookup: pub, maxBytes: 1000, get: reply(200, { 'content-type': 'application/pdf' }, PDF) }), e => e.code === 'muy_grande');
  await assert.rejects(L.safeFetch('https://lab.com.ar/a.pdf', { lookup: pub, get: reply(403, {}) }), e => e.code === 'http_403');
  await assert.rejects(L.safeFetch('https://lab.com.ar/lento.pdf', { lookup: pub, timeoutMs: 50, get: () => new Promise(() => {}) }), e => e.code === 'tiempo');
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), randomBytes(100)]);
  const r = await L.safeFetch('https://lab.com.ar/descargar?id=1', { lookup: pub, get: reply(200, { 'content-type': 'application/octet-stream', 'content-disposition': 'attachment; filename="rx-aika.png"' }, png) });
  assert.deepEqual([r.type, r.name], ['image/png', 'rx-aika.png']);
});

/* ---------- de punta a punta: un link que devuelve PDF se importa ---------- */
const EMAIL = 'majo@ejemplo.com';
const doc = { pets: [{ id: 'aika0001', name: 'Aika', species: 'perro', breed: '', vet: { name: 'Veterinaria Panda' }, records: [], visits: [], studies: [] }, { id: 'toto0001', name: 'Toto', species: 'perro', breed: '', vet: {}, records: [], visits: [], studies: [] }] };
const H = (n, v) => ({ name: n, value: v });
const b64u = s => Buffer.from(s).toString('base64url');
const MAILS = {
  link0001: { id: 'link0001', threadId: 'thlink01', internalDate: String(Date.parse('2026-10-01')), payload: { headers: [H('Subject', 'Resultados de Aika - Laboratorio Veterinario Panda'), H('From', 'Lab Panda <resultados@labpanda.com.ar>')], mimeType: 'multipart/alternative', body: { size: 0 }, parts: [
    { partId: '0', mimeType: 'text/plain', filename: '', body: { size: 100, data: b64u('Resultados en el link') } },
    { partId: '1', mimeType: 'text/html', filename: '', body: { size: 900, data: b64u(MAIL_HTML) } },
  ] } },
  nolink01: { id: 'nolink01', threadId: 'thnolin1', internalDate: String(Date.parse('2026-09-01')), payload: { headers: [H('Subject', 'Veterinaria Panda: recordatorio de turno'), H('From', 'Veterinaria Panda <turnos@vetpanda.com.ar>')], mimeType: 'text/html', body: { size: 300, data: b64u('<p>Te esperamos el sábado.</p><a href="https://vetpanda.com.ar/turnos">Mis turnos</a>') } } },
};
const calls = [];
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(String(url)); calls.push(u.pathname + u.search);
  const json = o => new Response(JSON.stringify(o), { status: 200, headers: { 'content-type': 'application/json' } });
  if (u.href.startsWith('https://oauth2.googleapis.com/token')) {
    const f = Object.fromEntries(new URLSearchParams(String(init.body)));
    return f.grant_type === 'authorization_code' ? json({ access_token: 'AT', refresh_token: 'RT', scope: G.SCOPE }) : json({ access_token: 'AT' });
  }
  const p = u.pathname.replace('/gmail/v1/users/me', '');
  if (p === '/profile') return json({ emailAddress: 'siccomaria@gmail.com' });
  if (p === '/messages') return json({ messages: Object.keys(MAILS).map(id => ({ id })) });
  const m = /^\/messages\/([^/]+)$/.exec(p);
  if (m) return json(MAILS[m[1]]);
  throw new Error('inesperado ' + url);
};
const call = (method, query, body) => new Promise(ok => {
  const res = { code: 200, headers: {}, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, status(c) { this.code = c; return this; }, json(o) { ok({ code: this.code, body: o }); }, end() { ok({ code: this.code, headers: this.headers }); }, redirect(c, u) { ok({ code: c, headers: { location: u } }); } };
  mascotas({ method, query, body, headers: { cookie: `orbit_session=${makeSession(EMAIL)}`, host: 'preview.orbitando.test' } }, res);
});

test('un mail veterinario con el estudio como link aparece como candidato y el PDF del link se importa', async () => {
  await kvSet(`orbit:purchases:${EMAIL}`, [{ productId: 'ob-018', date: '2026-10-12' }]);
  await kvSet(`orbit:pets:${EMAIL}`, { ...doc, rev: 1 });
  const go = await call('GET', { gmail: 'start' });
  const res = { code: 0, headers: {} };
  await call('GET', { gmail: 'callback', code: 'x', state: new URL(go.headers?.location || 'https://x/?state=').searchParams.get('state') });

  const s = await call('POST', { gmail: 'search' }, { mode: 'all' });
  assert.equal(s.code, 200, JSON.stringify(s.body));
  const c = s.body.candidates.find(x => x.m === 'link0001');
  assert.ok(c, 'el mail con link es candidato');
  assert.deepEqual(c.files.map(f => [f.type, f.name]).sort(), [['link', 'Estudio por link · drive.google.com'], ['link', 'Estudio por link · resultados.labpanda.com.ar']]);
  assert.deepEqual(s.body.noFile.map(x => x.m), ['nolink01'], 'sin link de estudio: queda en "abrilo en Gmail"');
  assert.ok(calls.some(x => x.includes('/messages/link0001?format=full&fields=payload')), 'leyó el cuerpo solo para buscar links');
  /* el cuerpo no se guardó en ningún lado */
  assert.ok(!JSON.stringify(await kvGet(`orbit:petgmail:${EMAIL}`)).includes('Descargar informe'));

  const P = G.gmail, cfg = G.gmailConfig({ headers: { host: 'x' } }), st = await M.getState(P, EMAIL);
  const lab = c.files.find(f => f.host === 'resultados.labpanda.com.ar');
  const put = []; let scanned = 0, fetched = [];
  const deps = {
    pets: doc.pets, peekScan: async () => null, takeScan: async () => null, fits: async () => true, addUsage: async () => {},
    putFile: async (e, name, buf, type) => { put.push([name, type, buf.length]); return 'blob:mascotas/0123456789abcdef/x-' + name; },
    scanStudy: async () => { scanned++; return { date: '2026-09-30', kind: 'sangre', title: 'Hemograma', lab: 'Lab Panda', summary: '', confidence: 'alta', warnings: [], pet: { name: 'Aika' } }; },
    /* la descarga real con sus defensas, con DNS y red simulados */
    fetchLink: url => { fetched.push(url); return L.safeFetch(url, { lookup: pub, get: reply(200, { 'content-type': 'application/pdf', 'content-disposition': 'attachment; filename="Hemograma-Aika.pdf"' }, PDF) }); },
  };
  const imp = await M.importOne(P, EMAIL, st, cfg, { m: 'link0001', part: lab.part }, deps);
  assert.equal(imp.status, 200, JSON.stringify(imp.body));
  assert.deepEqual(put, [['Hemograma-Aika.pdf', 'application/pdf', PDF.length]]);
  assert.equal(scanned, 1); assert.equal(imp.body.petId, 'aika0001');
  assert.deepEqual(fetched, ['https://resultados.labpanda.com.ar/informes/descargar?id=98213&t=x']);
  assert.ok(st.imported.includes(M.dedupeKey('link0001', lab.part)), 'dedupe: messageId + hash del URL');
  await assert.rejects(M.importOne(P, EMAIL, st, cfg, { m: 'link0001', part: lab.part }, deps), e => e.code === 'ya_importado');

  /* un hash que no está en el mail no se baja (el navegador no puede mandar URLs) */
  await assert.rejects(M.importOne(P, EMAIL, st, cfg, { m: 'link0001', part: L.linkPart('https://169.254.169.254/') }, deps), e => e.code === 'adjunto_no_encontrado');

  /* Drive pidiendo login: no se importa y vuelve el link para abrirlo */
  const drive = c.files.find(f => f.host === 'drive.google.com');
  await assert.rejects(M.importOne(P, EMAIL, st, cfg, { m: 'link0001', part: drive.part }, { ...deps, fetchLink: url => L.safeFetch(url, { lookup: pub, get: reply(200, { 'content-type': 'text/html' }, HTML) }) }),
    e => e.code === 'link_error' && e.extra.motivo === 'login' && e.extra.url.startsWith('https://drive.google.com/file/d/'));

  /* y lo que se busca de nuevo ya no ofrece el link importado */
  const s2 = await call('POST', { gmail: 'search' }, { mode: 'all' });
  assert.ok(!s2.body.candidates.flatMap(x => x.files).some(f => f.part === lab.part));
});
