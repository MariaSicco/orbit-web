// Exportación de la conciliación: XLSX con 8 pestañas (se abre igual en Google Sheets) y CSV plano.
// Cada fila conserva los valores de origen, el resultado, la diferencia, el motivo y la decisión humana.

import { clienteDe } from './estado.js';
import { conc, perfil, resultadoDe, todasLasReglas, tablaDe } from './conciliador-datos.js';
import { describirRegla, REGLAS_POR_DEFECTO } from '../engine/conciliacion/reglas.js';
import { NOMBRE_ETIQUETA, VERSION_MOTOR } from '../engine/conciliacion/motor.js';
import { detalleDiferencia } from '../engine/conciliacion/explicar.js';
import { infoTipo } from '../engine/tipos.js';
import { METODOS } from './conciliador.js';

const COLORES = { coincide: null, solo_arca: 'B6D7A8', solo_sistema: 'F9CB9C', diferencia: 'D5A6E6', revision: 'FFE599', duplicado: 'D9D9D9' };
const pesos = c => (c == null ? null : c / 100);

function nombresEstado(p) {
  const s = perfil(p).sistemaNombre || 'Sistema';
  return { coincide: 'Coincide', solo_arca: 'Solo ARCA', solo_sistema: `Solo ${s}`, diferencia: 'Diferencia', revision: 'Requiere revisión', duplicado: 'Duplicado' };
}

const DECISION = { mismo: 'El usuario marcó que son el mismo', distinto: 'El usuario marcó que no son el mismo', ignorar: 'Ignorado por el usuario' };

function filaPlana(p, r) {
  const c = conc(p);
  const s = r.sistema, a = r.arca ?? r.candidatos[0]?.arca ?? null;
  const d = r.sistema?.total != null && r.arca?.total != null ? r.sistema.total - r.arca.total : null;
  const lado = x => (x ? [x.fila, x.fecha, infoTipo(x.tipo)?.nombre ?? x.tipo ?? '', x.ptoVta ?? '', x.numero ?? '', x.cuit ?? '', x.proveedor ?? '', pesos(x.neto), pesos(x.iva), pesos(x.total)] : Array(10).fill(null));
  return [
    nombresEstado(p)[r.estado] + (r.ignorado ? ' (ignorado)' : ''), r.motivo,
    ...lado(s), ...lado(a),
    pesos(d), [...r.diferencias, ...r.toleradas].map(detalleDiferencia).join(' | '),
    METODOS[r.metodo] ?? r.metodo, r.sistema && (r.arca || r.candidatos.length) ? `${NOMBRE_ETIQUETA[r.etiqueta]} (${r.score}/100)` : '',
    r.senales.join(', '), r.decision ? `${DECISION[r.decision.tipo]} · ${new Date(r.decision.fecha).toLocaleString('es-AR')}` : '',
    c.notas[r.id] ?? '', [...r.avisos, ...r.ajustes].join(' | '),
    ...(s?.crudo ? [JSON.stringify(s.crudo)] : ['']), ...(a?.crudo ? [JSON.stringify(a.crudo)] : ['']),
  ];
}

function encabezados(p) {
  const s = perfil(p).sistemaNombre || 'Sistema';
  const lado = n => [`${n} fila`, `${n} fecha`, `${n} tipo`, `${n} pto. vta.`, `${n} número`, `${n} CUIT`, `${n} proveedor`, `${n} neto`, `${n} IVA`, `${n} total`];
  return ['Estado', 'Motivo', ...lado(s), ...lado('ARCA'), `Diferencia total (${s} − ARCA)`, 'Detalle de diferencias', 'Método de match', 'Coincidencia', 'Señales', 'Decisión humana', 'Nota', 'Avisos y ajustes', `Valores originales ${s}`, 'Valores originales ARCA'];
}

