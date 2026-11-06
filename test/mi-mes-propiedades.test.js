/* Mi Mes (ob-019) · varias propiedades: se reparten los gastos fijos y "te quedan libres" no se mueve. Montos en centavos. */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const M = await import('../api/_herramientas/mi-mes/calculos.js');
const D = await import('../api/_herramientas/mi-mes/documentos.js');
const { FLAGS, flagsActivos } = await import('../api/_herramientas/mi-mes/flags.js');
const $ = pesos => Math.round(pesos * 100);
const MES = '2026-11';
const gasto = (id, nombre, monto, extra = {}) => ({ id, nombre, categoria: 'Otros', monto: $(monto), repite: true, desde: '2026-10', ...extra });
/* sin ninguna propiedad: tal como lo tiene hoy una clienta */
const sinPropiedades = () => ({
  ...M.datosVacios(),
  ingresos: [{ id: 'i', nombre: 'Sueldo', monto: $(2_000_000), repite: true, desde: '2026-10' }],
  tarjetas: [{ id: 'visa', nombre: 'Visa', red: 'Visa', banco: '', ultimos4: '', color: 'azul' }, { id: 'amex', nombre: 'Amex', red: 'Otra', banco: '', ultimos4: '', color: 'azul' }],
  gastos: [
    gasto('c-exp', 'Expensas', 300_000),
    gasto('c-luz', 'Luz', 40_000, { sinTarjeta: true }),
    gasto('q-luz', 'Luz', 25_000, { sinTarjeta: true }),
    gasto('q-seg', 'Seguro', 60_000, { tarjetaId: 'visa' }),       // tarjeta sin resumen: cuenta como tarjeta
    gasto('q-jar', 'Jardinero', 35_000, { tarjetaId: 'amex' }),    // ya está adentro del resumen de Amex
    gasto('net', 'Netflix', 10_000, { sinTarjeta: true }),         // no es de ninguna propiedad
  ],
  resumenes: [{ id: 'r', tarjetaId: 'amex', mes: MES, totales: { ARS: $(200_000) }, consumos: [], cuotasAVencer: [], pagosYCreditos: [], cargos: [], saldoAnterior: {}, tarjetas: [] }],
});
const dosPropiedades = () => {
  const d = sinPropiedades();
  d.propiedades = [{ id: 'casa', nombre: 'Casa' }, { id: 'quinta', nombre: 'La quinta' }];
  for (const g of d.gastos) { if (g.id.startsWith('c-')) g.propiedadId = 'casa'; if (g.id.startsWith('q-')) g.propiedadId = 'quinta'; }
  return d;
};

/* ── el reparto ── */
test('reparte cada gasto en su propiedad, con el total de todas', () => {
  const p = M.resumenPropiedades(dosPropiedades(), MES);
  const [casa, quinta] = p.propiedades;
  assert.equal(casa.total, $(340_000));
  assert.equal(quinta.total, $(120_000));
  assert.equal(p.total, $(460_000));
  assert.equal(p.sinAsignar.total, $(10_000));
  assert.deepEqual(casa.gastos.map(g => g.id).sort(), ['c-exp', 'c-luz']);
  assert.deepEqual(quinta.gastos.map(g => g.id).sort(), ['q-jar', 'q-luz', 'q-seg']);
});
test('cada gasto cae en la misma columna que en resumenMes', () => {
  const [, quinta] = M.resumenPropiedades(dosPropiedades(), MES).propiedades;
  assert.equal(quinta.aparte, $(25_000));
  assert.equal(quinta.conTarjeta, $(60_000));
  assert.equal(quinta.dentro, $(35_000));
});

