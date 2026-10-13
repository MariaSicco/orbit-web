/* Mi Mes · interfaz. Las cuentas viven en calculos.js (puro, con pruebas). */
import {
  CATEGORIAS, mesDe, sumarMeses, difMeses, nombreMes, proximoResumen, formatoPesos as $,
  leerPesos, repartirCuotas, ultimoMes, numeroDeCuota, activoEn, resumenMes, datosVacios, migrar,
} from './calculos.js';

const CLAVE = 'orbit:mi-mes';
const MAX_ADELANTE = 60;          // meses que se pueden mirar hacia adelante
const HOY = mesDe();

/* ── datos en el dispositivo ── */
let puedeGuardar = true;
function cargar() {
  let crudo;
  try { crudo = localStorage.getItem(CLAVE); }
  catch { puedeGuardar = false; return datosVacios(); }
  if (!crudo) return datosVacios();
  try { return migrar(JSON.parse(crudo)); }
  catch {
    /* datos rotos: los apartamos (no se pisan) y arrancamos de cero */
    try { localStorage.setItem(`${CLAVE}:roto:${Date.now()}`, crudo); } catch {}
    return datosVacios();
  }
}
function guardar() {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(datos));
    return true;
  } catch {
    puedeGuardar = false;
    document.getElementById('sin-storage').hidden = false;
    return false;
  }
}
let datos = cargar();
let mes = HOY;

const nuevoId = () => (globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $id = id => document.getElementById(id);
const capital = s => s.charAt(0).toUpperCase() + s.slice(1);
const corto = m => nombreMes(m, { corto: true });

/* ── toast ── */
let toastT;
function avisar(texto) {
  const t = $id('toast');
  t.textContent = texto;
  t.classList.add('on');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('on'), 2600);
}

/* ── vista: el mes ── */
function textoRepite(x) {
  if (!x.repite) return `Solo ${corto(x.desde)}`;
  if (x.hasta) return `Todos los meses hasta ${corto(x.hasta)}`;
  return 'Todos los meses';
}

function item(tipo, id, titulo, meta, monto, extra = '') {
  return `<li><button type="button" class="mm-item" data-editar="${tipo}" data-id="${esc(id)}">
    <span class="mm-item-txt"><span class="mm-item-tit">${esc(titulo)}${extra}</span><span class="mm-item-meta mono">${esc(meta)}</span></span>
    <span class="mm-item-monto">${esc(monto)}</span></button></li>`;
}
const vacio = texto => `<li class="mm-vacio">${texto}</li>`;

