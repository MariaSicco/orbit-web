/* Vencimientos de la Casa (ob-021): las cuentas puras, sin DOM.
   Montos en centavos (enteros). Fechas como 'AAAA-MM-DD' (sin zona horaria).

   Modelo:
   - cuenta: algo que vence. Puede tener monto (luz, ABL) o no (VTV, licencia).
     Se repite cada `frecuencia` meses desde `primerVto` (0 = una sola vez),
     sin fin salvo que tenga `cuotas` o `hasta`.
   - ocurrencia: cada vencimiento concreto de una cuenta. Su clave es la fecha
     "teórica" (la de la serie). La factura real puede correr la fecha o fijar
     el monto: eso va en `facturas[cuentaId][clave]`.
   - pago: `pagos[cuentaId][clave] = { monto, fecha, nota }`.
   - salteado: `salteos[cuentaId][clave] = true` (ese mes no vino). */

export const VERSION = 1;

/* ── fechas ── */
const pad = n => String(n).padStart(2, '0');
export const esFecha = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
export const partes = s => s.split('-').map(Number);
export const diasDelMes = (a, m) => new Date(Date.UTC(a, m, 0)).getUTCDate();
export const fecha = (a, m, d) => `${a}-${pad(m)}-${pad(d)}`;
export const mesDe = s => s.slice(0, 7);
export function hoyLocal(d = new Date()) { return fecha(d.getFullYear(), d.getMonth() + 1, d.getDate()); }
const aUTC = s => { const [a, m, d] = partes(s); return Date.UTC(a, m - 1, d); };
export const difDias = (desde, hasta) => Math.round((aUTC(hasta) - aUTC(desde)) / 864e5);
export function sumarDias(s, n) {
  const t = new Date(aUTC(s) + n * 864e5);
  return fecha(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}
/* Suma meses respetando el día pedido: 31/01 + 1 mes = 28 o 29/02, y vuelve a 31 cuando existe. */
export function sumarMeses(s, n, dia) {
  const [a, m, d] = partes(s);
  const total = a * 12 + (m - 1) + n;
  const na = Math.floor(total / 12), nm = total % 12 + 1;
  return fecha(na, nm, Math.min(dia ?? d, diasDelMes(na, nm)));
}
export function sumarMesesMes(ym, n) {
  const [a, m] = ym.split('-').map(Number);
  const total = a * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${pad(total % 12 + 1)}`;
}
export const diaSemana = s => new Date(aUTC(s)).getUTCDay(); // 0 domingo
export const finDeSemana = s => { const d = diaSemana(s); return d === 0 || d === 6; };
/* Sábado o domingo → lunes. Los feriados no se corren solos: la fecha de la factura manda. */
export const habilSiguiente = s => diaSemana(s) === 6 ? sumarDias(s, 2) : diaSemana(s) === 0 ? sumarDias(s, 1) : s;

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
export const nombreMes = ym => MESES[Number(ym.slice(5, 7)) - 1];
export const fechaCorta = s => `${DIAS[diaSemana(s)]} ${Number(s.slice(8))}`;
export const fechaLarga = s => `${Number(s.slice(8))} de ${MESES[Number(s.slice(5, 7)) - 1]}`;
export function cuandoEs(s, hoy) {
  const n = difDias(hoy, s);
  if (n === 0) return 'hoy';
  if (n === 1) return 'mañana';
  if (n === -1) return 'ayer';
  if (n < 0) return `hace ${-n} días`;
  if (n < 15) return `en ${n} días`;
  return fechaLarga(s);
}

/* ── plata ── */
export function formatoPesos(c, { simbolo = '$', decimales = false } = {}) {
  const neg = c < 0; const v = Math.abs(Math.round(c));
  const enteros = Math.floor(v / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const cent = decimales && v % 100 ? ',' + pad(v % 100) : '';
  return `${neg ? '−' : ''}${simbolo} ${enteros}${cent}`;
}
export const formatoMoneda = (c, moneda) => formatoPesos(c, moneda === 'USD' ? { simbolo: 'US$', decimales: true } : { simbolo: '$' });
/* "12.345,50", "12345.5", "$ 12.345" → centavos. Vacío o basura → null. */
export function leerPesos(txt) {
  let s = String(txt ?? '').replace(/[^\d.,-]/g, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(/,(?=.*,)/g, '').replace(',', '.'); // coma decimal, puntos de miles
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');                        // 12.345 o 1.234.567
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}

/* ── frecuencias ── */
export const FRECUENCIAS = [
  [1, 'Todos los meses'], [2, 'Cada 2 meses'], [3, 'Cada 3 meses'], [4, 'Cada 4 meses'],
  [6, 'Cada 6 meses'], [12, 'Una vez por año'], [24, 'Cada 2 años'], [60, 'Cada 5 años'],
  [120, 'Cada 10 años'], [0, 'Una sola vez'],
];
export const nombreFrecuencia = f => (FRECUENCIAS.find(x => x[0] === f) || [0, `Cada ${f} meses`])[1];

/* ── estado vacío y migración ── */
export const estadoVacio = () => ({
  v: VERSION, cuentas: [], pagos: {}, facturas: {}, salteos: {},
  config: { avisos: [3, 0], hora: '09:00', diasProximos: 7 },
  creado: null, ultimoRespaldo: null,
});

export function migrar(datos) {
  const base = estadoVacio();
  if (!datos || typeof datos !== 'object') return base;
  const r = { ...base, ...datos, config: { ...base.config, ...(datos.config || {}) } };
  r.cuentas = Array.isArray(r.cuentas) ? r.cuentas.filter(c => c && c.id && esFecha(c.primerVto)) : [];
  for (const k of ['pagos', 'facturas', 'salteos']) if (!r[k] || typeof r[k] !== 'object') r[k] = {};
  r.v = VERSION;
  return r;
}

/* ── ocurrencias ──
   Claves (fechas teóricas) de una cuenta entre `desde` y `hasta` (incluidas).
   Cuenta con `cuotas`: termina en la N. Con `hasta`: no pasa de esa fecha. */
export function claves(c, desde, hasta) {
  const out = [];
  const dia = Number(c.primerVto.slice(8));
  const f = Number(c.frecuencia) || 0;
  if (!f) { if (c.primerVto >= desde && c.primerVto <= hasta) out.push(c.primerVto); return out; }
  let k = 0;
  if (c.primerVto < desde) { // saltar rápido a cerca de `desde`
    const [a1, m1] = partes(c.primerVto), [a2, m2] = partes(desde);
    k = Math.max(0, Math.floor(((a2 - a1) * 12 + (m2 - m1)) / f) - 1);
  }
  for (let i = 0; i < 2000; i++, k++) {
    if (c.cuotas && k >= c.cuotas) break;
    const s = sumarMeses(c.primerVto, k * f, dia);
    if (c.hasta && s > c.hasta) break;
    if (s > hasta) break;
    if (s >= desde) out.push(s);
  }
  return out;
}
export const numeroDeCuota = (c, clave) => {
  const f = Number(c.frecuencia) || 0;
  if (!c.cuotas || !f) return null;
  const [a1, m1] = partes(c.primerVto), [a2, m2] = partes(clave);
  return Math.round(((a2 - a1) * 12 + (m2 - m1)) / f) + 1;
};

/* Último monto conocido de la cuenta antes de (o en) `clave`: lo pagado o lo facturado manda;
   si no hay nada, el monto que se cargó en la cuenta. */
export function montoConocido(d, c, clave) {
  const pag = d.pagos[c.id] || {}, fac = d.facturas[c.id] || {};
  let mejor = null;
  for (const k of new Set([...Object.keys(pag), ...Object.keys(fac)])) {
    if (k > clave) continue;
    const m = pag[k]?.monto ?? fac[k]?.monto;
    if (m == null) continue;
    if (!mejor || k > mejor.k) mejor = { k, m };
  }
  return mejor ? mejor.m : (c.monto ?? null);
}

/* Una ocurrencia con todo lo que la pantalla necesita. */
export function ocurrencia(d, c, clave, hoy) {
  const fac = d.facturas[c.id]?.[clave] || {};
  const pago = d.pagos[c.id]?.[clave] || null;
  const salteado = !!d.salteos[c.id]?.[clave];
  const vence = esFecha(fac.fecha) ? fac.fecha : (c.habil ? habilSiguiente(clave) : clave);
  const segundo = c.segundoVto ? sumarDias(vence, c.segundoVto) : null;
  let monto, origen;
  if (pago && pago.monto != null) { monto = pago.monto; origen = 'pagado'; }
  else if (fac.monto != null) { monto = fac.monto; origen = 'factura'; }
  else { monto = montoConocido(d, c, clave); origen = monto == null ? 'sin' : 'estimado'; }
  const tieneMonto = c.tipo !== 'tramite' && monto != null;

  let estado;
  if (salteado) estado = 'salteado';
  else if (pago) estado = 'pagado';
  else if (c.debito && vence <= hoy) estado = 'debitado';
  else if (vence < hoy) estado = segundo && segundo >= hoy ? 'segundo' : 'vencido';
  else if (vence === hoy) estado = 'hoy';
  else if (difDias(hoy, vence) <= (d.config?.diasProximos ?? 7)) estado = 'proximo';
  else estado = 'pendiente';

  /* Alquiler y similares: cada `ajusteCada` meses desde el primer vencimiento cambia el monto. */
  const [a1, m1] = partes(c.primerVto), [a2, m2] = partes(clave);
  const mesesDesde = (a2 - a1) * 12 + (m2 - m1);
  const ajusta = !!(c.ajusteCada && mesesDesde > 0 && mesesDesde % c.ajusteCada === 0);

  return {
    id: `${c.id}|${clave}`, cuentaId: c.id, clave, vence, segundo, cuenta: c, ajusta,
    monto: tieneMonto ? monto : null, moneda: c.moneda === 'USD' ? 'USD' : 'ARS',
    origen, estado, cuota: numeroDeCuota(c, clave),
    resuelto: estado === 'pagado' || estado === 'debitado' || estado === 'salteado',
    aConfirmar: !!(c.fechaAConfirmar && !esFecha(fac.fecha) && !pago),
    pago,
  };
}

/* Todas las ocurrencias (de todas las cuentas) cuya fecha real cae entre desde y hasta.
   Se mira un margen alrededor porque la factura puede correr la fecha. */
export function ocurrenciasEntre(d, desde, hasta, hoy) {
  const out = [];
  const mDesde = sumarDias(desde, -45), mHasta = sumarDias(hasta, 45);
  for (const c of d.cuentas) {
    if (c.archivada) continue;
    for (const k of claves(c, mDesde, mHasta)) {
      const o = ocurrencia(d, c, k, hoy);
      if (o.vence >= desde && o.vence <= hasta) out.push(o);
    }
  }
  return out.sort((a, b) => a.vence.localeCompare(b.vence) || a.cuenta.nombre.localeCompare(b.cuenta.nombre));
}

export function ocurrenciasDelMes(d, ym, hoy) {
  const [a, m] = ym.split('-').map(Number);
  return ocurrenciasEntre(d, `${ym}-01`, fecha(a, m, diasDelMes(a, m)), hoy);
}

/* Vencidos sin pagar de cualquier mes anterior (hasta 13 meses atrás), para que no se pierdan. */
export function atrasados(d, hoy) {
  return ocurrenciasEntre(d, sumarMeses(hoy, -13), sumarDias(hoy, -1), hoy)
    .filter(o => o.estado === 'vencido' || o.estado === 'segundo');
}

const vacioTotales = () => ({ total: 0, pagado: 0, pendiente: 0, sinMonto: 0, estimados: 0 });
/* Totales del mes, por moneda. "pendiente" es lo que falta pagar (no cuenta débitos ya pasados). */
export function resumenMes(d, ym, hoy) {
  const ocs = ocurrenciasDelMes(d, ym, hoy);
  const por = { ARS: vacioTotales(), USD: vacioTotales() };
  const categorias = {};
  let cantPendientes = 0;
  for (const o of ocs) {
    if (o.estado === 'salteado') continue;
    if (o.cuenta.enTarjeta) continue; // ya está dentro del total de la tarjeta: no se suma dos veces
    if (!o.resuelto) cantPendientes++;
    if (o.monto == null) { if (o.cuenta.tipo !== 'tramite') por[o.moneda].sinMonto++; continue; }
    const t = por[o.moneda];
    t.total += o.monto;
    if (o.resuelto) t.pagado += o.monto; else t.pendiente += o.monto;
    if (o.origen === 'estimado') t.estimados++;
    if (o.moneda === 'ARS') categorias[o.cuenta.categoria || 'Otros'] = (categorias[o.cuenta.categoria || 'Otros'] || 0) + o.monto;
  }
  const cats = Object.entries(categorias).sort((a, b) => b[1] - a[1]);
  return { ym, ocurrencias: ocs, ars: por.ARS, usd: por.USD, categorias: cats, cantPendientes };
}

/* Proyección de los próximos 12 meses desde el mes de `hoy` (en pesos), por categoría y por mes. */
export function proyeccionAnual(d, hoy) {
  const ym0 = mesDe(hoy);
  const meses = [];
  const categorias = {};
  let total = 0;
  for (let i = 0; i < 12; i++) {
    const ym = sumarMesesMes(ym0, i);
    const r = resumenMes(d, ym, hoy);
    meses.push({ ym, total: r.ars.total });
    total += r.ars.total;
    for (const [c, v] of r.categorias) categorias[c] = (categorias[c] || 0) + v;
  }
  return { meses, total, promedio: Math.round(total / 12), categorias: Object.entries(categorias).sort((a, b) => b[1] - a[1]) };
}

/* Historia de montos reales (pagados o facturados) de una cuenta, de la más vieja a la más nueva,
   con la variación contra el anterior y contra un año antes. */
export function historial(d, c) {
  const pag = d.pagos[c.id] || {}, fac = d.facturas[c.id] || {};
  const ks = [...new Set([...Object.keys(pag), ...Object.keys(fac)])].sort();
  const h = [];
  for (const k of ks) {
    const m = pag[k]?.monto ?? fac[k]?.monto;
    if (m == null) continue;
    h.push({ clave: k, monto: m, pagado: !!pag[k] });
  }
  for (let i = 0; i < h.length; i++) {
    const ant = h[i - 1];
    h[i].vsAnterior = ant && ant.monto ? (h[i].monto - ant.monto) / ant.monto : null;
    const haceUnAnio = sumarMeses(h[i].clave, -12);
    const prev = [...h.slice(0, i)].reverse().find(x => Math.abs(difDias(haceUnAnio, x.clave)) <= 20);
    h[i].vsAnio = prev && prev.monto ? (h[i].monto - prev.monto) / prev.monto : null;
  }
  return h;
}

/* Cuánto subió en total: del primer al último monto real, y cuántos meses pasaron. */
export function suba(d, c) {
  const h = historial(d, c);
  if (h.length < 2) return null;
  const a = h[0], b = h[h.length - 1];
  if (!a.monto) return null;
  const [a1, m1] = partes(a.clave), [a2, m2] = partes(b.clave);
  return { desde: a, hasta: b, pct: (b.monto - a.monto) / a.monto, meses: (a2 - a1) * 12 + (m2 - m1) };
}

export function proximaDe(d, c, hoy) {
  const ks = claves(c, sumarMeses(hoy, -13), sumarMeses(hoy, 130));
  for (const k of ks) {
    const o = ocurrencia(d, c, k, hoy);
    if (!o.resuelto) return o;
  }
  return null;
}

/* ── acciones (devuelven estado nuevo; no mutan) ── */
const clon = x => JSON.parse(JSON.stringify(x));
export function marcarPagado(d, cuentaId, clave, { monto = null, fecha: f, nota = '', por = '' } = {}) {
  const r = clon(d);
  (r.pagos[cuentaId] ||= {})[clave] = { monto, fecha: f, ...(nota ? { nota } : {}), ...(por ? { por } : {}) };
  if (r.salteos[cuentaId]) delete r.salteos[cuentaId][clave];
  return r;
}
export function desmarcarPagado(d, cuentaId, clave) {
  const r = clon(d);
  if (r.pagos[cuentaId]) delete r.pagos[cuentaId][clave];
  return r;
}
export function cargarFactura(d, cuentaId, clave, { monto, fecha: f } = {}) {
  const r = clon(d);
  const actual = { ...(r.facturas[cuentaId]?.[clave] || {}) };
  if (monto !== undefined) { if (monto == null) delete actual.monto; else actual.monto = monto; }
  if (f !== undefined) { if (!f || f === clave) delete actual.fecha; else actual.fecha = f; }
  (r.facturas[cuentaId] ||= {});
  if (Object.keys(actual).length) r.facturas[cuentaId][clave] = actual; else delete r.facturas[cuentaId][clave];
  return r;
}
export function saltear(d, cuentaId, clave, si = true) {
  const r = clon(d);
  (r.salteos[cuentaId] ||= {});
  if (si) r.salteos[cuentaId][clave] = true; else delete r.salteos[cuentaId][clave];
  return r;
}
export function guardarCuenta(d, cuenta) {
  const r = clon(d);
  const c = { ...cuenta, editada: new Date().toISOString() };
  const i = r.cuentas.findIndex(x => x.id === cuenta.id);
  if (i > -1) r.cuentas[i] = c; else r.cuentas.push(c);
  return r;
}
export function borrarCuenta(d, id) {
  const r = clon(d);
  r.cuentas = r.cuentas.filter(c => c.id !== id);
  for (const k of ['pagos', 'facturas', 'salteos']) delete r[k][id];
  r.borradas = { ...(r.borradas || {}), [id]: new Date().toISOString().slice(0, 10) };
  return r;
}
export const nuevoId = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);

/* Primer vencimiento a partir de un día del mes: si ese día ya pasó este mes, el del mes que viene. */
export function proximoDia(dia, hoy, frecuencia = 1) {
  const [a, m] = partes(hoy);
  const este = fecha(a, m, Math.min(dia, diasDelMes(a, m)));
  return este >= hoy ? este : sumarMeses(este, Math.max(1, frecuencia || 1), dia);
}

/* ── calendario (.ics) ──
   Un evento de día completo por vencimiento (los próximos `meses`), no RRULE:
   así respeta fechas corridas por la factura, cuotas y meses cortos. UID estable
   (cuenta + fecha teórica) para que volver a importar actualice en vez de duplicar
   (Apple lo respeta; Google a veces duplica). Dos alarmas por defecto:
   N días antes y el mismo día, a la hora elegida. */
const escICS = s => String(s ?? '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
function plegar(linea) {
  const bytes = new TextEncoder().encode(linea);
  if (bytes.length <= 74) return linea;
  const out = []; let actual = ''; let largo = 0;
  for (const ch of linea) {
    const b = new TextEncoder().encode(ch).length;
    if (largo + b > (out.length ? 73 : 74)) { out.push(actual); actual = ''; largo = 0; }
    actual += ch; largo += b;
  }
  out.push(actual);
  return out.join('\r\n ');
}
export function triggerAlarma(diasAntes, hora = '09:00') {
  const [h, mi] = hora.split(':').map(Number);
  const minutos = diasAntes * 24 * 60 - (h * 60 + mi);
  const p = Math.abs(minutos);
  return `${minutos > 0 ? '-' : ''}PT${Math.floor(p / 60)}H${p % 60 ? (p % 60) + 'M' : ''}`;
}
export function generarICS(d, { hoy, cuentaId = null, meses = 18, sello, casa = '' } = {}) {
  const hasta = sumarMeses(hoy, meses);
  const ahora = (sello || new Date().toISOString()).replace(/[-:]/g, '').replace(/\.\d+/, '').replace(/Z?$/, 'Z');
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Orbit//Vencimientos de la Casa//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${escICS(casa ? `Vencimientos · ${casa}` : 'Vencimientos de la Casa')}`];
  const avisos = (d.config?.avisos?.length ? d.config.avisos : [3, 0]).slice(0, 3);
  const hora = d.config?.hora || '09:00';
  let n = 0;
  for (const c of d.cuentas) {
    if (c.archivada || (cuentaId && c.id !== cuentaId)) continue;
    for (const k of claves(c, sumarDias(hoy, -40), hasta)) {
      const o = ocurrencia(d, c, k, hoy);
      if (o.resuelto || o.vence < hoy) continue;
      const fin = sumarDias(o.vence, 1).replace(/-/g, '');
      const monto = o.monto != null ? ` · ${o.origen === 'estimado' ? '≈ ' : ''}${formatoMoneda(o.monto, o.moneda)}` : '';
      const cuota = o.cuota ? ` (cuota ${o.cuota}/${c.cuotas})` : '';
      const ajuste = (o.ajusta && o.origen === 'estimado' ? ' · se ajusta' : '') + (o.aConfirmar ? ' · fecha a confirmar' : '');
      const verbo = c.tipo === 'tramite' ? 'Vence' : (c.debito ? 'Se debita' : 'Vence');
      const desc = [
        c.debito ? 'Tiene débito automático: revisá que se haya debitado.' : '',
        o.segundo ? `Segundo vencimiento (con recargo): ${fechaLarga(o.segundo)}.` : '',
        c.nota || '',
        'Marcalo pagado en Vencimientos de la Casa · orbitando.com.ar',
      ].filter(Boolean).join('\n');
      L.push('BEGIN:VEVENT',
        `UID:${c.id}-${k}@vencimientos.orbitando.com.ar`,
        `DTSTAMP:${ahora}`,
        `DTSTART;VALUE=DATE:${o.vence.replace(/-/g, '')}`,
        `DTEND;VALUE=DATE:${fin}`,
        plegar(`SUMMARY:${escICS(`${verbo}: ${c.nombre}${casa ? ` (${casa})` : ''}${cuota}${monto}${ajuste}`)}`),
        plegar(`DESCRIPTION:${escICS(desc)}`),
        'TRANSP:TRANSPARENT');
      for (const a of avisos) {
        L.push('BEGIN:VALARM', 'ACTION:DISPLAY', plegar(`DESCRIPTION:${escICS(`${c.nombre}: ${a === 0 ? 'vence hoy' : a === 1 ? 'vence mañana' : `vence en ${a} días`}`)}`),
          `TRIGGER:${triggerAlarma(a, hora)}`, 'END:VALARM');
      }
      if (c.debito && c.tipo !== 'tramite') {
        L.push('BEGIN:VALARM', 'ACTION:DISPLAY', plegar(`DESCRIPTION:${escICS(`${c.nombre}: revisá que se haya debitado`)}`),
          `TRIGGER:${triggerAlarma(-1, hora)}`, 'END:VALARM');
      }
      L.push('END:VEVENT');
      n++;
    }
  }
  L.push('END:VCALENDAR');
  return { texto: L.join('\r\n') + '\r\n', eventos: n };
}

