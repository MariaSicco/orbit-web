/* Mimitos · "Veterinarias cerca": proxy de Google Places API (New) con techo de gasto mensual.

   La clave GOOGLE_MAPS_API_KEY vive solo acá (nunca viaja al navegador). El mapa de la app es Maps Embed API
   (gratis, sin límite) con otra clave, GOOGLE_MAPS_BROWSER_KEY, restringida por referrer y solo a esa API.

   Qué se pide y cuánto cuesta (precios de lista de Google al 14/10/2026, primer tramo, USD cada 1.000 llamadas):
   https://developers.google.com/maps/billing-and-pricing/pricing
   - Veterinarias y Pet shops: Nearby Search (New), rankPreference DISTANCE, radio 5 km, 20 resultados.
   - Guardias 24 h y "Barrio, ciudad o dirección": Text Search (New). Sesgo (locationBias, no cambia el SKU): la
     ubicación si la dio, o el centro de los resultados de esa zona que manda la app al cambiar de pestaña. Si el
     texto trae un número (una dirección) la consulta va como "veterinaria cerca de <dirección>".
   - Al tocar un lugar sin teléfono, o "Mi veterinaria": Place Details (New).
   El SKU lo define el campo más caro del field mask (https://developers.google.com/maps/documentation/places/web-service/nearby-search):
   rating, userRatingCount, currentOpeningHours y los teléfonos son Enterprise; id, nombre, dirección, ubicación y
   googleMapsUri son Pro. MIMITOS_PLACES_TIER elige:
   - 'enterprise' (por defecto): la lista trae estrellas, "Abierto ahora" y teléfono en una sola llamada.
       Nearby/Text Search Enterprise USD 35 (1.000 gratis por mes cada una).
   - 'pro': la lista sin estrellas ni horario; el teléfono y el horario se piden al tocar (Place Details Enterprise).
       Nearby/Text Search Pro USD 32 (5.000 gratis por mes cada una).
   Place Details Enterprise: USD 20 (1.000 gratis por mes). Sin fotos (Place Photos se cobra aparte).

   Techo: orbit:petmaps:spend:<AAAA-MM> en micro-dólares con INCRBY, a precio de lista y SIN descontar el cupo
   gratis (así la cuenta de la app siempre queda por arriba de la factura real). Antes de cada llamada se reserva
   el costo; si se pasa de MIMITOS_MAPS_BUDGET_USD (20 por defecto) no sale y la app queda con el link gratis
   "Buscar en Google Maps". Avisos por mail a ADMIN_EMAILS al 80 % y al 100 %, uno por nivel y por mes (SET NX),
   igual que el techo de IA (api/_lib/petai.js). Si Google no respondió (red, 5xx o 429) la reserva vuelve.

   Caché y políticas (https://developers.google.com/maps/documentation/places/web-service/policies):
   el contenido de Places NO se puede guardar; el place ID sí, sin límite. Por eso el servidor no guarda nombres,
   direcciones, teléfonos ni ubicaciones: solo los place IDs que le mostró a cada cuenta (24 h), para validar
   que "detalles" se pida sobre un lugar que la persona vio. La ubicación de la persona tampoco se guarda: llega
   por POST (no queda en la URL ni en los logs), se redondea a 3 decimales (~110 m) y se usa solo para la consulta.

   Tope por cuenta: MIMITOS_MAPS_PER_DAY búsquedas por día (20 por defecto) y el doble para detalles. */
import { kvGet, kvSet, kvIncrBy, kvSetNX, kvDel } from './kv.js';
import { sendEmail, emailReady, layout, it } from './email.js';
import { adminEmails } from './admin.js';

