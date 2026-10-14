/* Servicios y vencimientos típicos de una casa en Argentina, para cargar con un toque.
   La frecuencia es la habitual; el usuario la confirma con su factura.
   tipo 'tramite' = vence pero no tiene monto fijo (VTV, licencia, matafuegos).
   `color` es solo para el monograma (no son logos de las empresas). */

export const CATEGORIAS = [
  { id: 'Servicios', icono: 'rayo' },
  { id: 'Impuestos', icono: 'edificio' },
  { id: 'Vivienda', icono: 'casa' },
  { id: 'Auto', icono: 'auto' },
  { id: 'Salud y seguros', icono: 'escudo' },
  { id: 'Conectividad', icono: 'wifi' },
  { id: 'Suscripciones', icono: 'play' },
  { id: 'Trámites', icono: 'doc' },
  { id: 'Otros', icono: 'punto' },
];

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
export const tintaSobre = color => (/^#(D9FF45|F2EFE8)$/i.test(color) ? '#0D0D0E' : '#F2EFE8');
