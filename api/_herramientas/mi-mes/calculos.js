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

export const ESQUEMA = 4;

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
  'Entretenimiento', 'Suscripciones', 'Hogar', 'Educación', 'Otros',
];
/* Reglas fijas de rubro (ganan sobre lo que sugiere la lectura, no sobre lo que corrigió la persona). */
export const REGLAS_RUBRO = [
  [/\b(EASY|SODIMAC|BLAISTEN|CORRALON|PINTURERIA|FERRETERIA)\b/, 'Hogar'],
  [/\.EDU\.AR\b|\bUNIVERSIDAD\b|\bUNIV\b|\bCOLEGIO\b|\bINSTITUTO\b|\bESCUELA\b/, 'Educación'],
];
export function rubroPorRegla(comercio) {
  const k = String(comercio || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  return REGLAS_RUBRO.find(([re]) => re.test(k))?.[1] || null;
}
/* Nombre del comercio sin la moneda ni el monto pegados al final:
   "RUNWAY PRO PLAN csliveb1uUSD 35,00" → "RUNWAY PRO PLAN"; "WWW.MAKE.COM USD 10,59" → "WWW.MAKE.COM". */
export const limpiarComercio = s => String(s || '').trim()
  .replace(/\s+\S*?(?:USD|U\$S|EUR|ARS)\s*[\d.,]+\s*$/i, '')
  .replace(/\s+(?:USD|U\$S|EUR)\s*$/i, '').trim() || String(s || '').trim();
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
   Es el OFICIAL (vendedor): a eso se convierte el saldo en dólares de un
   resumen si se paga con pesos. La percepción del 30 % (RG 5617) no va acá:
   el banco la cobra como cargo en pesos en el resumen siguiente, y la app la
   proyecta aparte, marcada "estimado", hasta que llega ese resumen.
   Se muestra siempre con su fuente y su fecha, y la persona lo puede cambiar. */
export const CAMBIO_DEFECTO = {
  USD: {
    valor: 153500, fecha: '2026-10-10',
    fuente: 'Dólar oficial Banco Nación (venta) $ 1.535 (El Cronista)',
    url: 'https://www.cronista.com/finanzas-mercados/dolar-hoy-a-cuanto-cotiza-el-oficial-en-los-bancos-de-la-city-este-sabado-10-de-octubre/',
  },
  EUR: {
    valor: 170096, fecha: '2026-10-11',
    fuente: 'Euro oficial $ 1.700,96 (cotizacion-dolar.com.ar)',
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
/* Con `percepcion: true` suma el 30 % de la RG 5617: es lo que termina
   costando en pesos una compra NUEVA en moneda extranjera (todavía no tiene la
   percepción cobrada en ningún resumen). */
export function aPesos(centavos, moneda, datos, { percepcion = false } = {}) {
  if (moneda === 'ARS' || !moneda) return centavos;
  const c = cambioDe(datos, moneda);
  if (!c) return null;
  return Math.round((centavos * c.valor * (percepcion ? 1 + PERCEPCION_RG5617 : 1)) / 100);
}
export const PERCEPCION_RG5617 = 0.30;
/* Percepción que el resumen siguiente va a cobrar en pesos si el saldo en
   moneda extranjera de este resumen se paga con pesos (al oficial). */
export function percepcionEstimada(resumen, datos) {
  /* QA v2 · 3: si el resumen ya trae la percepción cobrada (DB.RG 5617), no se estima otra vez */
  if ((resumen?.cargos || []).some(c => c.tipo === 'percepcion' && c.monto > 0)) return 0;
  let base = 0;
  for (const [m, v] of Object.entries(resumen?.totales || {})) {
    if (m === 'ARS' || v <= 0) continue;
    base += aPesos(v, m, datos) ?? 0;
  }
  return Math.round(base * PERCEPCION_RG5617);
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
  if (esMes(item.hasta) && difMeses(item.hasta, mes) > 0) return false;
  /* facturas bimestrales, trimestrales…: solo los meses que llegan */
  return !(Number.isInteger(item.frecuencia) && item.frecuencia > 1 && difMeses(item.desde, mes) % item.frecuencia !== 0);
}

/* Todo lo del mes. */
export function resumenMes(datos, mes) {
  const d = datos || {};
  const tarjetas = new Map((d.tarjetas || []).map(t => [t.id, t]));
  const ingresos = (d.ingresos || []).filter(i => activoEn(i, mes));
  /* (5) cada gasto fijo es un estimado hasta que se confirma o se carga el monto real */
  const conf = new Set(d.confirmados?.[mes] || []);
  const reales = d.reales?.[mes] || {};
  const gastosTodos = (d.gastos || []).filter(g => activoEn(g, mes)).map(g => {
    const real = Number.isSafeInteger(reales[g.id]) ? reales[g.id] : null;
    return { ...g, estimado: g.monto, monto: real ?? g.monto, real, confirmado: real !== null || conf.has(g.id), diferencia: real !== null ? real - g.monto : 0 };
  });
  const resumenes = (d.resumenes || []).filter(r => r.mes === mes).map(r => {
    const t = totalResumen(r, d);
    /* QA v2 · 2: resumen vencido que no se pagó entero: el mes cuenta solo lo pagado */
    const pagado = pagadoResumen(r, d);
    return { ...r, tarjeta: tarjetas.get(r.tarjetaId)?.nombre || 'Tarjeta', monto: pagado ?? t.ars, total: t.ars, parcial: pagado !== null, porMoneda: t.porMoneda, faltaCambio: t.faltaCambio };
  });
  const conResumen = new Set(resumenes.map(r => r.tarjetaId));
  /* QA v2 · 4: un gasto fijo que se debita de una tarjeta no se resta aparte:
     si la tarjeta tiene resumen ese mes ya está adentro; si no, cuenta una vez como gasto de la tarjeta */
  /* QA v3 · 2: si un resumen trae ese gasto (comercio + monto ±15 % o suscripción), se asume esa tarjeta hasta que la persona diga otra cosa */
  const conTj = gastosTodos.map(g => {
    const tj = tarjetaDeGasto(d, g, mes);
    return tj?.id ? { ...g, tarjetaId: tj.id, inferida: tj.inferida } : tj?.preguntar ? { ...g, dudaTarjeta: tj.preguntar } : g;
  });
  const deTarjeta = g => g.tarjetaId && tarjetas.has(g.tarjetaId);
  const gastos = conTj.filter(g => !deTarjeta(g));
  const gastosTarjeta = conTj.filter(deTarjeta).map(g => ({ ...g, tarjeta: tarjetas.get(g.tarjetaId).nombre, dentro: conResumen.has(g.tarjetaId) }));
  const gastosConTarjeta = gastosTarjeta.filter(g => !g.dentro);
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
    const item = { ...c, moneda, numero: n, original, monto: aPesos(original, moneda, d, { percepcion: c.origen === 'manual' }), nueva: c.origen === 'manual',
      tarjeta: tarjetas.get(c.tarjetaId)?.nombre || 'Sin tarjeta', ultima: n === c.cantidad };
    if (conResumen.has(c.tarjetaId) || (cubiertas.has(c.tarjetaId) && !item.nueva)) dentroDeResumen.push(item);
    else if (item.monto === null) sinCambio.push(item);
    else cuotas.push(item);
  }
  /* percepción estimada: el resumen del mes anterior tenía saldo en otra
     moneda y todavía no se importó el resumen de este mes, que la trae real */
  const percepciones = [];
  for (const r0 of (d.resumenes || []).filter(x => x.mes === sumarMeses(mes, -1))) {
    if (conResumen.has(r0.tarjetaId)) continue;
    const p = percepcionEstimada(r0, d);
    if (p > 0) percepciones.push({ tarjetaId: r0.tarjetaId, tarjeta: tarjetas.get(r0.tarjetaId)?.nombre || 'Tarjeta', monto: p, estimado: true });
  }
  /* resumen que venció sin pagarse entero: el saldo impago pasa al mes siguiente
     con intereses estimados, hasta que se importa el resumen que trae lo real */
  const financiados = [];
  for (const r0 of (d.resumenes || []).filter(x => x.mes === sumarMeses(mes, -1) && x.pago && x.pago.estado !== 'total')) {
    if (conResumen.has(r0.tarjetaId)) continue;
    const f = financiacionEstimada(r0, d);
    if (f.total > 0) financiados.push({ tarjetaId: r0.tarjetaId, tarjeta: tarjetas.get(r0.tarjetaId)?.nombre || 'Tarjeta', monto: f.total, saldo: f.saldo, interes: f.interes, tna: f.tna, tnaDe: f.tnaDe, sinPago: f.sinPago, estimado: true });
  }
  const suma = xs => xs.reduce((s, x) => s + x.monto, 0);
  const totIngresos = suma(ingresos);
  const totGastos = suma(gastos);
  const totCuotas = suma(cuotas) + suma(delBanco) + suma(percepciones) + suma(financiados) + suma(gastosConTarjeta);
  const totResumenes = suma(resumenes);
  const totNuevas = suma(cuotas.filter(c => c.nueva));
  return {
    mes, ingresos, gastos, gastosTarjeta, gastosConTarjeta, cuotas, delBanco, percepciones, financiados, resumenes, dentroDeResumen, sinCambio,
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
  /* percepción que cobra el resumen siguiente por el saldo en otra moneda (estimada) */
  const percepcion = r && difMeses(mesHoy, sumarMeses(r.mes, 1)) >= 0 ? percepcionEstimada(r, datos) : 0;
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
      if (nueva) { const a = aPesos(p, c.moneda || 'ARS', datos, { percepcion: true }); if (a === null) faltaCambio.add(c.moneda); else nuevas += a; }
      else futuras += pesos(p, c.moneda);
    });
  }
  /* QA v2 · 2: lo financiado de un resumen vencido sin pagar entero, hasta que llega el siguiente */
  const financiado = r && pagadoResumen(r, datos) !== null ? financiacionEstimada(r, datos).total : 0;
  return { resumen, futuras, nuevas, percepcion, financiado, total: resumen + futuras + nuevas + percepcion + financiado, faltaCambio: [...faltaCambio], resumenMes: r?.mes || null };
}
export function creditoTotal(datos, hoy) {
  const porTarjeta = (datos?.tarjetas || []).map(t => ({ tarjetaId: t.id, ...creditoTarjeta(datos, t.id, hoy) }));
  const sum = k => porTarjeta.reduce((a, x) => a + x[k], 0);
  return { porTarjeta, resumen: sum('resumen'), futuras: sum('futuras'), nuevas: sum('nuevas'), percepcion: sum('percepcion'), financiado: sum('financiado'), total: sum('total') };
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
  const regla = rubroPorRegla(comercio);
  if (regla) return regla;
  return RUBROS.includes(sugerido) ? sugerido : 'Otros';
}

/* ── lectura de un resumen (lo que devuelve /api/leer-resumen) ── */
const tnaOk = x => (typeof x === 'number' && Number.isFinite(x) && x > 0 && x < 500 ? Math.round(x * 100) / 100 : null);
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
      fecha: fecha(c.fecha), comercio: limpiarComercio(c.comercio).slice(0, 60), monto, moneda: c.moneda,
      rubro: rubroPorRegla(c.comercio) || (RUBROS.includes(c.rubro) ? c.rubro : 'Otros'),
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
    /* QA v2 · 6: TNA de financiación que informa el propio resumen, si viene */
    tnaFinanciacion: tnaOk(json?.tasas?.tnaFinanciacion),
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
export function importarResumen(datos, lectura, { tarjetaId = null, nuevoId = () => Math.random().toString(36).slice(2), hoy = null } = {}) {
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
    cuotasAVencer: (lectura.cuotasAVencer || []).map(c => ({ ...c, mesPago: sumarMeses(c.mes, desfase) })),
    ...(lectura.confianza === 'alta' ? {} : { dudoso: true }),
    ...(lectura.tnaFinanciacion ? { tna: lectura.tnaFinanciacion } : {}),
    ...(hoy && esFecha(lectura.vencimiento) && diasEntre(lectura.vencimiento, aFecha(hoy)) > 0 ? { vencidoAlImportar: true } : {}) });
  /* compras nuevas cargadas a mano que ahora salen en el resumen: se
     concilian solas (mismo monto de cuota, cantidad, moneda y fecha cercana);
     si no es seguro, se pregunta */
  const { conciliadas, dudosas, pares } = conciliarCompras(d, tId, lectura);
  const resumenId = d.resumenes[d.resumenes.length - 1].id;
  /* (2) una sola historia: la compra cargada a mano se convierte en la del
     resumen (mismo id: conserva lo compartido, la bandeja y la ficha) y
     suma la evidencia del resumen */
  const evResumen = (c, i) => ({ tipo: 'resumen', origen: resumenId, fecha: c.fecha || null, mes, n: c.cuota?.n || 1, comercio: c.comercio, monto: c.monto, i });
  const porConsumo = new Map(pares.map(x => [x.i, x.cuotaId]));
  d.cuotas = d.cuotas.flatMap(x => {
    if (!conciliadas.includes(x.id)) return [x];
    const par = pares.find(y => y.cuotaId === x.id);
    const c = lectura.consumos[par.i];
    const ev = [{ tipo: 'compra', origen: 'manual', fecha: x.fecha || null, descripcion: x.descripcion || '', monto: x.total }, ...(x.evidencias || []).filter(e => e.tipo !== 'compra'), evResumen(c, par.i)];
    const de = c.cuota?.de || 1;
    return [{ ...x, total: c.monto * de, moneda: c.moneda, cantidad: de, primerMes: sumarMeses(mes, -((c.cuota?.n || 1) - 1)), origen: 'resumen', comercio: c.comercio, evidencias: ev }];
  });
  let nuevas = 0;
  lectura.consumos.forEach((c, i) => {
    if (porConsumo.has(i) || !c.cuota || c.cuota.de < 2) return;
    const primerMes = sumarMeses(mes, -(c.cuota.n - 1));
    const igual = x => x.tarjetaId === tId && x.cantidad === c.cuota.de && x.primerMes === primerMes &&
      (x.moneda || 'ARS') === c.moneda && normalizarComercio(x.comercio || x.descripcion) === normalizarComercio(c.comercio) &&
      repartirCuotas(x.total, x.cantidad)[1] === c.monto;
    const ya = d.cuotas.find(igual);
    if (ya) {
      if (!(ya.evidencias || []).some(e => e.tipo === 'resumen' && e.mes === mes)) ya.evidencias = [...(ya.evidencias || []), evResumen(c, i)].slice(-80);
      return;
    }
    d.cuotas.push({ id: nuevoId(), descripcion: c.comercio, total: c.monto * c.cuota.de, moneda: c.moneda,
      cantidad: c.cuota.de, tarjetaId: tId, primerMes, origen: 'resumen', evidencias: [evResumen(c, i)] });
    nuevas++;
  });
  /* las dudas de conciliación quedan guardadas hasta que la persona responda */
  d.concilia = [...(d.concilia || []).filter(x => x.tarjetaId !== tId), ...dudosas.map(x => ({ ...x, tarjetaId: tId }))];
  return { datos: d, tarjetaId: tId, mes, cuotasNuevas: nuevas, conciliadas, dudosas };
}

