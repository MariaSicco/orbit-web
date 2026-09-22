/* Sesión, compras y pedidos de esa persona. */
import { readSession, hasSecret } from './_lib/auth.js';
import { getPurchases, hasKV } from './_lib/kv.js';
import { listOrders } from './_lib/orders.js';
import { getCatalog } from './_lib/catalog.js';
import { getUser } from './_lib/users.js';
import { isAdmin } from './_lib/admin.js';

export default async function handler(req, res) {
  if (!hasSecret()) return res.status(503).json({ error: 'not_configured', configured: { session: false, kv: hasKV } });
  const s = readSession(req);
  if (!s) return res.status(401).json({ error: 'unauthorized' });
  const [purchases, orders, user, CAT] = await Promise.all([getPurchases(s.email), listOrders(s.email), getUser(s.email), getCatalog()]);
  res.status(200).json({
    email: s.email,
    admin: isAdmin(s.email),
    name: user?.name || '',
    hasPassword: Boolean(user?.hash),
    news: Boolean(user?.news),
    memberSince: user?.createdAt || null,
    purchases: purchases.map(p => ({ ...p, name: CAT[p.productId]?.name, code: CAT[p.productId]?.code, downloadable: Boolean(CAT[p.productId]?.file) })),
    orders,
  });
}
