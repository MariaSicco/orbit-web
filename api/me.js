/* Devuelve la sesión y las compras de esa persona. */
import { readSession, hasSecret } from './_lib/auth.js';
import { getPurchases, hasKV } from './_lib/kv.js';
import { CATALOG, fileUrl } from './_lib/catalog.js';

export default async function handler(req, res) {
  if (!hasSecret()) return res.status(503).json({ error: 'not_configured', configured: { session: false, kv: hasKV } });
  const s = readSession(req);
  if (!s) return res.status(401).json({ error: 'unauthorized' });
  const purchases = await getPurchases(s.email);
  res.status(200).json({
    email: s.email,
    purchases: purchases.map(p => ({ ...p, name: CATALOG[p.productId]?.name, code: CATALOG[p.productId]?.code, downloadable: Boolean(fileUrl(p.productId)) })),
  });
}
