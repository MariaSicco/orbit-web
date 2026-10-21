// Motor de conciliación sistema contable (CHESS u otro ERP) ↔ ARCA. Todo determinístico.
//
// Orden:
//   1. Reglas: exclusiones, alias y signo de las notas de crédito.
//   2. Duplicados dentro de cada fuente (los repetidos no se cruzan: quedan en estado "duplicado").
//   3. Decisiones del usuario ("son el mismo" / "no son el mismo").
//   4. Nivel 1   CUIT + tipo + punto de venta + número.
//   5. Nivel 1b  CUIT + punto de venta + número, cuando un lado no informa el tipo.
//   6. Nivel 2   reglas explícitas para datos incompletos, solo si hay un único candidato de cada lado:
//                CUIT + número + total (sin punto de venta) · CUIT + fecha + total (sin número).
//   7. Nivel 3   candidatos: mismo CUIT (o alias) y señales parecidas → "requiere revisión". Nunca automático.
//   Lo que queda: solo en ARCA / solo en el sistema.
//
// Relación uno a uno: cada registro se usa una sola vez. Un registro de ARCA que es candidato de varios
// registros del sistema queda marcado como relación múltiple.

import { claveComprobante, claveSinTipo } from './claves.js';
import { detectarDuplicados, MOTIVO_DUPLICADO } from './duplicados.js';
import { configuracion, excluido } from './reglas.js';
import { signoDeTipo, diasEntre } from './normalizar.js';
import { infoTipo } from '../tipos.js';
import { motivoDe } from './explicar.js';

export const VERSION_MOTOR = 'orbit-conciliacion 2.0.0';
export const ESTADOS = ['diferencia', 'revision', 'solo_arca', 'solo_sistema', 'duplicado', 'coincide'];
const MONTOS = ['total', 'neto', 'iva', 'noGravado', 'exento', 'otrosTributos'];

