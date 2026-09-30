// Datos del conciliador en el navegador: lectura de archivos, fuentes, perfil de la empresa, corrida y auditoría.
// El cálculo es del motor (engine/conciliacion). Acá solo se guarda el estado y se arma lo que necesita la interfaz.

import { S, guardar, nuevoId, clienteDe } from './estado.js';
import { filasDeCSV, describirTabla } from '../engine/conciliacion/tabla.js';
import { detectarColumnas, validarMapeo, importarRegistros, firmaEncabezados, periodoProbable } from '../engine/conciliacion/columnas.js';
import { conciliar, VERSION_MOTOR } from '../engine/conciliacion/motor.js';
import { configuracion, validarRegla, REGLAS_POR_DEFECTO } from '../engine/conciliacion/reglas.js';
import { perfilVacio } from '../engine/conciliacion/aprender.js';
import { normFecha } from '../engine/conciliacion/normalizar.js';
import { modelosUsados } from './ia.js';
import { nombreSeguro } from './util.js';

export const TAMANO_MAXIMO = 15 * 1024 * 1024;
const EXTENSIONES = /\.(xlsx|xls|csv|txt|tsv)$/i;

export function conc(p) {
  p.conc ??= { lado: 'compra', fuentes: { compra: { sistema: null, arca: null }, venta: { sistema: null, arca: null } }, reglas: [], decisiones: [], corridas: [], sugerencias: {}, explicaciones: {}, notas: {}, colores: null };
  return p.conc;
}

export function perfil(p) {
  const c = clienteDe(p);
  S.perfiles ??= {};
  S.perfiles[c.id] ??= perfilVacio();
  return S.perfiles[c.id];
}

// ——— Lectura de archivos ———
// Devuelve filas (arrays de celdas). Fechas del Excel como AAAA-MM-DD; números como números.
export async function leerFilas(archivo) {
  if (!EXTENSIONES.test(archivo.name)) throw new Error(`"${nombreSeguro(archivo.name)}" no es un Excel ni un CSV. Subí un .xlsx, .xls o .csv.`);
  if (archivo.size > TAMANO_MAXIMO) throw new Error(`El archivo pesa ${(archivo.size / 1048576).toFixed(1)} MB. El máximo es 15 MB: exportá solo el período.`);
  if (!archivo.size) throw new Error('El archivo está vacío.');
  if (/\.xlsx?$/i.test(archivo.name)) {
    if (!globalThis.XLSX) throw new Error('El lector de Excel no cargó. Revisá la conexión y recargá la página.');
    let wb;
    try { wb = XLSX.read(await archivo.arrayBuffer(), { type: 'array', cellDates: true }); } catch {
      throw new Error('No pudimos abrir el Excel. ¿Está dañado o protegido con contraseña? Probá guardarlo de nuevo o exportarlo como CSV.');
    }
    // La hoja con más filas con datos (algunos sistemas ponen una carátula primero)
    const hojas = wb.SheetNames.map(n => XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '' }));
    const filas = hojas.sort((a, b) => b.length - a.length)[0] ?? [];
    return filas.map(f => f.map(c => (c instanceof Date ? normFecha(c) ?? '' : c)));
  }
  const buffer = await archivo.arrayBuffer();
  let texto;
  try { texto = new TextDecoder('utf-8', { fatal: true }).decode(buffer); } catch { texto = new TextDecoder('windows-1252').decode(buffer); }
  return filasDeCSV(texto);
}

// ——— Fuentes (un archivo del sistema o de ARCA ya leído) ———
const cache = new WeakMap();
export function tablaDe(fuente) {
  if (!fuente) return null;
  let c = cache.get(fuente);
  if (!c || c.filas !== fuente.filas) { c = { filas: fuente.filas, tabla: describirTabla(fuente.filas) }; cache.set(fuente, c); }
  return c.tabla;
}

export function registrosDe(fuente, origen, lado) {
  const tabla = tablaDe(fuente);
  if (!tabla || !fuente.mapeo) return { registros: [], errores: [] };
  const clave = JSON.stringify(fuente.mapeo);
  const c = cache.get(fuente);
  if (c.mapeoClave !== clave) { c.mapeoClave = clave; c.importado = importarRegistros(tabla, validarMapeo(fuente.mapeo, tabla.encabezados).mapeo, { origen, lado }); }
  return c.importado;
}

export function crearFuente(p, origen, archivo, filas) {
  const fuente = { nombre: nombreSeguro(archivo.name), tamano: archivo.size, cargado: new Date().toISOString(), filas, mapeo: null, origenMapeo: {}, confirmado: false };
  const tabla = tablaDe(fuente);
  if (!tabla.encabezados.length) throw new Error(tabla.avisos[0] ?? 'No encontramos una tabla en el archivo.');
  if (!tabla.datos.length) throw new Error('El archivo no tiene filas con datos debajo de los encabezados.');
  // 1. Mapeo guardado para esta empresa y este formato de archivo · 2. detección por nombre y contenido
  const guardado = perfil(p).mapeos[`${origen}:${firmaEncabezados(tabla.encabezados)}`];
  if (guardado && validarMapeo(guardado, tabla.encabezados).ok) {
    fuente.mapeo = guardado;
    fuente.origenMapeo = Object.fromEntries(Object.keys(guardado).map(k => [k, 'perfil']));
  } else {
    const det = detectarColumnas(tabla.encabezados, tabla.datos);
    fuente.mapeo = det.mapeo; fuente.origenMapeo = det.origen;
  }
  return fuente;
}

