// Estado de la app y cálculos derivados.
// PERSISTENCIA PROVISORIA: se guarda en el navegador (localStorage) solo como comodidad del prototipo.
// La versión que se vende guarda clientes y períodos en el backend de Orbit (capa pendiente de pedido explícito).

const CLAVE = 'orbit-iva-prototipo-v3';

export const S = cargar() ?? { clientes: [], periodos: [], perfiles: {}, actual: { periodoId: null, clienteId: null, paso: 'inicio', lado: 'compra' } };

function cargar() {
  try { return JSON.parse(localStorage.getItem(CLAVE)); } catch { return null; }
}

// Devuelve false si no se pudo guardar (sin espacio o sin almacenamiento): la app sigue en memoria y avisa una vez.
export let sinEspacio = false;
export function guardar() {
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
