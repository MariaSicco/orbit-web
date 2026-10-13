/* Vencimientos de la Casa (ob-021) · interfaz. Las cuentas están en calculos.js.
   Los datos viven solo en este dispositivo (localStorage). */
import * as V from './calculos.js';
import { SERVICIOS, CATEGORIAS, PRIMER_USO, servicio, monograma, tintaSobre } from './servicios.js';
import { datosEjemplo } from './ejemplo.js';

const CLAVE = 'orbit:vencimientos:v1';
const $id = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const plata = (c, moneda = 'ARS') => V.formatoMoneda(c, moneda);
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

/* ── estado ── */
let almacenOK = true;
function cargar() {
  let crudo = null;
  try { crudo = localStorage.getItem(CLAVE); } catch { almacenOK = false; }
  if (!crudo) return V.estadoVacio();
  try { return V.migrar(JSON.parse(crudo)); }
  catch {
    try { localStorage.setItem(`${CLAVE}:roto:${Date.now()}`, crudo); } catch {}
    return V.estadoVacio();
  }
}
let d = cargar();
function guardar(nuevo) {
  d = nuevo;
  if (!d.creado) d.creado = new Date().toISOString();
  try { localStorage.setItem(CLAVE, JSON.stringify(d)); almacenOK = true; }
  catch { almacenOK = false; toast('No pudimos guardar en este navegador. Descargá una copia desde Ajustes.'); }
  render();
}

let hoy = V.hoyLocal();
const ui = { vista: 'inicio', mes: V.mesDe(hoy), mesCal: V.mesDe(hoy), dia: hoy, resueltos: false,
  onb: { paso: 1, sel: new Set() }, borrarArmado: null };

/* ── piezas ── */
function avatar(c, extra = '') {
  const color = c.color || servicio(c.preset)?.color || '#0D0D0E';
  return `<span class="av ${extra}" style="--c:${esc(color)};--t:${tintaSobre(color)}" aria-hidden="true">${esc(monograma(c.nombre))}</span>`;
}
function textoEstado(o) {
  const c = o.cuenta;
  const deb = c.debito;
  let t;
  switch (o.estado) {
    case 'vencido': t = `Venció ${V.cuandoEs(o.vence, hoy)}`; break;
    case 'segundo': t = `Venció · llegás hasta el ${V.fechaCorta(o.segundo)}`; break;
    case 'hoy': t = deb ? 'Se debita hoy' : (c.tipo === 'tramite' ? 'Vence hoy' : 'Vence hoy'); break;
    case 'pagado': t = c.tipo === 'tramite' ? `Hecho ${o.pago?.fecha ? V.fechaCorta(o.pago.fecha) : ''}` : `Pagado ${o.pago?.fecha ? V.fechaCorta(o.pago.fecha) : ''}`; break;
    case 'debitado': t = V.difDias(o.vence, hoy) <= 2 ? `Se debitó ${V.cuandoEs(o.vence, hoy)} · revisá tu cuenta` : `Débito automático · ${V.fechaCorta(o.vence)}`; break;
    case 'salteado': t = 'Este período no vino'; break;
    default: t = `${cap(V.fechaCorta(o.vence))} · ${V.cuandoEs(o.vence, hoy)}${deb ? ' · débito' : ''}`;
  }
  if (o.cuota) t += ` · cuota ${o.cuota}/${c.cuotas}`;
  if (o.ajusta && !o.resuelto) t += ' · se ajusta';
  return t.trim();
}
function montoFila(o) {
  if (o.cuenta.tipo === 'tramite') return '<span class="fila-monto"><small>Trámite</small></span>';
  if (o.monto == null) return '<span class="fila-monto"><small>Sin monto</small></span>';
  if (o.origen === 'estimado') return `<span class="fila-monto"><span class="aprox">≈</span> ${plata(o.monto, o.moneda)}<small>estimado</small></span>`;
  return `<span class="fila-monto">${plata(o.monto, o.moneda)}${o.origen === 'factura' && !o.resuelto ? '<small>factura</small>' : ''}</span>`;
}
function fila(o) {
  const res = o.resuelto;
  const nombre = esc(o.cuenta.nombre);
  const accTick = o.estado === 'debitado' ? 'Débito automático: ver detalle' : res ? `Desmarcar ${nombre}` : (o.cuenta.tipo === 'tramite' ? `Marcar ${nombre} como hecho` : `Marcar ${nombre} como pagado`);
  return `<li class="fila est-${o.estado}${res ? ' res' : ''}">
    <button type="button" class="fila-main" data-acc="ver" data-id="${esc(o.id)}">
      ${avatar(o.cuenta)}
      <span class="fila-txt"><b>${nombre}</b><small>${esc(textoEstado(o))}</small></span>
      ${montoFila(o)}
    </button>
    <button type="button" class="tick" data-acc="${o.estado === 'debitado' ? 'ver' : 'tick'}" data-id="${esc(o.id)}" aria-label="${accTick}" aria-pressed="${res}"><span><svg><use href="#i-check"/></svg></span></button>
  </li>`;
}
const grupo = (titulo, ocs, clase = '', derecha = '') => !ocs.length ? '' : `
  <div class="grupo ${clase}"><h2><span class="mono">${titulo}</span><span class="mono dim">${derecha}</span></h2>
  <ul class="lista">${ocs.map(fila).join('')}</ul></div>`;
const sumaARS = ocs => ocs.reduce((s, o) => s + (o.moneda === 'ARS' && o.monto != null ? o.monto : 0), 0);

