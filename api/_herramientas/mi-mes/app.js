/* Mi Mes by Orbit · interfaz. Las cuentas viven en calculos.js (puro, con pruebas). */
import {
  CATEGORIAS, RUBROS, REDES, COLORES, MONEDAS, CAMBIO_DEFECTO,
  mesDe, hoyISO, sumarMeses, difMeses, nombreMes, fechaCorta, proximoResumen,
  formatoPesos as $, formatoMoneda as fm, leerMonto, cambioDe, aPesos,
  repartirCuotas, ultimoMes, numeroDeCuota, resumenMes, tarjetaEnMes, totalResumen,
  gastoPorRubro, disponibleTarjeta, rubroPara, normalizarComercio,
  validarLectura, importarResumen, datosVacios, migrar, decidirLectura,
  escalera, limiteDelMes, alertasTarjetas, cicloTarjeta, eventosTarjeta, generarICS, diasEntre,
  cuotasOContado, supuesto, simularCompra, LIMITE_DEFECTO, datosParaAvisos,
  cargosDelResumen, proximaLiberacion, percepcionEstimada, GASTOS_UN_MES, mesAguinaldo,
  creditoTarjeta, creditoTotal, alertasCredito, mesesCreditoSupera, primerMesDeCompra, EMISORES, nombreTarjeta,
} from './calculos.js';
import { resumenEjemplo } from './ejemplo.js';

const CLAVE = 'orbit:mi-mes';
const ATRAS = 6, ADELANTE = 60;          // meses que se pueden mirar
const MAX_PDF = 4 * 1024 * 1024;
const HOY = mesDe();
const HOY_ISO = hoyISO();
const LOCAL = location.protocol === 'file:';

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
  try { localStorage.setItem(CLAVE, JSON.stringify(datos)); programarSync(); return true; }
  catch { puedeGuardar = false; $id('sin-storage').hidden = false; return false; }
}
let datos = cargar();
let mes = HOY;
let vista = 'inicio';
let tarjetaVista = null;      // id de la tarjeta abierta
let pendiente = null;         // lectura de un resumen esperando revisión
let tarjetaDestino = null;    // si se sube el resumen desde una tarjeta

const nuevoId = () => (globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $id = id => document.getElementById(id);
const capital = s => s.charAt(0).toUpperCase() + s.slice(1);
const corto = m => nombreMes(m, { corto: true });
const ic = (n, extra = '') => `<svg class="ic${extra}"><use href="#i-${n}"/></svg>`;
const sinSimbolo = (c, m) => fm(c, m, { centavos: true }).replace(/^−?\S+ /, '');
const tarjetaDe = id => datos.tarjetas.find(t => t.id === id) || null;
/* color para una tarjeta nueva: el primero que no esté usado */
const colorLibre = () => COLORES.find(c => !datos.tarjetas.some(t => t.color === c)) || COLORES[datos.tarjetas.length % COLORES.length];

/* ── toast ── */
let toastT;
function avisar(texto) {
  const t = $id('toast');
  t.textContent = texto;
  t.classList.add('on');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('on'), 2800);
}

/* ── piezas ── */
function textoRepite(x) {
  if (!x.repite) return `Solo ${corto(x.desde)}`;
  if (x.hasta) return `Todos los meses hasta ${corto(x.hasta)}`;
  return 'Todos los meses';
}
function item({ tipo, id, icono, claseIc = '', titulo, meta, monto, montoClase = '', sub = '', extra = '', ir = '' }) {
  const attrs = ir ? `data-ir-tarjeta="${esc(ir)}"` : `data-editar="${tipo}" data-id="${esc(id)}"`;
  return `<li><button type="button" class="mm-item" ${attrs}>
    <span class="mm-item-ic ${claseIc}">${ic(icono)}</span>
    <span class="mm-item-txt"><span class="mm-item-tit">${esc(titulo)}${extra}</span><span class="mm-item-meta">${esc(meta)}</span></span>
    <span class="mm-item-monto ${montoClase}">${esc(monto)}${sub ? `<small>${esc(sub)}</small>` : ''}</span></button></li>`;
}
const vacio = html => `<li class="mm-vacio">${html}</li>`;
function listaMonedas(porMoneda) {
  return Object.entries(porMoneda).filter(([m]) => m !== 'ARS').map(([m, c]) => fm(c, m)).join(' y ');
}
function tcard(t, { mesTotal = null, boton = true, grande = false } = {}) {
  const tag = boton ? 'button type="button"' : 'div';
  const cierre = boton ? 'button' : 'div';
  const red = t.red && t.red !== 'Otra' ? t.red : '';
  return `<${tag} class="mm-tcard ${esc(t.color || 'azul')}${grande ? ' grande' : ''}" ${boton ? `data-ir-tarjeta="${esc(t.id)}" aria-label="${esc(`${t.nombre}${t.ultimos4 ? `, terminada en ${t.ultimos4}` : ''}${mesTotal !== null ? `, este mes ${$(mesTotal)}` : ''}`)}"` : ''}>
    <span class="tc-arriba"><span class="tc-banco">${esc(t.nombre)}${t.banco && !t.nombre.toLowerCase().includes(t.banco.toLowerCase()) ? `<small>${esc(t.banco)}</small>` : ''}</span><span class="tc-red">${esc(red)}</span></span>
    <span class="tc-chip" aria-hidden="true"></span>
    <span class="tc-abajo"><span class="tc-num">${t.ultimos4 ? `•••• ${esc(t.ultimos4)}` : ''}${t.adicionales?.length ? `<small>+ ${t.adicionales.length === 1 ? `adicional ···${esc(t.adicionales[0])}` : `${t.adicionales.length} adicionales`}</small>` : ''}</span>
    ${mesTotal !== null ? `<span class="tc-mes">${esc(corto(mes))}<b>${esc($(mesTotal))}</b></span>` : ''}</span>
  </${cierre}>`;
}

/* ════════ INICIO ════════ */
function pintarInicio(animar = false) {
  const r = resumenMes(datos, mes);
  const sinNada = !datos.ingresos.length && !datos.gastos.length && !datos.cuotas.length && !datos.resumenes.length;

  $id('mes-nombre').textContent = capital(nombreMes(mes));
  $id('mes-nombre').dataset.hoy = mes === HOY ? 'sí' : '';
  $id('mes-ant').disabled = difMeses(mes, HOY) >= ATRAS;
  $id('mes-sig').disabled = difMeses(HOY, mes) >= ADELANTE;

  const num = $id('libres');
  num.textContent = sinNada ? '$ —' : $(r.libres);
  num.style.setProperty('--n', Math.max(8, num.textContent.length));
  const libera = proximaLiberacion(datos, mes);
  const frase = libera ? `En ${nombreMes(libera.mes)} se te liberan ${$(libera.libera)} de cuotas por mes.` : '';
  /* negativo sin culpa y con salida: el dato, y el próximo mes mejor a la vista */
  $id('pasas').hidden = !(r.libres < 0);
  $id('pasas').textContent = r.libres < 0 ? `Este mes faltan ${$(-r.libres)}.${frase ? ` ${frase}` : ''}` : '';
  $id('libera').hidden = !(r.libres >= 0 && libera);
  $id('libera').textContent = r.libres >= 0 && libera ? frase : '';
  const lim = limiteDelMes(datos, mes);
  $id('tope').hidden = !lim.supera;
  $id('tope').innerHTML = lim.supera ? `${ic('alerta')} Las cuotas de este mes ${lim.ingresos ? `son el ${Math.round(lim.usado * 100)} % de tus ingresos` : 'no tienen ingresos que las cubran'}: tu tope es ${lim.pct} %. <u>Ver escalera</u>` : '';
  pintarAlertas();
  const cred = creditoTotal(datos, HOY_ISO);
  $id('s-ing').textContent = $(r.totIngresos);
  $id('s-gas').textContent = $(r.totGastos);
  $id('s-tar').textContent = $(r.totTarjetas);
  pintarContraste(r, cred);

  /* acción principal: sin tarjetas, agregar una (subiendo el resumen); con tarjetas, subir el resumen */
  const principal = $id('accion-principal');
  const sinTarjetas = !datos.tarjetas.length;
  $id('accion-texto').textContent = sinTarjetas ? 'Agregar tarjeta' : 'Subir resumen';
  if (sinTarjetas) { principal.dataset.agregarTarjeta = ''; delete principal.dataset.importar; }
  else { principal.dataset.importar = ''; delete principal.dataset.agregarTarjeta; }

  /* tarjetas */
  $id('carrusel').innerHTML = datos.tarjetas.map(t => tcard(t, { mesTotal: tarjetaEnMes(datos, t.id, mes).total })).join('') +
    `<button type="button" class="mm-tnueva" data-agregar-tarjeta>${ic('mas')}<span>Agregar tarjeta</span></button>`;

  /* movimientos */
  const ing = r.ingresos.map(i => item({ tipo: 'ingreso', id: i.id, icono: 'ingreso', claseIc: 'ing', titulo: i.nombre, meta: textoRepite(i), monto: '+' + $(i.monto), montoClase: 'mas' }));
  const gas = r.gastos.map(g => item({ tipo: 'gasto', id: g.id, icono: 'gasto', titulo: g.nombre, meta: `${g.nombre === g.categoria ? '' : g.categoria + ' · '}${textoRepite(g)}`, monto: '−' + $(g.monto) }));
  const tar = [
    ...r.resumenes.map(x => {
      const ext = listaMonedas(x.porMoneda);
      return item({ ir: x.tarjetaId, icono: 'tarjetas', titulo: `Resumen ${x.tarjeta}`,
        meta: `Vence ${fechaCorta(x.vencimiento) || corto(x.mes)}${ext ? ` · incluye ${ext}` : ''}`, monto: '−' + $(x.monto),
        extra: x.faltaCambio.length ? ' <span class="mm-tag">Falta tipo de cambio</span>' : '' });
    }),
    ...r.delBanco.map(x => item({ ir: x.tarjetaId, icono: 'escalera', titulo: `Cuotas de ${x.tarjeta}`, meta: 'Según la tabla "cuotas a vencer" del banco', monto: '−' + $(x.monto) })),
    ...r.percepciones.map(x => item({ ir: x.tarjetaId, icono: 'dolar', titulo: `Percepción 30 % · ${x.tarjeta}`, meta: 'Estimada: si pagaste en pesos los US$ del resumen anterior. Si los pagaste con dólares propios, no va', monto: '−' + $(x.monto), extra: ' <span class="mm-tag ext">Estimado</span>' })),
    ...r.cuotas.map(c => item({ tipo: 'cuota', id: c.id, icono: 'cuota', titulo: c.descripcion || 'Compra en cuotas',
      meta: `${c.tarjeta} · ${c.cantidad > 1 ? `cuota ${c.numero}/${c.cantidad}` : 'un pago'}`, monto: '−' + $(c.monto),
      sub: c.moneda !== 'ARS' ? fm(c.original, c.moneda) : '',
      extra: (c.nueva ? ' <span class="mm-tag ext">Compra nueva</span>' : '') + (c.ultima && c.cantidad > 1 ? ' <span class="mm-tag">Última</span>' : '') })),
    ...r.sinCambio.map(c => item({ tipo: 'cuota', id: c.id, icono: 'alerta', titulo: c.descripcion || 'Compra en cuotas',
      meta: `${c.tarjeta} · cuota ${c.numero}/${c.cantidad} · no sumada`, monto: fm(c.original, c.moneda) })),
  ];
  const dentro = r.dentroDeResumen.length
    ? `<p class="mm-vacio">${r.dentroDeResumen.length === 1 ? '1 cuota ya está' : `${r.dentroDeResumen.length} cuotas ya están`} adentro del resumen.</p>` : '';
  const grupo = (titulo, total, filas, vacioHtml, extra = '') => `<div class="mm-grupo"><div class="mm-grupo-top"><span>${titulo}</span><span>${total}</span></div>
    <ul class="mm-lista">${filas.length ? filas.join('') : vacio(vacioHtml)}</ul>${extra}</div>`;
  $id('movs').innerHTML = sinNada
    ? `<p class="mm-vacio"><b>Empezá por tu sueldo.</b> Después sumá tus gastos fijos y tus cuotas (o subí el resumen de tu tarjeta) y arriba ves cuánto te queda libre este mes y los que vienen.</p>`
    : grupo('Ingresos', '+' + $(r.totIngresos), ing, datos.ingresos.length ? 'Sin ingresos este mes.' : '<b>Cargá tu sueldo</b> o lo que cobres todos los meses.') +
      grupo('Gastos fijos', '−' + $(r.totGastos), gas, datos.gastos.length ? 'Sin gastos fijos este mes.' : 'Alquiler, expensas, servicios, suscripciones: lo que pagás sí o sí.') +
      grupo('Tarjetas y cuotas', '−' + $(r.totTarjetas), tar, datos.cuotas.length || datos.resumenes.length ? 'Sin cuotas ni resúmenes este mes.' : 'Cargá una compra en cuotas o subí el resumen de tu tarjeta.', dentro);

  /* moneda extranjera */
  const faltan = [...new Set([...r.sinCambio.map(c => c.moneda), ...r.resumenes.flatMap(x => x.faltaCambio)])];
  $id('aviso-cambio').hidden = !faltan.length;
  $id('aviso-cambio').innerHTML = faltan.length ? `${ic('alerta')}<div><b>Falta el tipo de cambio de ${faltan.map(m => MONEDAS[m].nombre).join(' y ')}.</b> Esos consumos no están sumados todavía. <button type="button" data-cambio>Cargarlo</button></div>` : '';
  const usaUSD = datos.cuotas.some(c => c.moneda === 'USD') || datos.resumenes.some(x => x.totales.USD || x.consumos.some(c => c.moneda === 'USD'));
  const c = cambioDe(datos, 'USD');
  $id('dolar').innerHTML = usaUSD ? `<span class="mm-item-ic ing">${ic('dolar')}</span><span class="mm-item-txt"><b>Dólar: ${esc($(c.valor, { centavos: true }))}</b>
    <span class="mm-fuente">${fuenteHTML(c)}</span></span><button type="button" class="mm-link" data-cambio>Cambiar</button>` : '';

  if (animar) { const h = $id('hero'); h.classList.remove('mm-entra'); void h.offsetWidth; h.classList.add('mm-entra'); }
}
function fuenteHTML(c) {
  if (!c) return '';
  const f = c.fecha ? ` · ${fechaCorta(c.fecha)} ${c.fecha.slice(0, 4)}` : '';
  return c.url ? `<a href="${esc(c.url)}" target="_blank" rel="noopener">${esc(c.fuente)}</a>${esc(f)}` : `${esc(c.fuente)}${esc(f)}`;
}

