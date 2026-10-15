/* Mi Mes · arreglos de la QA v2 (reports/qa/2026-10-15-mi-mes-v2.md). Cada test reproduce un hallazgo. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const M = await import('../api/_herramientas/mi-mes/calculos.js');
const $ = p => Math.round(p * 100);
const fixture = n => JSON.parse(readFileSync(new URL(`./fixtures/mi-mes/${n}.json`, import.meta.url), 'utf8'));

/* ── QA v2 · 1: "se te liberan" solo de cuotas que terminan ── */
function conResumenDeUnPago() {
  const d = M.datosVacios();
  d.ingresos.push({ id: 'i', nombre: 'Sueldo', monto: $(1_000_000), repite: true, desde: '2026-01' });
  d.tarjetas.push({ id: 't', nombre: 'Visa', red: 'Visa', banco: '', ultimos4: '', color: 'azul' });
  d.resumenes.push({ id: 'r', tarjetaId: 't', mes: '2026-11', cierre: '2026-10-28', vencimiento: '2026-11-08', totales: { ARS: $(400_000) },
    consumos: [{ fecha: '2026-10-10', comercio: 'SUPER', monto: $(400_000), moneda: 'ARS', rubro: 'Supermercado', cuota: null }], cargos: [], pagosYCreditos: [] });
  return M.migrar(d);
}
test('[QA2 · 1] un resumen de consumos en un pago no "libera" nada', () => {
  const d = conResumenDeUnPago();
  assert.deepEqual(M.liberaciones(d, '2026-10', 6), []);
  assert.equal(M.proximaLiberacion(d, '2026-10'), null);
  assert.equal(M.consejos(d, '2026-10-15').some(c => c.tipo === 'libera'), false);
  assert.equal(M.destinoLiberacion(d, '2026-10-15'), null);
  const s = M.metaSugerida(d, '2026-10-15');
  assert.notEqual(s?.desde, 'libera');
});
test('[QA2 · 1] libera = cuotas cuyo último pago es X, desde X+1; las compras nuevas no la tapan', () => {
  const d = conResumenDeUnPago();
  d.cuotas.push({ id: 'a', descripcion: 'Heladera', total: $(90_000), moneda: 'ARS', cantidad: 3, tarjetaId: 't', primerMes: '2026-10', origen: 'manual' },
    { id: 'u', descripcion: 'Un pago', total: $(50_000), moneda: 'ARS', cantidad: 1, tarjetaId: 't', primerMes: '2026-12', origen: 'manual' },
    { id: 'n', descripcion: 'Tele', total: $(600_000), moneda: 'ARS', cantidad: 6, tarjetaId: 't', primerMes: '2027-01', origen: 'manual' });
  assert.deepEqual(M.liberaciones(d, '2026-10', 6).map(x => [x.mes, x.libera]), [['2027-01', $(30_000)]]);
});

