/* Mimitos · funciones inteligentes: topes internos y vencimiento a 12 meses (aprobado por Majo, 14/10/2026).

   Qué cuenta como "importación inteligente": cualquier documento que se manda a la IA para leerlo
   (foto de la libreta, estudio subido, estudio desde el mail o por link). Una importación = un documento.
   - El crédito se reserva (contadores atómicos) antes de mandar el documento a la IA. Se devuelve solo si la
     llamada no se cobró (red, 5xx, 429: Anthropic no respondió 200), con un tope de 10 devoluciones por día.
     Si Anthropic respondió y la respuesta no sirve (JSON inválido, cortada), no se devuelve. El diario nunca.
   - Buscar en el mail, filtrar, clasificar, validar links y descartar NO consumen.
   - Topes por período de 12 meses desde la compra: 40 en los primeros 30 días y 180 para el resto
     (lo que no se usa en los primeros 30 días no se pasa). Más un tope diario anti-abuso de 40.
   - Páginas: hasta 20 por documento cuentan como 1 importación; de un PDF más largo se mandan solo las
     primeras 20 (el archivo completo queda guardado). Presupuesto interno de 600 páginas por período.
   - Vencimiento: 12 meses desde la fecha de compra. Vencido, el servidor rechaza con `ai_expired`; la app
     y los datos siguen andando. Las cuentas admin no vencen (el período se renueva cada 12 meses).
   - Nada de esto se muestra salvo cuando quedan ≤ SHOW_LEFT_AT importaciones.

   Preguntale a Mimitos tiene sus propios topes (api/_lib/petask.js): 150 por mes y 30 por día. */
import { kvGet, kvSet, kvMGet, kvIncrBy } from './kv.js';

export const IMPORTS_FIRST = 40;        /* primeros 30 días desde la compra */
export const FIRST_DAYS = 30;
export const IMPORTS_REST = 180;        /* del día 31 al fin de los 12 meses */
export const IMPORTS_PER_DAY = 40;      /* anti-abuso: frena scripts, una persona no llega */
export const PAGES_PER_DOC = 20;
export const PAGES_PER_PERIOD = 600;
export const AI_MONTHS = 12;
export const SHOW_LEFT_AT = 10;         /* desde cuántas importaciones restantes se muestra el aviso */
export const RENEW_LIST = 'orbit:petrenew:list';

const DAY = 864e5;
const lc = e => String(e || '').toLowerCase();
const addMonths = (t, n) => { const d = new Date(t); const day = d.getUTCDate(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n); d.setUTCDate(Math.min(day, new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate())); return d.getTime(); };
const anchorKey = email => `orbit:petai:anchor:${lc(email)}`;
const useKey = (email, start) => `orbit:petai:${lc(email)}:${new Date(start).toISOString().slice(0, 10)}`;
const dayKey = (email, now) => `orbit:petaiday:${lc(email)}:${new Date(now).toISOString().slice(0, 10)}`;

/* Desde cuándo corre: la fecha de compra. Sin fecha (admin sin compra o compra vieja sin fecha),
   la primera vez que se usa, guardada en KV. */
async function anchorOf(email, purchaseDate, now) {
  const t = Date.parse(purchaseDate || '');
  if (Number.isFinite(t)) return t;
  const saved = await kvGet(anchorKey(email));
  if (Number.isFinite(saved)) return saved;
  await kvSet(anchorKey(email), now);
  return now;
}

/* Período vigente. ctx = { purchaseDate, admin } */
export async function period(email, ctx = {}, now = Date.now()) {
  const anchor = await anchorOf(email, ctx.purchaseDate, now);
  const expiresAt = addMonths(anchor, AI_MONTHS);
  let start = anchor;
  if (ctx.admin) { while (addMonths(start, AI_MONTHS) <= now) start = addMonths(start, AI_MONTHS); }
  const end = addMonths(start, AI_MONTHS);
  const expired = !ctx.admin && now >= expiresAt;
  const phase = now < start + FIRST_DAYS * DAY ? 1 : 2;
  return { anchor, start, end, expiresAt: ctx.admin ? null : new Date(expiresAt).toISOString(), expired, phase, firstEnds: new Date(start + FIRST_DAYS * DAY).toISOString() };
}

const capOf = phase => phase === 1 ? IMPORTS_FIRST : IMPORTS_REST;