export async function exportarConciliacion(p) {
  if (!globalThis.ExcelJS) throw new Error('El generador de Excel no cargó. Revisá la conexión.');
  const res = resultadoDe(p);
  if (!res) throw new Error('Todavía no hay una conciliación para exportar.');
  const c = conc(p), cliente = clienteDe(p), nombres = nombresEstado(p);
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Orbit IVA';

  // 1. Resumen
  const ws = wb.addWorksheet('Resumen');
  ws.columns = [{ width: 34 }, { width: 18 }];
  ws.addRow([`Conciliación ${c.lado === 'compra' ? 'de compras' : 'de ventas'} · ${cliente.nombre}${cliente.cuit ? ` · CUIT ${cliente.cuit}` : ''} · ${p.mes}`]).font = { bold: true, size: 13 };
  ws.addRow([`Generado ${new Date().toLocaleString('es-AR')} · ${VERSION_MOTOR}`]);
  ws.addRow([]);
  const rs = res.resumen;
  for (const [t, n] of [['Total de registros', rs.total], ['Conciliados', rs.coincide], ['Solo ARCA', rs.solo_arca], [nombres.solo_sistema, rs.solo_sistema], ['Con diferencias', rs.diferencia], ['Requieren revisión', rs.revision], ['Duplicados', rs.duplicado], ['Excluidos por reglas', rs.excluidos], ['Ignorados por decisión', rs.ignorados], ['Necesitan atención', rs.pendientes]]) ws.addRow([t, n]);
  ws.getRow(4).font = { bold: true };

  // 2 a 7. Una pestaña por estado
  const hoja = (nombre, lista, estado) => {
    const h = wb.addWorksheet(nombre);
    const enc = h.addRow(encabezados(p));
    enc.font = { bold: true };
    h.views = [{ state: 'frozen', ySplit: 1 }];
    encabezados(p).forEach((_, i) => { h.getColumn(i + 1).width = i < 2 ? 32 : i > 21 ? 40 : 14; });
    for (const r of lista) {
      const fila = h.addRow(filaPlana(p, r));
      for (const col of [10, 11, 12, 20, 21, 22, 23]) fila.getCell(col).numFmt = '#,##0.00';
      const color = COLORES[estado ?? r.estado];
      if (color) fila.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${color}` } };
    }
    if (!lista.length) h.addRow(['Sin registros en este estado.']);
  };
  const de = e => res.resultados.filter(r => r.estado === e);
  hoja('Coinciden', de('coincide'), 'coincide');
  hoja('Solo ARCA', de('solo_arca'), 'solo_arca');
  hoja(nombres.solo_sistema.slice(0, 31), de('solo_sistema'), 'solo_sistema');
  hoja('Diferencias', de('diferencia'), 'diferencia');
  hoja('Revisión manual', res.resultados.filter(r => r.estado === 'revision' || (r.requiereRevision && r.estado !== 'duplicado' && r.estado !== 'diferencia')), 'revision');
  hoja('Duplicados', de('duplicado'), 'duplicado');

  // 8. Reglas aplicadas + auditoría
  const wr = wb.addWorksheet('Reglas aplicadas');
  wr.columns = [{ width: 28 }, { width: 90 }];
  const titulo = t => { wr.addRow([]); wr.addRow([t]).font = { bold: true }; };
  titulo('Reglas (se aplican en este orden; si dos son del mismo tipo, manda la última)');
  for (const r of [...REGLAS_POR_DEFECTO, ...todasLasReglas(p)]) wr.addRow([{ perfil: 'Guardada para la empresa', corrida: 'Solo esta conciliación', defecto: 'Por defecto' }[r.alcance] ?? r.alcance, describirRegla(r) + (r.deInstruccion ? ` (instrucción: "${r.deInstruccion}")` : '')]);
  titulo('Archivos');
  for (const origen of ['sistema', 'arca']) {
    const f = c.fuentes[c.lado][origen];
    wr.addRow([origen === 'arca' ? 'ARCA' : perfil(p).sistemaNombre, `${f.nombre} · ${tablaDe(f).datos.length} filas · cargado ${new Date(f.cargado).toLocaleString('es-AR')} · columnas: ${Object.entries(f.mapeo).filter(([k]) => k !== 'alicuotas').map(([k, h]) => `${k}=${h}`).join(', ')}`]);
  }
  titulo('Decisiones manuales');
  const decisiones = c.decisiones.filter(d => d.lado === c.lado);
  if (!decisiones.length) wr.addRow(['', 'Ninguna']);
  for (const d of decisiones) wr.addRow([new Date(d.fecha).toLocaleString('es-AR'), `${DECISION[d.tipo]} · sistema ${d.sistemaId ?? '—'} · ARCA ${d.arcaId ?? '—'} · ${d.usuario}`]);
  for (const d of c.deshechas ?? []) if (d.lado === c.lado) wr.addRow([new Date(d.deshecha).toLocaleString('es-AR'), `Deshecha: ${DECISION[d.tipo]} (${d.sistemaId ?? d.resultadoId})`]);
  titulo('Conciliaciones (auditoría)');
  for (const x of c.corridas.filter(y => y.lado === c.lado)) {
    wr.addRow([new Date(x.fecha).toLocaleString('es-AR'), `Período ${x.periodo} · ${x.empresa} · ${x.motor} · IA: ${x.modelos.join(', ') || 'no se usó'} · tolerancias: $${x.tolerancias.importe / 100}, ${x.tolerancias.porcentaje}%, ${x.tolerancias.dias} días · ${x.resumen.coincide} conciliados, ${x.resumen.pendientes} pendientes · ${x.decisiones} decisiones`]);
  }
  await descargar(wb, `Conciliacion ARCA ${c.lado === 'compra' ? 'compras' : 'ventas'} ${p.mes} - ${cliente.nombre}.xlsx`);
}

export function exportarCsv(p) {
  const res = resultadoDe(p);
  if (!res) throw new Error('Todavía no hay una conciliación para exportar.');
  const celda = v => {
    const s = v == null ? '' : typeof v === 'number' ? String(v).replace('.', ',') : String(v);
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lineas = [encabezados(p), ...res.resultados.map(r => filaPlana(p, r))].map(f => f.map(celda).join(';'));
  const blob = new Blob(['﻿' + lineas.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  bajar(blob, `Conciliacion ARCA ${conc(p).lado === 'compra' ? 'compras' : 'ventas'} ${p.mes} - ${clienteDe(p).nombre}.csv`);
}

async function descargar(wb, nombre) {
  const buffer = await wb.xlsx.writeBuffer();
  bajar(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), nombre);
}

function bajar(blob, nombre) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nombre.replace(/[\\/:*?"<>|]/g, '');
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