/* plata líquida vs. crédito: con qué pagás y lo que gastaste con crédito */
function pintarContraste(r, cred) {
  const el = $id('contraste');
  const mesTxt = nombreMes(mes);
  if (!datos.ingresos.length && !datos.tarjetas.length) { el.hidden = true; return; }
  el.hidden = false;
  const max = Math.max(1, r.liquida, r.totTarjetas);
  const w = v => `${Math.max(0, Math.min(100, (v / max) * 100))}%`;
  const falta = r.totTarjetas - r.liquida;
  el.innerHTML = `<div class="mm-seccion-top"><h2 id="t-contraste">Con qué pagás y qué debés</h2></div>
    <div class="mm-cx">
      <div class="mm-cx-fila"><div class="mm-cx-top"><span><b>Plata líquida</b> de ${esc(mesTxt)}<small>Ingresos − gastos fijos: la plata que tenés para pagar las tarjetas</small></span><b>${esc($(r.liquida))}</b></div>
        <div class="mm-cx-barra"><i class="liq" style="width:${w(r.liquida)}"></i></div></div>
      <div class="mm-cx-fila"><div class="mm-cx-top"><span><b>Vence de tarjetas</b> en ${esc(mesTxt)}<small>Lo que gastaste con crédito y se paga este mes</small></span><b>${esc($(r.totTarjetas))}</b></div>
        <div class="mm-cx-barra"><i class="ant" style="width:${w(r.totAnteriores)}"></i><i class="nue" style="width:${w(r.totNuevas)}"></i></div>
        ${r.totNuevas ? `<p class="mm-cx-ley"><span><i class="ant"></i>De antes ${esc($(r.totAnteriores))}</span><span><i class="nue"></i>Compras nuevas ${esc($(r.totNuevas))}</span></p>` : ''}</div>
      <p class="mm-cx-res">${!datos.ingresos.length ? 'Cargá tu sueldo para ver si te alcanza.' : falta > 0 ? `Este mes faltan ${esc($(falta))} para cubrir las tarjetas.${(() => { const l = proximaLiberacion(datos, mes); return l ? ` En ${esc(nombreMes(l.mes))} se te liberan ${esc($(l.libera))} por mes.` : ''; })()}` : `Te quedan libres ${esc($(-falta))}.`}</p>
    </div>
    <div class="mm-cx-deuda">
      <div><p class="mm-item-meta">Debés en total en tarjetas</p><p class="mm-cx-total">${esc($(cred.total))}</p></div>
      <dl><div><dt>Resumen por pagar</dt><dd>${esc($(cred.resumen))}</dd></div><div><dt>Cuotas que vienen</dt><dd>${esc($(cred.futuras + cred.percepcion))}</dd></div><div><dt>Compras nuevas</dt><dd>${esc($(cred.nuevas))}</dd></div></dl>
      ${cred.percepcion ? `<p class="mm-fuente" style="margin:0">"Cuotas que vienen" incluye ${esc($(cred.percepcion))} de percepción estimada por saldos en dólares.</p>` : ''}
    </div>
    ${!datos.tarjetas.length ? `<button type="button" class="mm-btn" data-agregar-tarjeta>${ic('subir')} Agregá tu tarjeta: subí el último resumen</button>` : `<button type="button" class="mm-link" data-nuevo="cuota">¿Compraste algo que todavía no está en el resumen?</button>`}`;
}

/* Si el resumen tiene saldo en otra moneda: lo que cobra de percepción el siguiente si se paga en pesos */
function lineaPercepcion(res) {
  const p = percepcionEstimada(res, datos);
  if (!p) return '';
  const ext = Object.entries(res.totales || {}).filter(([m, v]) => m !== 'ARS' && v > 0).map(([m, v]) => fm(v, m)).join(' y ');
  return `<p class="mm-cargos-linea">Si pagás ${esc(ext)} en pesos, en el próximo resumen te cobran <b>~${esc($(p))}</b> de percepción (si los pagás con dólares propios, no). La sumamos al mes siguiente como estimado.</p>`;
}
/* "Este resumen te cobró $ X de intereses y cargos" (las devoluciones restan) */
function lineaCargos(res) {
  const c = cargosDelResumen(res, datos);
  if (!c.hay) return '';
  if (c.ars > 0) return `<p class="mm-cargos-linea">Este resumen te cobró <b>${esc($(c.ars))}</b> de intereses y cargos. Pagando el total, ese número baja a cero.</p>`;
  if (c.ars < 0) return `<p class="mm-cargos-linea">Entre cargos y devoluciones, este resumen te devolvió <b>${esc($(-c.ars))}</b>.</p>`;
  return '';
}

/* ════════ TARJETAS ════════ */
function pintarTarjetas() {
  $id('tj-mes').textContent = capital(nombreMes(mes));
  const filas = datos.tarjetas.map(t => ({ t, ...tarjetaEnMes(datos, t.id, mes) }));
  const total = filas.reduce((s, f) => s + f.total, 0);
  const porMoneda = {};
  for (const f of filas) {
    if (f.resumen) for (const [m, v] of Object.entries(f.resumen.porMoneda)) porMoneda[m] = (porMoneda[m] || 0) + v;
    else for (const c of f.cuotas) porMoneda[c.moneda] = (porMoneda[c.moneda] || 0) + c.original;
  }
  const max = Math.max(1, ...filas.map(f => f.total));
  $id('tj-total').innerHTML = datos.tarjetas.length ? `
    <p class="mm-item-meta">Todas tus tarjetas en ${esc(nombreMes(mes))}</p>
    <p class="mm-total-num">${esc($(total))}</p>
    <div class="mm-chips-mon">${Object.entries(porMoneda).map(([m, v]) => `<span class="mm-mon">${esc(fm(v, m))}</span>`).join('')}</div>
    ${Object.keys(porMoneda).some(m => m !== 'ARS') ? `<p class="mm-fuente">Lo que no es en pesos está pasado con el tipo de cambio de la app. <button type="button" class="mm-link" data-cambio>Ver o cambiar</button></p>` : ''}
    <h2 class="mm-seccion-top" style="font-size:16px;margin-top:8px">Comparación</h2>
    <ul class="mm-barras">${filas.map(f => `<li><div class="mm-barra-top"><span>${esc(f.t.nombre)}</span><span>${esc($(f.total))}</span></div>
      <div class="mm-barra" role="img" aria-label="${esc(`${f.t.nombre}: ${Math.round((f.total / (total || 1)) * 100)} % del total`)}"><i class="${esc(f.t.color)}" style="width:${(f.total / max) * 100}%"></i></div></li>`).join('')}</ul>`
    : `<p class="mm-vacio"><b>Todavía no tenés tarjetas.</b> Subí el último resumen de una y sacamos todo de ahí: banco, límite, fechas, saldo y cuotas.</p>
       <div class="mm-acciones"><button type="button" class="mm-btn" data-agregar-tarjeta>${ic('subir')} Agregar tarjeta con su resumen</button><button type="button" class="mm-btn sec" data-tarjeta-manual>No tengo el resumen a mano</button></div>`;
  $id('tj-lista').innerHTML = filas.map(f => tcard(f.t, { mesTotal: f.total })).join('') +
    `<button type="button" class="mm-tnueva" data-agregar-tarjeta>${ic('mas')}<span>Agregar tarjeta</span></button>`;
}

/* ════════ UNA TARJETA ════════ */
function pintarUna() {
  const t = tarjetaDe(tarjetaVista);
  if (!t) { verVista('tarjetas'); return; }
  $id('una-mes').textContent = capital(nombreMes(mes));
  $id('t-una').textContent = t.nombre;
  const en = tarjetaEnMes(datos, t.id, mes);
  const res = resumenDelMesDe(t.id);
  let resumenHTML;
  if (res) {
    const tot = totalResumen(res, datos);
    resumenHTML = `<p class="mm-item-meta">Resumen que vence en ${esc(nombreMes(mes))}</p>
      <p class="mm-total-num">${esc($(tot.ars))}</p>
      <div class="mm-chips-mon">${Object.entries(tot.porMoneda).map(([m, v]) => `<span class="mm-mon">${esc(fm(v, m))}</span>`).join('')}</div>
      ${tot.faltaCambio.length ? `<p class="mm-err">Falta el tipo de cambio de ${tot.faltaCambio.map(m => MONEDAS[m].nombre).join(' y ')}: no está sumado. <button type="button" class="mm-link" data-cambio>Cargarlo</button></p>` : ''}
      ${lineaCargos(res)}
      ${lineaPercepcion(res)}
      <dl class="mm-datos">
        <div><dt>Vence</dt><dd>${esc(fechaCorta(res.vencimiento) || '—')}</dd></div>
        <div><dt>Cierre</dt><dd>${esc(fechaCorta(res.cierre) || '—')}</dd></div>
        <div><dt>Pago mínimo</dt><dd>${res.pagoMinimo ? esc(fm(res.pagoMinimo.monto, res.pagoMinimo.moneda)) : '—'}</dd></div>
        <div><dt>Consumos</dt><dd>${res.consumos.length}</dd></div>
      </dl>`;
  } else {
    resumenHTML = `<p class="mm-item-meta">${esc(capital(nombreMes(mes)))}</p><p class="mm-total-num">${esc($(en.total))}</p>
      <p class="mm-vacio">No subiste el resumen de este mes. El total sale de las cuotas que cargaste.</p>`;
  }
  const cr = creditoTarjeta(datos, t.id, HOY_ISO);
  const disp = disponibleTarjeta(datos, t.id, HOY_ISO);
  const dispHTML = `<section class="mm-panel mm-disp" aria-labelledby="u-disp"><div class="mm-seccion-top"><h2 id="u-disp">Lo que debés en esta tarjeta</h2></div>
      <p class="mm-total-num" style="font-size:32px">${esc($(cr.total))}</p>
      <dl class="mm-datos"><div><dt>Resumen por pagar</dt><dd>${esc($(cr.resumen))}</dd></div><div><dt>Cuotas que vienen</dt><dd>${esc($(cr.futuras))}</dd></div>
        <div><dt>Compras nuevas</dt><dd>${esc($(cr.nuevas))}</dd></div>${cr.percepcion ? `<div><dt>Percepción estimada</dt><dd>${esc($(cr.percepcion))}</dd></div>` : ''}<div><dt>${disp ? 'Crédito disponible' : 'Límite'}</dt><dd>${disp ? esc($(Math.max(0, disp.disponible))) : '—'}</dd></div></dl>
      ${disp ? `<div class="mm-barra" role="img" aria-label="${esc(`Usás ${$(disp.usado)} de ${$(disp.limite)}`)}"><i style="width:${Math.min(100, (disp.usado / disp.limite) * 100)}%"></i></div>
        <p class="mm-fuente" style="margin:8px 0 10px">Límite ${esc($(disp.limite))} menos lo que debés (con lo que es en otra moneda pasado a pesos).${disp.disponible < 0 ? ' <b style="color:var(--neg)">Estás por encima del límite.</b>' : ''}</p>`
        : `<p class="mm-vacio">El límite sale del resumen. <button type="button" class="mm-link" data-importar="${esc(t.id)}">Subí el último</button> o <button type="button" class="mm-link" data-editar-tarjeta="${esc(t.id)}">cargalo a mano</button>.</p>`}
    </section>`;
  const activas = datos.cuotas.filter(c => c.tarjetaId === t.id && difMeses(mes, ultimoMes(c)) >= 0)
    .sort((a, b) => difMeses(ultimoMes(b), ultimoMes(a)));
  const cuotasHTML = activas.length ? activas.map(c => {
    const n = numeroDeCuota(c, mes);
    const cuota = repartirCuotas(c.total, c.cantidad)[Math.max(0, n - 1)];
    return item({ tipo: 'cuota', id: c.id, icono: 'cuota', titulo: c.descripcion || 'Compra en cuotas',
      meta: `${n ? `Cuota ${n}/${c.cantidad}` : `Empieza ${corto(c.primerMes)}`} · termina ${corto(ultimoMes(c))}`,
      monto: fm(cuota, c.moneda), sub: c.moneda !== 'ARS' ? `≈ ${$(aPesos(cuota, c.moneda, datos) ?? 0)}` : '' });
  }).join('') : vacio('No hay cuotas activas en esta tarjeta.');
  const rubros = res ? gastoPorRubro(res, datos) : [];
  const maxR = Math.max(1, ...rubros.map(x => x.ars));
  const rubrosHTML = rubros.length ? `<ul class="mm-barras">${rubros.map(x => `<li><div class="mm-barra-top"><span>${esc(x.rubro)}</span><span>${esc($(x.ars))}</span></div><div class="mm-barra"><i style="width:${(x.ars / maxR) * 100}%"></i></div></li>`).join('')}</ul>`
    : `<p class="mm-vacio">Cuando subas el resumen de este mes, acá ves en qué se fue la plata.</p>`;
  const lineaConsumo = (c, m) => `<li><div class="mm-item"><span class="mm-item-txt"><span class="mm-item-tit">${esc(c.comercio)}${c.cuota ? ` <span class="mm-tag ext">${c.cuota.n}/${c.cuota.de}</span>` : ''}</span><span class="mm-item-meta">${esc([fechaCorta(c.fecha), c.rubro].filter(Boolean).join(' · '))}</span></span><span class="mm-item-monto">${esc(fm(c.monto, m))}</span></div></li>`;
  const variasTarjetas = res && new Set(res.consumos.map(c => c.tarjeta).filter(Boolean)).size > 1;
  const quien = u => (u === t.ultimos4 || !u ? `Titular${u ? ` ···${u}` : ''}` : (t.adicionales || []).includes(u) || res?.tarjetas?.some(x => x.ultimos4 === u && x.adicional) ? `Adicional ···${u}` : `···${u}`);
  const consumosHTML = res ? Object.entries(agruparPorMoneda(res.consumos)).map(([m, cs]) => `
      <div class="mm-moneda-tit">En ${esc(MONEDAS[m].nombre)} <span>${esc(fm(cs.reduce((s, c) => s + c.monto, 0), m))}</span></div>
      ${variasTarjetas
        ? [...new Set(cs.map(c => c.tarjeta || ''))].map(u => `<p class="mm-sub-tarjeta">${esc(quien(u))} · ${esc(fm(cs.filter(c => (c.tarjeta || '') === u).reduce((s, c) => s + c.monto, 0), m))}</p>
            <ul class="mm-lista">${cs.filter(c => (c.tarjeta || '') === u).map(c => lineaConsumo(c, m)).join('')}</ul>`).join('')
        : `<ul class="mm-lista">${cs.map(c => lineaConsumo(c, m)).join('')}</ul>`}`).join('') : '';
  const cargosHTML = res?.cargos?.length ? `<section class="mm-panel" aria-labelledby="u-car"><div class="mm-seccion-top"><h2 id="u-car">Cargos e impuestos</h2></div>
      <p class="mm-fuente" style="margin:0 0 4px">Intereses, IVA, sellos y percepciones. Suman al total a pagar pero no son gastos tuyos por rubro.</p>${listaMovs(res.cargos)}</section>` : '';
  const pagosHTML = res?.pagosYCreditos?.length ? `<section class="mm-panel" aria-labelledby="u-pag"><div class="mm-seccion-top"><h2 id="u-pag">Pagos y créditos</h2></div>
      ${Object.keys(res.saldoAnterior || {}).length ? `<p class="mm-fuente" style="margin:0 0 4px">Saldo anterior: ${Object.entries(res.saldoAnterior).map(([m, v]) => esc(fm(v, m))).join(' y ')}.</p>` : ''}${listaMovs(res.pagosYCreditos)}</section>` : '';

  const ciclo = cicloTarjeta(datos, t.id, HOY_ISO);
  const avisos = alertasTarjetas({ ...datos, alertasVistas: [] }, HOY_ISO).filter(a => a.tarjetaId === t.id);
  const fechasHTML = ciclo ? `<section class="mm-panel" aria-labelledby="u-fe"><div class="mm-seccion-top"><h2 id="u-fe">Fechas y avisos</h2></div>
      <dl class="mm-datos"><div><dt>Cierre</dt><dd>${esc(ciclo.cierre ? fechaCorta(ciclo.cierre) : '—')}</dd></div><div><dt>Vence</dt><dd>${esc(fechaCorta(ciclo.vencimiento))}${diasEntre(HOY_ISO, ciclo.vencimiento) >= 0 ? ` <small class="mm-dias">(${diasEntre(HOY_ISO, ciclo.vencimiento) === 0 ? 'hoy' : `en ${diasEntre(HOY_ISO, ciclo.vencimiento)} días`})</small>` : ''}</dd></div></dl>
      ${avisos.map(alertaHTML).join('')}
      <button type="button" class="mm-btn sec" data-ics="${esc(t.id)}">${ic('calendario')} Agregar al calendario</button>
      <p class="mm-fuente" style="margin:8px 0 10px">Baja un archivo con el cierre y el vencimiento${ciclo.resumen?.totales?.USD ? ' (y el recordatorio de dólares)' : ''}. Abrilo en el teléfono y te avisa aunque no abras la app.</p></section>`
    : `<section class="mm-panel"><p class="mm-vacio">Para recibir avisos de cierre y vencimiento, subí el resumen de esta tarjeta o <button type="button" class="mm-link" data-editar-tarjeta="${esc(t.id)}">cargá los días</button>.</p></section>`;
  $id('una').innerHTML = `
    <div class="mm-una-a">
      ${tcard(t, { boton: false })}
      <div class="mm-acciones">
        <button type="button" class="mm-btn" data-importar="${esc(t.id)}">${ic('subir')} Subir resumen de esta tarjeta</button>
        <button type="button" class="mm-btn sec" data-editar-tarjeta="${esc(t.id)}">${ic('editar')} Editar</button>
      </div>
      ${fechasHTML}
      <section class="mm-panel" aria-label="Resumen del mes">${resumenHTML}</section>
      ${dispHTML}
    </div>
    <div class="mm-una-b">
      <section class="mm-panel" aria-labelledby="u-cuo"><div class="mm-seccion-top"><h2 id="u-cuo">Cuotas activas</h2><button type="button" class="mm-link" data-nuevo="cuota" data-tarjeta="${esc(t.id)}">+ Agregar</button></div><ul class="mm-lista">${cuotasHTML}</ul></section>
      <section class="mm-panel" aria-labelledby="u-rub"><div class="mm-seccion-top"><h2 id="u-rub">Gasto por rubro</h2></div>${rubrosHTML}</section>
      ${consumosHTML ? `<section class="mm-panel" aria-labelledby="u-con"><div class="mm-seccion-top"><h2 id="u-con">Consumos del resumen</h2></div>${consumosHTML}</section>` : ''}
      ${cargosHTML}
      ${pagosHTML}
    </div>`;
}
const TIPO_MOV = { interes: 'Intereses', iva: 'IVA', sellos: 'Sellos', percepcion: 'Percepción 30 %', devolucion: 'Devolución de percepción', comision: 'Comisión', otro: 'Cargo', pago: 'Pago', credito: 'Crédito', reversion: 'Reversión de crédito' };
const listaMovs = lista => Object.entries(agruparPorMoneda(lista)).map(([m, xs]) => `
      <div class="mm-moneda-tit">En ${esc(MONEDAS[m].nombre)} <span>${esc(fm(xs.reduce((s, x) => s + x.monto, 0), m, { signo: true }))}</span></div>
      <ul class="mm-lista">${xs.map(x => `<li><div class="mm-item"><span class="mm-item-txt"><span class="mm-item-tit">${esc(x.concepto)}</span><span class="mm-item-meta">${esc([TIPO_MOV[x.tipo], fechaCorta(x.fecha)].filter(Boolean).join(' · '))}</span></span><span class="mm-item-monto ${x.monto < 0 ? 'mas' : ''}">${esc(fm(x.monto, m, { signo: true }))}</span></div></li>`).join('')}</ul>`).join('');
