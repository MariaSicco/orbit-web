/* Catálogo del lado del servidor: precios y archivos.
   Los precios en pesos (ARS) se usan en Mercado Pago; USD en PayPal.

   Los valores de acá abajo son el punto de partida. Lo que se edita
   desde el panel de administración se guarda en la base y pisa esto,
   así que no hace falta tocar código para cambiar un precio, publicar
   un producto o cargar el archivo que se descarga. */
import { kvGet, kvSet } from './kv.js';

export const CATALOG = {
  'ob-001': { code: 'OB—001', name: 'Content System',     usd: 39, ars: 39000, foto: 'hands',
    bajada: 'Un sistema completo para planificar, producir y publicar contenido sin empezar de cero.' },
  'ob-002': { code: 'OB—002', name: 'Creator Library',    usd: 49, ars: 49000, foto: 'studio',
    bajada: 'Una biblioteca curada de recursos gráficos listos para usar en proyectos reales.' },
  'ob-003': { code: 'OB—003', name: 'Business OS',        usd: 59, ars: 59000, foto: 'arch',
    bajada: 'El sistema operativo para pequeños negocios: clientes, proyectos, finanzas y procesos en un solo lugar.' },
  'ob-004': { code: 'OB—004', name: 'AI Workflow System', usd: 69, ars: 69000, soon: true, foto: 'corridor',
    bajada: 'Workflows de IA probados para investigar, escribir, diseñar y automatizar con criterio.' },
};

const OVER_KEY = 'orbit:catalog';
export const PRODUCT_IDS = Object.keys(CATALOG);
const envFile = id => process.env[`ORBIT_FILE_${id.toUpperCase().replace(/-/g, '_')}`] || null;
export const envFileName = id => `ORBIT_FILE_${id.toUpperCase().replace(/-/g, '_')}`;

export const getOverrides = async () => (await kvGet(OVER_KEY)) || {};

/* Catálogo efectivo: lo de arriba + lo editado en el panel. */
export async function getCatalog() {
  let over = {};
  try { over = await getOverrides(); } catch { over = {}; }
  const out = {};
  for (const [id, base] of Object.entries(CATALOG)) {
    const o = over[id] || {};
    out[id] = {
      ...base,
      ...(o.name ? { name: String(o.name).slice(0, 80) } : {}),
      ...(Number.isFinite(o.usd) ? { usd: o.usd } : {}),
      ...(Number.isFinite(o.ars) ? { ars: o.ars } : {}),
      ...(typeof o.soon === 'boolean' ? { soon: o.soon } : {}),
      ...(o.tagline ? { tagline: o.tagline } : {}),
      file: o.file || envFile(id) || null,
      fileFrom: o.file ? 'panel' : (envFile(id) ? 'vercel' : null),
    };
  }
  return out;
}

/* Guarda los cambios de un producto. Solo los campos que se pueden editar. */
export async function saveOverride(id, patch = {}) {
  if (!CATALOG[id]) return null;
  const over = await getOverrides();
  const cur = over[id] || {};
  const next = { ...cur };
  if (typeof patch.name === 'string') next.name = patch.name.trim().slice(0, 80) || undefined;
  if (patch.usd !== undefined && patch.usd !== '') next.usd = Math.max(0, Math.round(Number(patch.usd) || 0));
  if (patch.ars !== undefined && patch.ars !== '') next.ars = Math.max(0, Math.round(Number(patch.ars) || 0));
  if (typeof patch.soon === 'boolean') next.soon = patch.soon;
  if (typeof patch.file === 'string') next.file = patch.file.trim().slice(0, 600) || undefined;
  if (patch.tagline && typeof patch.tagline === 'object') {
    /* guardamos solo el idioma que tenga texto: el otro sigue saliendo del sitio */
    const t = {};
    const es = String(patch.tagline.es || '').trim().slice(0, 300);
    const en = String(patch.tagline.en || '').trim().slice(0, 300);
    if (es) t.es = es;
    if (en) t.en = en;
    next.tagline = Object.keys(t).length ? t : undefined;
  }
  for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k];
  over[id] = next;
  await kvSet(OVER_KEY, over);
  return (await getCatalog())[id];
}

export async function fileUrlFor(id) {
  const c = await getCatalog();
  return c[id]?.file || null;
}
/* Compatibilidad: solo mira las variables de entorno. */
export const fileUrl = id => envFile(id);
export const siteUrl = req => process.env.SITE_URL || `https://${req.headers['x-forwarded-host'] || req.headers.host}`;