function pintarMes(animar = false) {
  const r = resumenMes(datos, mes);
  const sinNada = !datos.ingresos.length && !datos.gastos.length && !datos.cuotas.length;

  $id('mes-nombre').textContent = capital(nombreMes(mes));
  $id('mes-nombre').dataset.hoy = mes === HOY ? 'sí' : '';
  $id('mes-ant').disabled = mes === HOY;
  $id('mes-sig').disabled = difMeses(HOY, mes) >= MAX_ADELANTE;

  const num = $id('libres');
  num.textContent = sinNada ? '$ —' : $(r.libres);
  num.style.setProperty('--n', Math.max(7, num.textContent.length));
  num.classList.toggle('neg', r.libres < 0);
  $id('cuenta').textContent = sinNada ? '' :
    `${$(r.totIngresos)} − ${$(r.totGastos)} − ${$(r.totCuotas)}`;
  $id('cuenta').setAttribute('aria-label', sinNada ? '' :
    `Ingresos ${$(r.totIngresos)}, menos gastos fijos ${$(r.totGastos)}, menos cuotas ${$(r.totCuotas)}`);

  let nota = '';
  if (sinNada) nota = 'Cargá tu sueldo, tus gastos fijos y tus cuotas, y acá ves cuánto te queda libre este mes y los que vienen.';
  else if (!r.ingresos.length) nota = 'Este mes no tiene ingresos cargados. Sumá tu sueldo para que la cuenta dé.';
  else if (r.libres < 0) nota = `Este mes los gastos y las cuotas superan tus ingresos por ${$(-r.libres)}.`;
  else if (r.cuotas.some(c => c.ultima)) {
    const n = r.cuotas.filter(c => c.ultima).length;
    nota = n === 1 ? 'Este mes pagás la última cuota de una compra.' : `Este mes terminás de pagar ${n} compras.`;
  }
  $id('nota').textContent = nota;

  /* una acción principal: sin ingresos, cargar el ingreso; si no, la cuota */
  const sinIngresos = !datos.ingresos.length;
  $id('accion-texto').textContent = sinIngresos ? 'Cargar mi ingreso' : 'Cargar cuota';
  $id('accion-principal').dataset.nuevo = sinIngresos ? 'ingreso' : 'cuota';

  $id('tot-ing').textContent = $(r.totIngresos);
  $id('tot-gas').textContent = r.totGastos ? '−' + $(r.totGastos) : $(0);
  $id('tot-cuo').textContent = r.totCuotas ? '−' + $(r.totCuotas) : $(0);

  $id('lista-ing').innerHTML = r.ingresos.length
    ? r.ingresos.map(i => item('ingreso', i.id, i.nombre, textoRepite(i), $(i.monto))).join('')
    : vacio(datos.ingresos.length ? 'Sin ingresos este mes.' : 'Empezá por acá: tu sueldo o lo que cobres todos los meses.');
  $id('lista-gas').innerHTML = r.gastos.length
    ? r.gastos.map(g => item('gasto', g.id, g.nombre, `${g.nombre === g.categoria ? '' : g.categoria + ' · '}${textoRepite(g)}`, $(g.monto))).join('')
    : vacio(datos.gastos.length ? 'Sin gastos fijos este mes.' : 'Alquiler, expensas, servicios, suscripciones: lo que pagás sí o sí.');
  $id('lista-cuo').innerHTML = r.cuotas.length
    ? r.cuotas.map(c => item('cuota', c.id, c.descripcion || 'Compra en cuotas',
      `${c.tarjeta} · cuota ${c.numero}/${c.cantidad}`, $(c.monto),
      c.ultima ? ' <span class="mm-tag">Última</span>' : '')).join('')
    : vacio(datos.cuotas.length ? 'Sin cuotas este mes.' : 'Cargá una compra en cuotas: monto total, cuántas cuotas y la tarjeta. Nada más.');

  if (animar) {
    const h = $id('hero');
    h.classList.remove('mm-entra'); void h.offsetWidth; h.classList.add('mm-entra');
  }
}

/* ── vista: todo lo cargado ── */
function pintarCargado() {
  const tarj = new Map(datos.tarjetas.map(t => [t.id, t.nombre]));
  const ing = datos.ingresos.slice().sort((a, b) => b.monto - a.monto);
  const gas = datos.gastos.slice().sort((a, b) => b.monto - a.monto);
  const cuo = datos.cuotas.slice().sort((a, b) => difMeses(ultimoMes(b), ultimoMes(a)));
  $id('n-ing').textContent = ing.length ? `${ing.length}` : '';
  $id('n-gas').textContent = gas.length ? `${gas.length}` : '';
  $id('n-cuo').textContent = cuo.length ? `${cuo.length}` : '';
  $id('todo-ing').innerHTML = ing.length
    ? ing.map(i => item('ingreso', i.id, i.nombre, `${textoRepite(i)}${i.repite ? ' · desde ' + corto(i.desde) : ''}`, $(i.monto))).join('')
    : vacio('Todavía no cargaste ingresos.');
  $id('todo-gas').innerHTML = gas.length
    ? gas.map(g => item('gasto', g.id, g.nombre, `${g.nombre === g.categoria ? '' : g.categoria + ' · '}${textoRepite(g)}${g.repite ? ' · desde ' + corto(g.desde) : ''}`, $(g.monto))).join('')
    : vacio('Todavía no cargaste gastos fijos.');
  $id('todo-cuo').innerHTML = cuo.length
    ? cuo.map(c => {
      const terminada = difMeses(ultimoMes(c), HOY) > 0;
      const n = numeroDeCuota(c, HOY);
      const estado = terminada ? 'Terminada' : n ? `Vas por la ${n}/${c.cantidad}` : `Empieza ${corto(c.primerMes)}`;
      return item('cuota', c.id, c.descripcion || 'Compra en cuotas',
        `${tarj.get(c.tarjetaId) || 'Sin tarjeta'} · ${c.cantidad} × ${$(repartirCuotas(c.total, c.cantidad)[1] ?? c.total)} · ${estado} · termina ${corto(ultimoMes(c))}`,
        $(c.total));
    }).join('')
    : vacio('Todavía no cargaste cuotas.');
}

