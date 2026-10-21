// Reglas de una conciliación: tolerancias, exclusiones, alias, signos y campos obligatorios.
// Todas son datos estructurados y validados por código. Claude solo traduce texto libre a una de estas formas
// (server/ai/regla.js); nunca ejecuta acciones por su cuenta. Una regla que no pasa validarRegla no se aplica.

import { normProveedor, soloDigitos } from './normalizar.js';

export const CAMPOS_COMPARABLES = ['total', 'neto', 'iva', 'fecha', 'tipo'];
const NOMBRE_CAMPO = { total: 'total', neto: 'neto gravado', iva: 'IVA', fecha: 'fecha', tipo: 'tipo de comprobante' };

export const TIPOS_REGLA = {
  tolerancia_monto: 'Tolerancia de importe',
  tolerancia_porcentaje: 'Tolerancia porcentual',
  tolerancia_fecha: 'Tolerancia de fecha',
  excluir_proveedor: 'Excluir proveedor',
  alias_proveedor: 'Alias de proveedor',
  signo_notas_credito: 'Signo de las notas de crédito',
  campos_obligatorios: 'Campos que deben coincidir',
  ignorar_campo: 'Ignorar diferencias de un campo',
};

export const REGLAS_POR_DEFECTO = [
  { tipo: 'signo_notas_credito', origen: 'ambos', modo: 'por_tipo', alcance: 'defecto' },
  { tipo: 'campos_obligatorios', campos: ['total', 'neto', 'iva', 'fecha', 'tipo'], alcance: 'defecto' },
];

const entero = v => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : NaN);

// Devuelve { ok, regla } con la regla limpia, o { ok: false, error } con un motivo entendible.
export function validarRegla(r) {
  if (!r || typeof r !== 'object' || !TIPOS_REGLA[r.tipo]) return { ok: false, error: 'No es un tipo de regla conocido.' };
  const alcance = ['corrida', 'perfil', 'defecto'].includes(r.alcance) ? r.alcance : 'corrida';
  const base = { tipo: r.tipo, alcance };
  switch (r.tipo) {
    case 'tolerancia_monto': {
      const valor = entero(r.valor);
      if (!(valor >= 0) || valor > 100000000) return { ok: false, error: 'La tolerancia de importe tiene que ser un monto positivo.' };
      const cuit = r.cuit ? soloDigitos(r.cuit) : undefined;
      return { ok: true, regla: { ...base, valor, ...(cuit ? { cuit } : {}) } };
    }
    case 'tolerancia_porcentaje': {
      const valor = Number(r.valor);
      if (!(valor >= 0 && valor <= 100)) return { ok: false, error: 'La tolerancia porcentual tiene que estar entre 0 y 100.' };
      return { ok: true, regla: { ...base, valor } };
    }
    case 'tolerancia_fecha': {
      const dias = entero(r.dias);
      if (!(dias >= 0 && dias <= 60)) return { ok: false, error: 'La tolerancia de fecha tiene que estar entre 0 y 60 días.' };
      return { ok: true, regla: { ...base, dias } };
    }
    case 'excluir_proveedor': {
      const valor = String(r.valor ?? '').trim();
      if (!valor) return { ok: false, error: 'Falta el proveedor a excluir.' };
      return { ok: true, regla: { ...base, valor } };
    }
    case 'alias_proveedor': {
      const cuit = soloDigitos(r.cuit);
      const nombres = (Array.isArray(r.nombres) ? r.nombres : [r.nombres]).map(n => String(n ?? '').trim()).filter(Boolean);
      if (cuit.length !== 11 || !nombres.length) return { ok: false, error: 'Un alias necesita la CUIT (11 dígitos) y al menos un nombre.' };
      return { ok: true, regla: { ...base, cuit, nombres } };
    }
    case 'signo_notas_credito': {
      const origen = ['sistema', 'arca', 'ambos'].includes(r.origen) ? r.origen : 'ambos';
      if (!['por_tipo', 'como_viene'].includes(r.modo)) return { ok: false, error: 'El modo de signo tiene que ser "por_tipo" o "como_viene".' };
      return { ok: true, regla: { ...base, origen, modo: r.modo } };
    }
    case 'campos_obligatorios': {
      const campos = (r.campos ?? []).filter(c => CAMPOS_COMPARABLES.includes(c));
      if (!campos.length) return { ok: false, error: 'Tiene que quedar al menos un campo obligatorio.' };
      return { ok: true, regla: { ...base, campos: [...new Set(campos)] } };
    }
    case 'ignorar_campo': {
      if (!CAMPOS_COMPARABLES.includes(r.campo)) return { ok: false, error: `No se puede ignorar el campo "${r.campo}".` };
      return { ok: true, regla: { ...base, campo: r.campo } };
    }
  }
  return { ok: false, error: 'Regla no reconocida.' };
}

