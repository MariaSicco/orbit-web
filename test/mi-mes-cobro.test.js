import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../api/_herramientas/mi-mes/calculos.js';

const base = (extra = {}) => ({ ...M.datosVacios(), ...extra });
const sueldo = (cobro, monto = 100_000_000) => ({ id: 'i1', nombre: 'Sueldo', monto, repite: true, desde: '2026-01', cobro });

test('cobro: días hábiles aproximados (lunes a viernes, sin feriados)', () => {
  // oct-2026 arranca jueves: 1 jue, 2 vie, 5 lun, 6 mar, 7 mié → quinto hábil el 7
  assert.equal(M.quintoHabil('2026-10'), '2026-10-07');
  // 31-oct-2026 es sábado → último hábil viernes 30
  assert.equal(M.ultimoHabil('2026-10'), '2026-10-30');
  // feb-2026: 28 es sábado → 27
  assert.equal(M.ultimoHabil('2026-02'), '2026-02-27');
  // nov-2026 arranca domingo: 2,3,4,5,6 → quinto el 6
  assert.equal(M.quintoHabil('2026-11'), '2026-11-06');
});

test('cobro: rangos toman el último día; "otro día" se ajusta a meses cortos', () => {
  assert.equal(M.fechaDeCobro(sueldo({ tipo: 'del1al5' }), '2026-10'), '2026-10-05');
  assert.equal(M.fechaDeCobro(sueldo({ tipo: 'del5al10' }), '2026-10'), '2026-10-10');
  assert.equal(M.fechaDeCobro(sueldo({ tipo: 'dia', dia: 31 }), '2026-02'), '2026-02-28');
  assert.equal(M.fechaDeCobro(sueldo(null), '2026-10'), null);
  assert.equal(M.cobroValido({ tipo: 'dia', dia: 40 }), null);
  assert.equal(M.cobroValido({ tipo: 'raro' }), null);
});

test('cobro: el próximo cobro cruza el cambio de mes y de año', () => {
  const d = base({ ingresos: [sueldo({ tipo: 'quintoHabil' })] });
  assert.deepEqual(pick(M.proximoCobro(d, '2026-10-07')), ['2026-10-07', 0]);
  assert.deepEqual(pick(M.proximoCobro(d, '2026-10-08')), ['2026-11-06', 29]);
  assert.deepEqual(pick(M.proximoCobro(d, '2026-12-20')), ['2027-01-07', 18]); // ene-2027: vie 1, lun 4, mar 5, mié 6, jue 7
  // sin día de cobro: nada
  assert.equal(M.proximoCobro(base({ ingresos: [sueldo(undefined)] }), '2026-10-08'), null);
});
const pick = c => [c.fecha, c.dias];

test('cobro: si hay dos ingresos con día, manda el más grande', () => {
  const d = base({ ingresos: [sueldo({ tipo: 'dia', dia: 20 }, 50_000_000), { ...sueldo({ tipo: 'del1al5' }), id: 'i2', monto: 90_000_000 }] });
  assert.equal(M.proximoCobro(d, '2026-10-12').fecha, '2026-11-05');
});

test('cobro: "vence antes de que cobres" con tarjeta y gasto fijo con día', () => {
  const d = base({
    ingresos: [sueldo({ tipo: 'del1al5' })],
    tarjetas: [{ id: 't1', nombre: 'Visa', red: 'Visa', banco: '', ultimos4: '', color: 'azul', diaCierre: 24, diaVence: 3 }],
    cuotas: [{ id: 'c1', nombre: 'Heladera', total: 30_000_00, cantidad: 3, tarjetaId: 't1', primerMes: '2026-11', moneda: 'ARS' }],
    gastos: [{ id: 'g1', nombre: 'Alquiler', categoria: 'Alquiler', monto: 40_000_000, repite: true, desde: '2026-01', dia: 1 },
      { id: 'g2', nombre: 'Gimnasio', categoria: 'Otros', monto: 2_000_000, repite: true, desde: '2026-01', dia: 15 }],
  });
  const v = M.venceAntesDeCobrar(d, '2026-10-28');
  assert.equal(v.cobro.fecha, '2026-11-05');
  assert.equal(v.cobro.dias, 8);
  assert.deepEqual(v.items.map(x => [x.tipo, x.fecha]), [['gasto', '2026-11-01'], ['tarjeta', '2026-11-03']]);
  assert.equal(v.items[1].monto, 10_000_00);
  assert.equal(v.total, 40_000_000 + 10_000_00);
  // la alerta nombra la tarjeta y las dos fechas
  const a = M.alertasCobro(d, '2026-10-28');
  assert.equal(a.length, 1);
  assert.match(a[0].titulo, /Visa vence el 3 nov y cobrás el 5 nov: vence antes de que cobres/);
  assert.match(a[0].texto, /Cobrás en 8 días/);
  // descartada: no vuelve en ese ciclo
  assert.equal(M.alertasCobro({ ...d, alertasVistas: [a[0].id] }, '2026-10-28').length, 0);
  // si cobra antes del vencimiento, no hay alerta
  const tarde = { ...d, tarjetas: [{ ...d.tarjetas[0], diaVence: 8 }] };
  assert.equal(M.alertasCobro(tarde, '2026-10-28').length, 0);
  // vence el mismo día que cobra: tampoco (la plata entra ese día)
  assert.equal(M.alertasCobro({ ...d, tarjetas: [{ ...d.tarjetas[0], diaVence: 5 }] }, '2026-10-28').length, 0);
});

