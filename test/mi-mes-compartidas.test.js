import { test } from 'node:test';
import assert from 'node:assert/strict';
const M = await import('../api/_herramientas/mi-mes/calculos.js');
const $ = p => Math.round(p * 100);
function persona(compartida) {
  const d = M.datosVacios();
  d.ingresos.push({ id: 'i', nombre: 'Sueldo', monto: $(1_000_000), repite: true, desde: '2026-01' });
  d.tarjetas.push({ id: 'v', nombre: 'Visa', red: 'Visa', banco: '', ultimos4: '', color: 'azul', diaCierre: 28, diaVence: 8 });
  d.cuotas.push({ id: 'c', descripcion: 'Heladera', total: $(120_000), moneda: 'ARS', cantidad: 3, tarjetaId: 'v', primerMes: '2026-10', origen: 'manual', compartida });
  return M.migrar(d);
}
test('compartida: al emisor la cuota entera; tu parte y lo que te deben aparte', () => {
  const d = persona({ con: 'Juli', tipo: '%', valor: 50 });
  const c = M.compartidaDe(d, 'c', '2026-10-15');
  assert.deepEqual([c.alEmisor, c.tuParte, c.teDeben, c.teDevolvieron, c.falta], [$(120_000), $(60_000), $(60_000), 0, $(60_000)]);
  assert.deepEqual(c.cuotas.map(q => [q.alEmisor, q.tuParte, q.suParte]), [[$(40_000), $(20_000), $(20_000)], [$(40_000), $(20_000), $(20_000)], [$(40_000), $(20_000), $(20_000)]]);
});
test('compartida: no toca el cronograma de la tarjeta ni infla ingresos o gastos', () => {
  const sin = persona(undefined), con = persona({ con: 'Juli', tipo: '%', valor: 50, devoluciones: [{ fecha: '2026-10-09', monto: $(20_000) }] });
  for (const m of ['2026-10', '2026-11', '2026-12']) {
    const a = M.resumenMes(sin, m), b = M.resumenMes(con, m);
    assert.deepEqual([b.totIngresos, b.totGastos, b.totTarjetas, b.libres], [a.totIngresos, a.totGastos, a.totTarjetas, a.libres], m);
  }
  assert.deepEqual(M.fichaCompra(con, 'c', '2026-10-15').obligaciones.map(o => o.monto), [$(40_000), $(40_000), $(40_000)]);
});
test('compartida: adelanto de varias cuotas, en pesos fijos', () => {
  const d = persona({ con: 'Mamá', tipo: '$', valor: $(45_000), devoluciones: [{ fecha: '2026-10-10', monto: $(30_000) }] });
  const c = M.compartidaDe(d, 'c', '2026-10-15');
  assert.equal(c.teDeben, $(45_000));
  assert.equal(c.cuotasCubiertas, 2, '30.000 cubre las dos primeras (15.000 c/u)');
  assert.equal(c.falta, $(15_000));
  assert.equal(c.vencidoSinDevolver, 0);
});
test('compartida: lo vencido sin devolver; y datos inválidos se descartan al migrar', () => {
  const d = persona({ con: 'Juli', tipo: '%', valor: 50 });
  assert.equal(M.compartidaDe(d, 'c', '2026-11-20').vencidoSinDevolver, $(40_000));   // vencieron oct y nov
  assert.equal(persona({ con: '', tipo: '%', valor: 50 }).cuotas[0].compartida, undefined);
  assert.equal(persona({ con: 'X', tipo: '%', valor: 100 }).cuotas[0].compartida, undefined);
  assert.equal(persona({ con: 'X', tipo: '$', valor: $(200_000) }).cuotas[0].compartida, undefined);
});