export function conciliar({ sistema = [], arca = [], reglas = [], decisiones = [] } = {}) {
  const cfg = configuracion(reglas);
  const excluidos = [];
  const preparar = (lista, origen) => lista.filter(r => {
    if (excluido(cfg, r)) { excluidos.push(r.id); return false; }
    return true;
  }).map(r => prepararRegistro(r, cfg, origen));
  const S = preparar(sistema, 'sistema');
  const A = preparar(arca, 'arca');
  const resultados = [];

  // 2. Duplicados
  const duplicados = [...detectarDuplicados(S, 'sistema'), ...detectarDuplicados(A, 'arca')];
  const sacados = new Set();
  const porId = new Map([...S, ...A].map(r => [r.id, r]));
  for (const g of duplicados) {
    if (g.tipo === 'posible') {
      for (const id of g.ids) porId.get(id).avisos.push(`${MOTIVO_DUPLICADO.posible} en ${g.origen === 'arca' ? 'ARCA' : 'el sistema'}`);
      continue;
    }
    for (const id of g.ids.slice(1)) {
      if (sacados.has(id)) continue;
      sacados.add(id);
      const r = porId.get(id);
      resultados.push(resultado({
        estado: 'duplicado', [g.origen]: r, metodo: 'duplicado',
        motivo: `${MOTIVO_DUPLICADO[g.tipo]} en ${g.origen === 'arca' ? 'ARCA' : 'el sistema'}`,
        duplicadoDe: g.ids[0], requiereRevision: true,
      }));
    }
  }
  const libresS = new Set(S.filter(r => !sacados.has(r.id)));
  const libresA = new Set(A.filter(r => !sacados.has(r.id)));
  const prohibido = new Set(decisiones.filter(d => d.tipo === 'distinto').map(d => `${d.sistemaId}|${d.arcaId}`));
  const puede = (s, a) => !prohibido.has(`${s.id}|${a.id}`);
  const emparejar = (s, a, metodo, nivel, extra = {}) => {
    libresS.delete(s); libresA.delete(a);
    resultados.push(resultadoPar(s, a, cfg, metodo, nivel, extra));
  };

  // 3. Decisiones del usuario
  for (const d of decisiones.filter(x => x.tipo === 'mismo')) {
    const s = [...libresS].find(r => r.id === d.sistemaId), a = [...libresA].find(r => r.id === d.arcaId);
    if (s && a) emparejar(s, a, 'decision_usuario', 0, { decision: d });
  }

  // 4 y 5. Claves
  for (const [clave, metodo, nivel] of [[claveComprobante, 'clave_exacta', 1], [claveSinTipo, 'clave_sin_tipo', 1]]) {
    const indice = new Map();
    for (const a of libresA) { const k = clave(a); if (k) (indice.get(k) ?? indice.set(k, []).get(k)).push(a); }
    for (const s of [...libresS]) {
      const k = clave(s);
      if (!k) continue;
      const cand = (indice.get(k) ?? []).filter(a => libresA.has(a) && puede(s, a));
      // Sin tipo: solo si a un lado le falta el tipo. Si los dos lo informan y difiere, es otro comprobante o un error: revisión.
      const ok = metodo === 'clave_exacta' ? cand : cand.filter(a => !s.tipo || !a.tipo);
      if (ok.length === 1) emparejar(s, ok[0], metodo, nivel);
    }
  }

  // 6. Reglas para datos incompletos (un único candidato de cada lado)
  const reglasIncompletas = [
    ['cuit_numero_total', (s, a) => s.numero != null && s.numero === a.numero && (!s.ptoVta || !a.ptoVta) && montoIgual(s.total, a.total, cfg, s.cuit)],
    ['cuit_fecha_total', (s, a) => (s.numero == null || a.numero == null) && fechaCerca(s.fecha, a.fecha, cfg) && montoIgual(s.total, a.total, cfg, s.cuit)],
  ];
  for (const [metodo, cumple] of reglasIncompletas) {
    for (const s of [...libresS]) {
      if (!s.cuit) continue;
      const cand = [...libresA].filter(a => a.cuit === s.cuit && puede(s, a) && cumple(s, a));
      if (cand.length !== 1) continue;
      const inversos = [...libresS].filter(x => x.cuit === cand[0].cuit && puede(x, cand[0]) && cumple(x, cand[0]));
      if (inversos.length === 1) emparejar(s, cand[0], metodo, 2, { unico: true });
    }
  }

  // 7. Candidatos → revisión
  const reservados = new Map();
  const pendientes = [];
  for (const s of libresS) {
    const cand = [...libresA].filter(a => puede(s, a) && esCandidato(s, a, cfg))
      .map(a => ({ arca: a, ...compararPar(s, a, cfg) }))
      .sort((x, y) => y.score - x.score).slice(0, 3);
    if (!cand.length) continue;
    pendientes.push({ s, cand });
    for (const c of cand) reservados.set(c.arca.id, (reservados.get(c.arca.id) ?? 0) + 1);
  }
  for (const { s, cand } of pendientes) {
    libresS.delete(s);
    const multiple = cand.some(c => reservados.get(c.arca.id) > 1);
    resultados.push(resultado({
      estado: 'revision', sistema: s, metodo: 'candidatos', nivel: 3,
      candidatos: cand.map(c => ({ ...c, motivo: motivoCandidato(s, c.arca) })),
      score: cand[0].score, senales: cand[0].senales,
      motivo: multiple ? 'Relación múltiple: un registro de ARCA es candidato de varios del sistema — revisar'
        : cand.length > 1 ? `${cand.length} candidatos posibles en ARCA` : motivoCandidato(s, cand[0].arca),
      requiereRevision: true, relacionMultiple: multiple,
    }));
  }
  for (const id of reservados.keys()) for (const a of libresA) if (a.id === id) libresA.delete(a);

  // Lo que quedó sin pareja
  for (const s of libresS) resultados.push(resultado({ estado: 'solo_sistema', sistema: s, metodo: 'sin_pareja', motivo: s.cuit ? 'No encontramos este comprobante en ARCA' : 'Sin CUIT en el sistema: no se puede buscar en ARCA', requiereRevision: !s.cuit }));
  for (const a of libresA) resultados.push(resultado({ estado: 'solo_arca', arca: a, metodo: 'sin_pareja', motivo: 'No encontramos este comprobante en el sistema' }));

  // Decisiones "ignorar"
  const ignorados = new Map(decisiones.filter(d => d.tipo === 'ignorar').map(d => [d.resultadoId, d]));
  for (const r of resultados) if (ignorados.has(r.id)) { r.ignorado = true; r.decision = ignorados.get(r.id); r.requiereRevision = false; }

  const orden = Object.fromEntries(ESTADOS.map((e, i) => [e, i]));
  resultados.sort((x, y) => orden[x.estado] - orden[y.estado] || (x.sistema ?? x.arca)?.fecha?.localeCompare((y.sistema ?? y.arca)?.fecha ?? '') || 0);
  return {
    resultados, duplicados, excluidos,
    resumen: resumir(resultados, S.length + A.length, excluidos.length),
    motor: VERSION_MOTOR,
  };
}

