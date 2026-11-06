/* Mi Mes by Orbit · lectura de un documento en el servidor (para lo que llega por mail).
   Hace en una sola llamada lo que el navegador hace en dos pasos con /api/mi-mes-leer:
   clasifica y, si es un resumen o una factura, lo lee con su lector. Usa los mismos
   controles: tipo real del archivo, tamaño, páginas, pausa por el techo global de IA,
   topes por persona (contarLectura, por huella) y reserva/ajuste del gasto.
   Devuelve lo mismo que necesita la app para "revisá lo que leí". El archivo no se guarda. */
import { tipoArchivo, contarPaginas, huellaServidor, contarLectura } from '../mi-mes-leer.js';
import { reservar, ajustar, devolver, enPausa } from './mi-mes-ia.js';
import { hoyAR } from './mi-mes-avisos.js';
import { hayKey, leerResumenConClaude } from './mi-mes-lector.js';
import { leerFacturaConClaude } from './vencimientos-lector.js';
import { clasificarConClaude, clasificarDeEjemplo } from './mi-mes-documentos.js';
import { lecturaEjemplo, propuestaDesde } from '../_herramientas/vencimientos/factura.js';
import { resumenEjemplo } from '../_herramientas/mi-mes/ejemplo.js';
import { MAX_BYTES_DOC, MAX_PAGINAS_DOC } from '../_herramientas/mi-mes/documentos.js';

/* motivos que significan "probá más tarde" (el archivo vuelve a la cola) */
export const REINTENTAR = new Set(['pausa', 'tope', 'ocupado', 'kv', 'tiempo', 'limite', 'api', 'timeout']);

async function conReserva(paso, fn) {
  const r = await reservar(paso);
  if (!r.ok) return { ok: false, motivo: r.ocupado ? 'ocupado' : 'pausa', hasta: r.hasta };
  try {
    const x = await fn();
    await ajustar(r, { modelo: x.modelo, entrada: x.uso?.entrada, salida: x.uso?.salida });
    return { ok: true, x };
  } catch (e) {
    if (e?.uso && (e.uso.entrada || e.uso.salida)) await ajustar(r, { entrada: e.uso.entrada, salida: e.uso.salida });
    else if (e?.tipo === 'tiempo') await ajustar(r);
    else await devolver(r);
    return { ok: false, motivo: e?.tipo || 'api', error: e?.message };
  }
}

export async function leerDocumento({ email, buf, nombre = '', hoy = hoyAR() }) {
  if (!buf || buf.length > MAX_BYTES_DOC) return { ok: false, motivo: 'grande' };
  const tipo = tipoArchivo(buf);
  if (!tipo) return { ok: false, motivo: 'tipo' };
  if (tipo === 'pdf' && contarPaginas(buf) > MAX_PAGINAS_DOC) return { ok: false, motivo: 'paginas' };
  const huella = huellaServidor(buf);

  if (!hayKey()) {   // modo prueba: datos de ejemplo, sin llamar a la IA
    const c = clasificarDeEjemplo(nombre, hoy);
    if (c.tipo === 'resumen') return { ok: true, modo: 'prueba', tipo: 'resumen', lectura: resumenEjemplo(), confiable: true, huella };
    if (c.tipo === 'factura') { const l = lecturaEjemplo(hoy); return { ok: true, modo: 'prueba', tipo: 'factura', lectura: l, propuesta: propuestaDesde(l, hoy), confiable: true, huella }; }
    return { ok: true, modo: 'prueba', tipo: c.tipo, lectura: c, confiable: true, huella };
  }
  let hasta = null;
  try { hasta = await enPausa(); } catch { return { ok: false, motivo: 'kv' }; }
  if (hasta) return { ok: false, motivo: 'pausa', hasta };
  const cuenta = await contarLectura(email, { huella });
  if (!cuenta.ok) return { ok: false, motivo: 'tope', detalle: cuenta.motivo };

  const c = await conReserva('clasificar', () => clasificarConClaude({ buf, tipo }));
  if (!c.ok) return c;
  const clase = c.x.lectura;
  if (clase.tipo === 'otro') return { ok: true, modo: 'real', tipo: 'otro', huella };
  if (!['resumen', 'factura'].includes(clase.tipo)) return { ok: true, modo: 'real', tipo: clase.tipo, lectura: clase, confiable: true, huella };
  if (clase.tipo === 'resumen') {
    const r = await conReserva('resumen', () => leerResumenConClaude(buf, tipo));
    if (!r.ok) return r;
    return { ok: true, modo: 'real', tipo: 'resumen', lectura: r.x.lectura, confiable: r.x.confiable !== false, huella };
  }
  const f = await conReserva('factura', () => leerFacturaConClaude({ buf, tipo }));
  if (!f.ok) return f;
  const propuesta = { ...propuestaDesde(f.x.lectura, hoy), empresa: f.x.lectura?.empresa || '', ...(clase.factura ? { promo: clase.factura } : {}) };
  return { ok: true, modo: 'real', tipo: 'factura', lectura: f.x.lectura, propuesta, confiable: Boolean(propuesta.monto), huella };
}
