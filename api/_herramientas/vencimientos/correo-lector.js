/* Vencimientos de la Casa · "Buscar en mi mail": reconocer facturas dentro de los mails.
   Corre en el navegador de la persona: los mails no pasan por Orbit (así no hace falta
   la auditoría CASA de Google para gmail.readonly). Sin DOM, para poder probarlo.

   Entrada: mensajes normalizados { id, de, asunto, fecha (AAAA-MM-DD del mail), texto }.
   Salida: cuentas propuestas, una por servicio, con el próximo vencimiento, el último
   monto, la frecuencia deducida y la historia de montos. */
import { SERVICIOS } from './servicios.js';
import { esFecha, difDias, sumarMeses } from './calculos.js';

/* Remitentes conocidos → servicio precargado. Se busca el dominio dentro del "De". */
export const REMITENTES = [
  ['edenor', ['edenor.com']], ['edesur', ['edesur.com.ar', 'enel.com']], ['epec', ['epec.com.ar']], ['edelap', ['edelap.com.ar']],
  ['metrogas', ['metrogas.com.ar']], ['naturgy', ['naturgy.com.ar']], ['camuzzi', ['camuzzigas.com.ar', 'camuzzi.com.ar']], ['ecogas', ['ecogas.com.ar']],
  ['aysa', ['aysa.com.ar']], ['absa', ['aguasbonaerenses.com.ar']],
  ['abl', ['agip.gob.ar', 'buenosaires.gob.ar']], ['inmobiliario', ['arba.gov.ar']],
  ['monotributo', ['afip.gob.ar', 'arca.gob.ar']],
  ['internet', ['telecentro.com.ar', 'fibertel.com.ar', 'flow.com.ar', 'iplan.com.ar']],
  ['celular', ['personal.com.ar', 'telecom.com.ar', 'claro.com.ar', 'movistar.com.ar', 'telefonica.com.ar']],
  ['cable', ['directvla.com', 'directv.com.ar', 'supercanal.com.ar']],
  ['prepaga', ['osde.com.ar', 'swissmedical.com.ar', 'galeno.com.ar', 'medife.com.ar', 'omint.com.ar', 'sancorsalud.com.ar', 'accordsalud.com.ar']],
  ['seguro-auto', ['lacaja.com.ar', 'sancorseguros.com.ar', 'federacionpatronal.com.ar', 'rus.com.ar', 'mercantilandina.com.ar', 'zurich.com.ar', 'allianz.com.ar']],
  ['netflix', ['netflix.com']], ['spotify', ['spotify.com']], ['disney', ['disneyplus.com', 'disney.com']],
];

/* Lo que se le pide al proveedor de mail: remitentes conocidos o asuntos de factura, últimos 6 meses. */
export const PALABRAS = ['factura', 'vencimiento', 'vence', 'expensas', 'liquidación de expensas', 'aviso de pago', 'boleta', 'resumen de cuenta'];
export function consultaGmail(meses = 6) {
  const dominios = [...new Set(REMITENTES.flatMap(([, ds]) => ds))];
  return `newer_than:${meses}m -in:chats (from:(${dominios.join(' OR ')}) OR subject:(${PALABRAS.map(p => p.includes(' ') ? `"${p}"` : p).join(' OR ')}))`;
}

const MESES = { ene: 1, enero: 1, feb: 2, febrero: 2, mar: 3, marzo: 3, abr: 4, abril: 4, may: 5, mayo: 5, jun: 6, junio: 6, jul: 7, julio: 7,
  ago: 8, agosto: 8, sep: 9, sept: 9, set: 9, septiembre: 9, setiembre: 9, oct: 10, octubre: 10, nov: 11, noviembre: 11, dic: 12, diciembre: 12 };
const pad = n => String(n).padStart(2, '0');
const sinTildes = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

export function servicioDelRemitente(de) {
  const d = String(de || '').toLowerCase();
  for (const [id, dominios] of REMITENTES) if (dominios.some(x => d.includes(x))) return id;
  return null;
}

/* Fechas en el texto, con su posición: 15/10/2026, 15-10-26, 15.10.2026, "15 de octubre de 2026", "15 oct 2026". */
export function fechasEn(texto) {
  const t = sinTildes(String(texto).toLowerCase());
  const out = [];
  const re1 = /\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2}|\d{4})\b/g;
  for (let m; (m = re1.exec(t));) {
    const d = +m[1], me = +m[2], a = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    if (d >= 1 && d <= 31 && me >= 1 && me <= 12 && a >= 2020 && a <= 2100) out.push({ fecha: `${a}-${pad(me)}-${pad(d)}`, i: m.index });
  }
  const re2 = /\b(\d{1,2})\s*(?:de\s+)?([a-z]{3,10})\.?\s*(?:de\s+|del\s+)?(\d{4})\b/g;
  for (let m; (m = re2.exec(t));) {
    const me = MESES[m[2]];
    if (me && +m[1] >= 1 && +m[1] <= 31) out.push({ fecha: `${m[3]}-${pad(me)}-${pad(+m[1])}`, i: m.index });
  }
  return out.filter(x => esFecha(x.fecha)).sort((a, b) => a.i - b.i);
}

/* Montos en pesos con su posición: "$ 12.345,67", "$12345.67", "ARS 12.345". */
export function montosEn(texto) {
  const out = [];
  const re = /(?:\$|ars)\s*(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+\.\d{1,2}|\d+(?:,\d{1,2})?)(?![\d])/gi;
  for (let m; (m = re.exec(texto));) {
    let s = m[1];
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    const n = Number(s);
    if (Number.isFinite(n) && n > 0 && n < 1e9) out.push({ monto: Math.round(n * 100), i: m.index });
  }
  return out;
}

