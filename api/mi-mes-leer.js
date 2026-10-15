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
import { kvIncr, kvGet, kvDel } from './_lib/kv.js';
import { hoyAR } from './_lib/mi-mes-avisos.js';
import { hayKey, leerResumenConClaude, ErrorLectura } from './_lib/mi-mes-lector.js';
import { leerFacturaConClaude } from './_lib/vencimientos-lector.js';
import { lecturaEjemplo, propuestaDesde } from './_herramientas/vencimientos/factura.js';
import { resumenEjemplo } from './_herramientas/mi-mes/ejemplo.js';
import { clasificarConClaude, clasificarDeEjemplo, MODELO_CLASIFICAR } from './_lib/mi-mes-documentos.js';
import { MAX_BYTES_DOC, MAX_PAGINAS_DOC, TOPE_DIA_DOCS, TOPE_MES_DOCS } from './_herramientas/mi-mes/documentos.js';
export { TOPE_DIA_DOCS, TOPE_MES_DOCS };

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

/* Topes (QA t14 · 1 y t15 · 3): contadores atómicos (INCR) por persona, por
   día y por mes, que cuentan ARCHIVOS: clasificar y leer el mismo archivo
   suma 1 (una marca por huella y día). El mismo archivo se puede pedir hasta
   4 veces por día (2 lecturas completas) para que no se lea sin límite.
   Los rechazos no suman al mes. Lo comparte /api/leer-resumen. */
export const MAX_POR_HUELLA = 4;
export async function contarLectura(email, { huella = null, dia = hoyAR(), topeDia = TOPE_DIA_DOCS, topeMes = TOPE_MES_DOCS } = {}) {
  const kd = `orbit:mi-mes:lecturas-dia:${email}:${dia}`, km = `orbit:mi-mes:lecturas-mes:${email}:${dia.slice(0, 7)}`;
  try {
    if (huella) {
      const veces = await kvIncr(`orbit:mi-mes:leido:${email}:${dia}:${huella}`, 60 * 60 * 36);
      if (veces > MAX_POR_HUELLA) return { ok: false, motivo: 'repetido' };
      if (veces > 1) return { ok: true, repetido: true, dia: Number(await kvGet(kd)) || 0, mes: Number(await kvGet(km)) || 0 };
    }
    const nd = await kvIncr(kd, 60 * 60 * 36);
    if (nd > topeDia) { if (huella) await kvDel(`orbit:mi-mes:leido:${email}:${dia}:${huella}`); return { ok: false, motivo: 'dia', dia: nd }; }
    const nm = await kvIncr(km, 60 * 60 * 24 * 40);
    if (nm > topeMes) {
      if (huella) await kvDel(`orbit:mi-mes:leido:${email}:${dia}:${huella}`);
      return { ok: false, motivo: 'mes', dia: nd, mes: nm };
    }
    return { ok: true, dia: nd, mes: nm };
  } catch { return { ok: true, dia: 0, mes: 0 }; }   // sin base no frenamos la lectura
}
/* Presupuesto de tiempo alrededor de la lectura (la función tiene 60 s). */
export const PRESUPUESTO_MS = 55_000;
let presupuesto = PRESUPUESTO_MS;
export function __usarPresupuesto(ms) { presupuesto = ms ?? PRESUPUESTO_MS; }
const TARDO = 'Tardó demasiado: probá de nuevo o cargalo a mano.';
function conTope(promesa, ms) {
  let t;
  return Promise.race([promesa.finally(() => clearTimeout(t)), new Promise((_, mal) => { t = setTimeout(() => mal(new ErrorLectura(TARDO, 'tiempo')), Math.max(1, ms)); })]);
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

  const cuenta = await contarLectura(acc.email, { huella: huellaServidor(buf) });
  if (!cuenta.ok) return responder(res, 429, { ok: false, motivo: 'tope', error: cuenta.motivo === 'mes'
    ? `Llegaste a ${TOPE_MES_DOCS} archivos este mes. El mes que viene podés seguir, o cargalo a mano.`
    : cuenta.motivo === 'repetido' ? 'Ya leímos este archivo varias veces hoy. Mañana podés probar de nuevo, o cargalo a mano.'
    : `Llegaste a ${TOPE_DIA_DOCS} archivos por hoy. Mañana podés seguir, o cargalo a mano.` });

  const paso = pedido || 'clasificar';
  const log = extra => console.log(JSON.stringify({ evento: 'mi-mes-leer', paso, tipoArchivo: tipo, bytes: buf.length, paginas, ...extra }));
  if (!hayKey()) {
    const hoy = hoyAR();
    log({ modo: 'prueba' });
    if (pedido === 'resumen') return responder(res, 200, { ok: true, modo: 'prueba', tipo: 'resumen', lectura: resumenEjemplo() });
    if (pedido === 'factura') { const l = lecturaEjemplo(hoy); return responder(res, 200, { ok: true, modo: 'prueba', tipo: 'factura', lectura: l, propuesta: propuestaDesde(l, hoy) }); }
    const c = clasificarDeEjemplo(url.searchParams.get('nombre'), hoy);
    return responder(res, 200, { ok: true, modo: 'prueba', tipo: c.tipo, siguiente: ['resumen', 'factura'].includes(c.tipo), lectura: c });
  }
  const t0 = Date.now();
  const resto = () => presupuesto - (Date.now() - t0);
  try {
    if (pedido === 'resumen') {
      const r = await conTope(leerResumenConClaude(buf, tipo), resto());
      log({ modo: 'real', tipoDoc: 'resumen', modelo: r.modelo, entrada: r.uso.entrada, salida: r.uso.salida, ms: Date.now() - t0 });
      return responder(res, 200, { ok: true, modo: 'real', tipo: 'resumen', confiable: r.confiable, lectura: r.lectura });
    }
    if (pedido === 'factura') {
      const r = await conTope(leerFacturaConClaude({ buf, tipo }), resto());
      log({ modo: 'real', tipoDoc: 'factura', modelo: r.modelo, entrada: r.uso.entrada, salida: r.uso.salida, ms: Date.now() - t0 });
      /* la propuesta (nombre, categoría, monto en centavos, vencimiento, frecuencia) se arma acá: el navegador de Mi Mes no carga los módulos de Vencimientos */
      return responder(res, 200, { ok: true, modo: 'real', tipo: 'factura', lectura: r.lectura, propuesta: propuestaDesde(r.lectura, hoyAR()) });
    }
    const r = await conTope(clasificarConClaude({ buf, tipo }), resto());
    log({ modo: 'real', tipoDoc: r.lectura.tipo, modelo: r.modelo, entrada: r.uso.entrada, salida: r.uso.salida, ms: Date.now() - t0 });
    return responder(res, 200, { ok: true, modo: 'real', tipo: r.lectura.tipo, siguiente: ['resumen', 'factura'].includes(r.lectura.tipo), lectura: r.lectura });
  } catch (e) {
    const t = e instanceof ErrorLectura || e?.tipo ? e.tipo : 'api';
    console.warn(JSON.stringify({ evento: 'mi-mes-leer', paso, modo: 'real', modelo: pedido ? undefined : MODELO_CLASIFICAR, resultado: t,
      entrada: e?.uso?.entrada ?? 0, salida: e?.uso?.salida ?? 0, bytes: buf.length, paginas, ms: Date.now() - t0 }));
    return responder(res, ESTADO_ERROR[t] || 502, { ok: false, modo: 'real', motivo: t, error: e?.message || 'No pudimos leer el archivo ahora. Cargalo a mano.' });
  }
}
