/* Mi Mes by Orbit · cuentas puras (sin DOM ni storage), para el navegador y para node --test.

   Unidades: todos los montos se guardan en CENTAVOS (enteros) de su moneda,
   así no hay errores de coma flotante. Los meses son claves 'AAAA-MM'.

   Reglas de cálculo (ver test/mi-mes.test.js):
   - Ingreso o gasto que se repite: cuenta desde su mes `desde` en adelante,
     y si tiene `hasta`, hasta ese mes inclusive.
   - Ingreso o gasto que no se repite: cuenta solo en su mes `desde`.
   - Cuota: la compra se divide en `cantidad` cuotas mensuales a partir de
     `primerMes`. Si el total es en unidades enteras (pesos o dólares), las
     cuotas también: el resto que no reparte parejo va en la PRIMERA cuota
     (como lo cobran los bancos), así la suma da exacto el total.
   - Moneda extranjera: cada monto se guarda en su moneda y se pasa a pesos con
     el tipo de cambio vigente en la app (editable). Si una moneda no tiene tipo
     de cambio, ese monto NO se suma y queda marcado (nunca se inventa).
   - Resumen importado: en el mes en que vence, la tarjeta cuesta el total del
     resumen (todas sus monedas pasadas a pesos). Las cuotas de esa tarjeta ya
     están adentro de ese total, así que ese mes no se suman aparte.
   - Te quedan libres = ingresos − gastos fijos − cuotas − resúmenes del mes.
     Puede ser negativo. */

export const ESQUEMA = 3;

export const CATEGORIAS = [
  'Alquiler', 'Expensas', 'Servicios', 'Suscripciones', 'Seguros',
  'Transporte', 'Educación', 'Salud', 'Patente', 'Vacaciones', 'Otros',
];
/* Gastos de un solo mes (no se repiten): el chip pone nombre y categoría. */
export const GASTOS_UN_MES = [
  { nombre: 'Patente', categoria: 'Patente' }, { nombre: 'Seguro', categoria: 'Seguros' },
  { nombre: 'Matrícula', categoria: 'Educación' }, { nombre: 'Vacaciones', categoria: 'Vacaciones' },
];
/* Aguinaldo: se cobra en junio y en diciembre; sugerimos el próximo. */
export const mesAguinaldo = hoyMes => {
  const [a, m] = hoyMes.split('-').map(Number);
  return m <= 6 ? `${a}-06` : `${a}-12`;
};
export const RUBROS = [
  'Supermercado', 'Comida', 'Transporte', 'Servicios', 'Salud', 'Ropa',
  'Entretenimiento', 'Suscripciones', 'Otros',
];
export const REDES = ['Visa', 'Mastercard', 'American Express', 'Cabal', 'Naranja', 'Otra'];
export const COLORES = ['azul', 'negro', 'naranja', 'violeta', 'verde', 'gris'];

/* ── monedas ── */
export const MONEDAS = {
  ARS: { simbolo: '$', nombre: 'pesos' },
  USD: { simbolo: 'US$', nombre: 'dólares' },
  EUR: { simbolo: '€', nombre: 'euros' },
  BRL: { simbolo: 'R$', nombre: 'reales' },
  UYU: { simbolo: '$U', nombre: 'pesos uruguayos' },
  CLP: { simbolo: 'CLP$', nombre: 'pesos chilenos' },
  GBP: { simbolo: '£', nombre: 'libras' },
};
export const esMoneda = m => typeof m === 'string' && Object.hasOwn(MONEDAS, m);

/* Tipo de cambio por defecto: pesos (en centavos) por 1 unidad de la moneda.
   Es el "dólar tarjeta": oficial + 30 % de percepción de Ganancias
   (RG 5617; el impuesto PAÍS venció el 22/12/2024). Se muestra siempre con
   su fuente y su fecha, y la persona lo puede cambiar. */
export const CAMBIO_DEFECTO = {
  USD: {
    valor: 200200, fecha: '2026-10-10',
    fuente: 'Dólar tarjeta: oficial Banco Nación $ 1.535 + 30 % de percepción de Ganancias (El Cronista)',
    url: 'https://www.cronista.com/finanzas-mercados/dolar-hoy-a-cuanto-cotiza-el-oficial-en-los-bancos-de-la-city-este-sabado-10-de-octubre/',
  },
  EUR: {
    valor: 221125, fecha: '2026-10-11',
    fuente: 'Euro tarjeta estimado: euro oficial $ 1.700,96 + 30 % de percepción de Ganancias (cotizacion-dolar.com.ar)',
    url: 'https://www.cotizacion-dolar.com.ar/euro-hoy.php',
  },
};

