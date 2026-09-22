/* Abre el enlace del email: valida el token, deja la sesión y entra al panel.
   Si el enlace era de recuperación, habilita 15 minutos para definir contraseña nueva. */
import { kvGet, kvDel, kvSet } from '../_lib/kv.js';
import { setSessionCookie } from '../_lib/auth.js';
import { siteUrl } from '../_lib/catalog.js';
import { getUser } from '../_lib/users.js';

export default async function handler(req, res) {
  const site = siteUrl(req);
  const token = req.query?.token;
  if (!token) return res.redirect(302, `${site}/acceso?error=1`);
  const data = await kvGet(`orbit:magic:${token}`);
  if (!data?.email) return res.redirect(302, `${site}/acceso?error=expired`);
  await kvDel(`orbit:magic:${token}`);
  const reset = data.reset === true || req.query?.reset === '1';
  const user = await getUser(data.email);
  setSessionCookie(res, data.email, user?.name);
  if (reset) await kvSet(`orbit:reset:${data.email}`, { at: Date.now() }, 60 * 15);
  res.redirect(302, reset ? `${site}/biblioteca?reset=1` : `${site}/biblioteca`);
}