function prepararRegistro(r, cfg, origen) {
  const x = { ...r, avisos: [], ajustes: [] };
  if (!x.cuit && x.proveedorNorm && cfg.alias.has(x.proveedorNorm)) {
    x.cuit = cfg.alias.get(x.proveedorNorm);
    x.ajustes.push(`CUIT ${x.cuit} tomada del alias de "${x.proveedor}"`);
  }
  if (cfg.signos[origen] === 'por_tipo' && infoTipo(x.tipo)) {
    const signo = signoDeTipo(x.tipo);
    let cambio = false;
    for (const c of MONTOS) {
      if (x[c] == null) continue;
      const v = signo * Math.abs(x[c]);
      if (v !== x[c]) cambio = true;
      x[c] = v;
    }
    if (cambio) x.ajustes.push(signo === -1 ? 'Nota de crédito: importes llevados a negativo' : 'Importes llevados a positivo según el tipo');
  }
  return x;
}

const tolDe = (cfg, cuit) => cfg.tolMontoPorCuit.get(cuit) ?? cfg.tolMonto;
function dentroTolerancia(delta, s, a, cfg, cuit) {
  const abs = Math.abs(delta);
  if (abs <= tolDe(cfg, cuit)) return true;
  return cfg.tolPct > 0 && abs <= Math.max(Math.abs(s), Math.abs(a)) * cfg.tolPct / 100;
}
const montoIgual = (s, a, cfg, cuit) => s != null && a != null && dentroTolerancia(s - a, s, a, cfg, cuit);
const fechaCerca = (s, a, cfg) => s && a && Math.abs(diasEntre(s, a)) <= cfg.tolDias;

// Compara dos registros campo por campo. delta = sistema − ARCA.
export function compararPar(s, a, cfg) {
  const diferencias = [], toleradas = [], informativas = [], senales = [];
  let score = 0;
  const clasificar = (campo, item, tolerada) => {
    if (cfg.ignorar.has(campo) || !cfg.obligatorios.has(campo)) informativas.push(item);
    else if (tolerada) toleradas.push(item);
    else diferencias.push(item);
  };

  if (s.cuit && a.cuit && s.cuit === a.cuit) { score += 25; senales.push('CUIT exacto'); }
  else if (s.cuit !== a.cuit) diferencias.push({ campo: 'cuit', sistema: s.cuit, arca: a.cuit });
  if (s.tipo && a.tipo && s.tipo === a.tipo) { score += 10; senales.push('Tipo de comprobante exacto'); }
  else if (s.tipo && a.tipo) clasificar('tipo', { campo: 'tipo', sistema: s.tipo, arca: a.tipo }, false);
  if (s.ptoVta && a.ptoVta && s.ptoVta === a.ptoVta) { score += 15; senales.push('Punto de venta exacto'); }
  if (s.numero != null && s.numero === a.numero) { score += 25; senales.push('Número de comprobante exacto'); }
  else if (s.numero != null && a.numero != null) informativas.push({ campo: 'numero', sistema: s.numero, arca: a.numero });

  for (const campo of ['total', 'neto', 'iva']) {
    if (s[campo] == null || a[campo] == null) continue;
    const delta = s[campo] - a[campo];
    const item = { campo, sistema: s[campo], arca: a[campo], delta };
    if (delta !== 0 && s[campo] === -a[campo]) item.signoInvertido = true;
    const tol = delta !== 0 && !item.signoInvertido && dentroTolerancia(delta, s[campo], a[campo], cfg, s.cuit);
    if (campo === 'total') {
      if (delta === 0) { score += 15; senales.push('Total exacto'); }
      else if (tol) { score += 10; senales.push('Total dentro de la tolerancia'); }
    }
    if (delta !== 0) clasificar(campo, item, tol);
  }
  if (s.fecha && a.fecha) {
    const dias = diasEntre(s.fecha, a.fecha);
    if (dias === 0) { score += 10; senales.push('Fecha exacta'); }
    else {
      const tol = Math.abs(dias) <= cfg.tolDias;
      if (tol) { score += 5; senales.push(`Fecha dentro de la tolerancia (${Math.abs(dias)} ${Math.abs(dias) === 1 ? 'día' : 'días'})`); }
      clasificar('fecha', { campo: 'fecha', sistema: s.fecha, arca: a.fecha, delta: dias }, tol);
    }
  }
  if (s.proveedorNorm && a.proveedorNorm && s.proveedorNorm !== a.proveedorNorm) {
    informativas.push({ campo: 'proveedor', sistema: s.proveedor, arca: a.proveedor, nota: s.cuit === a.cuit ? 'Razón social distinta con el mismo CUIT' : '' });
  }
  return { diferencias, toleradas, informativas, senales, score: Math.min(score, 100) };
}

