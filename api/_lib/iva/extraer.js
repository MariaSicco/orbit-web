// Lectura de un comprobante (foto o PDF) con Claude, del lado del servidor.
// La API key vive en variables de entorno de Vercel (ANTHROPIC_API_KEY). Nunca en el navegador ni en el repo.
//
// NO ESTÁ CONECTADO A NINGUNA RUTA. Antes de exponerlo como /api/iva/extraer hace falta:
//   1. autenticación y licencia del usuario (toca auth: necesita pedido explícito, regla 6 del repo web);
//   2. límite de lecturas por cuenta (costo por comprobante);
//   3. actualizar la política de privacidad: las imágenes pasan por un proveedor de IA (bloqueante F1).

import Anthropic from '@anthropic-ai/sdk';
import { ESQUEMA_LECTURA, INSTRUCCIONES_LECTURA, combinarLectura, normalizarLecturaIa } from '../../../herramientas/iva/engine/lectura.js';
import { leerQrArca } from '../../../herramientas/iva/engine/qr.js';

const MODELO_POR_DEFECTO = process.env.ORBIT_IVA_MODELO || 'claude-sonnet-5-5'; // elegido por Majo con la medición del 2026-09-29

// Cada modelo se configura distinto: Haiku 4.5 no usa pensamiento adaptativo; los fallbacks del servidor
// (reintento con otro modelo si un filtro de seguridad rechaza por error) aplican a Opus 5 y Fable.
function parametros(modelo) {
  const p = { model: modelo, max_tokens: 16000 };
  if (!/haiku/.test(modelo)) p.thinking = { type: 'adaptive' };
  if (/^claude-(opus-5|fable-5)/.test(modelo) && !/opus-5-5/.test(modelo)) {
    p.betas = ['server-side-fallback-2026-07-01'];
    p.fallbacks = 'default';
  }
  return p;
}
const TIPOS_IMAGEN = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

let cliente;
const claude = () => (cliente ??= new Anthropic());

// archivo: { data: base64 sin prefijo, mediaType } · qrTexto: lo que decodificó el navegador, si había QR
export async function extraerComprobante({ data, mediaType, qrTexto, cuitCliente, id, archivoId, modelo = MODELO_POR_DEFECTO }) {
  let bloque;
  if (TIPOS_IMAGEN.includes(mediaType)) {
    bloque = { type: 'image', source: { type: 'base64', media_type: mediaType, data } };
  } else if (mediaType === 'application/pdf') {
    bloque = { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } };
  } else {
    return { ok: false, alertas: [{ tipo: 'formato', mensaje: `Formato no soportado: ${mediaType}. Subí JPG, PNG, WEBP o PDF.` }] };
  }

  const pedido = {
    ...parametros(modelo),
    output_config: { format: { type: 'json_schema', schema: ESQUEMA_LECTURA } },
    messages: [{ role: 'user', content: [bloque, { type: 'text', text: INSTRUCCIONES_LECTURA }] }],
  };
  const respuesta = pedido.betas ? await claude().beta.messages.create(pedido) : await claude().messages.create(pedido);

  const uso = { entrada: respuesta.usage.input_tokens, salida: respuesta.usage.output_tokens, modelo: respuesta.model };
  if (respuesta.stop_reason === 'refusal') {
    return { ok: false, uso, alertas: [{ tipo: 'rechazo', mensaje: 'La lectura automática no se pudo hacer. Cargalo a mano.' }] };
  }
  if (respuesta.stop_reason === 'max_tokens') {
    return { ok: false, uso, alertas: [{ tipo: 'corte', mensaje: 'La lectura quedó incompleta. Reintentá o cargalo a mano.' }] };
  }
  const texto = respuesta.content.filter(b => b.type === 'text').map(b => b.text).join('');
  let ia;
  try { ia = normalizarLecturaIa(JSON.parse(texto)); } catch {
    return { ok: false, uso, alertas: [{ tipo: 'respuesta_invalida', mensaje: 'La lectura devolvió datos ilegibles. Reintentá.' }] };
  }

  const qr = qrTexto ? leerQrArca(qrTexto) : null;
  return { ...combinarLectura(ia, qr, { cuitCliente, id, archivoId }), uso, lecturaIa: ia };
}

export function esErrorReintentable(error) {
  return error instanceof Anthropic.RateLimitError
    || error instanceof Anthropic.InternalServerError
    || error instanceof Anthropic.APIConnectionError;
}
