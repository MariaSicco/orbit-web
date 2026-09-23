/* Le da al panel una URL firmada para subir el archivo de un producto.
   El archivo viaja del navegador a Vercel Blob sin pasar por acá. */
import { requireAdmin } from '../_lib/admin.js';
import { readBody } from '../_lib/auth.js';
import { blobReady, newPath, signedPut, makeRef } from '../_lib/blob.js';
import { CATALOG } from '../_lib/catalog.js';

const MAX = 2 * 1024 * 1024 * 1024; /* 2 GB */

export default async function handler(req, res) {
  const s = requireAdmin(req, res); if (!s) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  if (!blobReady()) return res.status(503).json({ error: 'blob_no_configurado' });

  const { id, filename, size } = await readBody(req);
  if (!CATALOG[id]) return res.status(400).json({ error: 'producto_desconocido' });
  if (Number(size) > MAX) return res.status(413).json({ error: 'archivo_muy_grande' });

  const pathname = newPath(id, filename);
  try {
    const url = await signedPut(pathname, { maxBytes: MAX });
    res.status(200).json({ ok: true, url, pathname, ref: makeRef(pathname) });
  } catch (e) {
    res.status(500).json({ error: 'no_pudimos_firmar', detail: String(e).slice(0, 200) });
  }
}
