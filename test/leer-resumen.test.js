/* Mi Mes by Orbit · /api/leer-resumen en modo prueba (sin base ni Claude). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';

for (const k of ['KV_REST_API_URL', 'KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'VERCEL_ENV', 'ANTHROPIC_API_KEY']) delete process.env[k];
process.env.SESSION_SECRET = 'secreto-de-prueba-0123456789';
process.env.ADMIN_EMAILS = 'admin@orbit.test';

const { makeSession } = await import('../api/_lib/auth.js');
const { addPurchase } = await import('../api/_lib/kv.js');
const api = await import('../api/leer-resumen.js');
const { validarLectura, cuadreLectura, MONEDAS } = await import('../api/_herramientas/mi-mes/calculos.js');
const lector = await import('../api/_lib/mi-mes-lector.js');
const leer = api.default;

await addPurchase('compro@orbit.test', { productId: 'ob-019', orderId: 'OBTEST:ob-019', via: 'mercadopago', amount: 0, currency: 'ARS', date: new Date().toISOString() });
await addPurchase('otro@orbit.test', { productId: 'ob-012', orderId: 'OBTEST:ob-012', via: 'mercadopago', amount: 0, currency: 'ARS', date: new Date().toISOString() });

const PDF = (paginas = 2) => Buffer.from(`%PDF-1.4\n${Array.from({ length: paginas }, (_, i) => `${i + 3} 0 obj << /Type /Page /Parent 2 0 R >> endobj`).join('\n')}\n2 0 obj << /Type /Pages /Count ${paginas} >> endobj\n%%EOF`, 'latin1');
const pedido = (email, cuerpo, extra = {}) => {
  const r = Readable.from(cuerpo ? [cuerpo] : []);
  r.method = 'POST';
  r.headers = { ...(email ? { cookie: `orbit_session=${makeSession(email)}` } : {}), 'content-length': String(cuerpo?.length || 0), ...extra };
  return r;
};
function respuesta() {
  const r = { code: 200, headers: {}, body: null };
  r.status = c => { r.code = c; return r; };
  r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; };
  r.json = b => { r.body = b; return r; };
  r.send = b => { r.body = b; return r; };
  return r;
}
const llamar = async req => { const res = respuesta(); await leer(req, res); return res; };

test('leer-resumen: sin sesión 401 y sin compra 403, en JSON', async () => {
  assert.equal((await llamar(pedido(null, PDF()))).code, 401);
  const r = await llamar(pedido('otro@orbit.test', PDF()));
  assert.deepEqual([r.code, r.body.motivo], [403, 'sin_compra']);
});
test('leer-resumen: solo GET (modo) y POST (lectura)', async () => {
  const req = pedido('compro@orbit.test', PDF());
  req.method = 'PUT';
  assert.equal((await llamar(req)).code, 405);
  const g = pedido('compro@orbit.test', null);
  g.method = 'GET';
  const r = await llamar(g);
  assert.deepEqual([r.code, r.body.modo], [200, 'prueba']);
  const sin = pedido(null, null);
  sin.method = 'GET';
  assert.equal((await llamar(sin)).code, 401, 'el modo también pide compra');
});
test('leer-resumen: rechaza lo que no es PDF, lo muy pesado y lo de muchas páginas', async () => {
  assert.equal((await llamar(pedido('compro@orbit.test', Buffer.from('hola, no soy un pdf')))).body.motivo, 'no_pdf');
  const grande = Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(api.MAX_BYTES)]);
  assert.equal((await llamar(pedido('compro@orbit.test', grande))).code, 413);
  const mentiroso = pedido('compro@orbit.test', grande, { 'content-length': '10' });
  assert.equal((await llamar(mentiroso)).body.motivo, 'grande', 'corta aunque el content-length mienta');
  const r = await llamar(pedido('compro@orbit.test', PDF(api.MAX_PAGINAS + 1)));
  assert.deepEqual([r.code, r.body.motivo], [413, 'paginas']);
  assert.equal(api.contarPaginas(PDF(3)), 3);
});
test('leer-resumen: con compra responde el ejemplo en modo prueba, con el esquema final', async () => {
  const r = await llamar(pedido('compro@orbit.test', PDF()));
  assert.equal(r.code, 200);
  assert.equal(r.body.modo, 'prueba');
  assert.equal(r.headers['cache-control'], 'no-store');
  const l = r.body.lectura;
  for (const k of lector.ESQUEMA.required) assert.ok(k in l, k);
  for (const k of ['banco', 'red', 'ultimos4']) assert.ok(l.tarjeta[k], k);
  const monedas = new Set(l.consumos.map(c => c.moneda));
  assert.ok(monedas.has('USD') && [...monedas].some(m => m !== 'ARS' && m !== 'USD'), 'trae USD y otra moneda');
  assert.ok(l.consumos.every(c => c.fecha && c.comercio && typeof c.monto === 'number' && MONEDAS[c.moneda] && c.rubro && 'cuota' in c && 'tarjeta' in c));
  assert.ok(l.tarjetas.some(t => t.adicional), 'trae una adicional');
  assert.ok(l.cargos.some(c => c.tipo === 'percepcion') && l.pagosYCreditos.some(c => c.tipo === 'pago'));
  assert.deepEqual(cuadreLectura(l), { ok: true, motivos: [] }, 'el ejemplo cierra la cuenta completa');
  assert.equal(validarLectura(l).ok, true);
});
test('leer-resumen: tope de lecturas por día', async () => {
  const { kvSet } = await import('../api/_lib/kv.js');
  const dia = new Date().toISOString().slice(0, 10);
  await kvSet(`orbit:mi-mes:lecturas:admin@orbit.test:${dia}`, api.TOPE_DIA);
  const r = await llamar(pedido('admin@orbit.test', PDF()));
  assert.deepEqual([r.code, r.body.motivo], [429, 'tope']);
});

/* ── lectura real con Claude (cliente falso, sin red) ── */
const { default: Anthropic } = await import('@anthropic-ai/sdk');
const { resumenEjemplo } = await import('../api/_herramientas/mi-mes/ejemplo.js');
const respuestaClaude = json => ({ model: 'claude-opus-5-5', stop_reason: 'end_turn', usage: { input_tokens: 12000, output_tokens: 2500 },
  content: [{ type: 'text', text: typeof json === 'string' ? json : JSON.stringify(json) }] });