test('cobro: línea del mes ordenada por fecha, el cobro primero si coincide', () => {
  const d = base({
    ingresos: [sueldo({ tipo: 'dia', dia: 10 })],
    tarjetas: [{ id: 't1', nombre: 'Visa', red: 'Visa', banco: '', ultimos4: '', color: 'azul', diaCierre: 24, diaVence: 10 }],
    cuotas: [{ id: 'c1', descripcion: 'Tele', total: 1_200_00, cantidad: 12, tarjetaId: 't1', primerMes: '2026-06', moneda: 'ARS' }],
    gastos: [{ id: 'g1', nombre: 'Alquiler', categoria: 'Alquiler', monto: 1, repite: true, desde: '2026-01', dia: 1 }],
  });
  const l = M.lineaDelMes(d, '2026-11');
  assert.deepEqual(l.map(e => [e.tipo, e.fecha]), [['gasto', '2026-11-01'], ['cobro', '2026-11-10'], ['vence', '2026-11-10'], ['cierre', '2026-11-24']]);
});

test('cobro: migrar guarda el cobro válido y el día del gasto, descarta lo raro', () => {
  const d = M.migrar({ v: 3, ingresos: [sueldo({ tipo: 'dia', dia: 12 }), { ...sueldo({ tipo: 'nada' }), id: 'i2' }],
    gastos: [{ id: 'g', nombre: 'Luz', categoria: 'Servicios', monto: 5, repite: true, desde: '2026-01', dia: 45 },
      { id: 'h', nombre: 'Agua', categoria: 'Servicios', monto: 5, repite: true, desde: '2026-01', dia: 9 }] });
  assert.equal(d.v, 4);
  assert.deepEqual(d.ingresos.map(i => i.cobro || null), [{ tipo: 'dia', dia: 12 }, null]);
  assert.deepEqual(d.gastos.map(g => g.dia || null), [null, 9]);
});

test('cobro push: solo la fecha que vence antes de cobrar, sin montos; aviso 5 días antes', () => {
  const d = base({
    ingresos: [sueldo({ tipo: 'del1al5' })],
    tarjetas: [{ id: 't1', nombre: 'Visa Galicia 1234', red: 'Visa', banco: 'Galicia', ultimos4: '1234', color: 'azul', diaCierre: 24, diaVence: 3 }],
  });
  const sin = M.datosParaAvisos(d, '2026-10-28');
  assert.equal('antesCobro' in sin[0], false);   // con el interruptor apagado no viaja
  const con = M.datosParaAvisos(d, '2026-10-28', { cobro: true });
  assert.equal(con[0].antesCobro, '2026-11-03');
  const limpio = M.limpiarTarjetasAvisos(con);
  assert.doesNotMatch(JSON.stringify(limpio), /Galicia|1234|monto|cobro"/);
  const av = M.avisosPushDeHoy(limpio, '2026-10-29');
  const a = av.find(x => x.tag.startsWith('mm:antescobro'));
  assert.equal(a.title, 'Vence antes de que cobres: Tarjeta Visa 1');
  assert.doesNotMatch(a.title + a.body, /\$/);
  assert.equal(M.avisosPushDeHoy(limpio, '2026-10-30').some(x => x.tag.startsWith('mm:antescobro')), false);
});

test('cobro: de hoy al cobro cruza el mes y marca lo que vence antes', () => {
  const d = base({
    ingresos: [sueldo({ tipo: 'quintoHabil' })],
    tarjetas: [{ id: 't1', nombre: 'Visa', red: 'Visa', banco: '', ultimos4: '', color: 'azul', diaCierre: 10, diaVence: 20 }],
    cuotas: [{ id: 'c1', descripcion: 'Tele', total: 1_200_00, cantidad: 12, tarjetaId: 't1', primerMes: '2026-06', moneda: 'ARS' }],
    gastos: [{ id: 'g1', nombre: 'Alquiler', categoria: 'Alquiler', monto: 1, repite: true, desde: '2026-01', dia: 1 },
      { id: 'g2', nombre: 'Luz', categoria: 'Servicios', monto: 1, repite: true, desde: '2026-01', dia: 12 }],
  });
  const l = M.lineaHastaCobrar(d, '2026-10-15');
  assert.equal(l.hasta, '2026-11-06');
  assert.deepEqual(l.eventos.map(e => [e.tipo, e.fecha, e.antes]), [
    ['vence', '2026-10-20', true], ['gasto', '2026-11-01', true], ['cobro', '2026-11-06', false]]);
});
