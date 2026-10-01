// Lectura tolerante de tablas: CSV con cualquier separador, notas arriba de la tabla, encabezados dobles,
// filas vacías y filas de totales. Trabaja con filas (arrays de celdas) para que el Excel (.xlsx) entre igual.

import { aliasDeCampo } from './columnas.js';

export function filasDeCSV(texto) {
  const limpio = String(texto ?? '').replace(/^﻿/, '');
  const lineas = limpio.split(/\r?\n/);
  const muestra = lineas.filter(l => l.trim()).slice(0, 15).join('\n');
  const sep = [';', ',', '\t', '|'].map(s => [s, contar(muestra, s)]).sort((a, b) => b[1] - a[1])[0][0];
  return lineas.map(l => partirLinea(l, sep));
}

const contar = (texto, s) => texto.split(s).length - 1;

function partirLinea(linea, sep) {
  const celdas = [];
  let actual = '', comillas = false;
  for (let i = 0; i < linea.length; i++) {
    const ch = linea[i];
    if (comillas) {
      if (ch === '"' && linea[i + 1] === '"') { actual += '"'; i++; }
      else if (ch === '"') comillas = false;
      else actual += ch;
    } else if (ch === '"') comillas = true;
    else if (ch === sep) { celdas.push(actual.trim()); actual = ''; }
    else actual += ch;
  }
  celdas.push(actual.trim());
  return celdas;
}

export const textoCelda = v => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? '').trim());
const vacia = f => !f || f.every(c => textoCelda(c) === '');
const pareceDato = v => typeof v === 'number' || v instanceof Date || /^[-$(]?\s*[\d.,/\- ]+\)?$/.test(textoCelda(v));

// Busca la fila de encabezados: la que más nombres de columna reconocibles tiene entre las primeras 30.
// Si la fila siguiente también es de texto (encabezado doble), une los dos niveles.
export function describirTabla(filasCrudas) {
  const filas = (filasCrudas ?? []).map(f => (Array.isArray(f) ? f : []));
  const avisos = [];
  let mejor = -1, puntaje = 0;
  for (let i = 0; i < Math.min(filas.length, 30); i++) {
    const celdas = filas[i].map(textoCelda).filter(Boolean);
    if (celdas.length < 2) continue;
    const reconocidas = celdas.filter(c => aliasDeCampo(c)).length;
    const texto = celdas.filter(c => !pareceDato(c)).length;
    const p = reconocidas * 3 + (texto === celdas.length ? 1 : 0) + Math.min(celdas.length, 8) / 10;
    if (p > puntaje) { puntaje = p; mejor = i; }
  }
  if (mejor === -1) return { encabezados: [], datos: [], filaEncabezado: -1, avisos: ['No encontramos una fila de encabezados. ¿El archivo tiene una tabla con títulos de columna?'] };
  if (mejor > 0) avisos.push(`Salteamos ${mejor} ${mejor === 1 ? 'línea' : 'líneas'} de notas arriba de la tabla.`);

  let encabezados = filas[mejor].map(textoCelda);
  let desde = mejor + 1;
  const siguiente = filas[desde];
  if (siguiente && !vacia(siguiente) && siguiente.every(c => textoCelda(c) === '' || !pareceDato(c))
    && siguiente.filter(c => textoCelda(c)).length >= 2 && !filas.slice(desde + 1, desde + 3).every(vacia)) {
    encabezados = encabezados.map((h, i) => [h, textoCelda(siguiente[i])].filter(Boolean).join(' '));
    desde++;
    avisos.push('El archivo tiene encabezados en dos filas: los unimos.');
  }
  // Encabezados vacíos o repetidos: se les pone un nombre único para poder elegirlos.
  const vistos = new Map();
  encabezados = encabezados.map((h, i) => {
    const base = h || `Columna ${i + 1}`;
    const n = (vistos.get(base) ?? 0) + 1;
    vistos.set(base, n);
    return n > 1 ? `${base} (${n})` : base;
  });

  const datos = [];
  let vaciasSaltadas = 0, totalesSaltados = 0;
  for (let i = desde; i < filas.length; i++) {
    const f = filas[i];
    if (vacia(f)) { vaciasSaltadas++; continue; }
    const primera = textoCelda(f.find(c => textoCelda(c) !== ''));
    if (/^(total|totales|subtotal)\b/i.test(primera)) { totalesSaltados++; continue; }
    datos.push({ n: i + 1, celdas: encabezados.map((_, j) => f[j] ?? '') });
  }
  if (totalesSaltados) avisos.push(`Salteamos ${totalesSaltados} ${totalesSaltados === 1 ? 'fila' : 'filas'} de totales.`);
  return { encabezados, datos, filaEncabezado: mejor + 1, avisos };
}
