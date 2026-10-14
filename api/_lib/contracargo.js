/* Contracargo marcado a mano desde el panel.
   Orbit no hace devoluciones, pero si el comprador desconoce el pago ante su
   banco o tarjeta, la plata vuelve igual. Al marcarlo, las compras de ese
   pedido quedan con `refunded` y el control de acceso (compraDe en
   herramienta-acceso.js) deja de contarlas. Se puede deshacer (por ejemplo,
   si el contracargo se gana). No avisa a nadie ni toca Mercado Pago ni PayPal. */
import { kvSet, getPurchases, setPurchases } from './kv.js';

const MOTIVO = 'contracargo';
const orderKey = id => `orbit:order:${id}`;
const TTL_PEDIDO = 60 * 60 * 24 * 365 * 3;

/* Los emails que tienen las compras del pedido: el actual y, si se reasignó,
   el original (reasignarPedido suma la compra al nuevo sin sacarla del viejo). */
const emailsDe = order => [...new Set([order.email, order.emailOriginal].filter(Boolean).map(e => String(e).toLowerCase()))];
const esDelPedido = (p, order) => Boolean(p) && String(p.orderId || '').startsWith(`${order.id}:`);

async function recorrer(order, cambiar) {
  let compras = 0;
  for (const email of emailsDe(order)) {
    const list = await getPurchases(email);
    let tocadas = 0;
    const nueva = list.map(p => {
      if (!esDelPedido(p, order)) return p;
      const q = cambiar(p);
      if (q !== p) tocadas++;
      return q;
    });
    if (tocadas) { await setPurchases(email, nueva); compras += tocadas; }
  }
  return compras;
}

export async function marcarContracargo(order, { por }) {
  const at = new Date().toISOString();
  const compras = await recorrer(order, p => p.refunded
    ? p   // ya estaba marcada (por esto o por otra cosa): no se pisa
    : { ...p, refunded: true, refundReason: MOTIVO, refundedAt: at, refundedBy: por });
  order.contracargo = { motivo: MOTIVO, at, por };
  order.contracargoLog = [...(order.contracargoLog || []), { accion: 'marcar', at, por }].slice(-20);
  await kvSet(orderKey(order.id), order, TTL_PEDIDO);
  return { compras, order };
}

export async function deshacerContracargo(order, { por }) {
  const at = new Date().toISOString();
  /* solo se sacan las marcas de contracargo; otra marca (un reintegro) queda */
  const compras = await recorrer(order, p => {
    if (!p.refunded || p.refundReason !== MOTIVO) return p;
    const { refunded, refundReason, refundedAt, refundedBy, ...resto } = p;
    return resto;
  });
  order.contracargo = null;
  order.contracargoLog = [...(order.contracargoLog || []), { accion: 'deshacer', at, por }].slice(-20);
  await kvSet(orderKey(order.id), order, TTL_PEDIDO);
  return { compras, order };
}

/* Lo que el panel muestra antes de confirmar. */
export const resumenPedido = order => ({
  id: order.id, email: order.email, emailOriginal: order.emailOriginal || null,
  via: order.via, status: order.status, fecha: order.paidAt || order.date,
  ars: order.ars || 0, usd: order.usd || 0,
  items: (order.items || []).map(i => ({ id: i.id, code: i.code, name: i.name })),
  contracargo: order.contracargo || null,
});