/* ── QA v2 · 2: "Pagué el mínimo" en un resumen vencido ── */
const { resumenEjemplo } = await import('../api/_herramientas/mi-mes/ejemplo.js');
function vencidoDeEjemplo() {
  // el ejemplo armado en septiembre vence el 8/10; hoy es 15/10
  const l = M.validarLectura(resumenEjemplo(new Date(2026, 8, 20))).lectura;
  const r = M.importarResumen(M.datosVacios(), l, { nuevoId: () => 'r' + Math.random().toString(36).slice(2, 8), hoy: '2026-10-15' });
  const d = r.datos;
  d.ingresos.push({ id: 'i', nombre: 'Sueldo', monto: $(1_000_000), repite: true, desde: '2026-01' });
  return { d, res: d.resumenes[0], tarjeta: r.tarjetaId };
}
test('[QA2 · 2] los números del informe: total $ 555.496, mínimo $ 44.000', () => {
  const { d, res } = vencidoDeEjemplo();
  assert.equal(res.vencimiento, '2026-10-08');
  assert.equal(res.vencidoAlImportar, true);
  assert.equal(Math.round(M.totalResumen(res, d).ars / 100), 555_496);
});
test('[QA2 · 2] pagué el mínimo: octubre cuenta lo pagado y el impago pasa a noviembre una sola vez, con intereses', () => {
  const { d, res, tarjeta } = vencidoDeEjemplo();
  const total = M.totalResumen(res, d).ars;
  const antes = M.creditoTotal(d, '2026-10-15').total;
  const m = M.registrarPagoResumen(d, res.id, { estado: 'minimo' });
  const oct = M.resumenMes(m, '2026-10'), nov = M.resumenMes(m, '2026-11');
  assert.equal(oct.totResumenes, $(44_000), 'octubre: solo lo pagado');
  const f = nov.financiados[0];
  assert.equal(f.saldo, total - $(44_000), 'noviembre: el saldo impago');
  assert.equal(Math.round(f.saldo / 100), 511_496);
  // en los dos meses juntos, el resumen cuenta UNA vez (más intereses)
  assert.equal(oct.totResumenes + f.saldo, total);
  // y aparece en lo que debés
  const cr = M.creditoTotal(m, '2026-10-15');
  assert.equal(cr.porTarjeta.find(x => x.tarjetaId === tarjeta).financiado, f.saldo + f.interes);
  assert.equal(cr.total, antes + f.saldo + f.interes);
});
test('[QA2 · 2] pagué el total: octubre cuenta el total y no hay deuda; todavía no: octubre 0, todo a noviembre', () => {
  const { d, res } = vencidoDeEjemplo();
  const total = M.totalResumen(res, d).ars;
  const t = M.registrarPagoResumen(d, res.id, { estado: 'total' });
  assert.equal(M.resumenMes(t, '2026-10').totResumenes, total);
  assert.deepEqual(M.resumenMes(t, '2026-11').financiados, []);
  const no = M.registrarPagoResumen(d, res.id, { estado: 'no' });
  assert.equal(M.resumenMes(no, '2026-10').totResumenes, 0);
  assert.equal(M.resumenMes(no, '2026-11').financiados[0].saldo, total);
});

/* ── QA v2 · 3: la percepción no se estima otra vez si el resumen ya la trae ── */
test('[QA2 · 3] resumen con "DB.RG 5617" cobrado: el mes siguiente no suma otra percepción', () => {
  const E = M.validarLectura(fixture('dolares-rg5617')).lectura;
  assert.ok(E.cargos.some(c => c.tipo === 'percepcion' && c.monto > 0), 'el fixture trae la percepción cobrada');
  const r = M.importarResumen(M.datosVacios(), E, { nuevoId: () => 'p' + Math.random().toString(36).slice(2, 8) });
  assert.equal(M.percepcionEstimada(r.datos.resumenes[0], r.datos), 0);
  assert.deepEqual(M.resumenMes(r.datos, '2026-11').percepciones, []);
  assert.equal(M.creditoTotal(r.datos, '2026-10-01').percepcion, 0);
});
test('[QA2 · 3] sin percepción cobrada: se estima para el saldo en US$ de ESE resumen, en el siguiente, y se va con el real', () => {
  const E = M.validarLectura(fixture('dolares-rg5617')).lectura;
  E.cargos = E.cargos.filter(c => c.tipo !== 'percepcion');
  const r = M.importarResumen(M.datosVacios(), E, { nuevoId: () => 'p' + Math.random().toString(36).slice(2, 8) });
  const usd = r.datos.resumenes[0].totales.USD;
  assert.equal(M.resumenMes(r.datos, '2026-11').percepciones[0].monto, Math.round(M.aPesos(usd, 'USD', r.datos) * 0.3));
  assert.deepEqual(M.resumenMes(r.datos, '2026-12').percepciones, [], 'una sola vez');
});

