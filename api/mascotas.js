/* Libreta de tu Mascota (microapp del Drop 01).
   Los datos viven en la cuenta de Orbit, no en el navegador: así no se
   pierden si el celular borra el almacenamiento del sitio.

   GET                      → { access, doc } de la persona con sesión (401 sin sesión)
   POST {doc, rev}          → guarda la libreta. Si otro dispositivo guardó antes, 409 con la versión nueva
   POST ?photo=1 {data}     → sube la foto (ya comprimida en el navegador) → { u }
   POST ?share=1 {petId}    → crea (o devuelve) el link público de una mascota → { token }
   POST ?unshare=1 {petId}  → apaga el link público
   GET  ?s=token            → ficha pública de esa mascota (para el veterinario, el paseador o el QR del collar)
   GET  ?img=id             → la foto */
import { randomBytes } from 'node:crypto';
import { kvGet, kvSet, kvDel, getPurchases } from './_lib/kv.js';
import { readSession, readBody } from './_lib/auth.js';
import { isAdmin } from './_lib/admin.js';

export const PRODUCT_ID = process.env.MASCOTAS_PRODUCT_ID || 'ob-018';
const docKey = email => `orbit:pets:${email.toLowerCase()}`;
const shareKey = t => `orbit:petshare:${t}`;
const imgKey = id => `orbit:petimg:${id}`;
const MAX_DOC = 400 * 1024;
const MAX_IMG = 220 * 1024;
const MAX_PETS = 12, MAX_RECS = 300;

const str = (v, n = 120) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
const day = v => /^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : '';
const id = v => /^[a-z0-9]{4,24}$/i.test(v || '') ? v : randomBytes(6).toString('hex');
const TYPES = ['vacuna', 'desparasitacion', 'control', 'otro'];
const SPECIES = ['perro', 'gato', 'otra'];

/* limpia lo que viene del navegador: solo los campos que la app usa */
export function cleanDoc(d) {
  const pets = (Array.isArray(d?.pets) ? d.pets : []).slice(0, MAX_PETS).map(p => {
    const w = parseFloat(String(p?.weight ?? '').replace(',', '.'));
    return {
      id: id(p?.id),
      name: str(p?.name, 60) || 'Sin nombre',
      species: SPECIES.includes(p?.species) ? p.species : 'otra',
      speciesOther: str(p?.speciesOther, 40),
      breed: str(p?.breed, 60),
      sex: ['m', 'h'].includes(p?.sex) ? p.sex : '',
      birth: day(p?.birth),
      color: str(p?.color, 60),
      chip: str(p?.chip, 40),
      weight: Number.isFinite(w) && w > 0 && w < 2000 ? Math.round(w * 100) / 100 : null,
      photo: /^\/api\/mascotas\?img=[a-f0-9]{8,32}$/.test(p?.photo || '') ? p.photo : '',
      notes: str(p?.notes, 600),
      contact: {
        show: Boolean(p?.contact?.show),
        name: str(p?.contact?.name, 60),
        phone: str(p?.contact?.phone, 40),
        note: str(p?.contact?.note, 200),
      },
      share: /^[A-Za-z0-9_-]{10,40}$/.test(p?.share || '') ? p.share : '',
      records: (Array.isArray(p?.records) ? p.records : []).slice(0, MAX_RECS).map(r => ({
        id: id(r?.id),
        type: TYPES.includes(r?.type) ? r.type : 'otro',
        name: str(r?.name, 80),
        date: day(r?.date),
        next: day(r?.next),
        vet: str(r?.vet, 80),
        notes: str(r?.notes, 300),
      })).filter(r => r.name || r.date || r.next),
    };
  });
  return { pets };
}

/* lo que ve quien abre el link: sin notas privadas ni datos de contacto si están apagados */
export function publicPet(p) {
  return {
    name: p.name, species: p.species, speciesOther: p.speciesOther, breed: p.breed, sex: p.sex,
    birth: p.birth, color: p.color, chip: p.chip, weight: p.weight, photo: p.photo,
    contact: p.contact?.show ? { name: p.contact.name, phone: p.contact.phone, note: p.contact.note } : null,
    records: p.records.map(r => ({ type: r.type, name: r.name, date: r.date, next: r.next, vet: r.vet })),
  };
}

