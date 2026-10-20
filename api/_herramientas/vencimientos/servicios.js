/* Servicios y vencimientos típicos de una casa en Argentina, para cargar con un toque.
   La frecuencia es la habitual; el usuario la confirma con su factura.
   tipo 'tramite' = vence pero no tiene monto fijo (VTV, licencia, matafuegos).
   `color` es solo para el monograma (no son logos de las empresas). */

/* Categorías pensadas para la casa (como agrupan Rocket Money, Copilot o Monarch):
   por en qué se va la plata, no por cómo se paga. Color para la barra del inicio. */
export const CATEGORIAS = [
  { id: 'Casa', icono: 'casa', color: '#E9B949' },
  { id: 'Luz, gas y agua', icono: 'rayo', color: '#3047FF' },
  { id: 'Internet y celular', icono: 'wifi', color: '#5FC4E8' },
  { id: 'Entretenimiento', icono: 'play', color: '#FF4F2E' },
  { id: 'Apps y trabajo', icono: 'chispa', color: '#D9FF45' },
  { id: 'Educación', icono: 'gorro', color: '#9B7BFF' },
  { id: 'Salud y bienestar', icono: 'escudo', color: '#3CC488' },
  { id: 'Auto', icono: 'auto', color: '#A8A49B' },
  { id: 'Impuestos', icono: 'edificio', color: '#C77D5B' },
  { id: 'Tarjetas', icono: 'tarjeta', color: '#F2EFE8' },
  { id: 'Trámites', icono: 'doc', color: '#D4C27A' },
  { id: 'Otros', icono: 'punto', color: '#8C8A84' },
];
export const colorCategoria = id => (CATEGORIAS.find(c => c.id === id) || CATEGORIAS.at(-1)).color;

const PRESET_CAT = {
  'Luz, gas y agua': ['edenor', 'edesur', 'epec', 'edelap', 'luz', 'metrogas', 'naturgy', 'camuzzi', 'ecogas', 'gas', 'garrafa', 'aysa', 'absa', 'agua'],
  'Internet y celular': ['internet', 'celular'],
  Entretenimiento: ['cable', 'netflix', 'spotify', 'disney', 'max', 'prime', 'paramount', 'crunchyroll', 'youtube', 'meli'],
  'Apps y trabajo': ['chatgpt', 'm365', 'icloud', 'google-one'],
  Casa: ['alquiler', 'expensas', 'hipoteca', 'seguro-hogar', 'limpieza'],
  'Salud y bienestar': ['prepaga', 'seguro-vida', 'gimnasio'],
  Auto: ['seguro-auto', 'cochera', 'peaje', 'patente'],
  Impuestos: ['abl', 'inmobiliario', 'tasa-municipal', 'monotributo', 'autonomos', 'ganancias'],
  Educación: ['colegio'],
  Trámites: ['vtv', 'licencia', 'cedula', 'matafuegos', 'tanque', 'caldera', 'aire', 'dni', 'pasaporte', 'vacunas'],
};
const CAT_DE_PRESET = Object.fromEntries(Object.entries(PRESET_CAT).flatMap(([c, ids]) => ids.map(id => [id, c])));
const VIEJAS = { Vivienda: 'Casa', Servicios: 'Luz, gas y agua', Conectividad: 'Internet y celular', 'Salud y seguros': 'Salud y bienestar', Suscripciones: 'Entretenimiento' };
const RE_EDU = /universidad|facultad|colegio|escuela|instituto|\.edu|palermo|\buba\b|\butn\b|curso|udemy|coursera|platzi|domestika|crehana/i;
const RE_APPS = /anthropic|claude|openai|chatgpt|\bmake\b|runway|magnific|artlist|canva|adobe|figma|notion|github|vercel|google|apple|icloud|microsoft|dropbox|zoom|slack|capcut|envato|freepik|midjourney|elevenlabs|higgsfield|cursor|framer|webflow|shopify|hostinger|godaddy|wix|semrush|ahrefs|linkedin|grammarly|perplexity|lovable|replit/i;
const RE_ENT = /netflix|spotify|disney|hbo|\bmax\b|prime|paramount|crunchy|youtube|deezer|tidal|twitch|playstation|xbox|steam|nintendo|club/i;

