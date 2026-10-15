/* Mimitos · "Conectar tu mail": motor común para traer estudios veterinarios desde el mail personal
   (Gmail en petgmail.js, Outlook/Hotmail/Live/Microsoft 365 en petoutlook.js) al historial clínico,
   por el mismo camino que "Subir estudios": Blob privado + lectura con IA + revisión antes de guardar.

   Cada proveedor es un adaptador con: config, authUrl, exchange, refresh, revoke, list, candidate,
   find y download. Este módulo pone lo que es igual para todos:
   - quién puede usarlo: todos los compradores, salvo que MIMITOS_MAIL_ALLOW tenga una lista (más admin),
     el interruptor MIMITOS_GMAIL_OPEN y el cupo de Gmail sin verificar (MIMITOS_GMAIL_CAP);
   - el refresh token CIFRADO con AES-256-GCM (MIMITOS_TOKEN_KEY), atado a la cuenta de Orbit;
   - el state anti-CSRF firmado con la sesión, guardado en KV, de un solo uso (con PKCE si el proveedor lo usa);
   - la consulta (términos veterinarios + nombres de mascotas y veterinarias del doc);
   - la búsqueda por tandas con cursor firmado, tope de 200 mails y 8 s por llamada;
   - candidatos, dedupe, cola cuando no queda tope de IA, sugerencia de mascota y desconexión.

   Qué se guarda por proveedor (orbit:pet<proveedor>:<email de Orbit>), y nada más: el token cifrado,
   la dirección conectada, el rango, la fecha de la última búsqueda, los ids importados y la cola.
   Asunto, remitente y nombres de adjuntos viajan al navegador para elegir y se descartan.
   El cuerpo del mail SÍ se lee, pero solo de los mails que ya parecen veterinarios y no traen adjunto,
   para buscar el link al estudio (P.body: Gmail format=full / Graph body). No se guarda, no se loguea y no
   sale de la función de búsqueda o importación; del link se loguea solo el host. */
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { kvGet, kvSet, kvDel, kvSAdd, kvSIsMember, kvSCard } from './kv.js';
import { isAdmin } from './admin.js';
import { extractLinks, safeFetch, isLinkPart, reasonOf, hostOf } from './petlinks.js';

export const MAX_MESSAGES = 200;       // mails revisados por búsqueda
export const PAGE = 50;                // mails por página del listado
export const TIME_BUDGET_MS = 8000;    // cada llamada corta antes y devuelve un cursor para seguir
const PARALLEL = 10;
export const MAX_FILE = 15 * 1024 * 1024;
export const MIN_IMG = 20 * 1024;      // imágenes más chicas suelen ser logos o firmas
const MAX_IMPORTED = 3000, MAX_QUEUE = 100;
const STATE_TTL = 600;

export const RANGES = { '12m': 365, '3y': 3 * 365, all: 0 };   // días hacia atrás (0 = todo)
/* Relevancia. Un mail solo entra si tiene (a) una señal veterinaria, (b) un remitente conocido o
   (c) un remitente que la persona agregó a mano. Los términos genéricos (análisis, informe, resultado,
   receta…) suman puntos para ordenar, pero nunca alcanzan solos: así un "certificado de laboratorio
   de IA" no se cuela. No suponemos que el proveedor ignore acentos: van las dos variantes.
   Lo que se mide (set etiquetado en test/fixtures/mail-eval.json, script scripts/mimitos-mail-eval.mjs) manda:
   cada cambio de términos o pesos se corre contra ese set antes de subirlo. */
export const VET_TERMS = ['veterinaria', 'veterinario', 'veterinarias', 'veterinarios', 'veterinary', 'vet', 'clínica veterinaria', 'clinica veterinaria', 'mascota', 'mascotas',
  'canino', 'canina', 'felino', 'felina', 'perro', 'perra', 'gato', 'gata', 'cachorro', 'cachorra', 'antirrábica', 'antirrabica', 'vacuna', 'vacunas',
  'vacunación', 'vacunacion', 'desparasitación', 'desparasitacion', 'desparasitante', 'antiparasitario', 'zoonosis'];
/* solo para el puntaje (no van a la consulta, para no traer más ruido): plurales y diminutivos */
const VET_EXTRA = ['caninos', 'caninas', 'felinos', 'felinas', 'perros', 'perras', 'gatos', 'gatas', 'cachorros', 'perrito', 'perrita', 'gatito', 'gatita', 'antirrabicas', 'antirrábicas', 'especie'];
/* "vacuna" también es de personas (antigripal, calendario del bebé): sola no alcanza */
const VET_WEAK = ['vacuna', 'vacunas', 'vacunación', 'vacunacion'];
export const BREEDS = ['caniche', 'labrador', 'golden', 'bulldog', 'beagle', 'boxer', 'ovejero', 'pastor alemán', 'pastor aleman', 'dogo', 'yorkshire', 'schnauzer',
  'chihuahua', 'salchicha', 'border collie', 'pitbull', 'rottweiler', 'mestizo', 'mestiza', 'siamés', 'siames', 'persa', 'maine coon', 'bengalí', 'bengali'];
export const GENERIC = ['laboratorio', 'análisis', 'analisis', 'hemograma', 'ecografía', 'ecografia', 'radiografía', 'radiografia', 'estudio', 'estudios',
  'resultado', 'resultados', 'receta', 'informe', 'orina', 'bioquímica', 'bioquimica', 'placa', 'perfil'];
/* términos clínicos: suman como lo genérico y le dan contexto al nombre de la mascota */
const CLINICAL = [...GENERIC, 'bioquímico', 'bioquimico', 'urianálisis', 'urianalisis', 'coproparasitológico', 'coproparasitologico', 'copro', 'citología', 'citologia',
  'histopatológico', 'histopatologico', 'serología', 'serologia', 'cultivo', 'raspaje', 'ecocardiograma', 'electrocardiograma', 'ecg', 'tomografía', 'tomografia', 'eco', 'rx',
  'placas', 'imágenes', 'imagenes', 'consulta', 'historia clínica', 'historia clinica', 'alta', 'indicaciones', 'tratamiento', 'cirugía', 'cirugia', 'quirúrgico', 'quirurgico',
  'prequirúrgico', 'prequirurgico', 'prequirúrgicas', 'prequirurgicas', 'castración', 'castracion', 'carnet', 'libreta', 'orden', 'protocolo', 'test', 'fiv', 'felv', 'leishmania'];
/* sin adjunto, el mail se muestra (y se lee el cuerpo para buscar el link) solo si anuncia un resultado */
const RESULTISH = ['resultado', 'resultados', 'estudio', 'estudios', 'informe', 'informes', 'disponible', 'disponibles', 'análisis', 'analisis', 'protocolo', 'hemograma',
  'radiografía', 'radiografia', 'ecografía', 'ecografia', 'imágenes', 'imagenes', 'placas', 'receta'];
