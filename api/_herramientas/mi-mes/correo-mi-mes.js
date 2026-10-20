/* Mi Mes by Orbit · "Conectá tu mail" (etapa 3; interruptor conectarMail).
   Mismos clientes OAuth que Mimitos y Vencimientos (GET /api/correo-config,
   archivo compartido e idéntico). Corre en el navegador:
   - Gmail: Google Identity Services, permiso gmail.readonly, token solo en
     memoria y revocado al terminar.
   - Outlook/Hotmail: MSAL (vendor/, MIT), permiso Mail.Read, caché de la
     sesión que se borra al terminar.
   Busca SOLO adjuntos PDF de resúmenes de tarjeta, facturas y recibos de los
   últimos 6 meses y los devuelve como archivos; después pasan por el mismo
   "revisá lo que leí" (y por /api/mi-mes-leer, como si los subieras vos).
   No se guarda el mail, ni la lista de mensajes, ni el token. */
const MAX_ADJUNTOS = 30;
const MAX_BYTES = 4e6;
const CONSULTA_GMAIL = 'has:attachment filename:pdf newer_than:6m (resumen OR "estado de cuenta" OR factura OR boleta OR expensas OR "recibo de sueldo" OR haberes OR liquidación OR vencimiento)';
const KQL = '"resumen" OR "estado de cuenta" OR "factura" OR "boleta" OR "expensas" OR "recibo de sueldo" OR "haberes"';
const SIN_CUPO = 'Por ahora subí los PDF; te avisamos cuando se habilite.';

