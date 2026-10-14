/* Vencimientos de la Casa · casa compartida.
   Por defecto los datos viven solo en el teléfono. Si alguien activa "Compartir la casa",
   la casa pasa a guardarse en Orbit (base de Vercel) para que la vean y la editen las
   personas que esa persona invite (pareja, convivientes, familia). Cada una entra con su
   cuenta de Orbit; no hace falta que compre: la licencia es de la casa.

   GET                         → { ok, casa: null | { id, rev, doc, miembros, soyDueno, yo } }
   GET  ?unirse=<token>        → link de invitación: une a la casa y lleva a la app
   POST {accion:'crear', doc}  → crea la casa con los datos del teléfono (solo quien compró)
   POST {accion:'guardar', doc, rev} → guarda; 409 con la versión del servidor si cambió
   POST {accion:'invitar'}     → { link } válido 7 días, un solo uso
   POST {accion:'nombre', nombre} → cómo te ven los demás ("Majo")
   POST {accion:'salir'}       → dejás de ver la casa (si sos quien la creó, se cierra para todos)
   POST {accion:'quitar', email} → quien la creó saca a alguien */
import { readSession, readBody, newToken } from './_lib/auth.js';
import { kvGet, kvSet, kvDel } from './_lib/kv.js';
import { requireHerramienta, accesoExtraKey } from './_lib/herramienta-acceso.js';
import { migrar } from './_herramientas/vencimientos/calculos.js';

export const PRODUCTO = 'ob-021';
export const MAX_DOC = 400_000;          // bytes de JSON por casa
export const MAX_MIEMBROS = 6;
const DIAS_INVITACION = 7;

const kCasa = id => `orbit:vencimientos:casa:${id}`;
const kUsuario = email => `orbit:vencimientos:usuario:${String(email).toLowerCase()}`;
const kInvitacion = t => `orbit:vencimientos:invitacion:${t}`;

const responder = (res, code, cuerpo) => { res.setHeader('Cache-Control', 'no-store'); return res.status(code).json(cuerpo); };
const nombreDe = email => String(email).split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).slice(0, 24);
const vista = (casa, email) => ({
  id: casa.id, rev: casa.rev, doc: casa.doc, soyDueno: casa.dueno === email, yo: casa.miembros.find(m => m.email === email) || null,
  miembros: casa.miembros.map(m => ({ nombre: m.nombre, email: m.email, dueno: m.email === casa.dueno, desde: m.desde })),
});

async function casaDe(email) {
  const id = await kvGet(kUsuario(email));
  if (!id) return null;
  const casa = await kvGet(kCasa(id));
  if (!casa || !casa.miembros.some(m => m.email === email)) { await kvDel(kUsuario(email)); return null; }
  return casa;
}
function docValido(doc) {
  if (!doc || typeof doc !== 'object' || !Array.isArray(doc.cuentas)) return null;
  const limpio = migrar(doc);
  delete limpio.ejemplo;
  return JSON.stringify(limpio).length <= MAX_DOC ? limpio : null;
}

/* Página mínima para quien abre la invitación sin sesión. */
function paginaEntrar(res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).send(`<!doctype html><html lang="es-AR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Te invitaron a una casa · Orbit</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#F2EFE8;color:#0D0D0E;font:16px/1.5 system-ui,sans-serif;padding:24px}main{max-width:380px;text-align:center}h1{font-size:30px;line-height:1;letter-spacing:-.03em;text-transform:uppercase;margin:0 0 12px}ol{text-align:left;padding-left:20px}a{display:inline-block;margin-top:12px;background:#3047FF;color:#F2EFE8;padding:14px 22px;border-radius:14px;font-weight:600;text-decoration:none}small{display:block;color:#5E5C57;margin-top:14px}</style></head>
<body><main><h1>Te invitaron a una casa</h1><p>Alguien te sumó a su casa en <b>Vencimientos de la Casa</b>, para ver y marcar juntos lo que vence.</p>
<ol><li>Entrá con tu cuenta de Orbit, o creala gratis.</li><li>Volvé a tocar el link que te mandaron.</li></ol>
<a href="/acceso">Entrar o crear mi cuenta</a><small>La invitación vale ${DIAS_INVITACION} días.</small></main></body></html>`);
}

