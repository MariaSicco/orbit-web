// Duplicados dentro de cada fuente, antes de conciliar. No se mezclan en silencio con el cruce:
// el primero de cada grupo concilia normalmente y los demás quedan en estado "duplicado".

import { claveComprobante, claveSinTipo } from './claves.js';

const claveDe = r => claveComprobante(r) ?? claveSinTipo(r);

// tipos: 'identico'        mismo comprobante y mismos importes (cargado dos veces)
//        'monto_distinto'  mismo comprobante con importes distintos
//        'fila_identica'   filas iguales sin número de comprobante
//        'posible'         mismo CUIT, fecha y total con distinto número (puede ser legítimo: solo aviso)
export function detectarDuplicados(registros, origen) {
  const grupos = [];
  const porClave = new Map();
  for (const r of registros) {
    const k = claveDe(r);
    if (!k) continue;
    if (!porClave.has(k)) porClave.set(k, []);
    porClave.get(k).push(r);
  }
  for (const [clave, lista] of porClave) {
    if (lista.length < 2) continue;
    const mismosImportes = lista.every(r => r.total === lista[0].total && r.iva === lista[0].iva && r.neto === lista[0].neto);
    grupos.push({ origen, tipo: mismosImportes ? 'identico' : 'monto_distinto', clave, ids: lista.map(r => r.id) });
  }

  const sinClave = registros.filter(r => !claveDe(r));
  const porContenido = new Map();
  for (const r of sinClave) {
    const k = [r.cuit, r.fecha, r.tipo, r.total, r.iva, r.neto, r.proveedorNorm].join('|');
    if (!porContenido.has(k)) porContenido.set(k, []);
    porContenido.get(k).push(r);
  }
  for (const [clave, lista] of porContenido) if (lista.length > 1) grupos.push({ origen, tipo: 'fila_identica', clave, ids: lista.map(r => r.id) });

  const cerca = new Map();
  for (const r of registros) {
    if (!r.cuit || r.total == null || !r.fecha || r.numero == null) continue;
    const k = `${r.cuit}|${r.fecha}|${r.total}`;
    if (!cerca.has(k)) cerca.set(k, []);
    cerca.get(k).push(r);
  }
  for (const [clave, lista] of cerca) {
    const numeros = new Set(lista.map(r => `${r.ptoVta}-${r.numero}`));
    if (numeros.size > 1) grupos.push({ origen, tipo: 'posible', clave, ids: lista.map(r => r.id) });
  }
  return grupos;
}

export const MOTIVO_DUPLICADO = {
  identico: 'Cargado dos veces (mismo comprobante e importes)',
  monto_distinto: 'Mismo comprobante con importes distintos',
  fila_identica: 'Fila repetida (sin número de comprobante)',
  posible: 'Posible duplicado: mismo CUIT, fecha y total con distinto número',
};