function pintar(animar) { pintarMes(animar); pintarCargado(); }

/* ── navegación ── */
function irAMes(nuevo) {
  if (difMeses(HOY, nuevo) < 0 || difMeses(HOY, nuevo) > MAX_ADELANTE) return;
  mes = nuevo;
  pintarMes(true);
}
$id('mes-ant').addEventListener('click', () => irAMes(sumarMeses(mes, -1)));
$id('mes-sig').addEventListener('click', () => irAMes(sumarMeses(mes, 1)));

function verVista(v) {
  for (const b of document.querySelectorAll('[data-vista]')) {
    if (b.dataset.vista === v) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  }
  $id('vista-mes').hidden = v !== 'mes';
  $id('vista-cargado').hidden = v !== 'cargado';
  try { history.replaceState(null, '', v === 'cargado' ? '#cargado' : location.pathname); } catch {}
  window.scrollTo({ top: 0 });
}
document.querySelector('.mm-tabs').addEventListener('click', e => {
  const b = e.target.closest('[data-vista]');
  if (b) verVista(b.dataset.vista);
});
/* flechas del teclado para cambiar de mes (fuera de los campos y diálogos) */
document.addEventListener('keydown', e => {
  if ($id('vista-mes').hidden || document.querySelector('dialog[open]')) return;
  if (e.target.closest?.('input,select,textarea')) return;
  if (e.key === 'ArrowRight') irAMes(sumarMeses(mes, 1));
  if (e.key === 'ArrowLeft') irAMes(sumarMeses(mes, -1));
});

/* ── selects de meses ── */
function opcionesMes(sel, desde, hasta, elegido, extra) {
  const ops = [];
  if (extra) ops.push(`<option value="">${esc(extra)}</option>`);
  for (let k = 0; k <= difMeses(desde, hasta); k++) {
    const m = sumarMeses(desde, k);
    ops.push(`<option value="${m}">${capital(nombreMes(m))}${m === HOY ? ' (este mes)' : ''}</option>`);
  }
  sel.innerHTML = ops.join('');
  sel.value = elegido ?? '';
  if (sel.value !== (elegido ?? '')) sel.selectedIndex = 0;
}

