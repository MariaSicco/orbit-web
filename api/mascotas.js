/* Libreta de tu Mascota (microapp del Drop 01).
   Los datos viven en la cuenta de Orbit, no en el navegador: así no se
   pierden si el celular borra el almacenamiento del sitio.

   Dueña o dueño (con sesión):
   GET                        → { access, doc }
   POST {doc, rev}            → guarda la libreta. Si otro dispositivo guardó antes, 409 con la versión nueva
   POST ?photo=1 {data}       → sube una foto (ya comprimida en el navegador) → { u }
   POST ?share=1 {petId}      → crea (o devuelve) el link público de la ficha
   POST ?unshare=1 {petId}    → apaga el link de la ficha
   POST ?sitter=1 {petId}     → crea (o devuelve) el link del cuidador
   POST ?unsitter=1 {petId}   → apaga el link del cuidador

   Sin sesión:
   GET  ?s=token              → ficha pública (veterinario, paseador, QR del collar)
   GET  ?c=token              → vista del cuidador (instrucciones, medicación y registro del día)
   POST ?c=token {kind,…}     → el cuidador anota "comió", "paseó", "le di la medicación" o una nota
   GET  ?img=id               → una foto */
import { randomBytes } from 'node:crypto';
import { kvGet, kvSet, kvDel, getPurchases } from './_lib/kv.js';
import { readSession, readBody } from './_lib/auth.js';
import { isAdmin } from './_lib/admin.js';

export const PRODUCT_ID = process.env.MASCOTAS_PRODUCT_ID || 'ob-018';
const docKey = email => `orbit:pets:${email.toLowerCase()}`;
const shareKey = t => `orbit:petshare:${t}`;
const sitterKey = t => `orbit:petsitter:${t}`;
const imgKey = id => `orbit:petimg:${id}`;
const MAX_DOC = 700 * 1024;
const MAX_IMG = 220 * 1024;
const MAX_PETS = 12, MAX_RECS = 300, MAX_LOG = 300;

const str = (v, n = 120) => String(v == null ? '' : v).replace(/[\u0000-\u0009\u000b-\u001f]/g, ' ').trim().slice(0, n);
const day = v => /^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : '';
const stamp = v => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$/.test(v || '') ? v : '';
const num = (v, max = 1e9) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) && n >= 0 && n <= max ? Math.round(n * 100) / 100 : null; };
const id = v => /^[a-z0-9]{4,24}$/i.test(v || '') ? v : randomBytes(6).toString('hex');
const tok = v => /^[A-Za-z0-9_-]{10,40}$/.test(v || '') ? v : '';
const photo = v => /^\/api\/mascotas\?img=[a-f0-9]{8,32}$/.test(v || '') ? v : '';
const pick = (v, list, def) => list.includes(v) ? v : def;
const TYPES = ['vacuna', 'desparasitacion', 'control', 'otro'];
const SPECIES = ['perro', 'gato', 'otra'];
const EXP = ['alimento', 'veterinaria', 'salud', 'peluqueria', 'accesorios', 'otros'];
const LOG = ['comida', 'paseo', 'med', 'ok', 'nota'];

function cleanLog(list) {
  return (Array.isArray(list) ? list : []).slice(-MAX_LOG).map(l => ({
    id: id(l?.id), at: stamp(l?.at) || new Date().toISOString(), kind: pick(l?.kind, LOG, 'nota'),
    medId: str(l?.medId, 24), by: str(l?.by, 40), note: str(l?.note, 300),
  }));
}

