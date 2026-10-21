// Claves de identificación de un comprobante. Nunca solo por monto ni solo por razón social.
import { normalizarCodigo } from '../tipos.js';

// Nivel 1: CUIT + tipo + punto de venta + número
export function claveComprobante(r) {
  if (!r.cuit || r.numero == null || !r.tipo) return null;
  return `${r.cuit}|${normalizarCodigo(r.tipo)}|${r.ptoVta ?? 0}|${r.numero}`;
}

// Nivel 1b: sin tipo (un sistema no lo informa o lo informa distinto)
export function claveSinTipo(r) {
  if (!r.cuit || r.numero == null) return null;
  return `${r.cuit}|${r.ptoVta ?? 0}|${r.numero}`;
}
