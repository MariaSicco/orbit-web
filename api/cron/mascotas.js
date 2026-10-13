/* Mimitos: corre una vez por día (vercel.json → crons, 9:00 de Argentina).
   A cada cuenta con avisos le manda lo que toca hoy: vacunas y pipetas (3 días antes y el día),
   alimento (5 días antes y el día) y el chequeo del mes. Nunca repite un aviso.
   Solo avisa a quien tiene la compra de Mimitos. */
import { kvKeys, kvMGet, kvGet } from '../_lib/kv.js';
import { dueToday, pushTo, mailDigest, saveNotify, todayAR, hasMimitos } from '../_lib/petpush.js';

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  const ok = secret ? req.headers.authorization === `Bearer ${secret}` : /vercel-cron/i.test(req.headers['user-agent'] || '');
  if (!ok) return res.status(401).json({ error: 'unauthorized' });

  const today = String(req.query?.hoy || '').match(/^\d{4}-\d{2}-\d{2}$/) && !process.env.VERCEL_ENV?.startsWith('prod') ? req.query.hoy : todayAR();
  const keys = await kvKeys('orbit:petnotify:*');
  const all = (await kvMGet(keys)).filter(Boolean);
  const out = { cuentas: all.length, push: 0, mails: 0, sinCompra: 0, errores: 0 };
  for (const raw of all) {
    const email = String(raw.email || '').toLowerCase();
    if (!email) continue;
    const n = { email, subs: raw.subs || [], mail: Boolean(raw.mail), off: raw.off || {}, sent: raw.sent || {} };
    if (!n.subs.length && !n.mail) continue;
    try {
      if (!(await hasMimitos(email))) { out.sinCompra++; continue; }
      const doc = await kvGet(`orbit:pets:${email}`);
      const items = dueToday(doc, today).filter(i => !n.off[i.kind] && !n.sent[i.tag]);
      if (!items.length) continue;
      for (const i of items) out.push += await pushTo(n, { title: i.title, body: i.body, url: '/mascotas', tag: i.tag });
      if (n.mail && await mailDigest(email, items)) out.mails++;
      for (const i of items) n.sent[i.tag] = today;
      /* lo enviado hace más de 60 días ya no hace falta recordarlo */
      for (const [k, d] of Object.entries(n.sent)) if (d < new Date(Date.parse(today) - 60 * 864e5).toISOString().slice(0, 10)) delete n.sent[k];
      await saveNotify(n);
    } catch { out.errores++; }
  }
  res.status(200).json(out);
}
