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
  asistenteCambio, aplicarCambio, verificarCambio, CHECKLIST_CAMBIO, historiaCompra, vincularCredito, TIPOS_EVIDENCIA, textoTNA, textoCargos, SIN_RED, PAGOS_VENCIDO, resumenVencido, registrarPagoResumen, financiacionEstimada, sumarDias, bandejaDevolver, mensajeReclamo, TIPOS_DEVOLVER, compartidaValida, compartidaDe, comoPagar, fotoProyeccion, cambiosDesde, tarjetaDeGasto, confirmarGasto, confirmarTodos, darDeBajaGasto, proyeccionSaldo, CUENTAS_COMUNES, destinoLiberacion, asignarLiberacion, aporteSugerido, fichaCompra, preguntas, proximosPagos, consejos, victorias, estadoMeta, metaSugerida, METAS_SUGERIDAS, RETOS, retoDelMes, calculoRendir, tnaMensual, datoViejo,
  COBROS, cobroValido, proximoCobro, venceAntesDeCobrar, lineaDelMes, lineaHastaCobrar, alertasCobro, textoCobroEn,
} from './calculos.js';
import { resumenEjemplo } from './ejemplo.js';
import { flagsActivos } from './flags.js';
import {
  EJEMPLOS_DOC, TIPOS_DOC, MAX_BYTES_DOC, PARALELO_DOCS, huella, yaSubido, consolidar, aplicarItems, etapaPrimerUso, estimadosViejos,
  clasificarDeEjemplo, facturaDeEjemplo,
} from './documentos.js';
import { TASAS, AVISO_LEGAL, avisoCorto } from './tasas.js';

