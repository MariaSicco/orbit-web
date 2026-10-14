/* Mimitos · llamada a Claude y corte global de gasto mensual (toda la plataforma Mimitos).

   Modelos (nunca heredan ORBIT_MODEL, que es de otras herramientas):
   - Preguntale a Mimitos: ORBIT_ASK_MODEL || claude-haiku-5-5
   - Lectura de libreta y estudios: ORBIT_VISION_MODEL || claude-sonnet-5-5

   Corte global: orbit:petai:spend:<AAAA-MM> = micro-dólares estimados del mes (USD × 1e6), con INCRBY.
   Antes de cada llamada se reserva lo máximo que puede costar (entrada estimada + max_tokens de salida);
   si con eso se pasa del tope (MIMITOS_AI_BUDGET_USD, por defecto USD 50), se devuelve la reserva y la
   llamada no sale: ai_paused, con console.error para que Majo se entere. Con la respuesta, la reserva se
   ajusta al costo real (usage). Si la llamada no se cobró (red, respuesta no 2xx), la reserva vuelve.

   Avisos por mail a ADMIN_EMAILS (Brevo, el mismo envío de la web): uno cuando el gasto estimado del mes pasa
   el 80 % del tope y otro cuando se llega al tope y la IA se pausa. Uno por nivel y por mes: el candado es
   orbit:petai:alert:<AAAA-MM>:<80|100> con SET NX. Si el envío falla, el candado se suelta para reintentar
   en la próxima llamada. El mail no lleva datos de ninguna persona: solo montos, tope y fecha.

   Errores: todos llevan `billed`. billed=false → Anthropic no respondió con 200 (no hay cobro), y el
   crédito de la persona se puede devolver. billed=true → hubo 200 (ya se cobró) pero la respuesta no sirve
   (JSON inválido o cortada por max_tokens): no se devuelve nada.

   Precios por millón de tokens (entrada / salida), de la tabla de modelos de Anthropic al 06/10/2026.
   Haiku 5.5 vale eso hasta 100K tokens de entrada; acá nunca se llega. Un modelo desconocido se estima
   con el precio más caro de la tabla, así el corte nunca se queda corto. */
import { kvGet, kvIncrBy, kvSetNX, kvDel } from './kv.js';
import { sendEmail, emailReady, layout, it } from './email.js';
import { adminEmails } from './admin.js';

export const DEFAULT_ASK_MODEL = 'claude-haiku-5-5';
export const DEFAULT_VISION_MODEL = 'claude-sonnet-5-5';
export const askModel = () => process.env.ORBIT_ASK_MODEL || DEFAULT_ASK_MODEL;
export const visionModel = () => process.env.ORBIT_VISION_MODEL || DEFAULT_VISION_MODEL;

export const PRICES = {
  'claude-haiku-5-5': [0.10, 0.50],
  'claude-sonnet-5-5': [2, 10],
  'claude-sonnet-5': [2, 10],
  'claude-opus-5-5': [4, 20],
  'claude-opus-5': [5, 25],
};
const PRICE_UNKNOWN = [10, 50];
export const priceOf = model => PRICES[model] || PRICE_UNKNOWN;

export const DEFAULT_BUDGET_USD = 50;
export const budgetUsd = () => { const n = Number(process.env.MIMITOS_AI_BUDGET_USD); return Number.isFinite(n) && n > 0 ? n : DEFAULT_BUDGET_USD; };
export const spendKey = (now = Date.now()) => `orbit:petai:spend:${new Date(now).toISOString().slice(0, 7)}`;
const SPEND_TTL = 400 * 86400;
export const AI_PAUSED_MESSAGE = 'Las funciones inteligentes de Mimitos están en pausa por un rato. Tus datos y todo lo demás siguen andando. Probá de nuevo más tarde.';
export const pausedBody = () => ({ error: 'ai_paused', message: AI_PAUSED_MESSAGE });

