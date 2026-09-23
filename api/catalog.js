/* Parche público del catálogo.
   El sitio carga primero assets/js/products.js (que siempre funciona) y
   después este script, que aplica encima lo editado en el panel:
   nombre, precio, estado y bajada. Si esta respuesta falla, el sitio
   sigue andando con los valores del archivo. */
import { CATALOG, getOverrides } from './_lib/catalog.js';

export default async function handler(req, res) {
  let over = {};
  try { over = await getOverrides(); } catch { over = {}; }

  const patch = {};
  for (const [id, o] of Object.entries(over)) {
    if (!CATALOG[id] || !o) continue;
    const p = {};
    if (o.name) p.name = String(o.name);
    if (Number.isFinite(o.usd)) p.price = o.usd;
    if (typeof o.soon === 'boolean') p.status = o.soon ? 'soon' : 'available';
    if (o.tagline && (o.tagline.es || o.tagline.en)) p.tagline = o.tagline;
    if (Object.keys(p).length) patch[id] = p;
  }

  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=20, s-maxage=60, stale-while-revalidate=300');
  /* PayPal solo se ofrece si está en producción: en modo prueba el botón
     mandaría al comprador a sandbox.paypal.com, donde no puede pagar. */
  const paypalListo = Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_SECRET && process.env.PAYPAL_ENV === 'live');

  res.status(200).send(
    `window.ORBIT_PAYPAL=${paypalListo};` +
    `(function(){var p=${JSON.stringify(patch)},L=window.ORBIT_PRODUCTS||[];` +
    `for(var i=0;i<L.length;i++){var o=p[L[i].id];if(!o)continue;` +
    `for(var k in o){if(k==='tagline'){L[i].tagline=Object.assign({},L[i].tagline,o.tagline)}else{L[i][k]=o[k]}}}})();`
  );
}
