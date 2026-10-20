/* Mi Mes · tope global de IA (USD 30/mes), vencimiento a 12 meses y precio (decisiones de Majo del 15/10). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';

for (const k of ['KV_REST_API_URL', 'KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'VERCEL_ENV', 'ANTHROPIC_API_KEY', 'MI_MES_AI_BUDGET_USD', 'BREVO_API_KEY', 'RESEND_API_KEY']) delete process.env[k];
process.env.SESSION_SECRET = 'secreto-de-prueba-0123456789';
process.env.ADMIN_EMAILS = 'admin@orbit.test';
const IA = await import('../api/_lib/mi-mes-ia.js');
const { kvSet, kvGet, addPurchase } = await import('../api/_lib/kv.js');
const { makeSession } = await import('../api/_lib/auth.js');

test('[IA] precios de finance-model (filas mimes_) y techo de USD 30 por defecto', () => {
  assert.equal(IA.budgetUsd(), 30);
  process.env.MI_MES_AI_BUDGET_USD = '45'; assert.equal(IA.budgetUsd(), 45); delete process.env.MI_MES_AI_BUDGET_USD;
  // Opus 5.5: USD 4 / 20 por millón; Haiku 5.5: USD 0,10 / 0,50 → micro-dólares por token
  assert.equal(IA.costoMicro('claude-opus-5-5', 13_000, 4_000), 132_000);
  assert.equal(IA.costoMicro('claude-haiku-5-5', 7_000, 200), 800);
  assert.equal(IA.costoMicro('modelo-raro', 1_000, 0), 4_000, 'un modelo desconocido se cobra como Opus (prudente)');
  // reserva máxima por paso (tokens máximos de finance-model, 2 intentos)
  assert.equal(IA.reservaMaxima('resumen'), 2 * (118_000 * 4 + 16_000 * 20));
  assert.equal(IA.reservaMaxima('factura'), 2 * (118_000 * 4 + 4_000 * 20));
  assert.equal(IA.reservaMaxima('clasificar'), Math.ceil(2 * (118_000 * 0.1 + 8_000 * 0.5)));
});
test('[IA] reserva antes, ajuste al costo real después; si no se cobró, vuelve', async () => {
  const now = Date.UTC(2026, 9, 15, 15);
  const r = await IA.reservar('resumen', now);
  assert.equal(r.ok, true);
  assert.equal(await IA.reservadoMicro(now), IA.reservaMaxima('resumen'), 'lo en curso va aparte del gasto real');
  await IA.ajustar(r, { modelo: 'claude-opus-5-5', entrada: 13_000, salida: 4_000 }, now);
  assert.equal(await IA.gastadoMicro(now), 132_000);
  assert.equal(await IA.reservadoMicro(now), 0);
  const r2 = await IA.reservar('factura', now);
  await IA.devolver(r2);
  assert.equal(await IA.gastadoMicro(now), 132_000);
});
test('[IA] al 100 % se pausa hasta el mes siguiente, con el mensaje para la app; el aviso es de Mi Mes', async () => {
  const now = Date.UTC(2026, 9, 20, 15);
  await kvSet(IA.claveGasto(now), 30 * 1e6 - 1000);
  const r = await IA.reservar('clasificar', now);
  assert.deepEqual([r.ok, r.hasta], [false, '1/11']);
  assert.equal(IA.mensajePausa(r.hasta), 'La lectura automática está en pausa hasta el 1/11: cargalo a mano.');
  assert.equal(await IA.gastadoMicro(now), 30 * 1e6 - 1000, 'la reserva rechazada no queda sumada');
  const m100 = IA.mailAviso(100, 30e6, now), m80 = IA.mailAviso(80, 24.5e6, now);
  assert.match(m100.subject, /Mi Mes.*pausa/);
  assert.match(m100.text, /MI_MES_AI_BUDGET_USD/);
  assert.match(m80.subject, /Mi Mes.*80/);
  // sin mail configurado no explota y no manda
  assert.deepEqual(await IA.avisoTope(80, 25e6, now), { enviado: false, nivel: 80 });
  /* limpieza: este mes es el real; los tests de los endpoints arrancan sin pausa */
  const { kvDel } = await import('../api/_lib/kv.js');
  await kvDel(IA.claveGasto(now)); await kvDel(IA.clavePausa(now));
});
test('[IA] vence a los 12 meses de la compra; admin no vence; sin fecha, desde el primer uso', async () => {
  const now = Date.UTC(2026, 9, 15);
  assert.deepEqual(await IA.vigenciaIA({ email: 'a@x', admin: false }, [{ productId: 'ob-019', date: '2025-10-10T12:00:00Z' }], now), { hasta: '2026-10-10', vencida: true });
  assert.deepEqual(await IA.vigenciaIA({ email: 'b@x', admin: false }, [{ productId: 'ob-019', date: '2026-10-01T12:00:00Z' }], now), { hasta: '2027-10-01', vencida: false });
  assert.deepEqual(await IA.vigenciaIA({ email: 'admin@orbit.test', admin: true }, [], now), { hasta: null, vencida: false });
  const sinFecha = await IA.vigenciaIA({ email: 'c@x', admin: false }, [{ productId: 'ob-019' }], now);
  assert.deepEqual(sinFecha, { hasta: '2027-10-15', vencida: false });
  assert.equal(IA.mensajeVencida('2026-10-10'), 'Tu lectura automática venció el 10/10/2026. La app y tus datos siguen; podés cargar a mano.');
});

