// Lectura con IA desde el navegador. Dos modos:
//   codigo  proyecto de prueba: código de acceso en el link y límite diario (/api/extraer).
//   cuenta  dentro de orbitando.com.ar: sesión de Orbit + compra de Orbit IVA y saldo de lecturas (/api/iva/extraer).
// El modo lo fija la página con window.ORBIT_IVA = { api: '/api/iva', modo: 'cuenta' }.

import { achicar } from './escanear-qr.js';

const CLAVE = 'orbit-iva-codigo';
export const CONF = { api: '/api', modo: 'codigo', ...(globalThis.ORBIT_IVA ?? {}) };
export const modoCuenta = CONF.modo === 'cuenta';
// estado: sin-codigo | validando | activa | invalida (modo código) · sin-sesion | sin-compra (modo cuenta)
export const ia = { codigo: modoCuenta ? null : leer(), nombre: null, email: null, usadas: 0, limite: 0, saldo: 0, ilimitado: false, recarga: null, estado: 'validando' };

function leer() { try { return localStorage.getItem(CLAVE); } catch { return null; } }
function escribir(v) { try { v ? localStorage.setItem(CLAVE, v) : localStorage.removeItem(CLAVE); } catch { /* sin almacenamiento */ } }

async function pedir(metodo, cuerpo) {
  const r = await fetch(`${CONF.api}/extraer`, {
    method: metodo,
    headers: { ...(modoCuenta ? {} : { 'x-orbit-codigo': ia.codigo ?? '' }), ...(cuerpo ? { 'content-type': 'application/json' } : {}) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const datos = await r.json().catch(() => ({ ok: false, error: `El servidor respondió ${r.status}.` }));
  return { status: r.status, ...datos };
}

// Modo cuenta: la sesión de Orbit decide. Se consulta al abrir la app y después de cada lectura se actualiza el saldo.
async function estadoCuenta() {
  const r = await pedir('GET').catch(() => ({ ok: false, status: 0 }));
  if (r.ok) Object.assign(ia, { nombre: r.nombre, email: r.email, saldo: r.saldo, ilimitado: r.ilimitado, recarga: r.recarga, estado: 'activa' });
  else ia.estado = r.status === 401 ? 'sin-sesion' : r.status === 403 ? 'sin-compra' : 'sin-conexion';
  return r;
}
const actualizarSaldo = r => { if (r?.saldo != null) ia.saldo = r.saldo; if (r?.status === 401) ia.estado = 'sin-sesion'; };

// Recarga de lecturas: se paga con el checkout de siempre de la tienda y el saldo se suma solo al acreditarse.
export async function comprarRecarga(via) {
  if (!ia.recarga || !ia.email) throw new Error('No pudimos iniciar la compra. Recargá la página.');
  const r = await fetch(`/api/checkout/${via}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: ia.email, items: [{ id: ia.recarga.id, qty: 1 }] }) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.url) throw new Error('No pudimos abrir el pago. Probá de nuevo en un rato.');
  location.href = d.url;
}

export async function activar(codigo) {
  // Igual que en el servidor: acepta "majo=ORB-…", guiones largos, espacios o sin guiones
  const t = String(codigo ?? '').toUpperCase().replace(/[\u2010-\u2015\u2212]/g, '-').replace(/\s+/g, '');
  const m = t.match(/ORB-?([A-Z0-9]{4})-?([A-Z0-9]{4})/);
  ia.codigo = m ? `ORB-${m[1]}-${m[2]}` : t;
  ia.estado = 'validando';
  const r = await pedir('GET').catch(() => ({ ok: false, error: 'Sin conexión con el servidor.' }));
  if (r.ok) {
    Object.assign(ia, { nombre: r.nombre, usadas: r.usadas, limite: r.limite, estado: 'activa' });
    escribir(ia.codigo);
  } else {
    ia.estado = r.status === 401 && r.configurados ? 'invalida' : 'sin-codigo';
    if (r.status === 401) escribir(null);
  }
  return r;
}

export function desactivar() {
  Object.assign(ia, { codigo: null, nombre: null, estado: 'sin-codigo' });
  escribir(null);
}

// Al abrir la app, si hay un código recordado, se revalida en segundo plano.
// El acceso llega en el link que se le pasa a cada persona (…/app/?acceso=ORB-XXXX-XXXX): se guarda en el navegador
// y se saca de la barra de direcciones. No hay que activar nada a mano: la IA trabaja sola en cada lectura.
function codigoDelLink() {
  try {
    const url = new URL(location.href);
    const c = url.searchParams.get('acceso');
    if (!c) return null;
    url.searchParams.delete('acceso');
    history.replaceState(null, '', url.pathname + url.search + url.hash);
    return c;
  } catch { return null; }
}
const delLink = modoCuenta ? null : codigoDelLink();
if (!modoCuenta && !delLink && !ia.codigo) ia.estado = 'sin-codigo';
export const iaLista = modoCuenta ? estadoCuenta() : delLink || ia.codigo ? activar(delLink || ia.codigo) : Promise.resolve();

export const iaDisponible = () => ia.estado === 'activa' && (modoCuenta ? ia.ilimitado || ia.saldo > 0 : ia.usadas < ia.limite);

// canvas: la factura (foto o página de PDF). Se manda en JPEG con el lado mayor ≤ 2000 px.
export async function leerConIa(canvas, { qrTexto, cuitCliente }) {
  const chica = achicar(canvas, 2000);
  const dataUrl = chica.toDataURL('image/jpeg', 0.85);
  const r = await pedir('POST', { imagen: dataUrl.slice(dataUrl.indexOf(',') + 1), mediaType: 'image/jpeg', qrTexto, cuitCliente });
  if (r.usadas != null) { ia.usadas = r.usadas; ia.limite = r.limite ?? ia.limite; }
  actualizarSaldo(r);
  if (r.status === 401 && !modoCuenta) desactivar();
  return r;
}

// PDF de varias páginas: se manda el PDF entero (Claude lee todas las páginas). Máximo 3 MB para no pasar el límite de Vercel.
export async function leerPdfConIa(archivo, { qrTexto, cuitCliente }) {
  const bytes = new Uint8Array(await archivo.arrayBuffer());
  let binario = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const r = await pedir('POST', { imagen: btoa(binario), mediaType: 'application/pdf', qrTexto, cuitCliente });
  if (r.usadas != null) { ia.usadas = r.usadas; ia.limite = r.limite ?? ia.limite; }
  actualizarSaldo(r);
  if (r.status === 401 && !modoCuenta) desactivar();
  return r;
}

// Asistente del conciliador (/api/asistente): columnas, reglas, candidatos y explicaciones.
// Solo se manda lo mínimo (muestras, una instrucción, pocos candidatos). La respuesta ya viene validada por el servidor.
export const modelosUsados = new Set();
export async function pedirAsistente(tarea, datos) {
  if (ia.estado !== 'activa') return { ok: false, error: modoCuenta ? 'Entrá con tu cuenta de Orbit para usar el asistente.' : 'La IA no está disponible en este navegador: abrí el link de acceso que te pasaron.' };
  let r;
  try {
    const resp = await Promise.race([
      fetch(`${CONF.api}/asistente`, { method: 'POST', headers: { ...(modoCuenta ? {} : { 'x-orbit-codigo': ia.codigo ?? '' }), 'content-type': 'application/json' }, body: JSON.stringify({ tarea, datos }) }),
      new Promise((_, no) => setTimeout(() => no(new Error('timeout')), 65000)),
    ]);
    r = await resp.json().catch(() => ({ ok: false, error: `El servidor respondió ${resp.status}.` }));
    if (resp.status === 401 && !modoCuenta) desactivar();
  } catch (e) {
    return { ok: false, error: e.message === 'timeout' ? 'Claude tardó demasiado. Probá de nuevo o seguí sin IA.' : 'Sin conexión con el servidor. Podés seguir sin IA.' };
  }
  if (r.usadas != null) { ia.usadas = r.usadas; ia.limite = r.limite ?? ia.limite; }
  if (r.modelo) modelosUsados.add(r.modelo);
  return r;
}