/* micro-dólares (enteros) de una cantidad de tokens */
export const costMicro = (model, input, output) => { const [pi, po] = priceOf(model); return Math.ceil((Number(input) || 0) * pi + (Number(output) || 0) * po); };
/* tokens de entrada estimados: texto ~3 caracteres por token; cada imagen ~1.600; cada página de PDF ~2.500 */
export const estimateTokens = ({ chars = 0, images = 0, pages = 0 } = {}) => Math.ceil(chars / 3) + images * 1600 + pages * 2500 + 200;

export async function spentMicro(now = Date.now()) { return Number(await kvGet(spendKey(now))) || 0; }
/* ¿se llegó al tope del mes? (sin gastar) */
export async function aiPaused(now = Date.now()) { return (await spentMicro(now)) >= budgetUsd() * 1e6; }

/* ---------- avisos del tope por mail ---------- */
export const ALERT_LEVELS = [80, 100];
export const alertKey = (level, now = Date.now()) => `orbit:petai:alert:${new Date(now).toISOString().slice(0, 7)}:${level}`;
const ALERT_TTL = 40 * 86400;
const usd = micro => `USD ${(micro / 1e6).toFixed(2).replace('.', ',')}`;
export function budgetAlertEmail(level, spent, now = Date.now()) {
  const cap = budgetUsd(), zona = process.env.ORBIT_TZ || 'America/Argentina/Buenos_Aires';
  const fecha = new Date(now).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: zona });
  const mes = new Date(now).toLocaleDateString('es-AR', { month: 'long', year: 'numeric', timeZone: zona });
  const gasto = usd(spent), techo = `USD ${String(cap).replace('.', ',')}`;
  const pausa = level >= 100;
  const subject = pausa ? 'Mimitos: la IA llegó al techo de este mes y quedó en pausa' : 'Mimitos: la IA ya usó el 80% del techo de este mes';
  const queHacer = pausa
    ? 'Las funciones inteligentes de Mimitos (leer la libreta y los estudios, Preguntale a Mimitos y la importación del mail) están en pausa hasta el mes que viene. Todo lo demás de la app sigue andando. Si querés reactivarlas ya, subí MIMITOS_AI_BUDGET_USD en Vercel (Settings → Environment Variables, en Production) y volvé a desplegar.'
    : 'Por ahora no pasa nada: la IA sigue andando. Si se llega al techo, las funciones inteligentes se pausan solas hasta el mes que viene. Si esperás más uso este mes, subí MIMITOS_AI_BUDGET_USD en Vercel (Settings → Environment Variables, en Production) y volvé a desplegar.';
  const text = `${subject}.\n\nGasto estimado de ${mes}: ${gasto}\nTecho del mes: ${techo} (MIMITOS_AI_BUDGET_USD)\nFecha: ${fecha}\n\nQué hacer: ${queHacer}\n\nEs una estimación con los precios de la tabla de modelos; el número final está en la consola de Anthropic.`;
  const html = layout({
    accent: pausa ? 'fuego' : 'acid',
    preheader: `${gasto} de ${techo} este mes.`,
    eyebrow: 'Mimitos · Aviso interno',
    title: pausa ? `La IA quedó ${it('en pausa.')}` : `La IA ya usó el ${it('80%.')}`,
    body: `<p style="margin:0">${queHacer}</p>`,
    meta: [['Gasto estimado', `${gasto} (${mes})`], ['Techo', `${techo} · MIMITOS_AI_BUDGET_USD`], ['Fecha', fecha]],
    foot: 'Es una estimación con los precios de la tabla de modelos; el número final está en la consola de Anthropic. Este aviso sale una sola vez por mes.',
    sign: false,
  });
  return { subject, text, html };
}
/* Manda el aviso de un nivel (80: el gasto pasó el 80 % del tope; 100: la IA se pausó), una vez por nivel y por mes.
   spent es el gasto estimado del mes en micro-dólares. Nunca tira error. */
