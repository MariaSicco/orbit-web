/* Informe del negocio: personas, pedidos, ingresos y productos.
   Se arma recorriendo la base, sin índices que mantener. */
import { requireAdmin } from '../_lib/admin.js';
import { kvKeys, kvMGet } from '../_lib/kv.js';
import { getCatalog } from '../_lib/catalog.js';

const days = (iso, n) => iso && Date.now() - new Date(iso).getTime() < n * 86400000;

export default async function handler(req, res) {
  const s = requireAdmin(req, res); if (!s) return;

  const [userKeys, orderKeys, CAT] = await Promise.all([
    kvKeys('orbit:user:*'), kvKeys('orbit:order:*'), getCatalog(),
  ]);
  const [users, orders] = await Promise.all([kvMGet(userKeys), kvMGet(orderKeys)]);

  const gente = users.filter(Boolean);
  const pedidos = orders.filter(Boolean).sort((a, b) => new Date(b.paidAt || b.date) - new Date(a.paidAt || a.date));
  const pagados = pedidos.filter(p => p.status === 'paid');

  /* ventas por producto */
  const porProducto = {};
  for (const o of pagados) for (const i of o.items || []) {
    const r = porProducto[i.id] || (porProducto[i.id] = { id: i.id, code: i.code, name: i.name, unidades: 0, ars: 0, usd: 0 });
    r.unidades += i.qty || 1;
    if (o.via === 'paypal') r.usd += (i.usd || 0) * (i.qty || 1); else r.ars += (i.ars || 0) * (i.qty || 1);
  }

  res.status(200).json({
    generado: new Date().toISOString(),
    gente: {
      total: gente.length,
      conContrasena: gente.filter(u => u.hash).length,
      novedades: gente.filter(u => u.news).length,
      nuevos7: gente.filter(u => days(u.createdAt, 7)).length,
      nuevos30: gente.filter(u => days(u.createdAt, 30)).length,
      compradores: new Set(pagados.map(o => o.email)).size,
    },
    pedidos: {
      total: pedidos.length,
      pagados: pagados.length,
      pendientes: pedidos.length - pagados.length,
      ultimos30: pagados.filter(o => days(o.paidAt, 30)).length,
    },
    ingresos: {
      ars: pagados.filter(o => o.via !== 'paypal').reduce((a, o) => a + (o.ars || 0), 0),
      usd: pagados.filter(o => o.via === 'paypal').reduce((a, o) => a + (o.usd || 0), 0),
      ars30: pagados.filter(o => o.via !== 'paypal' && days(o.paidAt, 30)).reduce((a, o) => a + (o.ars || 0), 0),
      usd30: pagados.filter(o => o.via === 'paypal' && days(o.paidAt, 30)).reduce((a, o) => a + (o.usd || 0), 0),
      ticketArs: pagados.filter(o => o.via !== 'paypal').length
        ? Math.round(pagados.filter(o => o.via !== 'paypal').reduce((a, o) => a + (o.ars || 0), 0) / pagados.filter(o => o.via !== 'paypal').length) : 0,
    },
    productos: Object.entries(CAT).map(([id, p]) => {
      const v = porProducto[id] || {};
      return { id, code: p.code, name: p.name, usd: p.usd, ars: p.ars, soon: Boolean(p.soon), archivo: p.fileFrom, unidades: v.unidades || 0, ars_vendido: v.ars || 0, usd_vendido: v.usd || 0 };
    }).sort((a, b) => b.unidades - a.unidades),
    ultimaGente: gente
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
      .slice(0, 25)
      .map(u => ({ email: u.email, name: u.name || '', createdAt: u.createdAt || null, news: Boolean(u.news), conClave: Boolean(u.hash) })),
    ultimosPedidos: pedidos.slice(0, 25).map(o => ({
      id: o.id, email: o.email, via: o.via, status: o.status,
      fecha: o.paidAt || o.date, ars: o.ars || 0, usd: o.usd || 0,
      items: (o.items || []).map(i => ({ code: i.code, name: i.name, qty: i.qty || 1 })),
    })),
  });
}
