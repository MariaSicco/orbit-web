/* Pedidos que quedaron sin pagar: un solo recordatorio por pedido, entre
   1 hora y 3 días después de crearlo. Corre una vez por día con el cron.
   No escribe a pedidos de prueba (@orbitando.com.ar) ni a quien ya compró
   esos productos después. */
import { createHmac } from 'node:crypto';
import { isAdmin } from './admin.js';
import { kvKeys, kvMGet, kvSet, getPurchases } from './kv.js';
import { sendEmail, emailReady, layout, it } from './email.js';

const H = 3600e3;
const SITE = () => process.env.SITE_URL || 'https://www.orbitando.com.ar';
export const resumeToken = id => createHmac('sha256', process.env.SESSION_SECRET || 'orbit-leads').update(`retomar|${id}`).digest('base64url').slice(0, 24);

export async function sweepPending(now = Date.now()) {
  const out = { revisados: 0, enviados: 0, saltados: 0, errores: 0 };
  if (!emailReady()) return { ...out, nota: 'sin servicio de email' };
  const keys = await kvKeys('orbit:order:*');
  const orders = (await kvMGet(keys)).filter(Boolean);
  for (const o of orders) {
    if (o.status === 'paid' || o.recordatorio) continue;
    const age = now - new Date(o.date).getTime();
    if (age < 1 * H || age > 72 * H) continue;
    out.revisados++;
    if (/@orbitando\.com\.ar$/i.test(o.email) || isAdmin(o.email) || o.via !== 'mercadopago') { out.saltados++; continue; }
    const ya = await getPurchases(o.email);
    if (o.items.every(i => ya.some(p => p.productId === i.id))) { out.saltados++; continue; }
    const link = `${SITE()}/api/retomar?o=${o.id}&t=${resumeToken(o.id)}`;
    const total = `ARS ${(o.ars || 0).toLocaleString('es-AR')}`;
    try {
      await sendEmail({
        to: o.email,
        subject: 'Tu pedido quedó sin pagar',
        text: `Empezaste una compra en Orbit y el pago no se completó.\n\n${o.items.map(i => `${i.code} — ${i.name}`).join('\n')}\nTotal: ${total}\n\nTerminá la compra acá: ${link}\n\nSi tuviste un problema con el pago, respondé este mail y lo resolvemos.`,
        html: layout({
          accent: 'blue',
          preheader: 'El pago no se completó. Lo podés terminar desde acá.',
          eyebrow: `Pedido ${o.id} · Sin pagar`,
          title: `Quedó a ${it('un paso.', '#3047FF')}`,
          body: '<p style="margin:0 0 12px">Empezaste una compra en Orbit y el pago no se completó. Tu pedido sigue guardado:</p><p style="margin:0">Si tuviste un problema con Mercado Pago, respondé este mail y lo resolvemos.</p>',
          items: o.items,
          meta: [['Total', total], ['Medio de pago', 'Mercado Pago']],
          cta: 'Terminar la compra →', ctaUrl: link,
          foot: 'Te escribimos una sola vez por este pedido. Apenas pagás, lo descargás desde tu cuenta.',
        }),
      });
      o.recordatorio = new Date().toISOString(); out.enviados++;
    } catch (e) { o.recordatorio = 'error: ' + String(e).slice(0, 120); out.errores++; }
    await kvSet(`orbit:order:${o.id}`, o, 60 * 60 * 24 * 30);
  }
  return out;
}
