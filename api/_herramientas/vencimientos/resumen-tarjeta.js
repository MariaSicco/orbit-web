/* Vencimientos de la Casa · "Subí el resumen de tu tarjeta".
   La lectura del PDF es la de Mi Mes (api/_lib/mi-mes-lector.js, mismo esquema).
   Acá se convierte esa lectura en cuentas para Vencimientos, sin DOM:
   - la tarjeta misma (vence el día del resumen, con el total a pagar);
   - lo que se cobra todos los meses en la tarjeta: suscripciones, servicios
     adheridos, prepaga, seguros, gimnasio, peajes.
   Las compras en cuotas y los consumos sueltos no son vencimientos: quedan afuera. */
import { SERVICIOS } from './servicios.js';
import { esFecha, sumarMeses } from './calculos.js';

/* Comercio del resumen → servicio precargado. Se compara en mayúsculas y sin símbolos. */
export const COMERCIOS = [
  ['netflix', /NETFLIX/], ['spotify', /SPOTIFY/], ['disney', /DISNEY|STAR ?PLUS/], ['max', /\bHBO\b|HBOMAX|\bMAX\b.*(STREAM|COM)|WARNER/],
  ['prime', /PRIME ?VIDEO|AMAZON ?PRIME|AMZN ?PRIME/], ['paramount', /PARAMOUNT/], ['crunchyroll', /CRUNCHYROLL/],
  ['youtube', /YOUTUBE/], ['google-one', /GOOGLE ?ONE|GOOGLE ?STORAGE/], ['icloud', /APPLE ?COM ?BILL|ITUNES|ICLOUD|APPLE ?MUSIC|APPLE ?ONE/],
  ['chatgpt', /OPENAI|CHATGPT/], ['m365', /MICROSOFT ?365|MSFT ?\*|MICROSOFT ?\*|OFFICE ?365|XBOX/], ['meli', /MELI ?\+|MELI ?PLUS|MERCADOLIBRE ?SUSC/],
  ['edenor', /EDENOR/], ['edesur', /EDESUR|ENEL/], ['epec', /\bEPEC\b/], ['edelap', /EDELAP/],
  ['metrogas', /METROGAS/], ['naturgy', /NATURGY|GAS ?NATURAL ?BAN/], ['camuzzi', /CAMUZZI/], ['ecogas', /ECOGAS/],
  ['aysa', /\bAYSA\b|AGUAS ?ARGENTINAS/], ['absa', /\bABSA\b|AGUAS ?BONAERENSES/],
  ['abl', /\bAGIP\b|\bABL\b/], ['inmobiliario', /ARBA ?INMOB/], ['patente', /PATENTE|ARBA ?AUTO/],
  ['internet', /TELECENTRO|FIBERTEL|\bFLOW\b|IPLAN|STARLINK/], ['celular', /PERSONAL|TELECOM|\bCLARO\b|MOVISTAR|TELEFONICA/],
  ['cable', /DIRECTV|DIRECT ?TV|SUPERCANAL|CABLEVISION/],
  ['prepaga', /\bOSDE\b|SWISS ?MEDICAL|GALENO|MEDIFE|OMINT|SANCOR ?SALUD|ACCORD ?SALUD|HOSPITAL ?ITALIANO|HOSPITAL ?ALEMAN/],
  ['seguro-auto', /LA ?CAJA|SANCOR ?SEG|FEDERACION ?PATRONAL|FED ?PATRONAL|\bRUS\b|MERCANTIL ?ANDINA|ZURICH|ALLIANZ|LA ?SEGUNDA|MAPFRE|RIVADAVIA ?SEG|SEGUROS? /],
  ['gimnasio', /SMART ?FIT|MEGATLON|SPORTCLUB|SPORT ?CLUB|GIMNASIO|\bGYM\b/],
  ['peaje', /\bAUSA\b|AUBASA|TELEPEAJE|AUTOPISTA/],
];
const limpio = s => String(s || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9+ ]/g, ' ').replace(/\s+/g, ' ').trim();

export function servicioDelComercio(comercio) {
  const c = limpio(comercio);
  for (const [id, re] of COMERCIOS) if (re.test(c)) return id;
  return null;
}