/* Categoría (nueva) de una cuenta: respeta la que eligió la persona, salvo las genéricas viejas. */
export function categoriaDe(c) {
  const n = String(c.nombre || '');
  if (c.categoria === 'Tarjetas' || /^tarjeta\b/i.test(n)) return 'Tarjetas';
  if (c.preset && CAT_DE_PRESET[c.preset]) return CAT_DE_PRESET[c.preset];
  const generica = !c.categoria || ['Suscripciones', 'Otros', 'Servicios'].includes(c.categoria);
  if (generica && RE_EDU.test(n)) return 'Educación';
  if (generica && RE_APPS.test(n)) return 'Apps y trabajo';
  if (generica && RE_ENT.test(n)) return 'Entretenimiento';
  if (VIEJAS[c.categoria]) return VIEJAS[c.categoria];
  return CATEGORIAS.some(x => x.id === c.categoria) ? c.categoria : 'Otros';
}


const S = (id, nombre, categoria, frecuencia, extra = {}) => ({ id, nombre, categoria, frecuencia, ...extra });

/* Precios de lista de suscripciones, tomados de las páginas oficiales para Argentina.
   `final: false` = la página dice "+ impuestos": sumamos IVA 21 % (servicios digitales);
   según la provincia puede haber además Ingresos Brutos, por eso se muestra como "≈".
   Revisar cada mes: los precios cambian seguido. */
export const PRECIOS = { fecha: '2026-10-13', nota: 'Precio de lista de la página oficial al 13/10/2026. Puede variar con impuestos de tu provincia.' };
const IVA = 1.21;
const plan = (nombre, lista, final = false) => ({ nombre, monto: Math.round((final ? lista : lista * IVA)) * 100, lista: lista * 100, final });

