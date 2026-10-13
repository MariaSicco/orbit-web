/* Mi Mes (ob-019): las cuentas tienen que dar exacto. Montos en centavos. */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const M = await import('../api/_herramientas/mi-mes/calculos.js');
const { resumenMes, repartirCuotas, cuotasPorMes, activoEn, numeroDeCuota, ultimoMes,
  sumarMeses, difMeses, proximoResumen, formatoPesos, leerPesos, migrar, nombreMes } = M;

const $ = pesos => Math.round(pesos * 100);
const base = () => ({
  v: 1,
  tarjetas: [{ id: 't1', nombre: 'Visa' }, { id: 't2', nombre: 'Master' }],
  ingresos: [{ id: 'i1', nombre: 'Sueldo', monto: $(1_200_000), repite: true, desde: '2026-10' }],
  gastos: [
    { id: 'g1', nombre: 'Alquiler', categoria: 'Alquiler', monto: $(450_000), repite: true, desde: '2026-10' },
    { id: 'g2', nombre: 'Netflix', categoria: 'Suscripciones', monto: $(9_000), repite: true, desde: '2026-10', hasta: '2026-12' },
  ],
  cuotas: [
    { id: 'c1', descripcion: 'Heladera', total: $(900_000), cantidad: 6, tarjetaId: 't1', primerMes: '2026-11' },
    { id: 'c2', descripcion: '', total: $(100_000), cantidad: 3, tarjetaId: 't2', primerMes: '2026-11' },
  ],
});

/* ── te quedan libres ── */
test('te quedan libres: ingresos − gastos − cuotas del mes', () => {
  const oct = resumenMes(base(), '2026-10');
  assert.equal(oct.libres, $(1_200_000 - 450_000 - 9_000));
  assert.equal(oct.totCuotas, 0);
  const nov = resumenMes(base(), '2026-11');
  assert.equal(nov.totCuotas, $(150_000 + 33_334));
  assert.equal(nov.libres, $(1_200_000 - 459_000 - 183_334));
  assert.equal(nov.libres, nov.totIngresos - nov.totGastos - nov.totCuotas);
});
test('te quedan libres: puede dar negativo y se formatea con signo menos', () => {
  const d = base();
  d.cuotas.push({ id: 'c3', total: $(3_000_000), cantidad: 1, tarjetaId: 't1', primerMes: '2026-11' });
  const nov = resumenMes(d, '2026-11');
  assert.ok(nov.libres < 0);
  assert.equal(formatoPesos(nov.libres), '−$ 2.442.334');
});

/* ── cuotas comprometidas por mes y fin ── */
test('cuotas: lo comprometido mes a mes y cuándo termina cada compra', () => {
  const serie = cuotasPorMes(base(), '2026-10', 9).map(x => x.total / 100);
  //               oct  nov            dic            ene            feb      mar      abr      may jun
  assert.deepEqual(serie, [0, 183_334, 183_333, 183_333, 150_000, 150_000, 150_000, 0, 0]);
  assert.equal(ultimoMes(base().cuotas[0]), '2027-04');
  assert.equal(ultimoMes(base().cuotas[1]), '2027-01');
});
test('cuotas: número de cuota y marca de última', () => {
  const c = base().cuotas[1];
  assert.equal(numeroDeCuota(c, '2026-10'), 0);
  assert.equal(numeroDeCuota(c, '2026-11'), 1);
  assert.equal(numeroDeCuota(c, '2027-01'), 3);
  assert.equal(numeroDeCuota(c, '2027-02'), 0);
  const ene = resumenMes(base(), '2027-01').cuotas.find(x => x.id === 'c2');
  assert.deepEqual([ene.numero, ene.ultima, ene.tarjeta], [3, true, 'Master']);
});
test('cuotas: una sola cuota cae entera en su mes', () => {
  const d = { tarjetas: [{ id: 't', nombre: 'X' }], cuotas: [{ id: 'a', total: $(50_000), cantidad: 1, tarjetaId: 't', primerMes: '2027-03' }] };
  assert.equal(resumenMes(d, '2027-03').totCuotas, $(50_000));
  assert.equal(resumenMes(d, '2027-04').totCuotas, 0);
});

