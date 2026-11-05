/* Mimitos · prueba con Google REAL del autocompletar de "Veterinarias cerca" (lo mismo que hace el servidor).
   Uso (la clave sale del entorno; el script nunca la imprime):
     GOOGLE_MAPS_API_KEY=... node scripts/mimitos-probar-direccion.mjs "Gobernador Martínez 2786"
   Opcional: un sesgo "lat,lng" como segundo argumento (por ejemplo -27.47,-58.83).
   Hace 1 Autocomplete (New) solo AR + 1 Place Details Essentials con el mismo session token + 1 Nearby Search.
   Costo de lista aproximado: USD 0,00283 + USD 0,005 + USD 0,035 (dentro del cupo gratis mensual, USD 0). */
import { randomUUID } from 'node:crypto';
import { PICK_MASK, fieldMask, round3 } from '../api/_lib/petplaces.js';
const key = process.env.GOOGLE_MAPS_API_KEY;
if (!key) { console.error('Falta GOOGLE_MAPS_API_KEY en el entorno.'); process.exit(1); }
const input = process.argv[2] || 'Gobernador Martínez 2786';
const [blat, blng] = (process.argv[3] || '').split(',').map(Number);
const token = randomUUID();
const H = mask => ({ 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': mask });
const go = async (url, init) => { const r = await fetch(url, init); const d = await r.json().catch(() => ({})); if (!r.ok) { console.error(r.status, JSON.stringify(d).slice(0, 400)); process.exit(1); } return d; };

const a = await go('https://places.googleapis.com/v1/places:autocomplete', { method: 'POST', headers: H('suggestions.placePrediction.placeId,suggestions.placePrediction.text.text,suggestions.placePrediction.structuredFormat'), body: JSON.stringify({
  input, includedRegionCodes: ['ar'], languageCode: 'es', regionCode: 'ar', sessionToken: token,
  ...(Number.isFinite(blat) && Number.isFinite(blng) ? { locationBias: { circle: { center: { latitude: round3(blat), longitude: round3(blng) }, radius: 30000 } } } : {}) }) });
const sug = (a.suggestions || []).map(x => x.placePrediction).filter(Boolean);
console.log(`\n1) Autocomplete "${input}": ${sug.length} sugerencias`);
sug.forEach((s, i) => console.log(`   ${i + 1}. ${s.structuredFormat?.mainText?.text} — ${s.structuredFormat?.secondaryText?.text}`));
if (!sug.length) { console.log('   La app mostraría: "No encontramos esa dirección, probá con barrio y ciudad."'); process.exit(0); }

const d = await go(`https://places.googleapis.com/v1/places/${encodeURIComponent(sug[0].placeId)}?languageCode=es&regionCode=AR&sessionToken=${token}`, { headers: H(PICK_MASK) });
const lat = round3(d.location.latitude), lng = round3(d.location.longitude);
console.log(`\n2) Place Details Essentials de la 1.ª: ${d.shortFormattedAddress} → ${lat}, ${lng}`);

const n = await go('https://places.googleapis.com/v1/places:searchNearby', { method: 'POST', headers: H(fieldMask('enterprise')), body: JSON.stringify({
  includedTypes: ['veterinary_care'], maxResultCount: 20, rankPreference: 'DISTANCE', languageCode: 'es', regionCode: 'AR',
  locationRestriction: { circle: { center: { latitude: lat, longitude: lng }, radius: 5000 } } }) });
console.log(`\n3) Nearby: ${(n.places || []).length} veterinarias a menos de 5 km`);
(n.places || []).slice(0, 5).forEach((p, i) => console.log(`   ${i + 1}. ${p.displayName?.text} — ${p.shortFormattedAddress || ''}`));
