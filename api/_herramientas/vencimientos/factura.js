/* Vencimientos de la Casa · "Leer factura": esquema de la lectura y cómo se
   convierte en una propuesta para la app. Lo usan el servidor (validar lo que
   devuelve Claude) y el navegador (pantalla "revisá lo que leí"). Sin DOM. */
import { SERVICIOS, CATEGORIAS } from './servicios.js';
import { esFecha, difDias } from './calculos.js';

export const SERVICIO_IDS = [...SERVICIOS.map(s => s.id), 'otro'];
export const CATEGORIA_IDS = CATEGORIAS.map(c => c.id);
export const CAMPOS_DUDA = ['vencimiento', 'monto', 'empresa', 'periodo', 'moneda', 'otro'];

const FECHA = { anyOf: [{ type: 'string', format: 'date' }, { type: 'null' }] };
const NUM = { anyOf: [{ type: 'number' }, { type: 'null' }] };

/* Lo que se le pide a Claude. Sin titular, dirección, CUIT ni n.º de cliente. */
export const ESQUEMA = {
  type: 'object', additionalProperties: false,
  required: ['empresa', 'servicio', 'categoria', 'periodo', 'vencimientos', 'moneda', 'frecuencia', 'cuota', 'debitoAutomatico', 'proximoVencimiento', 'confianza', 'dudas', 'avisos'],
  properties: {
    empresa: { type: 'string' },
    servicio: { type: 'string', enum: SERVICIO_IDS },
    categoria: { type: 'string', enum: CATEGORIA_IDS },
    periodo: { type: 'object', additionalProperties: false, required: ['desde', 'hasta'], properties: { desde: FECHA, hasta: FECHA } },
    vencimientos: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['fecha', 'monto'], properties: { fecha: FECHA, monto: NUM } } },
    moneda: { type: 'string', enum: ['ARS', 'USD'] },
    frecuencia: { anyOf: [{ type: 'integer' }, { type: 'null' }] },
    cuota: { anyOf: [{ type: 'object', additionalProperties: false, required: ['n', 'de'], properties: { n: { type: 'integer' }, de: { type: 'integer' } } }, { type: 'null' }] },
    debitoAutomatico: { type: 'boolean' },
    proximoVencimiento: FECHA,
    confianza: { type: 'string', enum: ['alta', 'baja'] },
    dudas: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['campo', 'detalle'],
      properties: { campo: { type: 'string', enum: CAMPOS_DUDA }, detalle: { type: 'string' } } } },
    avisos: { type: 'array', items: { type: 'string' } },
  },
};

/* Controles por código: lo que el esquema no garantiza. */
export function validarLectura(j) {
  const errores = [];
  if (!j || typeof j !== 'object') return { ok: false, errores: ['No es un objeto.'] };
  if (typeof j.empresa !== 'string') errores.push('Falta la empresa.');
  if (!Array.isArray(j.vencimientos)) errores.push('Faltan los vencimientos.');
  else {
    if (j.vencimientos.length > 4) errores.push('Demasiados vencimientos.');
    for (const v of j.vencimientos) {
      if (v.fecha != null && !esFecha(v.fecha)) errores.push(`Fecha inválida: ${v.fecha}`);
      if (v.monto != null && !(Number.isFinite(v.monto) && v.monto >= 0 && v.monto < 1e10)) errores.push('Monto inválido.');
    }
  }
  if (j.frecuencia != null && !(Number.isInteger(j.frecuencia) && j.frecuencia >= 1 && j.frecuencia <= 12)) errores.push('Frecuencia inválida.');
  return { ok: errores.length === 0, errores };
}

const DUDAS_GRAVES = ['vencimiento', 'monto'];
const pesos = n => (n == null ? null : Math.round(n * 100));

/* Lectura → lo que la app propone cargar. `hoy` sirve para avisar si la fecha ya pasó. */
export function propuestaDesde(j, hoy) {
  const vs = (j.vencimientos || []).filter(v => esFecha(v.fecha)).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const primero = vs[0] || null, segundo = vs[1] || null;
  const s = SERVICIOS.find(x => x.id === j.servicio) || null;
  const dudas = (j.dudas || []).filter(d => CAMPOS_DUDA.includes(d?.campo));
  const graves = dudas.filter(d => DUDAS_GRAVES.includes(d.campo));
  const avisos = [...dudas.map(d => String(d.detalle || '').slice(0, 140)), ...(j.avisos || []).map(a => String(a).slice(0, 160))].filter(Boolean).slice(0, 6);
  if (!primero) avisos.unshift('No encontramos la fecha de vencimiento. Completala a mano.');
  const frecuencia = j.frecuencia || s?.frecuencia || 1;
  const p = {
    nombre: s ? s.nombre : (String(j.empresa || '').trim().slice(0, 40) || 'Factura'),
    preset: s ? s.id : null,
    color: s?.color || null,
    categoria: s?.categoria || (CATEGORIA_IDS.includes(j.categoria) ? j.categoria : 'Otros'),
    frecuencia,
    vence: primero?.fecha || null,
    monto: pesos(primero?.monto ?? null),
    segundoVto: primero && segundo ? Math.max(1, difDias(primero.fecha, segundo.fecha)) : null,
    montoSegundo: pesos(segundo?.monto ?? null),
    moneda: j.moneda === 'USD' ? 'USD' : 'ARS',
    debito: !!j.debitoAutomatico,
    cuota: j.cuota && j.cuota.de > 1 && j.cuota.n >= 1 && j.cuota.n <= j.cuota.de ? j.cuota : null,
    proximo: esFecha(j.proximoVencimiento) ? j.proximoVencimiento : null,
    periodo: j.periodo || null,
    confiable: j.confianza === 'alta' && graves.length === 0 && !!primero,
    avisos,
  };
  if (p.vence && hoy && p.vence < hoy) p.avisos.unshift('Esta fecha ya pasó: si es una factura vieja, sirve igual para armar los meses que vienen.');
  return p;
}

/* ¿A cuál de las cuentas cargadas corresponde? Por servicio precargado o por nombre. */
export function cuentaQueCoincide(cuentas, p) {
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
  return cuentas.find(c => p.preset && c.preset === p.preset)
    || cuentas.find(c => norm(c.nombre) && (norm(c.nombre) === norm(p.nombre) || norm(p.nombre).includes(norm(c.nombre)) || norm(c.nombre).includes(norm(p.nombre))))
    || null;
}

/* Lectura de ejemplo para el modo prueba (sin key): una factura de luz que vence en 9 días. */
export function lecturaEjemplo(hoy) {
  const [a, m, d] = hoy.split('-').map(Number);
  const f = n => { const t = new Date(Date.UTC(a, m - 1, d + n)); return t.toISOString().slice(0, 10); };
  return {
    empresa: 'Edenor', servicio: 'edenor', categoria: 'Servicios',
    periodo: { desde: f(-40), hasta: f(-10) },
    vencimientos: [{ fecha: f(9), monto: 47830.55 }, { fecha: f(16), monto: 48912.1 }],
    moneda: 'ARS', frecuencia: 1, cuota: null, debitoAutomatico: false, proximoVencimiento: f(39),
    confianza: 'alta', dudas: [], avisos: [],
  };
}
