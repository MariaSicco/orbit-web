/* Mi Mes by Orbit · POST /api/mi-mes-leer — "Subí lo que tengas".
   Recibe UN archivo (PDF o foto/captura JPG, PNG o WebP) crudo en el cuerpo.

   Paso 1 (sin ?tipo): clasifica con una llamada barata. Si es un recibo o una
   captura devuelve ya sus datos; si es un resumen o una factura responde
   { siguiente: true } y el navegador vuelve a mandar el mismo archivo con
   ?tipo=resumen|factura, que lo lee el lector especializado en otra
   invocación (cada una con su propio presupuesto de 60 s).

   Controles: compra de ob-019 (o admin), tamaño, tipo real por los primeros
   bytes, páginas y un tope diario por persona que cuenta ARCHIVOS distintos
   (la huella SHA-256; el segundo paso del mismo archivo no cuenta de nuevo).
   El archivo no se guarda. Los logs llevan tokens por tipo, nunca datos. */
import { createHash } from 'node:crypto';
import { requireHerramienta } from './_lib/herramienta-acceso.js';
import { kvGet, kvSet } from './_lib/kv.js';
import { hoyAR } from './_lib/mi-mes-avisos.js';
import { hayKey, leerResumenConClaude, ErrorLectura } from './_lib/mi-mes-lector.js';
import { leerFacturaConClaude } from './_lib/vencimientos-lector.js';
import { lecturaEjemplo } from './_herramientas/vencimientos/factura.js';
import { resumenEjemplo } from './_herramientas/mi-mes/ejemplo.js';
import { clasificarConClaude, clasificarDeEjemplo, MODELO_CLASIFICAR } from './_lib/mi-mes-documentos.js';
import { MAX_BYTES_DOC, MAX_PAGINAS_DOC, TOPE_DIA_DOCS } from './_herramientas/mi-mes/documentos.js';

export const PRODUCTO = 'ob-019';

export function tipoArchivo(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf.subarray(0, 5).toString('latin1') === '%PDF-') return 'pdf';
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'image/jpeg';
  if (buf[0] === 0x89 && buf.subarray(1, 4).toString('latin1') === 'PNG') return 'image/png';
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return null;
}
export const contarPaginas = buf => (buf.toString('latin1').match(/\/Type\s*\/Page(?![a-zA-Z])/g) || []).length;
export const huellaServidor = buf => createHash('sha256').update(buf).digest('hex').slice(0, 32);

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
const GRANDE = 'El archivo pesa más de 4 MB. Probá con una foto más chica o cargalo a mano.';

