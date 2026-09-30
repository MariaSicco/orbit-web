// Lectura de fotos y PDF en el navegador, sin costo: QR (ZXing) + texto (del PDF, o OCR con Tesseract) + reglas + controles.
// La lectura con IA (server/extraer.js) entra acá cuando exista el backend: solo para lo que los controles no aprueben.

import { leerQrArca } from '../engine/qr.js';
import { leerTextoOcr } from '../engine/ocr-reglas.js';
import { combinarLectura } from '../engine/lectura.js';
import { nuevoId } from './estado.js';
import { limpiarParaOcr, unirLecturas, DESPLAZAMIENTOS } from '../engine/imagen.js';
import { cuitValido } from '../engine/cuit.js';
import { buscarQr, cargarImagen, achicar, LADO_QR } from './escanear-qr.js';
import { ia, iaDisponible, leerConIa, leerPdfConIa, modoCuenta } from './ia.js';

let worker;
const conLimite = (promesa, ms, mensaje) => Promise.race([promesa, new Promise((_, no) => setTimeout(() => no(new Error(mensaje)), ms))]);

async function ocr() {
  if (!globalThis.Tesseract) throw new Error('El lector de texto no cargó. Revisá la conexión.');
  worker ??= conLimite(Tesseract.createWorker('spa'), 90000, 'El lector de texto tardó demasiado en cargar. Completalo a mano o reintentá.')
    .catch(e => { worker = null; throw e; });
  return worker;
}

const PDFJS = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/';
let pdfjs;
async function cargarPdfjs() {
  if (!pdfjs) {
    pdfjs = await conLimite(import(PDFJS + 'pdf.min.mjs'), 30000, 'El lector de PDF no cargó. Revisá la conexión.');
    pdfjs.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.mjs';
  }
  return pdfjs;
}

// Arma líneas de texto con las piezas del PDF: misma altura = misma línea, ordenadas de izquierda a derecha.
export function lineasDelPdf(items) {
  const filas = new Map();
  for (const it of items) {
    if (!it.str?.trim()) continue;
    const y = Math.round(it.transform[5] / 3);
    if (!filas.has(y)) filas.set(y, []);
    filas.get(y).push(it);
  }
  return [...filas.entries()].sort((a, b) => b[0] - a[0])
    .map(([, fila]) => fila.sort((a, b) => a.transform[4] - b.transform[4]).map(it => it.str.trim()).join(' '))
    .join('\n');
}


export function comprobanteManual({ cuitCliente, imagenUrl = null, nombreArchivo = '', alertas = [] } = {}) {
  return {
    id: nuevoId('foto'), origen: imagenUrl ? 'foto' : 'manual', lado: 'compra', nombreArchivo, imagenUrl,
    tipo: '', ptoVta: null, numero: null, fecha: '', cuit: '', denominacion: '', moneda: 'PES', cotizacion: 1,
    total: 0, alicuotas: [], tributos: [], noGravado: 0, exento: 0,
    estadoRevision: 'pendiente', confianza: {}, alertas, cuitCliente,
  };
}

// Lee una imagen varias veces (original y limpia con distintos umbrales) y une los resultados campo por campo.
// `grande`: la imagen en tamaño casi original (para el QR). El texto se lee sobre una copia de 2000 px.
// `avisar(texto)` informa el progreso a la pantalla.
async function leerImagenVariasVeces(grande, cuitCliente, avisar = () => {}, qrTexto = null) {
  const c = achicar(grande, 2000);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const pixeles = ctx.getImageData(0, 0, c.width, c.height);
  const leer = async imagen => (await conLimite(lector.recognize(imagen), 60000, 'La lectura tardó demasiado. Completalo a mano o reintentá.')).data.text;
  if (!worker) avisar('Preparando el lector de texto (la primera vez tarda hasta un minuto)…');
  const lector = await ocr();
  const pasos = DESPLAZAMIENTOS.length + 1;
  avisar(`Leyendo el texto (1 de ${pasos})…`);
  const lecturas = [leerTextoOcr(await leer(c), { cuitCliente })];
  for (const [n, d] of DESPLAZAMIENTOS.entries()) {
    avisar(`Leyendo el texto (${n + 2} de ${pasos})…`);
    const limpia = limpiarParaOcr(pixeles.data, c.width, c.height, { desplazamiento: d, altoMinimo: 1600 });
    const lienzo = document.createElement('canvas');
    lienzo.width = limpia.ancho; lienzo.height = limpia.alto;
    lienzo.getContext('2d').putImageData(new ImageData(limpia.data, limpia.ancho, limpia.alto), 0, 0);
    lecturas.push(leerTextoOcr(await leer(lienzo), { cuitCliente }));
  }
  return { lectura: unirLecturas(lecturas, cuitValido), qrTexto };
}

