/* Mimitos · por qué no se pudo bajar un estudio por link: cada motivo, de punta a punta, y logs sin URLs.
   Caso real que lo motivó: panda2.pegasusvet-his.com.ar responde por http y en https:443 tira error de TLS.
   Correr con: node --test test/mascotas-mail-errores.test.mjs  (red simulada; un server local para el TLS roto) */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { randomBytes } from 'node:crypto';
process.env.SESSION_SECRET = 'prueba-secreta-de-mimitos-1234567890';
process.env.GOOGLE_CLIENT_ID = 'cliente.apps.googleusercontent.com';
process.env.GOOGLE_CLIENT_SECRET = 'secreto';
process.env.MIMITOS_TOKEN_KEY = randomBytes(32).toString('base64');
process.env.MIMITOS_MAIL_ALLOW = 'majo@ejemplo.com';
const { kvSet } = await import('../api/_lib/kv.js');
const L = await import('../api/_lib/petlinks.js');
const M = await import('../api/_lib/petmail.js');
const G = await import('../api/_lib/petgmail.js');

const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), randomBytes(500)]);
const pub = async () => [{ address: '200.45.12.3', family: 4 }];
const reply = (status, headers, body = Buffer.alloc(0)) => async () => ({ status, headers, body });
const fetchCode = async (url, opts) => { try { await L.safeFetch(url, { lookup: pub, ...opts }); return 'ok'; } catch (e) { return L.reasonOf(e.code); } };

test('cada motivo sale con su categoría', async () => {
  assert.equal(await fetchCode('http://panda2.pegasusvet-his.com.ar/informe.php?id=1&token=abc', { get: reply(200, {}, PDF) }), 'http');
  assert.equal(await fetchCode('https://lab.com.ar/a', { get: reply(200, { 'content-type': 'text/html' }, Buffer.from('<html>login</html>')) }), 'login');
  assert.equal(await fetchCode('https://lab.com.ar/a', { get: reply(401, {}) }), 'login');
  assert.equal(await fetchCode('https://lab.com.ar/a', { get: reply(403, {}) }), 'login');
  assert.equal(await fetchCode('https://lab.com.ar/a.pdf', { maxBytes: 100, get: reply(200, { 'content-type': 'application/pdf' }, PDF) }), 'grande');
  assert.equal(await fetchCode('https://lab.com.ar/a.pdf', { get: reply(404, {}) }), 'no_existe');
  assert.equal(await fetchCode('https://lab.com.ar/a.pdf', { get: reply(410, {}) }), 'no_existe');
  assert.equal(await fetchCode('https://lab.com.ar/a.pdf', { timeoutMs: 30, get: () => new Promise(() => {}) }), 'tiempo');
  assert.equal(await fetchCode('https://lab.com.ar/a.zip', { get: reply(200, { 'content-type': 'application/zip' }, Buffer.from('PK\u0003\u0004')) }), 'tipo');
  assert.equal(await fetchCode('https://lab.com.ar/a.pdf', { lookup: async () => [{ address: '10.0.0.1', family: 4 }], get: reply(200, {}, PDF) }), 'bloqueado');
  assert.equal(await fetchCode('https://lab.com.ar/a.pdf', { get: reply(502, {}) }), 'red');
  assert.equal(await fetchCode('https://lab.com.ar/a.pdf', { lookup: async () => { throw new Error('ENOTFOUND'); }, get: reply(200, {}, PDF) }), 'red');
  for (const code of ['EPROTO', 'ERR_SSL_WRONG_VERSION_NUMBER', 'CERT_HAS_EXPIRED', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'ERR_TLS_CERT_ALTNAME_INVALID']) {
    assert.equal(L.reasonOf(L.netErr({ code }).code), 'tls', code);
  }
  assert.equal(L.reasonOf(L.netErr({ code: 'ECONNREFUSED' }).code), 'red');
  assert.equal(L.reasonOf(L.netErr({ code: 'ETIMEDOUT' }).code), 'tiempo');
});

