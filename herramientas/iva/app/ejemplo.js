// Período de ejemplo con datos 100% ficticios: para ver el recorrido completo en menos de 15 minutos (J1).
// Las dos "fotos" usan lecturas precargadas (no corre el OCR) para que el ejemplo abra al instante.

import { S, guardar, nuevoId, nuevoPeriodo } from './estado.js';
import { filasDeCSV } from '../engine/conciliacion/tabla.js';
import { conc, crearFuente } from './conciliador-datos.js';
import { combinarLectura } from '../engine/lectura.js';
import { leerQrArca } from '../engine/qr.js';

const BASE = new URL('../casos/', import.meta.url);
const texto = async ruta => (await fetch(new URL(ruta, BASE))).text();

export async function cargarEjemplo() {
  let cliente = S.clientes.find(c => c.cuit === '30799999990');
  if (!cliente) {
    cliente = { id: nuevoId('cli'), cuit: '30799999990', nombre: 'Cliente de prueba SRL (ejemplo)' };
    S.clientes.push(cliente);
  }
  S.periodos = S.periodos.filter(p => !(p.clienteId === cliente.id && p.mes === '2026-08'));
  const p = nuevoPeriodo(cliente.id, '2026-08');
  S.actual.clienteId = cliente.id; S.actual.periodoId = p.id;

  // Conciliador: los cuatro archivos de ejemplo pasan por el mismo camino que un archivo subido (detección de columnas incluida)
  const c = conc(p);
  const archivos = {
    compra: { sistema: 'sistema-compras-2026-08.csv', arca: 'arca-recibidos-2026-08-formato-2025-09.csv' },
    venta: { sistema: 'sistema-ventas-2026-08.csv', arca: 'arca-emitidos-2026-08-formato-2025-09.csv' },
  };
  for (const lado of ['compra', 'venta']) {
    for (const origen of ['sistema', 'arca']) {
      const nombre = archivos[lado][origen];
      const contenido = await texto(`archivos/${nombre}`);
      const fuente = crearFuente(p, origen, { name: `${nombre} (ejemplo)`, size: contenido.length }, filasDeCSV(contenido));
      fuente.confirmado = true;
      c.fuentes[lado][origen] = fuente;
    }
  }

  // Calculadora: tres compras en foto (una con percepciones, una sin QR, una factura C) y una venta ya aprobada.
  for (const n of ['25', '04', '22']) {
    const { esperado, qrTexto } = JSON.parse(await texto(`fotos/${n}.json`));
    const r = combinarLectura(esperado, qrTexto ? leerQrArca(qrTexto) : null, { cuitCliente: cliente.cuit, id: nuevoId('foto') });
    p.fotos.push({ ...r.comprobante, imagenUrl: new URL(`fotos/${n}.png`, BASE).href, nombreArchivo: `ejemplo-${n}.png`, alertas: r.alertas, revisionRapida: r.revisionRapida });
  }
  const venta = combinarLectura({
    es_comprobante: true, tipo_codigo: '001', letra: 'A', punto_venta: 2, numero: 777, fecha: '2026-08-10',
    cuit_emisor: cliente.cuit, razon_social_emisor: 'Venta a Cliente Final Uno SA', cuit_receptor: '30755555556', moneda: 'PES', cotizacion: 1,
    alicuotas: [{ tasa: 21, neto: 900000, iva: 189000 }], no_gravado: null, exento: null, percepciones_iva: null, percepciones_iibb: null,
    otros_tributos: null, total: 1089000, cae: null, campos_dudosos: [],
  }, null, { cuitCliente: cliente.cuit, id: nuevoId('foto') });
  p.fotos.push({ ...venta.comprobante, origen: 'manual', denominacion: 'Cliente Final Uno SA', estadoRevision: 'aprobado', alertas: [] });
  p.archivos.fotos = '3 fotos de ejemplo y una venta cargada a mano';
  S.actual.periodoId = p.id;
  guardar();
}
