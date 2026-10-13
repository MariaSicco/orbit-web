/* Vencimientos de la Casa (ob-021): fechas y montos tienen que dar exacto. Montos en centavos. */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const V = await import('../api/_herramientas/vencimientos/calculos.js');

const $ = p => Math.round(p * 100);
const HOY = '2026-10-13';
const base = () => {
  const d = V.estadoVacio();
  d.cuentas = [
    { id: 'luz', nombre: 'Edenor', categoria: 'Servicios', frecuencia: 1, primerVto: '2026-09-20', monto: $(30000) },
    { id: 'agua', nombre: 'AySA', categoria: 'Servicios', frecuencia: 2, primerVto: '2026-08-10', monto: $(18000) },
    { id: 'abl', nombre: 'ABL', categoria: 'Impuestos', frecuencia: 1, primerVto: '2026-10-05', monto: $(12000), debito: true },
    { id: 'vtv', nombre: 'VTV', categoria: 'Auto', tipo: 'tramite', frecuencia: 12, primerVto: '2026-11-30' },
    { id: 'pat', nombre: 'Patente', categoria: 'Auto', frecuencia: 2, primerVto: '2026-03-15', cuotas: 5, monto: $(40000) },
    { id: 'alq', nombre: 'Alquiler', categoria: 'Vivienda', frecuencia: 1, primerVto: '2026-01-10', monto: $(500000), moneda: 'ARS' },
  ];
  return d;
};

test('sumarMeses respeta fin de mes y vuelve al día original', () => {
  assert.equal(V.sumarMeses('2026-01-31', 1, 31), '2026-02-28');
  assert.equal(V.sumarMeses('2026-01-31', 2, 31), '2026-03-31');
  assert.equal(V.sumarMeses('2028-01-31', 1, 31), '2028-02-29');
  assert.equal(V.sumarMeses('2026-11-15', 3), '2027-02-15');
});

test('claves: mensual sin fin, bimestral, cuotas y hasta', () => {
  const d = base();
  const luz = d.cuentas[0];
  assert.deepEqual(V.claves(luz, '2026-10-01', '2026-12-31'), ['2026-10-20', '2026-11-20', '2026-12-20']);
  assert.deepEqual(V.claves(d.cuentas[1], '2026-10-01', '2027-02-28'), ['2026-10-10', '2026-12-10', '2027-02-10']);
  const pat = d.cuentas[4]; // 15/3, 15/5, 15/7, 15/9, 15/11 y termina
  assert.deepEqual(V.claves(pat, '2026-01-01', '2027-12-31'), ['2026-03-15', '2026-05-15', '2026-07-15', '2026-09-15', '2026-11-15']);
  assert.equal(V.numeroDeCuota(pat, '2026-11-15'), 5);
  const conFin = { ...luz, hasta: '2026-11-30' };
  assert.deepEqual(V.claves(conFin, '2026-10-01', '2027-03-31'), ['2026-10-20', '2026-11-20']);
  const unaVez = { ...luz, frecuencia: 0, primerVto: '2026-12-01' };
  assert.deepEqual(V.claves(unaVez, '2026-01-01', '2027-12-31'), ['2026-12-01']);
});

test('claves salta rápido desde una cuenta vieja sin perder ninguna', () => {
  const c = { id: 'x', frecuencia: 3, primerVto: '2010-02-28' };
  assert.deepEqual(V.claves(c, '2026-01-01', '2026-12-31'), ['2026-02-28', '2026-05-28', '2026-08-28', '2026-11-28']);
});

test('estados: vencido, hoy, próximo, débito, trámite sin monto', () => {
  const d = base();
  const oct = V.ocurrenciasDelMes(d, '2026-10', HOY);
  const est = Object.fromEntries(oct.map(o => [o.cuentaId, o.estado]));
  assert.equal(est.abl, 'debitado');      // 5/10 con débito: se da por pagado
  assert.equal(est.agua, 'vencido');      // 10/10 sin pagar
  assert.equal(est.alq, 'vencido');
  assert.equal(est.luz, 'proximo');       // 20/10, a 7 días
  const hoy = V.ocurrencia(d, d.cuentas[0], '2026-10-20', '2026-10-20');
  assert.equal(hoy.estado, 'hoy');
  const vtv = V.ocurrencia(d, d.cuentas[3], '2026-11-30', HOY);
  assert.equal(vtv.monto, null);
  assert.equal(vtv.estado, 'pendiente');
});

test('segundo vencimiento: entre el 1º y el 2º queda en "segundo"', () => {
  const d = base();
  d.cuentas[1].segundoVto = 7;
  assert.equal(V.ocurrencia(d, d.cuentas[1], '2026-10-10', '2026-10-13').estado, 'segundo');
  assert.equal(V.ocurrencia(d, d.cuentas[1], '2026-10-10', '2026-10-18').estado, 'vencido');
  assert.equal(V.ocurrencia(d, d.cuentas[1], '2026-10-10', '2026-10-13').segundo, '2026-10-17');
});

