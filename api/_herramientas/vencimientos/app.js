/* Vencimientos de la Casa (ob-021) · interfaz. Las cuentas están en calculos.js.
   Los datos viven solo en este dispositivo (localStorage). */
import * as V from './calculos.js';
import { SERVICIOS, CATEGORIAS, PRIMER_USO, PRECIOS, servicio, monograma, tintaSobre, iconoDe, categoriaDe, colorCategoria } from './servicios.js';
import { datosEjemplo } from './ejemplo.js';
import { propuestaDesde, cuentaQueCoincide } from './factura.js';
import { cuentasDesdeMails } from './correo-lector.js';
import { configCorreo, buscarEnGmail, buscarEnOutlook, mailsDemo } from './correo.js';
import { cuentasDesdeResumen, nombreDesdeComercio } from './resumen-tarjeta.js';

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
{ const n = conCategorias(d); if (JSON.stringify(n) !== JSON.stringify(d)) { d = n; try { localStorage.setItem(CLAVE, JSON.stringify(d)); } catch {} } }
/* Cuentas del resumen cargadas antes de limpiar nombres ("Www.make.com usd ,", "Anthropic claud in1ud…"): se limpian una vez. */
{
  let cambio = false;
  const cuentas = d.cuentas.map(c => {
    if (!c.enTarjeta || !/www\.|\.com|\.io|\.ar\b|\busd\b|\b[a-z]*\d[a-z\d_]{4,}/i.test(c.nombre)) return c;
    const limpio = nombreDesdeComercio(c.nombre);
    if (limpio === c.nombre || limpio === 'Débito en la tarjeta') return c;
    cambio = true;
    return { ...c, nombre: limpio };
  });
  if (cambio) { d = { ...d, cuentas }; try { localStorage.setItem(CLAVE, JSON.stringify(d)); } catch {} }
}
function conCategorias(x) { return { ...x, cuentas: x.cuentas.map(c => { const k = categoriaDe(c); return k === c.categoria ? c : { ...c, categoria: k }; }) }; }
function guardar(nuevo) {
  d = conCategorias(nuevo);
  if (!d.creado) d.creado = new Date().toISOString();
  try { localStorage.setItem(CLAVE, JSON.stringify(d)); almacenOK = true; }
  catch { almacenOK = false; toast('No pudimos guardar en este navegador. Descargá una copia desde Ajustes.'); }
  render();
  if (hoja.open && ui.catAbierta && $id('hoja-cuerpo').querySelector('.cat-hoja-cab, .lista')) abrirCategoria(ui.catAbierta);
}

let hoy = V.hoyLocal();
const ui = { vista: 'inicio', mes: V.mesDe(hoy), mesCal: V.mesDe(hoy), dia: hoy, resueltos: false,
  onb: { paso: 1, sel: new Set() }, borrarArmado: null, verTodo: false, verPasos: false, catAbierta: null };

/* ── piezas ── */
/* Ícono del servicio sobre su color; si no hay ícono propio, las iniciales. */
function avatar(c, extra = '') {
  const color = c.color || servicio(c.preset)?.color || colorCategoria(c.categoria || 'Otros');
  const ic = iconoDe(c);
  const dentro = ic && ic !== 'punto' ? `<svg><use href="#c-${ic}"/></svg>` : esc(monograma(c.nombre));
  return `<span class="av ${extra}" style="--c:${esc(color)};--t:${tintaSobre(color)}" aria-hidden="true">${dentro}</span>`;
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
    default: {
      const n = V.difDias(hoy, o.vence);
      t = n <= 14 ? `${cap(V.fechaCorta(o.vence))} · ${V.cuandoEs(o.vence, hoy)}` : `${cap(V.fechaCorta(o.vence))} de ${V.nombreMes(V.mesDe(o.vence))}`;
    }
  }
  if (o.cuota) t += ` · cuota ${o.cuota}/${c.cuotas}`;
  if (o.ajusta && !o.resuelto) t += ' · se ajusta';
  return t.trim();
}
function montoFila(o) {
  if (o.cuenta.tipo === 'tramite') return '<span class="fila-monto"><small>Trámite</small></span>';
  if (o.monto == null) return '<span class="fila-monto"><small>Sin monto</small></span>';
  if (o.cuenta.enTarjeta) return `<span class="fila-monto"><span class="aprox">${o.origen === 'estimado' ? '≈ ' : ''}</span>${plata(o.monto, o.moneda)}</span>`;
  if (o.origen === 'estimado') return `<span class="fila-monto"><span class="aprox">≈</span> ${plata(o.monto, o.moneda)}</span>`;
  return `<span class="fila-monto">${plata(o.monto, o.moneda)}${o.origen === 'factura' && !o.resuelto ? '<small>factura</small>' : ''}</span>`;
}
function fila(o) {
  const res = o.resuelto;
  const nombre = esc(o.cuenta.nombre);
  const accTick = o.estado === 'debitado' ? 'Débito automático: ver detalle' : res ? `Desmarcar ${nombre}` : (o.cuenta.tipo === 'tramite' ? `Marcar ${nombre} como hecho` : `Marcar ${nombre} como pagado`);
  return `<li class="fila est-${o.estado}${res ? ' res' : ''}">
    <button type="button" class="fila-main" data-acc="ver" data-id="${esc(o.id)}">
      ${avatar(o.cuenta)}
      <span class="fila-txt"><b>${nombre}</b><small>${esc(textoEstado(o))}</small>${etiquetas(o)}</span>
      ${montoFila(o)}
    </button>
    <button type="button" class="tick" data-acc="${o.estado === 'debitado' ? 'ver' : 'tick'}" data-id="${esc(o.id)}" aria-label="${accTick}" aria-pressed="${res}"><span><svg><use href="#i-check"/></svg></span></button>
  </li>`;
}
const grupo = (titulo, ocs, clase = '', derecha = '') => !ocs.length ? '' : `
  <div class="grupo ${clase}"><h2><span class="mono">${titulo}</span><span class="mono dim">${derecha}</span></h2>
  <ul class="lista">${ocs.map(fila).join('')}</ul></div>`;
const sumaARS = ocs => ocs.reduce((s, o) => s + (o.moneda === 'ARS' && o.monto != null ? o.monto : 0), 0);

/* ── vista: lo que viene ──
   Ventana corrida (no el mes calendario): lo vencido, hoy y los próximos 45 días.
   El número grande es lo que hay que pagar en los próximos 30 días; lo que va en una
   tarjeta no se suma aparte (ya está en el total de la tarjeta). */
const ILUS_LISTO = `<svg class="ilus" viewBox="0 0 160 120" aria-hidden="true"><circle cx="80" cy="62" r="46" fill="var(--ok)"/><path d="M58 64l14 14 30-32" fill="none" stroke="#0D0D0E" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/><circle cx="26" cy="30" r="5" fill="var(--azul)"/><circle cx="138" cy="24" r="4" fill="var(--mal)"/><circle cx="142" cy="92" r="6" fill="var(--azul)"/><circle cx="18" cy="96" r="3.5" fill="#0D0D0E"/></svg>`;
const ILUS_CASA = `<svg class="ilus" viewBox="0 0 220 150" aria-hidden="true"><rect x="0" y="128" width="220" height="3" rx="1.5" fill="currentColor" opacity=".15"/><path d="M40 128V70l50-40 50 40v58z" fill="#F2EFE8" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M30 76l60-50 60 50" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/><rect x="78" y="96" width="24" height="32" rx="3" fill="var(--azul)"/><rect x="55" y="84" width="16" height="16" rx="2" fill="var(--ok)" stroke="currentColor" stroke-width="2.5"/><rect x="109" y="84" width="16" height="16" rx="2" fill="var(--ok)" stroke="currentColor" stroke-width="2.5"/><g transform="translate(148 40)"><rect width="56" height="52" rx="8" fill="#fff" stroke="currentColor" stroke-width="3"/><path d="M0 16h56" stroke="currentColor" stroke-width="3"/><path d="M14 0v10M42 0v10" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><circle cx="18" cy="30" r="4" fill="var(--mal)"/><circle cx="32" cy="30" r="4" fill="currentColor" opacity=".25"/><circle cx="18" cy="42" r="4" fill="currentColor" opacity=".25"/><circle cx="32" cy="42" r="4" fill="var(--azul)"/></g><g transform="translate(14 22)"><path d="M14 30V18a10 10 0 0 1 20 0v12l4 5H10z" fill="var(--ok)" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M20 39h8" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></g></svg>`;

function etiquetas(o) {
  const c = o.cuenta, t = [];
  if (o.resuelto) return '';
  if (c.enTarjeta) t.push(['tarjeta', 'Va en la tarjeta']);
  else if (c.debito) t.push(['auto', 'Se debita solo']);
  if (o.origen === 'estimado' && !c.enTarjeta) t.push(['est', 'Monto estimado']);
  if (o.aConfirmar) t.push(['est', 'Fecha a confirmar']);
  if (o.monto == null && c.tipo !== 'tramite') t.push(['falta', 'Sin monto · tocá para cargarlo']);
  if (o.segundo && (o.estado === 'segundo')) t.push(['mal', 'Con recargo']);
  if (c.categoria === 'Tarjetas') {
    const n = d.cuentas.filter(x => x.enTarjeta && ult4(x.enTarjeta) && ult4(x.enTarjeta) === ult4(c.nombre)).length;
    if (n) t.push(['tarjeta', `Incluye ${n} cobro${n > 1 ? 's' : ''} fijo${n > 1 ? 's' : ''}`]);
  }
  return t.length ? `<span class="tags">${t.map(([k, x]) => `<span class="tag tag-${k}">${x}</span>`).join('')}</span>` : '';
}
function marcarFuente(k) {
  d = { ...d, fuentes: { ...(d.fuentes || {}), [k]: hoy } };
  try { localStorage.setItem(CLAVE, JSON.stringify(d)); } catch {}
}
function completaTuCasa() {
  const tiene = re => d.cuentas.some(c => re.test(`${c.preset || ''} ${c.nombre} ${c.categoria}`.toLowerCase()));
  const pasos = [
    { ok: tiene(/tarjetas/), ic: 'tarjeta', t: 'Subí el resumen de tu tarjeta', s: 'Trae suscripciones y débitos con su monto.', acc: 'resumen' },
    { ok: !!d.fuentes?.mail, ic: 'sobre', t: 'Buscá tus facturas en el mail', s: 'Luz, gas, agua, celular: con fecha y monto.', acc: 'correo' },
    { ok: tiene(/expensa|alquiler|hipoteca/), ic: 'casa', t: 'Sumá expensas o alquiler', s: 'Casi nunca llegan por mail: cargalo en un toque.', acc: 'elegir', s2: 'expensas' },
    { ok: !!d.fuentes?.ics, ic: 'campana', t: 'Que te avise el celular', s: 'Sumá todo al calendario, con aviso antes.', acc: 'ics' },
  ];
  const hechos = pasos.filter(p => p.ok).length;
  if (hechos === pasos.length) return '';
  const sig = pasos.find(p => !p.ok);
  if (!ui.verPasos) return `<div class="completa completa-min">
    <div class="completa-cab"><div><span class="mono">Completá tu casa · ${hechos} de ${pasos.length}</span><b>Próximo paso</b></div><span class="anillo" style="--p:${hechos / pasos.length}" aria-hidden="true"></span></div>
    <ol><li><button type="button" data-acc="${sig.acc}" ${sig.s2 ? `data-s="${sig.s2}"` : ''}>
      <span class="paso-ic"><svg><use href="#${sig.ic === 'sobre' || sig.ic === 'campana' ? 'i-' : 'c-'}${sig.ic}"/></svg></span>
      <span class="paso-tx"><b>${sig.t}</b><small>${sig.s}</small></span><svg class="flecha"><use href="#i-der"/></svg></button></li></ol>
    <button type="button" class="btn-txt" data-acc="ver-pasos">Ver todos los pasos</button>
  </div>`;
  return `<div class="completa">
    <div class="completa-cab"><div><span class="mono">Completá tu casa</span><b>${hechos} de ${pasos.length} listos</b></div>
      <span class="anillo" style="--p:${hechos / pasos.length}" aria-hidden="true"></span></div>
    <ol>${pasos.map(p => `<li class="${p.ok ? 'ok' : ''}">
      <button type="button" data-acc="${p.ok ? '' : p.acc}" ${p.s2 ? `data-s="${p.s2}"` : ''} ${p.ok ? 'disabled' : ''}>
        <span class="paso-ic">${p.ok ? '<svg><use href="#i-check"/></svg>' : `<svg><use href="#${p.ic === 'sobre' || p.ic === 'campana' ? 'i-' : 'c-'}${p.ic}"/></svg>`}</span>
        <span class="paso-tx"><b>${p.t}</b><small>${p.ok ? 'Listo' : p.s}</small></span>
        ${p.ok ? '' : '<svg class="flecha"><use href="#i-der"/></svg>'}
      </button></li>`).join('')}</ol>
  </div>`;
}

