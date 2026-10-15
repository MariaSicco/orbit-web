/* Interruptores de Mi Mes. Lo que no está firme al congelamiento sale apagado.
   Para probar una función apagada en preview: ?flag=nombre (solo esa sesión). */
export const FLAGS = {
  diaDeCobro: true,       // A · día de cobro, línea del mes y "vence antes de que cobres"
  consejo: true,          // B1 · tarjeta de consejo en Inicio
  metas: true,            // B2 · una meta a la vez
  retos: true,            // B3 · retos de un mes
  dondeRinde: false,      // B4 · "Dónde puede rendir tu plata": APAGADO hasta el OK legal de Majo
};
export function flagsActivos(search = '') {
  const f = { ...FLAGS };
  try {
    for (const n of new URLSearchParams(search).getAll('flag')) if (n in f) f[n] = true;
  } catch { /* sin URL: quedan los de fábrica */ }
  return f;
}