function falso(...respuestas) {
  const pedidos = [];
  return { pedidos, beta: { messages: { create: async (p, o) => { pedidos.push({ p, o }); const r = respuestas.shift(); if (r instanceof Error) throw r; return r; } } } };
}
async function conKey(fn) {
  process.env.ANTHROPIC_API_KEY = 'clave-de-prueba';
  const logs = [];
  const [log, warn] = [console.log, console.warn];
  console.log = (...a) => logs.push(a.join(' '));
  console.warn = (...a) => logs.push(a.join(' '));
  try { return await fn(logs); } finally { console.log = log; console.warn = warn; delete process.env.ANTHROPIC_API_KEY; }
}
const leerReal = () => llamar(pedido('compro@orbit.test', PDF()));

test('claude: lectura OK → modo real, confiable, con el PDF en base64 y el esquema en las instrucciones', () => conKey(async logs => {
  const c = falso(respuestaClaude(resumenEjemplo()));
  lector.__usarCliente(c);
  const r = await leerReal();
  assert.equal(r.code, 200);
  assert.deepEqual([r.body.modo, r.body.confiable, r.body.lectura.confianza], ['real', true, 'alta']);
  const { p, o } = c.pedidos[0];
  assert.equal(p.model, lector.MODELO);
  // sin salida estricta: con el esquema completo la API responde 400 ("compiled grammar is too large")
  assert.equal(p.output_config.format, undefined);
  assert.match(p.system, /JSON Schema/);
  assert.equal(p.messages[0].content[0].type, 'document');
  assert.equal(p.messages[0].content[0].source.media_type, 'application/pdf');
  assert.ok(o.timeout <= 55_000);
  const linea = logs.find(l => l.includes('"modo":"real"'));
  assert.match(linea, /"entrada":12000/);
  assert.match(linea, /"salida":2500/);
  assert.doesNotMatch(logs.join(' '), /SUPERMERCADO|4821|Banco Ejemplo/, 'los logs no llevan datos del resumen');
  // GET avisa que la lectura es real
  const g = pedido('compro@orbit.test', null); g.method = 'GET';
  assert.equal((await llamar(g)).body.modo, 'real');
}));
test('claude: JSON inválido dos veces → 422, sin inventar nada', () => conKey(async () => {
  const c = falso(respuestaClaude('{esto no es json'), respuestaClaude('tampoco'));
  lector.__usarCliente(c);
  const r = await leerReal();
  assert.deepEqual([r.code, r.body.motivo, r.body.lectura], [422, 'invalida', undefined]);
  assert.equal(c.pedidos.length, 2, 'un solo reintento');
}));
test('claude: JSON inválido y después bueno → se usa el segundo', () => conKey(async () => {
  lector.__usarCliente(falso(respuestaClaude('{roto'), respuestaClaude(resumenEjemplo())));
  const r = await leerReal();
  assert.deepEqual([r.code, r.body.confiable], [200, true]);
}));
test('claude: si la suma no da → no confiable, con el motivo', () => conKey(async () => {
  const l = resumenEjemplo();
  l.totales[0].monto += 50_000;             // el total no cierra con los consumos
  lector.__usarCliente(falso(respuestaClaude(l)));
  const r = await leerReal();
  assert.deepEqual([r.code, r.body.confiable, r.body.lectura.confianza], [200, false, 'baja']);
  assert.match(r.body.lectura.avisos.join(' '), /no suma el total/);
}));
test('claude: si la cuenta cierra, dudas que no tocan montos son aviso suave (sigue confiable)', () => conKey(async () => {
  // lo que pasó en la primera lectura real: cerraba al centavo pero volvió "baja" por el período
  lector.__usarCliente(falso(respuestaClaude({ ...resumenEjemplo(), confianza: 'baja',
    dudas: [{ campo: 'periodo', detalle: 'El resumen no indica la fecha de inicio del período.' }] })));
  const r = await leerReal();
  assert.deepEqual([r.body.confiable, r.body.lectura.confianza], [true, 'alta']);
  assert.match(r.body.lectura.avisos.join(' '), /Dato dudoso \(período\)/, 'dice sobre qué campo');
  // sin saldo anterior ni pagos, pero cerrando la cuenta: confiable
  const simple = { ...resumenEjemplo(), saldoAnterior: [], pagosYCreditos: [], cargos: [], confianza: 'baja', dudas: [] };
  simple.totales = ['ARS', 'USD', 'EUR'].map(m => ({ moneda: m, monto: Math.round(simple.consumos.filter(c => c.moneda === m).reduce((a, c) => a + c.monto * 100, 0)) / 100 }));
  lector.__usarCliente(falso(respuestaClaude(simple)));
  assert.equal((await leerReal()).body.confiable, true);
}));
test('claude: dudas sobre montos sí la bajan a no confiable, aunque la suma dé', () => conKey(async () => {
  lector.__usarCliente(falso(respuestaClaude({ ...resumenEjemplo(), dudas: [{ campo: 'montos', detalle: 'Un consumo se ve borroso.' }] })));
  const r = await leerReal();
  assert.deepEqual([r.body.confiable, r.body.lectura.confianza], [false, 'baja']);
  assert.match(r.body.lectura.avisos[0], /Dato dudoso \(montos\): Un consumo se ve borroso/);
}));
test('claude: error de la API → 502; timeout → 504; rechazo → 422', () => conKey(async () => {
  lector.__usarCliente(falso(Anthropic.APIError.generate(500, { error: { message: 'x' } }, 'boom', new Headers())));
  assert.deepEqual([(await leerReal()).code], [502]);
  lector.__usarCliente(falso(new Anthropic.APIConnectionTimeoutError()));
  const t = await leerReal();
  assert.deepEqual([t.code, t.body.motivo], [504, 'timeout']);
  lector.__usarCliente(falso({ ...respuestaClaude({}), stop_reason: 'refusal' }));
  assert.equal((await leerReal()).body.motivo, 'rechazo');
}));

test('esquema: como mucho 16 campos con unión (límite de la API) y el JSON se limpia de ```', () => {
  let n = 0;
  (function rec(x) { if (!x || typeof x !== 'object') return; if (Array.isArray(x.anyOf) || Array.isArray(x.type)) n++; for (const v of Object.values(x)) if (typeof v === 'object') rec(v); })(lector.ESQUEMA);
  assert.ok(n <= 16, `hay ${n} campos con unión`);
  assert.equal(lector.soloJson('```json\n{"a":1}\n```'), '{"a":1}');
});
