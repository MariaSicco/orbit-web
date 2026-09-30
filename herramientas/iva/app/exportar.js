// Excel de la calculadora: resumen del período (con IVA por alícuota), Libro de IVA Compras y lo que quedó aparte.
// La exportación del conciliador está en conciliador-excel.js.

import { infoTipo } from '../engine/tipos.js';
import { columnas, totalesCompras, necesitaRevision, fueraDelResumen, porAlicuota } from '../engine/libro-compras.js';

const pesos = c => (c == null ? null : c / 100);

export async function exportarExcel({ periodo, cliente }) {
  if (!globalThis.ExcelJS) throw new Error('El generador de Excel no cargó. Revisá la conexión.');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Orbit IVA';
  hojaResumen(wb, periodo, cliente);
  hojasLiquidacion(wb, periodo, cliente);
  await descargar(wb, `Libro IVA Compras ${periodo.mes} - ${cliente.nombre}.xlsx`);
}

function hojaResumen(wb, periodo, cliente) {
  const ws = wb.addWorksheet('Resumen');
  ws.columns = [{ width: 32 }, { width: 18 }, { width: 18 }];
  ws.addRow([`${cliente.nombre}${cliente.cuit ? ` · CUIT ${cliente.cuit}` : ''} · Período ${periodo.mes}`]).font = { bold: true, size: 13 };
  ws.addRow(['Estimación para revisar. No es la declaración jurada.']);
  ws.addRow([]);
  const t = totalesCompras(periodo.fotos);
  const filas = [['IVA total (crédito fiscal)', t.iva], ['Neto gravado', t.neto], ['Percepciones IVA', t.percepciones], ['Ingresos Brutos', t.iibb], ['Percepciones municipales', t.municipales], ['Otros tributos / no gravado', t.otros], ['Total facturado', t.total]];
  for (const [n, v] of filas) ws.addRow([n, pesos(v)]).getCell(2).numFmt = '#,##0.00';
  ws.getRow(4).font = { bold: true };
  const alic = porAlicuota(periodo.fotos);
  if (alic.length) {
    ws.addRow([]);
    ws.addRow(['Por alícuota', 'Neto', 'IVA']).font = { bold: true };
    for (const a of alic) {
      const f = ws.addRow([`IVA ${String(a.tasa).replace('.', ',')}%`, pesos(a.neto), pesos(a.iva)]);
      f.getCell(2).numFmt = f.getCell(3).numFmt = '#,##0.00';
    }
  }
  ws.addRow([]);
  ws.addRow([`${t.facturas} facturas en el resumen${t.ventas ? ` · ${t.ventas} de venta aparte` : ''}${t.noA ? ` · ${t.noA} que no son A aparte` : ''}${t.paraRevisar ? ` · ${t.paraRevisar} para revisar` : ''}`]);
}

function hojasLiquidacion(wb, periodo, cliente) {
  const compras = periodo.fotos.filter(f => !fueraDelResumen(f));
  const ventas = periodo.fotos.filter(f => fueraDelResumen(f) === 'venta');
  const noA = periodo.fotos.filter(f => fueraDelResumen(f) === 'no_a');
  const hoja = (nombre, lista, conTotales) => {
    const ws = wb.addWorksheet(nombre);
    ws.addRow([`${cliente.nombre} · CUIT ${cliente.cuit} · Período ${periodo.mes}`]).font = { bold: true };
    ws.addRow(['Estimación para revisar. No es la declaración jurada.']);
    ws.addRow([]);
    const enc = ws.addRow(['Fecha', 'Proveedor', 'CUIT', 'Comprobante', 'Neto gravado', 'IVA', 'Ing. Brutos', 'Percepciones IVA', 'Percepciones municipales', 'Otros / no gravado', 'Total', 'Δ', 'Revisar']);
    enc.font = { bold: true };
    [12, 30, 14, 26, 15, 14, 13, 15, 15, 16, 15, 11, 9].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
    const t = totalesCompras(lista);
    for (const c of lista) {
      const k = columnas(c);
      const fila = ws.addRow([
        c.fecha, c.denominacion, c.cuit, `${infoTipo(c.tipo)?.nombre ?? c.tipo} ${String(c.ptoVta ?? '').padStart(4, '0')}-${Number.isFinite(c.numero) ? String(c.numero).padStart(8, '0') : ''}`,
        pesos(k.neto), pesos(k.iva), pesos(k.iibb), pesos(k.percepciones), pesos(k.municipales), pesos(k.otros), pesos(k.total),
        Math.abs(k.delta) > 100 ? pesos(k.delta) : 0, necesitaRevision(c) ? 'Sí' : '',
      ]);
      for (let col = 5; col <= 12; col++) fila.getCell(col).numFmt = '#,##0.00';
    }
    if (conTotales) {
      const tot = ws.addRow(['Totales', '', '', '', pesos(t.neto), pesos(t.iva), pesos(t.iibb), pesos(t.percepciones), pesos(t.municipales), pesos(t.otros), pesos(t.total)]);
      tot.font = { bold: true };
      for (let col = 5; col <= 11; col++) tot.getCell(col).numFmt = '#,##0.00';
    }
    ws.views = [{ state: 'frozen', ySplit: 4 }];
  };
  hoja('Libro IVA Compras', compras, true);
  if (ventas.length) hoja('Ventas (aparte)', ventas.map(v => ({ ...v, lado: 'compra' })), false);
  if (noA.length) hoja('No son A (aparte)', noA, false);
}

async function descargar(wb, nombreArchivo) {
  const buffer = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nombreArchivo.replace(/[\\/:*?"<>|]/g, '');
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
