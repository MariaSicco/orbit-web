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

export const ESQUEMA = 2;

export const CATEGORIAS = [
  'Alquiler', 'Expensas', 'Servicios', 'Suscripciones', 'Seguros',
  'Transporte', 'Educación', 'Salud', 'Otros',
];
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
  const cuotas = [];
  const dentroDeResumen = [];
  const sinCambio = [];
  for (const c of d.cuotas || []) {
    const n = numeroDeCuota(c, mes);
    if (!n) continue;
    const moneda = c.moneda || 'ARS';
    const original = repartirCuotas(c.total, c.cantidad)[n - 1];
    const item = { ...c, moneda, numero: n, original, monto: aPesos(original, moneda, d),
      tarjeta: tarjetas.get(c.tarjetaId)?.nombre || 'Sin tarjeta', ultima: n === c.cantidad };
    if (conResumen.has(c.tarjetaId)) dentroDeResumen.push(item);
    else if (item.monto === null) sinCambio.push(item);
    else cuotas.push(item);
  }
  const suma = xs => xs.reduce((s, x) => s + x.monto, 0);
  const totIngresos = suma(ingresos);
  const totGastos = suma(gastos);
  const totCuotas = suma(cuotas);
  const totResumenes = suma(resumenes);
  return {
    mes, ingresos, gastos, cuotas, resumenes, dentroDeResumen, sinCambio,
    totIngresos, totGastos, totCuotas, totResumenes,
    totTarjetas: totCuotas + totResumenes,
    libres: totIngresos - totGastos - totCuotas - totResumenes,
    vacio: !ingresos.length && !gastos.length && !cuotas.length && !resumenes.length && !dentroDeResumen.length && !sinCambio.length,
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

/* Límite de compra: lo que queda disponible, aproximado.
   Usado = cuotas que faltan pagar (desde este mes) + consumos en un pago de
   resúmenes que todavía no vencieron. Todo pasado a pesos. */
export function disponibleTarjeta(datos, tarjetaId, mesHoy) {
  const t = (datos?.tarjetas || []).find(x => x.id === tarjetaId);
  if (!t || !Number.isSafeInteger(t.limite) || t.limite <= 0) return null;
  let usado = 0;
  const faltaCambio = new Set();
  for (const c of (datos.cuotas || []).filter(x => x.tarjetaId === tarjetaId)) {
    const partes = repartirCuotas(c.total, c.cantidad);
    partes.forEach((p, i) => {
      if (difMeses(mesHoy, sumarMeses(c.primerMes, i)) < 0) return;
      const ars = aPesos(p, c.moneda || 'ARS', datos);
      if (ars === null) faltaCambio.add(c.moneda); else usado += ars;
    });
  }
  for (const r of (datos.resumenes || []).filter(x => x.tarjetaId === tarjetaId && difMeses(mesHoy, x.mes) >= 0)) {
    for (const c of r.consumos || []) {
      if (c.cuota && c.cuota.de > 1) continue;            // ya contadas como cuotas
      const ars = aPesos(c.monto, c.moneda, datos);
      if (ars === null) faltaCambio.add(c.moneda); else usado += ars;
    }
  }
  return { limite: t.limite, usado, disponible: t.limite - usado, faltaCambio: [...faltaCambio] };
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

/* Valida y pasa a centavos. Nunca completa montos que no vinieron:
   un consumo sin monto válido se descarta y se avisa. */
export function validarLectura(json) {
  const errores = [];
  const avisos = Array.isArray(json?.avisos) ? json.avisos.map(String).slice(0, 10) : [];
  if (!json || typeof json !== 'object') return { ok: false, errores: ['La respuesta no tiene el formato esperado.'] };
  const vencimiento = esFecha(json.vencimiento) ? json.vencimiento : null;
  if (!vencimiento) errores.push('No encontramos la fecha de vencimiento.');
  const totales = {};
  for (const t of Array.isArray(json.totales) ? json.totales : []) {
    const c = aCentavos(t?.monto);
    if (esMoneda(t?.moneda) && c !== null) totales[t.moneda] = c;
  }
  if (!Object.keys(totales).length) errores.push('No encontramos el total a pagar.');
  const consumos = [];
  let descartados = 0;
  for (const c of Array.isArray(json.consumos) ? json.consumos : []) {
    const monto = aCentavos(c?.monto);
    if (monto === null || !esMoneda(c?.moneda) || !String(c?.comercio || '').trim()) { descartados++; continue; }
    const n = Number(c?.cuota?.n), de = Number(c?.cuota?.de);
    consumos.push({
      fecha: esFecha(c.fecha) ? c.fecha : null,
      comercio: String(c.comercio).trim().slice(0, 60),
      monto, moneda: c.moneda,
      rubro: RUBROS.includes(c.rubro) ? c.rubro : 'Otros',
      cuota: Number.isInteger(n) && Number.isInteger(de) && n >= 1 && de >= n && de <= 72 ? { n, de } : null,
    });
  }
  if (descartados) avisos.push(`Dejamos afuera ${descartados} línea${descartados === 1 ? '' : 's'} que no pudimos leer bien.`);
  const tj = json.tarjeta || {};
  const pm = json.pagoMinimo && esMoneda(json.pagoMinimo.moneda) ? { moneda: json.pagoMinimo.moneda, monto: aCentavos(json.pagoMinimo.monto) } : null;
  const lectura = {
    tarjeta: {
      banco: String(tj.banco || '').trim().slice(0, 40),
      red: REDES.includes(tj.red) ? tj.red : 'Otra',
      ultimos4: /^\d{4}$/.test(String(tj.ultimos4 || '')) ? String(tj.ultimos4) : '',
    },
    periodo: { desde: esFecha(json.periodo?.desde) ? json.periodo.desde : null, hasta: esFecha(json.periodo?.hasta) ? json.periodo.hasta : null },
    cierre: esFecha(json.cierre) ? json.cierre : null,
    vencimiento, totales, consumos,
    pagoMinimo: pm && pm.monto !== null ? pm : null,
    confianza: json.confianza === 'alta' ? 'alta' : 'baja',
    avisos,
  };
  return { ok: errores.length === 0, errores, lectura };
}

/* Guarda una lectura revisada: crea o usa la tarjeta, reemplaza el resumen de
   ese mes y suma las cuotas detectadas sin duplicarlas si se importa el
   resumen siguiente. Devuelve datos nuevos (no toca los de entrada). */
export function importarResumen(datos, lectura, { tarjetaId = null, nuevoId = () => Math.random().toString(36).slice(2) } = {}) {
  const d = structuredClone(datos);
  const mes = mesDeFecha(lectura.vencimiento);
  let tId = tarjetaId;
  if (!tId) {
    const t = lectura.tarjeta;
    const ya = t.ultimos4 && d.tarjetas.find(x => x.ultimos4 === t.ultimos4 && x.red === t.red);
    if (ya) tId = ya.id;
    else {
      tId = nuevoId();
      d.tarjetas.push({ id: tId, nombre: [t.banco, t.red].filter(Boolean).join(' ') || 'Tarjeta',
        red: t.red, banco: t.banco, ultimos4: t.ultimos4,
        color: COLORES.find(c => !d.tarjetas.some(x => x.color === c)) || COLORES[d.tarjetas.length % COLORES.length] });
    }
  }
  const resumenId = nuevoId();
  d.resumenes = d.resumenes.filter(r => !(r.tarjetaId === tId && r.mes === mes));
  d.resumenes.push({ id: resumenId, tarjetaId: tId, mes, cierre: lectura.cierre, vencimiento: lectura.vencimiento,
    periodo: lectura.periodo, totales: lectura.totales, pagoMinimo: lectura.pagoMinimo,
    consumos: lectura.consumos.map(c => ({ ...c })) });
  let nuevas = 0;
  for (const c of lectura.consumos) {
    if (!c.cuota || c.cuota.de < 2) continue;
    const primerMes = sumarMeses(mes, -(c.cuota.n - 1));
    const igual = x => x.tarjetaId === tId && x.cantidad === c.cuota.de && x.primerMes === primerMes &&
      (x.moneda || 'ARS') === c.moneda && normalizarComercio(x.descripcion) === normalizarComercio(c.comercio);
    if (d.cuotas.some(igual)) continue;
    d.cuotas.push({ id: nuevoId(), descripcion: c.comercio, total: c.monto * c.cuota.de, moneda: c.moneda,
      cantidad: c.cuota.de, tarjetaId: tId, primerMes, origen: 'resumen' });
    nuevas++;
  }
  return { datos: d, tarjetaId: tId, mes, cuotasNuevas: nuevas };
}

/* ── esquema y migración ── */
export const datosVacios = () => ({ v: ESQUEMA, ingresos: [], gastos: [], cuotas: [], tarjetas: [], resumenes: [], cambio: {}, rubrosComercio: {} });

const entero = x => Number.isSafeInteger(x) && x > 0;
const texto = (x, max = 60) => (typeof x === 'string' ? x.trim().slice(0, max) : '');

/* Datos guardados (de cualquier versión) → esquema actual, sin basura.
   Lo inválido se descarta en vez de romper la pantalla.
   v1 → v2: las cuotas pasan a tener moneda (ARS), las tarjetas red, banco,
   últimos 4 y color, y aparecen resúmenes, tipo de cambio y rubros. */
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
      ...(entero(t.limite) ? { limite: t.limite } : {}) });
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
      ...(c.origen === 'resumen' ? { origen: 'resumen' } : {}) });
  }
  for (const r of Array.isArray(crudo.resumenes) ? crudo.resumenes : []) {
    if (!r?.id || !ids.has(String(r.tarjetaId)) || !esMes(r.mes)) continue;
    const totales = {};
    for (const [m, v] of Object.entries(r.totales || {})) if (esMoneda(m) && Number.isSafeInteger(v)) totales[m] = v;
    const consumos = (Array.isArray(r.consumos) ? r.consumos : []).filter(c =>
      Number.isSafeInteger(c?.monto) && esMoneda(c?.moneda) && texto(c?.comercio)).map(c => ({
      fecha: esFecha(c.fecha) ? c.fecha : null, comercio: texto(c.comercio), monto: c.monto, moneda: c.moneda,
      rubro: RUBROS.includes(c.rubro) ? c.rubro : 'Otros',
      cuota: c.cuota && Number.isInteger(c.cuota.n) && Number.isInteger(c.cuota.de) ? { n: c.cuota.n, de: c.cuota.de } : null }));
    out.resumenes.push({ id: String(r.id), tarjetaId: String(r.tarjetaId), mes: r.mes,
      cierre: esFecha(r.cierre) ? r.cierre : null, vencimiento: esFecha(r.vencimiento) ? r.vencimiento : null,
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
  return out;
}

/* ── control de la lectura: ¿la suma da? ──
   Recibe la lectura cruda (montos en unidades, como viene de la API).
   Por moneda: consumos + ajustes (saldo anterior, pagos, intereses,
   impuestos) tienen que dar el total del resumen, con una tolerancia
   chica por redondeos. Si no da, la lectura NO es confiable. */
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
  for (const x of [...(Array.isArray(json?.consumos) ? json.consumos : []), ...(Array.isArray(json?.ajustes) ? json.ajustes : [])]) {
    const v = c(x?.monto);
    if (v === null) { motivos.push('Hay líneas sin monto legible.'); continue; }
    if (!esMoneda(x?.moneda)) { motivos.push('Hay montos en una moneda que no pudimos identificar.'); continue; }
    sumar(x.moneda, v);
  }
  for (const [m, total] of totales) {
    const suma = sumas.get(m) || 0;
    const tolerancia = Math.max(100, Math.round(Math.abs(total) * 0.005));
    if (Math.abs(suma - total) > tolerancia) motivos.push(`Lo que leímos en ${MONEDAS[m].nombre} no suma el total del resumen.`);
  }
  for (const m of sumas.keys()) if (!totales.has(m) && sumas.get(m) !== 0) motivos.push(`Hay consumos en ${MONEDAS[m].nombre} sin un total para esa moneda.`);
  return { ok: motivos.length === 0, motivos: [...new Set(motivos)] };
}
