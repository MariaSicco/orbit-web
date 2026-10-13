/* Datos de ejemplo para ver la app llena antes de cargar lo propio.
   Montos inventados, en la escala de una casa de CABA en 2026 (no son tarifas reales). */
import * as V from './calculos.js';

export function datosEjemplo(hoy) {
  const d = V.estadoVacio();
  d.ejemplo = true;
  const $ = p => Math.round(p * 100);
  const ym = V.mesDe(hoy);
  const dia = (n, mesesAtras = 12) => V.sumarMeses(`${ym}-${String(n).padStart(2, '0')}`, -mesesAtras);
  const c = (id, nombre, categoria, frecuencia, primerVto, extra = {}) => ({ id, nombre, categoria, frecuencia, primerVto, ...extra });
  d.cuentas = [
    c('ej-alq', 'Alquiler', 'Vivienda', 1, dia(5), { monto: $(480000), ajusteCada: 3, color: '#0D0D0E', nota: 'Ajusta por ICL cada 3 meses.' }),
    c('ej-exp', 'Expensas', 'Vivienda', 1, dia(10), { monto: $(150000), segundoVto: 10, color: '#0D0D0E' }),
    c('ej-luz', 'Edenor', 'Servicios', 1, dia(19), { monto: $(24000), segundoVto: 7, color: '#3047FF', preset: 'edenor' }),
    c('ej-gas', 'Metrogas', 'Servicios', 1, dia(16), { monto: $(9000), color: '#0D0D0E', preset: 'metrogas' }),
    c('ej-agua', 'AySA', 'Servicios', 2, dia(12), { monto: $(14000), color: '#3047FF', preset: 'aysa' }),
    c('ej-abl', 'ABL', 'Impuestos', 1, dia(8), { monto: $(16000), debito: true, color: '#0D0D0E', preset: 'abl' }),
    c('ej-int', 'Internet', 'Conectividad', 1, dia(14), { monto: $(27000), color: '#3047FF' }),
    c('ej-pre', 'Prepaga', 'Salud y seguros', 1, dia(3), { monto: $(160000), debito: true, color: '#3047FF' }),
    c('ej-seg', 'Seguro del auto', 'Auto', 1, dia(22), { monto: $(48000), color: '#3047FF' }),
    c('ej-pat', 'Patente', 'Impuestos', 2, V.sumarMeses(`${ym}-25`, -3), { monto: $(52000), cuotas: 5, color: '#FF4F2E' }),
    c('ej-net', 'Netflix', 'Suscripciones', 1, dia(27), { monto: $(11000), debito: true, color: '#FF4F2E' }),
    c('ej-vtv', 'VTV', 'Trámites', 12, V.sumarDias(hoy, 38), { tipo: 'tramite', color: '#D9FF45' }),
    c('ej-mat', 'Carga del matafuegos', 'Trámites', 12, V.sumarDias(hoy, 4), { tipo: 'tramite', color: '#D9FF45' }),
  ];
  /* Historia: 12 meses pagados con aumentos, para que se vean "cuánto subió" y los números. */
  const suba = { 'ej-alq': [480000, 480000, 480000, 545000, 545000, 545000, 610000, 610000, 610000, 668000, 668000, 668000],
    'ej-exp': [150000, 155000, 158000, 164000, 168000, 171000, 175000, 180000, 182000, 186000, 190000, 194000],
    'ej-luz': [24000, 25500, 31000, 33000, 36500, 41000, 43000, 39500, 37000, 38500, 40500, 42000],
    'ej-gas': [9000, 9400, 12500, 19000, 26000, 31000, 33500, 28000, 17000, 13500, 12800, 13200],
    'ej-int': [27000, 27000, 28900, 28900, 30900, 30900, 33000, 33000, 33000, 35300, 35300, 35300] };
  for (const cu of d.cuentas) {
    if (cu.tipo === 'tramite') continue;
    const ks = V.claves(cu, cu.primerVto, V.sumarDias(hoy, -1));
    ks.forEach((k, i) => {
      if (cu.id === 'ej-exp' && k >= V.sumarDias(hoy, -6)) return; // queda vencida, en 2º vencimiento
      if (cu.debito) return;
      const serie = suba[cu.id];
      const m = serie ? serie[Math.min(i, serie.length - 1)] : cu.monto / 100;
      (d.pagos[cu.id] ||= {})[k] = { monto: $(m), fecha: V.sumarDias(k, -1) };
    });
  }
  /* La luz de este mes ya tiene la factura cargada. */
  const luzMes = V.claves(d.cuentas[2], `${ym}-01`, V.sumarMeses(`${ym}-01`, 1));
  if (luzMes[0] && !d.pagos['ej-luz']?.[luzMes[0]]) (d.facturas['ej-luz'] ||= {})[luzMes[0]] = { monto: $(44800) };
  d.creado = new Date().toISOString();
  return d;
}