function saludo() {
  const h = new Date().getHours();
  return h < 6 ? 'Buenas noches' : h < 13 ? 'Buen día' : h < 20 ? 'Buenas tardes' : 'Buenas noches';
}
/* La situación en una o dos frases, en palabras simples. */
function fraseDelMes() {
  const atras = V.atrasados(d, hoy);
  const abiertos = [...atras, ...V.ocurrenciasEntre(d, hoy, V.sumarDias(hoy, 30), hoy).filter(o => !o.resuelto)].filter(o => !o.cuenta.enTarjeta);
  const venc = abiertos.filter(o => o.vence < hoy).length;
  const prox = abiertos.find(o => o.vence >= hoy);
  const total = sumaARS(abiertos);
  if (!abiertos.length) return 'No tenés nada por pagar en los próximos 30 días. Podés relajarte.';
  let f = `En los próximos 30 días tenés <b>${abiertos.length} ${abiertos.length === 1 ? 'cosa' : 'cosas'} por pagar</b>${total ? `, por ${plata(total)}` : ''}.`;
  if (venc) f += ` <span class="ojo">Ojo: ${venc === 1 ? 'hay 1 vencida' : `hay ${venc} vencidas`}.</span>`;
  else if (prox) f += ` Lo más cercano es <b>${esc(prox.cuenta.nombre)}</b>, ${V.difDias(hoy, prox.vence) <= 1 ? V.cuandoEs(prox.vence, hoy) : `el ${V.fechaCorta(prox.vence)}`}.`;
  return f;
}

/* ¿De qué es la plata de los próximos N días?
   Por categoría, contando lo que se cobra en una tarjeta en SU categoría; de cada tarjeta
   queda como "Resto de la tarjeta" lo que no es un cobro fijo conocido. Así suma exacto. */
const ult4 = s => (String(s || '').match(/(\d{4})\s*$/) || [])[1] || null;
function desglose(ocs) {
  const por = {};
  let total = 0, usd = 0;
  const sumar = (cat, m) => { por[cat] = (por[cat] || 0) + m; total += m; };
  const tarjetas = ocs.filter(o => o.cuenta.categoria === 'Tarjetas' && o.monto != null && o.moneda === 'ARS');
  const enTarjeta = ocs.filter(o => o.cuenta.enTarjeta && o.monto != null);
  for (const o of ocs) {
    if (o.monto == null) continue;
    if (o.moneda !== 'ARS') { usd += o.monto; continue; }
    if (o.cuenta.categoria === 'Tarjetas') continue;
    sumar(o.cuenta.categoria || 'Otros', o.monto);
  }
  for (const t of tarjetas) {
    const fijos = enTarjeta.filter(o => o.moneda === 'ARS' && ult4(o.cuenta.enTarjeta) && ult4(o.cuenta.enTarjeta) === ult4(t.cuenta.nombre)).reduce((a, o) => a + o.monto, 0);
    const resto = Math.max(0, t.monto - fijos);
    if (resto) sumar('Resto de la tarjeta', resto);
  }
  return { total, usd, cats: Object.entries(por).sort((a, b) => b[1] - a[1]) };
}
const colorDe = cat => cat === 'Resto de la tarjeta' ? '#F2EFE8' : cat === 'Otras categorías' ? '#5E5C57' : colorCategoria(cat);

function barraCategorias(cats, total) {
  if (!total) return '';
  return `<div class="barra-cat" aria-hidden="true">${cats.map(([c, m]) => `<i style="flex:${m};background:${colorDe(c)}"></i>`).join('')}</div>`;
}

/* Hoja con el detalle de una categoría (o de los vencidos). */
function abrirCategoria(cat) {
  const fin = V.sumarDias(hoy, 44);
  const abiertos = [...V.atrasados(d, hoy), ...V.ocurrenciasEntre(d, hoy, fin, hoy).filter(o => !o.resuelto)];
  const ocs = (cat === '__vencidos' ? abiertos.filter(o => o.vence < hoy) : abiertos.filter(o => (o.cuenta.categoria || 'Otros') === cat))
    .sort((a, b) => a.vence.localeCompare(b.vence));
  if (!ocs.length) { cerrar(); return; }
  const des = desglose(abiertos.filter(o => V.difDias(hoy, o.vence) <= 30));
  const enCat = cat === '__vencidos' ? sumaARS(ocs) : (des.cats.find(([c]) => c === (cat === 'Tarjetas' ? 'Resto de la tarjeta' : cat)) || [, 0])[1];
  const usd = ocs.reduce((a, o) => a + (o.moneda === 'USD' && o.monto ? o.monto : 0), 0);
  let nota = '';
  if (cat === 'Tarjetas') {
    const t = ocs.find(o => o.cuenta.categoria === 'Tarjetas' && o.monto != null);
    if (t) nota = `<p class="nota">El resumen es de <b>${plata(t.monto)}</b>. De eso, <b>${plata(Math.max(0, t.monto - enCat))}</b> son cobros fijos que ves en su categoría (Netflix, apps, educación…). Acá queda el resto: <b>${plata(enCat)}</b> en compras.</p>`;
  } else if (ocs.some(o => o.cuenta.enTarjeta)) nota = `<p class="nota">Los que dicen "Va en la tarjeta" ya están dentro del resumen de la tarjeta: no se pagan aparte.</p>`;
  const nombre = cat === '__vencidos' ? 'Vencidos' : cat;
  abrir(nombre, `
    <div class="cat-hoja-cab">${cat === '__vencidos' ? '' : avatar({ nombre: cat, categoria: cat, color: colorCategoria(cat) }, 'av-xl')}
      <div><span class="mono">${cat === '__vencidos' ? 'Ya pasó la fecha' : 'Próximos 30 días'}</span><p class="det-monto">${enCat ? plata(enCat) : '—'}</p>${usd ? `<small class="dim">y ${plata(usd, 'USD')} en dólares</small>` : ''}</div></div>
    ${nota}
    <ul class="lista">${ocs.map(fila).join('')}</ul>`);
}

/* ── para tener en cuenta (tarjetas que se deslizan) ── */
function tarjetasInsight() {
  const ins = V.insights(d, hoy);
  if (!ins.length) return '';
  const c = id => d.cuentas.find(x => x.id === id);
  const card = i => {
    switch (i.tipo) {
      case 'suba': return { ic: 'c-chispa', tono: 'mal', t: `${esc(i.nombre)} subió ${Math.round(i.pct * 100)} %`, p: `De ${plata(i.desde, i.moneda)} a ${plata(i.hasta, i.moneda)} contra la factura anterior.`, acc: `data-acc="cuenta" data-c="${esc(i.cuentaId)}"`, cta: 'Ver la historia' };
      case 'apartar': return { ic: 'i-reloj', tono: 'azul', t: `Apartá ${plata(i.porSemana)} por semana`, p: `Así llegás a ${esc(i.nombre)} (${plata(i.monto)}) el ${V.fechaCorta(i.vence)} sin sustos.`, acc: `data-acc="ver" data-id="${esc(i.cuentaId)}|${esc(i.clave)}"`, cta: 'Ver el pago' };
      case 'debito': return { ic: 'i-rayo-auto', tono: 'neutro', t: `¿Se debitó ${esc(i.nombre)}?`, p: 'Revisá tu cuenta: los débitos a veces fallan sin avisar.', acc: `data-acc="cuenta" data-c="${esc(i.cuentaId)}"`, cta: 'Ver' };
      case 'racha': return { ic: 'i-check', tono: 'ok', t: `Llevás ${i.meses} meses al día`, p: 'Todo pagado a tiempo. Seguí así.', acc: '', cta: '' };
      case 'sinmonto': return { ic: 'c-doc', tono: 'neutro', t: i.cantidad > 1 ? `Faltan ${i.cantidad} montos` : `Falta el monto de ${esc(i.nombre)}`, p: 'Cargalo y el total te queda exacto. Podés sacarle una foto a la factura.', acc: `data-acc="ver" data-id="${esc(i.cuentaId)}|${esc(i.clave)}"`, cta: 'Cargar' };
    }
  };
  return `<div class="grupo"><h2><span class="mono">Para tener en cuenta</span></h2><div class="insights">${ins.map(card).filter(Boolean).map(x => `
    <div class="ins ins-${x.tono}"><span class="ins-ic"><svg><use href="#${x.ic}"/></svg></span><b>${x.t}</b><p>${x.p}</p>${x.cta ? `<button type="button" class="btn-txt" ${x.acc}>${x.cta}</button>` : ''}</div>`).join('')}</div></div>`;
}

