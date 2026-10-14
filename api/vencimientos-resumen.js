/* Vencimientos de la Casa · POST /api/vencimientos-resumen
   "Subí el resumen de tu tarjeta": recibe el PDF del resumen (cuerpo crudo) y lo lee con
   el mismo lector de Mi Mes (api/_lib/mi-mes-lector.js). La app convierte la lectura en
   cuentas (la tarjeta y lo que se cobra todos los meses). Sin key: resumen de ejemplo.
   El PDF no se guarda: se procesa en memoria y se descarta. El log no lleva datos del resumen.
   Controles: compra de ob-021 (o admin), tamaño, que sea PDF, páginas y tope diario. */
import { requireHerramienta } from './_lib/herramienta-acceso.js';
import { kvGet, kvSet } from './_lib/kv.js';
import { resumenEjemplo } from './_herramientas/mi-mes/ejemplo.js';
import { hayKey, leerResumenConClaude, ErrorLectura, MODELO } from './_lib/mi-mes-lector.js';

export const PRODUCTO = 'ob-021';
export const MAX_BYTES = 4 * 1024 * 1024;
export const MAX_PAGINAS = 15;
export const TOPE_DIA = 10;

export const esPDF = buf => buf.length > 5 && buf.subarray(0, 5).toString('latin1') === '%PDF-';
export const contarPaginas = buf => (buf.toString('latin1').match(/\/Type\s*\/Page(?![a-zA-Z])/g) || []).length;

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
const ESTADO_ERROR = { timeout: 504, limite: 503, api: 502, rechazo: 422, invalida: 422 };
const GRANDE = 'El PDF pesa más de 4 MB. Descargalo de nuevo desde el banco.';

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') { res.setHeader('Allow', 'GET, POST'); return responder(res, 405, { ok: false, error: 'Usá POST con el PDF.' }); }
  const acc = await requireHerramienta(req, res, PRODUCTO);
  if (!acc) return;
  if (req.method === 'GET') return responder(res, 200, { ok: true, modo: hayKey() ? 'real' : 'prueba' });

  if (Number(req.headers['content-length'] || 0) > MAX_BYTES) return responder(res, 413, { ok: false, motivo: 'grande', error: GRANDE });
  const buf = await leerCuerpo(req, MAX_BYTES);
  if (!buf) return responder(res, 413, { ok: false, motivo: 'grande', error: GRANDE });
  if (!esPDF(buf)) return responder(res, 415, { ok: false, motivo: 'no_pdf', error: 'Ese archivo no es un PDF. Subí el resumen tal como lo descargás del banco.' });
  const paginas = contarPaginas(buf);
  if (paginas > MAX_PAGINAS) return responder(res, 413, { ok: false, motivo: 'paginas', error: `El resumen tiene más de ${MAX_PAGINAS} páginas. Subí solo el de una tarjeta.` });

  const dia = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
  const clave = `orbit:vencimientos:resumenes:${acc.email}:${dia}`;
  let usadas = 0;
  try { usadas = Number(await kvGet(clave)) || 0; } catch { usadas = 0; }
  if (usadas >= TOPE_DIA) return responder(res, 429, { ok: false, motivo: 'tope', error: `Llegaste a ${TOPE_DIA} resúmenes por hoy. Mañana podés seguir.` });
  try { await kvSet(clave, usadas + 1, 60 * 60 * 36); } catch { /* sin base no frenamos */ }

  if (!hayKey()) {
    console.log(JSON.stringify({ evento: 'vencimientos-resumen', modo: 'prueba', bytes: buf.length, paginas }));
    return responder(res, 200, { ok: true, modo: 'prueba', lectura: resumenEjemplo() });
  }
  const t0 = Date.now();
  try {
    const r = await leerResumenConClaude(buf);
    console.log(JSON.stringify({ evento: 'vencimientos-resumen', modo: 'real', modelo: r.modelo, entrada: r.uso.entrada, salida: r.uso.salida,
      intentos: r.intentos, confiable: r.confiable, bytes: buf.length, paginas, ms: Date.now() - t0 }));
    return responder(res, 200, { ok: true, modo: 'real', confiable: r.confiable, lectura: r.lectura });
  } catch (e) {
    const t = e instanceof ErrorLectura ? e.tipo : 'api';
    console.warn(JSON.stringify({ evento: 'vencimientos-resumen', modo: 'real', modelo: MODELO, resultado: t,
      entrada: e?.uso?.entrada ?? 0, salida: e?.uso?.salida ?? 0, bytes: buf.length, paginas, ms: Date.now() - t0 }));
    return responder(res, ESTADO_ERROR[t] || 502, { ok: false, modo: 'real', motivo: t,
      error: e instanceof ErrorLectura ? e.message : 'No pudimos leer el resumen ahora. Probá de nuevo en un rato.' });
  }
}
