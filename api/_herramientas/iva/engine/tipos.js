// Tipos de comprobante según "Libro IVA Digital — Tablas del Sistema" (ARCA).
// Solo se clasifican los tipos que el MVP calcula. El resto se marca como caso especial:
// se muestra con alerta y no entra a la liquidación (decisión F1, 2026-09-28).
//
// clase:  'A' y 'M' discriminan IVA y generan crédito fiscal en compras.
//         'B' y 'C' no generan crédito fiscal en compras (sin registro de alícuotas).
// signo:  -1 para notas de crédito, que restan.

const T = (clase, signo, nombre) => ({ clase, signo, nombre });

export const TIPOS = {
  '001': T('A', 1, 'Factura A'),
  '002': T('A', 1, 'Nota de débito A'),
  '003': T('A', -1, 'Nota de crédito A'),
  '017': T('A', 1, 'Liquidación de servicios públicos A'),
  '081': T('A', 1, 'Tique factura A'),
  '112': T('A', -1, 'Tique nota de crédito A'),
  '115': T('A', 1, 'Tique nota de débito A'),
  '201': T('A', 1, 'Factura de crédito electrónica MiPyMEs A'),
  '202': T('A', 1, 'Nota de débito electrónica MiPyMEs A'),
  '203': T('A', -1, 'Nota de crédito electrónica MiPyMEs A'),

  '051': T('M', 1, 'Factura M'),
  '052': T('M', 1, 'Nota de débito M'),
  '053': T('M', -1, 'Nota de crédito M'),
  '118': T('M', 1, 'Tique factura M'),
  '119': T('M', -1, 'Tique nota de crédito M'),
  '120': T('M', 1, 'Tique nota de débito M'),

  '006': T('B', 1, 'Factura B'),
  '007': T('B', 1, 'Nota de débito B'),
  '008': T('B', -1, 'Nota de crédito B'),
  '018': T('B', 1, 'Liquidación de servicios públicos B'),
  '082': T('B', 1, 'Tique factura B'),
  '083': T('B', 1, 'Tique'),
  '110': T('B', -1, 'Tique nota de crédito'),
  '113': T('B', -1, 'Tique nota de crédito B'),
  '116': T('B', 1, 'Tique nota de débito B'),
  '206': T('B', 1, 'Factura de crédito electrónica MiPyMEs B'),
  '207': T('B', 1, 'Nota de débito electrónica MiPyMEs B'),
  '208': T('B', -1, 'Nota de crédito electrónica MiPyMEs B'),

  '011': T('C', 1, 'Factura C'),
  '012': T('C', 1, 'Nota de débito C'),
  '013': T('C', -1, 'Nota de crédito C'),
  '109': T('C', 1, 'Tique C'),
  '111': T('C', 1, 'Tique factura C'),
  '114': T('C', -1, 'Tique nota de crédito C'),
  '117': T('C', 1, 'Tique nota de débito C'),
  '211': T('C', 1, 'Factura de crédito electrónica MiPyMEs C'),
  '212': T('C', 1, 'Nota de débito electrónica MiPyMEs C'),
  '213': T('C', -1, 'Nota de crédito electrónica MiPyMEs C'),
};

export function infoTipo(codigo) {
  return TIPOS[normalizarCodigo(codigo)] || null;
}

export function normalizarCodigo(codigo) {
  const m = String(codigo ?? '').match(/\d+/);
  return m ? m[0].padStart(3, '0').slice(-3) : '';
}

// Traduce lo que escriben los sistemas de gestión ("FC A", "Factura A", "NC-B", "1 - Factura A") al código de ARCA.
export function normalizarTipo(texto) {
  const s = String(texto ?? '').trim();
  if (/^\d{1,3}(\s*-.*)?$/.test(s)) return normalizarCodigo(s);
  const t = s.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const letra = (t.match(/(?:^|[\s\-_.])([ABCM])\s*$/) || t.match(/\b([ABCM])\b/) || [])[1];
  if (!letra) return '';
  const esNC = /\b(NC|N\.?\s*C|NOTA\s+DE\s+CREDITO|CREDITO)\b/.test(t);
  const esND = /\b(ND|N\.?\s*D|NOTA\s+DE\s+DEBITO|DEBITO)\b/.test(t);
  const base = { A: ['001', '002', '003'], B: ['006', '007', '008'], C: ['011', '012', '013'], M: ['051', '052', '053'] }[letra];
  return esNC ? base[2] : esND ? base[1] : base[0];
}
