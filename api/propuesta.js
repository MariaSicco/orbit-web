/* Propuestas online del Cotizador Pro.
   POST {p}               → crea:     { id, key }   (key = clave para editar y ver estado, queda en el dispositivo)
   POST {p, id, key}      → actualiza la misma propuesta
   GET  ?id=…             → propuesta pública (suma una vista)
   GET  ?id=…&key=…       → estado para el profesional (vistas y aceptación), sin sumar vista
   POST ?accept=1 {id, name, option} → el cliente acepta; se avisa por mail al profesional */
import { randomBytes, createHash } from 'node:crypto';
import { kvGet, kvSet } from './_lib/kv.js';
import { readBody, isEmail } from './_lib/auth.js';
import { sendEmail, emailReady, layout, it } from './_lib/email.js';

const TTL = 60 * 60 * 24 * 365;                 // un año
const MAX = 900 * 1024;                          // ~900 KB por propuesta (logo incluido)
const key = id => `orbit:prop:${id}`;
const hash = k => createHash('sha256').update(String(k)).digest('hex');
const THEMES = ['minimal', 'editorial', 'bold', 'dark'];
const SITE = () => process.env.SITE_URL || 'https://www.orbitando.com.ar';

/* limpia lo que viene del navegador: solo texto, números y un logo de imagen */
function clean(p) {
  if (!p || typeof p !== 'object') return null;
  const s = JSON.parse(JSON.stringify(p));
  s.theme = THEMES.includes(s.theme) ? s.theme : 'minimal';
  s.color = /^#[0-9a-f]{3,8}$/i.test(s.color || '') ? s.color : '#3047FF';
  s.lang = ['es', 'en', 'pt'].includes(s.lang) ? s.lang : 'es';
  s.cur = /^[A-Z]{3}$/.test(s.cur || '') ? s.cur : 'USD';
  s.biz = s.biz || {};
  if (s.biz.logo && !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(s.biz.logo)) s.biz.logo = '';
  /* fotos: solo las que ya subimos nosotros (sin la copia local en base64) */
  s.biz.photos = (Array.isArray(s.biz.photos) ? s.biz.photos : []).map(ph => ph && /^\/api\/propuesta\?img=[a-z0-9]{6,24}$/.test(ph.u || '') ? { u: ph.u } : null).filter(Boolean).slice(0, 8);
  s.coverIdx = Math.max(0, Math.min(s.biz.photos.length - 1, parseInt(s.coverIdx, 10) || 0));
  delete s.pub;
  return s;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const q = req.query || {};

  if (req.method === 'GET' && q.img) {
    const im = await kvGet(`orbit:pimg:${String(q.img).replace(/[^a-z0-9]/g, '')}`);
    if (!im) return res.status(404).end();
    const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(im);
    if (!m) return res.status(404).end();
    res.setHeader('Content-Type', m[1]);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    return res.status(200).end(Buffer.from(m[2], 'base64'));
  }
  if (req.method === 'GET') {
    const id = String(q.id || '').replace(/[^a-z0-9]/gi, '');
    const rec = id && await kvGet(key(id));
    if (!rec) return res.status(404).json({ error: 'not_found' });
    if (q.key) {
      if (hash(q.key) !== rec.kh) return res.status(403).json({ error: 'forbidden' });
      return res.status(200).json({ views: rec.views || 0, accepted: rec.accepted || null, updatedAt: rec.updatedAt });
    }
    rec.views = (rec.views || 0) + 1; rec.lastView = new Date().toISOString();
    await kvSet(key(id), rec, TTL);
    return res.status(200).json({ p: rec.p, accepted: rec.accepted ? { name: rec.accepted.name, option: rec.accepted.option, sig: rec.accepted.sig || '', at: rec.accepted.at } : null });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const body = await readBody(req);

  /* foto del portfolio (ya comprimida en el navegador) */
  if (q.img) {
    const data = String(body.data || '');
    if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(data)) return res.status(400).json({ error: 'invalid' });
    if (data.length > 520 * 1024) return res.status(413).json({ error: 'too_big' });
    const iid = randomBytes(8).toString('hex');
    await kvSet(`orbit:pimg:${iid}`, data, TTL);
    return res.status(200).json({ u: `/api/propuesta?img=${iid}` });
  }

  if (q.accept) {
    const id = String(body.id || '').replace(/[^a-z0-9]/gi, '');
    const name = String(body.name || '').trim().slice(0, 120);
    const option = String(body.option || '').trim().slice(0, 120);
    const sig = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(body.sig || '') && body.sig.length < 160000 ? body.sig : '';
    if (!id || name.length < 2) return res.status(400).json({ error: 'invalid' });
    const rec = await kvGet(key(id));
    if (!rec) return res.status(404).json({ error: 'not_found' });
    if (rec.accepted) return res.status(200).json({ ok: true, accepted: rec.accepted, already: true });
    rec.accepted = { name, option, sig, at: new Date().toISOString() };
    await kvSet(key(id), rec, TTL);
    const mail = rec.p?.biz?.mail;
    if (mail && isEmail(mail) && emailReady()) {
      const e = s => String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
      try {
        await sendEmail({
          to: mail,
          subject: `Aceptaron tu propuesta: ${rec.p.proj || ''}`.trim(),
          text: `${name} aceptó la propuesta "${rec.p.proj || ''}"${option ? ` (opción: ${option})` : ''}.\n\nVer la propuesta: ${SITE()}/propuesta/${id}\n\nTe recomendamos escribirle para coordinar la seña.`,
          html: layout({
            accent: 'acid', eyebrow: 'Cotizador Pro · Orbit', title: `¡${it('Aceptada!', '#D9FF45')}`,
            body: `<p style="margin:0 0 12px"><b>${e(name)}</b> aceptó la propuesta <b>${e(rec.p.proj)}</b>${option ? ` y eligió <b>${e(option)}</b>` : ''}.</p>${sig ? '<p style="margin:0 0 12px">Firmó la propuesta en línea.</p>' : ''}<p style="margin:0">Buen momento para escribirle y coordinar la seña.</p>`,
            cta: 'Ver la propuesta →', ctaUrl: `${SITE()}/propuesta/${id}`,
            foot: 'Te llega este aviso porque creaste esta propuesta con el Cotizador Pro de Orbit.',
          }),
        });
      } catch (err) { /* el aviso es un extra: la aceptación ya quedó guardada */ }
    }
    return res.status(200).json({ ok: true, accepted: rec.accepted });
  }

  const p = clean(body.p);
  if (!p) return res.status(400).json({ error: 'invalid' });
  if (JSON.stringify(p).length > MAX) return res.status(413).json({ error: 'too_big' });

  if (body.id && body.key) {
    const id = String(body.id).replace(/[^a-z0-9]/gi, '');
    const rec = await kvGet(key(id));
    if (rec && hash(body.key) === rec.kh) {
      rec.p = p; rec.updatedAt = new Date().toISOString();
      await kvSet(key(id), rec, TTL);
      return res.status(200).json({ id, key: body.key, updated: true });
    }
  }
  const id = randomBytes(6).toString('base64url').replace(/[^a-z0-9]/gi, '').slice(0, 8).toLowerCase() + randomBytes(2).toString('hex');
  const k = randomBytes(18).toString('base64url');
  await kvSet(key(id), { p, kh: hash(k), views: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, TTL);
  res.status(200).json({ id, key: k });
}