/* ── QA v2 · 4: gasto fijo que se paga con tarjeta, una sola vez ── */
function conNetflix(tarjetaId) {
  const d = M.datosVacios();
  d.ingresos.push({ id: 'i', nombre: 'Sueldo', monto: $(1_000_000), repite: true, desde: '2026-01' });
  d.tarjetas.push({ id: 'v', nombre: 'Visa', red: 'Visa', banco: '', ultimos4: '', color: 'azul', diaCierre: 28, diaVence: 8 });
  d.gastos.push({ id: 'nf', nombre: 'Netflix', categoria: 'Suscripciones', monto: $(15_000), repite: true, desde: '2026-01', ...(tarjetaId ? { tarjetaId } : {}) });
  d.resumenes.push({ id: 'r', tarjetaId: 'v', mes: '2026-11', cierre: '2026-10-28', vencimiento: '2026-11-08', totales: { ARS: $(15_000) },
    consumos: [{ fecha: '2026-10-12', comercio: 'NETFLIX.COM', monto: $(15_000), moneda: 'ARS', rubro: 'Suscripciones', cuota: null }], cargos: [], pagosYCreditos: [] });
  return M.migrar(d);
}
test('[QA2 · 4] Netflix marcado con la Visa: con resumen, no se resta aparte', () => {
  const d = conNetflix('v');
  const nov = M.resumenMes(d, '2026-11');
  assert.equal(nov.totGastos + nov.totTarjetas, $(15_000), 'una sola vez, adentro del resumen');
  assert.equal(nov.libres, $(985_000));
});
test('[QA2 · 4] sin resumen importado, cuenta una vez como gasto de la tarjeta', () => {
  const d = conNetflix('v');
  const dic = M.resumenMes(d, '2026-12');
  assert.equal(dic.totGastos, 0);
  assert.equal(dic.totTarjetas, $(15_000));
  assert.equal(M.comprometidoMes(d, '2026-12').porTarjeta.v, $(15_000));
  assert.equal(dic.libres, $(985_000));
  // el día de vencimiento de la tarjeta lo lleva; no es un pago aparte
  assert.equal(M.lineaDelMes(d, '2026-12').filter(e => e.nombre === 'Netflix').length, 0);
});
test('[QA2 · 4] sin marcar, el motor pregunta si va con la tarjeta (lo vio en el resumen) y el consejo no suma doble', () => {
  const d = conNetflix(null);
  const q = M.preguntas(d, '2026-11-02').ahora.find(x => x.tipo === 'gastoTarjeta');
  assert.equal(q.titulo, '¿Netflix se paga con Visa? Lo vimos en el resumen.');
  assert.equal(q.impacto, $(15_000));
  const c = M.consejos({ ...d, gastos: [...d.gastos, { id: 'sp', nombre: 'Spotify', categoria: 'Suscripciones', monto: $(5_000), repite: true, desde: '2026-01' }] }, '2026-11-02')
    .find(x => x.tipo === 'suscripciones');
  assert.match(c.texto, /Tenés 2 suscripciones por \$ 20\.000/);
});

/* ── QA v2 · 5: consejo de intereses ── */
function conCargos(cargos, vencimiento = '2026-10-08') {
  const d = M.datosVacios();
  d.ingresos.push({ id: 'i', nombre: 'Sueldo', monto: $(1_000_000), repite: true, desde: '2026-01' });
  d.tarjetas.push({ id: 'v', nombre: 'Visa', red: 'Visa', banco: '', ultimos4: '', color: 'azul' });
  d.resumenes.push({ id: 'r', tarjetaId: 'v', mes: '2026-10', cierre: '2026-09-26', vencimiento, totales: { ARS: $(300_000) }, consumos: [], pagosYCreditos: [], cargos });
  return M.migrar(d);
}
const cargo = (tipo, monto) => ({ fecha: null, concepto: tipo.toUpperCase(), monto: $(monto), moneda: 'ARS', tipo });
test('[QA2 · 5] sin intereses (solo sellos y percepción) no dice "pagando el total baja a cero"', () => {
  const d = conCargos([cargo('sellos', 1_200), cargo('percepcion', 33_726), cargo('devolucion', -679)]);
  assert.equal(M.consejos(d, '2026-10-15').some(c => c.tipo === 'intereses'), false);
  const c = M.cargosDelResumen(d.resumenes[0], d);
  assert.deepEqual([c.intereses, c.impuestos], [0, $(34_247)]);
});
test('[QA2 · 5] separa intereses de impuestos y percepciones; "baja a cero" solo para intereses', () => {
  const d = conCargos([cargo('interes', 18_000), cargo('iva', 3_780), cargo('sellos', 1_200), cargo('percepcion', 10_000)]);
  const c = M.consejos(d, '2026-10-15').find(x => x.tipo === 'intereses');
  assert.equal(c.texto, 'Este resumen te cobró $ 18.000 de intereses (por no pagar el total) y $ 14.980 de impuestos y percepciones. Pagando el total, los intereses bajan a cero.');
  assert.doesNotMatch(c.texto, /pagaste/);
});
test('[QA2 · 5] si el resumen todavía no venció, "te cobra" y nada de pagar de más', () => {
  const d = conCargos([cargo('interes', 18_000)], '2026-10-20');
  const c = M.consejos(d, '2026-10-15').find(x => x.tipo === 'intereses');
  assert.match(c.texto, /^Este resumen te cobra \$ 18\.000 de intereses/);
  assert.doesNotMatch(c.texto, /pagaste|de más/);
});

