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
