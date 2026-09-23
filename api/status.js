/* Diagnóstico: qué falta configurar. No expone ninguna clave. */
import { hasKV } from './_lib/kv.js';
import { hasSecret } from './_lib/auth.js';
import { getCatalog } from './_lib/catalog.js';
import { blobReady, signedPut, newPath } from './_lib/blob.js';
import { FROM } from './_lib/email.js';
export default async function handler(req, res) {
  let CAT = {};
  try { CAT = await getCatalog(); } catch {}
  /* con ?check=blob probamos de verdad que se pueda firmar una subida */
  let archivosProbado = null;
  if (req.query?.check === 'blob' && blobReady()) {
    try { await signedPut(newPath('prueba', 'prueba.txt'), { maxBytes: 1024, minutes: 1 }); archivosProbado = 'ok'; }
    catch (e) { archivosProbado = String(e).slice(0, 160); }
  }
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
    ...(archivosProbado ? { archivosProbado } : {}),
    files: Object.fromEntries(Object.entries(CAT).map(([id, p]) => [id, p.file ? p.fileFrom : false])),
  });
}
