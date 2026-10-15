/* Mi Mes by Orbit · plata líquida vs. crédito, conciliación de compras nuevas y emisores.
   Datos inventados. Montos en centavos. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const M = await import('../api/_herramientas/mi-mes/calculos.js');
const $ = p => Math.round(p * 100);
const fixture = n => JSON.parse(readFileSync(new URL(`./fixtures/mi-mes/${n}.json`, import.meta.url), 'utf8'));

/* Una persona: cobra 1.000.000, paga 400.000 de fijos. Tiene la tarjeta del
   fixture "dolares-rg5617" (vence 09/10, tabla de cuotas a vencer) y otra sin
   resumen con una compra nueva cargada a mano. */
function persona() {
  const v = M.validarLectura(fixture('dolares-rg5617'));
  let k = 0;
  const r = M.importarResumen(M.datosVacios(), v.lectura, { nuevoId: () => `id${k++}` });
  const d = r.datos;
  d.cambio = { USD: { valor: $(2_000), fuente: 'p', fecha: '2026-10-01' } };
  d.ingresos.push({ id: 'i', nombre: 'Sueldo', monto: $(1_000_000), repite: true, desde: '2026-09' });
  d.gastos.push({ id: 'g', nombre: 'Alquiler', categoria: 'Alquiler', monto: $(400_000), repite: true, desde: '2026-09' });
  d.tarjetas.push({ id: 'otra', nombre: 'Ualá Mastercard', red: 'Mastercard', banco: 'Ualá', ultimos4: '', color: 'verde', limite: $(500_000) });
  d.cuotas.push({ id: 'nueva', descripcion: 'Zapatillas', total: $(90_000), moneda: 'ARS', cantidad: 3, tarjetaId: 'otra', primerMes: '2026-11', fecha: '2026-10-05', origen: 'manual' });
  return { d, tarjeta: r.tarjetaId };
}

