// Convierte el texto de una factura (OCR de una foto, o texto de un PDF) en los mismos campos que devuelve la IA
// (ESQUEMA_LECTURA), con reglas por etiqueta. Reconoce dos formas de mostrar el IVA:
//   · "Neto gravado 21% $ X" + "IVA 21% $ Y" (una línea de neto por alícuota)
//   · "Importe Neto Gravado: $ X" + "IVA 21%: $ Y" + "IVA 10.5%: $ Z" (diseño de "Comprobantes en línea" de ARCA; SUPUESTO,
//     verificar con PDFs reales). Con varias alícuotas y un solo neto, el neto de cada una se deduce del IVA.
//   · "Subtotal $ X" + "IVA 21% $ Y" (el subtotal es el neto) y "IVA 10.5% en $ X  $ Y" (neto dentro de la línea del IVA).
//   · Tickets y facturas de controlador fiscal: "Nº 0008 - 00030280", "Fecha:", "Cód: 1", "FACTURA <A>", "TOTAL", importes con
//     punto decimal ("9000.00"). Si el IVA de una sola alícuota no se lee, se deduce de total − neto, solo si cierra con la tasa.
// Otros diseños de factura pueden no leerse: para esos está la IA.

import { aCentavos } from './dinero.js';

// Coma decimal ("1.234,56") o punto decimal con exactamente 2 decimales ("9000.00", no "7438.0165").
const IMPORTE = /-?\d{1,3}(?:\.\d{3})*,\d{2}(?![\d])|-?\d+,\d{2}(?![\d])|-?\d+\.\d{2}(?![\d.,])/;
const IMPORTE_G = new RegExp(IMPORTE.source, 'g');
const pesos = s => aCentavos(s) / 100;