test('TLS roto de verdad: un puerto que contesta sin cifrado (como pegasusvet en 443) sale como "tls"', async () => {
  const srv = http.createServer((q, r) => r.end('hola')).listen(0, '127.0.0.1');
  await new Promise(r => srv.on('listening', r));
  const port = srv.address().port;
  try {
    await L.httpsGet(`https://panda2.pegasusvet-his.com.ar:${port}/x`, { address: '127.0.0.1', family: 4 }, { signal: new AbortController().signal, maxBytes: 1000 });
    assert.fail('no tenía que conectar');
  } catch (e) { assert.equal(L.reasonOf(e.code), 'tls', String(e.code)); }
  finally { srv.close(); }
});

/* ---------- por el motor: cada motivo vuelve a la app con host y link, y el log no trae la URL ---------- */
const EMAIL = 'majo@ejemplo.com';
const H = (n, v) => ({ name: n, value: v });
const HTML = '<p>Resultados de Aika</p><a href="http://panda2.pegasusvet-his.com.ar/informes/descargar.php?id=777&token=SECRETO123">Descargar informe</a>';
const MAIL = { id: 'panda001', threadId: 'thpanda1', internalDate: String(Date.parse('2026-10-10')), payload: { headers: [H('Subject', 'Resultados de Aika - Veterinaria Panda'), H('From', 'Veterinaria Panda <info@vetpanda.com.ar>')], mimeType: 'text/html', body: { size: 300, data: Buffer.from(HTML).toString('base64url') } } };
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(String(url));
  const json = o => new Response(JSON.stringify(o), { status: 200, headers: { 'content-type': 'application/json' } });
  if (u.href.startsWith('https://oauth2.googleapis.com/token')) return json({ access_token: 'AT' });
  if (/\/messages\/panda001$/.test(u.pathname)) return json(MAIL);
  throw new Error('inesperado ' + url);
};

test('importar por link: el motor devuelve link_error con el motivo, el host y el link; el log no tiene la URL ni el token', async () => {
  const P = G.gmail, cfg = G.gmailConfig({ headers: { host: 'x' } });
  await kvSet(`orbit:petgmail:${EMAIL}`, { tok: M.seal('RT', M.tokenKey(), EMAIL), imported: [], queue: [] });
  const st = await M.getState(P, EMAIL);
  const [link] = L.extractLinks({ html: HTML });
  assert.ok(link && link.url.startsWith('http://'), 'los links http se ofrecen (para abrir a mano)');
  const deps = code => ({ pets: [], peekScan: async () => null, takeScan: async () => null, fits: async () => true, addUsage: async () => {}, putFile: async () => 'x', scanStudy: async () => ({}),
    fetchLink: async url => code === 'real' ? L.safeFetch(url, { lookup: pub, get: reply(200, {}, PDF) }) : Promise.reject(Object.assign(new Error(code), { code })) });
  const warns = []; const orig = console.warn; console.warn = (...a) => warns.push(a.join(' '));
  try {
    for (const [code, motivo] of [['real', 'http'], ['tls', 'tls'], ['html', 'login'], ['muy_grande', 'grande'], ['http_404', 'no_existe'], ['tiempo', 'tiempo'], ['tipo', 'tipo'], ['red', 'red']]) {
      await assert.rejects(M.importOne(P, EMAIL, st, cfg, { m: 'panda001', part: link.part }, deps(code)), e => {
        assert.equal(e.code, 'link_error'); assert.equal(e.status, 422);
        assert.deepEqual([e.extra.motivo, e.extra.host], [motivo, 'panda2.pegasusvet-his.com.ar'], code);
        assert.equal(e.extra.url, link.url, 'vuelve el link para el botón "Abrir el link"');
        return true;
      });
    }
  } finally { console.warn = orig; }
  assert.equal(warns.length, 8);
  assert.ok(warns.every(w => w.includes('panda2.pegasusvet-his.com.ar') && !w.includes('SECRETO123') && !w.includes('descargar.php') && !w.includes('id=777')), warns.join('\n'));
  assert.ok(!st.imported.length, 'nada quedó marcado como importado: se puede reintentar');
});
