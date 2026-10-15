/* Mi Mes by Orbit · tope global de IA y vencimiento de la lectura automática
   (decisiones de Majo del 15/10/2026, decision-log).

   Tope global: USD 30 por mes (MI_MES_AI_BUDGET_USD). Mismo corte que Mimitos
   (api/_lib/petai.js, que no se toca): antes de cada lectura se reserva lo
   máximo que puede costar; con la respuesta se ajusta al costo real; si no
   hubo cobro, la reserva vuelve. Si con la reserva se pasa del tope, no se
   llama a Claude y la lectura automática queda en pausa hasta el mes
   siguiente (la app sigue; se carga a mano). Aviso por mail a Orbit al 80 % y
   al 100 %, uno por nivel y por mes (candado SET NX).
   Cuenta todo lo de Mi Mes: clasificador (Haiku), lector de resúmenes y el
   lector de facturas de Vencimientos cuando lo usa Mi Mes.

   Precios por token: filas mimes_ de business/finance-model.csv (Opus 5.5
   USD 4 / 20 y Haiku 5.5 USD 0,10 / 0,50 por millón). Tokens máximos por
   lectura: mimes_*_max, con 2 intentos.

   Vencimiento: la lectura automática vence a los 12 meses de la compra de
   ob-019 (como Mimitos). Las cuentas admin no vencen. Sin fecha de compra,
   corre desde el primer uso (guardado en KV). */
import { kvGet, kvSet, kvIncrBy, kvSetNX, kvDel } from './kv.js';
import { sendEmail, emailReady, layout, it } from './email.js';
import { adminEmails } from './admin.js';
import { hoyAR } from './mi-mes-avisos.js';

/* micro-dólares por token (USD por millón de tokens = µUSD por token) */
export const PRECIOS = { 'claude-opus-5-5': [4, 20], 'claude-haiku-5-5': [0.1, 0.5] };
const PRECIO_DESCONOCIDO = PRECIOS['claude-opus-5-5'];   // prudente
export const costoMicro = (modelo, entrada, salida) => {
  const [pi, po] = PRECIOS[modelo] || PRECIO_DESCONOCIDO;
  return Math.ceil((Number(entrada) || 0) * pi + (Number(salida) || 0) * po);
};
/* [modelo, tokens de entrada máx., tokens de salida máx., intentos] (finance-model, mimes_*_max) */
export const MAXIMOS = {
  clasificar: ['claude-haiku-5-5', 118_000, 8_000, 2],
  resumen: ['claude-opus-5-5', 118_000, 16_000, 2],
  factura: ['claude-opus-5-5', 118_000, 4_000, 2],
};
export const reservaMaxima = paso => { const [m, i, o, n] = MAXIMOS[paso] || MAXIMOS.resumen; return n * costoMicro(m, i, o); };

export const PRESUPUESTO_DEFECTO_USD = 30;
export const budgetUsd = () => { const n = Number(process.env.MI_MES_AI_BUDGET_USD); return Number.isFinite(n) && n > 0 ? n : PRESUPUESTO_DEFECTO_USD; };
const mesAR = now => hoyAR(new Date(now)).slice(0, 7);
export const claveGasto = (now = Date.now()) => `orbit:mi-mes:ia:gasto:${mesAR(now)}`;
const TTL = 40 * 86400;
export async function gastadoMicro(now = Date.now()) { return Number(await kvGet(claveGasto(now))) || 0; }
/* "1/11": el primer día del mes que viene (hora de Argentina) */
export function hastaPausa(now = Date.now()) {
  const [a, m] = mesAR(now).split('-').map(Number);
  return `1/${m === 12 ? 1 : m + 1}`;
}
export const mensajePausa = hasta => `La lectura automática está en pausa hasta el ${hasta}: cargalo a mano.`;
/* QA t19 · 1: lo en curso (reservas) va aparte del gasto real, así un pico de
   lecturas en paralelo no pausa el mes. La pausa es una marca compartida por
   mes: se activa cuando lo que queda del techo no alcanza para la reserva
   máxima del lector MÁS caro (o al llegar al 100 %), y desde ahí se pausan
   todos los tipos juntos. El mail del 100 % sale una sola vez, al marcarla. */
