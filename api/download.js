/* Descarga: solo si la sesión compró ese producto.
   Si el archivo está en Vercel Blob (privado), firmamos una URL que
   vive unos minutos. Si es una URL pegada a mano, redirigimos a ella. */
import { readSession } from './_lib/auth.js';
import { getPurchases } from './_lib/kv.js';
import { fileUrlFor, envFileName } from './_lib/catalog.js';
import { isBlobRef, refPath, signedGet } from './_lib/blob.js';

export default async function handler(req, res) {
  const s = readSession(req);
  if (!s) return res.status(401).json({ error: 'unauthorized' });
  const id = String(req.query?.id || '');
  const purchases = await getPurchases(s.email);
  if (!purchases.some(p => p.productId === id)) return res.status(403).json({ error: 'not_purchased' });

  const file = await fileUrlFor(id);
  if (!file) return res.status(503).json({ error: 'file_not_configured', message: `Falta cargar el archivo de ${id} (panel de administración o ${envFileName(id)})` });

  /* con ?url=1 devolvemos el destino en JSON: así el navegador pide el
     archivo una sola vez, en vez de gastar la URL firmada verificando. */
  const soloUrl = req.query?.url === '1';

  if (isBlobRef(file)) {
    try {
      const url = await signedGet(refPath(file));
      return soloUrl ? res.status(200).json({ ok: true, url }) : res.redirect(302, url);
    } catch (e) {
      return res.status(500).json({ error: 'no_pudimos_firmar', detail: String(e).slice(0, 200) });
    }
  }
  return soloUrl ? res.status(200).json({ ok: true, url: file }) : res.redirect(302, file);
}