/* ── meses ── */
const MES = /^(\d{4})-(0[1-9]|1[0-2])$/;
const FECHA = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
export const esMes = m => typeof m === 'string' && MES.test(m);
export const esFecha = f => typeof f === 'string' && FECHA.test(f);
export const mesDe = (fecha = new Date()) =>
  `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;
export const hoyISO = (fecha = new Date()) => `${mesDe(fecha)}-${String(fecha.getDate()).padStart(2, '0')}`;
const aNumero = m => { const [a, b] = m.split('-').map(Number); return a * 12 + (b - 1); };
const deNumero = n => `${Math.floor(n / 12)}-${String((n % 12) + 1).padStart(2, '0')}`;
export const sumarMeses = (m, k) => deNumero(aNumero(m) + k);
export const difMeses = (desde, hasta) => aNumero(hasta) - aNumero(desde);

const NOMBRES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
  'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const nombreMes = (m, { corto = false } = {}) => {
  const [a, b] = m.split('-').map(Number);
  const n = NOMBRES[b - 1];
  return corto ? `${n.slice(0, 3)} ${a}` : `${n} ${a}`;
};
export const fechaCorta = f => {
  if (!esFecha(f)) return '';
  const [, m, d] = f.split('-').map(Number);
  return `${d} ${NOMBRES[m - 1].slice(0, 3)}`;
};

/* Sin fecha de cierre de la tarjeta, una compra de hoy se paga en el
   resumen que vence el mes que viene. Editable en el formulario. */
export const proximoResumen = (hoy = new Date()) => sumarMeses(mesDe(hoy), 1);

/* ── plata ── */
const miles = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

/* "$ 1.234.567" (redondeado a pesos). Con centavos: "$ 1.234,56". */
export function formatoPesos(centavos, { centavos: conCentavos = false, signo = false } = {}) {
  return formatoMoneda(centavos, 'ARS', { centavos: conCentavos, signo });
}
/* Pesos redondeados; las otras monedas con centavos si los tienen: "US$ 12,50". */
export function formatoMoneda(centavos, moneda = 'ARS', { centavos: conCentavos = moneda !== 'ARS', signo = false } = {}) {
  const neg = centavos < 0;
  const abs = Math.abs(centavos);
  let entero, dec = '';
  if (conCentavos && abs % 100 !== 0) {
    entero = Math.floor(abs / 100);
    dec = ',' + String(abs % 100).padStart(2, '0');
  } else {
    entero = Math.round(abs / 100);
  }
  const pre = neg && entero + dec !== '0' ? '−' : (signo && centavos > 0 ? '+' : '');
  return `${pre}${MONEDAS[moneda]?.simbolo || moneda} ${miles(entero)}${dec}`;
}

/* Texto que escribe la persona → centavos, o null si no es un monto válido.
   Formato argentino: el punto es SOLO de miles y la coma, de centavos.
   Acepta "1.234.567", "1234567", "$ 12.000", "1234,50" y "1.234,5".
   Lo ambiguo ("900.00", "1.23.4") da null: mejor pedir que lo corrija
   que guardar un monto equivocado. */
export function leerPesos(texto) {
  const s = String(texto ?? '').replace(/[\s$]/g, '').replace(/^(ARS|USD|US)/i, '');
  const m = /^(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?$/.exec(s);
  if (!m) return null;
  const [ent, dec = ''] = [m[1].replace(/\./g, ''), m[2]];
  const c = Number(ent) * 100 + Number(dec.padEnd(2, '0'));
  return Number.isSafeInteger(c) ? c : null;
}
export const leerMonto = leerPesos;

/* ── tipo de cambio ── */
/* Tipo de cambio vigente de una moneda: el que cargó la persona o el de por defecto. */
export function cambioDe(datos, moneda) {
  if (moneda === 'ARS') return { valor: 100, fuente: '', fecha: '' };
  const propio = datos?.cambio?.[moneda];
  if (propio && Number.isSafeInteger(propio.valor) && propio.valor > 0) return propio;
  return CAMBIO_DEFECTO[moneda] || null;
}
/* Monto en su moneda → centavos de peso, o null si no hay tipo de cambio. */
export function aPesos(centavos, moneda, datos) {
  if (moneda === 'ARS' || !moneda) return centavos;
  const c = cambioDe(datos, moneda);
  if (!c) return null;
  return Math.round((centavos * c.valor) / 100);
}

/* ── cuotas ── */
/* Montos de cada cuota, en centavos. Suma exacta = total. */
export function repartirCuotas(total, cantidad) {
  const n = Math.max(1, Math.floor(cantidad));
  const unidad = total % 100 === 0 ? 100 : 1;
  const base = Math.floor(total / n / unidad) * unidad;
  const resto = total - base * n;
  return Array.from({ length: n }, (_, i) => (i === 0 ? base + resto : base));
}

/* Qué cuota de esta compra cae en el mes (1..N), o 0 si ninguna. */
export function numeroDeCuota(compra, mes) {
  const k = difMeses(compra.primerMes, mes);
  return k >= 0 && k < compra.cantidad ? k + 1 : 0;
}
export const ultimoMes = compra => sumarMeses(compra.primerMes, compra.cantidad - 1);

/* ── resúmenes ── */
/* Total de un resumen: por moneda y pasado a pesos. Si falta un tipo de
   cambio, esa moneda queda en `faltaCambio` y no se suma. */
export function totalResumen(resumen, datos) {
  let porMoneda = resumen?.totales && Object.keys(resumen.totales).length ? { ...resumen.totales } : null;
  if (!porMoneda) {
    porMoneda = {};
    for (const c of resumen?.consumos || []) porMoneda[c.moneda] = (porMoneda[c.moneda] || 0) + c.monto;
  }
  let ars = 0;
  const faltaCambio = [];
  for (const [moneda, monto] of Object.entries(porMoneda)) {
    const p = aPesos(monto, moneda, datos);
    if (p === null) faltaCambio.push(moneda); else ars += p;
  }
  return { porMoneda, ars, faltaCambio };
}
export const resumenDelMes = (datos, tarjetaId, mes) =>
  (datos?.resumenes || []).find(r => r.tarjetaId === tarjetaId && r.mes === mes) || null;

/* Gasto por rubro de un resumen, en pesos, de mayor a menor. */
export function gastoPorRubro(resumen, datos) {
  const acc = new Map();
  for (const c of resumen?.consumos || []) {
    const p = aPesos(c.monto, c.moneda, datos);
    if (p === null || p <= 0) continue;
    acc.set(c.rubro || 'Otros', (acc.get(c.rubro || 'Otros') || 0) + p);
  }
  return [...acc].map(([rubro, ars]) => ({ rubro, ars })).sort((a, b) => b.ars - a.ars);
}

/* ── qué cuenta en cada mes ── */
export function activoEn(item, mes) {
  if (!esMes(item?.desde)) return false;
  if (!item.repite) return item.desde === mes;
  if (difMeses(item.desde, mes) < 0) return false;
  return !(esMes(item.hasta) && difMeses(item.hasta, mes) > 0);
}

/* Todo lo del mes. */
export function resumenMes(datos, mes) {
  const d = datos || {};
  const tarjetas = new Map((d.tarjetas || []).map(t => [t.id, t]));
  const ingresos = (d.ingresos || []).filter(i => activoEn(i, mes));
  const gastos = (d.gastos || []).filter(g => activoEn(g, mes));
  const resumenes = (d.resumenes || []).filter(r => r.mes === mes).map(r => {
    const t = totalResumen(r, d);
    return { ...r, tarjeta: tarjetas.get(r.tarjetaId)?.nombre || 'Tarjeta', monto: t.ars, porMoneda: t.porMoneda, faltaCambio: t.faltaCambio };
  });
  const conResumen = new Set(resumenes.map(r => r.tarjetaId));
  /* meses que cubre la tabla "cuotas a vencer" del banco: manda la tabla para
     las cuotas que vinieron de resúmenes; las compras nuevas se suman aparte */
  const tabla = d.resumenes?.some(r => r.cuotasAVencer?.length) ? tablaCuotasAVencer(d) : {};
  const delBanco = [];
  for (const [tId, tb] of Object.entries(tabla)) {
    if (conResumen.has(tId) || !(mes in tb.meses) || !tb.meses[mes]) continue;
    delBanco.push({ tarjetaId: tId, tarjeta: tarjetas.get(tId)?.nombre || 'Tarjeta', monto: tb.meses[mes] });
  }
  const cubiertas = new Set(delBanco.map(x => x.tarjetaId));
  const cuotas = [];
  const dentroDeResumen = [];
  const sinCambio = [];
  for (const c of d.cuotas || []) {
    const n = numeroDeCuota(c, mes);
    if (!n) continue;
    const moneda = c.moneda || 'ARS';
    const original = repartirCuotas(c.total, c.cantidad)[n - 1];
    const item = { ...c, moneda, numero: n, original, monto: aPesos(original, moneda, d), nueva: c.origen === 'manual',
      tarjeta: tarjetas.get(c.tarjetaId)?.nombre || 'Sin tarjeta', ultima: n === c.cantidad };
    if (conResumen.has(c.tarjetaId) || (cubiertas.has(c.tarjetaId) && !item.nueva)) dentroDeResumen.push(item);
    else if (item.monto === null) sinCambio.push(item);
    else cuotas.push(item);
  }
  const suma = xs => xs.reduce((s, x) => s + x.monto, 0);
  const totIngresos = suma(ingresos);
  const totGastos = suma(gastos);
  const totCuotas = suma(cuotas) + suma(delBanco);
  const totResumenes = suma(resumenes);
  const totNuevas = suma(cuotas.filter(c => c.nueva));
  return {
    mes, ingresos, gastos, cuotas, delBanco, resumenes, dentroDeResumen, sinCambio,
    totIngresos, totGastos, totCuotas, totResumenes,
    totTarjetas: totCuotas + totResumenes,
    /* plata líquida = lo que hay para pagar tarjetas; crédito que vence = lo que hay que pagar */
    liquida: totIngresos - totGastos,
    totNuevas, totAnteriores: totCuotas + totResumenes - totNuevas,
    libres: totIngresos - totGastos - totCuotas - totResumenes,
    vacio: !ingresos.length && !gastos.length && !cuotas.length && !resumenes.length && !dentroDeResumen.length && !sinCambio.length && !delBanco.length,
  };
}

/* Cuotas comprometidas mes a mes (en pesos), desde `desde`, `meses` meses. */
export function cuotasPorMes(datos, desde, meses) {
  return Array.from({ length: meses }, (_, k) => {
    const mes = sumarMeses(desde, k);
    return { mes, total: resumenMes(datos, mes).totCuotas };
  });
}

/* Lo de una tarjeta en un mes: resumen (si hay) o sus cuotas, en pesos. */
export function tarjetaEnMes(datos, tarjetaId, mes) {
  const r = resumenMes(datos, mes);
  const resumen = r.resumenes.find(x => x.tarjetaId === tarjetaId) || null;
  const cuotas = [...r.cuotas, ...r.dentroDeResumen, ...r.sinCambio].filter(c => c.tarjetaId === tarjetaId);
  const total = resumen ? resumen.monto : cuotas.reduce((s, c) => s + (c.monto ?? 0), 0);
  return { resumen, cuotas, total, faltaCambio: resumen ? resumen.faltaCambio : [...new Set(cuotas.filter(c => c.monto === null).map(c => c.moneda))] };
}

/* ── crédito: lo que se debe en tarjetas ──
   Por tarjeta, a una fecha: el saldo del último resumen que todavía no
   venció, las cuotas que vienen después (de la tabla "cuotas a vencer" del
   banco o proyectadas) y las compras nuevas que todavía no salieron en un
   resumen. Todo en pesos, con lo que es en otra moneda convertido. */
const aFecha = h => (esFecha(h) ? h : `${h}-01`);
export function creditoTarjeta(datos, tarjetaId, hoy) {
  hoy = aFecha(hoy);
  const mesHoy = hoy.slice(0, 7);
  const faltaCambio = new Set();
  const pesos = (c, m) => { const a = aPesos(c, m || 'ARS', datos); if (a === null) { faltaCambio.add(m); return 0; } return a; };
  const r = (datos?.resumenes || []).filter(x => x.tarjetaId === tarjetaId).sort((a, b) => difMeses(a.mes, b.mes)).pop() || null;
  let resumen = 0;
  if (r && (!esFecha(r.vencimiento) || diasEntre(hoy, r.vencimiento) >= 0)) {
    const t = totalResumen(r, datos);
    resumen = t.ars; t.faltaCambio.forEach(m => faltaCambio.add(m));
  }
  /* desde qué mes de pago cuentan las cuotas que vienen */
  const desde = r ? (difMeses(mesHoy, sumarMeses(r.mes, 1)) >= 0 ? sumarMeses(r.mes, 1) : mesHoy) : mesHoy;
  let futuras = 0, nuevas = 0;
  const tb = r?.cuotasAVencer?.length ? tablaCuotasAVencer(datos)[tarjetaId] : null;
  if (tb) {
    for (const [m, v] of Object.entries(tb.meses)) if (difMeses(desde, m) >= 0) futuras += v;
    if (tb.desde && difMeses(desde, tb.desde.mes) >= 0) futuras += tb.desde.monto;
  }
  for (const c of (datos?.cuotas || []).filter(x => x.tarjetaId === tarjetaId)) {
    const nueva = c.origen === 'manual';             // compra nueva: todavía no salió en un resumen
    if (!nueva && tb) continue;                       // las de antes ya están en la tabla del banco
    repartirCuotas(c.total, c.cantidad).forEach((p, i) => {
      const m = sumarMeses(c.primerMes, i);
      if (difMeses(desde, m) < 0) return;
      if (nueva) nuevas += pesos(p, c.moneda); else futuras += pesos(p, c.moneda);
    });
  }
  return { resumen, futuras, nuevas, total: resumen + futuras + nuevas, faltaCambio: [...faltaCambio], resumenMes: r?.mes || null };
}
export function creditoTotal(datos, hoy) {
  const porTarjeta = (datos?.tarjetas || []).map(t => ({ tarjetaId: t.id, ...creditoTarjeta(datos, t.id, hoy) }));
  const sum = k => porTarjeta.reduce((a, x) => a + x[k], 0);
  return { porTarjeta, resumen: sum('resumen'), futuras: sum('futuras'), nuevas: sum('nuevas'), total: sum('total') };
}
/* Crédito disponible = límite − lo que se debe en esa tarjeta. */
export function disponibleTarjeta(datos, tarjetaId, hoy) {
  const t = (datos?.tarjetas || []).find(x => x.id === tarjetaId);
  if (!t || !Number.isSafeInteger(t.limite) || t.limite <= 0) return null;
  const c = creditoTarjeta(datos, tarjetaId, hoy);
  return { limite: t.limite, usado: c.total, disponible: t.limite - c.total, faltaCambio: c.faltaCambio, credito: c };
}

/* ── alerta principal: lo que vence en tarjetas supera la plata líquida ──
   Mes a mes hacia adelante, separando lo que viene de antes (resúmenes y
   cuotas ya cargadas) de las compras nuevas. */
export function alertasCredito(datos, hoy, meses = 6) {
  const vistas = new Set(datos?.alertasVistas || []);
  const desde = aFecha(hoy).slice(0, 7);
  const out = [];
  for (let k = 0; k < meses; k++) {
    const mes = sumarMeses(desde, k);
    const r = resumenMes(datos, mes);
    if (r.totTarjetas <= 0 || r.totTarjetas <= r.liquida) continue;
    out.push({ id: `credito:${mes}`, tipo: 'credito', mes, nivel: k === 0 ? 'fuerte' : 'aviso',
      vence: r.totTarjetas, liquida: r.liquida, anteriores: r.totAnteriores, nuevas: r.totNuevas,
      titulo: `Lo que debés en tarjetas para ${nombreMes(mes)} (${formatoPesos(r.totTarjetas)}) supera tu plata líquida (${formatoPesos(r.liquida)})`,
      texto: r.totNuevas > 0
        ? `${formatoPesos(r.totAnteriores)} viene de antes y ${formatoPesos(r.totNuevas)} son compras nuevas. Te faltan ${formatoPesos(r.totTarjetas - r.liquida)}.`
        : `Es lo que ya venía comprometido. Te faltan ${formatoPesos(r.totTarjetas - r.liquida)}.` });
  }
  return out.filter(a => !vistas.has(a.id));
}
/* Para el push: solo los meses que se pasan, sin montos. */
export const mesesCreditoSupera = (datos, hoy, meses = 6) =>
  alertasCredito({ ...datos, alertasVistas: [] }, hoy, meses).map(a => a.mes);

/* ── compras nuevas: en qué resumen caen ── */
export function primerMesDeCompra(datos, tarjetaId, hoy) {
  hoy = aFecha(hoy);
  const ciclo = tarjetaId ? cicloTarjeta(datos, tarjetaId, hoy) : null;
  if (!ciclo) return proximoResumen(new Date(`${hoy}T12:00:00`));
  /* si el resumen ya cerró, la compra va al siguiente */
  if (ciclo.cierre && diasEntre(ciclo.cierre, hoy) > 0) return sumarMeses(ciclo.mes, 1);
  return ciclo.mes;
}

/* ── emisores de tarjetas de crédito en Argentina (octubre 2026) ──
   Se elige de la lista, no se escribe. Fusiones: HSBC (Galicia Más) se
   integró a Galicia en 2025; Itaú pasó a Macro (2023); Citi a Santander;
   Francés es BBVA; Nevada se fusionó con Naranja. */
export const EMISORES = [
  ...['Galicia', 'Santander', 'BBVA', 'Macro', 'Nación', 'Provincia', 'Ciudad', 'ICBC', 'Supervielle', 'Patagonia', 'Credicoop',
    'Comafi', 'Hipotecario', 'Columbia', 'Industrial (BIND)', 'Bancor (Córdoba)', 'Santa Fe', 'Entre Ríos', 'San Juan', 'Santa Cruz',
    'Chubut', 'La Pampa', 'Corrientes', 'Nuevo Banco del Chaco', 'Formosa', 'Tierra del Fuego', 'Neuquén (BPN)', 'Santiago del Estero',
    'Municipal de Rosario', 'Banco del Sol', 'Piano'].map(n => ({ nombre: n, tipo: 'banco' })),
  ...['Naranja X', 'Mercado Pago', 'Ualá', 'Brubank', 'Cencosud', 'Shopping', 'Cordobesa'].map(n => ({ nombre: n, tipo: 'no bancario' })),
];
const ALIAS_EMISOR = { hsbc: 'Galicia', 'galicia mas': 'Galicia', itau: 'Macro', citi: 'Santander', citibank: 'Santander', frances: 'BBVA',
  nevada: 'Naranja X', naranja: 'Naranja X', 'banco de la nacion': 'Nación', bna: 'Nación', 'banco provincia': 'Provincia', bapro: 'Provincia',
  'banco de cordoba': 'Bancor (Córdoba)', bancor: 'Bancor (Córdoba)', bind: 'Industrial (BIND)', 'banco industrial': 'Industrial (BIND)',
  bpn: 'Neuquén (BPN)', mercadopago: 'Mercado Pago', uala: 'Ualá', uilo: 'Ualá' };
/* Nombre del banco que viene en el resumen → el de la lista, o '' si no se reconoce. */
export function emisorDe(texto) {
  const t = normalizarComercio(texto).toLowerCase();
  if (!t) return '';
  for (const [a, n] of Object.entries(ALIAS_EMISOR)) if (new RegExp(`\\b${a}\\b`).test(t)) return n;
  for (const e of EMISORES) {
    const base = normalizarComercio(e.nombre.replace(/\(.*\)/, '')).toLowerCase();
    if (base && new RegExp(`\\b${base}\\b`).test(t)) return e.nombre;
  }
  return '';
}
/* Nombre de una tarjeta: banco + red, sin escribir nada. */
export function nombreTarjeta({ banco, red, ultimos4 }, existentes = []) {
  const base = [banco, red && red !== 'Otra' ? red : ''].filter(Boolean).join(' ') || 'Mi tarjeta';
  return existentes.some(x => x.nombre === base) && ultimos4 ? `${base} ···${ultimos4}` : base;
}

/* ── rubros que recuerda la app ── */
export const normalizarComercio = s => String(s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toUpperCase().replace(/[^A-Z ]+/g, ' ').replace(/\s+/g, ' ').trim();
export function rubroPara(comercio, sugerido, memoria = {}) {
  const k = normalizarComercio(comercio);
  if (k && RUBROS.includes(memoria[k])) return memoria[k];
  return RUBROS.includes(sugerido) ? sugerido : 'Otros';
}

/* ── lectura de un resumen (lo que devuelve /api/leer-resumen) ── */
const aCentavos = x => (typeof x === 'number' && Number.isFinite(x) ? Math.round(x * 100) : null);
const mesDeFecha = f => f.slice(0, 7);

export const TIPOS_PAGO = ['pago', 'credito', 'reversion'];
export const TIPOS_CARGO = ['interes', 'iva', 'sellos', 'percepcion', 'devolucion', 'comision', 'otro'];
const fecha = f => (esFecha(f) ? f : null);
const porMoneda = lista => {
  const o = {};
  for (const t of Array.isArray(lista) ? lista : []) { const c = aCentavos(t?.monto); if (esMoneda(t?.moneda) && c !== null) o[t.moneda] = c; }
  return o;
};
const u4 = x => (/^\d{4}$/.test(String(x ?? '')) ? String(x) : '');

/* Valida y pasa a centavos. Nunca completa montos que no vinieron: una
   línea sin monto válido se descarta y se avisa. Separa consumos de pagos
   y créditos y de cargos e impuestos (esquema v2 de la lectura). */
export function validarLectura(json) {
  const errores = [];
  const avisos = Array.isArray(json?.avisos) ? json.avisos.map(String).slice(0, 10) : [];
  if (!json || typeof json !== 'object') return { ok: false, errores: ['La respuesta no tiene el formato esperado.'] };
  const vencimiento = fecha(json.vencimiento);
  if (!vencimiento) errores.push('No encontramos la fecha de vencimiento.');
  const totales = porMoneda(json.totales);
  if (!Object.keys(totales).length) errores.push('No encontramos el total a pagar.');
  let descartados = 0;
  const consumos = [];
  for (const c of Array.isArray(json.consumos) ? json.consumos : []) {
    const monto = aCentavos(c?.monto);
    if (monto === null || !esMoneda(c?.moneda) || !String(c?.comercio || '').trim()) { descartados++; continue; }
    const n = Number(c?.cuota?.n), de = Number(c?.cuota?.de);
    consumos.push({
      fecha: fecha(c.fecha), comercio: String(c.comercio).trim().slice(0, 60), monto, moneda: c.moneda,
      rubro: RUBROS.includes(c.rubro) ? c.rubro : 'Otros',
      cuota: Number.isInteger(n) && Number.isInteger(de) && n >= 1 && de >= n && de <= 72 ? { n, de } : null,
      tarjeta: u4(c.tarjeta) || null,
    });
  }
  const lineas = (lista, tipos) => {
    const out = [];
    for (const x of Array.isArray(lista) ? lista : []) {
      const monto = aCentavos(x?.monto);
      if (monto === null || !esMoneda(x?.moneda)) { descartados++; continue; }
      out.push({ fecha: fecha(x.fecha), concepto: String(x.concepto || '').trim().slice(0, 60) || 'Sin detalle', monto, moneda: x.moneda,
        tipo: tipos.includes(x.tipo) ? x.tipo : tipos[tipos.length - 1] });
    }
    return out;
  };
  const pagosYCreditos = lineas(json.pagosYCreditos, TIPOS_PAGO);
  const cargos = lineas(json.cargos, TIPOS_CARGO);
  if (descartados) avisos.push(`Dejamos afuera ${descartados} línea${descartados === 1 ? '' : 's'} que no pudimos leer bien.`);
  const tarjetas = (Array.isArray(json.tarjetas) ? json.tarjetas : []).filter(t => u4(t?.ultimos4)).slice(0, 6)
    .map(t => ({ ultimos4: u4(t.ultimos4), adicional: t.adicional === true, totales: porMoneda(t.totales) }));
  const cuotasAVencer = [];
  for (const c of Array.isArray(json.cuotasAVencer) ? json.cuotasAVencer : []) {
    const monto = aCentavos(c?.monto);
    if (esMes(c?.mes) && monto !== null && monto >= 0) cuotasAVencer.push({ mes: c.mes, monto, moneda: esMoneda(c.moneda) ? c.moneda : 'ARS', desde: c.desde === true });
  }
  const tj = json.tarjeta || {};
  const pm = json.pagoMinimo && esMoneda(json.pagoMinimo.moneda) ? { moneda: json.pagoMinimo.moneda, monto: aCentavos(json.pagoMinimo.monto) } : null;
  const lim = json.limites || {};
  const lectura = {
    tarjeta: { banco: String(tj.banco || '').trim().slice(0, 40), red: REDES.includes(tj.red) ? tj.red : 'Otra', ultimos4: u4(tj.ultimos4) || tarjetas.find(t => !t.adicional)?.ultimos4 || '' },
    tarjetas,
    periodo: { desde: fecha(json.periodo?.desde), hasta: fecha(json.periodo?.hasta) },
    cierre: fecha(json.cierre), vencimiento,
    cierreAnterior: fecha(json.cierreAnterior), vencimientoAnterior: fecha(json.vencimientoAnterior),
    proximoCierre: fecha(json.proximoCierre), proximoVencimiento: fecha(json.proximoVencimiento),
    saldoAnterior: porMoneda(json.saldoAnterior), totales, consumos, pagosYCreditos, cargos, cuotasAVencer,
    pagoMinimo: pm && pm.monto !== null ? pm : null,
    limites: { compra: aCentavos(lim.compra) || null, financiacion: aCentavos(lim.financiacion) || null },
    confianza: json.confianza === 'alta' ? 'alta' : 'baja',
    avisos,
  };
  return { ok: errores.length === 0, errores, lectura };
}

/* Mes de la tabla "cuotas a vencer" → mes en que se paga. La tabla nombra el
   mes del cierre; se paga cuando vence ese resumen (en general, al mes
   siguiente). Si viene el próximo cierre y vencimiento, se usa esa distancia. */
export function desfaseCuotasAVencer(l) {
  if (esFecha(l?.proximoCierre) && esFecha(l?.proximoVencimiento)) return Math.max(0, difMeses(l.proximoCierre.slice(0, 7), l.proximoVencimiento.slice(0, 7)));
  return 1;
}

/* Guarda una lectura revisada: crea o usa la tarjeta (también si coincide una
   adicional), carga los límites que traiga, reemplaza el resumen de ese mes
   y suma las cuotas detectadas sin duplicarlas si se importa el resumen
   siguiente. Devuelve datos nuevos (no toca los de entrada). */
export function importarResumen(datos, lectura, { tarjetaId = null, nuevoId = () => Math.random().toString(36).slice(2) } = {}) {
  const d = structuredClone(datos);
  const mes = mesDeFecha(lectura.vencimiento);
  const finales = [...new Set([lectura.tarjeta.ultimos4, ...(lectura.tarjetas || []).map(t => t.ultimos4)].filter(Boolean))];
  let tId = tarjetaId;
  if (!tId) {
    const t = lectura.tarjeta;
    const ya = finales.length && d.tarjetas.find(x => x.red === t.red && (finales.includes(x.ultimos4) || (x.adicionales || []).some(a => finales.includes(a))));
    if (ya) tId = ya.id;
    else {
      tId = nuevoId();
      const banco = emisorDe(t.banco) || t.banco;
      d.tarjetas.push({ id: tId, nombre: nombreTarjeta({ banco, red: t.red, ultimos4: t.ultimos4 }, d.tarjetas),
        red: t.red, banco, ultimos4: t.ultimos4,
        color: COLORES.find(c => !d.tarjetas.some(x => x.color === c)) || COLORES[d.tarjetas.length % COLORES.length] });
    }
  }
  const tarjeta = d.tarjetas.find(x => x.id === tId);
  if (tarjeta) {
    const adic = (lectura.tarjetas || []).filter(x => x.adicional && x.ultimos4 !== tarjeta.ultimos4).map(x => x.ultimos4);
    if (adic.length) tarjeta.adicionales = [...new Set([...(tarjeta.adicionales || []), ...adic])].slice(0, 6);
    if (lectura.limites?.compra) tarjeta.limite = lectura.limites.compra;
    if (lectura.limites?.financiacion) tarjeta.limiteFinanciacion = lectura.limites.financiacion;
  }
  const desfase = desfaseCuotasAVencer(lectura);
  d.resumenes = d.resumenes.filter(r => !(r.tarjetaId === tId && r.mes === mes));
  d.resumenes.push({ id: nuevoId(), tarjetaId: tId, mes, cierre: lectura.cierre, vencimiento: lectura.vencimiento,
    proximoCierre: lectura.proximoCierre || null, proximoVencimiento: lectura.proximoVencimiento || null,
    periodo: lectura.periodo, saldoAnterior: lectura.saldoAnterior || {}, totales: lectura.totales, pagoMinimo: lectura.pagoMinimo,
    tarjetas: lectura.tarjetas || [],
    consumos: lectura.consumos.map(c => ({ ...c })),
    pagosYCreditos: (lectura.pagosYCreditos || []).map(c => ({ ...c })),
    cargos: (lectura.cargos || []).map(c => ({ ...c })),
    cuotasAVencer: (lectura.cuotasAVencer || []).map(c => ({ ...c, mesPago: sumarMeses(c.mes, desfase) })) });
  /* compras nuevas cargadas a mano que ahora salen en el resumen: se
     concilian solas (mismo monto de cuota, cantidad, moneda y fecha cercana);
     si no es seguro, se pregunta */
  const { conciliadas, dudosas } = conciliarCompras(d, tId, lectura);
  d.cuotas = d.cuotas.filter(x => !conciliadas.includes(x.id));
  let nuevas = 0;
  for (const c of lectura.consumos) {
    if (!c.cuota || c.cuota.de < 2) continue;
    const primerMes = sumarMeses(mes, -(c.cuota.n - 1));
    const igual = x => x.tarjetaId === tId && x.cantidad === c.cuota.de && x.primerMes === primerMes &&
      (x.moneda || 'ARS') === c.moneda && normalizarComercio(x.descripcion) === normalizarComercio(c.comercio) &&
      repartirCuotas(x.total, x.cantidad)[1] === c.monto;
    if (d.cuotas.some(igual)) continue;
    d.cuotas.push({ id: nuevoId(), descripcion: c.comercio, total: c.monto * c.cuota.de, moneda: c.moneda,
      cantidad: c.cuota.de, tarjetaId: tId, primerMes, origen: 'resumen' });
    nuevas++;
  }
  return { datos: d, tarjetaId: tId, mes, cuotasNuevas: nuevas, conciliadas, dudosas };
}

/* Compara las compras nuevas (cargadas a mano, pendientes) de la tarjeta con
   los consumos del resumen. Seguro = misma moneda, misma cantidad de cuotas,
   monto de la cuota igual (±$ 1) y fecha a 10 días o menos (si hay fecha), y
   un único candidato. Parecido (±5 % o sin fecha cercana) = duda. */
export function conciliarCompras(datos, tarjetaId, lectura) {
  const pendientes = (datos.cuotas || []).filter(x => x.tarjetaId === tarjetaId && x.origen === 'manual');
  const conciliadas = [], dudosas = [];
  const usados = new Set();
  for (const p of pendientes) {
    const montoCuota = repartirCuotas(p.total, p.cantidad);
    const cand = [];
    lectura.consumos.forEach((c, i) => {
      if (usados.has(i) || (c.moneda || 'ARS') !== (p.moneda || 'ARS') || (c.cuota?.de || 1) !== p.cantidad) return;
      const esperado = montoCuota[(c.cuota?.n || 1) - 1] ?? montoCuota[0];
      const dif = Math.abs(c.monto - esperado);
      const cerca = esFecha(p.fecha) && esFecha(c.fecha) ? Math.abs(diasEntre(p.fecha, c.fecha)) <= 10 : null;
      if (dif <= 100 && cerca !== false) cand.push({ i, seguro: true });
      else if (dif <= Math.max(100, Math.round(esperado * 0.05))) cand.push({ i, seguro: false });
    });
    const seguros = cand.filter(x => x.seguro);
    if (seguros.length === 1) { conciliadas.push(p.id); usados.add(seguros[0].i); }
    else if (cand.length) {
      const c = lectura.consumos[cand[0].i];
      dudosas.push({ cuotaId: p.id, descripcion: p.descripcion || 'Compra cargada a mano', total: p.total, cantidad: p.cantidad, moneda: p.moneda || 'ARS',
        comercio: c.comercio, monto: c.monto, cuota: c.cuota });
    }
  }
  return { conciliadas, dudosas };
}

/* ── esquema y migración ── */
export const LIMITE_DEFECTO = 30;
export const datosVacios = () => ({ v: ESQUEMA, ingresos: [], gastos: [], cuotas: [], tarjetas: [], resumenes: [], cambio: {}, rubrosComercio: {},
  limiteCuotas: LIMITE_DEFECTO, alertasVistas: [], supuestos: {} });

const entero = x => Number.isSafeInteger(x) && x > 0;
const dia = x => Number.isInteger(x) && x >= 1 && x <= 31;
const texto = (x, max = 60) => (typeof x === 'string' ? x.trim().slice(0, max) : '');

/* Datos guardados (de cualquier versión) → esquema actual, sin basura.
   Lo inválido se descarta en vez de romper la pantalla.
   v1 → v2: las cuotas pasan a tener moneda (ARS), las tarjetas red, banco,
   últimos 4 y color, y aparecen resúmenes, tipo de cambio y rubros.
   v2 → v3: tope de cuotas (% de ingresos, 30 por defecto), días de cierre
   y vencimiento cargados a mano por tarjeta, alertas descartadas y los
   supuestos de "¿cuotas o contado?". */
export function migrar(crudo) {
  const out = datosVacios();
  if (!crudo || typeof crudo !== 'object') return out;
  const tarjetas = Array.isArray(crudo.tarjetas) ? crudo.tarjetas : [];
  for (const t of tarjetas) {
    const nombre = texto(t?.nombre, 40);
    if (!t?.id || !nombre) continue;
    out.tarjetas.push({ id: String(t.id), nombre,
      red: REDES.includes(t.red) ? t.red : 'Otra',
      banco: texto(t.banco, 40),
      ultimos4: /^\d{4}$/.test(String(t.ultimos4 || '')) ? String(t.ultimos4) : '',
      color: COLORES.includes(t.color) ? t.color : 'azul',
      ...(entero(t.limite) ? { limite: t.limite } : {}),
      ...(entero(t.limiteFinanciacion) ? { limiteFinanciacion: t.limiteFinanciacion } : {}),
      ...(Array.isArray(t.adicionales) ? { adicionales: t.adicionales.filter(a => /^\d{4}$/.test(String(a))).map(String).slice(0, 6) } : {}),
      ...(dia(t.diaCierre) ? { diaCierre: t.diaCierre } : {}),
      ...(dia(t.diaVence) ? { diaVence: t.diaVence } : {}) });
  }
  const ids = new Set(out.tarjetas.map(t => t.id));
  for (const i of Array.isArray(crudo.ingresos) ? crudo.ingresos : []) {
    if (!i?.id || !entero(i.monto) || !esMes(i.desde)) continue;
    out.ingresos.push({ id: String(i.id), nombre: texto(i.nombre) || 'Ingreso', monto: i.monto,
      repite: !!i.repite, desde: i.desde, ...(i.repite && esMes(i.hasta) ? { hasta: i.hasta } : {}) });
  }
  for (const g of Array.isArray(crudo.gastos) ? crudo.gastos : []) {
    if (!g?.id || !entero(g.monto) || !esMes(g.desde)) continue;
    const categoria = CATEGORIAS.includes(g.categoria) ? g.categoria : 'Otros';
    out.gastos.push({ id: String(g.id), nombre: texto(g.nombre) || categoria, categoria, monto: g.monto,
      repite: !!g.repite, desde: g.desde, ...(g.repite && esMes(g.hasta) ? { hasta: g.hasta } : {}) });
  }
  for (const c of Array.isArray(crudo.cuotas) ? crudo.cuotas : []) {
    if (!c?.id || !entero(c.total) || !entero(c.cantidad) || c.cantidad > 72 || !esMes(c.primerMes)) continue;
    if (!ids.has(String(c.tarjetaId))) continue;
    out.cuotas.push({ id: String(c.id), descripcion: texto(c.descripcion), total: c.total,
      moneda: esMoneda(c.moneda) ? c.moneda : 'ARS',
      cantidad: c.cantidad, tarjetaId: String(c.tarjetaId), primerMes: c.primerMes,
      ...(c.origen === 'resumen' || c.origen === 'manual' ? { origen: c.origen } : {}), ...(esFecha(c.fecha) ? { fecha: c.fecha } : {}) });
  }
  for (const r of Array.isArray(crudo.resumenes) ? crudo.resumenes : []) {
    if (!r?.id || !ids.has(String(r.tarjetaId)) || !esMes(r.mes)) continue;
    const totales = {};
    for (const [m, v] of Object.entries(r.totales || {})) if (esMoneda(m) && Number.isSafeInteger(v)) totales[m] = v;
    const consumos = (Array.isArray(r.consumos) ? r.consumos : []).filter(c =>
      Number.isSafeInteger(c?.monto) && esMoneda(c?.moneda) && texto(c?.comercio)).map(c => ({
      fecha: esFecha(c.fecha) ? c.fecha : null, comercio: texto(c.comercio), monto: c.monto, moneda: c.moneda,
      rubro: RUBROS.includes(c.rubro) ? c.rubro : 'Otros',
      cuota: c.cuota && Number.isInteger(c.cuota.n) && Number.isInteger(c.cuota.de) ? { n: c.cuota.n, de: c.cuota.de } : null,
      tarjeta: /^\d{4}$/.test(String(c.tarjeta || '')) ? String(c.tarjeta) : null }));
    const centMon = o => Object.fromEntries(Object.entries(o && typeof o === 'object' ? o : {}).filter(([m, v]) => esMoneda(m) && Number.isSafeInteger(v)));
    const lin = (l, tipos) => (Array.isArray(l) ? l : []).filter(x => Number.isSafeInteger(x?.monto) && esMoneda(x?.moneda)).slice(0, 200)
      .map(x => ({ fecha: esFecha(x.fecha) ? x.fecha : null, concepto: texto(x.concepto) || 'Sin detalle', monto: x.monto, moneda: x.moneda, tipo: tipos.includes(x.tipo) ? x.tipo : tipos[tipos.length - 1] }));
    out.resumenes.push({ id: String(r.id), tarjetaId: String(r.tarjetaId), mes: r.mes,
      cierre: esFecha(r.cierre) ? r.cierre : null, vencimiento: esFecha(r.vencimiento) ? r.vencimiento : null,
      proximoCierre: esFecha(r.proximoCierre) ? r.proximoCierre : null, proximoVencimiento: esFecha(r.proximoVencimiento) ? r.proximoVencimiento : null,
      saldoAnterior: centMon(r.saldoAnterior),
      pagosYCreditos: lin(r.pagosYCreditos, TIPOS_PAGO), cargos: lin(r.cargos, TIPOS_CARGO),
      tarjetas: (Array.isArray(r.tarjetas) ? r.tarjetas : []).filter(t => /^\d{4}$/.test(String(t?.ultimos4))).slice(0, 6).map(t => ({ ultimos4: String(t.ultimos4), adicional: t.adicional === true, totales: centMon(t.totales) })),
      cuotasAVencer: (Array.isArray(r.cuotasAVencer) ? r.cuotasAVencer : []).filter(c => esMes(c?.mes) && esMes(c?.mesPago) && Number.isSafeInteger(c?.monto))
        .slice(0, 24).map(c => ({ mes: c.mes, mesPago: c.mesPago, monto: c.monto, moneda: esMoneda(c.moneda) ? c.moneda : 'ARS', desde: c.desde === true })),
      periodo: r.periodo && typeof r.periodo === 'object' ? { desde: esFecha(r.periodo.desde) ? r.periodo.desde : null, hasta: esFecha(r.periodo.hasta) ? r.periodo.hasta : null } : { desde: null, hasta: null },
      totales, pagoMinimo: r.pagoMinimo && esMoneda(r.pagoMinimo.moneda) && Number.isSafeInteger(r.pagoMinimo.monto) ? { moneda: r.pagoMinimo.moneda, monto: r.pagoMinimo.monto } : null,
      consumos });
  }
  for (const [m, c] of Object.entries(crudo.cambio && typeof crudo.cambio === 'object' ? crudo.cambio : {})) {
    if (esMoneda(m) && m !== 'ARS' && entero(c?.valor)) {
      out.cambio[m] = { valor: c.valor, fuente: texto(c.fuente, 160) || 'Lo cargaste vos', fecha: esFecha(c.fecha) ? c.fecha : '', ...(c.url ? { url: String(c.url).slice(0, 300) } : {}) };
    }
  }
  for (const [k, v] of Object.entries(crudo.rubrosComercio && typeof crudo.rubrosComercio === 'object' ? crudo.rubrosComercio : {})) {
    if (RUBROS.includes(v) && normalizarComercio(k)) out.rubrosComercio[normalizarComercio(k)] = v;
  }
  const lim = Number(crudo.limiteCuotas);
  out.limiteCuotas = Number.isFinite(lim) && lim > 0 && lim <= 100 ? Math.round(lim) : LIMITE_DEFECTO;
  out.alertasVistas = (Array.isArray(crudo.alertasVistas) ? crudo.alertasVistas : []).filter(x => typeof x === 'string').slice(-200);
  const sup = crudo.supuestos && typeof crudo.supuestos === 'object' ? crudo.supuestos : {};
  for (const k of ['inflacion', 'rendimiento']) {
    const v = Number(sup[k]?.valor);
    if (Number.isFinite(v) && v >= 0 && v < 100) out.supuestos[k] = { valor: v, fecha: esFecha(sup[k].fecha) ? sup[k].fecha : '' };
  }
  return out;
}

/* ── control de la lectura: ¿la suma da? ──
   Recibe la lectura cruda (montos en unidades, como viene de la API).
   Por moneda: saldo anterior + pagos y créditos + consumos + cargos e
   impuestos = total a pagar, con tolerancia de centavos. Si hay varias
   tarjetas (adicionales), los consumos de cada una tienen que dar su
   subtotal. Si algo no da, la lectura NO es confiable. */
export const TOLERANCIA_CUADRE = 10;          // centavos
export function cuadreLectura(json) {
  const motivos = [];
  const c = x => (typeof x === 'number' && Number.isFinite(x) ? Math.round(x * 100) : null);
  const totales = new Map();
  for (const t of Array.isArray(json?.totales) ? json.totales : []) {
    if (esMoneda(t?.moneda) && c(t.monto) !== null) totales.set(t.moneda, c(t.monto));
  }
  if (!totales.size) motivos.push('No encontramos el total a pagar.');
  const sumas = new Map();
  const sumar = (m, v) => sumas.set(m, (sumas.get(m) || 0) + v);
  for (const t of Array.isArray(json?.saldoAnterior) ? json.saldoAnterior : []) {
    if (esMoneda(t?.moneda) && c(t.monto) !== null) sumar(t.moneda, c(t.monto));
  }
  const lineas = [json?.consumos, json?.pagosYCreditos, json?.cargos, json?.ajustes].flatMap(l => (Array.isArray(l) ? l : []));
  for (const x of lineas) {
    const v = c(x?.monto);
    if (v === null) { motivos.push('Hay líneas sin monto legible.'); continue; }
    if (!esMoneda(x?.moneda)) { motivos.push('Hay montos en una moneda que no pudimos identificar.'); continue; }
    sumar(x.moneda, v);
  }
  for (const [m, total] of totales) {
    if (Math.abs((sumas.get(m) || 0) - total) > TOLERANCIA_CUADRE) motivos.push(`Lo que leímos en ${MONEDAS[m].nombre} no suma el total del resumen.`);
  }
  for (const m of sumas.keys()) {
    if (!totales.has(m) && Math.abs(sumas.get(m)) > TOLERANCIA_CUADRE) motivos.push(`Hay movimientos en ${MONEDAS[m].nombre} sin un total para esa moneda.`);
  }
  /* subtotales por tarjeta (titular y adicionales) */
  for (const t of Array.isArray(json?.tarjetas) ? json.tarjetas : []) {
    for (const st of Array.isArray(t?.totales) ? t.totales : []) {
      const esperado = c(st?.monto);
      if (esperado === null || !esMoneda(st?.moneda)) continue;
      const suma = (json.consumos || []).filter(x => String(x?.tarjeta) === String(t.ultimos4) && x?.moneda === st.moneda).reduce((s, x) => s + (c(x.monto) || 0), 0);
      if (Math.abs(suma - esperado) > TOLERANCIA_CUADRE) motivos.push('Los consumos de una de las tarjetas no suman su subtotal.');
    }
  }
  return { ok: motivos.length === 0, motivos: [...new Set(motivos)] };
}

/* ═══════════════ Paso 4 ═══════════════ */

/* ── escalera de cuotas ──
   Cuánto está comprometido en cuotas cada mes, por tarjeta (en pesos, con
   la moneda extranjera convertida), y el primer mes sin cuotas. Acá cuentan
   todas las cuotas, también las que ya están adentro de un resumen. */
/* Tabla "cuotas a vencer" del último resumen de cada tarjeta, por mes de
   pago: { tarjetaId: { 'AAAA-MM': centavosARS } } y el tramo "a partir de". */
export function tablaCuotasAVencer(datos) {
  const out = {};
  for (const t of datos?.tarjetas || []) {
    const r = (datos.resumenes || []).filter(x => x.tarjetaId === t.id && x.cuotasAVencer?.length).sort((a, b) => difMeses(a.mes, b.mes)).pop();
    if (!r) continue;
    const meses = {};
    let desde = null;
    for (const c of r.cuotasAVencer) {
      const ars = aPesos(c.monto, c.moneda || 'ARS', datos);
      if (ars === null) continue;
      if (c.desde) desde = { mes: c.mesPago, monto: ars }; else meses[c.mesPago] = (meses[c.mesPago] || 0) + ars;
    }
    out[t.id] = { meses, desde, resumenMes: r.mes };
  }
  return out;
}
/* Cuánto está comprometido en cuotas cada mes, por tarjeta. Si el banco
   trajo la tabla "cuotas a vencer", para esos meses manda la tabla y se
   cruza con la proyección propia (diferencias a la vista). */
export function escalera(datos, desde, meses = 12) {
  const tabla = tablaCuotasAVencer(datos);
  const diferencias = [];
  const filas = Array.from({ length: meses }, (_, k) => {
    const mes = sumarMeses(desde, k);
    const propio = {};
    const sinCambio = new Set();
    for (const c of datos?.cuotas || []) {
      const n = numeroDeCuota(c, mes);
      if (!n) continue;
      const ars = aPesos(repartirCuotas(c.total, c.cantidad)[n - 1], c.moneda || 'ARS', datos);
      if (ars === null) { sinCambio.add(c.moneda); continue; }
      propio[c.tarjetaId] = (propio[c.tarjetaId] || 0) + ars;
    }
    const porTarjeta = { ...propio };
    const delBanco = [];
    for (const [tId, tb] of Object.entries(tabla)) {
      if (!(mes in tb.meses)) continue;
      const banco = tb.meses[mes];
      const p = propio[tId] || 0;
      if (Math.abs(banco - p) > Math.max(10_000, Math.round(banco * 0.01))) diferencias.push({ mes, tarjetaId: tId, banco, propio: p });
      porTarjeta[tId] = banco;
      delBanco.push(tId);
    }
    for (const t of Object.keys(porTarjeta)) if (!porTarjeta[t]) delete porTarjeta[t];
    const total = Object.values(porTarjeta).reduce((a, b) => a + b, 0);
    return { mes, porTarjeta, total, delBanco, sinCambio: [...sinCambio], ...limiteDelMes(datos, mes, total) };
  });
  /* si el banco dice que quedan cuotas "a partir de" un mes, no estás libre antes */
  let mesLibre = mesLibreDeCuotas(datos, desde);
  for (const tb of Object.values(tabla)) {
    if (tb.desde?.monto > 0 && difMeses(mesLibre, tb.desde.mes) >= 0) mesLibre = sumarMeses(tb.desde.mes, 1);
    for (const [m, v] of Object.entries(tb.meses)) if (v > 0 && difMeses(mesLibre, m) >= 0) mesLibre = sumarMeses(m, 1);
  }
  return { filas, mesLibre, diferencias };
}
/* Primer mes, desde `desde`, a partir del cual no queda ninguna cuota. */
export function mesLibreDeCuotas(datos, desde) {
  let ultimo = null;
  for (const c of datos?.cuotas || []) {
    const u = ultimoMes(c);
    if (difMeses(desde, u) >= 0 && (!ultimo || difMeses(ultimo, u) > 0)) ultimo = u;
  }
  return ultimo ? sumarMeses(ultimo, 1) : desde;
}

/* ── alerta de límite ── tope = % de los ingresos del mes que puede ir a cuotas. */
export function limiteDelMes(datos, mes, cuotasDelMes = null) {
  const pct = datos?.limiteCuotas || LIMITE_DEFECTO;
  const ingresos = resumenMes(datos, mes).totIngresos;
  const cuotas = cuotasDelMes ?? escalera(datos, mes, 1).filas[0].total;
  const tope = Math.round((ingresos * pct) / 100);
  return { pct, ingresos, tope, cuotas, supera: cuotas > 0 && cuotas > tope, usado: ingresos ? cuotas / ingresos : null };
}

/* ── fechas ── */
const aUTC = f => { const [a, m, d] = f.split('-').map(Number); return Date.UTC(a, m - 1, d); };
export const diasEntre = (desde, hasta) => Math.round((aUTC(hasta) - aUTC(desde)) / 86_400_000);
const diasDelMes = m => { const [a, b] = m.split('-').map(Number); return new Date(Date.UTC(a, b, 0)).getUTCDate(); };
/* El día `d` de ese mes; si el mes es más corto, su último día (31 → 30/28). */
export const fechaConDia = (mes, d) => `${mes}-${String(Math.min(d, diasDelMes(mes))).padStart(2, '0')}`;

/* Cierre y vencimiento vigentes de una tarjeta para `hoy` (AAAA-MM-DD).
   Primero el resumen importado que todavía no venció; si no hay, los días
   que cargó la persona (el vencimiento es el primero que cae después del
   cierre). Devuelve null si no hay con qué calcular. */
export function cicloTarjeta(datos, tarjetaId, hoy) {
  const res = (datos?.resumenes || []).filter(r => r.tarjetaId === tarjetaId && esFecha(r.vencimiento) && diasEntre(hoy, r.vencimiento) >= 0)
    .sort((a, b) => diasEntre(b.vencimiento, a.vencimiento))[0];
  if (res) return { cierre: res.cierre || null, vencimiento: res.vencimiento, mes: res.mes, resumen: res, origen: 'resumen' };
  /* el resumen ya venció pero trajo el próximo cierre y vencimiento */
  const prox = (datos?.resumenes || []).filter(r => r.tarjetaId === tarjetaId && esFecha(r.proximoVencimiento) && diasEntre(hoy, r.proximoVencimiento) >= 0)
    .sort((a, b) => diasEntre(a.proximoVencimiento, b.proximoVencimiento))[0];
  if (prox) return { cierre: prox.proximoCierre || null, vencimiento: prox.proximoVencimiento, mes: prox.proximoVencimiento.slice(0, 7), resumen: null, origen: 'proximo' };
  const t = (datos?.tarjetas || []).find(x => x.id === tarjetaId);
  if (!t?.diaCierre || !t?.diaVence) return null;
  const mesHoy = hoy.slice(0, 7);
  /* último cierre que ya pasó (o es hoy) */
  let cierre = fechaConDia(mesHoy, t.diaCierre);
  if (diasEntre(cierre, hoy) < 0) cierre = fechaConDia(sumarMeses(mesHoy, -1), t.diaCierre);
  let vencimiento = fechaConDia(cierre.slice(0, 7), t.diaVence);
  if (diasEntre(cierre, vencimiento) <= 0) vencimiento = fechaConDia(sumarMeses(cierre.slice(0, 7), 1), t.diaVence);
  if (diasEntre(hoy, vencimiento) < 0) {
    /* ya venció: el ciclo que viene */
    cierre = fechaConDia(sumarMeses(cierre.slice(0, 7), 1), t.diaCierre);
    vencimiento = fechaConDia(cierre.slice(0, 7), t.diaVence);
    if (diasEntre(cierre, vencimiento) <= 0) vencimiento = fechaConDia(sumarMeses(cierre.slice(0, 7), 1), t.diaVence);
  }
  return { cierre, vencimiento, mes: vencimiento.slice(0, 7), resumen: null, origen: 'manual' };
}

/* ── alertas de tarjeta ── (cierre, vencimiento próximo y dólares)
   Cada alerta tiene un id por ciclo: descartarla oculta solo esa. */
export const DIAS_AVISO_VENCE = 5;
export const PERCEPCION = 0.30;
export function alertasTarjetas(datos, hoy) {
  const out = [];
  const vistas = new Set(datos?.alertasVistas || []);
  for (const t of datos?.tarjetas || []) {
    const ciclo = cicloTarjeta(datos, t.id, hoy);
    if (!ciclo) continue;
    const { cierre, vencimiento } = ciclo;
    const faltan = diasEntre(hoy, vencimiento);
    const cerrado = !cierre || diasEntre(cierre, hoy) >= 0;
    const montoMes = tarjetaEnMes(datos, t.id, ciclo.mes).total;
    const avisaVence = faltan >= 0 && faltan <= DIAS_AVISO_VENCE;
    const proximo = `Lo que compres ahora va al resumen de ${nombreMes(sumarMeses(ciclo.mes, 1))}.`;
    /* si ya avisamos que vence, el cierre va adentro de ese mismo aviso */
    if (cerrado && faltan >= 0 && !avisaVence) {
      out.push({ id: `cierre:${t.id}:${vencimiento}`, tipo: 'cierre', tarjetaId: t.id, nivel: 'info', fecha: cierre,
        titulo: `Ya cerró el resumen de ${t.nombre}`,
        texto: proximo });
    }
    if (avisaVence) {
      const cuando = faltan === 0 ? 'Vence hoy' : faltan === 1 ? 'Vence mañana' : `Vence en ${faltan} días`;
      out.push({ id: `vence:${t.id}:${vencimiento}`, tipo: 'vence', tarjetaId: t.id, nivel: faltan <= 1 ? 'fuerte' : 'aviso', fecha: vencimiento, dias: faltan,
        titulo: `${cuando}: ${formatoPesos(montoMes)}`, texto: `Resumen de ${t.nombre}, vence el ${fechaCorta(vencimiento)}.${cerrado ? ` ${proximo}` : ''}` });
    }
    const usd = ciclo.resumen?.totales?.USD || 0;
    if (usd > 0 && cerrado && faltan >= 0) {
      const ahorro = ahorroPagandoEnDolares(usd, datos);
      out.push({ id: `dolares:${t.id}:${vencimiento}`, tipo: 'dolares', tarjetaId: t.id, nivel: 'info', fecha: vencimiento, usd, ahorro,
        titulo: `Tenés ${formatoMoneda(usd, 'USD')} en ${t.nombre}`,
        texto: `Si pagás ese saldo con dólares propios antes del ${fechaCorta(vencimiento)}, no te cobran la percepción del 30 % (unos ${formatoPesos(ahorro)} de diferencia, aproximado).` });
    }
  }
  const orden = { fuerte: 0, aviso: 1, info: 2 };
  return out.filter(a => !vistas.has(a.id)).sort((a, b) => orden[a.nivel] - orden[b.nivel] || diasEntre(b.fecha, a.fecha));
}
/* Diferencia aproximada entre pagar US$ X en pesos (dólar tarjeta) y con
   dólares propios: el 30 % de percepción sobre el oficial. El oficial se
   estima como dólar tarjeta / 1,30. */
export function ahorroPagandoEnDolares(usdCentavos, datos) {
  const c = cambioDe(datos, 'USD');
  if (!c) return 0;
  const oficial = c.valor / (1 + PERCEPCION);
  return Math.round((usdCentavos * (c.valor - oficial)) / 100);
}

/* ── calendario (.ics) ── cierre, vencimiento y recordatorio de dólares,
   con avisos que suenan en el teléfono sin servidor ni push. */
const escICS = s => String(s).replace(/\\/g, '\\\\').replace(/[,;]/g, m => '\\' + m).replace(/\r?\n/g, '\\n');
const plegar = l => { const out = []; let x = l; while (x.length > 74) { out.push(x.slice(0, 74)); x = ' ' + x.slice(74); } out.push(x); return out.join('\r\n'); };
const sinGuiones = f => f.replace(/-/g, '');
export const sumarDias = (f, k) => new Date(aUTC(f) + k * 86_400_000).toISOString().slice(0, 10);
const diaSiguiente = f => sumarDias(f, 1);
export function generarICS(eventos, { ahora = new Date() } = {}) {
  const stamp = ahora.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const lineas = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Orbit//Mi Mes by Orbit//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  for (const e of eventos) {
    lineas.push('BEGIN:VEVENT', `UID:${e.uid}@mi-mes.orbitando.com.ar`, `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${sinGuiones(e.fecha)}`, `DTEND;VALUE=DATE:${sinGuiones(diaSiguiente(e.fecha))}`,
      `SUMMARY:${escICS(e.titulo)}`, ...(e.detalle ? [`DESCRIPTION:${escICS(e.detalle)}`] : []), 'TRANSP:TRANSPARENT');
    for (const a of e.avisos || ['-PT15H']) lineas.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escICS(e.titulo)}`, `TRIGGER:${a}`, 'END:VALARM');
    lineas.push('END:VEVENT');
  }
  lineas.push('END:VCALENDAR');
  return lineas.map(plegar).join('\r\n') + '\r\n';
}
/* Eventos de una tarjeta para su ciclo vigente. */
export function eventosTarjeta(datos, tarjetaId, hoy) {
  const t = (datos?.tarjetas || []).find(x => x.id === tarjetaId);
  const ciclo = t && cicloTarjeta(datos, tarjetaId, hoy);
  if (!ciclo) return [];
  const total = tarjetaEnMes(datos, tarjetaId, ciclo.mes).total;
  const ev = [];
  if (ciclo.cierre && diasEntre(hoy, ciclo.cierre) >= 0) {
    ev.push({ uid: `cierre-${tarjetaId}-${ciclo.cierre}`, fecha: ciclo.cierre, titulo: `Cierra el resumen de ${t.nombre}`,
      detalle: 'Lo que compres después de hoy va al resumen siguiente.', avisos: ['PT9H'] });
  }
  ev.push({ uid: `vence-${tarjetaId}-${ciclo.vencimiento}`, fecha: ciclo.vencimiento, titulo: `Vence ${t.nombre}: ${formatoPesos(total)}`,
    detalle: 'Recordatorio de Mi Mes by Orbit. El monto es el de la app: confirmalo con tu resumen.', avisos: ['-P2DT15H', '-PT15H', 'PT9H'] });
  const usd = ciclo.resumen?.totales?.USD || 0;
  if (usd > 0) {
    const f = diasEntre(hoy, ciclo.vencimiento) >= 2 ? sumarDias(ciclo.vencimiento, -2) : ciclo.vencimiento;
    ev.push({ uid: `dolares-${tarjetaId}-${ciclo.vencimiento}`, fecha: f, titulo: `${t.nombre}: ${formatoMoneda(usd, 'USD')} para pagar en dólares`,
      detalle: `Si pagás ese saldo con dólares propios antes del vencimiento, no te cobran la percepción del 30 % (unos ${formatoPesos(ahorroPagandoEnDolares(usd, datos))}). Orientativo: confirmá con tu banco cómo hacerlo.`,
      avisos: ['PT9H'] });
  }
  return ev;
}