/* ── diálogos ── */
let abiertoDesde = null;
function abrir(dlg, foco) {
  abiertoDesde = document.activeElement;
  for (const e of dlg.querySelectorAll('.mm-err')) e.textContent = '';
  for (const e of dlg.querySelectorAll('[aria-invalid]')) e.removeAttribute('aria-invalid');
  dlg.showModal();
  requestAnimationFrame(() => foco?.focus());
}
function cerrar(dlg) {
  dlg.close();
}
for (const dlg of document.querySelectorAll('dialog')) {
  /* el foco vuelve a donde estaba; si ese botón se volvió a pintar, al mismo ítem
     en la vista visible, y si se borró, a la acción principal */
  dlg.addEventListener('close', () => {
    let destino = abiertoDesde;
    if (!destino?.isConnected) {
      const id = abiertoDesde?.dataset?.id;
      const vista = $id('vista-mes').hidden ? '#vista-cargado' : '#vista-mes';
      destino = (id && document.querySelector(`${vista} [data-id="${CSS.escape(id)}"]`)) ||
        ($id('vista-mes').hidden ? $id('t-cargado') : $id('accion-principal'));
    }
    if (destino === $id('t-cargado')) destino.setAttribute('tabindex', '-1');
    destino?.focus?.();
  });
  dlg.addEventListener('click', e => {
    if (e.target.closest('[data-cerrar]')) cerrar(dlg);
    else if (e.target === dlg) cerrar(dlg);          // toque en el fondo
  });
}
function error(input, errEl, texto) {
  input.setAttribute('aria-invalid', 'true');
  $id(errEl).textContent = texto;
  return input;
}
function limpiarError(input, errEl) {
  input.removeAttribute('aria-invalid');
  $id(errEl).textContent = '';
}
/* borrar en dos toques: el primero pide confirmación */
function armarBorrar(btn, alBorrar) {
  let t;
  btn.onclick = () => {
    if (btn.dataset.confirmar) { clearTimeout(t); alBorrar(); return; }
    btn.dataset.confirmar = '1';
    btn.textContent = '¿Seguro? Tocá de nuevo';
    t = setTimeout(() => { delete btn.dataset.confirmar; btn.textContent = 'Borrar'; }, 4000);
  };
  delete btn.dataset.confirmar;
  btn.textContent = 'Borrar';
}
/* al salir del campo, el monto queda con puntos de miles */
for (const id of ['c-total', 'i-monto', 'g-monto']) {
  $id(id).addEventListener('blur', e => {
    const c = leerPesos(e.target.value);
    if (c !== null && c > 0) e.target.value = $(c, { centavos: true }).replace('$ ', '');
  });
}

/* ── cuota ── */
const dc = $id('dlg-cuota');
let editCuota = null;      // id que se edita, o null
let tarjetaElegida = null; // id de tarjeta, o '' = nueva

function pintarTarjetas() {
  const cont = $id('c-tarjetas');
  const chips = datos.tarjetas.map(t => `<label class="chip mm-radio"><input type="radio" name="tarjeta" value="${esc(t.id)}"${t.id === tarjetaElegida ? ' checked' : ''}><span>${esc(t.nombre)}</span></label>`);
  chips.push(`<label class="chip mm-radio"><input type="radio" name="tarjeta" value=""${tarjetaElegida === '' ? ' checked' : ''}><span>+ Nueva tarjeta</span></label>`);
  cont.innerHTML = chips.join('');
  $id('c-nueva-wrap').hidden = tarjetaElegida !== '';
  /* sin tarjetas todavía: el chip "nueva" no hace falta, va directo el campo */
  cont.hidden = !datos.tarjetas.length;
}
$id('c-tarjetas').addEventListener('change', e => {
  tarjetaElegida = e.target.value;
  limpiarError($id('c-nueva'), 'c-tarj-err');
  $id('c-nueva-wrap').hidden = tarjetaElegida !== '';
  if (tarjetaElegida === '') $id('c-nueva').focus();
  previewCuota();
});

function marcarCantRapida() {
  const v = $id('c-cant').value;
  for (const b of document.querySelectorAll('[data-cant]')) b.setAttribute('aria-pressed', String(b.dataset.cant === v));
}
$id('c-cant-rapidas').addEventListener('click', e => {
  const b = e.target.closest('[data-cant]');
  if (!b) return;
  $id('c-cant').value = b.dataset.cant;
  limpiarError($id('c-cant'), 'c-cant-err');
  marcarCantRapida(); previewCuota();
});
for (const id of ['c-total', 'c-cant', 'c-mes']) $id(id).addEventListener('input', () => { marcarCantRapida(); previewCuota(); });