export const SERVICIOS = [
  // Servicios
  S('edenor', 'Edenor', 'Servicios', 1, { color: '#3047FF', ayuda: 'Luz · factura mensual' }),
  S('edesur', 'Edesur', 'Servicios', 1, { color: '#FF4F2E', ayuda: 'Luz · factura mensual' }),
  S('epec', 'EPEC', 'Servicios', 1, { color: '#3047FF', ayuda: 'Luz · Córdoba' }),
  S('edelap', 'Edelap', 'Servicios', 1, { color: '#3047FF', ayuda: 'Luz · La Plata' }),
  S('luz', 'Luz', 'Servicios', 1, { color: '#3047FF', ayuda: 'Otra distribuidora' }),
  S('metrogas', 'Metrogas', 'Servicios', 1, { color: '#0D0D0E', ayuda: 'Gas' }),
  S('naturgy', 'Naturgy', 'Servicios', 1, { color: '#FF4F2E', ayuda: 'Gas' }),
  S('camuzzi', 'Camuzzi', 'Servicios', 1, { color: '#3047FF', ayuda: 'Gas' }),
  S('ecogas', 'Ecogas', 'Servicios', 1, { color: '#0D0D0E', ayuda: 'Gas · Centro y Cuyo' }),
  S('gas', 'Gas', 'Servicios', 1, { color: '#0D0D0E', ayuda: 'Otra distribuidora' }),
  S('garrafa', 'Garrafa', 'Servicios', 1, { color: '#FF4F2E', ayuda: 'Compra recurrente' }),
  S('aysa', 'AySA', 'Servicios', 1, { color: '#3047FF', ayuda: 'Agua · con 2º vencimiento', segundoVto: 7 }),
  S('absa', 'ABSA', 'Servicios', 2, { color: '#3047FF', ayuda: 'Agua · Provincia de Buenos Aires' }),
  S('agua', 'Agua', 'Servicios', 2, { color: '#3047FF', ayuda: 'Otra prestadora' }),
  // Impuestos
  S('abl', 'ABL', 'Impuestos', 1, { color: '#0D0D0E', ayuda: 'CABA · el pago anual suele tener descuento', habil: true }),
  S('inmobiliario', 'Inmobiliario ARBA', 'Impuestos', 2, { color: '#0D0D0E', ayuda: 'Provincia · revisá la boleta (hay pago anual)', habil: true }),
  S('tasa-municipal', 'Tasa municipal', 'Impuestos', 1, { color: '#0D0D0E', ayuda: 'Alumbrado, barrido y limpieza', habil: true }),
  S('patente', 'Patente', 'Impuestos', 1, { color: '#FF4F2E', ayuda: 'ARBA: cuotas de marzo a diciembre', habil: true }),
  S('monotributo', 'Monotributo', 'Impuestos', 1, { color: '#3047FF', ayuda: 'ARCA · día 20 o el hábil siguiente', habil: true }),
  S('autonomos', 'Autónomos', 'Impuestos', 1, { color: '#3047FF', ayuda: 'ARCA', habil: true }),
  S('ganancias', 'Ganancias / Bienes Personales', 'Impuestos', 12, { color: '#3047FF', ayuda: 'Declaración anual' }),
  // Vivienda
  S('alquiler', 'Alquiler', 'Vivienda', 1, { color: '#0D0D0E', ayuda: 'Con aviso de ajuste', ajuste: 3 }),
  S('expensas', 'Expensas', 'Vivienda', 1, { color: '#0D0D0E' }),
  S('hipoteca', 'Cuota de la hipoteca', 'Vivienda', 1, { color: '#0D0D0E' }),
  S('seguro-hogar', 'Seguro del hogar', 'Vivienda', 1, { color: '#3047FF' }),
  S('limpieza', 'Personal de limpieza', 'Vivienda', 1, { color: '#0D0D0E' }),
  // Auto
  S('seguro-auto', 'Seguro del auto', 'Auto', 1, { color: '#3047FF' }),
  S('cochera', 'Cochera', 'Auto', 1, { color: '#0D0D0E' }),
  S('peaje', 'Telepeaje', 'Auto', 1, { color: '#FF4F2E', ayuda: 'AUSA, AUBASA…' }),
  S('vtv', 'VTV', 'Trámites', 12, { color: '#D9FF45', tipo: 'tramite', ayuda: 'El mes depende de la patente' }),
  S('licencia', 'Licencia de conducir', 'Trámites', 60, { color: '#D9FF45', tipo: 'tramite', ayuda: 'Revisá la fecha en la licencia' }),
  S('cedula', 'Cédula del auto', 'Trámites', 0, { color: '#D9FF45', tipo: 'tramite' }),
  // Salud y seguros
  S('prepaga', 'Prepaga', 'Salud y seguros', 1, { color: '#3047FF', ayuda: 'OSDE, Swiss Medical, Galeno…' }),
  S('seguro-vida', 'Seguro de vida', 'Salud y seguros', 1, { color: '#3047FF' }),
  // Conectividad
  S('internet', 'Internet', 'Conectividad', 1, { color: '#3047FF', ayuda: 'Fibertel, Telecentro, Movistar…' }),
  S('celular', 'Celular', 'Conectividad', 1, { color: '#3047FF', ayuda: 'Personal, Claro, Movistar' }),
  S('cable', 'Cable / TV', 'Conectividad', 1, { color: '#0D0D0E', ayuda: 'DirecTV, Flow, Telecentro' }),
  // Suscripciones
  S('netflix', 'Netflix', 'Suscripciones', 1, { color: '#FF4F2E', debito: true, fuente: 'netflix.com/ar',
    planes: [plan('Básico', 8999), plan('Estándar', 14999), plan('Premium', 19999)] }),
  S('spotify', 'Spotify', 'Suscripciones', 1, { color: '#0D0D0E', debito: true, fuente: 'spotify.com/ar/premium',
    planes: [plan('Individual', 4499), plan('Duo', 5999), plan('Familiar', 7599), plan('Estudiantes', 2299)] }),
  S('disney', 'Disney+', 'Suscripciones', 1, { color: '#3047FF', debito: true, fuente: 'disneyplus.com/es-ar',
    planes: [plan('Con anuncios', 9999, true), plan('Estándar', 12999, true), plan('Premium', 19999, true)] }),
  S('max', 'Max', 'Suscripciones', 1, { color: '#3047FF', debito: true }),
  S('youtube', 'YouTube Premium', 'Suscripciones', 1, { color: '#FF4F2E', debito: true }),
  S('icloud', 'iCloud', 'Suscripciones', 1, { color: '#0D0D0E', debito: true }),
  S('google-one', 'Google One', 'Suscripciones', 1, { color: '#3047FF', debito: true }),
  S('prime', 'Prime Video', 'Suscripciones', 1, { color: '#3047FF', debito: true }),
  S('paramount', 'Paramount+', 'Suscripciones', 1, { color: '#3047FF', debito: true }),
  S('crunchyroll', 'Crunchyroll', 'Suscripciones', 1, { color: '#FF4F2E', debito: true }),
  S('chatgpt', 'ChatGPT', 'Suscripciones', 1, { color: '#0D0D0E', debito: true }),
  S('m365', 'Microsoft 365', 'Suscripciones', 1, { color: '#3047FF', debito: true }),
  S('meli', 'Meli+', 'Suscripciones', 1, { color: '#D9FF45', debito: true }),
  S('gimnasio', 'Gimnasio', 'Suscripciones', 1, { color: '#D9FF45' }),
  S('colegio', 'Cuota del colegio', 'Otros', 1, { color: '#3047FF' }),
  // Trámites de la casa
  S('matafuegos', 'Carga del matafuegos', 'Trámites', 12, { color: '#D9FF45', tipo: 'tramite' }),
  S('tanque', 'Limpieza del tanque de agua', 'Trámites', 6, { color: '#D9FF45', tipo: 'tramite' }),
  S('caldera', 'Service de caldera o calefón', 'Trámites', 12, { color: '#D9FF45', tipo: 'tramite' }),
  S('aire', 'Service del aire acondicionado', 'Trámites', 12, { color: '#D9FF45', tipo: 'tramite' }),
  S('dni', 'DNI', 'Trámites', 0, { color: '#D9FF45', tipo: 'tramite', ayuda: 'Fecha de vencimiento en el DNI' }),
  S('pasaporte', 'Pasaporte', 'Trámites', 0, { color: '#D9FF45', tipo: 'tramite' }),
  S('vacunas', 'Vacunas de la mascota', 'Trámites', 12, { color: '#D9FF45', tipo: 'tramite' }),
];