/* ── ¿cuotas o contado? ── UN método: valor presente.
   Cada cuota se lleva a plata de hoy con la tasa más alta entre la
   inflación esperada y lo que rinde la plata (tener la plata hoy vale, como
   mínimo, eso). VP de las cuotas − precio de contado = diferencia: si es
   negativa, las cuotas salen más baratas. Orientativo, no asesoramiento. */
export const SUPUESTOS_DEFECTO = {
  inflacion: { valor: 1.7, fecha: '2026-08-06', fuente: 'Inflación mensual esperada para octubre, REM del BCRA de agosto 2026 (vía NoticiasNQN)',
    url: 'https://www.noticiasnqn.com.ar/noticias/2026/08/06/346909-el-bcra-proyecta-inflacion-por-debajo-del-2por_ciento-y-un-dolar-a-1652-para-fin-de-2026' },
  rendimiento: { valor: 1.56, fecha: '2026-10-01', fuente: 'Plazo fijo a 30 días en Banco Nación: 18,75 % TNA ≈ 1,56 % por mes (calcularsueldo.com.ar)',
    url: 'https://calcularsueldo.com.ar/?p=16106' },
};
export const supuesto = (datos, k) => (datos?.supuestos?.[k] ? { ...SUPUESTOS_DEFECTO[k], ...datos.supuestos[k], fuente: 'Lo cargaste vos', url: '' } : SUPUESTOS_DEFECTO[k]);
export function cuotasOContado({ precioCuotas, descuentoContado = 0, cuotas, inflacion, rendimiento, precioContado = null }) {
  const n = Math.max(1, Math.floor(cuotas));
  const contado = precioContado ?? Math.round(precioCuotas * (1 - descuentoContado / 100));
  const pagos = repartirCuotas(precioCuotas, n);
  const usaRendimiento = rendimiento >= inflacion;
  const tasa = Math.max(inflacion, rendimiento);
  const t = tasa / 100;
  /* la primera cuota se paga al mes siguiente */
  const vp = Math.round(pagos.reduce((s, p, i) => s + p / (1 + t) ** (i + 1), 0));
  const diferencia = vp - contado;                 // > 0: las cuotas salen más caras
  const umbral = Math.max(100, Math.round(contado * 0.005));
  return { contado, cuota: pagos[pagos.length - 1], pagos, tasa, tasaUsada: usaRendimiento ? 'rendimiento' : 'inflacion', vp, diferencia,
    conviene: diferencia < -umbral ? 'cuotas' : diferencia > umbral ? 'contado' : 'da igual' };
}

