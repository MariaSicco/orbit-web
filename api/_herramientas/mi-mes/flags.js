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
  subiLoQueTengas: true,  // tanda 14: primer uso subiendo documentos (recibo, resúmenes, facturas, capturas)
  etapas: true,           // tanda 14: 1 subí todo · 2 actualizá con lo de este mes · 3 conectá tu mail
  conectarMail: false,    // tanda 14: APAGADO hasta que Majo cargue los orígenes en Google y Microsoft y lo pruebe
  pagoVencido: true,      // resumen ya vencido al importarlo: ¿ya lo pagaste? (ajuste del socio, 15/10)
  /* tanda 11: encendidas tras la QA v2 (15/10) y sus arreglos; historia y dondeRinde siguen apagadas */
  diaDificil: true,       // (4) saldo de hoy y día por día
  cambioTarjeta: true,    // (7) cambiar o dejar una tarjeta
  historia: false,        // (2) una sola historia por gasto
  devolver: true,         // (6) plata que te tienen que devolver
  compartidas: true,      // (8) cuotas compartidas
  comoPagar: true,        // (9) ¿cómo me conviene pagar esta compra?
  queCambio: true,        // (3) qué cambió en tu mes desde la última vez
  gastoEstimado: true,    // (5) gasto fijo estimado hasta que aparece, con monto real y "lo di de baja"
  dondeRinde: false,      // B4 · "Dónde puede rendir tu plata": APAGADO hasta el OK legal de Majo
};
export function flagsActivos(search = '') {
  const f = { ...FLAGS };
  try {
    for (const n of new URLSearchParams(search).getAll('flag')) if (n in f) f[n] = true;
  } catch { /* sin URL: quedan los de fábrica */ }
  return f;
}
