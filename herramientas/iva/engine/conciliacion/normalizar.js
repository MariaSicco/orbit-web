// Normalización determinística: cada dato del archivo pasa a una forma comparable.
// El valor original nunca se pierde: cada registro guarda `crudo` con lo que decía la celda.

import { aCentavos } from '../dinero.js';
import { cuitValido } from '../cuit.js';
import { normalizarTipo, infoTipo } from '../tipos.js';

export const soloDigitos = v => String(v ?? '').replace(/\D/g, '');

// CUIT: solo dígitos. Se informa si pasa el dígito verificador, pero no se descarta (ARCA a veces trae DNI).
export function normCuit(v) {
  const d = soloDigitos(v);
  return { valor: d || null, valido: d.length === 11 && cuitValido(d) };
}

// Punto de venta y número: sin separadores ni ceros a la izquierda.
export function normEntero(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? Math.trunc(v) : null;
  const d = soloDigitos(v);
  return d ? parseInt(d, 10) : null;
}

// "0003-00001234", "A 0003-00001234", "FC A 3-1234", "00003 00001234": punto de venta y número juntos.
export function partirComprobante(v) {
  const s = String(v ?? '').trim();
  const m = s.match(/(\d{1,5})\s*[-/ ]\s*(\d{1,8})\s*$/);
  if (m) return { ptoVta: parseInt(m[1], 10), numero: parseInt(m[2], 10) };
  const solo = soloDigitos(s);
  if (solo.length === 13) return { ptoVta: parseInt(solo.slice(0, 5), 10), numero: parseInt(solo.slice(5), 10) };
  if (solo.length === 12) return { ptoVta: parseInt(solo.slice(0, 4), 10), numero: parseInt(solo.slice(4), 10) };
  return { ptoVta: null, numero: solo ? parseInt(solo, 10) : null };
}

// Importes: formato argentino o con punto decimal, siempre a centavos enteros. null si no se entiende.
export function normImporte(v) {
  if (v === null || v === undefined || v === '') return { valor: null, error: null };
  if (typeof v === 'number') return { valor: Math.round(v * 100), error: null };
  try { return { valor: aCentavos(v), error: null }; } catch { return { valor: null, error: `Importe ilegible: "${v}"` }; }
}

const pad = n => String(n).padStart(2, '0');

// Fechas: dd/mm/aaaa, d/m/aa, aaaa-mm-dd, dd-mm-aaaa, dd.mm.aaaa, fecha de Excel (número o Date). Salida AAAA-MM-DD.
export function normFecha(v) {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    // Las fechas de Excel llegan a medianoche local o UTC según la librería: +12 h asegura el día correcto.
    const d = new Date(v.getTime() + 12 * 3600e3);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  if (typeof v === 'number' && v > 20000 && v < 80000) { // número de serie de Excel (días desde 1899-12-30)
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 864e5);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return valida(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (m) {
    let a = +m[3];
    if (a < 100) a += 2000;
    return valida(a, +m[2], +m[1]); // en Argentina: día primero
  }
  m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return valida(+m[1], +m[2], +m[3]);
  return null;
}

function valida(a, mes, dia) {
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  const d = new Date(Date.UTC(a, mes - 1, dia));
  if (d.getUTCMonth() !== mes - 1) return null;
  return `${a}-${pad(mes)}-${pad(dia)}`;
}

export const diasEntre = (a, b) => (a && b ? Math.round((Date.parse(a) - Date.parse(b)) / 864e5) : null);

// Razón social: para comparar nombres (nunca como única clave del cruce).
const SUFIJOS = /\b(S\.?\s?A\.?\s?I\.?\s?C\.?|S\.?\s?A\.?\s?C\.?\s?I\.?|S\.?\s?R\.?\s?L\.?|S\.?\s?A\.?\s?S\.?|S\.?\s?A\.?|S\.?\s?C\.?\s?A\.?|S\.?\s?H\.?|SOCIEDAD ANONIMA|SOCIEDAD DE RESPONSABILIDAD LIMITADA|SOC\.? ANON\.?|LTDA\.?|INC\.?|CIA\.?)(?=\s|$)/g;
export function normProveedor(v) {
  return String(v ?? '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[“”"'`´]/g, '').replace(SUFIJOS, ' ').replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

// Tipo de comprobante: código de ARCA. Acepta "1 - Factura A", "FC A", "NC-B", o tipo y letra en columnas separadas.
export function normTipo(tipo, letra) {
  const base = String(tipo ?? '').trim();
  const l = String(letra ?? '').trim().toUpperCase();
  const t = normalizarTipo(l && !/\b[ABCM]\s*$/i.test(base) ? `${base} ${l}` : base);
  return t || null;
}

export const signoDeTipo = tipo => infoTipo(tipo)?.signo ?? 1;
export const esNotaCredito = tipo => signoDeTipo(tipo) === -1;
