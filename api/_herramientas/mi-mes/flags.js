/* Interruptores de Mi Mes. Lo que no está firme al congelamiento sale apagado.
   Para probar una función apagada en preview: ?flag=nombre (solo esa sesión). */
export const FLAGS = {
  diaDeCobro: true,       // A · día de cobro, línea del mes y "vence antes de que cobres"
  consejo: true,          // B1 · tarjeta de consejo en Inicio
  metas: true,            // B2 · una meta a la vez
  retos: true,            // B3 · retos de un mes
  fichaCompra: true,      // 0 · ficha de una compra: la compra, sus cuotas y en qué resumen se paga cada una
  mesEn30: true,          // 1 · Inicio "tu mes en 30 segundos"
  preguntas: true,        // 2 · "preguntame solo lo que cambia mi mes"
  finDeCuota: true,       // 3 · lo que se libera va a la meta
  pagoVencido: true,      // resumen ya vencido al importarlo: ¿ya lo pagaste? (ajuste del socio, 15/10)
  /* tanda 11: se encienden de a una cuando pasan la QA */
  diaDificil: false,      // (4) saldo de hoy y día por día
  cambioTarjeta: false,   // (7) cambiar o dejar una tarjeta
  historia: false,        // (2) una sola historia por gasto
  devolver: false,        // (6) plata que te tienen que devolver
  compartidas: false,     // (8) cuotas compartidas
  comoPagar: false,       // (9) ¿cómo me conviene pagar esta compra?
  queCambio: false,       // (3) qué cambió en tu mes desde la última vez
  gastoEstimado: false,   // (5) gasto fijo estimado hasta que aparece, con monto real y "lo di de baja"
  dondeRinde: false,      // B4 · "Dónde puede rendir tu plata": APAGADO hasta el OK legal de Majo
};
export function flagsActivos(search = '') {
  const f = { ...FLAGS };
  try {
    for (const n of new URLSearchParams(search).getAll('flag')) if (n in f) f[n] = true;
  } catch { /* sin URL: quedan los de fábrica */ }
  return f;
}
