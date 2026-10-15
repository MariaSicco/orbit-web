import { test } from 'node:test';
import assert from 'node:assert/strict';
const M = await import('../api/_herramientas/mi-mes/calculos.js');
const $ = p => Math.round(p * 100);
function persona() {
  const d = M.datosVacios();
  d.ingresos.push({ id: 'i', nombre: 'Sueldo', monto: $(1_000_000), repite: true, desde: '2026-01' });
  d.tarjetas.push({ id: 'vie', nombre: 'Visa vieja', red: 'Visa', banco: '', ultimos4: '', color: 'azul' }, { id: 'nue', nombre: 'Master nueva', red: 'Mastercard', banco: '', ultimos4: '', color: 'negro' });
  d.gastos.push({ id: 'net', nombre: 'Internet Fibra', categoria: 'Servicios', monto: $(30_000), repite: true, desde: '2026-01', tarjetaId: 'vie' },
    { id: 'gym', nombre: 'Gimnasio Megafit', categoria: 'Otros', monto: $(25_000), repite: true, desde: '2026-01', tarjetaId: 'vie' },
    { id: 'alq', nombre: 'Alquiler', categoria: 'Alquiler', monto: $(400_000), repite: true, desde: '2026-01' });
  d.cuotas.push({ id: 'c', descripcion: 'Tele', total: $(120_000), moneda: 'ARS', cantidad: 6, tarjetaId: 'vie', primerMes: '2026-08', fecha: '2026-07-20' });
  d.devolver = [{ id: 'r', tipo: 'devolucion', motivo: 'Devolución tele', monto: $(5_000), fecha: '2026-10-01', esperada: '2026-11-01', cuotaId: 'c' }];
  return M.migrar(d);
}
const res = (id, tarjetaId, cierre, consumos) => ({ id, tarjetaId, mes: cierre.slice(0, 7), cierre, vencimiento: cierre, totales: { ARS: 1 }, consumos, cargos: [], pagosYCreditos: [] });
test('cambiar tarjeta: lista gastos asociados, cuotas que faltan, devoluciones y la checklist', () => {
  const a = M.asistenteCambio(persona(), 'vie', '2026-10-15');
  assert.deepEqual(a.gastos.map(g => g.id), ['net', 'gym']);
  assert.deepEqual(a.cuotas.map(c => [c.nombre, c.cuotas, c.restan]), [['Tele', 4, $(80_000)]]);
  assert.equal(a.ultimaCuota, '2027-01');
  assert.deepEqual(a.devoluciones.map(x => x.id), ['r']);
  assert.ok(a.checklist.length >= 4);
});
test('cambiar tarjeta: mueve los gastos y verifica con el resumen de la nueva', () => {
  const d = M.aplicarCambio(persona(), { desde: 'vie', hacia: 'nue', gastos: ['net', 'gym'], fecha: '2026-10-15' });
  assert.deepEqual(d.gastos.filter(g => g.tarjetaId === 'nue').map(g => g.id), ['net', 'gym']);
  const c = d.cambiosTarjeta[0];
  assert.match(M.verificarCambio(d, c).texto, /Cuando subas el primer resumen de la tarjeta nueva/);
  d.resumenes.push(res('n1', 'nue', '2026-11-05', [{ fecha: '2026-10-20', comercio: 'INTERNET FIBRA SA', monto: 1, moneda: 'ARS', rubro: 'Servicios', cuota: null }]),
    res('v1', 'vie', '2026-11-03', [{ fecha: '2026-10-22', comercio: 'MEGAFIT CUOTA', monto: 1, moneda: 'ARS', rubro: 'Otros', cuota: null }]),
    res('v0', 'vie', '2026-10-03', [{ fecha: '2026-09-22', comercio: 'INTERNET FIBRA SA', monto: 1, moneda: 'ARS', rubro: 'Servicios', cuota: null }]));
  const v = M.verificarCambio(d, c);
  assert.equal(v.texto, 'Internet Fibra ya se cobró en la nueva; Gimnasio Megafit se sigue cobrando en la vieja.');
  assert.equal(v.listo, false);
  // el historial de la vieja se conserva
  assert.equal(d.resumenes.filter(r => r.tarjetaId === 'vie').length, 2);
  assert.equal(M.migrar(d).cambiosTarjeta.length, 1);
});
test('dejar una tarjeta: queda marcada con la fecha de baja, sin borrar nada; las cuentas no cambian', () => {
  const p = persona();
  const d = M.aplicarCambio(p, { desde: 'vie', hacia: null, gastos: [], fecha: '2026-10-15' });
  assert.equal(d.tarjetas.find(t => t.id === 'vie').baja, '2026-10-15');
  assert.equal(M.migrar(d).tarjetas.find(t => t.id === 'vie').baja, '2026-10-15');
  for (const m of ['2026-10', '2026-11']) assert.equal(M.resumenMes(d, m).libres, M.resumenMes(p, m).libres);
});
