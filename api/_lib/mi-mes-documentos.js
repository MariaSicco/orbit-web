/* Mi Mes by Orbit · "Subí lo que tengas": clasificación de documentos con Claude.
   Solo corre en el servidor; la key sale de ANTHROPIC_API_KEY (Vercel).

   Por qué dos pasos: una primera llamada barata (Claude Haiku 5.5, $ 0,10 /
   $ 0,50 por millón de tokens) dice QUÉ es el archivo y, si es un recibo o una
   captura, ya extrae sus pocos datos. Los resúmenes y las facturas los lee
   después su lector especializado (Opus 5.5, el mismo de siempre) en OTRA
   invocación, con su propio presupuesto de 60 s. Así un resumen no paga dos
   lecturas caras y ninguna función pasa los 60 s.
   Los logs llevan modelo, tokens y tipo, nunca datos del documento. */
import Anthropic from '@anthropic-ai/sdk';
import { ESQUEMA_CLASIFICAR, SISTEMA_CLASIFICAR, validarClasificacion } from '../_herramientas/mi-mes/documentos.js';
import { soloJson, ErrorLectura } from './mi-mes-lector.js';

export const MODELO_CLASIFICAR = process.env.MI_MES_CLASIFICAR_MODELO || 'claude-haiku-5-5';
export const TIMEOUT_CLASIFICAR_MS = 25_000;
let cliente = null;
const claude = () => (cliente ??= new Anthropic({ maxRetries: 0 }));
export function __usarCliente(c) { cliente = c; }

const fuente = (buf, tipo) => (tipo === 'pdf'
  ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: buf.toString('base64') } }
  : { type: 'image', source: { type: 'base64', media_type: tipo, data: buf.toString('base64') } });

export async function clasificarConClaude({ buf, tipo }) {
  const contenido = [fuente(buf, tipo), { type: 'text', text: 'Decí qué es este documento y, si corresponde, extraé sus datos.' }];
  const usos = [];
  let ultimoError = null;
  for (let intento = 1; intento <= 2; intento++) {
    let r;
    try {
      r = await claude().messages.create({
        model: MODELO_CLASIFICAR, max_tokens: 8000,
        system: `${SISTEMA_CLASIFICAR}\n\nRespondé SOLO con un objeto JSON (sin texto antes ni después, sin \`\`\`) que cumpla este JSON Schema:\n${JSON.stringify(ESQUEMA_CLASIFICAR)}`,
        output_config: { effort: 'low' },
        messages: [{ role: 'user', content: intento === 1 ? contenido
          : [...contenido, { type: 'text', text: `Tu respuesta anterior no se pudo usar (${ultimoError}). Respondé de nuevo respetando el esquema.` }] }],
      }, { timeout: TIMEOUT_CLASIFICAR_MS });
    } catch (e) {
      console.warn(JSON.stringify({ evento: 'mi-mes-clasificar', error: e?.status ?? e?.name ?? 'desconocido' }));
      if (e instanceof Anthropic.APIConnectionTimeoutError) throw new ErrorLectura('Tardó demasiado en reconocer el archivo. Probá de nuevo o cargalo a mano.', 'timeout');
      if (e instanceof Anthropic.RateLimitError) throw new ErrorLectura('Hay muchas lecturas en este momento. Probá en unos minutos.', 'limite');
      throw new ErrorLectura('No pudimos leer el archivo ahora. Probá de nuevo en un rato o cargalo a mano.', 'api');
    }
    usos.push({ entrada: r.usage?.input_tokens ?? 0, salida: r.usage?.output_tokens ?? 0 });
    if (r.stop_reason === 'refusal') throw new ErrorLectura('No pudimos procesar este archivo. Cargalo a mano.', 'rechazo');
    if (r.stop_reason === 'max_tokens') { ultimoError = 'la respuesta quedó cortada'; continue; }
    const texto = (r.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    let json;
    try { json = JSON.parse(soloJson(texto)); } catch { ultimoError = 'JSON inválido'; continue; }
    const v = validarClasificacion(json);
    if (!v.ok) { ultimoError = v.errores.join(' '); continue; }
    return { lectura: v.lectura, uso: sumar(usos), modelo: r.model || MODELO_CLASIFICAR };
  }
  const e = new ErrorLectura('No pudimos saber qué es este archivo. Elegí qué es o cargalo a mano.', 'invalida');
  e.uso = sumar(usos);
  throw e;
}
const sumar = us => us.reduce((a, u) => ({ entrada: a.entrada + u.entrada, salida: a.salida + u.salida }), { entrada: 0, salida: 0 });

/* Modo prueba (sin key): adivina el tipo por el nombre del archivo y devuelve
   datos de ejemplo inventados. El nombre no se guarda ni se loguea. */
export function clasificarDeEjemplo(nombre, hoy) {
  const n = String(nombre || '').toLowerCase();
  const tipo = /recibo|sueldo|haberes/.test(n) ? 'recibo' : /resumen|visa|master|amex|tarjeta/.test(n) ? 'resumen'
    : /factura|boleta|edenor|edesur|metrogas|aysa|luz|gas|agua|internet|expensas|alquiler|abl|patente/.test(n) ? 'factura'
    : /captura|screenshot|movimientos|homebanking|img|whatsapp image/.test(n) ? 'captura' : 'otro';
  const [a, m] = hoy.split('-').map(Number);
  const mesAnt = `${m === 1 ? a - 1 : a}-${String(m === 1 ? 12 : m - 1).padStart(2, '0')}`;
  if (tipo === 'recibo') return { tipo, confianza: 'alta', avisos: ['Modo prueba: datos de ejemplo.'], captura: null,
    recibo: { neto: 185_000_000, moneda: 'ARS', fechaPago: `${hoy.slice(0, 7)}-05`, periodo: mesAnt, clase: 'mensual' } };
  if (tipo === 'captura') return { tipo, confianza: 'alta', avisos: ['Modo prueba: datos de ejemplo.'], recibo: null,
    captura: { origen: 'tarjeta', saldo: null, movimientos: [
      { fecha: hoy, descripcion: 'FARMACIA EJEMPLO', monto: 3_250_000, moneda: 'ARS', tipo: 'consumo', cuota: null },
      { fecha: hoy, descripcion: 'ZAPATILLERIA EJEMPLO', monto: 4_500_000, moneda: 'ARS', tipo: 'consumo', cuota: { n: 1, de: 3 } },
      { fecha: hoy, descripcion: 'Transferencia a mi caja de ahorro', monto: 10_000_000, moneda: 'ARS', tipo: 'transferencia_propia', cuota: null }] } };
  return { tipo, confianza: 'alta', avisos: ['Modo prueba: datos de ejemplo.'], recibo: null, captura: null };
}
