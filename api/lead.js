/* POST: alguien pide la muestra por mail → se guarda, sale el mail 1 y se suma a Brevo.
   GET ?baja=1: link de baja firmado de los mails de la secuencia. */
import { isEmail, readBody, cleanEmail } from './_lib/auth.js';
import { kvGet, kvSet } from './_lib/kv.js';
import { readAttr } from './_lib/orders.js';
import { SEQ, saveLead, advance, leadKey, unsubToken } from './_lib/leads.js';
import { upsertContact } from './_lib/marketing.js';

const page = (title, body) => `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · Orbit</title>
<style>body{margin:0;background:#0D0D0E;color:#F2EFE8;font-family:Helvetica,Arial,sans-serif;display:grid;place-items:center;min-height:100vh;padding:24px;box-sizing:border-box}main{max-width:460px}h1{text-transform:uppercase;font-size:30px;letter-spacing:-1px;margin:0 0 12px}p{color:#B4B0A8;line-height:1.6}a{color:#D9FF45}</style></head>
<body><main><h1>${title}</h1><p>${body}</p><p><a href="/">orbitando.com.ar</a></p></main></body></html>`;

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const { baja, e, p, t } = req.query || {};
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    if (!baja || !e || !p || t !== unsubToken(String(e), String(p))) return res.status(400).send(page('Link inválido', 'Escribinos a hola@orbitando.com.ar y te damos de baja a mano.'));
    const k = leadKey(String(e), String(p)), lead = await kvGet(k);
    if (lead) { lead.unsub = new Date().toISOString(); await kvSet(k, lead, 60 * 60 * 24 * 120); }
    return res.status(200).send(page('Listo', 'No te vamos a mandar más mails sobre este producto.'));
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const body = await readBody(req);
  const email = cleanEmail(body?.email), prod = String(body?.prod || '');
  if (!isEmail(email)) return res.status(400).json({ error: 'invalid_email' });
  if (!SEQ[prod]) return res.status(400).json({ error: 'unknown_product' });

  const { lead, nuevo } = await saveLead({ email, prod, ...readAttr(body) });
  let mail = 'ya enviado';
  if (nuevo || lead.step < 1) mail = await advance(lead, 1);
  await upsertContact({
    email,
    lists: (process.env.BREVO_LIST_LEADS || '5')  /* lista "Leads muestras" en Brevo */.split(',').filter(Boolean),
    attributes: { LEAD_PRODUCTO: SEQ[prod].name, LEAD_FECHA: lead.createdAt.slice(0, 10) },
  }).catch(() => null);
  res.status(200).json({ ok: true, mail, sample: SEQ[prod].sample });
}
