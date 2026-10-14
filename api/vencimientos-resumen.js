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
/* PDF cifrado (con contraseña de apertura o de permisos): muchos bancos los mandan así */
export const conClave = buf => /\/Encrypt\s/.test(buf.toString('latin1'));
export const CON_CLAVE = 'El resumen tiene contraseña (muchos bancos lo protegen con tu DNI). Abrilo con la contraseña y guardalo sin ella: en la compu, Imprimir → Guardar como PDF; en el celular, Compartir → Imprimir → Guardar. Después subí ese archivo.';

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
  if (req.method === 'GET' && req.query?.diag && acc.admin) return responder(res, 200, await diagnostico());
  if (req.method === 'GET') return responder(res, 200, { ok: true, modo: hayKey() ? 'real' : 'prueba' });

  if (Number(req.headers['content-length'] || 0) > MAX_BYTES) return responder(res, 413, { ok: false, motivo: 'grande', error: GRANDE });
  const buf = await leerCuerpo(req, MAX_BYTES);
  if (!buf) return responder(res, 413, { ok: false, motivo: 'grande', error: GRANDE });
  if (!esPDF(buf)) return responder(res, 415, { ok: false, motivo: 'no_pdf', error: 'Ese archivo no es un PDF. Subí el resumen tal como lo descargás del banco.' });
  const paginas = contarPaginas(buf);
  const cifrado = conClave(buf);
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
    console.warn(JSON.stringify({ evento: 'vencimientos-resumen', modo: 'real', modelo: MODELO, resultado: t, cifrado,
      entrada: e?.uso?.entrada ?? 0, salida: e?.uso?.salida ?? 0, bytes: buf.length, paginas, ms: Date.now() - t0 }));
    /* a las cuentas administradoras se les muestra el motivo exacto (sin datos del resumen) */
    const detalle = acc.admin ? { bytes: buf.length, paginas, cifrado, ms: Date.now() - t0, api: await motivoPdf(buf) } : undefined;
    return responder(res, ESTADO_ERROR[t] || 502, { ok: false, modo: 'real', motivo: cifrado ? 'clave' : t,
      error: cifrado ? CON_CLAVE : e instanceof ErrorLectura ? e.message : 'No pudimos leer el resumen ahora. Probá de nuevo en un rato.', detalle });
  }
}

/* Solo cuentas administradoras: ¿anda la key? Hace una llamada mínima (unos pocos tokens) con el
   mismo modelo y devuelve el estado y el mensaje de error de Anthropic. Nunca muestra la key. */
async function diagnostico() {
  if (!hayKey()) return { ok: false, key: false, detalle: 'No hay ANTHROPIC_API_KEY en este entorno (¿está tildado Preview en Vercel?).' };
  const k = process.env.ANTHROPIC_API_KEY;
  const forma = { largo: k.length, empieza: k.slice(0, 7), espacios: k !== k.trim() };
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const c = new Anthropic({ maxRetries: 0 });
  const prueba = async (nombre, pedido) => {
    try { const r = await c.beta.messages.create(pedido, { timeout: 20000 }); return { nombre, ok: true, modelo: r.model }; }
    catch (e) { return { nombre, ok: false, status: e?.status ?? null, tipo: e?.error?.error?.type || e?.name || null, mensaje: String(e?.error?.error?.message || e?.message || '').slice(0, 300) }; }
  };
  const base = { model: MODELO, max_tokens: 5, messages: [{ role: 'user', content: 'Respondé ok' }] };
  const pruebas = [
    await prueba('modelo', base),
    await prueba('modelo + fallback', { ...base, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' }),
    await prueba('modelo + json', { ...base, max_tokens: 20, output_config: { effort: 'low', format: { type: 'json_schema', schema: { type: 'object', additionalProperties: false, required: ['ok'], properties: { ok: { type: 'boolean' } } } } } }),
  ];
  return { ok: pruebas.every(p => p.ok), key: true, forma, modelo: MODELO, pruebas };
}

/* Una llamada mínima con el mismo PDF para ver qué responde Anthropic (status, tipo, mensaje). */
async function motivoPdf(buf) {
  try {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const c = new Anthropic({ maxRetries: 0 });
    const r = await c.messages.create({ model: MODELO, max_tokens: 20, messages: [{ role: 'user', content: [
      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: buf.toString('base64') } },
      { type: 'text', text: '¿Cuántas páginas tiene? Respondé solo el número.' }] }] }, { timeout: 25000 });
    return { ok: true, respuesta: (r.content || []).map(b => b.text || '').join('').slice(0, 40), entrada: r.usage?.input_tokens };
  } catch (e) {
    return { ok: false, status: e?.status ?? null, tipo: e?.error?.error?.type || e?.name || null, mensaje: String(e?.error?.error?.message || e?.message || '').slice(0, 300) };
  }
}
