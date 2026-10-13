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
  d.cuotas.push({ id: 'nueva', descripcion: 'Zapatillas', total: $(90_000), moneda: 'ARS', cantidad: 3, tarjetaId: 'otra', primerMes: '2026-11', fecha: '2026-10-05' });
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
  assert.equal(nov.totTarjetas, $(150_000));
  assert.equal(nov.totAnteriores, $(120_000));
  assert.equal(nov.dentroDeResumen.length, 1, 'la cuota detectada no se cuenta dos veces');
});
test('crédito por tarjeta: resumen sin vencer + cuotas que vienen (tabla) + compras nuevas', () => {
  const { d, tarjeta } = persona();
  const c = M.creditoTarjeta(d, tarjeta, '2026-10-05');
  assert.equal(c.resumen, $(507_130) + $(110_000), 'US$ 55 a 2.000');
  assert.equal(c.futuras, $(120_000) * 3 + $(960_000), 'nov, dic, ene y "a partir de"');
  assert.equal(c.nuevas, 0);
  assert.equal(c.total, c.resumen + c.futuras);
  // vencido el resumen, el saldo ya no se debe (se pagó) y las cuotas que vienen siguen
  assert.equal(M.creditoTarjeta(d, tarjeta, '2026-10-20').resumen, 0);
  const otra = M.creditoTarjeta(d, 'otra', '2026-10-05');
  assert.deepEqual([otra.resumen, otra.futuras, otra.nuevas], [0, 0, $(90_000)]);
  const tot = M.creditoTotal(d, '2026-10-05');
  assert.equal(tot.total, c.total + otra.total);
  assert.equal(tot.nuevas, $(90_000));
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
  d.cuotas.push({ id: 'tele', descripcion: 'Tele', total: $(1_400_000), moneda: 'ARS', cantidad: 2, tarjetaId: 'otra', primerMes: '2026-11', fecha: '2026-10-06' });
  const b = M.alertasCredito(d, '2026-10-05', 6);
  const nov = b.find(x => x.mes === '2026-11');
  assert.equal(nov.nivel, 'aviso');
  assert.deepEqual([nov.anteriores, nov.nuevas], [$(120_000), $(30_000) + $(700_000)]);
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
  r.datos.cuotas.push({ id: 'manual', descripcion: 'Heladera', total: $(600_000), moneda: 'ARS', cantidad: 6, tarjetaId: r.tarjetaId, primerMes: '2026-10', fecha: '2026-09-02', ...extra });
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
