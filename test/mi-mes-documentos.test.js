/* Mi Mes · "Subí lo que tengas": clasificación, mapeo, transferencias propias, duplicados y privacidad.
   Todos los documentos son INVENTADOS (test/fixtures/mi-mes/doc-*.json). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Readable } from 'node:stream';

for (const k of ['KV_REST_API_URL', 'KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'VERCEL_ENV', 'ANTHROPIC_API_KEY']) delete process.env[k];
process.env.SESSION_SECRET = 'secreto-de-prueba-0123456789';
const M = await import('../api/_herramientas/mi-mes/calculos.js');
const D = await import('../api/_herramientas/mi-mes/documentos.js');
const F = await import('../api/_herramientas/vencimientos/factura.js');
const fx = n => JSON.parse(readFileSync(new URL(`./fixtures/mi-mes/${n}.json`, import.meta.url), 'utf8'));
const $ = p => Math.round(p * 100);
let k = 0; const nuevoId = () => `n${k++}`;
const base = () => {
  const d = M.datosVacios();
  d.tarjetas.push({ id: 'v', nombre: 'Visa', red: 'Visa', banco: '', ultimos4: '', color: 'azul', diaCierre: 28, diaVence: 8 });
  return d;
};

test('clasificación: recibo → solo neto, fecha, período y clase; nunca CUIL, empleador, legajo ni bruto', () => {
  const v = D.validarClasificacion(fx('doc-recibo'));
  assert.equal(v.ok, true);
  assert.deepEqual(v.lectura.recibo, { neto: 145_032_055, moneda: 'ARS', fechaPago: '2026-10-05', periodo: '2026-09', clase: 'mensual' });
  const todo = JSON.stringify(v.lectura);
  assert.doesNotMatch(todo, /cuil|empleador|legajo|bruto|INVENTADA SA|20-?12345678|4521/i, 'ni en los avisos');
  // y tampoco después de guardar
  const items = D.itemsDeRecibo(v.lectura.recibo, base(), { archivo: 'a' });
  const g = D.aplicarItems(base(), items, { nuevoId, hoy: '2026-10-15' }).datos;
  assert.doesNotMatch(JSON.stringify(g), /cuil|empleador|legajo|bruto|4521/i);
});
test('recibo → ingreso Sueldo con su día de cobro; aguinaldo de un solo mes', () => {
  const r = D.validarClasificacion(fx('doc-recibo')).lectura.recibo;
  const [it] = D.itemsDeRecibo(r, base(), { archivo: 'a' });
  assert.deepEqual(it.ingreso, { nombre: 'Sueldo', monto: $(1_450_320.55), repite: true, desde: '2026-10', cobro: { tipo: 'dia', dia: 5 }, doc: { fecha: '2026-10-05' } });
  const [ag] = D.itemsDeRecibo({ ...r, clase: 'aguinaldo', fechaPago: '2026-12-18' }, base(), { archivo: 'b' });
  assert.deepEqual([ag.ingreso.nombre, ag.ingreso.repite, ag.ingreso.desde, ag.ingreso.cobro], ['Aguinaldo', false, '2026-12', undefined]);
});
test('factura (lector de Vencimientos) → gasto fijo con monto, día, frecuencia y categoría', () => {
  const p = F.propuestaDesde(fx('doc-factura-gas'), '2026-10-15');
  const [it] = D.itemsDeFactura(p, base(), { archivo: 'f' });
  assert.deepEqual(it.gasto, { nombre: 'Metrogas', categoria: 'Servicios', monto: $(38_450), repite: true, desde: '2026-10', frecuencia: 2, dia: 20, doc: { fecha: '2026-10-20' } });
  const d = D.aplicarItems(base(), [it], { nuevoId, hoy: '2026-10-15' }).datos;
  // bimestral: octubre sí, noviembre no, diciembre sí
  assert.deepEqual(['2026-10', '2026-11', '2026-12'].map(m => M.resumenMes(d, m).totGastos), [$(38_450), 0, $(38_450)]);
  assert.equal(M.migrar(d).gastos[0].frecuencia, 2);
  assert.equal(D.categoriaDeFactura({ preset: 'expensas', categoria: 'Casa', nombre: 'Expensas' }), 'Expensas');
  assert.equal(D.categoriaDeFactura({ preset: null, categoria: 'Casa', nombre: 'Alquiler depto' }), 'Alquiler');
});
test('captura de tarjeta → compras nuevas (sin pagos ni números de operación)', () => {
  const c = D.validarClasificacion(fx('doc-captura-tarjeta')).lectura.captura;
  const items = D.itemsDeCaptura(c, base(), '2026-10-15', { archivo: 'c', tarjetaId: 'v' });
  assert.deepEqual(items.map(i => [i.grupo, i.titulo, i.monto]), [['compras', 'FARMACIA INVENTADA SUC 12', $(32_500)], ['compras', 'ZAPATILLERIA INVENTADA Op', $(135_000)]]);
  const d = D.aplicarItems(base(), items, { nuevoId, hoy: '2026-10-15' }).datos;
  assert.deepEqual(d.cuotas.map(q => [q.cantidad, q.origen, q.tarjetaId]), [[1, 'manual', 'v'], [3, 'manual', 'v']]);
  assert.doesNotMatch(JSON.stringify(d), /0012345678/);
});
test('captura de cuenta: solo el saldo de hoy; transferencias propias, sueldo y pagos NO son ingreso ni gasto', () => {
  const c = D.validarClasificacion(fx('doc-captura-cuenta')).lectura.captura;
  assert.doesNotMatch(JSON.stringify(c), /0170000000000000000001/, 'sin CBU');
  const items = D.itemsDeCaptura(c, base(), '2026-10-15', { archivo: 'h' });
  assert.deepEqual(items.map(i => [i.grupo, i.monto]), [['saldo', $(412_300.5)]]);
  const antes = base(), d = D.aplicarItems(antes, items, { nuevoId, hoy: '2026-10-15' }).datos;
  const a = M.resumenMes(antes, '2026-10'), b = M.resumenMes(d, '2026-10');
  assert.deepEqual([b.totIngresos, b.totGastos, b.totTarjetas], [a.totIngresos, a.totGastos, a.totTarjetas]);
  assert.equal(d.cuentas[0].saldo, $(412_300.5));
});
test('duplicados: la misma factura actualiza el gasto (y qué cambió lo explica); el mismo recibo queda igual', () => {
  const p = F.propuestaDesde(fx('doc-factura-gas'), '2026-10-15');
  const d1 = D.aplicarItems(base(), D.itemsDeFactura(p, base(), { archivo: 'f' }), { nuevoId, hoy: '2026-10-15' }).datos;
  const foto = M.fotoProyeccion(d1, '2026-10');
  const p2 = F.propuestaDesde({ ...fx('doc-factura-gas'), vencimientos: [{ fecha: '2026-10-20', monto: 41_000 }] }, '2026-10-15');
  const [it] = D.itemsDeFactura(p2, d1, { archivo: 'f2' });
  assert.deepEqual([it.accion, it.antes, it.monto], ['actualizar', $(38_450), $(41_000)]);
  const d2 = D.aplicarItems(d1, [it], { nuevoId, hoy: '2026-10-15' }).datos;
  assert.equal(d2.gastos.length, 1, 'no duplica');
  assert.match(M.cambiosDesde(foto, d2)[0].texto, /\$ 2\.550 de Metrogas/);
  const r = D.validarClasificacion(fx('doc-recibo')).lectura.recibo;
  const d3 = D.aplicarItems(base(), D.itemsDeRecibo(r, base(), { archivo: 'a' }), { nuevoId, hoy: '2026-10-15' }).datos;
  const [otra] = D.itemsDeRecibo(r, d3, { archivo: 'a2' });
  assert.equal(otra.accion, 'igual');
  assert.equal(D.aplicarItems(d3, [otra], { nuevoId, hoy: '2026-10-15' }).datos.ingresos.length, 1);
  // la misma captura dos veces no duplica la compra
  const c = D.validarClasificacion(fx('doc-captura-tarjeta')).lectura.captura;
  const d4 = D.aplicarItems(base(), D.itemsDeCaptura(c, base(), '2026-10-15', { archivo: 'c', tarjetaId: 'v' }), { nuevoId, hoy: '2026-10-15' }).datos;
  assert.deepEqual(D.itemsDeCaptura(c, d4, '2026-10-15', { archivo: 'c2', tarjetaId: 'v' }).map(i => i.accion), ['igual', 'igual']);
});
test('documentos ya subidos: se guarda solo la huella y el tipo, nunca el contenido', async () => {
  const h = await D.huella(new TextEncoder().encode('archivo inventado'));
  assert.match(h, /^[0-9a-f]{32}$/);
  const m = M.migrar({ v: 4, documentos: [{ huella: h, tipo: 'recibo', fecha: '2026-10-15', contenido: 'no' }, { huella: 'x' }] });
  assert.deepEqual(m.documentos, [{ huella: h, tipo: 'recibo', fecha: '2026-10-15' }]);
  assert.ok(D.yaSubido(m, h));
});
test('[QA final · 8] mismo comercio con monto fuera del ±15 %: pregunta; una palabra genérica no alcanza', () => {
  const d = base();
  d.ingresos.push({ id: 'i', nombre: 'Sueldo', monto: $(1_000_000), repite: true, desde: '2026-01' });
  d.gastos.push({ id: 'g', nombre: 'Internet Fibra', categoria: 'Servicios', monto: $(30_000), repite: true, desde: '2026-01' },
    { id: 's', nombre: 'Seguro del auto', categoria: 'Seguros', monto: $(50_000), repite: true, desde: '2026-01' });
  d.resumenes.push({ id: 'r', tarjetaId: 'v', mes: '2026-11', cierre: '2026-10-28', vencimiento: '2026-11-08', totales: { ARS: $(100_000) }, cargos: [], pagosYCreditos: [],
    consumos: [{ fecha: '2026-10-10', comercio: 'FIBRA HOGAR SA', monto: $(60_000), moneda: 'ARS', rubro: 'Servicios', cuota: null },
      { fecha: '2026-10-10', comercio: 'SEGURO CELULAR XYZ', monto: $(50_000), moneda: 'ARS', rubro: 'Otros', cuota: null }] });
  const m = M.migrar(d);
  const nov = M.resumenMes(m, '2026-11');
  assert.equal(nov.gastosTarjeta.length, 0, 'ni Internet (monto distinto) ni el seguro (solo "seguro" en común) se asumen');
  assert.equal(nov.totGastos, $(80_000));
  const p = M.preguntas(m, '2026-11-02');
  const q = [...p.ahora, ...p.masTarde].filter(x => x.tipo === 'gastoTarjeta');
  assert.deepEqual(q.map(x => x.gastoId), ['g']);
  assert.match(q[0].titulo, /¿Internet Fibra se paga con tu Visa\?/);
});

/* ── el endpoint, en modo prueba y con un clasificador falso ── */
const { makeSession } = await import('../api/_lib/auth.js');
const { addPurchase } = await import('../api/_lib/kv.js');
const api = await import('../api/mi-mes-leer.js');
await addPurchase('docs@orbit.test', { productId: 'ob-019', orderId: 'OBTEST:ob-019d', via: 'mercadopago', amount: 0, currency: 'ARS', date: new Date().toISOString() });
const PNG = n => Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), Buffer.from(`imagen inventada ${n}`)]);
const pedido = (cuerpo, url = '/api/mi-mes-leer') => {
  const r = Readable.from([cuerpo]);
  r.method = 'POST'; r.url = url;
  r.headers = { cookie: `orbit_session=${makeSession('docs@orbit.test')}`, 'content-length': String(cuerpo.length) };
  return r;
};
const respuesta = () => { const r = { code: 200, headers: {}, body: null }; r.status = c => { r.code = c; return r; }; r.setHeader = (a, b) => { r.headers[a] = b; }; r.json = b => { r.body = b; return r; }; return r; };
const llamar = async req => { const res = respuesta(); await api.default(req, res); return res; };