/* limpia lo que viene del navegador: solo los campos que la app usa */
export function cleanDoc(d) {
  const pets = (Array.isArray(d?.pets) ? d.pets : []).slice(0, MAX_PETS).map(p => ({
    id: id(p?.id),
    name: str(p?.name, 60) || 'Sin nombre',
    species: pick(p?.species, SPECIES, 'otra'),
    speciesOther: str(p?.speciesOther, 40),
    breed: str(p?.breed, 60),
    sex: pick(p?.sex, ['m', 'h'], ''),
    birth: day(p?.birth),
    color: str(p?.color, 80),
    marks: str(p?.marks, 200),
    temper: str(p?.temper, 200),
    chip: str(p?.chip, 40),
    weight: num(p?.weight, 2000),
    allergies: str(p?.allergies, 300),
    photo: photo(p?.photo),
    photos: (Array.isArray(p?.photos) ? p.photos : []).map(photo).filter(Boolean).slice(0, 4),
    notes: str(p?.notes, 600),
    contact: { show: Boolean(p?.contact?.show), name: str(p?.contact?.name, 60), phone: str(p?.contact?.phone, 40), note: str(p?.contact?.note, 200) },
    vet: { name: str(p?.vet?.name, 80), phone: str(p?.vet?.phone, 40), address: str(p?.vet?.address, 120), er: str(p?.vet?.er, 120), erPhone: str(p?.vet?.erPhone, 40) },
    lost: { on: Boolean(p?.lost?.on), since: stamp(p?.lost?.since), place: str(p?.lost?.place, 160), note: str(p?.lost?.note, 300) },
    share: tok(p?.share),
    sitterToken: tok(p?.sitterToken),
    sitter: {
      name: str(p?.sitter?.name, 60), from: day(p?.sitter?.from), to: day(p?.sitter?.to),
      food: str(p?.sitter?.food, 400), walks: str(p?.sitter?.walks, 300), where: str(p?.sitter?.where, 300),
      habits: str(p?.sitter?.habits, 400), emergency: str(p?.sitter?.emergency, 400), key: str(p?.sitter?.key, 200),
      vetAuth: Boolean(p?.sitter?.vetAuth), contact: str(p?.sitter?.contact, 120),
    },
    food: { brand: str(p?.food?.brand, 80), bagKg: num(p?.food?.bagKg, 100), dailyG: num(p?.food?.dailyG, 20000), opened: day(p?.food?.opened) },
    fund: { goal: num(p?.fund?.goal), monthly: num(p?.fund?.monthly), saved: num(p?.fund?.saved) },
    trip: { dest: str(p?.trip?.dest, 30), date: day(p?.trip?.date) },
    records: (Array.isArray(p?.records) ? p.records : []).slice(0, MAX_RECS).map(r => ({
      id: id(r?.id), type: pick(r?.type, TYPES, 'otro'), name: str(r?.name, 80), date: day(r?.date), next: day(r?.next), vet: str(r?.vet, 80), notes: str(r?.notes, 300),
    })).filter(r => r.name || r.date || r.next),
    meds: (Array.isArray(p?.meds) ? p.meds : []).slice(0, 40).map(m => ({
      id: id(m?.id), name: str(m?.name, 80), dose: str(m?.dose, 80), every: Math.max(1, Math.min(720, parseInt(m?.every, 10) || 24)),
      start: stamp(m?.start), days: Math.max(0, Math.min(3650, parseInt(m?.days, 10) || 0)), notes: str(m?.notes, 200),
    })).filter(m => m.name),
    expenses: (Array.isArray(p?.expenses) ? p.expenses : []).slice(-600).map(x => ({
      id: id(x?.id), date: day(x?.date), cat: pick(x?.cat, EXP, 'otros'), amount: num(x?.amount) ?? 0, note: str(x?.note, 120),
    })).filter(x => x.date && x.amount > 0),
    symptoms: (Array.isArray(p?.symptoms) ? p.symptoms : []).slice(-200).map(x => ({ id: id(x?.id), date: day(x?.date), text: str(x?.text, 300) })).filter(x => x.date && x.text),
    log: cleanLog(p?.log),
  }));
  return { pets };
}

/* lo que ve quien abre el link de la ficha: sin notas privadas, gastos ni contacto si está apagado */
export function publicPet(p) {
  const lost = p.lost?.on;
  return {
    name: p.name, species: p.species, speciesOther: p.speciesOther, breed: p.breed, sex: p.sex,
    birth: p.birth, color: p.color, marks: p.marks, temper: p.temper, chip: p.chip, weight: p.weight, allergies: p.allergies,
    photo: p.photo, photos: p.photos,
    contact: (p.contact?.show || lost) && (p.contact?.phone || p.contact?.name) ? { name: p.contact.name, phone: p.contact.phone, note: p.contact.note } : null,
    lost: lost ? { since: p.lost.since, place: p.lost.place, note: p.lost.note } : null,
    vet: p.vet?.name || p.vet?.phone ? { name: p.vet.name, phone: p.vet.phone } : null,
    records: p.records.map(r => ({ type: r.type, name: r.name, date: r.date, next: r.next, vet: r.vet })),
  };
}

/* lo que ve el cuidador: instrucciones, medicación activa, veterinaria y lo anotado en los últimos días */
export function sitterView(p) {
  const since = Date.now() - 1000 * 60 * 60 * 24 * 10;
  return {
    name: p.name, species: p.species, speciesOther: p.speciesOther, photo: p.photo, allergies: p.allergies, temper: p.temper,
    sitter: p.sitter, vet: p.vet, contact: { name: p.contact?.name, phone: p.contact?.phone },
    meds: p.meds.map(m => ({ id: m.id, name: m.name, dose: m.dose, every: m.every, start: m.start, days: m.days, notes: m.notes })),
    log: p.log.filter(l => Date.parse(l.at) > since),
  };
}

