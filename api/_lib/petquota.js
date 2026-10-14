/* Mimitos · funciones inteligentes: topes internos y vencimiento a 12 meses (aprobado por Majo, 14/10/2026).

   Qué cuenta como "importación inteligente": cualquier documento que se manda a la IA para leerlo
   (foto de la libreta, estudio subido, estudio desde el mail o por link). Una importación = un documento.
   - El crédito se descuenta al mandar el documento a la IA y se devuelve si la llamada falla.
   - Buscar en el mail, filtrar, clasificar, validar links y descartar NO consumen.
   - Topes por período de 12 meses desde la compra: 40 en los primeros 30 días y 180 para el resto
     (lo que no se usa en los primeros 30 días no se pasa). Más un tope diario anti-abuso de 40.
   - Páginas: hasta 20 por documento cuentan como 1 importación; de un PDF más largo se mandan solo las
     primeras 20 (el archivo completo queda guardado). Presupuesto interno de 600 páginas por período.
   - Vencimiento: 12 meses desde la fecha de compra. Vencido, el servidor rechaza con `ai_expired`; la app
     y los datos siguen andando. Las cuentas admin no vencen (el período se renueva cada 12 meses).
   - Nada de esto se muestra salvo cuando quedan ≤ SHOW_LEFT_AT importaciones.

   Preguntale a Mimitos tiene sus propios topes (api/_lib/petask.js): 150 por mes y 30 por día. */
import { kvGet, kvSet } from './kv.js';

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

/* Lo que ve la app: vencimiento y, solo si quedan pocas, cuántas importaciones quedan. */
export async function aiStatus(email, ctx = {}, now = Date.now()) {
  const p = await period(email, ctx, now);
  const u = (await kvGet(useKey(email, p.start))) || {};
  const used = p.phase === 1 ? (u.p1 || 0) : (u.p2 || 0), cap = capOf(p.phase);
  const pagesLeft = Math.max(0, PAGES_PER_PERIOD - (u.pages || 0));
  /* si el presupuesto de páginas se agota antes, manda ese: cada documento usa al menos una página */
  const left = p.expired ? 0 : Math.max(0, Math.min(cap - used, pagesLeft));
  return {
    expired: p.expired, expiresAt: p.expiresAt, admin: Boolean(ctx.admin), phase: p.phase, phaseEnds: p.phase === 1 ? p.firstEnds : new Date(p.end).toISOString(),
    imports: { left, cap, show: !p.expired && left <= SHOW_LEFT_AT },
  };
}

/* ¿Se puede mandar un documento a la IA? (sin gastar) → null o { error, ... } */
export async function checkImport(email, ctx = {}, pages = 1, now = Date.now()) {
  const p = await period(email, ctx, now);
  if (p.expired) return { error: 'ai_expired', expiredAt: p.expiresAt, status: 403 };
  const d = (await kvGet(dayKey(email, now))) || 0;
  if (d >= IMPORTS_PER_DAY) return { error: 'limite_diario', limit: IMPORTS_PER_DAY, status: 429 };
  const u = (await kvGet(useKey(email, p.start))) || {};
  const used = p.phase === 1 ? (u.p1 || 0) : (u.p2 || 0), cap = capOf(p.phase);
  if (used >= cap) return { error: 'limite_periodo', limit: cap, phase: p.phase, renews: p.phase === 1 ? p.firstEnds : null, status: 429 };
  const pg = Math.max(1, Math.min(PAGES_PER_DOC, pages | 0 || 1));
  if ((u.pages || 0) + pg > PAGES_PER_PERIOD) return { error: 'limite_paginas', limit: PAGES_PER_PERIOD, status: 429 };
  return null;
}

/* Descuenta una importación (y sus páginas) justo antes de llamar a la IA.
   → { ok: true, ticket, left } o { ok: false, error, status, ... } */
export async function takeImport(email, ctx = {}, pages = 1, now = Date.now()) {
  const stop = await checkImport(email, ctx, pages, now);
  if (stop) return { ok: false, ...stop };
  const p = await period(email, ctx, now);
  const k = useKey(email, p.start), dk = dayKey(email, now);
  const pg = Math.max(1, Math.min(PAGES_PER_DOC, pages | 0 || 1));
  const u = (await kvGet(k)) || {};
  const f = p.phase === 1 ? 'p1' : 'p2';
  u[f] = (u[f] || 0) + 1; u.pages = (u.pages || 0) + pg;
  /* vive un poco más que el período, por si hay que revisar el uso */
  await kvSet(k, u, Math.ceil((p.end - now) / 1000) + 30 * 86400);
  await kvSet(dk, ((await kvGet(dk)) || 0) + 1, 60 * 60 * 26);
  const left = Math.max(0, Math.min(capOf(p.phase) - u[f], PAGES_PER_PERIOD - u.pages));
  return { ok: true, ticket: { k, dk, f, pages: pg }, left, show: left <= SHOW_LEFT_AT };
}

/* La IA falló: se devuelve la importación y sus páginas. */
export async function refundImport(ticket) {
  if (!ticket) return;
  const u = await kvGet(ticket.k);
  if (u) { u[ticket.f] = Math.max(0, (u[ticket.f] || 0) - 1); u.pages = Math.max(0, (u.pages || 0) - ticket.pages); await kvSet(ticket.k, u, 400 * 86400); }
  const d = await kvGet(ticket.dk);
  if (d) await kvSet(ticket.dk, Math.max(0, d - 1), 60 * 60 * 26);
}

/* ---------- páginas de un PDF, sin librerías: cuenta los objetos /Type /Page ----------
   Es una aproximación: si el PDF guarda sus objetos comprimidos (object streams) no se ven, y ahí se
   le pregunta a pdf-lib, que solo se carga en ese caso o cuando hay que cortar. */
export function countPdfPagesFast(buf) {
  const s = Buffer.from(buf).toString('latin1');
  const m = s.match(/\/Type\s*\/Page(?![a-zA-Z])/g);
  return m ? m.length : 0;
}
async function pdfLib() { return (await import('pdf-lib')).PDFDocument; }

/* Prepara un archivo para la IA: cuenta páginas y, si es un PDF de más de 20, arma uno nuevo con las
   primeras 20 (el original queda guardado tal cual). → { buf, pages, total, truncated } */
export async function prepareForAI(buf, type) {
  if (type !== 'application/pdf') return { buf, pages: 1, total: 1, truncated: false };
  let total = countPdfPagesFast(buf), doc = null;
  if (!total || total > PAGES_PER_DOC) {
    try { const PDFDocument = await pdfLib(); doc = await PDFDocument.load(buf, { ignoreEncryption: true, updateMetadata: false }); total = doc.getPageCount(); }
    catch { if (!total) total = 1; }
  }
  if (total <= PAGES_PER_DOC) return { buf, pages: Math.max(1, total), total: Math.max(1, total), truncated: false };
  if (!doc) throw Object.assign(new Error('pdf_no_se_pudo_cortar'), { status: 422 });
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