test('plata líquida = ingresos − gastos fijos; te quedan libres = líquida − lo que vence en tarjetas', () => {
  const { d } = persona();
  const oct = M.resumenMes(d, '2026-10');
  assert.equal(oct.liquida, $(600_000));
  assert.equal(oct.totTarjetas, $(507_130) + $(55) * 2_000, 'vence el resumen de octubre');
  assert.equal(oct.libres, oct.liquida - oct.totTarjetas);
});
test('noviembre: manda la tabla del banco y la compra nueva se suma aparte', () => {
  const { d } = persona();
  const nov = M.resumenMes(d, '2026-11');
  assert.deepEqual(nov.delBanco.map(x => x.monto), [$(120_000)]);
  assert.equal(nov.totNuevas, $(30_000));
  // + percepción estimada por los US$ 55 de octubre pagados en pesos: 55 × 2.000 × 30 % = 33.000
  assert.deepEqual(nov.percepciones.map(p => [p.monto, p.estimado]), [[$(33_000), true]]);
  assert.equal(nov.totTarjetas, $(150_000) + $(33_000));
  assert.equal(nov.totAnteriores, $(120_000) + $(33_000));
  assert.equal(nov.dentroDeResumen.length, 1, 'la cuota detectada no se cuenta dos veces');
});
test('crédito por tarjeta: resumen sin vencer + cuotas que vienen (tabla) + compras nuevas', () => {
  const { d, tarjeta } = persona();
  const c = M.creditoTarjeta(d, tarjeta, '2026-10-05');
  assert.equal(c.resumen, $(507_130) + $(110_000), 'US$ 55 a 2.000');
  assert.equal(c.futuras, $(120_000) * 3 + $(960_000), 'nov, dic, ene y "a partir de"');
  assert.equal(c.nuevas, 0);
  assert.equal(c.percepcion, $(33_000), 'percepción estimada del resumen siguiente');
  assert.equal(c.total, c.resumen + c.futuras + c.percepcion);
  // vencido el resumen, el saldo ya no se debe (se pagó) y las cuotas que vienen siguen
  assert.equal(M.creditoTarjeta(d, tarjeta, '2026-10-20').resumen, 0);
  const otra = M.creditoTarjeta(d, 'otra', '2026-10-05');
  assert.deepEqual([otra.resumen, otra.futuras, otra.nuevas], [0, 0, $(90_000)]);
  const tot = M.creditoTotal(d, '2026-10-05');
  assert.equal(tot.total, c.total + otra.total);
  assert.equal(tot.nuevas, $(90_000));
});
test('cuotas cargadas a mano antes de este cambio (sin origen) cuentan como "de antes", no como compras nuevas', () => {
  const { d } = persona();
  d.cuotas.push({ id: 'vieja', descripcion: 'Heladera', total: $(60_000), moneda: 'ARS', cantidad: 6, tarjetaId: 'otra', primerMes: '2026-09' });
  const c = M.creditoTarjeta(d, 'otra', '2026-10-05');
  assert.deepEqual([c.futuras, c.nuevas], [$(10_000) * 5, $(90_000)]);
  assert.equal(M.resumenMes(d, '2026-11').totNuevas, $(30_000));
});
test('crédito disponible = límite − lo que se debe (con dólares convertidos)', () => {
  const { d, tarjeta } = persona();
  const disp = M.disponibleTarjeta(d, tarjeta, '2026-10-05');
  assert.equal(disp.limite, $(3_000_000), 'el límite vino del resumen');
  assert.equal(disp.disponible, $(3_000_000) - M.creditoTarjeta(d, tarjeta, '2026-10-05').total);
  assert.equal(M.disponibleTarjeta(d, 'otra', '2026-10-05').disponible, $(410_000));
  d.cambio.USD.valor = $(2_500);
  assert.ok(M.disponibleTarjeta(d, tarjeta, '2026-10-05').disponible < disp.disponible, 'el dólar más caro come más crédito');
});
test('alerta principal: mes a mes, cuando lo que vence supera la plata líquida, con lo de antes y lo nuevo', () => {
  const { d } = persona();
  const a = M.alertasCredito(d, '2026-10-05', 6);
  assert.deepEqual(a.map(x => x.mes), ['2026-10'], 'octubre: 617.130 > 600.000');
  assert.equal(a[0].nivel, 'fuerte');
  assert.match(a[0].titulo, /octubre 2026 \(\$ 617\.130\) supera tu plata líquida \(\$ 600\.000\)/);
  // una compra nueva grande en noviembre hace que noviembre también se pase
  d.cuotas.push({ id: 'tele', descripcion: 'Tele', total: $(1_400_000), moneda: 'ARS', cantidad: 2, tarjetaId: 'otra', primerMes: '2026-11', fecha: '2026-10-06', origen: 'manual' });
  const b = M.alertasCredito(d, '2026-10-05', 6);
  const nov = b.find(x => x.mes === '2026-11');
  assert.equal(nov.nivel, 'aviso');
  assert.deepEqual([nov.anteriores, nov.nuevas], [$(120_000) + $(33_000), $(30_000) + $(700_000)]);
  assert.match(nov.texto, /viene de antes .* compras nuevas/);
  assert.deepEqual(M.mesesCreditoSupera(d, '2026-10-05'), ['2026-10', '2026-11', '2026-12']);
  d.alertasVistas = ['credito:2026-11'];
  assert.equal(M.alertasCredito(d, '2026-10-05').some(x => x.mes === '2026-11'), false, 'se puede descartar');
});
test('push de crédito: una vez por mes, sin montos', () => {
  const a = M.avisosPushDeHoy([], '2026-11-01', ['2026-11', '2026-12']);
  assert.deepEqual(a.map(x => x.tag), ['mm:credito:2026-11']);
  assert.doesNotMatch(JSON.stringify(a), /\$|\d{3}\./);
  assert.deepEqual(M.avisosPushDeHoy([], '2026-11-15', ['2026-11']).map(x => x.tag), ['mm:credito:2026-11'], 'mismo tag: el cron no lo repite');
  assert.deepEqual(M.avisosPushDeHoy([], '2026-10-15', ['2026-11']), []);
});