const NO_DOC = ['turno', 'turnos', 'recordatorio', 'recordá', 'recorda', 'confirmación', 'confirmacion', 'horarios'];
/* lo que dice que el adjunto es un documento clínico: sin esto, una factura o un recibo no entra aunque venga de la veterinaria */
const DOC = [...RESULTISH, 'receta', 'indicaciones', 'certificado', 'constancia', 'libreta', 'historia clínica', 'historia clinica', 'presupuesto', 'orden'];
/* el remitente es un lugar de salud: le da contexto al nombre de la mascota ("Simón" que manda "Clínica San Martín") */
const PLACE = ['clínica', 'clinica', 'laboratorio', 'hospital', 'centro médico', 'centro medico', 'consultorio'];
export const BASE_TERMS = VET_TERMS;
/* asuntos que anuncian un estudio ("Radiografia", "Informe", "Radiografias de Aika"): con un adjunto, el mail se pide
   aunque no diga "veterinaria" ni el nombre (muchas veterinarias mandan desde noreply@ con el asunto pelado).
   El puntaje después decide: sin señal veterinaria ni de la mascota, no se muestra */
export const DOC_SUBJECTS = ['radiografia', 'radiografias', 'radiografía', 'radiografías', 'placa', 'placas', 'ecografia', 'ecografias', 'ecografía', 'ecografías', 'ecocardiograma', 'electrocardiograma', 'cardio', 'informe', 'informes', 'estudio', 'estudios', 'resultado', 'resultados', 'analisis', 'análisis', 'hemograma', 'receta', 'protocolo', 'biopsia', 'citologia', 'citología'];   // lo que va a la consulta del proveedor (sin genéricos)
/* señales en contra, por familia (cada una con su peso). "certificado" no resta si el asunto es veterinario
   o nombra a la mascota (certificado de vacunación antirrábica, CVI de SENASA) */
const NEG = {
  plata: { w: 4, t: ['factura', 'recibo', 'comprobante', 'pago', 'pedido', 'compra', 'compraste', 'cotización', 'cotizacion', 'liquidación', 'liquidacion', 'reserva', 'envío', 'envio',
    'catálogo', 'catalogo', 'descuento', 'descuentos', 'off', 'oferta', 'ofertas', 'promo', 'promoción', 'promocion', 'cupón', 'cupon', 'gratis', 'gratuita', 'gratuitas', 'gratuito', 'sorteo',
    'asegurá', 'asegura', 'seguro', 'póliza', 'poliza', 'suscripción', 'suscripcion', 'newsletter', 'boletín', 'boletin', 'postulate', 'empleo', 'búsqueda laboral', 'guardería', 'guarderia', 'paseos', 'peluquería', 'peluqueria',
    'shop', 'petshop', 'tienda', 'campaña', 'campana', 'lanzamiento', 'encuesta'] },
  formacion: { w: 3, t: ['certificado', 'curso', 'diploma', 'diplomatura', 'webinar', 'congreso', 'jornada', 'inscripción', 'inscripcion', 'programa', 'examen', 'trabajo práctico', 'trabajo practico',
    'tp', 'facu', 'artículos', 'articulos', 'capacitación', 'capacitacion'] },
  personas: { w: 5, t: ['obra social', 'prepaga', 'afiliado', 'afiliada', 'osde', 'swiss medical', 'galeno', 'medifé', 'medife', 'ioma', 'pami', 'dni', 'médico solicitante', 'medico solicitante',
    'pediatría', 'pediatria', 'pediátrico', 'pediatrico', 'antigripal', 'covid', 'odontología', 'odontologia', 'dental', 'sanatorio', 'clínica médica', 'clinica medica', 'mamaria', 'ginecología', 'ginecologia'] },
  social: { w: 3, t: ['te mencionó', 'te menciono', 'comentario', 'publicación', 'publicacion', 'seguidores', 'me gusta', 'te etiquetó', 'te etiqueto',
    'feliz', 'cumple', 'cumpleaños', 'cumpleanos', 'saludo', 'saludos', 'ganó', 'gano', 'ganador', 'ganadora', 'invitó', 'invito', 'evento'] },
};
/* estas familias, sin nada en el asunto que diga "documento clínico", dejan el mail afuera aunque venga de la veterinaria */
const VETO = ['plata', 'social', 'formacion'];
/* logos, firmas y banners: no son estudios aunque pesen más de MIN_IMG */
const DECOR = /(^|[^a-z])(logo|logos|firma|signature|banner|header|footer|icon|icono|facebook|instagram|twitter|linkedin|whatsapp-icon)([^a-z]|$)/;
const NOT_VET_WORD = new Set(['velvet', 'corvette', 'duvet', 'rivet', 'civet', 'brevet', 'vette']);
/* casillas públicas: su dominio no identifica a nadie, así que ahí solo vale la dirección exacta */
const PUBLIC_MAIL = /^(gmail|googlemail|hotmail|outlook|live|msn|yahoo|icloud|me|aol|proton|protonmail)\./;

const sKey = nonce => `orbit:petmstate:${nonce}`;

/* ---------- quién puede usarlo ----------
   Variables (todas opcionales; cambiar una en Vercel pide "Redeploy" del mismo código, sin tocar código):
   - MIMITOS_MAIL_ALLOW: vacía = todos los compradores (Gmail y Outlook). Con mails (separados por coma,
     punto y coma o renglón) = solo esa lista, para los dos proveedores (modo prueba / preview).
   - MIMITOS_GMAIL_OPEN: "0", "false", "no" u "off" cierra Gmail y vuelve a la lista: solo MIMITOS_GMAIL_ALLOW
     y admin. Outlook no se toca. Vacía o cualquier otro valor = abierto.
   - MIMITOS_GMAIL_CAP: cuántas cuentas de Orbit distintas pueden conectar Gmail mientras Google no verifique
     la app (Google corta en 100 usuarios en toda la vida del proyecto y no se resetea). 90 por defecto.
   Admin siempre entra y no cuenta para el cupo. */
const norm = e => String(e || '').replace(/\s+/g, '').toLowerCase();
const listOf = v => String(v || '').split(/[,;\n]+/).map(norm).filter(Boolean);
export const allowList = () => listOf(process.env.MIMITOS_MAIL_ALLOW);
export const gmailList = () => listOf(process.env.MIMITOS_GMAIL_ALLOW);
export const gmailOpen = () => !/^(0|false|no|off)$/i.test(String(process.env.MIMITOS_GMAIL_OPEN || '').trim());
export function mailAllowed(email, provider) {
  if (!email) return false;
  if (isAdmin(email)) return true;
  const e = norm(email), list = allowList();
  if (list.length) return list.includes(e);
  if (provider === 'gmail' && !gmailOpen()) return gmailList().includes(e);
  return true;
}

/* ---------- cupo de Gmail sin verificar ----------
   Un SET con las cuentas de Orbit que conectaron Gmail alguna vez. No se saca a nadie al desconectar:
   para Google ese usuario ya cuenta. Quien ya está adentro sigue andando aunque el cupo esté lleno. */
