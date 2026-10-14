/* Vencimientos de la Casa · "Buscar en mi mail" (navegador).
   Gmail: Google Identity Services, permiso gmail.readonly, token solo en memoria y
   revocado al terminar. Outlook/Hotmail: MSAL, permiso Mail.Read, caché en la sesión
   que se borra al terminar. Los mails se leen acá, en el teléfono: nada pasa por Orbit. */
import { consultaGmail, textoDeHtml, PALABRAS, REMITENTES } from './correo-lector.js';

const MAX_MAILS = 250;
const PARALELO = 6;

const cargarScript = src => new Promise((ok, mal) => {
  if (document.querySelector(`script[src="${src}"]`)) return ok();
  const s = document.createElement('script');
  s.src = src; s.async = true; s.onload = ok; s.onerror = () => mal(new Error('No pudimos cargar el acceso. Revisá la conexión.'));
  document.head.appendChild(s);
});
const fecha = ms => new Date(ms).toISOString().slice(0, 10);

let config = null;
export async function configCorreo() {
  if (config) return config;
  try { const r = await fetch('/api/correo-config', { credentials: 'same-origin' }); config = r.ok ? await r.json() : {}; }
  catch { config = {}; }
  return config;
}

async function enTandas(items, fn, avance) {
  const out = []; let i = 0, hechos = 0;
  async function trabajador() {
    while (i < items.length) {
      const k = i++;
      try { out[k] = await fn(items[k]); } catch { out[k] = null; }
      avance?.(++hechos, items.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(PARALELO, items.length) }, trabajador));
  return out.filter(Boolean);
}

/* ── Gmail ── */
function b64url(s) {
  const bin = atob(String(s).replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder('utf-8').decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
}
function cuerpoGmail(payload) {
  let plano = '', html = '';
  (function rec(p) {
    if (!p) return;
    if (p.body?.data && p.mimeType === 'text/plain' && !plano) plano = b64url(p.body.data);
    if (p.body?.data && p.mimeType === 'text/html' && !html) html = b64url(p.body.data);
    (p.parts || []).forEach(rec);
  })(payload);
  return plano.trim() ? plano : textoDeHtml(html);
}
async function tokenGoogle(clientId) {
  await cargarScript('https://accounts.google.com/gsi/client');
  return new Promise((ok, mal) => {
    const cliente = google.accounts.oauth2.initTokenClient({
      client_id: clientId, scope: 'https://www.googleapis.com/auth/gmail.readonly',
      callback: r => (r.error ? mal(new Error('No diste el permiso para leer el mail.')) : ok(r.access_token)),
      error_callback: () => mal(new Error('Se cerró la ventana de Google antes de terminar.')),
    });
    cliente.requestAccessToken({ prompt: 'consent' });
  });
}
export async function buscarEnGmail(clientId, avance) {
  const token = await tokenGoogle(clientId);
  const api = async ruta => {
    const r = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${ruta}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) throw new Error(`Gmail respondió ${r.status}`);
    return r.json();
  };
  try {
    const ids = [];
    let pagina = '';
    do {
      const j = await api(`messages?maxResults=100&q=${encodeURIComponent(consultaGmail(6))}${pagina ? `&pageToken=${pagina}` : ''}`);
      ids.push(...(j.messages || []).map(m => m.id));
      pagina = j.nextPageToken || '';
    } while (pagina && ids.length < MAX_MAILS);
    avance?.(0, ids.length);
    return await enTandas(ids.slice(0, MAX_MAILS), async id => {
      const m = await api(`messages/${id}?format=full`);
      const h = n => m.payload?.headers?.find(x => x.name.toLowerCase() === n)?.value || '';
      return { id, de: h('from'), asunto: h('subject'), fecha: fecha(Number(m.internalDate)), texto: cuerpoGmail(m.payload).slice(0, 20000) };
    }, avance);
  } finally {
    try { google.accounts.oauth2.revoke(token, () => {}); } catch {}
  }
}