export function leerTextoOcr(texto, { cuitCliente } = {}) {
  const lineas = texto.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const todo = lineas.join('\n');
  const cliente = String(cuitCliente ?? '').replace(/\D/g, '');

  const cuits = [...todo.matchAll(/\b(\d{2})[-\s.]?(\d{8})[-\s.]?(\d)\b/g)].map(m => m[1] + m[2] + m[3]);
  const cuitEmisor = cuits.find(c => c !== cliente) ?? null;

  // "Nº 0008 - 00030280": punto de venta de 4-5 dígitos y número de 8, juntos (tickets y muchas facturas)
  const nroJunto = todo.match(/\bN[uú]mero\s*:?\s*(\d{4,5})\s*[-\s]\s*(\d{8})\b/i) ?? todo.match(/\bN\S{0,3}\s*(\d{4,5})\s*-\s*(\d{8})\b/);
  const ptoVta = entero(todo.match(/Punto\s+de\s+Venta\s*:?\s*(\d{1,5})/i)) ?? (nroJunto ? parseInt(nroJunto[1], 10) : null);
  const numero = entero(todo.match(/Comp\.?\s*N(?:ro|°|º)\.?\s*:?\s*(\d{1,8})/i)) ?? (nroJunto ? parseInt(nroJunto[2], 10) : null);
  const f = todo.match(/Fecha\s+de\s+Emisi[oó]n\s*:?\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/i) ?? todo.match(/\bFecha\s*:?\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/i);
  const fecha = f ? `${f[3]}-${f[2].padStart(2, '0')}-${f[1].padStart(2, '0')}` : null;
  const cod = todo.match(/\bC[OÓ0]?D(?:IGO)?\.?\s*(?:N[O°º]\.?)?\s*:?\s*(\d{1,3})\b/i);
  const letra = (todo.match(/^\s*([ABCM])\s*$/m) || todo.match(/FACTURA\s*[<"(«]?\s*([ABCM])\s*[>")»]/i) || [])[1]?.toUpperCase() ?? null;

  let alicuotas = [];
  for (const [i, l] of lineas.entries()) {
    const n = l.match(/Neto\s+gravado\s+(\d{1,2}(?:[.,]\d{1,2})?)\s*%/i);
    if (!n) continue;
    const tasa = Number(n[1].replace(',', '.'));
    const neto = importeCerca(lineas, i, n.index + n[0].length);
    const ivaIdx = lineas.findIndex((x, j) => j > i && mismaTasa(x.match(/^\W*IVA\s*(\d{1,2}(?:[.,]\d{1,2})?)\s*%/i), tasa));
    const iva = ivaIdx === -1 ? null : importeCerca(lineas, ivaIdx, lineas[ivaIdx].indexOf('%') + 1);
    if (neto != null) alicuotas.push({ tasa, neto, iva });
  }
  if (!alicuotas.length) alicuotas = alicuotasConNetoEnLinea(lineas);
  if (!alicuotas.length) alicuotas = alicuotasConNetoUnico(lineas);

  const etiqueta = re => {
    const i = lineas.findIndex(l => re.test(l));
    return i === -1 ? null : importeCerca(lineas, i, (lineas[i].match(re).index ?? 0) + lineas[i].match(re)[0].length);
  };
  const usd = /\b(USD|U\$S|D[oó]lar)/i.test(todo);
  const ctz = todo.match(/Tipo\s+de\s+cambio\s*:?\s*([\d.,]+)/i);
  const cae = todo.match(/CAE\s*(?:N\S*)?\s*:?\s*(\d{14})/i);

  // "TOTAL" puede venir con basura del OCR adelante; nunca "Subtotal"
  const totalLeido = etiqueta(/IMPORTE\s+TOTAL/i) ?? etiqueta(/(?<!SUB\s?)\bTOTAL\b(?!\s*(ITEMS|ART))/i);
  const total = totalLeido == null ? null : Math.abs(totalLeido); // el OCR a veces pega guiones delante
  const tributosLeidos = [etiqueta(/no\s+gravado/i), etiqueta(/\bexento\b/i), etiqueta(/Percepci[oó]n\s+IVA/i), etiqueta(/Percepci[oó]n\s+(IIBB|Ingresos\s+Brutos)/i)];
  alicuotas = completarIva(alicuotas, total, tributosLeidos);
  return {
    es_comprobante: total != null || numero != null,
    tipo_codigo: cod ? cod[1].padStart(3, '0') : null,
    letra,
    punto_venta: ptoVta, numero, fecha,
    cuit_emisor: cuitEmisor, razon_social_emisor: lineas[0] ?? null, cuit_receptor: cliente || null,
    moneda: usd ? 'DOL' : 'PES',
    cotizacion: ctz ? pesos(ctz[1]) : 1,
    alicuotas,
    no_gravado: etiqueta(/no\s+gravado/i),
    exento: etiqueta(/\bexento\b/i),
    percepciones_iva: etiqueta(/Percepci[oó]n\s+IVA/i),
    percepciones_iibb: etiqueta(/Percepci[oó]n\s+(IIBB|Ingresos\s+Brutos)/i),
    percepciones_municipales: etiqueta(/Percepci[oó]n\s+(Municipal|Tasa\s+Municipal)/i),
    otros_tributos: etiqueta(/Importe\s+Otros\s+Tributos/i) || null,
    total,
    cae: cae ? cae[1] : null,
    campos_dudosos: [],
  };
}

const entero = m => (m ? parseInt(m[1], 10) : null);
const mismaTasa = (m, tasa) => !!m && Number(m[1].replace(',', '.')) === tasa;

// Una alícuota sin IVA leído: si es la única y hay total, IVA = total − neto − otros importes,
// y se acepta solo si coincide con neto × tasa (±$1). Si no cierra, la alícuota se descarta y queda para revisar.
function completarIva(alicuotas, total, otros) {
  const faltan = alicuotas.filter(a => a.iva == null);
  if (!faltan.length) return alicuotas;
  if (alicuotas.length === 1 && total != null) {
    const a = alicuotas[0];
    const iva = Math.round((total - a.neto - otros.reduce((s, x) => s + (x || 0), 0)) * 100) / 100;
    if (Math.abs(iva - a.neto * a.tasa / 100) <= 1) return [{ ...a, iva }];
  }
  return alicuotas.filter(a => a.iva != null);
}

