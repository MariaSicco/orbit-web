/* Mi Mes by Orbit · resumen de EJEMPLO con el esquema final de /api/leer-resumen.
   Lo usa la función mientras no está conectada la lectura real y la app
   cuando no puede llamar a la función (archivo abierto local).
   Datos inventados: banco, comercios, números y montos no son de nadie.
   Cierra la cuenta: saldo anterior + pagos y créditos + consumos + cargos = total. */

const pad = n => String(n).padStart(2, '0');
const fecha = (a, m, d) => `${a}-${pad(m)}-${pad(d)}`;
const sumar = ([a, m], k) => { const n = a * 12 + (m - 1) + k; return [Math.floor(n / 12), (n % 12) + 1]; };

/* El ejemplo vence el mes que viene, así se ve en "te quedan libres". */
export function resumenEjemplo(hoy = new Date()) {
  const act = [hoy.getFullYear(), hoy.getMonth() + 1];
  const sig = sumar(act, 1), ant = sumar(act, -1), sig2 = sumar(act, 2);
  const mesTxt = ([a, m]) => `${a}-${pad(m)}`;
  return {
    tarjeta: { banco: 'Banco Ejemplo', red: 'Visa', ultimos4: '4821' },
    tarjetas: [
      { ultimos4: '4821', adicional: false, totales: [{ moneda: 'ARS', monto: 371_480.5 }, { moneda: 'USD', monto: 56.19 }, { moneda: 'EUR', monto: 18 }] },
      { ultimos4: '7310', adicional: true, totales: [{ moneda: 'ARS', monto: 40_900 }] },
    ],
    periodo: { desde: fecha(...ant, 27), hasta: fecha(...act, 26) },
    cierreAnterior: fecha(...ant, 26), vencimientoAnterior: fecha(...act, 6),
    cierre: fecha(...act, 26), vencimiento: fecha(...sig, 8),
    proximoCierre: fecha(...sig, 25), proximoVencimiento: fecha(...sig2, 7),
    saldoAnterior: [{ moneda: 'ARS', monto: 298_150 }, { moneda: 'USD', monto: 12 }],
    totales: [{ moneda: 'ARS', monto: 438_627.13 }, { moneda: 'USD', monto: 56.19 }, { moneda: 'EUR', monto: 18 }],
    pagoMinimo: { moneda: 'ARS', monto: 44_000 },
    limites: { compra: 2_500_000, financiacion: 2_000_000 },
    consumos: [
      { fecha: fecha(...act, 3), comercio: 'SUPERMERCADO EJEMPLO 214', monto: 86_430.5, moneda: 'ARS', rubro: 'Supermercado', cuota: null, tarjeta: '4821' },
      { fecha: fecha(...act, 6), comercio: 'PARRILLA DEL BARRIO', monto: 38_900, moneda: 'ARS', rubro: 'Comida', cuota: null, tarjeta: '4821' },
      { fecha: fecha(...act, 9), comercio: 'ESTACION DE SERVICIO RUTA 8', monto: 52_000, moneda: 'ARS', rubro: 'Transporte', cuota: null, tarjeta: '4821' },
      { fecha: fecha(...act, 11), comercio: 'FARMACIA CENTRAL', monto: 21_350, moneda: 'ARS', rubro: 'Salud', cuota: null, tarjeta: '7310' },
      { fecha: fecha(...ant, 14), comercio: 'ELECTRO HOGAR EJEMPLO', monto: 95_000, moneda: 'ARS', rubro: 'Otros', cuota: { n: 3, de: 6 }, tarjeta: '4821' },
      { fecha: fecha(...act, 2), comercio: 'TIENDA DE ROPA EJEMPLO', monto: 19_550, moneda: 'ARS', rubro: 'Ropa', cuota: { n: 1, de: 3 }, tarjeta: '7310' },
      { fecha: fecha(...act, 15), comercio: 'CELULARES EJEMPLO', monto: 73_000, moneda: 'ARS', rubro: 'Otros', cuota: { n: 1, de: 12 }, tarjeta: '4821' },
      { fecha: fecha(...act, 18), comercio: 'LIBRERIA EJEMPLO', monto: 26_150, moneda: 'ARS', rubro: 'Otros', cuota: null, tarjeta: '4821' },
      { fecha: fecha(...act, 4), comercio: 'STREAMING*SERIES', monto: 10.99, moneda: 'USD', rubro: 'Suscripciones', cuota: null, tarjeta: '4821' },
      { fecha: fecha(...act, 12), comercio: 'TIENDA ONLINE INTL', monto: 45.2, moneda: 'USD', rubro: 'Entretenimiento', cuota: null, tarjeta: '4821' },
      { fecha: fecha(...act, 18), comercio: 'MUSEO EJEMPLO MADRID', monto: 18, moneda: 'EUR', rubro: 'Entretenimiento', cuota: null, tarjeta: '4821' },
    ],
    pagosYCreditos: [
      { fecha: fecha(...act, 5), concepto: 'SU PAGO EN PESOS', monto: -298_150, moneda: 'ARS', tipo: 'pago' },
      { fecha: fecha(...act, 5), concepto: 'SU PAGO EN USD', monto: -12, moneda: 'USD', tipo: 'pago' },
      { fecha: fecha(...act, 8), concepto: 'DEVOLUCION COMPRA TIENDA EJEMPLO', monto: -8_000, moneda: 'ARS', tipo: 'credito' },
    ],
    cargos: [
      { fecha: fecha(...act, 26), concepto: 'IMPUESTO DE SELLOS', monto: 4_120.4, moneda: 'ARS', tipo: 'sellos' },
      { fecha: fecha(...act, 26), concepto: 'PERCEPCION RG 5617 30%', monto: 33_726.23, moneda: 'ARS', tipo: 'percepcion' },
      { fecha: fecha(...act, 26), concepto: 'DEVOLUCION PERCEPCION RG 5617', monto: -3_600, moneda: 'ARS', tipo: 'devolucion' },
    ],
    cuotasAVencer: [
      /* el mes de la tabla es el del cierre del resumen que la incluye */
      { mes: mesTxt(sig), monto: 187_550, moneda: 'ARS', desde: false },
      { mes: mesTxt(sig2), monto: 187_550, moneda: 'ARS', desde: false },
      { mes: mesTxt(sumar(act, 3)), monto: 168_000, moneda: 'ARS', desde: false },
      { mes: mesTxt(sumar(act, 4)), monto: 584_000, moneda: 'ARS', desde: true },
    ],
    confianza: 'alta',
    dudas: [],
    avisos: ['Modo prueba: estos datos son de ejemplo, no salen de tu PDF.'],
  };
}
