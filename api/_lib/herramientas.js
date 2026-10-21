/* Herramientas online: productos que no se descargan, se abren en el sitio.
   Un producto es herramienta si en el catálogo del servidor tiene
   `herramienta: '/herramientas/<slug>'`. Acá van las cuentas puras (sin
   sesión ni base), para poder probarlas sin servidor.

   Una app que vive en su propia ruta y controla la compra en su API
   (Mimitos en /mascotas) también puede declarar `herramienta: '/mascotas'`:
   la biblioteca y el email muestran "Abrir", pero api/herramienta.js solo
   sirve lo que está bajo /herramientas/. */

export const SLUG = /^[a-z0-9][a-z0-9-]{0,40}$/;
export const rutaHerramienta = slug => `/herramientas/${slug}`;
/* Ruta interna del sitio: uno o dos segmentos, nada de "//", esquemas ni query. */
export const RUTA = /^\/[a-z0-9-]+(\/[a-z0-9-]+)?$/;
export const herramientaDe = (CAT, id) => {
  const r = CAT?.[id]?.herramienta;
  return typeof r === 'string' && RUTA.test(r) ? r : null;
};

/* Producto dueño de /herramientas/<slug>, o null. */
export function productoPorSlug(CAT, slug) {
  if (!SLUG.test(String(slug || ''))) return null;
  const ruta = rutaHerramienta(slug);
  const e = Object.entries(CAT || {}).find(([, p]) => p?.herramienta === ruta);
  return e ? { id: e[0], ...e[1] } : null;
}

/* Ruta pedida dentro de la herramienta → archivo relativo seguro, o null.
   Vacío = index.html; sin extensión = .html (como cleanUrls). Nada de "..",
   ni archivos ocultos, ni barras raras. */
const SEGMENTO = /^[A-Za-z0-9_-][A-Za-z0-9._-]{0,80}$/;
export function archivoSeguro(path) {
  const crudo = Array.isArray(path) ? path.join('/') : String(path ?? '');
  const partes = crudo.split('/').filter(Boolean);
  if (!partes.length) return 'index.html';
  if (partes.length > 6 || !partes.every(p => SEGMENTO.test(p) && !p.includes('..'))) return null;
  const ultimo = partes[partes.length - 1];
  if (!ultimo.includes('.')) partes[partes.length - 1] = `${ultimo}.html`;
  return partes.join('/');
}

const TIPOS = {
  html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8', json: 'application/json; charset=utf-8', svg: 'image/svg+xml',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', ico: 'image/x-icon',
  woff2: 'font/woff2', wasm: 'application/wasm', webmanifest: 'application/manifest+json', txt: 'text/plain; charset=utf-8', csv: 'text/csv; charset=utf-8',
};
export const tipoDe = archivo => TIPOS[String(archivo).split('.').pop().toLowerCase()] || 'application/octet-stream';

/* Adónde manda el email "Ya es tuyo" y qué dice el botón.
   Solo herramientas, y una sola → directo a la herramienta.
   Solo herramientas, varias → biblioteca, con "Abrir".
   Mezcla con descargas → biblioteca. Solo descargas → como siempre. */
export function destinoComprobante(items, CAT, site) {
  const rutas = (items || []).map(i => herramientaDe(CAT, i.id));
  const hay = rutas.some(Boolean);
  const todas = rutas.length > 0 && rutas.every(Boolean);
  const biblioteca = `${site}/biblioteca`;
  if (todas) {
    const unica = new Set(rutas).size === 1;
    return {
      tipo: 'herramienta', url: unica ? `${site}${rutas[0]}` : biblioteca,
      cta: 'Abrir ahora →', texto: 'Abrilo desde acá',
      preheader: 'Ya podés usarlo.',
    };
  }
  if (hay) {
    return {
      tipo: 'mixto', url: biblioteca,
      cta: 'Ir a mi biblioteca →', texto: 'Descargalo o abrilo desde tu cuenta',
      preheader: 'Ya podés usarlo y descargarlo desde tu cuenta.',
    };
  }
  return {
    tipo: 'descarga', url: biblioteca,
    cta: 'Descargar ahora →', texto: 'Descargalo desde tu cuenta',
    preheader: 'Ya podés descargarlo desde tu cuenta.',
  };
}