test('pagar con otro monto: ese monto pasa a ser la estimación de los siguientes', () => {
  let d = base();
  d = V.marcarPagado(d, 'luz', '2026-10-20', { monto: $(36000), fecha: '2026-10-18' });
  const oct = V.ocurrencia(d, d.cuentas[0], '2026-10-20', HOY);
  assert.equal(oct.estado, 'pagado');
  assert.equal(oct.monto, $(36000));
  const nov = V.ocurrencia(d, d.cuentas[0], '2026-11-20', HOY);
  assert.equal(nov.monto, $(36000));
  assert.equal(nov.origen, 'estimado');
  d = V.desmarcarPagado(d, 'luz', '2026-10-20');
  assert.equal(V.ocurrencia(d, d.cuentas[0], '2026-10-20', HOY).estado, 'proximo');
});

test('factura: corre la fecha y fija el monto de esa ocurrencia sin tocar la serie', () => {
  let d = base();
  d = V.cargarFactura(d, 'luz', '2026-11-20', { monto: $(41000), fecha: '2026-11-23' });
  const nov = V.ocurrencia(d, d.cuentas[0], '2026-11-20', HOY);
  assert.equal(nov.vence, '2026-11-23');
  assert.equal(nov.monto, $(41000));
  assert.equal(nov.origen, 'factura');
  assert.equal(V.ocurrencia(d, d.cuentas[0], '2026-12-20', HOY).vence, '2026-12-20');
  // volver a la fecha original limpia la corrección
  d = V.cargarFactura(d, 'luz', '2026-11-20', { fecha: '2026-11-20' });
  assert.equal(d.facturas.luz['2026-11-20'].fecha, undefined);
});

test('una factura que corre la fecha al mes siguiente cuenta en ese mes', () => {
  let d = base();
  d = V.cargarFactura(d, 'luz', '2026-10-20', { fecha: '2026-11-02' });
  assert.ok(!V.ocurrenciasDelMes(d, '2026-10', HOY).some(o => o.cuentaId === 'luz'));
  const nov = V.ocurrenciasDelMes(d, '2026-11', HOY).filter(o => o.cuentaId === 'luz');
  assert.deepEqual(nov.map(o => o.vence), ['2026-11-02', '2026-11-20']);
});

test('resumen del mes: total, pagado y lo que falta, sin trámites ni salteados', () => {
  let d = base();
  d = V.marcarPagado(d, 'alq', '2026-10-10', { monto: $(500000), fecha: '2026-10-09' });
  const r = V.resumenMes(d, '2026-10', HOY);
  // octubre: luz 30.000 · agua 18.000 · ABL 12.000 (débito) · alquiler 500.000
  assert.equal(r.ars.total, $(560000));
  assert.equal(r.ars.pagado, $(512000));
  assert.equal(r.ars.pendiente, $(48000));
  assert.equal(r.cantPendientes, 2);
  assert.deepEqual(r.categorias[0], ['Vivienda', $(500000)]);
  d = V.saltear(d, 'agua', '2026-10-10');
  assert.equal(V.resumenMes(d, '2026-10', HOY).ars.total, $(542000));
});

test('dólares van aparte y no se suman a los pesos', () => {
  const d = base();
  d.cuentas.push({ id: 'usd', nombre: 'Alquiler cochera', categoria: 'Vivienda', frecuencia: 1, primerVto: '2026-10-01', monto: $(80), moneda: 'USD' });
  const r = V.resumenMes(d, '2026-10', HOY);
  assert.equal(r.usd.total, $(80));
  assert.equal(r.ars.total, $(560000));
});

test('atrasados: lo vencido de meses anteriores no se pierde', () => {
  const d = base();
  const a = V.atrasados(d, HOY);
  assert.ok(a.some(o => o.cuentaId === 'alq' && o.clave === '2026-09-10'));
  assert.ok(!a.some(o => o.cuentaId === 'abl')); // débito
});

test('historial y suba: variación contra el anterior y contra el año', () => {
  let d = base();
  const c = d.cuentas[0];
  d = V.marcarPagado(d, 'luz', '2025-10-20', { monto: $(10000), fecha: '2025-10-20' });
  d = V.marcarPagado(d, 'luz', '2026-09-20', { monto: $(25000), fecha: '2026-09-20' });
  d = V.cargarFactura(d, 'luz', '2026-10-20', { monto: $(30000) });
  const h = V.historial(d, c);
  assert.equal(h.length, 3);
  assert.equal(h[2].vsAnterior, 0.2);
  assert.equal(h[2].vsAnio, 2);
  const s = V.suba(d, c);
  assert.equal(s.pct, 2);
  assert.equal(s.meses, 12);
});

