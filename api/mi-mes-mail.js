/* Mi Mes by Orbit · /api/mi-mes-mail — mail conectado por 6 meses (ver api/_lib/mi-mes-mail.js).
   GET  ?accion=estado                  → { encendido, listo:{gmail,outlook}, conexion }
   GET  ?accion=conectar&prov=gmail|outlook → 302 a Google o Microsoft (o vuelve a la app con #mail-<motivo>)
   GET  /mi-mes/mail/:prov?code&state   → (rewrite a ?accion=callback) guarda el permiso y vuelve a la app
   POST ?accion=procesar                → lee el próximo adjunto de la cola (uno por llamada)
   GET  ?accion=bandeja                 → lo leído que espera en el servidor (cifrado) para que la app lo guarde
   POST ?accion=recibido {ids}          → la app ya lo guardó: se borra de la bandeja
   POST ?accion=desconectar             → revoca el permiso (Gmail) y borra todo lo guardado del mail
   Todo pide la sesión de Orbit y la compra de Mi Mes (ob-019), salvo admin. */
import { requireHerramienta, accesoHerramienta } from './_lib/herramienta-acceso.js';
import { readBody } from './_lib/auth.js';
import { getPurchases } from './_lib/kv.js';
import { vigenciaIA, mensajeVencida } from './_lib/mi-mes-ia.js';
import * as MM from './_lib/mi-mes-mail.js';

export const PRODUCTO = 'ob-019';
const APP = '/herramientas/mi-mes';
const responder = (res, code, cuerpo) => { res.setHeader('Cache-Control', 'no-store'); return res.status(code).json(cuerpo); };
const volver = (res, motivo) => { res.setHeader('Cache-Control', 'no-store'); res.statusCode = 302; res.setHeader('Location', `${APP}#mail-${motivo}`); return res.end(); };
const provDe = v => (v === 'gmail' || v === 'outlook' ? v : null);
const MSJ = {
  sin_clave: 'La conexión con el mail todavía no está configurada.',
  mail_vencido: 'Se venció el permiso para leer tu mail. Volvé a conectarlo.',
  mail_limite: 'Tu mail no respondió por ahora. Probamos más tarde.',
  mail_error: 'No pudimos hablar con tu mail. Probamos más tarde.',
};

export default async function handler(req, res) {
  const url = new URL(req.url, 'http://x');
  const accion = url.searchParams.get('accion') || req.query?.accion || 'estado';
  const prov = provDe(url.searchParams.get('prov') || req.query?.prov);

  /* conectar y callback: navegación de página, así que los errores vuelven a la app con un motivo */
  if (accion === 'conectar' || accion === 'callback') {
    const acc = await accesoHerramienta(req, PRODUCTO);
    if (!acc.ok) return volver(res, acc.motivo === 'sin_sesion' ? 'sesion' : 'compra');
    if (!MM.mailEncendido() || !prov) return volver(res, 'apagado');
    const P = MM.PROVEEDORES[prov], cfg = P.config(req);
    if (!cfg.listo || !MM.tokenKey() || (process.env.SESSION_SECRET || '').length < 16) return volver(res, 'apagado');
    if (accion === 'conectar') {
      if (await MM.cupoLleno(prov, acc.email)) return volver(res, 'cupo');
      const { state, challenge } = await MM.crearState(acc.email, prov);
      res.setHeader('Cache-Control', 'no-store'); res.statusCode = 302; res.setHeader('Location', P.authUrl(cfg, state, challenge)); return res.end();
    }
    if (url.searchParams.get('error')) return volver(res, 'cancelado');
    const st = await MM.revisarState(url.searchParams.get('state'), acc.email, prov);
    if (!st) return volver(res, 'error');
    const r = await P.canjear(cfg, url.searchParams.get('code') || '', st.verifier).catch(() => ({ error: 'error' }));
    if (r.error) return volver(res, r.error);
    await MM.conectar(acc.email, prov, r);
    /* la primera búsqueda (6 meses atrás) arranca ya; la lectura la hacen la app y el cron */
    await MM.sincronizar(acc.email).catch(e => console.warn('mi-mes-mail primera búsqueda:', e.code || 'error'));
    return volver(res, 'ok');
  }

  const acc = await requireHerramienta(req, res, PRODUCTO);
  if (!acc) return;
  try {
    if (accion === 'estado' && req.method === 'GET') {
      const c = await MM.leerConexion(acc.email);
      return responder(res, 200, { ok: true, encendido: MM.mailEncendido(), listo: { gmail: MM.gmail.config(req).listo && Boolean(MM.tokenKey()), outlook: MM.outlook.config(req).listo && Boolean(MM.tokenKey()) }, conexion: MM.resumenConexion(c), bandeja: c ? (await MM.leerBandeja(acc.email)).length : 0 });
    }
    if (accion === 'bandeja' && req.method === 'GET') return responder(res, 200, { ok: true, items: await MM.leerBandeja(acc.email) });
    if (req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return responder(res, 405, { ok: false, error: 'Método no permitido.' }); }
    if (accion === 'procesar') {
      const vig = await vigenciaIA(acc, acc.admin ? [] : await getPurchases(acc.email).catch(() => []));
      if (vig.vencida) return responder(res, 403, { ok: false, motivo: 'ia_vencida', error: mensajeVencida(vig.hasta) });
      return responder(res, 200, await MM.procesarUno(acc.email));
    }
    if (accion === 'recibido') { const b = await readBody(req); return responder(res, 200, { ok: true, quedan: await MM.confirmarBandeja(acc.email, b?.ids) }); }
    if (accion === 'desconectar') return responder(res, 200, await MM.desconectar(acc.email));
    return responder(res, 400, { ok: false, error: 'Acción desconocida.' });
  } catch (e) {
    if (e.code === 'mail_vencido') { await MM.desconectar(acc.email).catch(() => {}); return responder(res, 401, { ok: false, motivo: 'vencido', error: MSJ.mail_vencido }); }
    console.warn(JSON.stringify({ evento: 'mi-mes-mail', accion, error: e.code || 'error' }));
    return responder(res, e.status || 502, { ok: false, motivo: e.code || 'error', error: MSJ[e.code] || 'No pudimos completar eso ahora. Probá en un rato.' });
  }
}
