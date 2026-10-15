/* Mi Mes by Orbit · avisos push: qué sale según la fecha, sin duplicados y sin montos.
   web-push está reemplazado por uno falso; la base cae a memoria. */
import { test } from 'node:test';
import assert from 'node:assert/strict';

for (const k of ['KV_REST_API_URL', 'KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'VERCEL_ENV', 'CRON_SECRET', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY']) delete process.env[k];
process.env.SESSION_SECRET = 'secreto-de-prueba-0123456789';
process.env.ADMIN_EMAILS = 'admin@orbit.test';

const M = await import('../api/_herramientas/mi-mes/calculos.js');
const { makeSession } = await import('../api/_lib/auth.js');
const { addPurchase, kvGet } = await import('../api/_lib/kv.js');
const lib = await import('../api/_lib/mi-mes-avisos.js');
const { default: apiAvisos } = await import('../api/mi-mes-avisos.js');
const { default: cron } = await import('../api/cron/mi-mes.js');

const enviados = [];
let falla = null;
lib.__usarWebpush({
  generateVAPIDKeys: () => ({ publicKey: 'BPub-de-prueba', privateKey: 'priv-de-prueba' }),
  setVapidDetails: () => {},
  sendNotification: async (sub, payload) => { if (falla) { const e = new Error('gone'); e.statusCode = falla; throw e; } enviados.push({ endpoint: sub.endpoint, ...JSON.parse(payload) }); },
});

await addPurchase('compro@orbit.test', { productId: 'ob-019', orderId: 'OBTEST:ob-019', via: 'mercadopago', amount: 0, currency: 'ARS', date: new Date().toISOString() });
await addPurchase('otro@orbit.test', { productId: 'ob-012', orderId: 'OBTEST:ob-012', via: 'mercadopago', amount: 0, currency: 'ARS', date: new Date().toISOString() });

function respuesta() {
  const r = { code: 200, headers: {}, body: null };
  r.status = c => { r.code = c; return r; };
  r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; };
  r.json = b => { r.body = b; return r; };
  return r;
}
const pedido = (email, method, body) => ({ method, body, headers: email ? { cookie: `orbit_session=${makeSession(email)}` } : {} });
const llamar = async (...a) => { const res = respuesta(); await apiAvisos(pedido(...a), res); return res; };
const SUB = { endpoint: 'https://push.ejemplo.test/abc', keys: { p256dh: 'p256', auth: 'auth' } };
const TARJETAS = [
  { id: 't1', nombre: 'Visa Galicia', cierre: '2026-10-29', vencimiento: '2026-11-10', dolares: true },
  { id: 't2', nombre: 'Master', cierre: null, vencimiento: null, dolares: false, diaCierre: 26, diaVence: 8 },
];

/* ── qué avisos tocan según la fecha ── */
test('push: cierre el día del cierre; vence a 3 días, la víspera y el día; dólares 5 días antes', () => {
  const tipos = hoy => M.avisosPushDeHoy(TARJETAS.slice(0, 1), hoy).map(a => a.tag.split(':')[1]);
  assert.deepEqual(tipos('2026-10-28'), []);
  assert.deepEqual(tipos('2026-10-29'), ['cierre']);
  assert.deepEqual(tipos('2026-11-05'), ['dolares']);
  assert.deepEqual(tipos('2026-11-06'), []);
  assert.deepEqual(tipos('2026-11-07'), ['vence']);
  assert.deepEqual(tipos('2026-11-08'), []);
  assert.deepEqual(tipos('2026-11-09'), ['vence']);
  assert.deepEqual(tipos('2026-11-10'), ['vence']);
  assert.deepEqual(tipos('2026-11-11'), []);
  const [a] = M.avisosPushDeHoy(TARJETAS.slice(0, 1), '2026-11-09');
  assert.equal(a.title, 'Tu Visa Galicia vence mañana');
  assert.match(M.avisosPushDeHoy(TARJETAS.slice(0, 1), '2026-11-05')[0].body, /dólares propios antes del 10 nov/);
});
test('push: con días cargados sigue el ciclo siguiente, también al cambiar de año', () => {
  const t = [TARJETAS[1]];
  assert.equal(M.avisosPushDeHoy(t, '2026-12-26')[0].title, 'Cerró el resumen de tu Master');
  assert.equal(M.avisosPushDeHoy(t, '2027-01-05')[0].title, 'Tu Master vence en 3 días');
  assert.equal(M.avisosPushDeHoy(t, '2027-01-08')[0].tag, 'mm:vence:t2:2027-01-08:0');
});
test('push: ningún aviso lleva montos', () => {
  for (const h of ['2026-10-29', '2026-11-05', '2026-11-07', '2026-11-09', '2026-11-10']) {
    for (const a of M.avisosPushDeHoy(TARJETAS, h)) assert.doesNotMatch(`${a.title} ${a.body}`, /\$|US\$|\d{1,3}\.\d{3}/, a.title);
  }
});

