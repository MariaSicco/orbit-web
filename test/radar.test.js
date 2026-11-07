/* Vencimientos · radar (fugas y cobros raros) y costo de cada casa. Datos inventados. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
const V = await import('../api/_herramientas/vencimientos/calculos.js');
const R = await import('../api/_herramientas/vencimientos/radar.js');
const HOY = '2026-10-15';
const tarjeta = { red: 'Visa', banco: 'Banco Galicia', ultimos4: '1234' };
const sep = { tarjeta, vencimiento: '2026-09-20', consumos: [
  { fecha: '2026-08-14', comercio: 'NETFLIX.COM', monto: 15000, moneda: 'ARS', rubro: 'Suscripciones', cuota: null },
  { fecha: '2026-08-05', comercio: 'SPOTIFY P2B3', monto: 5443.79, moneda: 'ARS', rubro: 'Suscripciones', cuota: null },
] };
const oct = { tarjeta, vencimiento: '2026-10-20', consumos: [
  { fecha: '2026-09-14', comercio: 'NETFLIX.COM', monto: 18149, moneda: 'ARS', rubro: 'Suscripciones', cuota: null },
  { fecha: '2026-09-05', comercio: 'SPOTIFY P9Z8', monto: 5443.79, moneda: 'ARS', rubro: 'Suscripciones', cuota: null },
  { fecha: '2026-09-10', comercio: 'MERPAGO*CLUBLECTURA', monto: 7000, moneda: 'ARS', rubro: 'Suscripciones', cuota: null },
  { fecha: '2026-09-21', comercio: 'PEDIDOSYA PROPINA', monto: 3200, moneda: 'ARS', rubro: 'Restaurantes', cuota: null },
  { fecha: '2026-09-22', comercio: 'PEDIDOSYA PROPINA', monto: 3200, moneda: 'ARS', rubro: 'Restaurantes', cuota: null },
  { fecha: '2026-09-02', comercio: 'OPENAI *CHATGPT', monto: 20, moneda: 'USD', rubro: 'Suscripciones', cuota: null },
  { fecha: '2026-08-01', comercio: 'ELECTRO HOGAR', monto: 95000, moneda: 'ARS', rubro: 'Otros', cuota: { n: 3, de: 6 } },
  { fecha: '2026-08-01', comercio: 'ELECTRO HOGAR', monto: 95000, moneda: 'ARS', rubro: 'Otros', cuota: { n: 3, de: 6 } },
] };

test('sumarResumen: guarda lo mínimo, reemplaza el mismo resumen y deja los últimos 3 por tarjeta', () => {
  let l = R.sumarResumen([], sep, HOY);
  l = R.sumarResumen(l, oct, HOY);
  l = R.sumarResumen(l, oct, HOY);
  assert.equal(l.length, 2);
  for (const v of ['2026-11-20', '2026-12-20']) l = R.sumarResumen(l, { ...oct, vencimiento: v }, HOY);
  assert.equal(l.length, 3);
  assert.equal(l[0].vencimiento, '2026-10-20');
  assert.deepEqual(Object.keys(l[0].consumos[0]).sort(), ['comercio', 'cuota', 'fecha', 'moneda', 'monto', 'rubro']);
});

test('radar: cobro repetido, suscripción que subió, cobro nuevo y dólares', () => {
  const rs = R.radar(V.estadoVacio(), R.sumarResumen(R.sumarResumen([], sep, HOY), oct, HOY), HOY);
  const t = k => rs.filter(x => x.tipo === k);
  assert.equal(t('repetido').length, 1);                 // las cuotas iguales no cuentan
  assert.match(t('repetido')[0].nombre, /Pedidosya/i);
  assert.equal(t('subio').length, 1);
  assert.equal(t('subio')[0].nombre, 'Netflix');
  assert.equal(Math.round(t('subio')[0].pct * 100), 21);
  assert.ok(!rs.some(x => x.tipo === 'subio' && /spotify/i.test(x.nombre)));   // mismo monto: nada
  assert.deepEqual(t('nuevo').map(x => x.nombre).sort(), ['ChatGPT', 'Clublectura'].sort());
  assert.equal(t('dolares')[0].monto, 2000);
  assert.equal(rs[0].tipo, 'repetido');
});

test('radar: con un solo resumen no inventa subas ni cobros nuevos; un resumen viejo no avisa', () => {
  const rs = R.radar(V.estadoVacio(), R.sumarResumen([], oct, HOY), HOY);
  assert.ok(!rs.some(x => x.tipo === 'subio' || x.tipo === 'nuevo'));
  assert.equal(R.radar(V.estadoVacio(), R.sumarResumen([], oct, HOY), '2027-01-30').length, 0);
});

test('fugas: suscripciones por mes y por año, pesos y dólares aparte', () => {
  const d = V.estadoVacio();
  d.cuentas = [
    { id: 'n', nombre: 'Netflix', categoria: 'Entretenimiento', frecuencia: 1, primerVto: '2026-10-20', monto: 1814900 },
    { id: 's', nombre: 'Spotify', categoria: 'Entretenimiento', frecuencia: 1, primerVto: '2026-10-05', monto: 544379 },
    { id: 'c', nombre: 'ChatGPT', categoria: 'Apps y trabajo', frecuencia: 1, primerVto: '2026-10-02', monto: 2000, moneda: 'USD' },
    { id: 'l', nombre: 'Edenor', categoria: 'Luz, gas y agua', frecuencia: 1, primerVto: '2026-10-19', monto: 4480000 },
  ];
  const f = R.fugas(d, HOY);
  assert.equal(f.cantidad, 3);
  assert.equal(f.mes, 1814900 + 544379);
  assert.equal(f.anio, (1814900 + 544379) * 12);
  assert.equal(f.anioUSD, 24000);
  assert.ok(R.radar(d, [], HOY).some(x => x.tipo === 'fugas'));
});

test('costoCasa: rango con el historial, confianza y costo anual', () => {
  const d = V.estadoVacio();
  d.cuentas = [
    { id: 'exp', nombre: 'Expensas', categoria: 'Casa', frecuencia: 1, primerVto: '2026-01-10', monto: 15000000 },
    { id: 'luz', nombre: 'Edenor', categoria: 'Luz, gas y agua', frecuencia: 1, primerVto: '2026-01-19', monto: 3000000 },
  ];
  ['2026-06-19', '2026-07-19', '2026-08-19', '2026-09-19'].forEach((k, i) => { (d.pagos.luz ||= {})[k] = { monto: [2400000, 4000000, 3600000, 3000000][i], fecha: k }; });
  ['2026-07-10', '2026-08-10', '2026-09-10'].forEach(k => { (d.pagos.exp ||= {})[k] = { monto: 15000000, fecha: k }; });
  const c = R.costoCasa(d, HOY);
  assert.equal(c.ym, '2026-11');
  assert.equal(c.total, 18000000);
  assert.equal(c.min, 15000000 + 2400000);
  assert.equal(c.max, 15000000 + 4000000);
  assert.equal(c.confianza, 'alta');
  assert.ok(c.anual >= c.total * 11);
  assert.equal(R.costoCasa(V.estadoVacio(), HOY).confianza, 'sin datos');
});

test('radar: un cobro nuevo que ya está en tus cuentas no avisa; la suba trae la cuenta para actualizarla', () => {
  const d = V.estadoVacio();
  d.cuentas = [{ id: 'cl', nombre: 'Clublectura', categoria: 'Apps y trabajo', frecuencia: 1, primerVto: '2026-11-10', monto: 700000 },
    { id: 'nf', nombre: 'Netflix', categoria: 'Entretenimiento', frecuencia: 1, primerVto: '2026-11-14', monto: 1500000 }];
  const rs = R.radar(d, R.sumarResumen(R.sumarResumen([], sep, HOY), oct, HOY), HOY);
  assert.ok(!rs.some(x => x.tipo === 'nuevo' && x.nombre === 'Clublectura'));
  assert.equal(rs.find(x => x.tipo === 'subio').cuentaId, 'nf');
  assert.notEqual(R.claveAviso(rs[0]), R.claveAviso(rs[1]));
});