// "IVA 10.5% en $ 13.442,07   $ 1.411,42": el neto va en la línea y el IVA es el importe que le sigue
// (en la misma línea o, si la foto está torcida, en la siguiente).
function alicuotasConNetoEnLinea(lineas) {
  const res = [];
  for (const [i, l] of lineas.entries()) {
    const m = l.match(new RegExp(`\\bIVA\\s*(\\d{1,2}(?:[.,]\\d{1,2})?)\\s*%\\s*(?:en|s\\/)\\s*\\$?\\s*(${IMPORTE.source})`, 'i'));
    if (!m) continue;
    const resto = l.slice(m.index + m[0].length);
    const ivaTexto = resto.match(IMPORTE)?.[0];
    const iva = ivaTexto != null ? pesos(ivaTexto) : importeCerca(lineas, i + 1, 0);
    if (iva != null) res.push({ tasa: Number(m[1].replace(',', '.')), neto: pesos(m[2]), iva });
  }
  return res;
}

// "Importe Neto Gravado: $ X" y líneas "IVA 21%: $ Y". Si hay una sola alícuota, el neto es X.
// Si hay varias, el neto de cada una se deduce de su IVA y tiene que sumar X (si no, no se arma y queda para revisar).
function alicuotasConNetoUnico(lineas) {
  let iNeto = lineas.findIndex(l => /Importe\s+Neto\s+Gravado/i.test(l));
  let desde = iNeto === -1 ? 0 : lineas[iNeto].search(/Gravado/i) + 7;
  if (iNeto === -1) {
    // Sin "Neto Gravado": el "Subtotal" hace de neto (se descarta solo si el IVA no cierra)
    iNeto = lineas.findIndex(l => /\bSub\s?total\b/i.test(l));
    if (iNeto === -1) return [];
    desde = lineas[iNeto].search(/total/i) + 5;
  }
  const netoTotal = importeCerca(lineas, iNeto, desde);
  const ivas = [];
  for (const [i, l] of lineas.entries()) {
    const m = l.match(/^.{0,4}?\bIVA\s*(\d{1,2}(?:[.,]\d{1,2})?)\s*%/i);
    if (!m) continue;
    const iva = importeCerca(lineas, i, m.index + m[0].length);
    if (iva) ivas.push({ tasa: Number(m[1].replace(',', '.')), iva });
  }
  if (netoTotal == null || !ivas.length) return [];
  if (ivas.length === 1) {
    const unica = { tasa: ivas[0].tasa, neto: netoTotal, iva: ivas[0].iva };
    return Math.abs(unica.iva - unica.neto * unica.tasa / 100) <= 1 ? [unica] : [];
  }
  const conNeto = ivas.map(a => ({ ...a, neto: Math.round((a.iva / (a.tasa / 100)) * 100) / 100 }));
  const suma = conNeto.reduce((s, a) => s + a.neto, 0);
  return Math.abs(suma - netoTotal) <= 0.05 * ivas.length ? conNeto : [];
}

// El importe de una etiqueta está en la misma línea o, si la foto está torcida, en alguna de las 2 siguientes.
function importeCerca(lineas, i, desde) {
  const mismo = lineas[i].slice(desde).match(IMPORTE);
  if (mismo) return pesos(mismo[0]);
  for (let j = i + 1; j <= i + 2 && j < lineas.length; j++) {
    const soloImporte = lineas[j].match(new RegExp(`^(?:\\$|USD)?\\s*(${IMPORTE.source})\\s*$`));
    if (soloImporte) return pesos(soloImporte[1]);
  }
  const en = lineas[i].match(IMPORTE_G);
  return en ? pesos(en[en.length - 1]) : null;
}