// Candidato: mismo CUIT (o, sin CUIT, mismo proveedor) y al menos una señal fuerte parecida.
function esCandidato(s, a, cfg) {
  const mismoTitular = s.cuit ? s.cuit === a.cuit : (s.proveedorNorm && s.proveedorNorm === a.proveedorNorm);
  if (!mismoTitular) return false;
  const totalCerca = s.total != null && a.total != null && Math.abs(Math.abs(s.total) - Math.abs(a.total)) <= Math.max(Math.abs(a.total) * 0.02, tolDe(cfg, s.cuit));
  const numeroCerca = s.numero != null && a.numero != null && (s.numero === a.numero || String(s.numero).slice(-4) === String(a.numero).slice(-4) || Math.abs(s.numero - a.numero) <= 2);
  const fechaCercana = s.fecha && a.fecha && Math.abs(diasEntre(s.fecha, a.fecha)) <= Math.max(7, cfg.tolDias);
  return (numeroCerca && (totalCerca || fechaCercana)) || (totalCerca && fechaCercana);
}

function motivoCandidato(s, a) {
  const mismoTotal = s.total === a.total, mismoNumero = s.numero === a.numero && s.ptoVta === a.ptoVta;
  if (!s.cuit) return 'Sin CUIT en el sistema: coincide el proveedor, revisar';
  if (mismoNumero && s.tipo && a.tipo && s.tipo !== a.tipo) return 'Mismo CUIT y número; tipo de comprobante distinto';
  if (mismoTotal && !mismoNumero) return 'Mismo CUIT e importe; número de comprobante distinto';
  if (mismoNumero) return 'Mismo CUIT y número; importes o fecha distintos';
  return 'Mismo CUIT con importe, número o fecha parecidos';
}

function resultadoPar(s, a, cfg, metodo, nivel, extra) {
  const c = compararPar(s, a, cfg);
  const score = Math.min(100, c.score + (extra.unico ? 20 : 0));
  const senales = extra.unico ? [...c.senales, 'Único candidato posible en los dos archivos'] : c.senales;
  const estado = c.diferencias.length ? 'diferencia' : 'coincide';
  const r = resultado({ estado, sistema: s, arca: a, metodo, nivel, ...c, score, senales, decision: extra.decision ?? null });
  r.motivo = motivoDe(r);
  r.requiereRevision = estado === 'diferencia' || (!extra.decision && etiquetaScore(score) === 'revision');
  if (estado === 'coincide' && r.requiereRevision) r.motivo = 'Coincide, pero con pocas señales: confirmá que es el mismo';
  return r;
}

function resultado(x) {
  const r = {
    id: `${x.sistema?.id ?? '-'}|${x.arca?.id ?? '-'}`,
    estado: x.estado, sistema: x.sistema ?? null, arca: x.arca ?? null,
    metodo: x.metodo, nivel: x.nivel ?? null, score: x.score ?? 0, etiqueta: etiquetaScore(x.score ?? 0),
    senales: x.senales ?? [], diferencias: x.diferencias ?? [], toleradas: x.toleradas ?? [], informativas: x.informativas ?? [],
    candidatos: x.candidatos ?? [], motivo: x.motivo ?? '', requiereRevision: !!x.requiereRevision,
    relacionMultiple: !!x.relacionMultiple, duplicadoDe: x.duplicadoDe ?? null,
    avisos: [...(x.sistema?.avisos ?? []), ...(x.arca?.avisos ?? [])],
    ajustes: [...(x.sistema?.ajustes ?? []).map(t => `Sistema: ${t}`), ...(x.arca?.ajustes ?? []).map(t => `ARCA: ${t}`)],
    decision: x.decision ?? null, ignorado: false,
  };
  if (!r.motivo && (r.estado === 'coincide' || r.estado === 'diferencia')) r.motivo = motivoDe(r);
  return r;
}

export const etiquetaScore = score => (score >= 85 ? 'fuerte' : score >= 60 ? 'posible' : 'revision');
export const NOMBRE_ETIQUETA = { fuerte: 'Coincidencia fuerte', posible: 'Coincidencia posible', revision: 'Revisión necesaria' };

function resumir(resultados, totalRegistros, excluidos) {
  const r = { total: totalRegistros, excluidos, ignorados: 0, pendientes: 0 };
  for (const e of ESTADOS) r[e] = 0;
  for (const x of resultados) {
    r[x.estado]++;
    if (x.ignorado) r.ignorados++;
    else if (x.estado !== 'coincide' || x.requiereRevision) r.pendientes++;
  }
  return r;
}
