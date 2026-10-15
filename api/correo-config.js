/* Vencimientos de la Casa · GET /api/correo-config
   Devuelve los IDs de cliente OAuth de Google y Microsoft para "Buscar en mi mail".
   No son secretos (viajan igual al navegador en el login); viven en variables de
   entorno para no tocarlos en código. Sin ID, la app muestra la opción como "pronto". */
export default function handler(req, res) {
  res.setHeader('Cache-Control', 'public, max-age=300');
  const limpio = v => (typeof v === 'string' && /^[\w.\-]{10,200}$/.test(v.trim()) ? v.trim() : null);
  /* Por defecto, los mismos clientes que "Conectar tu mail" de Mimitos (GOOGLE_CLIENT_ID / MS_CLIENT_ID):
     un cliente OAuth sirve para las dos apps si tiene autorizado este origen (Google) y
     la URI de esta página como SPA (Microsoft). Los *_OAUTH_* permiten separarlos si hace falta. */
  res.status(200).json({
    google: limpio(process.env.GOOGLE_OAUTH_CLIENT_ID) || limpio(process.env.GOOGLE_CLIENT_ID),
    microsoft: limpio(process.env.MS_OAUTH_CLIENT_ID) || limpio(process.env.MS_CLIENT_ID),
  });
}