/* ── vista: este mes ── */
function vistaInicio() {
  const el = $id('v-inicio');
  if (!d.cuentas.length) { el.classList.remove('lleno'); el.innerHTML = primerUso(); return; }
  el.classList.add('lleno');
  const actual = V.mesDe(hoy);
  const esActual = ui.mes === actual;
  const r = V.resumenMes(d, ui.mes, hoy);
  const previos = esActual ? V.atrasados(d, hoy).filter(o => V.mesDe(o.vence) < actual) : [];
  const pend = r.ars.pendiente;
  const pct = r.ars.total ? Math.round(r.ars.pagado / r.ars.total * 100) : 0;
  const [a, m] = ui.mes.split('-');
  const tituloMes = `${V.nombreMes(ui.mes)}${a !== actual.slice(0, 4) ? ` <span class="it">${a}</span>` : ''}`;
  const etiqueta = ui.mes < actual ? 'Quedó sin pagar' : 'Te falta pagar';
  const limite = V.sumarMesesMes(actual, 12);

  let html = `<div class="col-a">
  <div class="mes">
    <div class="mes-nav">
      <button class="ic" type="button" data-acc="mes" data-d="-1" aria-label="Mes anterior"><svg><use href="#i-izq"/></svg></button>
      <h1 id="t-inicio">${tituloMes}${esActual ? '' : ''}</h1>
      <button class="ic" type="button" data-acc="mes" data-d="1" aria-label="Mes siguiente" ${ui.mes >= limite ? 'disabled' : ''}><svg><use href="#i-der"/></svg></button>
    </div>
    <span class="mono etq">${etiqueta}${esActual ? ' este mes' : ''}</span>
    <p class="grande${pend === 0 && r.ars.total ? ' cero' : ''}">${pend === 0 && r.ars.total ? 'Nada' : plata(pend)}</p>
    <p class="sub">${r.ars.total ? `de <b>${plata(r.ars.total)}</b> en ${r.ocurrencias.filter(o => o.estado !== 'salteado').length} vencimientos · pagaste <b>${plata(r.ars.pagado)}</b>` : 'Sin montos cargados para este mes.'}</p>
    <div class="barra" role="progressbar" aria-label="Pagado del mes" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i style="width:${pct}%"></i></div>
    <div class="pie"><span class="mono">${pct}% pagado</span><span class="mono">${r.cantPendientes ? `${r.cantPendientes} pendiente${r.cantPendientes > 1 ? 's' : ''}` : 'Todo al día'}</span></div>
    ${r.usd.total ? `<p class="usd">En dólares: falta <b>${plata(r.usd.pendiente, 'USD')}</b> de ${plata(r.usd.total, 'USD')}</p>` : ''}
    ${r.ars.estimados ? `<p class="sub" style="margin-top:10px">≈ ${r.ars.estimados === 1 ? 'Un monto es estimado' : `${r.ars.estimados} montos son estimados`}: se ajustan cuando marcás pagado.</p>` : ''}
  </div>`;
  if (previos.length) {
    html += `<div class="aviso mal"><svg><use href="#i-alerta"/></svg><p><b>${previos.length === 1 ? 'Quedó 1 vencimiento' : `Quedaron ${previos.length} vencimientos`} sin pagar de meses anteriores</b>${sumaARS(previos) ? ` (${plata(sumaARS(previos))})` : ''}. ${previos.length === 1 ? 'Está' : 'Están'} arriba de todo.</p></div>`;
  }
  if (d.ejemplo) {
    html += `<div class="aviso info"><p><b>Estás viendo un ejemplo.</b> Probá marcar pagado, mirá el calendario y los números.</p><button class="btn-txt" type="button" data-acc="salir-ejemplo">Empezar con lo mío</button></div>`;
  } else if (necesitaRespaldo()) {
    html += `<div class="aviso info"><svg><use href="#i-candado"/></svg><p>Tus datos viven solo en este dispositivo. Guardá una copia por si cambiás de celular.</p><button class="btn-txt" type="button" data-acc="respaldo">Descargar</button></div>`;
  }
  if (!almacenOK) html += `<div class="aviso mal"><svg><use href="#i-alerta"/></svg><p>Este navegador no deja guardar datos (¿modo incógnito?). Lo que cargues se pierde al cerrar.</p></div>`;
  html += `</div><div class="col-b">`;

  const ocs = r.ocurrencias;
  const res = ocs.filter(o => o.resuelto);
  if (esActual) {
    const venc = [...previos, ...ocs.filter(o => o.estado === 'vencido' || o.estado === 'segundo')];
    const hoyL = ocs.filter(o => o.estado === 'hoy');
    const sem = ocs.filter(o => o.estado === 'proximo');
    const despues = ocs.filter(o => o.estado === 'pendiente');
    html += grupo('Vencido', venc, 'vencido', sumaARS(venc) ? plata(sumaARS(venc)) : '');
    html += grupo('Hoy', hoyL, '', sumaARS(hoyL) ? plata(sumaARS(hoyL)) : '');
    html += grupo('Esta semana', sem, '', sumaARS(sem) ? plata(sumaARS(sem)) : '');
    html += grupo('Más adelante', despues, '', sumaARS(despues) ? plata(sumaARS(despues)) : '');
    if (!venc.length && !hoyL.length && !sem.length && !despues.length) {
      html += `<div class="vacio" style="padding-top:12px"><p class="display">Todo <span class="it">pago.</span></p><p class="lead">No te queda nada por pagar este mes. El próximo vencimiento está en el mes que viene.</p></div>`;
    }
  } else {
    const pen = ocs.filter(o => !o.resuelto);
    html += grupo(ui.mes < actual ? 'Sin pagar' : 'Por pagar', pen, ui.mes < actual ? 'vencido' : '', sumaARS(pen) ? plata(sumaARS(pen)) : '');
    if (!ocs.length) html += `<div class="vacio"><p class="lead">No hay vencimientos en ${V.nombreMes(ui.mes)}.</p></div>`;
  }
  if (res.length) {
    if (ui.resueltos || !esActual) html += grupo('Resuelto', res, '', plata(sumaARS(res)));
    else html += `<div class="grupo"><button type="button" class="mas-res" data-acc="ver-resueltos">Ver ${res.length} resuelto${res.length > 1 ? 's' : ''} (${plata(sumaARS(res))}) <svg><use href="#i-der"/></svg></button></div>`;
  }
  html += '</div>';
  el.innerHTML = html;
}

function necesitaRespaldo() {
  if (d.cuentas.length < 3) return false;
  if (!d.ultimoRespaldo) return V.difDias((d.creado || new Date().toISOString()).slice(0, 10), hoy) >= 1;
  return V.difDias(d.ultimoRespaldo.slice(0, 10), hoy) >= 30;
}

/* ── primer uso ── */
function primerUso() {
  const o = ui.onb;
  if (o.paso === 1) {
    const chips = PRIMER_USO.map(servicio).filter(Boolean).map(s =>
      `<button type="button" class="vchip" data-acc="onb-sel" data-s="${s.id}" aria-pressed="${o.sel.has(s.id)}">${esc(s.nombre)}</button>`).join('');
    return `<div class="vacio">
      <h1 class="display" id="t-inicio">Todo lo que <span class="it">vence,</span> en un lugar.</h1>
      <p class="lead">Luz, gas, ABL, expensas, la VTV. Te avisa antes y te dice cuánto te falta pagar este mes.</p>
    </div>
    <div class="primer">
      <h2>¿Qué se paga en tu casa?</h2>
      <p>Tocá todo lo que corresponda. Después ponés el día y listo.</p>
      <div class="chips">${chips}<button type="button" class="vchip" data-acc="agregar">Otra…</button></div>
      <div class="acciones">
        <button type="button" class="bt prim ancho" data-acc="onb-seguir" ${o.sel.size ? '' : 'disabled'}>${o.sel.size ? `Seguir con ${o.sel.size}` : 'Elegí al menos uno'} <svg><use href="#i-flecha"/></svg></button>
        <button type="button" class="btn-txt" data-acc="ejemplo">Ver primero con datos de ejemplo</button>
      </div>
    </div>
    <p class="privado"><svg><use href="#i-candado"/></svg>Tus datos quedan en este dispositivo. No se mandan a ningún lado.</p>`;
  }
  const items = [...o.sel].map(servicio).filter(Boolean).map(s => {
    const tram = s.tipo === 'tramite';
    return `<li data-s="${s.id}">
      ${avatar({ nombre: s.nombre, color: s.color })}
      <div><b>${esc(s.nombre)}</b><br><small class="dim">${esc(V.nombreFrecuencia(s.frecuencia))}${s.ayuda ? ` · ${esc(s.ayuda)}` : ''}</small></div>
      <div class="campos">
        ${tram
          ? `<label style="margin:0;grid-column:1/-1"><span class="mini" aria-hidden="true">Próxima fecha</span><input type="date" name="fecha" min="${hoy}" aria-label="Fecha de vencimiento de ${esc(s.nombre)}"></label>`
          : `<label style="margin:0"><span class="mini" aria-hidden="true">Día que vence</span><input type="number" name="dia" inputmode="numeric" min="1" max="31" placeholder="1 a 31" aria-label="Día del mes en que vence ${esc(s.nombre)}"></label>
             <label class="monto-in" data-sim="$" style="margin:0"><span class="mini" aria-hidden="true">Monto aprox.</span><input type="text" name="monto" inputmode="decimal" placeholder="Opcional" aria-label="Monto aproximado de ${esc(s.nombre)} (opcional)"></label>`}
      </div>
    </li>`;
  }).join('');
  return `<div class="vt"><div><h1 id="t-inicio">¿Qué día <span class="it">vence?</span></h1><p>Mirá la última factura. El monto es opcional: se ajusta cuando marques pagado.</p></div></div>
  <div class="primer" style="margin-top:12px">
    <ul class="rapida" id="onb-lista">${items}</ul>
    <p class="error" id="onb-error" hidden></p>
    <div class="acciones">
      <button type="button" class="bt prim ancho" data-acc="onb-listo">Listo, armá mi mes <svg><use href="#i-flecha"/></svg></button>
      <button type="button" class="btn-txt" data-acc="onb-volver">Volver</button>
    </div>
  </div>`;
}