const pesos = c => `$ ${(c / 100).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Texto para "Entendimos esta regla así: …"
export function describirRegla(r) {
  switch (r.tipo) {
    case 'tolerancia_monto': return `Diferencias de importe de hasta ${pesos(r.valor)} se consideran coincidencia${r.cuit ? ` (solo CUIT ${r.cuit})` : ''}. El delta real se guarda igual.`;
    case 'tolerancia_porcentaje': return `Diferencias de importe de hasta el ${String(r.valor).replace('.', ',')}% se consideran coincidencia.`;
    case 'tolerancia_fecha': return r.dias ? `Se aceptan fechas con hasta ${r.dias} ${r.dias === 1 ? 'día' : 'días'} de diferencia.` : 'Las fechas tienen que coincidir exactas.';
    case 'excluir_proveedor': return `No se incluyen los comprobantes de "${r.valor}" (por nombre o CUIT).`;
    case 'alias_proveedor': return `${r.nombres.map(n => `"${n}"`).join(', ')} es el mismo proveedor que la CUIT ${r.cuit}.`;
    case 'signo_notas_credito': {
      const donde = { sistema: 'del sistema', arca: 'de ARCA', ambos: 'de los dos archivos' }[r.origen];
      return r.modo === 'por_tipo'
        ? `En las notas de crédito ${donde}, el signo se toma del tipo de comprobante (restan), venga positivo o negativo.`
        : `Los importes ${donde} se toman con el signo que traen.`;
    }
    case 'campos_obligatorios': return `Tienen que coincidir: ${r.campos.map(c => NOMBRE_CAMPO[c]).join(', ')}.`;
    case 'ignorar_campo': return `Las diferencias de ${NOMBRE_CAMPO[r.campo]} no cuentan (se muestran como información).`;
  }
  return 'Regla sin descripción.';
}

// Junta todas las reglas (por defecto, del perfil y de esta corrida; la última de cada tipo manda) en una configuración.
export function configuracion(reglas = []) {
  const cfg = {
    tolMonto: 0, tolMontoPorCuit: new Map(), tolPct: 0, tolDias: 0,
    excluir: [], alias: new Map(), aliasCuits: new Set(),
    signos: { sistema: 'por_tipo', arca: 'por_tipo' },
    obligatorios: new Set(CAMPOS_COMPARABLES), ignorar: new Set(),
  };
  for (const cruda of [...REGLAS_POR_DEFECTO, ...reglas]) {
    const v = validarRegla(cruda);
    if (!v.ok) continue;
    const r = v.regla;
    if (r.tipo === 'tolerancia_monto') { if (r.cuit) cfg.tolMontoPorCuit.set(r.cuit, r.valor); else cfg.tolMonto = r.valor; }
    if (r.tipo === 'tolerancia_porcentaje') cfg.tolPct = r.valor;
    if (r.tipo === 'tolerancia_fecha') cfg.tolDias = r.dias;
    if (r.tipo === 'excluir_proveedor') cfg.excluir.push({ nombre: normProveedor(r.valor), cuit: soloDigitos(r.valor) });
    if (r.tipo === 'alias_proveedor') { for (const n of r.nombres) cfg.alias.set(normProveedor(n), r.cuit); cfg.aliasCuits.add(r.cuit); }
    if (r.tipo === 'signo_notas_credito') for (const o of r.origen === 'ambos' ? ['sistema', 'arca'] : [r.origen]) cfg.signos[o] = r.modo;
    if (r.tipo === 'campos_obligatorios') cfg.obligatorios = new Set(r.campos);
    if (r.tipo === 'ignorar_campo') cfg.ignorar.add(r.campo);
  }
  return cfg;
}

export function excluido(cfg, r) {
  return cfg.excluir.some(e => (e.cuit.length === 11 && r.cuit === e.cuit) || (e.nombre && r.proveedorNorm && (r.proveedorNorm === e.nombre || r.proveedorNorm.includes(e.nombre))));
}

// Traducción local (sin IA) de las instrucciones más comunes. Sirve sin conexión y como control de lo que propone Claude.
const NUMEROS = { un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7 };
export function interpretarReglaLocal(texto) {
  const t = String(texto ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  if (!t) return null;
  let m = t.match(/(\d+|un|uno|una|dos|tres|cuatro|cinco|seis|siete)\s+dias?/);
  if (m && /fecha|dia/.test(t)) return { tipo: 'tolerancia_fecha', dias: NUMEROS[m[1]] ?? Number(m[1]) };
  m = t.match(/(\d+(?:[.,]\d+)?)\s*%/);
  if (m && /diferenc|toler|acept|ignor/.test(t)) return { tipo: 'tolerancia_porcentaje', valor: Number(m[1].replace(',', '.')) };
  m = t.match(/(?:menor(?:es)?\s+(?:a|de)|hasta|de menos de|inferiores? a|por debajo de)\s*\$?\s*(\d+(?:[.,]\d{1,2})?)/);
  if (m && /diferenc|toler|ignor|acept/.test(t)) return { tipo: 'tolerancia_monto', valor: Math.round(Number(m[1].replace(',', '.')) * 100) };
  m = t.match(/(?:no incluir|no incluyas|exclui|excluir|excluí|sacar|saca|ignorar|ignora)\w*\s+(?:a\s+|al\s+)?(?:(?:el|los)\s+)?(?:proveedor(?:es)?|cliente)\s+(.+)$/);
  if (m) return { tipo: 'excluir_proveedor', valor: String(texto).trim().slice(-m[1].length).replace(/[.]$/, '') };
  if (/notas? de credito/.test(t) && /signo|positiv|negativ/.test(t)) {
    const origen = /sistema|chess|erp/.test(t) ? 'sistema' : /arca|afip/.test(t) ? 'arca' : 'ambos';
    return { tipo: 'signo_notas_credito', origen, modo: 'por_tipo' };
  }
  return null;
}