/* ── simulador ── "¿y si compro esto en N cuotas?": te quedan libres antes y
   después, mes a mes, con la alerta de límite. No toca los datos. */
export function simularCompra(datos, compra, desde, meses = 12) {
  const moneda = compra.moneda || 'ARS';
  const partes = repartirCuotas(compra.total, compra.cantidad);
  const conCompra = { ...datos, cuotas: [...(datos?.cuotas || []), { id: '__sim', descripcion: 'Simulación', total: compra.total, moneda,
    cantidad: compra.cantidad, tarjetaId: compra.tarjetaId || '__sim', primerMes: compra.primerMes }] };
  return Array.from({ length: meses }, (_, k) => {
    const mes = sumarMeses(desde, k);
    const antes = resumenMes(datos, mes).libres;
    const n = numeroDeCuota({ primerMes: compra.primerMes, cantidad: compra.cantidad }, mes);
    const nueva = n ? aPesos(partes[n - 1], moneda, datos) : 0;
    const lim = limiteDelMes(conCompra, mes);
    return { mes, antes, nueva, despues: nueva === null ? null : antes - nueva, cuota: n || null, supera: lim.supera, limite: lim };
  });
}

/* ── avisos push: lo MÍNIMO que se manda al servidor ──
   Por tarjeta: id, nombre, cierre, vencimiento, si tiene dólares (sí/no) y
   los días cargados a mano (para que el servidor siga el ciclo siguiente).
   Nunca montos, consumos, banco ni números de tarjeta. */