// Una imagen de factura (foto o PDF escaneado): QR en el teléfono, después IA (decisión de Majo, 2026-09-29: todas las
// fotos pasan por la IA) y, si la IA no está disponible, el lector del teléfono con un aviso del motivo.
async function leerImagen(grande, { cuitCliente, avisar = () => {}, imagenUrl, nombreArchivo, origen }) {
  avisar('Buscando el QR…');
  const qrTexto = await buscarQr(grande, { profundo: true }).catch(() => null);
  let motivo = modoCuenta
    ? ia.estado === 'activa' ? 'te quedaste sin lecturas con IA (podés sumar más desde arriba)' : 'para leer con IA tenés que entrar con tu cuenta de Orbit'
    : ia.estado === 'activa' ? `llegaste al límite de ${ia.limite} lecturas con IA de hoy` : 'la lectura con IA no está disponible en este navegador (abrí el link de acceso que te pasaron)';
  if (iaDisponible()) {
    avisar('Leyendo con IA…');
    const r = await conLimite(leerConIa(grande, { qrTexto, cuitCliente }), 70000, 'la IA tardó demasiado')
      .catch(e => ({ ok: false, error: e.message }));
    if (r.comprobante) {
      return { ...r.comprobante, id: nuevoId('foto'), origen, nombreArchivo, imagenUrl, alertas: r.alertas ?? [], revisionRapida: r.revisionRapida, conQr: !!qrTexto, conIa: true };
    }
    if (r.ok === false && r.alertas?.length && !r.error) return comprobanteManual({ cuitCliente, imagenUrl, nombreArchivo, alertas: r.alertas });
    motivo = r.error ?? 'la IA no respondió';
  }
  const { lectura } = await leerImagenVariasVeces(grande, cuitCliente, avisar, qrTexto);
  const c = terminarLectura({ lectura, qrTexto, cuitCliente, imagenUrl, nombreArchivo, origen });
  c.alertas = [{ tipo: 'sin_ia', mensaje: `Se leyó con el lector del teléfono: ${motivo}. Revisá los importes con cuidado.` }, ...(c.alertas ?? [])];
  return c;
}

function terminarLectura({ texto, lectura: yaLeida, qrTexto, cuitCliente, imagenUrl, nombreArchivo, origen }) {
  const lectura = yaLeida ?? leerTextoOcr(texto, { cuitCliente });
  const r = combinarLectura(lectura, qrTexto ? leerQrArca(qrTexto) : null, { cuitCliente, id: nuevoId('foto') });
  if (!r.ok) return comprobanteManual({ cuitCliente, imagenUrl, nombreArchivo, alertas: r.alertas });
  return { ...r.comprobante, origen, nombreArchivo, imagenUrl, alertas: r.alertas, revisionRapida: r.revisionRapida, conQr: !!qrTexto };
}

// PDF: primero el texto que trae adentro (exacto). Si no trae (PDF escaneado), se lee la imagen de la página con OCR.
export async function leerPdf(archivo, { cuitCliente, avisar }) {
  const lib = await cargarPdfjs();
  const doc = await conLimite(lib.getDocument({ data: await archivo.arrayBuffer() }).promise, 30000, 'No pude abrir el PDF.');
  const pagina = await doc.getPage(1); // ARCA repite ORIGINAL/DUPLICADO en páginas siguientes: alcanza con la primera
  const vista = pagina.getViewport({ scale: 2 });
  const lienzo = document.createElement('canvas');
  lienzo.width = Math.round(vista.width); lienzo.height = Math.round(vista.height);
  await pagina.render({ canvasContext: lienzo.getContext('2d'), viewport: vista }).promise;
  const blob = await new Promise(ok => lienzo.toBlob(ok, 'image/png'));
  const imagenUrl = URL.createObjectURL(blob);
  const qrTexto = await buscarQr(lienzo, { profundo: true }).catch(() => null);
  const paginas = doc.numPages;
  // Varias páginas con IA activa: Claude lee el PDF completo (todas las páginas); el QR sale de la primera.
  if (paginas > 1 && iaDisponible() && archivo.size <= 3 * 1024 * 1024) {
    avisar?.(`Leyendo las ${paginas} páginas con IA…`);
    const r = await conLimite(leerPdfConIa(archivo, { qrTexto, cuitCliente }), 70000, 'la IA tardó demasiado').catch(e => ({ ok: false, error: e.message }));
    if (r.comprobante) {
      doc.destroy();
      return { ...r.comprobante, id: nuevoId('foto'), origen: 'pdf', nombreArchivo: archivo.name, imagenUrl, alertas: r.alertas ?? [], revisionRapida: r.revisionRapida, conQr: !!qrTexto, conIa: true };
    }
  }
  const avisoPaginas = paginas > 1 ? [{ tipo: 'pdf_varias_paginas', mensaje: `El PDF tiene ${paginas} páginas y se leyó la primera${iaDisponible() ? '' : ' (con la IA activa se leen todas)'}. Revisá los totales.` }] : [];
  const texto = lineasDelPdf((await pagina.getTextContent()).items);
  if (texto.replace(/\s/g, '').length < 40) {
    // PDF escaneado: sin texto adentro, se lee la imagen de la página (como una foto)
    doc.destroy();
    const c = await leerImagen(lienzo, { cuitCliente, avisar, imagenUrl, nombreArchivo: archivo.name, origen: 'pdf' });
    return { ...c, alertas: [...avisoPaginas, ...(c.alertas ?? [])] };
  }
  doc.destroy();
  const c = terminarLectura({ texto, qrTexto, cuitCliente, imagenUrl, nombreArchivo: archivo.name, origen: 'pdf' });
  return { ...c, alertas: [...avisoPaginas, ...(c.alertas ?? [])] };
}

export async function leerFoto(archivo, { cuitCliente, avisar }) {
  const imagenUrl = URL.createObjectURL(archivo);
  avisar?.('Abriendo la foto…');
  const lienzo = await conLimite(cargarImagen(archivo, LADO_QR), 25000, 'No pude abrir la imagen. ¿Es una foto válida?');
  return leerImagen(lienzo, { cuitCliente, avisar, imagenUrl, nombreArchivo: archivo.name, origen: 'foto' });
}