/* Ícono de cada cuenta: por servicio, y si no, por categoría. */
const ICONO_SERVICIO = {
  edenor: 'rayo', edesur: 'rayo', epec: 'rayo', edelap: 'rayo', luz: 'rayo',
  metrogas: 'llama', naturgy: 'llama', camuzzi: 'llama', ecogas: 'llama', gas: 'llama', garrafa: 'llama', caldera: 'llama',
  aysa: 'gota', absa: 'gota', agua: 'gota', tanque: 'gota',
  internet: 'wifi', celular: 'celu', cable: 'tv',
  netflix: 'play', disney: 'play', max: 'play', prime: 'play', paramount: 'play', crunchyroll: 'play', youtube: 'play',
  spotify: 'nota', icloud: 'nube', 'google-one': 'nube', chatgpt: 'chispa', m365: 'doc', meli: 'chispa',
  gimnasio: 'pesa', colegio: 'gorro', patente: 'auto', 'seguro-auto': 'auto', cochera: 'auto', peaje: 'auto', vtv: 'auto', licencia: 'auto', cedula: 'auto',
  prepaga: 'escudo', 'seguro-vida': 'escudo', 'seguro-hogar': 'casa', alquiler: 'casa', expensas: 'casa', hipoteca: 'casa', limpieza: 'casa',
};
const ICONO_CATEGORIA = Object.fromEntries(CATEGORIAS.map(c => [c.id, c.icono]));
export function iconoDe(c) {
  if (c.preset && ICONO_SERVICIO[c.preset]) return ICONO_SERVICIO[c.preset];
  const n = String(c.nombre || '').toLowerCase();
  if (/tarjeta|visa|master|amex/.test(n)) return 'tarjeta';
  if (/expensa|alquiler|consorcio/.test(n)) return 'casa';
  if (/universidad|facultad|colegio|escuela|palermo|uba|curso/.test(n)) return 'gorro';
  if (/luz|electric/.test(n)) return 'rayo';
  if (/agua/.test(n)) return 'gota';
  if (/\bgas\b/.test(n)) return 'llama';
  return ICONO_CATEGORIA[c.categoria] || 'punto';
}

for (const sv of SERVICIOS) sv.categoria = categoriaDe({ preset: sv.id, nombre: sv.nombre, categoria: sv.categoria });

/* Los que aparecen primero en el primer uso: lo que casi toda casa paga. */
export const PRIMER_USO = ['edenor', 'edesur', 'metrogas', 'naturgy', 'aysa', 'abl', 'expensas', 'alquiler', 'internet', 'celular', 'prepaga', 'seguro-auto', 'patente', 'vtv', 'netflix', 'spotify', 'disney', 'monotributo'];

export const servicio = id => SERVICIOS.find(s => s.id === id) || null;

/* Monograma: hasta 2 letras. "Edenor" → "ED", "Seguro del auto" → "SA". */
export function monograma(nombre) {
  const p = String(nombre || '?').replace(/[^\p{L}\p{N} ]/gu, ' ').split(/\s+/).filter(w => w && !/^(de|del|la|el|las|los|y|o)$/i.test(w));
  if (!p.length) return '?';
  return (p.length === 1 ? p[0].slice(0, 2) : p[0][0] + p[1][0]).toUpperCase();
}

/* Color de texto que contrasta con el fondo del monograma. */
/* Tinta clara u oscura según lo claro que sea el fondo (luminancia relativa). */
export function tintaSobre(color) {
  const m = /^#([0-9a-f]{6})$/i.exec(color || '');
  if (!m) return '#F2EFE8';
  const [r, g, b] = [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16) / 255).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.32 ? '#0D0D0E' : '#F2EFE8';
}