/* Tope diario: lista de huellas del día. Un archivo nuevo cuenta; el mismo, no. */
export async function contarArchivo(email, h, { tope = TOPE_DIA_DOCS, dia = hoyAR() } = {}) {
  const clave = `orbit:mi-mes:docs:${email}:${dia}`;
  let lista = [];
  try { const v = await kvGet(clave); lista = Array.isArray(v) ? v : []; } catch { lista = []; }
  if (lista.includes(h)) return { ok: true, usadas: lista.length };
  if (lista.length >= tope) return { ok: false, usadas: lista.length };
  try { await kvSet(clave, [...lista, h], 60 * 60 * 36); } catch { /* sin base no frenamos */ }
  return { ok: true, usadas: lista.length + 1 };
}

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') { res.setHeader('Allow', 'GET, POST'); return responder(res, 405, { ok: false, error: 'Usá POST con el archivo.' }); }
  const acc = await requireHerramienta(req, res, PRODUCTO);
  if (!acc) return;
  if (req.method === 'GET') return responder(res, 200, { ok: true, modo: hayKey() ? 'real' : 'prueba' });

  const url = new URL(req.url, 'http://x');
  const pedido = url.searchParams.get('tipo');
  if (pedido && !['resumen', 'factura'].includes(pedido)) return responder(res, 400, { ok: false, error: 'Tipo desconocido.' });
  if (Number(req.headers['content-length'] || 0) > MAX_BYTES_DOC) return responder(res, 413, { ok: false, motivo: 'grande', error: GRANDE });
  const buf = await leerCuerpo(req, MAX_BYTES_DOC);
  if (!buf) return responder(res, 413, { ok: false, motivo: 'grande', error: GRANDE });
  const tipo = tipoArchivo(buf);
  if (!tipo) return responder(res, 415, { ok: false, motivo: 'tipo', error: 'Subí un PDF o una foto (JPG, PNG o WebP).' });
  const paginas = tipo === 'pdf' ? contarPaginas(buf) : 1;
  if (paginas > MAX_PAGINAS_DOC) return responder(res, 413, { ok: false, motivo: 'paginas', error: `El PDF tiene más de ${MAX_PAGINAS_DOC} páginas. Subí un documento por vez.` });

  const h = huellaServidor(buf);
  const cuenta = await contarArchivo(acc.email, h);
  if (!cuenta.ok) return responder(res, 429, { ok: false, motivo: 'tope', error: `Llegaste a ${TOPE_DIA_DOCS} archivos por hoy. Mañana podés seguir, o cargalo a mano.` });

  const paso = pedido || 'clasificar';
  const log = extra => console.log(JSON.stringify({ evento: 'mi-mes-leer', paso, tipoArchivo: tipo, bytes: buf.length, paginas, ...extra }));
  if (!hayKey()) {
    const hoy = hoyAR();
    log({ modo: 'prueba' });
    if (pedido === 'resumen') return responder(res, 200, { ok: true, modo: 'prueba', tipo: 'resumen', lectura: resumenEjemplo() });
    if (pedido === 'factura') return responder(res, 200, { ok: true, modo: 'prueba', tipo: 'factura', lectura: lecturaEjemplo(hoy) });
    const c = clasificarDeEjemplo(url.searchParams.get('nombre'), hoy);
    return responder(res, 200, { ok: true, modo: 'prueba', tipo: c.tipo, siguiente: ['resumen', 'factura'].includes(c.tipo), lectura: c });
  }
  const t0 = Date.now();
  try {
    if (pedido === 'resumen') {
      const r = await leerResumenConClaude(buf, tipo);
      log({ modo: 'real', tipoDoc: 'resumen', modelo: r.modelo, entrada: r.uso.entrada, salida: r.uso.salida, ms: Date.now() - t0 });
      return responder(res, 200, { ok: true, modo: 'real', tipo: 'resumen', confiable: r.confiable, lectura: r.lectura });
    }
    if (pedido === 'factura') {
      const r = await leerFacturaConClaude({ buf, tipo });
      log({ modo: 'real', tipoDoc: 'factura', modelo: r.modelo, entrada: r.uso.entrada, salida: r.uso.salida, ms: Date.now() - t0 });
      return responder(res, 200, { ok: true, modo: 'real', tipo: 'factura', lectura: r.lectura });
    }
    const r = await clasificarConClaude({ buf, tipo });
    log({ modo: 'real', tipoDoc: r.lectura.tipo, modelo: r.modelo, entrada: r.uso.entrada, salida: r.uso.salida, ms: Date.now() - t0 });
    return responder(res, 200, { ok: true, modo: 'real', tipo: r.lectura.tipo, siguiente: ['resumen', 'factura'].includes(r.lectura.tipo), lectura: r.lectura });
  } catch (e) {
    const t = e instanceof ErrorLectura || e?.tipo ? e.tipo : 'api';
    console.warn(JSON.stringify({ evento: 'mi-mes-leer', paso, modo: 'real', modelo: pedido ? undefined : MODELO_CLASIFICAR, resultado: t,
      entrada: e?.uso?.entrada ?? 0, salida: e?.uso?.salida ?? 0, bytes: buf.length, paginas, ms: Date.now() - t0 }));
    return responder(res, ESTADO_ERROR[t] || 502, { ok: false, modo: 'real', motivo: t, error: e?.message || 'No pudimos leer el archivo ahora. Cargalo a mano.' });
  }
}
