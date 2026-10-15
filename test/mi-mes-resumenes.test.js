/* Mi Mes by Orbit · resúmenes con la estructura de los bancos reales
   (fixtures INVENTADOS en test/fixtures/mi-mes: sin datos de nadie).
   - simple: un consumo, saldo anterior 0, límites y próximas fechas.
   - adicional-creditos: titular + adicional, créditos provisorios y su
     reversión, intereses e IVA, tabla "cuotas a vencer".
   - dolares-rg5617: pesos y dólares, pago en USD, percepción RG 5617
     cobrada y devuelta, sellos, tabla "cuotas a vencer". */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const M = await import('../api/_herramientas/mi-mes/calculos.js');
const fixture = n => JSON.parse(readFileSync(new URL(`./fixtures/mi-mes/${n}.json`, import.meta.url), 'utf8'));
const $ = p => Math.round(p * 100);
const importar = (n, datos = M.datosVacios()) => {
  const v = M.validarLectura(fixture(n));
  assert.equal(v.ok, true, v.errores?.join(' '));
  let k = 0;
  return M.importarResumen(datos, v.lectura, { nuevoId: () => `${n}-${k++}` });
};

test('los tres cierran: saldo anterior + pagos y créditos + consumos + cargos = total, por moneda', () => {
  for (const n of ['simple', 'adicional-creditos', 'dolares-rg5617']) assert.deepEqual(M.cuadreLectura(fixture(n)), { ok: true, motivos: [] }, n);
});
test('si falta una línea o se lee mal un signo, deja de cerrar', () => {
  const a = fixture('adicional-creditos');
  a.pagosYCreditos = a.pagosYCreditos.filter(x => x.tipo !== 'reversion');          // se perdieron las reversiones
  assert.equal(M.cuadreLectura(a).ok, false);
  const d = fixture('dolares-rg5617');
  d.cargos.find(c => c.tipo === 'devolucion').monto *= -1;                            // devolución leída en positivo
  assert.equal(M.cuadreLectura(d).ok, false);
  const s = fixture('adicional-creditos');
  s.consumos.find(c => c.tarjeta === '3333').tarjeta = '2222';                        // consumo en la tarjeta equivocada
  assert.match(M.cuadreLectura(s).motivos.join(' '), /subtotal/);
});
test('validación: separa consumos, pagos y créditos, y cargos; pasa todo a centavos', () => {
  const { lectura: l } = M.validarLectura(fixture('dolares-rg5617'));
  assert.deepEqual([l.consumos.length, l.pagosYCreditos.length, l.cargos.length], [7, 3, 5]);
  assert.deepEqual(l.saldoAnterior, { ARS: $(1_200_000), USD: $(300) });
  assert.deepEqual(l.totales, { ARS: $(507_130), USD: $(55) });
  assert.deepEqual(l.cargos.map(c => c.tipo).sort(), ['devolucion', 'interes', 'iva', 'percepcion', 'sellos']);
  assert.deepEqual([l.proximoCierre, l.proximoVencimiento], ['2026-10-29', '2026-11-11']);
  assert.deepEqual(l.limites, { compra: $(3_000_000), financiacion: $(2_700_000) });
  assert.equal(l.cuotasAVencer.find(c => c.desde).mes, '2027-01');
});
test('importar: cargos y pagos quedan aparte y no cuentan como gasto por rubro', () => {
  const r = importar('dolares-rg5617');
  const res = r.datos.resumenes[0];
  assert.equal(res.cargos.length, 5);
  assert.equal(res.pagosYCreditos.length, 3);
  r.datos.cambio = { USD: { valor: $(2_000), fuente: 'p', fecha: '2026-10-13' } };
  const rubros = M.gastoPorRubro(res, r.datos);
  const totalRubros = rubros.reduce((s, x) => s + x.ars, 0);
  assert.equal(totalRubros, $(483_500) + $(55) * 2_000, 'solo consumos: 483.500 en pesos + US$ 55');
  // el total del mes es lo que hay que pagar (con cargos e impuestos)
  assert.equal(M.tarjetaEnMes(r.datos, r.tarjetaId, '2026-10').total, $(507_130) + $(55) * 2_000);
});
test('importar: la adicional es parte de la misma tarjeta y la reconoce en el resumen siguiente', () => {
  const r = importar('adicional-creditos');
  assert.equal(r.datos.tarjetas.length, 1);
  assert.deepEqual([r.datos.tarjetas[0].ultimos4, r.datos.tarjetas[0].adicionales], ['2222', ['3333']]);
  const sig = fixture('adicional-creditos');
  sig.tarjeta.ultimos4 = null;                                                       // el siguiente solo muestra la adicional
  sig.tarjetas = [{ ultimos4: '3333', adicional: true, totales: [] }];
  sig.vencimiento = '2026-10-02';
  const v = M.validarLectura(sig);
  const r2 = M.importarResumen(r.datos, v.lectura, { nuevoId: () => 'x' + Math.random() });
  assert.equal(r2.datos.tarjetas.length, 1, 'no crea otra tarjeta');
  assert.equal(r2.tarjetaId, r.tarjetaId);
});
test('importar: los límites del resumen se cargan solos en la tarjeta', () => {
  const r = importar('simple');
  assert.deepEqual([r.datos.tarjetas[0].limite, r.datos.tarjetas[0].limiteFinanciacion], [$(900_000), $(700_000)]);
  const disp = M.disponibleTarjeta(r.datos, r.tarjetaId, '2026-08');
  assert.equal(disp.limite, $(900_000));
});
test('cuotas a vencer: el mes de la tabla es el del cierre; se paga con el vencimiento siguiente', () => {
  const r = importar('dolares-rg5617');
  assert.equal(M.desfaseCuotasAVencer(fixture('dolares-rg5617')), 1);
  assert.deepEqual(r.datos.resumenes[0].cuotasAVencer.map(c => [c.mes, c.mesPago]),
    [['2026-10', '2026-11'], ['2026-11', '2026-12'], ['2026-12', '2027-01'], ['2027-01', '2027-02']]);
});
test('escalera: usa la tabla del banco para esos meses y la cruza con la proyección propia', () => {
  const coherente = importar('dolares-rg5617');
  const e1 = M.escalera(coherente.datos, '2026-11', 4);
  // noviembre suma la percepción estimada de los US$ 55 de octubre al oficial por defecto: 55 × 1.535 × 30 % = 25.327,50
  assert.deepEqual(e1.filas.map(f => f.total / 100), [120_000 + 25_327.5, 120_000, 120_000, 120_000]);
  assert.deepEqual(e1.filas.map(f => f.delBanco.length > 0), [true, true, true, false]);
  assert.deepEqual(e1.diferencias, [], 'la tabla y la proyección coinciden');
  assert.equal(e1.mesLibre, '2027-10', 'cuota 1/12 de septiembre: la última se paga en septiembre 2027');
  const distinta = importar('adicional-creditos');
  const e2 = M.escalera(distinta.datos, '2026-10', 3);
  assert.equal(e2.filas[0].total, $(184_000), 'manda el banco');
  assert.deepEqual(e2.diferencias.map(d => [d.mes, d.banco / 100, d.propio / 100]), [['2026-10', 184_000, 199_000], ['2026-11', 169_000, 184_000], ['2026-12', 40_000, 94_000]]);
});
test('alertas y push: cuando vence el resumen, siguen con el próximo cierre y vencimiento que trajo', () => {
  const r = importar('simple');                                                     // vence 01/09; próximo cierre 24/09, vence 06/10
  assert.equal(M.cicloTarjeta(r.datos, r.tarjetaId, '2026-08-25').vencimiento, '2026-09-01');
  const c = M.cicloTarjeta(r.datos, r.tarjetaId, '2026-09-10');
  assert.deepEqual([c.cierre, c.vencimiento, c.origen], ['2026-09-24', '2026-10-06', 'proximo']);
  assert.equal(M.alertasTarjetas(r.datos, '2026-10-03').find(a => a.tipo === 'vence').dias, 3);
  const p = M.datosParaAvisos(r.datos, '2026-08-25');
  assert.deepEqual([p[0].proximoCierre, p[0].proximoVencimiento], ['2026-09-24', '2026-10-06']);
  const limpias = M.limpiarTarjetasAvisos(p);
  assert.equal(M.avisosPushDeHoy(limpias, '2026-09-24')[0].title, 'Cerró el resumen de tu Tarjeta Visa 1');
  assert.equal(M.avisosPushDeHoy(limpias, '2026-10-05')[0].title, 'Tu Tarjeta Visa 1 vence mañana');
  assert.doesNotMatch(JSON.stringify(limpias), /Banco|Inventado|1111/, 'ni banco ni últimos 4');
  assert.doesNotMatch(JSON.stringify(limpias), /215340|900000/, 'sin montos');
});
test('migrar: los resúmenes guardados conservan cargos, pagos, adicionales y la tabla', () => {
  const r = importar('adicional-creditos');
  const d = M.migrar(JSON.parse(JSON.stringify(r.datos)));
  const res = d.resumenes[0];
  assert.deepEqual([res.cargos.length, res.pagosYCreditos.length, res.tarjetas.length, res.cuotasAVencer.length], [2, 5, 2, 4]);
  assert.deepEqual(d.tarjetas[0].adicionales, ['3333']);
  assert.ok(res.consumos.every(c => c.tarjeta === '2222' || c.tarjeta === '3333'));
});