/* ── redondeo ── */
test('redondeo: la suma de las cuotas da exacto el total; el resto va en la primera', () => {
  assert.deepEqual(repartirCuotas($(100_000), 3), [$(33_334), $(33_333), $(33_333)]);
  assert.deepEqual(repartirCuotas($(100), 6), [$(20), $(16), $(16), $(16), $(16), $(16)]);
  // total con centavos: se reparte a centavo
  assert.deepEqual(repartirCuotas(1_000_001, 3), [333_335, 333_333, 333_333]);
  for (const [tot, n] of [[$(89_999), 12], [$(1), 3], [1_234_567, 7], [$(1_000_000), 18], [99, 24]]) {
    const cs = repartirCuotas(tot, n);
    assert.equal(cs.length, n);
    assert.equal(cs.reduce((a, b) => a + b, 0), tot, `${tot} en ${n}`);
    assert.ok(cs.every(c => c >= 0 && Number.isInteger(c)));
    assert.ok(cs.slice(1).every(c => c === cs[1]), 'las que siguen a la primera son iguales');
  }
});
test('redondeo: en pesos enteros, las cuotas también son pesos enteros', () => {
  for (const n of [3, 6, 7, 9, 12, 18, 24]) assert.ok(repartirCuotas($(123_457), n).every(c => c % 100 === 0), String(n));
});

/* ── repetidos ── */
test('repite sin "hasta cuándo": sigue para siempre desde su mes', () => {
  const i = { monto: 1, repite: true, desde: '2026-10' };
  assert.equal(activoEn(i, '2026-09'), false);
  assert.equal(activoEn(i, '2026-10'), true);
  assert.equal(activoEn(i, '2031-05'), true);
});
test('repite con "hasta cuándo": incluye el último mes y después no', () => {
  const g = base().gastos[1];
  assert.equal(activoEn(g, '2026-12'), true);
  assert.equal(activoEn(g, '2027-01'), false);
  assert.equal(resumenMes(base(), '2027-01').totGastos, $(450_000));
});
test('no repite: cuenta solo en su mes', () => {
  const d = base();
  d.ingresos.push({ id: 'i2', nombre: 'Aguinaldo', monto: $(600_000), repite: false, desde: '2026-12' });
  assert.equal(resumenMes(d, '2026-11').totIngresos, $(1_200_000));
  assert.equal(resumenMes(d, '2026-12').totIngresos, $(1_800_000));
  assert.equal(resumenMes(d, '2027-01').totIngresos, $(1_200_000));
});

/* ── cambio de año ── */
test('cambio de año: meses y cuotas cruzan diciembre → enero', () => {
  assert.equal(sumarMeses('2026-12', 1), '2027-01');
  assert.equal(sumarMeses('2026-11', 14), '2028-01');
  assert.equal(sumarMeses('2027-01', -1), '2026-12');
  assert.equal(difMeses('2026-11', '2027-02'), 3);
  assert.equal(proximoResumen(new Date(2026, 11, 20)), '2027-01');
  assert.equal(proximoResumen(new Date(2026, 9, 13)), '2026-11');
  const d = { tarjetas: [{ id: 't', nombre: 'X' }], cuotas: [{ id: 'a', total: $(120_000), cantidad: 4, tarjetaId: 't', primerMes: '2026-12' }] };
  assert.deepEqual(cuotasPorMes(d, '2026-11', 6).map(x => [x.mes, x.total / 100]),
    [['2026-11', 0], ['2026-12', 30_000], ['2027-01', 30_000], ['2027-02', 30_000], ['2027-03', 30_000], ['2027-04', 0]]);
  assert.equal(nombreMes('2027-01'), 'enero 2027');
});

/* ── meses sin datos ── */
test('meses sin datos: todo en cero y marcado como vacío', () => {
  for (const d of [undefined, {}, M.datosVacios(), base()]) {
    const r = resumenMes(d, '2020-01');
    assert.deepEqual([r.totIngresos, r.totGastos, r.totCuotas, r.libres, r.vacio], [0, 0, 0, 0, true]);
  }
  assert.equal(resumenMes(base(), '2026-10').vacio, false);
});