function terminarPrimerUso() {
  const filas = [...document.querySelectorAll('#onb-lista li')];
  let nuevo = d;
  const faltan = [];
  const cuentas = [];
  for (const li of filas) {
    const s = servicio(li.dataset.s);
    const inp = li.querySelector('input[name=dia], input[name=fecha]');
    let primerVto = null;
    if (inp.name === 'fecha') primerVto = V.esFecha(inp.value) ? inp.value : null;
    else {
      const dia = Number(inp.value);
      if (dia >= 1 && dia <= 31) primerVto = V.proximoDia(dia, hoy, s.frecuencia);
    }
    if (!primerVto) { faltan.push(s.nombre); inp.setAttribute('aria-invalid', 'true'); continue; }
    inp.removeAttribute('aria-invalid');
    const monto = V.leerPesos(li.querySelector('input[name=monto]')?.value);
    cuentas.push(cuentaDesdeServicio(s, { primerVto, monto }));
  }
  if (faltan.length) {
    const e = $id('onb-error'); e.hidden = false;
    e.textContent = `Falta la fecha de ${faltan.join(', ')}.`;
    document.querySelector('#onb-lista [aria-invalid=true]')?.focus();
    return;
  }
  for (const c of cuentas) nuevo = V.guardarCuenta(nuevo, c);
  ui.onb = { paso: 1, sel: new Set() };
  guardar(nuevo);
  toast(`Listo: ${cuentas.length} vencimiento${cuentas.length > 1 ? 's' : ''} cargado${cuentas.length > 1 ? 's' : ''}.`, [{ t: 'Sumar al calendario', fn: () => descargarICS() }], 8000);
}

function cuentaDesdeServicio(s, extra = {}) {
  return {
    id: V.nuevoId(), nombre: s.nombre, categoria: s.categoria, frecuencia: s.frecuencia,
    preset: s.id, color: s.color, ...(s.tipo ? { tipo: s.tipo } : {}), ...(s.debito ? { debito: true } : {}),
    ...(s.ajuste ? { ajusteCada: s.ajuste } : {}), ...(s.segundoVto ? { segundoVto: s.segundoVto } : {}),
    ...(s.habil ? { habil: true } : {}),
    primerVto: extra.primerVto, ...(extra.monto != null ? { monto: extra.monto } : {}),
  };
}

/* ── vista: calendario ── */
function vistaCalendario() {
  const el = $id('v-calendario');
  const ym = ui.mesCal;
  const [a, m] = ym.split('-').map(Number);
  const ocs = V.ocurrenciasDelMes(d, ym, hoy);
  const porDia = {};
  for (const o of ocs) (porDia[o.vence] ||= []).push(o);
  const primero = (V.diaSemana(`${ym}-01`) + 6) % 7; // lunes primero
  const n = V.diasDelMes(a, m);
  let celdas = '';
  for (let i = 0; i < primero; i++) celdas += '<span class="dia fuera" aria-hidden="true"></span>';
  for (let i = 1; i <= n; i++) {
    const f = V.fecha(a, m, i);
    const lista = porDia[f] || [];
    const puntos = lista.slice(0, 4).map(o => `<i class="${o.resuelto ? 'r' : (o.estado === 'vencido' || o.estado === 'segundo') ? 'v' : ''}"></i>`).join('');
    const etiqueta = `${V.fechaLarga(f)}${lista.length ? `: ${lista.length} vencimiento${lista.length > 1 ? 's' : ''}` : ''}`;
    celdas += `<button type="button" class="dia${f === hoy ? ' hoy' : ''}" data-acc="dia" data-f="${f}" aria-pressed="${f === ui.dia}" aria-label="${esc(etiqueta)}">${i}<span class="puntos">${puntos}</span></button>`;
  }
  const delDia = porDia[ui.dia] || [];
  const enMes = V.mesDe(ui.dia) === ym;
  const mesTxt = `${cap(V.nombreMes(ym))}${a !== Number(hoy.slice(0, 4)) ? ` <span class="it">${a}</span>` : ''}`;
  el.classList.add('lleno');
  el.innerHTML = `
  <div class="vt"><div><h1 id="t-calendario">Calendario</h1><p>${ocs.length ? `${ocs.length} vencimientos en ${V.nombreMes(ym)}` : `Nada en ${V.nombreMes(ym)}`}</p></div></div>
  <div>
    <div class="cal">
      <div class="mes-nav" style="margin:0 0 6px">
        <button class="ic" type="button" data-acc="mescal" data-d="-1" aria-label="Mes anterior"><svg><use href="#i-izq"/></svg></button>
        <h2 style="margin:0;font-size:16px;font-weight:700">${mesTxt}</h2>
        <button class="ic" type="button" data-acc="mescal" data-d="1" aria-label="Mes siguiente"><svg><use href="#i-der"/></svg></button>
      </div>
      <div class="cal-cab" aria-hidden="true">${['lu', 'ma', 'mi', 'ju', 'vi', 'sá', 'do'].map(x => `<span class="mono">${x}</span>`).join('')}</div>
      <div class="cal-dias">${celdas}</div>
    </div>
    <div class="aviso info cal-ics"><svg><use href="#i-campana"/></svg><p><b>Que te avise el celular.</b> Sumá todos los vencimientos a tu calendario, con aviso ${textoAvisos()}.</p><button type="button" class="btn-txt" data-acc="ics">Sumar</button></div>
  </div>
  <div>
    ${enMes && delDia.length ? grupo(cap(V.fechaLarga(ui.dia)), delDia) : ''}
    ${enMes && !delDia.length ? `<div class="grupo"><h2><span class="mono">${cap(V.fechaLarga(ui.dia))}</span></h2><p class="dim" style="margin:0 4px">No vence nada este día.</p></div>` : ''}
    ${!delDia.length ? grupo(ym === V.mesDe(hoy) ? `Lo que queda de ${V.nombreMes(ym)}` : `Todo ${V.nombreMes(ym)}`, ocs.filter(o => !o.resuelto && (ym !== V.mesDe(hoy) || o.vence >= hoy))) : ''}
  </div>`;
}
function textoAvisos() {
  const av = [...(d.config.avisos || [3, 0])].sort((x, y) => y - x);
  const t = av.map(x => x === 0 ? 'el mismo día' : x === 1 ? '1 día antes' : `${x} días antes`);
  return (t.length > 1 ? t.slice(0, -1).join(', ') + ' y ' + t.at(-1) : t[0] || 'el mismo día') + ` a las ${d.config.hora || '09:00'}`;
}

/* ── vista: cuentas ── */
function vistaCuentas() {
  const el = $id('v-cuentas');
  if (!d.cuentas.length) {
    el.innerHTML = `<div class="vt"><div><h1 id="t-cuentas">Tus cuentas</h1></div></div><div class="vacio"><p class="lead">Todavía no cargaste nada. Arrancá desde <b>Este mes</b> o con el botón +.</p></div>`;
    return;
  }
  const prom = V.proyeccionAnual(d, hoy).promedio;
  const porCat = {};
  for (const c of d.cuentas) (porCat[c.categoria || 'Otros'] ||= []).push(c);
  const orden = CATEGORIAS.map(c => c.id).filter(c => porCat[c]).concat(Object.keys(porCat).filter(c => !CATEGORIAS.some(x => x.id === c)));
  let html = `<div class="vt"><div><h1 id="t-cuentas">Tus <span class="it">cuentas</span></h1><p>${d.cuentas.length} cargada${d.cuentas.length > 1 ? 's' : ''}${prom ? ` · unos <b>${plata(prom)}</b> por mes en promedio` : ''}</p></div></div>`;
  for (const cat of orden) {
    const items = porCat[cat].sort((x, y) => x.nombre.localeCompare(y.nombre)).map(c => {
      const p = V.proximaDe(d, c, hoy);
      const monto = c.tipo === 'tramite' ? '<small>Trámite</small>' : (p?.monto != null ? `${plata(p.monto, p.moneda)}` : '<small>Sin monto</small>');
      const sub = `${V.nombreFrecuencia(Number(c.frecuencia) || 0)}${c.debito ? ' · débito' : ''} · ${p ? `próximo ${V.fechaCorta(p.vence)}${V.mesDe(p.vence) !== V.mesDe(hoy) ? ` de ${V.nombreMes(V.mesDe(p.vence))}` : ''}` : 'terminado'}`;
      return `<li class="fila"><button type="button" class="fila-main" data-acc="cuenta" data-c="${esc(c.id)}">${avatar(c)}<span class="fila-txt"><b>${esc(c.nombre)}</b><small>${esc(sub)}</small></span><span class="fila-monto" style="padding-right:14px">${monto}</span></button></li>`;
    }).join('');
    html += `<div class="grupo"><h2><span class="mono">${esc(cat)}</span></h2><ul class="lista">${items}</ul></div>`;
  }
  html += `<div class="acciones" style="margin-top:20px"><button type="button" class="bt sec ancho" data-acc="agregar"><svg><use href="#i-mas"/></svg> Agregar otra</button></div>`;
  el.innerHTML = html;
}