test('[socio 15/10] comercio sin moneda ni monto pegados, y rubros Hogar y Educación', () => {
  assert.equal(M.limpiarComercio('RUNWAY PRO PLAN csliveb1uUSD 35,00'), 'RUNWAY PRO PLAN');
  assert.equal(M.limpiarComercio('WWW.MAKE.COM USD 10,59'), 'WWW.MAKE.COM');
  assert.equal(M.limpiarComercio('MERPAGO*KIOSCO 24'), 'MERPAGO*KIOSCO 24', 'no toca números que no son monto en moneda');
  assert.equal(M.limpiarComercio('USD 10,59'), 'USD 10,59', 'si quedaría vacío, deja el original');
  assert.equal(M.rubroPorRegla('EASY SUC 23'), 'Hogar');
  assert.equal(M.rubroPorRegla('SODIMAC SAN ISIDRO'), 'Hogar');
  assert.equal(M.rubroPorRegla('WWW.UADE.EDU.AR'), 'Educación');
  assert.equal(M.rubroPorRegla('UNIVERSIDAD INVENTADA'), 'Educación');
  assert.equal(M.rubroPorRegla('Instituto de Inglés'), 'Educación');
  assert.equal(M.rubroPorRegla('SUPERMERCADO EJEMPLO'), null);
  // la corrección de la persona gana sobre la regla
  assert.equal(M.rubroPara('EASY SUC 23', 'Otros', { 'EASY SUC': 'Otros' }), 'Otros');
  assert.equal(M.rubroPara('EASY SUC 23', 'Otros'), 'Hogar');
  const v = M.validarLectura({ ...fixture('simple'), consumos: [{ fecha: '2026-08-13', comercio: 'WWW.MAKE.COM USD 10,59', monto: 10.59, moneda: 'USD', rubro: 'Otros', cuota: null, tarjeta: null }] });
  assert.equal(v.lectura.consumos[0].comercio, 'WWW.MAKE.COM');
});
