/* Vencimientos de la Casa: corre una vez por día (vercel.json → crons, 12:00 UTC = 9:00 de
   Argentina). A cada cuenta con avisos le manda lo que vence en los días que eligió (3 días
   antes, el mismo día…), agrupado por día. Sin montos. Nunca repite un aviso (sent por tag). */
import { kvKeys, kvMGet } from '../_lib/kv.js';
import { mandarPush, guardarAvisos, hoyAR, avisosDeHoy, limpiarItems, limpiarDias } from '../_lib/vencimientos-avisos.js';

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret && process.env.VERCEL_ENV === 'production') return res.status(401).json({ error: 'falta CRON_SECRET' });
  const ok = secret ? req.headers.authorization === `Bearer ${secret}` : /vercel-cron/i.test(req.headers['user-agent'] || '');
  if (!ok) return res.status(401).json({ error: 'unauthorized' });

  const hoy = String(req.query?.hoy || '').match(/^\d{4}-\d{2}-\d{2}$/) && !process.env.VERCEL_ENV?.startsWith('prod') ? req.query.hoy : hoyAR();
  const todas = (await kvMGet(await kvKeys('orbit:vencimientos:avisos:*'))).filter(Boolean);
  const out = { cuentas: todas.length, avisos: 0, push: 0, errores: 0 };
  const limite = new Date(Date.parse(hoy) - 30 * 864e5).toISOString().slice(0, 10);
  for (const raw of todas) {
    const email = String(raw.email || '').toLowerCase();
    if (!email || !Array.isArray(raw.subs) || !raw.subs.length) continue;
    const n = { email, subs: raw.subs, items: limpiarItems(raw.items), dias: limpiarDias(raw.dias), sent: raw.sent || {} };
    try {
      const items = avisosDeHoy(n.items, n.dias, hoy).filter(i => !n.sent[i.tag]);
      if (!items.length) continue;
      for (const i of items) { out.push += await mandarPush(n, { title: i.title, body: i.body, url: '/herramientas/vencimientos', tag: i.tag }); out.avisos++; n.sent[i.tag] = hoy; }
      for (const [k, d] of Object.entries(n.sent)) if (d < limite) delete n.sent[k];
      await guardarAvisos(n);
    } catch { out.errores++; }
  }
  res.status(200).json(out);
}