/* ── festejo: mes al día ── */
/* Datos del cierre: cuentas pagadas, recargos evitados (pagadas antes del 1.er vencimiento) y total. */
function cierreDelMes(ym) {
  const r = V.resumenMes(d, ym, hoy);
  const res = r.ocurrencias.filter(o => o.resuelto && o.estado !== 'salteado' && !o.cuenta.enTarjeta);
  const recargos = res.filter(o => o.pago?.fecha && o.pago.fecha > o.vence).length;
  return { ym, cuentas: res.length, recargos, total: r.ars.pagado, casa: d.config?.nombreCasa || '' };
}
/* Imagen 1080×1920 del cierre, para guardar o compartir (tipo resumen del año). */
function imagenCierre(c) {
  const cv = document.createElement('canvas'); cv.width = 1080; cv.height = 1920;
  const x = cv.getContext('2d');
  x.fillStyle = '#0D0D0E'; x.fillRect(0, 0, 1080, 1920);
  x.fillStyle = '#3047FF'; x.beginPath(); x.arc(1010, 150, 300, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#D9FF45'; x.beginPath(); x.arc(1000, 1720, 190, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#F2EFE8'; x.textBaseline = 'top';
  x.font = '500 34px "IBM Plex Mono", monospace'; x.fillText((c.casa || 'VENCIMIENTOS DE LA CASA').toUpperCase(), 90, 120);
  x.font = '900 150px "Inter Tight", sans-serif'; x.fillText(cap(V.nombreMes(c.ym)).toUpperCase() + ',', 90, 520); x.fillText('AL DÍA.', 90, 680);
  const fila = (y, num, txt) => { x.font = '800 120px "Inter Tight", sans-serif'; x.fillStyle = '#D9FF45'; x.fillText(num, 90, y); x.font = '500 46px "Inter Tight", sans-serif'; x.fillStyle = '#F2EFE8'; x.fillText(txt, 90, y + 140); };
  fila(960, String(c.cuentas), c.cuentas === 1 ? 'cuenta pagada' : 'cuentas pagadas');
  fila(1240, String(c.recargos), c.recargos === 1 ? 'recargo' : 'recargos');
  if (c.total) { x.font = '500 46px "IBM Plex Mono", monospace'; x.fillStyle = '#F2EFE8'; x.fillText(plata(c.total), 90, 1540); }
  x.font = '500 30px "IBM Plex Mono", monospace'; x.fillStyle = 'rgba(242,239,232,.6)'; x.fillText('ORBIT · orbitando.com.ar', 90, 1800);
  return new Promise(ok => cv.toBlob(ok, 'image/png'));
}
async function compartirCierre(c) {
  const blob = await imagenCierre(c);
  const file = new File([blob], `${c.ym}-al-dia.png`, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], text: `${cap(V.nombreMes(c.ym))}, al día.` }); return; } catch (e) { if (e?.name === 'AbortError') return; } }
  bajar(file.name, blob, 'image/png');
  toast('Imagen guardada en tus descargas.');
}

function festejar(titulo, texto, cierre = null) {
  try { navigator.vibrate?.([18, 40, 18]); } catch {}
  const el = document.createElement('div');
  el.className = 'festejo';
  el.setAttribute('role', 'status');
  el.innerHTML = `<canvas aria-hidden="true"></canvas><div class="festejo-in">${ILUS_LISTO}<b>${titulo}</b><p>${texto}</p>
    ${cierre ? `<div class="cierre"><span><b>${cierre.cuentas}</b>${cierre.cuentas === 1 ? 'cuenta' : 'cuentas'}</span><span><b>${cierre.recargos}</b>${cierre.recargos === 1 ? 'recargo' : 'recargos'}</span></div>` : ''}
    <div class="acciones"><button type="button" class="bt prim" data-acc="festejo-ok">¡Bien!</button>${cierre ? '<button type="button" class="bt sec" data-acc="festejo-compartir">Compartir mi mes</button>' : ''}</div></div>`;
  if (cierre) el.dataset.cierre = JSON.stringify(cierre);
  document.body.appendChild(el);
  el.querySelector('.bt').focus();
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const cv = el.querySelector('canvas'), cx = cv.getContext('2d');
  const W = cv.width = innerWidth * devicePixelRatio, H = cv.height = innerHeight * devicePixelRatio;
  const colores = ['#3047FF', '#FF4F2E', '#D9FF45', '#0D0D0E', '#9B7BFF', '#E9B949'];
  const ps = Array.from({ length: 140 }, () => ({ x: W / 2, y: H * 0.45, vx: (Math.random() - 0.5) * 22 * devicePixelRatio, vy: (-Math.random() * 18 - 6) * devicePixelRatio,
    r: (4 + Math.random() * 5) * devicePixelRatio, a: Math.random() * 6, va: (Math.random() - 0.5) * 0.4, c: colores[Math.floor(Math.random() * colores.length)] }));
  const t0 = performance.now();
  (function cuadro(t) {
    if (!el.isConnected) return;
    cx.clearRect(0, 0, W, H);
    for (const p of ps) {
      p.vy += 0.55 * devicePixelRatio; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.a += p.va;
      cx.save(); cx.translate(p.x, p.y); cx.rotate(p.a); cx.fillStyle = p.c; cx.fillRect(-p.r, -p.r / 2, p.r * 2, p.r); cx.restore();
    }
    if (t - t0 < 3200) requestAnimationFrame(cuadro); else cx.clearRect(0, 0, W, H);
  })(t0);
}
/* Después de marcar pagado: si el mes quedó sin pendientes, se festeja (una vez por mes). */
function quizasFestejar() {
  const ym = V.mesDe(hoy);
  const r = V.resumenMes(d, ym, hoy);
  if (!r.ocurrencias.length || r.cantPendientes || d.festejado === ym) return;
  d = { ...d, festejado: ym };
  try { localStorage.setItem(CLAVE, JSON.stringify(d)); } catch {}
  setTimeout(() => festejar(`${cap(V.nombreMes(ym))}, al día`, `Pagaste todo lo de este mes${r.ars.pagado ? `: ${plata(r.ars.pagado)}` : ''}. Tu casa está en orden.`, cierreDelMes(ym)), 450);
}

