/* Marca (o desmarca) un pedido pagado como contracargo y corta el acceso a
   sus herramientas. Solo administración y siempre a mano: los webhooks de
   Mercado Pago y PayPal no lo disparan.
   POST { orderId, accion: 'ver' }                       → resumen para confirmar
   POST { orderId, accion: 'marcar'|'deshacer', confirmar: orderId } */
import { requireAdmin } from '../_lib/admin.js';
import { readBody } from '../_lib/auth.js';
import { getOrder } from '../_lib/orders.js';
import { marcarContracargo, deshacerContracargo, resumenPedido } from '../_lib/contracargo.js';

export default async function handler(req, res) {
  const s = requireAdmin(req, res); if (!s) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  res.setHeader('Cache-Control', 'no-store');

  const body = await readBody(req);
  const orderId = String(body.orderId || '').trim().toUpperCase();
  const accion = String(body.accion || '');
  if (!/^OB[0-9A-F]{6,24}$/.test(orderId)) return res.status(400).json({ error: 'pedido_invalido' });
  if (!['ver', 'marcar', 'deshacer'].includes(accion)) return res.status(400).json({ error: 'accion_invalida' });

  const order = await getOrder(orderId);
  if (!order) return res.status(404).json({ error: 'pedido_desconocido' });
  if (accion === 'ver') return res.status(200).json({ ok: true, pedido: resumenPedido(order) });

  if (order.status !== 'paid') return res.status(400).json({ error: 'pedido_no_pagado' });
  /* confirmación explícita: el panel la manda solo después del "¿seguro?" */
  if (String(body.confirmar || '').trim().toUpperCase() !== orderId) return res.status(400).json({ error: 'falta_confirmar' });

  if (accion === 'marcar') {
    if (order.contracargo) return res.status(409).json({ error: 'ya_marcado', pedido: resumenPedido(order) });
    const r = await marcarContracargo(order, { por: s.email });
    return res.status(200).json({ ok: true, compras: r.compras, pedido: resumenPedido(r.order) });
  }
  if (!order.contracargo) return res.status(409).json({ error: 'no_marcado', pedido: resumenPedido(order) });
  const r = await deshacerContracargo(order, { por: s.email });
  return res.status(200).json({ ok: true, compras: r.compras, pedido: resumenPedido(r.order) });
}
