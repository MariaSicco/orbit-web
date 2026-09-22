/* Diagnóstico: qué falta configurar. No expone ninguna clave. */
import { hasKV } from './_lib/kv.js';
import { hasSecret } from './_lib/auth.js';
import { CATALOG, fileUrl } from './_lib/catalog.js';
export default async function handler(req, res) {
  res.status(200).json({
    session: hasSecret(), database: hasKV,
    mercadopago: Boolean(process.env.MP_ACCESS_TOKEN),
    paypal: Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_SECRET),
    paypalEnv: process.env.PAYPAL_ENV || 'sandbox',
    paypalWebhook: Boolean(process.env.PAYPAL_WEBHOOK_ID),
    email: Boolean(process.env.RESEND_API_KEY),
    files: Object.fromEntries(Object.keys(CATALOG).map(id => [id, Boolean(fileUrl(id))])),
  });
}