const API = 'https://places.googleapis.com/v1';
/* micro-dólares por llamada (precio de lista del primer tramo) */
export const SKUS = {
  'nearby:enterprise': { sku: 'Nearby Search Enterprise', micro: 35000 },
  'nearby:pro': { sku: 'Nearby Search Pro', micro: 32000 },
  'text:enterprise': { sku: 'Text Search Enterprise', micro: 35000 },
  'text:pro': { sku: 'Text Search Pro', micro: 32000 },
  'details:enterprise': { sku: 'Place Details Enterprise', micro: 20000 },
};
const PRO_FIELDS = ['id', 'displayName', 'shortFormattedAddress', 'formattedAddress', 'location', 'googleMapsUri', 'attributions'];
const ENT_FIELDS = ['rating', 'userRatingCount', 'currentOpeningHours.openNow', 'nationalPhoneNumber', 'internationalPhoneNumber'];
export const fieldMask = (tier, prefix = 'places.') => [...PRO_FIELDS, ...(tier === 'pro' ? [] : ENT_FIELDS)].map(f => prefix + f).join(',');
export const DETAILS_MASK = fieldMask('enterprise', '');

export const tier = () => process.env.MIMITOS_PLACES_TIER === 'pro' ? 'pro' : 'enterprise';
export const DEFAULT_BUDGET_USD = 20;
export const budgetUsd = () => { const n = Number(process.env.MIMITOS_MAPS_BUDGET_USD); return Number.isFinite(n) && n > 0 ? n : DEFAULT_BUDGET_USD; };
export const DEFAULT_PER_DAY = 20;
export const perDay = () => { const n = parseInt(process.env.MIMITOS_MAPS_PER_DAY, 10); return Number.isFinite(n) && n > 0 ? n : DEFAULT_PER_DAY; };
const month = now => new Date(now).toISOString().slice(0, 7);
const dayOf = now => new Date(now).toISOString().slice(0, 10);
export const spendKey = (now = Date.now()) => `orbit:petmaps:spend:${month(now)}`;
export const alertKey = (level, now = Date.now()) => `orbit:petmaps:alert:${month(now)}:${level}`;
export const rateKey = (email, what, now = Date.now()) => `orbit:petmaps:rl:${what}:${String(email).toLowerCase()}:${dayOf(now)}`;
export const seenKey = email => `orbit:petmaps:seen:${String(email).toLowerCase()}`;
const SPEND_TTL = 400 * 86400, ALERT_TTL = 40 * 86400, SEEN_TTL = 86400, MAX_SEEN = 300;