export const GMAIL_USERS = 'orbit:petmail:gmail:users';
export const GMAIL_WAIT = 'orbit:petmail:gmail:espera';
export const gmailCap = () => { const n = Math.floor(Number(process.env.MIMITOS_GMAIL_CAP)); return Number.isFinite(n) && n >= 0 && String(process.env.MIMITOS_GMAIL_CAP || '').trim() !== '' ? n : 90; };
const capped = P => P.id === 'gmail';
/* ¿esta cuenta ya cuenta? Las conectadas antes de que existiera el SET se suman acá */
async function counted(email, st) {
  const e = norm(email);
  if (await kvSIsMember(GMAIL_USERS, e)) return true;
  if (st?.tok || st?.connectedAt) { await kvSAdd(GMAIL_USERS, e); return true; }
  return false;
}
export async function capFull(P, email, st) {
  if (!capped(P) || isAdmin(email)) return false;
  if (await counted(email, st)) return false;
  return (await kvSCard(GMAIL_USERS)) >= gmailCap();
}
export async function countUser(P, email) { if (capped(P) && !isAdmin(email)) await kvSAdd(GMAIL_USERS, norm(email)); }
export async function saveInterest(email) { await kvSAdd(GMAIL_WAIT, norm(email)); }

/* ---------- clave y cifrado del token: AES-256-GCM, la cuenta de Orbit va como dato asociado ---------- */
export function tokenKey(raw = process.env.MIMITOS_TOKEN_KEY) {
  const v = String(raw || '').trim();
  if (!v) return null;
  const buf = /^[0-9a-f]{64}$/i.test(v) ? Buffer.from(v, 'hex') : Buffer.from(v.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  return buf.length === 32 ? buf : null;
}
export function seal(text, key, aad) {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  c.setAAD(Buffer.from(String(aad).toLowerCase()));
  const ct = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
  return ['v1', iv.toString('base64url'), c.getAuthTag().toString('base64url'), ct.toString('base64url')].join('.');
}
export function open(sealed, key, aad) {
  const [v, iv, tag, ct] = String(sealed || '').split('.');
  if (v !== 'v1' || !iv || !tag || !ct) throw new Error('token_invalido');
  const d = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
  d.setAAD(Buffer.from(String(aad).toLowerCase()));
  d.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([d.update(Buffer.from(ct, 'base64url')), d.final()]).toString('utf8');
}
/* el mismo host que abrió el flujo: así la cookie de sesión vuelve con el callback (preview o producción) */
export function hostBase(req) {
  const host = String(req?.headers?.['x-forwarded-host'] || req?.headers?.host || '').split(',')[0].trim();
  const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
  return (host ? `${local ? 'http' : 'https'}://${host}` : (process.env.SITE_URL || 'https://www.orbitando.com.ar')).replace(/\/$/, '');
}

/* ---------- state anti-CSRF: firmado con la sesión, guardado en KV, un solo uso ---------- */
const mac = (secret, data) => createHmac('sha256', secret).update(data).digest('base64url');
export async function makeState(email, range, provider = 'gmail', secret = process.env.SESSION_SECRET || '') {
  const nonce = randomBytes(18).toString('base64url');
  const verifier = randomBytes(32).toString('base64url');   // PKCE, para el proveedor que lo use
  await kvSet(sKey(nonce), { email: String(email).toLowerCase(), range, provider, verifier }, STATE_TTL);
  return { state: `${nonce}.${mac(secret, `${provider}|${nonce}|${String(email).toLowerCase()}`)}`, challenge: createHash('sha256').update(verifier).digest('base64url') };
}
export async function checkState(state, email, provider = 'gmail', secret = process.env.SESSION_SECRET || '') {
  const [nonce, sig] = String(state || '').split('.');
  if (!nonce || !sig || !/^[A-Za-z0-9_-]{20,40}$/.test(nonce)) return null;
  const want = Buffer.from(mac(secret, `${provider}|${nonce}|${String(email).toLowerCase()}`)), got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  const saved = await kvGet(sKey(nonce));
  if (!saved || saved.email !== String(email).toLowerCase() || saved.provider !== provider) return null;
  await kvDel(sKey(nonce));   // un solo uso
  return { range: RANGES[saved.range] !== undefined ? saved.range : '3y', verifier: saved.verifier };
}

/* cursor de búsqueda: viaja al navegador y vuelve, firmado para que no se pueda cambiar la consulta */
export function signCursor(obj, email, secret = process.env.SESSION_SECRET || '') {
  const p = Buffer.from(JSON.stringify(obj)).toString('base64url');
  return `${p}.${mac(secret, `cur|${p}|${String(email).toLowerCase()}`)}`;
}
export function readCursor(c, email, secret = process.env.SESSION_SECRET || '') {
  const [p, sig] = String(c || '').split('.');
  if (!p || !sig) return null;
  const want = Buffer.from(mac(secret, `cur|${p}|${String(email).toLowerCase()}`)), got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try { return JSON.parse(Buffer.from(p, 'base64url').toString()); } catch { return null; }
}

/* ---------- términos de búsqueda ---------- */
/* nombre seguro para meter entre comillas: letras, números, espacios y . ' - */
export const term = v => String(v || '').normalize('NFC').replace(/["()\\{}:]/g, ' ').replace(/[^\p{L}\p{N} .'-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);
export function namesOf(doc) {
  const pets = [], vets = [];
  for (const p of doc?.pets || []) {
    pets.push(p.name);
    vets.push(p.vet?.name, p.vet?.er);
    for (const r of p.records || []) vets.push(r.vet);
    for (const v of p.visits || []) vets.push(v.vet);
    for (const x of p.studies || []) vets.push(x.lab);
  }
  const seen = new Set(), out = [];
  for (const n of [...pets, ...vets].map(term)) {
    const k = n.toLowerCase();
    if (n.length < 3 || /^sin nombre$/i.test(n) || seen.has(k)) continue;
    seen.add(k); out.push(n);
  }
  return out.slice(0, 20);
}
/* ---------- remitentes conocidos: los que la persona escribió a mano y los de lo que ya importó (compartido entre proveedores) ---------- */
const sendersKey = email => `orbit:petmailsenders:${String(email).toLowerCase()}`;
export const cleanSender = v => {
  const t = String(v || '').trim().toLowerCase().replace(/^mailto:/, '');
  if (/^[^\s@<>"]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(t)) return t;                    // mail exacto
  if (/^@?[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(t)) return t.replace(/^@/, '');         // dominio
  return term(v);                                                                   // nombre ("Panda")
};
/* manual: escritos a mano · learned: remitentes de lo que importó · muted: "No es de la mascota".
   De los silenciados se guarda solo la dirección (nunca asunto ni cuerpo), como de los aprendidos. */
export async function getSenders(email) {
  const s = (await kvGet(sendersKey(email))) || {};
  return { manual: Array.isArray(s.manual) ? s.manual.slice(0, 20) : [], learned: Array.isArray(s.learned) ? s.learned.slice(-50) : [], muted: Array.isArray(s.muted) ? s.muted.slice(-100) : [] };
}
/* "Empezar de cero" (api/_lib/petreset.js): borra los remitentes escritos a mano, aprendidos y silenciados */
export async function clearSenders(email) { await kvDel(sendersKey(email)); }
export async function saveSenders(email, s) { await kvSet(sendersKey(email), { manual: s.manual.slice(0, 20), learned: s.learned.slice(-50), muted: (s.muted || []).slice(-100) }); }
const domainOf = from => { const d = addrOf(from).split('@')[1] || ''; return PUBLIC_MAIL.test(d) ? '' : d; };
const addrOf = from => { const m = /<([^>]+)>/.exec(String(from || '')); return (m ? m[1] : String(from || '')).trim().toLowerCase(); };
const okAddr = a => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a);
/* qué se guarda al tocar "No es de la mascota": la dirección exacta, no el dominio. Así una promo de la
   veterinaria no silencia los resultados que la misma veterinaria manda desde otra casilla */
export const muteKey = from => { const a = addrOf(from); return okAddr(a) ? a.slice(0, 120) : ''; };
export async function learnSender(email, from) {
  const a = addrOf(from); if (!okAddr(a)) return;
  const s = await getSenders(email);
  if (s.learned.includes(a) && !s.muted.includes(a)) return;
  if (!s.learned.includes(a)) s.learned.push(a);
  s.muted = s.muted.filter(x => x !== a);   // si lo importó, no estaba bien silenciado
  await saveSenders(email, s);
}
/* un remitente conocido (la veterinaria de la ficha, uno aprendido o agregado a mano) no se silencia: se perderían
   sus estudios. Se devuelve { known: true } y la app explica que alcanza con no elegir ese mail */
export async function muteSender(email, from, doc) {
  const a = muteKey(from); if (!a) return null;
  const s = await getSenders(email);
  if (knownOf(from, relContext(doc, s))) return { ...s, known: true };
  if (!s.muted.includes(a)) s.muted.push(a);
  s.learned = s.learned.filter(x => x !== a);
  await saveSenders(email, s);
  return s;
}
export async function unmuteSender(email, v) {
  const a = String(v || '').trim().toLowerCase();
  const s = await getSenders(email);
  s.muted = s.muted.filter(x => x !== a);
  await saveSenders(email, s);
  return s;
}
/* todo lo que identifica a "su" veterinaria: nombres cargados en el doc, remitentes aprendidos y los escritos a mano */
export function relContext(doc, senders = { manual: [], learned: [] }) {
  const known = [];
  const add = (v, manual, learned) => {
    const c = cleanSender(v); if (!c || c.length < 3 || /^sin nombre$/i.test(c)) return;
    const t = c.includes('@') ? 'email' : /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(c) ? 'domain' : 'name';
    if (!known.some(k => k.t === t && k.v === (t === 'name' ? fold(c) : c))) known.push({ t, v: t === 'name' ? fold(c) : c, manual: Boolean(manual), learned: Boolean(learned) });
  };
  for (const p of doc?.pets || []) {
    for (const v of [p.vet?.name, p.vet?.er, ...(p.records || []).map(r => r.vet), ...(p.visits || []).map(v => v.vet), ...(p.studies || []).map(x => x.lab)]) add(v, false, false);
  }
  for (const v of senders.learned || []) add(v, false, true);
  for (const v of senders.manual || []) add(v, true, false);
  const pets = [...new Set((doc?.pets || []).map(p => fold(term(p.name))).filter(n => n.length >= 3 && n !== 'sin nombre'))];
  const breeds = [...new Set([...BREEDS, ...(doc?.pets || []).map(p => p.breed)].map(b => fold(term(b))).filter(b => b.length >= 4))];
  /* nombre del tutor (de la ficha): "paciente BENITEZ" sin la mascota es un estudio de la persona */
  const owner = [...new Set((doc?.pets || []).flatMap(p => fold(term(p.contact?.name)).split(' ')).filter(w => w.length >= 4))];
  const muted = [...new Set((senders.muted || []).map(x => String(x).toLowerCase()))];
  return { pets, breeds, known, owner, muted, vet: [...new Set(VET_TERMS.map(fold))], vetExtra: [...new Set(VET_EXTRA.map(fold))] };
}
/* ¿cuánto se parece a un mail veterinario? Solo remitente, asunto, nombres de archivo y lo que el proveedor ya
   da como metadato (categoría de Gmail, encabezado List-Unsubscribe); nunca el cuerpo.
   Pesos por campo: remitente conocido o aprendido > asunto > nombre del adjunto > nombre del remitente.
   El nombre de la mascota cuenta solo con contexto veterinario o clínico, o si lo manda un remitente conocido:
   "Luna te mandó fotos del cumple" no entra. */
const has = (hay, w) => w && new RegExp(`(^|[^a-z0-9])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`).test(hay);
const count = (hay, list) => list.filter(w => has(hay, fold(w))).length;
const nameOf = from => { const m = /^\s*"?([^"<]*?)"?\s*</.exec(String(from || '')); return m ? m[1] : ''; };
/* el remitente suena a veterinaria: "Rx Vet", "Cardiovet", "@labvetsur…", "@fvet.uba.ar", "@fcv.unlp.edu.ar" */
const vetish = w => !NOT_VET_WORD.has(w) && (/^vet/.test(w) || /vet$/.test(w) || w === 'fcv');
function vetSender(name, domain) {
  const words = fold(name).split(/[^a-z0-9]+/).filter(Boolean);
  const labels = !domain || PUBLIC_MAIL.test(domain) ? [] : domain.split('.').slice(0, -1).flatMap(l => l.split('-'));
  return words.some(vetish) || labels.some(l => vetish(l) || (/vet/.test(l) && !NOT_VET_WORD.has(l)));
}
/* ¿es un remitente conocido? (mail o dominio aprendido o agregado, o el nombre de la veterinaria de la ficha) */
export function knownOf(from, rel) {
  const addr = addrOf(from), domain = addr.split('@')[1] || '';
  return rel.known.find(k => k.t === 'email' ? addr === k.v
    : k.t === 'domain' ? !PUBLIC_MAIL.test(domain) && (domain === k.v || domain.endsWith('.' + k.v))
    : k.v.length >= 4 && has(fold(from), k.v)) || null;
}
const WEAK = VET_WEAK.map(s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase());
export function judge(c, rel) {
  const subj = fold(c.subject), name = fold(nameOf(c.from)), files = fold((c.files || []).map(f => f.name.replace(/[-_.]+/g, ' ')).join(' '));
  const addr = addrOf(c.from), domain = addr.split('@')[1] || '';
  const sf = `${subj} ${files}`;
  const knownHit = knownOf(c.from, rel);
  /* silenciado ("No es de la mascota"): afuera, salvo que sea un remitente conocido (ahí manda conocido) */
  if (!knownHit && (rel.muted || []).includes(addr)) return { score: -10, why: ['silenciado'], minus: ['silenciado'], pass: false, show: '' };
  const knownInText = !knownHit && rel.known.some(k => k.t === 'name' && k.v.length >= 4 && has(sf, k.v));
  const trusted = Boolean(knownHit && (knownHit.manual || knownHit.learned));
  const vetAll = [...rel.vet.filter(w => !WEAK.includes(w)), ...(rel.vetExtra || []), ...rel.breeds];
  const vetSubj = count(subj, vetAll), vetFile = count(files, vetAll), weak = count(sf, WEAK);
  const vetFrom = vetSender(nameOf(c.from), domain) || count(name, vetAll) > 0;
  const clinical = count(sf, CLINICAL);
  /* "Luna Martínez" mandando "Luna te mandó fotos": el nombre de la mascota es el de la persona */
  const homonym = rel.pets.some(n => name.split(' ')[0] === n);
  const petSeen = !homonym && rel.pets.some(n => has(sf, n));
  const vetAny = Boolean(vetSubj + vetFile || vetFrom);
  const petOk = petSeen && Boolean(vetAny || knownHit || knownInText || clinical || weak || count(name, PLACE));
  let score = 0;
  if (knownHit) score += trusted ? 6 : 5;
  if (knownInText) score += 2;
  if (vetSubj) score += 4 + Math.min(vetSubj - 1, 2);
  else if (vetFile) score += 2;
  if (vetFrom) score += 3;
  if (weak) score += 2;
  if (petOk) score += 3;
  score += Math.min(clinical, 2);
  /* en contra: por familia, con tope de dos palabras por familia */
  const text = `${subj} ${files} ${name}`, minus = [];
  let neg = 0;
  for (const [k, f] of Object.entries(NEG)) {
    let n = count(text, f.t);
    /* "certificado de vacunación antirrábica - Luna" sí; "curso de adiestramiento canino - certificado" no */
    if (k === 'formacion' && n === 1 && has(text, 'certificado') && (vetSubj || petSeen)) n = 0;
    if (n > 0) { neg += f.w * Math.min(n, 2); minus.push(k); }
  }
  /* "paciente BENITEZ CARLA" sin la mascota ni nada veterinario en el asunto: es de la persona */
  const ownerHits = (rel.owner || []).filter(w => has(subj, w)).length;
  if (ownerHits && !petSeen && !vetSubj) { const d = has(subj, 'paciente') ? 5 : ownerHits >= 2 ? 3 : 0; if (d) { neg += d; minus.push('persona'); } }
  /* Promociones o Social de Gmail y listas con desuscripción: restan, salvo remitente conocido */
  if (!knownHit && (c.labels || []).some(l => l === 'CATEGORY_PROMOTIONS' || l === 'CATEGORY_SOCIAL')) { neg += 3; minus.push('promociones'); }
  if (!knownHit && c.unsub) { neg += 2; minus.push('lista'); }
  score -= neg;
  const why = [vetAny && 'veterinario', petOk && 'mascota', knownHit && (knownHit.manual ? 'agregado' : 'conocido')].filter(Boolean);
  const signal = vetAny || petOk || knownHit || knownInText || (weak && (clinical || petSeen));
  const pass = Boolean(signal) && score >= 3;
  /* plata (factura, recibo, pedido…), saludos o cursos sin nada en el asunto que diga que es un documento clínico:
     afuera, aunque venga de la veterinaria. Sin adjunto: solo si anuncia un resultado y no es un turno o un
     recordatorio; recién ahí se lee el cuerpo para buscar el link */
  const veto = VETO.some(k => minus.includes(k)) && !count(subj, DOC);
  const show = !pass || veto ? '' : (c.files || []).length ? 'file' : (count(subj, RESULTISH) && !count(subj, NO_DOC) ? 'nofile' : '');
  return { score, why, minus, pass: Boolean(show), show };
}
/* compatibilidad: relevance() es judge() */
export const relevance = judge;
/* para la consulta del proveedor: términos veterinarios, nombres, remitentes conocidos y silenciados */
export function queryParts(doc, senders) {
  const rel = relContext(doc, senders);
  const ok = n => n.length >= 3 && !/^sin nombre$/i.test(n);
  const petNames = [...new Set((doc?.pets || []).map(p => term(p.name)).filter(ok))];
  const names = [...new Set([...petNames, ...(doc?.pets || []).map(p => term(p.breed)).filter(ok)])];
  /* nombres de veterinarias tal como están escritos y sin acento (no suponemos que el proveedor los ignore) */
  const raw = [];
  for (const p of doc?.pets || []) raw.push(p.vet?.name, p.vet?.er, ...(p.records || []).map(r => r.vet), ...(p.visits || []).map(v => v.vet), ...(p.studies || []).map(x => x.lab));
  raw.push(...(senders?.manual || []));
  const knownNames = [...new Set(raw.map(cleanSender).filter(c => c && c.length >= 3 && !c.includes('@') && !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(c) && !/^sin nombre$/i.test(c)).flatMap(c => [c, fold(c)]).map(c => c.toLowerCase()))];
  const muted = rel.muted.filter(a => !knownOf(`<${a}>`, rel));
  return { vet: VET_TERMS, names, petNames, froms: rel.known.filter(k => k.t !== 'name').map(k => k.v), knownNames, muted };
}

/* desde cuándo buscar: "buscar de nuevo" usa la última búsqueda (con un día de margen; lo repetido lo filtra el dedupe) */
export function sinceOf({ range = '12m', after = 0 } = {}, now = Date.now()) {
  if (after) return after;
  const days = RANGES[range] ?? RANGES['12m'];
  return days ? now - days * 864e5 : 0;
}
/* para el modo sin búsqueda de texto: ¿el asunto, el remitente o un adjunto suenan veterinarios? */
const fold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export function matchesTerms(text, doc) {
  return relevance({ subject: text, from: '', files: [] }, relContext(doc)).pass;
}

/* ---------- adjuntos ---------- */
const EXT = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif' };
export const typeOf = (mime, name) => {
  const m = String(mime || '').toLowerCase().split(';')[0].trim();
  if (/^(application\/pdf|image\/(jpeg|png|webp|heic|heif))$/.test(m)) return m;
  if (m === 'image/jpg') return 'image/jpeg';
  return EXT[(String(name || '').split('.').pop() || '').toLowerCase()] || '';
};
export const readable = t => /^(image\/(jpeg|png|webp)|application\/pdf)$/.test(t);
/* ¿vale la pena ofrecerlo? PDF o foto real, con nombre, que entra en el tope */
export function fileOk({ name, type, size }) {
  if (!name || !type || size > MAX_FILE) return false;
  if (type.startsWith('image/')) {
    const n = fold(name).replace(/\.[a-z0-9]+$/, '').replace(/[-_.]+/g, ' ');
    /* logos, firmas, banners y las "image001.png" de la firma de Outlook */
    if (size < MIN_IMG || DECOR.test(n) || (/^image\s?0\d\d$/.test(n) && size < 100 * 1024)) return false;
  }
  return true;
}
/* clave de dedupe: legible si es corta (Gmail), con hash si el proveedor usa ids largos (Outlook) */
export const dedupeKey = (m, part) => { const k = `${m}:${part}`; return k.length <= 64 ? k : 'h:' + createHash('sha256').update(k).digest('hex').slice(0, 32); };

/* ---------- a qué mascota corresponde ---------- */
const hasWord = (hay, w) => w.length >= 3 && new RegExp(`(^|[^a-z0-9])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`).test(hay);
export function suggestPet(pets, ai = {}, extra = '') {
  if (!pets?.length) return '';
  if (pets.length === 1) return pets[0].id;
  const said = fold([ai.petName, extra].join(' ')), sp = fold(ai.species), br = fold(ai.breed), vet = fold(ai.vet || ai.lab);
  let best = '', top = 0, tie = false;
  for (const p of pets) {
    let s = 0;
    if (hasWord(said, fold(p.name))) s += 10;
    if (br && p.breed && (fold(p.breed).includes(br) || br.includes(fold(p.breed)))) s += 3;
    if (sp && /perr|canin/.test(sp) && p.species === 'perro') s += 2;
    if (sp && /gat|felin/.test(sp) && p.species === 'gato') s += 2;
    const vets = [p.vet?.name, ...(p.records || []).map(r => r.vet), ...(p.visits || []).map(v => v.vet), ...(p.studies || []).map(x => x.lab)].map(fold).filter(v => v.length >= 3);
    if (vet && vets.some(v => vet.includes(v) || v.includes(vet))) s += 1;
    if (s > top) { top = s; best = p.id; tie = false; } else if (s === top && s > 0) tie = true;
  }
  return top > 0 && !tie ? best : '';
}

/* ---------- estado guardado ---------- */
export async function getState(P, email) {
  const s = (await kvGet(P.key(email))) || {};
  return { tok: s.tok || '', address: s.address || '', connectedAt: s.connectedAt || '', range: RANGES[s.range] !== undefined ? s.range : '3y', lastSearch: s.lastSearch || '', expired: Boolean(s.expired), imported: Array.isArray(s.imported) ? s.imported : [], queue: Array.isArray(s.queue) ? s.queue : [] };
}
export async function saveState(P, email, s) {
  s.imported = s.imported.slice(-MAX_IMPORTED); s.queue = s.queue.slice(0, MAX_QUEUE);
  await kvSet(P.key(email), s);
}
export const statusView = (P, s, allowed, ready) => ({
  provider: P.id, allowed, ready, connected: Boolean(s.tok), address: s.address, lastSearch: s.lastSearch, range: s.range, expired: s.expired,
  revokes: Boolean(P.revokes), consentUrl: P.consentUrl || '',
  queue: s.queue.map(x => ({ m: x.m, part: x.part, name: x.name, type: x.type })),
});

/* ---------- errores comunes ---------- */
export const fail = (error, status) => Object.assign(new Error(error), { status, code: error });
export const form = o => new URLSearchParams(o).toString();

/* access token de un rato, a partir del refresh token cifrado. Si el proveedor rota el refresh token, se guarda el nuevo */
export async function accessToken(P, email, st, cfg) {
  if (!st.tok) throw fail('mail_no_conectado', 409);
  let refresh;
  try { refresh = open(st.tok, cfg.key, email); } catch { throw fail('mail_vencido', 401); }
  const out = await P.refresh(cfg, refresh);
  if (out.expired) { st.tok = ''; st.expired = true; await saveState(P, email, st); throw fail('mail_vencido', 401); }
  if (!out.access) throw fail('mail_error', 502);
  if (out.refresh && out.refresh !== refresh) { st.tok = seal(out.refresh, cfg.key, email); await saveState(P, email, st); }
  return out.access;
}

/* ---------- búsqueda por tandas ---------- */
export async function search(P, email, doc, st, cfg, body, now = Date.now) {
  const t0 = now();
  let cur = body?.cursor ? readCursor(body.cursor, email) : null;
  if (body?.cursor && (!cur || cur.p !== P.id)) throw fail('cursor_invalido', 400);
  if (!cur) {
    /* "probá con 3 años o Todo": la persona puede ampliar el rango desde el resultado */
    if (body?.range && RANGES[body.range] !== undefined && body.range !== st.range) { st.range = body.range; st.lastSearch = ''; await saveState(P, email, st); }
    const mode = body?.mode === 'new' && st.lastSearch ? 'new' : 'all';
    const after = mode === 'new' ? Date.parse(st.lastSearch) - 864e5 : 0;
    cur = { p: P.id, q: P.query(doc, { range: st.range, after, senders: await getSenders(email) }, t0), page: '', skip: 0, scanned: 0, started: new Date(t0).toISOString(), mode };
  }
  const at = await accessToken(P, email, st, cfg);
  /* lo ya importado y lo que está en cola no se vuelve a ofrecer */
  const imported = new Set([...st.imported, ...st.queue.map(x => dedupeKey(x.m, x.part))]);
  const candidates = [], noFile = [];
  const rel = relContext(doc, await getSenders(email));
  const out = extra => ({ candidates: candidates.sort((a, b) => b.score - a.score), noFile, ...extra });
  for (;;) {
    let list;
    try { list = await P.list(at, cur); }
    catch (e) {
      /* la consulta nueva (15/10) no la aceptó el proveedor: una vez, con la de antes, que ya andaba */
      if (cur.page || cur.legacy || !P.legacyQuery || !['mail_consulta', 'mail_error'].includes(e.code)) throw e;
      console.warn('mimitos mail: consulta nueva rechazada, uso la de antes', P.id, e.code);
      cur.legacy = 1; cur.f = 0;
      cur.q = P.legacyQuery(doc, { range: st.range, after: cur.mode === 'new' && st.lastSearch ? Date.parse(st.lastSearch) - 864e5 : 0, senders: await getSenders(email) }, t0);
      list = await P.list(at, cur);
    }
    const items = list.items || [];
    for (let i = cur.skip; i < items.length;) {
      if (now() - t0 > TIME_BUDGET_MS) return out({ cursor: signCursor({ ...cur, skip: i }, email), more: null, scanned: cur.scanned, done: false });
      /* tope de 200 por búsqueda: se puede seguir con "Buscar más" */
      if (cur.scanned >= MAX_MESSAGES) return out({ cursor: null, more: signCursor({ ...cur, skip: i, scanned: 0 }, email), scanned: cur.scanned, done: true });
      const n = Math.min(P.parallel || PARALLEL, items.length - i, MAX_MESSAGES - cur.scanned);
      const got = await Promise.all(items.slice(i, i + n).map(async it => {
        const c = await P.candidate(at, it, doc, cur);
        if (!c) return null;
        const r = judge(c, rel);
        if (!r.show) return null;
        /* solo los mails que ya parecen veterinarios, no traen el estudio adjunto y anuncian un resultado: se lee el
           cuerpo para buscar el link al estudio (muchos laboratorios mandan un link). No se guarda ni sale de acá */
        if (r.show === 'nofile' && P.body) {
          const b = await P.body(at, c.m).catch(e => { if (e.code === 'mail_vencido' || e.code === 'mail_limite') throw e; return null; });
          if (b) c.links = extractLinks(b, { senderDomain: domainOf(c.from) });
        }
        return { c, r };
      }).map(pr => pr.catch(e => { if (e.code === 'mail_vencido' || e.code === 'mail_limite') throw e; return null; })));
      for (const g of got) {
        if (!g) continue;
        const { c, r } = g;
        const links = (c.links || []).filter(l => !imported.has(dedupeKey(c.m, l.part))).map(l => ({ part: l.part, name: `Estudio por link · ${l.host}`, type: 'link', size: 0, url: l.url, host: l.host }));
        const files = [...c.files.filter(f => !imported.has(dedupeKey(c.m, f.part))), ...links];
        /* veterinario pero sin adjunto ni link de estudio: se lista aparte para abrirlo en el mail */
        if (!c.files.length && !(c.links || []).length) { if (c.link) noFile.push({ m: c.m, date: c.date, from: c.from, subject: c.subject, link: c.link, score: r.score }); continue; }
        if (files.length) candidates.push({ m: c.m, date: c.date, from: c.from, subject: c.subject, files, link: c.link || '', score: r.score, why: r.why });
      }
      i += n; cur.scanned += n;
    }
    if (!list.next) break;
    if (now() - t0 > TIME_BUDGET_MS) return out({ cursor: signCursor({ ...cur, page: list.next, skip: 0 }, email), more: null, scanned: cur.scanned, done: false });
    if (cur.scanned >= MAX_MESSAGES) return out({ cursor: null, more: signCursor({ ...cur, page: list.next, skip: 0, scanned: 0 }, email), scanned: cur.scanned, done: true });
    cur.page = list.next; cur.skip = 0;
  }
  st.lastSearch = cur.started; st.expired = false;
  await saveState(P, email, st);
  return out({ cursor: null, more: null, scanned: cur.scanned, done: true });
}

/* ---------- importar un adjunto elegido ---------- */
export async function importOne(P, email, st, cfg, body, deps) {
  const m = String(body?.m || ''), part = String(body?.part || '');
  const byLink = isLinkPart(part);
  if (!P.validId(m) || !(byLink || P.validPart(part))) throw fail('invalid', 400);
  const key = dedupeKey(m, part);
  if (st.imported.includes(key)) throw fail('ya_importado', 409);
  const at = await accessToken(P, email, st, cfg);
  let meta, link = null;
  if (byLink) {
    /* la URL nunca viene del navegador: se vuelve a sacar del mail y se busca por su hash */
    const b = P.body ? await P.body(at, m) : null;
    link = b && extractLinks(b, { senderDomain: domainOf(b.from) }).find(l => l.part === part);
    if (!link) throw fail('adjunto_no_encontrado', 404);
    meta = { name: `Estudio por link · ${link.host}`, type: 'application/pdf', size: 1, from: b.from || '' };
  } else {
    meta = await P.find(at, m, part);
    if (!meta || !fileOk(meta)) throw fail('adjunto_no_encontrado', 404);
  }
  const canRead = readable(meta.type);
  /* el tope de IA se mira antes de bajar nada: si no hay lugar, queda en cola */
  if (canRead) {
    const stop = await deps.peekScan(email);
    /* funciones inteligentes vencidas: no se trae nada ni se encola */
    if (stop?.error === 'ai_expired') return { status: 403, body: { error: 'ai_expired', expiredAt: stop.expiredAt || null } };
    if (stop) {
      if (!st.queue.some(x => dedupeKey(x.m, x.part) === key)) st.queue.push({ m, part, name: meta.name, type: meta.type });
      await saveState(P, email, st);
      /* con la IA en pausa (tope global del mes) también queda en cola: body.error = 'ai_paused' */
      return { status: 429, body: { ...stop, queued: true } };
    }
  }
  if (!(await deps.fits(email, meta.size))) throw fail('cupo_lleno', 413);
  let buf;
  if (byLink) {
    try {
      const got = await (deps.fetchLink || safeFetch)(link.url);
      buf = got.buf; meta = { ...meta, name: got.name, type: got.type, size: got.buf.length };
    } catch (e) {
      /* no se importa: se devuelve el motivo real para que la persona sepa qué pasó y lo resuelva a mano */
      const motivo = reasonOf(e.code);
      console.warn('mimitos link:', motivo, e.code || '-', hostOf(link.url));
      throw Object.assign(fail('link_error', 422), { extra: { motivo, host: hostOf(link.url), url: link.url } });
    }
    if (!(await deps.fits(email, buf.length))) throw fail('cupo_lleno', 413);
  } else buf = await P.download(at, m, part, meta);
  if (!buf?.length) throw fail('adjunto_vacio', 422);
  if (buf.length > MAX_FILE) throw fail('too_big', 413);
  const ref = await deps.putFile(email, meta.name, buf, meta.type);
  await deps.addUsage(email, ref, buf.length);
  st.imported.push(key);
  /* el remitente de lo que importó pasa a ser conocido: la próxima búsqueda lo encuentra aunque no diga "veterinaria" */
  if (meta.from) await learnSender(email, meta.from).catch(() => {});
  st.queue = st.queue.filter(x => dedupeKey(x.m, x.part) !== key);
  await saveState(P, email, st);
  const file = { ref, name: meta.name, type: meta.type };
  const only = deps.pets.length === 1 ? deps.pets[0].id : '';
  if (!canRead) return { status: 200, body: { ref: file, data: null, manual: 'tipo_no_legible', petId: only } };
  /* PDF de más de 20 páginas: a la IA van las primeras 20 (el archivo completo ya quedó guardado) */
  let prep = { buf, pages: 1, truncated: false };
  if (deps.prepare) {
    try { prep = await deps.prepare(buf, meta.type); }
    /* pdf-lib no lo pudo abrir (pdf_ilegible) o cortar: queda guardado, sin leer, y no se manda entero */
    catch (e) { return { status: 200, body: { ref: file, data: null, manual: e.message || 'pdf_no_se_pudo_cortar', petId: suggestPet(deps.pets, {}, meta.name) } }; }
  }
  /* el crédito se descuenta recién acá, al mandar el documento a la IA; si la IA falla, se devuelve */
  const took = await deps.takeScan(email, prep.pages);
  if (took?.error) return { status: 200, body: { ref: file, data: null, manual: took.error, limit: took.limit, petId: only } };
  const extra = { ...(prep.truncated ? { truncated: true, pages: prep.total, note: deps.truncatedNote || '' } : {}), ...(took && Number.isFinite(took.left) ? { quota: { left: took.left, show: Boolean(took.show) } } : {}) };
  try {
    const data = await deps.scanStudy(prep.buf, meta.type, deps.pets, prep.pages);
    return { status: 200, body: { ref: file, data, ...extra, petId: suggestPet(deps.pets, { petName: data.pet?.name, species: data.pet?.species, breed: data.pet?.breed, lab: data.lab }, meta.name) } };
  } catch (e) {
    /* el crédito vuelve solo si la IA no cobró (sin respuesta 200); un JSON inválido o cortado ya se cobró */
    if (took?.ticket && deps.refundScan && e?.billed === false) await deps.refundScan(took.ticket).catch(() => {});
    return { status: 200, body: { ref: file, data: null, manual: e.message || 'ia_error', petId: suggestPet(deps.pets, {}, meta.name) } };
  }
}

/* ---------- desconectar: revoca si el proveedor lo permite y borra todo ---------- */
export async function disconnect(P, email, st, cfg) {
  let revoked = false;
  if (P.revokes && st.tok && cfg.key) {
    try { revoked = await P.revoke(cfg, open(st.tok, cfg.key, email)); } catch { /* igual se borra */ }
  }
  await kvDel(P.key(email));
  return { ok: true, revoked, revokes: Boolean(P.revokes), consentUrl: P.consentUrl || '' };
}

/* Desconectar desde el endpoint sin pedir compra, casilla habilitada ni configuración completa:
   se borra lo guardado siempre y se revoca si hay con qué (la clave para abrir el token y un proveedor que revoque). */
export async function disconnectAnyway(P, req, email) {
  const st = await getState(P, email);
  let cfg = { key: null };
  try { cfg = P.config(req); } catch { /* sin configuración: igual se borra */ }
  return disconnect(P, email, st, cfg);
}

/* ---------- handler común ---------- */
const back = (res, to) => { res.setHeader('Location', '/mascotas#/' + to); return res.status(302).end(); };
export async function handleMail(P, req, res, ctx) {
  const q = req.query || {}, action = String(q[P.id]);
  const { email } = ctx;
  const allowed = mailAllowed(email, P.id), cfg = P.config(req);
  const nav = action === 'start' || action === 'callback';
  if (!allowed) return nav ? back(res, 'cuenta') : res.status(403).json({ error: P.id + '_no_habilitado', allowed: false });
  const st = await getState(P, email);

  /* full: Gmail llegó al cupo de Google y esta cuenta todavía no lo había conectado nunca */
  if (action === 'status') { const s = await getSenders(email); return res.status(200).json({ ...statusView(P, st, true, cfg.ready), full: await capFull(P, email, st), senders: s.manual, muted: s.muted }); }
  /* "No es de la mascota": silencia la dirección del remitente para las búsquedas siguientes (los dos proveedores).
     Solo se guarda la dirección. A un remitente conocido no se lo silencia: { known: true } */
  if (action === 'mute' || action === 'unmute') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
    const b = ctx.body || {};
    const s = action === 'mute' ? await muteSender(email, String(b.from || '').slice(0, 200), await ctx.getDoc()) : await unmuteSender(email, String(b.v || '').slice(0, 120));
    if (!s) return res.status(400).json({ error: 'invalid' });
    return res.status(200).json({ muted: s.muted, known: Boolean(s.known), address: action === 'mute' ? muteKey(b.from) : '' });
  }
  /* "Gmail está completo por ahora": se guarda que la cuenta lo quería, para avisarle cuando se libere */
  if (action === 'interest') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
    const full = await capFull(P, email, st);
    if (full) await saveInterest(email);
    return res.status(200).json({ ok: true, full });
  }
  /* "¿De dónde te llegan los estudios?": nombres o mails que la persona agrega a mano (sirven para los dos proveedores) */
  if (action === 'senders') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
    const b = ctx.body || {}, s = await getSenders(email);
    const add = cleanSender(b.add), del = cleanSender(b.remove);
    if (add && add.length >= 3 && !s.manual.some(x => cleanSender(x) === add)) s.manual.push(String(b.add).trim().slice(0, 80));
    if (del) s.manual = s.manual.filter(x => cleanSender(x) !== del);
    await saveSenders(email, s);
    return res.status(200).json({ senders: s.manual });
  }
  if (!cfg.ready) return nav ? back(res, `${P.id}/sinconfig`) : res.status(503).json({ error: P.id + '_no_configurado' });

  if (action === 'start') {
    if (await capFull(P, email, st)) { await saveInterest(email); return back(res, `${P.id}/completo`); }
    const range = RANGES[q.range] !== undefined ? String(q.range) : '3y';
    const { state, challenge } = await makeState(email, range, P.id);
    res.setHeader('Location', P.authUrl(cfg, state, challenge));
    return res.status(302).end();
  }

  if (action === 'callback') {
    const ok = await checkState(q.state, email, P.id);
    if (!ok) return back(res, `${P.id}/error`);
    if (q.error) return back(res, `${P.id}/${q.error === 'access_denied' ? 'cancelado' : 'error'}`);
    if (!q.code) return back(res, `${P.id}/error`);
    const got = await P.exchange(cfg, String(q.code), ok.verifier).catch(() => ({ error: 'error' }));
    if (got.error) return back(res, `${P.id}/${got.error}`);
    const next = { ...st, tok: seal(got.refresh, cfg.key, email), address: String(got.address || '').slice(0, 120), connectedAt: new Date().toISOString(), range: ok.range, expired: false };
    /* conectar otra casilla arranca de cero; reconectar la misma conserva lo ya importado */
    if (st.address && next.address && st.address.toLowerCase() !== next.address.toLowerCase()) { next.imported = []; next.queue = []; next.lastSearch = ''; }
    if (st.range !== ok.range) next.lastSearch = '';
    await saveState(P, email, next);
    await countUser(P, email);
    return back(res, `${P.id}/conectado`);
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  const body = ctx.body || {};
  try {
    if (action === 'search') return res.status(200).json(await search(P, email, await ctx.getDoc(), st, cfg, body));
    if (action === 'import') {
      const doc = await ctx.getDoc();
      const out = await importOne(P, email, st, cfg, body, { ...ctx.deps, pets: doc.pets || [] });
      return res.status(out.status).json(out.body);
    }
    if (action === 'queue') {
      for (const x of (Array.isArray(body.items) ? body.items : []).slice(0, MAX_QUEUE)) {
        const m = String(x?.m || ''), part = String(x?.part || '');
        if (!P.validId(m) || !(isLinkPart(part) || P.validPart(part))) continue;
        const key = dedupeKey(m, part);
        if (st.imported.includes(key) || st.queue.some(y => dedupeKey(y.m, y.part) === key)) continue;
        st.queue.push({ m, part, name: String(x.name || 'adjunto').slice(0, 120), type: typeOf(x.type, x.name) });
      }
      await saveState(P, email, st);
      return res.status(200).json(statusView(P, st, true, true));
    }
    if (action === 'unqueue') {
      const keys = new Set((Array.isArray(body.items) ? body.items : []).map(x => dedupeKey(x?.m, x?.part)));
      st.queue = st.queue.filter(x => !keys.has(dedupeKey(x.m, x.part)));
      await saveState(P, email, st);
      return res.status(200).json(statusView(P, st, true, true));
    }
    if (action === 'disconnect') return res.status(200).json(await disconnect(P, email, st, cfg));
    return res.status(400).json({ error: 'invalid' });
  } catch (e) {
    /* lo inesperado se registra sin URLs (pueden traer tokens) */
    if (!e.code || /error$/.test(e.code)) console.warn('mimitos mail:', P.id, action, e.code || '-', String(e.name || 'Error'), String(e.message || '').replace(/https?:\/\/\S+/g, '<url>').slice(0, 120));
    /* los códigos llevan el nombre del proveedor (gmail_vencido, outlook_vencido…) */
    return res.status(e.status || 502).json({ error: String(e.code || 'mail_error').replace(/^mail_/, P.id + '_'), ...(e.extra || {}) });
  }
}
