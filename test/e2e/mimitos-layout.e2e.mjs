/* Mimitos · layout en el celu (Chrome headless): sin scroll horizontal ni recortes a 360, 375, 390 y 414 px en Inicio,
   "Quién la cuida" (con el flujo de crear el link) y el link público /cuida/:t; y el alto de Inicio con una cuenta cargada.
   No corre con `npm test` (necesita Chrome y playwright-core). Correr con:
     PW_CORE=/ruta/a/node_modules/playwright-core/index.mjs node --test test/e2e/mimitos-layout.e2e.mjs
   (CHROME=/ruta/al/binario si no está en /Applications). Chrome siempre con --mute-audio. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const PW = process.env.PW_CORE ? await import(process.env.PW_CORE).catch(() => null) : null;
const EXE = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const skip = PW ? false : 'falta PW_CORE (playwright-core)';
const EMAIL = 'layout@ejemplo.com';

async function server() {
  for (const k of ['KV_REST_API_URL', 'KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'BREVO_API_KEY']) delete process.env[k];
  process.env.SESSION_SECRET = 'prueba-secreta-de-mimitos-layout-12345678';
  const { kvSet } = await import('../../api/_lib/kv.js');
  const { makeSession } = await import('../../api/_lib/auth.js');
  const { default: mascotas } = await import('../../api/mascotas.js');
  const { bigDoc } = await import('../fixtures/mimitos-cuenta-grande.mjs');
  await kvSet(`orbit:purchases:${EMAIL}`, [{ productId: 'ob-018', date: '2026-10-12' }]);
  await kvSet(`orbit:pets:${EMAIL}`, { rev: 1, ...bigDoc() });
  const vj = JSON.parse(await readFile(join(ROOT, 'vercel.json'), 'utf8'));
  const match = (src, p) => new RegExp('^' + src.replace(/\(\.\*\)/g, '.*').replace(/:[a-z]+\*?/g, '[^/]+') + '$').test(p);
  const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/json' };
  const cookie = `orbit_session=${makeSession(EMAIL)}`;
  const srv = http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://localhost'); let path = u.pathname;
    for (const r of vj.rewrites || []) if (match(r.source, path) && !r.destination.includes('?')) { path = r.destination; break; }
    if (path.startsWith('/api/mascotas')) {
      req.query = Object.fromEntries(u.searchParams); req.headers.cookie = cookie;
      if (req.method === 'POST') { const ch = []; for await (const c of req) ch.push(c); req.body = JSON.parse(Buffer.concat(ch).toString() || '{}'); }
      res.status = c => { res.statusCode = c; return res; }; res.json = o => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(o)); };
      try { await mascotas(req, res); } catch { res.statusCode = 500; res.end('{}'); } return;
    }
    if (path.startsWith('/api/')) { res.statusCode = 404; return res.end('{}'); }
    let p = path === '/' ? '/index.html' : path; if (!extname(p)) p += '.html';
    try { const b = await readFile(join(ROOT, p)); res.setHeader('Content-Type', TYPES[extname(p)] || 'application/octet-stream'); res.end(b); } catch { res.statusCode = 404; res.end('nf'); }
  });
  await new Promise(ok => srv.listen(0, ok));
  return { srv, base: `http://localhost:${srv.address().port}` };
}

/* elementos que se salen del ancho sin un contenedor que los recorte (los carruseles con overflow no cuentan) */
const overflow = (page, root) => page.evaluate(root => {
  const W = document.documentElement.clientWidth;
  const clipped = e => { for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) if (getComputedStyle(a).overflowX !== 'visible') return true; return false; };
  const out = [...document.querySelectorAll(root + ' *')].filter(e => { if (e instanceof SVGElement && e.tagName !== 'svg') return false; const r = e.getBoundingClientRect(); return r.width && (r.right > W + 1 || r.left < -1) && !clipped(e); });
  return { scroll: document.documentElement.scrollWidth - W, out: out.slice(0, 5).map(e => e.tagName + '.' + e.className) };
}, root);