const resumenDelMesDe = id => datos.resumenes.find(r => r.tarjetaId === id && r.mes === mes) || null;
function agruparPorMoneda(consumos) {
  const g = {};
  for (const c of consumos) (g[c.moneda] ||= []).push(c);
  const orden = m => (m === 'ARS' ? 0 : m === 'USD' ? 1 : 2);
  return Object.fromEntries(Object.entries(g).sort(([a], [b]) => orden(a) - orden(b) || a.localeCompare(b)));
}

/* ════════ LO CARGADO ════════ */
function pintarCargado() {
  const ing = datos.ingresos.slice().sort((a, b) => b.monto - a.monto);
  const gas = datos.gastos.slice().sort((a, b) => b.monto - a.monto);
  const cuo = datos.cuotas.slice().sort((a, b) => difMeses(ultimoMes(b), ultimoMes(a)));
  $id('todo-ing').innerHTML = ing.length
    ? ing.map(i => item({ tipo: 'ingreso', id: i.id, icono: 'ingreso', claseIc: 'ing', titulo: i.nombre, meta: `${textoRepite(i)}${i.repite ? ' · desde ' + corto(i.desde) : ''}`, monto: $(i.monto) })).join('')
    : vacio('Todavía no cargaste ingresos.');
  $id('todo-gas').innerHTML = gas.length
    ? gas.map(g => item({ tipo: 'gasto', id: g.id, icono: 'gasto', titulo: g.nombre, meta: `${g.nombre === g.categoria ? '' : g.categoria + ' · '}${textoRepite(g)}`, monto: $(g.monto) })).join('')
    : vacio('Todavía no cargaste gastos fijos.');
  $id('todo-cuo').innerHTML = cuo.length
    ? cuo.map(c => {
      const terminada = difMeses(ultimoMes(c), HOY) > 0;
      const n = numeroDeCuota(c, HOY);
      const estado = terminada ? 'Terminada' : n ? `Vas por la ${n}/${c.cantidad}` : `Empieza ${corto(c.primerMes)}`;
      return item({ tipo: 'cuota', id: c.id, icono: 'cuota', titulo: c.descripcion || 'Compra en cuotas',
        meta: `${tarjetaDe(c.tarjetaId)?.nombre || 'Sin tarjeta'} · ${c.cantidad} cuotas · ${estado} · termina ${corto(ultimoMes(c))}`,
        monto: fm(c.total, c.moneda), extra: c.origen === 'resumen' ? ' <span class="mm-tag ext">Del resumen</span>' : '' });
    }).join('')
    : vacio('Todavía no cargaste cuotas.');
}

/* ════════ REVISÁ LO QUE LEÍ ════════ */
function pintarRevisar() {
  const box = $id('revisar');
  if (!pendiente) { box.innerHTML = ''; return; }
  const { estado } = pendiente;
  if (estado === 'falla' || estado === 'dudosa') {
    const dudosa = estado === 'dudosa';
    box.innerHTML = `<section class="mm-panel mm-falla">${ic('alerta')}
      <h2>${dudosa ? 'Esta lectura no es confiable' : 'No pudimos leer este resumen'}</h2>
      <p>${esc(pendiente.mensaje || 'No inventamos montos: si algo no se lee bien, preferimos que lo cargues a mano.')}</p>
      <div class="mm-acciones">
        <button type="button" class="mm-btn" data-nuevo="cuota">Cargar a mano</button>
        <button type="button" class="mm-btn sec" data-importar="${esc(tarjetaDestino || '')}">Probar con otro PDF</button>
        ${dudosa ? '<button type="button" class="mm-link" data-revisar-igual>Revisar lo que leí igual</button>' : ''}
      </div></section>`;
    return;
  }
  const l = pendiente.lectura;
  const match = tarjetaDestino || (l.tarjeta.ultimos4 && datos.tarjetas.find(t => t.ultimos4 === l.tarjeta.ultimos4 && t.red === l.tarjeta.red)?.id) || '';
  const nueva = { id: '', nombre: [l.tarjeta.banco, l.tarjeta.red].filter(Boolean).join(' ') || 'Tarjeta nueva', banco: l.tarjeta.banco, red: l.tarjeta.red, ultimos4: l.tarjeta.ultimos4, color: colorLibre() };
  pendiente.nueva = nueva;
  const opciones = [`<option value="">Tarjeta nueva: ${esc(nueva.nombre)}${nueva.ultimos4 ? ` ···${esc(nueva.ultimos4)}` : ''}</option>`,
    ...datos.tarjetas.map(t => `<option value="${esc(t.id)}"${t.id === match ? ' selected' : ''}>${esc(t.nombre)}${t.ultimos4 ? ` ···${esc(t.ultimos4)}` : ''}</option>`)].join('');
  const mesCuenta = l.vencimiento.slice(0, 7);
  const totalesHTML = Object.entries(l.totales).map(([m, v]) => {
    const conv = m !== 'ARS' ? aPesos(v, m, datos) : null;
    const c = cambioDe(datos, m);
    return `<div class="mm-rev-fila"><label for="rt-${m}"><b>Total en ${esc(MONEDAS[m].nombre)}</b>${m !== 'ARS' ? `<br><span class="mm-fuente">${conv === null ? 'Sin tipo de cambio: no se suma hasta que lo cargues.' : `≈ ${esc($(conv))} a ${esc($(c.valor, { centavos: true }))} por ${esc(MONEDAS[m].simbolo)} 1`}</span>` : ''}</label>
      <span style="display:flex;align-items:center;gap:6px"><span aria-hidden="true">${esc(MONEDAS[m].simbolo)}</span><input type="text" inputmode="decimal" id="rt-${m}" data-total="${m}" value="${esc(sinSimbolo(v, m))}" style="width:150px;text-align:right" aria-describedby="rt-${m}-err"></span>
      <p class="mm-err" id="rt-${m}-err" style="grid-column:1/-1"></p></div>`;
  }).join('');
  const grupos = agruparPorMoneda(l.consumos.map((c, i) => ({ ...c, i })));
  const consumosHTML = Object.entries(grupos).map(([m, cs]) => `
    <div class="mm-moneda-tit">En ${esc(MONEDAS[m].nombre)} <span>${cs.length} consumo${cs.length === 1 ? '' : 's'}</span></div>
    ${cs.map(c => `<div class="mm-consumo" data-i="${c.i}">
      <span class="cm-tit">${esc(c.comercio)}${c.cuota ? ` <span class="mm-tag ext">Cuota ${c.cuota.n}/${c.cuota.de}</span>` : ''}</span>
      <span class="cm-meta">${esc([fechaCorta(c.fecha), l.tarjetas?.length > 1 && c.tarjeta ? (l.tarjetas.find(x => x.ultimos4 === c.tarjeta)?.adicional ? `adicional ···${c.tarjeta}` : `···${c.tarjeta}`) : ''].filter(Boolean).join(' · '))}</span>
      <div class="cm-ctrl">
        <label class="mm-sr" for="rm-${c.i}">Monto de ${esc(c.comercio)} en ${esc(MONEDAS[m].nombre)}</label>
        <span aria-hidden="true">${esc(MONEDAS[m].simbolo)}</span><input type="text" inputmode="decimal" id="rm-${c.i}" data-monto value="${esc(sinSimbolo(c.monto, m))}" aria-describedby="rm-${c.i}-err">
        <label class="mm-sr" for="rr-${c.i}">Rubro de ${esc(c.comercio)}</label>
        <select id="rr-${c.i}" data-rubro data-original="${esc(c.rubro)}">${RUBROS.map(r => `<option${r === c.rubro ? ' selected' : ''}>${r}</option>`).join('')}</select>
        <label class="cm-incl"><input type="checkbox" data-incluir checked> Incluir</label>
        <p class="mm-err" id="rm-${c.i}-err" style="flex-basis:100%"></p>
      </div></div>`).join('')}`).join('');

  box.innerHTML = `
    ${pendiente.modo !== 'real' ? `<p class="mm-cartel" style="margin-bottom:16px"><b>Modo prueba</b> · ${pendiente.modo === 'local' ? 'sin conexión con Orbit: ' : ''}estos datos son de ejemplo, no salen de tu PDF. Así se va a ver cuando la lectura esté activa.</p>` : ''}
    ${l.avisos.filter(a => !/^Modo prueba/.test(a)).map(a => `<p class="${l.confianza === 'alta' ? 'mm-nota-suave' : 'mm-alerta'}" style="width:auto;margin:0 0 12px">${esc(a)}</p>`).join('')}
    <div class="mm-rev">
      <div class="mm-rev-a">
        <section class="mm-panel" aria-labelledby="rv-t">
          <div class="mm-seccion-top"><h2 id="rv-t">Tarjeta</h2></div>
          <div id="rv-card">${tcard({ ...nueva, ...(tarjetaDe(match) || {}) }, { boton: false })}</div>
          <div class="mm-campo" style="margin:14px 0 8px"><label for="rv-tarjeta">Guardar en</label><select id="rv-tarjeta">${opciones}</select></div>
        </section>
        <section class="mm-panel" aria-labelledby="rv-d">
          <div class="mm-seccion-top"><h2 id="rv-d">Datos del resumen</h2></div>
          <dl class="mm-datos">
            <div><dt>Vence</dt><dd>${esc(fechaCorta(l.vencimiento))}</dd></div>
            <div><dt>Cierre</dt><dd>${esc(fechaCorta(l.cierre) || '—')}</dd></div>
            <div><dt>Pago mínimo</dt><dd>${l.pagoMinimo ? esc(fm(l.pagoMinimo.monto, l.pagoMinimo.moneda)) : '—'}</dd></div>
            <div><dt>Cuenta en</dt><dd>${esc(capital(nombreMes(mesCuenta)))}</dd></div>
          </dl>
          ${lineaCargos({ cargos: l.cargos })}
          ${lineaPercepcion({ totales: l.totales })}
          <div class="mm-seccion-top"><h2 style="font-size:16px">Total a pagar, por moneda</h2></div>
          ${totalesHTML}
          <p class="mm-fuente" style="margin:6px 0 10px">El total a pagar sale del resumen: es lo que se descuenta de "te quedan libres" en ${esc(nombreMes(mesCuenta))}. Si no coincide con tu PDF, corregilo.</p>
        </section>
        ${Object.keys(l.saldoAnterior || {}).length || l.pagosYCreditos?.length ? `<section class="mm-panel" aria-labelledby="rv-p"><div class="mm-seccion-top"><h2 id="rv-p">Saldo anterior, pagos y créditos</h2></div>
          ${Object.keys(l.saldoAnterior || {}).length ? `<p class="mm-fuente" style="margin:0 0 4px">Saldo anterior: ${Object.entries(l.saldoAnterior).map(([m, v]) => esc(fm(v, m))).join(' y ')}.</p>` : ''}
          ${listaMovs(l.pagosYCreditos || [])}<p class="mm-fuente" style="margin:6px 0 10px">No cuentan como gasto: solo sirven para controlar que la cuenta cierre.</p></section>` : ''}
        ${l.cargos?.length ? `<section class="mm-panel" aria-labelledby="rv-g"><div class="mm-seccion-top"><h2 id="rv-g">Cargos e impuestos</h2></div>${listaMovs(l.cargos)}</section>` : ''}
        ${l.limites?.compra ? `<p class="mm-fuente" style="padding:0 4px">Límite de compra ${esc($(l.limites.compra))}${l.limites.financiacion ? ` y de financiación ${esc($(l.limites.financiacion))}` : ''}: se cargan en la tarjeta al guardar.</p>` : ''}
        ${l.cuotasAVencer?.length ? `<p class="mm-fuente" style="padding:0 4px">Trae la tabla "cuotas a vencer" (${l.cuotasAVencer.length} filas): la usamos en la escalera.</p>` : ''}
      </div>
      <div class="mm-rev-b">
        <section class="mm-panel" aria-labelledby="rv-c">
          <div class="mm-seccion-top"><h2 id="rv-c">Consumos</h2></div>
          <p class="mm-fuente" style="margin:0 0 4px">Corregí el rubro y la app lo recuerda para ese comercio. Las cuotas se suman solas a los meses que vienen.</p>
          ${consumosHTML || '<p class="mm-vacio">No encontramos consumos en este resumen.</p>'}
        </section>
      </div>
    </div>
    <div class="mm-rev-pie">
      <button type="button" class="mm-btn sec" data-descartar>Descartar</button>
      <button type="button" class="mm-btn" data-guardar-resumen>Guardar resumen</button>
    </div>`;
}

