/* Archivos de los productos en Vercel Blob.

   Se guardan como privados: nadie puede abrirlos con la URL suelta.
   Para subir, el panel pide una URL firmada y el archivo viaja del
   navegador a Vercel sin pasar por nuestras funciones (así no hay
   límite de tamaño). Para descargar, /api/download firma una URL que
   vive unos minutos y solo se la da a quien compró el producto. */
import { issueSignedToken, presignUrl } from '@vercel/blob';
import { randomBytes } from 'node:crypto';

export const blobReady = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);

/* Cómo guardamos la referencia en el catálogo: blob:<ruta dentro del store> */
export const BLOB_PREFIX = 'blob:';
export const isBlobRef = v => typeof v === 'string' && v.startsWith(BLOB_PREFIX);
export const refPath = v => String(v).slice(BLOB_PREFIX.length);
export const makeRef = pathname => BLOB_PREFIX + pathname;

const limpio = n => String(n || 'archivo')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^A-Za-z0-9._-]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(-90) || 'archivo';

export const newPath = (id, filename) =>
  `productos/${limpio(id)}/${randomBytes(6).toString('hex')}-${limpio(filename)}`;

/* URL para que el navegador suba el archivo directo. */
export async function signedPut(pathname, { maxBytes, minutes = 60 } = {}) {
  const validUntil = Date.now() + minutes * 60 * 1000;
  const token = await issueSignedToken({ pathname, operations: ['put'], validUntil, ...(maxBytes ? { maximumSizeInBytes: maxBytes } : {}) });
  const { presignedUrl } = await presignUrl(token, {
    operation: 'put', pathname, access: 'private',
    addRandomSuffix: false, allowOverwrite: true,
    ...(maxBytes ? { maximumSizeInBytes: maxBytes } : {}),
  });
  return presignedUrl;
}

/* URL de descarga de un solo uso práctico: vence enseguida. */
export async function signedGet(pathname, { minutes = 15 } = {}) {
  const validUntil = Date.now() + minutes * 60 * 1000;
  const token = await issueSignedToken({ pathname, operations: ['get'], validUntil });
  const { presignedUrl } = await presignUrl(token, { operation: 'get', pathname, access: 'private', validUntil });
  return presignedUrl;
}
