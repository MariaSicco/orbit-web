/* Descarga: solo si la sesión compró ese producto. */
import { readSession } from './_lib/auth.js';
import { getPurchases } from './_lib/kv.js';
import { fileUrl } from './_lib/catalog.js';

export default async function handler(req, res) {
  const s = readSession(req);
  if (!s) return res.status(401).json({ error: 'unauthorized' });
  const id = String(req.query?.id || '');
  const purchases = await getPurchases(s.email);
  if (!purchases.some(p => p.productId === id)) return res.status(403).json({ error: 'not_purchased' });
  const url = fileUrl(id);
  if (!url) return res.status(503).json({ error: 'file_not_configured', message: `Falta la variable ORBIT_FILE_${id.toUpperCase().replace(/-/g,'_')}` });
  res.redirect(302, url);
}