/* ── los endpoints ── */
const leer = (await import('../api/mi-mes-leer.js')).default;
const leerRes = (await import('../api/leer-resumen.js')).default;
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), Buffer.from('ia inventada')]);
const PDF = Buffer.from('%PDF-1.4\n% ia inventada\n%%EOF', 'latin1');
const req = (email, body, url = '/api/mi-mes-leer', method = 'POST') => { const r = Readable.from(method === 'POST' ? [body] : []); r.method = method; r.url = url; r.headers = { cookie: `orbit_session=${makeSession(email)}`, 'content-length': String(body.length) }; return r; };
const res = () => { const r = { code: 200, headers: {}, body: null }; r.status = c => { r.code = c; return r; }; r.setHeader = (k, v) => { r.headers[k] = v; }; r.json = b => { r.body = b; return r; }; return r; };
const llamar = async (fn, q) => { const r = res(); await fn(q, r); return r; };
await addPurchase('vieja@orbit.test', { productId: 'ob-019', orderId: 'OBTEST:v', via: 'mercadopago', amount: 1, currency: 'ARS', date: '2025-01-05T12:00:00Z' });
await addPurchase('nueva@orbit.test', { productId: 'ob-019', orderId: 'OBTEST:n', via: 'mercadopago', amount: 1, currency: 'ARS', date: new Date().toISOString() });
test('[IA] endpoints: la lectura vencida responde 403 con la fecha; GET avisa vigencia y pausa', async () => {
  for (const fn of [leer, leerRes]) {
    const r = await llamar(fn, req('vieja@orbit.test', fn === leer ? PNG : PDF, fn === leer ? '/api/mi-mes-leer' : '/api/leer-resumen'));
    assert.deepEqual([r.code, r.body.motivo], [403, 'ia_vencida']);
    assert.match(r.body.error, /Tu lectura automática venció el 5\/1\/2026\. La app y tus datos siguen; podés cargar a mano\./);
  }
  const g = await llamar(leer, req('nueva@orbit.test', Buffer.alloc(0), '/api/mi-mes-leer', 'GET'));
  assert.equal(g.body.ok, true);
  assert.match(g.body.iaHasta, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(g.body.pausa, null);
});
test('[IA] endpoint real: con el techo lleno no llama a Claude y dice "en pausa hasta el 1/…"', async () => {
  process.env.ANTHROPIC_API_KEY = 'falsa';
  const docs = await import('../api/_lib/mi-mes-documentos.js');
  let llamadas = 0;
  docs.__usarCliente({ messages: { create: async () => { llamadas++; return { model: 'claude-haiku-5-5', stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 10 }, content: [{ type: 'text', text: '{"tipo":"otro","recibo":null,"captura":null,"factura":null,"confianza":"alta","avisos":[]}' }] }; } } });
  try {
    await kvSet(IA.claveGasto(), 30 * 1e6);
    const r = await llamar(leer, req('nueva@orbit.test', PNG));
    assert.deepEqual([r.code, r.body.motivo, llamadas], [503, 'pausa', 0]);
    assert.match(r.body.error, /^La lectura automática está en pausa hasta el 1\/\d+: cargalo a mano\.$/);
    // con lugar en el techo: lee y ajusta al costo real (10 + 10 tokens de Haiku)
    await kvSet(IA.claveGasto(), 0);
    const { kvDel } = await import('../api/_lib/kv.js'); await kvDel(IA.clavePausa());
    const ok = await llamar(leer, req('nueva@orbit.test', Buffer.concat([PNG, Buffer.from('2')])));
    assert.equal(ok.code, 200);
    assert.equal(await kvGet(IA.claveGasto()), IA.costoMicro('claude-haiku-5-5', 10, 10));
  } finally { delete process.env.ANTHROPIC_API_KEY; }
});

