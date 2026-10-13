/* Mi Mes by Orbit · /api/mi-mes-avisos (compra de ob-019 o admin)
   GET     → { publicKey, activo, tarjetas } para el botón "Activar avisos".
   POST    { accion: 'activar', sub, tarjetas }  guarda la suscripción del celu y las fechas.
   POST    { accion: 'sincronizar', tarjetas }   actualiza solo las fechas (si ya activó).
   DELETE  { endpoint? }  con endpoint saca ese celu; sin endpoint borra TODO lo de la cuenta.
   Lo que se guarda pasa por limpiarTarjetasAvisos: nombre, fechas y dólares sí/no. Sin montos. */
import { requireHerramienta } from './_lib/herramienta-acceso.js';
import { getVapid, leerAvisos, guardarAvisos, borrarAvisos, limpiarSub } from './_lib/mi-mes-avisos.js';
import { limpiarTarjetasAvisos } from './_herramientas/mi-mes/calculos.js';

const responder = (res, code, cuerpo) => { res.setHeader('Cache-Control', 'no-store'); return res.status(code).json(cuerpo); };
const cuerpo = req => (typeof req.body === 'string' ? (() => { try { return JSON.parse(req.body); } catch { return {}; } })() : req.body || {});

export default async function handler(req, res) {
  if (!['GET', 'POST', 'DELETE'].includes(req.method)) { res.setHeader('Allow', 'GET, POST, DELETE'); return responder(res, 405, { ok: false }); }
  const acc = await requireHerramienta(req, res, 'ob-019');
  if (!acc) return;
  try {
    if (req.method === 'GET') {
      const [v, n] = await Promise.all([getVapid(), leerAvisos(acc.email)]);
      return responder(res, 200, { ok: true, publicKey: v.publicKey, activo: n.subs.length > 0, tarjetas: n.tarjetas.length });
    }
    const b = cuerpo(req);
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
      n.tarjetas = limpiarTarjetasAvisos(b.tarjetas);
      await guardarAvisos(n);
      return responder(res, 200, { ok: true, activo: true, tarjetas: n.tarjetas.length });
    }
    if (b.accion === 'sincronizar') {
      if (!n.subs.length) return responder(res, 200, { ok: true, activo: false });
      n.tarjetas = limpiarTarjetasAvisos(b.tarjetas);
      await guardarAvisos(n);
      return responder(res, 200, { ok: true, activo: true, tarjetas: n.tarjetas.length });
    }
    return responder(res, 400, { ok: false, error: 'Acción desconocida.' });
  } catch {
    return responder(res, 503, { ok: false, error: 'No pudimos guardar los avisos ahora. Probá en un rato.' });
  }
}
