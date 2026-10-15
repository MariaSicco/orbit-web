import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../api/_herramientas/mi-mes/calculos.js';
import { TASAS, AVISO_LEGAL } from '../api/_herramientas/mi-mes/tasas.js';
import { FLAGS, flagsActivos } from '../api/_herramientas/mi-mes/flags.js';
import { readFileSync } from 'node:fs';

const base = (extra = {}) => ({ ...M.datosVacios(), ...extra });
const ing = { id: 'i', nombre: 'Sueldo', monto: 100_000_000, repite: true, desde: '2026-01', cobro: { tipo: 'del1al5' } };
const tarjeta = { id: 't1', nombre: 'Visa', red: 'Visa', banco: '', ultimos4: '', color: 'azul' };

test('consejo: orden de prioridad del informe y uno por vez', () => {
  const d = base({
    ingresos: [ing], tarjetas: [tarjeta],
    gastos: [{ id: 'p', nombre: 'Patente', categoria: 'Patente', monto: 21_000_000, repite: false, desde: '2027-03' },
      { id: 's1', nombre: 'Netflix', categoria: 'Suscripciones', monto: 1_000_000, repite: true, desde: '2026-01' },
      { id: 's2', nombre: 'Spotify', categoria: 'Suscripciones', monto: 500_000, repite: true, desde: '2026-01' }],
    cuotas: [{ id: 'c', descripcion: 'Heladera', total: 9_000_000, cantidad: 3, tarjetaId: 't1', primerMes: '2026-10', moneda: 'ARS' }],
  });
  const c = M.consejos(d, '2026-10-15');
  assert.deepEqual(c.map(x => x.tipo), ['libera', 'anual', 'diez', 'suscripciones']);
  assert.match(c[0].texto, /En enero 2027 se te liberan \$ 30\.000 por mes de cuotas/);
  assert.match(c[1].texto, /En marzo 2027 viene patente \(\$ 210\.000\)\. Separando \$ 42\.000 por mes desde hoy, llegás\./);
  assert.match(c[2].texto, /el 5 nov, cuando cobrás/);
  assert.match(c[3].texto, /Tenés 2 suscripciones por \$ 15\.000 al mes/);
  // nunca "deberías"
  for (const x of c) assert.doesNotMatch(x.texto, /deber[ií]as|gastaste de más/i);
  // descartado no vuelve
  assert.equal(M.consejos({ ...d, consejosVistos: [c[0].id] }, '2026-10-15')[0].tipo, 'anual');
});

test('consejo: intereses primero; con libres negativo, el negativo con salida y sin repetir la liberación', () => {
  const d = base({
    ingresos: [{ ...ing, monto: 1_000_000 }], tarjetas: [tarjeta],
    cuotas: [{ id: 'c', descripcion: 'Tele', total: 9_000_000, cantidad: 3, tarjetaId: 't1', primerMes: '2026-10', moneda: 'ARS' }],
    resumenes: [{ id: 'r', tarjetaId: 't1', mes: '2026-10', cierre: '2026-10-01', vencimiento: '2026-10-12', totales: { ARS: 5_000_000 }, consumos: [],
      cargos: [{ concepto: 'Intereses', monto: 1_840_000, moneda: 'ARS', tipo: 'interes' }] }],
  });
  const c = M.consejos(M.migrar(d), '2026-10-15');
  assert.equal(c[0].tipo, 'intereses');
  assert.match(c[0].texto, /pagaste \$ 18\.400 en intereses y cargos/);
  assert.equal(c[1].tipo, 'negativo');
  assert.equal(c.some(x => x.tipo === 'libera'), false);
});

test('meta: barra, cuánto por mes y victorias chicas', () => {
  const m = { nombre: 'Colchón', objetivo: 60_000_000, fecha: '2027-04', aportes: [{ fecha: '2026-09-08', monto: 12_000_000 }, { fecha: '2026-10-07', monto: 6_000_000 }] };
  const e = M.estadoMeta(m, '2026-10-15');
  assert.equal(e.separado, 18_000_000);
  assert.equal(e.falta, 42_000_000);
  assert.equal(e.meses, 6);
  assert.equal(e.porMes, 7_000_000);
  assert.equal(e.victoria, 'Ya separaste un cuarto de tu meta.');
  assert.equal(M.estadoMeta({ ...m, aportes: [{ fecha: '2026-10-01', monto: 30_000_000 }] }, '2026-10-15').victoria, 'Llegaste a la mitad de tu meta.');
  const lleg = M.estadoMeta({ ...m, aportes: [{ fecha: '2026-10-01', monto: 70_000_000 }] }, '2026-10-15');
  assert.deepEqual([lleg.llegaste, lleg.falta, lleg.avance], [true, 0, 1]);
  // fecha vencida: lo que falta, en un mes
  assert.equal(M.estadoMeta(m, '2027-06-01').meses, 1);
});