function leerCant() {
  const n = Number($id('c-cant').value);
  return Number.isInteger(n) && n >= 1 && n <= 72 ? n : null;
}
function previewCuota() {
  const total = leerPesos($id('c-total').value);
  const n = leerCant();
  const p = $id('c-preview');
  if (!total || !n) { p.textContent = ''; return; }
  const cs = repartirCuotas(total, n);
  const primer = $id('c-mes').value;
  const fin = sumarMeses(primer, n - 1);
  const dec = { centavos: true };
  let txt;
  if (n === 1) txt = `1 pago de ${$(total, dec)} en ${corto(primer)}`;
  else if (cs[0] === cs[1]) txt = `${n} cuotas de ${$(cs[1], dec)} · ${corto(primer)} → ${corto(fin)}`;
  else txt = `1ª de ${$(cs[0], dec)} y ${n - 1} de ${$(cs[1], dec)} · ${corto(primer)} → ${corto(fin)}`;
  const k = numeroDeCuota({ primerMes: primer, cantidad: n }, HOY);
  if (k > 1) txt += ` · este mes pagás la ${k}/${n}`;
  p.textContent = txt;
}

function abrirCuota(id = null) {
  editCuota = id;
  const c = id ? datos.cuotas.find(x => x.id === id) : null;
  $id('dc-tit').textContent = c ? 'Editar cuota' : 'Nueva cuota';
  $id('c-total').value = c ? $(c.total, { centavos: true }).replace('$ ', '') : '';
  $id('c-cant').value = c ? c.cantidad : '';
  $id('c-desc').value = c?.descripcion || '';
  $id('c-nueva').value = '';
  /* tarjeta: la de la compra, o la última que usaste */
  const ultima = datos.cuotas[datos.cuotas.length - 1]?.tarjetaId;
  tarjetaElegida = c ? c.tarjetaId : (ultima || datos.tarjetas[0]?.id || '');
  pintarTarjetas();
  const primer = c ? c.primerMes : proximoResumen();
  const desde = difMeses(primer, sumarMeses(HOY, -24)) > 0 ? primer : sumarMeses(HOY, -24);
  opcionesMes($id('c-mes'), desde, sumarMeses(HOY, 24), primer);
  $id('c-borrar').hidden = !c;
  if (c) armarBorrar($id('c-borrar'), () => {
    datos.cuotas = datos.cuotas.filter(x => x.id !== id);
    limpiarTarjetasHuerfanas();
    guardar(); pintar(); cerrar(dc); avisar('Cuota borrada');
  });
  marcarCantRapida(); previewCuota();
  abrir(dc, $id('c-total'));
}
function limpiarTarjetasHuerfanas() {
  const usadas = new Set(datos.cuotas.map(c => c.tarjetaId));
  datos.tarjetas = datos.tarjetas.filter(t => usadas.has(t.id));
}

dc.querySelector('form').addEventListener('submit', e => {
  e.preventDefault();
  const fallas = [];
  const total = leerPesos($id('c-total').value);
  if (!total) fallas.push(error($id('c-total'), 'c-total-err', 'Escribí el monto total, por ejemplo 120.000 (los centavos van con coma).'));
  else limpiarError($id('c-total'), 'c-total-err');
  const n = leerCant();
  if (!n) fallas.push(error($id('c-cant'), 'c-cant-err', 'Elegí cuántas cuotas (de 1 a 72).'));
  else limpiarError($id('c-cant'), 'c-cant-err');
  let tarjetaId = tarjetaElegida;
  const nombreNueva = $id('c-nueva').value.trim();
  if (!tarjetaId) {
    if (!nombreNueva) fallas.push(error($id('c-nueva'), 'c-tarj-err', 'Ponele un nombre a la tarjeta, por ejemplo "Visa Galicia".'));
    else limpiarError($id('c-nueva'), 'c-tarj-err');
  }
  if (fallas.length) { fallas[0].focus(); return; }

  if (!tarjetaId) {
    const existente = datos.tarjetas.find(t => t.nombre.toLowerCase() === nombreNueva.toLowerCase());
    if (existente) tarjetaId = existente.id;
    else { tarjetaId = nuevoId(); datos.tarjetas.push({ id: tarjetaId, nombre: nombreNueva.slice(0, 40) }); }
  }
  const cuota = { id: editCuota || nuevoId(), descripcion: $id('c-desc').value.trim().slice(0, 60),
    total, cantidad: n, tarjetaId, primerMes: $id('c-mes').value };
  if (editCuota) datos.cuotas = datos.cuotas.map(x => (x.id === editCuota ? cuota : x));
  else datos.cuotas.push(cuota);
  limpiarTarjetasHuerfanas();
  guardar(); pintar(); cerrar(dc);
  avisar(editCuota ? 'Cuota actualizada' : 'Cuota cargada');
});