/* ── QA v2 · 6: TNA del saldo impago ── */
test('[QA2 · 6] la TNA del propio resumen manda; si no viene, el supuesto editable', () => {
  const l = M.validarLectura({ ...fixture('simple'), tasas: { tnaFinanciacion: 96.5, tnaPunitorios: null } }).lectura;
  assert.equal(l.tnaFinanciacion, 96.5);
  assert.equal(M.validarLectura({ ...fixture('simple'), tasas: { tnaFinanciacion: 'mucho' } }).lectura.tnaFinanciacion, null);
  const r = M.importarResumen(M.datosVacios(), l, { nuevoId: () => 'q' });
  assert.equal(r.datos.resumenes[0].tna, 96.5);
  assert.equal(M.migrar(r.datos).resumenes[0].tna, 96.5);
  const d = M.registrarPagoResumen(r.datos, 'q', { estado: 'no' });
  const f = M.financiacionEstimada(d.resumenes[0], d);
  assert.deepEqual([f.tna, f.tnaDe], [96.5, 'resumen']);
  delete d.resumenes[0].tna;
  const g = M.financiacionEstimada(d.resumenes[0], d);
  assert.deepEqual([g.tna, g.tnaDe], [80, 'supuesto']);
  d.supuestos = { financiacion: { valor: 110, fecha: '2026-10-15' } };
  assert.deepEqual([M.financiacionEstimada(d.resumenes[0], d).tna, M.financiacionEstimada(d.resumenes[0], d).tnaDe], [110, 'tuya']);
});
test('[QA2 · 6] el esquema del lector pide la TNA y el prompt dice cómo', async () => {
  const lector = await import('../api/_lib/mi-mes-lector.js');
  assert.ok(lector.ESQUEMA.properties.tasas);
  assert.match(readFileSync(new URL('../api/_lib/mi-mes-lector.js', import.meta.url), 'utf8'), /"tasas": la TNA de financiación/);
});

test('[QA2] todo lo que app.js importa existe en calculos.js', async () => {
  const src = readFileSync(new URL('../api/_herramientas/mi-mes/app.js', import.meta.url), 'utf8');
  const lista = src.match(/import \{([^}]*)\} from '\.\/calculos\.js'/)[1].split(',').map(x => x.trim().split(' as ')[0]).filter(Boolean);
  for (const n of lista) assert.ok(n in M, `falta ${n}`);
  // y lo que usa con nombre de calculos (funciones exportadas) está importado
  for (const n of Object.keys(M)) {
    const usa = new RegExp(`(^|[^.\\w$])${n}\\(`).test(src);
    const local = new RegExp(`(function|const|let) ${n}\\b`).test(src);
    if (usa && !local) assert.ok(lista.includes(n), `app.js usa ${n} sin importarlo`);
  }
});

/* ── QA v2 · 7: compartidas y bandeja por moneda ── */
test('[QA2 · 7] te deben: US$ y pesos no se mezclan; reclamo en la moneda de la compra y con ¡', () => {
  const d = M.datosVacios();
  d.tarjetas.push({ id: 'v', nombre: 'Visa', red: 'Visa', banco: '', ultimos4: '', color: 'azul' });
  d.cuotas.push({ id: 'p', descripcion: 'Pasajes', total: 60_000, moneda: 'USD', cantidad: 1, tarjetaId: 'v', primerMes: '2026-10', origen: 'manual', compartida: { con: 'Juli', tipo: '%', valor: 50 } });
  d.devolver = [{ id: 'r', tipo: 'reintegro', motivo: 'Promo', monto: $(20_000), fecha: '2026-10-01', esperada: '2026-10-30' }];
  const b = M.bandejaDevolver(M.migrar(d), '2026-10-15');
  assert.deepEqual(b.totales, { ARS: $(20_000), USD: 30_000 });
  const juli = b.pendientes.find(x => x.origen === 'compartida');
  assert.equal(juli.moneda, 'USD');
  assert.equal(M.mensajeReclamo(juli), '¡Hola, Juli! Te escribo por su parte de Pasajes: quedan US$ 300 pendientes. ¿Cuándo te queda cómodo? ¡Gracias!');
});

