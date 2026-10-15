/* Herramientas online: /herramientas/<slug>/<archivo> llega acá por rewrite.
   Valida sesión + compra (o admin) y recién ahí devuelve el archivo.
   Los archivos viven en api/_herramientas/<slug>/: lo que está en api/ no se
   sirve como estático, así que no hay otra ruta para bajarlos sin comprar. */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getCatalog } from './_lib/catalog.js';
import { productoPorSlug, archivoSeguro, tipoDe } from './_lib/herramientas.js';
import { accesoHerramienta, destinoSinAcceso } from './_lib/herramienta-acceso.js';

export const BASE = join(process.cwd(), 'api', '_herramientas');

const noEncontrado = res => res.status(404).send('No encontramos esa herramienta.');

export default async function handler(req, res) {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Cache-Control', 'private, no-store');

  const slug = String(req.query?.slug || '').toLowerCase();
  const CAT = await getCatalog().catch(() => ({}));
  const prod = productoPorSlug(CAT, slug);
  if (!prod) return noEncontrado(res);

  const acc = await accesoHerramienta(req, prod.id);
  if (!acc.ok) {
    if (acc.status === 503) return res.status(503).send(acc.error);
    return res.redirect(302, destinoSinAcceso(acc, prod.id));
  }

  const archivo = archivoSeguro(req.query?.path);
  if (!archivo) return noEncontrado(res);
  let datos;
  try { datos = await readFile(join(BASE, slug, archivo)); }
  catch { return noEncontrado(res); }
  res.setHeader('Content-Type', tipoDe(archivo));
  /* el service worker controla /herramientas/<slug> (sin barra final), un nivel más arriba que su archivo */
  if (archivo === 'sw.js') res.setHeader('Service-Worker-Allowed', `/herramientas/${slug}`);
  return res.status(200).send(datos);
}
