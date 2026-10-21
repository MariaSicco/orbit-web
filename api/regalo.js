/* /regalo/<llave>: abre la herramienta regalada con la sesión de esa cuenta ya iniciada.
   Si la llave no existe (o se reemplazó por una nueva), avisa y no inicia nada. */
import { leerLlave } from './_lib/regalos.js';
import { setSessionCookie, hasSecret } from './_lib/auth.js';
import { getPurchases } from './_lib/kv.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Referrer-Policy', 'no-referrer');
  const r = hasSecret() ? await leerLlave(req.query?.t).catch(() => null) : null;
  const sigue = r && (await getPurchases(r.email).catch(() => [])).some(p => p.productId === r.productId);
  if (!sigue) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(404).send('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Orbit</title><body style="font:16px/1.5 system-ui;background:#F2EFE8;color:#0D0D0E;padding:48px 24px;max-width:520px;margin:auto"><h1 style="font-size:24px">Este link ya no funciona.</h1><p>Pedile a quien te lo pasó uno nuevo.</p></body>');
  }
  setSessionCookie(res, r.email, r.name);
  return res.redirect(302, r.ruta);
}
