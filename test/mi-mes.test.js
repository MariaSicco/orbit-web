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
test('migrar v1 → v2: limpia lo inválido, suma moneda, red y color, y deja la versión', () => {
  const d = migrar({
    v: 1,
    tarjetas: [{ id: 't1', nombre: ' Visa ' }, { id: 't2' }],
    ingresos: [{ id: 'a', monto: 100, repite: true, desde: '2026-10' }, { id: 'b', monto: -1, desde: '2026-10' }],
    gastos: [{ id: 'g', monto: 100, repite: true, desde: '2026-10', hasta: 'nunca', categoria: 'Raro' }],
    cuotas: [{ id: 'c', total: 300, cantidad: 3, tarjetaId: 't1', primerMes: '2026-11' },
      { id: 'd', total: 300, cantidad: 3, tarjetaId: 'no-existe', primerMes: '2026-11' },
      { id: 'e', total: 300, cantidad: 0, tarjetaId: 't1', primerMes: '2026-11' }],
  });
  assert.equal(d.v, M.ESQUEMA);
  assert.equal(M.ESQUEMA, 3);
  assert.deepEqual([d.limiteCuotas, d.alertasVistas, d.supuestos], [30, [], {}]);
  assert.deepEqual(d.tarjetas, [{ id: 't1', nombre: 'Visa', red: 'Otra', banco: '', ultimos4: '', color: 'azul' }]);
  assert.deepEqual(d.ingresos.map(i => [i.id, i.nombre]), [['a', 'Ingreso']]);
  assert.deepEqual([d.gastos[0].categoria, d.gastos[0].hasta], ['Otros', undefined]);
  assert.deepEqual(d.cuotas.map(c => [c.id, c.moneda]), [['c', 'ARS']]);
  assert.deepEqual([d.resumenes, d.cambio, d.rubrosComercio], [[], {}, {}]);
  assert.deepEqual(migrar('basura'), M.datosVacios());
  const v2 = migrar(base());
  assert.deepEqual(migrar(JSON.parse(JSON.stringify(v2))), v2, 'migrar es idempotente');
  assert.deepEqual(resumenMes(v2, '2026-11').libres, resumenMes(base(), '2026-11').libres, 'las cuentas no cambian al migrar');
});

/* ── moneda extranjera ── */
const conUSD = () => {
  const d = migrar(base());
  d.cambio = { USD: { valor: $(2_000), fuente: 'prueba', fecha: '2026-10-13' } };
  d.cuotas.push({ id: 'u1', descripcion: 'Notebook', total: $(1_200), moneda: 'USD', cantidad: 6, tarjetaId: 't1', primerMes: '2026-11' });
  return d;
};
test('moneda: convierte con el tipo de cambio y entra en "te quedan libres"', () => {
  assert.equal(M.aPesos($(10), 'USD', conUSD()), $(20_000));
  assert.equal(M.aPesos(1_050, 'USD', conUSD()), $(21_000)); // US$ 10,50
  assert.equal(M.aPesos($(5), 'ARS', conUSD()), $(5));
  const nov = resumenMes(conUSD(), '2026-11');
  const u = nov.cuotas.find(c => c.id === 'u1');
  assert.deepEqual([u.original, u.moneda, u.monto], [$(200), 'USD', $(400_000)]);
  assert.equal(nov.libres, resumenMes(base(), '2026-11').libres - $(400_000));
});
test('moneda: sin tipo de cambio cargado usa el de por defecto, con fuente y fecha', () => {
  const c = M.cambioDe(M.datosVacios(), 'USD');
  assert.ok(c.valor > 0 && c.fuente && M.esFecha(c.fecha) && c.url.startsWith('https://'));
  assert.equal(M.aPesos($(1), 'USD', M.datosVacios()), M.CAMBIO_DEFECTO.USD.valor);
});
test('moneda: si no hay tipo de cambio para esa moneda, no se suma y queda marcada', () => {
  const d = conUSD();
  d.cuotas.push({ id: 'b1', descripcion: 'Hotel', total: $(900), moneda: 'BRL', cantidad: 1, tarjetaId: 't2', primerMes: '2026-11' });
  const nov = resumenMes(d, '2026-11');
  assert.equal(M.aPesos(100, 'BRL', d), null);
  assert.deepEqual(nov.sinCambio.map(c => c.id), ['b1']);
  assert.equal(nov.totCuotas, resumenMes(conUSD(), '2026-11').totCuotas, 'no inventa el monto');
  d.cambio.BRL = { valor: $(300), fuente: 'Lo cargaste vos', fecha: '2026-10-13' };
  assert.equal(resumenMes(d, '2026-11').totCuotas - resumenMes(conUSD(), '2026-11').totCuotas, $(270_000));
});
test('moneda: cuotas en dólares también reparten exacto', () => {
  const cs = repartirCuotas(99_999, 4); // US$ 999,99
  assert.equal(cs.reduce((a, b) => a + b, 0), 99_999);
  assert.equal(M.formatoMoneda(1_050, 'USD'), 'US$ 10,50');
  assert.equal(M.formatoMoneda($(1_000), 'USD'), 'US$ 1.000');
  assert.equal(M.formatoMoneda(-250, 'EUR'), '−€ 2,50');
});