const cargarScript = src => new Promise((ok, mal) => {
  if (document.querySelector(`script[src="${src}"]`)) return ok();
  const s = Object.assign(document.createElement('script'), { src, async: true, onload: ok, onerror: () => mal(new Error('No pudimos cargar el acceso. Revisá la conexión.')) });
  document.head.appendChild(s);
});
const bytesDeB64 = s => Uint8Array.from(atob(String(s).replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
async function config() {
  try { const r = await fetch('/api/correo-config', { credentials: 'same-origin' }); return r.ok ? await r.json() : {}; } catch { return {}; }
}

async function tokenGoogle(clientId) {
  await cargarScript('https://accounts.google.com/gsi/client');
  if (!window.google?.accounts?.oauth2) throw new Error(SIN_CUPO);
  return new Promise((ok, mal) => {
    const cliente = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId, scope: 'https://www.googleapis.com/auth/gmail.readonly',
      /* app sin verificar y cupo de prueba lleno: Google devuelve error → mismo mensaje */
      callback: r => (r.error ? mal(new Error(r.error === 'access_denied' ? 'No diste el permiso para leer el mail.' : SIN_CUPO)) : ok(r.access_token)),
      error_callback: () => mal(new Error(SIN_CUPO)),
    });
    cliente.requestAccessToken({ prompt: 'consent' });
  });
}
export async function buscarEnGmail(clientId, avance) {
  const token = await tokenGoogle(clientId);
  const api = async ruta => {
    const r = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${ruta}`, { headers: { Authorization: `Bearer ${token}` } });
    if (r.status === 403 || r.status === 429) throw new Error(SIN_CUPO);
    if (!r.ok) throw new Error(`Gmail respondió ${r.status}`);
    return r.json();
  };
  try {
    const j = await api(`messages?maxResults=60&q=${encodeURIComponent(CONSULTA_GMAIL)}`);
    const out = [];
    for (const { id } of j.messages || []) {
      if (out.length >= MAX_ADJUNTOS) break;
      const m = await api(`messages/${id}?format=full`);
      const adj = [];
      (function rec(p) { if (!p) return; if (/\.pdf$/i.test(p.filename || '') && p.body?.attachmentId && (p.body.size || 0) < MAX_BYTES) adj.push(p); (p.parts || []).forEach(rec); })(m.payload);
      for (const p of adj.slice(0, 2)) {
        const a = await api(`messages/${id}/attachments/${p.body.attachmentId}`);
        out.push({ nombre: p.filename, bytes: bytesDeB64(a.data) });
        avance?.(out.length);
      }
    }
    return out;
  } finally {
    try { window.google.accounts.oauth2.revoke(token, () => {}); } catch {}
  }
}
export async function buscarEnOutlook(clientId, avance) {
  await cargarScript('vendor/msal-browser-2.38.3.min.js');
  if (!window.msal) throw new Error('No pudimos cargar el acceso de Microsoft. Probá de nuevo en un rato.');
  const app = new window.msal.PublicClientApplication({
    auth: { clientId, authority: 'https://login.microsoftonline.com/common', redirectUri: `${location.origin}/herramientas/mi-mes` },
    cache: { cacheLocation: 'sessionStorage' },
  });
  await app.initialize();
  let token;
  try {
    const r = await app.loginPopup({ scopes: ['Mail.Read'], prompt: 'select_account' });
    token = r.accessToken || (await app.acquireTokenSilent({ scopes: ['Mail.Read'], account: r.account })).accessToken;
  } catch { throw new Error('Se cerró la ventana de Microsoft o no diste el permiso.'); }
  try {
    const pedir = u => fetch(u, { headers: { Authorization: `Bearer ${token}` } });
    const desde = Date.now() - 183 * 864e5;
    const r = await pedir(`https://graph.microsoft.com/v1.0/me/messages?$search=${encodeURIComponent(`"${KQL.replace(/"/g, '\\"')}"`)}&$top=50&$select=id,receivedDateTime,hasAttachments`);
    if (!r.ok) throw new Error('Outlook no respondió a la búsqueda. Probá de nuevo en un rato.');
    const out = [];
    for (const m of (await r.json()).value || []) {
      if (out.length >= MAX_ADJUNTOS || !m.hasAttachments || Date.parse(m.receivedDateTime) < desde) continue;
      const a = await pedir(`https://graph.microsoft.com/v1.0/me/messages/${m.id}/attachments`);
      if (!a.ok) continue;
      for (const x of ((await a.json()).value || []).filter(x => /\.pdf$/i.test(x.name || '') && x.contentBytes && (x.size || 0) < MAX_BYTES).slice(0, 2)) {
        out.push({ nombre: x.name, bytes: bytesDeB64(x.contentBytes) });
        avance?.(out.length);
      }
    }
    return out;
  } finally {
    try { sessionStorage.clear(); } catch {}
  }
}
/* Elige el proveedor: si hay los dos, pregunta; si no hay ninguno configurado, el mensaje de "todavía no". */
export async function buscarDocumentosEnMail(avance) {
  const c = await config();
  if (!c.google && !c.microsoft) throw new Error(SIN_CUPO);
  const cual = c.google && c.microsoft ? (window.confirm('¿Tu mail es de Gmail? Aceptar = Gmail · Cancelar = Outlook o Hotmail') ? 'google' : 'microsoft') : c.google ? 'google' : 'microsoft';
  return cual === 'google' ? buscarEnGmail(c.google, avance) : buscarEnOutlook(c.microsoft, avance);
}

/* Quitar el permiso (QA t14 · 4). Gmail se revoca solo al terminar cada búsqueda;
   Microsoft guarda el consentimiento en la cuenta, así que se explica cómo quitarlo. */
export const QUITAR_PERMISO = {
  microsoft: {
    personal: 'https://account.live.com/consent/Manage',
    trabajo: 'https://myapps.microsoft.com',
    texto: 'Cuenta personal (Outlook, Hotmail, Live): entrá a account.live.com/consent/Manage, buscá "Orbit" y tocá "Quitar estos permisos". Cuenta del trabajo o la facultad: entrá a myapps.microsoft.com, abrí el menú de "Orbit" y elegí "Administrar" → "Revocar permisos" (si no aparece, lo hace quien administra tu cuenta).',
  },
  google: {
    url: 'https://myaccount.google.com/connections',
    texto: 'Gmail: el acceso se revoca solo al terminar cada búsqueda. Si querés confirmarlo, entrá a myaccount.google.com/connections y quitá "Orbit".',
  },
};
