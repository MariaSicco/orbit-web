/* Vencimientos de la Casa · Radar: fugas de plata y cobros que no cierran. Sin DOM.
   - Fugas: cuánto se va por mes y por año en suscripciones.
   - Cobros raros, desde los resúmenes de tarjeta que leyó la persona (se guardan solo en el
     teléfono, nunca en la casa compartida): cobro repetido, suscripción que subió, cobro nuevo
     y consumos en dólares.
   - Subas de facturas (luz, gas, expensas…) contra la anterior, de V.insights.
   Cada aviso trae una explicación y un próximo paso. Solo se avisa lo que se sale de lo normal.

   Costo de cada casa: rango del mes que viene con el historial de cada cuenta, qué tan confiable
   es la estimación y cuánto cuesta por año. */
import * as V from './calculos.js';
import { servicioDelComercio, nombreDesdeComercio } from './resumen-tarjeta.js';
import { SERVICIOS } from './servicios.js';

const pesos = n => Math.round(Number(n) * 100);
const limpio = s => String(s || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
export const CATEGORIAS_SUSCRIPCION = new Set(['Entretenimiento', 'Apps y trabajo', 'Suscripciones']);
export const MAX_RESUMENES_POR_TARJETA = 3;

/* ── resúmenes guardados (solo en el dispositivo) ── */
const claveTarjeta = t => [t?.red, t?.banco, t?.ultimos4].filter(Boolean).join('·') || 'tarjeta';
export function nombreTarjeta(t) {
  const banco = String(t?.banco || '').replace(/^banco\s+/i, '').trim();
  return [t?.red, banco].filter(Boolean).join(' ') + (t?.ultimos4 ? ` ·${t.ultimos4}` : '') || 'tu tarjeta';
}

/* Se guarda lo mínimo para comparar: tarjeta (red, banco, últimos 4), vencimiento y consumos.
   Si se vuelve a subir el mismo resumen, reemplaza al anterior. */
export function sumarResumen(lista, lectura, hoy) {
  if (!lectura || !Array.isArray(lectura.consumos)) return lista || [];
  const t = lectura.tarjeta || {};
  const nuevo = {
    tarjeta: { red: t.red || '', banco: t.banco || '', ultimos4: t.ultimos4 || '' },
    vencimiento: V.esFecha(lectura.vencimiento) ? lectura.vencimiento : null,
    leido: hoy,
    consumos: lectura.consumos.filter(c => c && c.monto > 0).map(c => ({
      fecha: V.esFecha(c.fecha) ? c.fecha : null, comercio: String(c.comercio || '').slice(0, 60),
      monto: Number(c.monto), moneda: c.moneda === 'USD' ? 'USD' : c.moneda === 'ARS' ? 'ARS' : String(c.moneda || 'ARS'),
      rubro: c.rubro || '', cuota: c.cuota ? { n: c.cuota.n, de: c.cuota.de } : null,
    })),
  };
  const k = claveTarjeta(nuevo.tarjeta);
  const otros = (lista || []).filter(r => !(claveTarjeta(r.tarjeta) === k && r.vencimiento === nuevo.vencimiento));
  const deEsta = [...otros.filter(r => claveTarjeta(r.tarjeta) === k), nuevo]
    .sort((a, b) => String(a.vencimiento || a.leido).localeCompare(String(b.vencimiento || b.leido)))
    .slice(-MAX_RESUMENES_POR_TARJETA);
  return [...otros.filter(r => claveTarjeta(r.tarjeta) !== k), ...deEsta];
}

/* Un cobro "que se repite" se identifica por el servicio conocido o por las dos primeras palabras del comercio. */
const claveCobro = c => servicioDelComercio(c.comercio) || `c:${limpio(c.comercio).split(' ').filter(w => !/\d/.test(w)).slice(0, 2).join(' ')}`;
const nombreCobro = c => { const id = servicioDelComercio(c.comercio); const s = id && SERVICIOS.find(x => x.id === id); return s && !/^(luz|gas|agua|internet|celular|cable|prepaga|seguro-auto|gimnasio|peaje)$/.test(s.id) ? s.nombre : nombreDesdeComercio(c.comercio); };
const esRecurrente = c => !c.cuota && (!!servicioDelComercio(c.comercio) || c.rubro === 'Suscripciones' || c.rubro === 'Servicios');

const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
const yaCargada = (d, nombre) => d.cuentas.find(c => !c.archivada && norm(c.nombre) === norm(nombre)) || null;
/* Clave estable de un aviso, para "Ya lo vi". Si el aviso cambia (otro monto, otro resumen), vuelve a aparecer. */
export const claveAviso = r => [r.tipo, r.nombre || '', r.tarjeta || '', r.vence || '', r.hasta ?? r.monto ?? r.anio ?? ''].join('|');

/* ── fugas: suscripciones ── */
export function fugas(d, hoy) {
  const subs = [];
  for (const c of d.cuentas) {
    if (c.archivada || c.tipo === 'tramite' || !CATEGORIAS_SUSCRIPCION.has(c.categoria)) continue;
    const f = Number(c.frecuencia) || 0;
    if (!f) continue;
    const o = V.proximaDe(d, c, hoy);
    if (!o || o.monto == null) continue;
    subs.push({ id: c.id, nombre: c.nombre, moneda: o.moneda, mes: Math.round(o.monto / f), anio: Math.round(o.monto * 12 / f), cuenta: c });
  }
  subs.sort((a, b) => (b.moneda === 'ARS') - (a.moneda === 'ARS') || b.anio - a.anio);
  const ars = subs.filter(s => s.moneda === 'ARS'), usd = subs.filter(s => s.moneda === 'USD');
  return {
    subs, cantidad: subs.length,
    mes: ars.reduce((a, s) => a + s.mes, 0), anio: ars.reduce((a, s) => a + s.anio, 0),
    mesUSD: usd.reduce((a, s) => a + s.mes, 0), anioUSD: usd.reduce((a, s) => a + s.anio, 0),
  };
}

/* ── radar ── */
export function radar(d, resumenes, hoy) {
  const out = [];
  const porTarjeta = new Map();
  for (const r of resumenes || []) (porTarjeta.get(claveTarjeta(r.tarjeta)) || porTarjeta.set(claveTarjeta(r.tarjeta), []).get(claveTarjeta(r.tarjeta))).push(r);

  for (const lista of porTarjeta.values()) {
    lista.sort((a, b) => String(a.vencimiento || a.leido).localeCompare(String(b.vencimiento || b.leido)));
    const ult = lista.at(-1), ant = lista.length > 1 ? lista.at(-2) : null;
    if (ult.vencimiento && V.difDias(ult.vencimiento, hoy) > 60) continue;   // resumen viejo: no molestar
    const tarjeta = nombreTarjeta(ult.tarjeta);

    /* 1 · cobro repetido: mismo comercio, mismo monto, a 5 días o menos, sin cuotas */
    const vistos = new Map();
    for (const c of ult.consumos) {
      if (c.cuota) continue;
      const k = `${claveCobro(c)}|${c.moneda}|${c.monto}`;
      const prev = vistos.get(k);
      if (prev && (!c.fecha || !prev.fecha || Math.abs(V.difDias(prev.fecha, c.fecha)) <= 5)) {
        out.push({ tipo: 'repetido', peso: 100, tarjeta, nombre: nombreCobro(c), monto: pesos(c.monto), moneda: c.moneda, fechas: [prev.fecha, c.fecha].filter(Boolean), vence: ult.vencimiento });
        vistos.delete(k);
      } else vistos.set(k, c);
    }

    /* 2 y 3 · contra el resumen anterior de la misma tarjeta: suscripción que subió y cobro nuevo */
    if (ant) {
      const agrupar = r => {
        const m = new Map();
        for (const c of r.consumos) if (esRecurrente(c) && (c.moneda === 'ARS' || c.moneda === 'USD')) {
          const k = `${claveCobro(c)}|${c.moneda}`;
          const g = m.get(k) || { nombre: nombreCobro(c), moneda: c.moneda, monto: 0 };
          g.monto += c.monto; m.set(k, g);
        }
        return m;
      };
      const a = agrupar(ant), b = agrupar(ult);
      for (const [k, g] of b) {
        const p = a.get(k);
        if (!p && yaCargada(d, g.nombre)) continue;
        if (!p) { out.push({ tipo: 'nuevo', peso: 85, tarjeta, nombre: g.nombre, monto: pesos(g.monto), moneda: g.moneda, vence: ult.vencimiento }); continue; }
        const pct = (g.monto - p.monto) / p.monto;
        const dif = g.monto - p.monto;
        if (pct >= 0.05 && (g.moneda === 'USD' ? dif >= 0.5 : dif >= 300)) out.push({ tipo: 'subio', peso: 88 + Math.min(pct * 10, 9), tarjeta, nombre: g.nombre, cuentaId: yaCargada(d, g.nombre)?.id || null, desde: pesos(p.monto), hasta: pesos(g.monto), pct, moneda: g.moneda, anio: pesos(dif * 12) });
      }
    }

    /* 4 · consumos en dólares: pagarlos con dólares propios evita la percepción */
    const usd = ult.consumos.filter(c => c.moneda === 'USD').reduce((s, c) => s + c.monto, 0);
    if (usd > 0 && (!ult.vencimiento || ult.vencimiento >= hoy)) out.push({ tipo: 'dolares', peso: 75, tarjeta, monto: pesos(usd), moneda: 'USD', vence: ult.vencimiento });
  }

  /* 5 · facturas que subieron (luz, gas, expensas…), del historial de pagos y facturas */
  for (const i of V.insights(d, hoy, { max: 20 })) if (i.tipo === 'suba') out.push({ tipo: 'suba', peso: i.peso, cuentaId: i.cuentaId, nombre: i.nombre, desde: i.desde, hasta: i.hasta, pct: i.pct, moneda: i.moneda });

  /* 6 · fugas: el total de suscripciones (solo si son varias) */
  const f = fugas(d, hoy);
  if (f.cantidad >= 2 && (f.mes || f.mesUSD)) out.push({ tipo: 'fugas', peso: 60, cantidad: f.cantidad, mes: f.mes, anio: f.anio, mesUSD: f.mesUSD, anioUSD: f.anioUSD });

  return out.sort((a, b) => b.peso - a.peso);
}

/* ── lo que cuesta cada casa ── */
const VARIABLES = new Set(['Luz, gas y agua']);
export function costoCasa(d, hoy) {
  const ym = V.sumarMesesMes(V.mesDe(hoy), 1);
  const r = V.resumenMes(d, ym, hoy);
  let total = 0, min = 0, max = 0, firmes = 0, sinMonto = r.ars.sinMonto;
  for (const o of r.ocurrencias) {
    if (o.estado === 'salteado' || o.cuenta.enTarjeta || o.moneda !== 'ARS' || o.monto == null) continue;
    total += o.monto;
    const h = V.historial(d, o.cuenta).slice(-6).map(x => x.monto).filter(m => m > 0);
    let lo = o.monto, hi = o.monto;
    if (h.length >= 3) {
      const ult = h.at(-1);
      lo = Math.min(o.monto, Math.round(o.monto * Math.min(...h) / ult));
      hi = Math.max(o.monto, Math.round(o.monto * Math.max(...h) / ult));
      firmes += o.monto;
    } else if (VARIABLES.has(o.cuenta.categoria) || o.ajusta) {
      lo = Math.round(o.monto * 0.85); hi = Math.round(o.monto * 1.2);
    } else if (o.origen !== 'estimado' || h.length) firmes += o.monto;
    min += lo; max += hi;
  }
  const parte = total ? firmes / total : 0;
  const confianza = !total ? 'sin datos' : parte >= 0.8 && !sinMonto ? 'alta' : parte >= 0.5 ? 'media' : 'baja';
  const anual = V.proyeccionAnual(d, hoy).total;
  return { ym, total, min, max, confianza, sinMonto, anual, porDia: Math.round(anual / 365) };
}