/* ── número que cuenta hasta el total (una vez por sesión) ── */
/* El total cuenta desde 0 al entrar y, después, de su valor anterior al nuevo (baja al pagar). */
let totalMostrado = null;
function contarHasta(el) {
  const fin = Number(el?.dataset.valor || 0);
  const desde = totalMostrado ?? 0;
  totalMostrado = fin;
  if (!el || !fin || desde === fin || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const t0 = performance.now(), dur = desde ? 600 : 700;
  el.classList.toggle('baja', desde > fin);
  (function paso(t) {
    const k = Math.min(1, (t - t0) / dur), e = 1 - (1 - k) ** 3;
    el.textContent = plata(Math.round((desde + (fin - desde) * e) / 100) * 100);
    if (k < 1) requestAnimationFrame(paso); else { el.textContent = plata(fin); el.classList.remove('baja'); }
  })(t0);
}

/* ── compartir el mes (WhatsApp o copiar) ── */
function textoParaCompartir() {
  const ocs = [...V.atrasados(d, hoy), ...V.ocurrenciasEntre(d, hoy, V.sumarDias(hoy, 30), hoy).filter(o => !o.resuelto)].filter(o => !o.cuenta.enTarjeta);
  const total = sumaARS(ocs);
  const lineas = ocs.slice(0, 15).map(o => `• ${o.cuenta.nombre} · ${V.fechaCorta(o.vence)}${V.mesDe(o.vence) !== V.mesDe(hoy) ? ` de ${V.nombreMes(V.mesDe(o.vence))}` : ''}${o.monto != null ? ` · ${plata(o.monto, o.moneda)}` : ''}`);
  return `Lo que vence en casa en los próximos 30 días${total ? `: ${plata(total)}` : ''}\n${lineas.join('\n')}${ocs.length > 15 ? `\n… y ${ocs.length - 15} más` : ''}\n\nHecho con Vencimientos de la Casa · Orbit`;
}
async function compartirMes() {
  const texto = textoParaCompartir();
  if (navigator.share) { try { await navigator.share({ text: texto }); return; } catch (e) { if (e?.name === 'AbortError') return; } }
  abrir('Compartir el mes', `<pre class="compartir">${esc(texto)}</pre><div class="acciones">
    <a class="bt prim ancho" href="https://wa.me/?text=${encodeURIComponent(texto)}" target="_blank" rel="noopener">Mandar por WhatsApp</a>
    <button type="button" class="bt sec ancho" data-acc="copiar-mes">Copiar el texto</button></div>`);
}

function vistaInicio() {
  const el = $id('v-inicio');
  if (!d.cuentas.length) { el.classList.remove('lleno'); el.innerHTML = primerUso(); return; }
  el.classList.add('lleno');
  const fin = V.sumarDias(hoy, 44);
  const atras = V.atrasados(d, hoy);
  const ventana = V.ocurrenciasEntre(d, hoy, fin, hoy);
  const abiertos = [...atras, ...ventana.filter(o => !o.resuelto)];
  const en30 = abiertos.filter(o => V.difDias(hoy, o.vence) <= 30 && !o.cuenta.enTarjeta);
  const des = desglose(abiertos.filter(o => V.difDias(hoy, o.vence) <= 30));
  const total30 = sumaARS(en30);
  const sinMonto = en30.filter(o => o.monto == null && o.cuenta.tipo !== 'tramite').length;
  const usd30 = en30.reduce((a, o) => a + (o.moneda === 'USD' && o.monto ? o.monto : 0), 0);
  const r = V.resumenMes(d, V.mesDe(hoy), hoy);
  const pct = r.ars.total ? Math.round(r.ars.pagado / r.ars.total * 100) : 0;
  const prox = abiertos.find(o => !o.cuenta.enTarjeta) || abiertos[0] || null;
  const hoyTxt = `Hoy, ${['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'][V.diaSemana(hoy)]} ${V.fechaLarga(hoy)}`;

  let html = `<div class="col-a">
  <div class="hola">
    <span class="mono">${hoyTxt}${d.config?.nombreCasa ? ` · ${esc(d.config.nombreCasa)}` : ''}</span>
    <h1 id="t-inicio">${saludo()}<span class="it">.</span></h1>
    <p>${fraseDelMes()}</p>
  </div>
  <div class="mes">
    <span class="mono etq">Próximos 30 días</span>
    <button type="button" class="ic compartir-bt" data-acc="compartir" aria-label="Compartir lo que vence" title="Compartir"><svg><use href="#i-compartir"/></svg></button>
    <p class="grande${!en30.length ? ' cero' : ''}" ${total30 ? `data-valor="${total30}"` : ''}>${!en30.length ? 'Nada' : total30 ? plata(totalMostrado && totalMostrado !== total30 ? totalMostrado : total30) : `${en30.length} por pagar`}</p>
    <p class="sub">${en30.length ? `${en30.length} pago${en30.length > 1 ? 's' : ''}${sinMonto ? ` · ${sinMonto} todavía sin monto` : ''}` : 'No vence nada en los próximos 30 días.'}${des.usd ? ` · además ${plata(des.usd, 'USD')} en dólares` : ''}</p>
    ${barraCategorias(des.cats, des.total)}
    <div class="mes-pie">
      <div class="barra" role="progressbar" aria-label="Pagado de ${V.nombreMes(V.mesDe(hoy))}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i style="width:${pct}%"></i></div>
      <span class="mono">${cap(V.nombreMes(V.mesDe(hoy)))}: ${r.ars.total ? `pagaste ${plata(r.ars.pagado)} de ${plata(r.ars.total)}` : 'sin montos cargados'}</span>
    </div>
  </div>`;
  if (prox) {
    const c = prox.cuenta;
    const vencido = prox.estado === 'vencido' || prox.estado === 'segundo';
    html += `<div class="spot${vencido ? ' spot-mal' : ''}">
      <span class="mono">${vencido ? 'Vencido' : 'Lo próximo'}</span>
      <div class="spot-fila">${avatar(c, 'av-xl')}
        <div class="spot-tx"><b>${esc(c.nombre)}</b><small>${esc(textoEstado(prox))}</small>${etiquetas(prox)}</div>
        <div class="spot-monto">${prox.monto != null ? `${prox.origen === 'estimado' ? '<span class="aprox">≈</span> ' : ''}${plata(prox.monto, prox.moneda)}` : '<small>Sin monto</small>'}</div>
      </div>
      <div class="acciones dos"><button type="button" class="bt prim" data-acc="tick" data-id="${esc(prox.id)}"><svg><use href="#i-check"/></svg> ${c.tipo === 'tramite' ? 'Ya lo hice' : 'Ya lo pagué'}</button><button type="button" class="bt sec" data-acc="ver" data-id="${esc(prox.id)}">Ver detalle</button></div>
    </div>`;
  }
  html += tarjetasInsight();
  if (d.ejemplo) html += `<div class="aviso info"><p><b>Estás viendo un ejemplo.</b> Probá marcar pagado, mirá el calendario y los números.</p><button class="btn-txt" type="button" data-acc="salir-ejemplo">Empezar con lo mío</button></div>`;
  else if (necesitaRespaldo()) html += `<div class="aviso info"><svg><use href="#i-candado"/></svg><p>Tus datos viven solo en este dispositivo. Guardá una copia por si cambiás de celular.</p><button class="btn-txt" type="button" data-acc="respaldo">Descargar</button></div>`;
  if (!almacenOK) html += `<div class="aviso mal"><svg><use href="#i-alerta"/></svg><p>Este navegador no deja guardar datos (¿modo incógnito?). Lo que cargues se pierde al cerrar.</p></div>`;
  if (!d.ejemplo) html += completaTuCasa();
  html += `</div><div class="col-b">`;

  /* lo vencido, en un solo aviso que se toca */
  const vencidos = abiertos.filter(o => o.vence < hoy && o !== prox);
  if (vencidos.length) html += `<button type="button" class="aviso mal aviso-bt" data-acc="cat" data-c="__vencidos"><svg><use href="#i-alerta"/></svg><p><b>${vencidos.length === 1 ? 'Tenés 1 pago vencido' : `Tenés ${vencidos.length} pagos vencidos`}</b>${sumaARS(vencidos) ? ` · ${plata(sumaARS(vencidos))}` : ''}</p><svg class="flecha"><use href="#i-der"/></svg></button>`;

  /* tus gastos: un cuadradito por categoría; al tocarlo se abre el detalle */
  const montos = Object.fromEntries(des.cats.map(([c, m]) => [c === 'Resto de la tarjeta' ? 'Tarjetas' : c, m]));
  const presentes = new Set(abiertos.map(o => o.cuenta.categoria || 'Otros'));
  const cats = CATEGORIAS.map(c => c.id).filter(c => presentes.has(c)).sort((a, b) => (montos[b] || 0) - (montos[a] || 0));
  if (cats.length) {
    html += `<div class="grupo"><h2><span class="mono">Tus gastos · próximos 30 días</span><span class="mono dim">Tocá para ver</span></h2><div class="tiles">${cats.map(c => {
      const deCat = abiertos.filter(o => (o.cuenta.categoria || 'Otros') === c && V.difDias(hoy, o.vence) <= 30);
      const n = abiertos.filter(o => (o.cuenta.categoria || 'Otros') === c).length;
      const usdCat = deCat.reduce((a, o) => a + (o.moneda === 'USD' && o.monto ? o.monto : 0), 0);
      return `<button type="button" class="tile" data-acc="cat" data-c="${esc(c)}" style="--cc:${colorCategoria(c)}">
        ${avatar({ nombre: c, categoria: c, color: colorCategoria(c) }, 'av-tile')}
        <span class="tile-n">${esc(c === 'Tarjetas' ? 'Tarjeta' : c)}</span>
        <b class="tile-m">${montos[c] ? plata(montos[c]) : usdCat ? plata(usdCat, 'USD') : `${n} ${n === 1 ? 'pago' : 'pagos'}`}</b>
      </button>`;
    }).join('')}</div></div>`;
  }
  if (!abiertos.length) html += `<div class="vacio vacio-ilus">${ILUS_LISTO}<p class="display">Todo <span class="it">al día.</span></p><p class="lead">No tenés nada pendiente en los próximos 45 días.</p></div>`;
  html += `<div class="grupo"><button type="button" class="mas-res" data-acc="ir" data-v="calendario"><svg><use href="#i-cal"/></svg> Ver mes por mes en el calendario</button></div>`;
  html += '</div>';
  el.innerHTML = html;
  contarHasta(el.querySelector('.grande[data-valor]'));
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
      ${ILUS_CASA}
      <h1 class="display" id="t-inicio">Todo lo que <span class="it">vence,</span> en un lugar.</h1>
      <p class="lead">Luz, gas, ABL, expensas, la VTV. Te avisa antes y te dice cuánto te falta pagar este mes.</p>
    </div>
    <div class="primer primer-mail">
      <h2>Que las busque <span class="it">la app</span></h2>
      <p>Subí el resumen de tu tarjeta y conectá tu mail: encontramos lo que pagás todos los meses, con fechas y montos.</p>
      <div class="acciones">
        <button type="button" class="bt prim ancho" data-acc="resumen"><svg><use href="#i-tarjeta"/></svg> Subí el resumen de tu tarjeta</button>
        <button type="button" class="bt prim ancho" data-acc="correo"><svg><use href="#i-sobre"/></svg> Buscar mis facturas en el mail</button>
      </div>
      <p style="margin:12px 0 0;font-size:13px">El resumen trae lo que se cobra en la tarjeta; el mail, las facturas con vencimiento. Usá los dos.</p>
    </div>
    <div class="primer">
      <h2>O elegí <span class="it">a mano</span></h2>
      <p>Tocá todo lo que corresponda. Después ponés el día y listo.</p>
      <div class="chips">${chips}<button type="button" class="vchip" data-acc="agregar">Otra…</button></div>
      <div class="acciones">
        <button type="button" class="bt prim ancho" data-acc="onb-seguir" ${o.sel.size ? '' : 'disabled'}>${o.sel.size ? `Seguir con ${o.sel.size}` : 'Elegí al menos uno'} <svg><use href="#i-flecha"/></svg></button>
        <button type="button" class="bt sec ancho" data-acc="leer"><svg><use href="#i-camara"/></svg> Tengo la factura: sacale una foto</button>
        <button type="button" class="btn-txt" data-acc="ejemplo">Ver primero con datos de ejemplo</button>
      </div>
    </div>
    <p class="privado"><svg><use href="#i-candado"/></svg>Tus datos quedan en este dispositivo. No se mandan a ningún lado.</p>`;
  }
  const items = [...o.sel].map(servicio).filter(Boolean).map(s => {
    const tram = s.tipo === 'tramite';
    const montoCampo = s.planes
      ? `<label style="margin:0"><span class="mini" aria-hidden="true">Tu plan</span><select name="plan" aria-label="Plan de ${esc(s.nombre)}">${opcionesPlan(s)}</select></label>`
      : `<label class="monto-in" data-sim="$" style="margin:0"><span class="mini" aria-hidden="true">Monto aprox.</span><input type="text" name="monto" inputmode="decimal" placeholder="Opcional" aria-label="Monto aproximado de ${esc(s.nombre)} (opcional)"></label>`;
    return `<li data-s="${s.id}">
      ${avatar({ nombre: s.nombre, color: s.color })}
      <div><b>${esc(s.nombre)}</b><br><small class="dim">${esc(V.nombreFrecuencia(s.frecuencia))}${s.ayuda ? ` · ${esc(s.ayuda)}` : ''}</small></div>
      <div class="campos">
        ${tram
          ? `<label style="margin:0"><span class="mini" aria-hidden="true">Próxima fecha</span><input type="date" name="fecha" min="${hoy}" aria-label="Fecha de vencimiento de ${esc(s.nombre)}"></label>`
          : `<label style="margin:0"><span class="mini" aria-hidden="true">${s.planes ? 'Día del cobro' : 'Día que vence'}</span><input type="number" name="dia" inputmode="numeric" min="1" max="31" placeholder="1 a 31" aria-label="Día del mes en que vence ${esc(s.nombre)}"></label>
             ${montoCampo}`}
        <label class="nose"><input type="checkbox" name="nose"><span>No sé la fecha: avisame y la confirmo después</span></label>
      </div>
    </li>`;
  }).join('');
  return `<div class="vt"><div><h1 id="t-inicio">¿Qué día <span class="it">vence?</span></h1><p>Si no la sabés, marcá "No sé" y seguí: queda como fecha a confirmar. El monto es opcional y se ajusta cuando marcás pagado.</p></div></div>
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
    const noSe = li.querySelector('input[name=nose]')?.checked;
    let primerVto = null;
    if (inp.name === 'fecha') primerVto = V.esFecha(inp.value) ? inp.value : null;
    else {
      const dia = Number(inp.value);
      if (dia >= 1 && dia <= 31) primerVto = V.proximoDia(dia, hoy, s.frecuencia);
    }
    let aConfirmar = false;
    if (!primerVto && noSe) { primerVto = fechaProvisoria(s); aConfirmar = true; }
    if (!primerVto) { faltan.push(s.nombre); inp.setAttribute('aria-invalid', 'true'); continue; }
    inp.removeAttribute('aria-invalid');
    const planElegido = s.planes?.[Number(li.querySelector('select[name=plan]')?.value)];
    const monto = planElegido ? planElegido.monto : V.leerPesos(li.querySelector('input[name=monto]')?.value);
    cuentas.push({ ...cuentaDesdeServicio(s, { primerVto, monto }), ...(aConfirmar ? { fechaAConfirmar: true } : {}),
      ...(planElegido ? { nota: `Plan ${planElegido.nombre}` } : {}) });
  }
  if (faltan.length) {
    const e = $id('onb-error'); e.hidden = false;
    e.textContent = `Falta la fecha de ${faltan.join(', ')}. Si no la sabés, marcá "No sé".`;
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

/* Sin fecha: provisoria a 10 días (o 30 para trámites), marcada "a confirmar".
   Mejor un aviso con fecha aproximada que no cargarla. */
const fechaProvisoria = s => s.tipo === 'tramite' ? V.sumarDias(hoy, 30) : V.sumarDias(hoy, 10);
function opcionesPlan(s, montoActual = null) {
  const ops = s.planes.map((p, i) => `<option value="${i}" ${montoActual === p.monto ? 'selected' : ''}>${esc(p.nombre)} · ${p.final ? '' : '≈ '}${plata(p.monto)}</option>`).join('');
  return `<option value="">Elegí tu plan</option>${ops}<option value="otro">Otro monto</option>`;
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
const cerrar = () => { if (hoja.open) hoja.close(); hoja.classList.remove('hoja-intro'); ui.catAbierta = null; };
hoja.addEventListener('click', e => { if (e.target === hoja) cerrar(); });

function buscarOc(id) {
  const [cid, clave] = String(id).split('|');
  const c = d.cuentas.find(x => x.id === cid);
  return c ? V.ocurrencia(d, c, clave, hoy) : null;
}

const BADGE = { vencido: ['Vencido', 'mal'], segundo: ['En 2º vencimiento', 'mal'], hoy: ['Vence hoy', 'azul'], proximo: ['Esta semana', ''],
  pendiente: ['Pendiente', ''], pagado: ['Pagado', 'ok'], debitado: ['Débito automático', 'ok'], salteado: ['No vino', ''] };

function verOcurrencia(id) {
  ui.catAbierta = null;
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
  ${o.aConfirmar ? `<p class="nota"><b>Fecha provisoria.</b> Cuando tengas la factura o el resumen, cargá la fecha real abajo, en "Confirmar la fecha", y ajustamos todos los meses.</p>` : ''}
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
        <label class="campo"><span>Monto pagado</span><span class="monto-in" data-sim="${sim}"><input type="text" name="monto" inputmode="decimal" value="${o.monto != null ? V.formatoPesos(o.monto, { simbolo: '', decimales: true }).trim() : ''}" placeholder="0" autocomplete="off"></span></label>
        <label class="campo"><span>Fecha de pago</span><input type="date" name="fecha" value="${hoy}" max="${V.sumarDias(hoy, 365)}"></label>
      </div>
      <label class="campo"><span>Comprobante o nota <small>(opcional)</small></span><input type="text" name="nota" maxlength="80" placeholder="Ej: n.º de operación" autocomplete="off"></label>`}
      ${tram ? `<input type="hidden" name="fecha" value="${hoy}">` : ''}
      <button class="bt prim ancho" type="submit"><svg><use href="#i-check"/></svg> ${tram ? 'Marcar hecho' : 'Marcar pagado'}</button>
    </form>`;
  }
  if (!tram && !o.resuelto) {
    html += `<details class="mas" style="margin-top:18px" ${o.aConfirmar ? 'open' : ''}><summary>${o.aConfirmar ? 'Confirmar la fecha' : 'Llegó la factura'}</summary>
      <form data-form="factura" data-id="${esc(o.id)}">
        <p class="leyenda" style="margin:0 0 12px">${o.aConfirmar ? 'Poné la fecha real (y el monto, si lo tenés). Los meses siguientes pasan a usar ese día.' : 'Cargá el monto y la fecha de esta factura. No cambia los meses siguientes.'}</p>
        <div class="fila2">
          <label class="campo"><span>Monto de la factura</span><span class="monto-in" data-sim="${sim}"><input type="text" name="monto" inputmode="decimal" value="${o.origen === 'factura' ? V.formatoPesos(o.monto, { simbolo: '', decimales: true }).trim() : ''}" placeholder="0" autocomplete="off"></span></label>
          <label class="campo"><span>Vence el</span><input type="date" name="fecha" value="${o.vence}"></label>
        </div>
        <div class="acciones dos"><button class="bt sec" type="button" data-acc="leer" data-para="${esc(o.id)}"><svg><use href="#i-camara"/></svg> Leer foto</button><button class="bt prim" type="submit">Guardar</button></div>
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
    <button type="button" class="bt prim ancho foto-bt" data-acc="leer"><svg><use href="#i-camara"/></svg> Sacale una foto a la factura</button>
    <div class="acciones dos" style="margin-top:10px"><button type="button" class="bt sec" data-acc="resumen"><svg><use href="#i-tarjeta"/></svg> Resumen de tarjeta</button><button type="button" class="bt sec" data-acc="correo"><svg><use href="#i-sobre"/></svg> Buscar en mi mail</button></div>
    <p class="leyenda" style="margin:8px 2px 16px">Leemos la fecha, el 2º vencimiento y el monto, de una foto, del PDF o directo de tu mail.</p>
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
    <input type="hidden" name="vtoOriginal" value="${c.fechaAConfirmar ? esc(c.primerVto) : ''}">
    <label class="campo"><span>Nombre</span><input type="text" name="nombre" value="${esc(c.nombre)}" required maxlength="40" placeholder="Ej: Luz, Expensas, Seguro" autocomplete="off"></label>
    <div class="fila2">
      <label class="campo"><span>${tram ? 'Vence el' : 'Próximo vencimiento'}</span><input type="date" name="primerVto" value="${esc(c.primerVto || '')}" required></label>
      <label class="campo"><span>Se repite</span><select name="frecuencia">${frecs}</select></label>
    </div>
    <label class="switch"><span><b>Tiene monto</b><small>Apagalo para trámites como la VTV o la licencia.</small></span><input type="checkbox" name="conMonto" ${tram ? '' : 'checked'}></label>
    <div data-si="monto" ${tram ? 'hidden' : ''}>
      ${servicio(c.preset)?.planes ? `<label class="campo" style="margin-top:8px"><span>Tu plan</span><select name="plan" data-planes="${esc(c.preset)}">${opcionesPlan(servicio(c.preset), c.monto ?? null)}</select>
        <small>${esc(PRECIOS.nota)} Fuente: ${esc(servicio(c.preset).fuente)}.</small></label>` : ''}
      <label class="campo" style="margin-top:8px"><span>Monto aproximado</span><span class="monto-in" data-sim="${sim}"><input type="text" name="monto" inputmode="decimal" value="${c.monto != null ? V.formatoPesos(c.monto, { simbolo: '', decimales: true }).trim() : ''}" placeholder="Opcional" autocomplete="off"></span>
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
    ...(String(f.get('vtoOriginal') || '') === primerVto ? { fechaAConfirmar: true } : {}),
    ...(String(f.get('nota') || '').trim() ? { nota: String(f.get('nota')).trim().slice(0, 200) } : {}),
  };
  return c;
}

/* ── leer factura ──
   Foto o PDF → /api/leer-factura → "revisá lo que leí" → se guarda solo lo que confirmás.
   La foto se achica en el teléfono (máx. 2000 px, JPEG) antes de mandarla. */
let leerPara = null;   // id de ocurrencia si se abrió desde "Llegó la factura"
let lectura = null;    // { p: propuesta, modo, match }
async function achicar(file) {
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) return file;
  const img = await new Promise((ok, mal) => { const i = new Image(); i.onload = () => ok(i); i.onerror = mal; i.src = URL.createObjectURL(file); });
  const max = 2000, k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const cv = document.createElement('canvas');
  cv.width = Math.round(img.naturalWidth * k); cv.height = Math.round(img.naturalHeight * k);
  cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
  URL.revokeObjectURL(img.src);
  return await new Promise(ok => cv.toBlob(ok, 'image/jpeg', 0.85));
}
async function leerFactura(file) {
  abrir('Leyendo la factura', `<div class="leyendo" role="status"><span class="giro" aria-hidden="true"></span><p><b>Estamos leyendo tu factura.</b><br>Tarda unos segundos. No la guardamos: se lee y se descarta.</p></div>`);
  let cuerpo;
  try { cuerpo = await achicar(file); }
  catch { return errorLectura('No pudimos abrir esa imagen. Probá con otra foto o con el PDF.'); }
  if (cuerpo.size > 4 * 1024 * 1024) return errorLectura('El archivo pesa más de 4 MB. Probá con una foto más chica.');
  let r, j;
  try {
    r = await fetch('/api/leer-factura', { method: 'POST', body: cuerpo, credentials: 'same-origin', headers: { 'Content-Type': cuerpo.type || 'application/octet-stream' } });
    j = await r.json().catch(() => ({}));
  } catch { return errorLectura('Sin conexión. La lectura necesita internet; probá de nuevo o cargala a mano.'); }
  if (r.status === 401) return errorLectura('Tu sesión de Orbit se cerró. Entrá de nuevo para leer facturas.', true);
  if (!r.ok || !j.ok) return errorLectura(j.error || 'No pudimos leer la factura. Cargala a mano.');
  const p = propuestaDesde(j.lectura, hoy);
  const desde = leerPara ? buscarOc(leerPara)?.cuenta : null;
  lectura = { p, modo: j.modo, match: desde || cuentaQueCoincide(d.cuentas, p) };
  revisarLectura();
}
function errorLectura(msg, login = false, deResumen = false) {
  abrir('No se pudo leer', `<p class="nota">${esc(msg)}</p><div class="acciones">
    ${login ? `<a class="bt prim ancho" href="/acceso?next=${encodeURIComponent('/herramientas/vencimientos')}">Entrar</a>`
      : deResumen ? `<button type="button" class="bt prim ancho" data-acc="resumen"><svg><use href="#i-tarjeta"/></svg> Probar de nuevo</button>`
      : `<button type="button" class="bt prim ancho" data-acc="leer-reintentar"><svg><use href="#i-camara"/></svg> Probar con otra foto</button>`}
    <button type="button" class="bt sec ancho" data-acc="leer-manual">Cargarla a mano</button></div>`);
}
function revisarLectura() {
  const { p, modo, match } = lectura;
  const frecs = V.FRECUENCIAS.filter(([v]) => v).map(([v, t]) => `<option value="${v}" ${v === p.frecuencia ? 'selected' : ''}>${t}</option>`).join('');
  const sim = p.moneda === 'USD' ? 'US$' : '$';
  abrir('Revisá lo que leí', `
    ${modo === 'prueba' ? '<p class="nota"><b>Modo prueba.</b> La lectura real todavía no está conectada: estos datos son de ejemplo, no de tu foto.</p>' : ''}
    <div class="det-cab">${avatar({ nombre: p.nombre, color: p.color })}<div><span class="badge ${p.confiable ? 'ok' : 'rev'}">${p.confiable ? 'Leída' : 'Revisala bien'}</span><br><b style="font-size:17px">${esc(p.nombre)}</b></div></div>
    ${p.avisos.length ? `<ul class="avisos-l">${p.avisos.map(a => `<li>${esc(a)}</li>`).join('')}</ul>` : ''}
    <form data-form="lectura" novalidate>
      ${match ? `<fieldset class="campo"><legend>¿De qué cuenta es?</legend><div class="seg">
        <label><input type="radio" name="destino" value="match" checked><span>De ${esc(match.nombre)}</span></label>
        <label><input type="radio" name="destino" value="nueva"><span>Es otra cuenta</span></label></div></fieldset>` : ''}
      <label class="campo" data-solo-nueva ${match ? 'hidden' : ''}><span>Nombre</span><input type="text" name="nombre" value="${esc(p.nombre)}" maxlength="40"></label>
      <div class="fila2">
        <label class="campo"><span>Vence el</span><input type="date" name="vence" value="${esc(p.vence || '')}" required></label>
        <label class="campo"><span>Monto</span><span class="monto-in" data-sim="${sim}"><input type="text" name="monto" inputmode="decimal" value="${p.monto != null ? V.formatoPesos(p.monto, { simbolo: '', decimales: true }).trim() : ''}" placeholder="0"></span></label>
      </div>
      <div class="fila2">
        <label class="campo"><span>2º vencimiento</span><input type="number" name="segundoVto" min="1" max="60" inputmode="numeric" value="${p.segundoVto || ''}" placeholder="Días después">${p.montoSegundo ? `<small>Con recargo: ${plata(p.montoSegundo, p.moneda)}</small>` : ''}</label>
        <label class="campo" data-solo-nueva ${match ? 'hidden' : ''}><span>Llega</span><select name="frecuencia">${frecs}</select></label>
      </div>
      <label class="switch" data-solo-nueva ${match ? 'hidden' : ''}><span><b>Débito automático</b><small>${p.debito ? 'La factura dice que se debita.' : 'Lo damos por pagado el día que vence.'}</small></span><input type="checkbox" name="debito" ${p.debito ? 'checked' : ''}></label>
      <p class="error" id="lectura-error" hidden></p>
      <div class="acciones" style="margin-top:12px"><button class="bt prim ancho" type="submit"><svg><use href="#i-check"/></svg> Guardar</button>
      <button type="button" class="bt sec ancho" data-acc="cerrar">Descartar</button></div>
      <p class="leyenda">No guardamos la foto: solo lo que confirmás acá, en este dispositivo.</p>
    </form>`);
}
/* Guarda la lectura confirmada: en la cuenta que coincide (la ocurrencia más cercana) o como cuenta nueva. */
function guardarLectura(form) {
  const f = new FormData(form);
  const { p, match } = lectura;
  const vence = String(f.get('vence') || '');
  const err = $id('lectura-error');
  if (!V.esFecha(vence)) { err.hidden = false; err.textContent = 'Poné la fecha de vencimiento.'; form.vence.focus(); return; }
  const monto = V.leerPesos(f.get('monto'));
  const seg = Number(f.get('segundoVto')) > 0 ? Math.round(Number(f.get('segundoVto'))) : null;
  let n = d, cid, clave;
  if (match && f.get('destino') !== 'nueva') {
    const c = { ...match };
    if (seg && !c.segundoVto) c.segundoVto = seg;
    const cerca = V.claves(c, V.sumarDias(vence, -45), V.sumarDias(vence, 45))
      .sort((a, b) => Math.abs(V.difDias(a, vence)) - Math.abs(V.difDias(b, vence)))[0];
    if (c.fechaAConfirmar || !cerca) { delete c.fechaAConfirmar; c.primerVto = vence; clave = vence; }
    else clave = cerca;
    n = V.guardarCuenta(n, c); cid = c.id;
    n = V.cargarFactura(n, cid, clave, { ...(monto != null ? { monto } : {}), fecha: vence });
  } else {
    const nombre = String(f.get('nombre') || '').trim() || p.nombre;
    const frecuencia = Number(f.get('frecuencia')) || p.frecuencia || 1;
    const c = { id: V.nuevoId(), nombre, categoria: p.categoria, frecuencia, primerVto: vence,
      ...(p.preset && nombre === p.nombre ? { preset: p.preset } : {}), ...(p.color ? { color: p.color } : {}),
      ...(monto != null ? { monto } : {}), ...(seg ? { segundoVto: seg } : {}), ...(f.get('debito') === 'on' ? { debito: true } : {}),
      ...(p.moneda === 'USD' ? { moneda: 'USD' } : {}) };
    if (p.cuota) { c.cuotas = p.cuota.de; c.primerVto = V.sumarMeses(vence, -(p.cuota.n - 1) * frecuencia); }
    n = V.guardarCuenta(d.ejemplo ? V.estadoVacio() : d, c); cid = c.id; clave = c.primerVto === vence ? vence : V.claves(c, V.sumarDias(vence, -3), V.sumarDias(vence, 3))[0] || vence;
    if (monto != null) n = V.cargarFactura(n, cid, clave, { monto });
  }
  const nombre = n.cuentas.find(x => x.id === cid)?.nombre || p.nombre;
  ui.onb = { paso: 1, sel: new Set() };
  guardar(n);
  cerrar();
  lectura = null; leerPara = null;
  toast(`${nombre}: vence el ${V.fechaLarga(vence)}${monto != null ? ` · ${plata(monto, p.moneda)}` : ''}.`, [{ t: 'Otra factura', fn: () => $id('f-factura').click() }, { t: 'Al calendario', fn: () => descargarICS(cid) }], 8000);
}

/* ── buscar en mi mail ──
   Todo pasa en este teléfono: el permiso es de solo lectura, se pide al tocar y se
   revoca al terminar. Se guarda solo lo que la persona elige, en este dispositivo. */
const DEMO_CORREO = /[?&]correo=demo\b/.test(location.search) && /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
let encontrados = [];
async function abrirCorreo() {
  const cfg = DEMO_CORREO ? { google: 'demo', microsoft: 'demo' } : await configCorreo();
  const boton = (acc, nombre, ok) => `<button type="button" class="bt ${ok ? 'prim' : 'sec'} ancho" data-acc="${acc}" ${ok ? '' : 'disabled'}>${nombre}${ok ? '' : ' · pronto'}</button>`;
  abrir('Buscar en tu mail', `
    <p class="lead-s">Revisamos los mails de los últimos 6 meses de las empresas que suelen mandar facturas y te mostramos qué encontramos. Vos elegís qué cargar.</p>
    <ul class="checks">
      <li>Permiso de <b>solo lectura</b>: no podemos mandar, borrar ni mover nada.</li>
      <li>Los mails se leen <b>en este teléfono</b>. No pasan por Orbit ni se guardan.</li>
      <li>Al terminar, <b>cerramos el permiso</b>. Para buscar de nuevo, lo pedimos otra vez.</li>
    </ul>
    <div class="acciones">${boton('correo-gmail', 'Con Gmail', !!cfg.google)}${boton('correo-outlook', 'Con Outlook o Hotmail', !!cfg.microsoft)}</div>
    ${!cfg.google && !cfg.microsoft ? '<p class="leyenda">La conexión con el mail se está habilitando. Mientras tanto, sacale una foto a la factura.</p>' : ''}`);
}
async function buscarCorreo(proveedor) {
  const cfg = DEMO_CORREO ? {} : await configCorreo();
  abrir('Buscando tus facturas', `<div class="leyendo" role="status"><span class="giro" aria-hidden="true"></span><p><b id="correo-avance">Esperando el permiso…</b><br>Se abre una ventana de ${proveedor === 'gmail' ? 'Google' : 'Microsoft'} para que des el permiso.</p></div>`);
  const avance = (n, total) => { const el = $id('correo-avance'); if (el) el.textContent = total ? `Revisando ${n} de ${total} mails…` : n ? `Leídos ${n} mails…` : 'Buscando…'; };
  let mails;
  try {
    if (DEMO_CORREO) { await new Promise(r => setTimeout(r, 900)); mails = mailsDemo(hoy); }
    else mails = proveedor === 'gmail' ? await buscarEnGmail(cfg.google, avance) : await buscarEnOutlook(cfg.microsoft, avance);
  } catch (e) {
    abrir('No se pudo buscar', `<p class="nota">${esc(e.message || 'No pudimos revisar el mail.')}</p><div class="acciones"><button type="button" class="bt prim ancho" data-acc="correo">Probar de nuevo</button><button type="button" class="bt sec ancho" data-acc="leer">Sacarle una foto a una factura</button></div>`);
    return;
  }
  marcarFuente('mail');
  encontrados = cuentasDesdeMails(mails, hoy);
  mostrarEncontrados(`Revisamos ${mails.length} mails.`, `Revisamos ${mails.length} mails y no encontramos facturas con fecha de vencimiento. Puede que te lleguen a otro mail o en papel.`);
}
function mostrarEncontrados(origen, siVacio) {
  if (!encontrados.length) {
    abrir('No encontramos nada', `<p class="nota">${esc(siVacio)}</p><div class="acciones"><button type="button" class="bt prim ancho" data-acc="leer"><svg><use href="#i-camara"/></svg> Sacale una foto a una factura</button><button type="button" class="bt sec ancho" data-acc="leer-manual">Cargar a mano</button></div>`);
    return;
  }
  const filas = encontrados.map((c, i) => {
    const ya = cuentaQueCoincide(d.cuentas, c);
    const sub = [`${c.proximoEstimado ? 'próximo ≈ ' : 'vence '}${V.fechaCorta(c.proximo)} ${V.mesDe(c.proximo) !== V.mesDe(hoy) ? `de ${V.nombreMes(V.mesDe(c.proximo))}` : ''}`.trim(),
      V.nombreFrecuencia(c.frecuencia).toLowerCase(), c.tarjeta ? 'total del resumen' : c.origen ? `en ${c.origen}` : `${c.encontradas} factura${c.encontradas > 1 ? 's' : ''}`, ya ? `ya la tenés: se actualiza` : ''].filter(Boolean).join(' · ');
    return `<li><label class="encontrada">
      <input type="checkbox" name="c" value="${i}" ${c.conocido || ya || c.nombre === 'Expensas' || c.origen ? 'checked' : ''}>
      ${avatar({ nombre: c.nombre, color: c.color })}
      <span class="fila-txt"><b>${esc(c.nombre)}</b><small>${esc(sub)}</small></span>
      <span class="fila-monto">${c.monto != null ? plata(c.monto, c.moneda) : '<small>Sin monto</small>'}</span>
    </label></li>`;
  }).join('');
  abrir(`Encontramos ${encontrados.length}`, `
    <p class="leyenda" style="margin-top:0">${esc(origen)} Destildá lo que no sea tuyo o no quieras cargar. Las fechas con ≈ son estimadas a partir de los cobros anteriores.</p>
    <form data-form="correo"><ul class="lista lista-sel">${filas}</ul>
    <div class="acciones" style="margin-top:16px"><button class="bt prim ancho" type="submit"><svg><use href="#i-check"/></svg> Cargar las elegidas</button>
    <button type="button" class="bt sec ancho" data-acc="cerrar">Ahora no</button></div></form>`);
}
/* Cuenta nueva: arranca en el próximo vencimiento (así lo viejo no aparece como vencido)
   y guarda la historia de montos como facturas, para "cuánto subió". */
function guardarDesdeMail(form) {
  const elegidas = [...form.querySelectorAll('input[name=c]:checked')].map(x => encontrados[Number(x.value)]).filter(Boolean);
  if (!elegidas.length) { cerrar(); return; }
  let n = d.ejemplo ? V.estadoVacio() : d;
  let nuevas = 0, actualizadas = 0;
  for (const e of elegidas) {
    let c = cuentaQueCoincide(n.cuentas, e);
    if (c) {
      c = { ...c }; delete c.fechaAConfirmar;
      if (e.segundoVto && !c.segundoVto) c.segundoVto = e.segundoVto;
      if (!V.claves(c, V.sumarDias(e.proximo, -10), V.sumarDias(e.proximo, 10)).length) c.primerVto = e.proximo;
      actualizadas++;
    } else {
      c = { id: V.nuevoId(), nombre: e.nombre, categoria: e.categoria, frecuencia: e.frecuencia, primerVto: e.proximo,
        ...(e.preset ? { preset: e.preset } : {}), ...(e.color ? { color: e.color } : {}),
        ...(e.monto != null ? { monto: e.monto } : {}), ...(e.segundoVto ? { segundoVto: e.segundoVto } : {}),
        ...(e.debito || servicio(e.preset)?.debito ? { debito: true } : {}), ...(servicio(e.preset)?.habil ? { habil: true } : {}),
        ...(e.moneda === 'USD' ? { moneda: 'USD' } : {}), ...(e.nota ? { nota: e.nota } : {}),
        ...(e.origen && !e.tarjeta ? { enTarjeta: e.origen, nota: `Se cobra en la tarjeta ${e.origen}: ya está dentro de su total.` } : {}) };
      nuevas++;
    }
    n = V.guardarCuenta(n, c);
    for (const h of e.historia) {
      if (h.vence >= c.primerVto && !(h.vence === e.proximo && !e.proximoEstimado)) continue;
      n = V.cargarFactura(n, c.id, h.vence, { monto: h.monto });
    }
    if (!e.proximoEstimado) {
      const k = V.claves(c, V.sumarDias(e.proximo, -10), V.sumarDias(e.proximo, 10))[0];
      if (k) n = V.cargarFactura(n, c.id, k, { ...(e.monto != null ? { monto: e.monto } : {}), fecha: e.proximo });
    }
  }
  ui.onb = { paso: 1, sel: new Set() };
  guardar(n);
  cerrar();
  toast(`Listo: ${nuevas ? `${nuevas} cuenta${nuevas > 1 ? 's' : ''} nueva${nuevas > 1 ? 's' : ''}` : ''}${nuevas && actualizadas ? ' y ' : ''}${actualizadas ? `${actualizadas} actualizada${actualizadas > 1 ? 's' : ''}` : ''}.`, [{ t: 'Al calendario', fn: () => descargarICS() }], 8000);
}

/* ── resumen de tarjeta ── */
async function leerResumen(file) {
  if (!(file.type === 'application/pdf' || /\.pdf$/i.test(file.name))) { toast('Subí el resumen en PDF, como lo descargás del banco.'); return; }
  if (file.size > 4 * 1024 * 1024) { toast('El PDF pesa más de 4 MB. Descargalo de nuevo desde el banco.'); return; }
  abrir('Leyendo tu resumen', `<div class="leyendo" role="status"><span class="giro" aria-hidden="true"></span><p><b>Estamos leyendo el resumen.</b><br>Tarda hasta un minuto. No lo guardamos: se lee y se descarta.</p></div>`);
  let r, j;
  try {
    r = await fetch('/api/vencimientos-resumen', { method: 'POST', body: file, credentials: 'same-origin', headers: { 'Content-Type': 'application/pdf' } });
    j = await r.json().catch(() => ({}));
  } catch { return errorLectura('Sin conexión. La lectura necesita internet; probá de nuevo.', false, true); }
  if (r.status === 401) return errorLectura('Tu sesión de Orbit se cerró. Entrá de nuevo para leer el resumen.', true);
  if (!r.ok || !j.ok) {
    errorLectura(j.error || 'No pudimos leer el resumen. Probá de nuevo en un rato.', false, true);
    if (j.detalle) $id('hoja-cuerpo').insertAdjacentHTML('beforeend', `<details class="mas"><summary>Detalle técnico (solo administración)</summary><pre class="diag">${esc(JSON.stringify(j.detalle, null, 2))}</pre></details>`);
    return;
  }
  encontrados = cuentasDesdeResumen(j.lectura, hoy);
  const t = j.lectura?.tarjeta || {};
  const de = [t.red, t.banco].filter(Boolean).join(' ') || 'tu tarjeta';
  mostrarEncontrados(`${j.modo === 'prueba' ? 'Modo prueba: es un resumen de ejemplo, no el tuyo. ' : ''}Leímos el resumen de ${de}.${j.confiable === false ? ' Algunos montos no cerraron: revisalos.' : ''}`,
    `Leímos el resumen de ${de} y no encontramos cobros que se repitan. Igual podés cargar la tarjeta a mano.`);
}

/* ── archivos ── */
function bajar(nombre, texto, tipo) {
  const blob = texto instanceof Blob ? texto : new Blob([texto], { type: tipo });
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
  if (!cuentaId) { marcarFuente('ics'); render(); }
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
  <div class="ajustes-sec"><h3>Tu casa</h3>
    <form data-form="casa"><label class="campo"><span>¿Cómo le decís?</span><input type="text" name="nombreCasa" maxlength="30" value="${esc(d.config.nombreCasa || '')}" placeholder="Ej: Casa de Palermo, Lo de mamá" autocomplete="off"><small>Aparece arriba y en el saludo.</small></label>
    <button type="submit" class="bt sec ancho">Guardar el nombre</button></form>
  </div>
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
  <div class="ajustes-sec"><h3>Tu mail y tus tarjetas</h3>
    <p class="leyenda" style="margin-top:0">Buscá facturas nuevas cuando quieras. El permiso es de solo lectura y se cierra al terminar.</p>
    <div class="acciones"><button type="button" class="bt sec ancho" data-acc="correo"><svg><use href="#i-sobre"/></svg> Buscar facturas en el mail</button><button type="button" class="bt sec ancho" data-acc="resumen"><svg><use href="#i-tarjeta"/></svg> Subir un resumen de tarjeta</button></div>
  </div>
  <div class="ajustes-sec"><h3>Tu copia</h3>
    <p class="leyenda" style="margin-top:0">Tus datos viven solo en este dispositivo. ${ult}</p>
    <div class="acciones dos">
      <button type="button" class="bt sec" data-acc="respaldo"><svg><use href="#i-bajar"/></svg> Descargar</button>
      <button type="button" class="bt sec" data-acc="importar"><svg><use href="#i-subir"/></svg> Restaurar</button>
    </div>
  </div>
  <div class="ajustes-sec"><h3>Cómo se usa</h3>
    <div class="acciones dos"><button type="button" class="bt sec" data-acc="ver-intro">Ver la bienvenida</button><button type="button" class="bt sec" data-acc="ver-guia">Recorrido guiado</button></div>
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
const FRASES_PAGO = ['¡Uno menos!', 'Listo, a otra cosa.', 'Tu yo del futuro te lo agradece.', 'Pagado y anotado.', 'Uno menos en la lista.', 'Bien ahí.', 'Así da gusto.'];
const frasePago = () => FRASES_PAGO[Math.floor(Math.random() * FRASES_PAGO.length)];
const vibrar = p => { try { navigator.vibrate?.(p); } catch {} };

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
  vibrar(12);
  guardar(V.marcarPagado(d, o.cuentaId, o.clave, { monto: o.monto, fecha: hoy }));
  quizasFestejar();
  const txt = o.cuenta.tipo === 'tramite' ? `${o.cuenta.nombre}: hecho. ${frasePago()}` : `${frasePago()} ${o.cuenta.nombre} · ${plata(o.monto, o.moneda)}`;
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
    case 'ir': irA(b.dataset.v); break;
    case 'ver-todo': ui.verTodo = true; render(); break;
    case 'cat': ui.catAbierta = b.dataset.c; abrirCategoria(b.dataset.c); break;
    case 'ver-pasos': ui.verPasos = true; render(); break;
    case 'entrar': cerrarEntrada(); break;
    case 'compartir': compartirMes(); break;
    case 'copiar-mes': navigator.clipboard?.writeText(textoParaCompartir()).then(() => toast('Copiado. Pegalo donde quieras.'), () => toast('No pudimos copiar: seleccioná el texto.')); break;
    case 'festejo-ok': document.querySelector('.festejo')?.remove(); break;
    case 'festejo-compartir': { const f = document.querySelector('.festejo'); if (f?.dataset.cierre) compartirCierre(JSON.parse(f.dataset.cierre)); break; }
    case 'intro-sig': slide = Math.min(SLIDES.length - 1, slide + 1); pintarSlide(); break;
    case 'intro-fin': marcarVisto(GUIA.intro); $id('hoja').classList.remove('hoja-intro'); cerrar(); render(); break;
    case 'tour-sig': paso++; pintarPaso(); break;
    case 'tour-fin': cerrarTour(); break;
    case 'ver-guia': cerrar(); if (d.cuentas.length) { irA('inicio'); setTimeout(abrirTour, 400); } else abrirIntro(); break;
    case 'ver-intro': cerrar(); setTimeout(abrirIntro, 200); break;
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
    case 'leer': leerPara = b.dataset.para || null; $id('f-factura').click(); break;
    case 'leer-reintentar': $id('f-factura').click(); break;
    case 'leer-manual': abrirAgregar(); break;
    case 'correo': abrirCorreo(); break;
    case 'resumen': $id('f-resumen').click(); break;
    case 'correo-gmail': buscarCorreo('gmail'); break;
    case 'correo-outlook': buscarCorreo('outlook'); break;
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
  if (t.name === 'plan' && t.dataset.planes) {
    const p = servicio(t.dataset.planes)?.planes?.[Number(t.value)];
    if (p) t.form.monto.value = V.formatoPesos(p.monto, { simbolo: '', decimales: true }).trim();
    else if (t.value === 'otro') t.form.monto.focus();
  }
  if (t.name === 'plan' && !t.dataset.planes && t.value === 'otro') {
    const li = t.closest('li'); const lab = t.closest('label');
    lab.outerHTML = `<label class="monto-in" data-sim="$" style="margin:0"><span class="mini" aria-hidden="true">Monto</span><input type="text" name="monto" inputmode="decimal" placeholder="0" aria-label="Monto"></label>`;
    li.querySelector('input[name=monto]')?.focus();
  }
  if (t.name === 'destino') t.form.querySelectorAll('[data-solo-nueva]').forEach(x => { x.hidden = t.value !== 'nueva'; });
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
    quizasFestejar();
    vibrar(12);
    toast(o.cuenta.tipo === 'tramite' ? `${o.cuenta.nombre}: hecho. ${frasePago()}` : `${frasePago()} ${o.cuenta.nombre} · ${plata(monto, o.moneda)}`, [{ t: 'Deshacer', fn: () => guardar(anterior) }]);
  } else if (tipo === 'factura') {
    const o = buscarOc(form.dataset.id); if (!o) return;
    const f = new FormData(form);
    const monto = V.leerPesos(f.get('monto'));
    const fecha = String(f.get('fecha') || '');
    if (o.cuenta.fechaAConfirmar && V.esFecha(fecha)) {
      // la fecha real rearma la serie desde ahí y deja de ser provisoria
      const { fechaAConfirmar, ...c } = o.cuenta;
      let n = V.guardarCuenta(d, { ...c, primerVto: fecha });
      if (monto != null) n = V.cargarFactura(n, c.id, fecha, { monto });
      guardar(n);
      verOcurrencia(`${c.id}|${fecha}`);
      toast('Fecha confirmada. Los meses siguientes ya usan este día.');
      return;
    }
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
  } else if (tipo === 'correo') {
    guardarDesdeMail(form);
  } else if (tipo === 'lectura') {
    guardarLectura(form);
  } else if (tipo === 'casa') {
    const nombreCasa = String(new FormData(form).get('nombreCasa') || '').trim().slice(0, 30);
    guardar({ ...d, config: { ...d.config, nombreCasa } });
    pintarMarca();
    toast(nombreCasa ? `Listo: ${nombreCasa}.` : 'Volvimos al nombre de siempre.');
  } else if (tipo === 'avisos') {
    const av = [...form.querySelectorAll('[name=av]:checked')].map(x => Number(x.value)).sort((a, b) => b - a).slice(0, 3);
    guardar({ ...d, config: { ...d.config, avisos: av.length ? av : [0], hora: form.hora.value } });
    toast('Avisos guardados. Volvé a sumar el calendario para aplicarlos.', [{ t: 'Sumar', fn: () => descargarICS() }], 7000);
  }
});

$id('f-resumen').addEventListener('change', e => {
  const file = e.target.files?.[0]; e.target.value = '';
  if (file) leerResumen(file);
});
$id('f-factura').addEventListener('change', e => {
  const file = e.target.files?.[0]; e.target.value = '';
  if (file) leerFactura(file);
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


/* ── guía: bienvenida (4 pantallas) y recorrido con globitos ──
   Se ven una sola vez (marca en localStorage) y se repiten desde Ajustes. */
const GUIA = { intro: 'orbit:vencimientos:intro', tour: 'orbit:vencimientos:tour' };
const visto = k => { try { return localStorage.getItem(k) === '1'; } catch { return true; } };
const marcarVisto = k => { try { localStorage.setItem(k, '1'); } catch {} };

const SLIDES = [
  { t: 'Todo lo que <span class="it">vence,</span> en un lugar', p: 'Luz, gas, expensas, la tarjeta, Netflix, la VTV. Ves qué viene y cuánto vas a pagar en los próximos 30 días.', ilus: () => ILUS_CASA },
  { t: 'Cargalo sin <span class="it">tipear</span>', p: 'Subí el resumen de tu tarjeta y conectá tu mail: encontramos lo que pagás todos los meses, con fecha y monto.', ilus: () => `<div class="slide-ics">${['tarjeta', 'sobre', 'camara'].map((x, i) => `<span style="--i:${i}"><svg><use href="#${x === 'tarjeta' ? 'c-' : 'i-'}${x}"/></svg></span>`).join('')}</div>` },
  { t: 'Te avisa <span class="it">antes</span>', p: 'Sumá todo al calendario de tu celular: te avisa unos días antes y el mismo día. Si algo se debita solo, te recuerda revisar.', ilus: () => `<div class="slide-ics slide-aviso"><span><svg><use href="#i-campana"/></svg></span><b>Edenor vence en 3 días</b></div>` },
  { t: 'Pagaste, <span class="it">tocás</span> y listo', p: 'Marcá cada cuenta como pagada en un toque. La app aprende el monto y te muestra cuánto subió cada servicio.', ilus: () => ILUS_LISTO },
];
let slide = 0;
function abrirIntro() {
  slide = 0;
  pintarSlide();
}
function pintarSlide() {
  const sl = SLIDES[slide];
  const ultimo = slide === SLIDES.length - 1;
  abrir('', `<div class="intro">
    <div class="intro-ilus">${sl.ilus()}</div>
    <h2 class="intro-t">${sl.t}</h2>
    <p class="intro-p">${sl.p}</p>
    <div class="puntos-intro" aria-hidden="true">${SLIDES.map((_, i) => `<i class="${i === slide ? 'on' : ''}"></i>`).join('')}</div>
    <div class="acciones"><button type="button" class="bt prim ancho" data-acc="${ultimo ? 'intro-fin' : 'intro-sig'}">${ultimo ? 'Empezar' : 'Siguiente'} <svg><use href="#i-flecha"/></svg></button>
    ${ultimo ? '' : '<button type="button" class="btn-txt" data-acc="intro-fin">Saltar</button>'}</div>
    <p class="solo-lector" aria-live="polite">Paso ${slide + 1} de ${SLIDES.length}</p>
  </div>`);
  $id('hoja').classList.add('hoja-intro');
  $id('hoja').querySelector('[data-acc^=intro]')?.focus();
}

/* Recorrido: ilumina cada parte y la explica. Salta los pasos cuyo elemento no está. */
const PASOS = [
  ['.mes', 'Esto es lo que tenés que pagar', 'El total de los próximos 30 días. Abajo, cuánto llevás pagado este mes.'],
  ['.spot', 'Lo próximo que vence', 'Cuando lo pagues, tocá "Ya lo pagué". Si es vencido, se pone en rojo.'],
  ['.tiles', 'Tus gastos, por categoría', 'Cada cuadradito suma lo de los próximos 30 días. Tocalo y ves el detalle: qué vence, cuándo y cuánto.'],
  ['.completa', 'Completá tu casa', 'Seguí estos pasos para tener todo: resumen, mail, expensas y avisos.'],
  ['#b-agregar', 'Sumá una cuenta', 'Con una foto de la factura, el resumen de la tarjeta, tu mail o a mano.'],
  ['#b-cal-ics', 'Que te avise el celular', 'Bajá todos los vencimientos a tu calendario, con aviso antes.'],
  ['.tabs [data-tab=numeros]', 'Mirá los números', 'Cuánto se va por año, por categoría y cuánto subió cada servicio.'],
];
let paso = -1, pasosVivos = [], ubicarPaso = null;
function abrirTour() {
  pasosVivos = PASOS.filter(([sel]) => document.querySelector(sel));
  if (!pasosVivos.length) return;
  paso = 0;
  let capa = $id('guia');
  if (!capa) {
    capa = document.createElement('div');
    capa.id = 'guia';
    capa.innerHTML = '<div class="velo"></div><div class="hueco"></div><div class="globo" role="dialog" aria-modal="true" aria-labelledby="globo-t"></div>';
    document.body.appendChild(capa);
  }
  capa.hidden = false;
  pintarPaso();
}
function cerrarTour() {
  ubicarPaso = null;
  const capa = $id('guia');
  if (capa) capa.hidden = true;
  paso = -1;
  marcarVisto(GUIA.tour);
}
function pintarPaso() {
  const [sel, t, p] = pasosVivos[paso];
  const el = document.querySelector(sel);
  if (!el) { paso < pasosVivos.length - 1 ? (paso++, pintarPaso()) : cerrarTour(); return; }
  el.scrollIntoView({ block: 'center', behavior: 'auto' }); // instantáneo: así el agujero y el globo caen en el lugar justo
  const capa = $id('guia'), hueco = capa.querySelector('.hueco'), globo = capa.querySelector('.globo');
  const ultimo = paso === pasosVivos.length - 1;
  globo.innerHTML = `<span class="mono">${paso + 1} de ${pasosVivos.length}</span><b id="globo-t">${t}</b><p>${p}</p>
    <div class="globo-acc">${ultimo ? '<span></span>' : '<button type="button" class="btn-txt" data-acc="tour-fin">Saltar</button>'}
    <button type="button" class="bt prim" data-acc="${ultimo ? 'tour-fin' : 'tour-sig'}">${ultimo ? '¡Listo!' : 'Siguiente'}</button></div>`;
  const ubicar = () => {
    if (!el.isConnected) return;
    const r = el.getBoundingClientRect(), m = 8;
    Object.assign(hueco.style, { top: `${r.top - m}px`, left: `${r.left - m}px`, width: `${r.width + m * 2}px`, height: `${r.height + m * 2}px` });
    /* velo oscuro con un agujero donde está lo que se explica */
    const [x, y, w, h] = [r.left - m, r.top - m, r.width + m * 2, r.height + m * 2];
    capa.querySelector('.velo').style.clipPath = `path(evenodd, "M0 0H${innerWidth}V${innerHeight}H0Z M${x} ${y}H${x + w}V${y + h}H${x}Z")`;
    const g = globo.getBoundingClientRect();
    const abajo = r.bottom + 14 + g.height < innerHeight - 90;
    const top = abajo ? r.bottom + 14 : Math.max(12, r.top - g.height - 14);
    const left = Math.min(Math.max(12, r.left + r.width / 2 - g.width / 2), innerWidth - g.width - 12);
    Object.assign(globo.style, { top: `${top}px`, left: `${left}px` });
    globo.dataset.lado = abajo ? 'abajo' : 'arriba';
  };
  ubicarPaso = ubicar;
  ubicar();
  requestAnimationFrame(ubicar);
  setTimeout(ubicar, 300);
  globo.querySelector('.bt')?.focus({ preventScroll: true });
}
/* al scrollear o cambiar el tamaño solo se reubica: redibujar el globo reemplazaba el botón en medio del clic */
addEventListener('resize', () => { if (paso >= 0) ubicarPaso?.(); });
addEventListener('scroll', () => { if (paso >= 0) requestAnimationFrame(() => ubicarPaso?.()); }, { passive: true });
addEventListener('keydown', e => { if (paso >= 0 && e.key === 'Escape') cerrarTour(); });

/* Entrada amable: una vez por día, saludo + la situación en una frase + "Ver mi casa". */
const ENTRADA = 'orbit:vencimientos:entrada';
function mostrarEntradaSiCorresponde() {
  let ultima = null;
  try { ultima = localStorage.getItem(ENTRADA); } catch {}
  if (ultima === hoy || !d.cuentas.length || d.ejemplo) return false;
  const el = document.createElement('div');
  el.id = 'entrada';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-labelledby', 'entrada-t');
  el.innerHTML = `<div class="entrada-in">
    ${ILUS_CASA}
    <span class="mono">${saludo()}</span>
    <h1 id="entrada-t">Te damos la bienvenida a <span class="it">${d.config?.nombreCasa ? esc(d.config.nombreCasa) : 'la administración de tu casa'}</span></h1>
    <p>${fraseDelMes()}</p>
    <button type="button" class="bt prim" data-acc="entrar">Ver mi casa <svg><use href="#i-flecha"/></svg></button>
  </div>`;
  document.body.appendChild(el);
  setTimeout(() => el.querySelector('.bt')?.focus(), 50);
  return true;
}
function cerrarEntrada() {
  try { localStorage.setItem(ENTRADA, hoy); } catch {}
  const el = $id('entrada');
  if (!el) return;
  el.classList.add('sale');
  setTimeout(() => { el.remove(); guiaSiCorresponde(); }, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 320);
}
addEventListener('keydown', e => { if (e.key === 'Escape' && $id('entrada')) cerrarEntrada(); if (e.key === 'Escape') document.querySelector('.festejo')?.remove(); });

/* Al render: bienvenida si nunca la vio; recorrido la primera vez que hay datos en Inicio. */
function guiaSiCorresponde() {
  if (hoja.open || paso >= 0 || $id('entrada')) return;
  if (!visto(GUIA.intro) && !d.cuentas.length) { setTimeout(abrirIntro, 300); return; }
  if (!visto(GUIA.tour) && d.cuentas.length && ui.vista === 'inicio') setTimeout(() => { if (!hoja.open && paso < 0) abrirTour(); }, 600);
}

function pintarMarca() {
  const m = document.querySelector('.marca .mono');
  if (m) m.innerHTML = d.config?.nombreCasa ? esc(d.config.nombreCasa) : 'Vencimientos <span class="it">de la</span> Casa';
}

function render() {
  hoy = V.hoyLocal();
  document.querySelectorAll('.vista').forEach(s => { s.hidden = s.dataset.vista !== ui.vista; });
  document.querySelectorAll('.tabs [data-tab]').forEach(b => { if (b.dataset.tab === ui.vista) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  ({ inicio: vistaInicio, calendario: vistaCalendario, cuentas: vistaCuentas, numeros: vistaNumeros })[ui.vista]();
  guiaSiCorresponde();
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
  if (cambioDatos) d = conCategorias(cargar());
  if (hoja.open && cambioDatos) cerrar();
  render();
});

mostrarEntradaSiCorresponde();
pintarMarca();
const inicial = location.hash.slice(1);
if (['inicio', 'calendario', 'cuentas', 'numeros'].includes(inicial)) ui.vista = inicial;
render();
