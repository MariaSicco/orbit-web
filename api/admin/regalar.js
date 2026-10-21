/* Regalar una herramienta online desde el panel, con un link personal que deja a la persona adentro.
   POST { email, name?, productId? }
   - Suma la compra a esa cuenta (via 'regalo', importe 0): no cuenta como venta en los informes.
   - Si el producto trae lecturas con IA (Orbit IVA), las acredita una sola vez.
   - Devuelve el link /regalo/<llave>: al abrirlo, inicia la sesión de esa cuenta y abre la herramienta.
     No hace falta crear cuenta ni contraseña. El link se puede abrir las veces que quiera.
   - Regalar de nuevo al mismo email genera un link nuevo y el anterior deja de andar (si se filtró).
   - No manda ningún mail: el link lo pasa quien regala. */
import { requireAdmin } from '../_lib/admin.js';
import { readBody, cleanEmail, isEmail } from '../_lib/auth.js';
import { getUser, saveUser } from '../_lib/users.js';
import { addPurchase, getPurchases } from '../_lib/kv.js';
import { getCatalog, siteUrl } from '../_lib/catalog.js';
import { herramientaDe } from '../_lib/herramientas.js';
import { acreditar, saldo } from '../_lib/creditos.js';
import { crearLlave } from '../_lib/regalos.js';
import { randomBytes } from 'node:crypto';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const s = requireAdmin(req, res); if (!s) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const body = await readBody(req);
  const email = cleanEmail(body.email);
  const productId = String(body.productId || 'ob-005');
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 80) : '';
  if (!isEmail(email)) return res.status(400).json({ error: 'invalid_email' });

  const CAT = await getCatalog();
  const prod = CAT[productId];
  const ruta = herramientaDe(CAT, productId);
  if (!prod || !ruta) return res.status(400).json({ error: 'no_es_herramienta' });

  // La cuenta existe aunque no tenga contraseña: si algún día quiere entrar por /acceso, se la crea ahí.
  const user = await getUser(email);
  if (!user) await saveUser({ email, name, news: false, createdAt: new Date().toISOString(), regalo: true });
  else if (name && !user.name) await saveUser({ ...user, name });

  const ya = (await getPurchases(email)).some(p => p.productId === productId);
  if (!ya) {
    const ref = `regalo-${randomBytes(5).toString('hex')}`;
    await addPurchase(email, { productId, orderId: `${ref}:${productId}`, via: 'regalo', amount: 0, currency: 'ARS', date: new Date().toISOString(), regaloDe: s.email });
    if (prod.creditos) await acreditar(email, prod.creditos, `${ref}:${productId}`);
  }

  const llave = await crearLlave({ email, productId, ruta: productId === 'ob-005' ? `${ruta}#calculadora` : ruta, name: name || user?.name || '', de: s.email });
  res.status(200).json({ ok: true, email, producto: prod.name, link: `${siteUrl(req)}/regalo/${llave}`, yaTenia: ya, lecturas: await saldo(email) });
}