/* ── lo que se guarda en el servidor ── */
test('lo que sale del dispositivo: nombre, fechas y dólares sí/no, sin montos ni consumos', () => {
  const d = M.migrar({ tarjetas: [{ id: 't1', nombre: 'Visa', banco: 'Banco X', ultimos4: '1234', limite: 99999 }], resumenes: [
    { id: 'r', tarjetaId: 't1', mes: '2026-11', cierre: '2026-10-29', vencimiento: '2026-11-10', totales: { ARS: 41_238_050, USD: 5_619 },
      consumos: [{ fecha: '2026-10-02', comercio: 'SUPER', monto: 10_000, moneda: 'ARS', rubro: 'Supermercado', cuota: null }] }] });
  const p = M.datosParaAvisos(d, '2026-10-20');
  assert.deepEqual(p, [{ id: 't1', nombre: 'Tarjeta 1', cierre: '2026-10-29', vencimiento: '2026-11-10', dolares: true }], 'alias, sin el nombre real');
  assert.doesNotMatch(JSON.stringify(p), /41238050|5619|SUPER|1234|Banco X|99999/);
  const sucio = [{ ...TARJETAS[0], monto: 412_380, consumos: [{ comercio: 'X', monto: 1 }], ultimos4: '4821', totales: { ARS: 1 } }];
  assert.deepEqual(Object.keys(M.limpiarTarjetasAvisos(sucio)[0]).sort(), ['cierre', 'dolares', 'id', 'nombre', 'vencimiento']);
});
test('API: pide la compra, activa, sincroniza y guarda solo lo mínimo', async () => {
  assert.equal((await llamar(null, 'GET')).code, 401);
  assert.equal((await llamar('otro@orbit.test', 'GET')).code, 403);
  const g = await llamar('compro@orbit.test', 'GET');
  assert.deepEqual([g.code, g.body.publicKey, g.body.activo], [200, 'BPub-de-prueba', false]);
  const sinActivar = await llamar('compro@orbit.test', 'POST', { accion: 'sincronizar', tarjetas: TARJETAS });
  assert.equal(sinActivar.body.activo, false, 'sin suscripción no guarda fechas');
  assert.equal(await kvGet(lib.claveAvisos('compro@orbit.test')), null);
  const mala = await llamar('compro@orbit.test', 'POST', { accion: 'activar', sub: { endpoint: 'http://inseguro' }, tarjetas: TARJETAS });
  assert.equal(mala.code, 400);
  const a = await llamar('compro@orbit.test', 'POST', { accion: 'activar', sub: SUB, tarjetas: [{ ...TARJETAS[0], monto: 412_380, consumos: [{ monto: 1 }] }, TARJETAS[1]] });
  assert.deepEqual([a.code, a.body.tarjetas], [200, 2]);
  const guardado = await kvGet(lib.claveAvisos('compro@orbit.test'));
  assert.equal(guardado.subs.length, 1);
  assert.doesNotMatch(JSON.stringify(guardado.tarjetas), /monto|consumos|412380/);
  await llamar('compro@orbit.test', 'POST', { accion: 'sincronizar', tarjetas: [TARJETAS[0]] });
  assert.equal((await kvGet(lib.claveAvisos('compro@orbit.test'))).tarjetas.length, 1);
  assert.equal((await llamar('compro@orbit.test', 'GET')).body.activo, true);
});

/* ── cron: hora, sin duplicados y limpieza ── */
const correr = async (hoy, auth = 'Bearer s3cr3t') => {
  process.env.CRON_SECRET = 's3cr3t';
  const res = respuesta();
  await cron({ headers: { authorization: auth }, query: { hoy } }, res);
  return res;
};
test('cron: sin el secreto no corre', async () => {
  assert.equal((await correr('2026-11-07', 'Bearer otro')).code, 401);
});
test('cron: manda lo de hoy una sola vez, sin montos', async () => {
  enviados.length = 0;
  const r1 = await correr('2026-11-07');
  assert.deepEqual([r1.code, r1.body.push], [200, 1]);
  assert.equal(enviados[0].title, 'Tu Visa Galicia vence en 3 días');
  assert.equal(enviados[0].url, '/herramientas/mi-mes');
  assert.doesNotMatch(JSON.stringify(enviados), /\$/);
  const r2 = await correr('2026-11-07');
  assert.equal(r2.body.push, 0, 'el mismo día no repite');
  assert.equal(enviados.length, 1);
  const r3 = await correr('2026-11-09');
  assert.equal(r3.body.push, 1, 'otro aviso, otro día');
});
test('cron: un celu que ya no existe (410) se borra', async () => {
  falla = 410;
  await correr('2026-11-10');
  falla = null;
  assert.equal((await kvGet(lib.claveAvisos('compro@orbit.test'))).subs.length, 0);
});
test('API: desactivar borra todo lo de la cuenta en el servidor', async () => {
  await llamar('compro@orbit.test', 'POST', { accion: 'activar', sub: SUB, tarjetas: TARJETAS });
  const d = await llamar('compro@orbit.test', 'DELETE', {});
  assert.deepEqual([d.code, d.body.borrado], [200, 'todo']);
  assert.equal(await kvGet(lib.claveAvisos('compro@orbit.test')), null);
  assert.equal(lib.hoyAR(new Date('2026-11-01T02:30:00Z')), '2026-10-31', 'la fecha es la de Argentina');
});
