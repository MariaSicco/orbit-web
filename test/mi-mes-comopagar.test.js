import { test } from 'node:test';
import assert from 'node:assert/strict';
const M = await import('../api/_herramientas/mi-mes/calculos.js');
const $ = p => Math.round(p * 100);
function persona() {
  const d = M.datosVacios();
  d.ingresos.push({ id: 'i', nombre: 'Sueldo', monto: $(1_000_000), repite: true, desde: '2026-01', cobro: { tipo: 'dia', dia: 25 } });
  d.gastos.push({ id: 'a', nombre: 'Alquiler', categoria: 'Alquiler', monto: $(400_000), repite: true, desde: '2026-01', dia: 18 });
  d.tarjetas.push({ id: 'v', nombre: 'Visa', red: 'Visa', banco: '', ultimos4: '', color: 'azul', diaCierre: 28, diaVence: 8, limite: $(500_000) },
    { id: 'm', nombre: 'Master', red: 'Mastercard', banco: '', ultimos4: '', color: 'negro' });
  d.cuentas = [{ id: 'c', nombre: 'Cuenta sueldo', saldo: $(450_000), fecha: '2026-10-15' }];
  return M.migrar(d);
}
const sup = { inflacion: 2, rendimiento: 1.5 };
test('cómo pagar: efectivo con descuento vs cada tarjeta en cuotas, en plata de hoy', () => {
  const r = M.comoPagar(persona(), { precio: $(300_000), descuentoEfectivo: 10, cuotas: 3, ...sup }, '2026-10-15');
  assert.equal(r.contado, $(270_000));
  assert.deepEqual(r.opciones.map(o => o.id), ['efectivo', 'v', 'm']);
  const [ef, visa, master] = r.opciones;
  assert.deepEqual([ef.costoHoy, ef.meses.length], [$(270_000), 1]);
  // 100.000 / 1,02 + 100.000 / 1,02² + 100.000 / 1,02³ = 288.388,33
  assert.equal(visa.costoHoy, 28_838_833);
  assert.deepEqual(visa.meses.map(m => [m.mes, m.monto]), [['2026-11', $(100_000)], ['2026-12', $(100_000)], ['2027-01', $(100_000)]]);
  assert.equal(visa.meses[0].libres, M.resumenMes(persona(), '2026-11').libres - $(100_000));
  assert.equal(visa.estimado, true, 'cierre por días cargados: estimado');
  assert.deepEqual([visa.alcanza, master.alcanza], [true, null], 'Master sin límite cargado: no sabemos');
});
test('cómo pagar: tope de crédito real y efecto en el día difícil', () => {
  const r = M.comoPagar(persona(), { precio: $(600_000), cuotas: 6, ...sup }, '2026-10-15');
  const [ef, visa] = r.opciones;
  assert.equal(visa.alcanza, false, 'el límite de 500.000 no alcanza');
  assert.equal(r.sinComprar.faltaDificil, 0);
  // en efectivo sale hoy: 450.000 − 600.000 = −150.000 y el 18 el alquiler → faltan 550.000
  assert.equal(ef.alcanza, false);
  assert.equal(ef.faltaDificil, $(550_000));
  // en cuotas, la primera cae en noviembre (después del cobro): el día difícil no cambia
  assert.equal(visa.faltaDificil, 0);
});
test('cómo pagar: no toca los datos y no suma ingresos ni gastos', () => {
  const d = persona();
  const antes = JSON.stringify(d);
  M.comoPagar(d, { precio: $(300_000), cuotas: 3, ...sup }, '2026-10-15');
  assert.equal(JSON.stringify(d), antes);
  assert.equal(M.comoPagar(d, { precio: 0, cuotas: 3, ...sup }, '2026-10-15'), null);
});