/* ── las cuentas de "te quedan libres" cierran ── */
for (const mes of ['2026-10', MES, '2026-12', '2027-06']) {
  test(`cierra contra resumenMes en ${mes}`, () => {
    const d = dosPropiedades();
    const r = M.resumenMes(d, mes);
    const p = M.resumenPropiedades(d, mes, r);
    const todas = [...p.propiedades, p.sinAsignar];
    const suma = k => todas.reduce((s, x) => s + x[k], 0);
    const sumaMontos = xs => xs.reduce((s, x) => s + x.monto, 0);
    assert.equal(suma('aparte'), r.totGastos);
    assert.equal(suma('conTarjeta'), sumaMontos(r.gastosConTarjeta));
    assert.equal(suma('dentro'), sumaMontos(r.gastosTarjeta.filter(g => g.dentro)));
    assert.equal(p.total + p.sinAsignar.total, r.totGastos + sumaMontos(r.gastosTarjeta));
    assert.equal(r.libres, r.totIngresos - suma('aparte') - r.totCuotas - r.totResumenes);
  });
}
test('tener propiedades no mueve ningún número del mes', () => {
  for (const mes of ['2026-10', MES, '2026-12', '2027-06']) {
    const con = M.resumenMes(dosPropiedades(), mes), sin = M.resumenMes(sinPropiedades(), mes);
    for (const k of ['libres', 'totIngresos', 'totGastos', 'totCuotas', 'totResumenes', 'totTarjetas', 'liquida']) assert.equal(con[k], sin[k], `${k} de ${mes}`);
  }
});
test('la cuenta exacta de un mes con todo: ingresos, las dos propiedades y tarjetas', () => {
  const r = M.resumenMes(dosPropiedades(), MES);
  /* 2.000.000 − fijos de la cuenta (300.000 + 40.000 + 25.000 + 10.000) − seguro con Visa (60.000) − resumen Amex (200.000); el jardinero ya está en el resumen */
  assert.equal(r.libres, $(1_365_000));
});
test('respeta lo que resumenMes ya sabe: monto real, suba, bimestral y gasto terminado', () => {
  const d = dosPropiedades();
  d.reales = { [MES]: { 'c-luz': $(55_000) } };
  d.gastos.find(g => g.id === 'c-exp').sube = { desde: MES, monto: $(330_000) };
  d.gastos.find(g => g.id === 'q-luz').frecuencia = 2;              // desde octubre: no llega en noviembre
  d.gastos.find(g => g.id === 'q-seg').hasta = '2026-10';           // terminó
  const r = M.resumenMes(d, MES);
  const p = M.resumenPropiedades(d, MES, r);
  assert.equal(p.propiedades[0].total, $(55_000 + 330_000));
  assert.equal(p.propiedades[1].total, $(35_000));
  assert.equal(p.propiedades[0].aparte + p.propiedades[1].aparte + p.sinAsignar.aparte, r.totGastos);
});
test('centavos: la suma de las propiedades da exacto, sin redondear', () => {
  const d = dosPropiedades();
  d.gastos.find(g => g.id === 'c-exp').monto = 33_333;
  d.gastos.find(g => g.id === 'c-luz').monto = 33_334;
  assert.equal(M.resumenPropiedades(d, MES).propiedades[0].total, 66_667);
});
test('sin propiedades todo va a sin asignar, y una propiedad vacía da 0', () => {
  const p = M.resumenPropiedades(sinPropiedades(), MES);
  assert.deepEqual(p.propiedades, []);
  assert.equal(p.total, 0);
  assert.equal(p.sinAsignar.total, $(470_000));
  const d = dosPropiedades();
  d.propiedades.push({ id: 'depto', nombre: 'Depto' });
  assert.equal(M.resumenPropiedades(d, MES).propiedades[2].total, 0);
});

/* ── alta, cambio de nombre y baja ── */
const ids = () => { let n = 0; return () => `p${++n}`; };
test('agregar dos propiedades', () => {
  const id = ids();
  const a = M.agregarPropiedad(M.datosVacios(), '  Casa ', id);
  const b = M.agregarPropiedad(a.datos, 'Departamento', id);
  assert.deepEqual(b.datos.propiedades, [{ id: 'p1', nombre: 'Casa' }, { id: 'p2', nombre: 'Departamento' }]);
  assert.equal(b.propiedad.id, 'p2');
});
test('no acepta nombre vacío, repetido ni pasar el tope; números distintos sí son otra', () => {
  const id = ids();
  const d = M.agregarPropiedad(M.datosVacios(), 'Depto 1', id).datos;
  assert.equal(M.agregarPropiedad(d, '   ', id).error, 'vacio');
  assert.equal(M.agregarPropiedad(d, 'DEPTO 1', id).error, 'repetido');
  assert.equal(M.agregarPropiedad(d, 'Depto 2', id).error, undefined);
  const lleno = { ...d, propiedades: Array.from({ length: M.MAX_PROPIEDADES }, (_, k) => ({ id: `x${k}`, nombre: `P${k}` })) };
  assert.equal(M.agregarPropiedad(lleno, 'Otra', id).error, 'tope');
  assert.equal(M.agregarPropiedad(M.agregarPropiedad(M.datosVacios(), 'Quinta', id).datos, 'quinta', id).error, 'repetido');
});
test('cambiar el nombre: conserva los gastos y puede cambiar solo mayúsculas', () => {
  const d = dosPropiedades();
  const r = M.renombrarPropiedad(d, 'quinta', 'LA QUINTA');
  assert.equal(r.error, undefined);
  assert.equal(M.nombrePropiedad(r.datos, 'quinta'), 'LA QUINTA');
  assert.equal(M.renombrarPropiedad(d, 'quinta', 'casa').error, 'repetido');
  assert.equal(r.datos.gastos.filter(g => g.propiedadId === 'quinta').length, 3);
});
test('borrar una propiedad no borra plata: los gastos pasan a sin asignar y libres sigue igual', () => {
  const d = dosPropiedades();
  const antes = M.resumenMes(d, MES).libres;
  const sin = M.borrarPropiedad(d, 'quinta');
  assert.equal(sin.gastos.length, d.gastos.length);
  assert.equal(sin.gastos.some(g => g.propiedadId === 'quinta'), false);
  assert.equal(M.resumenMes(sin, MES).libres, antes);
  assert.equal(M.resumenPropiedades(sin, MES).sinAsignar.total, $(130_000));
  assert.equal('propiedades' in M.borrarPropiedad(sin, 'casa'), false);
  assert.equal(d.propiedades.length, 2);   // no toca el original
});