export function resumenFuente(fuente, origen, lado) {
  const tabla = tablaDe(fuente);
  const { registros, errores } = registrosDe(fuente, origen, lado);
  return { tabla, registros, errores, periodo: periodoProbable(registros), validacion: validarMapeo(fuente.mapeo ?? {}, tabla.encabezados) };
}

export function guardarMapeoEnPerfil(p, origen, fuente) {
  const tabla = tablaDe(fuente);
  perfil(p).mapeos[`${origen}:${firmaEncabezados(tabla.encabezados)}`] = fuente.mapeo;
}

// ——— Reglas ———
export const reglasDeCorrida = p => conc(p).reglas;
export const reglasDelPerfil = p => perfil(p).reglas;
export const todasLasReglas = p => [...reglasDelPerfil(p), ...reglasDeCorrida(p)];

// Los controles fijos (tolerancias, campos, signos) reemplazan la regla del mismo tipo de esta corrida.
export function fijarRegla(p, regla) {
  const v = validarRegla({ ...regla, alcance: 'corrida' });
  if (!v.ok) return v;
  // El control manda sobre cualquier regla anterior del mismo tipo en esta corrida (también las de una instrucción).
  const mismo = r => r.tipo === v.regla.tipo && (r.tipo !== 'signo_notas_credito' || r.origen === v.regla.origen || v.regla.origen === 'ambos') && (r.tipo !== 'tolerancia_monto' || !r.cuit);
  conc(p).reglas = [...conc(p).reglas.filter(r => !mismo(r)), v.regla];
  return v;
}

export function agregarRegla(p, regla, { guardarEnPerfil = false, deInstruccion = '' } = {}) {
  const v = validarRegla({ ...regla, alcance: guardarEnPerfil ? 'perfil' : 'corrida' });
  if (!v.ok) return v;
  const r = { ...v.regla, ...(deInstruccion ? { deInstruccion } : {}), creada: new Date().toISOString() };
  (guardarEnPerfil ? perfil(p).reglas : conc(p).reglas).push(r);
  return { ok: true, regla: r };
}

export const configActual = p => configuracion(todasLasReglas(p));

// ——— Conciliación ———
export function listo(p, lado = conc(p).lado) {
  const f = conc(p).fuentes[lado];
  return !!(f.sistema?.confirmado && f.arca?.confirmado);
}

const resultadosCache = new WeakMap();
export function resultadoDe(p, lado = conc(p).lado) {
  if (!listo(p, lado)) return null;
  const c = conc(p), f = c.fuentes[lado];
  const sistema = registrosDe(f.sistema, 'sistema', lado).registros;
  const arca = registrosDe(f.arca, 'arca', lado).registros;
  const reglas = todasLasReglas(p);
  const decisiones = c.decisiones.filter(d => d.lado === lado);
  const clave = JSON.stringify([f.sistema.mapeo, f.arca.mapeo, f.sistema.cargado, f.arca.cargado, reglas, decisiones]);
  let porLado = resultadosCache.get(p);
  if (!porLado) resultadosCache.set(p, porLado = {});
  if (porLado[lado]?.clave !== clave) porLado[lado] = { clave, valor: conciliar({ sistema, arca, reglas, decisiones }) };
  return porLado[lado].valor;
}

// ——— Auditoría ———
export function registrarCorrida(p) {
  const c = conc(p), lado = c.lado, f = c.fuentes[lado];
  const res = resultadoDe(p, lado);
  if (!res) return;
  const cfg = configActual(p);
  c.corridas.push({
    id: nuevoId('corr'), fecha: new Date().toISOString(), periodo: p.mes, lado, empresa: clienteDe(p)?.nombre,
    sistemaNombre: perfil(p).sistemaNombre,
    archivos: [['sistema', f.sistema], ['arca', f.arca]].map(([origen, x]) => ({ origen, nombre: x.nombre, filas: tablaDe(x).datos.length, mapeo: x.mapeo })),
    reglas: [...REGLAS_POR_DEFECTO, ...todasLasReglas(p)].map(r => ({ ...r })),
    tolerancias: { importe: cfg.tolMonto, porcentaje: cfg.tolPct, dias: cfg.tolDias, obligatorios: [...cfg.obligatorios] },
    motor: VERSION_MOTOR, modelos: [...modelosUsados],
    decisiones: c.decisiones.filter(d => d.lado === lado).length,
    resumen: { ...res.resumen },
  });
  guardar();
}

export function registrarDecision(p, decision) {
  const c = conc(p);
  const d = { id: nuevoId('dec'), lado: c.lado, fecha: new Date().toISOString(), usuario: 'usuario de este navegador', ...decision };
  c.decisiones.push(d);
  guardar();
  return d;
}

export function deshacerDecision(p, id) {
  const c = conc(p);
  const d = c.decisiones.find(x => x.id === id);
  c.decisiones = c.decisiones.filter(x => x.id !== id);
  if (d) c.deshechas = [...(c.deshechas ?? []), { ...d, deshecha: new Date().toISOString() }];
  guardar();
}