/* Compara las compras nuevas (cargadas a mano, pendientes) de la tarjeta con
   los consumos del resumen. Seguro = misma moneda, misma cantidad de cuotas,
   monto de la cuota igual (±$ 1) y fecha a 10 días o menos (si hay fecha), y
   un único candidato. Parecido (±5 % o sin fecha cercana) = duda. */
export function conciliarCompras(datos, tarjetaId, lectura) {
  const pendientes = (datos.cuotas || []).filter(x => x.tarjetaId === tarjetaId && x.origen === 'manual');
  const conciliadas = [], dudosas = [], pares = [];
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
    if (seguros.length === 1) { conciliadas.push(p.id); usados.add(seguros[0].i); pares.push({ cuotaId: p.id, i: seguros[0].i }); }
    else if (cand.length) {
      const c = lectura.consumos[cand[0].i];
      dudosas.push({ cuotaId: p.id, descripcion: p.descripcion || 'Compra cargada a mano', total: p.total, cantidad: p.cantidad, moneda: p.moneda || 'ARS',
        comercio: c.comercio, monto: c.monto, cuota: c.cuota });
    }
  }
  return { conciliadas, dudosas, pares };
}

/* ── esquema y migración ── */
export const LIMITE_DEFECTO = 30;
export const datosVacios = () => ({ v: ESQUEMA, ingresos: [], gastos: [], cuotas: [], tarjetas: [], resumenes: [], cambio: {}, rubrosComercio: {},
  limiteCuotas: LIMITE_DEFECTO, alertasVistas: [], supuestos: {}, retos: {}, consejosVistos: [], concilia: [], confirmados: {}, reales: {}, preguntasLuego: [], cuentas: [], devolver: [], cambiosTarjeta: [], documentos: [] });

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
      ...(dia(t.diaVence) ? { diaVence: t.diaVence } : {}),
      ...(esFecha(t.baja) ? { baja: t.baja } : {}) });
  }
  const ids = new Set(out.tarjetas.map(t => t.id));
  for (const i of Array.isArray(crudo.ingresos) ? crudo.ingresos : []) {
    if (!i?.id || !entero(i.monto) || !esMes(i.desde)) continue;
    out.ingresos.push({ id: String(i.id), nombre: texto(i.nombre) || 'Ingreso', monto: i.monto,
      repite: !!i.repite, desde: i.desde, ...(i.repite && esMes(i.hasta) ? { hasta: i.hasta } : {}),
      ...(cobroValido(i.cobro) ? { cobro: cobroValido(i.cobro) } : {}) });
  }
  for (const g of Array.isArray(crudo.gastos) ? crudo.gastos : []) {
    if (!g?.id || !entero(g.monto) || !esMes(g.desde)) continue;
    const categoria = CATEGORIAS.includes(g.categoria) ? g.categoria : 'Otros';
    out.gastos.push({ id: String(g.id), nombre: texto(g.nombre) || categoria, categoria, monto: g.monto,
      repite: !!g.repite, desde: g.desde, ...(g.repite && esMes(g.hasta) ? { hasta: g.hasta } : {}),
      ...(dia(g.dia) ? { dia: g.dia } : {}),
      ...(typeof g.tarjetaId === 'string' && out.tarjetas.some(t => t.id === g.tarjetaId) ? { tarjetaId: g.tarjetaId } : {}),
      ...(g.sinTarjeta === true ? { sinTarjeta: true } : {}),
      ...(g.repite && Number.isInteger(g.frecuencia) && g.frecuencia > 1 && g.frecuencia <= 12 ? { frecuencia: g.frecuencia } : {}) });
  }
  for (const c of Array.isArray(crudo.cuotas) ? crudo.cuotas : []) {
    if (!c?.id || !entero(c.total) || !entero(c.cantidad) || c.cantidad > 72 || !esMes(c.primerMes)) continue;
    if (!ids.has(String(c.tarjetaId))) continue;
    out.cuotas.push({ id: String(c.id), descripcion: texto(c.descripcion), total: c.total,
      moneda: esMoneda(c.moneda) ? c.moneda : 'ARS',
      cantidad: c.cantidad, tarjetaId: String(c.tarjetaId), primerMes: c.primerMes,
      ...(c.origen === 'resumen' || c.origen === 'manual' ? { origen: c.origen } : {}), ...(esFecha(c.fecha) ? { fecha: c.fecha } : {}),
      ...(compartidaValida(c.compartida, c.total) ? { compartida: compartidaValida(c.compartida, c.total) } : {}),
      ...(typeof c.comercio === 'string' && c.comercio ? { comercio: texto(c.comercio, 60) } : {}),
      ...(Array.isArray(c.evidencias) && c.evidencias.length ? { evidencias: c.evidencias.map(evidenciaValida).filter(Boolean).slice(-80) } : {}) });
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
      ...(r.dudoso === true ? { dudoso: true } : {}),
      ...(pagoValido(r.pago) ? { pago: pagoValido(r.pago) } : {}),
      ...(r.vencidoAlImportar === true ? { vencidoAlImportar: true } : {}),
      ...(tnaOk(r.tna) ? { tna: tnaOk(r.tna) } : {}),
      periodo: r.periodo && typeof r.periodo === 'object' ? { desde: esFecha(r.periodo.desde) ? r.periodo.desde : null, hasta: esFecha(r.periodo.hasta) ? r.periodo.hasta : null } : { desde: null, hasta: null },
      totales, pagoMinimo: r.pagoMinimo && esMoneda(r.pagoMinimo.moneda) && Number.isSafeInteger(r.pagoMinimo.monto) ? { moneda: r.pagoMinimo.moneda, monto: r.pagoMinimo.monto } : null,
      consumos });
  }
  for (const [m, c] of Object.entries(crudo.cambio && typeof crudo.cambio === 'object' ? crudo.cambio : {})) {
    if (esMoneda(m) && m !== 'ARS' && entero(c?.valor)) {
      out.cambio[m] = { valor: c.valor, fuente: texto(c.fuente, 160) || 'Lo cargaste vos', fecha: esFecha(c.fecha) ? c.fecha : '', ...(/^https:\/\//.test(String(c.url || '')) ? { url: String(c.url).slice(0, 300) } : {}) };
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
  /* v3 → v4: día de cobro, día de vencimiento de gastos, meta, retos y consejos vistos */
  const m = crudo.meta;
  if (m && typeof m === 'object' && entero(m.objetivo) && esMes(m.fecha)) {
    out.meta = { nombre: texto(m.nombre, 40) || 'Mi meta', objetivo: m.objetivo, fecha: m.fecha,
      aportes: (Array.isArray(m.aportes) ? m.aportes : []).filter(a => esFecha(a?.fecha) && Number.isSafeInteger(a?.monto)).slice(-200).map(a => ({ fecha: a.fecha, monto: a.monto })),
      libera: (Array.isArray(m.libera) ? m.libera : []).filter(x => esMes(x?.mes) && Number.isSafeInteger(x?.monto) && x.monto > 0).slice(-24).map(x => ({ mes: x.mes, monto: x.monto })) };
  }
  const retos = crudo.retos && typeof crudo.retos === 'object' ? crudo.retos : {};
  for (const [mesR, r] of Object.entries(retos)) {
    if (esMes(mesR) && RETOS.some(x => x.id === r?.id)) out.retos[mesR] = { id: r.id, estado: ['aceptado', 'hecho', 'esta-vez-no'].includes(r.estado) ? r.estado : 'aceptado' };
  }
  /* v4: dudas de conciliación pendientes, gastos confirmados por mes, preguntas para más tarde */
  out.concilia = (Array.isArray(crudo.concilia) ? crudo.concilia : [])
    .filter(x => out.cuotas.some(c => c.id === x?.cuotaId) && Number.isSafeInteger(x?.monto))
    .map(x => ({ cuotaId: x.cuotaId, tarjetaId: String(x.tarjetaId || ''), descripcion: texto(x.descripcion) || 'Compra cargada a mano', total: x.total, cantidad: x.cantidad,
      moneda: esMoneda(x.moneda) ? x.moneda : 'ARS', comercio: texto(x.comercio), monto: x.monto, ...(x.cuota ? { cuota: { n: x.cuota.n, de: x.cuota.de } } : {}) }));
  out.confirmados = {};
  for (const [m, ids] of Object.entries(crudo.confirmados && typeof crudo.confirmados === 'object' ? crudo.confirmados : {}))
    if (esMes(m) && Array.isArray(ids)) out.confirmados[m] = ids.filter(i => typeof i === 'string').slice(0, 100);
  /* tanda 11: saldos de cuentas (día difícil) */
  out.cuentas = (Array.isArray(crudo.cuentas) ? crudo.cuentas : []).filter(c => c && Number.isSafeInteger(c.saldo) && esFecha(c.fecha)).slice(0, 10)
    .map(c => ({ id: String(c.id || c.nombre), nombre: texto(c.nombre, 40) || 'Cuenta', saldo: c.saldo, fecha: c.fecha }));
  out.reales = {};
  for (const [m, x] of Object.entries(crudo.reales && typeof crudo.reales === 'object' ? crudo.reales : {})) {
    if (!esMes(m) || !x || typeof x !== 'object') continue;
    const ok = Object.entries(x).filter(([id, v]) => out.gastos.some(g => g.id === id) && Number.isSafeInteger(v) && v >= 0);
    if (ok.length) out.reales[m] = Object.fromEntries(ok);
  }
  /* (3) foto de la proyección y cambios desde la última vez */
  /* QA v2 · 10: la foto que viene de una copia se limpia (montos numéricos, textos cortos) */
  if (crudo.fotoBase && typeof crudo.fotoBase === 'object' && esMes(crudo.fotoBase.desde) && crudo.fotoBase.meses && typeof crudo.fotoBase.meses === 'object') {
    const meses = {};
    for (const [m, x] of Object.entries(crudo.fotoBase.meses).slice(0, 6)) {
      if (!esMes(m) || !x || typeof x !== 'object' || !Number.isSafeInteger(x.libres)) continue;
      const items = {};
      for (const [k, it] of Object.entries(x.items || {}).slice(0, 200)) {
        if (typeof k !== 'string' || !it || !Number.isSafeInteger(it.monto)) continue;
        items[k.slice(0, 80)] = { tipo: texto(it.tipo, 20) || 'gasto', nombre: texto(it.nombre, 60), monto: it.monto, ...(Number.isSafeInteger(it.interes) ? { interes: it.interes } : {}),
          ref: it.ref && typeof it.ref === 'object' ? { ...(typeof it.ref.editar === 'string' ? { editar: it.ref.editar.slice(0, 10), id: String(it.ref.id).slice(0, 60) } : {}), ...(typeof it.ref.tarjeta === 'string' ? { tarjeta: it.ref.tarjeta.slice(0, 60) } : {}) } : {} };
      }
      meses[m] = { items, libres: x.libres };
    }
    if (Object.keys(meses).length) out.fotoBase = { desde: crudo.fotoBase.desde, meses };
  }
  out.cambios = (Array.isArray(crudo.cambios) ? crudo.cambios : []).filter(c => typeof c?.motivo === 'string' && typeof c?.fecha === 'string').slice(-20)
    .map(c => ({ motivo: texto(c.motivo, 80), fecha: c.fecha.slice(0, 25) }));
  out.devolver = (Array.isArray(crudo.devolver) ? crudo.devolver : []).map(devolverValido).filter(Boolean).slice(-100);
  out.cambiosTarjeta = (Array.isArray(crudo.cambiosTarjeta) ? crudo.cambiosTarjeta : []).filter(c => c && out.tarjetas.some(t => t.id === c.desde) && esFecha(c.fecha))
    .slice(-10).map(c => ({ id: String(c.id), desde: c.desde, hacia: out.tarjetas.some(t => t.id === c.hacia) ? c.hacia : null, fecha: c.fecha,
      gastos: (Array.isArray(c.gastos) ? c.gastos : []).filter(g => typeof g === 'string'), checklist: (Array.isArray(c.checklist) ? c.checklist : []).filter(x => typeof x === 'string') }));
  /* documentos ya subidos: solo la huella y qué fueron (nunca el archivo ni su contenido) */
  out.documentos = (Array.isArray(crudo.documentos) ? crudo.documentos : []).filter(x => typeof x?.huella === 'string' && /^[0-9a-f]{16,64}$/.test(x.huella))
    .slice(-200).map(x => ({ huella: x.huella, tipo: ['resumen', 'recibo', 'factura', 'captura', 'otro'].includes(x.tipo) ? x.tipo : 'otro', fecha: esFecha(x.fecha) ? x.fecha : null }));
  out.preguntasLuego = (Array.isArray(crudo.preguntasLuego) ? crudo.preguntasLuego : []).filter(x => typeof x === 'string').slice(-100);
  out.consejosVistos = (Array.isArray(crudo.consejosVistos) ? crudo.consejosVistos : []).filter(x => typeof x === 'string').slice(-100);
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
    const c = comprometidoMes(datos, mes);
    /* cruce: tabla del banco contra lo que la app proyecta de las cuotas de antes */
    for (const tId of c.delBanco) {
      const banco = tabla[tId].meses[mes];
      let propio = 0;
      for (const q of datos?.cuotas || []) {
        if (q.tarjetaId !== tId || q.origen === 'manual') continue;
        const n = numeroDeCuota(q, mes);
        if (n) propio += aPesos(repartirCuotas(q.total, q.cantidad)[n - 1], q.moneda || 'ARS', datos) ?? 0;
      }
      if (Math.abs(banco - propio) > Math.max(10_000, Math.round(banco * 0.01))) diferencias.push({ mes, tarjetaId: tId, banco, propio });
    }
    return { mes, ...c, ...limiteDelMes(datos, mes, c.total) };
  });
  /* si el banco dice que quedan cuotas "a partir de" un mes, no estás libre antes */
  let mesLibre = mesLibreDeCuotas(datos, desde);
  for (const tb of Object.values(tabla)) {
    if (tb.desde?.monto > 0 && difMeses(mesLibre, tb.desde.mes) >= 0) mesLibre = sumarMeses(tb.desde.mes, 1);
    for (const [m, v] of Object.entries(tb.meses)) if (v > 0 && difMeses(mesLibre, m) >= 0) mesLibre = sumarMeses(m, 1);
  }
  return { filas, mesLibre, diferencias };
}
/* Lo comprometido en tarjetas en un mes, por tarjeta: UNA sola cuenta para
   el Inicio, la escalera, el tope, "se te liberan" y las alertas. Sale de
   resumenMes: resumen del mes, o tabla del banco + compras nuevas, o la
   proyección de cuotas, más la percepción estimada. */
export function comprometidoMes(datos, mes) {
  const r = resumenMes(datos, mes);
  const porTarjeta = {};
  const sumar = (id, v) => { if (v) porTarjeta[id] = (porTarjeta[id] || 0) + v; };
  for (const x of r.resumenes) sumar(x.tarjetaId, x.monto);
  for (const x of r.delBanco) sumar(x.tarjetaId, x.monto);
  for (const x of r.cuotas) sumar(x.tarjetaId, x.monto);
  for (const x of r.percepciones) sumar(x.tarjetaId, x.monto);
  for (const x of r.financiados) sumar(x.tarjetaId, x.monto);
  for (const x of r.gastosConTarjeta) sumar(x.tarjetaId, x.monto);
  return { porTarjeta, total: r.totTarjetas, delBanco: r.delBanco.map(x => x.tarjetaId), sinCambio: [...new Set(r.sinCambio.map(c => c.moneda))] };
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
  const cuotas = cuotasDelMes ?? resumenMes(datos, mes).totTarjetas;
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
export const PERCEPCION = PERCEPCION_RG5617;
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
        texto: `Si pagás estos US$ en pesos, en el próximo resumen te cobran ~${formatoPesos(ahorro)} de percepción. Si los pagás con dólares propios antes del ${fechaCorta(vencimiento)}, no.` });
    }
  }
  const orden = { fuerte: 0, aviso: 1, info: 2 };
  return out.filter(a => !vistas.has(a.id)).sort((a, b) => orden[a.nivel] - orden[b.nivel] || diasEntre(b.fecha, a.fecha));
}
/* Percepción que te ahorrás si pagás esos US$ con dólares propios: el 30 %
   sobre el oficial (aproximado). */
