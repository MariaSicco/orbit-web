/* Mi Mes by Orbit · mail conectado por 6 meses: ventana de 6 meses, avisos de vencimiento, token cifrado,
   state de un solo uso, búsqueda sin repetidos, cola con reintento, bandeja cifrada y el trabajo diario.
   Google y Microsoft están reemplazados por un proveedor falso; la base cae a memoria. */
import { test } from 'node:test';
import assert from 'node:assert/strict';

for (const k of ['KV_REST_API_URL', 'KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'VERCEL_ENV', 'MI_MES_MAIL', 'MIMITOS_GMAIL_CAP', 'MI_MES_GMAIL_CAP']) delete process.env[k];
process.env.SESSION_SECRET = 'secreto-de-prueba-0123456789';
process.env.MI_MES_TOKEN_KEY = 'a'.repeat(64);
process.env.ADMIN_EMAILS = 'admin@orbit.test';

const MM = await import('../api/_lib/mi-mes-mail.js');
const { kvGet, kvSAdd } = await import('../api/_lib/kv.js');

/* proveedor falso: un mail con un PDF por "día" */
const buzon = [];
const falso = {
  id: 'gmail',
  renovar: async (cfg, refresh) => (refresh === 'revocado' ? { vencido: true } : { access: 'acceso-' + refresh }),
  revocar: async () => { falso.revocados = (falso.revocados || 0) + 1; return true; },
  buscar: async (at, desdeMs) => buzon.filter(x => Date.parse(x.fecha) >= desdeMs - 864e5).map(x => ({ ...x })),
  bajar: async (at, m) => Buffer.from(`%PDF-1.4 ${m}`),
};
MM.PROVEEDORES.gmail = falso;
const deps = { cfgDe: () => ({}) };

test('ventana de 6 meses: fin de mes y año', () => {
  assert.equal(MM.sumarMesesISO('2026-10-23', 6), '2027-04-23');
  assert.equal(MM.sumarMesesISO('2026-08-31', 6), '2027-02-28');
  assert.equal(MM.sumarMesesISO('2026-10-23', -6), '2026-04-23');
  assert.equal(MM.diasEntre('2026-10-23', '2026-10-30'), 7);
});

test('avisos de vencimiento: 7 días, 1 día y vencido, sin repetir', () => {
  const c = { venceEl: '2027-04-23', avisos: {} };
  assert.equal(MM.estadoVencimiento(c, '2027-04-10'), null);
  assert.equal(MM.estadoVencimiento(c, '2027-04-16'), 'aviso7');
  c.avisos.d7 = '2027-04-16';
  assert.equal(MM.estadoVencimiento(c, '2027-04-18'), null);
  assert.equal(MM.estadoVencimiento(c, '2027-04-22'), 'aviso1');
  c.avisos.d1 = '2027-04-22';
  assert.equal(MM.estadoVencimiento(c, '2027-04-22'), null);
  assert.equal(MM.estadoVencimiento(c, '2027-04-23'), 'vencido');
  assert.match(MM.textoAviso('aviso7', c).title, /vence el 23\/4\/2027/);
  assert.match(MM.textoAviso('vencido', c).body, /otros 6 meses/);
});

test('token cifrado: atado a la cuenta de Orbit', () => {
  const key = MM.tokenKey();
  const s = MM.seal('refresh-123', key, 'Ana@Orbit.test');
  assert.equal(MM.open(s, key, 'ana@orbit.test'), 'refresh-123');
  assert.throws(() => MM.open(s, key, 'otra@orbit.test'));
  assert.ok(!s.includes('refresh-123'));
});

test('state: firmado, ligado a la cuenta y al proveedor, un solo uso', async () => {
  const { state, challenge } = await MM.crearState('ana@orbit.test', 'gmail');
  assert.ok(challenge.length > 20);
  assert.equal(await MM.revisarState(state, 'otra@orbit.test', 'gmail'), null);
  assert.equal(await MM.revisarState(state, 'ana@orbit.test', 'outlook'), null);
  assert.ok((await MM.revisarState(state, 'ana@orbit.test', 'gmail')).verifier);
  assert.equal(await MM.revisarState(state, 'ana@orbit.test', 'gmail'), null);
});

test('conectar: lee desde 6 meses atrás, vence en 6 meses, guarda el token cifrado y cuenta para el cupo', async () => {
  const now = Date.parse('2026-10-23T15:00:00Z');
  const c = await MM.conectar('ana@orbit.test', 'gmail', { refresh: 'r1', direccion: 'ana@gmail.com' }, { now });
  assert.equal(c.autorizadoEl, '2026-10-23');
  assert.equal(c.venceEl, '2027-04-23');
  assert.equal(c.desde, '2026-04-23');
  const guardada = await kvGet(MM.clave('ana@orbit.test'));
  assert.ok(!JSON.stringify(guardada).includes('"r1"'));
  assert.deepEqual(Object.keys(MM.resumenConexion(guardada, '2026-10-23')).sort(), ['autorizadoEl', 'conectado', 'desde', 'direccion', 'faltan', 'pendientes', 'prov', 'ultimaBusqueda', 'venceEl']);
  assert.equal(await MM.cupoLleno('gmail', 'ana@orbit.test'), false);
});

test('cupo de Gmail: compartido con Mimitos; quien ya está sigue; admin no cuenta', async () => {
  process.env.MI_MES_GMAIL_CAP = '2';
  await kvSAdd(MM.GMAIL_USERS, 'mimitos@orbit.test');   // conectó Gmail en Mimitos
  assert.equal(await MM.cupoLleno('gmail', 'nuevo@orbit.test'), true);
  assert.equal(await MM.cupoLleno('gmail', 'ana@orbit.test'), false);
  assert.equal(await MM.cupoLleno('outlook', 'nuevo@orbit.test'), false);
  assert.equal(await MM.cupoLleno('gmail', 'admin@orbit.test'), false);
  delete process.env.MI_MES_GMAIL_CAP;
});

test('sincronizar: trae lo de los últimos 6 meses una sola vez', async () => {
  buzon.push({ m: 'msgviejo00001', part: '1', nombre: 'resumen-marzo.pdf', fecha: '2026-03-01' },     // antes de los 6 meses
    { m: 'msgabril00001', part: '1', nombre: 'resumen-mayo.pdf', fecha: '2026-05-10' },
    { m: 'msgoctub00001', part: '2', nombre: 'factura-luz.pdf', fecha: '2026-10-20' });
  const r1 = await MM.sincronizar('ana@orbit.test', { now: Date.parse('2026-10-23T16:00:00Z'), ...deps });
  assert.equal(r1.nuevos, 2);
  const r2 = await MM.sincronizar('ana@orbit.test', { now: Date.parse('2026-10-24T16:00:00Z'), ...deps });
  assert.equal(r2.nuevos, 0);
  assert.equal((await MM.leerConexion('ana@orbit.test')).cola.length, 2);
});

test('procesar: lo leído va a la bandeja cifrada; con tope vuelve a la cola', async () => {
  let respuesta = { ok: false, motivo: 'tope' };
  const leer = async ({ nombre }) => respuesta.ok ? { ...respuesta, huella: 'h-' + nombre } : respuesta;
  const r0 = await MM.procesarUno('ana@orbit.test', { leer, ...deps });
  assert.equal(r0.procesado, false); assert.equal(r0.espera, 'tope'); assert.equal(r0.quedan, 2);
  respuesta = { ok: true, modo: 'real', tipo: 'resumen', lectura: { totales: [] }, confiable: true };
  const r1 = await MM.procesarUno('ana@orbit.test', { leer, ...deps });
  assert.equal(r1.procesado, true); assert.equal(r1.quedan, 1);
  const crudo = await kvGet(MM.claveBandeja('ana@orbit.test'));
  assert.equal(typeof crudo, 'string'); assert.ok(!crudo.includes('resumen-mayo'));
  const b = await MM.leerBandeja('ana@orbit.test');
  assert.equal(b.length, 1); assert.equal(b[0].tipo, 'resumen'); assert.equal(b[0].nombre, 'resumen-mayo.pdf');
  /* un archivo que no es nada útil no va a la bandeja, pero sale de la cola y no se vuelve a leer */
  respuesta = { ok: true, tipo: 'otro' };
  await MM.procesarUno('ana@orbit.test', { leer, ...deps });
  assert.equal((await MM.leerBandeja('ana@orbit.test')).length, 1);
  const c = await MM.leerConexion('ana@orbit.test');
  assert.equal(c.cola.length, 0); assert.equal(c.vistos.length, 2);
  assert.equal(await MM.confirmarBandeja('ana@orbit.test', [b[0].id]), 0);
  assert.equal(await kvGet(MM.claveBandeja('ana@orbit.test')), null);
});

test('renovar con el mismo mail: nuevos 6 meses, sin volver a leer lo visto', async () => {
  const c = await MM.conectar('ana@orbit.test', 'gmail', { refresh: 'r2', direccion: 'ana@gmail.com' }, { now: Date.parse('2027-04-20T15:00:00Z') });
  assert.equal(c.venceEl, '2027-10-20');
  assert.equal(c.vistos.length, 2);
  assert.deepEqual(c.avisos, {});
});

test('trabajo diario: avisa a los 7 días, al día y al vencer revoca y borra', async () => {
  await MM.conectar('beto@orbit.test', 'gmail', { refresh: 'rb', direccion: 'beto@gmail.com' }, { now: Date.parse('2026-10-23T15:00:00Z') });
  const avisos = [];
  const avisar = async (email, t, tipo) => avisos.push({ email, tipo, title: t.title });
  const correr = hoy => MM.trabajoDiario({ hoy, now: Date.parse(`${hoy}T13:00:00Z`), finMs: Date.now() + 5000, avisar, leer: async () => ({ ok: true, tipo: 'otro' }), ...deps });
  await correr('2027-04-10');
  assert.equal(avisos.filter(a => a.email === 'beto@orbit.test').length, 0);
  await correr('2027-04-16'); await correr('2027-04-17');
  assert.deepEqual(avisos.filter(a => a.email === 'beto@orbit.test').map(a => a.tipo), ['aviso7']);
  await correr('2027-04-22');
  const antes = falso.revocados || 0;
  const out = await correr('2027-04-23');
  assert.deepEqual(avisos.filter(a => a.email === 'beto@orbit.test').map(a => a.tipo), ['aviso7', 'aviso1', 'vencido']);
  assert.ok(out.vencidas >= 1);
  assert.equal(await MM.leerConexion('beto@orbit.test'), null);
  assert.equal(falso.revocados, antes + 1);
});

test('trabajo diario: sin la compra no lee; permiso revocado en Google = se desconecta y avisa', async () => {
  await MM.conectar('sin@orbit.test', 'gmail', { refresh: 'rs' }, { now: Date.parse('2026-10-23T15:00:00Z') });
  await MM.conectar('rev@orbit.test', 'gmail', { refresh: 'revocado' }, { now: Date.parse('2026-10-23T15:00:00Z') });
  const avisos = [];
  const out = await MM.trabajoDiario({ hoy: '2026-11-01', finMs: Date.now() + 5000, avisar: async (e, t, tipo) => avisos.push({ e, tipo }),
    habilitada: async e => e !== 'sin@orbit.test', leer: async () => { throw new Error('no debería leer'); }, ...deps });
  assert.equal((await MM.leerConexion('sin@orbit.test')).ultimaBusqueda, null);
  assert.equal(await MM.leerConexion('rev@orbit.test'), null);
  assert.ok(avisos.some(a => a.e === 'rev@orbit.test' && a.tipo === 'vencido'));
  assert.ok(out.vencidas >= 1);
});

test('MI_MES_MAIL=off apaga el trabajo diario', async () => {
  process.env.MI_MES_MAIL = 'off';
  const out = await MM.trabajoDiario({ hoy: '2026-11-01' });
  assert.equal(out.apagado, true);
  delete process.env.MI_MES_MAIL;
});

/* ---------- endpoint ---------- */
const { makeSession } = await import('../api/_lib/auth.js');
const { addPurchase } = await import('../api/_lib/kv.js');
const { default: api } = await import('../api/mi-mes-mail.js');
const llamar = async (url, { email = 'compra@orbit.test', metodo = 'GET', body } = {}) => {
  const res = { statusCode: 200, headers: {}, cuerpo: null, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, status(c) { this.statusCode = c; return this; }, json(o) { this.cuerpo = o; return this; }, end() { return this; } };
  const req = { url, method: metodo, headers: { host: 'www.orbitando.com.ar', ...(email ? { cookie: `orbit_session=${makeSession(email)}` } : {}) }, query: Object.fromEntries(new URL(url, 'http://x').searchParams), body };
  await api(req, res);
  return res;
};

test('endpoint: sin compra no entra; conectar Gmail manda a Google con permiso de solo lectura, offline y PKCE', async () => {
  process.env.GOOGLE_CLIENT_ID = 'cliente-google'; process.env.GOOGLE_CLIENT_SECRET = 'secreto-google';
  MM.PROVEEDORES.gmail = MM.gmail;   // el real, para armar la URL
  const sin = await llamar('/api/mi-mes-mail?accion=estado', { email: 'nocompro@orbit.test' });
  assert.equal(sin.statusCode, 403);
  await addPurchase('compra@orbit.test', { productId: 'ob-019', orderId: 'OBTEST:ob-019', via: 'mercadopago', amount: 0, currency: 'ARS', date: new Date().toISOString() });
  const est = await llamar('/api/mi-mes-mail?accion=estado');
  assert.equal(est.cuerpo.ok, true); assert.equal(est.cuerpo.listo.gmail, true); assert.equal(est.cuerpo.conexion.conectado, false);
  const r = await llamar('/api/mi-mes-mail?accion=conectar&prov=gmail');
  assert.equal(r.statusCode, 302);
  const u = new URL(r.headers.location);
  assert.equal(u.host, 'accounts.google.com');
  assert.equal(u.searchParams.get('scope'), 'https://www.googleapis.com/auth/gmail.readonly');
  assert.equal(u.searchParams.get('access_type'), 'offline');
  assert.equal(u.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(u.searchParams.get('redirect_uri'), 'https://www.orbitando.com.ar/mi-mes/mail/gmail');
  /* vuelta con un state que no es de esta sesión: no guarda nada */
  const cb = await llamar('/api/mi-mes-mail?accion=callback&prov=gmail&code=x&state=falso.falso');
  assert.equal(r.statusCode, 302); assert.equal(cb.headers.location, '/herramientas/mi-mes#mail-error');
  assert.equal(await MM.leerConexion('compra@orbit.test'), null);
  /* la persona canceló en Google */
  const cancel = await llamar('/api/mi-mes-mail?accion=callback&prov=gmail&error=access_denied');
  assert.equal(cancel.headers.location, '/herramientas/mi-mes#mail-cancelado');
  MM.PROVEEDORES.gmail = falso;
});

test('endpoint: sin las credenciales o con MI_MES_MAIL=off vuelve a la app como apagado', async () => {
  MM.PROVEEDORES.gmail = MM.gmail;
  delete process.env.GOOGLE_CLIENT_SECRET;
  const r = await llamar('/api/mi-mes-mail?accion=conectar&prov=gmail');
  assert.equal(r.headers.location, '/herramientas/mi-mes#mail-apagado');
  process.env.GOOGLE_CLIENT_SECRET = 'secreto-google'; process.env.MI_MES_MAIL = 'off';
  const r2 = await llamar('/api/mi-mes-mail?accion=conectar&prov=gmail');
  assert.equal(r2.headers.location, '/herramientas/mi-mes#mail-apagado');
  delete process.env.MI_MES_MAIL;
  MM.PROVEEDORES.gmail = falso;
});