export function datosParaAvisos(datos, hoy) {
  return (datos?.tarjetas || []).slice(0, 12).map(t => {
    const ciclo = cicloTarjeta(datos, t.id, hoy);
    const r = ciclo?.resumen;
    const dolares = Boolean(r && ((r.totales?.USD || 0) > 0 || (r.consumos || []).some(c => c.moneda === 'USD')));
    return {
      id: String(t.id).slice(0, 60), nombre: String(t.nombre).slice(0, 40),
      cierre: ciclo?.cierre || null, vencimiento: ciclo?.vencimiento || null, dolares,
      ...(r?.proximoCierre && r?.proximoVencimiento ? { proximoCierre: r.proximoCierre, proximoVencimiento: r.proximoVencimiento } : {}),
      ...(t.diaCierre && t.diaVence ? { diaCierre: t.diaCierre, diaVence: t.diaVence } : {}),
    };
  }).filter(t => t.vencimiento || t.diaCierre);
}
/* Del lado del servidor: deja pasar solo esos campos, aunque manden más. */
export function limpiarTarjetasAvisos(lista) {
  const out = [];
  for (const t of Array.isArray(lista) ? lista.slice(0, 12) : []) {
    const id = typeof t?.id === 'string' ? t.id.slice(0, 60) : '';
    const nombre = typeof t?.nombre === 'string' ? t.nombre.trim().slice(0, 40) : '';
    if (!id || !nombre) continue;
    const x = { id, nombre, cierre: esFecha(t.cierre) ? t.cierre : null, vencimiento: esFecha(t.vencimiento) ? t.vencimiento : null, dolares: t.dolares === true };
    if (esFecha(t.proximoCierre) && esFecha(t.proximoVencimiento)) { x.proximoCierre = t.proximoCierre; x.proximoVencimiento = t.proximoVencimiento; }
    if (Number.isInteger(t.diaCierre) && Number.isInteger(t.diaVence) && t.diaCierre >= 1 && t.diaCierre <= 31 && t.diaVence >= 1 && t.diaVence <= 31) {
      x.diaCierre = t.diaCierre; x.diaVence = t.diaVence;
    }
    if (x.vencimiento || x.diaCierre) out.push(x);
  }
  return out;
}
/* Qué avisos tocan hoy (sin montos). Si las fechas guardadas ya pasaron y
   hay días cargados, sigue con el ciclo siguiente. */
