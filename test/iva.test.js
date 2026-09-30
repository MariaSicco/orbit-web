// Orbit IVA en la web: acceso por cuenta y compra, saldo de lecturas, recargas y descuento por lectura.
// Base en memoria (sin KV) y Claude simulado (se reemplaza fetch). No toca servicios reales.
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.SESSION_SECRET = 'secreto-de-prueba-1234567890';
process.env.ANTHROPIC_API_KEY = 'sk-ant-prueba';
process.env.ADMIN_EMAILS = 'admin@orbit.test';
delete process.env.KV_REST_API_URL; delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.BREVO_API_KEY;

let respuestaClaude = null, fallarClaude = false;
const fetchReal = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  if (String(url).includes('anthropic.com')) {
    if (fallarClaude) return new Response(JSON.stringify({ type: 'error', error: { type: 'api_error', message: 'x' } }), { status: 500, headers: { 'content-type': 'application/json' } });
    return new Response(JSON.stringify({ id: 'm', type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', content: [{ type: 'text', text: respuestaClaude }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }); // Brevo u otros: sin efecto
};

const { makeSession } = await import('../api/_lib/auth.js');
const { createOrder, markPaid } = await import('../api/_lib/orders.js');
const { default: extraer } = await import('../api/iva/extraer.js');
const { default: asistente } = await import('../api/iva/asistente.js');

const llamar = (handler, { email, metodo = 'GET', body } = {}) => new Promise(ok => {
  const res = { setHeader() {}, status(c) { this.code = c; return this; }, json(o) { ok({ code: this.code, ...o }); } };
  handler({ method: metodo, headers: { cookie: email ? `orbit_session=${makeSession(email)}` : '' }, body, query: {} }, res);
});
const lectura = { es_comprobante: true, tipo_codigo: '001', letra: 'A', punto_venta: 1, numero: 5, fecha: '2026-08-01', cuit_emisor: '30712345671', razon_social_emisor: 'Prov SA', cuit_receptor: '', moneda: 'PES', cotizacion: 1, alicuotas: [{ tasa: 21, neto: 1000, iva: 210 }], no_gravado: 0, exento: 0, percepciones_iva: 0, percepciones_iibb: 0, percepciones_municipales: 0, otros_tributos: 0, total: 1210, cae: '', campos_dudosos: [] };
const foto = { imagen: 'AAAA', mediaType: 'image/jpeg' };
const comprar = async (email, id, qty = 1) => {
  const o = await createOrder({ email, items: [{ id, qty, name: id, code: id, usd: 1, ars: 1 }], via: 'mercadopago' });
  await markPaid(o.id, { paymentId: 'p-' + o.id });
  return o;
};

test('sin sesión → 401 · con sesión pero sin compra → 403', async () => {
  assert.equal((await llamar(extraer)).code, 401);
  const r = await llamar(extraer, { email: 'nadie@orbit.test' });
  assert.deepEqual([r.code, r.motivo], [403, 'sin_compra']);
  assert.equal((await llamar(asistente, { email: 'nadie@orbit.test', metodo: 'POST', body: { tarea: 'regla', datos: { instruccion: 'x' } } })).code, 403);
});

test('la compra da acceso y 1.500 lecturas; la recarga suma 1.000; un pago no se acredita dos veces', async () => {
  const email = 'cliente@orbit.test';
  const o = await comprar(email, 'ob-005');
  let r = await llamar(extraer, { email });
  assert.deepEqual([r.code, r.saldo, r.recarga.id, r.recarga.lecturas], [200, 1500, 'ob-005-r', 1000]);
  await markPaid(o.id, { paymentId: 'repetido' });          // aviso repetido del medio de pago
  await comprar(email, 'ob-005-r');
  r = await llamar(extraer, { email });
  assert.equal(r.saldo, 2500);
});

test('cada lectura descuenta una; si Claude falla, se devuelve', async () => {
  const email = 'lee@orbit.test';
  await comprar(email, 'ob-005');
  respuestaClaude = JSON.stringify(lectura);
  const r = await llamar(extraer, { email, metodo: 'POST', body: foto });
  assert.deepEqual([r.code, r.saldo, r.comprobante.total], [200, 1499, 121000]);
  fallarClaude = true;
  const mal = await llamar(extraer, { email, metodo: 'POST', body: foto });
  fallarClaude = false;
  assert.deepEqual([mal.code, mal.saldo], [502, 1499]);
});

test('sin saldo → 402 y no llama a Claude', async () => {
  const email = 'vacio@orbit.test';
  await comprar(email, 'ob-005');
  const { consumir } = await import('../api/_lib/creditos.js');
  await consumir(email, 1500);
  respuestaClaude = null; // si se llamara, fallaría el JSON
  const r = await llamar(extraer, { email, metodo: 'POST', body: foto });
  assert.deepEqual([r.code, r.motivo], [402, 'sin_saldo']);
});

test('la cuenta admin entra sin comprar y no gasta lecturas', async () => {
  respuestaClaude = JSON.stringify(lectura);
  const r = await llamar(extraer, { email: 'admin@orbit.test', metodo: 'POST', body: foto });
  assert.deepEqual([r.code, r.ilimitado], [200, true]);
});

test('el asistente funciona con la cuenta y no descuenta lecturas', async () => {
  const email = 'asist@orbit.test';
  await comprar(email, 'ob-005');
  respuestaClaude = JSON.stringify({ entendida: true, duda: '', reglas: [{ tipo: 'tolerancia_monto', monto_pesos: 2, porcentaje: 0, dias: 0, texto: '', cuit: '', nombres: [], origen: '', modo: '', campos: [], campo: '' }] });
  const r = await llamar(asistente, { email, metodo: 'POST', body: { tarea: 'regla', datos: { instruccion: 'Ignorá diferencias menores a $2' } } });
  assert.deepEqual([r.code, r.reglas[0].valor], [200, 200]);
  assert.equal((await llamar(extraer, { email })).saldo, 1500);
});