/* ── respaldo ── */
export function exportarRespaldo(d, ahora = new Date().toISOString()) {
  return JSON.stringify({ app: 'vencimientos-de-la-casa', exportado: ahora, datos: d }, null, 2);
}
export function leerRespaldo(texto) {
  let j;
  try { j = JSON.parse(texto); } catch { throw new Error('El archivo no es un respaldo válido.'); }
  const datos = j && j.app === 'vencimientos-de-la-casa' ? j.datos : (j && Array.isArray(j.cuentas) ? j : null);
  if (!datos) throw new Error('Ese archivo no es un respaldo de Vencimientos de la Casa.');
  return migrar(datos);
}

/* ── para tener en cuenta ──
   Avisos cortos que ninguna app de cada empresa te da, ordenados por importancia:
   suba de un servicio, apartar para un pago grande, revisar un débito, racha de meses
   al día y montos que faltan. Devuelve [{ tipo, cuentaId?, texto, dato? }]. */
export function insights(d, hoy, { umbralSuba = 0.15, max = 4 } = {}) {
  const out = [];
  const activas = d.cuentas.filter(c => !c.archivada);
  /* subas: el último monto real contra el anterior, si es reciente */
  for (const c of activas) {
    const h = historial(d, c);
    if (h.length < 2) continue;
    const ult = h[h.length - 1], ant = h[h.length - 2];
    if (!ant.monto || difDias(ult.clave, hoy) > 75) continue;
    const pct = (ult.monto - ant.monto) / ant.monto;
    if (pct >= umbralSuba) out.push({ tipo: 'suba', cuentaId: c.id, peso: 90 + Math.min(pct * 10, 9), pct, desde: ant.monto, hasta: ult.monto, moneda: c.moneda === 'USD' ? 'USD' : 'ARS', nombre: c.nombre });
  }
  /* apartar: un pago grande en 8 a 35 días */
  const prox = ocurrenciasEntre(d, sumarDias(hoy, 8), sumarDias(hoy, 35), hoy).filter(o => !o.resuelto && o.monto != null && o.moneda === 'ARS' && !o.cuenta.enTarjeta);
  const grande = prox.sort((a, b) => b.monto - a.monto)[0];
  if (grande && grande.monto >= 20000000) { // ≥ $ 200.000
    const semanas = Math.max(1, Math.ceil(difDias(hoy, grande.vence) / 7));
    out.push({ tipo: 'apartar', cuentaId: grande.cuentaId, clave: grande.clave, peso: 80, nombre: grande.cuenta.nombre, vence: grande.vence, monto: grande.monto, semanas, porSemana: Math.ceil(grande.monto / semanas / 100) * 100 });
  }
  /* débitos de los últimos 2 días: revisar que se hayan debitado */
  for (const o of ocurrenciasEntre(d, sumarDias(hoy, -2), hoy, hoy)) {
    if (o.estado === 'debitado' && !o.cuenta.enTarjeta) out.push({ tipo: 'debito', cuentaId: o.cuentaId, peso: 70, nombre: o.cuenta.nombre, vence: o.vence });
  }
  /* racha: meses anteriores seguidos sin nada sin pagar */
  let racha = 0;
  for (let i = 1; i <= 24; i++) {
    const r = resumenMes(d, sumarMesesMes(mesDe(hoy), -i), hoy);
    const hubo = r.ocurrencias.some(o => o.estado !== 'salteado' && !o.cuenta.enTarjeta);
    if (!hubo || r.cantPendientes) break;
    racha++;
  }
  if (racha >= 2) out.push({ tipo: 'racha', peso: 40, meses: racha });
  /* montos que faltan en los próximos 30 días */
  const sinMonto = ocurrenciasEntre(d, hoy, sumarDias(hoy, 30), hoy).filter(o => !o.resuelto && o.monto == null && o.cuenta.tipo !== 'tramite');
  if (sinMonto.length) out.push({ tipo: 'sinmonto', cuentaId: sinMonto[0].cuentaId, clave: sinMonto[0].clave, peso: 50, nombre: sinMonto[0].cuenta.nombre, cantidad: sinMonto.length });
  return out.sort((a, b) => b.peso - a.peso).slice(0, max);
}