export const claveReservado = (now = Date.now()) => `orbit:mi-mes:ia:reservado:${mesAR(now)}`;
export const clavePausa = (now = Date.now()) => `orbit:mi-mes:ia:pausa:${mesAR(now)}`;
export async function reservadoMicro(now = Date.now()) { return Number(await kvGet(claveReservado(now))) || 0; }
const MAS_CARO = () => Math.max(...Object.keys(MAXIMOS).map(reservaMaxima));
let avisar = (...a) => avisoTope(...a);
export function __usarAviso(f) { avisar = f || ((...a) => avisoTope(...a)); }
async function marcarPausa(now, gastado) {
  if (await kvSetNX(clavePausa(now), { gastado, at: new Date(now).toISOString() }, TTL)) {
    console.error(`[mi-mes] IA EN PAUSA hasta el ${hastaPausa(now)}: el techo del mes (USD ${budgetUsd()}, MI_MES_AI_BUDGET_USD) no alcanza para otra lectura. Gastado: USD ${(gastado / 1e6).toFixed(2)}.`);
    await avisar(100, gastado, now);
  }
}
export async function enPausa(now = Date.now()) {
  if (await kvGet(clavePausa(now))) return hastaPausa(now);
  const g = await gastadoMicro(now);
  if (g + MAS_CARO() > budgetUsd() * 1e6) { await marcarPausa(now, g); return hastaPausa(now); }
  return null;
}

/* Reserva lo máximo que puede costar ese paso. { ok, ... }, { ok: false, hasta } (pausa) o { ok: false, ocupado: true } */
export async function reservar(paso, now = Date.now()) {
  const hasta = await enPausa(now);
  if (hasta) return { ok: false, hasta };
  const cap = Math.round(budgetUsd() * 1e6), micro = reservaMaxima(paso), clave = claveReservado(now);
  const g = await gastadoMicro(now);
  const enCurso = await kvIncrBy(clave, micro, 3600);
  if (g + enCurso > cap) { await kvIncrBy(clave, -micro).catch(() => {}); return { ok: false, ocupado: true }; }
  return { ok: true, clave, claveGasto: claveGasto(now), micro, paso, now };
}
/* Ajusta al costo real (tokens que devolvió la API): sale de "en curso" y entra al gasto.
   Sin tokens (se cortó por tiempo y la llamada pudo seguir): se cuenta la reserva entera, por prudencia. */
export async function ajustar(r, { modelo, entrada, salida } = {}, now = r?.now ?? Date.now()) {
  if (!r?.ok) return null;
  const real = entrada == null && salida == null ? r.micro : costoMicro(modelo || MAXIMOS[r.paso]?.[0], entrada, salida);
  await kvIncrBy(r.clave, -r.micro).catch(() => {});
  const total = await kvIncrBy(r.claveGasto, real, TTL).catch(() => null);
  if (total != null && total >= budgetUsd() * 1e6 * 0.8) await avisar(80, total, now);
  if (total != null && total + MAS_CARO() > budgetUsd() * 1e6) await marcarPausa(now, total);
  return real;
}
/* Sin cobro (no hubo respuesta de la API): la reserva vuelve. */
export async function devolver(r) { if (r?.ok) await kvIncrBy(r.clave, -r.micro).catch(() => {}); }

