/* Abre el enlace del email: valida el token, deja la sesión y entra a la biblioteca. */
import { kvGet, kvDel } from '../_lib/kv.js';
import { setSessionCookie } from '../_lib/auth.js';
import { siteUrl } from '../_lib/catalog.js';

export default async function handler(req, res) {
  const site = siteUrl(req);
  const token = req.query?.token;
  if (!token) return res.redirect(302, `${site}/acceso?error=1`);
  const data = await kvGet(`orbit:magic:${token}`);
  if (!data?.email) return res.redirect(302, `${site}/acceso?error=expired`);
  await kvDel(`orbit:magic:${token}`);
  const reset = req.query?.reset === '1';
  setSessionCookie(res, data.email);
  res.redirect(302, reset ? `${site}/cuenta?reset=1` : `${site}/biblioteca`);
}
