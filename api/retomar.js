/* Link del mail "tu pedido quedó sin pagar": arma un pago nuevo para el
   mismo pedido y manda a Mercado Pago. Si ya está pagado, a la biblioteca. */
import { getOrder } from './_lib/orders.js';
import { siteUrl } from './_lib/catalog.js';
import { mpPreference } from './_lib/mp.js';
import { resumeToken } from './_lib/recover.js';

export default async function handler(req, res) {
  const { o, t } = req.query || {};
  const site = siteUrl(req);
  const go = url => { res.statusCode = 302; res.setHeader('Location', url); res.end(); };
  if (!o || t !== resumeToken(String(o))) return go(`${site}/productos`);
  const order = await getOrder(String(o));
  if (!order) return go(`${site}/productos`);
  if (order.status === 'paid') return go(`${site}/biblioteca`);
  const pref = await mpPreference(order, site);
  return go(pref.url || `${site}/productos`);
}