/* ── aviso por mail a Orbit (80 % y 100 %), uno por nivel y por mes ── */
const usd = micro => `USD ${(micro / 1e6).toFixed(2).replace('.', ',')}`;
export function mailAviso(nivel, gastado, now = Date.now()) {
  const pausa = nivel >= 100, techo = `USD ${String(budgetUsd()).replace('.', ',')}`, mes = mesAR(now);
  const subject = pausa ? 'Mi Mes: la lectura automática llegó al techo del mes y quedó en pausa' : 'Mi Mes: la lectura automática ya usó el 80% del techo del mes';
  const queHacer = pausa
    ? `La lectura automática de Mi Mes (resúmenes, recibos, facturas y capturas) está en pausa hasta el ${hastaPausa(now)}. Todo lo demás sigue andando y se puede cargar a mano. Para reactivarla ya, subí MI_MES_AI_BUDGET_USD en Vercel (Settings → Environment Variables, en Production) y volvé a desplegar.`
    : 'Por ahora no pasa nada. Si se llega al techo, la lectura automática se pausa sola hasta el mes que viene. Si esperás más uso, subí MI_MES_AI_BUDGET_USD en Vercel (Settings → Environment Variables, en Production) y volvé a desplegar.';
  const text = `${subject}.\n\nGasto estimado de ${mes}: ${usd(gastado)}\nTecho del mes: ${techo} (MI_MES_AI_BUDGET_USD)\n\nQué hacer: ${queHacer}\n\nEs una estimación con los precios de finance-model.csv; el número final está en la consola de Anthropic.`;
  const html = layout({
    accent: pausa ? 'fuego' : 'acid', preheader: `${usd(gastado)} de ${techo} este mes.`, eyebrow: 'Mi Mes · Aviso interno',
    title: pausa ? `La lectura quedó ${it('en pausa.')}` : `La lectura ya usó el ${it('80%.')}`,
    body: `<p style="margin:0">${queHacer}</p>`,
    meta: [['Gasto estimado', `${usd(gastado)} (${mes})`], ['Techo', `${techo} · MI_MES_AI_BUDGET_USD`]],
    foot: 'Es una estimación; el número final está en la consola de Anthropic. Este aviso sale una sola vez por mes.', sign: false,
  });
  return { subject, text, html };
}
export async function avisoTope(nivel, gastado, now = Date.now()) {
  try {
    const para = adminEmails();
    if (!para.length || !emailReady()) return { enviado: false, nivel };
    const clave = `orbit:mi-mes:ia:aviso:${mesAR(now)}:${nivel}`;
    if (!(await kvSetNX(clave, { gastado }, TTL))) return { enviado: false, nivel, repetido: true };
    const mail = mailAviso(nivel, gastado, now);
    let ok = 0;
    for (const to of para) { try { if ((await sendEmail({ to, ...mail })).sent) ok++; } catch (e) { console.error(`[mi-mes] no salió el aviso del tope (${nivel}%): ${String(e).slice(0, 160)}`); } }
    if (!ok) { await kvDel(clave).catch(() => {}); return { enviado: false, nivel }; }
    return { enviado: true, nivel };
  } catch (e) { console.error(`[mi-mes] aviso del tope: ${String(e).slice(0, 160)}`); return { enviado: false, nivel }; }
}

/* ── vencimiento: 12 meses desde la compra de ob-019 ── */
export const MESES_IA = 12;
/* QA t19 · 2: la fecha de primer uso (solo si la compra no tiene fecha; el checkout siempre la guarda)
   vence a los 13 meses: alcanza para contar los 12 meses, con un mes de margen. */
export const TTL_DESDE_S = 13 * 31 * 86400;
const sumarMesesISO = (t, n) => { const d = new Date(t); const dia = d.getUTCDate(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n); d.setUTCDate(Math.min(dia, new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate())); return d.getTime(); };
export async function vigenciaIA(acc, compras = [], now = Date.now()) {
  if (acc?.admin) return { hasta: null, vencida: false };
  const fechas = (compras || []).filter(p => p.productId === 'ob-019').map(p => Date.parse(p.date || '')).filter(Number.isFinite);
  let desde = fechas.length ? Math.min(...fechas) : null;
  if (desde === null) {
    const clave = `orbit:mi-mes:ia:desde:${String(acc?.email || '').toLowerCase()}`;
    const guardado = Number(await kvGet(clave));
    if (Number.isFinite(guardado) && guardado > 0) desde = guardado;
    else { desde = now; await kvSet(clave, now, TTL_DESDE_S).catch(() => {}); }
  }
  const hastaMs = sumarMesesISO(desde, MESES_IA);
  return { hasta: new Date(hastaMs).toISOString().slice(0, 10), vencida: now >= hastaMs };
}
export const fechaAR = iso => { const [a, m, d] = iso.split('-').map(Number); return `${d}/${m}/${a}`; };
export const mensajeVencida = hasta => `Tu lectura automática venció el ${fechaAR(hasta)}. La app y tus datos siguen; podés cargar a mano.`;
