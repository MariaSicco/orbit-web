/* Vencimientos de la Casa · /api/vencimientos-avisos (compra de ob-021, invitación a una casa o admin)
   GET     → { publicKey, activo }
   POST    { accion: 'activar', sub, items, dias }  guarda la suscripción del celu y lo que vence.
   POST    { accion: 'sincronizar', items, dias }   actualiza solo lo que vence (si ya activó).
   POST    { accion: 'probar' }  manda ya una notificación de prueba a los celus de la cuenta.
   DELETE  { endpoint? }  con endpoint saca ese celu; sin endpoint borra todo lo de la cuenta.
   Se guarda nombre de la cuenta, fecha, casa y si es trámite o débito. Sin montos. */
import { requireHerramienta } from './_lib/herramienta-acceso.js';
import { readBody } from './_lib/auth.js';
import { getVapid, leerAvisos, guardarAvisos, borrarAvisos, limpiarSub, limpiarItems, limpiarDias, mandarPush, hoyAR } from './_lib/vencimientos-avisos.js';

const responder = (res, code, cuerpo) => { res.setHeader('Cache-Control', 'no-store'); return res.status(code).json(cuerpo); };

export default async function handler(req, res) {
  if (!['GET', 'POST', 'DELETE'].includes(req.method)) { res.setHeader('Allow', 'GET, POST, DELETE'); return responder(res, 405, { ok: false }); }
  const acc = await requireHerramienta(req, res, 'ob-021');
  if (!acc) return;
  try {
    if (req.method === 'GET') {
      const [v, n] = await Promise.all([getVapid(), leerAvisos(acc.email)]);
      return responder(res, 200, { ok: true, publicKey: v.publicKey, activo: n.subs.length > 0 });
    }
    const b = (await readBody(req)) || {};
    if (req.method === 'DELETE') {
      if (b.endpoint) {
        const n = await leerAvisos(acc.email);
        n.subs = n.subs.filter(s => s.endpoint !== b.endpoint);
        if (n.subs.length) { await guardarAvisos(n); return responder(res, 200, { ok: true, borrado: 'dispositivo' }); }
      }
      await borrarAvisos(acc.email);
      return responder(res, 200, { ok: true, borrado: 'todo' });
    }
    const n = await leerAvisos(acc.email);
    if (b.accion === 'activar') {
      const sub = limpiarSub(b.sub);
      if (!sub) return responder(res, 400, { ok: false, error: 'No pudimos activar los avisos en este navegador.' });
      n.subs = [...n.subs.filter(s => s.endpoint !== sub.endpoint), sub].slice(-5);
      n.items = limpiarItems(b.items); n.dias = limpiarDias(b.dias);
      await guardarAvisos(n);
      return responder(res, 200, { ok: true, activo: true, items: n.items.length });
    }
    if (b.accion === 'sincronizar') {
      if (!n.subs.length) return responder(res, 200, { ok: true, activo: false });
      n.items = limpiarItems(b.items); n.dias = limpiarDias(b.dias);
      await guardarAvisos(n);
      return responder(res, 200, { ok: true, activo: true, items: n.items.length });
    }
    if (b.accion === 'probar') {
      if (!n.subs.length) return responder(res, 409, { ok: false, error: 'Primero activá las notificaciones.' });
      const prox = n.items.find(x => x.v >= hoyAR());
      const enviados = await mandarPush(n, { title: 'Así te vamos a avisar', body: prox ? `Por ejemplo: vence ${prox.v.slice(8)}/${prox.v.slice(5, 7)}: ${prox.n}.` : 'Antes de cada vencimiento, a las 9.', url: '/herramientas/vencimientos', tag: `prueba|${Date.now()}` });
      return responder(res, 200, { ok: true, enviados });
    }
    return responder(res, 400, { ok: false, error: 'Acción desconocida.' });
  } catch {
    return responder(res, 503, { ok: false, error: 'No pudimos guardar los avisos ahora. Probá en un rato.' });
  }
}
