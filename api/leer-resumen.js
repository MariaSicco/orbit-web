/* Mi Mes by Orbit · POST /api/leer-resumen
   Recibe el PDF del resumen de una tarjeta (cuerpo crudo, application/pdf u
   octet-stream) y devuelve sus datos con el esquema fijo de la app.

   Hoy (Paso 2) responde SIEMPRE datos de ejemplo ("modo prueba"): la lectura
   con la API de Claude se conecta en el Paso 5, con ANTHROPIC_API_KEY.
   El PDF no se guarda: se valida en memoria y se descarta.

   Controles: compra de ob-019 (o admin), tamaño, que sea PDF, páginas y un
   tope de lecturas por persona por día. El log no lleva datos del resumen. */
import { requireHerramienta } from './_lib/herramienta-acceso.js';
import { kvGet, kvSet } from './_lib/kv.js';
import { resumenEjemplo } from './_herramientas/mi-mes/ejemplo.js';

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

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return responder(res, 405, { ok: false, error: 'Usá POST con el PDF.' }); }
  const acc = await requireHerramienta(req, res, PRODUCTO);
  if (!acc) return;

  const largo = Number(req.headers['content-length'] || 0);
  if (largo > MAX_BYTES) return responder(res, 413, { ok: false, motivo: 'grande', error: 'El PDF pesa más de 4 MB. Probá descargarlo de nuevo desde el banco o cargalo a mano.' });
  const buf = await leerCuerpo(req, MAX_BYTES);
  if (!buf) return responder(res, 413, { ok: false, motivo: 'grande', error: 'El PDF pesa más de 4 MB. Probá descargarlo de nuevo desde el banco o cargalo a mano.' });
  if (!esPDF(buf)) return responder(res, 415, { ok: false, motivo: 'no_pdf', error: 'Ese archivo no es un PDF. Subí el resumen tal como lo descargás del banco.' });
  const paginas = contarPaginas(buf);
  if (paginas > MAX_PAGINAS) return responder(res, 413, { ok: false, motivo: 'paginas', error: `El resumen tiene más de ${MAX_PAGINAS} páginas. Subí solo el de una tarjeta.` });

  /* tope diario por persona (para controlar el costo cuando se lea de verdad) */
  const dia = new Date().toISOString().slice(0, 10);
  const clave = `orbit:mi-mes:lecturas:${acc.email}:${dia}`;
  let usadas = 0;
  try { usadas = Number(await kvGet(clave)) || 0; } catch { usadas = 0; }
  if (usadas >= TOPE_DIA) return responder(res, 429, { ok: false, motivo: 'tope', error: `Llegaste a ${TOPE_DIA} lecturas por hoy. Mañana podés seguir, o cargá este resumen a mano.` });
  try { await kvSet(clave, usadas + 1, 60 * 60 * 36); } catch { /* sin base no frenamos la lectura */ }

  /* Paso 5: acá va la llamada a Claude cuando exista ANTHROPIC_API_KEY. */
  console.log(JSON.stringify({ evento: 'leer-resumen', modo: 'prueba', bytes: buf.length, paginas }));
  return responder(res, 200, { ok: true, modo: 'prueba', lectura: resumenEjemplo() });
}
