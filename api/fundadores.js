/* Programa Fundadores.
   GET                → { max, left } (público, sin datos de nadie)
   GET ?e=&t=         → { n, pedido } si el link firmado es válido
   POST {e,t,...}     → guarda el pedido de herramienta
   GET  ?admin=1      → lista completa (solo administración)
   POST ?invite=1 {email} → manda o reenvía la invitación (solo administración) */
import { readBody } from './_lib/auth.js';
import { requireAdmin } from './_lib/admin.js';
import { MAX, listFounders, founderOf, founderToken, sendInvite, markInvited, getRequest, saveRequest } from './_lib/founders.js';

const clip = (v, n) => String(v || '').trim().slice(0, n);

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const q = req.query || {};

  if (req.method === 'GET' && q.admin) {
    if (!requireAdmin(req, res)) return;
    const list = await listFounders();
    const out = await Promise.all(list.map(async f => ({ ...f, req: await getRequest(f.email) })));
    return res.status(200).json({ max: MAX, founders: out });
  }
  if (req.method === 'POST' && q.invite) {
    if (!requireAdmin(req, res)) return;
    const body = await readBody(req);
    const f = await founderOf(body?.email);
    if (!f) return res.status(404).json({ error: 'not_found' });
    const r = await sendInvite(f); await markInvited(f.email, r);
    return res.status(200).json({ ok: !String(r).startsWith('error'), invited: r });
  }
  if (req.method === 'GET') {
    if (q.e) {
      const e = String(q.e).toLowerCase();
      if (q.t !== founderToken(e)) return res.status(403).json({ error: 'invalid_link' });
      const f = await founderOf(e);
      if (!f) return res.status(404).json({ error: 'not_founder' });
      return res.status(200).json({ n: f.n, max: MAX, pedido: Boolean(await getRequest(e)) });
    }
    const list = await listFounders();
    return res.status(200).json({ max: MAX, left: Math.max(0, MAX - list.length) });
  }
  if (req.method === 'POST') {
    const b = await readBody(req);
    const e = String(b?.e || '').toLowerCase();
    if (b?.t !== founderToken(e)) return res.status(403).json({ error: 'invalid_link' });
    const f = await founderOf(e);
    if (!f) return res.status(404).json({ error: 'not_founder' });
    const data = {
      rubro: clip(b.rubro, 120), problema: clip(b.problema, 1500), hoy: clip(b.hoy, 300),
      formato: clip(b.formato, 60), wa: clip(b.wa, 40), mostrar: Boolean(b.mostrar),
    };
    if (data.problema.length < 15) return res.status(400).json({ error: 'need_problem' });
    await saveRequest(f, data);
    return res.status(200).json({ ok: true });
  }
  res.status(405).json({ error: 'method_not_allowed' });
}
