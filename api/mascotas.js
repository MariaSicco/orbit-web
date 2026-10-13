/* Libreta de tu Mascota (microapp del Drop 01).
   Los datos viven en la cuenta de Orbit, no en el navegador: así no se
   pierden si el celular borra el almacenamiento del sitio.

   Mimitos es paga: todo lo de la dueña o el dueño exige sesión y la compra del producto
   (sin compra → 402 { error: 'no_purchase' }). Los links públicos dejan de andar si la compra no está.

   Dueña o dueño (con sesión y compra):
   GET                        → { access: 'full', purchase: {date}, doc }
   POST {doc, rev}            → guarda la libreta. Si otro dispositivo guardó antes, 409 con la versión nueva
   POST ?photo=1 {data}       → sube una foto (ya comprimida en el navegador) → { u }
   POST ?share=1 {petId}      → crea (o devuelve) el link público de la ficha
   POST ?unshare=1 {petId}    → apaga el link de la ficha
   POST ?sitter=1 {petId}     → crea (o devuelve) el link del cuidador
   POST ?unsitter=1 {petId}   → apaga el link del cuidador
   POST ?scan=1 {images}      → lee fotos de la libreta con IA y devuelve los registros para revisar (no guarda nada)
   POST ?upload=1 {name,size,type} → URL firmada para subir un estudio a Blob privado
   GET  ?file=ref             → abre un estudio propio (URL firmada que vence en minutos)

   Sin sesión:
   GET  ?s=token              → ficha pública (veterinario, paseador, QR del collar)
   GET  ?c=token              → vista del cuidador (instrucciones, medicación y registro del día)
   POST ?c=token {kind,…}     → el cuidador anota "comió", "paseó", "le di la medicación" o una nota
   GET  ?img=id               → una foto */
import { randomBytes, createHash } from 'node:crypto';
import { kvGet, kvSet, kvDel, getPurchases } from './_lib/kv.js';
import { readSession, readBody } from './_lib/auth.js';
import { isAdmin } from './_lib/admin.js';
import { blobReady, signedPut, signedGet, makeRef, isBlobRef, refPath } from './_lib/blob.js';
import { getVapid, getNotify, saveNotify, cleanSub, pushTo, KINDS, PRODUCT_ID, mimitosPurchase, hasMimitos } from './_lib/petpush.js';