export function ahorroPagandoEnDolares(usdCentavos, datos) {
  const a = aPesos(usdCentavos, 'USD', datos);
  return a === null ? 0 : Math.round(a * PERCEPCION_RG5617);
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
  financiacion: { valor: 80, fecha: '', fuente: 'Supuesto de Mi Mes, no es un dato: cada banco informa su TNA de financiación en el resumen. Cargá la tuya', url: '' },
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
    const nueva = n ? aPesos(partes[n - 1], moneda, datos, { percepcion: moneda !== 'ARS' }) : 0;
    const lim = limiteDelMes(conCompra, mes);
    return { mes, antes, nueva, despues: nueva === null ? null : antes - nueva, cuota: n || null, supera: lim.supera, limite: lim };
  });
}

/* ── avisos push: lo MÍNIMO que se manda al servidor ──
   Por tarjeta: id, nombre, cierre, vencimiento, si tiene dólares (sí/no) y
   los días cargados a mano (para que el servidor siga el ciclo siguiente).
   Nunca montos, consumos, banco ni números de tarjeta. */
export function datosParaAvisos(datos, hoy, { cobro = false } = {}) {
  /* con el día de cobro encendido: la fecha de vencimiento que cae antes de
     cobrar (solo la fecha, ni montos ni el día de cobro) */
  const antes = cobro ? venceAntesDeCobrar(datos, hoy) : null;
  return (datos?.tarjetas || []).slice(0, 12).map(t => {
    const ac = antes?.items.find(x => x.tipo === 'tarjeta' && x.id === t.id);
    const ciclo = cicloTarjeta(datos, t.id, hoy);
    const r = ciclo?.resumen;
    const dolares = Boolean(r && ((r.totales?.USD || 0) > 0 || (r.consumos || []).some(c => c.moneda === 'USD')));
    return {
      id: String(t.id).slice(0, 60), nombre: aliasTarjeta(t, datos.tarjetas),
      cierre: ciclo?.cierre || null, vencimiento: ciclo?.vencimiento || null, dolares,
      ...(r?.proximoCierre && r?.proximoVencimiento ? { proximoCierre: r.proximoCierre, proximoVencimiento: r.proximoVencimiento } : {}),
      ...(t.diaCierre && t.diaVence ? { diaCierre: t.diaCierre, diaVence: t.diaVence } : {}),
      ...(ac ? { antesCobro: ac.fecha } : {}),
    };
  }).filter(t => t.vencimiento || t.diaCierre);
}
/* Alias sin datos identificables para el servidor: "Tarjeta Visa 1".
   Nunca el banco ni los últimos 4. */
