/* Mimitos: corre una vez por día (vercel.json → crons, 9:00 de Argentina).
   A cada cuenta con avisos le manda lo que toca hoy: vacunas y pipetas (3 días antes y el día),
   alimento (5 días antes y el día) y el chequeo del mes. Nunca repite un aviso.
   Solo avisa a quien tiene la compra de Mimitos. */
import { kvKeys, kvMGet, kvGet } from '../_lib/kv.js';
import { sweepAll } from '../_lib/petfiles.js';
import { dueToday, pushTo, mailDigest, saveNotify, todayAR, hasMimitos } from '../_lib/petpush.js';

export default async function handler(req, res) {
  /* Siempre con Authorization: Bearer ${CRON_SECRET} (Vercel lo manda solo si la variable existe).
     Sin la variable, falla cerrado: no alcanza con el User-Agent, que se falsifica. */
  const secret = process.env.CRON_SECRET;
  if (!secret) { console.error('[mimitos] cron bloqueado: falta CRON_SECRET'); return res.status(503).json({ error: 'cron_secret_no_configurado' }); }
  if (req.headers.authorization !== `Bearer ${secret}`) return res.status(401).json({ error: 'unauthorized' });

  /* ?hoy=AAAA-MM-DD solo para probar fuera de producción (y siempre con el secreto, chequeado arriba) */
  const hoy = String(req.query?.hoy || '');
  const today = /^\d{4}-\d{2}-\d{2}$/.test(hoy) && process.env.VERCEL_ENV !== 'production' ? hoy : todayAR();
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
  /* fotos y estudios borrados que quedaron en la papelera */
  try { out.archivosBorrados = await sweepAll(email => kvGet(`orbit:pets:${email}`)); } catch { out.errores++; }
  res.status(200).json(out);
}
