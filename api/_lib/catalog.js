/* Catálogo del lado del servidor: precios y archivos.
   Los precios en pesos (ARS) se usan en Mercado Pago; USD en PayPal.

   Los valores de acá abajo son el punto de partida. Lo que se edita
   desde el panel de administración se guarda en la base y pisa esto,
   así que no hace falta tocar código para cambiar un precio, publicar
   un producto o cargar el archivo que se descarga. */
import { kvGet, kvSet } from './kv.js';

export const CATALOG = {
  /* Drop 3 · Cocina para vender */
  'ob-012': { code: 'OB—012', name: 'Postres para vender',            usd: 4, ars: 5990, foto: 'studio',
    bajada: '40 postres que se venden y una calculadora que te dice a cuánto venderlos.' },
  'ob-014': { code: 'OB—014', name: 'Salados para vender',            usd: 4, ars: 4990, foto: 'studio',
    bajada: '40 salados que se venden y un cotizador que te dice cuánto cobrar cada evento.' },
  'ob-015': { code: 'OB—015', name: 'Tardes sin pantalla',            usd: 6, ars: 8990, foto: 'studio',
    bajada: '120 actividades para imprimir que los chicos de 4 a 7 años hacen solos, sin pantallas.' },
  'ob-016': { code: 'OB—016', name: 'Primeras letras',                usd: 4, ars: 4990, foto: 'studio',
    bajada: '55 actividades para empezar a leer y escribir en imprenta mayúscula.' },
  'ob-017': { code: 'OB—017', name: 'Comandos eléctricos',            usd: 9, ars: 12990, foto: 'studio',
    bajada: '25 diagramas de comando verificados y una calculadora que te arma la lista de materiales del tablero.' },
  /* Drop 1 · Fleteros */
  'ob-006': { code: 'OB—006', name: 'Tarifador de fletes',            usd: 10, ars: 14999, foto: 'arch',
    bajada: 'Cargá el viaje y sabé en un minuto cuánto cobrar y cuánto ganás.' },
  'ob-007': { code: 'OB—007', name: 'Sistema de costos y tarifas',    usd: 49, ars: 74999, foto: 'arch',
    bajada: 'Sabé cuánto te cuesta cada km de cada camión y qué cliente te hace ganar.' },
  'ob-008': { code: 'OB—008', name: 'Control de viajes y cobranzas',  usd: 19, ars: 28999, foto: 'arch',
    bajada: 'Cada viaje registrado, cada peso cobrado. Sabé quién te debe y desde cuándo.' },
  /* Drop 2 · Abogados */
  'ob-009': { code: 'OB—009', name: 'Agenda de vencimientos',         usd: 10, ars: 14999, foto: 'corridor',
    bajada: 'Tus vencimientos en un solo lugar, con días hábiles ya contados.' },
  'ob-010': { code: 'OB—010', name: 'Sistema de gestión del estudio', usd: 49, ars: 74999, foto: 'corridor',
    bajada: 'Casos, clientes, audiencias, tareas y honorarios en un solo tablero de Notion.' },
  'ob-011': { code: 'OB—011', name: 'Control de honorarios',          usd: 19, ars: 28999, foto: 'corridor',
    bajada: 'Sabé cuánto te deben, quién y cuándo vas a cobrar.' },
  'ob-005': { code: 'OB—005', name: 'Orbit IVA',          usd: 79, ars: 79000, soon: true, foto: 'ob-005',
    bajada: 'Dos herramientas para cerrar el IVA del mes: arma el Libro de Compras desde las facturas y cruza tu sistema con ARCA.' },
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
