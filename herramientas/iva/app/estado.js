// Estado de la app y dónde se guarda.
//   Modo cuenta (orbitando.com.ar): en la cuenta de Orbit, por /api/iva/datos. Un documento con empresas, perfiles y la
//   lista de períodos, y un documento por período que se trae recién cuando se abre. Las fotos no se guardan.
//   Modo código (proyecto de prueba): en el navegador (localStorage).

const CLAVE = 'orbit-iva-prototipo-v3';
const NUBE = globalThis.ORBIT_IVA?.modo === 'cuenta';
const API_DATOS = `${globalThis.ORBIT_IVA?.api ?? '/api'}/datos`;
const vacio = () => ({ clientes: [], periodos: [], perfiles: {}, actual: { periodoId: null, clienteId: null, paso: 'inicio', lado: 'compra' } });

export const S = NUBE ? vacio() : cargar() ?? vacio();
// estado: local | cargando | listo | guardando | guardado | error
export const nube = { activa: NUBE, estado: NUBE ? 'cargando' : 'local', error: null };

function cargar() {
  try { return JSON.parse(localStorage.getItem(CLAVE)); } catch { return null; }
}

// Devuelve false si no se pudo guardar (sin espacio o sin almacenamiento): la app sigue en memoria y avisa una vez.
export let sinEspacio = false;
export function guardar() {
  if (NUBE) { programarGuardado(); return true; }
  try {
    const copia = structuredClone(S);
    for (const p of copia.periodos) for (const f of p.fotos) if (f.imagenUrl?.startsWith('blob:')) f.imagenUrl = null;
    localStorage.setItem(CLAVE, JSON.stringify(copia));
    return true;
  } catch {
    if (!sinEspacio) { sinEspacio = true; dispatchEvent(new CustomEvent('orbit-sin-espacio')); }
    return false;
  }
}

export const nuevoId = p => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

export function periodoActual() {
  return S.periodos.find(p => p.id === S.actual.periodoId) ?? null;
}

// Al entrar no hay pantalla de clientes: si no hay ninguno se crea "Mi empresa" y se abre el mes actual.
// Los clientes (empresas) se agregan después, desde el selector de la barra de arriba.
export const mesActual = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };

export function asegurarInicio() {
  if (!S.clientes.length) S.clientes.push({ id: nuevoId('cli'), nombre: 'Mi empresa', cuit: '' });
  if (!S.clientes.some(c => c.id === S.actual.clienteId)) S.actual.clienteId = clienteDe(periodoActual())?.id ?? S.clientes[0].id;
  if (!periodoActual()) abrirPeriodo(S.actual.clienteId, mesActual());
}

export function abrirPeriodo(clienteId, mes) {
  const p = S.periodos.find(x => x.clienteId === clienteId && x.mes === mes) ?? nuevoPeriodo(clienteId, mes);
  S.actual.clienteId = clienteId;
  S.actual.periodoId = p.id;
  guardar();
  return p;
}

export function clienteDe(periodo) {
  return S.clientes.find(c => c.id === periodo?.clienteId) ?? null;
}

export function nuevoPeriodo(clienteId, mes) {
  const p = {
    id: nuevoId('per'), clienteId, mes,
    fotos: [], archivos: {},
    conc: null, // conciliador: se arma en app/conciliador-datos.js
  };
  S.periodos.push(p);
  return p;
}

// ——— Guardado en la cuenta de Orbit ———
const enServidor = new Set();   // períodos que existen en la cuenta
const sucios = new Set();       // períodos con cambios sin guardar
let espera = null, enCurso = null;
const avisarNube = () => dispatchEvent(new CustomEvent('orbit-guardado'));

async function pedirDatos(metodo, params, cuerpo) {
  const r = await fetch(`${API_DATOS}?${new URLSearchParams(params)}`, {
    method: metodo, headers: cuerpo ? { 'content-type': 'application/json' } : {}, body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const d = await r.json().catch(() => ({ ok: false, error: `El servidor respondió ${r.status}.` }));
  if (!r.ok || !d.ok) throw new Error(d.error || 'No pudimos guardar.');
  return d;
}

export async function cargarDeLaCuenta() {
  nube.estado = 'cargando'; avisarNube();
  const { datos } = await pedirDatos('GET', { doc: 'estado' });
  if (datos) {
    S.clientes = datos.clientes ?? []; S.perfiles = datos.perfiles ?? {};
    S.actual = { ...S.actual, ...(datos.actual ?? {}), paso: 'inicio' };
    S.periodos = (datos.periodos ?? []).map(m => ({ ...m, _pendiente: true }));
    for (const m of S.periodos) enServidor.add(m.id);
  }
  nube.estado = 'listo'; avisarNube();
}

// Un período se trae de la cuenta la primera vez que se abre
export async function cargarPeriodo(p) {
  if (!p?._pendiente) return p;
  const { datos } = await pedirDatos('GET', { doc: 'periodo', id: p.id });
  Object.assign(p, datos ?? { fotos: [], archivos: {}, conc: null });
  delete p._pendiente;
  return p;
}

function programarGuardado() {
  if (S.actual.periodoId) sucios.add(S.actual.periodoId);
  nube.estado = 'guardando'; avisarNube();
  clearTimeout(espera);
  espera = setTimeout(guardarAhora, 1200);
}

const sinFotos = p => ({ ...structuredClone(p), fotos: (p.fotos ?? []).map(f => ({ ...f, imagenUrl: f.imagenUrl?.startsWith('http') ? f.imagenUrl : null })) });

export async function guardarAhora() {
  if (enCurso) { await enCurso; return guardarAhora(); }
  enCurso = (async () => {
    try {
      for (const id of [...sucios]) {
        const p = S.periodos.find(x => x.id === id);
        sucios.delete(id);
        if (!p || p._pendiente) continue;
        const { _pendiente, ...datos } = sinFotos(p);
        await pedirDatos('PUT', {}, { doc: 'periodo', id, datos });
        enServidor.add(id);
      }
      for (const id of [...enServidor]) {
        if (S.periodos.some(p => p.id === id)) continue;
        await pedirDatos('DELETE', { doc: 'periodo', id });
        enServidor.delete(id);
      }
      await pedirDatos('PUT', {}, { doc: 'estado', datos: {
        clientes: S.clientes, perfiles: S.perfiles, actual: { clienteId: S.actual.clienteId, periodoId: S.actual.periodoId, lado: S.actual.lado },
        periodos: S.periodos.map(p => ({ id: p.id, clienteId: p.clienteId, mes: p.mes })),
      } });
      nube.estado = sucios.size ? 'guardando' : 'guardado'; nube.error = null;
    } catch (e) {
      if (S.actual.periodoId) sucios.add(S.actual.periodoId);
      nube.estado = 'error'; nube.error = e.message;
      clearTimeout(espera); espera = setTimeout(guardarAhora, 15000);   // reintento
    }
    avisarNube();
  })();
  await enCurso; enCurso = null;
}

export const hayCambiosSinGuardar = () => NUBE && (sucios.size > 0 || nube.estado === 'guardando' || nube.estado === 'error');
