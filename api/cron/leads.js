/* Corre una vez por día (vercel.json → crons) y manda el mail 2 o 3 de la
   secuencia a quien le toque. Se corta si compró o se dio de baja. */
import { kvKeys, kvMGet, kvSet } from '../_lib/kv.js';
import { dueStep, advance, bought, leadKey } from '../_lib/leads.js';

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  const ok = secret ? req.headers.authorization === `Bearer ${secret}` : /vercel-cron/i.test(req.headers['user-agent'] || '');
  if (!ok) return res.status(401).json({ error: 'unauthorized' });

  const keys = await kvKeys('orbit:lead:*');
  const leads = (await kvMGet(keys)).filter(Boolean);
  const out = { revisados: leads.length, enviados: 0, compraron: 0, errores: 0 };
  for (const lead of leads) {
    const step = dueStep(lead);
    if (!step) continue;
    if (await bought(lead)) { lead.step = 3; lead.compro = new Date().toISOString(); await kvSet(leadKey(lead.email, lead.prod), lead, 60 * 60 * 24 * 120); out.compraron++; continue; }
    const r = await advance(lead, step);
    if (r === 'ok') out.enviados++; else out.errores++;
  }
  res.status(200).json(out);
}
