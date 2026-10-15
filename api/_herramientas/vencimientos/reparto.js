/* Vencimientos de la Casa · reparto de gastos en la casa compartida. Sin DOM.
   Cada pago marcado guarda quién lo pagó (`por`). Con la regla de la casa (partes iguales o
   porcentajes por persona) se calcula cuánto le tocaba a cada uno, cuánto puso y quién le
   debe a quién, con la menor cantidad de transferencias. "Saldar" registra la transferencia
   en `d.saldos` y la cuenta queda en cero. Los débitos automáticos y lo que se paga con
   tarjeta no tienen "quién": se muestran aparte. */
import * as V from './calculos.js';

const redondeo = c => Math.round(c / 100) * 100;   // a pesos enteros

export function partesDe(d, nombres) {
  const r = d.config?.reparto || {};
  const n = nombres.length || 1;
  if (r.modo === 'porcentajes' && r.partes) {
    const crudo = nombres.map(x => Math.max(0, Number(r.partes[x]) || 0));
    const suma = crudo.reduce((a, b) => a + b, 0);
    if (suma > 0) return Object.fromEntries(nombres.map((x, i) => [x, crudo[i] / suma]));
  }
  return Object.fromEntries(nombres.map(x => [x, 1 / n]));
}

export function reparto(d, ym, nombres, hoy) {
  const pagado = Object.fromEntries(nombres.map(x => [x, 0]));
  let total = 0, sinQuien = 0, sinQuienCant = 0;
  const detalle = [];
  for (const o of V.resumenMes(d, ym, hoy).ocurrencias) {
    if (!o.resuelto || o.estado === 'salteado' || o.cuenta.enTarjeta || o.moneda !== 'ARS' || !(o.monto > 0)) continue;
    const quien = o.pago?.por;
    if (!quien || !(quien in pagado)) { sinQuien += o.monto; sinQuienCant++; continue; }
    pagado[quien] += o.monto; total += o.monto;
    detalle.push({ cuentaId: o.cuentaId, nombre: o.cuenta.nombre, monto: o.monto, por: quien, fecha: o.pago.fecha });
  }
  const parte = partesDe(d, nombres);
  const neto = {};
  for (const x of nombres) neto[x] = pagado[x] - total * parte[x];
  for (const s of d.saldos || []) {
    if (s.mes !== ym || !(s.de in neto) || !(s.a in neto)) continue;
    neto[s.de] += s.monto; neto[s.a] -= s.monto;
  }
  /* quién le paga a quién: el que más debe al que más puso, hasta cerrar */
  const deben = nombres.filter(x => neto[x] < -100).map(x => ({ x, v: -neto[x] })).sort((a, b) => b.v - a.v);
  const ponen = nombres.filter(x => neto[x] > 100).map(x => ({ x, v: neto[x] })).sort((a, b) => b.v - a.v);
  const transferencias = [];
  while (deben.length && ponen.length) {
    const a = deben[0], b = ponen[0];
    const m = Math.min(a.v, b.v);
    if (redondeo(m) > 0) transferencias.push({ de: a.x, a: b.x, monto: redondeo(m) });
    a.v -= m; b.v -= m;
    if (a.v <= 100) deben.shift();
    if (b.v <= 100) ponen.shift();
  }
  return {
    ym, total, sinQuien, sinQuienCant, detalle, transferencias,
    personas: nombres.map(x => ({ nombre: x, parte: parte[x], pagado: pagado[x], leTocaba: Math.round(total * parte[x]) })),
  };
}

export function saldar(d, { mes, de, a, monto, fecha }) {
  const s = { id: V.nuevoId(), mes, de, a, monto, fecha };
  return { ...d, saldos: [...(d.saldos || []), s] };
}