function guardarRevisado() {
  const l = structuredClone(pendiente.lectura);
  const box = $id('revisar');
  let primerError = null;
  const fallar = (input, texto) => { input.setAttribute('aria-invalid', 'true'); $id(`${input.id}-err`).textContent = texto; primerError ||= input; };
  for (const input of box.querySelectorAll('[data-total]')) {
    input.removeAttribute('aria-invalid'); $id(`${input.id}-err`).textContent = '';
    const v = leerMonto(input.value);
    if (v === null) fallar(input, 'Revisá este monto (los centavos van con coma).'); else l.totales[input.dataset.total] = v;
  }
  const consumos = [];
  const memoria = { ...datos.rubrosComercio };
  for (const fila of box.querySelectorAll('.mm-consumo')) {
    const c = l.consumos[Number(fila.dataset.i)];
    const incluir = fila.querySelector('[data-incluir]').checked;
    const monto = fila.querySelector('[data-monto]');
    monto.removeAttribute('aria-invalid'); $id(`${monto.id}-err`).textContent = '';
    if (!incluir) continue;
    const v = leerMonto(monto.value);
    if (v === null) { fallar(monto, 'Revisá este monto o destildá "Incluir".'); continue; }
    const sel = fila.querySelector('[data-rubro]');
    if (sel.value !== sel.dataset.original) memoria[normalizarComercio(c.comercio)] = sel.value;
    consumos.push({ ...c, monto: v, rubro: sel.value });
  }
  if (primerError) { primerError.focus(); return; }
  l.consumos = consumos;
  const destino = $id('rv-tarjeta').value || null;
  const r = importarResumen(datos, l, { tarjetaId: destino, nuevoId });
  datos = r.datos;
  datos.rubrosComercio = memoria;
  guardar();
  pendiente = null; tarjetaDestino = null;
  mes = r.mes;
  tarjetaVista = r.tarjetaId;
  pintarTodo();
  verVista('tarjeta');
  avisar(`Resumen guardado${r.cuotasNuevas ? ` · ${r.cuotasNuevas} cuota${r.cuotasNuevas === 1 ? '' : 's'} nueva${r.cuotasNuevas === 1 ? '' : 's'}` : ''}${r.conciliadas.length ? ` · ${r.conciliadas.length} compra${r.conciliadas.length === 1 ? '' : 's'} nueva${r.conciliadas.length === 1 ? '' : 's'} ya figura${r.conciliadas.length === 1 ? '' : 'n'}` : ''}`);
  dudasConcilia = [...r.dudosas];
  siguienteDuda();
}

/* ── conciliación con un toque: "¿es la misma compra?" ── */
let dudasConcilia = [];
function siguienteDuda() {
  const d = dudasConcilia[0];
  if (!d) return;
  $id('dq-txt').innerHTML = `Cargaste <b>${esc(d.descripcion)}</b>: ${esc(fm(d.total, d.moneda))}${d.cantidad > 1 ? ` en ${d.cantidad} cuotas` : ''}.<br>En el resumen aparece <b>${esc(d.comercio)}</b>: ${esc(fm(d.monto, d.moneda))}${d.cuota ? ` (cuota ${d.cuota.n}/${d.cuota.de})` : ''}.`;
  if (!$id('dlg-concilia').open) abrir($id('dlg-concilia'), $id('dlg-concilia').querySelector('[data-concilia="si"]'));
}
$id('dlg-concilia').addEventListener('click', e => {
  const b = e.target.closest('[data-concilia]');
  if (!b) return;
  const d = dudasConcilia.shift();
  if (b.dataset.concilia === 'si' && d) { datos.cuotas = datos.cuotas.filter(c => c.id !== d.cuotaId); guardar(); pintarTodo(); avisar('Listo: queda la del resumen'); }
  if (dudasConcilia.length) siguienteDuda(); else cerrar($id('dlg-concilia'));
});
$id('dlg-concilia').addEventListener('cancel', e => e.preventDefault());

/* ── subir PDF ── */
function abrirSubir(tarjetaId = null, { agregar = false } = {}) {
  tarjetaDestino = tarjetaId || null;
  const t = tarjetaDe(tarjetaDestino);
  $id('ds-tit').textContent = agregar ? 'Agregar tarjeta' : 'Subir resumen';
  $id('s-para').textContent = agregar ? 'Subí el último resumen en PDF. De ahí sacamos todo: banco, red, últimos 4, límite, fechas, saldo, cuotas y adicionales.'
    : t ? `Resumen de ${t.nombre}${t.ultimos4 ? ` ···${t.ultimos4}` : ''}.` : 'El resumen en PDF de una de tus tarjetas.';
  $id('s-manual').hidden = !agregar;
  $id('s-prueba').hidden = modoLectura !== 'prueba';
  abrir($id('dlg-subir'), $id('dlg-subir').querySelector('[type="submit"]'));
}
/* ¿la lectura es real o de prueba? Se pregunta una vez; sin servidor, prueba. */
let modoLectura = LOCAL ? 'prueba' : null;
if (!LOCAL) {
  fetch('/api/leer-resumen', { credentials: 'same-origin' })
    .then(r => (r.ok ? r.json() : { modo: null }))
    .then(j => { modoLectura = j?.modo || null; })
    .catch(() => { modoLectura = null; });   // sin red no hay "modo prueba": solo lo dice el servidor
}
$id('dlg-subir').querySelector('form').addEventListener('submit', e => {
  e.preventDefault();
  $id('archivo').value = '';
  $id('archivo').click();
  cerrar($id('dlg-subir'));
});
$id('archivo').addEventListener('change', async e => {
  const f = e.target.files?.[0];
  if (!f) return;
  if (f.size > MAX_PDF) return mostrarFalla('El PDF pesa más de 4 MB. Probá descargarlo de nuevo desde el banco o cargalo a mano.');
  if (!/pdf$/i.test(f.type) && !/\.pdf$/i.test(f.name)) return mostrarFalla('Ese archivo no es un PDF. Subí el resumen tal como lo descargás del banco.');
  $id('cargando').hidden = false;
  try {
    let json = null, errorRed = false, status = 0;
    if (LOCAL) await new Promise(r => setTimeout(r, 600));
    else {
      try {
        const res = await fetch('/api/leer-resumen', { method: 'POST', body: f, credentials: 'same-origin', headers: { 'Content-Type': 'application/octet-stream' } });
        status = res.status;
        json = await res.json().catch(() => null);
      } catch { errorRed = true; }
    }
    const d = decidirLectura({ local: LOCAL, errorRed, status, json });
    if (d.usar === 'falla') return mostrarFalla(d.mensaje);
    if (d.usar === 'ejemplo') json = { ok: true, lectura: resumenEjemplo() };
    const modo = d.modo;
    const v = validarLectura(json.lectura);
    if (!v.ok) return mostrarFalla(`No encontramos datos clave: ${v.errores.join(' ')} Preferimos que lo cargues a mano antes que inventar montos.`);
    pendiente = { estado: v.lectura.confianza === 'alta' ? 'ok' : 'dudosa', lectura: v.lectura, modo,
      mensaje: 'Parte del resumen no se leyó con seguridad. Podés revisarlo línea por línea contra tu PDF, o cargarlo a mano.' };
    /* rubros que la persona ya corrigió antes */
    for (const c of pendiente.lectura.consumos) c.rubro = rubroPara(c.comercio, c.rubro, datos.rubrosComercio);
    pintarRevisar();
    verVista('revisar');
  } finally {
    $id('cargando').hidden = true;
  }
});
function mostrarFalla(mensaje) {
  $id('cargando').hidden = true;
  pendiente = { estado: 'falla', mensaje };
  pintarRevisar();
  verVista('revisar');
}

/* ════════ navegación ════════ */
function pintarTodo(animar) {
  pintarInicio(animar);
  pintarTarjetas();
  if (tarjetaVista) pintarUna();
  pintarCargado();
  if (vista === 'escalera') pintarEscalera();
  if (vista === 'simular') pintarSimular();
}
function irAMes(nuevo) {
  if (difMeses(nuevo, HOY) > ATRAS || difMeses(HOY, nuevo) > ADELANTE) return;
  mes = nuevo;
  pintarInicio(true);
  pintarTarjetas();
  if (vista === 'tarjeta') pintarUna();
}
$id('mes-ant').addEventListener('click', () => irAMes(sumarMeses(mes, -1)));
$id('mes-sig').addEventListener('click', () => irAMes(sumarMeses(mes, 1)));