/* Contadores atómicos (INCRBY) por período: <base>:p1, <base>:p2 y <base>:pages. El diario va aparte. */
export const useKeys = (email, start) => { const b = useKey(email, start); return { base: b, p1: b + ':p1', p2: b + ':p2', pages: b + ':pages' }; };
async function readUse(email, start) {
  const k = useKeys(email, start);
  const [p1, p2, pages] = await kvMGet([k.p1, k.p2, k.pages]);
  return { p1: Number(p1) || 0, p2: Number(p2) || 0, pages: Number(pages) || 0 };
}

/* Lo que ve la app: vencimiento y, solo si quedan pocas, cuántas importaciones quedan. */
export async function aiStatus(email, ctx = {}, now = Date.now()) {
  const p = await period(email, ctx, now);
  const u = await readUse(email, p.start);
  const used = p.phase === 1 ? u.p1 : u.p2, cap = capOf(p.phase);
  const pagesLeft = Math.max(0, PAGES_PER_PERIOD - u.pages);
  /* si el presupuesto de páginas se agota antes, manda ese: cada documento usa al menos una página */
  const left = p.expired ? 0 : Math.max(0, Math.min(cap - used, pagesLeft));
  return {
    expired: p.expired, expiresAt: p.expiresAt, admin: Boolean(ctx.admin), phase: p.phase, phaseEnds: p.phase === 1 ? p.firstEnds : new Date(p.end).toISOString(),
    imports: { left, cap, show: !p.expired && left <= SHOW_LEFT_AT },
  };
}

const clampPages = pages => Math.max(1, Math.min(PAGES_PER_DOC, pages | 0 || 1));

/* ¿Se puede mandar un documento a la IA? (sin gastar; para decidir antes de bajar nada) → null o { error, ... } */
export async function checkImport(email, ctx = {}, pages = 1, now = Date.now()) {
  const p = await period(email, ctx, now);
  if (p.expired) return { error: 'ai_expired', expiredAt: p.expiresAt, status: 403 };
  const d = Number(await kvGet(dayKey(email, now))) || 0;
  if (d >= IMPORTS_PER_DAY) return { error: 'limite_diario', limit: IMPORTS_PER_DAY, status: 429 };
  const u = await readUse(email, p.start);
  const used = p.phase === 1 ? u.p1 : u.p2, cap = capOf(p.phase);
  if (used >= cap) return { error: 'limite_periodo', limit: cap, phase: p.phase, renews: p.phase === 1 ? p.firstEnds : null, status: 429 };
  if (u.pages + clampPages(pages) > PAGES_PER_PERIOD) return { error: 'limite_paginas', limit: PAGES_PER_PERIOD, status: 429 };
  return null;
}

/* Reserva una importación (y sus páginas) ANTES de llamar a la IA, con contadores atómicos:
   suma primero y compara después; si se pasó, deshace lo que sumó y frena.
   → { ok: true, ticket, left } o { ok: false, error, status, ... } */
export async function takeImport(email, ctx = {}, pages = 1, now = Date.now()) {
  const p = await period(email, ctx, now);
  if (p.expired) return { ok: false, error: 'ai_expired', expiredAt: p.expiresAt, status: 403 };
  const k = useKeys(email, p.start), dk = dayKey(email, now);
  const pg = clampPages(pages);
  const f = p.phase === 1 ? 'p1' : 'p2', cap = capOf(p.phase);
  /* vive un poco más que el período, por si hay que revisar el uso */
  const ttl = Math.ceil((p.end - now) / 1000) + 30 * 86400;
  const undo = async list => { for (const [key, n] of list) await kvIncrBy(key, -n).catch(() => {}); };
  const d = await kvIncrBy(dk, 1, 60 * 60 * 26);
  if (d > IMPORTS_PER_DAY) { await undo([[dk, 1]]); return { ok: false, error: 'limite_diario', limit: IMPORTS_PER_DAY, status: 429 }; }
  const n = await kvIncrBy(k[f], 1, ttl);
  if (n > cap) { await undo([[k[f], 1], [dk, 1]]); return { ok: false, error: 'limite_periodo', limit: cap, phase: p.phase, renews: p.phase === 1 ? p.firstEnds : null, status: 429 }; }
  const used = await kvIncrBy(k.pages, pg, ttl);
  if (used > PAGES_PER_PERIOD) { await undo([[k.pages, pg], [k[f], 1], [dk, 1]]); return { ok: false, error: 'limite_paginas', limit: PAGES_PER_PERIOD, status: 429 }; }
  const left = Math.max(0, Math.min(cap - n, PAGES_PER_PERIOD - used));
  return { ok: true, ticket: { email: lc(email), k: k.base, fk: k[f], pk: k.pages, dk, f, pages: pg }, left, show: left <= SHOW_LEFT_AT };
}