test('layout a 360–414 px: Inicio, Quién la cuida (crear link) y /cuida/:t sin desbordes; Inicio ≤ 5 pantallas (con Mi veterinaria y Mi guardia)', { skip }, async () => {
  const { srv, base } = await server();
  const browser = await PW.chromium.launch({ executablePath: EXE, args: ['--mute-audio', '--headless=new'] });
  try {
    for (const W of [360, 375, 390, 414]) {
      const ctx = await browser.newContext({ viewport: { width: W, height: 800 }, isMobile: true, hasTouch: true, locale: 'es-AR', timezoneId: 'America/Argentina/Buenos_Aires' });
      const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
      await p.goto(base + '/mascotas#/inicio'); await p.waitForSelector('main [data-act=sitter]'); await p.waitForTimeout(800);
      let o = await overflow(p, 'main'); assert.equal(o.scroll, 0, `${W}: Inicio sin scroll horizontal`); assert.deepEqual(o.out, [], `${W}: Inicio`);
      const screens = await p.evaluate(() => document.documentElement.scrollHeight / innerHeight);
      assert.ok(screens <= 5, `${W}: Inicio mide ${screens.toFixed(2)} pantallas`);
      await p.click('main [data-act=sitter]'); await p.waitForSelector('#sSave'); await p.waitForTimeout(400);
      o = await overflow(p, '#dPanel'); assert.deepEqual(o.out, [], `${W}: Quién la cuida`);
      await p.fill('#f_name', 'Caro'); await p.fill('#f_to', new Date(Date.now() + 4 * 864e5).toISOString().slice(0, 10));
      await p.$eval('#sSave', b => b.scrollIntoView({ block: 'end' }));
      await p.click('#sSave'); await p.waitForSelector('.sl-box #sLink');
      assert.match(await p.$eval('#sLink', i => i.value), /\/cuida\/[A-Za-z0-9_-]{12}$/);
      for (const s of ['#sCp', '#sWa', '#sOpen']) assert.ok(await p.$(s), `${W}: ${s}`);
      assert.match(await p.$eval('.sl-box .sl-state', e => e.textContent), /^Vigente hasta el /);
      assert.ok(await p.$eval('.sl-box', e => e.getBoundingClientRect().top < innerHeight), `${W}: el link se ve sin scrollear`);
      o = await overflow(p, '#dPanel'); assert.deepEqual(o.out, [], `${W}: con el link`);
      const url = await p.$eval('#sLink', i => i.value);
      const q = await ctx.newPage(); await q.goto(url.replace(/^https?:\/\/[^/]+/, base)); await q.waitForSelector('h1');
      o = await overflow(q, 'body'); assert.equal(o.scroll, 0, `${W}: /cuida sin scroll horizontal`); assert.deepEqual(o.out, [], `${W}: /cuida`);
      assert.equal(await q.$eval('.hello', e => e.textContent.trim().endsWith('Gracias por cuidarla')), true);
      assert.deepEqual(errs, []);
      await ctx.close();
    }
  } finally { await browser.close(); srv.close(); }
});

/* v33: la barra de arriba de 1024 a 1920 (logo entero con "by Orbit", nada encima y todo adentro de la barra)
   e Inicio sin el bloque "Salud" ni la tarjeta de la libreta, sin emojis en "Me fui" (con "Me fui" prendido: la barra más llena) */
test('barra de escritorio 1024–1920: logo entero y sin pisarse; Inicio sin bloques repetidos ni emojis', { skip }, async () => {
  Object.assign(process.env, { MIMITOS_MEFUI: '1', MIMITOS_MEFUI_ALLOW: EMAIL });
  const { srv, base } = await server();
  const browser = await PW.chromium.launch({ executablePath: EXE, args: ['--mute-audio', '--headless=new'] });
  try {
    for (const W of [1024, 1100, 1180, 1279, 1280, 1366, 1440, 1600, 1920, 360, 390]) {
      const ctx = await browser.newContext({ viewport: { width: W, height: 900 }, isMobile: W < 900, hasTouch: W < 900, locale: 'es-AR', timezoneId: 'America/Argentina/Buenos_Aires' });
      const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
      await p.goto(base + '/mascotas#/inicio'); await p.waitForSelector('main [data-act=sitter]'); await p.waitForTimeout(800);
      if (W >= 1024) {
        const r = await p.evaluate(() => {
          const top = document.querySelector('.top'), b = top.querySelector('.brand'), br = b.getBoundingClientRect(), tr = top.getBoundingClientRect();
          const items = [b, ...top.querySelectorAll('#tnavBox > *, .top-acts > *')].filter(e => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden')
            .map(e => { const q = e.getBoundingClientRect(); return { n: e.className || e.tagName, l: q.left, r: q.right }; }).sort((a, c) => a.l - c.l);
          const pisa = items.slice(1).filter((x, i) => x.l < items[i].r - 0.5).map(x => x.n);
          const tapa = []; for (let x = br.left + 2; x < br.right - 1; x += 4) { const e = document.elementFromPoint(x, br.top + br.height / 2); if (e && !b.contains(e)) tapa.push(e.className); }
          return { texto: b.innerText.replace(/\s+/g, ' ').trim(), recorte: b.scrollWidth - b.clientWidth, pisa, tapa: tapa.slice(0, 3), afuera: items.filter(x => x.l < tr.left - 0.5 || x.r > tr.right + 0.5).map(x => x.n) };
        });
        assert.equal(r.texto, 'mimitos BY ORBIT', `${W}: logo entero`);
        assert.equal(r.recorte, 0, `${W}: logo sin recorte`); assert.deepEqual(r.tapa, [], `${W}: nada encima del logo`);
        assert.deepEqual(r.pisa, [], `${W}: elementos de la barra pisados`); assert.deepEqual(r.afuera, [], `${W}: elementos fuera de la barra`);
        assert.equal(await p.$('.top .al-top'), null, `${W}: "Algo pasó" ya no va en la barra`);
      }
      const ini = await p.evaluate(() => ({ salud: !!document.getElementById('h-health'), libreta: !!document.querySelector('#app .bookcard'), emoji: /🏠|📷/.test(document.getElementById('app').innerHTML), mf: !!document.querySelector('.mf-cam-ic svg.i') || !document.querySelector('.mf-cam-ic') }));
      assert.deepEqual(ini, { salud: false, libreta: false, emoji: false, mf: true }, `${W}: Inicio`);
      assert.deepEqual(errs, []);
      await ctx.close();
    }
  } finally { await browser.close(); srv.close(); }
});