test('proyección anual: 12 meses, con cuotas que terminan', () => {
  const d = base();
  const p = V.proyeccionAnual(d, HOY);
  assert.equal(p.meses.length, 12);
  // patente: queda solo la cuota de noviembre
  const pat = p.categorias.find(([c]) => c === 'Auto');
  assert.deepEqual(pat, ['Auto', $(40000)]);
  // luz 12 × 30.000 + agua 6 × 18.000 + ABL 12 × 12.000 + alquiler 12 × 500.000 + patente 40.000
  assert.equal(p.total, $(12 * 30000 + 6 * 18000 + 12 * 12000 + 12 * 500000 + 40000));
});

test('proximaDe salta lo resuelto', () => {
  let d = base();
  d = V.marcarPagado(d, 'agua', '2026-08-10', { monto: $(18000), fecha: '2026-08-09' });
  d = V.marcarPagado(d, 'agua', '2026-10-10', { monto: $(18000), fecha: '2026-10-09' });
  assert.equal(V.proximaDe(d, d.cuentas[1], HOY).clave, '2026-12-10');
  assert.equal(V.proximaDe(d, d.cuentas[4], '2027-01-01').cuota, 1); // la cuota más vieja sin pagar
  for (const k of V.claves(d.cuentas[4], '2026-01-01', '2027-12-31')) d = V.marcarPagado(d, 'pat', k, { monto: 1, fecha: k });
  assert.equal(V.proximaDe(d, d.cuentas[4], '2027-01-01'), null); // patente terminada
});

test('proximoDia: si el día ya pasó este mes, va al siguiente', () => {
  assert.equal(V.proximoDia(20, HOY), '2026-10-20');
  assert.equal(V.proximoDia(5, HOY), '2026-11-05');
  assert.equal(V.proximoDia(31, '2026-11-02'), '2026-11-30');
  assert.equal(V.proximoDia(13, HOY), '2026-10-13');
});

test('plata: formato argentino y lectura flexible', () => {
  assert.equal(V.formatoPesos($(1234567)), '$ 1.234.567');
  assert.equal(V.formatoMoneda($(80), 'USD'), 'US$ 80');
  assert.equal(V.leerPesos('12.345'), $(12345));
  assert.equal(V.leerPesos('$ 1.234.567'), $(1234567));
  assert.equal(V.leerPesos('12345,50'), 1234550);
  assert.equal(V.leerPesos('1.234,5'), 123450);
  assert.equal(V.leerPesos('99.5'), 9950);
  assert.equal(V.leerPesos(''), null);
  assert.equal(V.leerPesos('abc'), null);
});

test('ics: un evento por vencimiento futuro sin pagar, con 2 alarmas y UID estable', () => {
  let d = base();
  d = V.marcarPagado(d, 'luz', '2026-10-20', { monto: $(30000), fecha: HOY });
  const { texto, eventos } = V.generarICS(d, { hoy: HOY, cuentaId: 'luz', meses: 3, sello: '2026-10-13T12:00:00.000Z' });
  assert.equal(eventos, 2); // nov y dic (oct ya pagado; el 20/1 queda fuera de los 3 meses)
  assert.ok(texto.startsWith('BEGIN:VCALENDAR\r\n'));
  assert.ok(texto.includes('UID:luz-2026-11-20@vencimientos.orbitando.com.ar'));
  assert.ok(texto.includes('DTSTART;VALUE=DATE:20261120'));
  assert.ok(texto.includes('DTEND;VALUE=DATE:20261121'));
  assert.equal((texto.match(/BEGIN:VALARM/g) || []).length, 4);
  assert.ok(texto.includes('TRIGGER:-PT63H'));  // 3 días antes, 9:00
  assert.ok(texto.includes('TRIGGER:PT9H'));    // el mismo día, 9:00
  assert.ok(texto.includes('DTSTAMP:20261013T120000Z'));
  assert.ok(texto.split('\r\n').every(l => new TextEncoder().encode(l).length <= 75));
});

test('ics: débito y trámite se escriben distinto; vencidos no se exportan', () => {
  const d = base();
  const { texto } = V.generarICS(d, { hoy: HOY, meses: 2, sello: '2026-10-13T12:00:00Z' });
  assert.ok(texto.includes('SUMMARY:Se debita: ABL'));
  assert.ok(texto.includes('SUMMARY:Vence: VTV\r\n'));
  assert.ok(!texto.includes('agua-2026-10-10'));
});

test('triggerAlarma con otras horas', () => {
  assert.equal(V.triggerAlarma(1, '08:30'), '-PT15H30M');
  assert.equal(V.triggerAlarma(0, '20:00'), 'PT20H');
  assert.equal(V.triggerAlarma(7, '09:00'), '-PT159H');
});

