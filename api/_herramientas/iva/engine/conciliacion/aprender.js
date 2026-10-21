// Aprender de las correcciones, de forma explícita: una decisión del usuario puede proponer una regla,
// pero solo se guarda en el perfil de la empresa si el usuario lo elige. Nada cambia en silencio.

import { validarRegla } from './reglas.js';

// Reglas que tendría sentido guardar a partir de un "son el mismo" (o de una diferencia aceptada).
export function reglasSugeridas(resultado, arca = resultado.arca) {
  const s = resultado.sistema;
  if (!s || !arca) return [];
  const sugeridas = [];
  if (arca.cuit && (!s.cuit || (s.proveedorNorm && arca.proveedorNorm && s.proveedorNorm !== arca.proveedorNorm)) && s.proveedor) {
    sugeridas.push({ tipo: 'alias_proveedor', cuit: arca.cuit, nombres: [s.proveedor] });
  }
  const dTotal = s.total != null && arca.total != null ? Math.abs(s.total - arca.total) : 0;
  if (dTotal > 0 && dTotal <= 1000) { // hasta $10: redondeos típicos de un proveedor
    sugeridas.push({ tipo: 'tolerancia_monto', valor: Math.ceil(dTotal / 10) * 10, cuit: arca.cuit });
  }
  return sugeridas.map(r => validarRegla({ ...r, alcance: 'perfil' })).filter(v => v.ok).map(v => v.regla);
}

// Perfil de conciliación de una empresa: mapeos por formato de archivo, reglas guardadas y datos del ERP.
export function perfilVacio() {
  return { sistemaNombre: 'CHESS', mapeos: {}, reglas: [], historial: [] };
}