/* ── datos guardados de clientes ── */
test('los datos de hoy pasan por migrar sin cambiar nada', () => {
  const hoy = sinPropiedades();
  const out = M.migrar(JSON.parse(JSON.stringify(hoy)));
  assert.equal('propiedades' in out, false);
  assert.equal(out.gastos.some(g => 'propiedadId' in g), false);
  assert.equal('propiedades' in M.datosVacios(), false);
  assert.equal(JSON.stringify(M.migrar(out)), JSON.stringify(out));
  assert.equal(M.resumenMes(out, MES).libres, M.resumenMes(hoy, MES).libres);
});
test('las propiedades sobreviven guardar y volver a abrir (y una copia exportada)', () => {
  const out = M.migrar(JSON.parse(JSON.stringify(dosPropiedades())));
  assert.deepEqual(out.propiedades, dosPropiedades().propiedades);
  assert.equal(out.gastos.find(g => g.id === 'q-seg').propiedadId, 'quinta');
  assert.equal(M.resumenPropiedades(out, MES).total, $(460_000));
});
test('migrar limpia la basura y no se rompe', () => {
  const d = dosPropiedades();
  d.propiedades = [{ id: 'casa', nombre: 'Casa' }, { id: 'casa', nombre: 'Doble' }, { id: '', nombre: 'Sin id' }, { id: 'x', nombre: '  ' }, null, { id: M.SIN_PROPIEDAD, nombre: 'Reservada' }];
  const out = M.migrar(d);
  assert.deepEqual(out.propiedades, [{ id: 'casa', nombre: 'Casa' }]);
  assert.equal(out.gastos.find(g => g.id === 'q-luz').propiedadId, undefined);   // la quinta ya no está
  assert.equal(out.gastos.length, d.gastos.length);
  assert.equal('propiedades' in M.migrar({ ...sinPropiedades(), propiedades: 'nada' }), false);
  const muchas = Array.from({ length: 20 }, (_, k) => ({ id: `p${k}`, nombre: `P${k}` }));
  assert.equal(M.migrar({ propiedades: muchas }).propiedades.length, M.MAX_PROPIEDADES);
});
test('una propiedad que ya no existe no pierde el gasto: va a sin asignar', () => {
  const d = dosPropiedades();
  d.propiedades = d.propiedades.filter(p => p.id !== 'quinta');
  const r = M.resumenMes(d, MES);
  const p = M.resumenPropiedades(d, MES, r);
  assert.equal(p.propiedades[0].aparte + p.sinAsignar.aparte, r.totGastos);
  assert.equal(p.sinAsignar.total, $(130_000));
});

/* ── facturas: no pisar el gasto de otra propiedad ── */
const factura = { tipo: 'factura', nombre: 'Luz', categoria: 'Luz', monto: $(70_000), vence: '2026-11-20' };
test('una factura con dos gastos iguales en propiedades distintas pregunta de cuál es', () => {
  const [it] = D.itemsDeFactura(factura, dosPropiedades(), { archivo: 'a.pdf', hoy: '2026-11-06' });
  assert.deepEqual(it.candidatos.map(c => [c.id, c.propiedadId]), [['c-luz', 'casa'], ['q-luz', 'quinta']]);
  assert.equal(it.previoId, 'c-luz');
  assert.deepEqual(it.candidatos.map(c => c.antes), [$(40_000), $(25_000)]);
  /* elegir la quinta actualiza la de la quinta y la casa queda como estaba */
  const elegido = it.candidatos[1];
  Object.assign(it, { previoId: elegido.id, antes: elegido.antes, accion: elegido.accion });
  const { datos } = D.aplicarItems(dosPropiedades(), [it], { hoy: '2026-11-06', nuevoId: () => 'n' });
  assert.equal(datos.gastos.find(g => g.id === 'q-luz').monto, $(70_000));
  assert.equal(datos.gastos.find(g => g.id === 'q-luz').propiedadId, 'quinta');
  assert.equal(datos.gastos.find(g => g.id === 'c-luz').monto, $(40_000));
});
test('sin propiedades, la factura se lee igual que hoy', () => {
  const [it] = D.itemsDeFactura(factura, sinPropiedades(), { archivo: 'a.pdf', hoy: '2026-11-06' });
  assert.equal('candidatos' in it, false);
  assert.equal(it.previoId, 'c-luz');
});

