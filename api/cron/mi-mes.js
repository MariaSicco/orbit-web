/* Mi Mes by Orbit: corre una vez por día (vercel.json → crons, 13:00 UTC =
   10:00 de Argentina). A cada cuenta con avisos le manda lo que toca hoy:
   cerró el resumen, vence en 3 días / mañana / hoy y dólares (5 días
   antes). Sin montos. Nunca repite un aviso (sent por tag). */
import { kvKeys, kvMGet } from '../_lib/kv.js';
import { mandarPush, guardarAvisos, hoyAR } from '../_lib/mi-mes-avisos.js';
import { avisosPushDeHoy, limpiarTarjetasAvisos } from '../_herramientas/mi-mes/calculos.js';

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  const ok = secret ? req.headers.authorization === `Bearer ${secret}` : /vercel-cron/i.test(req.headers['user-agent'] || '');
  if (!ok) return res.status(401).json({ error: 'unauthorized' });

  const hoy = String(req.query?.hoy || '').match(/^\d{4}-\d{2}-\d{2}$/) && !process.env.VERCEL_ENV?.startsWith('prod') ? req.query.hoy : hoyAR();
  const claves = await kvKeys('orbit:mi-mes:avisos:*');
  const todas = (await kvMGet(claves)).filter(Boolean);
  const out = { cuentas: todas.length, avisos: 0, push: 0, errores: 0 };
  const limite = new Date(Date.parse(hoy) - 60 * 864e5).toISOString().slice(0, 10);
  for (const raw of todas) {
    const email = String(raw.email || '').toLowerCase();
    if (!email || !Array.isArray(raw.subs) || !raw.subs.length) continue;
    const n = { email, subs: raw.subs, tarjetas: limpiarTarjetasAvisos(raw.tarjetas), sent: raw.sent || {} };
    try {
      const items = avisosPushDeHoy(n.tarjetas, hoy).filter(i => !n.sent[i.tag]);
      if (!items.length) continue;
      for (const i of items) { out.push += await mandarPush(n, { title: i.title, body: i.body, url: '/herramientas/mi-mes', tag: i.tag }); out.avisos++; }
      for (const i of items) n.sent[i.tag] = hoy;
      for (const [k, d] of Object.entries(n.sent)) if (d < limite) delete n.sent[k];
      await guardarAvisos(n);
    } catch { out.errores++; }
  }
  res.status(200).json(out);
}
