/* Mi Mes by Orbit · POST /api/leer-resumen
   Recibe el PDF del resumen de una tarjeta (cuerpo crudo, application/pdf u
   octet-stream) y devuelve sus datos con el esquema fijo de la app.

   Con ANTHROPIC_API_KEY en el entorno lee el PDF con Claude ("real"); sin
   key responde el resumen de ejemplo ("prueba"). La respuesta siempre dice
   en qué modo se leyó. GET devuelve solo el modo, para que la app avise antes.
   El PDF no se guarda: se procesa en memoria y se descarta.

   Controles: compra de ob-019 (o admin), tamaño, que sea PDF, páginas y un
   tope de lecturas por persona por día. El log no lleva datos del resumen. */
import { requireHerramienta } from './_lib/herramienta-acceso.js';
import { contarLectura, huellaServidor } from './mi-mes-leer.js';
import { getPurchases } from './_lib/kv.js';
import { reservar, ajustar, devolver, mensajePausa, enPausa, vigenciaIA, mensajeVencida } from './_lib/mi-mes-ia.js';
import { resumenEjemplo } from './_herramientas/mi-mes/ejemplo.js';
import { hayKey, leerResumenConClaude, ErrorLectura, MODELO } from './_lib/mi-mes-lector.js';
import { hoyAR } from './_lib/mi-mes-avisos.js';

export const PRODUCTO = 'ob-019';
export const MAX_BYTES = 4 * 1024 * 1024;   // Vercel corta el cuerpo en 4,5 MB
export const MAX_PAGINAS = 15;
export const TOPE_DIA = 15;

/* Cuenta páginas sin parsear el PDF entero. Si no las encuentra (objetos
   comprimidos) devuelve 0 = no sabemos, y no se rechaza por eso. */
export function contarPaginas(buf) {
  const s = buf.toString('latin1');
  return (s.match(/\/Type\s*\/Page(?![a-zA-Z])/g) || []).length;
}
export const esPDF = buf => buf.length > 5 && buf.subarray(0, 5).toString('latin1') === '%PDF-';

async function leerCuerpo(req, max) {
  if (Buffer.isBuffer(req.body)) return req.body.length > max ? null : req.body;
  const partes = [];
  let total = 0;
  for await (const ch of req) {
    total += ch.length;
    if (total > max) return null;
    partes.push(ch);
  }
  return Buffer.concat(partes);
}

const responder = (res, code, cuerpo) => { res.setHeader('Cache-Control', 'no-store'); return res.status(code).json(cuerpo); };