export function aliasTarjeta(t, todas = []) {
  const red = t.red && t.red !== 'Otra' ? t.red : '';
  const mismas = todas.filter(x => (x.red && x.red !== 'Otra' ? x.red : '') === red);
  const n = Math.max(1, mismas.findIndex(x => x.id === t.id) + 1);
  return ['Tarjeta', red, String(n)].filter(Boolean).join(' ');
}
/* Del lado del servidor: deja pasar solo esos campos, aunque manden más. */
export function limpiarTarjetasAvisos(lista) {
  const out = [];
  for (const t of Array.isArray(lista) ? lista.slice(0, 12) : []) {
    const id = typeof t?.id === 'string' ? t.id.slice(0, 60) : '';
    /* defensa: sin números de 4 o más cifras (finales de tarjeta) */
    const nombre = typeof t?.nombre === 'string' ? t.nombre.replace(/\d{4,}/g, '').replace(/[·.\s]+$/, '').replace(/\s+/g, ' ').trim().slice(0, 40) : '';
    if (!id || !nombre) continue;
    const x = { id, nombre, cierre: esFecha(t.cierre) ? t.cierre : null, vencimiento: esFecha(t.vencimiento) ? t.vencimiento : null, dolares: t.dolares === true };
    if (esFecha(t.proximoCierre) && esFecha(t.proximoVencimiento)) { x.proximoCierre = t.proximoCierre; x.proximoVencimiento = t.proximoVencimiento; }
    if (esFecha(t.antesCobro)) x.antesCobro = t.antesCobro;
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
    if (t.antesCobro === vencimiento && d === 5) {
      out.push({ tag: `mm:antescobro:${t.id}:${vencimiento}`, title: `Vence antes de que cobres: ${t.nombre}`,
        body: `Vence el ${fechaCorta(vencimiento)}, antes de tu día de cobro. Abrí Mi Mes para ver cuánto necesitás.` });
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
  /* QA v2 · 5: intereses (bajan a cero pagando el total) separados de impuestos y percepciones (no) */
  const de = tipos => (resumen?.cargos || []).filter(c => tipos.includes(c.tipo)).reduce((a, c) => a + (aPesos(c.monto, c.moneda || 'ARS', datos) ?? 0), 0);
  const intereses = de(['interes']);
  const impuestos = de(['iva', 'sellos', 'percepcion', 'devolucion']);
  const otros = de(['comision', 'otro']);
  return { ars, porMoneda, intereses, impuestos, otros, hay: (resumen?.cargos || []).length > 0 };
}
/* "Este resumen te cobró $ X de intereses (por no pagar el total) y $ Y de impuestos y percepciones." */
export function textoCargos(c, vencido) {
  if (!c?.hay) return '';
  const verbo = vencido ? 'te cobró' : 'te cobra';
  const imp = c.impuestos > 0 ? `${formatoPesos(c.impuestos)} de impuestos y percepciones` : '';
  if (c.intereses > 0) return `Este resumen ${verbo} ${formatoPesos(c.intereses)} de intereses (por no pagar el total)${imp ? ` y ${imp}` : ''}. Pagando el total, los intereses bajan a cero.`;
  if (imp) return `Este resumen ${verbo} ${imp}. No son intereses: se cobran aunque pagues el total.`;
  if (c.ars < 0) return `Entre cargos y devoluciones, este resumen te devolvió ${formatoPesos(-c.ars)}.`;
  return '';
}

/* ── cuándo se te libera plata ──
   SOLO de cuotas que terminan (QA v2 · 1): lo que dejás de pagar desde X+1
   es la suma de las cuotas cuya última cuota cae en X. Nunca sale de un
   resumen entero ni de consumos en un pago. { mes: X+1, libera }. */
export function liberaciones(datos, desde, meses = 18) {
  const porMes = new Map();
  for (const c of datos?.cuotas || []) {
    if (!(c.cantidad >= 2)) continue;
    const fin = ultimoMes(c);
    const mesLibre = sumarMeses(fin, 1);
    if (difMeses(desde, mesLibre) < 0 || difMeses(desde, mesLibre) >= meses) continue;
    const ultima = repartirCuotas(c.total, c.cantidad)[c.cantidad - 1];
    const pesos = aPesos(ultima, c.moneda || 'ARS', datos, { percepcion: c.origen === 'manual' && (c.moneda || 'ARS') !== 'ARS' }) ?? 0;
    porMes.set(mesLibre, (porMes.get(mesLibre) || 0) + pesos);
  }
  return [...porMes].filter(([, v]) => v > 0).sort((x, y) => difMeses(y[0], x[0])).map(([mes, libera]) => ({ mes, libera }));
}
/* La próxima liberación a partir de un mes (incluido el mes siguiente). */
export const proximaLiberacion = (datos, mes, meses = 18) => liberaciones(datos, sumarMeses(mes, 1), meses)[0] || null;

/* ── de dónde sale una lectura ──
   El ejemplo SOLO cuando la app corre como archivo local. Fuera de eso, el
   modo prueba existe solo si el servidor responde modo:"prueba"; sin red o
   con una respuesta rara, falla clara y nada para guardar. */
export const SIN_RED = 'No pudimos leer el resumen: revisá tu conexión y probá de nuevo, o cargalo a mano.';
export function decidirLectura({ local = false, errorRed = false, status = 0, json = null } = {}) {
  if (local) return { usar: 'ejemplo', modo: 'local' };
  if (errorRed || !json || typeof json !== 'object') return { usar: 'falla', mensaje: SIN_RED };
  if (status < 200 || status >= 300 || !json.ok) return { usar: 'falla', mensaje: json.error || SIN_RED };
  return { usar: 'servidor', modo: json.modo === 'prueba' ? 'prueba' : 'real' };
}


/* ═══════════════ Día de cobro ═══════════════
   Días hábiles APROXIMADOS: lunes a viernes, sin feriados (no hay un
   calendario de feriados en la app; la fecha real puede correrse). */
export const COBROS = [
  { tipo: 'del1al5', texto: 'Del 1 al 5' }, { tipo: 'del5al10', texto: 'Del 5 al 10' },
  { tipo: 'ultimoHabil', texto: 'Último día hábil' }, { tipo: 'quintoHabil', texto: 'Quinto día hábil' },
  { tipo: 'dia', texto: 'Otro día' },
];
export function cobroValido(c) {
  if (!c || typeof c !== 'object' || !COBROS.some(x => x.tipo === c.tipo)) return null;
  if (c.tipo === 'dia') return Number.isInteger(c.dia) && c.dia >= 1 && c.dia <= 31 ? { tipo: 'dia', dia: c.dia } : null;
  return { tipo: c.tipo };
}
const esHabil = f => { const d = new Date(aUTC(f)).getUTCDay(); return d !== 0 && d !== 6; };
export function quintoHabil(mes) {
  let n = 0;
  for (let d = 1; d <= diasDelMes(mes); d++) { const f = fechaConDia(mes, d); if (esHabil(f) && ++n === 5) return f; }
  return fechaConDia(mes, diasDelMes(mes));
}
export function ultimoHabil(mes) {
  for (let d = diasDelMes(mes); d >= 1; d--) { const f = fechaConDia(mes, d); if (esHabil(f)) return f; }
  return fechaConDia(mes, diasDelMes(mes));
}
/* Día de cobro de un ingreso en un mes. Para los rangos se toma el último día
   del rango: es lo prudente (la plata está seguro para esa fecha). */
export function fechaDeCobro(ingreso, mes) {
  const c = cobroValido(ingreso?.cobro);
  if (!c) return null;
  if (c.tipo === 'del1al5') return fechaConDia(mes, 5);
  if (c.tipo === 'del5al10') return fechaConDia(mes, 10);
  if (c.tipo === 'ultimoHabil') return ultimoHabil(mes);
  if (c.tipo === 'quintoHabil') return quintoHabil(mes);
  return fechaConDia(mes, c.dia);
}
/* El próximo cobro (hoy incluido) del ingreso principal (el más grande que
   tiene día de cobro y está activo). */
export function proximoCobro(datos, hoy) {
  hoy = aFecha(hoy);
  const mesHoy = hoy.slice(0, 7);
  let mejor = null;
  for (const i of datos?.ingresos || []) {
    if (!cobroValido(i.cobro)) continue;
    for (const m of [mesHoy, sumarMeses(mesHoy, 1)]) {
      if (!activoEn(i, m)) continue;
      const f = fechaDeCobro(i, m);
      if (diasEntre(hoy, f) < 0) continue;
      if (!mejor || i.monto > mejor.ingreso.monto || (i.monto === mejor.ingreso.monto && diasEntre(f, mejor.fecha) > 0)) mejor = { ingreso: i, fecha: f, dias: diasEntre(hoy, f) };
      break;
    }
  }
  return mejor;
}
/* Lo que vence entre hoy y el próximo cobro (sin incluir el día de cobro):
   resúmenes y cuotas de tarjetas (con su vencimiento) y gastos fijos con día. */
export function venceAntesDeCobrar(datos, hoy) {
  hoy = aFecha(hoy);
  const cobro = proximoCobro(datos, hoy);
  if (!cobro) return null;
  const items = [];
  for (const t of datos?.tarjetas || []) {
    const ciclo = cicloTarjeta(datos, t.id, hoy);
    if (!ciclo || diasEntre(hoy, ciclo.vencimiento) < 0 || diasEntre(ciclo.vencimiento, cobro.fecha) <= 0) continue;
    const monto = comprometidoMes(datos, ciclo.vencimiento.slice(0, 7)).porTarjeta[t.id] || 0;
    if (monto > 0) items.push({ tipo: 'tarjeta', id: t.id, nombre: t.nombre, fecha: ciclo.vencimiento, monto });
  }
  for (const m of [hoy.slice(0, 7), cobro.fecha.slice(0, 7)].filter((x, i, a) => a.indexOf(x) === i)) {
    for (const g of datos?.gastos || []) {
      if (!g.dia || tarjetaDeGasto(datos, g, m)?.id || !activoEn(g, m)) continue;
      const f = fechaConDia(m, g.dia);
      if (diasEntre(hoy, f) < 0 || diasEntre(f, cobro.fecha) <= 0) continue;
      items.push({ tipo: 'gasto', id: g.id, nombre: g.nombre, fecha: f, monto: g.monto });
    }
  }
  items.sort((a, b) => diasEntre(b.fecha, a.fecha));
  return { cobro, items, total: items.reduce((a, x) => a + x.monto, 0) };
}
/* Línea de tiempo del mes: cobros, cierres y vencimientos, por fecha. */
export function lineaDelMes(datos, mes) {
  const ev = [];
  for (const i of datos?.ingresos || []) {
    if (!activoEn(i, mes)) continue;
    const f = fechaDeCobro(i, mes);
    if (f) ev.push({ tipo: 'cobro', id: i.id, fecha: f, nombre: i.nombre, monto: i.monto });
  }
  for (const t of datos?.tarjetas || []) {
    /* recorre los ciclos que tocan el mes (el que vence y el que cierra) */
    const vistos = new Set();
    let desde = `${mes}-01`;
    for (let k = 0; k < 3 && desde.startsWith(mes); k++) {
      const c = cicloTarjeta(datos, t.id, desde);
      if (!c?.vencimiento) break;
      const montoV = comprometidoMes(datos, mes).porTarjeta[t.id] || 0;
      if (c.vencimiento.startsWith(mes) && !vistos.has('v' + c.vencimiento) && montoV > 0) {   // QA v2 · 12: sin "−$ 0"
        vistos.add('v' + c.vencimiento);
        ev.push({ tipo: 'vence', id: t.id, fecha: c.vencimiento, nombre: t.nombre, monto: comprometidoMes(datos, mes).porTarjeta[t.id] || 0 });
      }
      if (c.cierre?.startsWith(mes) && !vistos.has('c' + c.cierre)) { vistos.add('c' + c.cierre); ev.push({ tipo: 'cierre', id: t.id, fecha: c.cierre, nombre: t.nombre }); }
      desde = sumarDias(c.vencimiento, 1);
    }
  }
  for (const g of datos?.gastos || []) if (g.dia && !tarjetaDeGasto(datos, g, mes)?.id && activoEn(g, mes)) ev.push({ tipo: 'gasto', id: g.id, fecha: fechaConDia(mes, g.dia), nombre: g.nombre, monto: g.monto });
  return ev.sort((a, b) => diasEntre(b.fecha, a.fecha) || (a.tipo === 'cobro' ? -1 : 1));
}
/* De hoy al próximo cobro (incluido): lo que viene, en orden. */
export function lineaHastaCobrar(datos, hoy) {
  hoy = aFecha(hoy);
  const v = venceAntesDeCobrar(datos, hoy);
  if (!v) return null;
  const meses = [];
  for (let m = hoy.slice(0, 7); difMeses(m, v.cobro.fecha.slice(0, 7)) >= 0; m = sumarMeses(m, 1)) meses.push(m);
  const antes = new Set(v.items.map(x => `${x.tipo === 'tarjeta' ? 'vence' : 'gasto'}:${x.id}:${x.fecha}`));
  const ev = meses.flatMap(m => lineaDelMes(datos, m))
    .filter(e => diasEntre(hoy, e.fecha) >= 0 && diasEntre(e.fecha, v.cobro.fecha) >= 0)
    .filter(e => e.tipo !== 'cobro' || e.fecha === v.cobro.fecha)
    .map(e => ({ ...e, antes: antes.has(`${e.tipo}:${e.id}:${e.fecha}`) }));
  return { ...v, eventos: ev, desde: hoy, hasta: v.cobro.fecha };
}
export const textoCobroEn = d => (d === 0 ? 'Cobrás hoy' : d === 1 ? 'Cobrás mañana' : `Cobrás en ${d} días`);
/* Alertas "vence antes de que cobres", una por tarjeta y ciclo (descartables). */
export function alertasCobro(datos, hoy) {
  const v = venceAntesDeCobrar(datos, hoy);
  if (!v) return [];
  const vistas = new Set(datos?.alertasVistas || []);
  return v.items.filter(x => x.tipo === 'tarjeta').map(x => ({
    id: `antescobro:${x.id}:${x.fecha}`, tipo: 'antesCobro', tarjetaId: x.id, nivel: 'aviso', fecha: x.fecha, dias: diasEntre(aFecha(hoy), x.fecha),
    titulo: `Tu ${x.nombre} vence el ${fechaCorta(x.fecha)} y cobrás el ${fechaCorta(v.cobro.fecha)}: vence antes de que cobres`,
    texto: `Para ese pago necesitás ${formatoPesos(x.monto)} antes de cobrar. ${textoCobroEn(v.cobro.dias)}.`,
  })).filter(a => !vistas.has(a.id));
}

/* ═══════════════ Hacer rendir la plata ═══════════════
   Todo se calcula en el dispositivo. Se informa y se propone; nunca
   "deberías" ni recomendación de productos. */

/* Un mensaje por vez, en orden de prioridad (2.1 del informe). */
export function consejos(datos, hoy) {
  hoy = aFecha(hoy);
  const mes = hoy.slice(0, 7);
  const out = [];
  const vistos = new Set(datos?.consejosVistos || []);
  const ultimo = (datos?.resumenes || []).slice().sort((a, b) => difMeses(a.mes, b.mes)).pop();
  if (ultimo && difMeses(ultimo.mes, mes) <= 1) {
    const c = cargosDelResumen(ultimo, datos);
    if (c.intereses > 0) out.push({ id: `intereses:${ultimo.mes}`, tipo: 'intereses',
      texto: textoCargos(c, esFecha(ultimo.vencimiento) && diasEntre(ultimo.vencimiento, hoy) > 0) });
  }
  const r = resumenMes(datos, mes);
  const lib = proximaLiberacion(datos, mes);
  if (r.libres < 0 && lib) out.push({ id: `negativo:${mes}`, tipo: 'negativo',
    texto: `Este mes faltan ${formatoPesos(-r.libres)}. En ${nombreMes(lib.mes)} se te liberan ${formatoPesos(lib.libera)} de cuotas por mes.` });
  if (lib && r.libres >= 0 && difMeses(mes, lib.mes) <= 3) out.push({ id: `libera:${lib.mes}`, tipo: 'libera',
    texto: `En ${nombreMes(lib.mes)} se te liberan ${formatoPesos(lib.libera)} por mes de cuotas. ¿Los separás?`, libera: lib });
  const anual = (datos?.gastos || []).filter(g => !g.repite && difMeses(mes, g.desde) >= 1 && difMeses(mes, g.desde) <= 6)
    .sort((a, b) => difMeses(b.desde, a.desde))[0];
  if (anual) {
    const meses = difMeses(mes, anual.desde);
    out.push({ id: `anual:${anual.id}`, tipo: 'anual',
      texto: `En ${nombreMes(anual.desde)} viene ${anual.nombre.toLowerCase()} (${formatoPesos(anual.monto)}). Separando ${formatoPesos(Math.ceil(anual.monto / meses / 100) * 100)} por mes desde hoy, llegás.` });
  }
  if (r.libres > 0) {
    const diez = Math.round(r.libres * 0.10 / 100) * 100;
    const cobro = proximoCobro(datos, hoy);
    out.push({ id: `diez:${mes}`, tipo: 'diez',
      texto: `Te quedan libres ${formatoPesos(r.libres)}. Si separás el 10 % (${formatoPesos(diez)}) ${cobro ? `el ${fechaCorta(cobro.fecha)}, cuando cobrás` : 'el día que cobrás'}, en 6 meses tenés ${formatoPesos(diez * 6)} de colchón.` });
  }
  /* QA v2 · 4: sin contar dos veces la misma suscripción (gasto fijo y consumo del resumen) */
  const subs = (datos?.gastos || []).filter(g => g.categoria === 'Suscripciones' && activoEn(g, mes));
  const subsResumen = ultimo && difMeses(ultimo.mes, mes) <= 1
    ? [...new Map((ultimo.consumos || []).filter(c => c.rubro === 'Suscripciones' && !subs.some(g => mismoComercio(c.comercio, g.nombre))).map(c => [normalizarComercio(c.comercio), c])).values()] : [];
  const nSubs = subs.length + subsResumen.length;
  if (nSubs >= 2) {
    const total = subs.reduce((a, g) => a + g.monto, 0) + subsResumen.reduce((a, c) => a + (aPesos(c.monto, c.moneda, datos) ?? 0), 0);
    out.push({ id: `subs:${mes}`, tipo: 'suscripciones', texto: `Tenés ${nSubs} suscripciones por ${formatoPesos(total)} al mes. ¿Las usás todas?` });
  }
  return out.filter(c => !vistos.has(c.id));
}

/* ── metas: una a la vez ── */
export const METAS_SUGERIDAS = ['Colchón', 'Patente y seguro', 'Vacaciones', 'Otra'];
export function estadoMeta(meta, hoy) {
  if (!meta) return null;
  hoy = aFecha(hoy);
  const separado = (meta.aportes || []).reduce((a, x) => a + x.monto, 0);
  const falta = Math.max(0, meta.objetivo - separado);
  const meses = Math.max(1, difMeses(hoy.slice(0, 7), meta.fecha));
  const porMes = Math.ceil(falta / meses / 100) * 100;
  const avance = Math.min(1, separado / meta.objetivo);
  const victoria = avance >= 1 ? 'Llegaste a tu meta.' : avance >= 0.5 ? 'Llegaste a la mitad de tu meta.' : avance >= 0.25 ? 'Ya separaste un cuarto de tu meta.' : '';
  return { separado, falta, meses, porMes, avance, victoria, llegaste: avance >= 1 };
}
/* Meta sugerida con lo que se libera: separar esa cuota durante 6 meses. */
export function metaSugerida(datos, hoy) {
  const mes = aFecha(hoy).slice(0, 7);
  const lib = proximaLiberacion(datos, mes);
  if (lib && difMeses(mes, lib.mes) <= 6) {
    const porMes = Math.round(lib.libera / 100_000) * 100_000 || lib.libera;
    return { nombre: 'Colchón', objetivo: porMes * 6, fecha: sumarMeses(mes, 6), porMes, desde: 'libera', mesLibera: lib.mes };
  }
  const libres = resumenMes(datos, mes).libres;
  if (libres > 0) {
    const porMes = Math.max(100_000, Math.round(libres * 0.10 / 100_000) * 100_000);
    return { nombre: 'Colchón', objetivo: porMes * 6, fecha: sumarMeses(mes, 6), porMes, desde: 'diez' };
  }
  return null;
}
/* Victorias que se ven cuando pasan (una línea, sin confeti). */
export function victorias(datos, hoy) {
  const mes = aFecha(hoy).slice(0, 7);
  const out = [];
  for (const t of datos?.tarjetas || []) {
    const de = (datos?.cuotas || []).filter(c => c.tarjetaId === t.id);
    if (de.length && de.every(c => difMeses(ultimoMes(c), mes) >= 0) && de.some(c => difMeses(ultimoMes(c), mes) <= 1))
      out.push({ id: `sincuotas:${t.id}:${mes}`, texto: `Terminaste las cuotas de tu ${t.nombre}.` });
  }
  const ultimo = (datos?.resumenes || []).slice().sort((a, b) => difMeses(a.mes, b.mes)).pop();
  if (ultimo && difMeses(ultimo.mes, mes) <= 1 && (ultimo.cargos || []).length && cargosDelResumen(ultimo, datos).ars <= 0)
    out.push({ id: `sinintereses:${ultimo.mes}`, texto: '$ 0 de intereses en tu último resumen.' });
  return out;
}

/* ── "Dónde puede rendir tu plata": solo cuentas generales ──
   Interés simple, antes de impuestos: capital × TNA × días ÷ 365. */
export const interesSimple = (capital, tnaPct, dias) => Math.round(capital * (tnaPct / 100) * dias / 365);
export const tnaMensual = tnaPct => Math.round((tnaPct / 12) * 100) / 100;
export const DIAS_DATO_VIEJO = 7;
export const datoViejo = (fecha, hoy, max = DIAS_DATO_VIEJO) => !esFecha(fecha) || diasEntre(fecha, aFecha(hoy)) > max;
/* para la calculadora: rango por categoría, sin cruzar con productos */
export function calculoRendir(capital, opcion, dias) {
  if (!Number.isSafeInteger(capital) || capital <= 0 || !opcion?.tna) return null;
  return { min: interesSimple(capital, opcion.tna.min, dias), max: interesSimple(capital, opcion.tna.max, dias) };
}

/* ── retos de un mes: sin rachas ni culpa ── */
export const RETOS = [
  { id: 'sin-cuotas', titulo: 'Un mes sin cuotas nuevas', texto: 'Este mes no sumás compras en cuotas. Si pasa, no pasa nada.' },
  { id: 'baja-suscripcion', titulo: 'Bajá una suscripción', texto: 'Elegí una que no estés usando y dala de baja.' },
  { id: 'pagar-total', titulo: 'Pagá el total de una tarjeta', texto: 'Pagando el total, ese resumen no te cobra intereses.' },
  { id: 'separar-5', titulo: 'Separá el 5 % el día que cobrás', texto: 'Un poco, apenas cobrás, antes de que se vaya.' },
];
/* El reto del mes (si hay) y una sugerencia si no eligió ninguno. */
export function retoDelMes(datos, mes) {
  const r = datos?.retos?.[mes];
  if (r) return { ...RETOS.find(x => x.id === r.id), estado: r.estado };
  return null;
}

/* ═══════════════ Compra ≠ compromiso ≠ pago ═══════════════
   La ficha de una compra: el total que compraste, sus N obligaciones (una
   por mes) y en qué resumen se paga cada una. El pago del resumen no es
   otro gasto: es cómo se cancelan esas obligaciones. */
export function fichaCompra(datos, cuotaId, hoy) {
  const c = (datos?.cuotas || []).find(x => x.id === cuotaId);
  if (!c) return null;
  hoy = aFecha(hoy || hoyISO());
  const t = (datos.tarjetas || []).find(x => x.id === c.tarjetaId) || null;
  const montos = repartirCuotas(c.total, c.cantidad);
  const moneda = c.moneda || 'ARS';
  const obligaciones = montos.map((monto, i) => {
    const mes = sumarMeses(c.primerMes, i);
    const r = (datos.resumenes || []).find(x => x.tarjetaId === c.tarjetaId && x.mes === mes);
    let vencimiento = r?.vencimiento || null, estado = r ? 'resumen' : 'proyectada';
    if (!vencimiento) {
      const prox = (datos.resumenes || []).find(x => x.tarjetaId === c.tarjetaId && x.proximoVencimiento?.startsWith(mes));
      vencimiento = prox?.proximoVencimiento || (t?.diaVence ? fechaConDia(mes, t.diaVence) : null);
    }
    return { n: i + 1, mes, monto, moneda, pesos: aPesos(monto, moneda, datos), estado, vencimiento,
      pasada: vencimiento ? diasEntre(vencimiento, hoy) > 0 : difMeses(mes, hoy.slice(0, 7)) > 0 };
  });
  return { cuota: c, tarjeta: t, compra: c.total, moneda, cantidad: c.cantidad, obligaciones,
    pagadas: obligaciones.filter(o => o.pasada).length, restan: obligaciones.filter(o => !o.pasada).reduce((a, o) => a + o.monto, 0) };
}


/* ═══════════════ "Preguntame solamente lo que cambia mi mes" ═══════════════
   Lista las dudas y pendientes y las ordena por cuánto pueden mover "te
   quedan libres" de este mes o del que viene. Lo que mueve menos del 1 % de
   los ingresos (o no mueve plata) va a "más tarde". */
export const GASTOS_QUE_VARIAN = ['Servicios', 'Expensas'];
export const DIAS_COPIA_VIEJA = 30;
export const DIAS_CAMBIO_VIEJO = 7;
export const VARIACION_CAMBIO = 0.05;     // supuesto: el dólar se pudo mover un 5 %
export function preguntas(datos, hoy, { ultimaCopia = null, diaDeCobro = true, diaDificil = false, gastoEstimado = false } = {}) {
  hoy = aFecha(hoy);
  const mes = hoy.slice(0, 7), sig = sumarMeses(mes, 1);
  const r = resumenMes(datos, mes), r2 = resumenMes(datos, sig);
  const out = [];
  const umbral = Math.round(Math.max(r.totIngresos, r2.totIngresos) * 0.01);
  /* 1. tarjeta que ya cerró y no tiene el resumen importado */
  for (const t of datos?.tarjetas || []) {
    const c = cicloTarjeta(datos, t.id, hoy);
    if (!c?.cierre || diasEntre(c.cierre, hoy) < 0 || c.origen === 'resumen') continue;
    if ((datos.resumenes || []).some(x => x.tarjetaId === t.id && x.mes === c.mes)) continue;
    const previos = (datos.resumenes || []).filter(x => x.tarjetaId === t.id).sort((a, b) => difMeses(a.mes, b.mes));
    const ultimo = previos.length ? totalResumen(previos[previos.length - 1], datos).ars : 0;
    const estimado = comprometidoMes(datos, c.mes).porTarjeta[t.id] || 0;
    out.push({ id: `resumen:${t.id}:${c.mes}`, tipo: 'resumen', tarjetaId: t.id, impacto: Math.max(ultimo, estimado),
      titulo: `Para estimar cuánto te queda, falta tu resumen de ${t.nombre}.`,
      porque: `Cerró el ${fechaCorta(c.cierre)}. ${ultimo ? `El último fue de ${formatoPesos(ultimo)}` : `Hoy estimamos ${formatoPesos(estimado)}`}: hasta que lo subas, ese número es una estimación.`,
      accion: 'Subir resumen' });
  }
  /* 1b. resumen que ya venció y no sabemos si se pagó (el último de cada tarjeta) */
  for (const t of datos?.tarjetas || []) {
    const x = (datos.resumenes || []).filter(y => y.tarjetaId === t.id).sort((a, b) => difMeses(a.mes, b.mes)).pop();
    if (!x || x.pago || !x.vencidoAlImportar || difMeses(x.mes, mes) > 1) continue;
    const f = x.vencimiento;
    out.push({ id: `pagado:${x.id}`, tipo: 'pagado', resumenId: x.id, tarjetaId: t.id, impacto: totalResumen(x, datos).ars,
      titulo: `Tu resumen de ${t.nombre} venció el ${Number(f.slice(8))}/${Number(f.slice(5, 7))}. ¿Ya lo pagaste?`,
      porque: 'Si quedó saldo sin pagar, pasa al mes que viene con intereses: lo sumamos estimado.', accion: PAGOS_VENCIDO.total });
  }
  /* 2. dudas de la lectura que quedaron guardadas */
  for (const x of datos?.resumenes || []) {
    if (!x.dudoso || difMeses(x.mes, mes) > 1 || difMeses(sig, x.mes) > 0) continue;
    const t = (datos.tarjetas || []).find(y => y.id === x.tarjetaId);
    out.push({ id: `lectura:${x.id}`, tipo: 'lectura', tarjetaId: x.tarjetaId, resumenId: x.id, impacto: totalResumen(x, datos).ars,
      titulo: `Revisá el resumen de ${t?.nombre || 'tu tarjeta'}: parte se leyó con dudas.`,
      porque: `Es el total de ${nombreMes(x.mes)}. Si coincide con tu PDF, confirmalo.`, accion: 'Está bien' });
  }
  /* 3. compra nueva con conciliación dudosa */
  for (const x of datos?.concilia || []) {
    const c = (datos.cuotas || []).find(y => y.id === x.cuotaId);
    if (!c) continue;
    const cuota = repartirCuotas(c.total, c.cantidad)[0];
    out.push({ id: `concilia:${x.cuotaId}`, tipo: 'concilia', cuotaId: x.cuotaId, impacto: aPesos(cuota, c.moneda || 'ARS', datos) ?? 0,
      titulo: `¿${x.comercio} es tu compra ${x.descripcion}?`,
      porque: 'Si es la misma, la contamos una sola vez.', accion: 'Sí, es la misma' });
  }
  /* 4. gastos que varían, sin confirmar este mes */
  const conf = new Set(datos?.confirmados?.[mes] || []);
  const pendientesEst = gastoEstimado ? r.gastos.filter(g => !g.confirmado && !(g.dia && Number(hoy.slice(8)) < g.dia)) : [];
  if (pendientesEst.length >= 3) {
    /* QA v2 · 7: no más de una pregunta por todos los gastos fijos del mes */
    out.push({ id: `estimados:${mes}`, tipo: 'estimados', gastoIds: pendientesEst.map(g => g.id), impacto: pendientesEst.reduce((a, g) => a + g.monto, 0),
      titulo: `¿Siguen igual tus ${pendientesEst.length} gastos fijos este mes?`, porque: 'Hasta que los confirmes, los reservamos con el estimado. Si alguno cambió, lo corregís en Lo cargado.', accion: 'Sí, todos' });
  }
  for (const g of r.gastos) {
    if (gastoEstimado && pendientesEst.length >= 3) continue;
    if (gastoEstimado) {
      /* (5) todo gasto fijo del mes es estimado hasta que aparece; se pregunta cuando ya debería haber aparecido */
      if (g.confirmado || (g.dia && Number(hoy.slice(8)) < g.dia)) continue;
      out.push({ id: `estimado:${g.id}:${mes}`, tipo: 'estimado', gastoId: g.id, impacto: g.monto,
        titulo: `¿Ya apareció ${g.nombre}? Estimamos ${formatoPesos(g.monto)}.`, porque: 'Hasta que lo confirmes, lo reservamos con el estimado: no cuenta como plata disponible.', accion: `Sí, ${formatoPesos(g.monto)}` });
      continue;
    }
    if (!g.repite || !GASTOS_QUE_VARIAN.includes(g.categoria) || conf.has(g.id)) continue;
    out.push({ id: `gasto:${g.id}:${mes}`, tipo: 'gasto', gastoId: g.id, impacto: g.monto,
      titulo: `¿${g.nombre} sigue en ${formatoPesos(g.monto)} este mes?`, porque: 'Suele cambiar de un mes a otro.', accion: `Sigue en ${formatoPesos(g.monto)}` });
  }
  /* 4b. QA v3 · 2: el gasto que vimos en un resumen ya se cuenta adentro de la tarjeta; se pide confirmación */
  for (const g of r.gastosTarjeta || []) {
    if (!g.inferida) continue;
    out.push({ id: `gastotj:${g.id}`, tipo: 'gastoTarjeta', gastoId: g.id, tarjetaId: g.tarjetaId, impacto: g.monto,
      titulo: `${g.nombre} lo vimos en tu ${g.tarjeta}: lo contamos ahí. ¿Está bien?`, porque: 'Así no se resta dos veces. Si se paga aparte (débito o efectivo), decinos y lo contamos como gasto fijo.', accion: 'Sí, está bien' });
  }
  /* 4c. QA final · 8: mismo comercio, monto distinto: preguntar */
  for (const g of r.gastos) {
    if (!g.dudaTarjeta) continue;
    const t = (datos.tarjetas || []).find(y => y.id === g.dudaTarjeta.tarjetaId);
    if (!t) continue;
    out.push({ id: `gastotj:${g.id}`, tipo: 'gastoTarjeta', gastoId: g.id, tarjetaId: t.id, impacto: g.monto,
      titulo: `¿${g.nombre} se paga con tu ${t.nombre}?`, porque: `En el resumen aparece un consumo parecido${g.dudaTarjeta.monto ? ` por ${formatoPesos(g.dudaTarjeta.monto)}` : ''}, y vos cargaste ${formatoPesos(g.monto)}. Si es el mismo, lo contamos una vez adentro de la tarjeta.`, accion: `Sí, con ${t.nombre}` });
  }
  /* 5. ingreso principal sin día de cobro */
  if (diaDeCobro) {
    const principal = (datos?.ingresos || []).filter(i => i.repite && activoEn(i, mes)).sort((a, b) => b.monto - a.monto)[0];
    if (principal && !cobroValido(principal.cobro)) {
      /* impacto: lo que vence en tarjetas este mes (si vence antes de cobrar, hace falta tenerlo antes) */
      const enTarjetas = (datos.tarjetas || []).reduce((a, t) => {
        const prev = (datos.resumenes || []).filter(x => x.tarjetaId === t.id).sort((x, y) => difMeses(x.mes, y.mes)).pop();
        return a + Math.max(comprometidoMes(datos, mes).porTarjeta[t.id] || 0, prev ? totalResumen(prev, datos).ars : 0);
      }, 0);
      out.push({ id: `cobro:${principal.id}`, tipo: 'cobro', ingresoId: principal.id, impacto: Math.min(principal.monto, enTarjetas),
        titulo: '¿Qué día cobrás?', porque: 'Con ese dato vemos qué vence antes de que cobres.', accion: 'Elegir el día' });
    }
  }
  /* 6. tipo de cambio viejo, si hay dólares */
  const usd = ((rr) => rr.cuotas.filter(c => c.moneda === 'USD').reduce((a, c) => a + (c.monto || 0), 0)
    + rr.resumenes.reduce((a, x) => a + ((x.porMoneda?.USD || 0) > 0 ? aPesos(x.porMoneda.USD, 'USD', datos) || 0 : 0), 0));
  const exp = usd(r) + usd(r2);
  const cam = cambioDe(datos, 'USD');
  if (exp > 0 && cam && datoViejo(cam.fecha, hoy, DIAS_CAMBIO_VIEJO)) {
    out.push({ id: `cambio:${cam.fecha || 'sin'}`, tipo: 'cambio', impacto: Math.round(exp * VARIACION_CAMBIO),
      titulo: `El dólar que usamos es del ${fechaCorta(cam.fecha) || 'sin fecha'}.`, porque: `Tenés ${formatoPesos(exp)} en dólares entre este mes y el que viene: un 5 % de diferencia mueve ${formatoPesos(Math.round(exp * VARIACION_CAMBIO))}.`, accion: 'Actualizar' });
  }
  /* 8. día difícil: saldo de hoy (opcional) y el día en que falta plata */
  if (diaDificil) {
    const cuentas = datos?.cuentas || [];
    const antes = venceAntesDeCobrar(datos, hoy);
    const pagos = antes ? antes.total : r.totTarjetas;
    if (!cuentas.length) {
      out.push({ id: `saldo:${mes}`, tipo: 'saldo', impacto: pagos,
        titulo: '¿Cuánto tenés hoy en tu cuenta?', porque: 'Es opcional. Con ese dato vemos si algún día del mes te falta plata para los pagos, aunque el mes cierre bien.', accion: 'Cargar saldo' });
    } else {
      const pr = proyeccionSaldo(datos, hoy);
      if (pr?.falta) out.push({ id: `dificil:${pr.minimo.fecha}`, tipo: 'dificil', impacto: pr.falta + pagos, urgente: true,
        titulo: pr.mensaje, porque: pr.supuestos.join(' '), accion: 'Ver día por día' });
      const vieja = cuentas.find(c => diasEntre(c.fecha, hoy) > DIAS_DATO_VIEJO);
      if (vieja) out.push({ id: `saldo:${vieja.fecha}`, tipo: 'saldo', impacto: Math.min(pagos, Math.abs(vieja.saldo) + pagos),
        titulo: `¿Tu saldo sigue en ${formatoPesos(cuentas.reduce((a, c) => a + c.saldo, 0))}?`, porque: `Lo cargaste el ${fechaCorta(vieja.fecha)}.`, accion: 'Actualizar saldo' });
    }
  }
  /* 7. copia vieja (no mueve plata: va al final) */
  const hayDatos = (datos?.ingresos || []).length + (datos?.cuotas || []).length + (datos?.resumenes || []).length > 0;
  if (hayDatos && (!esFecha(ultimaCopia) || diasEntre(ultimaCopia, hoy) > DIAS_COPIA_VIEJA)) {
    out.push({ id: `copia:${mes}`, tipo: 'copia', impacto: 0,
      titulo: esFecha(ultimaCopia) ? `Tu última copia es del ${fechaCorta(ultimaCopia)}.` : 'Todavía no guardaste una copia.',
      porque: 'Tus datos viven solo en este dispositivo. Si se borra el navegador, la copia los recupera.', accion: 'Guardar copia' });
  }
  const luego = new Set(datos?.preguntasLuego || []);
  out.sort((a, b) => b.impacto - a.impacto);
  const ahora = out.filter(x => !luego.has(x.id) && x.impacto >= Math.max(1, umbral));
  const resto = out.filter(x => !ahora.includes(x));
  /* la copia sube si no hay nada urgente */
  if (!ahora.length) { const c = resto.findIndex(x => x.tipo === 'copia' && !luego.has(x.id)); if (c >= 0) ahora.push(...resto.splice(c, 1)); }
  return { ahora, masTarde: resto, umbral, alDia: !ahora.length && !resto.length };
}

/* Qué tenés que pagar: los próximos vencimientos con fecha (tarjetas y gastos con día), desde hoy. */
export function proximosPagos(datos, hoy, n = 3) {
  hoy = aFecha(hoy);
  const m = hoy.slice(0, 7);
  return [m, sumarMeses(m, 1)].flatMap(x => lineaDelMes(datos, x))
    .filter(e => (e.tipo === 'vence' || e.tipo === 'gasto') && diasEntre(hoy, e.fecha) >= 0 && e.monto > 0)
    .sort((a, b) => diasEntre(b.fecha, a.fecha))
    .slice(0, n)
    .map(e => ({ ...e, dias: diasEntre(hoy, e.fecha) }));
}


/* ═══════════════ El fin de una cuota como decisión útil ═══════════════
   Lo que se libera va a un destino: con meta, "sumalo a tu meta"; sin meta,
   armar una con un toque. Una vez asignado, se recuerda y se propone separar
   ese monto desde el mes en que se libera. */
export function destinoLiberacion(datos, hoy) {
  const mes = aFecha(hoy).slice(0, 7);
  const lib = proximaLiberacion(datos, mes);
  if (!lib || difMeses(mes, lib.mes) > 3) return null;
  const meta = datos?.meta && !estadoMeta(datos.meta, hoy).llegaste ? datos.meta : null;
  const asignado = !!meta?.libera?.some(x => x.mes === lib.mes);
  const cuando = nombreMes(lib.mes).split(' ')[0];
  return {
    lib, meta: meta?.nombre || null, accion: meta ? 'sumar' : 'crear', asignado,
    texto: asignado ? `Desde ${cuando}, los ${formatoPesos(lib.libera)} que se liberan van a tu meta ${meta.nombre}.`
      : meta ? `En ${cuando} se te liberan ${formatoPesos(lib.libera)} por mes. ¿Los sumás a tu meta ${meta.nombre}?`
      : `En ${cuando} se te liberan ${formatoPesos(lib.libera)} por mes. Si los separás 6 meses, juntás ${formatoPesos(lib.libera * 6)}.`,
  };
}
/* Asigna lo que se libera a la meta (o arma una con eso). Devuelve datos nuevos. */
export function asignarLiberacion(datos, hoy) {
  const d = destinoLiberacion(datos, hoy);
  if (!d || d.asignado) return datos;
  const out = structuredClone(datos);
  if (d.accion === 'crear') out.meta = { nombre: 'Colchón', objetivo: Math.round(d.lib.libera * 6 / 100_000) * 100_000 || d.lib.libera * 6, fecha: sumarMeses(d.lib.mes, 5), aportes: [], libera: [] };
  out.meta.libera = [...(out.meta.libera || []), { mes: d.lib.mes, monto: d.lib.libera }];
  return out;
}
/* Cuánto proponer en "Separé $ X": lo que se liberó para la meta (desde ese mes) o el ritmo de la meta. */
export function aporteSugerido(meta, hoy) {
  const e = estadoMeta(meta, hoy);
  if (!e || e.llegaste) return null;
  const mes = aFecha(hoy).slice(0, 7);
  const lib = (meta.libera || []).filter(x => difMeses(x.mes, mes) >= 0).reduce((a, x) => a + x.monto, 0);
  return lib ? { monto: Math.min(lib, e.falta), deLibera: true } : { monto: Math.min(e.porMes, e.falta), deLibera: false };
}


/* ═══════════════ (4) El día difícil ═══════════════
   Con lo que tenés hoy en tus cuentas, proyecta el saldo día por día:
   + cobros, − vencimientos de tarjetas (lo comprometido de ese mes) y
   − gastos fijos con día. Supuestos a la vista: lo que ya venció se
   considera pagado y los gastos sin día no se ubican en el calendario. */
export const CUENTAS_COMUNES = ['Cuenta sueldo', 'Caja de ahorro', 'Billetera', 'Efectivo'];
const redondeoMil = c => Math.round(c / 100_000) * 100_000;
export function proyeccionSaldo(datos, hoy) {
  hoy = aFecha(hoy);
  const cuentas = datos?.cuentas || [];
  if (!cuentas.length) return null;
  const mes = hoy.slice(0, 7);
  const cobro = proximoCobro(datos, hoy);
  const finMes = fechaConDia(mes, 31);
  const hasta = cobro && diasEntre(finMes, cobro.fecha) > 0 ? cobro.fecha : finMes;
  const meses = [];
  for (let m = mes; difMeses(m, hasta.slice(0, 7)) >= 0; m = sumarMeses(m, 1)) meses.push(m);
  const eventos = meses.flatMap(m => lineaDelMes(datos, m))
    .filter(e => e.tipo !== 'cierre' && diasEntre(hoy, e.fecha) >= 0 && diasEntre(e.fecha, hasta) >= 0 && e.monto > 0);
  const inicial = cuentas.reduce((a, c) => a + c.saldo, 0);
  const dias = [];
  let saldo = inicial, minimo = { fecha: hoy, saldo: inicial };
  for (let f = hoy; diasEntre(f, hasta) >= 0; f = sumarDias(f, 1)) {
    const del = eventos.filter(e => e.fecha === f).sort((a, b) => (a.tipo === 'cobro' ? -1 : 1) - (b.tipo === 'cobro' ? -1 : 1));
    for (const e of del) saldo += e.tipo === 'cobro' ? e.monto : -e.monto;
    dias.push({ fecha: f, saldo, eventos: del });
    if (saldo < minimo.saldo) minimo = { fecha: f, saldo };
  }
  const finDeMes = dias.filter(d => d.fecha.startsWith(mes)).pop()?.saldo ?? saldo;
  const sinDia = (datos.gastos || []).filter(g => !g.dia && activoEn(g, mes)).reduce((a, g) => a + g.monto, 0);
  const viejas = cuentas.filter(c => diasEntre(c.fecha, hoy) > 3);
  const supuestos = [
    `Partimos de ${formatoPesos(inicial)} en ${cuentas.length === 1 ? cuentas[0].nombre.toLowerCase() : `${cuentas.length} cuentas`}${viejas.length ? ` (cargado el ${fechaCorta(viejas[0].fecha)})` : ''}.`,
    'Lo que ya venció lo tomamos como pagado.',
    'Las tarjetas se pagan completas el día que vencen.',
    ...(sinDia ? [`Los gastos fijos sin día (${formatoPesos(sinDia)}) no están en el calendario: cargales el día para sumarlos.`] : []),
  ];
  const falta = minimo.saldo < 0 ? redondeoMil(-minimo.saldo) || -minimo.saldo : 0;
  let mensaje;
  const dia = f => `${Number(f.slice(8))}${f.slice(0, 7) === mes ? '' : ` de ${NOMBRES[Number(f.slice(5, 7)) - 1].toLowerCase()}`}`;
  const cobroTxt = cobro && diasEntre(minimo.fecha, cobro.fecha) > 0 ? `; cobrás el ${dia(cobro.fecha)}` : '';
  if (!falta) mensaje = `Con lo que tenés, llegás a ${cobro ? `tu cobro del ${dia(cobro.fecha)}` : 'fin de mes'} sin quedar en rojo.`;
  else if (finDeMes >= 0) mensaje = `El mes termina positivo, pero el ${dia(minimo.fecha)} faltarán unos ${formatoPesos(falta)}${cobroTxt}.`;
  else mensaje = `El ${dia(minimo.fecha)} faltarán unos ${formatoPesos(falta)}${cobroTxt}.`;
  return { inicial, dias, minimo, falta, finDeMes, hasta, cobro, mensaje, supuestos, eventos };
}


/* ═══════════════ (5) El gasto que todavía no apareció ═══════════════ */
/* Confirmar con el monto real (o igual al estimado) y explicar la diferencia. */
export function confirmarGasto(datos, gastoId, mes, real = null) {
  const g = (datos.gastos || []).find(x => x.id === gastoId);
  if (!g) return { datos, texto: '' };
  const d = structuredClone(datos);
  d.confirmados = { ...(d.confirmados || {}), [mes]: [...new Set([...(d.confirmados?.[mes] || []), gastoId])] };
  d.reales = { ...(d.reales || {}) };
  if (real === null || real === g.monto) {
    if (d.reales[mes]) { delete d.reales[mes][gastoId]; if (!Object.keys(d.reales[mes]).length) delete d.reales[mes]; }
    return { datos: d, texto: `${g.nombre}: igual al estimado (${formatoPesos(g.monto)}).` };
  }
  d.reales[mes] = { ...(d.reales[mes] || {}), [gastoId]: real };
  const dif = real - g.monto;
  return { datos: d, diferencia: dif,
    texto: dif > 0 ? `${g.nombre} vino ${formatoPesos(dif)} más que el estimado: te quedan libres ${formatoPesos(dif)} menos.`
      : `${g.nombre} vino ${formatoPesos(-dif)} menos que el estimado: te quedan libres ${formatoPesos(-dif)} más.` };
}
/* "Lo di de baja": deja de contar desde este mes (o desde el que viene, si este ya se pagó). */
export function confirmarTodos(datos, mes, ids = null) {
  const r = resumenMes(datos, mes);
  const lista = ids || r.gastos.filter(g => !g.confirmado).map(g => g.id);
  return { ...datos, confirmados: { ...(datos.confirmados || {}), [mes]: [...new Set([...(datos.confirmados?.[mes] || []), ...lista])] } };
}
export function darDeBajaGasto(datos, gastoId, mes, { cobradoEsteMes = true } = {}) {
  const d = structuredClone(datos);
  const g = d.gastos.find(x => x.id === gastoId);
  if (!g) return { datos, texto: '' };
  /* QA v2 · 7: por defecto se toma como ya cobrado este mes (la plata ya salió): deja de contar desde el que viene */
  const pagadoEsteMes = cobradoEsteMes || (d.confirmados?.[mes] || []).includes(gastoId);
  const hasta = pagadoEsteMes ? mes : sumarMeses(mes, -1);
  if (difMeses(g.desde, hasta) < 0) d.gastos = d.gastos.filter(x => x.id !== gastoId);
  else { g.repite = true; g.hasta = hasta; }
  const desde = sumarMeses(hasta, 1);
  return { datos: d, texto: `${g.nombre} deja de contar desde ${nombreMes(desde)}: te quedan libres ${formatoPesos(g.monto)} más por mes.` };
}


/* ═══════════════ (3) Qué cambió en tu mes desde la última vez ═══════════════
   Una foto de la proyección por mes: cada línea con su origen. El diff se
   calcula siempre contra el estado actual, así que si una importación se
   corrige o se borra, el resultado se recalcula solo. */
export function fotoProyeccion(datos, desde, meses = 3) {
  const out = { desde, meses: {} };
  for (let k = 0; k < meses; k++) {
    const m = sumarMeses(desde, k);
    const r = resumenMes(datos, m);
    const it = {};
    const poner = (key, tipo, nombre, monto, ref, extra = {}) => { if (monto) it[key] = { tipo, nombre, monto, ref, ...extra }; };
    for (const i of r.ingresos) poner(`ingreso:${i.id}`, 'ingreso', i.nombre, i.monto, { editar: 'ingreso', id: i.id });
    for (const g of r.gastosConTarjeta) poner(`gasto:${g.id}`, 'gasto', g.nombre, g.monto, { editar: 'gasto', id: g.id });
    for (const g of r.gastos) poner(`gasto:${g.id}`, g.real !== null && g.real !== undefined ? 'gastoReal' : 'gasto', g.nombre, g.monto, { editar: 'gasto', id: g.id });
    for (const x of r.resumenes) poner(`resumen:${x.id}`, 'resumen', x.tarjeta, x.monto, { tarjeta: x.tarjetaId });
    for (const x of r.delBanco) poner(`banco:${x.tarjetaId}`, 'banco', x.tarjeta, x.monto, { tarjeta: x.tarjetaId });
    for (const x of r.percepciones) poner(`percep:${x.tarjetaId}`, 'percepcion', x.tarjeta, x.monto, { tarjeta: x.tarjetaId });
    /* QA v3 · 1: el saldo financiado de un resumen pagado en parte también es un compromiso del mes */
    for (const x of r.financiados || []) poner(`financiado:${x.tarjetaId}`, 'financiado', x.tarjeta, x.monto, { tarjeta: x.tarjetaId }, { interes: x.interes });
    for (const c of r.cuotas) poner(`cuota:${c.id}`, c.nueva ? 'compraNueva' : 'cuota', c.descripcion || 'Compra en cuotas', c.monto, { editar: 'cuota', id: c.id });
    out.meses[m] = { items: it, libres: r.libres };
  }
  return out;
}
const DE = {
  ingreso: (n, nuevo) => nuevo ? `de un ingreso nuevo (${n})` : `de ${n}`,
  gasto: (n, nuevo) => nuevo ? `de un gasto fijo nuevo (${n})` : `de ${n}`,
  gastoReal: n => `de ${n} (monto real)`,
  resumen: (n, nuevo) => nuevo ? `del resumen de ${n}` : `del resumen de ${n}`,
  banco: n => `de la tabla de cuotas de ${n}`,
  percepcion: n => `de la percepción estimada de ${n}`,
  financiado: (n, nuevo, l) => `por el saldo que quedó sin pagar de ${n}${l?.interes ? ` (incluye ${formatoPesos(l.interes)} de intereses estimados)` : ''}`,
  cuota: (n, nuevo) => nuevo ? `de una cuota nueva (${n})` : `de la cuota de ${n}`,
  compraNueva: (n, nuevo) => nuevo ? `de una compra nueva (${n})` : `de la compra ${n}`,
};
export function cambiosDesde(foto, datos, { minimo = 100_000 } = {}) {
  if (!foto?.meses) return [];
  const ahora = fotoProyeccion(datos, foto.desde, Object.keys(foto.meses).length);
  const out = [];
  for (const [m, a] of Object.entries(foto.meses)) {
    const b = ahora.meses[m];
    if (!b) continue;
    const keys = new Set([...Object.keys(a.items), ...Object.keys(b.items)]);
    const lineas = [];
    for (const k of keys) {
      const x = a.items[k], y = b.items[k];
      const dif = (y?.monto || 0) - (x?.monto || 0);
      if (!dif) continue;
      const base = y || x;
      const nuevo = !x, quitado = !y;
      lineas.push({ key: k, tipo: base.tipo, nombre: base.nombre, ref: base.ref, antes: x?.monto || 0, ahora: y?.monto || 0, dif, nuevo, quitado,
        ...(y?.interes && nuevo ? { interes: y.interes } : {}),
        ingreso: base.tipo === 'ingreso' });
    }
    if (!lineas.length) continue;
    lineas.sort((p, q) => Math.abs(q.dif) - Math.abs(p.dif));
    const comp = lineas.filter(l => !l.ingreso).reduce((s2, l) => s2 + l.dif, 0);
    const ing = lineas.filter(l => l.ingreso).reduce((s2, l) => s2 + l.dif, 0);
    const deltaLibres = b.libres - a.libres;
    if (Math.abs(comp) < minimo && Math.abs(ing) < minimo) continue;
    const partes = lineas.filter(l => !l.ingreso).map(l => {
      const txt = (DE[l.tipo] || DE.gasto)(l.nombre, l.nuevo, l);
      return l.quitado ? `${formatoPesos(-l.dif)} menos ${txt.replace(/^de una? [^(]*\((.*)\)$/, 'de $1')}` + (l.tipo === 'cuota' || l.tipo === 'compraNueva' ? ' (ahora está en el resumen o terminó)' : '')
        : `${formatoPesos(Math.abs(l.dif))}${l.dif < 0 ? ' menos' : ''} ${txt}`;
    });
    const unir = xs => xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}`;
    const cab = capitalizar(nombreMes(m).split(' ')[0]);
    let texto2 = comp ? `${cab} tiene ${formatoPesos(Math.abs(comp))} ${comp > 0 ? 'más' : 'menos'} comprometidos: ${unir(partes)}.` : `${cab}:`;
    if (ing) texto2 += ` ${comp ? 'Y' : ''} ${formatoPesos(Math.abs(ing))} ${ing > 0 ? 'más' : 'menos'} de ingresos.`.replace(/\s+/g, ' ');
    out.push({ mes: m, comprometido: comp, ingresos: ing, deltaLibres, lineas, texto: texto2.trim() });
  }
  return out;
}
const capitalizar = t => t.charAt(0).toUpperCase() + t.slice(1);

/* ═══════════════ (9) ¿Cómo me conviene pagar esta compra? ═══════════════
   Para UNA compra que la persona ya decidió evaluar: efectivo (con descuento
   opcional) y cada tarjeta propia en N cuotas. Costo total en plata de hoy,
   meses afectados, efecto en "te quedan libres", tope (crédito disponible) y
   efecto en el día difícil. No ordena por "oportunidad" ni sugiere comprar. */
export function comoPagar(datos, { precio, descuentoEfectivo = 0, cuotas = 1, inflacion, rendimiento }, hoy) {
  hoy = aFecha(hoy);
  if (!Number.isSafeInteger(precio) || precio <= 0) return null;
  const mes = hoy.slice(0, 7);
  const contado = Math.round(precio * (1 - descuentoEfectivo / 100));
  const base = proyeccionSaldo(datos, hoy);
  const libresSin = m => resumenMes(datos, m).libres;
  const out = [];
  /* efectivo o débito: sale hoy */
  {
    const conGasto = { ...datos, gastos: [...(datos.gastos || []), { id: '__pago', nombre: 'Esta compra', categoria: 'Otros', monto: contado, repite: false, desde: mes, dia: Number(hoy.slice(8)) }] };
    const pr = base ? proyeccionSaldo(conGasto, hoy) : null;
    out.push({ id: 'efectivo', nombre: 'Efectivo o débito', cuotas: 1, total: contado, costoHoy: contado, meses: [{ mes, monto: contado, libres: libresSin(mes) - contado }],
      estimado: false, alcanza: base ? base.inicial >= contado : null, faltaDificil: pr ? pr.falta : null });
  }
  /* cada tarjeta propia en N cuotas */
  for (const t of datos.tarjetas || []) {
    const ciclo = cicloTarjeta(datos, t.id, hoy);
    const primerMes = primerMesDeCompra(datos, t.id, hoy);
    const c = cuotasOContado({ precioCuotas: precio, cuotas, inflacion, rendimiento, precioContado: contado });
    const partes = repartirCuotas(precio, cuotas);
    const disp = disponibleTarjeta(datos, t.id, hoy);
    const conCuota = { ...datos, cuotas: [...(datos.cuotas || []), { id: '__pago', descripcion: 'Esta compra', total: precio, moneda: 'ARS', cantidad: cuotas, tarjetaId: t.id, primerMes, origen: 'manual' }] };
    const pr = base ? proyeccionSaldo(conCuota, hoy) : null;
    out.push({ id: t.id, nombre: t.nombre, cuotas, total: precio, costoHoy: c.vp, cuota: partes[0],
      meses: partes.map((p, i) => { const m = sumarMeses(primerMes, i); return { mes: m, monto: p, libres: libresSin(m) - p }; }),
      estimado: !ciclo || ciclo.origen === 'manual', alcanza: disp ? disp.disponible >= precio : null, disponible: disp?.disponible ?? null,
      faltaDificil: pr ? pr.falta : null });
  }
  return { contado, precio, sinComprar: { libres: libresSin(mes), faltaDificil: base ? base.falta : null }, opciones: out };
}


/* ═══════════════ (8) Cuotas compartidas ═══════════════
   La tarjeta no cambia: al emisor le debés la cuota entera. Aparte se lleva
   tu parte, lo que te deben y lo que ya te devolvieron (también adelantos de
   varias cuotas). Lo que te deben NO es ingreso hasta que te lo devuelven, y
   aun así no suma a "te quedan libres": es plata que vuelve, no un ingreso. */
export function compartidaValida(x, total) {
  if (!x || typeof x !== 'object') return null;
  const con = texto(x.con, 40);
  const tipo = x.tipo === '$' ? '$' : '%';
  const valor = Number(x.valor);
  if (!con || !Number.isFinite(valor) || valor <= 0) return null;
  if (tipo === '%' && valor >= 100) return null;
  if (tipo === '$' && (!Number.isSafeInteger(valor) || (Number.isSafeInteger(total) && valor >= total))) return null;
  const devoluciones = (Array.isArray(x.devoluciones) ? x.devoluciones : []).filter(d => esFecha(d?.fecha) && Number.isSafeInteger(d?.monto) && d.monto > 0)
    .slice(-60).map(d => ({ fecha: d.fecha, monto: d.monto }));
  return { con, tipo, valor, devoluciones };
}
export function compartidaDe(datos, cuotaId, hoy) {
  const c = (datos?.cuotas || []).find(x => x.id === cuotaId);
  const x = compartidaValida(c?.compartida, c?.total);
  if (!x) return null;
  const f = fichaCompra(datos, cuotaId, hoy);
  const suParte = x.tipo === '%' ? Math.round(c.total * x.valor / 100) : x.valor;
  const porCuota = repartirCuotas(suParte, c.cantidad);
  const devuelto = x.devoluciones.reduce((a, d) => a + d.monto, 0);
  let acumulado = 0;
  const cuotas = f.obligaciones.map((o, i) => {
    acumulado += porCuota[i];
    return { n: o.n, mes: o.mes, alEmisor: o.monto, tuParte: o.monto - porCuota[i], suParte: porCuota[i], cubierta: devuelto >= acumulado, pasada: o.pasada };
  });
  const vencidoSinDevolver = cuotas.filter(q => q.pasada && !q.cubierta).reduce((a, q) => a + q.suParte, 0);
  return { con: x.con, alEmisor: c.total, tuParte: c.total - suParte, teDeben: suParte, teDevolvieron: devuelto, falta: Math.max(0, suParte - devuelto),
    aFavor: Math.max(0, devuelto - suParte), cuotasCubiertas: cuotas.filter(q => q.cubierta).length, vencidoSinDevolver, cuotas };
}


/* ═══════════════ (6) Plata que te tienen que devolver ═══════════════
   Reintegros de promos, devoluciones, gastos laborales y lo que te deben de
   compras compartidas. Nada suma a lo disponible hasta que se acredita, y
   tampoco cuenta como ingreso: es plata que vuelve. La app no envía reclamos:
   deja el mensaje armado para copiar. */
export const TIPOS_DEVOLVER = { reintegro: 'Reintegro de promo', devolucion: 'Devolución de compra', laboral: 'Gasto laboral', prestamo: 'Le presté a alguien' };
export function devolverValido(x) {
  if (!x || typeof x !== 'object' || !TIPOS_DEVOLVER[x.tipo] || !Number.isSafeInteger(x.monto) || x.monto <= 0) return null;
  return { id: String(x.id || ''), tipo: x.tipo, motivo: texto(x.motivo, 80) || TIPOS_DEVOLVER[x.tipo], monto: x.monto, moneda: esMoneda(x.moneda) ? x.moneda : 'ARS',
    fecha: esFecha(x.fecha) ? x.fecha : null, esperada: esFecha(x.esperada) ? x.esperada : null, quien: texto(x.quien, 40),
    ...(typeof x.cuotaId === 'string' ? { cuotaId: x.cuotaId } : {}),
    ...(esFecha(x.acreditado) ? { acreditado: x.acreditado } : {}),
    ...(x.credito && typeof x.credito === 'object' ? { credito: { resumenId: String(x.credito.resumenId), i: Number(x.credito.i) } } : {}) };
}
const RE_REINTEGRO = /reintegro|bonif|devol|promo|cashback|ajuste a favor|contracargo/i;
export function bandejaDevolver(datos, hoy) {
  hoy = aFecha(hoy);
  const propios = (datos?.devolver || []).map(x => ({ ...x, moneda: x.moneda || 'ARS', origen: 'cargado', vencido: !x.acreditado && x.esperada ? diasEntre(x.esperada, hoy) > 0 : false }));
  const compartidas = (datos?.cuotas || []).filter(c => c.compartida).map(c => {
    const x = compartidaDe(datos, c.id, hoy);
    return x && x.falta > 0 ? { id: `comp:${c.id}`, tipo: 'prestamo', origen: 'compartida', motivo: `Su parte de ${c.descripcion || 'una compra'}`, quien: x.con,
      monto: x.falta, moneda: c.moneda || 'ARS', cuotaId: c.id, fecha: c.fecha || null, esperada: null, vencido: x.vencidoSinDevolver > 0, vencidoMonto: x.vencidoSinDevolver } : null;
  }).filter(Boolean);
  const usados = new Set((datos?.devolver || []).filter(x => x.credito).map(x => `${x.credito.resumenId}:${x.credito.i}`));
  /* créditos del resumen que parecen un reintegro o una devolución: candidatos, nunca automáticos */
  const candidatos = [];
  for (const r of datos?.resumenes || []) (r.pagosYCreditos || []).forEach((p, i) => {
    if (usados.has(`${r.id}:${i}`) || p.tipo === 'pago' || p.monto >= 0) return;
    if (p.tipo !== 'credito' && !RE_REINTEGRO.test(p.concepto || '')) return;
    const monto = aPesos(-p.monto, p.moneda || 'ARS', datos) ?? 0;
    const parecido = propios.filter(x => !x.acreditado && Math.abs(x.monto - monto) <= Math.max(100, Math.round(x.monto * 0.05)));
    candidatos.push({ resumenId: r.id, i, concepto: p.concepto, fecha: p.fecha, monto, tarjetaId: r.tarjetaId, parecido: parecido.map(x => x.id) });
  });
  const pendientes = [...propios.filter(x => !x.acreditado), ...compartidas];
  /* QA v2 · 7: totales por moneda, nunca US$ sumados como pesos */
  const totales = {};
  for (const x of pendientes) totales[x.moneda] = (totales[x.moneda] || 0) + x.monto;
  return { pendientes, acreditados: propios.filter(x => x.acreditado), candidatos,
    totales, total: totales.ARS || 0, vencidos: pendientes.filter(x => x.vencido) };
}
export function mensajeReclamo(item, { tarjeta = '' } = {}) {
  const f = d => (d ? `${Number(d.slice(8))}/${Number(d.slice(5, 7))}/${d.slice(0, 4)}` : '');
  const plata = formatoMoneda(item.monto, item.moneda || 'ARS');
  if (item.tipo === 'prestamo') return `¡Hola${item.quien ? `, ${item.quien}` : ''}! Te escribo por ${item.motivo.charAt(0).toLowerCase() + item.motivo.slice(1)}: quedan ${plata} pendientes. ¿Cuándo te queda cómodo? ¡Gracias!`;
  return `Hola. Les escribo por ${TIPOS_DEVOLVER[item.tipo].toLowerCase()}: ${item.motivo}${item.fecha ? `, del ${f(item.fecha)}` : ''}${tarjeta ? `, pagado con ${tarjeta}` : ''}, por ${plata}. Tendría que haberse acreditado${item.esperada ? ` el ${f(item.esperada)}` : ''} y todavía no lo veo. ¿Me confirman cuándo se acredita? Gracias.`;
}


/* ═══════════════ Resumen ya vencido al importarlo ═══════════════
   "Este resumen venció el 9/10. ¿Ya lo pagaste?" Si no se pagó entero, el
   saldo impago pasa al mes siguiente como deuda con intereses estimados
   (TNA de financiación: supuesto editable, + 21 % de IVA sobre el interés). */
export const PAGOS_VENCIDO = { total: 'Sí, el total', minimo: 'Pagué el mínimo', otro: 'Pagué otro monto', no: 'Todavía no' };
export function pagoValido(p) {
  if (!p || typeof p !== 'object' || !PAGOS_VENCIDO[p.estado]) return null;
  if (p.estado === 'otro') return Number.isSafeInteger(p.monto) && p.monto >= 0 ? { estado: 'otro', monto: p.monto } : null;
  return { estado: p.estado };
}
export const resumenVencido = (r, hoy) => esFecha(r?.vencimiento) && diasEntre(r.vencimiento, aFecha(hoy)) > 0;
/* Lo pagado de un resumen vencido (null si no se contestó o se pagó el total). */
export function pagadoResumen(r, datos) {
  const p = pagoValido(r?.pago);
  if (!p || p.estado === 'total') return null;
  const total = totalResumen(r, datos).ars;
  const minimo = r.pagoMinimo ? aPesos(r.pagoMinimo.monto, r.pagoMinimo.moneda || 'ARS', datos) ?? 0 : 0;
  return Math.min(total, p.estado === 'minimo' ? minimo : p.estado === 'otro' ? p.monto : 0);
}
export function financiacionEstimada(r, datos) {
  const total = totalResumen(r, datos).ars;
  const pagado = pagadoResumen(r, datos);
  if (pagado === null) return { saldo: 0, interes: 0, total: 0 };
  const saldo = Math.max(0, total - pagado);
  /* TNA: la del propio resumen; si no viene, la que cargó la persona; si no, el supuesto (rotulado) */
  const tnaDe = tnaOk(r.tna) ? 'resumen' : datos?.supuestos?.financiacion ? 'tuya' : 'supuesto';
  const tna = tnaOk(r.tna) ?? supuesto(datos, 'financiacion').valor;
  const interes = Math.round(saldo * tna / 100 / 12 * 1.21);
  return { saldo, interes, total: saldo + interes, tna, tnaDe, sinPago: pagado === 0 };
}
export function registrarPagoResumen(datos, resumenId, pago) {
  const p = pagoValido(pago);
  if (!p) return datos;
  return { ...datos, resumenes: (datos.resumenes || []).map(r => (r.id === resumenId ? { ...r, pago: p } : r)) };
}


/* ═══════════════ (2) Una sola historia por gasto ═══════════════
   La ficha junta las evidencias de una misma compra: la compra cargada, el
   consumo en cada resumen, devoluciones o créditos vinculados y reintegros de
   la bandeja. Mail y ticket todavía no son fuentes, pero el modelo ya los
   acepta. La vinculación nunca es solo por monto: comercio + fecha + monto
   (+ cuotas); si hay duda, se propone y decide la persona. */
export const TIPOS_EVIDENCIA = { compra: 'La cargaste', resumen: 'En el resumen', credito: 'Crédito o devolución', reintegro: 'Reintegro', mail: 'Mail', ticket: 'Ticket' };
export function evidenciaValida(e) {
  if (!e || typeof e !== 'object' || !TIPOS_EVIDENCIA[e.tipo]) return null;
  const out = { tipo: e.tipo, origen: texto(String(e.origen ?? ''), 60), fecha: esFecha(e.fecha) ? e.fecha : null };
  if (Number.isSafeInteger(e.monto)) out.monto = e.monto;
  if (esMes(e.mes)) out.mes = e.mes;
  if (Number.isInteger(e.n)) out.n = e.n;
  if (Number.isInteger(e.i)) out.i = e.i;
  if (typeof e.comercio === 'string') out.comercio = texto(e.comercio, 60);
  if (typeof e.descripcion === 'string') out.descripcion = texto(e.descripcion, 60);
  if (typeof e.concepto === 'string') out.concepto = texto(e.concepto, 60);
  return out;
}
/* Palabras genéricas que no alcanzan para decir que es el mismo comercio (QA final · 8). */
const GENERICAS = new Set(['SEGURO', 'SEGUROS', 'SERVICIO', 'SERVICIOS', 'CUOTA', 'CUOTAS', 'PAGO', 'PAGOS', 'DEBITO', 'DEB', 'AUT', 'AUTOMATICO', 'COMPRA', 'COM', 'WWW',
  'SRL', 'ARGENTINA', 'ARG', 'ONLINE', 'MENSUAL', 'PLAN', 'FACTURA', 'SUSCRIPCION', 'ABONO', 'CARGO', 'BANCO', 'TARJETA', 'MERPAGO', 'MERCADOPAGO', 'DLO', 'PAYU']);
const palabras = s => normalizarComercio(s).split(' ').filter(w => w.length >= 3 && !GENERICAS.has(w));
const mismoComercio = (a, b) => { const x = palabras(a), y = new Set(palabras(b)); return x.length > 0 && x.some(w => y.has(w)); };
export function historiaCompra(datos, cuotaId) {
  const c = (datos?.cuotas || []).find(x => x.id === cuotaId);
  if (!c) return null;
  const ev = [...(c.evidencias || [])];
  if (!ev.length) ev.push(c.origen === 'manual' ? { tipo: 'compra', origen: 'manual', fecha: c.fecha || null, descripcion: c.descripcion, monto: c.total } : { tipo: 'resumen', origen: '', fecha: c.fecha || null });
  for (const x of datos.devolver || []) if (x.cuotaId === cuotaId) ev.push({ tipo: 'reintegro', origen: x.id, fecha: x.acreditado || x.esperada || x.fecha, monto: x.monto, descripcion: x.motivo });
  for (const d of c.compartida?.devoluciones || []) ev.push({ tipo: 'credito', origen: 'compartida', fecha: d.fecha, monto: d.monto, descripcion: `Te devolvió ${c.compartida.con}` });
  /* propuestas: créditos del resumen de la misma tarjeta, mismo comercio, después de la compra y de un monto posible */
  const vinculados = new Set(ev.filter(e => e.tipo === 'credito' && e.origen && e.origen !== 'compartida').map(e => `${e.origen}:${e.i}`));
  const usadosOtras = new Set((datos.cuotas || []).filter(x => x.id !== cuotaId).flatMap(x => (x.evidencias || []).filter(e => e.tipo === 'credito').map(e => `${e.origen}:${e.i}`)));
  const nombre = c.comercio || c.descripcion || '';
  const cuotaMonto = repartirCuotas(c.total, c.cantidad)[0];
  const propuestas = [];
  for (const r of datos.resumenes || []) {
    if (r.tarjetaId !== c.tarjetaId) continue;
    (r.pagosYCreditos || []).forEach((p, i) => {
      const k = `${r.id}:${i}`;
      if (p.tipo !== 'credito' || p.monto >= 0 || vinculados.has(k) || usadosOtras.has(k)) return;
      if (!mismoComercio(p.concepto, nombre)) return;                 // nunca solo por monto
      const m = -p.monto;
      if (m > c.total + 100) return;
      if (esFecha(c.fecha) && esFecha(p.fecha) && diasEntre(c.fecha, p.fecha) < 0) return;
      propuestas.push({ resumenId: r.id, i, concepto: p.concepto, fecha: p.fecha, monto: m, seguro: Math.abs(m - c.total) <= 100 || Math.abs(m - cuotaMonto) <= 100 });
    });
  }
  ev.sort((a, b) => (a.fecha && b.fecha ? diasEntre(b.fecha, a.fecha) : 0));
  return { cuota: c, evidencias: ev, propuestas };
}
export function vincularCredito(datos, cuotaId, resumenId, i) {
  const r = (datos.resumenes || []).find(x => x.id === resumenId);
  const p = r?.pagosYCreditos?.[i];
  if (!p) return datos;
  return { ...datos, cuotas: datos.cuotas.map(c => (c.id === cuotaId ? { ...c, evidencias: [...(c.evidencias || []), { tipo: 'credito', origen: resumenId, i, fecha: p.fecha || null, monto: -p.monto, concepto: p.concepto }] } : c)) };
}


/* ═══════════════ (7) Cambiar o dejar una tarjeta ═══════════════
   Lista lo que cuelga de la tarjeta (gastos fijos que se debitan ahí, cuotas
   que faltan, devoluciones esperadas) y una checklist. Cuando llega el
   resumen de la nueva, verifica qué ya se cobró ahí y qué sigue pendiente.
   El historial de la tarjeta vieja se conserva. */
export const CHECKLIST_CAMBIO = [
  { id: 'debitos', texto: 'Pasá cada débito automático a la tarjeta nueva (en la web o app de cada servicio).' },
  { id: 'cuotas', texto: 'Antes de pedir la baja, fijate que no queden cuotas: siguen saliendo en la tarjeta vieja hasta terminar.' },
  { id: 'devoluciones', texto: 'Si esperás una devolución en la vieja, no la des de baja hasta que se acredite.' },
  { id: 'baja', texto: 'Pedí la baja por escrito y guardá el número de gestión.' },
  { id: 'ultimo', texto: 'Revisá el último resumen de la vieja: tiene que venir en cero.' },
];
export function asistenteCambio(datos, desdeId, hoy) {
  hoy = aFecha(hoy);
  const t = (datos.tarjetas || []).find(x => x.id === desdeId);
  if (!t) return null;
  const mes = hoy.slice(0, 7);
  const gastos = (datos.gastos || []).filter(g => g.tarjetaId === desdeId && activoEn(g, mes));
  const cuotas = (datos.cuotas || []).filter(c => c.tarjetaId === desdeId).map(c => ({ c, f: fichaCompra(datos, c.id, hoy) }))
    .filter(x => x.f.restan > 0).map(x => ({ id: x.c.id, nombre: x.c.descripcion || 'Compra en cuotas', moneda: x.f.moneda, restan: x.f.restan, cuotas: x.f.obligaciones.filter(o => !o.pasada).length,
      ultimoMes: x.f.obligaciones[x.f.obligaciones.length - 1].mes }));
  const delaTarjeta = new Set((datos.cuotas || []).filter(c => c.tarjetaId === desdeId).map(c => c.id));
  const devoluciones = bandejaDevolver(datos, hoy).pendientes.filter(x => x.cuotaId && delaTarjeta.has(x.cuotaId));
  const ultimaCuota = cuotas.map(c => c.ultimoMes).sort((a, b) => difMeses(b, a))[0] || null;
  return { tarjeta: t, gastos, cuotas, devoluciones, ultimaCuota, totalCuotas: cuotas.reduce((a, c) => a + (aPesos(c.restan, c.moneda, datos) ?? 0), 0), checklist: CHECKLIST_CAMBIO };
}
/* Mueve los gastos elegidos a la tarjeta nueva y deja registrado el cambio. */
export function aplicarCambio(datos, { desde, hacia = null, gastos = [], fecha }) {
  const d = structuredClone(datos);
  d.cambiosTarjeta = [...(d.cambiosTarjeta || []), { id: `cambio-${desde}-${fecha}`, desde, hacia, fecha, gastos: [...gastos], checklist: [] }].slice(-10);
  if (hacia) d.gastos = d.gastos.map(g => (gastos.includes(g.id) ? { ...g, tarjetaId: hacia } : g));
  if (!hacia) d.tarjetas = d.tarjetas.map(t => (t.id === desde ? { ...t, baja: fecha } : t));
  return d;
}
/* Verificación con los resúmenes posteriores al cambio. */
export function verificarCambio(datos, cambio) {
  const resDe = id => (datos.resumenes || []).filter(r => r.tarjetaId === id && esFecha(r.cierre || r.vencimiento) && diasEntre(cambio.fecha, r.cierre || r.vencimiento) >= 0);
  const nuevos = cambio.hacia ? resDe(cambio.hacia) : [];
  const viejos = resDe(cambio.desde);
  const aparece = (rs, g) => rs.some(r => (r.consumos || []).some(c => mismoComercio(c.comercio, g.nombre)));
  const items = cambio.gastos.map(id => (datos.gastos || []).find(g => g.id === id)).filter(Boolean).map(g => ({
    gastoId: g.id, nombre: g.nombre,
    estado: aparece(nuevos, g) ? 'nueva' : aparece(viejos, g) ? 'vieja' : 'pendiente',
  }));
  const partes = items.map(i => i.estado === 'nueva' ? `${i.nombre} ya se cobró en la nueva` : i.estado === 'vieja' ? `${i.nombre} se sigue cobrando en la vieja` : `${i.nombre} sigue pendiente`);
  const unir = xs => xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join('; ')}; ${xs[xs.length - 1]}`;
  const texto2 = !nuevos.length && cambio.hacia ? 'Cuando subas el primer resumen de la tarjeta nueva, verificamos qué ya se cobró ahí.'
    : partes.length ? `${unir(partes).charAt(0).toUpperCase()}${unir(partes).slice(1)}.` : '';
  return { items, texto: texto2, listo: items.length > 0 && items.every(i => i.estado === 'nueva'), hayResumenNuevo: nuevos.length > 0 };
}

/* Rótulo de la TNA que se usó (QA v2 · 6). */
export const textoTNA = f => `TNA ${String(f.tna).replace('.', ',')} % ${f.tnaDe === 'resumen' ? 'del resumen' : f.tnaDe === 'tuya' ? '(la que cargaste)' : '(supuesto: cada banco informa la suya en el resumen)'}`;


/* QA v3 · 2: ¿de qué tarjeta se debita este gasto fijo? La marcada; si no hay
   marca ni "se paga aparte", la del resumen que lo trae (comercio y, además,
   monto ±15 % o categoría Suscripciones). */
export function tarjetaDeGasto(datos, g, mes) {
  if (g.tarjetaId && (datos?.tarjetas || []).some(t => t.id === g.tarjetaId)) return { id: g.tarjetaId, inferida: false };
  if (g.sinTarjeta) return null;
  for (const r of (datos?.resumenes || []).filter(x => difMeses(x.mes, mes) <= 6 && difMeses(mes, x.mes) <= 1).sort((a, b) => difMeses(a.mes, b.mes))) {
    if (!(datos.tarjetas || []).some(t => t.id === r.tarjetaId)) continue;
    const c = (r.consumos || []).find(x => mismoComercio(x.comercio, g.nombre));
    if (!c) continue;
    if (g.categoria === 'Suscripciones') return { id: r.tarjetaId, inferida: true };
    const m = aPesos(c.monto, c.moneda || 'ARS', datos);
    if (m !== null && Math.abs(m - g.monto) <= g.monto * 0.15) return { id: r.tarjetaId, inferida: true };
    /* QA final · 8: el nombre coincide pero el monto no: no se asume ni se ignora, se pregunta */
    return { id: null, preguntar: { tarjetaId: r.tarjetaId, monto: m } };
  }
  return null;
}