export default async function handler(req, res) {
  const unirse = String(req.query?.unirse || '');
  if (req.method === 'GET' && unirse) return unirseConLink(req, res, unirse);

  if (req.method !== 'GET' && req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return responder(res, 405, { ok: false, error: 'Método no permitido.' }); }
  const acc = await requireHerramienta(req, res, PRODUCTO);
  if (!acc) return;
  const email = acc.email;

  try {
    if (req.method === 'GET') {
      const casa = await casaDe(email);
      return responder(res, 200, { ok: true, casa: casa ? vista(casa, email) : null });
    }
    const body = await readBody(req);
    const accion = String(body?.accion || '');

    if (accion === 'crear') {
      if (acc.invitado) return responder(res, 403, { ok: false, error: 'Solo quien compró la app puede crear una casa compartida.' });
      if (await casaDe(email)) return responder(res, 409, { ok: false, motivo: 'ya', error: 'Ya tenés una casa compartida.' });
      const doc = docValido(body.doc);
      if (!doc) return responder(res, 413, { ok: false, error: 'Los datos son demasiado grandes o no tienen el formato esperado.' });
      const casa = { id: newToken().slice(0, 16), rev: 1, doc, dueno: email, creada: new Date().toISOString(),
        miembros: [{ email, nombre: String(body.nombre || '').trim().slice(0, 24) || nombreDe(email), desde: new Date().toISOString() }] };
      await kvSet(kCasa(casa.id), casa);
      await kvSet(kUsuario(email), casa.id);
      return responder(res, 200, { ok: true, casa: vista(casa, email) });
    }

    const casa = await casaDe(email);
    if (!casa) return responder(res, 404, { ok: false, motivo: 'sin_casa', error: 'No estás en ninguna casa compartida.' });

    if (accion === 'guardar') {
      const doc = docValido(body.doc);
      if (!doc) return responder(res, 413, { ok: false, error: 'Los datos son demasiado grandes o no tienen el formato esperado.' });
      if (Number(body.rev) !== casa.rev) return responder(res, 409, { ok: false, motivo: 'cambio', casa: vista(casa, email) });
      casa.doc = doc; casa.rev += 1; casa.editada = new Date().toISOString(); casa.editadaPor = email;
      await kvSet(kCasa(casa.id), casa);
      return responder(res, 200, { ok: true, rev: casa.rev });
    }
    if (accion === 'invitar') {
      if (casa.miembros.length >= MAX_MIEMBROS) return responder(res, 409, { ok: false, error: `Una casa puede tener hasta ${MAX_MIEMBROS} personas.` });
      const token = newToken();
      await kvSet(kInvitacion(token), { casa: casa.id, de: email }, DIAS_INVITACION * 86400);
      const base = `https://${req.headers['x-forwarded-host'] || req.headers.host}`;
      return responder(res, 200, { ok: true, link: `${base}/api/vencimientos-casa?unirse=${token}`, dias: DIAS_INVITACION });
    }
    if (accion === 'nombre') {
      const m = casa.miembros.find(x => x.email === email);
      m.nombre = String(body.nombre || '').trim().slice(0, 24) || nombreDe(email);
      await kvSet(kCasa(casa.id), casa);
      return responder(res, 200, { ok: true, casa: vista(casa, email) });
    }
    if (accion === 'quitar') {
      if (casa.dueno !== email) return responder(res, 403, { ok: false, error: 'Solo quien creó la casa puede sacar a alguien.' });
      const quien = String(body.email || '').toLowerCase();
      if (quien === email) return responder(res, 400, { ok: false, error: 'Para cerrar la casa usá "Dejar de compartir".' });
      casa.miembros = casa.miembros.filter(m => m.email !== quien);
      await kvSet(kCasa(casa.id), casa);
      await kvDel(kUsuario(quien));
      await kvDel(accesoExtraKey(PRODUCTO, quien));
      return responder(res, 200, { ok: true, casa: vista(casa, email) });
    }
    if (accion === 'salir') {
      if (casa.dueno === email) {
        /* quien la creó cierra la casa para todos: cada uno se queda con su copia en el teléfono */
        for (const m of casa.miembros) { await kvDel(kUsuario(m.email)); if (m.email !== email) await kvDel(accesoExtraKey(PRODUCTO, m.email)); }
        await kvDel(kCasa(casa.id));
      } else {
        casa.miembros = casa.miembros.filter(m => m.email !== email);
        await kvSet(kCasa(casa.id), casa);
        await kvDel(kUsuario(email));
        await kvDel(accesoExtraKey(PRODUCTO, email));
      }
      return responder(res, 200, { ok: true });
    }
    return responder(res, 400, { ok: false, error: 'Acción desconocida.' });
  } catch (e) {
    console.warn(JSON.stringify({ evento: 'vencimientos-casa', error: e?.message || 'desconocido' }));
    return responder(res, 503, { ok: false, error: 'No pudimos conectar con la casa compartida. Probá de nuevo en un rato.' });
  }
}

async function unirseConLink(req, res, token) {
  const s = readSession(req);
  if (!s) return paginaEntrar(res);
  const email = s.email;
  const inv = await kvGet(kInvitacion(token));
  const volver = motivo => { res.setHeader('Cache-Control', 'no-store'); return res.redirect(302, `/herramientas/vencimientos#casa-${motivo}`); };
  if (!inv) return volver('vencida');
  const casa = await kvGet(kCasa(inv.casa));
  if (!casa) return volver('vencida');
  if (!casa.miembros.some(m => m.email === email)) {
    const otra = await kvGet(kUsuario(email));
    if (otra && otra !== casa.id) return volver('otra');
    if (casa.miembros.length >= MAX_MIEMBROS) return volver('llena');
    casa.miembros.push({ email, nombre: nombreDe(email), desde: new Date().toISOString() });
    await kvSet(kCasa(casa.id), casa);
  }
  await kvSet(kUsuario(email), casa.id);
  await kvSet(accesoExtraKey(PRODUCTO, email), { casa: casa.id, desde: new Date().toISOString() });
  await kvDel(kInvitacion(token));
  return volver('unida');
}