/* ── vista: números ── */
function vistaNumeros() {
  const el = $id('v-numeros');
  if (!d.cuentas.length) {
    el.innerHTML = `<div class="vt"><div><h1 id="t-numeros">Números</h1></div></div><div class="vacio"><p class="lead">Cuando cargues tus cuentas, acá ves cuánto se va por año y qué subió más.</p></div>`;
    return;
  }
  const p = V.proyeccionAnual(d, hoy);
  const max = Math.max(1, ...p.meses.map(x => x.total));
  const debito = d.cuentas.filter(c => c.debito && c.tipo !== 'tramite').reduce((s, c) => {
    const o = V.proximaDe(d, c, hoy); const f = Number(c.frecuencia) || 0;
    return s + (o?.monto && o.moneda === 'ARS' && f ? Math.round(o.monto / f) : 0);
  }, 0);
  const subas = d.cuentas.map(c => ({ c, s: V.suba(d, c) })).filter(x => x.s && x.s.meses > 0).sort((x, y) => y.s.pct - x.s.pct);
  const totCat = p.categorias.reduce((s, x) => s + x[1], 0) || 1;
  el.innerHTML = `
  <div class="vt"><div><h1 id="t-numeros">Los <span class="it">números</span></h1><p>Próximos 12 meses, con los últimos montos que conocés.</p></div></div>
  <div class="kpis">
    <div class="kpi neg"><span class="mono">En 12 meses</span><b>${plata(p.total)}</b><small>proyectado</small></div>
    <div class="kpi"><span class="mono">Por mes</span><b>${plata(p.promedio)}</b><small>en promedio</small></div>
    <div class="kpi"><span class="mono">Con débito</span><b>${plata(debito)}</b><small>por mes, sin mover un dedo</small></div>
    <div class="kpi"><span class="mono">Cuentas</span><b>${d.cuentas.length}</b><small>${d.cuentas.filter(c => c.tipo === 'tramite').length} son trámites</small></div>
  </div>
  <div class="numeros-gr">
    <div class="panel"><h2 class="mono">Mes a mes</h2>
      <div class="barras" role="img" aria-label="Total por mes de los próximos 12 meses">${p.meses.map(x => `<div title="${cap(V.nombreMes(x.ym))}: ${plata(x.total)}"><i style="height:${Math.max(2, x.total / max * 100)}%"></i><span>${V.nombreMes(x.ym).slice(0, 3)}</span></div>`).join('')}</div>
      <p class="leyenda">Los meses con bimestrales, cuotas o pagos anuales pesan más. Planificá con tiempo.</p>
    </div>
    <div class="panel"><h2 class="mono">Por categoría · 12 meses</h2>
      <ul class="cats">${p.categorias.map(([c, v]) => `<li><span>${esc(c)}</span><span>${plata(v)}</span><em><i style="width:${v / totCat * 100}%"></i></em></li>`).join('') || '<li class="dim">Sin montos cargados.</li>'}</ul>
    </div>
  </div>
  <div class="panel"><h2 class="mono">Cuánto subió cada una</h2>
    ${subas.length ? `<ul class="sube">${subas.slice(0, 8).map(({ c, s }) => `<li>${avatar(c)}<span><b style="font-weight:600">${esc(c.nombre)}</b><br><small class="dim">${plata(s.desde.monto)} → ${plata(s.hasta.monto)} en ${s.meses} ${s.meses === 1 ? 'mes' : 'meses'}</small></span><span class="pct${s.pct < 0 ? ' baja' : ''}">${s.pct >= 0 ? '+' : ''}${Math.round(s.pct * 100)}%</span></li>`).join('')}</ul>`
      : '<p class="dim" style="margin:0;font-size:14px">Cuando marques pagadas tus cuentas con el monto real, acá vas a ver cuánto aumentó cada una.</p>'}
  </div>
  <p class="leyenda" style="margin:14px 4px 0">Es una cuenta orientativa con lo que cargaste: no incluye aumentos que todavía no llegaron.</p>`;
}

/* ── hoja (dialog) ── */
const hoja = $id('hoja');
function abrir(titulo, cuerpo) {
  $id('hoja-t').textContent = titulo;
  $id('hoja-cuerpo').innerHTML = cuerpo;
  if (!hoja.open) hoja.showModal();
  $id('hoja-cuerpo').scrollTop = 0;
}
const cerrar = () => { if (hoja.open) hoja.close(); };
hoja.addEventListener('click', e => { if (e.target === hoja) cerrar(); });

function buscarOc(id) {
  const [cid, clave] = String(id).split('|');
  const c = d.cuentas.find(x => x.id === cid);
  return c ? V.ocurrencia(d, c, clave, hoy) : null;
}

const BADGE = { vencido: ['Vencido', 'mal'], segundo: ['En 2º vencimiento', 'mal'], hoy: ['Vence hoy', 'azul'], proximo: ['Esta semana', ''],
  pendiente: ['Pendiente', ''], pagado: ['Pagado', 'ok'], debitado: ['Débito automático', 'ok'], salteado: ['No vino', ''] };