/* ── compras nuevas: se concilian solas con el resumen siguiente ── */
const lecturaCon = consumos => M.validarLectura({ ...fixture('simple'), tarjetas: [], consumos,
  totales: [{ moneda: 'ARS', monto: consumos.reduce((a, c) => a + c.monto, 0) }], saldoAnterior: [] }).lectura;
function conPendiente(extra = {}) {
  const v = M.validarLectura(fixture('simple'));
  const r = M.importarResumen(M.datosVacios(), v.lectura, { nuevoId: () => 'x' + Math.random() });
  r.datos.cuotas.push({ id: 'manual', descripcion: 'Heladera', total: $(600_000), moneda: 'ARS', cantidad: 6, tarjetaId: r.tarjetaId, primerMes: '2026-10', fecha: '2026-09-02', origen: 'manual', ...extra });
  return r;
}
test('conciliación: la compra nueva aparece en el resumen → se reemplaza sola, sin duplicar', () => {
  const r = conPendiente();
  const l = lecturaCon([{ fecha: '2026-09-03', comercio: 'ELECTRO GENERICO', monto: 100_000, moneda: 'ARS', rubro: 'Otros', cuota: { n: 1, de: 6 }, tarjeta: null }]);
  l.vencimiento = '2026-10-06';
  const r2 = M.importarResumen(r.datos, l, { tarjetaId: r.tarjetaId, nuevoId: () => 'y' + Math.random() });
  assert.deepEqual(r2.conciliadas, ['manual']);
  assert.deepEqual(r2.dudosas, []);
  const deEsa = r2.datos.cuotas.filter(c => c.tarjetaId === r.tarjetaId);
  assert.equal(deEsa.length, 1, 'queda una sola: la del resumen');
  assert.equal(deEsa[0].origen, 'resumen');
  assert.equal(M.resumenMes(r2.datos, '2026-11').totCuotas, $(100_000), 'noviembre no la cuenta dos veces');
});
test('conciliación: si el monto se parece pero no es igual, pregunta en vez de decidir', () => {
  const r = conPendiente();
  const l = lecturaCon([{ fecha: '2026-09-03', comercio: 'ELECTRO GENERICO', monto: 102_000, moneda: 'ARS', rubro: 'Otros', cuota: { n: 1, de: 6 }, tarjeta: null }]);
  l.vencimiento = '2026-10-06';
  const r2 = M.importarResumen(r.datos, l, { tarjetaId: r.tarjetaId, nuevoId: () => 'y' + Math.random() });
  assert.deepEqual(r2.conciliadas, []);
  assert.deepEqual(r2.dudosas.map(x => [x.cuotaId, x.comercio]), [['manual', 'ELECTRO GENERICO']]);
  assert.ok(r2.datos.cuotas.some(c => c.id === 'manual'), 'hasta que responda, la manual queda');
});
test('conciliación: otra cantidad de cuotas, otra moneda o fecha lejana no se toman como la misma', () => {
  for (const [consumo, extra] of [
    [{ monto: 100_000, cuota: { n: 1, de: 3 } }, {}],
    [{ monto: 100_000, cuota: { n: 1, de: 6 }, moneda: 'USD' }, {}],
    [{ monto: 100_000, cuota: { n: 1, de: 6 } }, { fecha: '2026-06-01' }],
  ]) {
    const r = conPendiente(extra);
    const l = lecturaCon([{ fecha: '2026-09-03', comercio: 'X', moneda: 'ARS', rubro: 'Otros', tarjeta: null, ...consumo }]);
    l.vencimiento = '2026-10-06';
    const r2 = M.importarResumen(r.datos, l, { tarjetaId: r.tarjetaId, nuevoId: () => 'y' + Math.random() });
    assert.deepEqual(r2.conciliadas, [], JSON.stringify(consumo));
  }
});
test('compra nueva: va al resumen que corresponde según el cierre', () => {
  const { datos, tarjetaId } = conPendiente();                          // cierre 20/08, vence 01/09; próximo 24/09 → 06/10
  assert.equal(M.primerMesDeCompra(datos, tarjetaId, '2026-08-15'), '2026-09', 'antes del cierre: el resumen que vence en septiembre');
  assert.equal(M.primerMesDeCompra(datos, tarjetaId, '2026-08-25'), '2026-10', 'después del cierre: el siguiente');
});

