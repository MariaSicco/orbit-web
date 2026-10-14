/* Mimitos · "Me fui": COSTO en KV de una cámara prendida todo el día (ping de la escucha + video en reposo) y del cron.
   Upstash simulado que cuenta cada comando (el mismo de test/mascotas-rtc.test.mjs). */
import { test } from 'node:test';
import assert from 'node:assert/strict';

for (const k of ['KV_REST_API_URL', 'KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'VERCEL_ENV', 'MIMITOS_MEFUI', 'MIMITOS_MEFUI_ALLOW']) delete process.env[k];
process.env.SESSION_SECRET = 'prueba-secreta-de-mimitos-costo-12345678';
process.env.ADMIN_EMAILS = 'admin@orbit.test';
process.env.MIMITOS_MEFUI = '1';
process.env.MIMITOS_MEFUI_ALLOW = 'duena@x.com, otra@x.com';
process.env.KV_REST_API_URL = 'https://kv.test';
process.env.KV_REST_API_TOKEN = 'token-de-prueba';

/* ---------- Upstash simulado: lo justo de Redis, con vencimientos sobre Date.now ---------- */
const db = new Map();
const kv = { cmds: 0, byName: {} };
const live = k => { const e = db.get(k); if (e && e.exp && e.exp <= Date.now()) { db.delete(k); return null; } return e || null; };
function redis(args) {
  const [name, ...a] = args.map(String);
  const op = name.toUpperCase();
  kv.cmds++; kv.byName[op] = (kv.byName[op] || 0) + 1;
  if (op === 'GET') return live(a[0])?.v ?? null;
  if (op === 'MGET') return a.map(k => live(k)?.v ?? null);
  if (op === 'DEL') { let n = 0; for (const k of a) if (live(k)) { db.delete(k); n++; } return n; }
  if (op === 'SET') {
    const [k, v, ...o] = a; const up = o.map(x => x.toUpperCase());
    const cur = live(k);
    if (up.includes('NX') && cur) return null;
    if (up.includes('XX') && !cur) return null;
    const ex = up.indexOf('EX');
    const exp = ex >= 0 ? Date.now() + Number(o[ex + 1]) * 1000 : (up.includes('KEEPTTL') && cur ? cur.exp : 0);
    db.set(k, { v, exp });
    return up.includes('GET') ? (cur?.v ?? null) : 'OK';
  }
  if (op === 'INCRBY') { const cur = live(a[0]); const v = (Number(cur?.v) || 0) + Number(a[1]); db.set(a[0], { v: String(v), exp: cur?.exp || 0 }); return v; }
  if (op === 'EXPIRE') { const cur = live(a[0]); if (!cur) return 0; cur.exp = Date.now() + Number(a[1]) * 1000; return 1; }
  if (op === 'SADD' || op === 'SREM' || op === 'SMEMBERS') {
    const cur = live(a[0]); const set = new Set(cur ? JSON.parse(cur.v) : []);
    if (op === 'SMEMBERS') return [...set];
    if (op === 'SADD') set.add(a[1]); else set.delete(a[1]);
    db.set(a[0], { v: JSON.stringify([...set]), exp: 0 }); return 1;
  }
  if (op === 'SCAN') {
    const re = new RegExp('^' + a[2].split('*').map(x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
    return ['0', [...db.keys()].filter(k => live(k) && re.test(k))];
  }
  throw new Error('comando no simulado: ' + op);
}
globalThis.fetch = async (url, opt = {}) => {
  if (String(url).startsWith('https://kv.test')) {
    const result = redis(JSON.parse(opt.body));
    return { ok: true, status: 200, json: async () => ({ result }) };
  }
  return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
};

const { makeSession } = await import('../api/_lib/auth.js');
const { kvSet } = await import('../api/_lib/kv.js');
const W = await import('../api/_lib/petaway.js');
const R = await import('../api/_lib/petrtc.js');
const { default: mascotas } = await import('../api/mascotas.js');
const { default: cron } = await import('../api/cron/mefui.js');
const buy = email => kvSet(`orbit:purchases:${email}`, [{ productId: 'ob-018', orderId: 'o-' + email, date: '2026-10-01T00:00:00Z' }]);
const req = (query, body, headers = {}) => new Promise(ok => {
  const res = { code: 200, status(c) { this.code = c; return this; }, setHeader() {}, json(b) { ok({ code: this.code, body: b }); return this; }, end() { ok({ code: this.code }); return this; } };
  mascotas({ method: 'POST', query, body, headers: { 'x-forwarded-for': '10.1.1.1', ...headers } }, res);
});

test('COSTO: cámara prendida 24 h (audio con ping cada 5 min + video en reposo) → menos de 4.000 comandos de KV; el cron sin salidas, casi nada', async () => {
  await buy('duena@x.com');
  await kvSet('orbit:pets:duena@x.com', { rev: 1, pets: [{ id: 'feliza01', name: 'Feliza', species: 'gato' }] });
  const { code } = await W.createPairing('duena@x.com', { petId: 'feliza01' });
  const cam = await W.redeemPairing(code);
  W._clearCamCache(); R._clearCamCache?.();
  const real = Date.now, t0 = real();
  let t = t0, nextPing = t0, nextPoll = t0, nextCron = t0, pings = 0, polls = 0, crons = 0;
  const by = { ping: 0, rtc: 0, cron: 0 };
  try {
    Date.now = () => t;
    process.env.CRON_SECRET = 'c';
    while (t < t0 + 86400e3) {
      t = Math.min(nextPing, nextPoll, nextCron);
      let before = kv.cmds;
      if (t === nextPing) { const r = await req({ cam: 'ping' }, {}, { authorization: 'Bearer ' + cam.token }); assert.equal(r.code, 200); pings++; nextPing += 5 * 60e3; by.ping += kv.cmds - before; before = kv.cmds; }
      if (t === nextPoll) { const r = await req({ rtc: 'poll' }, { token: cam.token }); assert.equal(r.code, 200); polls++; nextPoll += r.body.wait; by.rtc += kv.cmds - before; before = kv.cmds; }
      if (t === nextCron) { await new Promise(ok => cron({ headers: { authorization: 'Bearer c' } }, { status() { return this; }, json: ok })); crons++; nextCron += 10 * 60e3; by.cron += kv.cmds - before; }
    }
    const camTotal = by.ping + by.rtc;
    console.log(`# costo 24 h: cámara ${camTotal} comandos (audio/ping ${by.ping} en ${pings} pings, video ${by.rtc} en ${polls} consultas); cron "Me fui" sin salidas ${by.cron} en ${crons} corridas (por todo el sitio)`);
    assert.ok(camTotal < 4000, `la cámara gastó ${camTotal}`);
    assert.ok(by.ping <= 1100, `el ping gastó ${by.ping}`);
  } finally { Date.now = real; }
});