/* ── formato y lectura de montos ── */
test('formato: $ 1.234.567 y sin "−$ 0"', () => {
  assert.equal(formatoPesos($(1_234_567)), '$ 1.234.567');
  assert.equal(formatoPesos(0), '$ 0');
  assert.equal(formatoPesos(-20), '$ 0');
  assert.equal(formatoPesos($(999)), '$ 999');
  assert.equal(formatoPesos(123_456, { centavos: true }), '$ 1.234,56');
  assert.equal(formatoPesos($(1_000), { centavos: true }), '$ 1.000');
  assert.equal(formatoPesos($(500), { signo: true }), '+$ 500');
});
test('lectura: acepta cómo escribe la gente en Argentina', () => {
  const casos = { '1.234.567': $(1_234_567), '1234567': $(1_234_567), '$ 12.000': $(12_000), '1234,50': 123_450,
    '1.234,5': 123_450, '45.000': $(45_000), '0,99': 99, '900.000': $(900_000) };
  for (const [t, c] of Object.entries(casos)) assert.equal(leerPesos(t), c, t);
  // el punto es solo de miles: "900.00" (un 0 borrado de 900.000) no puede pasar por $ 900
  for (const malo of ['', 'abc', '1,2,3', '1.2.3,4,5', '12,345', '-500', '1.23.4', '900.00', '1234.50', '12.3456']) assert.equal(leerPesos(malo), null, malo);
});

/* ── esquema ── */
test('migrar: limpia lo inválido y deja la versión de esquema', () => {
  const d = migrar({
    tarjetas: [{ id: 't1', nombre: ' Visa ' }, { id: 't2' }],
    ingresos: [{ id: 'a', monto: 100, repite: true, desde: '2026-10' }, { id: 'b', monto: -1, desde: '2026-10' }],
    gastos: [{ id: 'g', monto: 100, repite: true, desde: '2026-10', hasta: 'nunca', categoria: 'Raro' }],
    cuotas: [{ id: 'c', total: 300, cantidad: 3, tarjetaId: 't1', primerMes: '2026-11' },
      { id: 'd', total: 300, cantidad: 3, tarjetaId: 'no-existe', primerMes: '2026-11' },
      { id: 'e', total: 300, cantidad: 0, tarjetaId: 't1', primerMes: '2026-11' }],
  });
  assert.equal(d.v, M.ESQUEMA);
  assert.deepEqual(d.tarjetas, [{ id: 't1', nombre: 'Visa' }]);
  assert.deepEqual(d.ingresos.map(i => [i.id, i.nombre]), [['a', 'Ingreso']]);
  assert.deepEqual([d.gastos[0].categoria, d.gastos[0].hasta], ['Otros', undefined]);
  assert.deepEqual(d.cuotas.map(c => c.id), ['c']);
  assert.deepEqual(migrar('basura'), M.datosVacios());
  assert.deepEqual(migrar(base()), base());
});

/* ── entrega: la herramienta pasa por el control de compra ── */
test('catálogo y acceso: ob-019 es herramienta, no se compra todavía y sin sesión no entra', async () => {
  for (const k of ['KV_REST_API_URL', 'KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'VERCEL_ENV']) delete process.env[k];
  process.env.SESSION_SECRET = 'secreto-de-prueba-0123456789';
  process.env.ADMIN_EMAILS = 'admin@orbit.test';
  const { getCatalog } = await import('../api/_lib/catalog.js');
  const { productoPorSlug } = await import('../api/_lib/herramientas.js');
  const { makeSession } = await import('../api/_lib/auth.js');
  const { default: herramienta } = await import('../api/herramienta.js');
  const CAT = await getCatalog();
  assert.equal(CAT['ob-019'].herramienta, '/herramientas/mi-mes');
  assert.equal(CAT['ob-019'].soon, true);
  assert.equal(productoPorSlug(CAT, 'mi-mes').id, 'ob-019');
  const res = () => { const r = { code: 200, headers: {} }; r.status = c => { r.code = c; return r; }; r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; }; r.send = b => { r.body = b; return r; }; r.redirect = (c, u) => { r.code = c; r.location = u; return r; }; return r; };
  const sin = res();
  await herramienta({ headers: {}, query: { slug: 'mi-mes', path: 'calculos.js' } }, sin);
  assert.deepEqual([sin.code, sin.location], [302, '/acceso']);
  const admin = { headers: { cookie: `orbit_session=${makeSession('admin@orbit.test')}` } };
  const pag = res();
  await herramienta({ ...admin, query: { slug: 'mi-mes' } }, pag);
  assert.equal(pag.code, 200);
  assert.match(String(pag.body), /Te quedan <span class="it">libres/);
  for (const f of ['app.js', 'calculos.js', 'mi-mes.css']) {
    const r = res();
    await herramienta({ ...admin, query: { slug: 'mi-mes', path: f } }, r);
    assert.equal(r.code, 200, f);
  }
});