export const KINDS = {
  vet: { label: 'veterinaria', type: 'veterinary_care', words: 'veterinaria' },
  er: { label: 'guardia veterinaria 24 horas', type: 'veterinary_care', words: 'veterinaria guardia 24 horas' },
  pet: { label: 'pet shop', type: 'pet_store', words: 'pet shop' },
};
/* link gratis de Google Maps (Maps URLs): no lleva la ubicación de la persona; Maps la resuelve en su celu */
export const mapsSearchUrl = (kind = 'vet', area = '') => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(KINDS[kind]?.words + (area ? ' ' + area : ''))}`;
export const PAUSED_MESSAGE = 'La búsqueda de lugares está en pausa hasta el mes que viene. Mientras tanto, buscá directo en Google Maps: es gratis y abre en tu celu.';

export async function spentMicro(now = Date.now()) { return Number(await kvGet(spendKey(now))) || 0; }
/* en pausa: lo que queda del techo no alcanza para una búsqueda más */
export async function mapsPaused(now = Date.now()) { return (await spentMicro(now)) + SKUS['nearby:pro'].micro > budgetUsd() * 1e6; }

/* ---------- avisos del techo por mail (mismo mecanismo que petai.js) ---------- */
const usd = micro => `USD ${(micro / 1e6).toFixed(2).replace('.', ',')}`;
export function budgetAlertEmail(level, spent, now = Date.now()) {
  const cap = budgetUsd(), zona = process.env.ORBIT_TZ || 'America/Argentina/Buenos_Aires';
  const fecha = new Date(now).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: zona });
  const mes = new Date(now).toLocaleDateString('es-AR', { month: 'long', year: 'numeric', timeZone: zona });
  const gasto = usd(spent), techo = `USD ${String(cap).replace('.', ',')}`, pausa = level >= 100;
  const subject = pausa ? 'Mimitos: Google Maps llegó al techo de este mes y la búsqueda quedó en pausa' : 'Mimitos: Google Maps ya usó el 80% del techo de este mes';
  const queHacer = pausa
    ? 'La lista de "Veterinarias cerca" se apagó hasta el mes que viene: la app muestra solo el link gratis "Buscar en Google Maps". Todo lo demás sigue andando. Si querés reactivarla ya, subí MIMITOS_MAPS_BUDGET_USD en Vercel (Settings → Environment Variables, en Production) y volvé a desplegar.'
    : 'Por ahora no pasa nada: la búsqueda sigue andando. Si se llega al techo, la lista se apaga sola y queda el link gratis a Google Maps. Si esperás más uso este mes, subí MIMITOS_MAPS_BUDGET_USD en Vercel (Settings → Environment Variables, en Production) y volvé a desplegar.';
  const nota = 'Es una estimación a precio de lista, sin descontar el uso gratis de cada mes: la factura real de Google Cloud es igual o menor.';
  const text = `${subject}.\n\nGasto estimado de ${mes}: ${gasto}\nTecho del mes: ${techo} (MIMITOS_MAPS_BUDGET_USD)\nFecha: ${fecha}\n\nQué hacer: ${queHacer}\n\n${nota}`;
  const html = layout({
    accent: pausa ? 'fuego' : 'acid', preheader: `${gasto} de ${techo} este mes.`, eyebrow: 'Mimitos · Aviso interno',
    title: pausa ? `Google Maps quedó ${it('en pausa.')}` : `Google Maps ya usó el ${it('80%.')}`,
    body: `<p style="margin:0">${queHacer}</p>`,
    meta: [['Gasto estimado', `${gasto} (${mes})`], ['Techo', `${techo} · MIMITOS_MAPS_BUDGET_USD`], ['Fecha', fecha]],
    foot: `${nota} Este aviso sale una sola vez por mes.`, sign: false,
  });
  return { subject, text, html };
}
export async function budgetAlert(level, spent, now = Date.now()) {
  try {
    const cap = budgetUsd() * 1e6, to = adminEmails();
    if (![80, 100].includes(level) || (level < 100 && spent < cap * level / 100)) return { sent: false, level: 0 };
    if (!to.length || !emailReady()) return { sent: false, level };
    const key = alertKey(level, now);
    if (!(await kvSetNX(key, { at: new Date(now).toISOString(), spent }, ALERT_TTL))) return { sent: false, level, dup: true };
    const mail = budgetAlertEmail(level, spent, now);
    let ok = 0;
    for (const email of to) { try { if ((await sendEmail({ to: email, ...mail })).sent) ok++; } catch (e) { console.error(`[mimitos] no salió el aviso del techo de Maps (${level}%): ${String(e).slice(0, 160)}`); } }
    if (!ok) { await kvDel(key).catch(() => {}); return { sent: false, level }; }
    return { sent: true, level };
  } catch (e) { console.error(`[mimitos] aviso del techo de Maps: ${String(e).slice(0, 160)}`); return { sent: false, level: 0 }; }
}

const fail = (code, status, extra = {}) => Object.assign(new Error(code), { status, code, ...extra });
/* reserva el costo; si se pasa del techo, la devuelve y corta */
async function reserve(sku, now) {
  const cost = SKUS[sku].micro, cap = Math.round(budgetUsd() * 1e6), k = spendKey(now);
  const after = await kvIncrBy(k, cost, SPEND_TTL);
  if (after > cap) {
    await kvIncrBy(k, -cost).catch(() => {});
    console.error(`[mimitos] MAPS EN PAUSA: se llegó al techo del mes (USD ${budgetUsd()}, MIMITOS_MAPS_BUDGET_USD).`);
    await budgetAlert(100, after - cost, now);
    throw fail('maps_paused', 503);
  }
  return { k, cost, after };
}

/* llamada a Google. Sin respuesta (red) o 5xx/429: no se cobró → vuelve la reserva y el cupo diario */
async function google(sku, url, init, now, undo) {
  const r0 = await reserve(sku, now);
  let r;
  try { r = await fetch(url, { ...init, signal: AbortSignal.timeout ? AbortSignal.timeout(9000) : undefined }); }
  catch { await kvIncrBy(r0.k, -r0.cost).catch(() => {}); await undo?.(); throw fail('maps_error_red', 502); }
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    if (r.status >= 500 || r.status === 429) { await kvIncrBy(r0.k, -r0.cost).catch(() => {}); await undo?.(); }
    console.error(`[mimitos] Places respondió ${r.status}: ${t.slice(0, 200)}`);
    throw fail('maps_error_' + r.status, r.status === 429 ? 503 : 502);
  }
  if (r0.after >= Math.round(budgetUsd() * 1e6) * .8) await budgetAlert(80, r0.after, now);
  return r.json().catch(() => ({}));
}

const num = (v, lim) => { const n = Number(v); return Number.isFinite(n) && Math.abs(n) <= lim ? n : null; };
/* la ubicación se redondea a 3 decimales (~110 m) antes de mandarla a Google */
export const round3 = n => Math.round(n * 1000) / 1000;
const str = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
export const okPlaceId = v => /^[A-Za-z0-9_-]{10,300}$/.test(v || '');
export function shapePlace(p = {}) {
  const has = k => Object.prototype.hasOwnProperty.call(p, k);
  return {
    id: okPlaceId(p.id) ? p.id : '',
    name: str(p.displayName?.text, 120),
    address: str(p.shortFormattedAddress || p.formattedAddress, 160),
    lat: Number.isFinite(p.location?.latitude) ? p.location.latitude : null,
    lng: Number.isFinite(p.location?.longitude) ? p.location.longitude : null,
    rating: Number.isFinite(p.rating) ? p.rating : null,
    ratings: Number.isFinite(p.userRatingCount) ? p.userRatingCount : null,
    /* null = no se pidió o Google no sabe */
    open: typeof p.currentOpeningHours?.openNow === 'boolean' ? p.currentOpeningHours.openNow : null,
    phone: str(p.nationalPhoneNumber, 40), intl: str(p.internationalPhoneNumber, 40),
    maps: /^https:\/\/(maps\.google\.com|www\.google\.com\/maps|maps\.app\.goo\.gl|goo\.gl\/maps)/.test(p.googleMapsUri || '') ? p.googleMapsUri : '',
    /* atribuciones de terceros que Google pide mostrar (solo texto y link https) */
    credits: (Array.isArray(p.attributions) ? p.attributions : []).slice(0, 3).map(a => ({ provider: str(a?.provider, 80), uri: /^https:\/\//.test(a?.providerUri || '') ? a.providerUri : '' })).filter(a => a.provider),
    detailed: has('nationalPhoneNumber') || has('internationalPhoneNumber') || has('rating') || has('currentOpeningHours'),
  };
}

async function remember(email, ids) {
  const old = (await kvGet(seenKey(email))) || [];
  const all = [...new Set([...ids.filter(okPlaceId), ...old])].slice(0, MAX_SEEN);
  await kvSet(seenKey(email), all, SEEN_TTL);
}
async function rate(email, what, limit, now) {
  const k = rateKey(email, what, now);
  const n = await kvIncrBy(k, 1, 2 * 86400);
  return { ok: n <= limit, left: Math.max(0, limit - n), undo: () => kvIncrBy(k, -1).catch(() => {}) };
}

/* ---------- el handler: ?places=config|nearby|text|details ---------- */
export async function handlePlaces(req, res, { email, action, body = {}, getDoc, now = Date.now() }) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  const kind = KINDS[body.kind] ? body.kind : 'vet';
  if (action === 'config') {
    if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });
    const used = Number(await kvGet(rateKey(email, 'search', now))) || 0;
    return res.status(200).json({
      ready: Boolean(key), paused: await mapsPaused(now).catch(() => false), tier: tier(),
      mapsKey: process.env.GOOGLE_MAPS_BROWSER_KEY || null, perDay: perDay(), left: Math.max(0, perDay() - used),
    });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  if (!['nearby', 'text', 'details'].includes(action)) return res.status(400).json({ error: 'invalid' });
  const area = str(body.q, 80);
  const fallback = { mapsUrl: mapsSearchUrl(kind, action === 'text' ? area : '') };
  if (!key) return res.status(503).json({ error: 'maps_no_configurado', ...fallback });
  if (await mapsPaused(now)) {
    /* el aviso del 100 % sale una sola vez por mes (candado), también si la pausa se detecta antes de reservar */
    await budgetAlert(100, await spentMicro(now), now);
    return res.status(503).json({ error: 'maps_paused', message: PAUSED_MESSAGE, ...fallback });
  }

  const lang = { languageCode: 'es', regionCode: 'AR' };
  const headers = mask => ({ 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': mask });
  const t = tier();
  try {
    if (action === 'details') {
      const id = String(body.id || '');
      if (!okPlaceId(id)) return res.status(400).json({ error: 'invalid' });
      /* solo lugares que esta cuenta vio en las últimas 24 h o que tiene guardados (Mi veterinaria, turnos) */
      const seen = (await kvGet(seenKey(email))) || [];
      const doc = seen.includes(id) ? null : await getDoc?.();
      const saved = doc && ((doc.pets || []).some(p => p.vetPlace?.placeId === id) || (doc.appointments || []).some(a => a.place?.placeId === id));
      if (!seen.includes(id) && !saved) return res.status(403).json({ error: 'forbidden' });
      const rl = await rate(email, 'details', perDay() * 2, now);
      if (!rl.ok) { await rl.undo(); return res.status(429).json({ error: 'limite_diario', limit: perDay() * 2, ...fallback }); }
      const d = await google('details:enterprise', `${API}/places/${encodeURIComponent(id)}?languageCode=es&regionCode=AR`, { method: 'GET', headers: headers(DETAILS_MASK) }, now, rl.undo);
      return res.status(200).json({ place: shapePlace(d), attribution: 'Google Maps' });
    }

    let lat = num(body.lat, 90), lng = num(body.lng, 180);
    const hasLL = lat != null && lng != null && Boolean(lat || lng);
    if (action === 'nearby' && !hasLL) return res.status(400).json({ error: 'sin_ubicacion' });
    if (action === 'text' && area.length < 3) return res.status(400).json({ error: 'sin_zona' });
    /* siempre redondeada a 3 decimales antes de mandarla a Google; por texto, el sesgo es opcional */
    if (hasLL) { lat = round3(lat); lng = round3(lng); } else { lat = lng = null; }

    const rl = await rate(email, 'search', perDay(), now);
    if (!rl.ok) { await rl.undo(); return res.status(429).json({ error: 'limite_diario', limit: perDay(), ...fallback }); }
    const circle = r => ({ circle: { center: { latitude: lat, longitude: lng }, radius: r } });
    let d, sku;
    if (action === 'nearby' && kind !== 'er') {
      sku = `nearby:${t}`;
      d = await google(sku, `${API}/places:searchNearby`, { method: 'POST', headers: headers(fieldMask(t)), body: JSON.stringify({ includedTypes: [KINDS[kind].type], maxResultCount: 20, rankPreference: 'DISTANCE', locationRestriction: circle(5000), ...lang }) }, now, rl.undo);
    } else {
      /* guardias (con o sin ubicación) y búsqueda por barrio o ciudad: Text Search */
      sku = `text:${t}`;
      const q = action === 'text' ? `${KINDS[kind].words} ${/\d/.test(area) ? 'cerca de' : 'en'} ${area}` : KINDS[kind].words;
      const bias = action === 'nearby' ? circle(15000) : lat != null ? circle(5000) : null;
      const req2 = { textQuery: q, pageSize: 20, ...lang, ...(bias ? { locationBias: bias } : {}), ...(KINDS[kind].type ? { includedType: KINDS[kind].type } : {}) };
      d = await google(sku, `${API}/places:searchText`, { method: 'POST', headers: headers(fieldMask(t)), body: JSON.stringify(req2) }, now, rl.undo);
    }
    const places = (Array.isArray(d.places) ? d.places : []).map(shapePlace).filter(p => p.id && p.name);
    await remember(email, places.map(p => p.id)).catch(() => {});
    return res.status(200).json({ places, kind, tier: t, sku: SKUS[sku].sku, left: rl.left, attribution: 'Google Maps', ...fallback });
  } catch (e) {
    if (e.code === 'maps_paused') return res.status(503).json({ error: 'maps_paused', message: PAUSED_MESSAGE, ...fallback });
    return res.status(e.status || 502).json({ error: e.code || 'maps_error', ...fallback });
  }
}