/* ── ingreso ── */
const di = $id('dlg-ingreso');
let editIngreso = null;
function abrirIngreso(id = null) {
  editIngreso = id;
  const x = id ? datos.ingresos.find(i => i.id === id) : null;
  $id('di-tit').textContent = x ? 'Editar ingreso' : 'Nuevo ingreso';
  $id('i-monto').value = x ? $(x.monto, { centavos: true }).replace('$ ', '') : '';
  $id('i-nombre').value = x?.nombre || '';
  $id('i-nombre').placeholder = datos.ingresos.length ? 'Ej: Extra' : 'Sueldo';
  $id('i-repite').checked = x ? x.repite : true;
  const desde = x ? x.desde : mes;
  opcionesMes($id('i-desde'), difMeses(desde, sumarMeses(HOY, -12)) > 0 ? desde : sumarMeses(HOY, -12), sumarMeses(HOY, MAX_ADELANTE), desde);
  etiquetaDesde('i');
  $id('i-borrar').hidden = !x;
  if (x) armarBorrar($id('i-borrar'), () => {
    datos.ingresos = datos.ingresos.filter(i => i.id !== id);
    guardar(); pintar(); cerrar(di); avisar('Ingreso borrado');
  });
  abrir(di, $id('i-monto'));
}
function etiquetaDesde(p) {
  $id(`${p}-desde-lbl`).textContent = $id(`${p}-repite`).checked ? 'Desde' : 'Mes';
  if (p === 'g') $id('g-hasta-wrap').hidden = !$id('g-repite').checked;
}
$id('i-repite').addEventListener('change', () => etiquetaDesde('i'));
di.querySelector('form').addEventListener('submit', e => {
  e.preventDefault();
  const monto = leerPesos($id('i-monto').value);
  if (!monto) { error($id('i-monto'), 'i-monto-err', 'Escribí el monto, por ejemplo 1.200.000 (los centavos van con coma).').focus(); return; }
  const primero = !datos.ingresos.length;
  const x = { id: editIngreso || nuevoId(), nombre: $id('i-nombre').value.trim().slice(0, 60) || (primero ? 'Sueldo' : 'Ingreso'),
    monto, repite: $id('i-repite').checked, desde: $id('i-desde').value };
  if (editIngreso) datos.ingresos = datos.ingresos.map(i => (i.id === editIngreso ? x : i));
  else datos.ingresos.push(x);
  guardar(); pintar(); cerrar(di);
  avisar(editIngreso ? 'Ingreso actualizado' : 'Ingreso cargado');
});

