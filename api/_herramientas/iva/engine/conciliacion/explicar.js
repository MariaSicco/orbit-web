// Motivos y explicaciones en palabras, armados con los datos que calculó el motor (sin recalcular nada).
// Claude puede redactar una explicación más natural (server/ai/explicar.js), pero siempre sobre estos mismos datos.

import { formatear } from '../dinero.js';

const NOMBRE = { total: 'total', neto: 'neto gravado', iva: 'IVA', fecha: 'fecha', tipo: 'tipo de comprobante', cuit: 'CUIT', numero: 'número', proveedor: 'razón social' };
const valor = (campo, v) => (v == null ? '—' : ['total', 'neto', 'iva'].includes(campo) ? formatear(v) : String(v));

export function motivoDe(r) {
  if (r.estado === 'coincide') {
    if (r.decision?.tipo === 'mismo') return 'Marcado como el mismo comprobante por el usuario';
    if (r.toleradas.length) return `Coincide dentro de la tolerancia (${r.toleradas.map(t => `${NOMBRE[t.campo]} Δ ${t.campo === 'fecha' ? `${Math.abs(t.delta)} d` : formatear(Math.abs(t.delta))}`).join(', ')})`;
    return 'Coincide';
  }
  if (r.estado !== 'diferencia') return r.motivo;
  const d = r.diferencias;
  const campos = d.map(x => x.campo);
  if (d.some(x => x.signoInvertido)) return 'Signo distinto (posible nota de crédito con signo invertido)';
  if (campos.includes('cuit')) return 'CUIT diferente';
  if (campos.length === 1) return `Diferencia de ${NOMBRE[campos[0]]}`;
  const montos = campos.filter(c => ['total', 'neto', 'iva'].includes(c));
  if (montos.length === campos.length) return `Comprobante coincide pero importe no (${montos.map(c => NOMBRE[c]).join(', ')})`;
  return `Diferencias de ${campos.map(c => NOMBRE[c]).join(', ')}`;
}

export function detalleDiferencia(x) {
  if (x.campo === 'fecha') return `Fecha: sistema ${x.sistema}, ARCA ${x.arca} (${Math.abs(x.delta)} ${Math.abs(x.delta) === 1 ? 'día' : 'días'})`;
  if (x.delta != null) return `${NOMBRE[x.campo][0].toUpperCase() + NOMBRE[x.campo].slice(1)}: sistema ${valor(x.campo, x.sistema)}, ARCA ${valor(x.campo, x.arca)}, diferencia ${formatear(x.delta)}`;
  return `${NOMBRE[x.campo]}: sistema ${valor(x.campo, x.sistema)}, ARCA ${valor(x.campo, x.arca)}`;
}

// Explicación en una o dos oraciones, sin IA.
export function explicacionLocal(r) {
  const s = r.sistema, a = r.arca;
  if (r.estado === 'solo_arca') return `ARCA informa ${comp(a)} de ${a.proveedor || a.cuit} por ${formatear(a.total ?? 0)} y no encontramos un registro del sistema con el mismo CUIT y comprobante${r.senales?.length ? '' : ' ni uno parecido'}.`;
  if (r.estado === 'solo_sistema') return s.cuit ? `El sistema tiene ${comp(s)} de ${s.proveedor || s.cuit} por ${formatear(s.total ?? 0)} y ARCA no lo informa.` : `El registro del sistema no tiene CUIT, así que no se puede buscar en ARCA. Completalo o agregá un alias para "${s.proveedor}".`;
  if (r.estado === 'duplicado') return `${r.motivo}. Solo el primero participa del cruce.`;
  if (r.estado === 'revision' && r.candidatos.length) {
    const c = r.candidatos[0];
    return `No hay una coincidencia segura. El candidato más parecido en ARCA es ${comp(c.arca)} (${c.senales.join(', ') || 'pocas señales'})${c.diferencias.length ? `; no coincide: ${c.diferencias.map(x => NOMBRE[x.campo]).join(', ')}` : ''}. Decidí si es el mismo.`;
  }
  const base = `Relacionamos los dos registros porque ${r.senales.map(x => x.replace(/^([A-ZÁÉÍÓÚ])(?=[a-záéíóú])/, m => m.toLowerCase())).join(', ') || 'lo decidió el usuario'}.`;
  if (r.estado === 'coincide') return r.toleradas.length ? `${base} ${r.motivo}.` : `${base} Todos los datos obligatorios coinciden.`;
  return `${base} ${r.diferencias.map(detalleDiferencia).join('. ')}.`;
}

const comp = c => (c ? `el comprobante ${String(c.ptoVta ?? '').padStart(4, '0')}-${c.numero != null ? String(c.numero).padStart(8, '0') : 's/n'}` : 'el comprobante');