test('endpoint (prueba): clasifica por el nombre, pide el segundo paso para resúmenes y facturas', async () => {
  const r1 = await llamar(pedido(PNG(1), '/api/mi-mes-leer?nombre=recibo-octubre.png'));
  assert.deepEqual([r1.code, r1.body.tipo, r1.body.siguiente], [200, 'recibo', false]);
  const r2 = await llamar(pedido(PNG(2), '/api/mi-mes-leer?nombre=resumen-visa.pdf'));
  assert.deepEqual([r2.body.tipo, r2.body.siguiente], ['resumen', true]);
  const r3 = await llamar(pedido(PNG(2), '/api/mi-mes-leer?tipo=resumen'));
  assert.deepEqual([r3.body.tipo, typeof r3.body.lectura.vencimiento], ['resumen', 'string']);
  const r4 = await llamar(pedido(PNG(3), '/api/mi-mes-leer?tipo=factura'));
  assert.equal(r4.body.tipo, 'factura');
  assert.equal((await llamar(pedido(Buffer.from('no soy nada conocido, ni pdf ni foto')))).code, 415);
  assert.equal((await llamar(pedido(PNG(5), '/api/mi-mes-leer?tipo=raro'))).code, 400);
});
test('endpoint: el tope diario cuenta archivos distintos (el segundo paso del mismo no cuenta)', async () => {
  const email = 'tope@orbit.test';
  for (let i = 0; i < 3; i++) assert.equal((await api.contarArchivo(email, `h${i}`, { tope: 3 })).ok, true);
  assert.equal((await api.contarArchivo(email, 'h1', { tope: 3 })).ok, true, 'el mismo archivo otra vez');
  assert.equal((await api.contarArchivo(email, 'h9', { tope: 3 })).ok, false, 'uno nuevo pasa el tope');
});
test('endpoint (real, cliente falso): Haiku clasifica y el log lleva tokens por tipo, sin datos', async () => {
  process.env.ANTHROPIC_API_KEY = 'falsa';
  const docs = await import('../api/_lib/mi-mes-documentos.js');
  docs.__usarCliente({ messages: { create: async () => ({ model: 'claude-haiku-5-5', stop_reason: 'end_turn', usage: { input_tokens: 1800, output_tokens: 120 },
    content: [{ type: 'text', text: JSON.stringify(fx('doc-recibo')) }] }) } });
  const logs = [];
  const orig = console.log; console.log = s => logs.push(s);
  try {
    const r = await llamar(pedido(PNG(7)));
    assert.deepEqual([r.code, r.body.modo, r.body.tipo, r.body.lectura.recibo.neto], [200, 'real', 'recibo', 145_032_055]);
    assert.doesNotMatch(JSON.stringify(r.body), /cuil|empleador|legajo/i);
  } finally { console.log = orig; delete process.env.ANTHROPIC_API_KEY; }
  const l = JSON.parse(logs.find(x => x.includes('mi-mes-leer')));
  assert.deepEqual([l.tipoDoc, l.modelo, l.entrada, l.salida], ['recibo', 'claude-haiku-5-5', 1800, 120]);
  assert.doesNotMatch(logs.join(' '), /1450320|INVENTADA|recibo-octubre/);
  assert.equal(docs.MODELO_CLASIFICAR, 'claude-haiku-5-5');
});


