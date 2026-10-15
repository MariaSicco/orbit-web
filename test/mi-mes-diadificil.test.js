import { test } from 'node:test';
import assert from 'node:assert/strict';
const M = await import('../api/_herramientas/mi-mes/calculos.js');
const $ = p => Math.round(p * 100);
function persona() {
  const d = M.datosVacios();
  d.ingresos.push({ id: 'i', nombre: 'Sueldo', monto: $(1_000_000), repite: true, desde: '2026-01', cobro: { tipo: 'dia', dia: 22 } });
  d.gastos.push({ id: 'a', nombre: 'Alquiler', categoria: 'Alquiler', monto: $(400_000), repite: true, desde: '2026-01', dia: 10 },
    { id: 'l', nombre: 'Luz', categoria: 'Servicios', monto: $(45_000), repite: true, desde: '2026-01', dia: 18 },
    { id: 's', nombre: 'Súper', categoria: 'Otros', monto: $(100_000), repite: true, desde: '2026-01' });
  d.tarjetas.push({ id: 'v', nombre: 'Visa', red: 'Visa', banco: '', ultimos4: '', color: 'azul', diaCierre: 5, diaVence: 15 });
  d.cuotas.push({ id: 'c', descripcion: 'Tele', total: $(300_000), moneda: 'ARS', cantidad: 3, tarjetaId: 'v', primerMes: '2026-10' });
  d.cuentas = [{ id: 'cs', nombre: 'Cuenta sueldo', saldo: $(500_000), fecha: '2026-10-08' }, { id: 'ef', nombre: 'Efectivo', saldo: $(0), fecha: '2026-10-08' }];
  return M.migrar(d);
}
test('día difícil: el mes termina positivo, pero el 18 falta plata; cobrás el 22', () => {
  const p = M.proyeccionSaldo(persona(), '2026-10-08');
  // 500.000 − 400.000 (10) − 100.000 (Visa, 15) − 45.000 (18) = −45.000; +1.000.000 el 22
  assert.deepEqual([p.minimo.fecha, p.minimo.saldo], ['2026-10-18', $(-45_000)]);
  assert.equal(p.falta, $(45_000));
  assert.equal(p.finDeMes, $(955_000));
  assert.equal(p.mensaje, 'El mes termina positivo, pero el 18 faltarán unos $ 45.000; cobrás el 22.');
  assert.ok(p.supuestos.some(s => /sin día \(\$ 100\.000\)/.test(s)), 'el súper sin día queda como supuesto');
});
test('día difícil: lo que ya venció se toma como pagado y con plata suficiente no avisa', () => {
  const d = persona();
  d.cuentas[0].saldo = $(700_000);
  const p = M.proyeccionSaldo(d, '2026-10-12');     // alquiler del 10 ya pasó
  assert.equal(p.falta, 0);
  assert.match(p.mensaje, /llegás a tu cobro del 22 sin quedar en rojo/);
  assert.equal(p.dias[0].saldo, $(700_000));
});
test('día difícil: si el cobro es el mes que viene, la proyección llega hasta ese día', () => {
  const d = persona();
  d.ingresos[0].cobro = { tipo: 'del1al5' };
  const p = M.proyeccionSaldo(d, '2026-10-20');
  assert.equal(p.hasta, '2026-11-05');
  assert.equal(M.proyeccionSaldo({ ...d, cuentas: [] }, '2026-10-20'), null);
});
test('día difícil: el saldo de las cuentas no es ingreso ni gasto', () => {
  const d = persona();
  const sin = M.resumenMes({ ...d, cuentas: [] }, '2026-10');
  const con = M.resumenMes(d, '2026-10');
  assert.deepEqual([con.totIngresos, con.totGastos, con.libres], [sin.totIngresos, sin.totGastos, sin.libres]);
});
test('día difícil en el motor de preguntas: sin saldo pregunta; con faltante, avisa primero', () => {
  const d = persona();
  const sin = M.preguntas({ ...d, cuentas: [] }, '2026-10-08', { diaDificil: true });
  assert.ok(sin.ahora.some(x => x.tipo === 'saldo' && x.titulo === '¿Cuánto tenés hoy en tu cuenta?'));
  const con = M.preguntas(d, '2026-10-08', { diaDificil: true });
  assert.equal(con.ahora[0].tipo, 'dificil');
  assert.match(con.ahora[0].titulo, /el 18 faltarán unos \$ 45\.000/);
  // apagado: nada de esto
  assert.equal(M.preguntas(d, '2026-10-08').ahora.some(x => ['saldo', 'dificil'].includes(x.tipo)), false);
});
