/* Ficha de producto con vista previa propia.
   La página se arma con JavaScript, así que Google y WhatsApp no veían
   nada al compartir el enlace. Acá servimos la misma página pero con el
   título, la descripción y la imagen ya escritos en el HTML. */
import { getCatalog, siteUrl } from './_lib/catalog.js';

const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export default async function handler(req, res) {
  const site = siteUrl(req);
  const id = String(req.query?.id || '').toLowerCase();
  const CAT = await getCatalog().catch(() => ({}));
  const p = CAT[id];
  if (!p) return res.redirect(302, `${site}/productos`);

  let html;
  try {
    const r = await fetch(`${site}/producto.html`);
    if (!r.ok) throw new Error(String(r.status));
    html = await r.text();
  } catch {
    return res.redirect(302, `${site}/producto.html?id=${encodeURIComponent(id)}`);
  }

  const titulo = `${p.code} ${p.name} — Orbit®`;
  const bajada = p.tagline?.es || p.bajada || `${p.name}, un sistema digital de Orbit.`;
  const imagen = `${site}/assets/img/${p.foto || 'landing'}.jpg`;
  const canonica = `${site}/p/${id}`;

  const meta = `
<link rel="canonical" href="${esc(canonica)}">
<meta property="og:type" content="product">
<meta property="og:site_name" content="Orbit®">
<meta property="og:locale" content="es_AR">
<meta property="og:url" content="${esc(canonica)}">
<meta property="og:title" content="${esc(titulo)}">
<meta property="og:description" content="${esc(bajada)}">
<meta property="og:image" content="${esc(imagen)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(titulo)}">
<meta name="twitter:description" content="${esc(bajada)}">
<meta name="twitter:image" content="${esc(imagen)}">
<script>window.ORBIT_ID=${JSON.stringify(id)}</script>
`;

  /* La página se sirve en /p/<id>, una carpeta más abajo, así que todas
     las rutas relativas —estilos, scripts y los enlaces que arma el
     JavaScript— dejarían de resolver. <base> las ancla a la raíz. */
  html = html
    .replace('<head>', '<head>\n<base href="/">')
    .replace(/href="#/g, `href="/p/${id}#`)
    .replace(/<title>.*?<\/title>/, `<title>${esc(titulo)}</title>`)
    .replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${esc(bajada)}">`)
    .replace('<meta name="theme-color"', meta + '<meta name="theme-color"');

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=86400');
  res.status(200).send(html);
}