export function avisosPushDeHoy(tarjetas, hoy, credito = []) {
  const out = [];
  if (credito.includes(hoy.slice(0, 7))) {
    out.push({ tag: `mm:credito:${hoy.slice(0, 7)}`, title: 'Este mes lo que vence en tus tarjetas supera tu plata líquida',
      body: 'Abrí Mi Mes para ver cuánto te falta y qué viene de compras nuevas.' });
  }
  for (const t of tarjetas || []) {
    let { cierre, vencimiento } = t;
    let dolares = t.dolares;
    if ((!vencimiento || diasEntre(hoy, vencimiento) < 0) && t.proximoVencimiento && diasEntre(hoy, t.proximoVencimiento) >= 0) {
      ({ proximoCierre: cierre, proximoVencimiento: vencimiento } = t); dolares = false;   // de ese resumen todavía no sabemos si hay dólares
    } else if ((!vencimiento || diasEntre(hoy, vencimiento) < 0) && t.diaCierre) {
      const c = cicloTarjeta({ tarjetas: [{ id: t.id, diaCierre: t.diaCierre, diaVence: t.diaVence }], resumenes: [] }, t.id, hoy);
      if (c) ({ cierre, vencimiento } = c);
    }
    if (!vencimiento) continue;
    const d = diasEntre(hoy, vencimiento);
    if (cierre === hoy) out.push({ tag: `mm:cierre:${t.id}:${cierre}`, title: `Cerró el resumen de tu ${t.nombre}`, body: 'Lo que compres desde hoy va al resumen siguiente.' });
    if (d === 3 || d === 1 || d === 0) {
      const cuando = d === 0 ? 'vence hoy' : d === 1 ? 'vence mañana' : 'vence en 3 días';
      out.push({ tag: `mm:vence:${t.id}:${vencimiento}:${d}`, title: `Tu ${t.nombre} ${cuando}`, body: 'Abrí Mi Mes para ver el total y agendar el pago.' });
    }
    if (dolares && d === 5) {
      out.push({ tag: `mm:dolares:${t.id}:${vencimiento}`, title: `Tu ${t.nombre} tiene consumos en dólares`,
        body: `Si los pagás con dólares propios antes del ${fechaCorta(vencimiento)}, no te cobran la percepción del 30 %. Orientativo: confirmalo con tu banco.` });
    }
  }
  return out;
}


