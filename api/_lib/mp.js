/* Preferencia de pago de Mercado Pago para un pedido ya creado. */
export async function mpPreference(order, site) {
  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) return { error: 'not_configured' };
  const r = await fetch('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: order.items.map(i => ({ id: i.id, title: `Orbit ${i.code} — ${i.name}`, quantity: i.qty, currency_id: 'ARS', unit_price: i.ars })),
      payer: { email: order.email },
      external_reference: order.id,
      metadata: { order_id: order.id, email: order.email },
      back_urls: { success: `${site}/gracias?order=${order.id}`, pending: `${site}/gracias?order=${order.id}&pending=1`, failure: `${site}/productos` },
      auto_return: 'approved',
      notification_url: `${site}/api/webhooks/mercadopago`,
      statement_descriptor: 'ORBIT',
    }),
  });
  const data = await r.json();
  if (!r.ok) return { error: 'mp_error', detail: data };
  return { url: data.init_point || data.sandbox_init_point };
}