/* ── emisores ── */
test('emisores: lista de Argentina sin fusionados, y el nombre del resumen se reconoce', () => {
  const nombres = M.EMISORES.map(e => e.nombre);
  for (const n of ['Galicia', 'Santander', 'BBVA', 'Macro', 'Nación', 'Provincia', 'ICBC', 'Supervielle', 'Patagonia', 'Credicoop', 'Ciudad',
    'Comafi', 'Hipotecario', 'Naranja X', 'Mercado Pago', 'Ualá', 'Brubank', 'Cencosud']) assert.ok(nombres.includes(n), n);
  for (const n of ['HSBC', 'Itaú', 'Citi', 'Francés', 'Nevada', 'Galicia Más']) assert.ok(!nombres.includes(n), `${n} ya no existe como emisor aparte`);
  assert.equal(new Set(nombres).size, nombres.length, 'sin repetidos');
  assert.equal(M.emisorDe('BANCO MACRO S.A.'), 'Macro');
  assert.equal(M.emisorDe('Banco de Galicia y Buenos Aires'), 'Galicia');
  assert.equal(M.emisorDe('HSBC Bank Argentina'), 'Galicia');
  assert.equal(M.emisorDe('Banco Itaú'), 'Macro');
  assert.equal(M.emisorDe('ICBC'), 'ICBC');
  assert.equal(M.emisorDe('Banco de la Nación Argentina'), 'Nación');
  assert.equal(M.emisorDe('Tarjeta Naranja'), 'Naranja X');
  assert.equal(M.emisorDe('Banco Inventado'), '');
  assert.equal(M.nombreTarjeta({ banco: 'Macro', red: 'Visa' }), 'Macro Visa');
  assert.equal(M.nombreTarjeta({ banco: 'Macro', red: 'Visa', ultimos4: '1234' }, [{ nombre: 'Macro Visa' }]), 'Macro Visa ···1234');
});
test('importar: el banco del resumen sale de la lista y el nombre se arma solo', () => {
  const f = fixture('adicional-creditos');
  f.tarjeta.banco = 'BANCO MACRO S.A.';
  const r = M.importarResumen(M.datosVacios(), M.validarLectura(f).lectura, { nuevoId: () => 'z' });
  assert.deepEqual([r.datos.tarjetas[0].banco, r.datos.tarjetas[0].nombre], ['Macro', 'Macro Visa']);
});

/* ── tanda 7: cargos, liberaciones y gastos de un mes ── */
test('intereses y cargos del resumen: suma cargos e impuestos, las devoluciones restan', () => {
  const r = M.validarLectura(fixture('dolares-rg5617')).lectura;
  const c = M.cargosDelResumen({ cargos: r.cargos }, M.datosVacios());
  // devolución −110.000 + sellos 15.000 + intereses 3.000 + IVA 630 + percepción 25.000
  assert.equal(c.ars, $(-66_370));
  assert.equal(M.cargosDelResumen({ cargos: M.validarLectura(fixture('adicional-creditos')).lectura.cargos }, M.datosVacios()).ars, $(2_420));
  assert.deepEqual(M.cargosDelResumen({}, M.datosVacios()), { ars: 0, porMoneda: {}, hay: false });
});
test('se te liberan: el mes en que baja lo comprometido en cuotas y cuánto', () => {
  const d = M.datosVacios();
  d.tarjetas.push({ id: 't', nombre: 'X', red: 'Visa', banco: '', ultimos4: '', color: 'azul' });
  d.cuotas.push({ id: 'a', total: $(300_000), moneda: 'ARS', cantidad: 3, tarjetaId: 't', primerMes: '2026-10', origen: 'resumen' });
  d.cuotas.push({ id: 'b', total: $(600_000), moneda: 'ARS', cantidad: 6, tarjetaId: 't', primerMes: '2026-10', origen: 'resumen' });
  assert.deepEqual(M.liberaciones(d, '2026-10', 8).map(x => [x.mes, x.libera / 100]), [['2027-01', 100_000], ['2027-04', 100_000]]);
  assert.deepEqual(M.proximaLiberacion(d, '2026-10'), { mes: '2027-01', libera: $(100_000) });
  assert.equal(M.proximaLiberacion(M.datosVacios(), '2026-10'), null);
});
test('gastos de un solo mes y aguinaldo', () => {
  for (const g of M.GASTOS_UN_MES) assert.ok(M.CATEGORIAS.includes(g.categoria), g.nombre);
  assert.deepEqual(M.GASTOS_UN_MES.map(g => g.nombre), ['Patente', 'Seguro', 'Matrícula', 'Vacaciones']);
  assert.equal(M.mesAguinaldo('2026-10'), '2026-12');
  assert.equal(M.mesAguinaldo('2027-02'), '2027-06');
  const d = M.migrar({ gastos: [{ id: 'p', nombre: 'Patente', categoria: 'Patente', monto: 100, repite: false, desde: '2027-03' }] });
  assert.equal(d.gastos[0].categoria, 'Patente');
  assert.equal(M.resumenMes(d, '2027-03').totGastos, 100);
  assert.equal(M.resumenMes(d, '2027-04').totGastos, 0);
});