/* ── resúmenes importados ── */
const lecturaEjemplo = () => ({
  tarjeta: { banco: 'Banco Ejemplo', red: 'Visa', ultimos4: '4321' },
  periodo: { desde: '2026-09-26', hasta: '2026-10-25' }, cierre: '2026-10-29', vencimiento: '2026-11-10',
  totales: [{ moneda: 'ARS', monto: 250000 }, { moneda: 'USD', monto: 30.5 }],
  pagoMinimo: { moneda: 'ARS', monto: 25000 },
  consumos: [
    { fecha: '2026-10-02', comercio: 'SUPER EJEMPLO 123', monto: 50000, moneda: 'ARS', rubro: 'Supermercado', cuota: null },
    { fecha: '2026-08-15', comercio: 'Electro Ejemplo', monto: 100000, moneda: 'ARS', rubro: 'Otros', cuota: { n: 3, de: 6 } },
    { fecha: '2026-10-05', comercio: 'STREAMING*EJEMPLO', monto: 10.5, moneda: 'USD', rubro: 'Suscripciones', cuota: null },
    { fecha: '2026-10-07', comercio: 'App Ejemplo', monto: 20, moneda: 'USD', rubro: 'Entretenimiento', cuota: null },
    { fecha: '2026-10-08', comercio: 'Sin monto', moneda: 'ARS', rubro: 'Otros' },
  ],
  confianza: 'alta', avisos: [],
});
test('lectura: valida, pasa a centavos y descarta lo que no tiene monto (no inventa)', () => {
  const v = M.validarLectura(lecturaEjemplo());
  assert.equal(v.ok, true);
  assert.deepEqual(v.lectura.totales, { ARS: $(250_000), USD: 3_050 });
  assert.equal(v.lectura.consumos.length, 4);
  assert.match(v.lectura.avisos.join(' '), /Dejamos afuera 1 línea/);
  assert.deepEqual(v.lectura.consumos[1].cuota, { n: 3, de: 6 });
  const mala = M.validarLectura({ consumos: [] });
  assert.equal(mala.ok, false);
  assert.ok(mala.errores.length >= 2);
  assert.equal(M.validarLectura(null).ok, false);
});
test('importar: crea la tarjeta, guarda el resumen y suma las cuotas detectadas', () => {
  const { lectura } = M.validarLectura(lecturaEjemplo());
  let n = 0;
  const r = M.importarResumen(M.datosVacios(), lectura, { nuevoId: () => `id${n++}` });
  const d = r.datos;
  assert.equal(r.mes, '2026-11');
  assert.deepEqual(d.tarjetas.map(t => [t.nombre, t.red, t.ultimos4]), [['Banco Ejemplo Visa', 'Visa', '4321']]);
  assert.equal(d.resumenes.length, 1);
  assert.deepEqual(d.cuotas.map(c => [c.descripcion, c.total, c.cantidad, c.primerMes]), [['Electro Ejemplo', $(600_000), 6, '2026-09']]);
  assert.equal(r.cuotasNuevas, 1);
  // el mes del vencimiento cuesta el total del resumen (USD pasado a pesos), sin sumar la cuota aparte
  d.cambio = { USD: { valor: $(2_000), fuente: 'p', fecha: '2026-10-13' } };
  const nov = resumenMes(d, '2026-11');
  assert.equal(nov.totResumenes, $(250_000) + $(61_000));
  assert.equal(nov.totCuotas, 0);
  assert.equal(nov.dentroDeResumen.length, 1);
  // el mes siguiente sigue la cuota 4/6 (la 3/6 estaba en el resumen de noviembre)
  const dic = resumenMes(d, '2026-12');
  assert.deepEqual([dic.totResumenes, dic.totCuotas, dic.cuotas[0].numero], [0, $(100_000), 4]);
});
test('importar: el resumen del mes siguiente no duplica la cuota ni la tarjeta', () => {
  const { lectura } = M.validarLectura(lecturaEjemplo());
  let n = 0;
  const id = () => `id${n++}`;
  const r1 = M.importarResumen(M.datosVacios(), lectura, { nuevoId: id });
  const sig = structuredClone(lectura);
  sig.vencimiento = '2026-12-10';
  sig.consumos = [{ ...lectura.consumos[1], cuota: { n: 4, de: 6 } }];
  const r2 = M.importarResumen(r1.datos, sig, { nuevoId: id });
  assert.equal(r2.datos.tarjetas.length, 1);
  assert.equal(r2.datos.cuotas.length, 1);
  assert.equal(r2.cuotasNuevas, 0);
  assert.equal(r2.datos.resumenes.length, 2);
  // reimportar el mismo mes reemplaza, no suma dos veces
  const r3 = M.importarResumen(r2.datos, sig, { nuevoId: id });
  assert.equal(r3.datos.resumenes.length, 2);
});
test('tarjeta: total del mes, gasto por rubro y disponible del límite (con USD)', () => {
  const { lectura } = M.validarLectura(lecturaEjemplo());
  const r = M.importarResumen(M.datosVacios(), lectura, { nuevoId: (() => { let n = 0; return () => `id${n++}`; })() });
  const d = r.datos;
  d.cambio = { USD: { valor: $(2_000), fuente: 'p', fecha: '2026-10-13' } };
  const t = M.tarjetaEnMes(d, r.tarjetaId, '2026-11');
  assert.equal(t.total, $(311_000));
  assert.deepEqual(t.resumen.porMoneda, { ARS: $(250_000), USD: 3_050 });
  const rubros = M.gastoPorRubro(d.resumenes[0], d);
  assert.deepEqual(rubros.map(x => [x.rubro, x.ars]), [['Otros', $(100_000)], ['Supermercado', $(50_000)], ['Entretenimiento', $(40_000)], ['Suscripciones', $(21_000)]]);
  assert.equal(M.disponibleTarjeta(d, r.tarjetaId, '2026-10'), null, 'sin límite cargado no muestra nada');
  d.tarjetas[0].limite = $(2_000_000);
  // usado desde octubre: cuotas 2/6 a 6/6 de 100.000 + consumos en un pago 50.000 + US$ 30,50
  const disp = M.disponibleTarjeta(d, r.tarjetaId, '2026-10');
  assert.equal(disp.usado, $(500_000) + $(50_000) + $(61_000));
  assert.equal(disp.disponible, $(2_000_000) - disp.usado);
});
test('rubros: la corrección del usuario gana para ese comercio, aunque cambie el número', () => {
  const mem = { [M.normalizarComercio('SUPER EJEMPLO 123')]: 'Comida' };
  assert.equal(M.rubroPara('Super Ejemplo 456', 'Supermercado', mem), 'Comida');
  assert.equal(M.rubroPara('Otro comercio', 'Salud', mem), 'Salud');
  assert.equal(M.rubroPara('Otro', 'Inventado', mem), 'Otros');
  assert.equal(M.normalizarComercio('Café* Martínez 12'), 'CAFE MARTINEZ');
});