const CLAVE = 'orbit:mi-mes';
const ATRAS = 6, ADELANTE = 60;          // meses que se pueden mirar
const MAX_PDF = 4 * 1024 * 1024;
const HOY = mesDe();
const HOY_ISO = hoyISO();
const LOCAL = location.protocol === 'file:';
/* versión: si la pestaña quedó abierta con un JS viejo, avisa "recargá". Tiene que coincidir con version.json. */
const VERSION = '2026-10-15.t16';
/* interruptores: ?flag=x prende una función apagada, pero nunca en el dominio de producción */
const F = flagsActivos(/(^|\.)orbitando\.com\.ar$/.test(location.hostname) ? '' : location.search);

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
  /* que se pueda restar a ojo: el número es la resta de los montos redondeados que se ven */
  const redondo = c => Math.round(c / 100) * 100;
  num.textContent = sinNada ? '$ —' : $(redondo(r.totIngresos) - redondo(r.totGastos) - redondo(r.totTarjetas));
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
  pintarCobroLinea();
  pintarConsejo();
  pintarCobro();
  pintarDificil();
  pintarMeta();
  pintarReto();
  pintarAlertas();
  pintarMesEn30(lim);
  const cred = creditoTotal(datos, HOY_ISO);
  $id('s-ing').textContent = $(r.totIngresos);
  $id('s-gas').textContent = $(r.totGastos);
  $id('s-tar').textContent = $(r.totTarjetas);
  pintarContraste(r, cred);

  /* acción principal: sin tarjetas, agregar una (subiendo el resumen); con tarjetas, subir el resumen */
  const principal = $id('accion-principal');
  const sinTarjetas = !datos.tarjetas.length;
  $id('accion-texto').textContent = F.subiLoQueTengas ? 'Subí lo que tengas' : sinTarjetas ? 'Agregar tarjeta' : 'Subir resumen';
  if (F.subiLoQueTengas) { principal.dataset.ir = 'subir'; delete principal.dataset.importar; delete principal.dataset.agregarTarjeta; }
  else if (sinTarjetas) { principal.dataset.agregarTarjeta = ''; delete principal.dataset.importar; }
  else { principal.dataset.importar = ''; delete principal.dataset.agregarTarjeta; }

  /* tarjetas */
  $id('carrusel').innerHTML = datos.tarjetas.map(t => tcard(t, { mesTotal: tarjetaEnMes(datos, t.id, mes).total })).join('') +
    `<button type="button" class="mm-tnueva" data-agregar-tarjeta>${ic('mas')}<span>Agregar tarjeta</span></button>`;

  /* movimientos */
  const ing = r.ingresos.map(i => item({ tipo: 'ingreso', id: i.id, icono: 'ingreso', claseIc: 'ing', titulo: i.nombre, meta: textoRepite(i), monto: '+' + $(i.monto), montoClase: 'mas' }));
  const gasTj = (r.gastosTarjeta || []).map(g => item({ tipo: 'gasto', id: g.id, icono: 'tarjetas', titulo: g.nombre,
    meta: `${g.dentro ? `Con ${g.tarjeta}: ya está adentro del resumen` : `Con ${g.tarjeta}: se paga con la tarjeta`}${g.inferida ? ' (lo vimos en el resumen)' : ''}`, monto: g.dentro ? '' : '−' + $(g.monto) }));
  const gas = r.gastos.map(g => item({ tipo: 'gasto', id: g.id, icono: 'gasto', titulo: g.nombre,
    meta: `${g.nombre === g.categoria ? '' : g.categoria + ' · '}${F.gastoEstimado && g.real !== null ? `estimado ${$(g.estimado)}` : textoRepite(g)}`, monto: '−' + $(g.monto),
    extra: F.gastoEstimado && !g.confirmado ? ' <span class="mm-tag ext">Estimado</span>' : '' }));
  const tar = [
    ...r.resumenes.map(x => {
      const ext = listaMonedas(x.porMoneda);
      return item({ ir: x.tarjetaId, icono: 'tarjetas', titulo: `Resumen ${x.tarjeta}`,
        meta: x.parcial ? `Pagaste ${$(x.monto)} de ${$(x.total)}: el resto pasa al mes que viene` : `Vence ${fechaCorta(x.vencimiento) || corto(x.mes)}${ext ? ` · incluye ${ext}` : ''}`, monto: '−' + $(x.monto),
        extra: x.faltaCambio.length ? ' <span class="mm-tag">Falta tipo de cambio</span>' : '' });
    }),
    ...r.delBanco.map(x => item({ ir: x.tarjetaId, icono: 'escalera', titulo: `Cuotas de ${x.tarjeta}`, meta: 'Según la tabla "cuotas a vencer" del banco', monto: '−' + $(x.monto) })),
    ...(r.financiados || []).map(x => item({ ir: x.tarjetaId, icono: 'alerta', titulo: `Saldo sin pagar · ${x.tarjeta}`, meta: `${$(x.saldo)} del resumen anterior + ${$(x.interes)} de intereses estimados · ${textoTNA(x)}${x.sinPago ? '. Sin pago, el banco suma punitorios: no los estimamos' : ''}`, monto: '−' + $(x.monto), extra: ' <span class="mm-tag ext">Estimado</span>' })),
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
      grupo('Gastos fijos', (r.totGastos ? '−' : '') + $(r.totGastos), gas, datos.gastos.length ? 'Sin gastos fijos este mes.' : 'Alquiler, expensas, servicios, suscripciones: lo que pagás sí o sí.') +
      grupo('Tarjetas y cuotas', (r.totTarjetas ? '−' : '') + $(r.totTarjetas), [...tar, ...gasTj, ...((r.financiados || []).some(f => f.tnaDe !== 'resumen') ? [`<li class="mm-tna"><button type="button" class="mm-link" data-tna>Cambiar la TNA supuesta (${esc(String(supuesto(datos, 'financiacion').valor).replace('.', ','))} %)</button></li>`] : [])], datos.cuotas.length || datos.resumenes.length ? 'Sin cuotas ni resúmenes este mes.' : 'Cargá una compra en cuotas o subí el resumen de tu tarjeta.', dentro);

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
/* ════════ TU MES EN 30 SEGUNDOS ════════
   En la tarjeta azul, tres respuestas: cuánto podés gastar (te quedan libres),
   qué tenés que pagar (próximos vencimientos) y qué tenés que revisar.
   "Qué revisar" absorbe la franja de avisos: un solo lugar para lo que pide
   atención, ordenado por urgencia y por plata, en vez de dos listas arriba. */
const CLAVE_COPIA = 'orbit:mi-mes:copia';
const ultimaCopia = () => { try { return localStorage.getItem(CLAVE_COPIA); } catch { return null; } };
let revisaAbierta = false;
function itemsRevisar(lim) {
  const alertas = [...alertasCredito(datos, HOY_ISO), ...alertasTarjetas(datos, HOY_ISO)];
  for (const c of F.diaDeCobro ? alertasCobro(datos, HOY_ISO) : []) {
    const v = alertas.find(a => a.tipo === 'vence' && a.tarjetaId === c.tarjetaId && a.fecha === c.fecha);
    if (v) { v.antesCobro = true; v.texto = `${v.texto} Vence antes de que cobres: ${c.texto}`; } else alertas.push(c);
  }
  const fuertes = alertas.filter(a => nivelVisual(a) === 'fuerte');
  const suaves = alertas.filter(a => nivelVisual(a) !== 'fuerte');
  const p = F.preguntas ? preguntas(datos, HOY_ISO, { ultimaCopia: ultimaCopia(), diaDeCobro: F.diaDeCobro, diaDificil: F.diaDificil, gastoEstimado: F.gastoEstimado }) : { ahora: [], masTarde: [], alDia: true };
  const tope = lim?.supera ? [{ clase: 'tope', lim }] : [];
  const bd = F.devolver ? bandejaDevolver(datos, HOY_ISO) : null;
  const dev = bd && (bd.vencidos.length || bd.candidatos.some(c => c.parecido.length)) ? [{ clase: 'devolver', bd }] : [];
  const cm = F.queCambio && datos.fotoBase ? cambiosDesde(datos.fotoBase, datos) : [];
  const cambios = cm.length ? [{ clase: 'cambio', meses: cm }] : [];   // una sola fila, con todos los meses adentro
  /* etapas del primer uso: 2 · una sola invitación a actualizar con lo de este mes; 3 · el mail */
  const etapas = [];
  if (F.etapas) {
    const faltanRes = p.ahora.concat(p.masTarde).filter(q => q.tipo === 'resumen');
    const viejos = estimadosViejos(datos, HOY_ISO);
    const etapa = etapaPrimerUso(datos, { visitas: VISITAS, pendientes: faltanRes.length + viejos.length, mailConectado: false });
    if (etapa === 2) {
      const partes = [...faltanRes.sort((a, b) => b.impacto - a.impacto).map(q => ({ txt: `el resumen de este mes de ${tarjetaDe(q.tarjetaId)?.nombre || 'tu tarjeta'}`, imp: q.impacto })),
        ...viejos.map(g => ({ txt: `la factura de ${g.nombre.toLowerCase() === g.nombre ? g.nombre : g.nombre} de ${nombreMes(HOY).split(' ')[0]}`, imp: g.monto }))].sort((a, b) => b.imp - a.imp);
      const top = partes.slice(0, 2).map(x => x.txt);
      etapas.push({ clase: 'etapa', etapa: 2, impacto: partes.reduce((a, x) => a + x.imp, 0),
        titulo: `Para que el cálculo sea exacto, subí ${top.join(' y ')}${partes.length > 2 ? ` (y ${partes.length - 2} más)` : ''}.` });
      /* las preguntas sueltas de "falta tu resumen" quedan dentro de esta invitación */
      p.ahora = p.ahora.filter(q => q.tipo !== 'resumen');
    }
    if (etapa === 3 && F.conectarMail) etapas.push({ clase: 'etapa', etapa: 3, titulo: 'Conectá tu mail para que lleguen solos tus resúmenes y facturas.' });
  }
  return { lista: [...fuertes.map(a => ({ clase: 'alerta', a })), ...etapas, ...cambios, ...dev, ...p.ahora.map(q => ({ clase: 'pregunta', q })), ...tope, ...suaves.map(a => ({ clase: 'alerta', a }))],
    masTarde: p.masTarde };
}
function preguntaHTML(q) {
  const acc = {
    resumen: () => `<button type="button" class="mm-btn chico" data-importar="${esc(q.tarjetaId)}">${ic('subir')} Subir resumen</button>`,
    lectura: () => `<button type="button" class="mm-btn chico" data-pregunta-ok="${esc(q.resumenId)}">Está bien</button><button type="button" class="mm-link" data-ir-tarjeta="${esc(q.tarjetaId)}">Ver el resumen</button>`,
    concilia: () => `<button type="button" class="mm-btn chico" data-concilia-q="si" data-cuota="${esc(q.cuotaId)}">Sí, es la misma</button><button type="button" class="mm-link" data-concilia-q="no" data-cuota="${esc(q.cuotaId)}">No, son dos</button>`,
    gasto: () => `<button type="button" class="mm-btn chico" data-confirmar-gasto="${esc(q.gastoId)}">${esc(q.accion)}</button><button type="button" class="mm-link" data-editar="gasto" data-id="${esc(q.gastoId)}">Cambió</button>`,
    cobro: () => `<button type="button" class="mm-btn chico" data-editar="ingreso" data-id="${esc(q.ingresoId)}" data-foco-cobro>Elegir el día</button>`,
    cambio: () => `<button type="button" class="mm-btn chico" data-cambio>Actualizar</button>`,
    copia: () => `<button type="button" class="mm-btn chico" data-exportar>Guardar copia</button>`,
    saldo: () => `<button type="button" class="mm-btn chico" data-saldo>${esc(q.accion)}</button>`,
    estimados: () => `<button type="button" class="mm-btn chico" data-gastos-ok="${esc(q.gastoIds.join(','))}">${esc(q.accion)}</button><button type="button" class="mm-link" data-ir="cargado">Alguno cambió</button>`,
    estimado: () => `<button type="button" class="mm-btn chico" data-gasto-ok="${esc(q.gastoId)}">${esc(q.accion)}</button><button type="button" class="mm-link" data-gasto-real="${esc(q.gastoId)}">Fue otro monto</button><button type="button" class="mm-link" data-gasto-baja="${esc(q.gastoId)}">Lo di de baja</button>`,
    gastoTarjeta: () => `<button type="button" class="mm-btn chico" data-gasto-tj="${esc(q.gastoId)}" data-tj="${esc(q.tarjetaId)}">${esc(q.accion)}</button><button type="button" class="mm-link" data-gasto-aparte="${esc(q.gastoId)}">No, se paga aparte</button>`,
    pagado: () => Object.entries(PAGOS_VENCIDO).map(([k, v], i) => `<button type="button" class="${i ? 'mm-link' : 'mm-btn chico'}" data-pago-res="${esc(q.resumenId)}" data-pago="${k}">${esc(v)}</button>`).join(''),
    dificil: () => `<button type="button" class="mm-btn chico" data-ver-dificil>Ver día por día</button>`,
  }[q.tipo]?.() || '';
  return `<details class="mm-fila-alerta pregunta">
    <summary><span class="mm-fa-ic">${ic(q.tipo === 'resumen' ? 'subir' : q.tipo === 'cobro' ? 'calendario' : q.tipo === 'cambio' ? 'dolar' : 'alerta')}</span><span class="mm-fa-txt">${esc(q.titulo)}</span><svg class="ic mm-fa-flecha"><use href="#i-der"/></svg></summary>
    <div class="mm-fa-det"><p>${esc(q.porque)}</p><div class="mm-fa-acc">${acc}<button type="button" class="mm-link quieto" data-pregunta-luego="${esc(q.id)}">Más tarde</button></div></div>
  </details>`;
}
function filaRevisar(x) {
  if (x.clase === 'pregunta') return preguntaHTML(x.q);
  if (x.clase === 'cambio') {
    const top = x.meses.slice().sort((p, q) => Math.abs(q.comprometido) - Math.abs(p.comprometido))[0];
    const mesTxt = nombreMes(top.mes).split(' ')[0];
    const corto = top.comprometido ? `Cambió tu mes: ${mesTxt}, ${$(Math.abs(top.comprometido))} ${top.comprometido > 0 ? 'más' : 'menos'} comprometidos` : `Cambió tu mes: ${mesTxt}, ingresos`;
    const bloque = c => `<p>${esc(c.texto)}</p><ul class="mm-cambio-lista">${c.lineas.map(l => {
      const attrs = l.ref?.editar ? `data-editar="${esc(l.ref.editar)}" data-id="${esc(l.ref.id)}"` : l.ref?.tarjeta ? `data-ir-tarjeta="${esc(l.ref.tarjeta)}"` : '';
      return `<li><button type="button" class="mm-cambio-l" ${attrs}><span>${esc(l.nombre)}${l.nuevo ? ' · nuevo' : l.quitado ? ' · ya no está' : ''}</span><b>${l.dif > 0 ? '+' : '−'}${esc($(Math.abs(l.dif)))}</b></button></li>`;
    }).join('')}</ul>`;
    const motivos = (datos.cambios || []).slice(-3).map(m => m.motivo);
    return `<details class="mm-fila-alerta pregunta"><summary><span class="mm-fa-ic">${ic('escalera')}</span><span class="mm-fa-txt">${esc(corto)}${x.meses.length > 1 ? ` (+${x.meses.length - 1})` : ''}</span><svg class="ic mm-fa-flecha"><use href="#i-der"/></svg></summary>
      <div class="mm-fa-det">${x.meses.map(bloque).join('')}
      ${motivos.length ? `<p class="mm-fuente">Desde la última vez: ${esc(motivos.join(' · ').toLowerCase())}.</p>` : ''}
      <div class="mm-fa-acc"><button type="button" class="mm-link" data-cambios-visto>Entendido</button></div></div></details>`;
  }
  if (x.clase === 'etapa') {
    return `<details class="mm-fila-alerta pregunta etapa" ${x.etapa === 2 ? 'open' : ''}><summary><span class="mm-fa-ic">${ic(x.etapa === 2 ? 'subir' : 'campana')}</span><span class="mm-fa-txt">${esc(x.etapa === 2 ? 'Actualizá con lo de este mes' : 'Que lleguen solos')}</span><svg class="ic mm-fa-flecha"><use href="#i-der"/></svg></summary>
      <div class="mm-fa-det"><p>${esc(x.titulo)}</p><div class="mm-fa-acc">${x.etapa === 2 ? '<button type="button" class="mm-btn chico" data-ir="subir">Subir lo de este mes</button>' : '<button type="button" class="mm-btn chico" data-conectar-mail>Conectar mi mail</button>'}</div></div></details>`;
  }
  if (x.clase === 'devolver') {
    const v = x.bd.vencidos, c = x.bd.candidatos.filter(k => k.parecido.length);
    const porMon = {};
    for (const i of v) porMon[i.moneda || 'ARS'] = (porMon[i.moneda || 'ARS'] || 0) + (i.vencidoMonto || i.monto);
    const txt = v.length ? `Te deben ${Object.entries(porMon).map(([m, x2]) => fm(x2, m)).join(' y ')} que ya deberían estar` : `Puede que te hayan acreditado un reintegro`;
    return `<details class="mm-fila-alerta pregunta"><summary><span class="mm-fa-ic">${ic('bajar')}</span><span class="mm-fa-txt">${esc(txt)}</span><svg class="ic mm-fa-flecha"><use href="#i-der"/></svg></summary>
      <div class="mm-fa-det"><p>${v.length ? `${v.length === 1 ? 'Un ítem pasó' : `${v.length} ítems pasaron`} la fecha esperada. Tenés el mensaje de reclamo armado para copiar.` : `En tu resumen aparece ${esc(c[0].concepto)} por ${esc($(c[0].monto))}.`}</p>
      <div class="mm-fa-acc"><button type="button" class="mm-btn chico" data-ir="devolver">Ver la bandeja</button></div></div></details>`;
  }
  if (x.clase === 'tope') return `<details class="mm-fila-alerta suave"><summary><span class="mm-fa-ic">${ic('escalera')}</span><span class="mm-fa-txt">Las cuotas son el ${Math.round(x.lim.usado * 100)} % de tus ingresos</span><svg class="ic mm-fa-flecha"><use href="#i-der"/></svg></summary>
    <div class="mm-fa-det"><p>Tu tope es ${x.lim.pct} %. Lo podés cambiar en la escalera.</p><div class="mm-fa-acc"><button type="button" class="mm-link" data-ir="escalera">Ver escalera</button></div></div></details>`;
  return alertaHTML(x.a, { descartable: true });
}
function pintarMesEn30(lim) {
  const on = F.mesEn30;
  document.body.classList.toggle('mm-en30', on);
  const pagar = $id('pagar'), rev = $id('revisa');
  if (!on || mes !== HOY) { pagar.hidden = rev.hidden = true; return; }
  /* 2 · qué tenés que pagar */
  const pp = proximosPagos(datos, HOY_ISO, 3);
  pagar.hidden = !pp.length;
  pagar.innerHTML = pp.length ? `<h2 class="mm-en30-tit" id="t-pagar">Qué tenés que pagar</h2><ul class="mm-pagar-lista">${pp.map(e => `<li>
      <span class="mm-pagar-dia">${e.dias === 0 ? 'Hoy' : e.dias === 1 ? 'Mañana' : esc(fechaCorta(e.fecha))}</span><span class="mm-pagar-nom">${esc(e.nombre)}</span><b>${esc($(e.monto))}</b></li>`).join('')}</ul>` : '';
  /* 3 · qué tenés que revisar (incluye los avisos) */
  const { lista, masTarde } = itemsRevisar(lim);
  rev.hidden = false;
  const visibles = revisaAbierta ? lista : lista.slice(0, 3);
  rev.innerHTML = `<h2 class="mm-en30-tit" id="t-revisa">Qué tenés que revisar${lista.length ? ` <span class="mm-en30-n">${lista.length}</span>` : ''}</h2>
    ${lista.length ? `<div class="mm-revisa-lista">${visibles.map(filaRevisar).join('')}</div>` : `<p class="mm-al-dia">${ic('check')} Tu mes está al día.</p>`}
    ${lista.length > 3 ? `<button type="button" class="mm-link mm-revisa-mas" data-revisa-mas aria-expanded="${revisaAbierta}">${revisaAbierta ? 'Ver menos' : `Ver ${lista.length - 3} más`}</button>` : ''}
    ${masTarde.length ? `<details class="mm-luego"><summary>Más tarde (${masTarde.length})</summary><p class="mm-fuente">Mueven menos del 1 % de tus ingresos, no mueven plata o los dejaste para después.</p><div class="mm-revisa-lista">${masTarde.map(preguntaHTML).join('')}</div></details>` : ''}`;
}

/* ════════ (3) QUÉ CAMBIÓ ════════
   La foto base es la proyección la última vez que dijiste "Entendido" (o la
   primera vez que abriste con esto encendido). Cada cambio importante queda
   anotado con su motivo; el diff se calcula siempre contra el estado actual. */
function registrarCambio(motivo) {
  if (!F.queCambio) return;
  datos.fotoBase ||= fotoProyeccion(datos, HOY);
  datos.cambios = [...(datos.cambios || []), { motivo, fecha: new Date().toISOString().slice(0, 16) }].slice(-20);
}

/* ── TNA de financiación: supuesto editable (QA v2 · 6) ── */
function abrirTNA() {
  const v = window.prompt('TNA de financiación en % (la informa tu resumen, por ejemplo 89,5):', String(supuesto(datos, 'financiacion').valor).replace('.', ','));
  if (v === null) return;
  const n = numero(v);
  if (n === null || n <= 0 || n >= 500) return avisar('Revisá la TNA: un número entre 1 y 499');
  datos.supuestos = { ...datos.supuestos, financiacion: { valor: n, fecha: HOY_ISO } }; guardar(); pintarTodo();
  avisar(`Listo: usamos TNA ${String(n).replace('.', ',')} % para estimar los intereses`);
}

/* ── resumen vencido: pagué otro monto ── */
let pagoDe = null;
$id('dlg-pago').querySelector('form').addEventListener('submit', e => {
  e.preventDefault();
  const v = leerMonto($id('p-monto').value);
  if (v === null) { error($id('p-monto'), 'p-monto-err', 'Escribí el monto, por ejemplo 100.000.').focus(); return; }
  datos = registrarPagoResumen(datos, pagoDe, { estado: 'otro', monto: v }); guardar(); pintarTodo(); cerrar($id('dlg-pago'));
  const rr = datos.resumenes.find(x => x.id === pagoDe), f = rr ? financiacionEstimada(rr, datos) : null;
  avisar(f?.total ? `Pasan ${$(f.saldo)} al mes que viene, más ${$(f.interes)} de intereses estimados` : 'Listo, pagado');
});

/* ════════ (7) CAMBIAR O DEJAR UNA TARJETA ════════ */
function cambioTarjetaHTML(t) {
  const cs = (datos.cambiosTarjeta || []).filter(c => c.desde === t.id || c.hacia === t.id);
  if (!cs.length && !t.baja) return '';
  return cs.map(c => {
    const v = verificarCambio(datos, c);
    const de = tarjetaDe(c.desde)?.nombre, a = c.hacia ? tarjetaDe(c.hacia)?.nombre : null;
    const hechos = new Set(c.checklist);
    return `<section class="mm-panel mm-cambiotj" aria-label="Cambio de tarjeta">
      <p class="mm-item-meta">${a ? `Cambio de ${esc(de)} a ${esc(a)}` : `Dejaste ${esc(de)}`} · ${esc(fechaAR(c.fecha))}</p>
      ${v.texto ? `<p class="mm-meta-txt">${esc(v.texto)}</p>` : ''}
      <ul class="mm-check-lista">${CHECKLIST_CAMBIO.map(k => `<li><label class="mm-check"><input type="checkbox" data-ct-check="${esc(c.id)}" value="${k.id}"${hechos.has(k.id) ? ' checked' : ''}> <span>${esc(k.texto)}</span></label></li>`).join('')}</ul>
      <p class="mm-fuente">El historial de ${esc(de)} queda guardado.</p></section>`;
  }).join('');
}
const dct = $id('dlg-cambiotj');
let ctDesde = null;
function abrirCambioTj(id) {
  ctDesde = id;
  const a = asistenteCambio(datos, id, HOY_ISO);
  const otras = datos.tarjetas.filter(t => t.id !== id && !t.baja);
  $id('ct-cuerpo').innerHTML = `
    <fieldset class="mm-campo"><legend>¿Qué querés hacer?</legend><div class="mm-chips">${otras.map((t, i) => `<label class="mm-chip"><input type="radio" name="ct-hacia" value="${esc(t.id)}"${i === 0 ? ' checked' : ''}><span>Pasar a ${esc(t.nombre)}</span></label>`).join('')}
      <label class="mm-chip"><input type="radio" name="ct-hacia" value=""${otras.length ? '' : ' checked'}><span>Dejarla</span></label></div></fieldset>
    <fieldset class="mm-campo"><legend>Gastos fijos que se debitan de ${esc(a.tarjeta.nombre)}</legend>
      ${a.gastos.length ? a.gastos.map(g => `<label class="mm-check"><input type="checkbox" name="ct-g" value="${esc(g.id)}" checked> <span>${esc(g.nombre)} · ${esc($(g.monto))}</span></label>`).join('') : '<p class="mm-fuente">No marcaste gastos fijos en esta tarjeta. Podés hacerlo en cada gasto: "¿Se debita de una tarjeta?".</p>'}</fieldset>
    <div class="mm-campo"><p class="mm-item-meta">Cuotas que faltan</p>${a.cuotas.length ? `<p class="mm-meta-txt">${a.cuotas.map(c => `${esc(c.nombre)}: ${c.cuotas} cuota${c.cuotas === 1 ? '' : 's'} (${esc(fm(c.restan, c.moneda))})`).join(' · ')}. Siguen saliendo en esta tarjeta hasta ${esc(nombreMes(a.ultimaCuota))}.</p>` : '<p class="mm-fuente">No quedan cuotas.</p>'}</div>
    ${a.devoluciones.length ? `<div class="mm-campo"><p class="mm-item-meta">Devoluciones esperadas</p><p class="mm-meta-txt">${a.devoluciones.map(d => `${esc(d.motivo)} (${esc($(d.monto))})`).join(' · ')}</p></div>` : ''}
    <p class="mm-fuente">Después vas a tener una checklist en la tarjeta, y cuando subas el resumen de la nueva verificamos qué ya se cobró ahí.</p>`;
  abrir(dct, dct.querySelector('[name="ct-hacia"]'));
}
dct.querySelector('form').addEventListener('submit', e => {
  e.preventDefault();
  const hacia = dct.querySelector('[name="ct-hacia"]:checked')?.value || null;
  const gastos = [...dct.querySelectorAll('[name="ct-g"]:checked')].map(i => i.value);
  datos = aplicarCambio(datos, { desde: ctDesde, hacia, gastos, fecha: HOY_ISO }); guardar(); pintarTodo(); cerrar(dct);
  avisar(hacia ? `Listo: ${gastos.length} gasto${gastos.length === 1 ? '' : 's'} pasan a ${tarjetaDe(hacia)?.nombre}` : 'Listo: la tarjeta queda como dada de baja, con su historial');
});
document.addEventListener('change', e => {
  const c = e.target.closest?.('[data-ct-check]');
  if (!c) return;
  datos.cambiosTarjeta = datos.cambiosTarjeta.map(x => (x.id === c.dataset.ctCheck ? { ...x, checklist: c.checked ? [...new Set([...x.checklist, c.value])] : x.checklist.filter(k => k !== c.value) } : x));
  guardar();
});

/* ════════ SUBÍ LO QUE TENGAS (tanda 14) ════════
   Varios archivos a la vez, de a PARALELO_DOCS. Cada uno: se prepara (HEIC →
   JPG, fotos grandes se achican), se reconoce por su huella (si ya se subió,
   no se lee de nuevo), se clasifica y, si es un resumen o una factura, lo lee
   su lector. Nada se guarda hasta "Guardar todo". */
let cola = [];
let itemsLeido = [];
const ESTADOS = { cola: 'En cola', leyendo: 'Leyendo…', listo: 'Listo', error: 'No se pudo leer', repetido: 'Ya lo subiste', otro: 'No pudimos saber qué es', manual: 'Cargalo a mano' };
const CLAVE_VISITAS = 'orbit:mi-mes:visitas';
function visitas() {
  try {
    const v = JSON.parse(localStorage.getItem(CLAVE_VISITAS) || '{}');
    if (v.dia !== HOY_ISO) { v.n = (v.n || 0) + 1; v.dia = HOY_ISO; localStorage.setItem(CLAVE_VISITAS, JSON.stringify(v)); }
    return v.n || 1;
  } catch { return 1; }
}
const VISITAS = visitas();
function pintarSubir() {
  const hayDatos = datos.ingresos.length || datos.gastos.length || datos.resumenes.length;
  $id('t-subir').textContent = hayDatos ? 'Actualizá con lo de este mes' : 'Subí todos los resúmenes que tengas';
  $id('subir-sub').textContent = hayDatos
    ? 'Subí el resumen de este mes de cada tarjeta y las facturas nuevas: reemplazan a los estimados y te contamos qué cambió.'
    : 'Viejos o actuales: resúmenes de tarjeta de varios meses, recibos de sueldo, facturas y capturas del homebanking. Con el historial armamos tu mes.';
  $id('ejemplos').innerHTML = EJEMPLOS_DOC.map(e => `<li>${ic(e.icono)}<span>${esc(e.texto)}</span></li>`).join('');
  $id('cola').innerHTML = cola.map(x => `<li class="mm-cola-it ${x.estado}">
      <span class="mm-cola-ic">${ic(x.estado === 'listo' ? 'check' : x.estado === 'error' || x.estado === 'otro' ? 'alerta' : 'subir')}</span>
      <span class="mm-cola-txt"><b>${esc(x.nombre)}</b><small>${esc(x.estado === 'listo' ? TIPOS_DOC[x.tipo] + (x.confiable === false ? ' · leído con dudas' : '') : x.estado === 'repetido' ? `Ya lo subiste${x.yaFecha ? ` el ${fechaAR(x.yaFecha)}` : ''}: no lo leemos de nuevo` : x.error || ESTADOS[x.estado])}</small>
      ${x.estado === 'otro' ? `<span class="mm-chips mm-cola-chips">${['resumen', 'factura', 'recibo', 'captura'].map(t => `<button type="button" class="mm-chip" data-tipo-doc="${t}" data-doc="${esc(x.id)}">${esc(TIPOS_DOC[t])}</button>`).join('')}</span>` : ''}
      ${x.estado === 'error' ? `<button type="button" class="mm-link" data-reintentar="${esc(x.id)}">Reintentar</button>` : ''}
      ${x.estado === 'manual' ? `<button type="button" class="mm-link" data-nuevo="${x.tipo === 'recibo' ? 'ingreso' : 'cuota'}">Cargar a mano</button>` : ''}</span>
      ${x.estado === 'leyendo' ? '<span class="mm-spinner chico" aria-hidden="true"></span>' : ''}</li>`).join('');
  const pendientes = cola.some(x => ['cola', 'leyendo'].includes(x.estado));
  const listos = cola.filter(x => x.estado === 'listo').length;
  $id('ir-revisar').hidden = !listos || pendientes;
  $id('ir-revisar').textContent = `Revisar lo que leí (${listos})`;
  $id('conectar-mail').hidden = !F.conectarMail;
  $id('quitar-permiso').hidden = !F.conectarMail;
  if (F.conectarMail && !$id('quitar-permiso-txt').dataset.listo) {
    $id('quitar-permiso-txt').dataset.listo = '1';
    import('./correo-mi-mes.js').then(({ QUITAR_PERMISO: q }) => {
      $id('quitar-permiso-txt').innerHTML = `<p class="mm-fuente">${esc(q.microsoft.texto)}</p>
        <p><a class="mm-link" href="${q.microsoft.personal}" target="_blank" rel="noopener noreferrer">Quitar permiso de Microsoft (cuenta personal)</a></p>
        <p><a class="mm-link" href="${q.microsoft.trabajo}" target="_blank" rel="noopener noreferrer">Quitar permiso de Microsoft (trabajo o facultad)</a></p>
        <p class="mm-fuente">${esc(q.google.texto)}</p><p><a class="mm-link" href="${q.google.url}" target="_blank" rel="noopener noreferrer">Permisos de tu cuenta de Google</a></p>`;
    }).catch(() => {});
  }
}
async function prepararArchivo(f) {
  const heic = /heic|heif/i.test(f.type) || /\.(heic|heif)$/i.test(f.name);
  const imagen = heic || /^image\//.test(f.type);
  if (!imagen) return f;
  if (!heic && f.size <= 3_500_000 && /^image\/(jpeg|png|webp)$/.test(f.type)) return f;
  /* HEIC (iPhone) o fotos pesadas: a JPG de hasta 2200 px, si el navegador puede abrirlas */
  let bmp;
  try { bmp = await createImageBitmap(f); } catch { throw new Error(heic ? 'Este navegador no abre fotos HEIC: exportala como JPG o sacale una captura.' : 'No pudimos abrir esa imagen.'); }
  const k = Math.min(1, 2200 / Math.max(bmp.width, bmp.height));
  const c = Object.assign(document.createElement('canvas'), { width: Math.round(bmp.width * k), height: Math.round(bmp.height * k) });
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return await new Promise(ok => c.toBlob(b => ok(b), 'image/jpeg', 0.85));
}
async function postDoc(blob, query) {
  let r;
  try { r = await fetch(`/api/mi-mes-leer${query}`, { method: 'POST', body: blob, credentials: 'same-origin', headers: { 'Content-Type': 'application/octet-stream' } }); }
  catch { throw new Error(SIN_RED); }
  const j = await r.json().catch(() => null);
  /* QA t14 · 3: si se pasó de tiempo (aunque Vercel corte sin JSON), no es la conexión */
  if (r.status === 504 && !j?.error) throw new Error('Tardó demasiado: probá de nuevo o cargalo a mano.');
  if (!r.ok || !j?.ok) throw new Error(j?.error || SIN_RED);
  return j;
}
async function leerUno(x, tipoForzado = null) {
  x.estado = 'leyendo'; x.error = ''; pintarSubir();
  try {
    const blob = x.blob || (x.blob = await prepararArchivo(x.file));
    if (blob.size > MAX_BYTES_DOC) throw new Error('El archivo pesa más de 4 MB. Probá con una foto más chica.');
    if (!x.huella) x.huella = await huella(await blob.arrayBuffer());
    if (!tipoForzado) {
      const otro = cola.find(o => o !== x && o.huella === x.huella && o.estado !== 'repetido');
      const ya = yaSubido(datos, x.huella);
      if (otro || ya) { x.estado = 'repetido'; x.yaFecha = ya?.fecha || null; return; }
    }
    let tipo = tipoForzado, j = null;
    if (LOCAL) {
      await new Promise(r => setTimeout(r, 250));
      const c = clasificarDeEjemplo(x.nombre, HOY_ISO);
      tipo ||= c.tipo;
      j = tipo === 'resumen' ? { lectura: resumenEjemplo() } : tipo === 'factura' ? { propuesta: facturaDeEjemplo(x.nombre, HOY_ISO) } : { lectura: c };
    } else {
      if (!tipo) {
        j = await postDoc(blob, modoLectura === 'prueba' ? `?nombre=${encodeURIComponent(x.nombre.slice(0, 80))}` : '');
        tipo = j.tipo;
      }
      if (tipo === 'resumen' || tipo === 'factura') j = await postDoc(blob, `?tipo=${tipo}`);
    }
    x.tipo = tipo;
    if (tipo === 'otro') { x.estado = 'otro'; return; }
    if (tipoForzado && ['recibo', 'captura'].includes(tipo)) { x.estado = 'manual'; return; }
    if (tipo === 'resumen') {
      const v = validarLectura(j.lectura);
      if (!v.ok) throw new Error('No encontramos los datos clave del resumen. Cargalo a mano.');
      x.lectura = v.lectura; x.confiable = j.confiable !== false && v.lectura.confianza === 'alta';
    } else if (tipo === 'factura') { x.propuesta = j.propuesta; if (!x.propuesta?.monto) x.confiable = false; }
    else x.lectura = j.lectura;
    x.estado = 'listo';
  } catch (e) { x.estado = 'error'; x.error = e?.message || 'No se pudo leer'; }
  finally { pintarSubir(); }
}
async function procesarCola() {
  const trabajador = async () => { for (let x; (x = cola.find(c => c.estado === 'cola'));) await leerUno(x); };
  await Promise.all(Array.from({ length: PARALELO_DOCS }, trabajador));
}
function agregarArchivos(files) {
  for (const f of files) cola.push({ id: nuevoId(), nombre: f.name || 'archivo', file: f, estado: 'cola' });
  pintarSubir(); procesarCola();
}
$id('archivos').addEventListener('change', e => { agregarArchivos([...e.target.files]); e.target.value = ''; });
const drop = $id('drop');
['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('sobre'); }));
['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('sobre'); }));
drop.addEventListener('drop', e => agregarArchivos([...(e.dataTransfer?.files || [])]));
$id('vista-subir').addEventListener('click', e => {
  const t = e.target;
  const td = t.closest('[data-tipo-doc]');
  if (td) { const x = cola.find(c => c.id === td.dataset.doc); if (x) leerUno(x, td.dataset.tipoDoc); return; }
  const re = t.closest('[data-reintentar]');
  if (re) { const x = cola.find(c => c.id === re.dataset.reintentar); if (x) leerUno(x); return; }
  if (t.closest('[data-a-mano]')) { verVista('inicio'); return abrirGuia(); }
  if (t.closest('[data-ir-revisar]')) return irALeido();
});
function irALeido() {
  const tjDefault = datos.tarjetas[0]?.id || null;
  const lecturas = cola.filter(x => x.estado === 'listo').map(x => ({ archivo: x.id, tipo: x.tipo, lectura: x.tipo === 'factura' ? x.propuesta : x.lectura, confiable: x.confiable, tarjetaId: tjDefault }));
  itemsLeido = consolidar(lecturas, datos, HOY_ISO);
  verVista('leido');
}
const GRUPOS_LEIDO = [['ingresos', 'Ingresos'], ['gastos', 'Gastos fijos'], ['tarjetas', 'Tarjetas'], ['compras', 'Compras nuevas'], ['saldo', 'Saldo de hoy']];
const ACCION_TXT = { nuevo: 'Nuevo', actualizar: 'Actualiza', igual: 'Ya estaba', viejo: 'Más viejo: no pisa lo nuevo', historial: 'Historial' };
function pintarLeido() {
  const fila = it => {
    const editable = ['ingresos', 'gastos', 'compras', 'saldo'].includes(it.grupo) && !['viejo', 'igual'].includes(it.accion);
    return `<li class="mm-leido-it${it.descartado ? ' fuera' : ''}" data-it="${esc(it.id)}">
      <label class="mm-check"><input type="checkbox" data-it-incluir ${it.descartado || ['viejo', 'igual'].includes(it.accion) ? '' : 'checked'} ${['viejo', 'igual'].includes(it.accion) ? 'disabled' : ''}><span class="mm-sr">Incluir ${esc(it.titulo)}</span></label>
      <span class="mm-leido-txt"><b>${esc(it.titulo)}</b><small>${esc(it.detalle || '')}</small>
        <span class="mm-tag ${it.accion === 'nuevo' ? '' : 'ext'}">${esc(ACCION_TXT[it.accion] || '')}${it.accion === 'actualizar' && it.antes != null ? ` ${$(it.antes)} → ${$(it.monto)}` : ''}</span>
        ${it.pregunta ? `<label class="mm-check mm-reemplaza"><input type="checkbox" data-it-reemplaza ${it.accion === 'actualizar' || it.separar ? 'checked' : ''}> <span>${esc(it.pregunta)}</span></label>` : ''}
        ${it.grupo === 'tarjetas' && it.confiable === false ? '<span class="mm-tag">Leído con dudas: revisá el total</span>' : ''}
        ${it.grupo === 'compras' ? `<label class="mm-sr" for="tj-${esc(it.id)}">Tarjeta</label><select id="tj-${esc(it.id)}" data-it-tarjeta>${datos.tarjetas.length ? datos.tarjetas.map(t => `<option value="${esc(t.id)}"${t.id === it.compra.tarjetaId ? ' selected' : ''}>${esc(t.nombre)}</option>`).join('') : `<option value="">${itemsLeido.some(i => i.grupo === 'tarjetas') ? 'La del resumen que subiste' : 'Primero agregá la tarjeta'}</option>`}</select>` : ''}</span>
      ${editable ? `<span class="mm-leido-monto"><label class="mm-sr" for="m-${esc(it.id)}">Monto de ${esc(it.titulo)}</label><input id="m-${esc(it.id)}" type="text" inputmode="decimal" data-it-monto value="${esc(sinSimbolo(it.monto, 'ARS'))}"></span>` : `<b class="mm-leido-total">${esc($(it.monto || 0))}</b>`}
    </li>`;
  };
  $id('leido').innerHTML = !itemsLeido.length ? '<p class="mm-vacio">No hay nada para guardar. Subí otro archivo o cargalo a mano.</p>'
    : GRUPOS_LEIDO.map(([g, tit]) => {
      const its = itemsLeido.filter(i => i.grupo === g);
      if (!its.length) return '';
      const vivos = its.filter(i => !['viejo', 'historial'].includes(i.accion)), viejos = its.filter(i => ['viejo', 'historial'].includes(i.accion));
      return `<section class="mm-panel" aria-label="${esc(tit)}"><h2 class="mm-h2">${esc(tit)}</h2><ul class="mm-leido">${vivos.map(fila).join('')}</ul>
        ${viejos.length ? `<details class="mm-luego"><summary>${g === 'tarjetas' ? `Historial (${viejos.length})` : `Más viejos (${viejos.length}): no pisan a lo nuevo`}</summary><ul class="mm-leido">${viejos.map(fila).join('')}</ul></details>` : ''}</section>`;
    }).join('');
}
$id('leido').addEventListener('change', e => {
  const li = e.target.closest('[data-it]');
  const it = li && itemsLeido.find(i => i.id === li.dataset.it);
  if (!it) return;
  if (e.target.matches('[data-it-incluir]')) { it.descartado = !e.target.checked; li.classList.toggle('fuera', it.descartado); }
  if (e.target.matches('[data-it-reemplaza]') && (it.separar || it._separar)) {
    /* QA t15 · 2: sí (por defecto) lo separa del "Servicios" genérico; no, lo suma aparte */
    if (!it._separar) it._separar = it.separar;
    it.separar = e.target.checked ? it._separar : null;
    return;
  }
  if (e.target.matches('[data-it-reemplaza]')) {
    /* QA t14 · 2: sí (por defecto) actualiza el gasto que ya tenías; no, lo suma como uno nuevo */
    if (!it._previo) it._previo = { previoId: it.previoId, antes: it.antes };
    if (e.target.checked) { it.accion = 'actualizar'; it.previoId = it._previo.previoId; it.antes = it._previo.antes; }
    else { it.accion = 'nuevo'; it.previoId = null; it.antes = null; }
    return pintarLeido();
  }
  if (e.target.matches('[data-it-tarjeta]')) { it.compra.tarjetaId = e.target.value || null; it.compra.primerMes = null; }
});
function guardarTodo() {
  let mal = null;
  for (const li of $id('leido').querySelectorAll('[data-it]')) {
    const it = itemsLeido.find(i => i.id === li.dataset.it);
    const inp = li.querySelector('[data-it-monto]');
    if (!it || !inp || it.descartado) continue;
    const v = leerMonto(inp.value);
    if (!v) { inp.setAttribute('aria-invalid', 'true'); mal ||= inp; continue; }
    inp.removeAttribute('aria-invalid');
    it.monto = v;
    if (it.gasto) it.gasto.monto = v;
    if (it.ingreso) it.ingreso.monto = v;
    if (it.compra) it.compra.total = v;
    if (it.cuenta) it.cuenta.saldo = v;
  }
  if (mal) { avisar('Revisá ese monto (los centavos van con coma).'); return mal.focus(); }
  const eraVacio = !datos.ingresos.length && !datos.gastos.length && !datos.cuotas.length && !datos.resumenes.length;
  const r = aplicarItems(datos, itemsLeido, { nuevoId, hoy: HOY_ISO });
  datos = r.datos;
  const subidos = cola.filter(x => x.estado === 'listo' && x.huella);
  datos.documentos = [...(datos.documentos || []), ...subidos.map(x => ({ huella: x.huella, tipo: x.tipo, fecha: HOY_ISO }))].slice(-200);
  /* en el primer uso, lo subido es el punto de partida (no un "cambio"); después, qué cambió lo explica */
  if (eraVacio) { if (F.queCambio) { datos.fotoBase = fotoProyeccion(datos, HOY); datos.cambios = []; } }
  else registrarCambio('Subiste documentos');
  guardar();
  try { localStorage.setItem(GUIA, '1'); } catch {}
  cola = []; itemsLeido = [];
  mes = HOY;
  pintarTodo(); verVista('inicio');
  const n = r.n;
  if (r.n.avisos?.length) return avisar(`Guardado. ${r.n.avisos.join(' ')}`);
  if (r.n.sinTarjeta) return avisar(`Guardado. ${r.n.sinTarjeta} compra${r.n.sinTarjeta === 1 ? '' : 's'} de la captura no se guardaron porque no elegiste la tarjeta: cargalas a mano.`);
  avisar(`Listo: ${[n.resumenes && `${n.resumenes} resumen${n.resumenes === 1 ? '' : 'es'}`, n.ingresos && `${n.ingresos} ingreso${n.ingresos === 1 ? '' : 's'}`, n.gastos && `${n.gastos} gasto${n.gastos === 1 ? '' : 's'} fijo${n.gastos === 1 ? '' : 's'}`, n.compras && `${n.compras} compra${n.compras === 1 ? '' : 's'}`, n.actualizados && `${n.actualizados} actualizado${n.actualizados === 1 ? '' : 's'}`].filter(Boolean).join(', ') || 'nada nuevo'}`);
}
/* ── conectar el mail (etapa 3; interruptor conectarMail) ── */
async function conectarMail() {
  if (!F.conectarMail) return;
  try {
    const { buscarDocumentosEnMail } = await import('./correo-mi-mes.js');
    const encontrados = await buscarDocumentosEnMail(n => { $id('subir-sub').textContent = `Buscando en tu mail… ${n} archivos`; });
    if (!encontrados.length) return avisar('No encontramos resúmenes, facturas ni recibos en tu mail.');
    agregarArchivos(encontrados.map(x => new File([x.bytes], x.nombre, { type: 'application/pdf' })));
  } catch (e) { avisar(e?.message || 'Por ahora subí los PDF; te avisamos cuando se habilite.'); }
}

/* ════════ (6) TE TIENEN QUE DEVOLVER ════════ */
const fechaAR = d => (d ? `${Number(d.slice(8))}/${Number(d.slice(5, 7))}` : '');
function pintarDevolver() {
  const b = bandejaDevolver(datos, HOY_ISO);
  const fila = x => `<li class="mm-dev${x.vencido ? ' vencido' : ''}">
      <div class="mm-dev-cab"><b>${esc(x.motivo)}</b><b>${esc(fm(x.monto, x.moneda || 'ARS'))}</b></div>
      <p class="mm-fuente">${esc(TIPOS_DEVOLVER[x.tipo])}${x.quien ? ` · ${esc(x.quien)}` : ''}${x.esperada ? ` · esperado el ${esc(fechaAR(x.esperada))}` : ''}${x.vencido ? ' · <b class="neg">ya debería estar</b>' : ''}${x.origen === 'compartida' ? ' · de una compra compartida' : ''}</p>
      <div class="mm-meta-acc">${x.origen === 'compartida' ? `<button type="button" class="mm-link" data-editar="cuota" data-id="${esc(x.cuotaId)}">Ver la compra</button>`
        : `<button type="button" class="mm-btn sec chico" data-dev-ok="${esc(x.id)}">Ya me lo acreditaron</button>`}
        ${x.vencido ? `<button type="button" class="mm-link" data-dev-reclamo="${esc(x.id)}">Copiar mensaje de reclamo</button>` : ''}
        ${x.origen !== 'compartida' ? `<button type="button" class="mm-link quieto" data-dev-borrar="${esc(x.id)}">Borrar</button>` : ''}</div></li>`;
  const totTxt = Object.entries(b.totales).map(([m, v]) => fm(v, m)).join(' · ') || $(0);
  $id('devolver').innerHTML = `<section class="mm-panel"><p class="mm-item-meta">Pendiente</p><p class="mm-total-num">${esc(totTxt)}</p>
      <p class="mm-fuente">No suma a te quedan libres ni a tus ingresos hasta que se acredita.</p>
      ${b.pendientes.length ? `<ul class="mm-dev-lista">${b.pendientes.map(fila).join('')}</ul>` : '<p class="mm-vacio">No tenés nada pendiente.</p>'}</section>
    ${b.candidatos.length ? `<section class="mm-panel"><h2 class="mm-h2">En tus resúmenes</h2><p class="mm-fuente">Créditos que pueden ser un reintegro o una devolución. Vos decidís.</p>
      <ul class="mm-dev-lista">${b.candidatos.map(c => `<li class="mm-dev"><div class="mm-dev-cab"><span>${esc(c.concepto)} · ${esc(fechaAR(c.fecha))}</span><b>${esc($(c.monto))}</b></div>
        <div class="mm-meta-acc">${c.parecido.map(id => { const p = datos.devolver.find(x => x.id === id); return `<button type="button" class="mm-btn sec chico" data-dev-vincular="${esc(id)}" data-res="${esc(c.resumenId)}" data-i="${c.i}">Es ${esc(p.motivo)}</button>`; }).join('')}</div></li>`).join('')}</ul></section>` : ''}
    ${b.acreditados.length ? `<section class="mm-panel"><h2 class="mm-h2">Ya acreditado</h2><ul class="mm-dev-lista">${b.acreditados.slice(-10).reverse().map(x => `<li class="mm-dev"><div class="mm-dev-cab"><span>${esc(x.motivo)} · ${esc(fechaAR(x.acreditado))}</span><b>${esc($(x.monto))}</b></div></li>`).join('')}</ul></section>` : ''}
    <p class="mm-letra">Mi Mes no envía nada: el mensaje de reclamo lo copiás y lo mandás vos, si querés.</p>`;
}
const ddv = $id('dlg-devolver');
let devTipo = 'reintegro', devEsperada = null;
let devCuota = null;
function abrirDevolver(cuotaId = null) {
  devCuota = cuotaId;
  devTipo = 'reintegro'; devEsperada = sumarDias(HOY_ISO, 30);
  $id('dv-tipos').innerHTML = Object.entries(TIPOS_DEVOLVER).map(([k, v]) => `<label class="mm-chip"><input type="radio" name="dv-tipo" value="${k}"${k === devTipo ? ' checked' : ''}><span>${esc(v)}</span></label>`).join('');
  $id('dv-esperada').innerHTML = [15, 30, 60, 90].map(n => { const f = sumarDias(HOY_ISO, n); return `<label class="mm-chip"><input type="radio" name="dv-esp" value="${f}"${f === devEsperada ? ' checked' : ''}><span>En ${n} días</span></label>`; }).join('');
  for (const id of ['dv-motivo', 'dv-monto', 'dv-quien']) $id(id).value = '';
  abrir(ddv, $id('dv-monto'));
}
ddv.addEventListener('change', e => { if (e.target.name === 'dv-tipo') devTipo = e.target.value; if (e.target.name === 'dv-esp') devEsperada = e.target.value; });
ddv.querySelector('form').addEventListener('submit', e => {
  e.preventDefault();
  const monto = leerMonto($id('dv-monto').value);
  if (!monto) { error($id('dv-monto'), 'dv-monto-err', 'Escribí el monto, por ejemplo 8.000.').focus(); return; }
  datos.devolver = [...datos.devolver, { id: nuevoId(), tipo: devTipo, motivo: $id('dv-motivo').value.trim().slice(0, 80) || TIPOS_DEVOLVER[devTipo], monto, fecha: HOY_ISO, esperada: devEsperada, quien: $id('dv-quien').value.trim().slice(0, 40), ...(devCuota ? { cuotaId: devCuota } : {}) }];
  guardar(); cerrar(ddv); pintarDevolver(); pintarInicio(); avisar('Agregado a la bandeja');
});
$id('vista-devolver').addEventListener('click', async e => {
  const t = e.target;
  if (t.closest('[data-dev-nuevo]')) return abrirDevolver();
  const ok = t.closest('[data-dev-ok]');
  if (ok) { datos.devolver = datos.devolver.map(x => (x.id === ok.dataset.devOk ? { ...x, acreditado: HOY_ISO } : x)); guardar(); pintarDevolver(); pintarInicio(); return avisar('Listo: acreditado'); }
  const vi = t.closest('[data-dev-vincular]');
  if (vi) { datos.devolver = datos.devolver.map(x => (x.id === vi.dataset.devVincular ? { ...x, acreditado: HOY_ISO, credito: { resumenId: vi.dataset.res, i: Number(vi.dataset.i) } } : x)); guardar(); pintarDevolver(); pintarInicio(); return avisar('Listo: vinculado con el resumen'); }
  const bo = t.closest('[data-dev-borrar]');
  if (bo) { datos.devolver = datos.devolver.filter(x => x.id !== bo.dataset.devBorrar); guardar(); pintarDevolver(); pintarInicio(); return avisar('Borrado'); }
  const re = t.closest('[data-dev-reclamo]');
  if (re) {
    const x = bandejaDevolver(datos, HOY_ISO).pendientes.find(i => i.id === re.dataset.devReclamo);
    const tj = x?.cuotaId ? tarjetaDe(datos.cuotas.find(c => c.id === x.cuotaId)?.tarjetaId)?.nombre : '';
    const txt = mensajeReclamo(x, { tarjeta: tj || '' });
    try { await navigator.clipboard.writeText(txt); avisar('Mensaje copiado: pegalo donde quieras mandarlo'); }
    catch { window.prompt('Copiá el mensaje:', txt); }
  }
});

/* ════════ (5) GASTO ESTIMADO ════════ */
const dr = $id('dlg-real');
let realDe = null;
function abrirReal(id) {
  const g = datos.gastos.find(x => x.id === id);
  if (!g) return;
  realDe = id;
  $id('dr-tit').textContent = `¿Cuánto vino ${g.nombre}?`;
  $id('dr-est').textContent = `Estimamos ${$(g.monto)} para ${nombreMes(HOY)}. El monto real cuenta solo para este mes.`;
  $id('r-monto').value = sinSimbolo(datos.reales?.[HOY]?.[id] ?? g.monto, 'ARS');
  abrir(dr, $id('r-monto'));
}
dr.querySelector('form').addEventListener('submit', e => {
  e.preventDefault();
  const v = leerMonto($id('r-monto').value);
  if (v === null) { error($id('r-monto'), 'r-monto-err', 'Escribí el monto, por ejemplo 72.000.').focus(); return; }
  const r = confirmarGasto(datos, realDe, HOY, v);
  datos = r.datos; registrarCambio('Cargaste un monto real'); guardar(); pintarTodo(); cerrar(dr); avisar(r.texto);
});

/* ════════ (4) DÍA DIFÍCIL ════════ */
function pintarDificil() {
  const el = $id('dificil');
  if (!F.diaDificil || mes !== HOY || !datos.ingresos.length) { el.hidden = true; el.innerHTML = ''; return; }
  el.hidden = false;
  const p = proyeccionSaldo(datos, HOY_ISO);
  if (!p) {
    el.innerHTML = `<div class="mm-seccion-top"><h2 id="t-dificil" tabindex="-1">Tu saldo día por día</h2></div>
      <p class="mm-meta-txt">Opcional: con lo que tenés hoy en tu cuenta te avisamos si algún día del mes falta plata para los pagos, aunque el mes cierre bien.</p>
      <div class="mm-meta-acc"><button type="button" class="mm-btn sec" data-saldo>¿Cuánto tenés hoy?</button></div>`;
    return;
  }
  const clave = p.dias.filter(d => d.eventos.length || d.fecha === p.minimo.fecha);
  el.innerHTML = `<div class="mm-seccion-top"><h2 id="t-dificil" tabindex="-1">Tu saldo día por día</h2><button type="button" class="mm-link" data-saldo>Actualizar saldo</button></div>
    <p class="mm-dificil-msg ${p.falta ? 'falta' : 'ok'}">${esc(p.mensaje)}</p>
    <ol class="mm-lm-lista">${clave.map(d => `<li class="mm-lm-fila${d.fecha === p.minimo.fecha && p.falta ? ' antes' : ''}">
      <span class="mm-lm-dia">${esc(d.fecha === HOY_ISO ? 'Hoy' : fechaCorta(d.fecha))}</span>
      <span class="mm-lm-txt"><b>${d.eventos.length ? esc(d.eventos.map(e => `${e.tipo === 'cobro' ? 'Cobrás' : 'Pagás'} ${e.tipo === 'cobro' ? e.nombre.toLowerCase() : e.nombre}`).join(' · ')) : 'Tu saldo'}</b>${d.saldo < 0 ? '<small>Falta plata</small>' : ''}</span>
      <span class="mm-lm-monto${d.saldo < 0 ? ' neg' : ''}">${esc($(d.saldo))}</span></li>`).join('')}</ol>
    <details class="mm-supuestos"><summary>Supuestos de esta cuenta</summary><ul>${p.supuestos.map(x => `<li>${esc(x)}</li>`).join('')}</ul></details>`;
}
const dsa = $id('dlg-saldo');
function filaSaldo(c, i) {
  const nombre = c?.nombre || CUENTAS_COMUNES[i] || 'Otra';
  const ops = CUENTAS_COMUNES.includes(nombre) ? CUENTAS_COMUNES : [nombre, ...CUENTAS_COMUNES];
  return `<fieldset class="mm-campo mm-saldo-fila" data-fila="${i}"><legend>Cuenta ${i + 1}</legend>
    <div class="mm-chips">${ops.map(n => `<label class="mm-chip"><input type="radio" name="sa-n-${i}" value="${esc(n)}"${n === nombre ? ' checked' : ''}><span>${esc(n)}</span></label>`).join('')}</div>
    <label class="mm-sr" for="sa-m-${i}">Saldo de la cuenta ${i + 1}, en pesos</label>
    <input id="sa-m-${i}" class="mm-grande" type="text" inputmode="decimal" autocomplete="off" placeholder="Saldo en pesos" value="${c ? esc(sinSimbolo(c.saldo, 'ARS')) : ''}" aria-describedby="sa-m-${i}-err"><p class="mm-err" id="sa-m-${i}-err"></p></fieldset>`;
}
function abrirSaldo() {
  const cs = datos.cuentas.length ? datos.cuentas : [null];
  $id('sa-filas').innerHTML = cs.map(filaSaldo).join('');
  $id('sa-borrar').hidden = !datos.cuentas.length;
  if (datos.cuentas.length) armarBorrar($id('sa-borrar'), 'Borrar saldos', () => { datos.cuentas = []; guardar(); pintarTodo(); cerrar(dsa); avisar('Saldos borrados'); });
  abrir(dsa, $id('sa-m-0'));
}
dsa.addEventListener('click', e => {
  if (!e.target.closest('[data-saldo-otra]')) return;
  const n = $id('sa-filas').children.length;
  if (n >= 6) return;
  $id('sa-filas').insertAdjacentHTML('beforeend', filaSaldo(null, n));
  $id(`sa-m-${n}`).focus();
});
dsa.querySelector('form').addEventListener('submit', e => {
  e.preventDefault();
  const cuentas = [];
  let mal = null;
  for (const f of $id('sa-filas').querySelectorAll('[data-fila]')) {
    const i = f.dataset.fila, inp = $id(`sa-m-${i}`);
    if (!inp.value.trim()) continue;
    const neg = /^\s*[-−]/.test(inp.value);
    const v = leerMonto(inp.value.replace(/^\s*[-−]/, ''));
    if (v === null) { mal ||= error(inp, `sa-m-${i}-err`, 'Revisá el monto (los centavos van con coma).'); continue; }
    const nombre = f.querySelector(`[name="sa-n-${i}"]:checked`)?.value || 'Cuenta';
    cuentas.push({ id: `${nombre}-${i}`, nombre, saldo: neg ? -v : v, fecha: HOY_ISO });
  }
  if (mal) return mal.focus();
  datos.cuentas = cuentas; guardar(); pintarTodo(); cerrar(dsa);
  avisar(cuentas.length ? 'Saldo guardado' : 'Sin saldos');
});

/* ════════ DÍA DE COBRO ════════ */
function pintarCobroLinea() {
  const el = $id('cobro-linea');
  const v = F.diaDeCobro && mes === HOY ? venceAntesDeCobrar(datos, HOY_ISO) : null;
  el.hidden = !v;
  if (!v) { el.textContent = ''; return; }
  el.textContent = `${textoCobroEn(v.cobro.dias)}${v.cobro.dias > 0 ? ` · hasta entonces ${v.items.length ? `vencen ${$(v.total)}` : 'no vence nada'}` : ''}`;
}
const TIPO_EV = { cobro: 'Cobrás', vence: 'Vence', cierre: 'Cierra', gasto: 'Vence' };
function pintarCobro() {
  const el = $id('cobro');
  if (!F.diaDeCobro || !datos.ingresos.length) { el.hidden = true; el.innerHTML = ''; return; }
  el.hidden = false;
  const conDia = datos.ingresos.filter(i => cobroValido(i.cobro));
  if (!conDia.length) {
    const principal = datos.ingresos.slice().sort((a, b) => b.monto - a.monto)[0];
    el.innerHTML = `<div class="mm-seccion-top"><h2 id="t-cobro">¿Qué día cobrás?</h2></div>
      <p class="mm-cobro-vacio">Con ese dato te mostramos qué vence antes de que cobres y cuánto necesitás hasta ese día.</p>
      <button type="button" class="mm-btn sec" data-editar="ingreso" data-id="${esc(principal.id)}" data-foco-cobro>Elegir el día</button>`;
    return;
  }
  /* este mes: de hoy a tu cobro; otros meses: el mes entero */
  const esHoy = mes === HOY;
  const v = esHoy ? lineaHastaCobrar(datos, HOY_ISO) : null;
  const ev = v ? v.eventos : lineaDelMes(datos, mes).map(e => ({ ...e, antes: false }));
  const desde = v ? v.desde : `${mes}-01`;
  const hasta = v ? v.hasta : `${mes}-${String(new Date(Date.UTC(+mes.slice(0, 4), +mes.slice(5, 7), 0)).getUTCDate()).padStart(2, '0')}`;
  const largo = Math.max(1, diasEntre(desde, hasta));
  const pos = f => `${Math.min(100, Math.max(0, (diasEntre(desde, f) / largo) * 100))}%`;
  const marcas = ev.map(e => `<i class="mm-lm-marca ${e.tipo === 'cobro' ? 'cobro' : e.antes ? 'antes' : e.tipo}" style="left:${pos(e.fecha)}"></i>`).join('');
  const filas = ev.map(e => `<li class="mm-lm-fila ${e.tipo}${e.antes ? ' antes' : ''}">
      <span class="mm-lm-dia">${esc(fechaCorta(e.fecha))}</span>
      <span class="mm-lm-txt"><b>${esc(TIPO_EV[e.tipo])} ${e.tipo === 'cobro' ? esc(e.nombre.toLowerCase()) : esc(e.nombre)}</b>${e.antes ? '<small>Antes de que cobres</small>' : ''}</span>
      ${e.monto != null && e.tipo !== 'cierre' ? `<span class="mm-lm-monto">${e.tipo === 'cobro' ? '+' : '−'}${esc($(e.monto))}</span>` : '<span></span>'}</li>`).join('');
  const cab = v ? `<p class="mm-cobro-en"><b>${esc(textoCobroEn(v.cobro.dias))}</b>${v.cobro.dias > 0 ? `<span>${v.items.length ? `Hasta entonces vencen <b>${esc($(v.total))}</b>` : 'Hasta entonces no vence nada cargado'}</span>` : ''}</p>` : '';
  const ejes = `<span class="mm-lm-ext">${esc(v ? 'Hoy' : fechaCorta(desde))}</span><span class="mm-lm-ext der">${esc(fechaCorta(hasta))}</span>`;
  el.innerHTML = `<div class="mm-seccion-top"><h2 id="t-cobro">${v ? 'De hoy a tu cobro' : 'Tu mes, día por día'}</h2></div>${cab}
    <div class="mm-lm" role="img" aria-label="${esc(ev.length ? ev.map(e => `${fechaCorta(e.fecha)}: ${TIPO_EV[e.tipo].toLowerCase()} ${e.nombre}${e.antes ? ', antes de que cobres' : ''}`).join('; ') : 'Sin cobros ni vencimientos con fecha')}"><span class="mm-lm-eje"></span>${marcas}${ejes}</div>
    <ol class="mm-lm-lista">${filas || '<li class="mm-vacio">No hay cobros ni vencimientos con fecha.</li>'}</ol>
    <p class="mm-fuente">Días hábiles aproximados: de lunes a viernes, sin feriados. Si cobrás en un rango, tomamos el último día.</p>`;
}

/* ════════ HACER RENDIR LA PLATA ════════
   Todo se calcula acá, en el dispositivo. Se informa y se propone: nunca "deberías". */
let consejoIdx = 0;
function pintarConsejo() {
  const el = $id('consejo');
  const vistos = new Set(datos.consejosVistos);
  const vics = F.consejo ? victorias(datos, HOY_ISO).filter(v => !vistos.has(v.id)) : [];
  const lista = F.consejo ? consejos(datos, HOY_ISO) : [];
  if (!lista.length && !vics.length) { el.hidden = true; el.innerHTML = ''; return; }
  el.hidden = false;
  consejoIdx = lista.length ? consejoIdx % lista.length : 0;
  let c = lista[consejoIdx];
  const v = vics[0];
  const acc = [];
  /* fin de cuota: lo que se libera, con destino */
  const dl = F.finDeCuota && c?.tipo === 'libera' ? destinoLiberacion(datos, HOY_ISO) : null;
  if (dl) {
    c = { ...c, texto: dl.texto };
    if (!dl.asignado) acc.push(`<button type="button" class="mm-btn chico" data-libera-destino>${dl.accion === 'sumar' ? 'Sumalo a tu meta' : 'Armá una meta con esto'}</button>`);
  }
  if (c && ['libera', 'diez'].includes(c.tipo) && F.metas && !datos.meta && !dl) acc.push('<button type="button" class="mm-link" data-meta-nueva>Armar una meta</button>');
  if (c && c.tipo === 'diez' && F.dondeRinde) acc.push('<button type="button" class="mm-link" data-ir="rinde">Dónde puede rendir</button>');
  if (c && ['intereses', 'negativo'].includes(c.tipo)) acc.push('<button type="button" class="mm-link" data-ir="escalera">Ver mes a mes</button>');
  if (lista.length > 1) acc.push('<button type="button" class="mm-link" data-consejo-sig>Otro consejo</button>');
  if (c) acc.push(`<button type="button" class="mm-link quieto" data-consejo-ocultar="${esc(c.id)}">Ocultar</button>`);
  el.innerHTML = `${v ? `<p class="mm-victoria"><span>${esc(v.texto)}</span><button type="button" class="mm-cerrar chico" data-consejo-ocultar="${esc(v.id)}" aria-label="Ocultar">${ic('cerrar')}</button></p>` : ''}
    ${c ? `<div class="mm-consejo-top"><span class="mm-consejo-lbl">Para hacer rendir tu plata</span>${lista.length > 1 ? `<span class="mm-consejo-n">${consejoIdx + 1} de ${lista.length}</span>` : ''}</div>
    <p class="mm-consejo-txt">${esc(c.texto)}</p><div class="mm-consejo-acc">${acc.join('')}</div>` : ''}`;
}

function pintarMeta() {
  const el = $id('meta');
  if (!F.metas || (!datos.meta && !datos.ingresos.length)) { el.hidden = true; el.innerHTML = ''; return; }
  el.hidden = false;
  const linkRinde = F.dondeRinde ? '<button type="button" class="mm-link" data-ir="rinde">Dónde puede rendir lo que separás</button>' : '';
  if (!datos.meta) {
    const s = metaSugerida(datos, HOY_ISO);
    const txt = !s ? 'Elegí para qué querés juntar y cuánto. Una meta por vez.'
      : s.desde === 'libera' ? `En ${nombreMes(s.mesLibera)} se te liberan cuotas. Si separás ${$(s.porMes)} por mes durante 6 meses, juntás ${$(s.objetivo)}.`
      : `Si separás ${$(s.porMes)} por mes, en 6 meses juntás ${$(s.objetivo)}.`;
    el.innerHTML = `<div class="mm-seccion-top"><h2 id="t-meta">Una meta</h2></div><p class="mm-meta-txt">${esc(txt)}</p>
      <div class="mm-meta-acc"><button type="button" class="mm-btn sec" data-meta-nueva>Armar mi meta</button>${linkRinde}</div>`;
    return;
  }
  const m = datos.meta, e = estadoMeta(m, HOY_ISO);
  const sug = F.finDeCuota ? (aporteSugerido(m, HOY_ISO) || { monto: e.porMes, deLibera: false }) : { monto: e.porMes, deLibera: false };
  const pct = Math.round(e.avance * 100);
  el.innerHTML = `<div class="mm-seccion-top"><h2 id="t-meta">${esc(m.nombre)}</h2><button type="button" class="mm-link" data-meta-editar>Editar</button></div>
    ${e.victoria ? `<p class="mm-victoria solo"><span>${esc(e.victoria)}</span></p>` : ''}
    <p class="mm-meta-num"><b>${esc($(e.separado))}</b> <span>de ${esc($(m.objetivo))}</span></p>
    <div class="mm-meta-barra" role="progressbar" aria-label="Avance de tu meta" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-valuetext="${pct} %"><i style="width:${pct}%"></i></div>
    <p class="mm-meta-txt">${e.llegaste ? `Llegaste. Si querés, armá la próxima.` : `Para ${esc(nombreMes(m.fecha))}: ${esc($(e.porMes))} por mes ${e.meses === 1 ? 'este mes' : `durante ${e.meses} meses`}.`}</p>
    <div class="mm-meta-acc">${e.llegaste ? '<button type="button" class="mm-btn sec" data-meta-nueva>Armar otra meta</button>'
      : `<button type="button" class="mm-btn sec" data-aporte="${sug.monto}">Separé ${esc($(sug.monto))}${sug.deLibera ? ' (lo que se liberó)' : ''}</button><button type="button" class="mm-link" data-aporte-otro>Otro monto</button>`}${linkRinde}</div>`;
}

function pintarReto() {
  const el = $id('reto');
  if (!F.retos || (!datos.ingresos.length && !datos.tarjetas.length)) { el.hidden = true; el.innerHTML = ''; return; }
  el.hidden = false;
  const r = retoDelMes(datos, HOY);
  const mesTxt = nombreMes(HOY).split(' ')[0];
  if (!r) {
    el.innerHTML = `<div class="mm-seccion-top"><h2 id="t-reto">Un reto para ${esc(mesTxt)}</h2></div>
      <p class="mm-meta-txt">Si querés. Dura hasta fin de mes y no hay rachas que se corten.</p>
      <ul class="mm-retos">${RETOS.map(x => `<li><button type="button" class="mm-reto-op" data-reto="${esc(x.id)}"><b>${esc(x.titulo)}</b><span>${esc(x.texto)}</span></button></li>`).join('')}</ul>`;
    return;
  }
  const cuerpo = r.estado === 'hecho'
    ? `<p class="mm-victoria solo"><span>Hecho: ${esc(r.titulo.toLowerCase())}.</span></p><p class="mm-meta-txt">En ${esc(nombreMes(sumarMeses(HOY, 1)).split(' ')[0])} hay otro, si querés.</p>`
    : r.estado === 'esta-vez-no'
      ? `<p class="mm-meta-txt">Esta vez no. No pasa nada: en ${esc(nombreMes(sumarMeses(HOY, 1)).split(' ')[0])} hay otro.</p><div class="mm-meta-acc"><button type="button" class="mm-link" data-reto-cambiar>Elegir otro</button></div>`
      : `<p class="mm-reto-tit">${esc(r.titulo)}</p><p class="mm-meta-txt">${esc(r.texto)}</p>
         <div class="mm-meta-acc"><button type="button" class="mm-btn sec" data-reto-estado="hecho">Lo hice</button><button type="button" class="mm-link" data-reto-estado="esta-vez-no">Esta vez no</button><button type="button" class="mm-link quieto" data-reto-cambiar>Cambiar</button></div>`;
  el.innerHTML = `<div class="mm-seccion-top"><h2 id="t-reto">Tu reto de ${esc(mesTxt)}</h2></div>${cuerpo}`;
}

/* ── diálogo de meta ── */
const dm = $id('dlg-meta');
let metaFecha = null;
function abrirMeta(editar = false) {
  const m = editar ? datos.meta : null;
  const s = !m ? metaSugerida(datos, HOY_ISO) : null;
  const nombre = m?.nombre || s?.nombre || METAS_SUGERIDAS[0];
  const nombres = METAS_SUGERIDAS.includes(nombre) ? METAS_SUGERIDAS : [nombre, ...METAS_SUGERIDAS];
  $id('m-nombres').innerHTML = nombres.filter(n => n !== 'Otra').map(n => `<label class="mm-chip"><input type="radio" name="m-nombre" value="${esc(n)}"${n === nombre ? ' checked' : ''}><span>${esc(n)}</span></label>`).join('');
  $id('m-objetivo').value = m ? sinSimbolo(m.objetivo, 'ARS') : s ? sinSimbolo(s.objetivo, 'ARS') : '';
  metaFecha = m?.fecha || s?.fecha || sumarMeses(HOY, 6);
  pintarFechasMeta();
  $id('dm-tit').textContent = m ? 'Editar tu meta' : 'Tu meta';
  $id('m-borrar').hidden = !m;
  if (m) armarBorrar($id('m-borrar'), 'Borrar meta', () => { delete datos.meta; guardar(); pintarTodo(); cerrar(dm); avisar('Meta borrada'); });
  calcMeta();
  abrir(dm, $id('m-objetivo'));
}
function pintarFechasMeta() {
  const ops = [3, 6, 9, 12, 18].map(k => sumarMeses(HOY, k));
  if (!ops.includes(metaFecha)) ops.push(metaFecha);
  ops.sort((a, b) => difMeses(b, a));
  $id('m-fechas').innerHTML = ops.map(m => `<label class="mm-chip"><input type="radio" name="m-fecha" value="${m}"${m === metaFecha ? ' checked' : ''}><span>${esc(corto(m))}</span></label>`).join('');
}
function calcMeta() {
  const obj = leerMonto($id('m-objetivo').value);
  const e = obj ? estadoMeta({ objetivo: obj, fecha: metaFecha, aportes: datos.meta?.aportes || [] }, HOY_ISO) : null;
  $id('m-calc').textContent = e && !e.llegaste ? `Son ${$(e.porMes)} por mes durante ${e.meses} ${e.meses === 1 ? 'mes' : 'meses'}.` : '';
}
$id('m-objetivo').addEventListener('input', calcMeta);
$id('m-fechas').addEventListener('change', e => { metaFecha = e.target.value; calcMeta(); });
dm.querySelector('form').addEventListener('submit', e => {
  e.preventDefault();
  const objetivo = leerMonto($id('m-objetivo').value);
  if (!objetivo) { error($id('m-objetivo'), 'm-objetivo-err', 'Escribí cuánto querés juntar, por ejemplo 600.000.').focus(); return; }
  const nombre = dm.querySelector('[name="m-nombre"]:checked')?.value || 'Mi meta';
  const nueva = !datos.meta || estadoMeta(datos.meta, HOY_ISO).llegaste;
  datos.meta = { nombre, objetivo, fecha: metaFecha, aportes: nueva ? [] : datos.meta.aportes };
  guardar(); pintarTodo(); cerrar(dm); avisar(nueva ? 'Meta armada' : 'Meta actualizada');
});
const da = $id('dlg-aporte');
function anotarAporte(monto) {
  if (!datos.meta || !(monto > 0)) return;
  const antes = estadoMeta(datos.meta, HOY_ISO).victoria;
  datos.meta.aportes = [...datos.meta.aportes, { fecha: HOY_ISO, monto }].slice(-200);
  guardar(); pintarTodo();
  const v = estadoMeta(datos.meta, HOY_ISO).victoria;
  avisar(v && v !== antes ? v : `Anotado: separaste ${$(monto)}`);
}
da.querySelector('form').addEventListener('submit', e => {
  e.preventDefault();
  const monto = leerMonto($id('a-monto').value);
  if (!monto) { error($id('a-monto'), 'a-monto-err', 'Escribí el monto, por ejemplo 50.000.').focus(); return; }
  cerrar(da); anotarAporte(monto);
});

/* ════════ DÓNDE PUEDE RENDIR (información general) ════════
   Solo datos por categoría del archivo tasas.js. Esta vista NO usa los
   números del usuario: el monto de la calculadora lo escribe la persona. */
let rindeDias = 30;
const pctR = n => `${String(n).replace('.', ',')} %`;
const fechaLarga = f => `${fechaCorta(f)} ${f.slice(0, 4)}`;
const fuenteTasa = o => `${o.url ? `<a href="${esc(o.url)}" target="_blank" rel="noopener noreferrer">${esc(o.fuente)}</a>` : esc(o.fuente)}${o.fecha ? ` · ${esc(fechaLarga(o.fecha))}` : ''}${o.confirmar ? ' <span class="mm-tag ext">A confirmar</span>' : ''}${o.fecha && datoViejo(o.fecha, HOY_ISO) ? ` <span class="mm-tag">Dato del ${esc(fechaCorta(o.fecha))}: puede haber cambiado</span>` : ''}`;
function pintarRinde() {
  /* QA v2 · dondeRinde: la misma inflación que ¿cuotas o contado? y un título que no empuja a invertir */
  const inf = supuesto(datos, 'inflacion');
  const pf = TASAS.opciones[0];
  $id('rinde').innerHTML = `
    <section class="mm-panel mm-rinde-inf" aria-labelledby="ri-inf">
      <h2 id="ri-inf" class="mm-h2">Cuánto rinde hoy cada tipo de opción</h2>
      <p class="mm-meta-txt">Para comparar, la inflación que usamos en toda la app:</p>
      <p class="mm-rinde-big">${esc(pctR(inf.valor))} <span>por mes, esperada</span></p>
      <p class="mm-meta-txt">Las tasas de abajo son anuales (TNA). Para compararlas, dividilas por 12: ${esc(pctR(pf.tna.min))} TNA ≈ ${esc(pctR(tnaMensual(pf.tna.min)))} por mes.</p>
      <p class="mm-fuente">${fuenteHTML(inf)}</p>
    </section>
    <ul class="mm-rinde-ops">${TASAS.opciones.map(o => `<li class="mm-panel mm-rinde-op ${esc(o.clase)}">
      <div class="mm-rinde-cab"><h2 class="mm-h2">${esc(o.nombre)}</h2><span class="mm-tag">${o.clase === 'deposito' ? 'Depósito' : 'Fondo común'}</span></div>
      <p class="mm-meta-txt">${esc(o.que)}</p>
      <p class="mm-rinde-tna"><b>${o.tna.min === o.tna.max ? esc(pctR(o.tna.min)) : `${esc(pctR(o.tna.min))} a ${esc(pctR(o.tna.max))}`}</b> <span>TNA de referencia · ${esc(o.detalle)}</span></p>
      <p class="mm-meta-txt">${esc(o.tener)}</p>
      <p class="mm-fuente">${fuenteTasa(o)}</p></li>`).join('')}</ul>
    <section class="mm-panel mm-rinde-calc" aria-labelledby="ri-calc">
      <h2 id="ri-calc" class="mm-h2">Hacé la cuenta</h2>
      <div class="mm-campo"><label for="ri-monto">Un monto, en pesos</label><input id="ri-monto" class="mm-grande" type="text" inputmode="decimal" autocomplete="off" placeholder="Ej: 100.000"></div>
      <fieldset class="mm-campo"><legend>Durante</legend><div class="mm-chips" id="ri-dias">${[30, 90, 180, 365].map(d => `<label class="mm-chip"><input type="radio" name="ri-dias" value="${d}"${d === rindeDias ? ' checked' : ''}><span>${d} días</span></label>`).join('')}</div></fieldset>
      <div id="ri-res" aria-live="polite"></div>
      <p class="mm-fuente">Interés simple: monto × TNA × días ÷ 365, antes de impuestos. ${esc(avisoCorto(fechaLarga(TASAS.revisado)))}</p>
    </section>
    <p class="mm-legal">${esc(AVISO_LEGAL)}</p>`;
  calcRinde();
}
function calcRinde() {
  const monto = leerMonto($id('ri-monto')?.value || '');
  const res = $id('ri-res');
  if (!res) return;
  if (!monto) { res.innerHTML = '<p class="mm-meta-txt">Escribí un monto para ver cuánto rendiría en cada opción.</p>'; return; }
  res.innerHTML = `<ul class="mm-rinde-res">${TASAS.opciones.map(o => {
    const r = calculoRendir(monto, o, rindeDias);
    return `<li><span>${esc(o.nombre)}</span><b>≈ ${r.min === r.max ? esc($(r.min)) : `${esc($(r.min))} a ${esc($(r.max))}`}</b></li>`;
  }).join('')}</ul>`;
}
$id('rinde').addEventListener('input', e => { if (e.target.id === 'ri-monto') calcRinde(); });
$id('rinde').addEventListener('change', e => { if (e.target.name === 'ri-dias') { rindeDias = Number(e.target.value); calcRinde(); } });
/* ════════ FIN DÓNDE PUEDE RENDIR ════════ */

function fuenteHTML(c) {
  if (!c) return '';
  const f = c.fecha ? ` · ${fechaCorta(c.fecha)} ${c.fecha.slice(0, 4)}` : '';
  return /^https:\/\//.test(c.url || '') ? `<a href="${esc(c.url)}" target="_blank" rel="noopener">${esc(c.fuente)}</a>${esc(f)}` : `${esc(c.fuente)}${esc(f)}`;
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
      <dl><div><dt>Resumen por pagar</dt><dd>${esc($(cred.resumen))}</dd></div><div><dt>Cuotas que vienen</dt><dd>${esc($(cred.futuras + cred.percepcion))}</dd></div><div><dt>Compras nuevas</dt><dd>${esc($(cred.nuevas))}</dd></div>${cred.financiado ? `<div><dt>Saldo sin pagar + intereses (estimado)</dt><dd>${esc($(cred.financiado))}</dd></div>` : ''}</dl>
      ${cred.percepcion ? `<p class="mm-fuente" style="margin:0">"Cuotas que vienen" incluye ${esc($(cred.percepcion))} de percepción estimada por saldos en dólares.</p>` : ''}
    </div>
    ${!datos.tarjetas.length ? `<button type="button" class="mm-btn" data-agregar-tarjeta>${ic('subir')} Agregá tu tarjeta: subí el último resumen</button>` : `<button type="button" class="mm-link" data-nuevo="cuota">¿Compraste algo que todavía no está en el resumen?</button>`}`;
}

/* Si el resumen tiene saldo en otra moneda: lo que cobra de percepción el siguiente si se paga en pesos */
function lineaPercepcion(res) {
  const cobrada = (res.cargos || []).filter(c => c.tipo === 'percepcion' && c.monto > 0).reduce((a, c) => a + (aPesos(c.monto, c.moneda || 'ARS', datos) ?? 0), 0);
  if (cobrada) return `<p class="mm-cargos-linea">Este resumen ya trae la percepción del 30 % (<b>${esc($(cobrada))}</b>): no sumamos otra estimada.</p>`;
  const p = percepcionEstimada(res, datos);
  if (!p) return '';
  const ext = Object.entries(res.totales || {}).filter(([m, v]) => m !== 'ARS' && v > 0).map(([m, v]) => fm(v, m)).join(' y ');
  return `<p class="mm-cargos-linea">Si pagás ${esc(ext)} en pesos, en el próximo resumen te cobran <b>~${esc($(p))}</b> de percepción (si los pagás con dólares propios, no). La sumamos al mes siguiente como estimado.</p>`;
}
/* "Este resumen te cobró $ X de intereses y cargos" (las devoluciones restan) */
function lineaCargos(res) {
  const c = cargosDelResumen(res, datos);
  const t = textoCargos(c, resumenVencido(res, HOY_ISO));
  return t ? `<p class="mm-cargos-linea">${esc(t)}</p>` : '';
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
        <div><dt>Compras nuevas</dt><dd>${esc($(cr.nuevas))}</dd></div>${cr.percepcion ? `<div><dt>Percepción estimada</dt><dd>${esc($(cr.percepcion))}</dd></div>` : ''}${cr.financiado ? `<div><dt>Saldo sin pagar + intereses (estimado)</dt><dd>${esc($(cr.financiado))}</dd></div>` : ''}<div><dt>${disp ? 'Crédito disponible' : 'Límite'}</dt><dd>${disp ? esc($(Math.max(0, disp.disponible))) : '—'}</dd></div></dl>
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
        ${F.cambioTarjeta && !t.baja ? `<button type="button" class="mm-link" data-cambiar-tj="${esc(t.id)}">Cambiar o dejar esta tarjeta</button>` : ''}
      </div>
      ${F.cambioTarjeta ? cambioTarjetaHTML(t) : ''}
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
  /* moneda extranjera en 0: no se muestra la fila (queda una línea corta) */
  const enCero = Object.entries(l.totales).filter(([m, v]) => m !== 'ARS' && !v).map(([m]) => MONEDAS[m].nombre);
  const totalesHTML = Object.entries(l.totales).filter(([m, v]) => m === 'ARS' || v).map(([m, v]) => {
    const conv = m !== 'ARS' ? aPesos(v, m, datos) : null;
    const c = cambioDe(datos, m);
    return `<div class="mm-rev-fila"><label for="rt-${m}"><b>Total en ${esc(MONEDAS[m].nombre)}</b>${m !== 'ARS' ? `<br><span class="mm-fuente">${conv === null ? 'Sin tipo de cambio: no se suma hasta que lo cargues.' : `≈ ${esc($(conv))} a ${esc($(c.valor, { centavos: true }))} por ${esc(MONEDAS[m].simbolo)} 1`}</span>` : ''}</label>
      <span style="display:flex;align-items:center;gap:6px"><span aria-hidden="true">${esc(MONEDAS[m].simbolo)}</span><input type="text" inputmode="decimal" id="rt-${m}" data-total="${m}" value="${esc(sinSimbolo(v, m))}" style="width:150px;text-align:right" aria-describedby="rt-${m}-err"></span>
      <p class="mm-err" id="rt-${m}-err" style="grid-column:1/-1"></p></div>`;
  }).join('') + (enCero.length ? `<p class="mm-fuente" style="margin:4px 0 0">Sin consumos en ${esc(enCero.join(' ni en '))}.</p>` : '');
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
        ${F.pagoVencido && resumenVencido(l, HOY_ISO) ? `<section class="mm-panel mm-pago-vencido" aria-labelledby="rv-pv">
          <h2 id="rv-pv" class="mm-h2">Este resumen venció el ${esc(fechaAR(l.vencimiento))}. ¿Ya lo pagaste?</h2>
          <div class="mm-chips">${Object.entries(PAGOS_VENCIDO).map(([k, v]) => `<label class="mm-chip"><input type="radio" name="rv-pago" value="${k}"><span>${esc(v)}</span></label>`).join('')}</div>
          <div class="mm-campo" id="rv-pago-otro" hidden><label for="rv-pago-monto">¿Cuánto pagaste?</label><input id="rv-pago-monto" type="text" inputmode="decimal" autocomplete="off"></div>
          <p class="mm-fuente">Si quedó saldo sin pagar, lo sumamos al mes que viene con intereses estimados. Podés contestarlo después.</p></section>` : ''}
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
  const r = importarResumen(datos, l, { tarjetaId: destino, nuevoId, hoy: HOY_ISO });
  /* si venció antes de importarlo y ya contestó si lo pagó */
  const pagoElegido = F.pagoVencido ? $id('revisar').querySelector('[name="rv-pago"]:checked')?.value : null;
  if (pagoElegido) {
    const nuevo = r.datos.resumenes.find(x => x.tarjetaId === r.tarjetaId && x.mes === r.mes);
    const montoOtro = pagoElegido === 'otro' ? leerMonto($id('rv-pago-monto').value) : null;
    if (nuevo && (pagoElegido !== 'otro' || montoOtro !== null)) r.datos = registrarPagoResumen(r.datos, nuevo.id, { estado: pagoElegido, monto: montoOtro });
  }
  datos = r.datos;
  datos.rubrosComercio = memoria;
  registrarCambio(`Importaste el resumen de ${tarjetaDe(r.tarjetaId)?.nombre || 'tu tarjeta'}`);
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
  if (d) datos.concilia = (datos.concilia || []).filter(x => x.cuotaId !== d.cuotaId);
  if (b.dataset.concilia === 'si' && d) { datos.cuotas = datos.cuotas.filter(c => c.id !== d.cuotaId); avisar('Listo: queda la del resumen'); }
  guardar(); pintarTodo();
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

const VISTAS = ['inicio', 'tarjetas', 'tarjeta', 'cargado', 'revisar', 'escalera', 'contado', 'simular', 'rinde', 'devolver', 'subir', 'leido'];
const TITULOS = { tarjetas: 't-tarjetas', tarjeta: 't-una', cargado: 't-cargado', revisar: 't-revisar', escalera: 't-escalera', contado: 't-contado', simular: 't-simular', rinde: 't-rinde', devolver: 't-devolver', subir: 't-subir', leido: 't-leido' };
function verVista(v, { foco = true } = {}) {
  if ((v === 'rinde' && !F.dondeRinde) || (v === 'devolver' && !F.devolver) || (['subir', 'leido'].includes(v) && !F.subiLoQueTengas)) v = 'inicio';
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
  if (v === 'rinde') pintarRinde();
  if (v === 'devolver') pintarDevolver();
  if (v === 'subir') pintarSubir();
  if (v === 'leido') pintarLeido();
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
/* compra ≠ compromiso ≠ pago: la compra, sus N cuotas y en qué resumen se paga cada una */
function pintarFicha(c) {
  const el = $id('c-ficha');
  const f = F.fichaCompra && c ? fichaCompra(datos, c.id, HOY_ISO) : null;
  el.hidden = !f;
  if (!f) { el.innerHTML = ''; return; }
  const m = f.moneda;
  el.innerHTML = `<p class="mm-ficha-tit"><span>La compra</span><b>${esc(fm(f.compra, m))}</b></p>
    <p class="mm-ficha-sub">${f.cantidad > 1 ? `${f.cantidad} cuotas de ${esc(fm(f.obligaciones[0].monto, m))}` : 'Un pago'}${f.tarjeta ? ` · ${esc(f.tarjeta.nombre)}` : ''}${f.restan && f.pagadas ? ` · faltan ${esc(fm(f.restan, m))}` : ''}</p>
    <ol class="mm-ficha-lista">${f.obligaciones.map(o => `<li class="${o.pasada ? 'pasada' : ''}">
      <span class="mm-ficha-n">${o.n}/${f.cantidad}</span>
      <span class="mm-ficha-txt"><b>${esc(fm(o.monto, m))}</b><small>${o.vencimiento ? `Resumen que vence el ${esc(fechaCorta(o.vencimiento))}` : `Resumen de ${esc(nombreMes(o.mes))}`}</small></span>
      <span class="mm-tag ${o.estado === 'resumen' ? '' : 'ext'}">${o.estado === 'resumen' ? 'En el resumen' : 'Estimada'}</span></li>`).join('')}</ol>
    <p class="mm-fuente">Cada mes cuenta solo su cuota. Pagar el resumen no es otro gasto: es cómo se pagan estas cuotas.</p>${historiaHTML(c)}`;
}
/* (2) una sola historia: todo lo que sabemos de esta compra */
function historiaHTML(c) {
  if (!F.historia) return '';
  const h = historiaCompra(datos, c.id);
  if (!h) return '';
  const linea = e => `<li><span class="mm-ficha-n">${esc(e.fecha ? fechaAR(e.fecha) : '—')}</span><span class="mm-ficha-txt"><b>${esc(TIPOS_EVIDENCIA[e.tipo])}</b><small>${esc(
    e.tipo === 'resumen' ? `${e.comercio || ''}${e.n ? ` · cuota ${e.n}/${c.cantidad}` : ''}${e.mes ? ` · ${nombreMes(e.mes)}` : ''}` : e.descripcion || e.concepto || '')}</small></span>
    <span>${Number.isSafeInteger(e.monto) ? esc((e.tipo === 'credito' || e.tipo === 'reintegro' ? '−' : '') + fm(e.monto, c.moneda || 'ARS')) : ''}</span></li>`;
  return `<h3 class="mm-comp-t" style="margin-top:12px">Historia de esta compra</h3><ol class="mm-ficha-lista">${h.evidencias.map(linea).join('')}</ol>
    ${h.propuestas.map(p => `<p class="mm-fuente">En el resumen aparece <b>${esc(p.concepto)}</b> por ${esc($(p.monto))} el ${esc(fechaAR(p.fecha))}. ¿Es de esta compra?</p>
      <div class="mm-meta-acc"><button type="button" class="mm-btn sec chico" data-vincular="${esc(c.id)}" data-res="${esc(p.resumenId)}" data-i="${p.i}">Sí, es de esta compra</button></div>`).join('')}
    ${F.devolver ? `<button type="button" class="mm-link" data-dev-de="${esc(c.id)}">Espero un reintegro o devolución de esta compra</button>` : ''}`;
}
/* (8) la pago con alguien: se guarda al toque, sin tocar el cronograma de la tarjeta */
function pintarCompartida(c) {
  const el = $id('c-comp');
  if (!F.compartidas || !c) { el.hidden = true; el.innerHTML = ''; return; }
  el.hidden = false;
  const x = compartidaDe(datos, c.id, HOY_ISO);
  const m = c.moneda || 'ARS';
  if (!x) {
    el.innerHTML = `<h3 class="mm-comp-t" id="cc-comp-t">¿La pagás con alguien?</h3>
      <div class="mm-fila"><div class="mm-campo"><label for="cp-con">Con quién (nombre o alias)</label><input id="cp-con" type="text" maxlength="40" autocomplete="off" placeholder="Ej: Juli"></div>
      <div class="mm-campo"><label for="cp-val">Su parte</label><input id="cp-val" type="text" inputmode="decimal" autocomplete="off" placeholder="50" aria-describedby="cp-err"></div></div>
      <div class="mm-chips" role="radiogroup" aria-label="La parte va en"><label class="mm-chip"><input type="radio" name="cp-tipo" value="%" checked><span>% del total</span></label><label class="mm-chip"><input type="radio" name="cp-tipo" value="$"><span>$ en total</span></label></div>
      <p class="mm-err" id="cp-err"></p><button type="button" class="mm-btn sec chico" data-comp-guardar="${esc(c.id)}">Guardar</button>`;
    return;
  }
  el.innerHTML = `<h3 class="mm-comp-t" id="cc-comp-t">La pagás con ${esc(x.con)}</h3>
    <dl class="mm-datos"><div><dt>Al banco le debés</dt><dd>${esc(fm(x.alEmisor, m))}</dd></div><div><dt>Tu parte</dt><dd>${esc(fm(x.tuParte, m))}</dd></div>
    <div><dt>Te debe ${esc(x.con)}</dt><dd>${esc(fm(x.teDeben, m))}</dd></div><div><dt>Ya te devolvió</dt><dd>${esc(fm(x.teDevolvieron, m))}</dd></div></dl>
    <p class="mm-fuente">${x.falta ? `Falta que te devuelva ${esc(fm(x.falta, m))}. ` : 'Ya te devolvió todo. '}${x.cuotasCubiertas ? `Cubre ${x.cuotasCubiertas} de ${x.cuotas.length} cuotas.` : ''} Lo que te devuelven no suma a tus ingresos: la tarjeta se paga igual, entera.</p>
    <div class="mm-fila"><div class="mm-campo"><label for="cp-dev">Me devolvió</label><input id="cp-dev" type="text" inputmode="decimal" autocomplete="off" placeholder="${esc(sinSimbolo(x.cuotas[0].suParte, m))}" aria-describedby="cp-err"></div></div>
    <p class="mm-err" id="cp-err"></p>
    <div class="mm-meta-acc"><button type="button" class="mm-btn sec chico" data-comp-dev="${esc(c.id)}">Anotar</button><button type="button" class="mm-link quieto" data-comp-quitar="${esc(c.id)}">Ya no es compartida</button></div>`;
}
function guardarCompartida(id, cambio) {
  datos.cuotas = datos.cuotas.map(c => (c.id === id ? cambio(c) : c));
  guardar(); pintarTodo();
  const c = datos.cuotas.find(x => x.id === id);
  pintarCompartida(c); pintarFicha(c);
}
$id('c-comp').addEventListener('click', e => {
  const g = e.target.closest('[data-comp-guardar]');
  if (g) {
    const con = $id('cp-con').value.trim();
    const tipo = $id('c-comp').querySelector('[name="cp-tipo"]:checked')?.value || '%';
    const valor = tipo === '%' ? numero($id('cp-val').value) : leerMonto($id('cp-val').value);
    const c = datos.cuotas.find(x => x.id === g.dataset.compGuardar);
    const x = compartidaValida({ con, tipo, valor }, c.total);
    if (!x) { $id('cp-err').textContent = !con ? 'Poné un nombre o alias.' : 'Revisá su parte: tiene que ser menos que el total.'; return; }
    guardarCompartida(c.id, q => ({ ...q, compartida: x })); return avisar(`Listo: la pagás con ${con}`);
  }
  const d = e.target.closest('[data-comp-dev]');
  if (d) {
    const v = leerMonto($id('cp-dev').value);
    if (!v) { $id('cp-err').textContent = 'Escribí cuánto te devolvió.'; return; }
    guardarCompartida(d.dataset.compDev, q => ({ ...q, compartida: { ...q.compartida, devoluciones: [...(q.compartida.devoluciones || []), { fecha: HOY_ISO, monto: v }] } }));
    return avisar('Anotado');
  }
  const q = e.target.closest('[data-comp-quitar]');
  if (q) { guardarCompartida(q.dataset.compQuitar, x => { const { compartida, ...resto } = x; return resto; }); return avisar('Ya no es compartida'); }
});
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
  pintarFicha(c);
  pintarCompartida(c);
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
    origen: previa?.origen || 'manual', fecha: previa?.fecha || HOY_ISO,
    ...(previa?.compartida && compartidaValida(previa.compartida, total) ? { compartida: previa.compartida } : {}) };
  if (editCuota) datos.cuotas = datos.cuotas.map(x => (x.id === editCuota ? cuota : x));
  else datos.cuotas.push(cuota);
  guardar(); pintarTodo(); cerrar(dc);
  registrarCambio(editCuota ? 'Editaste una compra' : 'Cargaste una compra nueva'); guardar();
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
  $id('i-cobro-wrap').hidden = !F.diaDeCobro;
  const cobro = cobroValido(x?.cobro);
  $id('i-cobros').innerHTML = [{ tipo: '', texto: 'No sé' }, ...COBROS].map(c => `<label class="mm-chip"><input type="radio" name="i-cobro" value="${c.tipo}"${(cobro?.tipo || '') === c.tipo ? ' checked' : ''}><span>${esc(c.texto)}</span></label>`).join('');
  $id('i-dia').innerHTML = Array.from({ length: 31 }, (_, k) => `<option value="${k + 1}">${k + 1}</option>`).join('');
  $id('i-dia').value = String(cobro?.dia || 15);
  $id('i-dia-wrap').hidden = cobro?.tipo !== 'dia';
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
$id('i-cobros').addEventListener('change', e => { $id('i-dia-wrap').hidden = e.target.value !== 'dia'; });
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
  const tipoCobro = di.querySelector('[name="i-cobro"]:checked')?.value || '';
  const previo = editIngreso ? datos.ingresos.find(i => i.id === editIngreso) : null;
  const cobro = F.diaDeCobro ? cobroValido(tipoCobro === 'dia' ? { tipo: 'dia', dia: Number($id('i-dia').value) } : { tipo: tipoCobro }) : cobroValido(previo?.cobro);
  const x = { id: editIngreso || nuevoId(), nombre,
    monto, repite: $id('i-repite').checked, desde: $id('i-desde').value, ...(cobro ? { cobro } : {}) };
  if (editIngreso) datos.ingresos = datos.ingresos.map(i => (i.id === editIngreso ? x : i));
  else datos.ingresos.push(x);
  guardar(); pintarTodo(); cerrar(di);
  registrarCambio(editIngreso ? 'Editaste un ingreso' : 'Cargaste un ingreso'); guardar();
  avisar(editIngreso ? 'Ingreso actualizado' : 'Ingreso cargado');
});

/* ── gasto fijo ── */
const dg = $id('dlg-gasto');
let gastoTjInferida = false;
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
  $id('g-dia-wrap').hidden = !F.diaDeCobro;
  $id('g-tj-wrap').hidden = !datos.tarjetas.length;   // QA v2 · 4: siempre, es lo que evita el doble conteo
  const tjActual = x ? (tarjetaDeGasto(datos, x, HOY)?.id || '') : '';
  gastoTjInferida = !!(x && !x.tarjetaId && tjActual);
  $id('g-tj').innerHTML = [{ id: '', nombre: 'No, de la cuenta' }, ...datos.tarjetas.filter(t => !t.baja)].map(t => `<label class="mm-chip"><input type="radio" name="g-tj" value="${esc(t.id)}"${tjActual === t.id ? ' checked' : ''}><span>${esc(t.nombre)}</span></label>`).join('');
  $id('g-dia').innerHTML = '<option value="">Sin día</option>' + Array.from({ length: 31 }, (_, k) => `<option value="${k + 1}">El ${k + 1}</option>`).join('');
  $id('g-dia').value = x?.dia ? String(x.dia) : '';
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
  const previoG = datos.gastos.find(g => g.id === editGasto);
  const tjG = datos.tarjetas.length ? (dg.querySelector('[name="g-tj"]:checked')?.value || '') : (previoG?.tarjetaId || '');
  if (tjG) x.tarjetaId = tjG;
  /* QA v3 · 2: si había una tarjeta asumida (o ya dijo "aparte") y eligió "de la cuenta", queda aparte */
  else if (previoG?.sinTarjeta || gastoTjInferida) x.sinTarjeta = true;
  const diaG = F.diaDeCobro ? Number($id('g-dia').value) : (datos.gastos.find(g => g.id === editGasto)?.dia || 0);
  if (diaG >= 1 && diaG <= 31) x.dia = diaG;
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
  if (a.tipo === 'vence' && a.antesCobro && a.dias > 1) return `Vence antes de cobrar: ${n}`;
  if (a.tipo === 'vence') return `${a.dias === 0 ? 'Vence hoy' : a.dias === 1 ? 'Vence mañana' : `Vence en ${a.dias} días`}: ${n}`;
  if (a.tipo === 'cierre') return `Cerró ${n}`;
  if (a.tipo === 'antesCobro') return `Vence antes de cobrar: ${n}`;
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
  if (F.mesEn30) { $id('alertas').hidden = true; $id('alertas').innerHTML = ''; return; }
  const as = [...alertasCredito(datos, HOY_ISO), ...alertasTarjetas(datos, HOY_ISO)];
  /* "vence antes de que cobres": si ya hay un aviso de vencimiento de esa tarjeta, se suma a ese (uno solo por tarjeta) */
  for (const c of F.diaDeCobro ? alertasCobro(datos, HOY_ISO) : []) {
    const v = as.find(a => a.tipo === 'vence' && a.tarjetaId === c.tarjetaId && a.fecha === c.fecha);
    if (v) { v.antesCobro = true; v.texto = `${v.texto} Vence antes de que cobres: ${c.texto}`; }
    else as.push(c);
  }
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
       ${(() => { const l = proximaLiberacion(datos, HOY); if (!l) return ''; const dl = F.finDeCuota ? destinoLiberacion(datos, HOY_ISO) : null;
         return `<p class="mm-libera-esc">${dl ? esc(dl.texto) : `En ${esc(nombreMes(l.mes))} se te liberan <b>${esc($(l.libera))}</b> por mes.`}</p>${dl && !dl.asignado ? `<button type="button" class="mm-btn chico" data-libera-destino>${dl.accion === 'sumar' ? 'Sumalo a tu meta' : 'Armá una meta con esto'}</button>` : ''}`; })()}
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
  pintarComoPagar({ precio, n, desc, pi, r });
}
/* (9) con qué pagarla: efectivo y cada tarjeta propia, con el impacto completo */
function pintarComoPagar({ precio, n, desc, pi, r }) {
  const el = $id('cp-res');
  if (!F.comoPagar || !datos.tarjetas.length) { el.hidden = true; return; }
  el.hidden = false;
  const cp = precio ? comoPagar(datos, { precio, descuentoEfectivo: desc, cuotas: n, inflacion: pi, rendimiento: r }, HOY_ISO) : null;
  if (!cp) { el.innerHTML = `<h2 class="mm-h2" id="cp-t">¿Con qué la pagarías?</h2><p class="mm-vacio">Cargá el precio y comparamos efectivo y cada una de tus tarjetas.</p>`; return; }
  const rango = ms => ms.length === 1 ? capital(nombreMes(ms[0].mes)) : `${capital(nombreMes(ms[0].mes, { corto: true }))} a ${nombreMes(ms[ms.length - 1].mes, { corto: true })}`;
  el.innerHTML = `<h2 class="mm-h2" id="cp-t">¿Con qué la pagarías?</h2>
    <p class="mm-meta-txt">Si no la comprás, este mes te quedan libres ${esc($(cp.sinComprar.libres))}${cp.sinComprar.faltaDificil ? ` y el día difícil ya te deja ${esc($(cp.sinComprar.faltaDificil))} abajo` : ''}.</p>
    <ul class="mm-cp-lista">${cp.opciones.map(o => `<li class="mm-cp-op${o.alcanza === false ? ' no' : ''}">
      <div class="mm-cp-cab"><b>${esc(o.nombre)}</b>${o.estimado ? '<span class="mm-tag ext">Cierre estimado</span>' : ''}</div>
      <p class="mm-cp-num">${o.cuotas > 1 && o.id !== 'efectivo' ? `${o.cuotas} cuotas de ${esc($(o.cuota))}` : `Un pago de ${esc($(o.total))}`}<span>${esc($(o.costoHoy))} en plata de hoy</span></p>
      <p class="mm-fuente">${esc(rango(o.meses))}: te quedan libres ${esc($(o.meses[0].libres))}${o.meses.length > 1 ? ` el primer mes` : ''}.
        ${o.alcanza === false ? `<b class="neg">${o.id === 'efectivo' ? 'Tu saldo no alcanza.' : `Tu disponible (${esc($(o.disponible))}) no alcanza.`}</b>` : o.alcanza === null && o.id !== 'efectivo' ? 'Sin límite cargado: no sabemos si alcanza.' : ''}
        ${o.faltaDificil !== null ? (o.faltaDificil > (cp.sinComprar.faltaDificil || 0) ? `<b class="neg">Con tu saldo, algún día faltarían ${esc($(o.faltaDificil))}.</b>` : 'No cambia tu día difícil.') : ''}</p></li>`).join('')}</ul>
    <p class="mm-letra">Comparación orientativa para una compra que ya estás pensando, no una recomendación de comprar. Cuotas sin interés; si tu tarjeta cobra interés, poné el precio final en cuotas.</p>`;
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
  try { localStorage.setItem(CLAVE_COPIA, HOY_ISO); } catch { /* comodidad: si no se puede, vuelve a preguntar */ }
  avisar('Copia descargada');
  pintarInicio();
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
    if (!d.ingresos.length && !d.gastos.length && !d.cuotas.length && !d.tarjetas.length && !d.resumenes.length) { copiaPendiente = null; return avisar('Esa copia está vacía: no hay nada para importar.'); }
    const pl = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
    $id('dm-txt').textContent = `Copia del ${json.exportado ? new Date(json.exportado).toLocaleDateString('es-AR') : 'archivo'}: ${pl(d.ingresos.length, 'ingreso', 'ingresos')}, ${pl(d.gastos.length, 'gasto fijo', 'gastos fijos')}, ${pl(d.cuotas.length, 'cuota', 'cuotas')}, ${pl(d.tarjetas.length, 'tarjeta', 'tarjetas')} y ${pl(d.resumenes.length, 'resumen', 'resúmenes')}. Antes de reemplazar guardamos un respaldo de lo que tenés ahora en este dispositivo.`;
    abrir($id('dlg-importar'), $id('dlg-importar').querySelector('[type="submit"]'));
  } catch {
    avisar('Ese archivo no es una copia de Mi Mes by Orbit.');
  }
});
$id('dlg-importar').querySelector('form').addEventListener('submit', e => {
  e.preventDefault();
  if (!copiaPendiente) return;
  try { localStorage.setItem(`${CLAVE}:respaldo`, JSON.stringify({ guardado: new Date().toISOString(), datos })); } catch {}
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
  /* tanda 14: el primer uso es subir lo que tengas; la guía a mano queda como alternativa */
  if (vacio && F.subiLoQueTengas) return verVista('subir', { foco: false });
  if (vacio && !vista) abrirGuia();
}
function abrirGuia() { pasoGuia = 0; pintarGuia(); abrir(dgu, dgu.querySelector('input')); }
function terminarGuia() { try { localStorage.setItem(GUIA, '1'); } catch {} cerrar(dgu); }
const GUIA_GASTOS = ['Alquiler', 'Expensas', 'Servicios', 'Suscripciones'];
let guiaSubs = 'tarjeta';
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
      const fila = `<div class="mm-guia-fila"><label for="gu-g${i}">${esc(c)}</label><input id="gu-g${i}" type="text" inputmode="decimal" autocomplete="off" placeholder="$ por mes" value="${previo ? esc(sinSimbolo(previo.monto, 'ARS')) : ''}" aria-describedby="gu-g-err"${c === 'Suscripciones' && guiaSubs === 'tarjeta' ? ' disabled' : ''}></div>`;
      /* QA v2 · 4: las suscripciones suelen ir con tarjeta: si es así, salen en el resumen y no se cargan aparte */
      return c !== 'Suscripciones' ? fila : `${fila}<div class="mm-chips mm-guia-tj" role="radiogroup" aria-label="¿Cómo pagás las suscripciones?">
        <label class="mm-chip"><input type="radio" name="gu-subs" value="tarjeta"${guiaSubs === 'tarjeta' ? ' checked' : ''}><span>Con tarjeta</span></label>
        <label class="mm-chip"><input type="radio" name="gu-subs" value="cuenta"${guiaSubs === 'cuenta' ? ' checked' : ''}><span>Débito o efectivo</span></label></div>
        <p class="mm-fuente" id="gu-subs-txt">${guiaSubs === 'tarjeta' ? 'Con tarjeta: no las cargues acá, salen en el resumen y las contamos una vez.' : ''}</p>`;
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
dgu.addEventListener('change', e => {
  if (e.target.name !== 'gu-subs') return;
  guiaSubs = e.target.value;
  const i = GUIA_GASTOS.indexOf('Suscripciones');
  $id(`gu-g${i}`).disabled = guiaSubs === 'tarjeta';
  if (guiaSubs === 'tarjeta') $id(`gu-g${i}`).value = '';
  $id('gu-subs-txt').textContent = guiaSubs === 'tarjeta' ? 'Con tarjeta: no las cargues acá, salen en el resumen y las contamos una vez.' : '';
});
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
    filas.forEach((f, i) => {
      if (!f.txt || (f.cat === 'Suscripciones' && guiaSubs === 'tarjeta')) return;   // con tarjeta: van en el resumen
      datos.gastos.push({ id: `guia-g${i}`, nombre: f.cat, categoria: f.cat, monto: leerMonto(f.txt), repite: true, desde: HOY });
    });
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
    ${pedidoInstalar ? `<button type="button" class="mm-btn sec" data-instalar>${ic('bajar')} Instalar Mi Mes by Orbit</button>` : ''}
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
const cargaAvisos = () => ({ tarjetas: datosParaAvisos(datos, HOY_ISO, { cobro: F.diaDeCobro }), credito: mesesCreditoSupera(datos, HOY_ISO) });
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
  if (ed) {
    ABRIR[ed.dataset.editar]?.(ed.dataset.id);
    if (ed.hasAttribute('data-foco-cobro')) setTimeout(() => { const c = $id('i-cobros').querySelector('input:checked') || $id('i-cobros').querySelector('input'); c?.focus(); c?.scrollIntoView({ block: 'center' }); }, 60);
    return;
  }
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
  const ctj = t.closest('[data-cambiar-tj]');
  if (ctj) return abrirCambioTj(ctj.dataset.cambiarTj);
  const vc = t.closest('[data-vincular]');
  if (vc) { datos = vincularCredito(datos, vc.dataset.vincular, vc.dataset.res, Number(vc.dataset.i)); guardar(); pintarFicha(datos.cuotas.find(x => x.id === vc.dataset.vincular)); return avisar('Listo: queda en la historia de la compra'); }
  const dd = t.closest('[data-dev-de]');
  if (dd) { cerrar(dc); return abrirDevolver(dd.dataset.devDe); }
  if (t.closest('[data-tna]')) return abrirTNA();
  const gtj = t.closest('[data-gasto-tj]');
  if (gtj) { datos.gastos = datos.gastos.map(g => { if (g.id !== gtj.dataset.gastoTj) return g; const { sinTarjeta, ...r } = g; return { ...r, tarjetaId: gtj.dataset.tj }; }); guardar(); pintarTodo(); return avisar('Listo: lo contamos una sola vez, adentro de la tarjeta'); }
  const gap = t.closest('[data-gasto-aparte]');
  if (gap) { datos.gastos = datos.gastos.map(g => { if (g.id !== gap.dataset.gastoAparte) return g; const { tarjetaId, ...r } = g; return { ...r, sinTarjeta: true }; }); guardar(); pintarTodo(); return avisar('Listo: lo contamos como gasto fijo aparte'); }
  const pg = t.closest('[data-pago-res]');
  if (pg) {
    if (pg.dataset.pago === 'otro') { pagoDe = pg.dataset.pagoRes; $id('p-monto').value = ''; return abrir($id('dlg-pago'), $id('p-monto')); }
    datos = registrarPagoResumen(datos, pg.dataset.pagoRes, { estado: pg.dataset.pago }); guardar(); pintarTodo();
    const rr = datos.resumenes.find(x => x.id === pg.dataset.pagoRes), f = rr ? financiacionEstimada(rr, datos) : null;
    return avisar(f?.total ? `Pasan ${$(f.saldo)} al mes que viene, más ${$(f.interes)} de intereses estimados` : 'Listo, pagado');
  }
  const gok = t.closest('[data-gasto-ok]');
  if (gok) { const r = confirmarGasto(datos, gok.dataset.gastoOk, HOY); datos = r.datos; registrarCambio('Confirmaste un gasto'); guardar(); pintarTodo(); return avisar(r.texto); }
  const gre = t.closest('[data-gasto-real]');
  if (gre) return abrirReal(gre.dataset.gastoReal);
  const gba = t.closest('[data-gasto-baja]');
  if (gba) {
    /* QA v2 · 7: antes de dar de baja, ¿ya se cobró este mes? (si sí, este mes no cambia) */
    gba.parentElement.innerHTML = `<span class="mm-fuente">¿Ya se cobró este mes?</span><button type="button" class="mm-btn chico" data-gasto-baja2="${esc(gba.dataset.gastoBaja)}" data-cobrado="1">Sí, ya se cobró</button><button type="button" class="mm-link" data-gasto-baja2="${esc(gba.dataset.gastoBaja)}" data-cobrado="0">No</button>`;
    return;
  }
  const gb2 = t.closest('[data-gasto-baja2]');
  if (gb2) { const r = darDeBajaGasto(datos, gb2.dataset.gastoBaja2, HOY, { cobradoEsteMes: gb2.dataset.cobrado === '1' }); datos = r.datos; guardar(); pintarTodo(); return avisar(r.texto); }
  const gtodos = t.closest('[data-gastos-ok]');
  if (gtodos) { datos = confirmarTodos(datos, HOY, gtodos.dataset.gastosOk.split(',')); registrarCambio('Confirmaste tus gastos fijos'); guardar(); pintarTodo(); return avisar('Listo: confirmados para este mes'); }
  if (t.closest('[data-guardar-todo]')) return guardarTodo();
  if (t.closest('[data-conectar-mail]')) { if (vista !== 'subir') verVista('subir'); return conectarMail(); }
  if (t.closest('[data-cambios-visto]')) { datos.fotoBase = fotoProyeccion(datos, HOY); datos.cambios = []; guardar(); pintarInicio(); return avisar('Listo: tomamos esto como punto de partida'); }
  if (t.closest('[data-saldo]')) return abrirSaldo();
  if (t.closest('[data-ver-dificil]')) { $id('dificil').scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }); return $id('t-dificil')?.focus?.(); }
  const pl = t.closest('[data-pregunta-luego]');
  if (pl) { datos.preguntasLuego = [...datos.preguntasLuego, pl.dataset.preguntaLuego].slice(-100); guardar(); pintarInicio(); return avisar('Queda para más tarde'); }
  const po = t.closest('[data-pregunta-ok]');
  if (po) { const r = datos.resumenes.find(x => x.id === po.dataset.preguntaOk); if (r) delete r.dudoso; guardar(); pintarInicio(); return avisar('Listo, confirmado'); }
  const cg = t.closest('[data-confirmar-gasto]');
  if (cg) { datos.confirmados = { ...datos.confirmados, [HOY]: [...(datos.confirmados[HOY] || []), cg.dataset.confirmarGasto] }; guardar(); pintarInicio(); return avisar('Confirmado para este mes'); }
  const cq = t.closest('[data-concilia-q]');
  if (cq) {
    const idc = cq.dataset.cuota;
    datos.concilia = datos.concilia.filter(x => x.cuotaId !== idc);
    if (cq.dataset.conciliaQ === 'si') datos.cuotas = datos.cuotas.filter(c => c.id !== idc);
    guardar(); pintarTodo(); return avisar(cq.dataset.conciliaQ === 'si' ? 'Listo: queda la del resumen' : 'Listo: quedan las dos');
  }
  if (t.closest('[data-revisa-mas]')) { revisaAbierta = !revisaAbierta; pintarInicio(); return $id('revisa').querySelector('[data-revisa-mas]')?.focus(); }
  if (t.closest('[data-libera-destino]')) {
    const tenia = !!datos.meta;
    datos = asignarLiberacion(datos, HOY_ISO); guardar(); pintarTodo();
    return avisar(tenia ? `Listo: va a tu meta ${datos.meta.nombre}` : 'Meta armada con lo que se libera. La podés editar');
  }
  if (t.closest('[data-consejo-sig]')) { consejoIdx++; pintarConsejo(); return $id('consejo').querySelector('[data-consejo-sig]')?.focus(); }
  const oc = t.closest('[data-consejo-ocultar]');
  if (oc) { datos.consejosVistos = [...datos.consejosVistos, oc.dataset.consejoOcultar].slice(-100); guardar(); pintarConsejo(); return avisar('Listo, no lo mostramos más'); }
  if (t.closest('[data-meta-nueva]')) return abrirMeta(false);
  if (t.closest('[data-meta-editar]')) return abrirMeta(true);
  const ap = t.closest('[data-aporte]');
  if (ap) return anotarAporte(Number(ap.dataset.aporte));
  if (t.closest('[data-aporte-otro]')) { $id('a-monto').value = ''; return abrir(da, $id('a-monto')); }
  const re = t.closest('[data-reto]');
  if (re) { datos.retos = { ...datos.retos, [HOY]: { id: re.dataset.reto, estado: 'aceptado' } }; guardar(); pintarReto(); $id('t-reto')?.focus?.(); return avisar('Reto elegido. Si no sale, no pasa nada'); }
  const rs = t.closest('[data-reto-estado]');
  if (rs) { datos.retos[HOY] = { ...datos.retos[HOY], estado: rs.dataset.retoEstado }; guardar(); pintarReto(); return; }
  if (t.closest('[data-reto-cambiar]')) { const { [HOY]: _, ...resto } = datos.retos; datos.retos = resto; guardar(); pintarReto(); return; }
  if (t.closest('[data-exportar]')) return exportarCopia();
  if (t.closest('[data-importar-copia]')) { $id('archivo-copia').value = ''; return $id('archivo-copia').click(); }
  if (t.closest('[data-simular-desde-contado]')) return simularDesdeContado();
  if (t.closest('[data-cargar-simulada]')) return cargarSimulada();
});
/* incluir o no un consumo en la revisión */
$id('revisar').addEventListener('change', e => {
  if (e.target.id === 'rv-tarjeta') $id('rv-card').innerHTML = tcard(tarjetaDe(e.target.value) || pendiente.nueva, { boton: false });
  if (e.target.name === 'rv-pago') $id('rv-pago-otro').hidden = e.target.value !== 'otro';
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
$id('acceso-devolver').hidden = !F.devolver;
async function revisarVersion() {
  if (LOCAL || document.hidden) return;
  try {
    const j = await (await fetch('version.json', { cache: 'no-store', credentials: 'same-origin' })).json();
    if (j?.v && j.v !== VERSION) $id('version-nueva').hidden = false;
  } catch { /* sin red: no molesta */ }
}
document.addEventListener('visibilitychange', revisarVersion);
setInterval(revisarVersion, 30 * 60 * 1000);
document.addEventListener('click', e => { if (e.target.closest('[data-recargar]')) location.reload(); });
if (F.queCambio && !datos.fotoBase && puedeGuardar) { datos.fotoBase = fotoProyeccion(datos, HOY); guardar(); }
pintarTodo();
const inicial = location.hash.slice(1);
if (['tarjetas', 'cargado', 'escalera', 'contado', 'simular', ...(F.dondeRinde ? ['rinde'] : []), ...(F.devolver ? ['devolver'] : [])].includes(inicial)) verVista(inicial, { foco: false });
iniciarGuiaSiHaceFalta();
marcarPush(pushActivo());
if (pushActivo()) { ultimoSync = null; programarSync(); }   // al abrir, manda las fechas del ciclo nuevo