function verOcurrencia(id) {
  const o = buscarOc(id);
  if (!o) return;
  const c = o.cuenta;
  const tram = c.tipo === 'tramite';
  const [txtB, claseB] = BADGE[o.estado] || ['', ''];
  const sim = o.moneda === 'USD' ? 'US$' : '$';
  const montoGrande = tram ? '' : o.monto == null ? '<p class="det-monto dim" style="font-size:22px">Sin monto</p>'
    : `<p class="det-monto">${o.origen === 'estimado' ? '<span class="aprox">≈ </span>' : ''}${plata(o.monto, o.moneda)}</p>`;
  const datos = [
    ['Vence', `${cap(V.fechaCorta(o.vence))} de ${V.nombreMes(V.mesDe(o.vence))}`],
    o.segundo ? ['2º vencimiento', `${cap(V.fechaCorta(o.segundo))} · con recargo`] : null,
    o.cuota ? ['Cuota', `${o.cuota} de ${c.cuotas}`] : null,
    ['Se repite', V.nombreFrecuencia(Number(c.frecuencia) || 0)],
    !tram && o.origen === 'estimado' ? ['Monto', 'Estimado con el último que pagaste'] : null,
    o.pago?.fecha ? [tram ? 'Hecho el' : 'Pagado el', `${V.fechaLarga(o.pago.fecha)}${o.pago.nota ? ` · ${esc(o.pago.nota)}` : ''}`] : null,
    c.debito ? ['Débito automático', 'Sí'] : null,
  ].filter(Boolean);
  let html = `<div class="det-cab">${avatar(c)}<div><span class="badge ${claseB}">${txtB}</span>${montoGrande}</div></div>
  ${o.ajusta && !o.resuelto ? `<p class="nota">Este mes se ajusta. Cuando sepas el monto nuevo, cargalo en "Llegó la factura".</p>` : ''}
  ${c.nota ? `<p class="nota">${esc(c.nota)}</p>` : ''}
  <ul class="datos">${datos.map(([k, v]) => `<li><span>${k}</span><span>${v}</span></li>`).join('')}</ul>`;

  if (o.estado === 'debitado') {
    html += `<p class="leyenda" style="margin:-6px 0 16px">Lo damos por pagado porque tiene débito automático. Si no se debitó, marcalo a mano cuando lo pagues.</p>
    <form data-form="pagar" data-id="${esc(o.id)}" class="acciones"><input type="hidden" name="monto" value="${o.monto != null ? (o.monto / 100) : ''}"><input type="hidden" name="fecha" value="${o.vence}">
    <button class="bt sec ancho" type="submit"><svg><use href="#i-check"/></svg> Confirmar que se debitó</button></form>`;
  } else if (o.estado === 'salteado') {
    html += `<div class="acciones"><button type="button" class="bt sec ancho" data-acc="saltear" data-id="${esc(o.id)}" data-si="0">Volver a contarlo</button></div>`;
  } else if (o.resuelto) {
    html += `<div class="acciones"><button type="button" class="bt sec ancho" data-acc="desmarcar" data-id="${esc(o.id)}">${tram ? 'Desmarcar hecho' : 'Desmarcar pagado'}</button></div>`;
  } else {
    html += `<form data-form="pagar" data-id="${esc(o.id)}">
      ${tram ? '' : `<div class="fila2">
        <label class="campo"><span>Monto pagado</span><span class="monto-in" data-sim="${sim}"><input type="text" name="monto" inputmode="decimal" value="${o.monto != null ? V.formatoPesos(o.monto, { simbolo: '' }).trim() : ''}" placeholder="0" autocomplete="off"></span></label>
        <label class="campo"><span>Fecha de pago</span><input type="date" name="fecha" value="${hoy}" max="${V.sumarDias(hoy, 365)}"></label>
      </div>
      <label class="campo"><span>Comprobante o nota <small>(opcional)</small></span><input type="text" name="nota" maxlength="80" placeholder="Ej: n.º de operación" autocomplete="off"></label>`}
      ${tram ? `<input type="hidden" name="fecha" value="${hoy}">` : ''}
      <button class="bt prim ancho" type="submit"><svg><use href="#i-check"/></svg> ${tram ? 'Marcar hecho' : 'Marcar pagado'}</button>
    </form>`;
  }
  if (!tram && !o.resuelto) {
    html += `<details class="mas" style="margin-top:18px"><summary>Llegó la factura</summary>
      <form data-form="factura" data-id="${esc(o.id)}">
        <p class="leyenda" style="margin:0 0 12px">Cargá el monto y la fecha de esta factura. No cambia los meses siguientes.</p>
        <div class="fila2">
          <label class="campo"><span>Monto de la factura</span><span class="monto-in" data-sim="${sim}"><input type="text" name="monto" inputmode="decimal" value="${o.origen === 'factura' ? V.formatoPesos(o.monto, { simbolo: '' }).trim() : ''}" placeholder="0" autocomplete="off"></span></label>
          <label class="campo"><span>Vence el</span><input type="date" name="fecha" value="${o.vence}"></label>
        </div>
        <button class="bt sec ancho" type="submit">Guardar factura</button>
      </form></details>`;
  }
  html += `<div class="sep"></div><div class="acciones dos">
    <button type="button" class="bt sec" data-acc="ics-cuenta" data-c="${esc(c.id)}"><svg><use href="#i-campana"/></svg> Al calendario</button>
    <button type="button" class="bt sec" data-acc="cuenta" data-c="${esc(c.id)}">Ver la cuenta</button>
  </div>
  ${!o.resuelto ? `<div class="acciones" style="margin-top:6px"><button type="button" class="btn-txt" data-acc="saltear" data-id="${esc(o.id)}" data-si="1">${tram ? 'Esta vez no corresponde' : 'Este período no vino'}</button></div>` : ''}`;
  abrir(c.nombre, html);
}

function verCuenta(cid) {
  const c = d.cuentas.find(x => x.id === cid);
  if (!c) return;
  const p = V.proximaDe(d, c, hoy);
  const h = V.historial(d, c).slice(-12);
  const s = V.suba(d, c);
  const max = Math.max(1, ...h.map(x => x.monto));
  const tram = c.tipo === 'tramite';
  const datos = [
    ['Categoría', esc(c.categoria || 'Otros')],
    ['Se repite', V.nombreFrecuencia(Number(c.frecuencia) || 0)],
    p ? ['Próximo', `${cap(V.fechaCorta(p.vence))} de ${V.nombreMes(V.mesDe(p.vence))}${p.monto != null ? ` · ${p.origen === 'estimado' ? '≈ ' : ''}${plata(p.monto, p.moneda)}` : ''}`] : ['Próximo', 'No hay más'],
    c.cuotas ? ['Cuotas', `${c.cuotas} en total`] : null,
    c.hasta ? ['Termina', V.fechaLarga(c.hasta)] : null,
    c.segundoVto ? ['2º vencimiento', `${c.segundoVto} días después`] : null,
    c.ajusteCada ? ['Se ajusta', `cada ${c.ajusteCada} meses`] : null,
    c.debito ? ['Débito automático', 'Sí'] : null,
    c.habil ? ['Fin de semana', 'Pasa al lunes'] : null,
    c.moneda === 'USD' ? ['Moneda', 'Dólares'] : null,
  ].filter(Boolean);
  let html = `<div class="det-cab">${avatar(c)}<div><b style="font-size:17px">${esc(c.nombre)}</b><br><small class="dim">${tram ? 'Trámite' : 'Cuenta'}</small></div></div>
  <ul class="datos">${datos.map(([k, v]) => `<li><span>${k}</span><span>${v}</span></li>`).join('')}</ul>`;
  if (!tram) {
    html += `<div class="panel" style="margin:0 0 16px;box-shadow:none;border:1px solid var(--linea)"><h2 class="mono">Lo que pagaste</h2>
      ${h.length ? `<div class="hist" role="img" aria-label="Montos de los últimos ${h.length} períodos">${h.map(x => `<div title="${V.fechaLarga(x.clave)}: ${plata(x.monto)}"><i style="height:${Math.max(3, x.monto / max * 100)}%"></i><span>${V.nombreMes(V.mesDe(x.clave)).slice(0, 3)}</span></div>`).join('')}</div>
        ${s ? `<p class="leyenda"><b style="color:var(--tinta)">${s.pct >= 0 ? 'Subió' : 'Bajó'} ${Math.abs(Math.round(s.pct * 100))}%</b> en ${s.meses} ${s.meses === 1 ? 'mes' : 'meses'}: de ${plata(s.desde.monto)} a ${plata(s.hasta.monto)}.</p>` : '<p class="leyenda">Con dos pagos ya ves cuánto subió.</p>'}`
      : '<p class="leyenda" style="margin:0">Todavía no marcaste ningún pago. Cuando lo hagas, acá ves la historia y cuánto subió.</p>'}
    </div>`;
  }
  if (c.nota) html += `<p class="nota">${esc(c.nota)}</p>`;
  html += `<div class="acciones dos">
    <button type="button" class="bt prim" data-acc="editar" data-c="${esc(c.id)}">Editar</button>
    <button type="button" class="bt sec" data-acc="ics-cuenta" data-c="${esc(c.id)}"><svg><use href="#i-campana"/></svg> Al calendario</button>
  </div>
  <div class="acciones" style="margin-top:10px"><button type="button" class="bt peligro ancho" data-acc="borrar" data-c="${esc(c.id)}">${ui.borrarArmado === c.id ? '¿Seguro? Tocá de nuevo para borrar' : 'Borrar cuenta'}</button></div>`;
  abrir(c.nombre, html);
}

/* ── agregar / editar ── */
function elegirServicio(filtro = '') {
  const f = filtro.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const lista = SERVICIOS.filter(s => !f || norm(`${s.nombre} ${s.ayuda || ''} ${s.categoria}`).includes(f));
  let html = '';
  for (const cat of CATEGORIAS) {
    const items = lista.filter(s => s.categoria === cat.id);
    if (!items.length) continue;
    html += `<h3 class="mono cat-t dim">${cat.id}</h3><div class="servicios">${items.map(s =>
      `<button type="button" class="serv" data-acc="elegir" data-s="${s.id}">${avatar({ nombre: s.nombre, color: s.color })}<span><b>${esc(s.nombre)}</b>${s.ayuda ? `<small>${esc(s.ayuda)}</small>` : ''}</span></button>`).join('')}</div>`;
  }
  if (!lista.length) html = `<p class="dim" style="margin:12px 2px">No está en la lista. Cargala como cuenta propia.</p>`;
  return html;
}
function abrirAgregar() {
  abrir('Agregar', `
    <div class="buscar"><svg><use href="#i-buscar"/></svg><input type="search" id="buscar-serv" placeholder="Buscá: luz, ABL, prepaga, VTV…" aria-label="Buscar un servicio o vencimiento" autocomplete="off"></div>
    <button type="button" class="bt sec ancho" data-acc="elegir" data-s=""><svg><use href="#i-mas"/></svg> Otra cuenta, con nombre propio</button>
    <div id="lista-serv">${elegirServicio()}</div>`);
}

