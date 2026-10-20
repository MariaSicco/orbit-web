/* Mi Mes · arreglos de la QA v3 (reports/qa/2026-10-15-mi-mes-v3.md). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
const M = await import('../api/_herramientas/mi-mes/calculos.js');
const $ = p => Math.round(p * 100);

/* ── QA v3 · 1: "qué cambió" ve el saldo financiado ── */
function amexVencido() {
  const d = M.datosVacios();
  d.ingresos.push({ id: 'i', nombre: 'Sueldo', monto: $(1_000_000), repite: true, desde: '2026-01' });
  d.tarjetas.push({ id: 'a', nombre: 'Amex', red: 'American Express', banco: '', ultimos4: '', color: 'azul' });
  d.resumenes.push({ id: 'r', tarjetaId: 'a', mes: '2026-10', cierre: '2026-09-26', vencimiento: '2026-10-09', totales: { ARS: $(300_000) },
    pagoMinimo: { moneda: 'ARS', monto: $(30_000) }, consumos: [], cargos: [], pagosYCreditos: [], vencidoAlImportar: true });
  return M.migrar(d);
}
test('[QA3 · 1] después de "pagué el mínimo", qué cambió explica octubre y el saldo financiado de noviembre', () => {
  const d = amexVencido();
  const foto = M.fotoProyeccion(d, '2026-10');
  const m = M.registrarPagoResumen(d, 'r', { estado: 'minimo' });
  const c = M.cambiosDesde(foto, m);
  const oct = c.find(x => x.mes === '2026-10'), nov = c.find(x => x.mes === '2026-11');
  assert.equal(oct.comprometido, $(-270_000));
  // 270.000 + 270.000 × 80 % / 12 × 1,21 = 270.000 + 21.780
  assert.equal(nov.comprometido, $(291_780));
  assert.equal(nov.texto, 'Noviembre tiene $ 291.780 más comprometidos: $ 291.780 por el saldo que quedó sin pagar de Amex (incluye $ 21.780 de intereses estimados).');
  assert.deepEqual(nov.lineas[0].ref, { tarjeta: 'a' });
  // en total, los dos meses no inflan: lo que deja de salir en octubre vuelve con intereses en noviembre
  assert.equal(oct.comprometido + nov.comprometido, $(21_780));
});

/* ── QA v3 · 2: si el resumen trae el gasto fijo, se asume que va con esa tarjeta ── */
function netflixSinMarcar({ monto = 15_000, nombre = 'Netflix', categoria = 'Suscripciones', consumo = 'NETFLIX.COM', montoConsumo = 15_000 } = {}) {
  const d = M.datosVacios();
  d.ingresos.push({ id: 'i', nombre: 'Sueldo', monto: $(1_000_000), repite: true, desde: '2026-01' });
  d.tarjetas.push({ id: 'v', nombre: 'Visa', red: 'Visa', banco: '', ultimos4: '', color: 'azul', diaCierre: 28, diaVence: 8 });
  d.gastos.push({ id: 'nf', nombre, categoria, monto: $(monto), repite: true, desde: '2026-01', dia: 12 });
  d.resumenes.push({ id: 'r', tarjetaId: 'v', mes: '2026-11', cierre: '2026-10-28', vencimiento: '2026-11-08', totales: { ARS: $(montoConsumo) },
    consumos: [{ fecha: '2026-10-12', comercio: consumo, monto: $(montoConsumo), moneda: 'ARS', rubro: 'Suscripciones', cuota: null }], cargos: [], pagosYCreditos: [] });
  return M.migrar(d);
}
test('[QA3 · 2] sin responder, el gasto que aparece en el resumen se cuenta una vez (adentro de la tarjeta)', () => {
  const d = netflixSinMarcar();
  const nov = M.resumenMes(d, '2026-11');
  assert.equal(nov.totGastos + nov.totTarjetas, $(15_000));
  assert.equal(nov.gastosTarjeta[0].inferida, true);
  // los meses que vienen, sin resumen, una vez como gasto de la tarjeta
  const dic = M.resumenMes(d, '2026-12');
  assert.deepEqual([dic.totGastos, dic.totTarjetas], [0, $(15_000)]);
  // no es un pago aparte en la línea del mes
  assert.equal(M.lineaDelMes(d, '2026-12').some(e => e.nombre === 'Netflix'), false);
});
test('[QA3 · 2] la pregunta pasa a ser de confirmación, y "no" lo vuelve a contar aparte', () => {
  const d = netflixSinMarcar();
  const q = M.preguntas(d, '2026-11-02').ahora.concat(M.preguntas(d, '2026-11-02').masTarde).find(x => x.tipo === 'gastoTarjeta');
  assert.equal(q.titulo, 'Netflix lo vimos en tu Visa: lo contamos ahí. ¿Está bien?');
  const no = M.migrar({ ...d, gastos: d.gastos.map(g => ({ ...g, sinTarjeta: true })) });
  assert.equal(no.gastos[0].sinTarjeta, true);
  assert.equal(M.resumenMes(no, '2026-12').totGastos, $(15_000));
  assert.equal(M.preguntas(no, '2026-11-02').ahora.some(x => x.tipo === 'gastoTarjeta'), false);
  const si = M.migrar({ ...d, gastos: d.gastos.map(g => ({ ...g, tarjetaId: 'v' })) });
  assert.equal([...M.preguntas(si, '2026-11-02').ahora, ...M.preguntas(si, '2026-11-02').masTarde].some(x => x.tipo === 'gastoTarjeta'), false);
});
test('[QA3 · 2] coincidencia: comercio + monto ±15 %, o comercio + categoría Suscripciones; si no, queda como hoy', () => {
  // Internet (Servicios) con monto parecido: sí
  assert.equal(M.resumenMes(netflixSinMarcar({ nombre: 'Internet Fibra', categoria: 'Servicios', consumo: 'FIBRA HOGAR SA', monto: 30_000, montoConsumo: 33_000 }), '2026-11').gastosTarjeta.length, 1);
  // mismo comercio pero monto muy distinto y no es suscripción: no
  assert.equal(M.resumenMes(netflixSinMarcar({ nombre: 'Internet Fibra', categoria: 'Servicios', consumo: 'FIBRA HOGAR SA', monto: 30_000, montoConsumo: 60_000 }), '2026-11').gastosTarjeta.length, 0);
  // suscripción con aumento grande: sí, por categoría
  assert.equal(M.resumenMes(netflixSinMarcar({ monto: 15_000, montoConsumo: 21_000 }), '2026-11').gastosTarjeta.length, 1);
  // nombre que no coincide (Celular contra CLARO): queda como hoy
  assert.equal(M.resumenMes(netflixSinMarcar({ nombre: 'Celular', categoria: 'Servicios', consumo: 'CLARO', monto: 20_000, montoConsumo: 20_000 }), '2026-11').gastosTarjeta.length, 0);
});
