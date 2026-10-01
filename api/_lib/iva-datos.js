/* Datos de Orbit IVA de cada cuenta: empresas, períodos (facturas leídas, conciliaciones), reglas y decisiones.
   Se guardan en Vercel Blob como privados, en una carpeta por cuenta (el nombre sale de un hash del email:
   no expone el email y nadie puede abrirlos con una URL suelta). Las fotos de las facturas NO se guardan.
   Retención: mientras exista la cuenta; la persona puede borrar un período o una empresa cuando quiera.
   Sin Blob configurado (pruebas locales) se guarda en memoria. */
import { put, del } from '@vercel/blob';
import { createHash } from 'node:crypto';
import { blobReady, signedGet } from './blob.js';

export const MAX_BYTES = 4_000_000; // el cuerpo de una función de Vercel no pasa de 4,5 MB
const mem = new Map();
const carpeta = email => `iva-datos/${createHash('sha256').update(String(email).toLowerCase()).digest('hex').slice(0, 40)}`;
export const idValido = id => typeof id === 'string' && /^[a-z0-9-]{3,60}$/i.test(id);
const ruta = (email, doc, id) => (doc === 'estado' ? `${carpeta(email)}/estado.json` : `${carpeta(email)}/periodos/${id}.json`);

export async function leer(email, doc, id) {
  const p = ruta(email, doc, id);
  if (!blobReady()) return mem.has(p) ? JSON.parse(mem.get(p)) : null;
  const url = await signedGet(p, { minutes: 2 });
  const r = await fetch(url, { cache: 'no-store' });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`blob ${r.status}`);
  return r.json();
}

export async function escribir(email, doc, id, datos) {
  const texto = JSON.stringify(datos);
  if (texto.length > MAX_BYTES) return { ok: false, error: 'demasiado_grande' };
  const p = ruta(email, doc, id);
  if (!blobReady()) { mem.set(p, texto); return { ok: true }; }
  await put(p, texto, { access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json' });
  return { ok: true };
}

export async function borrar(email, doc, id) {
  const p = ruta(email, doc, id);
  if (!blobReady()) { mem.delete(p); return; }
  try { await del(p); } catch { /* si no existía, no importa */ }
}
