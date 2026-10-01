// Llamada a Claude con salida estructurada (JSON Schema estricto), validación por código y un reintento controlado.
// Solo corre en el servidor: la API key sale de ANTHROPIC_API_KEY (variable de entorno de Vercel).
// Los logs nunca incluyen datos fiscales: solo la tarea, el modelo y el tipo de error.

import Anthropic from '@anthropic-ai/sdk';

export const MODELO = process.env.ORBIT_IVA_MODELO_ASISTENTE || process.env.ORBIT_IVA_MODELO || 'claude-sonnet-5-5';

let cliente;
const claude = () => (cliente ??= new Anthropic({ maxRetries: 1 }));

export class ErrorIa extends Error {
  constructor(mensaje, tipo) { super(mensaje); this.tipo = tipo; }
}

// tarea: nombre para logs · validar(json) → { ok, valor, error }. Si la respuesta no se puede usar, se pide una vez más.
export async function pedirJson({ tarea, sistema, contenido, esquema, validar, pensar = false, maxTokens = 4000, timeout = 40000, modelo = MODELO }) {
  let ultimoError = null;
  for (let intento = 1; intento <= 2; intento++) {
    const pedido = {
      model: modelo,
      max_tokens: maxTokens,
      system: sistema,
      output_config: { format: { type: 'json_schema', schema: esquema } },
      messages: [{ role: 'user', content: intento === 1 ? contenido : `${contenido}\n\nTu respuesta anterior no se pudo usar (${ultimoError}). Respondé de nuevo respetando el esquema.` }],
      ...(pensar ? { thinking: { type: 'adaptive' } } : {}),
    };
    let respuesta;
    try {
      respuesta = await claude().messages.create(pedido, { timeout });
    } catch (e) {
      console.warn(`ia:${tarea} error ${e?.status ?? e?.name}`);
      if (e instanceof Anthropic.APIConnectionTimeoutError) throw new ErrorIa('Claude tardó demasiado en responder. Probá de nuevo.', 'timeout');
      throw new ErrorIa('Claude no respondió. Probá de nuevo en un rato.', 'conexion');
    }
    const uso = { modelo: respuesta.model, entrada: respuesta.usage.input_tokens, salida: respuesta.usage.output_tokens };
    if (respuesta.stop_reason === 'refusal') throw new ErrorIa('Claude no pudo procesar este pedido.', 'rechazo');
    const texto = respuesta.content.filter(b => b.type === 'text').map(b => b.text).join('');
    let json;
    try { json = JSON.parse(texto); } catch { ultimoError = 'JSON inválido'; console.warn(`ia:${tarea} json inválido (intento ${intento})`); continue; }
    const v = validar(json);
    if (v.ok) return { valor: v.valor, uso };
    ultimoError = v.error;
    console.warn(`ia:${tarea} respuesta rechazada por validación (intento ${intento})`);
  }
  throw new ErrorIa('La respuesta de Claude no pasó los controles. No se aplicó nada; podés hacerlo a mano.', 'invalida');
}