/* ── lo que se mantiene al operar sobre un gasto ── */
test('confirmar, cambiar de tarjeta y dar de baja no le sacan la propiedad al gasto', () => {
  const d = dosPropiedades();
  assert.equal(M.confirmarGasto(d, 'q-luz', MES, $(30_000)).datos.gastos.find(g => g.id === 'q-luz').propiedadId, 'quinta');
  assert.equal(M.darDeBajaGasto(d, 'q-luz', MES).datos.gastos.find(g => g.id === 'q-luz').propiedadId, 'quinta');
  assert.equal(M.aplicarCambio(d, { desde: 'visa', hacia: 'amex', gastos: ['q-seg'], fecha: '2026-11-06' }).gastos.find(g => g.id === 'q-seg').propiedadId, 'quinta');
});

/* ── interruptor y textos ── */
test('el interruptor viene apagado y se prende solo con ?flag=propiedades', () => {
  assert.equal(FLAGS.propiedades, false);
  assert.equal(flagsActivos('').propiedades, false);
  assert.equal(flagsActivos('?flag=propiedades').propiedades, true);
});
test('todo texto de propiedades está en español y en inglés', () => {
  const claves = o => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? claves(v).map(x => `${k}.${x}`) : [k])).sort();
  assert.deepEqual(claves(M.TEXTOS_PROPIEDADES.en), claves(M.TEXTOS_PROPIEDADES.es));
  assert.equal(M.PROPIEDADES_SUGERIDAS.en.length, M.PROPIEDADES_SUGERIDAS.es.length);
});

/* ── editar un gasto desde el formulario: lo que el formulario no muestra no se pierde ── */
const delForm = (id, monto, extra = {}) => ({ id, nombre: 'Luz', categoria: 'Luz', monto: $(monto), repite: true, desde: '2026-10', ...extra });
test('editar un gasto bimestral: sigue siendo bimestral y no cambia los meses en que cuenta', () => {
  const previo = delForm('g', 40_000, { frecuencia: 2 });
  const editado = M.gastoEditado(previo, delForm('g', 45_000));
  assert.equal(editado.frecuencia, 2);
  assert.equal(editado.monto, $(45_000));
  const d = { ...M.datosVacios(), gastos: [editado] };
  assert.equal(M.resumenMes(d, '2026-11').totGastos, 0);
  assert.equal(M.resumenMes(d, '2026-12').totGastos, $(45_000));
});
test('editar un gasto conserva la suba programada y la fecha de la factura', () => {
  const previo = delForm('g', 40_000, { sube: { desde: '2027-03', monto: $(60_000) }, doc: { fecha: '2026-10-20' } });
  const editado = M.gastoEditado(previo, delForm('g', 40_000));
  assert.deepEqual(editado.sube, previo.sube);
  assert.deepEqual(editado.doc, previo.doc);
  assert.equal(M.resumenMes({ ...M.datosVacios(), gastos: [editado] }, '2027-03').totGastos, $(60_000));
});
test('monto estimado de una factura vieja: sigue estimado si no se toca, deja de serlo si la persona lo corrige', () => {
  const previo = delForm('g', 40_000, { doc: { fecha: '2026-08-20', estimado: true } });
  assert.deepEqual(M.gastoEditado(previo, delForm('g', 40_000)).doc, { fecha: '2026-08-20', estimado: true });
  assert.deepEqual(M.gastoEditado(previo, delForm('g', 45_000)).doc, { fecha: '2026-08-20' });
});
test('si deja de repetirse, no le quedan frecuencia ni suba; la factura sí', () => {
  const previo = delForm('g', 40_000, { frecuencia: 2, sube: { desde: '2027-03', monto: $(60_000) }, doc: { fecha: '2026-10-20' } });
  const editado = M.gastoEditado(previo, delForm('g', 40_000, { repite: false }));
  assert.equal('frecuencia' in editado, false);
  assert.equal('sube' in editado, false);
  assert.deepEqual(editado.doc, previo.doc);
});
test('un gasto nuevo o sin esos datos queda tal cual lo armó el formulario', () => {
  const nuevo = delForm('g', 40_000);
  assert.deepEqual(M.gastoEditado(undefined, nuevo), nuevo);
  assert.deepEqual(M.gastoEditado(delForm('g', 30_000), nuevo), nuevo);
});
