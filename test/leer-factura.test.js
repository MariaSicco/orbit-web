/* Vencimientos de la Casa · "Leer factura": /api/leer-factura (sin base ni Claude real),
   el lector con un cliente falso y la conversión a propuesta. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';

for (const k of ['KV_REST_API_URL', 'KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'VERCEL_ENV', 'ANTHROPIC_API_KEY']) delete process.env[k];
process.env.SESSION_SECRET = 'secreto-de-prueba-0123456789';
process.env.ADMIN_EMAILS = 'admin@orbit.test';

const { makeSession } = await import('../api/_lib/auth.js');
const { addPurchase } = await import('../api/_lib/kv.js');
const api = await import('../api/leer-factura.js');
const lector = await import('../api/_lib/vencimientos-lector.js');
const F = await import('../api/_herramientas/vencimientos/factura.js');
const leer = api.default;

await addPurchase('compro@orbit.test', { productId: 'ob-021', orderId: 'OBTEST:ob-021', via: 'mercadopago', amount: 0, currency: 'ARS', date: new Date().toISOString() });
await addPurchase('otro@orbit.test', { productId: 'ob-019', orderId: 'OBTEST:ob-019', via: 'mercadopago', amount: 0, currency: 'ARS', date: new Date().toISOString() });

const JPG = Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]), Buffer.alloc(200, 1)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), Buffer.alloc(200, 1)]);
const PDF = (paginas = 1) => Buffer.from(`%PDF-1.4\n${Array.from({ length: paginas }, (_, i) => `${i + 3} 0 obj << /Type /Page >> endobj`).join('\n')}\n%%EOF`, 'latin1');
const pedido = (email, cuerpo, metodo = 'POST') => {
  const r = Readable.from(cuerpo ? [cuerpo] : []);
  r.method = metodo;
  r.headers = { ...(email ? { cookie: `orbit_session=${makeSession(email)}` } : {}), 'content-length': String(cuerpo?.length || 0) };
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

test('leer-factura: sin sesión 401, sin compra 403, admin entra', async () => {
  assert.equal((await llamar(pedido(null, JPG))).code, 401);
  const r = await llamar(pedido('otro@orbit.test', JPG));
  assert.deepEqual([r.code, r.body.motivo], [403, 'sin_compra']);
  assert.equal((await llamar(pedido('admin@orbit.test', JPG))).code, 200);
});

test('leer-factura: GET dice el modo; sin key es "prueba" con una lectura válida', async () => {
  const g = await llamar(pedido('compro@orbit.test', null, 'GET'));
  assert.deepEqual([g.code, g.body.modo], [200, 'prueba']);
  const r = await llamar(pedido('compro@orbit.test', PNG));
  assert.equal(r.code, 200);
  assert.equal(r.body.modo, 'prueba');
  assert.ok(F.validarLectura(r.body.lectura).ok);
  assert.equal(r.headers['cache-control'], 'no-store');
});

test('leer-factura: tipo por los bytes, PDF con demasiadas páginas y tamaño', async () => {
  const txt = await llamar(pedido('compro@orbit.test', Buffer.from('hola, no soy una factura')));
  assert.deepEqual([txt.code, txt.body.motivo], [415, 'tipo']);
  assert.equal(api.tipoArchivo(PDF()), 'pdf');
  assert.equal(api.tipoArchivo(JPG), 'image/jpeg');
  assert.equal(api.tipoArchivo(PNG), 'image/png');
  const largo = await llamar(pedido('compro@orbit.test', PDF(api.MAX_PAGINAS + 1)));
  assert.deepEqual([largo.code, largo.body.motivo], [413, 'paginas']);
  const grande = await llamar(pedido('compro@orbit.test', Buffer.concat([JPG, Buffer.alloc(api.MAX_BYTES)])));
  assert.equal(grande.code, 413);
});

test('leer-factura: tope de lecturas por día', async () => {
  for (let i = 0; i < api.TOPE_DIA; i++) await llamar(pedido('admin@orbit.test', JPG));
  const r = await llamar(pedido('admin@orbit.test', JPG));
  assert.deepEqual([r.code, r.body.motivo], [429, 'tope']);
});

const respuestaClaude = json => ({ stop_reason: 'end_turn', model: 'claude-opus-5-5', usage: { input_tokens: 1500, output_tokens: 300 },
  content: [{ type: 'text', text: typeof json === 'string' ? json : JSON.stringify(json) }] });

test('lector: manda la imagen como imagen y el PDF como documento, y devuelve la lectura', async () => {
  const pedidos = [];
  lector.__usarCliente({ beta: { messages: { create: async p => { pedidos.push(p); return respuestaClaude(F.lecturaEjemplo('2026-10-13')); } } } });
  const r = await lector.leerFacturaConClaude({ buf: JPG, tipo: 'image/jpeg' });
  assert.equal(r.lectura.servicio, 'edenor');
  assert.equal(pedidos[0].messages[0].content[0].type, 'image');
  assert.equal(pedidos[0].messages[0].content[0].source.media_type, 'image/jpeg');
  await lector.leerFacturaConClaude({ buf: PDF(), tipo: 'pdf' });
  assert.equal(pedidos[1].messages[0].content[0].type, 'document');
  assert.equal(pedidos[1].output_config.format.type, 'json_schema');
});

test('lector: reintenta una vez si el JSON no sirve y después corta sin inventar', async () => {
  let n = 0;
  lector.__usarCliente({ beta: { messages: { create: async () => { n++; return respuestaClaude(n === 1 ? 'no es json' : F.lecturaEjemplo('2026-10-13')); } } } });
  const r = await lector.leerFacturaConClaude({ buf: JPG, tipo: 'image/jpeg' });
  assert.equal(r.intentos, 2);
  lector.__usarCliente({ beta: { messages: { create: async () => respuestaClaude({ empresa: 'X', vencimientos: [{ fecha: '13/10/2026', monto: 1 }] }) } } });
  await assert.rejects(lector.leerFacturaConClaude({ buf: JPG, tipo: 'image/jpeg' }), e => e.tipo === 'invalida');
});

test('lector: rechazo y límite de la API se traducen a errores claros', async () => {
  lector.__usarCliente({ beta: { messages: { create: async () => ({ stop_reason: 'refusal', content: [], usage: {} }) } } });
  await assert.rejects(lector.leerFacturaConClaude({ buf: JPG, tipo: 'image/jpeg' }), e => e.tipo === 'rechazo');
  lector.__usarCliente({ beta: { messages: { create: async () => { const e = new Error('rate'); e.status = 429; throw e; } } } });
  await assert.rejects(lector.leerFacturaConClaude({ buf: JPG, tipo: 'image/jpeg' }), e => e.tipo === 'limite');
});

test('propuesta: 1º y 2º vencimiento, días entre ambos y montos en centavos', () => {
  const p = F.propuestaDesde(F.lecturaEjemplo('2026-10-13'), '2026-10-13');
  assert.equal(p.nombre, 'Edenor');
  assert.equal(p.preset, 'edenor');
  assert.equal(p.vence, '2026-10-22');
  assert.equal(p.segundoVto, 7);
  assert.equal(p.monto, 4783055);
  assert.equal(p.montoSegundo, 4891210);
  assert.equal(p.confiable, true);
});

test('propuesta: sin fecha no es confiable y avisa; fecha pasada también avisa', () => {
  const sin = F.propuestaDesde({ empresa: 'Gas del barrio', servicio: 'otro', categoria: 'Servicios', vencimientos: [{ fecha: null, monto: 100 }], moneda: 'ARS', confianza: 'alta', dudas: [], avisos: [] }, '2026-10-13');
  assert.equal(sin.confiable, false);
  assert.equal(sin.nombre, 'Gas del barrio');
  assert.match(sin.avisos[0], /No encontramos la fecha/);
  const vieja = F.propuestaDesde({ ...F.lecturaEjemplo('2026-08-01') }, '2026-10-13');
  assert.match(vieja.avisos[0], /ya pasó/);
  const dudosa = F.propuestaDesde({ ...F.lecturaEjemplo('2026-10-13'), dudas: [{ campo: 'monto', detalle: 'El importe está tapado.' }] }, '2026-10-13');
  assert.equal(dudosa.confiable, false);
});

test('cuentaQueCoincide: por servicio precargado o por nombre', () => {
  const cuentas = [{ id: 'a', nombre: 'Luz', preset: 'edenor' }, { id: 'b', nombre: 'Expensas' }];
  assert.equal(F.cuentaQueCoincide(cuentas, { preset: 'edenor', nombre: 'Edenor' }).id, 'a');
  assert.equal(F.cuentaQueCoincide(cuentas, { preset: null, nombre: 'Expensas Edificio' }).id, 'b');
  assert.equal(F.cuentaQueCoincide(cuentas, { preset: 'aysa', nombre: 'AySA' }), null);
});