/* ── Outlook / Hotmail ── */
export async function buscarEnOutlook(clientId, avance) {
  await cargarScript('https://alcdn.msauth.net/browser/2.38.3/js/msal-browser.min.js');
  const app = new msal.PublicClientApplication({
    auth: { clientId, authority: 'https://login.microsoftonline.com/common', redirectUri: `${location.origin}/herramientas/vencimientos` },
    cache: { cacheLocation: 'sessionStorage' },
  });
  await app.initialize();
  let token;
  try {
    const r = await app.loginPopup({ scopes: ['Mail.Read'], prompt: 'select_account' });
    token = r.accessToken || (await app.acquireTokenSilent({ scopes: ['Mail.Read'], account: r.account })).accessToken;
  } catch { throw new Error('Se cerró la ventana de Microsoft o no diste el permiso.'); }
  try {
    const dominios = [...new Set(REMITENTES.flatMap(([, ds]) => ds))].slice(0, 40);
    const kql = [...PALABRAS.map(p => `"${p}"`), ...dominios.map(d => `from:${d}`)].join(' OR ');
    let url = `https://graph.microsoft.com/v1.0/me/messages?$search=${encodeURIComponent(`"${kql.replace(/"/g, '\\"')}"`)}&$top=50&$select=id,subject,from,receivedDateTime,body`;
    const mails = [];
    const desde = Date.now() - 183 * 864e5;
    while (url && mails.length < MAX_MAILS) {
      const r = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Prefer: 'outlook.body-content-type="text"' } });
      if (!r.ok) throw new Error(`Outlook respondió ${r.status}`);
      const j = await r.json();
      for (const m of j.value || []) {
        if (Date.parse(m.receivedDateTime) < desde) continue;
        mails.push({ id: m.id, de: `${m.from?.emailAddress?.name || ''} <${m.from?.emailAddress?.address || ''}>`, asunto: m.subject || '',
          fecha: fecha(Date.parse(m.receivedDateTime)), texto: String(m.body?.content || '').slice(0, 20000) });
      }
      avance?.(mails.length, mails.length);
      url = j['@odata.nextLink'] || null;
    }
    return mails;
  } finally {
    try { sessionStorage.clear(); } catch {}
  }
}

/* ── demo (solo local, ?correo=demo): mails inventados para probar la pantalla ── */
export function mailsDemo(hoy) {
  const [a, m] = hoy.split('-').map(Number);
  const d = (mesAtras, dia) => { const t = new Date(Date.UTC(a, m - 1 - mesAtras, dia)); return `${String(t.getUTCDate()).padStart(2, '0')}/${String(t.getUTCMonth() + 1).padStart(2, '0')}/${t.getUTCFullYear()}`; };
  const iso = (mesAtras, dia) => new Date(Date.UTC(a, m - 1 - mesAtras, dia)).toISOString().slice(0, 10);
  const luz = [[3, '31.200'], [2, '36.540,10'], [1, '41.020,55'], [0, '44.800']];
  return [
    ...luz.map(([k, monto]) => ({ id: `e${k}`, de: 'Edenor <facturadigital@edenor.com>', asunto: 'Tu factura ya está disponible', fecha: iso(k, 2), texto: `Total a pagar: $ ${monto}\nVencimiento: ${d(k, 21)}\n2° vencimiento: ${d(k, 28)}` })),
    { id: 'g1', de: 'Metrogas <avisos@metrogas.com.ar>', asunto: 'Factura de gas', fecha: iso(1, 3), texto: `Importe $ 12.300\nVence el ${d(1, 16)}` },
    { id: 'g2', de: 'Metrogas <avisos@metrogas.com.ar>', asunto: 'Factura de gas', fecha: iso(0, 3), texto: `Importe $ 13.900\nVence el ${d(0, 26)}` },
    { id: 'w1', de: 'AySA <facturas@aysa.com.ar>', asunto: 'Factura AySA', fecha: iso(2, 1), texto: `Importe a pagar $ 18.000\nVencimiento ${d(2, 12)}` },
    { id: 'w2', de: 'AySA <facturas@aysa.com.ar>', asunto: 'Factura AySA', fecha: iso(0, 1), texto: `Importe a pagar $ 21.500\nVencimiento ${d(0, 12)}` },
    { id: 'x1', de: 'Administración <admin@consorcio-demo.com.ar>', asunto: 'Liquidación de expensas', fecha: iso(0, 1), texto: `Total a pagar $ 185.000,00. Vence el ${d(0, 10)}` },
    { id: 'p1', de: 'OSDE <facturacion@osde.com.ar>', asunto: 'Tu factura del mes', fecha: iso(0, 1), texto: `Total $ 160.400\nFecha de vencimiento ${d(-1, 10)}` },
    { id: 'n1', de: 'Promos <hola@tienda-demo.com>', asunto: 'Ofertas de la semana', fecha: iso(0, 5), texto: 'Hasta 50% off. La promo vence el 31/12/2026.' },
  ];
}
