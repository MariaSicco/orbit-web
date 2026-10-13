/* Mi Mes · cuentas puras (sin DOM ni storage), para el navegador y para node --test.

   Unidades: todos los montos se guardan en CENTAVOS (enteros), así no hay
   errores de coma flotante. Los meses son claves 'AAAA-MM'.

   Reglas de cálculo (ver test/mi-mes.test.js):
   - Ingreso o gasto que se repite: cuenta desde su mes `desde` en adelante,
     y si tiene `hasta`, hasta ese mes inclusive.
   - Ingreso o gasto que no se repite: cuenta solo en su mes `desde`.
   - Cuota: la compra se divide en `cantidad` cuotas mensuales a partir de
     `primerMes`. Si el total es en pesos enteros, las cuotas también: el resto
     que no reparte parejo va en la PRIMERA cuota (como lo cobran los bancos),
     así la suma da exacto el total.
   - Te quedan libres = ingresos − gastos fijos − cuotas del mes. Puede ser
     negativo. */

export const ESQUEMA = 1;

export const CATEGORIAS = [
  'Alquiler', 'Expensas', 'Servicios', 'Suscripciones', 'Seguros',
  'Transporte', 'Educación', 'Salud', 'Otros',
];

/* ── meses ── */
const MES = /^(\d{4})-(0[1-9]|1[0-2])$/;
export const esMes = m => typeof m === 'string' && MES.test(m);
export const mesDe = (fecha = new Date()) =>
  `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;
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

/* Sin fecha de cierre de la tarjeta, una compra de hoy se paga en el
   resumen que vence el mes que viene. Editable en el formulario. */
export const proximoResumen = (hoy = new Date()) => sumarMeses(mesDe(hoy), 1);

/* ── plata ── */
/* "$ 1.234.567" (redondeado a pesos). Con centavos: "$ 1.234,56". */
export function formatoPesos(centavos, { centavos: conCentavos = false, signo = false } = {}) {
  const neg = centavos < 0;
  const abs = Math.abs(centavos);
  let entero, dec = '';
  if (conCentavos && abs % 100 !== 0) {
    entero = Math.floor(abs / 100);
    dec = ',' + String(abs % 100).padStart(2, '0');
  } else {
    entero = Math.round(abs / 100);
  }
  const miles = String(entero).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const pre = neg && entero + dec !== '0' ? '−' : (signo && centavos > 0 ? '+' : '');
  return `${pre}$ ${miles}${dec}`;
}

/* Texto que escribe la persona → centavos, o null si no es un monto válido.
   Formato argentino: el punto es SOLO de miles y la coma, de centavos.
   Acepta "1.234.567", "1234567", "$ 12.000", "1234,50" y "1.234,5".
   Lo ambiguo ("900.00", "1.23.4") da null: mejor pedir que lo corrija
   que guardar un monto equivocado. */
export function leerPesos(texto) {
  const s = String(texto ?? '').replace(/[\s$]/g, '').replace(/^ARS/i, '');
  const m = /^(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?$/.exec(s);
  if (!m) return null;
  const [ent, dec = ''] = [m[1].replace(/\./g, ''), m[2]];
  const c = Number(ent) * 100 + Number(dec.padEnd(2, '0'));
  return Number.isSafeInteger(c) ? c : null;
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
  const tarjetas = new Map((d.tarjetas || []).map(t => [t.id, t.nombre]));
  const ingresos = (d.ingresos || []).filter(i => activoEn(i, mes));
  const gastos = (d.gastos || []).filter(g => activoEn(g, mes));
  const cuotas = [];
  for (const c of d.cuotas || []) {
    const n = numeroDeCuota(c, mes);
    if (!n) continue;
    cuotas.push({ ...c, numero: n, monto: repartirCuotas(c.total, c.cantidad)[n - 1],
      tarjeta: tarjetas.get(c.tarjetaId) || 'Sin tarjeta', ultima: n === c.cantidad });
  }
  const suma = xs => xs.reduce((s, x) => s + x.monto, 0);
  const totIngresos = suma(ingresos);
  const totGastos = suma(gastos);
  const totCuotas = suma(cuotas);
  return {
    mes, ingresos, gastos, cuotas,
    totIngresos, totGastos, totCuotas,
    libres: totIngresos - totGastos - totCuotas,
    vacio: !ingresos.length && !gastos.length && !cuotas.length,
  };
}

/* Cuotas comprometidas mes a mes, desde `desde`, `meses` meses. */
export function cuotasPorMes(datos, desde, meses) {
  return Array.from({ length: meses }, (_, k) => {
    const mes = sumarMeses(desde, k);
    return { mes, total: resumenMes(datos, mes).totCuotas };
  });
}

/* ── esquema y migración ── */
export const datosVacios = () => ({ v: ESQUEMA, ingresos: [], gastos: [], cuotas: [], tarjetas: [] });

const entero = x => Number.isSafeInteger(x) && x > 0;
const texto = (x, max = 60) => (typeof x === 'string' ? x.trim().slice(0, max) : '');

/* Datos guardados (de cualquier versión) → esquema actual, sin basura.
   Lo inválido se descarta en vez de romper la pantalla. */
export function migrar(crudo) {
  const out = datosVacios();
  if (!crudo || typeof crudo !== 'object') return out;
  /* v0 → v1: no hubo v0 publicado; este es el lugar para las próximas. */
  const tarjetas = Array.isArray(crudo.tarjetas) ? crudo.tarjetas : [];
  for (const t of tarjetas) {
    const nombre = texto(t?.nombre, 40);
    if (t?.id && nombre) out.tarjetas.push({ id: String(t.id), nombre });
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
      cantidad: c.cantidad, tarjetaId: String(c.tarjetaId), primerMes: c.primerMes });
  }
  return out;
}
