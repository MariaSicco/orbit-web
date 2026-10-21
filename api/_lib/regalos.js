/* Links de regalo: una llave larga y al azar que inicia la sesión de una cuenta y abre una herramienta.
   Una llave vigente por cuenta y producto: crear una nueva anula la anterior. */
import { randomBytes } from 'node:crypto';
import { kvGet, kvSet, kvDel } from './kv.js';

const llaveKey = t => `orbit:regalo:${t}`;
const actualKey = (email, productId) => `orbit:regalo:actual:${email.toLowerCase()}:${productId}`;
export const LLAVE = /^[A-Za-z0-9_-]{32,64}$/;

export async function crearLlave({ email, productId, ruta, name, de }) {
  const anterior = await kvGet(actualKey(email, productId));
  if (anterior) await kvDel(llaveKey(anterior));
  const t = randomBytes(24).toString('base64url');
  await kvSet(llaveKey(t), { email: email.toLowerCase(), productId, ruta, name, de, creada: new Date().toISOString() });
  await kvSet(actualKey(email, productId), t);
  return t;
}

export async function leerLlave(t) {
  if (!LLAVE.test(String(t || ''))) return null;
  return kvGet(llaveKey(t));
}