const CERCA = 160; // caracteres
const CLAVE_VTO = /(venc|vto\b|vto\.|pagar antes|fecha de pago|fecha limite|hasta el)/g;
const CLAVE_TOTAL = /(total a pagar|importe a pagar|total|importe|monto|saldo|a pagar|abonar)/g;
function cercanos(lista, texto, re) {
  const t = sinTildes(texto.toLowerCase());
  const marcas = [...t.matchAll(re)].map(m => m.index);
  return lista.filter(x => marcas.some(p => x.i >= p - 20 && x.i - p <= CERCA))
    .map(x => ({ ...x, d: Math.min(...marcas.map(p => Math.abs(x.i - p))) }));
}

/* Un mail → { vence, segundo, monto } o null si no parece una factura. */
export function leerMail(msg) {
  const texto = `${msg.asunto || ''}\n${msg.texto || ''}`.slice(0, 20000);
  const fechas = fechasEn(texto);
  const venc = cercanos(fechas, texto, CLAVE_VTO).map(x => x.fecha);
  const unicas = [...new Set(venc)].sort();
  // vencimientos razonables: desde 60 días antes del mail hasta 90 después
  const ok = unicas.filter(f => !msg.fecha || (difDias(msg.fecha, f) >= -60 && difDias(msg.fecha, f) <= 90));
  const montos = cercanos(montosEn(texto), texto, CLAVE_TOTAL).sort((a, b) => a.d - b.d || a.i - b.i);
  if (!ok.length && !montos.length) return null;
  return { vence: ok[0] || null, segundo: ok[1] || null, monto: montos[0]?.monto ?? null };
}

/* Mails → cuentas propuestas. Agrupa por servicio (o por remitente si no es conocido). */
export function cuentasDesdeMails(mensajes, hoy) {
  const grupos = new Map();
  for (const msg of mensajes) {
    const servicio = servicioDelRemitente(msg.de);
    const clave = servicio || `otro:${String(msg.de || '').toLowerCase().replace(/.*@/, '').replace(/>.*/, '')}`;
    const lectura = leerMail(msg);
    if (!lectura || !lectura.vence) continue;               // sin fecha no sirve para avisar
    /* remitente desconocido: tiene que decir que es una factura y traer un monto (afuera promos y newsletters) */
    if (!servicio && (lectura.monto == null || !/factura|expensas|boleta|liquidacion|aviso de (pago|deuda)|resumen de cuenta/.test(sinTildes(`${msg.asunto} ${msg.texto}`.toLowerCase())))) continue;
    (grupos.get(clave) || grupos.set(clave, []).get(clave)).push({ ...lectura, id: msg.id, asunto: msg.asunto, fechaMail: msg.fecha, de: msg.de });
  }
  const out = [];
  for (const [clave, fs] of grupos) {
    const porFecha = [...new Map(fs.map(f => [f.vence, f])).values()].sort((a, b) => a.vence.localeCompare(b.vence));
    const ultima = porFecha[porFecha.length - 1];
    /* frecuencia: la mediana de los meses entre vencimientos (1 o 2 casi siempre) */
    const saltos = porFecha.slice(1).map((f, i) => Math.round(difDias(porFecha[i].vence, f.vence) / 30.4)).filter(n => n >= 1 && n <= 12).sort((a, b) => a - b);
    const s = SERVICIOS.find(x => x.id === clave) || null;
    const frecuencia = saltos.length ? saltos[Math.floor(saltos.length / 2)] : (s?.frecuencia || 1);
    let proximo = ultima.vence;
    let estimado = false;
    while (proximo < hoy && frecuencia) { proximo = sumarMeses(proximo, frecuencia); estimado = true; }
    const dominio = clave.startsWith('otro:') ? clave.slice(5) : null;
    out.push({
      clave, preset: s?.id || null, nombre: s?.nombre || nombreDesdeDominio(dominio, ultima.asunto), categoria: s?.categoria || 'Otros', color: s?.color || null,
      frecuencia, proximo, proximoEstimado: estimado, monto: ultima.monto, segundoVto: ultima.segundo ? difDias(ultima.vence, ultima.segundo) : null,
      historia: porFecha.filter(f => f.monto != null).map(f => ({ vence: f.vence, monto: f.monto })),
      encontradas: porFecha.length, conocido: !!s,
    });
  }
  return out.sort((a, b) => Number(b.conocido) - Number(a.conocido) || a.proximo.localeCompare(b.proximo));
}

function nombreDesdeDominio(dominio, asunto) {
  if (/expensas/i.test(asunto || '')) return 'Expensas';
  const base = String(dominio || '').split('.').filter(p => !/^(com|ar|net|org|gob|gov|mail|info|www|notificaciones|facturacion|no-?reply)$/.test(p))[0] || 'Factura';
  return base.charAt(0).toUpperCase() + base.slice(1);
}

/* Texto plano de un HTML de mail (sin DOM): saca estilos, scripts y etiquetas. */
export function textoDeHtml(html) {
  return String(html || '')
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#36;|&dollar;/g, '$').replace(/&[a-z]+;|&#\d+;/gi, ' ')
    .replace(/[ \t]+/g, ' ').replace(/\n\s+/g, '\n').trim();
}