function formCuenta(c, esNueva) {
  const tram = c.tipo === 'tramite';
  const frec = Number(c.frecuencia) || 0;
  const sim = c.moneda === 'USD' ? 'US$' : '$';
  const cats = CATEGORIAS.map(x => `<option ${x.id === (c.categoria || 'Otros') ? 'selected' : ''}>${x.id}</option>`).join('');
  const frecs = V.FRECUENCIAS.map(([v, t]) => `<option value="${v}" ${v === frec ? 'selected' : ''}>${t}</option>`).join('');
  const abierto = c.segundoVto || c.cuotas || c.hasta || c.ajusteCada || c.moneda === 'USD' || c.nota;
  return `<form data-form="cuenta" data-id="${esc(c.id)}" data-nueva="${esNueva ? 1 : 0}" novalidate>
    <input type="hidden" name="preset" value="${esc(c.preset || '')}"><input type="hidden" name="color" value="${esc(c.color || '')}">
    <label class="campo"><span>Nombre</span><input type="text" name="nombre" value="${esc(c.nombre)}" required maxlength="40" placeholder="Ej: Luz, Expensas, Seguro" autocomplete="off"></label>
    <div class="fila2">
      <label class="campo"><span>${tram ? 'Vence el' : 'Próximo vencimiento'}</span><input type="date" name="primerVto" value="${esc(c.primerVto || '')}" required></label>
      <label class="campo"><span>Se repite</span><select name="frecuencia">${frecs}</select></label>
    </div>
    <label class="switch"><span><b>Tiene monto</b><small>Apagalo para trámites como la VTV o la licencia.</small></span><input type="checkbox" name="conMonto" ${tram ? '' : 'checked'}></label>
    <div data-si="monto" ${tram ? 'hidden' : ''}>
      <label class="campo" style="margin-top:8px"><span>Monto aproximado</span><span class="monto-in" data-sim="${sim}"><input type="text" name="monto" inputmode="decimal" value="${c.monto != null ? V.formatoPesos(c.monto, { simbolo: '' }).trim() : ''}" placeholder="Opcional" autocomplete="off"></span>
        <small>Si cambia todos los meses, poné el último. Cuando marques pagado con el monto real, se ajusta solo.</small></label>
      <label class="switch"><span><b>Débito automático</b><small>Lo damos por pagado el día que vence.</small></span><input type="checkbox" name="debito" ${c.debito ? 'checked' : ''}></label>
    </div>
    <label class="switch"><span><b>Si cae sábado o domingo, pasa al lunes</b><small>Como la mayoría de impuestos. Los feriados, según tu boleta.</small></span><input type="checkbox" name="habil" ${c.habil ? 'checked' : ''}></label>
    <label class="campo" style="margin-top:12px"><span>Categoría</span><select name="categoria">${cats}</select></label>
    <details class="mas" ${abierto ? 'open' : ''}><summary>Más opciones</summary>
      <div class="fila2">
        <label class="campo"><span>2º vencimiento</span><input type="number" name="segundoVto" min="1" max="60" inputmode="numeric" value="${c.segundoVto || ''}" placeholder="Días después"><small>Con recargo. Te avisa hasta ahí.</small></label>
        <label class="campo"><span>En cuotas</span><input type="number" name="cuotas" min="2" max="120" inputmode="numeric" value="${c.cuotas || ''}" placeholder="Cantidad"><small>Ej: patente en 5 cuotas.</small></label>
      </div>
      <div class="fila2">
        <label class="campo"><span>Termina el</span><input type="date" name="hasta" value="${esc(c.hasta || '')}"><small>Vacío = sin fin.</small></label>
        <label class="campo"><span>Se ajusta cada</span><select name="ajusteCada"><option value="">No se ajusta</option>${[1, 2, 3, 4, 6, 12].map(n => `<option value="${n}" ${Number(c.ajusteCada) === n ? 'selected' : ''}>${n} ${n === 1 ? 'mes' : 'meses'}</option>`).join('')}</select><small>Alquiler por ICL o IPC.</small></label>
      </div>
      <fieldset class="campo"><legend>Moneda</legend><div class="seg">
        <label><input type="radio" name="moneda" value="ARS" ${c.moneda !== 'USD' ? 'checked' : ''}><span>Pesos</span></label>
        <label><input type="radio" name="moneda" value="USD" ${c.moneda === 'USD' ? 'checked' : ''}><span>Dólares</span></label>
      </div><small>Lo que es en dólares se suma aparte, sin convertir.</small></fieldset>
      <label class="campo"><span>Nota</span><textarea name="nota" maxlength="200" placeholder="Ej: n.º de cliente, cómo se paga">${esc(c.nota || '')}</textarea></label>
    </details>
    <p class="error" id="form-error" hidden></p>
    <button class="bt prim ancho" type="submit" style="margin-top:8px">${esNueva ? 'Agregar' : 'Guardar cambios'}</button>
  </form>`;
}
function abrirForm(c, esNueva) { abrir(esNueva ? (c.nombre || 'Nueva cuenta') : `Editar ${c.nombre}`, formCuenta(c, esNueva)); }

