/* Diagnóstico: qué falta configurar. No expone ninguna clave. */
import { hasKV } from './_lib/kv.js';
import { hasSecret } from './_lib/auth.js';
import { getCatalog } from './_lib/catalog.js';
import { blobReady } from './_lib/blob.js';
import { FROM } from './_lib/email.js';
export default async function handler(req, res) {
  let CAT = {};
  try { CAT = await getCatalog(); } catch {}
  res.status(200).json({
    session: hasSecret(), database: hasKV,
    mercadopago: Boolean(process.env.MP_ACCESS_TOKEN),
    paypal: Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_SECRET),
    paypalEnv: process.env.PAYPAL_ENV || 'sandbox',
    paypalWebhook: Boolean(process.env.PAYPAL_WEBHOOK_ID),
    email: Boolean(process.env.BREVO_API_KEY || process.env.RESEND_API_KEY),
    emailVia: process.env.BREVO_API_KEY ? 'brevo' : (process.env.RESEND_API_KEY ? 'resend' : null),
    emailFrom: FROM(),
    listas: { clientes: Boolean(process.env.BREVO_LIST_CLIENTES), newsletter: Boolean(process.env.BREVO_LIST_NEWSLETTER) },
    admin: Boolean(process.env.ADMIN_EMAILS),
    archivos: blobReady(),
    files: Object.fromEntries(Object.entries(CAT).map(([id, p]) => [id, p.file ? p.fileFrom : false])),
  });
}
