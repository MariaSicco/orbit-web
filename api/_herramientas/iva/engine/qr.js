// QR de las facturas electrónicas (RG 4291 / RG 4892/2020).
// Formato oficial: https://www.arca.gob.ar/fe/qr/?p={JSON en Base64}. Los comprobantes viejos usan afip.gob.ar.
// El QR identifica el comprobante y su total, pero NO trae neto, IVA por alícuota ni percepciones.
// Este módulo solo interpreta el texto: decodificar la imagen lo hace la interfaz (BarcodeDetector o jsQR).

import { aCentavos } from './dinero.js';
import { normalizarCodigo } from './tipos.js';

function base64aTexto(b64) {
  let s = b64.replace(/\s/g, '').replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function leerQrArca(texto) {
  const t = String(texto ?? '').trim();
  if (!/^https?:\/\/(www\.)?(arca|afip)\.gob\.ar\/fe\/qr\/?\?/i.test(t)) return null;
  let p;
  try { p = new URL(t).searchParams.get('p'); } catch { return null; }
  if (!p) return null;
  let d;
  try { d = JSON.parse(base64aTexto(p)); } catch { return null; }
  if (!d || typeof d !== 'object' || !d.cuit || !d.tipoCmp || !d.nroCmp) return null;
  return {
    version: d.ver,
    fecha: String(d.fecha ?? '').slice(0, 10),
    cuit: String(d.cuit).replace(/\D/g, ''),
    ptoVta: parseInt(d.ptoVta, 10) || 0,
    tipo: normalizarCodigo(d.tipoCmp),
    numero: parseInt(d.nroCmp, 10),
    total: aCentavos(d.importe),
    moneda: d.moneda || 'PES',
    cotizacion: Number(d.ctz) || 1,
    tipoDocReceptor: d.tipoDocRec ?? null,
    docReceptor: d.nroDocRec != null ? String(d.nroDocRec) : null,
    tipoAutorizacion: d.tipoCodAut ?? null,
    cae: d.codAut != null ? String(d.codAut) : null,
  };
}