/* ── Etapa 1: el historial arma el sistema ── */
const facturaEdenor = (vence, monto) => F.propuestaDesde({ empresa: 'Edenor', servicio: 'edenor', categoria: 'Luz, gas y agua', periodo: { desde: null, hasta: null },
  vencimientos: [{ fecha: vence, monto }], moneda: 'ARS', frecuencia: 1, cuota: null, debitoAutomatico: false, proximoVencimiento: null, confianza: 'alta', dudas: [], avisos: [] }, '2026-10-15');
const lecturaResumen = (venc, consumos) => M.validarLectura({ ...fx('simple'), tarjetas: [], vencimiento: venc, cierre: null, proximoCierre: null, proximoVencimiento: null, cuotasAVencer: [],
  pagosYCreditos: [], cargos: [], saldoAnterior: [], consumos, totales: [{ moneda: 'ARS', monto: consumos.reduce((a, c) => a + c.monto, 0) }] }).lectura;
test('[etapa 1] 3 facturas de Edenor → 1 gasto fijo con el monto de la más nueva, estimado de meses anteriores', () => {
  const lecturas = [['ago', '2026-08-18', 40_000], ['sep', '2026-09-18', 44_000], ['jul', '2026-07-18', 38_000]].map(([a, v, m]) => ({ archivo: a, tipo: 'factura', lectura: facturaEdenor(v, m) }));
  const items = D.consolidar(lecturas, base(), '2026-10-15');
  const vivos = items.filter(i => i.accion !== 'viejo');
  assert.equal(vivos.length, 1);
  assert.deepEqual([vivos[0].titulo, vivos[0].monto, vivos[0].estimado, vivos[0].promedio], ['Edenor', $(44_000), true, 4_066_667]);
  assert.match(vivos[0].detalle, /estimado de 3 facturas anteriores/);
  assert.equal(items.filter(i => i.accion === 'viejo').length, 2);
  const d = D.aplicarItems(base(), items, { nuevoId, hoy: '2026-10-15' }).datos;
  assert.equal(d.gastos.length, 1);
  assert.deepEqual(d.gastos[0].doc, { fecha: '2026-09-18', estimado: true });
  assert.equal(M.resumenMes(d, '2026-10').totGastos, $(44_000), 'cuenta en el mes actual como estimado');
  assert.deepEqual(D.estimadosViejos(d, '2026-10-15').map(x => x.nombre), ['Edenor']);
});
test('[etapa 1] la misma suscripción en 2 resúmenes → 1 gasto con esa tarjeta, contado una sola vez', () => {
  const nf = m => ({ fecha: m, comercio: 'NETFLIX.COM', monto: 9_000, moneda: 'ARS', rubro: 'Suscripciones', cuota: null, tarjeta: null });
  const lecturas = [{ archivo: 'r1', tipo: 'resumen', lectura: lecturaResumen('2026-09-08', [nf('2026-08-15')]) },
    { archivo: 'r2', tipo: 'resumen', lectura: lecturaResumen('2026-10-08', [nf('2026-09-15'), { fecha: '2026-09-20', comercio: 'SUPER', monto: 50_000, moneda: 'ARS', rubro: 'Supermercado', cuota: null, tarjeta: null }]) }];
  const items = D.consolidar(lecturas, M.datosVacios(), '2026-10-15');
  const subs = items.filter(i => i.id.startsWith('subs:'));
  assert.deepEqual(subs.map(i => [i.titulo, i.monto, i.tarjetaClave]), [['Netflix', $(9_000), '1111']]);
  const d = D.aplicarItems(M.datosVacios(), items, { nuevoId, hoy: '2026-10-15' }).datos;
  assert.equal(d.tarjetas.length, 1);
  assert.equal(d.resumenes.length, 2);
  const g = d.gastos.find(x => x.nombre === 'Netflix');
  assert.equal(g.tarjetaId, d.tarjetas[0].id, 'gasto con tarjeta');
  // octubre: adentro del resumen (no aparte); diciembre: una vez como gasto de la tarjeta
  assert.equal(M.resumenMes(d, '2026-10').totGastos, 0);
  assert.equal(M.resumenMes(d, '2026-12').totTarjetas, $(9_000));
});
test('[etapa 1] lo viejo no pisa a lo nuevo: recibo, factura y límites de la tarjeta', () => {
  const r = D.validarClasificacion(fx('doc-recibo')).lectura.recibo;
  const viejo = { ...r, neto: 120_000_000, fechaPago: '2026-08-05', periodo: '2026-07' };
  const items = D.consolidar([{ archivo: 'a', tipo: 'recibo', lectura: { recibo: viejo } }, { archivo: 'b', tipo: 'recibo', lectura: { recibo: r } }], base(), '2026-10-15');
  assert.deepEqual(items.map(i => [i.archivo, i.accion]), [['b', 'nuevo'], ['a', 'viejo']]);
  // ya cargado el nuevo, subir después el viejo no lo pisa
  const d = D.aplicarItems(base(), items, { nuevoId, hoy: '2026-10-15' }).datos;
  const [otra] = D.itemsDeRecibo(viejo, d, { archivo: 'c' });
  assert.equal(otra.accion, 'viejo');
  assert.equal(D.aplicarItems(d, [otra], { nuevoId, hoy: '2026-10-15' }).datos.ingresos[0].monto, r.neto);
  // factura vieja después de la nueva
  const d2 = D.aplicarItems(base(), D.itemsDeFactura(facturaEdenor('2026-10-18', 50_000), base(), { archivo: 'n', hoy: '2026-10-15' }), { nuevoId, hoy: '2026-10-15' }).datos;
  const [fv] = D.itemsDeFactura(facturaEdenor('2026-08-18', 40_000), d2, { archivo: 'v', hoy: '2026-10-15' });
  assert.equal(fv.accion, 'viejo');
  // resumen viejo importado después del nuevo: no pisa el límite
  const l1 = lecturaResumen('2026-10-08', []); l1.limites = { compra: $(900_000), financiacion: null };
  const l0 = lecturaResumen('2026-08-08', []); l0.limites = { compra: $(500_000), financiacion: null };
  const d3 = D.aplicarItems(M.datosVacios(), [{ grupo: 'tarjetas', lectura: l1 }], { nuevoId, hoy: '2026-10-15' }).datos;
  const d4 = D.aplicarItems(d3, [{ grupo: 'tarjetas', lectura: l0 }], { nuevoId, hoy: '2026-10-15' }).datos;
  assert.equal(d4.tarjetas[0].limite, $(900_000));
  assert.equal(d4.resumenes.length, 2);
});
test('[etapas] el orden: 1 sin datos; 2 con estimados pendientes desde la 2.ª visita; 3 (mail) después, nunca al entrar', () => {
  assert.equal(D.etapaPrimerUso(M.datosVacios(), { visitas: 1 }), 1);
  const d = base(); d.gastos.push({ id: 'g', nombre: 'Luz', categoria: 'Servicios', monto: 1, repite: true, desde: '2026-09' });
  assert.equal(D.etapaPrimerUso(d, { visitas: 1, pendientes: 2 }), 0, 'en la primera visita no se invita a nada más');
  assert.equal(D.etapaPrimerUso(d, { visitas: 2, pendientes: 2 }), 2);
  assert.equal(D.etapaPrimerUso(d, { visitas: 2, pendientes: 0 }), 3, 'mes al día: recién ahí el mail');
  assert.equal(D.etapaPrimerUso(d, { visitas: 3, pendientes: 1 }), 2, 'lo actual primero');
  assert.equal(D.etapaPrimerUso(d, { visitas: 4, pendientes: 0, mailConectado: true }), 0);
});
