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
   POST ?studyscan=1 {ref}    → lee un estudio ya subido (foto o PDF) con IA: fecha, tipo, laboratorio y un resumen fiel (no guarda nada)
   POST ?upload=1 {name,size,type} → URL firmada para subir un estudio a Blob privado
   GET  ?file=ref             → abre un estudio propio (URL firmada que vence en minutos)
   GET  ?ask=1                → cuántas preguntas quedan hoy y este mes
   POST ?renew=1              → "Avisame cuando pueda renovar": guarda el interés en KV (no cobra nada)
   Funciones inteligentes (lectura de libreta y estudios, importación desde el mail y Preguntale a Mimitos):
   topes internos y vencimiento a 12 meses en api/_lib/petquota.js. Vencidas → 403 { error: 'ai_expired' }
   POST ?ask=1 {question, petId?, history?, tz?} → "Preguntale a Mimitos": responde SOLO con los datos de la cuenta,
                                con citas validadas (api/_lib/petask.js). La conversación no se guarda en el servidor
   ?gmail=… y ?outlook=… (status|start|callback|search|import|queue|unqueue|disconnect) → "Conectar tu mail"
                                (api/_lib/petmail.js + adaptadores): busca estudios en el mail y los importa por el mismo motor de ?studyscan

   POST ?scanclear=1 {petId?} → borra el registro de escaneos del QR (de una mascota o todo)
   POST ?gmail=disconnect / ?outlook=disconnect → anda con sesión aunque no haya compra ni configuración:
                                borra lo guardado y revoca si se puede

   Funciones inteligentes en pausa (tope global de gasto del mes, api/_lib/petai.js) → 503 { error: 'ai_paused', message }

   Sin sesión:
   GET  ?s=token              → ficha pública del QR del collar: solo lo necesario para devolverla
   POST ?s=token&found=1 {loc?,name?,phone?,msg?} → quien la encontró le avisa a la familia (opcional, con topes)
   GET  ?c=token              → vista del cuidador (instrucciones, medicación y registro del día)
   POST ?c=token {kind,…}     → el cuidador anota "comió", "paseó", "le di la medicación" o una nota
                                (va a orbit:petlog:<token>, aparte del doc; se une al leer). Tope por token e IP.
                                El link vence: con "hasta" (sitter.to), al día siguiente; sin "hasta", a los 30 días
                                de creado. Vencido → 404 { error: 'not_found', expired: true } y se apaga solo.
   GET  ?img=id               → una foto */
import { randomBytes, createHash } from 'node:crypto';
import { kvGet, kvSet, kvDel, kvIncrBy, kvSetNX } from './_lib/kv.js';
import { readSession, readBody } from './_lib/auth.js';
import { accesoHerramienta } from './_lib/herramienta-acceso.js';
import { blobReady, signedPut, signedGet, makeRef, isBlobRef, refPath, putPrivate } from './_lib/blob.js';
import { handleMail, disconnectAnyway } from './_lib/petmail.js';
import { handleAsk } from './_lib/petask.js';
import { gmail } from './_lib/petgmail.js';
import { outlook } from './_lib/petoutlook.js';
import { QUOTA_BYTES, PHOTO_QUOTA_BYTES, PHOTOS_PER_DAY, UPLOADS_PER_DAY, fits, photoFits, dailyCount, addUsage, addPending, verifyUploads, photoRef, sweep } from './_lib/petfiles.js';
import { aiStatus, checkImport, takeImport, refundImport, prepareForAI, TRUNCATED_NOTE, PDF_UNREADABLE, saveRenewInterest, renewInterest } from './_lib/petquota.js';
import { callClaude, visionModel, estimateTokens, jsonOf, aiPaused, pausedBody } from './_lib/petai.js';
import { getVapid, getNotify, saveNotify, cleanSub, cleanTz, pushTo, mailNotice, KINDS, PRODUCT_ID, mimitosPurchase, hasMimitos, todayAR } from './_lib/petpush.js';

export { PRODUCT_ID };
const docKey = email => `orbit:pets:${email.toLowerCase()}`;
const shareKey = t => `orbit:petshare:${t}`;
const sitterKey = t => `orbit:petsitter:${t}`;
const sitterLogKey = t => `orbit:petlog:${t}`;
const imgKey = id => `orbit:petimg:${id}`;
const scansKey = email => `orbit:petscans:${email.toLowerCase()}`;
export const folder = email => 'mascotas/' + createHash('sha256').update('orbit-pets:' + email.toLowerCase()).digest('hex').slice(0, 16);
const MAX_DOC = 700 * 1024;
/* foto recortada con transparencia (PNG o WebP, ~800 px) o foto entera en JPEG */
const MAX_IMG = 450 * 1024;
const MAX_PETS = 12, MAX_RECS = 300, MAX_LOG = 300;
const MAX_UPLOAD = 15 * 1024 * 1024;

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
/* color de fondo de cada mascota (Inicio, tapa de la libreta y pasaporte); vacío = azul */
export const HUES = ['azul', 'verde', 'rosa', 'lila', 'naranja', 'amarillo', 'turquesa'];
const EXP = ['alimento', 'veterinaria', 'salud', 'peluqueria', 'accesorios', 'otros'];
const LOG = ['comida', 'paseo', 'med', 'ok', 'nota'];