/* ── casa compartida: juntar dos versiones (la del teléfono y la del servidor) ──
   Si dos personas cambiaron la casa a la vez: las cuentas se unen por id (gana la más
   reciente por `editada`), y pagos, facturas y salteos se combinan clave por clave (un
   pago marcado en cualquiera de los dos teléfonos queda). Las cuentas borradas se
   recuerdan en `borradas` para que no vuelvan. */
export function fusionar(local, remoto) {
  const a = migrar(local), b = migrar(remoto);
  const borradas = { ...(b.borradas || {}), ...(a.borradas || {}) };
  const porId = new Map();
  for (const c of [...b.cuentas, ...a.cuentas]) {
    const prev = porId.get(c.id);
    if (!prev || String(c.editada || '') >= String(prev.editada || '')) porId.set(c.id, c);
  }
  const cuentas = [...porId.values()].filter(c => !borradas[c.id]);
  const mezclar = k => {
    const out = {};
    for (const src of [b[k], a[k]]) for (const [cid, porClave] of Object.entries(src || {})) {
      if (borradas[cid]) continue;
      out[cid] = { ...(out[cid] || {}), ...porClave };
    }
    return out;
  };
  const saldos = [...new Map([...(b.saldos || []), ...(a.saldos || [])].map(x => [x.id, x])).values()];
  return { ...b, ...a, cuentas, pagos: mezclar('pagos'), facturas: mezclar('facturas'), salteos: mezclar('salteos'), borradas, saldos, config: { ...b.config, ...a.config } };
}