const VISTAS = ['inicio', 'tarjetas', 'tarjeta', 'cargado', 'revisar', 'escalera', 'contado', 'simular'];
const TITULOS = { tarjetas: 't-tarjetas', tarjeta: 't-una', cargado: 't-cargado', revisar: 't-revisar', escalera: 't-escalera', contado: 't-contado', simular: 't-simular' };
function verVista(v, { foco = true } = {}) {
  vista = v;
  const nav = v === 'tarjeta' ? 'tarjetas' : ['tarjetas', 'cargado', 'inicio'].includes(v) ? v : '';
  for (const b of document.querySelectorAll('[data-vista]')) {
    if (b.dataset.vista === nav) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  }
  for (const x of VISTAS) $id(`vista-${x}`).hidden = x !== v;
  if (v === 'tarjeta') pintarUna();
  if (v === 'escalera') pintarEscalera();
  if (v === 'contado') pintarContado(true);
  if (v === 'simular') pintarSimular(true);
  try { history.replaceState(null, '', v === 'inicio' ? location.pathname : `#${v}`); } catch {}
  window.scrollTo({ top: 0, behavior: 'instant' });
  if (foco && v !== 'inicio') $id(TITULOS[v])?.focus();
}
document.querySelector('.mm-nav').addEventListener('click', e => {
  const b = e.target.closest('[data-vista]');
  if (b) verVista(b.dataset.vista);
});
document.addEventListener('keydown', e => {
  if (vista !== 'inicio' || document.querySelector('dialog[open]')) return;
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
const cerrar = dlg => dlg.close();
for (const dlg of document.querySelectorAll('dialog')) {
  /* el foco vuelve a donde estaba; si ese botón se volvió a pintar, al mismo
     ítem en la vista visible, y si se borró, al título de la vista */
  dlg.addEventListener('close', () => {
    let destino = abiertoDesde;
    if (!destino?.isConnected) {
      const id = abiertoDesde?.dataset?.id;
      destino = (id && document.querySelector(`#vista-${vista} [data-id="${CSS.escape(id)}"]`)) ||
        (vista === 'inicio' ? $id('accion-principal') : $id(TITULOS[vista]));
    }
    destino?.focus?.();
  });
  dlg.addEventListener('click', e => {
    if (e.target.closest('[data-cerrar]') || e.target === dlg) cerrar(dlg);
  });
}
function error(input, errEl, texto) { input.setAttribute('aria-invalid', 'true'); $id(errEl).textContent = texto; return input; }
function limpiarError(input, errEl) { input.removeAttribute('aria-invalid'); $id(errEl).textContent = ''; }
function armarBorrar(btn, texto, alBorrar, confirmar = '¿Seguro? Tocá de nuevo') {
  let t;
  btn.onclick = () => {
    if (btn.dataset.confirmar) { clearTimeout(t); alBorrar(); return; }
    btn.dataset.confirmar = '1';
    btn.textContent = confirmar;
    t = setTimeout(() => { delete btn.dataset.confirmar; btn.textContent = texto; }, 5000);
  };
  delete btn.dataset.confirmar;
  btn.textContent = texto;
}
for (const id of ['c-total', 'i-monto', 'g-monto', 't-limite']) {
  $id(id).addEventListener('blur', e => {
    const c = leerMonto(e.target.value);
    if (c !== null && c > 0) e.target.value = sinSimbolo(c, 'ARS');
  });
}

/* ── cuota ── */
const dc = $id('dlg-cuota');
let editCuota = null, tarjetaElegida = null;
const monedaCuota = () => dc.querySelector('[name="moneda"]:checked')?.value || 'ARS';
function pintarTarjetasCuota() {
  const cont = $id('c-tarjetas');
  cont.innerHTML = datos.tarjetas.map(t => `<label class="mm-chip"><input type="radio" name="tarjeta" value="${esc(t.id)}"${t.id === tarjetaElegida ? ' checked' : ''}><span>${esc(t.nombre)}</span></label>`).join('') +
    `<button type="button" class="mm-chip" data-agregar-tarjeta>+ Agregar tarjeta</button>`;
}
$id('c-tarjetas').addEventListener('change', e => {
  tarjetaElegida = e.target.value;
  $id('c-tarj-err').textContent = '';
  if (!mesTocado) { opcionesMes($id('c-mes'), sumarMeses(HOY, -24), sumarMeses(HOY, 24), primerMesDeCompra(datos, tarjetaElegida, HOY_ISO)); textoMesCompra(); previewCuota(); }
});
let mesTocado = false;
const textoMesCompra = () => { $id('c-mes-txt').textContent = `Primera cuota: ${capital(nombreMes($id('c-mes').value))} · cambiar`; };
$id('c-mes').addEventListener('change', () => { mesTocado = true; textoMesCompra(); });
function marcarCantRapida() {
  const v = $id('c-cant').value;
  for (const b of dc.querySelectorAll('[data-cant]')) b.setAttribute('aria-pressed', String(b.dataset.cant === v));
}
$id('c-cant-rapidas').addEventListener('click', e => {
  const b = e.target.closest('[data-cant]');
  if (!b) return;
  $id('c-cant').value = b.dataset.cant;
  limpiarError($id('c-cant'), 'c-cant-err');
  marcarCantRapida(); previewCuota();
});
$id('c-moneda').addEventListener('change', () => {
  $id('c-total').placeholder = monedaCuota() === 'ARS' ? 'Ej: 120.000' : 'Ej: 300';
  previewCuota();
});
for (const id of ['c-total', 'c-cant', 'c-mes']) $id(id).addEventListener('input', () => { marcarCantRapida(); previewCuota(); });
function leerCant() { const n = Number($id('c-cant').value); return Number.isInteger(n) && n >= 1 && n <= 72 ? n : null; }
function previewCuota() {
  const total = leerMonto($id('c-total').value);
  const n = leerCant();
  const m = monedaCuota();
  const p = $id('c-preview');
  if (!total || !n) { p.textContent = ''; return; }
  const cs = repartirCuotas(total, n);
  const primer = $id('c-mes').value;
  const fin = sumarMeses(primer, n - 1);
  let txt;
  if (n === 1) txt = `1 pago de ${fm(total, m, { centavos: true })} en ${corto(primer)}`;
  else if (cs[0] === cs[1]) txt = `${n} cuotas de ${fm(cs[1], m, { centavos: true })} · ${corto(primer)} → ${corto(fin)}`;
  else txt = `1ª de ${fm(cs[0], m, { centavos: true })} y ${n - 1} de ${fm(cs[1], m, { centavos: true })} · ${corto(primer)} → ${corto(fin)}`;
  if (m !== 'ARS') {
    const ars = aPesos(cs[cs.length - 1], m, datos, { percepcion: true });
    txt += ars === null ? ' · falta el tipo de cambio' : ` · ≈ ${$(ars)} por cuota (oficial + 30 % de percepción)`;
  }
  const k = numeroDeCuota({ primerMes: primer, cantidad: n }, HOY);
  if (k > 1) txt += ` · este mes pagás la ${k}/${n}`;
  p.textContent = txt;
}
function abrirCuota(id = null, tarjetaId = null) {
  editCuota = id;
  const c = id ? datos.cuotas.find(x => x.id === id) : null;
  const m = c?.moneda || 'ARS';
  dc.querySelector(`[name="moneda"][value="${m}"]`).checked = true;
  $id('c-total').value = c ? sinSimbolo(c.total, m) : '';
  $id('c-cant').value = c ? c.cantidad : '';
  $id('c-desc').value = c?.descripcion || '';
  if (!c && !datos.tarjetas.length) { avisar('Primero agregá tu tarjeta subiendo el último resumen'); return abrirSubir(null, { agregar: true }); }
  const ultima = [...datos.cuotas].reverse().find(x => x.origen === 'manual')?.tarjetaId;
  tarjetaElegida = c ? c.tarjetaId : (tarjetaId || ultima || datos.tarjetas[0]?.id || '');
  if (tarjetaElegida && !tarjetaDe(tarjetaElegida)) tarjetaElegida = datos.tarjetas[0]?.id || '';
  pintarTarjetasCuota();
  mesTocado = !!c;
  $id('dc-tit').textContent = c ? (c.origen === 'resumen' ? 'Editar cuota' : 'Editar compra') : 'Compra nueva';
  $id('c-intro').hidden = !!c;
  const primer = c ? c.primerMes : primerMesDeCompra(datos, tarjetaElegida, HOY_ISO);
  const desde = difMeses(primer, sumarMeses(HOY, -24)) > 0 ? primer : sumarMeses(HOY, -24);
  opcionesMes($id('c-mes'), desde, sumarMeses(HOY, 24), primer);
  $id('c-borrar').hidden = !c;
  if (c) armarBorrar($id('c-borrar'), 'Borrar', () => {
    datos.cuotas = datos.cuotas.filter(x => x.id !== id);
    guardar(); pintarTodo(); cerrar(dc); avisar('Cuota borrada');
  });
  textoMesCompra();
  $id('c-mes-wrap').open = false;
  marcarCantRapida(); previewCuota();
  abrir(dc, $id('c-total'));
}
dc.querySelector('form').addEventListener('submit', e => {
  e.preventDefault();
  const fallas = [];
  const total = leerMonto($id('c-total').value);
  if (!total) fallas.push(error($id('c-total'), 'c-total-err', 'Escribí el monto total, por ejemplo 120.000 (los centavos van con coma).'));
  else limpiarError($id('c-total'), 'c-total-err');
  const n = leerCant();
  if (!n) fallas.push(error($id('c-cant'), 'c-cant-err', 'Elegí cuántas cuotas (de 1 a 72).'));
  else limpiarError($id('c-cant'), 'c-cant-err');
  const tarjetaId = tarjetaElegida;
  if (!tarjetaId) { $id('c-tarj-err').textContent = 'Elegí la tarjeta.'; fallas.push(dc.querySelector('[name="tarjeta"]') || $id('c-total')); }
  if (fallas.length) { fallas[0].focus(); return; }
  const previa = editCuota ? datos.cuotas.find(x => x.id === editCuota) : null;
  const cuota = { id: editCuota || nuevoId(), descripcion: $id('c-desc').value.trim().slice(0, 60),
    total, moneda: monedaCuota(), cantidad: n, tarjetaId, primerMes: $id('c-mes').value,
    origen: previa?.origen || 'manual', fecha: previa?.fecha || HOY_ISO };
  if (editCuota) datos.cuotas = datos.cuotas.map(x => (x.id === editCuota ? cuota : x));
  else datos.cuotas.push(cuota);
  guardar(); pintarTodo(); cerrar(dc);
  avisar(editCuota ? 'Actualizado' : 'Compra nueva cargada: cuenta en lo que debés hasta que llegue el resumen');
});

/* ── ingreso ── */
const di = $id('dlg-ingreso');
let editIngreso = null;
function abrirIngreso(id = null) {
  editIngreso = id;
  const x = id ? datos.ingresos.find(i => i.id === id) : null;
  $id('di-tit').textContent = x ? 'Editar ingreso' : 'Nuevo ingreso';
  $id('i-monto').value = x ? sinSimbolo(x.monto, 'ARS') : '';
  const tipo = x ? (TIPOS_INGRESO.includes(x.nombre) ? x.nombre : 'Otro') : (datos.ingresos.some(i => i.nombre === 'Sueldo') ? 'Extra' : 'Sueldo');
  $id('i-tipos').innerHTML = TIPOS_INGRESO.map(t => `<label class="mm-chip"><input type="radio" name="i-tipo" value="${esc(t)}"${t === tipo ? ' checked' : ''}><span>${esc(t)}</span></label>`).join('');
  nombreIngresoPrevio = x?.nombre || '';
  $id('i-repite').checked = x ? x.repite : true;
  const desde = x ? x.desde : mes;
  opcionesMes($id('i-desde'), difMeses(desde, sumarMeses(HOY, -12)) > 0 ? desde : sumarMeses(HOY, -12), sumarMeses(HOY, ADELANTE), desde);
  etiquetaDesde('i');
  $id('i-borrar').hidden = !x;
  if (x) armarBorrar($id('i-borrar'), 'Borrar', () => {
    datos.ingresos = datos.ingresos.filter(i => i.id !== id);
    guardar(); pintarTodo(); cerrar(di); avisar('Ingreso borrado');
  });
  abrir(di, $id('i-monto'));
}
function etiquetaDesde(p) {
  const repite = $id(`${p}-repite`).checked;
  $id(`${p}-desde-lbl`).textContent = repite ? 'Desde' : 'Mes';
  if (p === 'g') { $id('g-hasta-wrap').hidden = !repite; $id('g-monto-lbl').textContent = repite ? 'Monto por mes, en pesos' : 'Monto, en pesos'; }
  /* un solo mes: el mes se elige con chips (los próximos 12), sin escribir */
  $id(`${p}-meses-wrap`).hidden = repite;
  $id(`${p}-desde-wrap`).hidden = !repite;
  if (!repite) pintarMesesChips(p);
}
function pintarMesesChips(p) {
  const sel = $id(`${p}-desde`);
  if (difMeses(HOY, sel.value) < 0 || difMeses(HOY, sel.value) > 11) sel.value = HOY;
  $id(`${p}-meses`).innerHTML = Array.from({ length: 12 }, (_, k) => sumarMeses(HOY, k)).map(m =>
    `<label class="mm-chip"><input type="radio" name="${p}-mes" value="${m}"${m === sel.value ? ' checked' : ''}><span>${esc(corto(m))}</span></label>`).join('');
}
for (const p of ['i', 'g']) $id(`${p}-meses`).addEventListener('change', e => { $id(`${p}-desde`).value = e.target.value; });
$id('i-repite').addEventListener('change', () => etiquetaDesde('i'));
const TIPOS_INGRESO = ['Sueldo', 'Extra', 'Aguinaldo', 'Alquiler que cobro', 'Otro'];
let nombreIngresoPrevio = '';
$id('i-tipos').addEventListener('change', e => {
  if (e.target.value === 'Aguinaldo') { $id('i-repite').checked = false; $id('i-desde').value = mesAguinaldo(HOY); etiquetaDesde('i'); }
});
di.querySelector('form').addEventListener('submit', e => {
  e.preventDefault();
  const monto = leerMonto($id('i-monto').value);
  if (!monto) { error($id('i-monto'), 'i-monto-err', 'Escribí el monto, por ejemplo 1.200.000 (los centavos van con coma).').focus(); return; }
  const primero = !datos.ingresos.length;
  const tipoElegido = di.querySelector('[name="i-tipo"]:checked')?.value || (primero ? 'Sueldo' : 'Otro');
  const nombre = tipoElegido === 'Otro' ? (nombreIngresoPrevio && !TIPOS_INGRESO.includes(nombreIngresoPrevio) ? nombreIngresoPrevio : 'Otro ingreso') : tipoElegido;
  const x = { id: editIngreso || nuevoId(), nombre,
    monto, repite: $id('i-repite').checked, desde: $id('i-desde').value };
  if (editIngreso) datos.ingresos = datos.ingresos.map(i => (i.id === editIngreso ? x : i));
  else datos.ingresos.push(x);
  guardar(); pintarTodo(); cerrar(di);
  avisar(editIngreso ? 'Ingreso actualizado' : 'Ingreso cargado');
});

/* ── gasto fijo ── */
const dg = $id('dlg-gasto');
let editGasto = null, catElegida = CATEGORIAS[0], nombreGastoPrevio = null;
function pintarCats() {
  $id('g-cats').innerHTML = CATEGORIAS.map(c => `<label class="mm-chip"><input type="radio" name="cat" value="${esc(c)}"${c === catElegida ? ' checked' : ''}><span>${esc(c)}</span></label>`).join('');
}
$id('g-cats').addEventListener('change', e => { catElegida = e.target.value; unMesElegido = null; pintarUnMes(); });
let unMesElegido = null;
function pintarUnMes() {
  $id('g-unmes').innerHTML = GASTOS_UN_MES.map(g => `<label class="mm-chip"><input type="radio" name="g-unmes" value="${esc(g.nombre)}"${unMesElegido?.nombre === g.nombre ? ' checked' : ''}><span>${esc(g.nombre)}</span></label>`).join('');
}
$id('g-unmes').addEventListener('change', e => {
  unMesElegido = GASTOS_UN_MES.find(g => g.nombre === e.target.value) || null;
  if (!unMesElegido) return;
  catElegida = unMesElegido.categoria;
  pintarCats();
  $id('g-repite').checked = false;
  etiquetaDesde('g');
});
const opcionesHasta = (desde, elegido) => opcionesMes($id('g-hasta'), desde, sumarMeses(HOY, ADELANTE), elegido || '', 'Sin fecha de fin');
function abrirGasto(id = null) {
  editGasto = id;
  const x = id ? datos.gastos.find(g => g.id === id) : null;
  $id('dg-tit').textContent = x ? 'Editar gasto fijo' : 'Nuevo gasto fijo';
  const usadas = new Set(datos.gastos.map(g => g.categoria));
  catElegida = x ? x.categoria : (['Alquiler', 'Expensas', 'Servicios', 'Suscripciones'].find(c => !usadas.has(c)) || 'Otros');
  pintarCats();
  unMesElegido = x && !x.repite ? GASTOS_UN_MES.find(g => g.nombre === x.nombre) || null : null;
  pintarUnMes();
  $id('g-monto').value = x ? sinSimbolo(x.monto, 'ARS') : '';
  nombreGastoPrevio = x && x.nombre !== x.categoria ? { nombre: x.nombre, categoria: x.categoria } : null;
  $id('g-repite').checked = x ? x.repite : true;
  const desde = x ? x.desde : mes;
  opcionesMes($id('g-desde'), difMeses(desde, sumarMeses(HOY, -12)) > 0 ? desde : sumarMeses(HOY, -12), sumarMeses(HOY, ADELANTE), desde);
  opcionesHasta(desde, x?.hasta);
  etiquetaDesde('g');
  $id('g-borrar').hidden = !x;
  if (x) armarBorrar($id('g-borrar'), 'Borrar', () => {
    datos.gastos = datos.gastos.filter(g => g.id !== id);
    guardar(); pintarTodo(); cerrar(dg); avisar('Gasto borrado');
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
  const monto = leerMonto($id('g-monto').value);
  if (!monto) { error($id('g-monto'), 'g-monto-err', 'Escribí el monto, por ejemplo 450.000 (los centavos van con coma).').focus(); return; }
  const repite = $id('g-repite').checked;
  const hasta = repite ? $id('g-hasta').value : '';
  const x = { id: editGasto || nuevoId(), nombre: unMesElegido && unMesElegido.categoria === catElegida ? unMesElegido.nombre : nombreGastoPrevio && nombreGastoPrevio.categoria === catElegida ? nombreGastoPrevio.nombre : catElegida,
    categoria: catElegida, monto, repite, desde: $id('g-desde').value, ...(hasta ? { hasta } : {}) };
  if (editGasto) datos.gastos = datos.gastos.map(g => (g.id === editGasto ? x : g));
  else datos.gastos.push(x);
  guardar(); pintarTodo(); cerrar(dg);
  avisar(editGasto ? 'Gasto actualizado' : 'Gasto cargado');
});

/* ── tarjeta ── */
const dt = $id('dlg-tarjeta');
let editTarjeta = null;
function valoresTarjeta() {
  const red = dt.querySelector('[name="red"]:checked')?.value || 'Otra';
  const sel = $id('t-banco').value;
  const banco = sel === '__otro' ? $id('t-banco-otro').value.trim().slice(0, 40) : sel;
  const u4 = $id('t-u4').value.trim();
  const ultimos4 = /^\d{4}$/.test(u4) ? u4 : '';
  const nombre = nombreTarjeta({ banco, red, ultimos4 }, datos.tarjetas.filter(t => t.id !== editTarjeta));
  return { red, banco, ultimos4, nombre, color: dt.querySelector('[name="color"]:checked')?.value || 'azul' };
}
function opcionesBanco(actual) {
  const grupo = tipo => EMISORES.filter(e => e.tipo === tipo).map(e => `<option${e.nombre === actual ? ' selected' : ''}>${esc(e.nombre)}</option>`).join('');
  const conocido = !actual || EMISORES.some(e => e.nombre === actual);
  $id('t-banco').innerHTML = `<option value="">Elegí el banco o emisor</option><optgroup label="Bancos">${grupo('banco')}</optgroup>
    <optgroup label="Billeteras y tarjetas no bancarias">${grupo('no bancario')}</optgroup><option value="__otro"${conocido ? '' : ' selected'}>Otro</option>`;
  $id('t-banco-otro').hidden = conocido;
  $id('t-banco-otro').value = conocido ? '' : actual;
}
$id('t-banco').addEventListener('change', () => { $id('t-banco-otro').hidden = $id('t-banco').value !== '__otro'; if (!$id('t-banco-otro').hidden) $id('t-banco-otro').focus(); });
const previewTarjeta = () => { $id('t-prev').innerHTML = tcard({ id: '', ...valoresTarjeta() }, { boton: false }); };
dt.addEventListener('input', previewTarjeta);
dt.addEventListener('change', previewTarjeta);
function abrirTarjeta(id = null) {
  editTarjeta = id;
  const t = id ? tarjetaDe(id) : null;
  $id('dt-tit').textContent = t ? 'Editar tarjeta' : 'Agregar tarjeta a mano';
  $id('t-redes').innerHTML = REDES.map(r => `<label class="mm-chip"><input type="radio" name="red" value="${esc(r)}"${r === (t?.red || 'Visa') ? ' checked' : ''}><span>${esc(r)}</span></label>`).join('');
  $id('t-colores').innerHTML = COLORES.map(c => `<label class="mm-color ${c}"><input type="radio" name="color" value="${c}"${c === (t?.color || colorLibre()) ? ' checked' : ''} aria-label="${c}"></label>`).join('');
  opcionesBanco(t?.banco || '');
  $id('t-u4').value = t?.ultimos4 || '';
  $id('t-limite').value = t?.limite ? sinSimbolo(t.limite, 'ARS') : '';
  $id('t-cierre').value = t?.diaCierre || '';
  $id('t-vence').value = t?.diaVence || '';
  $id('t-borrar').hidden = !t;
  if (t) {
    const nc = datos.cuotas.filter(c => c.tarjetaId === id).length;
    const nr = datos.resumenes.filter(r => r.tarjetaId === id).length;
    const que = [nc ? `${nc} cuota${nc === 1 ? '' : 's'}` : '', nr ? `${nr} resumen${nr === 1 ? '' : 'es'}` : ''].filter(Boolean).join(' y ');
    armarBorrar($id('t-borrar'), 'Borrar tarjeta', () => {
      datos.tarjetas = datos.tarjetas.filter(x => x.id !== id);
      datos.cuotas = datos.cuotas.filter(c => c.tarjetaId !== id);
      datos.resumenes = datos.resumenes.filter(r => r.tarjetaId !== id);
      tarjetaVista = null;
      guardar(); cerrar(dt); pintarTodo(); verVista('tarjetas'); avisar('Tarjeta borrada');
    }, que ? `¿Seguro? Se borran ${que}` : '¿Seguro? Tocá de nuevo');
  }
  previewTarjeta();
  abrir(dt, dt.querySelector('[name="red"]:checked'));
}
dt.querySelector('form').addEventListener('submit', e => {
  e.preventDefault();
  const bancoElegido = $id('t-banco').value === '__otro' ? $id('t-banco-otro').value.trim() : $id('t-banco').value;
  if (!bancoElegido) { error($id('t-banco').value === '__otro' ? $id('t-banco-otro') : $id('t-banco'), 't-banco-err', 'Elegí el banco o emisor de la lista.').focus(); return; }
  $id('t-banco-err').textContent = '';
  const u4 = $id('t-u4').value.trim();
  if (u4 && !/^\d{4}$/.test(u4)) { error($id('t-u4'), 't-u4-err', 'Son los últimos 4 números, solo dígitos.').focus(); return; }
  limpiarError($id('t-u4'), 't-u4-err');
  const limTxt = $id('t-limite').value.trim();
  const limite = limTxt ? leerMonto(limTxt) : null;
  if (limTxt && !limite) { error($id('t-limite'), 't-limite-err', 'Revisá el límite (los centavos van con coma), o dejalo vacío.').focus(); return; }
  limpiarError($id('t-limite'), 't-limite-err');
  const leerDia = id => { const x = $id(id).value.trim(); if (!x) return null; const n = Number(x); return Number.isInteger(n) && n >= 1 && n <= 31 ? n : NaN; };
  const diaCierre = leerDia('t-cierre'), diaVence = leerDia('t-vence');
  if (Number.isNaN(diaCierre) || Number.isNaN(diaVence) || (diaCierre === null) !== (diaVence === null)) {
    error($id(Number.isNaN(diaVence) || (diaCierre !== null && diaVence === null) ? 't-vence' : 't-cierre'), 't-dias-err', 'Cargá los dos días (de 1 a 31), o dejá los dos vacíos.').focus(); return;
  }
  $id('t-dias-err').textContent = '';
  const dias = diaCierre ? { diaCierre, diaVence } : {};
  const v = { ...valoresTarjeta(), ...dias };
  if (editTarjeta) {
    datos.tarjetas = datos.tarjetas.map(t => (t.id === editTarjeta ? { id: t.id, ...v, ...(limite ? { limite } : {}) } : t));
  } else {
    const id = nuevoId();
    datos.tarjetas.push({ id, ...v, ...(limite ? { limite } : {}) });
    tarjetaVista = id;
  }
  guardar(); cerrar(dt); pintarTodo();
  if (!editTarjeta) verVista('tarjeta');
  avisar(editTarjeta ? 'Tarjeta actualizada' : 'Tarjeta agregada');
});

/* ── tipo de cambio ── */
const dx = $id('dlg-cambio');
function monedasEnUso() {
  const s = new Set(['USD', 'EUR']);
  for (const c of datos.cuotas) if (c.moneda !== 'ARS') s.add(c.moneda);
  for (const r of datos.resumenes) { Object.keys(r.totales).forEach(m => s.add(m)); r.consumos.forEach(c => s.add(c.moneda)); }
  s.delete('ARS');
  return [...s];
}
function abrirCambio() {
  pintarCambio();
  abrir(dx, dx.querySelector('input'));
}
function pintarCambio() {
  $id('x-filas').innerHTML = monedasEnUso().map(m => {
    const c = cambioDe(datos, m);
    const def = CAMBIO_DEFECTO[m];
    const propio = !!datos.cambio[m];
    return `<div class="mm-xfila">
      <label for="x-${m}"><b>1 ${esc(MONEDAS[m].simbolo)} (${esc(MONEDAS[m].nombre)})</b> en pesos</label>
      <div class="mm-monto-fila"><span aria-hidden="true">$</span><input id="x-${m}" data-moneda="${m}" class="mm-grande" type="text" inputmode="decimal" autocomplete="off" value="${c ? esc(sinSimbolo(c.valor, 'ARS')) : ''}" placeholder="Sin cargar" aria-describedby="x-${m}-f x-${m}-err" style="flex:1;min-height:50px;border:1.5px solid #CFCAC0;border-radius:12px;padding:0 14px;font:inherit"></div>
      <p class="mm-fuente" id="x-${m}-f">${c ? (propio ? `Lo cargaste vos${c.fecha ? ` el ${esc(fechaCorta(c.fecha))}` : ''}.` : `Por defecto: ${fuenteHTML(c)}`) : 'No tenemos un valor de referencia para esta moneda: cargalo vos.'}
        ${propio && def ? ` <button type="button" class="mm-link" data-defecto="${m}">Volver al valor de referencia</button>` : ''}</p>
      <p class="mm-err" id="x-${m}-err"></p></div>`;
  }).join('');
}
dx.addEventListener('click', e => {
  const b = e.target.closest('[data-defecto]');
  if (!b) return;
  delete datos.cambio[b.dataset.defecto];
  guardar(); pintarTodo(); pintarCambio(); dx.querySelector(`#x-${b.dataset.defecto}`)?.focus();
});
dx.querySelector('form').addEventListener('submit', e => {
  e.preventDefault();
  for (const input of dx.querySelectorAll('[data-moneda]')) {
    const m = input.dataset.moneda;
    const txt = input.value.trim();
    if (!txt) { delete datos.cambio[m]; continue; }
    const v = leerMonto(txt);
    if (!v) { error(input, `x-${m}-err`, 'Revisá este valor (los centavos van con coma).').focus(); return; }
    const actual = cambioDe(datos, m);
    if (actual && actual.valor === v) continue;          // no lo tocó
    datos.cambio[m] = { valor: v, fuente: 'Lo cargaste vos', fecha: hoyISO() };
  }
  guardar(); pintarTodo(); if (vista === 'revisar') pintarRevisar(); cerrar(dx); avisar('Tipo de cambio guardado');
});


/* ════════ AVISOS (alertas de tarjeta) ════════ */
/* Texto corto de una alerta (una línea), para la franja y las filas. */
function alertaCorta(a) {
  const t = tarjetaDe(a.tarjetaId);
  const n = t?.nombre || 'tu tarjeta';
  if (a.tipo === 'credito') return `${capital(nombreMes(a.mes).split(' ')[0])}: debés más de lo que tenés`;
  if (a.tipo === 'vence') return `${a.dias === 0 ? 'Vence hoy' : a.dias === 1 ? 'Vence mañana' : `Vence en ${a.dias} días`}: ${n}`;
  if (a.tipo === 'cierre') return `Cerró ${n}`;
  if (a.tipo === 'dolares') return `${fm(a.usd, 'USD')} en ${n}`;
  return a.titulo;
}
/* color fuerte solo para vence hoy/mañana y para crédito > líquido */
const nivelVisual = a => (a.tipo === 'credito' || (a.tipo === 'vence' && a.dias <= 1) ? 'fuerte' : 'suave');
const iconoAlerta = a => (a.tipo === 'dolares' ? 'dolar' : a.tipo === 'cierre' ? 'calendario' : 'alerta');
/* Una fila compacta que se abre para ver el detalle y las acciones. */
function alertaHTML(a, { descartable = false } = {}) {
  const t = tarjetaDe(a.tarjetaId);
  const acciones = a.tipo === 'credito'
    ? `<button type="button" class="mm-link" data-ir="escalera">Ver mes a mes</button><button type="button" class="mm-link" data-ir="simular">¿Y si dejo de comprar?</button>`
    : `${descartable && t ? `<button type="button" class="mm-link" data-ir-tarjeta="${esc(t.id)}">Ver ${esc(t.nombre)}</button>` : ''}<button type="button" class="mm-link" data-ics="${esc(a.tarjetaId)}">${ic('calendario')} Agregar al calendario</button>`;
  return `<details class="mm-fila-alerta ${nivelVisual(a)}">
    <summary><span class="mm-fa-ic">${ic(iconoAlerta(a))}</span><span class="mm-fa-txt">${esc(alertaCorta(a))}</span><svg class="ic mm-fa-flecha"><use href="#i-der"/></svg></summary>
    <div class="mm-fa-det"><p><b>${esc(a.titulo)}</b></p><p>${esc(a.texto)}</p>
      ${a.tipo === 'dolares' ? '<p class="mm-fuente">Orientativo, no es asesoramiento: depende de tu banco. Se paga entre la emisión del resumen y el vencimiento; con débito automático, puede hacer falta frenarlo. Si la percepción ya se cobró, en el resumen siguiente aparece devuelta como "DEV.IMP. RG 5617".</p>' : ''}
      <div class="mm-fa-acc">${acciones}${descartable ? `<button type="button" class="mm-link" data-descartar-alerta="${esc(a.id)}">Descartar</button>` : ''}</div></div>
  </details>`;
}
function pintarAlertas() {
  const as = [...alertasCredito(datos, HOY_ISO), ...alertasTarjetas(datos, HOY_ISO)];
  const caja = $id('alertas');
  caja.hidden = !as.length;
  if (!as.length) { caja.innerHTML = ''; return; }
  /* la más urgente arriba: crédito > líquido y vence hoy/mañana primero */
  const orden = a => (nivelVisual(a) === 'fuerte' ? 0 : 1);
  as.sort((a, b) => orden(a) - orden(b));
  const top = as[0];
  caja.innerHTML = `<button type="button" class="mm-franja ${nivelVisual(top)}" data-franja aria-expanded="${alertasAbiertas}" aria-controls="alertas-lista">
      <span class="mm-fa-ic">${ic(iconoAlerta(top))}</span><span class="mm-fa-txt">${esc(alertaCorta(top))}</span>
      ${as.length > 1 ? `<span class="mm-franja-mas" aria-label="${as.length - 1} avisos más">+${as.length - 1}</span>` : ''}<svg class="ic mm-fa-flecha"><use href="#i-der"/></svg></button>
    <div class="mm-alertas-lista" id="alertas-lista" ${alertasAbiertas ? '' : 'hidden'}>${as.map(a => alertaHTML(a, { descartable: true })).join('')}</div>`;
}
let alertasAbiertas = false;
function bajarICS(tarjetaId) {
  const ev = eventosTarjeta(datos, tarjetaId, HOY_ISO);
  if (!ev.length) return avisar('Cargá los días de cierre y vencimiento de esta tarjeta primero.');
  const t = tarjetaDe(tarjetaId);
  bajarArchivo(generarICS(ev), `mi-mes-${normalizarComercio(t?.nombre || 'tarjeta').toLowerCase().replace(/ /g, '-') || 'tarjeta'}.ics`, 'text/calendar');
  avisar('Abrí el archivo para sumarlo a tu calendario');
}
function bajarArchivo(contenido, nombre, tipo) {
  const url = URL.createObjectURL(new Blob([contenido], { type: `${tipo};charset=utf-8` }));
  const a = Object.assign(document.createElement('a'), { href: url, download: nombre });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* ════════ ESCALERA ════════ */
function pintarEscalera() {
  const e = escalera(datos, HOY, 18);
  const ultimaConCuotas = e.filas.reduce((u, f, i) => (f.total > 0 ? i : u), -1);
  const filas = e.filas.slice(0, Math.max(6, ultimaConCuotas + 2));
  const max = Math.max(1, ...filas.map(f => Math.max(f.total, f.tope || 0)));
  const usadas = datos.tarjetas.filter(t => filas.some(f => f.porTarjeta[t.id]));
  const pasados = filas.filter(f => f.supera).length;
  $id('esc-libre').innerHTML = !datos.cuotas.length
    ? `<p class="mm-vacio"><b>No tenés cuotas cargadas.</b> Cuando cargues una compra en cuotas o subas un resumen, acá ves mes a mes cuánto está comprometido.</p><button type="button" class="mm-btn" data-nuevo="cuota">Cargar una cuota</button>`
    : `<p class="mm-item-meta">Quedás libre de cuotas en</p><p class="mm-total-num">${esc(capital(nombreMes(e.mesLibre)))}</p>
       ${(() => { const l = proximaLiberacion(datos, HOY); return l ? `<p class="mm-libera-esc">En ${esc(nombreMes(l.mes))} se te liberan <b>${esc($(l.libera))}</b> por mes.</p>` : ''; })()}
       <p class="${pasados ? 'mm-err' : 'mm-fuente'}">${pasados ? `${pasados === 1 ? 'Un mes pasa' : `${pasados} meses pasan`} tu tope de ${datos.limiteCuotas} % de los ingresos.` : `Ningún mes pasa tu tope de ${datos.limiteCuotas} % de los ingresos.`}</p>`;
  $id('tope-pct').value = datos.limiteCuotas;
  $id('esc-leyenda').innerHTML = usadas.map(t => `<span><i class="${esc(t.color)}"></i>${esc(t.nombre)}</span>`).join('') + (filas.some(f => f.tope) ? '<span><i class="tope"></i>Tu tope</span>' : '');
  $id('esc').innerHTML = filas.map(f => `<li class="${f.supera ? 'pasa' : ''}">
    <span class="esc-mes">${esc(corto(f.mes))}</span>
    <span class="esc-barra" role="img" aria-label="${esc(`${nombreMes(f.mes)}: ${$(f.total)} en cuotas${f.tope ? `, tope ${$(f.tope)}` : ''}${f.supera ? ', se pasa del tope' : ''}`)}">
      ${usadas.map(t => f.porTarjeta[t.id] ? `<i class="${esc(t.color)}" style="width:${(f.porTarjeta[t.id] / max) * 100}%"></i>` : '').join('')}
      ${f.tope ? `<b class="esc-tope" style="left:${Math.min(100, (f.tope / max) * 100)}%"></b>` : ''}
    </span>
    <span class="esc-monto">${esc($(f.total))}${f.supera ? '<small>Te pasás</small>' : ''}${(() => { const i = filas.indexOf(f); const libera = i > 0 ? filas[i - 1].total - f.total : 0; return libera > 0 ? `<small class="libera">se te liberan ${esc($(libera))}</small>` : ''; })()}${f.delBanco.length ? '<small class="banco">según el banco</small>' : ''}</span></li>`).join('') +
    (e.diferencias.length ? `<li class="esc-dif"><p class="mm-fuente">${ic('alerta')} En ${e.diferencias.length === 1 ? 'un mes' : `${e.diferencias.length} meses`} la tabla del banco no coincide con lo que proyecta la app (por ejemplo ${esc(corto(e.diferencias[0].mes))}: banco ${esc($(e.diferencias[0].banco))}, app ${esc($(e.diferencias[0].propio))}). Usamos la del banco; si falta cargar alguna cuota, sumala.</p></li>` : '');
}
$id('tope-form').addEventListener('submit', e => {
  e.preventDefault();
  const n = Number($id('tope-pct').value);
  if (!Number.isInteger(n) || n < 1 || n > 100) { error($id('tope-pct'), 'tope-err', 'Poné un número entre 1 y 100.').focus(); return; }
  limpiarError($id('tope-pct'), 'tope-err');
  datos.limiteCuotas = n;
  guardar(); pintarTodo(); pintarEscalera(); avisar(`Tope guardado: ${n} %`);
});

/* ════════ ¿CUOTAS O CONTADO? ════════ */
const numero = txt => { const v = Number(String(txt).replace(',', '.').replace(/[^\d.]/g, '')); return String(txt).trim() !== '' && Number.isFinite(v) ? v : null; };
const pctTxt = v => String(Math.round(v * 100) / 100).replace('.', ',');
function pintarContado(cargarSupuestos = false) {
  const inf = supuesto(datos, 'inflacion'), ren = supuesto(datos, 'rendimiento');
  if (cargarSupuestos) { $id('cc-inf').value = pctTxt(inf.valor); $id('cc-ren').value = pctTxt(ren.valor); }
  $id('cc-inf-f').innerHTML = fuenteHTML(inf);
  $id('cc-ren-f').innerHTML = fuenteHTML(ren);
  for (const b of document.querySelectorAll('[data-cc]')) b.setAttribute('aria-pressed', String(b.dataset.cc === $id('cc-cant').value));
  const precio = leerMonto($id('cc-precio').value);
  const n = Number($id('cc-cant').value);
  const desc = numero($id('cc-desc').value) ?? 0;
  const pi = numero($id('cc-inf').value), r = numero($id('cc-ren').value);
  const res = $id('cc-res');
  if (!precio || !Number.isInteger(n) || n < 1 || n > 72 || pi === null || r === null || desc < 0 || desc >= 100) {
    res.innerHTML = `<p class="mm-vacio"><b>Cargá el precio y las cuotas</b> y te decimos qué conviene, con la cuenta a la vista.</p>`;
    return;
  }
  const c = cuotasOContado({ precioCuotas: precio, descuentoContado: desc, cuotas: n, inflacion: pi, rendimiento: r });
  const titulo = { cuotas: 'Conviene en cuotas', contado: 'Conviene de contado', 'da igual': 'Da prácticamente igual' }[c.conviene];
  const cual = c.tasaUsada === 'rendimiento' ? `lo que rinde tu plata (${pctTxt(c.tasa)} % por mes)` : `la inflación (${pctTxt(c.tasa)} % por mes)`;
  res.innerHTML = `<p class="mm-item-meta">Con estos supuestos</p><p class="mm-veredicto-tit ${c.conviene === 'contado' ? 'contado' : ''}">${titulo}</p>
    <dl class="mm-datos"><div><dt>${n} cuotas de</dt><dd>${esc($(c.cuota))}</dd></div><div><dt>Las cuotas, en plata de hoy</dt><dd>${esc($(c.vp))}</dd></div>
    <div><dt>De contado</dt><dd>${esc($(c.contado))}</dd></div><div><dt>${c.diferencia > 0 ? 'Las cuotas te salen más caras por' : 'Las cuotas te ahorran'}</dt><dd>${esc($(Math.abs(c.diferencia)))}</dd></div></dl>
    <p class="mm-fuente">La cuenta: llevamos cada cuota a plata de hoy con ${esc(cual)}, la más alta de las dos: tener la plata hoy vale por lo menos eso. ${esc($(c.vp))} − ${esc($(c.contado))} = ${c.diferencia >= 0 ? '' : '−'}${esc($(Math.abs(c.diferencia)))}.</p>
    <button type="button" class="mm-btn sec" data-simular-desde-contado>${ic('simular')} Ver cómo queda mi mes</button>`;
}
$id('cc-form').addEventListener('input', e => {
  if (e.target.id === 'cc-inf' || e.target.id === 'cc-ren') {
    const k = e.target.id === 'cc-inf' ? 'inflacion' : 'rendimiento';
    const v = numero(e.target.value);
    if (v !== null && v >= 0 && v < 100) { datos.supuestos = { ...datos.supuestos, [k]: { valor: v, fecha: HOY_ISO } }; guardar(); }
  }
  pintarContado();
});
$id('cc-form').addEventListener('submit', e => e.preventDefault());
$id('cc-rapidas').addEventListener('click', e => { const b = e.target.closest('[data-cc]'); if (b) { $id('cc-cant').value = b.dataset.cc; pintarContado(); } });
$id('cc-precio').addEventListener('blur', e => { const c = leerMonto(e.target.value); if (c) e.target.value = sinSimbolo(c, 'ARS'); });
function simularDesdeContado() {
  $id('sim-total').value = $id('cc-precio').value;
  $id('sim-cant').value = $id('cc-cant').value;
  $id('sim-form').querySelector('[name="sim-moneda"][value="ARS"]').checked = true;
  verVista('simular');
}

/* ════════ SIMULADOR ════════ */
const monedaSim = () => $id('sim-form').querySelector('[name="sim-moneda"]:checked')?.value || 'ARS';
function pintarSimular(inicial = false) {
  if (inicial || !$id('sim-mes').options.length) opcionesMes($id('sim-mes'), HOY, sumarMeses(HOY, 24), $id('sim-mes').value || proximoResumen());
  for (const b of document.querySelectorAll('[data-sc]')) b.setAttribute('aria-pressed', String(b.dataset.sc === $id('sim-cant').value));
  const total = leerMonto($id('sim-total').value);
  const n = Number($id('sim-cant').value);
  const res = $id('sim-res');
  if (!total || !Number.isInteger(n) || n < 1 || n > 72) {
    res.innerHTML = `<p class="mm-vacio"><b>Poné el monto y las cuotas.</b> No se guarda nada hasta que toques "Cargar esta compra".</p>`;
    return;
  }
  const m = monedaSim();
  const primer = $id('sim-mes').value;
  const filas = simularCompra(datos, { total, cantidad: n, primerMes: primer, moneda: m }, primer, Math.min(24, n + 2));
  if (filas.some(f => f.despues === null)) {
    res.innerHTML = `<p class="mm-err">Falta el tipo de cambio de ${esc(MONEDAS[m].nombre)}. <button type="button" class="mm-link" data-cambio>Cargarlo</button></p>`;
    return;
  }
  const peor = filas.filter(f => f.cuota).reduce((a, f) => (f.despues < a.despues ? f : a));
  const pasan = filas.filter(f => f.cuota && f.supera).length;
  res.innerHTML = `<p class="mm-item-meta">Con esta compra, el mes más justo es ${esc(nombreMes(peor.mes))}</p>
    <p class="mm-total-num ${peor.despues < 0 ? 'neg' : ''}">${esc($(peor.despues))}</p>
    ${pasan ? `<p class="mm-alerta" style="width:auto;margin:0 0 12px">${ic('alerta')} En ${pasan === 1 ? 'un mes' : `${pasan} meses`} las cuotas pasarían tu tope de ${datos.limiteCuotas} % de los ingresos.</p>` : `<p class="mm-fuente" style="margin:0 0 12px">Ningún mes pasa tu tope de ${datos.limiteCuotas} %.</p>`}
    <div class="mm-sim-tabla" role="table" aria-label="Te quedan libres, antes y después de la compra">
      <div role="row" class="cab"><span role="columnheader">Mes</span><span role="columnheader">Hoy</span><span role="columnheader">Cuota</span><span role="columnheader">Con la compra</span></div>
      ${filas.map(f => `<div role="row" class="${f.supera && f.cuota ? 'pasa' : ''}"><span role="cell">${esc(corto(f.mes))}</span><span role="cell">${esc($(f.antes))}</span><span role="cell">${f.cuota ? `−${esc($(f.nueva))}` : '—'}</span><span role="cell" class="${f.despues < 0 ? 'neg' : ''}"><b>${esc($(f.despues))}</b></span></div>`).join('')}
    </div>
    <button type="button" class="mm-btn" data-cargar-simulada style="margin-top:14px;width:100%">${ic('cuota')} Cargar esta compra</button>`;
}
$id('sim-form').addEventListener('input', () => pintarSimular());
$id('sim-form').addEventListener('change', () => pintarSimular());
$id('sim-form').addEventListener('submit', e => e.preventDefault());
$id('sim-rapidas').addEventListener('click', e => { const b = e.target.closest('[data-sc]'); if (b) { $id('sim-cant').value = b.dataset.sc; pintarSimular(); } });
function cargarSimulada() {
  abrirCuota(null, null);
  const m = monedaSim();
  dc.querySelector(`[name="moneda"][value="${m}"]`).checked = true;
  $id('c-total').value = $id('sim-total').value;
  $id('c-cant').value = $id('sim-cant').value;
  opcionesMes($id('c-mes'), sumarMeses(HOY, -24), sumarMeses(HOY, 24), $id('sim-mes').value);
  marcarCantRapida(); previewCuota();
}

/* ════════ COPIA ════════ */
function exportarCopia() {
  const copia = { app: 'mi-mes-by-orbit', version: datos.v, exportado: new Date().toISOString(), datos };
  bajarArchivo(JSON.stringify(copia, null, 2), `mi-mes-copia-${HOY_ISO}.json`, 'application/json');
  avisar('Copia descargada');
}
let copiaPendiente = null;
$id('archivo-copia').addEventListener('change', async e => {
  const f = e.target.files?.[0];
  if (!f) return;
  try {
    if (f.size > 5 * 1024 * 1024) throw new Error('grande');
    const json = JSON.parse(await f.text());
    if (json?.app !== 'mi-mes-by-orbit' || !json.datos) throw new Error('formato');
    copiaPendiente = migrar(json.datos);
    const d = copiaPendiente;
    $id('dm-txt').textContent = `Copia del ${json.exportado ? new Date(json.exportado).toLocaleDateString('es-AR') : 'archivo'}: ${d.ingresos.length} ingresos, ${d.gastos.length} gastos fijos, ${d.cuotas.length} cuotas, ${d.tarjetas.length} tarjetas y ${d.resumenes.length} resúmenes.`;
    abrir($id('dlg-importar'), $id('dlg-importar').querySelector('[type="submit"]'));
  } catch {
    avisar('Ese archivo no es una copia de Mi Mes by Orbit.');
  }
});
$id('dlg-importar').querySelector('form').addEventListener('submit', e => {
  e.preventDefault();
  if (!copiaPendiente) return;
  datos = copiaPendiente; copiaPendiente = null; tarjetaVista = null;
  guardar(); cerrar($id('dlg-importar')); pintarTodo(); avisar('Copia importada');
});

/* ════════ PRIMER USO GUIADO ════════ */
const GUIA = 'orbit:mi-mes:guia-vista';
const dgu = $id('dlg-guia');
let pasoGuia = 0;
function iniciarGuiaSiHaceFalta() {
  const vacio = !datos.ingresos.length && !datos.gastos.length && !datos.cuotas.length && !datos.resumenes.length;
  let vista = false;
  try { vista = localStorage.getItem(GUIA) === '1'; } catch {}
  if (vacio && !vista) abrirGuia();
}
function abrirGuia() { pasoGuia = 0; pintarGuia(); abrir(dgu, dgu.querySelector('input')); }
function terminarGuia() { try { localStorage.setItem(GUIA, '1'); } catch {} cerrar(dgu); }
const GUIA_GASTOS = ['Alquiler', 'Expensas', 'Servicios', 'Suscripciones'];
function pintarGuia() {
  const titulos = ['¿Cuánto cobrás por mes?', 'Tus gastos fijos principales', 'Agregá tu primera tarjeta', ''];
  $id('gu-paso').textContent = pasoGuia < 3 ? `Paso ${pasoGuia + 1} de 3` : 'Listo';
  $id('gu-tit').textContent = titulos[pasoGuia];
  $id('gu-atras').hidden = pasoGuia === 0 || pasoGuia === 3;
  dgu.querySelector('[data-saltear-guia]').hidden = pasoGuia === 3;
  $id('gu-sig').textContent = pasoGuia === 3 ? 'Ir a mi mes' : pasoGuia === 2 ? 'Lo hago después' : 'Seguir';
  $id('gu-sig').classList.toggle('sec', pasoGuia === 2);
  const cuerpo = $id('gu-cuerpo');
  if (pasoGuia === 0) {
    const previo = datos.ingresos.find(i => i.id === 'guia-ing');
    cuerpo.innerHTML = `<p class="mm-ayuda">Tu sueldo o lo que cobres todos los meses, en pesos. Después podés sumar otros.</p>
      <div class="mm-campo"><label for="gu-ing">Sueldo por mes</label><input id="gu-ing" class="mm-grande" type="text" inputmode="decimal" autocomplete="off" placeholder="Ej: 1.200.000" value="${previo ? esc(sinSimbolo(previo.monto, 'ARS')) : ''}" aria-describedby="gu-ing-err"><p class="mm-err" id="gu-ing-err"></p></div>`;
  } else if (pasoGuia === 1) {
    cuerpo.innerHTML = `<p class="mm-ayuda">Solo el monto por mes. Dejá vacío el que no tengas.</p>` + GUIA_GASTOS.map((c, i) => {
      const previo = datos.gastos.find(g => g.id === `guia-g${i}`);
      return `<div class="mm-guia-fila"><label for="gu-g${i}">${esc(c)}</label><input id="gu-g${i}" type="text" inputmode="decimal" autocomplete="off" placeholder="$ por mes" value="${previo ? esc(sinSimbolo(previo.monto, 'ARS')) : ''}" aria-describedby="gu-g-err"></div>`;
    }).join('') + '<p class="mm-err" id="gu-g-err"></p>';
  } else if (pasoGuia === 2) {
    cuerpo.innerHTML = `<p class="mm-ayuda">Subí el último resumen en PDF y sacamos todo de ahí: banco, límite, fechas, saldo y cuotas. No hace falta escribir nada.</p>
      <button type="button" class="mm-btn" data-guia-subir>${ic('subir')} Subir el último resumen</button>
      <p class="mm-fuente">Para leerlo, el PDF pasa por el servidor de Orbit y por la API de Anthropic (Claude). No se guarda: en tu dispositivo queda solo lo que confirmes.</p>`;
  } else {
    const r = resumenMes(datos, HOY);
    const cred = creditoTotal(datos, HOY_ISO);
    cuerpo.innerHTML = `<div class="mm-guia-fin"><p>Este mes te quedan libres</p><p class="mm-total-num ${r.libres < 0 ? 'neg' : ''}">${esc($(r.libres))}</p>
      <dl class="mm-datos"><div><dt>Plata líquida</dt><dd>${esc($(r.liquida))}</dd></div><div><dt>Debés en tarjetas</dt><dd>${esc($(cred.total))}</dd></div></dl>
      <p class="mm-ayuda">Cuando quieras, agregá tu tarjeta subiendo el último resumen y se cargan solas las cuotas.</p></div>`;
  }
}
$id('gu-atras').addEventListener('click', () => { pasoGuia = Math.max(0, pasoGuia - 1); pintarGuia(); dgu.querySelector('input,select')?.focus(); });
dgu.addEventListener('click', e => { if (e.target.closest('[data-saltear-guia]')) terminarGuia(); });
dgu.addEventListener('cancel', () => { try { localStorage.setItem(GUIA, '1'); } catch {} });
dgu.querySelector('form').addEventListener('submit', e => {
  e.preventDefault();
  if (pasoGuia === 0) {
    const m = leerMonto($id('gu-ing').value);
    if (!m) { error($id('gu-ing'), 'gu-ing-err', 'Escribí cuánto cobrás, por ejemplo 1.200.000.').focus(); return; }
    datos.ingresos = datos.ingresos.filter(i => i.id !== 'guia-ing');
    datos.ingresos.push({ id: 'guia-ing', nombre: 'Sueldo', monto: m, repite: true, desde: HOY });
  } else if (pasoGuia === 1) {
    const filas = GUIA_GASTOS.map((cat, i) => ({ cat, txt: $id(`gu-g${i}`).value.trim() }));
    const malos = filas.findIndex(f => f.txt && !leerMonto(f.txt));
    if (malos >= 0) { error($id(`gu-g${malos}`), 'gu-g-err', 'Revisá ese monto (los centavos van con coma).').focus(); return; }
    datos.gastos = datos.gastos.filter(g => !g.id.startsWith('guia-g'));
    filas.forEach((f, i) => { if (f.txt) datos.gastos.push({ id: `guia-g${i}`, nombre: f.cat, categoria: f.cat, monto: leerMonto(f.txt), repite: true, desde: HOY }); });
  } else if (pasoGuia === 2) {
    /* sin resumen ahora: sigue al final */
  } else { terminarGuia(); return; }
  guardar(); pintarTodo();
  pasoGuia++; pintarGuia();
  requestAnimationFrame(() => (dgu.querySelector('#gu-cuerpo input, #gu-cuerpo select') || $id('gu-sig')).focus());
});


/* ════════ AVISOS PUSH E INSTALACIÓN ════════
   El permiso se pide SOLO al tocar "Activar avisos". Al servidor va lo mínimo
   (datosParaAvisos: nombre de la tarjeta, fechas y dólares sí/no; sin montos). */
const PUSH = 'orbit:mi-mes:push';
const API_AVISOS = '/api/mi-mes-avisos';
const pushActivo = () => { try { return localStorage.getItem(PUSH) === '1'; } catch { return false; } };
const marcarPush = on => { try { on ? localStorage.setItem(PUSH, '1') : localStorage.removeItem(PUSH); } catch {} $id('campana-on').hidden = !on; };
const soportaPush = () => !LOCAL && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const esIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const instalada = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
let pedidoInstalar = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); pedidoInstalar = e; });
const b64aBytes = b64 => { const p = '='.repeat((4 - (b64.length % 4)) % 4); const raw = atob((b64 + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(raw, c => c.charCodeAt(0)); };
async function api(metodo, cuerpo) {
  const r = await fetch(API_AVISOS, { method: metodo, credentials: 'same-origin', headers: cuerpo ? { 'Content-Type': 'application/json' } : {}, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.ok) throw new Error(j.error || 'No pudimos hablar con Orbit. Probá en un rato.');
  return j;
}
const registroSW = () => navigator.serviceWorker.register('sw.js', { scope: '/herramientas/mi-mes' });

function pintarPush(mensaje = '') {
  const on = pushActivo();
  const instalar = instalada() ? '' : `<section class="mm-push-sec"><h3>1. Agregala al inicio del celular</h3>
    ${pedidoInstalar ? `<button type="button" class="mm-btn sec" data-instalar>${ic('bajar')} Instalar Mi Mes</button>` : ''}
    <p><b>iPhone</b> (iOS 16.4 o más): abrí esta página en Safari, tocá <b>Compartir</b> y después <b>Agregar a inicio</b>. Los avisos en iPhone funcionan solo desde la app agregada al inicio.</p>
    <p><b>Android</b>: en Chrome, tocá el menú <b>⋮</b> y después <b>Instalar app</b> o <b>Agregar a pantalla principal</b>.</p>
    <p class="mm-fuente">En iPhone, la app del inicio guarda sus datos aparte de Safari: si ya cargaste cosas acá, exportá tu copia (en "Lo cargado") e importala en la app.</p></section>`;
  let accion;
  if (!soportaPush()) {
    accion = `<p class="mm-alerta" style="width:auto;margin:0">${LOCAL ? 'Abriste la app como archivo: los avisos en el celular funcionan desde orbitando.com.ar.' : esIOS() && !instalada() ? 'En iPhone, primero agregala al inicio (paso 1) y abrila desde ahí.' : 'Este navegador no puede recibir avisos.'}</p>`;
  } else if (Notification.permission === 'denied') {
    accion = `<p class="mm-alerta" style="width:auto;margin:0">Bloqueaste las notificaciones para este sitio. Podés habilitarlas desde los ajustes del navegador o del celular.</p>`;
  } else if (on) {
    accion = `<p class="mm-ok">${ic('campana')} Avisos activados en este dispositivo.</p>
      <button type="button" class="mm-borrar" data-push-off>Desactivar avisos y borrar mis datos del servidor</button>`;
  } else {
    accion = `<button type="button" class="mm-btn" data-push-on>${ic('campana')} Activar avisos</button>`;
  }
  $id('dp-cuerpo').innerHTML = `
    <p class="mm-sub" style="margin:0 0 12px">Te avisamos en el celular, sin montos: cuando cierra el resumen de una tarjeta, 3 días antes, la víspera y el día que vence, y si tenés consumos en dólares para pagar con dólares propios.</p>
    ${instalar}
    <section class="mm-push-sec"><h3>${instalada() ? '' : '2. '}Activá los avisos</h3>${accion}
      ${mensaje ? `<p class="mm-err" role="alert">${esc(mensaje)}</p>` : ''}
      <p class="mm-fuente"><b>Qué guardamos para avisarte:</b> el permiso de tu celular y, por tarjeta, un alias (por ejemplo "Tarjeta Visa 1", sin banco ni números), las fechas de cierre y vencimiento y si tiene dólares (sí o no); además, los meses en que lo que vence supera tu plata líquida. Nada de montos ni consumos. Queda atado a tu cuenta de Orbit y se borra al desactivar.</p></section>
    <section class="mm-push-sec"><h3>Sin avisos en el celular</h3><p class="mm-fuente">Igual ves los avisos dentro de la app, y en cada tarjeta podés tocar <b>Agregar al calendario</b> para que te suene desde el calendario del teléfono.</p></section>`;
}
async function activarPush() {
  try {
    const permiso = await Notification.requestPermission();
    if (permiso !== 'granted') return pintarPush('Sin el permiso no podemos avisarte. Quedan los avisos dentro de la app y el calendario.');
    const { publicKey } = await api('GET');
    await registroSW();
    const reg = await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64aBytes(publicKey) });
    const carga = cargaAvisos();
    await api('POST', { accion: 'activar', sub: sub.toJSON(), ...carga });
    marcarPush(true); ultimoSync = JSON.stringify(carga);
    pintarPush(); avisar('Avisos activados');
  } catch (e) {
    pintarPush(e?.message || 'No pudimos activar los avisos.');
  }
}
async function desactivarPush() {
  try {
    const reg = await navigator.serviceWorker?.getRegistration('/herramientas/mi-mes');
    const sub = await reg?.pushManager.getSubscription();
    await sub?.unsubscribe();
    await api('DELETE', {});
    marcarPush(false); pintarPush(); avisar('Avisos desactivados y datos borrados del servidor');
  } catch (e) { pintarPush(e?.message || 'No pudimos desactivarlos. Probá de nuevo.'); }
}
/* si cambian las fechas, se mandan de nuevo (solo si los avisos están activos) */
let ultimoSync = null, syncT = null;
/* lo que va al servidor: fechas de las tarjetas y los meses en que el crédito supera lo líquido. Sin montos. */
const cargaAvisos = () => ({ tarjetas: datosParaAvisos(datos, HOY_ISO), credito: mesesCreditoSupera(datos, HOY_ISO) });
function programarSync() {
  if (!pushActivo() || LOCAL) return;
  clearTimeout(syncT);
  syncT = setTimeout(() => {
    const t = JSON.stringify(cargaAvisos());
    if (t === ultimoSync) return;
    api('POST', { accion: 'sincronizar', ...JSON.parse(t) }).then(j => { ultimoSync = t; if (!j.activo) marcarPush(false); }).catch(() => {});
  }, 1500);
}
$id('dlg-push').addEventListener('click', async e => {
  if (e.target.closest('[data-push-on]')) return activarPush();
  if (e.target.closest('[data-push-off]')) return desactivarPush();
  if (e.target.closest('[data-instalar]') && pedidoInstalar) { pedidoInstalar.prompt(); await pedidoInstalar.userChoice.catch(() => {}); pedidoInstalar = null; pintarPush(); }
});

/* ── clics de toda la app ── */
const ABRIR = { cuota: abrirCuota, ingreso: abrirIngreso, gasto: abrirGasto };
document.addEventListener('click', e => {
  const t = e.target;
  const n = t.closest('[data-nuevo]');
  if (n) return ABRIR[n.dataset.nuevo]?.(null, n.dataset.tarjeta || (vista === 'tarjeta' ? tarjetaVista : null));
  const ed = t.closest('[data-editar]');
  if (ed) return ABRIR[ed.dataset.editar]?.(ed.dataset.id);
  const ir = t.closest('[data-ir-tarjeta]');
  if (ir) { tarjetaVista = ir.dataset.irTarjeta; return verVista('tarjeta'); }
  const v = t.closest('[data-ir]');
  if (v) return verVista(v.dataset.ir);
  if (t.closest('[data-agregar-tarjeta]')) { if (dc.open) cerrar(dc); return abrirSubir(null, { agregar: true }); }
  if (t.closest('[data-tarjeta-manual]')) { if ($id('dlg-subir').open) cerrar($id('dlg-subir')); return abrirTarjeta(); }
  if (t.closest('[data-guia-subir]')) { terminarGuia(); tarjetaDestino = null; $id('archivo').value = ''; return $id('archivo').click(); }
  const et = t.closest('[data-editar-tarjeta]');
  if (et) return abrirTarjeta(et.dataset.editarTarjeta);
  const im = t.closest('[data-importar]');
  if (im) return abrirSubir(im.dataset.importar || null);
  if (t.closest('[data-cambio]')) return abrirCambio();
  if (t.closest('[data-guardar-resumen]')) return guardarRevisado();
  if (t.closest('[data-descartar]')) { pendiente = null; avisar('Resumen descartado'); return verVista(tarjetaVista ? 'tarjeta' : 'inicio'); }
  if (t.closest('[data-revisar-igual]')) { pendiente.estado = 'ok'; pintarRevisar(); return; }
  const mm = t.closest('[data-mes]');
  if (mm) return irAMes(sumarMeses(mes, Number(mm.dataset.mes)));
  const desc = t.closest('[data-descartar-alerta]');
  if (desc) { datos.alertasVistas = [...datos.alertasVistas, desc.dataset.descartarAlerta].slice(-200); guardar(); pintarTodo(); return avisar('Aviso descartado'); }
  if (t.closest('[data-avisos-push]')) { pintarPush(); return abrir($id('dlg-push'), $id('dlg-push').querySelector('.mm-cerrar')); }
  if (t.closest('[data-franja]')) { alertasAbiertas = !alertasAbiertas; pintarAlertas(); return $id('alertas').querySelector('[data-franja]')?.focus(); }
  const ics = t.closest('[data-ics]');
  if (ics) return bajarICS(ics.dataset.ics);
  if (t.closest('[data-exportar]')) return exportarCopia();
  if (t.closest('[data-importar-copia]')) { $id('archivo-copia').value = ''; return $id('archivo-copia').click(); }
  if (t.closest('[data-simular-desde-contado]')) return simularDesdeContado();
  if (t.closest('[data-cargar-simulada]')) return cargarSimulada();
});
/* incluir o no un consumo en la revisión */
$id('revisar').addEventListener('change', e => {
  if (e.target.id === 'rv-tarjeta') $id('rv-card').innerHTML = tcard(tarjetaDe(e.target.value) || pendiente.nueva, { boton: false });
  if (e.target.matches('[data-incluir]')) e.target.closest('.mm-consumo').classList.toggle('fuera', !e.target.checked);
});

/* otra pestaña cambió los datos */
window.addEventListener('storage', e => { if (e.key === CLAVE) { datos = cargar(); pintarTodo(); } });

if (!puedeGuardar) $id('sin-storage').hidden = false;
else {
  try { localStorage.setItem(CLAVE + ':prueba', '1'); localStorage.removeItem(CLAVE + ':prueba'); }
  catch { puedeGuardar = false; $id('sin-storage').hidden = false; }
}
if (LOCAL) $id('modo-local').hidden = false;
pintarTodo();
const inicial = location.hash.slice(1);
if (['tarjetas', 'cargado', 'escalera', 'contado', 'simular'].includes(inicial)) verVista(inicial, { foco: false });
iniciarGuiaSiHaceFalta();
marcarPush(pushActivo());
if (pushActivo()) { ultimoSync = null; programarSync(); }   // al abrir, manda las fechas del ciclo nuevo