test('cuadre: consumos + ajustes tienen que dar el total de cada moneda', () => {
  const base = { totales: [{ moneda: 'ARS', monto: 1000 }, { moneda: 'USD', monto: 20 }],
    consumos: [{ monto: 700, moneda: 'ARS' }, { monto: 20, moneda: 'USD' }], ajustes: [{ concepto: 'Impuestos', monto: 300, moneda: 'ARS' }] };
  assert.deepEqual(M.cuadreLectura(base), { ok: true, motivos: [] });
  assert.equal(M.cuadreLectura({ ...base, ajustes: [] }).ok, false, 'faltan 300');
  const centavos = structuredClone(base); centavos.consumos[0].monto = 700.6;
  assert.equal(M.cuadreLectura(centavos).ok, true, 'tolera redondeos chicos');
  const rara = structuredClone(base); rara.consumos.push({ monto: 5, moneda: 'XYZ' });
  assert.match(M.cuadreLectura(rara).motivos.join(' '), /moneda que no pudimos identificar/);
  const sinTotal = structuredClone(base); sinTotal.consumos.push({ monto: 9, moneda: 'EUR' });
  assert.match(M.cuadreLectura(sinTotal).motivos.join(' '), /sin un total/);
  assert.equal(M.cuadreLectura({}).ok, false);
});