function leerFormCuenta(form) {
  const f = new FormData(form);
  const err = msg => { const e = $id('form-error'); e.hidden = false; e.textContent = msg; return null; };
  const nombre = String(f.get('nombre') || '').trim();
  if (!nombre) { form.nombre.focus(); return err('Ponele un nombre.'); }
  const primerVto = String(f.get('primerVto') || '');
  if (!V.esFecha(primerVto)) { form.primerVto.focus(); return err('Elegí la fecha del próximo vencimiento.'); }
  const conMonto = f.get('conMonto') === 'on';
  const monto = conMonto ? V.leerPesos(f.get('monto')) : null;
  const n = k => { const v = Number(f.get(k)); return Number.isFinite(v) && v > 0 ? Math.round(v) : null; };
  const hasta = String(f.get('hasta') || '');
  if (hasta && hasta < primerVto) return err('La fecha de fin tiene que ser después del próximo vencimiento.');
  const c = {
    id: form.dataset.id, nombre, categoria: String(f.get('categoria') || 'Otros'),
    frecuencia: Number(f.get('frecuencia')) || 0, primerVto,
    ...(servicio(String(f.get('preset'))) ? { preset: String(f.get('preset')) } : {}),
    ...(/^#[0-9A-Fa-f]{6}$/.test(String(f.get('color'))) ? { color: String(f.get('color')) } : {}),
    ...(conMonto ? {} : { tipo: 'tramite' }),
    ...(monto != null ? { monto } : {}),
    ...(conMonto && f.get('debito') === 'on' ? { debito: true } : {}),
    ...(f.get('habil') === 'on' ? { habil: true } : {}),
    ...(n('segundoVto') ? { segundoVto: n('segundoVto') } : {}),
    ...(n('cuotas') && n('cuotas') > 1 ? { cuotas: n('cuotas') } : {}),
    ...(hasta ? { hasta } : {}),
    ...(n('ajusteCada') ? { ajusteCada: n('ajusteCada') } : {}),
    ...(f.get('moneda') === 'USD' ? { moneda: 'USD' } : {}),
    ...(String(f.get('nota') || '').trim() ? { nota: String(f.get('nota')).trim().slice(0, 200) } : {}),
  };
  return c;
}

/* ── archivos ── */
function bajar(nombre, texto, tipo) {
  const blob = new Blob([texto], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nombre; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
function descargarICS(cuentaId = null) {
  if (!d.cuentas.length) { toast('Primero cargá algún vencimiento.'); return; }
  const { texto, eventos } = V.generarICS(d, { hoy, cuentaId, meses: 18 });
  if (!eventos) { toast('No hay vencimientos pendientes para sumar.'); return; }
  const c = cuentaId && d.cuentas.find(x => x.id === cuentaId);
  const slug = c ? c.nombre.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') : 'todo';
  bajar(`vencimientos-${slug}.ics`, texto, 'text/calendar;charset=utf-8');
  toast(`${eventos} vencimiento${eventos > 1 ? 's' : ''} listos para tu calendario. Abrí el archivo para sumarlos.`, [], 6000);
}
function descargarRespaldo() {
  bajar(`vencimientos-respaldo-${hoy}.json`, V.exportarRespaldo(d), 'application/json');
  const n = { ...d, ultimoRespaldo: new Date().toISOString() };
  guardar(n);
  toast('Copia descargada. Guardala en tu mail o en la nube.');
}

/* ── ajustes ── */
function abrirAjustes() {
  const av = new Set(d.config.avisos || [3, 0]);
  const ult = d.ultimoRespaldo ? `Última copia: ${V.fechaLarga(d.ultimoRespaldo.slice(0, 10))}.` : 'Todavía no descargaste ninguna copia.';
  const horas = ['07:00', '08:00', '09:00', '10:00', '12:00', '18:00', '20:00', '21:00'];
  abrir('Ajustes', `
  <div class="ajustes-sec"><h3>Avisos en el calendario del celular</h3>
    <form data-form="avisos">
      <fieldset class="campo"><legend>Avisarme</legend><div class="seg">
        ${[[7, '7 días antes'], [3, '3 días antes'], [1, '1 día antes'], [0, 'El mismo día']].map(([v, t]) => `<label><input type="checkbox" name="av" value="${v}" ${av.has(v) ? 'checked' : ''}><span>${t}</span></label>`).join('')}
      </div><small>Hasta 3 avisos por vencimiento.</small></fieldset>
      <label class="campo"><span>A las</span><select name="hora">${horas.map(h => `<option ${h === (d.config.hora || '09:00') ? 'selected' : ''}>${h}</option>`).join('')}</select></label>
      <button type="submit" class="bt sec ancho">Guardar avisos</button>
    </form>
    <p class="leyenda">Después de cambiarlos, volvé a sumar el calendario. En iPhone los avisos llegan solos; en Google Calendar, revisá las notificaciones del evento.</p>
    <div class="acciones" style="margin-top:12px"><button type="button" class="bt prim ancho" data-acc="ics"><svg><use href="#i-campana"/></svg> Sumar todo al calendario</button></div>
  </div>
  <div class="ajustes-sec"><h3>Tu copia</h3>
    <p class="leyenda" style="margin-top:0">Tus datos viven solo en este dispositivo. ${ult}</p>
    <div class="acciones dos">
      <button type="button" class="bt sec" data-acc="respaldo"><svg><use href="#i-bajar"/></svg> Descargar</button>
      <button type="button" class="bt sec" data-acc="importar"><svg><use href="#i-subir"/></svg> Restaurar</button>
    </div>
  </div>
  <div class="ajustes-sec"><h3>Empezar de cero</h3>
    ${!d.cuentas.length ? `<button type="button" class="bt sec ancho" data-acc="ejemplo">Ver con datos de ejemplo</button>` : `<button type="button" class="bt peligro ancho" data-acc="borrar-todo">${ui.borrarArmado === '*' ? '¿Seguro? Se borra todo. Tocá de nuevo' : 'Borrar todos mis datos'}</button>`}
  </div>
  <p class="legal">Vencimientos de la Casa es un organizador: no paga por vos ni se conecta con bancos ni empresas. Los montos estimados son orientativos; revisá siempre tu factura. Tus datos se guardan solo en este navegador y no se mandan a Orbit ni a nadie. Hecho por <a href="/" target="_blank" rel="noopener">Orbit</a>.</p>`);
}

/* ── toast ── */
let tTimer;
function toast(msg, acciones = [], ms = 4500) {
  const t = $id('toast');
  clearTimeout(tTimer);
  t.innerHTML = `<span>${esc(msg)}</span>${acciones.map((a, i) => `<button type="button" data-t="${i}">${esc(a.t)}</button>`).join('')}`;
  t.hidden = false;
  t.onclick = e => { const b = e.target.closest('button'); if (!b) return; t.hidden = true; acciones[Number(b.dataset.t)]?.fn(); };
  tTimer = setTimeout(() => { t.hidden = true; }, ms);
}

/* ── acciones ── */
function tick(id, boton) {
  const o = buscarOc(id);
  if (!o) return;
  const anterior = d;
  if (o.estado === 'pagado') {
    guardar(V.desmarcarPagado(d, o.cuentaId, o.clave));
    toast(`${o.cuenta.nombre}: desmarcado.`, [{ t: 'Deshacer', fn: () => guardar(anterior) }]);
    return;
  }
  if (o.estado === 'salteado') { guardar(V.saltear(d, o.cuentaId, o.clave, false)); return; }
  if (o.cuenta.tipo !== 'tramite' && o.monto == null) { verOcurrencia(id); return; }
  boton?.querySelector('span')?.classList.add('pop');
  guardar(V.marcarPagado(d, o.cuentaId, o.clave, { monto: o.monto, fecha: hoy }));
  const txt = o.cuenta.tipo === 'tramite' ? `${o.cuenta.nombre}: hecho.` : `${o.cuenta.nombre} pagado · ${plata(o.monto, o.moneda)}`;
  const acc = [{ t: 'Deshacer', fn: () => guardar(anterior) }];
  if (o.cuenta.tipo !== 'tramite') acc.unshift({ t: 'Otro monto', fn: () => verOcurrencia(id) });
  toast(txt, acc, 6000);
}

document.addEventListener('click', e => {
  const b = e.target.closest('[data-acc]');
  if (!b) return;
  const acc = b.dataset.acc;
  if (acc !== 'borrar' && acc !== 'borrar-todo') ui.borrarArmado = null;
  switch (acc) {
    case 'cerrar': cerrar(); break;
    case 'mes': ui.mes = V.sumarMesesMes(ui.mes, Number(b.dataset.d)); ui.resueltos = false; render(); break;
    case 'mescal': {
      ui.mesCal = V.sumarMesesMes(ui.mesCal, Number(b.dataset.d));
      ui.dia = ui.mesCal === V.mesDe(hoy) ? hoy : `${ui.mesCal}-01`;
      render(); break;
    }
    case 'dia': ui.dia = b.dataset.f; render(); document.querySelector(`.dia[data-f="${ui.dia}"]`)?.focus(); break;
    case 'ver': verOcurrencia(b.dataset.id); break;
    case 'tick': tick(b.dataset.id, b); break;
    case 'ver-resueltos': ui.resueltos = true; render(); break;
    case 'cuenta': verCuenta(b.dataset.c); break;
    case 'editar': { const c = d.cuentas.find(x => x.id === b.dataset.c); if (c) abrirForm(c, false); break; }
    case 'borrar': {
      if (ui.borrarArmado !== b.dataset.c) { ui.borrarArmado = b.dataset.c; b.textContent = '¿Seguro? Tocá de nuevo para borrar'; return; }
      const anterior = d; const c = d.cuentas.find(x => x.id === b.dataset.c);
      ui.borrarArmado = null; cerrar(); guardar(V.borrarCuenta(d, b.dataset.c));
      toast(`${c?.nombre || 'Cuenta'} borrada.`, [{ t: 'Deshacer', fn: () => guardar(anterior) }], 7000);
      break;
    }
    case 'agregar': abrirAgregar(); setTimeout(() => $id('buscar-serv')?.focus(), 60); break;
    case 'elegir': {
      const s = servicio(b.dataset.s);
      const base = s ? cuentaDesdeServicio(s, { primerVto: s.tipo === 'tramite' ? '' : V.proximoDia(10, hoy, s.frecuencia) })
        : { id: V.nuevoId(), nombre: '', categoria: 'Otros', frecuencia: 1, primerVto: V.proximoDia(10, hoy) };
      abrirForm(base, true);
      setTimeout(() => (s ? $id('hoja-cuerpo').querySelector('[name=primerVto]') : $id('hoja-cuerpo').querySelector('[name=nombre]'))?.focus(), 60);
      break;
    }
    case 'desmarcar': { const o = buscarOc(b.dataset.id); if (o) { guardar(V.desmarcarPagado(d, o.cuentaId, o.clave)); verOcurrencia(b.dataset.id); } break; }
    case 'saltear': {
      const o = buscarOc(b.dataset.id); if (!o) break;
      guardar(V.saltear(d, o.cuentaId, o.clave, b.dataset.si === '1'));
      if (b.dataset.si === '1') { cerrar(); toast(`${o.cuenta.nombre}: no cuenta en este período.`, [{ t: 'Deshacer', fn: () => guardar(V.saltear(d, o.cuentaId, o.clave, false)) }]); }
      else verOcurrencia(b.dataset.id);
      break;
    }
    case 'ics': descargarICS(); break;
    case 'ics-cuenta': descargarICS(b.dataset.c); break;
    case 'respaldo': descargarRespaldo(); break;
    case 'importar': $id('f-respaldo').click(); break;
    case 'ejemplo': cerrar(); guardar(datosEjemplo(hoy)); ui.mes = V.mesDe(hoy); toast('Datos de ejemplo cargados.'); break;
    case 'salir-ejemplo': guardar(V.estadoVacio()); ui.onb = { paso: 1, sel: new Set() }; break;
    case 'borrar-todo': {
      if (ui.borrarArmado !== '*') { ui.borrarArmado = '*'; b.textContent = '¿Seguro? Se borra todo. Tocá de nuevo'; return; }
      const anterior = d; ui.borrarArmado = null; cerrar(); guardar(V.estadoVacio());
      toast('Se borró todo.', [{ t: 'Deshacer', fn: () => guardar(anterior) }], 8000);
      break;
    }
    case 'onb-sel': {
      const s = b.dataset.s; ui.onb.sel.has(s) ? ui.onb.sel.delete(s) : ui.onb.sel.add(s);
      b.setAttribute('aria-pressed', ui.onb.sel.has(s));
      const seguir = document.querySelector('[data-acc="onb-seguir"]');
      if (seguir) { seguir.disabled = !ui.onb.sel.size; seguir.innerHTML = `${ui.onb.sel.size ? `Seguir con ${ui.onb.sel.size}` : 'Elegí al menos uno'} <svg><use href="#i-flecha"/></svg>`; }
      break;
    }
    case 'onb-seguir': ui.onb.paso = 2; render(); document.querySelector('#onb-lista input')?.focus(); break;
    case 'onb-volver': ui.onb.paso = 1; render(); break;
    case 'onb-listo': terminarPrimerUso(); break;
  }
});

document.addEventListener('input', e => {
  if (e.target.id === 'buscar-serv') $id('lista-serv').innerHTML = elegirServicio(e.target.value);
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.name === 'conMonto') { const box = t.form.querySelector('[data-si=monto]'); box.hidden = !t.checked; }
  if (t.name === 'moneda') t.form.querySelectorAll('.monto-in').forEach(x => { x.dataset.sim = t.value === 'USD' ? 'US$' : '$'; });
});

document.addEventListener('submit', e => {
  const form = e.target.closest('form[data-form]');
  if (!form) return;
  e.preventDefault();
  const tipo = form.dataset.form;
  if (tipo === 'pagar') {
    const o = buscarOc(form.dataset.id); if (!o) return;
    const f = new FormData(form);
    const monto = o.cuenta.tipo === 'tramite' ? null : V.leerPesos(f.get('monto'));
    if (o.cuenta.tipo !== 'tramite' && monto == null) { form.monto.setAttribute('aria-invalid', 'true'); form.monto.focus(); return; }
    const fecha = V.esFecha(String(f.get('fecha'))) ? String(f.get('fecha')) : hoy;
    const anterior = d;
    guardar(V.marcarPagado(d, o.cuentaId, o.clave, { monto, fecha, nota: String(f.get('nota') || '').trim().slice(0, 80) }));
    cerrar();
    toast(o.cuenta.tipo === 'tramite' ? `${o.cuenta.nombre}: hecho.` : `${o.cuenta.nombre} pagado · ${plata(monto, o.moneda)}`, [{ t: 'Deshacer', fn: () => guardar(anterior) }]);
  } else if (tipo === 'factura') {
    const o = buscarOc(form.dataset.id); if (!o) return;
    const f = new FormData(form);
    const monto = V.leerPesos(f.get('monto'));
    const fecha = String(f.get('fecha') || '');
    guardar(V.cargarFactura(d, o.cuentaId, o.clave, { monto, fecha: V.esFecha(fecha) ? fecha : o.clave }));
    verOcurrencia(form.dataset.id);
    toast('Factura guardada.');
  } else if (tipo === 'cuenta') {
    const c = leerFormCuenta(form);
    if (!c) return;
    const nueva = form.dataset.nueva === '1';
    const salirEjemplo = d.ejemplo && nueva; // lo primero propio reemplaza el ejemplo
    guardar(V.guardarCuenta(salirEjemplo ? V.estadoVacio() : d, c));
    cerrar();
    toast(salirEjemplo ? `Sacamos el ejemplo. ${c.nombre} es tu primera cuenta.` : nueva ? `${c.nombre} agregada.` : 'Cambios guardados.', nueva ? [{ t: 'Al calendario', fn: () => descargarICS(c.id) }] : [], 6000);
  } else if (tipo === 'avisos') {
    const av = [...form.querySelectorAll('[name=av]:checked')].map(x => Number(x.value)).sort((a, b) => b - a).slice(0, 3);
    guardar({ ...d, config: { ...d.config, avisos: av.length ? av : [0], hora: form.hora.value } });
    toast('Avisos guardados. Volvé a sumar el calendario para aplicarlos.', [{ t: 'Sumar', fn: () => descargarICS() }], 7000);
  }
});

$id('f-respaldo').addEventListener('change', async e => {
  const file = e.target.files?.[0]; e.target.value = '';
  if (!file) return;
  if (file.size > 5e6) { toast('Ese archivo es demasiado grande para ser un respaldo.'); return; }
  try {
    const nuevo = V.leerRespaldo(await file.text());
    const anterior = d;
    cerrar(); guardar({ ...nuevo, ultimoRespaldo: nuevo.ultimoRespaldo || new Date().toISOString() });
    toast(`Copia restaurada: ${nuevo.cuentas.length} cuentas.`, [{ t: 'Deshacer', fn: () => guardar(anterior) }], 8000);
  } catch (err) { toast(err.message || 'No pudimos leer ese archivo.'); }
});

/* ── navegación ── */
document.querySelectorAll('.tabs [data-tab]').forEach(b => b.addEventListener('click', () => irA(b.dataset.tab)));
$id('b-agregar').addEventListener('click', () => { abrirAgregar(); setTimeout(() => $id('buscar-serv')?.focus(), 60); });
$id('b-ajustes').addEventListener('click', abrirAjustes);
$id('b-cal-ics').addEventListener('click', () => descargarICS());
function irA(v) {
  ui.vista = v;
  try { history.replaceState(null, '', `#${v}`); } catch {}
  render();
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  $id('app').focus({ preventScroll: true });
}
window.addEventListener('scroll', () => document.querySelector('.top').classList.toggle('con-borde', window.scrollY > 4), { passive: true });

function render() {
  hoy = V.hoyLocal();
  document.querySelectorAll('.vista').forEach(s => { s.hidden = s.dataset.vista !== ui.vista; });
  document.querySelectorAll('.tabs [data-tab]').forEach(b => { if (b.dataset.tab === ui.vista) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  ({ inicio: vistaInicio, calendario: vistaCalendario, cuentas: vistaCuentas, numeros: vistaNumeros })[ui.vista]();
}

/* Al volver a la app (otro día, otra pestaña), refrescar. */
/* Solo si cambió el día o los datos (otra pestaña): así no se pierde lo que estabas tipeando
   cuando vas a mirar la factura y volvés. */
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  let crudo = null;
  try { crudo = localStorage.getItem(CLAVE); } catch {}
  const cambioDatos = crudo != null && crudo !== JSON.stringify(d);
  const cambioDia = V.hoyLocal() !== hoy;
  if (!cambioDatos && !cambioDia) return;
  if (cambioDatos) d = cargar();
  if (hoja.open && cambioDatos) cerrar();
  render();
});

const inicial = location.hash.slice(1);
if (['inicio', 'calendario', 'cuentas', 'numeros'].includes(inicial)) ui.vista = inicial;
render();
