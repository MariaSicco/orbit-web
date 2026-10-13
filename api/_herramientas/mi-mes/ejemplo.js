/* Mi Mes by Orbit · resumen de EJEMPLO con el esquema final de /api/leer-resumen.
   Lo usa la función mientras no está conectada la lectura real (Paso 5) y la
   app cuando no puede llamar a la función (archivo abierto local).
   Datos inventados: banco, comercios y montos no son de nadie. */

const pad = n => String(n).padStart(2, '0');
const fecha = (a, m, d) => `${a}-${pad(m)}-${pad(d)}`;

/* El ejemplo vence el mes que viene, así se ve en "te quedan libres". */
export function resumenEjemplo(hoy = new Date()) {
  const a = hoy.getFullYear(), m = hoy.getMonth() + 1;
  const sig = m === 12 ? [a + 1, 1] : [a, m + 1];
  const ant = m === 1 ? [a - 1, 12] : [a, m - 1];
  return {
    tarjeta: { banco: 'Banco Ejemplo', red: 'Visa', ultimos4: '4821' },
    periodo: { desde: fecha(...ant, 27), hasta: fecha(a, m, 26) },
    cierre: fecha(a, m, 26),
    vencimiento: fecha(...sig, 8),
    totales: [
      { moneda: 'ARS', monto: 412_380.5 },
      { moneda: 'USD', monto: 56.19 },
      { moneda: 'EUR', monto: 18 },
    ],
    pagoMinimo: { moneda: 'ARS', monto: 41_240 },
    consumos: [
      { fecha: fecha(a, m, 3), comercio: 'SUPERMERCADO EJEMPLO 214', monto: 86_430.5, moneda: 'ARS', rubro: 'Supermercado', cuota: null },
      { fecha: fecha(a, m, 6), comercio: 'PARRILLA DEL BARRIO', monto: 38_900, moneda: 'ARS', rubro: 'Comida', cuota: null },
      { fecha: fecha(a, m, 9), comercio: 'ESTACION DE SERVICIO RUTA 8', monto: 52_000, moneda: 'ARS', rubro: 'Transporte', cuota: null },
      { fecha: fecha(a, m, 11), comercio: 'FARMACIA CENTRAL', monto: 21_350, moneda: 'ARS', rubro: 'Salud', cuota: null },
      { fecha: fecha(...ant, 14), comercio: 'ELECTRO HOGAR EJEMPLO', monto: 95_000, moneda: 'ARS', rubro: 'Otros', cuota: { n: 3, de: 6 } },
      { fecha: fecha(a, m, 2), comercio: 'TIENDA DE ROPA EJEMPLO', monto: 45_700, moneda: 'ARS', rubro: 'Ropa', cuota: { n: 1, de: 3 } },
      { fecha: fecha(a, m, 15), comercio: 'CELULARES EJEMPLO', monto: 73_000, moneda: 'ARS', rubro: 'Otros', cuota: { n: 1, de: 12 } },
      { fecha: fecha(a, m, 4), comercio: 'STREAMING*SERIES', monto: 10.99, moneda: 'USD', rubro: 'Suscripciones', cuota: null },
      { fecha: fecha(a, m, 12), comercio: 'TIENDA ONLINE INTL', monto: 45.2, moneda: 'USD', rubro: 'Entretenimiento', cuota: null },
      { fecha: fecha(a, m, 18), comercio: 'MUSEO EJEMPLO MADRID', monto: 18, moneda: 'EUR', rubro: 'Entretenimiento', cuota: null },
    ],
    confianza: 'alta',
    avisos: ['Modo prueba: estos datos son de ejemplo, no salen de tu PDF.'],
  };
}
