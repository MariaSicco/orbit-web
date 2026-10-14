/* Vencimientos · casa compartida: crear, invitar, unirse, guardar con conflicto, fusionar y salir. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';

for (const k of ['KV_REST_API_URL', 'KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'VERCEL_ENV']) delete process.env[k];
process.env.SESSION_SECRET = 'secreto-de-prueba-0123456789';
process.env.ADMIN_EMAILS = 'admin@orbit.test';

const { makeSession } = await import('../api/_lib/auth.js');
const { addPurchase } = await import('../api/_lib/kv.js');
const { accesoHerramienta } = await import('../api/_lib/herramienta-acceso.js');
const api = await import('../api/vencimientos-casa.js');
const V = await import('../api/_herramientas/vencimientos/calculos.js');

await addPurchase('majo@orbit.test', { productId: 'ob-021', orderId: 'OBTEST:ob-021', via: 'mercadopago', amount: 0, currency: 'ARS', date: new Date().toISOString() });

const pedido = (email, { metodo = 'POST', cuerpo = null, query = {} } = {}) => {
  const r = Readable.from(cuerpo ? [Buffer.from(JSON.stringify(cuerpo))] : []);
  r.method = metodo; r.query = query;
  r.headers = { ...(email ? { cookie: `orbit_session=${makeSession(email)}` } : {}), host: 'orbit.test', 'content-type': 'application/json' };
  return r;
};
function respuesta() {
  const r = { code: 200, headers: {}, body: null, location: null };
  r.status = c => { r.code = c; return r; };
  r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; };
  r.json = b => { r.body = b; return r; };
  r.send = b => { r.body = b; return r; };
  r.redirect = (c, u) => { r.code = c; r.location = u; return r; };
  return r;
}
const llamar = async req => { const res = respuesta(); await api.default(req, res); return res; };
const post = (email, cuerpo) => llamar(pedido(email, { cuerpo }));

const doc = () => { const d = V.estadoVacio(); d.cuentas = [{ id: 'luz', nombre: 'Edenor', categoria: 'Luz, gas y agua', frecuencia: 1, primerVto: '2026-10-20', monto: 4480000 }]; return d; };

test('casa compartida: de punta a punta', async () => {
  // sin compra no se crea
  assert.equal((await post('pareja@orbit.test', { accion: 'crear', doc: doc() })).code, 403);
  // quien compró la crea
  const c = await post('majo@orbit.test', { accion: 'crear', doc: doc(), nombre: 'Majo' });
  assert.equal(c.code, 200);
  assert.equal(c.body.casa.soyDueno, true);
  assert.equal(c.body.casa.miembros[0].nombre, 'Majo');
  // invita
  const inv = await post('majo@orbit.test', { accion: 'invitar' });
  const token = new URL(inv.body.link).searchParams.get('unirse');
  assert.ok(token);
  // sin sesión: página para entrar
  const sinSesion = await llamar(pedido(null, { metodo: 'GET', query: { unirse: token } }));
  assert.match(String(sinSesion.body), /Te invitaron a una casa/);
  // con sesión se une, recibe acceso sin comprar y vuelve a la app
  const une = await llamar(pedido('pareja@orbit.test', { metodo: 'GET', query: { unirse: token } }));
  assert.equal(une.location, '/herramientas/vencimientos#casa-unida');
  const acc = await accesoHerramienta(pedido('pareja@orbit.test', { metodo: 'GET' }), 'ob-021');
  assert.equal(acc.ok, true);
  assert.equal(acc.invitado, true);
  // el link es de un solo uso
  const otra = await llamar(pedido('otro@orbit.test', { metodo: 'GET', query: { unirse: token } }));
  assert.equal(otra.location, '/herramientas/vencimientos#casa-vencida');
  // la pareja ve la casa
  const g = await llamar(pedido('pareja@orbit.test', { metodo: 'GET' }));
  assert.equal(g.body.casa.miembros.length, 2);
  assert.equal(g.body.casa.doc.cuentas[0].nombre, 'Edenor');
  // guardar: el primero gana, el segundo recibe 409 con la versión nueva
  const rev = g.body.casa.rev;
  let d1 = V.marcarPagado(g.body.casa.doc, 'luz', '2026-10-20', { monto: 4480000, fecha: '2026-10-19', por: 'Pareja' });
  assert.equal((await post('pareja@orbit.test', { accion: 'guardar', doc: d1, rev })).code, 200);
  const d2 = V.guardarCuenta(c.body.casa.doc, { id: 'exp', nombre: 'Expensas', categoria: 'Casa', frecuencia: 1, primerVto: '2026-11-10', monto: 18500000 });
  const choque = await post('majo@orbit.test', { accion: 'guardar', doc: d2, rev });
  assert.equal(choque.code, 409);
  // fusionar conserva las dos cosas: el pago de la pareja y la cuenta nueva de Majo
  const junto = V.fusionar(d2, choque.body.casa.doc);
  assert.equal(junto.cuentas.length, 2);
  assert.equal(junto.pagos.luz['2026-10-20'].por, 'Pareja');
  assert.equal((await post('majo@orbit.test', { accion: 'guardar', doc: junto, rev: choque.body.casa.rev })).code, 200);
  // la pareja sale: pierde el acceso
  assert.equal((await post('pareja@orbit.test', { accion: 'salir' })).code, 200);
  assert.equal((await accesoHerramienta(pedido('pareja@orbit.test', { metodo: 'GET' }), 'ob-021')).ok, false);
  // quien creó la casa la cierra
  assert.equal((await post('majo@orbit.test', { accion: 'salir' })).code, 200);
  assert.equal((await llamar(pedido('majo@orbit.test', { metodo: 'GET' }))).body.casa, null);
});

test('fusionar: lo borrado no vuelve y gana la edición más reciente', () => {
  let a = doc(), b = doc();
  a = V.guardarCuenta(a, { ...a.cuentas[0], monto: 5000000 });
  b = V.borrarCuenta(b, 'luz');
  assert.equal(V.fusionar(a, b).cuentas.length, 0);
  let x = doc(), y = doc();
  x = V.guardarCuenta(x, { ...x.cuentas[0], nombre: 'Luz' });
  y = JSON.parse(JSON.stringify(x)); y.cuentas[0] = { ...y.cuentas[0], nombre: 'Edenor viejo', editada: '2000-01-01T00:00:00Z' };
  assert.equal(V.fusionar(y, x).cuentas[0].nombre, 'Luz');
});