const ESTADO_ERROR = { timeout: 504, tiempo: 504, limite: 503, api: 502, rechazo: 422, invalida: 422 };

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') { res.setHeader('Allow', 'GET, POST'); return responder(res, 405, { ok: false, error: 'Usá POST con el PDF.' }); }
  const acc = await requireHerramienta(req, res, PRODUCTO);
  if (!acc) return;
  const vig = await vigenciaIA(acc, acc.admin ? [] : await getPurchases(acc.email).catch(() => []));
  if (req.method === 'GET') return responder(res, 200, { ok: true, modo: hayKey() ? 'real' : 'prueba', iaHasta: vig.hasta, iaVencida: vig.vencida, pausa: await enPausa().catch(() => null) });
  if (vig.vencida) return responder(res, 403, { ok: false, motivo: 'ia_vencida', error: mensajeVencida(vig.hasta) });

  const largo = Number(req.headers['content-length'] || 0);
  if (largo > MAX_BYTES) return responder(res, 413, { ok: false, motivo: 'grande', error: 'El PDF pesa más de 4 MB. Probá descargarlo de nuevo desde el banco o cargalo a mano.' });
  const buf = await leerCuerpo(req, MAX_BYTES);
  if (!buf) return responder(res, 413, { ok: false, motivo: 'grande', error: 'El PDF pesa más de 4 MB. Probá descargarlo de nuevo desde el banco o cargalo a mano.' });
  if (!esPDF(buf)) return responder(res, 415, { ok: false, motivo: 'no_pdf', error: 'Ese archivo no es un PDF. Subí el resumen tal como lo descargás del banco.' });
  const paginas = contarPaginas(buf);
  if (paginas > MAX_PAGINAS) return responder(res, 413, { ok: false, motivo: 'paginas', error: `El resumen tiene más de ${MAX_PAGINAS} páginas. Subí solo el de una tarjeta.` });

  /* tope diario por persona (para controlar el costo cuando se lea de verdad) */
  /* QA t14 · 1: contador atómico compartido con /api/mi-mes-leer (día y mes); acá el tope del día es 15 */
  /* QA t19 · 1 y baja: si la lectura está en pausa por el techo del mes, se avisa ANTES de contar el archivo */
  if (hayKey()) {
    let hasta = null;
    try { hasta = await enPausa(); } catch { return responder(res, 503, { ok: false, motivo: 'kv', error: 'No pudimos revisar el tope de lecturas. Probá en un rato o cargalo a mano.' }); }
    if (hasta) return responder(res, 503, { ok: false, motivo: 'pausa', error: mensajePausa(hasta) });
  }
  const cuenta = await contarLectura(acc.email, { topeDia: TOPE_DIA, huella: huellaServidor(buf) });
  if (!cuenta.ok) return responder(res, 429, { ok: false, motivo: 'tope', error: cuenta.motivo === 'mes'
    ? 'Llegaste al máximo de lecturas de este mes. El mes que viene podés seguir, o cargá este resumen a mano.'
    : `Llegaste a ${TOPE_DIA} lecturas por hoy. Mañana podés seguir, o cargá este resumen a mano.` });

  if (!hayKey()) {
    console.log(JSON.stringify({ evento: 'leer-resumen', modo: 'prueba', bytes: buf.length, paginas }));
    return responder(res, 200, { ok: true, modo: 'prueba', lectura: resumenEjemplo() });
  }
  let reserva;
  try { reserva = await reservar('resumen'); } catch { return responder(res, 503, { ok: false, motivo: 'kv', error: 'No pudimos revisar el tope de lecturas. Probá en un rato o cargalo a mano.' }); }
  if (!reserva.ok) return responder(res, 503, reserva.ocupado
    ? { ok: false, motivo: 'ocupado', error: 'Hay muchas lecturas en este momento. Probá en unos minutos.' }
    : { ok: false, motivo: 'pausa', error: mensajePausa(reserva.hasta) });
  const t0 = Date.now();
  try {
    const r = await leerResumenConClaude(buf);
    await ajustar(reserva, { modelo: r.modelo, entrada: r.uso.entrada, salida: r.uso.salida });
    /* costo por lectura: tokens de entrada y salida, sin datos del resumen */
    console.log(JSON.stringify({ evento: 'leer-resumen', modo: 'real', modelo: r.modelo, entrada: r.uso.entrada, salida: r.uso.salida,
      intentos: r.intentos, confiable: r.confiable, bytes: buf.length, paginas, ms: Date.now() - t0 }));
    return responder(res, 200, { ok: true, modo: 'real', confiable: r.confiable, lectura: r.lectura });
  } catch (e) {
    const tipo = e instanceof ErrorLectura ? e.tipo : 'api';
    if (e?.uso && (e.uso.entrada || e.uso.salida)) await ajustar(reserva, { entrada: e.uso.entrada, salida: e.uso.salida });
    else await devolver(reserva);
    console.warn(JSON.stringify({ evento: 'leer-resumen', modo: 'real', modelo: MODELO, resultado: tipo,
      entrada: e?.uso?.entrada ?? 0, salida: e?.uso?.salida ?? 0, bytes: buf.length, paginas, ms: Date.now() - t0 }));
    return responder(res, ESTADO_ERROR[tipo] || 502, { ok: false, modo: 'real', motivo: tipo,
      error: e instanceof ErrorLectura ? e.message : 'No pudimos leer el resumen ahora. Cargalo a mano.' });
  }
}