test('[precio] ob-019 USD 24 / ARS 35.990 de lanzamiento, comprable, y en products.js con el mismo precio', async () => {
  const { getCatalog } = await import('../api/_lib/catalog.js');
  const CAT = await getCatalog();
  assert.deepEqual([CAT['ob-019'].usd, CAT['ob-019'].ars, CAT['ob-019'].soon], [24, 35990, undefined]);
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../api/_lib/catalog.js', import.meta.url), 'utf8');
  assert.match(src, /13\/11.*USD 34.*ARS 50\.990/);
  const prod = readFileSync(new URL('../assets/js/products.js', import.meta.url), 'utf8');
  assert.match(prod, /id: 'ob-019'[^]*?price: 24, ars: 35990/);
});


/* ── QA t19 · media 1: la pausa es total, se marca una vez y se ve ── */
test('[QA t19 · 1] cerca del techo (no alcanza para el lector más caro) se pausan TODOS los tipos, juntos', async () => {
  const now = Date.UTC(2026, 10, 10, 15);   // noviembre
  const cap = 30e6, umbral = cap - IA.reservaMaxima('resumen');
  await kvSet(IA.claveGasto(now), umbral + 1);   // ~USD 28,42
  assert.equal(await IA.enPausa(now), '1/12', 'el aviso de la app ya dice pausa');
  for (const paso of ['clasificar', 'factura', 'resumen']) {
    const r = await IA.reservar(paso, now);
    assert.deepEqual([r.ok, r.hasta], [false, '1/12'], paso);
  }
  assert.ok(await kvGet(IA.clavePausa(now)), 'marca compartida por mes');
});
test('[QA t19 · 1] muchas lecturas en paralelo no pausan el mes ni mandan el mail: si no hay lugar, "probá en unos minutos"', async () => {
  const now = Date.UTC(2026, 11, 5, 15);   // diciembre
  const rs = await Promise.all(Array.from({ length: 30 }, () => IA.reservar('resumen', now)));
  assert.ok(rs.some(r => r.ok) && rs.some(r => r.ocupado), 'algunas esperan');
  assert.equal(await kvGet(IA.clavePausa(now)), null, 'no se marcó la pausa');
  assert.equal(await IA.enPausa(now), null);
  for (const r of rs) await IA.devolver(r);
  assert.equal(await IA.reservadoMicro(now), 0);
});
test('[QA t19 · 1] el mail del 100 % sale una sola vez, al marcar la pausa', async () => {
  const now = Date.UTC(2027, 0, 5, 15);
  let mails = 0;
  IA.__usarAviso(async () => { mails++; return { enviado: true }; });
  try {
    await kvSet(IA.claveGasto(now), 29.5e6);
    await IA.reservar('clasificar', now); await IA.reservar('resumen', now); await IA.enPausa(now);
    assert.equal(mails, 1);
  } finally { IA.__usarAviso(null); }
});
test('[QA t19 · 2] la fecha de primer uso vence a los 13 meses', async () => {
  assert.equal(IA.TTL_DESDE_S, 13 * 31 * 86400);
});
test('[QA t19 · baja] en pausa, el archivo no cuenta en el tope de la persona', async () => {
  process.env.ANTHROPIC_API_KEY = 'falsa';
  const { hoyAR } = await import('../api/_lib/mi-mes-avisos.js');
  try {
    await kvSet(IA.clavePausa(), { gastado: 1 });
    const r = await llamar(leer, req('nueva@orbit.test', Buffer.concat([PNG, Buffer.from('pausa')])));
    assert.deepEqual([r.code, r.body.motivo], [503, 'pausa']);
    assert.equal(await kvGet(`orbit:mi-mes:lecturas-dia:nueva@orbit.test:${hoyAR()}`) , 1, 'sigue en 1 (la lectura del test anterior)');
  } finally { const { kvDel } = await import('../api/_lib/kv.js'); await kvDel(IA.clavePausa()); delete process.env.ANTHROPIC_API_KEY; }
});
