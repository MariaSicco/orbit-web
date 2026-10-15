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