/* ── tanda 8 (QA) ── */
test('[QA 4] dólares sin doble conteo: el saldo en US$ al oficial y la percepción una sola vez, estimada hasta que llega la real', () => {
  const E = M.validarLectura(JSON.parse(readFileSync(new URL('./fixtures/mi-mes/dolares-rg5617.json', import.meta.url), 'utf8'))).lectura;
  let k = 0;
  const r = M.importarResumen(M.datosVacios(), E, { nuevoId: () => `q${k++}` });
  const d = r.datos;                                                   // tipo de cambio por defecto: oficial
  assert.equal(M.cambioDe(d, 'USD').valor, $(1_535));
  assert.match(M.cambioDe(d, 'USD').fuente, /oficial/i);
  const oct = M.resumenMes(d, '2026-10');
  assert.equal(oct.totTarjetas, $(507_130) + $(55) * 1_535, 'octubre: el total en pesos (que ya trae su percepción) + US$ 55 al oficial, sin otro 30 %');
  const nov = M.resumenMes(d, '2026-11');
  assert.equal(nov.percepciones[0].monto, Math.round($(55) * 1_535 * 0.3), 'noviembre: la percepción de esos US$, una vez y marcada estimada');
  // llega el resumen de noviembre con la percepción real: la estimada desaparece
  const sig = structuredClone(E);
  sig.vencimiento = '2026-11-11'; sig.cuotasAVencer = []; sig.totales = { ARS: $(30_000) };
  sig.consumos = []; sig.pagosYCreditos = []; sig.saldoAnterior = {}; sig.cargos = [{ fecha: null, concepto: 'DB.RG 5617 30%', monto: $(30_000), moneda: 'ARS', tipo: 'percepcion' }];
  const r2 = M.importarResumen(d, sig, { tarjetaId: r.tarjetaId, nuevoId: () => `z${k++}` });
  const nov2 = M.resumenMes(r2.datos, '2026-11');
  assert.deepEqual(nov2.percepciones, []);
  assert.equal(nov2.totTarjetas, $(30_000), 'solo la real');
});
test('[QA 4] compra nueva en dólares: cuenta con la percepción (todavía no se cobró en ningún resumen)', () => {
  const { d } = persona();
  d.cuotas.push({ id: 'usd', descripcion: 'App', total: $(100), moneda: 'USD', cantidad: 1, tarjetaId: 'otra', primerMes: '2026-12', fecha: '2026-10-10', origen: 'manual' });
  const c = M.resumenMes(d, '2026-12').cuotas.find(x => x.id === 'usd');
  assert.equal(c.monto, $(100) * 2_000 * 1.3);
});
test('[QA 5] una sola cuenta: Inicio, escalera, tope y "se te liberan" coinciden mes a mes (con tabla del banco y compras nuevas)', () => {
  const { d, tarjeta } = persona();
  d.cuotas.push({ id: 'n2', descripcion: 'Bici', total: $(250_040), moneda: 'ARS', cantidad: 2, tarjetaId: tarjeta, primerMes: '2026-12', fecha: '2026-11-02', origen: 'manual' });
  const e = M.escalera(d, '2026-10', 8);
  for (const f of e.filas) {
    const r = M.resumenMes(d, f.mes);
    assert.equal(f.total, r.totTarjetas, `escalera = Inicio en ${f.mes}`);
    assert.equal(M.limiteDelMes(d, f.mes).cuotas, r.totTarjetas, `tope = Inicio en ${f.mes}`);
    assert.equal(Object.values(f.porTarjeta).reduce((a, b) => a + b, 0), f.total, `por tarjeta suma el total en ${f.mes}`);
  }
  const dic = e.filas.find(f => f.mes === '2026-12');
  assert.equal(dic.porTarjeta[tarjeta], $(120_000) + $(125_020), 'tabla del banco + la compra nueva de esa tarjeta');
  assert.deepEqual(e.diferencias, [], 'la compra nueva no aparece como "falta cargar"');
  /* QA v2 · 1: "se te liberan" ya no es la baja del total (eso mezclaba resúmenes): son las cuotas que terminan */
  const lib = M.liberaciones(d, '2026-10', 8);
  for (const l of lib) {
    const terminan = d.cuotas.filter(c => c.cantidad >= 2 && M.ultimoMes(c) === M.sumarMeses(l.mes, -1));
    assert.ok(terminan.length, `en ${l.mes} se libera porque terminan cuotas`);
  }
  assert.deepEqual(lib.find(l => l.mes === '2027-02')?.libera, $(125_020) + $(30_000), 'en enero terminan la bici y las zapatillas');
});
test('[QA 7] al servidor de avisos va un alias: nunca el banco ni los últimos 4', () => {
  const todas = [{ id: 'a', red: 'Visa' }, { id: 'b', red: 'Visa' }, { id: 'c', red: 'Mastercard' }, { id: 'd', red: 'Otra' }];
  assert.deepEqual(todas.map(t => M.aliasTarjeta(t, todas)), ['Tarjeta Visa 1', 'Tarjeta Visa 2', 'Tarjeta Mastercard 1', 'Tarjeta 1']);
  assert.deepEqual(M.limpiarTarjetasAvisos([{ id: 'x', nombre: 'Galicia Visa ···4821', vencimiento: '2026-11-10' }]).map(t => t.nombre), ['Galicia Visa']);
});
test('[QA 6] el resumen de ejemplo solo en el archivo local; sin red o con error, falla y nada para guardar', () => {
  assert.deepEqual(M.decidirLectura({ local: true }), { usar: 'ejemplo', modo: 'local' });
  assert.equal(M.decidirLectura({ errorRed: true }).usar, 'falla');
  assert.match(M.decidirLectura({ errorRed: true }).mensaje, /revisá tu conexión/);
  assert.equal(M.decidirLectura({ status: 404, json: null }).usar, 'falla', 'un 404 sin JSON no es modo prueba');
  assert.equal(M.decidirLectura({ status: 501, json: null }).usar, 'falla');
  assert.deepEqual(M.decidirLectura({ status: 504, json: { ok: false, error: 'tardó' } }), { usar: 'falla', mensaje: 'tardó' });
  assert.deepEqual(M.decidirLectura({ status: 200, json: { ok: true, modo: 'prueba' } }), { usar: 'servidor', modo: 'prueba' });
  assert.deepEqual(M.decidirLectura({ status: 200, json: { ok: true, modo: 'real' } }), { usar: 'servidor', modo: 'real' });
});
test('[QA 14] la fuente del tipo de cambio solo acepta links https', () => {
  const d = M.migrar({ cambio: { USD: { valor: 150_000, fuente: 'x', url: 'javascript:alert(1)' }, EUR: { valor: 170_000, fuente: 'y', url: 'https://ejemplo.test' } } });
  assert.equal(d.cambio.USD.url, undefined);
  assert.equal(d.cambio.EUR.url, 'https://ejemplo.test');
});
test('[QA 20] manifest: nombre completo e íconos any y maskable por separado', () => {
  const m = JSON.parse(readFileSync(new URL('../api/_herramientas/mi-mes/manifest.webmanifest', import.meta.url), 'utf8'));
  assert.equal(m.name, 'Mi Mes by Orbit');
  assert.ok(m.icons.every(i => i.purpose === 'any' || i.purpose === 'maskable'));
  assert.ok(m.icons.some(i => i.purpose === 'maskable'));
});

