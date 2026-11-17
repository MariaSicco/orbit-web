// Facturas repetidas en la calculadora: la misma factura no se puede sumar dos veces al crédito fiscal.
// Una factura se identifica por CUIT del emisor + tipo + punto de venta + número (lo que ARCA no repite).
// Si falta alguno de esos datos no hay clave: no se puede saber si está repetida y no se frena.

import { normalizarCodigo } from './tipos.js';

export function claveComprobante(f) {
  const cuit = String(f?.cuit ?? '').replace(/\D/g, '');
  const tipo = f?.tipo ? normalizarCodigo(f.tipo) : '';
  const ptoVta = Number(f?.ptoVta);
  const numero = Number(f?.numero);
  if (cuit.length !== 11 || !tipo || !Number.isInteger(ptoVta) || ptoVta <= 0 || !Number.isInteger(numero) || numero <= 0) return null;
  return `${cuit}|${tipo}|${ptoVta}|${numero}`;
}

// Busca la factura `f` en los períodos ya traídos de la misma empresa. Devuelve { periodo, factura } o null.
// `excluirId`: la propia factura, cuando se está editando una que ya está en la lista.
export function buscarRepetida(periodos, clienteId, f, { excluirId } = {}) {
  const clave = claveComprobante(f);
  if (!clave) return null;
  for (const periodo of periodos ?? []) {
    if (periodo.clienteId !== clienteId || periodo._pendiente) continue;
    const factura = (periodo.fotos ?? []).find(x => x.id !== excluirId && claveComprobante(x) === clave);
    if (factura) return { periodo, factura };
  }
  return null;
}