test('respaldo: ida y vuelta, y rechaza archivos ajenos', () => {
  let d = base();
  d = V.marcarPagado(d, 'luz', '2026-10-20', { monto: $(1), fecha: HOY });
  const back = V.leerRespaldo(V.exportarRespaldo(d));
  assert.deepEqual(back.cuentas, d.cuentas);
  assert.deepEqual(back.pagos, d.pagos);
  assert.throws(() => V.leerRespaldo('{"hola":1}'), /no es un respaldo/);
  assert.throws(() => V.leerRespaldo('no json'), /no es un respaldo válido/);
});

test('migrar descarta cuentas rotas y completa la config', () => {
  const m = V.migrar({ cuentas: [{ id: 'a', primerVto: '2026-01-01' }, { id: 'b' }, null], config: { hora: '07:00' } });
  assert.equal(m.cuentas.length, 1);
  assert.equal(m.config.hora, '07:00');
  assert.deepEqual(m.config.avisos, [3, 0]);
});

test('borrar cuenta borra sus pagos y facturas', () => {
  let d = base();
  d = V.marcarPagado(d, 'luz', '2026-10-20', { monto: 1, fecha: HOY });
  d = V.borrarCuenta(d, 'luz');
  assert.equal(d.pagos.luz, undefined);
  assert.equal(d.cuentas.length, 5);
});

test('ajuste de alquiler: avisa cada N meses desde el primer vencimiento', () => {
  const d = base();
  d.cuentas[5].ajusteCada = 3; // alquiler desde 10/01: ajusta abril, julio, octubre
  assert.equal(V.ocurrencia(d, d.cuentas[5], '2026-10-10', HOY).ajusta, true);
  assert.equal(V.ocurrencia(d, d.cuentas[5], '2026-11-10', HOY).ajusta, false);
  assert.equal(V.ocurrencia(d, d.cuentas[5], '2026-01-10', HOY).ajusta, false);
  const { texto } = V.generarICS(d, { hoy: '2026-12-01', cuentaId: 'alq', meses: 2, sello: '2026-12-01T00:00:00Z' });
  assert.ok(texto.includes('Alquiler · ≈ $ 500.000 · se ajusta'));
});

test('habil: un vencimiento que cae sábado o domingo pasa al lunes', () => {
  const d = base();
  const c = { id: 'mono', nombre: 'Monotributo', categoria: 'Impuestos', frecuencia: 1, primerVto: '2026-06-20', monto: $(50000), habil: true };
  d.cuentas.push(c);
  assert.equal(V.ocurrencia(d, c, '2026-06-20', HOY).vence, '2026-06-22'); // sábado
  assert.equal(V.ocurrencia(d, c, '2026-09-20', HOY).vence, '2026-09-21'); // domingo
  assert.equal(V.ocurrencia(d, c, '2026-10-20', HOY).vence, '2026-10-20'); // martes
  const sinHabil = { ...c, habil: false };
  assert.equal(V.ocurrencia(d, sinHabil, '2026-06-20', HOY).vence, '2026-06-20');
});

test('ics: el débito automático suma un aviso al día siguiente para revisar', () => {
  const d = base();
  const { texto } = V.generarICS(d, { hoy: HOY, cuentaId: 'abl', meses: 1, sello: '2026-10-13T00:00:00Z' });
  assert.ok(texto.includes('ABL: revisá que se haya debitado'));
  assert.ok(texto.includes('TRIGGER:PT33H'));
});

test('fecha a confirmar: se marca hasta que hay factura o pago', () => {
  let d = base();
  d.cuentas[0].fechaAConfirmar = true;
  assert.equal(V.ocurrencia(d, d.cuentas[0], '2026-10-20', HOY).aConfirmar, true);
  d = V.cargarFactura(d, 'luz', '2026-10-20', { fecha: '2026-10-22' });
  assert.equal(V.ocurrencia(d, d.cuentas[0], '2026-10-20', HOY).aConfirmar, false);
  const { texto } = V.generarICS(d, { hoy: HOY, cuentaId: 'luz', meses: 2, sello: '2026-10-13T00:00:00Z' });
  assert.ok(texto.includes('fecha a confirmar'));
});

test('planes de suscripciones: IVA sumado donde la página dice + impuestos', async () => {
  const S = await import('../api/_herramientas/vencimientos/servicios.js');
  const sp = S.servicio('spotify').planes.find(p => p.nombre === 'Individual');
  assert.equal(sp.lista, 449900);
  assert.equal(sp.monto, 544400); // 4.499 × 1,21 = 5.443,79 → 5.444
  const dis = S.servicio('disney').planes[0];
  assert.equal(dis.monto, dis.lista); // Disney+ publica precio final
});