/* ── intereses y cargos de un resumen ──
   Suma de cargos e impuestos (intereses, IVA, sellos, percepciones,
   comisiones); las devoluciones restan. En pesos, con otras monedas convertidas. */
export function cargosDelResumen(resumen, datos) {
  const porMoneda = {};
  for (const c of resumen?.cargos || []) porMoneda[c.moneda] = (porMoneda[c.moneda] || 0) + c.monto;
  let ars = 0;
  for (const [m, v] of Object.entries(porMoneda)) ars += aPesos(v, m, datos) ?? 0;
  return { ars, porMoneda, hay: (resumen?.cargos || []).length > 0 };
}

/* ── cuándo se te libera plata ──
   Mes a mes, cuando baja lo comprometido en cuotas respecto del mes
   anterior: { mes, libera } (centavos por mes que dejás de pagar). */
export function liberaciones(datos, desde, meses = 18) {
  const f = escalera(datos, sumarMeses(desde, -1), meses + 1).filas;
  const out = [];
  for (let k = 1; k < f.length; k++) {
    const libera = f[k - 1].total - f[k].total;
    if (libera > 0) out.push({ mes: f[k].mes, libera });
  }
  return out;
}
/* La próxima liberación a partir de un mes (incluido el mes siguiente). */
export const proximaLiberacion = (datos, mes, meses = 18) => liberaciones(datos, sumarMeses(mes, 1), meses)[0] || null;