/* "NETFLIX.COM 866-579" → "Netflix.com" (para lo que no está precargado) */
function nombreDesdeComercio(comercio) {
  const t = String(comercio || '').replace(/[*#]+/g, ' ').replace(/\b\d[\d\-/ ]*\b/g, ' ').replace(/\s+/g, ' ').trim();
  const corto = t.split(' ').slice(0, 3).join(' ');
  return (corto.charAt(0).toUpperCase() + corto.slice(1).toLowerCase()).slice(0, 40) || 'Débito en la tarjeta';
}

const pesos = n => Math.round(Number(n) * 100);
const RED_CORTA = { 'American Express': 'Amex', Mastercard: 'Mastercard', Visa: 'Visa', Cabal: 'Cabal', Naranja: 'Naranja' };

/* Lectura del resumen (esquema de Mi Mes) → cuentas propuestas, con la misma forma que las del mail. */
export function cuentasDesdeResumen(lectura, hoy) {
  const out = [];
  const t = lectura?.tarjeta || {};
  const red = RED_CORTA[t.red] || '';
  const banco = String(t.banco || '').replace(/^banco\s+/i, '').trim();
  const nombreTarjeta = `Tarjeta ${[red, banco].filter(Boolean).join(' ')}${t.ultimos4 ? ` ·${t.ultimos4}` : ''}`.trim();
  const origen = [red, t.ultimos4 ? `·${t.ultimos4}` : ''].filter(Boolean).join(' ') || 'tu tarjeta';

  /* 1 · la tarjeta: vence todos los meses; el total en pesos es lo que hay que pagar */
  const vto = esFecha(lectura?.vencimiento) ? lectura.vencimiento : null;
  if (vto) {
    let proximo = vto, estimado = false;
    if (esFecha(lectura.proximoVencimiento) && vto < hoy) { proximo = lectura.proximoVencimiento; estimado = false; }
    while (proximo < hoy) { proximo = sumarMeses(proximo, 1); estimado = true; }
    const ars = (lectura.totales || []).find(x => x.moneda === 'ARS');
    const usd = (lectura.totales || []).find(x => x.moneda === 'USD' && x.monto > 0);
    out.push({
      clave: `tarjeta:${t.ultimos4 || banco || red}`, preset: null, nombre: nombreTarjeta, categoria: 'Tarjetas', color: '#3047FF',
      frecuencia: 1, proximo, proximoEstimado: estimado, monto: ars ? pesos(ars.monto) : null, segundoVto: null,
      historia: ars && vto < proximo ? [{ vence: vto, monto: pesos(ars.monto) }] : [], encontradas: 1, conocido: true,
      tarjeta: true, nota: usd ? `Además, US$ ${usd.monto} en dólares.` : '', origen,
    });
  }

  /* 2 · lo que se repite en la tarjeta (un pago, no cuotas) */
  const grupos = new Map();
  for (const c of lectura?.consumos || []) {
    if (c.cuota || !(c.monto > 0)) continue;
    const id = servicioDelComercio(c.comercio);
    const esSuscripcion = c.rubro === 'Suscripciones' || c.rubro === 'Servicios';
    if (!id && !esSuscripcion) continue;
    const clave = id || `comercio:${limpio(c.comercio).split(' ').slice(0, 2).join(' ')}`;
    (grupos.get(clave) || grupos.set(clave, []).get(clave)).push({ ...c, id });
  }
  for (const [clave, cs] of grupos) {
    const s = SERVICIOS.find(x => x.id === cs[0].id) || null;
    const ultimo = cs.slice().sort((a, b) => String(a.fecha).localeCompare(String(b.fecha))).at(-1);
    const moneda = ultimo.moneda === 'USD' ? 'USD' : 'ARS';
    if (!['ARS', 'USD'].includes(ultimo.moneda)) continue;   // otras monedas: no se proyectan
    const total = cs.filter(c => c.moneda === ultimo.moneda).reduce((a, c) => a + Number(c.monto), 0);
    let proximo = esFecha(ultimo.fecha) ? sumarMeses(ultimo.fecha, 1) : (vto ? sumarMeses(vto, 1) : hoy);
    while (proximo < hoy) proximo = sumarMeses(proximo, 1);
    out.push({
      clave, preset: s?.id || null, nombre: s?.nombre || nombreDesdeComercio(ultimo.comercio), categoria: s?.categoria || 'Suscripciones', color: s?.color || null,
      frecuencia: 1, proximo, proximoEstimado: true, monto: pesos(total), moneda, segundoVto: null,
      historia: esFecha(ultimo.fecha) ? [{ vence: ultimo.fecha, monto: pesos(total) }] : [], // el cobro de este resumen, para "cuánto subió"
      encontradas: cs.length, conocido: !!s, debito: true, origen,
    });
  }
  return out.sort((a, b) => Number(!!b.tarjeta) - Number(!!a.tarjeta) || Number(b.conocido) - Number(a.conocido) || a.nombre.localeCompare(b.nombre));
}