/* ── QA v2 · 7: gastoEstimado sin bombardeo, y "lo di de baja" sin inflar el mes ── */
function conSeisGastos() {
  const d = M.datosVacios();
  d.ingresos.push({ id: 'i', nombre: 'Sueldo', monto: $(1_000_000), repite: true, desde: '2026-01' });
  ['Alquiler', 'Expensas', 'Luz', 'Gas', 'Internet', 'Gimnasio'].forEach((n, i) => d.gastos.push({ id: `g${i}`, nombre: n, categoria: 'Otros', monto: $(10_000 * (i + 1)), repite: true, desde: '2026-01' }));
  return M.migrar(d);
}
test('[QA2 · 7] gastoEstimado: con muchos gastos, una sola pregunta "¿Siguen igual tus 6 gastos fijos?"', () => {
  const p = M.preguntas(conSeisGastos(), '2026-10-15', { gastoEstimado: true });
  const est = [...p.ahora, ...p.masTarde].filter(x => x.tipo === 'estimado' || x.tipo === 'estimados');
  assert.equal(est.length, 1);
  assert.equal(est[0].titulo, '¿Siguen igual tus 6 gastos fijos este mes?');
  assert.equal(est[0].accion, 'Sí, todos');
  assert.equal(est[0].impacto, $(210_000));
  const todos = M.confirmarTodos(conSeisGastos(), '2026-10');
  assert.equal(M.preguntas(todos, '2026-10-15', { gastoEstimado: true }).ahora.filter(x => x.tipo.startsWith('estimado')).length, 0);
});
test('[QA2 · 7] lo di de baja: si ya se cobró este mes (por defecto), el mes en curso no cambia', () => {
  const d = conSeisGastos();
  const b = M.darDeBajaGasto(d, 'g5', '2026-10');
  assert.equal(M.resumenMes(b.datos, '2026-10').libres, M.resumenMes(d, '2026-10').libres, 'octubre igual: la plata ya salió');
  assert.equal(M.resumenMes(b.datos, '2026-11').totGastos, M.resumenMes(d, '2026-11').totGastos - $(60_000));
  const n = M.darDeBajaGasto(d, 'g5', '2026-10', { cobradoEsteMes: false });
  assert.equal(M.resumenMes(n.datos, '2026-10').totGastos, M.resumenMes(d, '2026-10').totGastos - $(60_000));
});

test('[QA2 · 10 y 12] foto de una copia sin números se descarta; tarjeta sin nada ese mes no muestra "−$ 0"', () => {
  const m = M.migrar({ v: 4, fotoBase: { desde: '2026-10', meses: { '2026-10': { libres: 'mucho', items: {} }, '2026-11': { libres: 5, items: { a: { monto: 'x' }, b: { monto: 3, nombre: '<img>' } } } } } });
  assert.deepEqual(Object.keys(m.fotoBase.meses), ['2026-11']);
  assert.deepEqual(Object.keys(m.fotoBase.meses['2026-11'].items), ['b']);
  const d = M.datosVacios();
  d.tarjetas.push({ id: 'a', nombre: 'Amex', red: 'American Express', banco: '', ultimos4: '', color: 'azul', diaCierre: 20, diaVence: 2 });
  assert.equal(M.lineaDelMes(d, '2026-11').some(e => e.tipo === 'vence'), false);
});

test('[QA2 · 8] flags: QA aprobadas prendidas; historia y dondeRinde apagadas', async () => {
  const { FLAGS } = await import('../api/_herramientas/mi-mes/flags.js');
  for (const k of ['diaDificil', 'queCambio', 'comoPagar', 'compartidas', 'devolver', 'gastoEstimado', 'cambioTarjeta']) assert.equal(FLAGS[k], true, k);
  assert.equal(FLAGS.historia, false);
  assert.equal(FLAGS.dondeRinde, false);
  const src = readFileSync(new URL('../api/_herramientas/mi-mes/app.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /La plata quieta pierde contra la inflación/);
  assert.match(src, /A confirmar/);
  assert.match(src, /const inf = supuesto\(datos, 'inflacion'\)/, 'misma inflación que ¿cuotas o contado?');
});