/* Devoluciones: solo cuando la IA NO cobró (sin respuesta 200), y como mucho REFUNDS_PER_DAY por cuenta y día.
   El contador diario nunca se devuelve. → true si se devolvió. */
export const REFUNDS_PER_DAY = 10;
const refundDayKey = (email, now) => `orbit:petai:refunds:${lc(email)}:${new Date(now).toISOString().slice(0, 10)}`;
export async function allowRefund(email, now = Date.now()) {
  const n = await kvIncrBy(refundDayKey(email, now), 1, 60 * 60 * 26);
  if (n > REFUNDS_PER_DAY) { console.warn('[mimitos] devolución de crédito rechazada: más de ' + REFUNDS_PER_DAY + ' reintentos fallidos hoy'); return false; }
  return true;
}
export async function refundImport(ticket, now = Date.now()) {
  if (!ticket?.fk) return false;
  if (!(await allowRefund(ticket.email, now))) return false;
  await kvIncrBy(ticket.fk, -1);
  await kvIncrBy(ticket.pk, -ticket.pages);
  return true;
}

/* ---------- páginas de un PDF ----------
   countPdfPagesFast es solo una pista (cuenta los /Type /Page a la vista; no ve los object streams y se
   puede falsear): el número que vale es SIEMPRE el de pdf-lib. */
export function countPdfPagesFast(buf) {
  const s = Buffer.from(buf).toString('latin1');
  const m = s.match(/\/Type\s*\/Page(?![a-zA-Z])/g);
  return m ? m.length : 0;
}
async function pdfLib() { return (await import('pdf-lib')).PDFDocument; }

/* Prepara un archivo para la IA: cuenta las páginas con pdf-lib y, si es un PDF de más de 20, arma uno
   nuevo con las primeras 20 (el original queda guardado tal cual). Si pdf-lib no lo puede abrir, no se
   manda: 422 pdf_ilegible ("no pudimos leer el PDF"). → { buf, pages, total, truncated }
   (Pendiente: pdf-lib es sincrónico y no se le puede poner timeout; un PDF hostil solo frena la propia
   función hasta el maxDuration de Vercel.) */
export const PDF_UNREADABLE = 'No pudimos leer el PDF.';
export async function prepareForAI(buf, type) {
  if (type !== 'application/pdf') return { buf, pages: 1, total: 1, truncated: false };
  let doc, total;
  try { const PDFDocument = await pdfLib(); doc = await PDFDocument.load(buf, { ignoreEncryption: true, updateMetadata: false }); total = doc.getPageCount(); }
  catch { throw Object.assign(new Error('pdf_ilegible'), { status: 422, message_es: PDF_UNREADABLE }); }
  if (!total) throw Object.assign(new Error('pdf_ilegible'), { status: 422, message_es: PDF_UNREADABLE });
  if (total <= PAGES_PER_DOC) return { buf, pages: total, total, truncated: false };
  try {
    const PDFDocument = await pdfLib();
    const out = await PDFDocument.create();
    const pages = await out.copyPages(doc, Array.from({ length: PAGES_PER_DOC }, (_, i) => i));
    pages.forEach(p => out.addPage(p));
    return { buf: Buffer.from(await out.save()), pages: PAGES_PER_DOC, total, truncated: true };
  } catch { throw Object.assign(new Error('pdf_no_se_pudo_cortar'), { status: 422 }); }
}
export const TRUNCATED_NOTE = `Leímos las primeras ${PAGES_PER_DOC} páginas; el archivo completo quedó guardado.`;

/* "Avisame cuando pueda renovar": solo guarda el interés, no cobra nada. */
export async function saveRenewInterest(email, now = Date.now()) {
  const e = lc(email);
  await kvSet(`orbit:petrenew:${e}`, { email: e, at: new Date(now).toISOString() });
  const list = (await kvGet(RENEW_LIST)) || [];
  if (!list.some(x => x.email === e)) { list.push({ email: e, at: new Date(now).toISOString() }); await kvSet(RENEW_LIST, list.slice(-5000)); }
  return true;
}
export const renewInterest = async email => Boolean(await kvGet(`orbit:petrenew:${lc(email)}`));
