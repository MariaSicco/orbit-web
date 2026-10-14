/* Vencimientos de la Casa · GET /api/correo-config
   Devuelve los IDs de cliente OAuth de Google y Microsoft para "Buscar en mi mail".
   No son secretos (viajan igual al navegador en el login); viven en variables de
   entorno para no tocarlos en código. Sin ID, la app muestra la opción como "pronto". */
export default function handler(req, res) {
  res.setHeader('Cache-Control', 'public, max-age=300');
  const limpio = v => (typeof v === 'string' && /^[\w.\-]{10,200}$/.test(v.trim()) ? v.trim() : null);
  res.status(200).json({
    google: limpio(process.env.GOOGLE_OAUTH_CLIENT_ID),
    microsoft: limpio(process.env.MS_OAUTH_CLIENT_ID),
  });
}