test('[socio 15/10] resumen vencido: pagué el mínimo → el saldo pasa al mes siguiente con intereses estimados', () => {
  const d = M.datosVacios();
  d.ingresos.push({ id: 'i', nombre: 'Sueldo', monto: $(1_000_000), repite: true, desde: '2026-01' });
  d.tarjetas.push({ id: 'v', nombre: 'Visa', red: 'Visa', banco: '', ultimos4: '', color: 'azul' });
  d.resumenes.push({ id: 'r', tarjetaId: 'v', mes: '2026-10', cierre: '2026-09-26', vencimiento: '2026-10-09', totales: { ARS: $(300_000) },
    pagoMinimo: { moneda: 'ARS', monto: $(30_000) }, consumos: [], cargos: [], pagosYCreditos: [], vencidoAlImportar: true });
  const m = M.migrar(d);
  // importar marca el resumen vencido solo si ya había vencido ese día
  const l = M.validarLectura({ ...fixture('simple') }).lectura;
  assert.equal(M.importarResumen(M.datosVacios(), l, { hoy: '2026-09-02' }).datos.resumenes[0].vencidoAlImportar, true);
  assert.equal(M.importarResumen(M.datosVacios(), l, { hoy: '2026-08-25' }).datos.resumenes[0].vencidoAlImportar, undefined);
  const q = M.preguntas(m, '2026-10-15').ahora.find(x => x.tipo === 'pagado');
  assert.equal(q.titulo, 'Tu resumen de Visa venció el 9/10. ¿Ya lo pagaste?');
  assert.equal(M.resumenMes(m, '2026-11').totTarjetas, 0, 'sin respuesta no inventa deuda');
  const min = M.registrarPagoResumen(m, 'r', { estado: 'minimo' });
  // saldo 270.000; interés 270.000 × 80 % / 12 × 1,21 = 21.780
  const nov = M.resumenMes(min, '2026-11');
  assert.deepEqual(nov.financiados.map(f => [f.saldo, f.interes, f.estimado]), [[$(270_000), $(21_780), true]]);
  assert.equal(nov.totTarjetas, $(291_780));
  assert.equal(M.resumenMes(min, '2026-10').totTarjetas, $(30_000), 'octubre cuenta solo lo pagado (QA v2 · 2)');
  assert.equal(M.preguntas(min, '2026-10-15').ahora.some(x => x.tipo === 'pagado'), false);
  assert.equal(M.resumenMes(M.registrarPagoResumen(m, 'r', { estado: 'total' }), '2026-11').totTarjetas, 0);
  assert.equal(M.resumenMes(M.registrarPagoResumen(m, 'r', { estado: 'otro', monto: $(100_000) }), '2026-11').financiados[0].saldo, $(200_000));
  // cuando llega el resumen de noviembre, manda lo real
  const conNov = { ...min, resumenes: [...min.resumenes, { ...min.resumenes[0], id: 'r2', mes: '2026-11', vencimiento: '2026-11-09', totales: { ARS: $(295_000) }, pago: undefined }] };
  assert.equal(M.resumenMes(conNov, '2026-11').totTarjetas, $(295_000));
  assert.deepEqual(M.migrar(min).resumenes[0].pago, { estado: 'minimo' });
});

test('[socio 15/10] versión: app.js y version.json coinciden (aviso de recargar)', () => {
  const app = readFileSync(new URL('../api/_herramientas/mi-mes/app.js', import.meta.url), 'utf8');
  const v = JSON.parse(readFileSync(new URL('../api/_herramientas/mi-mes/version.json', import.meta.url), 'utf8')).v;
  assert.equal(app.match(/const VERSION = '([^']+)'/)[1], v);
});
