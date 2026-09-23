/* Diagnóstico: qué falta configurar. No expone ninguna clave. */
import { hasKV } from './_lib/kv.js';
import { hasSecret } from './_lib/auth.js';
import { getCatalog } from './_lib/catalog.js';
import { blobReady, signedPut, signedGet, newPath, borrarPrueba } from './_lib/blob.js';
import { createHash } from 'node:crypto';
import { FROM } from './_lib/email.js';
export default async function handler(req, res) {
  let CAT = {};
  try { CAT = await getCatalog(); } catch {}
  /* con ?check=blob hacemos el recorrido completo: firmar, subir, leer y borrar */
  let archivosProbado = null;
  if (req.query?.check === 'blob' && blobReady()) {
    const ruta = newPath('prueba', 'prueba.txt');
    try {
      /* subimos bytes binarios de verdad y comparamos el resultado byte a byte */
      const bytes = new Uint8Array(64 * 1024);
      for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 31 + 7) & 0xff;
      const hash = b => createHash('sha256').update(b).digest('hex').slice(0, 16);
      const url = await signedPut(ruta, { maxBytes: 1024 * 1024, minutes: 2 });
      const put = await fetch(url, { method: 'PUT', headers: { 'content-type': 'application/zip' }, body: bytes });
      if (!put.ok) throw new Error(`subida ${put.status} ${(await put.text()).slice(0, 120)}`);
      /* la misma URL firmada, usada dos veces seguidas: así sabemos si
         se gasta en el primer uso, que es lo que rompía la descarga */
      const urlGet = await signedGet(ruta, { minutes: 2 });
      const uno = await fetch(urlGet);
      const vuelta = new Uint8Array(await uno.arrayBuffer());
      const dos = await fetch(urlGet);
      const vuelta2 = new Uint8Array(await dos.arrayBuffer());
      await borrarPrueba(ruta);
      archivosProbado = {
        subidos: bytes.length,
        primerUso: { estado: uno.status, bytes: vuelta.length, iguales: hash(bytes) === hash(vuelta), tipo: uno.headers.get('content-type') },
        segundoUso: { estado: dos.status, bytes: vuelta2.length, iguales: hash(bytes) === hash(vuelta2) },
      };
    } catch (e) {
      archivosProbado = String(e).slice(0, 200);
      await borrarPrueba(ruta);
    }
  }
  /* con ?check=mp decimos si el token de Mercado Pago es de prueba o de
     producción, y a qué cuenta pertenece. Nunca devolvemos el token. */
  let mp = null;
  const mpToken = process.env.MP_ACCESS_TOKEN || '';
  if (req.query?.check === 'mp' && mpToken) {
    mp = { modo: mpToken.startsWith('TEST-') ? 'prueba' : 'produccion' };
    try {
      const r = await fetch('https://api.mercadopago.com/users/me', { headers: { Authorization: `Bearer ${mpToken}` } });
      const u = await r.json();
      if (r.ok) {
        mp.cuenta = u.nickname || null;
        mp.pais = u.site_id || null;
        mp.email = u.email || null;
        mp.esUsuarioDePrueba = String(u.nickname || '').toUpperCase().startsWith('TEST');
      } else {
        mp.error = `${r.status} ${String(u.message || '').slice(0, 120)}`;
      }
    } catch (e) { mp.error = String(e).slice(0, 120); }
  }

  res.status(200).json({
    session: hasSecret(), database: hasKV,
    mercadopago: Boolean(process.env.MP_ACCESS_TOKEN),
    ...(mp ? { mp } : {}),
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
