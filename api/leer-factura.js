/* Vencimientos de la Casa · POST /api/leer-factura
   Recibe la foto (JPEG, PNG o WebP) o el PDF de una factura, crudo en el cuerpo,
   y devuelve sus datos con el esquema de factura.js.

   Con ANTHROPIC_API_KEY lee con Claude ("real"); sin key responde una factura
   de ejemplo ("prueba"). La respuesta siempre dice el modo. GET devuelve solo
   el modo, para que la app avise antes. El archivo no se guarda: se procesa
   en memoria y se descarta.

   Controles: compra de ob-021 (o admin), tamaño, tipo real del archivo (por
   sus primeros bytes, no por lo que dice el navegador), páginas del PDF y un
   tope de lecturas por persona por día. El log no lleva datos de la factura. */
import { requireHerramienta } from './_lib/herramienta-acceso.js';
import { kvGet, kvSet } from './_lib/kv.js';
import { lecturaEjemplo } from './_herramientas/vencimientos/factura.js';
import { hayKey, leerFacturaConClaude, ErrorLectura, MODELO } from './_lib/vencimientos-lector.js';

export const PRODUCTO = 'ob-021';
export const MAX_BYTES = 4 * 1024 * 1024; // Vercel corta el cuerpo en 4,5 MB
export const MAX_PAGINAS = 6;
export const TOPE_DIA = 20;

/* Tipo por los primeros bytes. */
export function tipoArchivo(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf.subarray(0, 5).toString('latin1') === '%PDF-') return 'pdf';
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'image/jpeg';
  if (buf[0] === 0x89 && buf.subarray(1, 4).toString('latin1') === 'PNG') return 'image/png';
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return null;
}
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
const GRANDE = 'El archivo pesa más de 4 MB. Probá con una foto más chica o cargala a mano.';
const hoyAR = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10); // Argentina, UTC−3

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') { res.setHeader('Allow', 'GET, POST'); return responder(res, 405, { ok: false, error: 'Usá POST con la foto o el PDF.' }); }
  const acc = await requireHerramienta(req, res, PRODUCTO);
  if (!acc) return;
  if (req.method === 'GET') return responder(res, 200, { ok: true, modo: hayKey() ? 'real' : 'prueba' });

  if (Number(req.headers['content-length'] || 0) > MAX_BYTES) return responder(res, 413, { ok: false, motivo: 'grande', error: GRANDE });
  const buf = await leerCuerpo(req, MAX_BYTES);
  if (!buf) return responder(res, 413, { ok: false, motivo: 'grande', error: GRANDE });
  const tipo = tipoArchivo(buf);
  if (!tipo) return responder(res, 415, { ok: false, motivo: 'tipo', error: 'Subí una foto (JPG o PNG) o el PDF de la factura.' });
  const paginas = tipo === 'pdf' ? contarPaginas(buf) : 1;
  if (paginas > MAX_PAGINAS) return responder(res, 413, { ok: false, motivo: 'paginas', error: `El PDF tiene más de ${MAX_PAGINAS} páginas. Subí solo la factura.` });

  /* tope diario por persona, para controlar el costo */
  const clave = `orbit:vencimientos:lecturas:${acc.email}:${hoyAR()}`;
  let usadas = 0;
  try { usadas = Number(await kvGet(clave)) || 0; } catch { usadas = 0; }
  if (usadas >= TOPE_DIA) return responder(res, 429, { ok: false, motivo: 'tope', error: `Llegaste a ${TOPE_DIA} lecturas por hoy. Mañana podés seguir, o cargala a mano.` });
  try { await kvSet(clave, usadas + 1, 60 * 60 * 36); } catch { /* sin base no frenamos la lectura */ }

  if (!hayKey()) {
    console.log(JSON.stringify({ evento: 'leer-factura', modo: 'prueba', tipo, bytes: buf.length, paginas }));
    return responder(res, 200, { ok: true, modo: 'prueba', lectura: lecturaEjemplo(hoyAR()) });
  }
  const t0 = Date.now();
  try {
    const r = await leerFacturaConClaude({ buf, tipo });
    /* costo por lectura: tokens, sin datos de la factura */
    console.log(JSON.stringify({ evento: 'leer-factura', modo: 'real', modelo: r.modelo, entrada: r.uso.entrada, salida: r.uso.salida,
      intentos: r.intentos, tipo, bytes: buf.length, paginas, ms: Date.now() - t0 }));
    return responder(res, 200, { ok: true, modo: 'real', lectura: r.lectura });
  } catch (e) {
    const t = e instanceof ErrorLectura ? e.tipo : 'api';
    console.warn(JSON.stringify({ evento: 'leer-factura', modo: 'real', modelo: MODELO, resultado: t,
      entrada: e?.uso?.entrada ?? 0, salida: e?.uso?.salida ?? 0, tipo, bytes: buf.length, ms: Date.now() - t0 }));
    return responder(res, ESTADO_ERROR[t] || 502, { ok: false, modo: 'real', motivo: t,
      error: e instanceof ErrorLectura ? e.message : 'No pudimos leer la factura ahora. Cargala a mano.' });
  }
}
