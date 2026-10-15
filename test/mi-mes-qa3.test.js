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