export async function budgetAlert(level, spent, now = Date.now()) {
  try {
    const cap = budgetUsd() * 1e6, to = adminEmails();
    if (!ALERT_LEVELS.includes(level) || (level < 100 && spent < cap * level / 100)) level = 0;
    if (!level || !to.length || !emailReady()) return { sent: false, level: level || 0 };
    const key = alertKey(level, now);
    if (!(await kvSetNX(key, { at: new Date(now).toISOString(), spent }, ALERT_TTL))) return { sent: false, level, dup: true };
    const mail = budgetAlertEmail(level, spent, now);
    let ok = 0;
    for (const email of to) { try { if ((await sendEmail({ to: email, ...mail })).sent) ok++; } catch (e) { console.error(`[mimitos] no salió el aviso del tope (${level}%): ${String(e).slice(0, 160)}`); } }
    if (!ok) { await kvDel(key).catch(() => {}); return { sent: false, level }; }
    return { sent: true, level };
  } catch (e) {
    console.error(`[mimitos] aviso del tope: ${String(e).slice(0, 160)}`);
    return { sent: false, level: 0 };
  }
}

const fail = (code, status, billed, extra = {}) => Object.assign(new Error(code), { status, code, billed, ...extra });

/* Llamada a la API de mensajes. body: { system?, messages, max_tokens, output_config? } (sin model).
   Devuelve { text, stop, usage: {input, output}, model, costMicro }. */
export async function callClaude({ model, body, estimate, now = Date.now() }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw fail('ia_no_configurada', 503, false);
  const k = spendKey(now), cap = Math.round(budgetUsd() * 1e6);
  const reserve = costMicro(model, estimate || 0, body.max_tokens || 0);
  const after = await kvIncrBy(k, reserve, SPEND_TTL);
  if (after > cap) {
    await kvIncrBy(k, -reserve).catch(() => {});
    console.error(`[mimitos] IA EN PAUSA: se llegó al tope de gasto del mes (USD ${budgetUsd()}, MIMITOS_AI_BUDGET_USD). Gastado estimado: USD ${((after - reserve) / 1e6).toFixed(2)}. Las funciones inteligentes responden ai_paused hasta el mes que viene o hasta subir el tope.`);
    await budgetAlert(100, after - reserve, now);
    throw fail('ai_paused', 503, false);
  }
  let r;
  try {
    r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model, ...body }),
    });
  } catch {
    await kvIncrBy(k, -reserve).catch(() => {});
    throw fail('ia_error_red', 502, false);
  }
  if (!r.ok) {
    /* sin 200 no hay cobro: vuelve la reserva y el crédito de la persona se puede devolver */
    await kvIncrBy(k, -reserve).catch(() => {});
    const t = await r.text().catch(() => '');
    throw fail('ia_error_' + r.status, r.status === 429 || r.status === 529 ? 503 : 502, false, { apiStatus: r.status, apiText: t.slice(0, 500) });
  }
  let d;
  try { d = await r.json(); }
  catch {
    /* hubo 200: se cobró; la reserva queda como costo (no hay usage para ajustarla) */
    throw fail('ia_respuesta_invalida', 502, true);
  }
  const usage = { input: (d.usage?.input_tokens || 0) + (d.usage?.cache_creation_input_tokens || 0) + (d.usage?.cache_read_input_tokens || 0), output: d.usage?.output_tokens || 0 };
  const real = costMicro(model, usage.input, usage.output);
  const total = await kvIncrBy(k, real - reserve).catch(() => null);
  if (total != null && total >= cap * .8) await budgetAlert(80, total, now);
  return {
    text: (d.content || []).filter(c => c.type === 'text').map(c => c.text).join('').trim(),
    stop: d.stop_reason || '',
    usage, model, costMicro: real,
  };
}

/* Para la lectura (libreta y estudios): exige un JSON completo. Cortada por max_tokens o sin JSON → error cobrado. */
export function jsonOf(out) {
  if (out.stop === 'max_tokens') throw fail('ia_respuesta_truncada', 502, true);
  const t = out.text, a = t.indexOf('{'), b = t.lastIndexOf('}');
  try { return JSON.parse(t.slice(a, b + 1)); } catch { throw fail('ia_respuesta_invalida', 502, true); }
}
