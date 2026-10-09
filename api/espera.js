/* POST: lista de espera del Drop 01 (microapps, 19.10) y problemas que manda la gente
   desde la home ("¿Qué te molesta de tu día a día?").
   body: { origen: 'drop01' | 'problema', email?, idea? }
   Se guarda en KV y, si hay email, se suma a Brevo (lista BREVO_LIST_ESPERA). */
import { isEmail, readBody, cleanEmail } from './_lib/auth.js';
import { kvGet, kvSet } from './_lib/kv.js';
import { readAttr } from './_lib/orders.js';
import { upsertContact } from './_lib/marketing.js';

const ORIGENES = new Set(['drop01', 'problema']);
const UN_ANIO = 60 * 60 * 24 * 365;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  const body = await readBody(req);
  const origen = String(body?.origen || '');
  if (!ORIGENES.has(origen)) return res.status(400).json({ error: 'unknown_origin' });

  const email = cleanEmail(body?.email);
  const idea = String(body?.idea || '').replace(/\s+/g, ' ').trim().slice(0, 600);
  if (origen === 'drop01' && !isEmail(email)) return res.status(400).json({ error: 'invalid_email' });
  if (origen === 'problema' && idea.length < 4) return res.status(400).json({ error: 'missing_idea' });
  if (email && !isEmail(email)) return res.status(400).json({ error: 'invalid_email' });

  const ahora = new Date().toISOString();
  const attr = readAttr(body);
  if (origen === 'drop01') {
    /* uno por email: si se anota dos veces no se duplica */
    const k = `orbit:espera:drop01:${email}`;
    const previo = await kvGet(k);
    await kvSet(k, { email, origen, createdAt: previo?.createdAt || ahora, updatedAt: ahora, ...attr }, UN_ANIO);
  } else {
    const k = `orbit:idea:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
    await kvSet(k, { idea, email: email || null, origen, createdAt: ahora, ...attr }, UN_ANIO);
  }

  if (email) {
    await upsertContact({
      email,
      lists: (process.env.BREVO_LIST_ESPERA || '').split(',').filter(Boolean),
      attributes: { ESPERA_ORIGEN: origen, ESPERA_FECHA: ahora.slice(0, 10) },
    }).catch(() => null);
  }
  res.status(200).json({ ok: true });
}
