/* Vencimientos de la Casa · "Pegá tu nota de servicios". Sin DOM y sin IA: el texto se lee
   acá, en el teléfono. De cada renglón sale el servicio (Edenor, ABL, Personal…), el número
   de cliente o partida, y si está, el día de vencimiento y el monto.
   Ej.: "Edenor cliente 0012345678 vence 21", "ABL partida 1234567 $16.000", "wifi telecentro 98765". */
import { SERVICIOS } from './servicios.js';
import { servicioDelComercio, COMERCIOS } from './resumen-tarjeta.js';
import * as V from './calculos.js';

const sinTildes = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
/* palabras sueltas que la gente usa en sus notas → servicio precargado */
const PALABRAS = [
  [/\b(luz|electricidad)\b/, 'luz'], [/\bgas\b/, 'gas'], [/\bagua\b/, 'agua'],
  [/\babl\b|alumbrado|barrido|\bagip\b/, 'abl'], [/\barba\b|inmobiliario/, 'inmobiliario'], [/\bmunicipal\b|\btasa\b/, 'tasa-municipal'],
  [/wi-?fi|internet|fibra/, 'internet'], [/\bcelu(lar)?\b|\bcel\b|\bmovil\b|\blinea\b/, 'celular'], [/\bcable\b|\btv\b/, 'cable'],
  [/expensas/, 'expensas'], [/alquiler/, 'alquiler'], [/hipoteca/, 'hipoteca'], [/patente/, 'patente'],
  [/prepaga|obra social/, 'prepaga'], [/seguro (del )?auto|seguro auto/, 'seguro-auto'], [/seguro (del )?hogar|seguro casa/, 'seguro-hogar'],
  [/cochera/, 'cochera'], [/monotributo/, 'monotributo'], [/gimnasio|\bgym\b/, 'gimnasio'], [/colegio|escuela/, 'colegio'],
];
/* las empresas que van con nombre propio (el resto, por la palabra genérica) */
const PROPIOS = SERVICIOS.filter(s => !['luz', 'gas', 'agua', 'internet', 'celular', 'cable'].includes(s.id))
  .map(s => [new RegExp(`\\b${sinTildes(s.nombre).toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`), s.id])
  .filter(([re]) => re.source.length > 6);

function servicioDelRenglon(r) {
  const t = sinTildes(r).toLowerCase();
  for (const [re, id] of PROPIOS) if (re.test(t)) return { id, empresa: null };
  const com = servicioDelComercio(r);
  if (com) {
    /* "wifi telecentro", "celu personal": la empresa que matcheó queda como nombre */
    const re = COMERCIOS.find(([id]) => id === com)?.[1];
    const m = re && sinTildes(r).toUpperCase().replace(/[^A-Z0-9+ ]/g, ' ').replace(/\s+/g, ' ').match(re);
    const empresa = m ? m[0].trim().toLowerCase().replace(/\b\w/g, c => c.toUpperCase()) : null;
    return { id: com, empresa };
  }
  for (const [re, id] of PALABRAS) if (re.test(t)) {
    /* "wifi telecentro", "celu personal": la empresa queda como nombre */
    const resto = t.replace(re, ' ').replace(/\b(n[°ºo]?|nro|numero|cliente|cuenta|partida|suministro|socio|linea|vence|vto|dia|el|de|del|la|\$)\b/g, ' ')
      .replace(/[^a-z ]/g, ' ').trim().split(/\s+/).filter(w => w.length > 2)[0];
    return { id, empresa: resto ? resto.charAt(0).toUpperCase() + resto.slice(1) : null };
  }
  return null;
}

export function serviciosDesdeNota(texto, hoy) {
  const out = new Map();
  for (const crudo of String(texto || '').split(/\n|;|\|/)) {
    const r = crudo.trim();
    if (r.length < 3) continue;
    const sv = servicioDelRenglon(r);
    if (!sv) continue;
    const s = SERVICIOS.find(x => x.id === sv.id);
    const t = sinTildes(r).toLowerCase();
    /* monto: con "$" adelante */
    const mm = t.match(/\$\s*([\d.]+(?:,\d{1,2})?)/);
    const monto = mm ? V.leerPesos(mm[1]) : null;
    /* día de vencimiento: "vence 21", "vto el 10", "dia 5" */
    const md = t.match(/(?:vence|vto\.?|vencimiento|dia)\s*(?:el\s*)?(\d{1,2})\b(?![\d/.-])/);
    const dia = md && +md[1] >= 1 && +md[1] <= 31 ? +md[1] : null;
    /* número de cliente: la secuencia de 5 o más dígitos que no es el monto ni el día */
    const sinMonto = mm ? t.replace(mm[0], ' ') : t;
    const nros = [...sinMonto.matchAll(/(?<![\d$])(\d[\d\s.\-/]{3,22}\d)(?![\d,])/g)].map(x => x[1].replace(/[\s.]/g, '')).filter(n => n.replace(/\D/g, '').length >= 5);
    const nombre = sv.empresa && !['abl', 'expensas', 'alquiler', 'patente'].includes(sv.id) ? sv.empresa : s.nombre;
    const proximo = dia ? V.proximoDia(dia, hoy, s.frecuencia || 1) : (s.tipo === 'tramite' ? V.sumarDias(hoy, 30) : V.sumarDias(hoy, 10));
    out.set(`${sv.id}|${nombre}`, {
      clave: `nota:${sv.id}:${nombre}`, preset: s.id, nombre, categoria: s.categoria, color: s.color || null,
      frecuencia: s.frecuencia || 1, proximo, proximoEstimado: !dia, aConfirmar: !dia, monto, historia: [],
      encontradas: 1, conocido: true, ...(nros[0] ? { nroCliente: nros[0] } : {}), deNota: true,
    });
  }
  return [...out.values()];
}