async function access(email) {
  if (isAdmin(email)) return 'full';
  const list = await getPurchases(email);
  return list.some(p => p.productId === PRODUCT_ID) ? 'full' : 'none';
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const q = req.query || {};

  /* foto: id aleatorio, se puede ver sin sesión (la usa la ficha pública) */
  if (req.method === 'GET' && q.img) {
    const im = await kvGet(imgKey(String(q.img).replace(/[^a-f0-9]/g, '')));
    const m = im && /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(im);
    if (!m) return res.status(404).end();
    res.setHeader('Content-Type', m[1]);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    return res.status(200).end(Buffer.from(m[2], 'base64'));
  }

  /* ficha pública */
  if (req.method === 'GET' && q.s) {
    const t = String(q.s).replace(/[^A-Za-z0-9_-]/g, '');
    const link = t && await kvGet(shareKey(t));
    const doc = link && await kvGet(docKey(link.email));
    const pet = doc?.pets?.find(p => p.id === link.petId && p.share === t);
    if (!pet) return res.status(404).json({ error: 'not_found' });
    return res.status(200).json({ pet: publicPet(pet), updatedAt: doc.updatedAt || null });
  }

  const s = readSession(req);
  if (!s) return res.status(401).json({ error: 'unauthorized' });
  const acc = await access(s.email);

  if (req.method === 'GET') {
    if (acc !== 'full') return res.status(200).json({ access: acc, email: s.email });
    const doc = (await kvGet(docKey(s.email))) || { pets: [], rev: 0 };
    return res.status(200).json({ access: acc, email: s.email, doc });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  if (acc !== 'full') return res.status(403).json({ error: 'not_purchased' });
  const body = await readBody(req);

  if (q.photo) {
    const data = String(body.data || '');
    if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(data)) return res.status(400).json({ error: 'invalid' });
    if (data.length > MAX_IMG) return res.status(413).json({ error: 'too_big' });
    const iid = randomBytes(10).toString('hex');
    await kvSet(imgKey(iid), data);
    return res.status(200).json({ u: `/api/mascotas?img=${iid}` });
  }

  const current = (await kvGet(docKey(s.email))) || { pets: [], rev: 0 };

  if (q.share || q.unshare) {
    const pet = current.pets.find(p => p.id === String(body.petId || ''));
    if (!pet) return res.status(404).json({ error: 'not_found' });
    if (q.unshare) {
      if (pet.share) await kvDel(shareKey(pet.share));
      pet.share = '';
    } else if (!pet.share) {
      pet.share = randomBytes(9).toString('base64url');
      await kvSet(shareKey(pet.share), { email: s.email, petId: pet.id });
    }
    current.rev = (current.rev || 0) + 1; current.updatedAt = new Date().toISOString();
    await kvSet(docKey(s.email), current);
    return res.status(200).json({ token: pet.share, doc: current });
  }

  /* guardar la libreta */
  if ((body.rev ?? 0) !== (current.rev || 0)) return res.status(409).json({ error: 'conflict', doc: current });
  const clean = cleanDoc(body.doc);
  /* los links públicos los maneja el servidor: no se pueden inventar desde el navegador */
  for (const p of clean.pets) p.share = current.pets.find(c => c.id === p.id)?.share || '';
  for (const old of current.pets) if (old.share && !clean.pets.some(p => p.id === old.id)) await kvDel(shareKey(old.share));
  const next = { ...clean, rev: (current.rev || 0) + 1, updatedAt: new Date().toISOString() };
  if (JSON.stringify(next).length > MAX_DOC) return res.status(413).json({ error: 'too_big' });
  await kvSet(docKey(s.email), next);
  return res.status(200).json({ ok: true, doc: next });
}