/* ── gasto fijo ── */
const dg = $id('dlg-gasto');
let editGasto = null;
let catElegida = CATEGORIAS[0];
function pintarCats() {
  $id('g-cats').innerHTML = CATEGORIAS.map(c => `<label class="chip mm-radio"><input type="radio" name="cat" value="${esc(c)}"${c === catElegida ? ' checked' : ''}><span>${esc(c)}</span></label>`).join('');
  $id('g-nombre').placeholder = catElegida;
}
$id('g-cats').addEventListener('change', e => { catElegida = e.target.value; $id('g-nombre').placeholder = catElegida; });
function opcionesHasta(desde, elegido) {
  opcionesMes($id('g-hasta'), desde, sumarMeses(HOY, MAX_ADELANTE), elegido || '', 'Sin fecha de fin');
}
function abrirGasto(id = null) {
  editGasto = id;
  const x = id ? datos.gastos.find(g => g.id === id) : null;
  $id('dg-tit').textContent = x ? 'Editar gasto fijo' : 'Nuevo gasto fijo';
  /* categoría sugerida: la primera de las básicas que todavía no cargaste */
  const usadas = new Set(datos.gastos.map(g => g.categoria));
  catElegida = x ? x.categoria : (['Alquiler', 'Expensas', 'Servicios', 'Suscripciones'].find(c => !usadas.has(c)) || 'Otros');
  pintarCats();
  $id('g-monto').value = x ? $(x.monto, { centavos: true }).replace('$ ', '') : '';
  $id('g-nombre').value = x && x.nombre !== x.categoria ? x.nombre : '';
  $id('g-repite').checked = x ? x.repite : true;
  const desde = x ? x.desde : mes;
  opcionesMes($id('g-desde'), difMeses(desde, sumarMeses(HOY, -12)) > 0 ? desde : sumarMeses(HOY, -12), sumarMeses(HOY, MAX_ADELANTE), desde);
  opcionesHasta(desde, x?.hasta);
  etiquetaDesde('g');
  $id('g-borrar').hidden = !x;
  if (x) armarBorrar($id('g-borrar'), () => {
    datos.gastos = datos.gastos.filter(g => g.id !== id);
    guardar(); pintar(); cerrar(dg); avisar('Gasto borrado');
  });
  abrir(dg, $id('g-monto'));
}
$id('g-repite').addEventListener('change', () => etiquetaDesde('g'));
$id('g-desde').addEventListener('change', () => {
  const h = $id('g-hasta').value;
  opcionesHasta($id('g-desde').value, h && difMeses($id('g-desde').value, h) >= 0 ? h : '');
});
dg.querySelector('form').addEventListener('submit', e => {
  e.preventDefault();
  const monto = leerPesos($id('g-monto').value);
  if (!monto) { error($id('g-monto'), 'g-monto-err', 'Escribí el monto, por ejemplo 450.000 (los centavos van con coma).').focus(); return; }
  const repite = $id('g-repite').checked;
  const hasta = repite ? $id('g-hasta').value : '';
  const x = { id: editGasto || nuevoId(), nombre: $id('g-nombre').value.trim().slice(0, 60) || catElegida,
    categoria: catElegida, monto, repite, desde: $id('g-desde').value, ...(hasta ? { hasta } : {}) };
  if (editGasto) datos.gastos = datos.gastos.map(g => (g.id === editGasto ? x : g));
  else datos.gastos.push(x);
  guardar(); pintar(); cerrar(dg);
  avisar(editGasto ? 'Gasto actualizado' : 'Gasto cargado');
});

/* ── abrir formularios desde cualquier lado ── */
const ABRIR = { cuota: abrirCuota, ingreso: abrirIngreso, gasto: abrirGasto };
document.addEventListener('click', e => {
  const n = e.target.closest('[data-nuevo]');
  if (n) { ABRIR[n.dataset.nuevo]?.(); return; }
  const ed = e.target.closest('[data-editar]');
  if (ed) ABRIR[ed.dataset.editar]?.(ed.dataset.id);
});
for (const b of document.querySelectorAll('.mm-pronto-item')) {
  b.addEventListener('click', () => avisar('Llega en la próxima actualización.'));
}

/* otra pestaña cambió los datos */
window.addEventListener('storage', e => {
  if (e.key !== CLAVE) return;
  datos = cargar();
  pintar();
if (location.hash === '#cargado') verVista('cargado');
});

if (!puedeGuardar) $id('sin-storage').hidden = false;
else {
  /* probamos escribir: Safari en privado puede leer pero no escribir */
  try { localStorage.setItem(CLAVE + ':prueba', '1'); localStorage.removeItem(CLAVE + ':prueba'); }
  catch { puedeGuardar = false; $id('sin-storage').hidden = false; }
}
pintar();
if (location.hash === '#cargado') verVista('cargado');
