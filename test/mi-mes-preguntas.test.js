/* Mi Mes · "preguntame solamente lo que cambia mi mes". Datos inventados, centavos. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
const M = await import('../api/_herramientas/mi-mes/calculos.js');
const $ = p => Math.round(p * 100);

function persona() {
  const d = M.datosVacios();
  d.ingresos.push({ id: 'i', nombre: 'Sueldo', monto: $(1_000_000), repite: true, desde: '2026-01' });
  d.gastos.push({ id: 'luz', nombre: 'Luz y gas', categoria: 'Servicios', monto: $(60_000), repite: true, desde: '2026-01' },
    { id: 'exp', nombre: 'Expensas', categoria: 'Expensas', monto: $(8_000), repite: true, desde: '2026-01' },
    { id: 'alq', nombre: 'Alquiler', categoria: 'Alquiler', monto: $(400_000), repite: true, desde: '2026-01' });
  d.tarjetas.push({ id: 'mc', nombre: 'Mastercard', red: 'Mastercard', banco: '', ultimos4: '', color: 'negro' });
  d.resumenes.push({ id: 'r9', tarjetaId: 'mc', mes: '2026-09', cierre: '2026-09-10', vencimiento: '2026-09-20', proximoCierre: '2026-10-10', proximoVencimiento: '2026-10-20',
    periodo: { desde: null, hasta: null }, saldoAnterior: {}, totales: { ARS: $(300_000) }, consumos: [], pagosYCreditos: [], cargos: [], cuotasAVencer: [], tarjetas: [] });
  return M.migrar(d);
}

test('preguntas: ordenadas por cuánto mueven el mes; lo chico va a "más tarde"', () => {
  const p = M.preguntas(persona(), '2026-10-15');
  assert.deepEqual(p.ahora.map(x => [x.tipo, x.impacto]), [['resumen', $(300_000)], ['cobro', $(300_000)], ['gasto', $(60_000)]]);
  assert.equal(p.ahora[0].titulo, 'Para estimar cuánto te queda, falta tu resumen de Mastercard.');
  assert.deepEqual(p.masTarde.map(x => x.tipo).sort(), ['copia', 'gasto']);   // expensas (< 1 % de los ingresos) y la copia
  assert.equal(p.umbral, $(10_000));
  for (const x of p.ahora) assert.ok(x.porque && x.accion, 'cada una dice por qué importa y qué tocar');
});

test('preguntas: con todo resuelto, "tu mes está al día"', () => {
  const d = persona();
  d.ingresos[0].cobro = { tipo: 'del1al5' };
  d.confirmados = { '2026-10': ['luz', 'exp'] };
  d.resumenes.push({ ...d.resumenes[0], id: 'r10', mes: '2026-10', cierre: '2026-10-10', vencimiento: '2026-10-20', proximoCierre: '2026-11-10', proximoVencimiento: '2026-11-20' });
  const p = M.preguntas(d, '2026-10-15', { ultimaCopia: '2026-10-01' });
  assert.equal(p.alDia, true);
  // sin copia, es lo único que queda y sube aunque no mueva plata
  assert.deepEqual(M.preguntas(d, '2026-10-15').ahora.map(x => x.tipo), ['copia']);
});

test('preguntas: "más tarde" la saca de la lista principal', () => {
  const d = persona();
  const id = M.preguntas(d, '2026-10-15').ahora[0].id;
  d.preguntasLuego = [id];
  const p = M.preguntas(d, '2026-10-15');
  assert.ok(!p.ahora.some(x => x.id === id));
  assert.ok(p.masTarde.some(x => x.id === id));
});

test('preguntas: la duda de conciliación queda guardada y pesa una cuota; la lectura dudosa pesa su total', () => {
  const d = persona();
  d.cuotas.push({ id: 'z', descripcion: 'Zapatillas', total: $(90_000), moneda: 'ARS', cantidad: 3, tarjetaId: 'mc', primerMes: '2026-11', origen: 'manual' });
  d.concilia = [{ cuotaId: 'z', tarjetaId: 'mc', descripcion: 'Zapatillas', total: $(90_000), cantidad: 3, moneda: 'ARS', comercio: 'DEPORTES INVENTADO', monto: $(31_000) }];
  d.resumenes[0].dudoso = true;
  const m = M.migrar(d);
  assert.equal(m.concilia.length, 1);
  const p = M.preguntas(m, '2026-10-15');
  assert.deepEqual(p.ahora.find(x => x.tipo === 'concilia')?.impacto, $(30_000));
  assert.equal(p.ahora.find(x => x.tipo === 'lectura')?.impacto, $(300_000));
  // si la cuota ya no existe, la duda se limpia sola
  assert.equal(M.migrar({ ...m, cuotas: [] }).concilia.length, 0);
});

test('preguntas: dólar viejo solo si hay dólares, con el supuesto del 5 % a la vista', () => {
  const d = persona();
  d.cuotas.push({ id: 'nb', descripcion: 'Notebook', total: 60_000, moneda: 'USD', cantidad: 6, tarjetaId: 'mc', primerMes: '2026-10', origen: 'resumen' });
  d.cambio = { USD: { valor: $(1_500), fuente: 'p', fecha: '2026-09-01' } };
  const q = M.preguntas(d, '2026-10-15').ahora.concat(M.preguntas(d, '2026-10-15').masTarde).find(x => x.tipo === 'cambio');
  assert.ok(q);
  assert.match(q.porque, /5 %/);
  d.cambio.USD.fecha = '2026-10-14';
  assert.equal([...M.preguntas(d, '2026-10-15').ahora, ...M.preguntas(d, '2026-10-15').masTarde].some(x => x.tipo === 'cambio'), false);
});

test('qué tenés que pagar: los próximos 3 desde hoy, cruzando el mes, sin cobros ni cierres', () => {
  const d = M.datosVacios();
  d.ingresos.push({ id: 'i', nombre: 'Sueldo', monto: $(1_000_000), repite: true, desde: '2026-01', cobro: { tipo: 'dia', dia: 25 } });
  d.tarjetas.push({ id: 'v', nombre: 'Visa', red: 'Visa', banco: '', ultimos4: '', color: 'azul', diaCierre: 28, diaVence: 8 });
  d.cuotas.push({ id: 'c', descripcion: 'Tele', total: $(90_000), moneda: 'ARS', cantidad: 3, tarjetaId: 'v', primerMes: '2026-11' });
  d.gastos.push({ id: 'a', nombre: 'Alquiler', categoria: 'Alquiler', monto: $(400_000), repite: true, desde: '2026-01', dia: 1 },
    { id: 'l', nombre: 'Luz', categoria: 'Servicios', monto: $(60_000), repite: true, desde: '2026-01', dia: 18 },
    { id: 'x', nombre: 'Gym', categoria: 'Otros', monto: $(20_000), repite: true, desde: '2026-01', dia: 10 });
  const p = M.proximosPagos(d, '2026-10-15');
  assert.deepEqual(p.map(x => [x.nombre, x.fecha, x.monto]), [['Luz', '2026-10-18', $(60_000)], ['Alquiler', '2026-11-01', $(400_000)], ['Visa', '2026-11-08', $(30_000)]]);
  assert.equal(p[0].dias, 3);
});