test('meta sugerida: con lo que se libera, o con el 10 % de lo libre', () => {
  const d = base({ ingresos: [ing], tarjetas: [tarjeta],
    cuotas: [{ id: 'c', total: 9_000_000, cantidad: 3, tarjetaId: 't1', primerMes: '2026-10', moneda: 'ARS' }] });
  const s = M.metaSugerida(d, '2026-10-15');
  assert.deepEqual([s.desde, s.porMes, s.objetivo, s.fecha], ['libera', 3_000_000, 18_000_000, '2027-04']);
  const s2 = M.metaSugerida(base({ ingresos: [ing] }), '2026-10-15');
  assert.deepEqual([s2.desde, s2.porMes, s2.objetivo], ['diez', 10_000_000, 60_000_000]);
  assert.equal(M.metaSugerida(base(), '2026-10-15'), null);
});

test('meta y retos: migrar guarda lo válido y descarta lo raro', () => {
  const d = M.migrar({ v: 4, meta: { nombre: 'Viaje', objetivo: 1000, fecha: '2027-01', aportes: [{ fecha: '2026-10-01', monto: 100 }, { fecha: 'x', monto: 5 }] },
    retos: { '2026-10': { id: 'pagar-total', estado: 'hecho' }, '2026-11': { id: 'inventado' }, 'raro': { id: 'sin-cuotas' } } });
  assert.deepEqual(d.meta.aportes, [{ fecha: '2026-10-01', monto: 100 }]);
  assert.deepEqual(d.retos, { '2026-10': { id: 'pagar-total', estado: 'hecho' } });
  assert.equal(M.migrar({ v: 4, meta: { objetivo: -1, fecha: '2027-01' } }).meta, undefined);
  assert.equal(M.retoDelMes(d, '2026-10').titulo, 'Pagá el total de una tarjeta');
  assert.equal(M.retoDelMes(d, '2026-11'), null);
});

test('retos: de un mes, sin rachas ni culpa', () => {
  assert.ok(M.RETOS.length >= 3 && M.RETOS.length <= 4);
  for (const r of M.RETOS) assert.doesNotMatch(`${r.titulo} ${r.texto}`, /racha|deber[ií]as|fallaste/i);
});

test('victorias: terminaste las cuotas de una tarjeta', () => {
  const d = base({ tarjetas: [tarjeta], cuotas: [{ id: 'c', total: 3, cantidad: 3, tarjetaId: 't1', primerMes: '2026-08', moneda: 'ARS' }] });
  assert.deepEqual(M.victorias(d, '2026-10-15').map(v => v.texto), ['Terminaste las cuotas de tu Visa.']);
  assert.deepEqual(M.victorias(d, '2027-02-01'), []);
});

test('rendir: interés simple con la fórmula del informe y aviso de dato viejo', () => {
  // $ 100.000 a 21,52 % TNA por 30 días = 100.000 × 0,2152 × 30 / 365 = $ 1.768,77
  assert.equal(M.interesSimple(10_000_000, 21.52, 30), 176_877);
  assert.equal(M.tnaMensual(21.52), 1.79);
  const r = M.calculoRendir(10_000_000, { tna: { min: 19, max: 24 } }, 30);
  assert.deepEqual(r, { min: 156_164, max: 197_260 });
  assert.equal(M.calculoRendir(0, { tna: { min: 1, max: 1 } }, 30), null);
  assert.equal(M.datoViejo('2026-10-09', '2026-10-16'), false);   // 7 días: todavía no
  assert.equal(M.datoViejo('2026-10-09', '2026-10-17'), true);    // 8 días: avisa
  assert.equal(M.datoViejo('', '2026-10-17'), true);
});