async function access(email) {
  if (isAdmin(email)) return 'full';
  const list = await getPurchases(email);
  return list.some(p => p.productId === PRODUCT_ID) ? 'full' : 'none';
}
const bump = doc => { doc.rev = (doc.rev || 0) + 1; doc.updatedAt = new Date().toISOString(); return doc; };

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const q = req.query || {};

  /* foto: id aleatorio, se puede ver sin sesión (la usan la ficha y el cartel) */
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
    const t = tok(String(q.s));
    const link = t && await kvGet(shareKey(t));
    const doc = link && await kvGet(docKey(link.email));
    const pet = doc?.pets?.find(p => p.id === link.petId && p.share === t);
    if (!pet) return res.status(404).json({ error: 'not_found' });
    return res.status(200).json({ kind: 'ficha', pet: publicPet(pet), updatedAt: doc.updatedAt || null });
  }

  /* cuidador */
  if (q.c) {
    const t = tok(String(q.c));
    const link = t && await kvGet(sitterKey(t));
    const doc = link && await kvGet(docKey(link.email));
    const pet = doc?.pets?.find(p => p.id === link.petId && p.sitterToken === t);
    if (!pet) return res.status(404).json({ error: 'not_found' });
    if (req.method === 'GET') return res.status(200).json({ kind: 'cuidador', pet: sitterView(pet) });
    if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
    const b = await readBody(req);
    const kind = pick(b.kind, LOG, '');
    if (!kind) return res.status(400).json({ error: 'invalid' });
    const medId = kind === 'med' ? str(b.medId, 24) : '';
    if (kind === 'med' && !pet.meds.some(m => m.id === medId)) return res.status(400).json({ error: 'invalid' });
    const note = str(b.note, 300);
    if (kind === 'nota' && !note) return res.status(400).json({ error: 'invalid' });
    pet.log = [...(pet.log || []), { id: randomBytes(6).toString('hex'), at: new Date().toISOString(), kind, medId, by: str(b.by, 40) || pet.sitter?.name || 'Cuidador', note }].slice(-MAX_LOG);
    /* sin subir la versión: así no choca con lo que la dueña esté editando (al guardar, el servidor suma estas anotaciones) */
    doc.updatedAt = new Date().toISOString();
    await kvSet(docKey(link.email), doc);
    return res.status(200).json({ ok: true, pet: sitterView(pet) });
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

  if (q.share || q.unshare || q.sitter || q.unsitter) {
    const pet = current.pets.find(p => p.id === String(body.petId || ''));
    if (!pet) return res.status(404).json({ error: 'not_found' });
    const field = q.share || q.unshare ? 'share' : 'sitterToken';
    const keyOf = field === 'share' ? shareKey : sitterKey;
    if (q.unshare || q.unsitter) {
      if (pet[field]) await kvDel(keyOf(pet[field]));
      pet[field] = '';
    } else if (!pet[field]) {
      pet[field] = randomBytes(9).toString('base64url');
      await kvSet(keyOf(pet[field]), { email: s.email, petId: pet.id });
    }
    await kvSet(docKey(s.email), bump(current));
    return res.status(200).json({ token: pet[field], doc: current });
  }

  /* guardar la libreta */
  if ((body.rev ?? 0) !== (current.rev || 0)) return res.status(409).json({ error: 'conflict', doc: current });
  const clean = cleanDoc(body.doc);
  for (const p of clean.pets) {
    const old = current.pets.find(c => c.id === p.id);
    /* los links los maneja el servidor: no se pueden inventar desde el navegador */
    p.share = old?.share || '';
    p.sitterToken = old?.sitterToken || '';
    /* lo que anotó el cuidador mientras tanto no se pierde */
    const ids = new Set(p.log.map(l => l.id));
    for (const l of old?.log || []) if (!ids.has(l.id)) p.log.push(l);
    p.log.sort((a, b) => a.at.localeCompare(b.at)); p.log = p.log.slice(-MAX_LOG);
  }
  for (const old of current.pets) if (!clean.pets.some(p => p.id === old.id)) {
    if (old.share) await kvDel(shareKey(old.share));
    if (old.sitterToken) await kvDel(sitterKey(old.sitterToken));
  }
  const next = bump({ ...clean, rev: current.rev || 0 });
  if (JSON.stringify(next).length > MAX_DOC) return res.status(413).json({ error: 'too_big' });
  await kvSet(docKey(s.email), next);
  return res.status(200).json({ ok: true, doc: next });
}