function cleanLog(list) {
  return (Array.isArray(list) ? list : []).slice(-MAX_LOG).map(l => ({
    id: id(l?.id), at: stamp(l?.at) || new Date().toISOString(), kind: pick(l?.kind, LOG, 'nota'),
    medId: str(l?.medId, 24), by: str(l?.by, 40), note: str(l?.note, 300),
  }));
}

/* limpia lo que viene del navegador: solo los campos que la app usa */
export function cleanDoc(d, email) {
  /* las refs de estudios solo pueden apuntar a la carpeta de esta cuenta */
  const own = email ? `blob:${folder(email)}/` : null;
  const okRef = r => isBlobRef(r) && /^blob:mascotas\/[a-f0-9]{16}\//.test(r) && !/\.\.|\/\//.test(refPath(r)) && (!own || r.startsWith(own));
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
    /* la foto original cuando photo es el recorte */
    photoFull: photo(p?.photoFull),
    hue: pick(p?.hue, HUES, ''),
    photos: (Array.isArray(p?.photos) ? p.photos : []).map(photo).filter(Boolean).slice(0, 4),
    notes: str(p?.notes, 600),
    contact: { show: Boolean(p?.contact?.show), name: str(p?.contact?.name, 60), phone: str(p?.contact?.phone, 40), note: str(p?.contact?.note, 200) },
    vet: { name: str(p?.vet?.name, 80), phone: str(p?.vet?.phone, 40), address: str(p?.vet?.address, 120), er: str(p?.vet?.er, 120), erPhone: str(p?.vet?.erPhone, 40) },
    lost: { on: Boolean(p?.lost?.on), since: stamp(p?.lost?.since), place: str(p?.lost?.place, 160), note: str(p?.lost?.note, 300) },
    /* lo único de salud que puede verse en el QR, y solo si la familia lo marca */
    qrNote: { show: Boolean(p?.qrNote?.show), text: str(p?.qrNote?.text, 200) },
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
      id: id(x?.id), date: day(x?.date), kind: pick(x?.kind, ['sangre', 'orina', 'materia', 'rx', 'eco', 'otro'], 'otro'), title: str(x?.title, 120), notes: str(x?.notes, 600), lab: str(x?.lab, 80),
      files: (Array.isArray(x?.files) ? x.files : []).slice(0, 10).map(f => ({ ref: okRef(f?.ref) ? f.ref : '', name: str(f?.name, 120), type: str(f?.type, 60) })).filter(f => f.ref),
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

/* lo que ve quien escanea el QR del collar: SOLO lo necesario para devolverla.
   Nada de salud (ni vacunas, problemas, cirugías, microchip, nacimiento o veterinaria), salvo el dato
   urgente que la familia marque a propósito para mostrar en el QR. */
export function publicPet(p) {
  const lost = p.lost?.on;
  return {
    name: p.name, species: p.species, speciesOther: p.speciesOther, breed: p.breed, sex: p.sex,
    color: p.color, marks: p.marks, temper: p.temper,
    /* nunca photoFull (la foto original sin recortar puede mostrar el interior de la casa): solo si hay
       recorte, para el estilo. hue (color del fondo) y speciesOther (Z.species) los usa mascota.html */
    photo: p.photo, cut: Boolean(p.photo && p.photoFull), hue: p.hue || '', photos: p.photos,
    contact: (p.contact?.show || lost) && (p.contact?.phone || p.contact?.name) ? { name: p.contact.name, phone: p.contact.phone, note: p.contact.note } : null,
    lost: lost ? { since: p.lost.since, place: p.lost.place, note: p.lost.note } : null,
    urgent: p.qrNote?.show && p.qrNote?.text ? p.qrNote.text : '',
  };
}

/* ---------- link del cuidador: vencimiento y registro aparte ----------
   Con "hasta" (sitter.to) anda hasta el día siguiente inclusive (hora de Argentina); sin "hasta", 30 días
   desde que se creó. Vencido, el GET y el POST dan 404 y el token se borra solo. Mientras anda, viajan
   también "dónde está la llave" y "dónde duerme" (sitter.key, sitter.where), que la familia cargó para eso. */
export const SITTER_DAYS_NO_END = 30, SITTER_GRACE_DAYS = 1;
const SITTER_POSTS_PER_HOUR = 30;
const addDays = (ymd, n) => new Date(Date.parse(ymd + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
export function sitterExpired(pet, link, now = Date.now()) {
  const to = day(pet?.sitter?.to);
  if (to) return todayAR(new Date(now)) > addDays(to, SITTER_GRACE_DAYS);
  const at = Date.parse(link?.at || '');
  return !Number.isFinite(at) || now > at + SITTER_DAYS_NO_END * 864e5;
}
/* hasta cuándo anda (para mostrarlo en la app) */
export function sitterUntil(pet, link) {
  const to = day(pet?.sitter?.to);
  if (to) return addDays(to, SITTER_GRACE_DAYS);
  const at = Date.parse(link?.at || '');
  return Number.isFinite(at) ? new Date(at + SITTER_DAYS_NO_END * 864e5).toISOString().slice(0, 10) : null;
}
const mergeLog = (a = [], b = []) => {
  const seen = new Set(), out = [];
  for (const l of [...a, ...b]) if (l && !seen.has(l.id)) { seen.add(l.id); out.push(l); }
  return out.sort((x, y) => String(x.at).localeCompare(String(y.at))).slice(-MAX_LOG);
};
/* une al doc lo que anotaron los cuidadores (solo para mostrar; el doc guardado no se toca) */
async function withSitterLogs(doc) {
  for (const p of doc?.pets || []) {
    if (!p.sitterToken) continue;
    const extra = (await kvGet(sitterLogKey(p.sitterToken))) || [];
    if (extra.length) p.log = mergeLog(p.log, extra);
  }
  return doc;
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

/* La lectura usa ORBIT_VISION_MODEL o Sonnet (nunca ORBIT_MODEL), esfuerzo bajo y max_tokens holgado:
   si igual se corta (stop_reason max_tokens) es un error cobrado y no se devuelve el crédito. */
export const BOOKLET_MAX_TOKENS = 8000, STUDY_MAX_TOKENS = 4000;
async function scanBooklet(images, species) {
  const content = images.map(d => { const m = /^data:(image\/[a-z]+);base64,(.+)$/.exec(d); return { type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } }; });
  content.push({ type: 'text', text: SCAN_PROMPT + (species ? `\nLa mascota es: ${species}.` : '') });
  const out = await callClaude({ model: visionModel(), body: { max_tokens: BOOKLET_MAX_TOKENS, output_config: { effort: 'low' }, messages: [{ role: 'user', content }] }, estimate: estimateTokens({ chars: SCAN_PROMPT.length, images: images.length }) });
  const j = jsonOf(out);
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

/* ---------- escaneos del QR ----------
   Registro por cuenta (orbit:petscans:<email>): últimos MAX_SCANS, se borra solo a los SCAN_DAYS días.
   La IP nunca se guarda: solo un hash con sal, en llaves de tope que vencen en una hora. */
const MAX_SCANS = 50, SCAN_DAYS = 90;
const NOTIFY_EVERY = 10 * 60;      /* un aviso cada 10 minutos por QR (escaneo y mensaje, por separado) */
const MSGS_PER_HOUR_IP = 5;        /* mensajes por hora por IP */
const MSGS_PER_DAY_QR = 20;        /* mensajes por día por QR, aunque vengan de muchas IP */
const hdr = (req, k) => { try { return decodeURIComponent(String(req.headers[k] || '')).slice(0, 60); } catch { return ''; } };
const where = req => ({ city: hdr(req, 'x-vercel-ip-city'), region: hdr(req, 'x-vercel-ip-country-region'), country: hdr(req, 'x-vercel-ip-country') });
const ipHash = req => {
  /* en Vercel, x-vercel-forwarded-for y x-real-ip los pone la plataforma (no se pueden falsear desde afuera);
     x-forwarded-for queda solo para correr local */
  const h = req.headers || {};
  const ip = String(h['x-vercel-forwarded-for'] || h['x-real-ip'] || h['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
  return createHash('sha256').update('orbit-qr:' + (process.env.SESSION_SECRET || 'mimitos') + ':' + ip).digest('hex').slice(0, 20);
};
async function addScan(email, entry) {
  const since = Date.now() - SCAN_DAYS * 864e5;
  const list = ((await kvGet(scansKey(email))) || []).filter(x => Date.parse(x.at) > since);
  list.push({ id: randomBytes(5).toString('hex'), at: new Date().toISOString(), ...entry });
  await kvSet(scansKey(email), list.slice(-MAX_SCANS), SCAN_DAYS * 86400);
}
/* true si se puede avisar (y deja anotado el aviso); false si ya se avisó en los últimos 10 minutos */
async function canNotify(kind, token) {
  return kvSetNX(`orbit:petqrping:${kind}:${token}`, 1, NOTIFY_EVERY);
}
const placeOf = w => [w.city, w.region].filter(Boolean).join(', ');
const hm = d => new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' }).format(d);

/* ---------- lectura de estudios con IA ----------
   Solo transcribe: no interpreta, no diagnostica, no completa valores que no se leen. */
const STUDY_PROMPT = `Sos un asistente que ordena estudios veterinarios (análisis, ecografías, radiografías) de mascotas de Argentina.
Leé el documento y devolvé SOLO un JSON con esta forma:
{"date":"AAAA-MM-DD","kind":"sangre|orina|materia|rx|eco|otro","title":"","lab":"","summary":"","confidence":"alta|media|baja","warnings":[""]}
Reglas:
- "date": la fecha en que se hizo el estudio, tal como figura (convertí DD/MM/AA a AAAA-MM-DD). Si no figura o no se lee, dejala vacía. No la inventes.
- "kind": sangre (hemograma, bioquímica, perfil), orina, materia (coproparasitológico), rx (radiografía), eco (ecografía), otro.
- "title": el nombre del estudio como figura, corto (por ejemplo "Hemograma y bioquímica", "Ecografía abdominal").
- "lab": el laboratorio, la veterinaria o el profesional que lo firma, si figura.
- "summary": un resumen corto y fiel (máximo 400 caracteres) de lo que dice el informe, en español rioplatense neutro. Si el informe tiene una conclusión escrita, copiala casi textual. Si hay valores fuera de rango marcados por el laboratorio, nombralos tal como figuran, con su valor. NO interpretes, NO diagnostiques, NO sugieras tratamientos ni des opinión médica. No agregues valores que no se lean con claridad.
- Si algo es ilegible o dudoso, decilo en "warnings" (por ejemplo "La fecha está cortada", "No se lee el valor de urea") y poné "confidence":"baja".`;
/* si hay mascotas cargadas (importación desde Gmail), además pide a quién parece corresponder */
const PET_HINT = pets => `
Además, agregá al JSON "pet":{"name":"","species":"","breed":""} con el nombre del paciente, la especie y la raza TAL COMO FIGURAN en el documento (vacío si no figuran; no adivines).
Las mascotas de esta familia son: ${pets.map(p => `${str(p.name, 40)} (${p.species === 'otra' ? str(p.speciesOther, 30) || 'otra' : p.species}${p.breed ? ', ' + str(p.breed, 40) : ''})`).join('; ')}. Usalo solo para reconocer nombres mal escritos; si el documento no nombra a ninguna, dejá "name" vacío.`;
async function scanStudy(buf, type, pets, pages = 1) {
  const b64 = buf.toString('base64');
  const block = type === 'application/pdf'
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } }
    : { type: 'image', source: { type: 'base64', media_type: type, data: b64 } };
  const text = STUDY_PROMPT + (pets?.length ? PET_HINT(pets) : '');
  let out;
  try {
    out = await callClaude({ model: visionModel(), body: { max_tokens: STUDY_MAX_TOKENS, output_config: { effort: 'low' }, messages: [{ role: 'user', content: [block, { type: 'text', text }] }] },
      estimate: estimateTokens({ chars: text.length, ...(type === 'application/pdf' ? { pages } : { images: 1 }) }) });
  } catch (e) {
    /* PDF demasiado pesado para leerlo entero (400 de la API: no se cobró) */
    if (e.apiStatus === 400 && /page|pdf|too large|exceed/i.test(e.apiText || '')) throw Object.assign(new Error('pdf_muy_largo'), { status: 422, billed: false });
    throw e;
  }
  const j = jsonOf(out);
  return {
    date: day(j.date), kind: pick(j.kind, ['sangre', 'orina', 'materia', 'rx', 'eco', 'otro'], 'otro'), title: str(j.title, 120), lab: str(j.lab, 80),
    summary: str(j.summary, 600), confidence: pick(j.confidence, ['alta', 'media', 'baja'], 'media'),
    warnings: (Array.isArray(j.warnings) ? j.warnings : []).map(w => str(w, 200)).filter(Boolean).slice(0, 4),
    ...(pets?.length ? { pet: { name: str(j.pet?.name, 60), species: str(j.pet?.species, 30), breed: str(j.pet?.breed, 60) } } : {}),
  };
}
async function scanAlert(email, pet, token, req) {
  const w = where(req);
  /* el mismo celu escaneando varias veces seguidas cuenta una sola vez en el registro */
  if (!(await kvSetNX(`orbit:petqrseen:${token}:${ipHash(req)}`, 1, NOTIFY_EVERY))) return;
  await addScan(email, { petId: pet.id, kind: 'scan', ...w });
  if (!(await canNotify('scan', token))) return;
  const n = await getNotify(email);
  if (n.off.qr) return;
  const place = placeOf(w);
  const title = `Escanearon el QR de ${pet.name}`;
  const body = `${place ? `Cerca de ${place} (aproximado por la conexión)` : 'Sin ubicación'}, ${hm(new Date())}. ` + (pet.lost?.on ? 'Está en modo perdida: si te escriben, te avisamos.' : 'Si no fuiste vos, puede que alguien la haya encontrado.');
  await pushTo(n, { title, body, url: '/mascotas#/inicio', tag: `scan-${pet.id}` });
  if (n.mail) await mailNotice(email, { title, body }).catch(() => {});
}

/* quien la encontró deja ubicación, nombre, teléfono o un mensaje (todo opcional) */
async function foundReport(email, pet, token, req, b) {
  if (str(b.website, 10)) return { ok: true };   /* trampa para bots: el campo está oculto */
  const lat = Number(b.loc?.lat), lng = Number(b.loc?.lng), acc = Number(b.loc?.acc);
  const loc = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && (lat || lng)
    ? { lat: Math.round(lat * 1e5) / 1e5, lng: Math.round(lng * 1e5) / 1e5, acc: Number.isFinite(acc) && acc > 0 ? Math.min(Math.round(acc), 50000) : null } : null;
  const name = str(b.name, 60), phone = str(b.phone, 40).replace(/[^\d+()\- ]/g, '').trim(), msg = str(b.msg, 500);
  if (!loc && !phone && !msg && !name) return { error: 'vacio', status: 400 };
  const hour = new Date().toISOString().slice(0, 13), dayk = hour.slice(0, 10);
  const kIp = `orbit:petqrmsg:ip:${ipHash(req)}:${hour}`, kQr = `orbit:petqrmsg:qr:${token}:${dayk}`;
  const nIp = await kvIncrBy(kIp, 1, 3600), nQr = await kvIncrBy(kQr, 1, 86400);
  if (nIp > MSGS_PER_HOUR_IP || nQr > MSGS_PER_DAY_QR) return { error: 'limite', status: 429 };
  const w = where(req);
  await addScan(email, { petId: pet.id, kind: 'msg', ...w, loc, name, phone, msg });
  if (!(await canNotify('msg', token))) return { ok: true };
  const n = await getNotify(email);
  if (n.off.qr) return { ok: true };
  const who = name || 'Alguien';
  const title = `${who} te avisó por ${pet.name}`;
  const parts = [loc ? 'Compartió su ubicación' : (placeOf(w) ? `Cerca de ${placeOf(w)} (aproximado)` : ''), phone ? `Tel.: ${phone}` : '', msg ? `"${msg.slice(0, 120)}"` : ''].filter(Boolean);
  const body = parts.join('. ') + '. Abrí Mimitos para ver el detalle.';
  await pushTo(n, { title, body, url: '/mascotas#/inicio', tag: `found-${pet.id}` });
  if (n.mail) await mailNotice(email, { title, body: `${hm(new Date())}. ${body}`, map: loc ? `https://www.google.com/maps?q=${loc.lat},${loc.lng}` : '', phone }).catch(() => {});
  return { ok: true };
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
    res.setHeader('X-Content-Type-Options', 'nosniff');
    /* privada y por un día: una foto borrada (o de una compra reintegrada) no queda un año en una caché compartida */
    res.setHeader('Cache-Control', 'private, max-age=86400');
    return res.status(200).end(Buffer.from(m[2], 'base64'));
  }

  /* ficha pública del QR */
  if (q.s) {
    const t = tok(String(q.s));
    const link = t && await kvGet(shareKey(t));
    const doc = link && await kvGet(docKey(link.email));
    const pet = doc?.pets?.find(p => p.id === link.petId && p.share === t);
    /* si la dueña o el dueño ya no tiene la compra, el link deja de mostrar datos */
    if (!pet || !(await hasMimitos(link.email))) return res.status(404).json({ error: 'not_found' });
    const viewer = readSession(req);
    const owner = viewer && viewer.email.toLowerCase() === link.email.toLowerCase();
    if (req.method === 'POST' && q.found) {
      const out = await foundReport(link.email, pet, t, req, await readBody(req)).catch(() => ({ error: 'error', status: 500 }));
      return out.ok ? res.status(200).json({ ok: true }) : res.status(out.status).json({ error: out.error });
    }
    if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });
    /* aviso a la familia: alguien abrió la ficha (no cuenta si la abre la misma dueña) */
    if (!owner) await scanAlert(link.email, pet, t, req).catch(() => {});
    return res.status(200).json({ kind: 'ficha', pet: publicPet(pet), owner: Boolean(owner) });
  }

  /* cuidador */
  if (q.c) {
    const t = tok(String(q.c));
    const link = t && await kvGet(sitterKey(t));
    const doc = link && await kvGet(docKey(link.email));
    const pet = doc?.pets?.find(p => p.id === link.petId && p.sitterToken === t);
    if (!pet || !(await hasMimitos(link.email))) return res.status(404).json({ error: 'not_found' });
    /* vencido: 404 y el token se apaga solo (el doc de la dueña no se toca; la app lo ve vencido) */
    if (sitterExpired(pet, link)) {
      await kvDel(sitterKey(t)).catch(() => {});
      return res.status(404).json({ error: 'not_found', expired: true });
    }
    const extra = (await kvGet(sitterLogKey(t))) || [];
    const view = () => sitterView({ ...pet, log: mergeLog(pet.log, extra) });
    if (req.method === 'GET') return res.status(200).json({ kind: 'cuidador', pet: view(), until: sitterUntil(pet, link) });
    if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
    /* tope por token e IP: 30 anotaciones por hora */
    const n = await kvIncrBy(`orbit:petsitrl:${t}:${ipHash(req)}:${new Date().toISOString().slice(0, 13)}`, 1, 3600);
    if (n > SITTER_POSTS_PER_HOUR) return res.status(429).json({ error: 'limite' });
    const b = await readBody(req);
    const kind = pick(b.kind, LOG, '');
    if (!kind) return res.status(400).json({ error: 'invalid' });
    const medId = kind === 'med' ? str(b.medId, 24) : '';
    if (kind === 'med' && !pet.meds.some(m => m.id === medId)) return res.status(400).json({ error: 'invalid' });
    const note = str(b.note, 300);
    if (kind === 'nota' && !note) return res.status(400).json({ error: 'invalid' });
    /* va a una clave aparte: nunca pisa el doc de la dueña (que puede estar guardando a la vez) */
    extra.push({ id: randomBytes(6).toString('hex'), at: new Date().toISOString(), kind, medId, by: str(b.by, 40) || pet.sitter?.name || 'Cuidador', note });
    const keep = extra.slice(-MAX_LOG);
    await kvSet(sitterLogKey(t), keep, 90 * 86400);
    return res.status(200).json({ ok: true, pet: sitterView({ ...pet, log: mergeLog(pet.log, keep) }) });
  }

  /* desconectar el mail: con sesión alcanza (sin compra, sin la casilla habilitada y aunque falte configuración):
     se borra lo guardado y se revoca si se puede */
  if ((q.gmail || q.outlook) && String(q.gmail || q.outlook) === 'disconnect') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
    const se = readSession(req);
    if (!se) return res.status(401).json({ error: 'unauthorized' });
    return res.status(200).json(await disconnectAnyway(q.gmail ? gmail : outlook, req, se.email));
  }

  /* ir y volver de Google son navegaciones: sin sesión o sin compra se vuelve a la app, no a un JSON */
  const mailP = q.gmail ? gmail : q.outlook ? outlook : null;
  const gNav = mailP && ['start', 'callback'].includes(String(q[mailP.id]));
  /* todo lo de la dueña o el dueño exige sesión y la compra de Mimitos: lo resuelve la base
     de herramientas (sesión + compra vigente, admin sin compra). La app espera 401 y 402. */
  const acc = await accesoHerramienta(req, PRODUCT_ID);
  if (!acc.ok && acc.motivo === 'sin_sesion') return gNav ? res.redirect(302, '/acceso?next=mascotas') : res.status(401).json({ error: 'unauthorized' });
  if (!acc.ok && acc.motivo === 'sin_compra') return gNav ? res.redirect(302, '/mascotas') : res.status(402).json({ error: 'no_purchase', email: acc.email, product: PRODUCT_ID });
  if (!acc.ok) return res.status(acc.status).json({ error: 'unavailable', motivo: acc.motivo });
  const s = { email: acc.email };
  /* admin: la base no mira la compra; si igual compró, se muestra su fecha */
  const purchase = acc.compra ? { date: acc.compra.date || null } : await mimitosPurchase(acc.email).catch(() => ({ date: null, admin: true }));
  /* funciones inteligentes: 12 meses desde la compra (admin sin vencimiento) */
  const aiCtx = { purchaseDate: purchase?.date || null, admin: Boolean(acc.admin) };
  const expiredBody = async () => { const st = await aiStatus(s.email, aiCtx); return { error: 'ai_expired', expiredAt: st.expiresAt }; };
  const isExpired = async () => (await aiStatus(s.email, aiCtx)).expired;

  /* Conectar tu mail (Gmail u Outlook): solo cuentas habilitadas (MIMITOS_MAIL_ALLOW) o admin */
  if (mailP) {
    /* vencidas: no se busca, no se importa ni se conecta; sí se puede ver el estado, desconectar y sacar de la cola */
    const act = String(q[mailP.id]);
    if (['search', 'import', 'queue', 'start'].includes(act) && await isExpired()) {
      return act === 'start' ? res.redirect(302, '/mascotas#/cuenta') : res.status(403).json(await expiredBody());
    }
    return handleMail(mailP, req, res, {
      email: s.email,
      body: req.method === 'POST' ? await readBody(req) : {},
      getDoc: async () => (await kvGet(docKey(s.email))) || { pets: [], rev: 0 },
      deps: {
        peekScan: async email => (await aiPaused()) ? { ...pausedBody(), status: 503 } : checkImport(email, aiCtx, 1),
        takeScan: async (email, pages) => { const t = await takeImport(email, aiCtx, pages); return t.ok ? { ticket: t.ticket, left: t.left, show: t.show } : t; },
        refundScan: ticket => refundImport(ticket),
        prepare: prepareForAI, truncatedNote: TRUNCATED_NOTE,
        scanStudy: (buf, type, pets, pages) => scanStudy(buf, type, pets, pages),
        fits: (email, bytes) => fits(email, bytes),
        addUsage: (email, ref, bytes) => addUsage(email, ref, bytes),
        putFile: async (email, name, buf, type) => {
          if (!blobReady()) throw Object.assign(new Error('blob_no_configurado'), { status: 503, code: 'blob_no_configurado' });
          const clean = String(name || 'estudio').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9._-]+/g, '-').slice(-80) || 'estudio';
          return putPrivate(`${folder(email)}/${randomBytes(6).toString('hex')}-${clean}`, buf, type);
        },
      },
    });
  }

  /* avisos: push en este celu, mail y qué avisar */
  if (q.notify) {
    const n = await getNotify(s.email);
    /* si el push no está configurado en producción, el resto (mail y tipos) sigue andando */
    const key = async () => { try { return (await getVapid()).publicKey; } catch { return null; } };
    const view = async () => { const publicKey = await key(); return { publicKey, pushReady: Boolean(publicKey), devices: n.subs.length, mail: n.mail, off: n.off, tz: n.tz, endpoints: n.subs.map(x => x.endpoint.slice(-24)) }; };
    if (req.method === 'GET') return res.status(200).json(await view());
    if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
    const b = await readBody(req);
    if (b.sub) { const sub = cleanSub(b.sub); if (!sub) return res.status(400).json({ error: 'invalid' }); n.subs = [...n.subs.filter(x => x.endpoint !== sub.endpoint), sub].slice(-6); }
    if (typeof b.remove === 'string') n.subs = n.subs.filter(x => x.endpoint !== b.remove);
    if (typeof b.mail === 'boolean') n.mail = b.mail;
    if (b.off && typeof b.off === 'object') n.off = Object.fromEntries(KINDS.map(k => [k, Boolean(b.off[k])]));
    /* zona horaria del navegador, para mandar los avisos a las 9 de la persona */
    if (cleanTz(b.tz)) n.tz = cleanTz(b.tz);
    await saveNotify(n);
    if (b.test) await pushTo(n, { title: 'Listo, los avisos andan', body: 'Así te vamos a avisar antes de cada vacuna, pipeta o bolsa de alimento.', url: '/mascotas', tag: 'test' });
    return res.status(200).json(await view());
  }

  /* Preguntale a Mimitos: tope propio, contexto armado acá desde el doc de la cuenta */
  if (q.ask) {
    return handleAsk(req, res, {
      email: s.email,
      body: req.method === 'POST' ? await readBody(req) : {},
      getDoc: async () => withSitterLogs((await kvGet(docKey(s.email))) || { pets: [] }),
      getScans: async () => ((await kvGet(scansKey(s.email))) || []).filter(x => Date.parse(x.at) > Date.now() - SCAN_DAYS * 864e5).slice(-MAX_SCANS),
      getTz: async () => (await getNotify(s.email)).tz,
      gate: async () => (await isExpired()) ? await expiredBody() : null,
    });
  }

  if (req.method === 'GET' && q.file) {
    const ref = String(q.file);
    if (/\.\.|\/\//.test(ref)) return res.status(400).json({ error: 'invalid' });
    if (!isBlobRef(ref) || !refPath(ref).startsWith(folder(s.email) + '/')) return res.status(403).json({ error: 'forbidden' });
    try { return res.redirect(302, await signedGet(refPath(ref), { minutes: 10 })); }
    catch { return res.status(500).json({ error: 'no_pudimos_abrir' }); }
  }
  if (req.method === 'GET') {
    const doc = await withSitterLogs((await kvGet(docKey(s.email))) || { pets: [], rev: 0 });
    /* estado de los links del cuidador: activo y hasta cuándo, o vencido (la app lo muestra) */
    const sitterLinks = {};
    for (const p of doc.pets || []) {
      if (!p.sitterToken) continue;
      const link = await kvGet(sitterKey(p.sitterToken));
      sitterLinks[p.id] = link && !sitterExpired(p, link) ? { active: true, until: sitterUntil(p, link) } : { active: false, expired: true };
    }
    const scans = ((await kvGet(scansKey(s.email))) || []).filter(x => Date.parse(x.at) > Date.now() - SCAN_DAYS * 864e5).slice(-MAX_SCANS);
    const ai = await aiStatus(s.email, aiCtx).catch(() => null);
    const renew = ai?.expired ? await renewInterest(s.email).catch(() => false) : false;
    const paused = await aiPaused().catch(() => false);
    return res.status(200).json({ access: 'full', purchase, email: s.email, doc, scans, ai: ai ? { ...ai, paused } : ai, renew, sitterLinks });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  const body = await readBody(req);

  /* "Avisame cuando pueda renovar": solo guarda el interés; todavía no hay checkout de renovación */
  if (q.renew) {
    await saveRenewInterest(s.email);
    return res.status(200).json({ ok: true, renew: true });
  }

  if (q.photo) {
    const data = String(body.data || '');
    if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(data)) return res.status(400).json({ error: 'invalid' });
    if (data.length > MAX_IMG) return res.status(413).json({ error: 'too_big' });
    /* cupo propio de fotos (20 MB dentro de los 200) y 30 por día */
    if (!(await photoFits(s.email, data.length))) return res.status(413).json({ error: 'cupo_lleno', quota: QUOTA_BYTES, photoQuota: PHOTO_QUOTA_BYTES });
    if (!(await dailyCount('photo', s.email, PHOTOS_PER_DAY))) return res.status(429).json({ error: 'limite_diario', limit: PHOTOS_PER_DAY });
    const iid = randomBytes(10).toString('hex');
    await kvSet(imgKey(iid), data);
    await addUsage(s.email, photoRef(iid), data.length);
    return res.status(200).json({ u: `/api/mascotas?img=${iid}` });
  }

  /* estudios: el archivo viaja del navegador a Blob privado, en la carpeta de esta cuenta */
  if (q.upload) {
    if (!blobReady()) return res.status(503).json({ error: 'blob_no_configurado' });
    const size = Number(body.size);
    if (!Number.isFinite(size) || size <= 0) return res.status(400).json({ error: 'tamano_invalido' });
    if (size > MAX_UPLOAD) return res.status(413).json({ error: 'too_big' });
    if (!/^(image\/(jpeg|png|webp|heic|heif)|application\/pdf)$/.test(String(body.type || ''))) return res.status(400).json({ error: 'tipo_no_permitido' });
    const clean = String(body.name || 'estudio').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9._-]+/g, '-').slice(-80) || 'estudio';
    if (!(await fits(s.email, size))) return res.status(413).json({ error: 'cupo_lleno', quota: QUOTA_BYTES });
    if (!(await dailyCount('upload', s.email, UPLOADS_PER_DAY))) return res.status(429).json({ error: 'limite_diario', limit: UPLOADS_PER_DAY });
    const pathname = `${folder(s.email)}/${randomBytes(6).toString('hex')}-${clean}`;
    /* la URL firmada no acepta más que lo declarado; igual, al usar el archivo se mira el tamaño real en Blob */
    try {
      const url = await signedPut(pathname, { maxBytes: Math.ceil(size), minutes: 15 });
      const ref = makeRef(pathname);
      await addUsage(s.email, ref, size);
      await addPending(s.email, ref, size);
      return res.status(200).json({ url, ref });
    } catch { return res.status(500).json({ error: 'no_pudimos_firmar' }); }
  }

  /* leer un estudio ya subido a Blob (foto o PDF): devuelve los datos para revisar; no guarda nada */
  if (q.studyscan) {
    const ref = String(body.ref || '');
    if (!isBlobRef(ref) || /\.\.|\/\//.test(ref) || !refPath(ref).startsWith(folder(s.email) + '/')) return res.status(403).json({ error: 'forbidden' });
    const stop = await checkImport(s.email, aiCtx, 1); if (stop) return res.status(stop.status).json(stop);
    if (await aiPaused()) return res.status(503).json(pausedBody());
    /* primera vez que se usa: tamaño real en Blob al cupo (si es mayor que el declarado, se borra y se rechaza) */
    const ver = await verifyUploads(s.email, [ref]);
    if (!ver.ok) return res.status(422).json({ error: ver.error });
    let took = null;
    try {
      const f = await fetch(await signedGet(refPath(ref), { minutes: 5 }));
      if (!f.ok) return res.status(404).json({ error: 'archivo_no_encontrado' });
      const ext = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[(ref.split('.').pop() || '').toLowerCase()];
      let type = String(f.headers.get('content-type') || '').split(';')[0];
      if (!/^(image\/|application\/pdf)/.test(type) && ext) type = ext;
      if (!/^(image\/(jpeg|png|webp|gif)|application\/pdf)$/.test(type)) return res.status(415).json({ error: 'tipo_no_legible' });
      const buf = Buffer.from(await f.arrayBuffer());
      if (buf.length > 20 * 1024 * 1024) return res.status(413).json({ error: 'too_big' });
      /* PDF de más de 20 páginas: a la IA van las primeras 20; el archivo completo ya está guardado */
      const prep = await prepareForAI(buf, type);
      took = await takeImport(s.email, aiCtx, prep.pages);
      if (!took.ok) { const t = took; took = null; return res.status(t.status).json(t); }
      const out = await scanStudy(prep.buf, type, null, prep.pages);
      return res.status(200).json({ ...out, ...(prep.truncated ? { truncated: true, pages: prep.total, note: TRUNCATED_NOTE } : {}), quota: { left: took.left, show: took.show } });
    } catch (e) {
      /* se devuelve solo si la IA no cobró (sin respuesta 200) */
      if (took?.ok && e?.billed === false) await refundImport(took.ticket).catch(() => {});
      if (e?.code === 'ai_paused') return res.status(503).json(pausedBody());
      return res.status(e.status || 502).json({ error: e.message || 'ia_error', ...(e.message === 'pdf_ilegible' ? { message: PDF_UNREADABLE } : {}) });
    }
  }

  /* leer la libreta con IA: devuelve registros para que la persona los revise; no guarda nada */
  if (q.scan) {
    const images = (Array.isArray(body.images) ? body.images : []).filter(x => /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(x || '') && x.length < 1.6e6).slice(0, 4);
    if (!images.length) return res.status(400).json({ error: 'sin_fotos' });
    if (await aiPaused()) return res.status(503).json(pausedBody());
    /* las fotos de la libreta (hasta 4) son un documento: una importación, una página por foto */
    const took = await takeImport(s.email, aiCtx, images.length);
    if (!took.ok) return res.status(took.status).json(took);
    try {
      const out = await scanBooklet(images, str(body.species, 10));
      return res.status(200).json({ ...out, quota: { left: took.left, show: took.show } });
    } catch (e) {
      if (e?.billed === false) await refundImport(took.ticket).catch(() => {});
      if (e?.code === 'ai_paused') return res.status(503).json(pausedBody());
      return res.status(e.status || 502).json({ error: e.message || 'ia_error' });
    }
  }

  if (q.scanclear) {
    const keep = String(body.petId || '');
    const list = keep ? ((await kvGet(scansKey(s.email))) || []).filter(x => x.petId !== keep) : [];
    if (list.length) await kvSet(scansKey(s.email), list, SCAN_DAYS * 86400); else await kvDel(scansKey(s.email));
    return res.status(200).json({ ok: true, scans: list });
  }

  const current = (await kvGet(docKey(s.email))) || { pets: [], rev: 0 };

  if (q.share || q.unshare || q.sitter || q.unsitter) {
    const pet = current.pets.find(p => p.id === String(body.petId || ''));
    if (!pet) return res.status(404).json({ error: 'not_found' });
    const field = q.share || q.unshare ? 'share' : 'sitterToken';
    const keyOf = field === 'share' ? shareKey : sitterKey;
    /* un link del cuidador vencido (o ya apagado solo) no se devuelve: se crea uno nuevo */
    if (field === 'sitterToken' && pet[field] && !(q.unsitter)) {
      const link = await kvGet(sitterKey(pet[field]));
      if (!link || sitterExpired(pet, link)) { await kvDel(sitterKey(pet[field])); await kvDel(sitterLogKey(pet[field])); pet[field] = ''; }
    }
    if (q.unshare || q.unsitter) {
      if (pet[field]) { await kvDel(keyOf(pet[field])); if (field === 'sitterToken') await kvDel(sitterLogKey(pet[field])); }
      pet[field] = '';
    } else if (!pet[field]) {
      pet[field] = randomBytes(9).toString('base64url');
      await kvSet(keyOf(pet[field]), { email: s.email, petId: pet.id, at: new Date().toISOString() });
    }
    await kvSet(docKey(s.email), bump(current));
    const link = field === 'sitterToken' && pet[field] ? await kvGet(sitterKey(pet[field])) : null;
    return res.status(200).json({ token: pet[field], doc: current, ...(link ? { until: sitterUntil(pet, link) } : {}) });
  }

  /* guardar la libreta */
  if ((body.rev ?? 0) !== (current.rev || 0)) return res.status(409).json({ error: 'conflict', doc: current });
  const clean = cleanDoc(body.doc, s.email);
  /* archivos subidos que se usan por primera vez: tamaño real al cupo (o se borran y se rechaza el guardado) */
  const ver = await verifyUploads(s.email, clean.pets.flatMap(p => p.studies.flatMap(x => x.files.map(f => f.ref))));
  if (!ver.ok) return res.status(422).json({ error: ver.error, ref: ver.ref });
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
    if (old.sitterToken) { await kvDel(sitterKey(old.sitterToken)); await kvDel(sitterLogKey(old.sitterToken)); }
  }
  const next = bump({ ...clean, rev: current.rev || 0 });
  if (JSON.stringify(next).length > MAX_DOC) return res.status(413).json({ error: 'too_big' });
  await kvSet(docKey(s.email), next);
  /* fotos y estudios que ya no usa ningún registro ni mascota: a la papelera y, pasado el rato de gracia, se borran */
  await sweep(s.email, next).catch(e => console.error('[mimitos] limpieza de archivos', e?.message));
  return res.status(200).json({ ok: true, doc: next });
}