export { PRODUCT_ID };
const docKey = email => `orbit:pets:${email.toLowerCase()}`;
const shareKey = t => `orbit:petshare:${t}`;
const sitterKey = t => `orbit:petsitter:${t}`;
const imgKey = id => `orbit:petimg:${id}`;
const scansKey = email => `orbit:petscans:${email.toLowerCase()}`;
const folder = email => 'mascotas/' + createHash('sha256').update('orbit-pets:' + email.toLowerCase()).digest('hex').slice(0, 16);
const SCANS_PER_DAY = 25;
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
    neutered: pick(p?.neutered, ['si', 'no'], ''),
    chronic: str(p?.chronic, 300),
    onboarded: Boolean(p?.onboarded),
    conditions: (Array.isArray(p?.conditions) ? p.conditions : []).slice(0, 60).map(c => ({
      id: id(c?.id), name: str(c?.name, 80), since: str(c?.since, 10), status: pick(c?.status, ['activa', 'controlada', 'resuelta'], 'activa'), notes: str(c?.notes, 300),
    })).filter(c => c.name),
    surgeries: (Array.isArray(p?.surgeries) ? p.surgeries : []).slice(0, 40).map(c => ({ id: id(c?.id), name: str(c?.name, 80), date: str(c?.date, 10), notes: str(c?.notes, 300) })).filter(c => c.name),
    visits: (Array.isArray(p?.visits) ? p.visits : []).slice(-200).map(v => ({
      id: id(v?.id), date: day(v?.date), reason: str(v?.reason, 160), vet: str(v?.vet, 80), findings: str(v?.findings, 600), plan: str(v?.plan, 600), weight: num(v?.weight, 2000),
    })).filter(v => v.date && (v.reason || v.findings)),
    studies: (Array.isArray(p?.studies) ? p.studies : []).slice(-150).map(x => ({
      id: id(x?.id), date: day(x?.date), kind: pick(x?.kind, ['sangre', 'orina', 'materia', 'rx', 'eco', 'otro'], 'otro'), title: str(x?.title, 120), notes: str(x?.notes, 600),
      files: (Array.isArray(x?.files) ? x.files : []).slice(0, 10).map(f => ({ ref: isBlobRef(f?.ref) && /^blob:mascotas\/[a-f0-9]{16}\//.test(f.ref) ? f.ref : '', name: str(f?.name, 120), type: str(f?.type, 60) })).filter(f => f.ref),
    })).filter(x => x.date && (x.title || x.files.length)),
    weights: (Array.isArray(p?.weights) ? p.weights : []).slice(-200).map(w => ({ date: day(w?.date), kg: num(w?.kg, 2000) })).filter(w => w.date && w.kg),
    food: { brand: str(p?.food?.brand, 80), bagKg: num(p?.food?.bagKg, 100), dailyG: num(p?.food?.dailyG, 20000), opened: day(p?.food?.opened) },
    fund: { goal: num(p?.fund?.goal), monthly: num(p?.fund?.monthly), saved: num(p?.fund?.saved) },
    trip: { dest: str(p?.trip?.dest, 30), date: day(p?.trip?.date) },
    records: (Array.isArray(p?.records) ? p.records : []).slice(0, MAX_RECS).map(r => ({
      id: id(r?.id), type: pick(r?.type, TYPES, 'otro'), name: str(r?.name, 80), date: day(r?.date), next: day(r?.next), vet: str(r?.vet, 80), notes: str(r?.notes, 300),
      /* libreta digital (opcionales): lote o marca, foto del sticker y si el antiparasitario es interno o externo */
      lot: str(r?.lot, 80), sticker: photo(r?.sticker), scope: pick(r?.scope, ['interna', 'externa'], ''),
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
    neutered: p.neutered || '',
    conditions: (p.conditions || []).filter(c => c.status !== 'resuelta').map(c => ({ name: c.name, status: c.status })),
    surgeries: (p.surgeries || []).map(c => ({ name: c.name, date: c.date })),
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

/* ---------- lectura de la libreta con IA ----------
   La IA solo transcribe lo que está escrito o pegado en la libreta. No sugiere vacunas ni fechas
   que no figuren, y todo vuelve a la persona para revisar antes de guardar. */
const SCAN_PROMPT = `Sos un asistente que transcribe libretas sanitarias de mascotas de Argentina (vacunas, antiparasitarios y controles) a datos estructurados.
Mirá las fotos y devolvé SOLO un JSON con esta forma:
{"items":[{"type":"vacuna|desparasitacion|control|otro","name":"","product":"","date":"AAAA-MM-DD","next":"AAAA-MM-DD","vet":"","confidence":"alta|media|baja","note":""}],"pet":{"name":"","species":"perro|gato|otra","breed":"","birth":"AAAA-MM-DD","sex":"m|h","chip":""},"warnings":[""]}
Reglas:
- Una entrada por cada aplicación que veas (cada sticker o renglón con fecha).
- "name" es el nombre común en Argentina: Antirrábica, Séxtuple, Óctuple, Quíntuple, Tos de las perreras, Triple felina, Leucemia felina, Antiparasitario interno, Pipeta antipulgas, Comprimido antipulgas, Control. Si no podés deducirlo, copiá lo que dice.
- "product" es la marca o el nombre del sticker tal como figura (por ejemplo Nobivac, Vanguard, Rabisin, Defensor, Bravecto, NexGard, Simparica, Drontal, Total Full). Si no hay, dejalo vacío.
- Las fechas en la libreta suelen estar como DD/MM/AA o DD/MM/AAAA: convertilas a AAAA-MM-DD. "next" es la fecha de revacunación o próxima dosis si está escrita; si no está escrita, dejala vacía. No inventes fechas.
- "vet": nombre del veterinario, matrícula o sello si se lee.
- "confidence": baja si la letra no se entiende o la fecha es dudosa.
- En "pet" completá solo lo que esté escrito en la libreta; lo demás vacío.
- En "warnings" anotá en español corto lo que no se pudo leer (por ejemplo "Hay un sticker borroso en la segunda página").
- No des consejos médicos ni opines sobre el esquema de vacunación.`;

async function scanBooklet(images, species) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw Object.assign(new Error('ia_no_configurada'), { status: 503 });
  const content = images.map(d => { const m = /^data:(image\/[a-z]+);base64,(.+)$/.exec(d); return { type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } }; });
  content.push({ type: 'text', text: SCAN_PROMPT + (species ? `\nLa mascota es: ${species}.` : '') });
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: process.env.ORBIT_VISION_MODEL || process.env.ORBIT_MODEL || 'claude-sonnet-5-5', max_tokens: 3000, messages: [{ role: 'user', content }] }),
  });
  if (!r.ok) throw Object.assign(new Error('ia_error_' + r.status), { status: 502 });
  const d = await r.json();
  const t = (d.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  let j; try { j = JSON.parse(t.slice(a, b + 1)); } catch { throw Object.assign(new Error('ia_respuesta_invalida'), { status: 502 }); }
  const items = (Array.isArray(j.items) ? j.items : []).slice(0, 80).map(x => ({
    type: pick(x?.type, TYPES, 'otro'), name: str(x?.name, 80), product: str(x?.product, 80), date: day(x?.date), next: day(x?.next),
    vet: str(x?.vet, 80), confidence: pick(x?.confidence, ['alta', 'media', 'baja'], 'media'), note: str(x?.note, 160),
  })).filter(x => x.name || x.date);
  const pp = j.pet || {};
  return {
    items,
    pet: { name: str(pp.name, 60), species: pick(pp.species, SPECIES, ''), breed: str(pp.breed, 60), birth: day(pp.birth), sex: pick(pp.sex, ['m', 'h'], ''), chip: str(pp.chip, 40) },
    warnings: (Array.isArray(j.warnings) ? j.warnings : []).map(w => str(w, 200)).filter(Boolean).slice(0, 6),
  };
}

async function scanAlert(email, pet, req) {
  let city = '';
  try { city = decodeURIComponent(String(req.headers['x-vercel-ip-city'] || '')).slice(0, 60); } catch {}
  const list = (await kvGet(scansKey(email))) || [];
  list.push({ petId: pet.id, at: new Date().toISOString(), city });
  await kvSet(scansKey(email), list.slice(-20));
  /* como mucho un push cada 30 minutos por mascota */
  const ping = `orbit:petscanping:${email.toLowerCase()}:${pet.id}`;
  if (await kvGet(ping)) return;
  await kvSet(ping, 1, 30 * 60);
  const n = await getNotify(email);
  if (n.off.qr) return;
  await pushTo(n, { title: `Alguien escaneó el QR de ${pet.name}`, body: (city ? `Cerca de ${city} (aproximado). ` : '') + (pet.lost?.on ? 'Está en modo perdida: mirá si te escribieron.' : 'Si no fuiste vos, puede que la hayan encontrado.'), url: '/mascotas', tag: `scan-${pet.id}` });
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
    /* si la dueña o el dueño ya no tiene la compra, el link deja de mostrar datos */
    if (!pet || !(await hasMimitos(link.email))) return res.status(404).json({ error: 'not_found' });
    /* aviso a la familia: alguien abrió la ficha (no cuenta si la abre la misma dueña) */
    const viewer = readSession(req);
    if (!viewer || viewer.email.toLowerCase() !== link.email.toLowerCase()) await scanAlert(link.email, pet, req).catch(() => {});
    return res.status(200).json({ kind: 'ficha', pet: publicPet(pet), updatedAt: doc.updatedAt || null });
  }

  /* cuidador */
  if (q.c) {
    const t = tok(String(q.c));
    const link = t && await kvGet(sitterKey(t));
    const doc = link && await kvGet(docKey(link.email));
    const pet = doc?.pets?.find(p => p.id === link.petId && p.sitterToken === t);
    if (!pet || !(await hasMimitos(link.email))) return res.status(404).json({ error: 'not_found' });
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
  /* todo lo de la dueña o el dueño exige la compra de Mimitos */
  const purchase = await mimitosPurchase(s.email);
  if (!purchase) return res.status(402).json({ error: 'no_purchase', email: s.email, product: PRODUCT_ID });

  /* avisos: push en este celu, mail y qué avisar */
  if (q.notify) {
    const n = await getNotify(s.email);
    const view = async () => ({ publicKey: (await getVapid()).publicKey, devices: n.subs.length, mail: n.mail, off: n.off, endpoints: n.subs.map(x => x.endpoint.slice(-24)) });
    if (req.method === 'GET') return res.status(200).json(await view());
    if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
    const b = await readBody(req);
    if (b.sub) { const sub = cleanSub(b.sub); if (!sub) return res.status(400).json({ error: 'invalid' }); n.subs = [...n.subs.filter(x => x.endpoint !== sub.endpoint), sub].slice(-6); }
    if (typeof b.remove === 'string') n.subs = n.subs.filter(x => x.endpoint !== b.remove);
    if (typeof b.mail === 'boolean') n.mail = b.mail;
    if (b.off && typeof b.off === 'object') n.off = Object.fromEntries(KINDS.map(k => [k, Boolean(b.off[k])]));
    await saveNotify(n);
    if (b.test) await pushTo(n, { title: 'Listo, los avisos andan', body: 'Así te vamos a avisar antes de cada vacuna, pipeta o bolsa de alimento.', url: '/mascotas', tag: 'test' });
    return res.status(200).json(await view());
  }

  if (req.method === 'GET' && q.file) {
    const ref = String(q.file);
    if (!isBlobRef(ref) || !refPath(ref).startsWith(folder(s.email) + '/')) return res.status(403).json({ error: 'forbidden' });
    try { return res.redirect(302, await signedGet(refPath(ref), { minutes: 10 })); }
    catch { return res.status(500).json({ error: 'no_pudimos_abrir' }); }
  }
  if (req.method === 'GET') {
    const doc = (await kvGet(docKey(s.email))) || { pets: [], rev: 0 };
    const scans = ((await kvGet(scansKey(s.email))) || []).slice(-10);
    return res.status(200).json({ access: 'full', purchase, email: s.email, doc, scans });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  const body = await readBody(req);

  if (q.photo) {
    const data = String(body.data || '');
    if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(data)) return res.status(400).json({ error: 'invalid' });
    if (data.length > MAX_IMG) return res.status(413).json({ error: 'too_big' });
    const iid = randomBytes(10).toString('hex');
    await kvSet(imgKey(iid), data);
    return res.status(200).json({ u: `/api/mascotas?img=${iid}` });
  }

  /* estudios: el archivo viaja del navegador a Blob privado, en la carpeta de esta cuenta */
  if (q.upload) {
    if (!blobReady()) return res.status(503).json({ error: 'blob_no_configurado' });
    const size = Number(body.size) || 0;
    if (size > 15 * 1024 * 1024) return res.status(413).json({ error: 'too_big' });
    if (!/^(image\/(jpeg|png|webp|heic|heif)|application\/pdf)$/.test(String(body.type || ''))) return res.status(400).json({ error: 'tipo_no_permitido' });
    const clean = String(body.name || 'estudio').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9._-]+/g, '-').slice(-80) || 'estudio';
    const pathname = `${folder(s.email)}/${randomBytes(6).toString('hex')}-${clean}`;
    try { return res.status(200).json({ url: await signedPut(pathname, { maxBytes: 15 * 1024 * 1024, minutes: 15 }), ref: makeRef(pathname) }); }
    catch { return res.status(500).json({ error: 'no_pudimos_firmar' }); }
  }

  /* leer la libreta con IA: devuelve registros para que la persona los revise; no guarda nada */
  if (q.scan) {
    const images = (Array.isArray(body.images) ? body.images : []).filter(x => /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(x || '') && x.length < 1.6e6).slice(0, 4);
    if (!images.length) return res.status(400).json({ error: 'sin_fotos' });
    const k = `orbit:petscan:${s.email.toLowerCase()}:${new Date().toISOString().slice(0, 10)}`;
    const n = (await kvGet(k)) || 0;
    if (n >= SCANS_PER_DAY) return res.status(429).json({ error: 'limite_diario' });
    await kvSet(k, n + 1, 60 * 60 * 26);
    try {
      const out = await scanBooklet(images, str(body.species, 10));
      return res.status(200).json(out);
    } catch (e) { return res.status(e.status || 502).json({ error: e.message || 'ia_error' }); }
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