test('rendir: datos en un solo archivo, por categoría, con fuente y fecha, sin marcas ni referidos', () => {
  for (const o of TASAS.opciones) {
    assert.ok(o.nombre && o.que && o.fuente && M.esFecha(o.fecha) && o.tna.min <= o.tna.max, o.id);
    assert.ok(!o.url || /^https:\/\//.test(o.url));
    assert.doesNotMatch(JSON.stringify(o), /mercado ?pago|ual[aá]|naranja ?x|brubank|galicia|santander|bbva|ref=|utm_|referr?al|afiliad/i);
  }
  assert.ok(M.esFecha(TASAS.inflacion.fecha));
  assert.match(AVISO_LEGAL, /no una recomendación de inversión ni asesoramiento personalizado/);
});

test('interruptores: B4 sale apagado; ?flag= lo prende solo para probar', () => {
  assert.equal(FLAGS.dondeRinde, false);
  assert.equal(flagsActivos('').dondeRinde, false);
  assert.equal(flagsActivos('?flag=dondeRinde').dondeRinde, true);
  assert.equal(flagsActivos('?flag=inventado').inventado, undefined);
  // la app no deja prender interruptores por URL en el dominio de producción
  assert.match(readFileSync(new URL('../api/_herramientas/mi-mes/app.js', import.meta.url), 'utf8'), /orbitando\\\.com\\\.ar\$\/\.test\(location\.hostname\) \? ''/);
});

test('rendir: la pantalla no cruza los números del usuario con un producto', () => {
  const src = readFileSync(new URL('../api/_herramientas/mi-mes/app.js', import.meta.url), 'utf8');
  const bloque = src.slice(src.indexOf('/* ════════ DÓNDE PUEDE RENDIR'), src.indexOf('/* ════════ FIN DÓNDE PUEDE RENDIR'));
  assert.ok(bloque.length > 200, 'falta el bloque de la pantalla');
  assert.doesNotMatch(bloque, /resumenMes|\.libres|datos\.ingresos|datos\.gastos|estadoMeta|te conviene/);
});

test('meta sugerida: lo que dice la sugerencia coincide con lo que después muestra la meta', () => {
  const d = base({ ingresos: [ing], tarjetas: [tarjeta],
    cuotas: [{ id: 'c', total: 9_000_000, cantidad: 3, tarjetaId: 't1', primerMes: '2026-10', moneda: 'ARS' }] });
  const s = M.metaSugerida(d, '2026-10-15');
  const e = M.estadoMeta({ objetivo: s.objetivo, fecha: s.fecha, aportes: [] }, '2026-10-15');
  assert.deepEqual([e.meses, e.porMes], [6, s.porMes]);
});

test('fin de cuota: sin meta propone armar una; con meta, sumarla; asignado se recuerda', () => {
  const d = base({ ingresos: [ing], tarjetas: [tarjeta],
    cuotas: [{ id: 'c', descripcion: 'Heladera', total: 9_000_000, cantidad: 3, tarjetaId: 't1', primerMes: '2026-10', moneda: 'ARS' }] });
  const a = M.destinoLiberacion(d, '2026-10-15');
  assert.deepEqual([a.accion, a.lib.mes, a.lib.libera], ['crear', '2027-01', 3_000_000]);
  const d2 = M.asignarLiberacion(d, '2026-10-15');
  assert.deepEqual([d2.meta.nombre, d2.meta.objetivo, d2.meta.libera], ['Colchón', 18_000_000, [{ mes: '2027-01', monto: 3_000_000 }]]);
  assert.equal(d.meta, undefined, 'no toca los datos originales');
  const b = M.destinoLiberacion(d2, '2026-10-15');
  assert.equal(b.asignado, true);
  assert.match(b.texto, /Desde enero, los \$ 30\.000 que se liberan van a tu meta Colchón/);
  assert.equal(M.asignarLiberacion(d2, '2026-10-15'), d2, 'no asigna dos veces');
  // con una meta propia
  const d3 = { ...d, meta: { nombre: 'Vacaciones', objetivo: 50_000_000, fecha: '2027-06', aportes: [] } };
  assert.match(M.destinoLiberacion(d3, '2026-10-15').texto, /¿Los sumás a tu meta Vacaciones\?/);
  // "Separé $ X": antes de enero, el ritmo de la meta; desde enero, lo que se liberó
  const m = M.asignarLiberacion(d3, '2026-10-15').meta;
  assert.deepEqual(M.aporteSugerido(m, '2026-11-01'), { monto: Math.ceil(50_000_000 / 7 / 100) * 100, deLibera: false });
  assert.deepEqual(M.aporteSugerido(m, '2027-01-05'), { monto: 3_000_000, deLibera: true });
  // migrar conserva el destino
  assert.deepEqual(M.migrar({ v: 4, meta: m }).meta.libera, [{ mes: '2027-01', monto: 3_000_000 }]);
});