/* ═══════ Paso 4 ═══════ */
const conTarjetas = () => {
  const d = migrar(base());
  d.cambio = { USD: { valor: $(2_000), fuente: 'p', fecha: '2026-10-13' } };
  d.cuotas.push({ id: 'u1', descripcion: 'Notebook', total: $(600), moneda: 'USD', cantidad: 3, tarjetaId: 't2', primerMes: '2026-12' });
  return d;
};
test('escalera: comprometido por mes y por tarjeta, con USD convertido, y mes en que quedás libre', () => {
  const e = M.escalera(conTarjetas(), '2026-11', 7);
  assert.deepEqual(e.filas.map(f => f.total / 100), [183_334, 183_333 + 400_000, 183_333 + 400_000, 150_000 + 400_000, 150_000, 150_000, 0]);
  assert.deepEqual(e.filas[1].porTarjeta, { t1: $(150_000), t2: $(33_333) + $(400_000) });
  assert.equal(e.mesLibre, '2027-05');
  assert.equal(M.mesLibreDeCuotas(M.datosVacios(), '2026-10'), '2026-10');
});
test('límite: % de los ingresos que puede ir a cuotas; avisa el mes que se pasa (cuenta USD)', () => {
  const d = conTarjetas();
  assert.equal(d.limiteCuotas, 30);
  const nov = M.limiteDelMes(d, '2026-11');               // 183.334 de 1.200.000 = 15 %
  assert.deepEqual([nov.tope, nov.supera], [$(360_000), false]);
  const dic = M.limiteDelMes(d, '2026-12');               // 583.333 > 360.000 por los dólares
  assert.equal(dic.supera, true);
  d.limiteCuotas = 50;
  assert.equal(M.limiteDelMes(d, '2026-12').supera, false);
  const sinIngresos = M.migrar({ ...base(), ingresos: [] });
  assert.equal(M.limiteDelMes(sinIngresos, '2026-11').supera, true, 'cuotas sin ingresos supera');
  assert.equal(M.escalera(d, '2026-12', 1).filas[0].supera, false);
});
test('fechas: días que faltan, cambio de mes y de año, meses cortos', () => {
  assert.equal(M.diasEntre('2026-10-30', '2026-11-02'), 3);
  assert.equal(M.diasEntre('2026-12-29', '2027-01-03'), 5);
  assert.equal(M.diasEntre('2026-11-10', '2026-11-08'), -2);
  assert.equal(M.fechaConDia('2027-02', 31), '2027-02-28');
  assert.equal(M.fechaConDia('2028-02', 30), '2028-02-29');
  assert.equal(M.sumarDias('2027-01-01', -2), '2026-12-30');
});
test('ciclo manual: cierre y vencimiento con días cargados, cruzando el año', () => {
  const d = migrar({ ...base(), tarjetas: [{ id: 't1', nombre: 'Visa', diaCierre: 26, diaVence: 8 }, { id: 't2', nombre: 'Master' }] });
  assert.deepEqual(M.cicloTarjeta(d, 't1', '2026-10-13'), { cierre: '2026-10-26', vencimiento: '2026-11-08', mes: '2026-11', resumen: null, origen: 'manual' }, 'antes del cierre: el ciclo que viene');
  assert.equal(M.cicloTarjeta(d, 't1', '2026-12-28').vencimiento, '2027-01-08', 'después del cierre de diciembre vence en enero');
  assert.equal(M.cicloTarjeta(d, 't1', '2027-01-05').cierre, '2026-12-26');
  assert.equal(M.cicloTarjeta(d, 't1', '2027-01-09').vencimiento, '2027-02-08', 'ya vencido: pasa al siguiente');
  assert.equal(M.cicloTarjeta(d, 't2', '2026-10-13'), null, 'sin días ni resumen no hay ciclo');
});
const conResumen = () => {
  const { lectura } = M.validarLectura(lecturaEjemplo());   // cierre 29/10, vence 10/11, US$ 30,50
  let n = 0;
  const r = M.importarResumen(M.datosVacios(), lectura, { nuevoId: () => `id${n++}` });
  r.datos.cambio = { USD: { valor: $(1_950), fuente: 'p', fecha: '2026-10-13' } };
  return r;
};
test('alertas: antes del cierre nada; cerrado avisa a qué resumen va lo nuevo, y los dólares', () => {
  const { datos } = conResumen();
  assert.deepEqual(M.alertasTarjetas(datos, '2026-10-20').map(a => a.tipo), [], 'antes del cierre');
  const a = M.alertasTarjetas(datos, '2026-10-30');
  assert.deepEqual(a.map(x => x.tipo).sort(), ['cierre', 'dolares']);
  assert.match(a.find(x => x.tipo === 'cierre').texto, /resumen de diciembre 2026/);
  const usd = a.find(x => x.tipo === 'dolares');
  assert.equal(usd.usd, 3_050);
  // US$ 30,50 × (1.950 − 1.950/1,3) = 30,5 × 450 = 13.725
  assert.equal(usd.ahorro, $(13_725));
  assert.match(usd.texto, /dólares propios antes del 10 nov/);
});
test('alertas: vence en N días desde 5 antes, fuerte el día anterior y el mismo día, nada después', () => {
  const { datos } = conResumen();
  const vence = h => M.alertasTarjetas(datos, h).find(a => a.tipo === 'vence');
  assert.equal(vence('2026-11-04'), undefined);
  assert.deepEqual([vence('2026-11-05').dias, vence('2026-11-05').nivel], [5, 'aviso']);
  assert.match(vence('2026-11-05').titulo, /^Vence en 5 días: \$ /);
  assert.deepEqual([vence('2026-11-09').titulo.startsWith('Vence mañana'), vence('2026-11-09').nivel], [true, 'fuerte']);
  assert.ok(vence('2026-11-10').titulo.startsWith('Vence hoy'));
  assert.equal(M.alertasTarjetas(datos, '2026-11-11').length, 0, 'vencido: no queda ninguna');
  assert.equal(M.alertasTarjetas(datos, '2026-11-09')[0].tipo, 'vence', 'la fuerte va primero');
  assert.equal(M.alertasTarjetas(datos, '2026-11-09').some(a => a.tipo === 'cierre'), false, 'el cierre va adentro del aviso de vencimiento');
  assert.match(vence('2026-11-09').texto, /va al resumen de diciembre 2026/);
});
test('alertas: descartar oculta solo esa alerta de ese ciclo', () => {
  const { datos } = conResumen();
  const id = M.alertasTarjetas(datos, '2026-11-09').find(a => a.tipo === 'vence').id;
  datos.alertasVistas = [id];
  assert.equal(M.alertasTarjetas(datos, '2026-11-09').some(a => a.tipo === 'vence'), false);
  assert.equal(M.alertasTarjetas(datos, '2026-11-09').some(a => a.tipo === 'dolares'), true);
});
test('calendario: .ics válido con cierre, vencimiento con avisos y recordatorio de dólares', () => {
  const { datos, tarjetaId } = conResumen();
  const ev = M.eventosTarjeta(datos, tarjetaId, '2026-10-20');
  assert.deepEqual(ev.map(e => [e.fecha, e.uid.split('-')[0]]), [['2026-10-29', 'cierre'], ['2026-11-10', 'vence'], ['2026-11-08', 'dolares']]);
  const ics = M.generarICS(ev, { ahora: new Date(Date.UTC(2026, 9, 13, 12)) });
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /END:VCALENDAR\r\n$/);
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 3);
  assert.match(ics, /DTSTART;VALUE=DATE:20261110\r\nDTEND;VALUE=DATE:20261111/);
  assert.match(ics, /TRIGGER:-P2DT15H/);
  assert.match(ics, /DTSTAMP:20261013T120000Z/);
  assert.ok(ics.split('\r\n').every(l => l.length <= 75), 'líneas plegadas');
  assert.match(M.generarICS([{ uid: 'x', fecha: '2026-12-31', titulo: 'A, b; c' }]), /SUMMARY:A\\, b\\; c/);
  assert.match(M.generarICS([{ uid: 'x', fecha: '2026-12-31', titulo: 'fin de año' }]), /DTEND;VALUE=DATE:20270101/);
});
test('¿cuotas o contado?: un solo método (VP con la tasa mayor) y diferencia = VP − contado', () => {
  const base4 = { precioCuotas: $(1_200_000), cuotas: 6, inflacion: 1.7, rendimiento: 1.56 };
  const sinDesc = M.cuotasOContado({ ...base4, descuentoContado: 0 });
  assert.deepEqual([sinDesc.contado, sinDesc.tasa, sinDesc.tasaUsada, sinDesc.conviene], [$(1_200_000), 1.7, 'inflacion', 'cuotas']);
  const desc10 = M.cuotasOContado({ ...base4, descuentoContado: 10 });
  assert.equal(desc10.contado, $(1_080_000));
  assert.equal(desc10.conviene, 'contado');
  // lo que se muestra cierra a ojo: diferencia = VP − contado, exacto
  for (const c of [sinDesc, desc10, M.cuotasOContado({ ...base4, descuentoContado: 3, rendimiento: 2.5 })]) {
    assert.equal(c.diferencia, c.vp - c.contado);
    assert.equal(c.vp, Math.round(c.pagos.reduce((s, p, i) => s + p / (1 + c.tasa / 100) ** (i + 1), 0)));
  }
  assert.equal(M.cuotasOContado({ ...base4, rendimiento: 2.5 }).tasaUsada, 'rendimiento', 'usa la mayor');
  // cuenta a mano: 100.000 en 2 cuotas al 1 %: 50.000/1,01 + 50.000/1,0201 = 98.519,75 → 98.520
  const mano = M.cuotasOContado({ precioCuotas: $(100_000), cuotas: 2, inflacion: 0, rendimiento: 1 });
  assert.deepEqual([mano.vp, mano.diferencia, mano.conviene], [9_851_975, -148_025, 'cuotas']);
  assert.equal(M.cuotasOContado({ precioCuotas: $(100_000), cuotas: 3, inflacion: 0, rendimiento: 0 }).conviene, 'da igual');
  assert.ok(M.SUPUESTOS_DEFECTO.inflacion.url.startsWith('https://') && M.esFecha(M.SUPUESTOS_DEFECTO.rendimiento.fecha));
});
test('simulador: muestra libres antes y después sin tocar los datos, y la alerta de límite', () => {
  const d = conTarjetas();
  const copia = JSON.stringify(d);
  const s = M.simularCompra(d, { total: $(900_000), cantidad: 3, primerMes: '2026-11', moneda: 'ARS', tarjetaId: 't1' }, '2026-11', 4);
  assert.deepEqual(s.map(x => x.nueva / 100), [300_000, 300_000, 300_000, 0]);
  assert.equal(s[0].despues, s[0].antes - $(300_000));
  assert.deepEqual(s.slice(0, 3).map(x => x.supera), [true, true, true]);
  assert.equal(s[3].supera, M.limiteDelMes(d, '2027-02').supera, 'sin la compra, el mes queda como estaba');
  assert.equal(JSON.stringify(d), copia, 'no modifica los datos');
  const usd = M.simularCompra(d, { total: $(100), cantidad: 1, primerMes: '2026-11', moneda: 'USD' }, '2026-11', 1);
  assert.equal(usd[0].nueva, $(200_000));
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
  assert.equal(CAT['ob-019'].name, 'Mi Mes by Orbit');
  assert.equal(productoPorSlug(CAT, 'mi-mes').id, 'ob-019');
  const res = () => { const r = { code: 200, headers: {} }; r.status = c => { r.code = c; return r; }; r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; }; r.send = b => { r.body = b; return r; }; r.redirect = (c, u) => { r.code = c; r.location = u; return r; }; return r; };
  const sin = res();
  await herramienta({ headers: {}, query: { slug: 'mi-mes', path: 'calculos.js' } }, sin);
  assert.deepEqual([sin.code, sin.location], [302, '/acceso']);
  const admin = { headers: { cookie: `orbit_session=${makeSession('admin@orbit.test')}` } };
  const pag = res();
  await herramienta({ ...admin, query: { slug: 'mi-mes' } }, pag);
  assert.equal(pag.code, 200);
  assert.match(String(pag.body), /Te quedan libres/);
  assert.match(String(pag.body), /<title>Mi Mes by Orbit<\/title>/);
  for (const f of ['app.js', 'calculos.js', 'ejemplo.js', 'mi-mes.css']) {
    const r = res();
    await herramienta({ ...admin, query: { slug: 'mi-mes', path: f } }, r);
    assert.equal(r.code, 200, f);
  }
});
