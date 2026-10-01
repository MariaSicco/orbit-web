// Orbit IVA — pantallas del cierre del mes (F1: cargar → revisar → conciliar → liquidación → exportar).

import { S, guardar, nuevoId, periodoActual, clienteDe, asegurarInicio, abrirPeriodo, mesActual, nube, cargarDeLaCuenta, cargarPeriodo, hayCambiosSinGuardar, guardarAhora, nuevoPeriodo, marcarCambio } from './estado.js';
import { leerFoto, leerPdf, comprobanteManual } from './leer-foto.js';
import { escanearQr } from './escanear-qr.js';
import { ia, iaLista, activar, desactivar, modoCuenta, comprarRecarga } from './ia.js';
import { leerQrArca } from '../engine/qr.js';
import { exportarExcel } from './exportar.js';
import { cargarEjemplo } from './ejemplo.js';
import { TIPOS, infoTipo } from '../engine/tipos.js';
import { cuitValido } from '../engine/cuit.js';
import { aCentavos } from '../engine/dinero.js';
import { $, esc, plata, aInput, cuitLindo, fechaCorta, nombreMes, avisar, abrirDialogo, cerrarDialogo } from './util.js';
import * as conciliador from './conciliador.js';
import { combinarLectura, TASAS_VALIDAS } from '../engine/lectura.js';
import { columnas, totalesCompras, necesitaRevision, fueraDelResumen, porAlicuota } from '../engine/libro-compras.js';

const numeroCorto = c => `${infoTipo(c.tipo)?.clase ?? '?'} ${String(c.ptoVta ?? '').padStart(4, '0')}-${Number.isFinite(c.numero) ? String(c.numero).padStart(8, '0') : 's/n'}`;

// Dos herramientas independientes sobre el mismo mes.
const HERRAMIENTAS = {
  calculadora: { nombre: 'Calculadora de IVA', pasos: [['liquidador', 'Liquidador de IVA']] },
  conciliador: { nombre: 'Conciliador ARCA', pasos: conciliador.PASOS },
};
const herramientaDe = paso => Object.keys(HERRAMIENTAS).find(h => HERRAMIENTAS[h].pasos.some(([id]) => id === paso)) ?? null;
let ui = { editando: null, verVentas: false, verNoA: false, leyendo: null, confirmar: null };

function ir(paso) {
  S.actual.paso = paso; guardar(); render();
  $('#panel').focus({ preventScroll: true });
  window.scrollTo({ top: 0 });
}

// ——— Render general ———
function render() {
  // Modo cuenta: la herramienta es solo para quien la compró. Mientras se verifica, o sin sesión o compra, solo el aviso.
  if (modoCuenta && ia.estado !== 'activa') {
    $('#contexto').innerHTML = ia.estado === 'validando' ? '' : '<a class="volver" href="/">orbitando.com.ar</a>';
    $('#pasos').hidden = true; $('#pasos').innerHTML = '';
    document.querySelector('.shell').classList.add('sin-pasos');
    $('#panel').innerHTML = ia.estado === 'validando' ? '<p class="muted" role="status">Verificando tu cuenta…</p>'
      : avisoCuenta() || '<div class="aviso-cuenta" role="status"><p><b>No pudimos verificar tu cuenta.</b> Revisá la conexión y recargá la página.</p></div>';
    return;
  }
  if (nube.activa && nube.estado === 'cargando') { $('#contexto').innerHTML = ''; $('#panel').innerHTML = '<p class="muted" role="status">Cargando tus datos…</p>'; return; }
  asegurarInicio();
  const p = periodoActual();
  // El período se trae de la cuenta recién cuando se abre
  if (p._pendiente) {
    $('#panel').innerHTML = '<p class="muted" role="status">Cargando el período…</p>';
    cargarPeriodo(p).then(render).catch(e => { $('#panel').innerHTML = `<div class="aviso-cuenta" role="alert"><p><b>No pudimos traer este período.</b> ${esc(e.message)}</p><button class="btn primario" data-accion="reintentar">Reintentar</button></div>`; });
    return;
  }
  const herramienta = herramientaDe(S.actual.paso);
  if (!herramienta) S.actual.paso = 'inicio';
  renderContexto(p, herramienta);
  $('#pasos').hidden = !herramienta || HERRAMIENTAS[herramienta].pasos.length === 1;
  document.querySelector('.shell').classList.toggle('sin-pasos', $('#pasos').hidden);
  if (!herramienta) { $('#pasos').innerHTML = ''; $('#panel').innerHTML = avisoCuenta() + pantallaInicio(p); return; }
  renderPasos(p, herramienta);
  const actual = $('.paso[aria-current]');
  if (actual) $('#pasos').scrollLeft = actual.offsetLeft - 16; // en el celular, el paso actual queda a la vista
  const pantallas = { liquidador: pantallaLiquidador, ...conciliador.pantallas };
  $('#panel').innerHTML = avisoCuenta() + pantallas[S.actual.paso](p);
}

// Barra de arriba: volver a las herramientas, empresa (opcional), período e IA.
function renderContexto(p, herramienta) {
  const c = clienteDe(p);
  const opciones = S.clientes.map(x => `<option value="${x.id}" ${x.id === c?.id ? 'selected' : ''}>${esc(x.nombre)}</option>`).join('');
  const quedan = Math.max(0, ia.limite - ia.usadas);
  $('#contexto').innerHTML = `
    ${herramienta ? `<button class="volver" data-ir="inicio" aria-label="Volver a las herramientas">← <span class="solo-ancho">Herramientas</span></button>` : ''}
    <label class="selector"><span>Empresa</span>
      <select data-empresa aria-label="Empresa">${opciones}<option disabled>──────</option><option value="__nueva">＋ Agregar empresa</option><option value="__editar">Editar “${esc(c?.nombre)}”</option></select>
    </label>
    <label class="selector"><span>Período</span><input type="month" data-mes value="${esc(p.mes)}" aria-label="Período"></label>
    ${nube.activa ? '<span class="estado-guardado" id="estado-guardado" role="status"></span>' : ''}
    ${modoCuenta ? chipCuenta() : ia.estado === 'activa' && quedan <= 5 ? `<span class="ia-chip on" role="status">Quedan ${quedan} lecturas con IA hoy</span>` : ''}`;
  if (nube.activa) dispatchEvent(new CustomEvent('orbit-guardado'));
}

// ——— Cuenta de Orbit (modo cuenta, dentro de orbitando.com.ar) ———
const POCAS = 100;
function chipCuenta() {
  if (ia.estado !== 'activa') return '';
  const saldo = ia.ilimitado ? 'Admin · sin límite' : `${ia.saldo.toLocaleString('es-AR')} lecturas`;
  return `<button class="ia-chip ${!ia.ilimitado && ia.saldo <= POCAS ? '' : 'on'}" data-accion="recarga" title="Sumar lecturas">${saldo}${!ia.ilimitado && ia.saldo <= POCAS ? ' · Sumar' : ''}</button>
    <a class="volver" href="/biblioteca">Mi cuenta</a>`;
}

// Aviso arriba del panel cuando falta sesión, compra o saldo
function avisoCuenta() {
  if (!modoCuenta) return '';
  if (ia.estado === 'sin-sesion') return `<div class="aviso-cuenta" role="status"><p><b>Entrá con tu cuenta de Orbit</b> para usar Orbit IVA. Si todavía no la compraste, la encontrás en la tienda.</p><div class="fila"><a class="btn primario" href="/acceso">Entrar</a><a class="btn" href="/producto?id=ob-005">Ver Orbit IVA</a></div></div>`;
  if (ia.estado === 'sin-compra') return `<div class="aviso-cuenta" role="status"><p><b>Orbit IVA es para quienes la compraron.</b> Con tu compra se suman 1.500 lecturas de facturas con IA.</p><div class="fila"><a class="btn primario" href="/producto?id=ob-005">Comprar Orbit IVA</a></div></div>`;
  if (ia.estado === 'activa' && !ia.ilimitado && ia.saldo <= 0) return `<div class="aviso-cuenta" role="status"><p><b>Te quedaste sin lecturas con IA.</b> La herramienta sigue funcionando con el lector del teléfono, que es menos preciso.</p><div class="fila"><button class="btn primario" data-accion="recarga">Sumar ${ia.recarga?.lecturas?.toLocaleString('es-AR') ?? '1.000'} lecturas</button></div></div>`;
  if (ia.estado === 'activa' && !ia.ilimitado && ia.saldo <= POCAS) return `<div class="aviso-cuenta suave" role="status"><p>Te quedan <b>${ia.saldo}</b> lecturas con IA.</p><button class="btn chico" data-accion="recarga">Sumar ${ia.recarga?.lecturas?.toLocaleString('es-AR') ?? '1.000'}</button></div>`;
  return '';
}

function dialogoRecarga() {
  const r = ia.recarga;
  if (!r) return avisar('La recarga no está disponible en este momento.');
  abrirDialogo(`Sumar ${r.lecturas.toLocaleString('es-AR')} lecturas`, `
    <p>Se suman solas a tu cuenta apenas se acredita el pago.</p>
    <div class="fila" style="flex-direction:column;align-items:stretch">
      <button class="btn primario" data-accion="pagar-recarga" data-via="mercadopago">Mercado Pago · ARS ${r.ars.toLocaleString('es-AR')}</button>
      <button class="btn" data-accion="pagar-recarga" data-via="paypal">PayPal o tarjeta · USD ${r.usd}</button>
    </div>
    <p class="muted chico">Te quedan ${ia.saldo.toLocaleString('es-AR')} lecturas. Pagás con la cuenta ${esc(ia.email)}.</p>`);
}

function dialogoEmpresa(editar) {
  const c = editar ? clienteDe(periodoActual()) : null;
  abrirDialogo(editar ? 'Editar empresa' : 'Agregar empresa', `
    <form data-form="empresa" data-id="${c?.id ?? ''}" novalidate>
      <p class="muted" style="margin-top:0">Si llevás el IVA de varias empresas, cada una tiene sus facturas separadas. La CUIT sirve para reconocer las facturas de venta.</p>
      <div class="campo"><label for="emp-nombre">Nombre</label><input id="emp-nombre" name="nombre" value="${esc(c?.nombre ?? '')}" required autocomplete="off"></div>
      <div class="campo" style="margin-top:12px"><label for="emp-cuit">CUIT (opcional)</label><input id="emp-cuit" name="cuit" value="${esc(cuitLindo(c?.cuit ?? ''))}" inputmode="numeric" placeholder="30-12345678-9" aria-describedby="emp-err"></div>
      <p id="emp-err" class="error" role="alert"></p>
      <div class="fila"><button class="btn primario">${editar ? 'Guardar' : 'Agregar'}</button></div>
    </form>
    ${editar ? `<div class="zona-borrar"><p class="mono muted">Borrar datos</p>
      <div class="fila"><button class="btn chico" data-accion="borrar-periodo">Borrar ${esc(nombreMes(periodoActual().mes))}</button><button class="btn chico" data-accion="borrar-empresa">Eliminar esta empresa</button></div>
      <p class="muted chico">${nube.activa ? 'Tus datos se guardan en tu cuenta de Orbit mientras la tengas. Las fotos de las facturas no se guardan.' : 'Tus datos se guardan en este navegador.'}</p></div>` : ''}`);
}

function dialogoIa() {
  abrirDialogo('Lectura con IA', ia.estado === 'activa'
    ? `<p>Activada para <b>${esc(ia.nombre)}</b>. Te quedan <b>${Math.max(0, ia.limite - ia.usadas)} de ${ia.limite}</b> lecturas hoy.</p>
       <p class="muted">Las fotos se envían a Claude (Anthropic) solo para leerlas y no se guardan.</p>
       <button class="btn" data-accion="ia-salir">Desactivar en este navegador</button>`
    : `<form data-form="ia">
        <p style="margin-top:0">Con la IA las facturas se leen mucho mejor. Ingresá tu código de acceso.</p>
        <p class="muted">Las fotos se envían a Claude (Anthropic) solo para leerlas y no se guardan.</p>
        <div class="campo"><label for="ia-codigo">Código de acceso</label><input id="ia-codigo" name="codigo" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ORB-XXXX-XXXX" aria-describedby="ia-error" ${ia.estado === 'invalida' ? 'aria-invalid="true"' : ''}></div>
        <p id="ia-error" class="error" role="alert">${ia.estado === 'invalida' ? 'Ese código no es válido. Revisalo.' : ''}</p>
        <button class="btn primario" ${ia.estado === 'validando' ? 'disabled' : ''}>${ia.estado === 'validando' ? 'Verificando…' : 'Activar'}</button>
      </form>`);
}

function renderPasos(p, herramienta) {
  const estado = { liquidador: ['', ''], ...conciliador.estadoPasos(p) };
  $('#pasos').innerHTML = `<span class="mono muted nombre-herramienta">${HERRAMIENTAS[herramienta].nombre}</span>` + HERRAMIENTAS[herramienta].pasos.map(([id, nombre], i) => `
    <button class="paso" data-paso="${id}" ${S.actual.paso === id ? 'aria-current="step"' : ''}>
      <span class="n" aria-hidden="true">${i + 1}</span>${nombre}
      <span class="estado ${estado[id][0]}">${estado[id][1]}</span>
    </button>`).join('');
}

// ——— Inicio del mes: elegir herramienta ———
function pantallaInicio(p) {
  const t = totalesCompras(p.fotos);
  const conc = conciliador.resumenInicio(p);
  const estadoCalc = !p.fotos.length ? 'Sin facturas este mes'
    : `${t.facturas} ${t.facturas === 1 ? 'factura' : 'facturas'} · IVA ${plata(t.iva)}${t.paraRevisar ? ` · ${t.paraRevisar} para revisar` : ''}`;
  const estadoConc = conc.texto;
  return `
    <section class="portada">
      <span class="mono">OB—005 · Orbit IVA · ${esc(nombreMes(p.mes))}</span>
      <h1 class="titulo-grande">El IVA del mes, <em>en orden.</em></h1>
      <p class="bajada">Dos herramientas para cerrar el mes sin copiar números a mano.</p>
    </section>
    <div class="objetos">
      <button class="objeto oscuro" data-ir="liquidador">
        <span class="objeto-cod">01 — Calculadora</span>
        <span class="objeto-titulo">Calculadora<br>de IVA</span>
        <span class="objeto-desc">Subís las fotos de las facturas de compra y te arma el Libro de IVA del mes.</span>
        <span class="objeto-pie"><span class="objeto-estado">${esc(estadoCalc)}</span><span class="objeto-cta">Abrir →</span></span>
      </button>
      <button class="objeto" data-ir="${conc.paso}">
        <span class="objeto-cod">02 — Conciliador</span>
        <span class="objeto-titulo">Conciliador<br>ARCA</span>
        <span class="objeto-desc">Cruzás el Excel de tu sistema contable con el de ARCA. Se resuelve lo seguro y te muestra solo lo que necesita revisión.</span>
        <span class="objeto-pie"><span class="objeto-estado">${esc(estadoConc)}</span><span class="objeto-cta">Abrir →</span></span>
      </button>
    </div>
    <p class="aviso">¿Querés ver cómo funciona? <button class="enlace" data-accion="ejemplo">Probar con datos de ejemplo</button></p>`;
}


// ——— Calculadora: Liquidador de IVA (una sola pantalla, como el prototipo de Majo) ———
function pantallaLiquidador(p) {
  const t = totalesCompras(p.fotos);
  const alicuotas = porAlicuota(p.fotos);
  const periodo = new Date(`${p.mes}-15`).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
  const leyendo = ui.leyendo ? `<div class="card" role="status" style="margin-top:16px"><b>Foto ${Math.min(ui.leyendo.hechas + 1, ui.leyendo.total)} de ${ui.leyendo.total}</b> <span class="muted">${esc(ui.leyendo.detalle ?? '')}</span><div class="progreso"><i style="transform:scaleX(${(ui.leyendo.hechas / ui.leyendo.total).toFixed(3)})"></i></div></div>` : '';
  const compras = p.fotos.filter(f => !fueraDelResumen(f));
  const ventas = p.fotos.filter(f => fueraDelResumen(f) === 'venta');
  // Facturas con fecha de otro mes: se avisa y se ofrece moverlas a su período (nunca se mueven solas)
  const otrosMeses = [...new Set(p.fotos.filter(f => /^\d{4}-\d{2}/.test(f.fecha ?? '') && f.fecha.slice(0, 7) !== p.mes).map(f => f.fecha.slice(0, 7)))];
  const cantOtros = p.fotos.filter(f => otrosMeses.includes(f.fecha?.slice(0, 7))).length;
  const noA = p.fotos.filter(f => fueraDelResumen(f) === 'no_a');
  const fila = f => {
    const k = columnas(f);
    const revisar = necesitaRevision(f);
    const abierta = ui.editando === f.id;
    return `<tr class="clic ${revisar ? 'fila-revisar' : ''} ${abierta ? 'sel' : ''}" data-editar="${f.id}" tabindex="0" aria-expanded="${abierta}">
      <td class="num">${esc(fechaCorta(f.fecha) || '—')}</td>
      <td>${esc(f.denominacion || cuitLindo(f.cuit) || 'Sin leer')}${revisar ? '<div class="marca-revisar">Revisar</div>' : ''}</td>
      <td class="num">${esc(numeroCorto(f))}</td>
      <td class="der num">${plata(k.neto)}</td>
      <td class="der num col-iva">${plata(k.iva)}</td>
      <td class="der num">${plata(k.iibb)}</td>
      <td class="der num">${plata(k.percepciones)}</td>
      <td class="der num">${plata(k.municipales)}</td>
      <td class="der num">${plata(k.otros)}</td>
      <td class="der num">${plata(k.total)}</td>
      <td class="der num ${Math.abs(k.delta) > 100 ? 'delta-mal' : 'muted'}">${Math.abs(k.delta) > 100 ? plata(k.delta) : '✓'}</td>
    </tr>${abierta ? `<tr class="detalle"><td colspan="11">${editorFactura(f)}</td></tr>` : ''}`;
  };
  return `
    <header class="cabecera no-imprimir">
      <span class="mono">01 — Calculadora de IVA · Libro de Compras · ${esc(periodo)}</span>
      <h1>Calculadora <em>de IVA</em></h1>
    </header>
    <h1 class="solo-imprimir">Libro de IVA Compras · ${esc(periodo)} · ${esc(clienteDe(p)?.nombre)}</h1>
    <section class="resultado" aria-label="Resumen del período">
      <div class="cifra">
        <span class="mono">IVA crédito fiscal · ${t.facturas} ${t.facturas === 1 ? 'factura' : 'facturas'}</span>
        <output class="cifra-numero">${plata(t.iva)}</output>
      </div>
      <dl class="datos">
        <div><dt>Neto gravado</dt><dd>${plata(t.neto)}</dd></div>
        <div><dt>Ingresos Brutos</dt><dd>${plata(t.iibb)}</dd></div>
        <div><dt>Percepciones IVA</dt><dd>${plata(t.percepciones)}</dd></div>
        <div><dt>Percepciones municipales</dt><dd>${plata(t.municipales)}</dd></div>
        <div><dt>Otros / no gravado</dt><dd>${plata(t.otros)}</dd></div>
        <div><dt>Total facturado</dt><dd>${plata(t.total)}</dd></div>
      </dl>
      ${alicuotas.length ? `<div class="por-alicuota" aria-label="IVA por alícuota">${alicuotas.map(x => `<span><span class="mono">IVA ${String(x.tasa).replace('.', ',')}%</span> <b class="num">${plata(x.iva)}</b> <span class="muted chico">sobre ${plata(x.neto)}</span></span>`).join('')}</div>` : ''}
    </section>
    <div class="subir no-imprimir" data-drop="fotos">
      <label class="btn primario grande">Subir fotos de facturas<input class="sr" type="file" data-archivo="fotos" accept="image/*,.pdf" multiple></label>
      <div class="subir-otros">
        <button class="btn" data-accion="qr-nuevo">Escanear QR</button>
        <button class="btn" data-accion="manual">Cargar a mano</button>
      </div>
      <p class="subir-ayuda">Fotos o PDF, varias a la vez. También podés arrastrarlas acá.</p>
    </div>
    ${leyendo}
    ${cantOtros ? `<div class="aviso-cuenta suave no-imprimir" role="status"><p>${cantOtros === 1 ? 'Una factura es' : `${cantOtros} facturas son`} de ${otrosMeses.map(m => esc(nombreMes(m).toLowerCase())).join(' y ')} y estás en ${esc(nombreMes(p.mes).toLowerCase())}.</p><button class="btn chico" data-accion="mover-mes">Mover a su mes</button></div>` : ''}
    ${t.paraRevisar ? `<p class="aviso-revisar">${t.paraRevisar} ${t.paraRevisar === 1 ? 'factura necesita' : 'facturas necesitan'} revisión (marcadas en naranja). Tocá la fila para ver la foto y corregir.</p>` : ''}
    <section class="bloque">
      <div class="bloque-cab"><h2>Detalle por factura</h2><span class="muted">Δ marca cuando el total no coincide con la suma de los conceptos.</span></div>
      ${compras.length ? `<div class="tabla-wrap"><table class="libro">
        <thead><tr><th>Fecha</th><th>Proveedor</th><th>Comprobante</th><th class="der">Neto gravado</th><th class="der">IVA</th><th class="der">Ing. Brutos</th><th class="der">Percep. IVA</th><th class="der">Percep. munic.</th><th class="der">Otros</th><th class="der">Total</th><th class="der">Δ</th></tr></thead>
        <tbody>${compras.map(fila).join('')}</tbody>
        <tfoot><tr><td colspan="3"><b>Totales</b></td><td class="der num">${plata(t.neto)}</td><td class="der num col-iva"><b>${plata(t.iva)}</b></td><td class="der num">${plata(t.iibb)}</td><td class="der num">${plata(t.percepciones)}</td><td class="der num">${plata(t.municipales)}</td><td class="der num">${plata(t.otros)}</td><td class="der num">${plata(t.total)}</td><td></td></tr></tfoot>
      </table></div>` : '<div class="vacio"><p>Todavía no hay facturas. Subí las fotos y aparecen acá.</p></div>'}
    </section>
    ${ventas.length ? `<p class="aviso">${ventas.length} ${ventas.length === 1 ? 'factura es de venta' : 'facturas son de venta'} (la emitió el cliente): no suman al Libro de Compras. <button class="btn chico" data-accion="ver-ventas">${ui.verVentas ? 'Ocultar' : 'Ver'}</button></p>
      ${ui.verVentas ? `<div class="tabla-wrap"><table class="libro"><tbody>${ventas.map(fila).join('')}</tbody></table></div>` : ''}` : ''}
    ${noA.length ? `<p class="aviso">${noA.length} ${noA.length === 1 ? 'factura no es A' : 'facturas no son A'} (B, C u otro tipo): no suman al resumen. Si se leyó mal el tipo, abrila y corregilo. <button class="btn chico" data-accion="ver-no-a">${ui.verNoA ? 'Ocultar' : 'Ver'}</button></p>
      ${ui.verNoA ? `<div class="tabla-wrap"><table class="libro"><tbody>${noA.map(fila).join('')}</tbody></table></div>` : ''}` : ''}
    <div class="acciones no-imprimir">
      <button class="btn" data-accion="excel-calculadora" ${compras.length ? '' : 'disabled'}>Descargar Excel</button>
      <button class="btn" data-accion="imprimir" ${compras.length ? '' : 'disabled'}>Imprimir</button>
      <button class="btn" data-accion="vaciar" ${p.fotos.length ? '' : 'disabled'}>Vaciar todo</button>
    </div>
    <p class="aviso">Estimación para revisar: no es la declaración jurada. La presenta el contribuyente o su contador.</p>`;
}

// Edición de una factura en la misma fila: la foto a la izquierda, los datos a la derecha.
function editorFactura(f) {
  const clase = campo => (f.confianza?.[campo] === 'baja' ? 'conf-baja' : '');
  const campo = (id, etiqueta, valor, extra = '', conf = id) =>
    `<div class="campo ${clase(conf)}"><label for="e-${id}">${etiqueta}${f.confianza?.[conf] === 'baja' ? ' · revisar' : ''}</label><input id="e-${id}" name="${id}" value="${esc(valor)}" ${extra}></div>`;
  const opcionesTipo = Object.entries(TIPOS).sort(([a], [b]) => a.localeCompare(b)).map(([cod, t]) => `<option value="${cod}" ${cod === f.tipo ? 'selected' : ''}>${cod} · ${esc(t.nombre)}</option>`).join('');
  const alicuotas = (f.alicuotas.length ? f.alicuotas : [{ tasa: 21, neto: 0, iva: 0 }]).map((a, i) => `
    <div class="fila ancho ${clase('alicuotas')}">
      <div class="campo"><label for="a-t-${i}">Alícuota</label><select id="a-t-${i}" name="a-tasa">${TASAS_VALIDAS.map(t => `<option value="${t}" ${t === a.tasa ? 'selected' : ''}>${String(t).replace('.', ',')}%</option>`).join('')}</select></div>
      <div class="campo"><label for="a-n-${i}">Neto gravado</label><input id="a-n-${i}" name="a-neto" inputmode="decimal" value="${aInput(a.neto)}"></div>
      <div class="campo"><label for="a-i-${i}">IVA</label><input id="a-i-${i}" name="a-iva" inputmode="decimal" value="${aInput(a.iva)}"></div>
    </div>`).join('');
  const k = columnas(f);
  const trib = t => f.tributos?.find(x => x.tipo === t)?.importe ?? 0;
  return `<div class="revision editor">
    <div class="visor">${f.imagenUrl ? `<img src="${esc(f.imagenUrl)}" alt="Foto de la factura${f.nombreArchivo ? ': ' + esc(f.nombreArchivo) : ''}">` : `<p style="color:var(--b);margin:24px">${f.origen === 'manual' ? 'Carga a mano: no hay imagen.' : 'La imagen no se guarda al recargar la página en este prototipo.'}</p>`}</div>
    <form data-form="factura" data-id="${f.id}">
      <div class="fila" style="margin-bottom:12px">
        ${f.conIa ? '<span class="qr-ok">✓ Leída con IA</span>' : ''}
        ${f.conQr ? '<span class="qr-ok">✓ QR: número, fecha, CUIT y total confirmados</span>' : '<button class="btn chico" type="button" data-accion="qr-actual">Escanear el QR de esta factura</button>'}
      </div>
      ${f.alertas?.length ? `<ul class="alertas">${f.alertas.map(a => `<li>${esc(a.mensaje)}</li>`).join('')}</ul>` : ''}
      <div class="form-lectura">
        <div class="campo ancho"><label for="e-denominacion">Proveedor</label><input id="e-denominacion" name="denominacion" value="${esc(f.denominacion)}"></div>
        ${campo('cuit', 'CUIT', f.cuit ?? '', 'inputmode="numeric"')}
        ${campo('fecha', 'Fecha', f.fecha ?? '', 'type="date"')}
        <div class="campo ${clase('tipo')}"><label for="e-tipo">Tipo${f.confianza?.tipo === 'baja' ? ' · revisar' : ''}</label><select id="e-tipo" name="tipo"><option value="">—</option>${opcionesTipo}</select></div>
        <div class="campo"><label for="e-lado">Es una</label><select id="e-lado" name="lado"><option value="compra" ${f.lado !== 'venta' ? 'selected' : ''}>Compra</option><option value="venta" ${f.lado === 'venta' ? 'selected' : ''}>Venta</option></select></div>
        ${campo('ptoVta', 'Punto de venta', f.ptoVta ?? '', 'inputmode="numeric"')}
        ${campo('numero', 'Número', Number.isFinite(f.numero) ? f.numero : '', 'inputmode="numeric"')}
        ${alicuotas}
        <div class="ancho"><button class="btn chico" type="button" data-accion="mas-alicuota">+ Otra alícuota</button></div>
        ${campo('percepcionIibb', 'Ing. Brutos', aInput(trib('percepcion_iibb')), 'inputmode="decimal"', 'x')}
        ${campo('percepcionIva', 'Percepciones IVA', aInput(trib('percepcion_iva')), 'inputmode="decimal"', 'x')}
        ${campo('percepcionMunicipal', 'Percepciones municipales', aInput(trib('municipal')), 'inputmode="decimal"', 'x')}
        ${campo('otros', 'Otros / no gravado', aInput(Math.abs(k.otros)), 'inputmode="decimal"', 'x')}
        ${campo('total', 'Total factura', aInput(f.total), 'inputmode="decimal"')}
      </div>
      <div class="fila" style="margin-top:16px">
        <button class="btn primario">Guardar</button>
        <button class="btn" type="button" data-accion="cerrar-editor">Cerrar</button>
        <button class="btn" type="button" data-accion="descartar">Borrar factura</button>
      </div>
    </form>
  </div>`;
}

function guardarFactura(form) {
  const p = periodoActual(); const cliente = clienteDe(p);
  const f = p.fotos.find(x => x.id === form.dataset.id);
  const d = new FormData(form);
  const tasas = d.getAll('a-tasa'), netos = d.getAll('a-neto'), ivas = d.getAll('a-iva');
  const lectura = {
    ...lecturaVacia(), tipo_codigo: d.get('tipo') || null,
    punto_venta: parseInt(d.get('ptoVta'), 10) || null, numero: parseInt(d.get('numero'), 10) || null,
    fecha: d.get('fecha') || null, cuit_emisor: d.get('cuit'), razon_social_emisor: d.get('denominacion'),
    moneda: f.moneda, cotizacion: f.cotizacion,
    alicuotas: tasas.map((t, i) => ({ tasa: Number(t), neto: aCentavos(netos[i]) / 100, iva: aCentavos(ivas[i]) / 100 })).filter(a => a.neto || a.iva),
    no_gravado: aCentavos(d.get('otros')) / 100 || null,
    percepciones_iva: aCentavos(d.get('percepcionIva')) / 100 || null, percepciones_iibb: aCentavos(d.get('percepcionIibb')) / 100 || null,
    percepciones_municipales: aCentavos(d.get('percepcionMunicipal')) / 100 || null,
    total: aCentavos(d.get('total')) / 100 || null, cae: f.cae,
  };
  const r = combinarLectura(lectura, null, { cuitCliente: cliente.cuit, id: f.id });
  const problemas = (r.alertas || []).filter(a => ['cuit_invalido', 'sin_cuit', 'no_cierra', 'alicuota_no_cierra', 'tipo_desconocido', 'sin_desglose'].includes(a.tipo));
  Object.assign(f, r.comprobante, { lado: d.get('lado'), imagenUrl: f.imagenUrl, nombreArchivo: f.nombreArchivo, origen: f.origen, conIa: f.conIa, conQr: f.conQr, alertas: r.alertas });
  if (problemas.length && ui.confirmar !== f.id) {
    f.estadoRevision = 'pendiente';
    ui.confirmar = f.id;
    avisar(`Ojo: ${problemas[0].mensaje} Si está bien así, tocá Guardar de nuevo.`);
    guardar(); render();
    return;
  }
  f.estadoRevision = 'aprobado';
  f.alertas = [];
  ui.confirmar = null;
  ui.editando = null;
  guardar(); render();
  avisar('Factura guardada.');
}

async function recibirArchivos(clave, archivos) {
  const p = periodoActual(); const cliente = clienteDe(p);
  try {
    if (clave === 'fotos') await recibirFotos(p, cliente, archivos);
    else if (clave.startsWith('conc-')) await conciliador.recibirArchivo(p, clave, archivos[0]);
  } catch (e) {
    ui.leyendo = null;
    avisar(e.message);
  }
  guardar(); render();
}

async function recibirFotos(p, cliente, archivos) {
  const lista = [...archivos];
  ui.leyendo = { hechas: 0, total: lista.length }; render();
  for (const archivo of lista) {
    let c;
    const esPdf = archivo.type === 'application/pdf' || /\.pdf$/i.test(archivo.name);
    try {
      const avisarPaso = texto => { ui.leyendo.detalle = texto; render(); };
      c = esPdf ? await leerPdf(archivo, { cuitCliente: cliente.cuit, avisar: avisarPaso }) : await leerFoto(archivo, { cuitCliente: cliente.cuit, avisar: avisarPaso });
    } catch (e) {
      c = comprobanteManual({ cuitCliente: cliente.cuit, imagenUrl: esPdf ? null : URL.createObjectURL(archivo), nombreArchivo: archivo.name, alertas: [{ tipo: 'error', mensaje: e.message }] });
    }
    p.fotos.push(c);
    ui.leyendo.hechas++; render();
  }
  p.archivos.fotos = `${p.fotos.length} comprobantes cargados`;
  ui.leyendo = null;
  const revisar = p.fotos.slice(-lista.length).filter(necesitaRevision).length;
  avisar(`Listo: ${lista.length} ${lista.length === 1 ? 'factura leída' : 'facturas leídas'}${revisar ? `, ${revisar} para revisar (marcadas en naranja)` : ''}.`);
  S.actual.paso = 'liquidador';
}

// ——— Eventos ———
document.addEventListener('click', async e => {
  const b = e.target.closest('button, tr.clic');
  if (!b) return;
  const p = periodoActual();
  if (b.dataset.paso) return ir(b.dataset.paso);
  if (b.dataset.ir) return ir(b.dataset.ir);
  if (b.dataset.editar) {
    if (e.target.closest('.detalle')) return;
    ui.editando = ui.editando === b.dataset.editar ? null : b.dataset.editar; ui.confirmar = null;
    return render();
  }
  switch (b.dataset.accion) {
    case 'ia': return dialogoIa();
    case 'recarga': return dialogoRecarga();
    case 'reintentar': return render();
    case 'mover-mes': {
      const mover = p.fotos.filter(f => /^\d{4}-\d{2}/.test(f.fecha ?? '') && f.fecha.slice(0, 7) !== p.mes);
      const destinos = new Set();
      for (const f of mover) {
        const mes = f.fecha.slice(0, 7);
        const destino = S.periodos.find(x => x.clienteId === p.clienteId && x.mes === mes) ?? nuevoPeriodo(p.clienteId, mes);
        await cargarPeriodo(destino);
        destino.fotos ??= [];
        destino.fotos.push(f);
        marcarCambio(destino.id); destinos.add(mes);
      }
      p.fotos = p.fotos.filter(f => !mover.includes(f));
      guardar();
      avisar(`${mover.length === 1 ? 'Factura movida' : `${mover.length} facturas movidas`} a ${[...destinos].map(m => nombreMes(m).toLowerCase()).join(' y ')}. Cambiá el período arriba para ${mover.length === 1 ? 'verla' : 'verlas'}.`);
      return render();
    }
    case 'borrar-periodo': {
      if (!confirm(`¿Borrar todo lo cargado en ${nombreMes(p.mes)} para ${clienteDe(p).nombre}? No se puede deshacer.`)) return;
      S.periodos = S.periodos.filter(x => x.id !== p.id); S.actual.periodoId = null;
      cerrarDialogo(); guardar(); avisar('Período borrado.'); return ir('inicio');
    }
    case 'borrar-empresa': {
      const c = clienteDe(p);
      if (S.clientes.length === 1) return avisar('Tiene que quedar al menos una empresa.');
      if (!confirm(`¿Eliminar "${c.nombre}" y todos sus períodos guardados? No se puede deshacer.`)) return;
      S.clientes = S.clientes.filter(x => x.id !== c.id); S.periodos = S.periodos.filter(x => x.clienteId !== c.id);
      if (S.perfiles) delete S.perfiles[c.id];
      S.actual.clienteId = null; S.actual.periodoId = null;
      cerrarDialogo(); guardar(); avisar('Empresa eliminada.'); return ir('inicio');
    }
    case 'pagar-recarga': b.disabled = true; try { await comprarRecarga(b.dataset.via); } catch (err) { b.disabled = false; avisar(err.message); } return;
    case 'cerrar-dialogo': return cerrarDialogo();
    case 'ia-salir': desactivar(); cerrarDialogo(); avisar('Lectura con IA desactivada en este navegador.'); return render();
    case 'ejemplo': await cargarEjemplo(); return ir('inicio');
    case 'qr-nuevo':
    case 'qr-actual': {
      const texto = await escanearQr();
      if (!texto) return;
      const qr = leerQrArca(texto);
      if (!qr) return avisar('Ese QR no es el de una factura de ARCA.');
      const cuitCliente = clienteDe(p).cuit;
      if (b.dataset.accion === 'qr-nuevo') {
        const r = combinarLectura(lecturaVacia(), qr, { cuitCliente, id: nuevoId('foto') });
        p.fotos.push({ ...r.comprobante, origen: 'qr', nombreArchivo: 'QR escaneado', imagenUrl: null, alertas: r.alertas, revisionRapida: false, conQr: true });
        ui.editando = r.comprobante.id;
        guardar(); avisar('QR leído. Completá el neto y el IVA mirando la factura.');
        return ir('liquidador');
      }
      const f = p.fotos.find(x => x.id === ui.editando);
      if (!f) return;
      const otraFactura = Number.isFinite(f.numero) && f.cuit && f.numero !== qr.numero && f.cuit !== qr.cuit;
      if (otraFactura && !confirm(`Este QR parece de otra factura (número ${qr.numero} y CUIT ${cuitLindo(qr.cuit)}, distintos a los de la foto). ¿Lo uso igual?`)) return;
      guardarBorrador(b.closest('form'), f);
      const r = combinarLectura(lecturaDe(f), qr, { cuitCliente, id: f.id });
      Object.assign(f, r.comprobante, { origen: f.origen, nombreArchivo: f.nombreArchivo, imagenUrl: f.imagenUrl, alertas: r.alertas, revisionRapida: r.revisionRapida, conQr: true, estadoRevision: 'pendiente' });
      guardar(); render();
      return avisar(r.alertas.some(a => a.tipo === 'qr_distinto') ? 'QR leído: corregí lo que no coincidía con la foto.' : 'QR leído: los datos coinciden.');
    }
    case 'manual': {
      const nueva = comprobanteManual({ cuitCliente: clienteDe(p).cuit });
      p.fotos.push(nueva);
      ui.editando = nueva.id; guardar(); return render();
    }
    case 'cerrar-editor': ui.editando = null; ui.confirmar = null; return render();
    case 'ver-ventas': ui.verVentas = !ui.verVentas; return render();
    case 'ver-no-a': ui.verNoA = !ui.verNoA; return render();
    case 'vaciar': {
      if (!confirm(`¿Borrar las ${p.fotos.length} facturas de este período? No se puede deshacer.`)) return;
      p.fotos = []; ui.editando = null; guardar(); avisar('Período vaciado.'); return render();
    }
    case 'mas-alicuota': {
      const f = p.fotos.find(x => x.id === ui.editando);
      guardarBorrador(b.closest('form'), f);
      f.alicuotas = [...(f.alicuotas.length ? f.alicuotas : [{ tasa: 21, neto: 0, iva: 0 }]), { tasa: 10.5, neto: 0, iva: 0 }];
      return render();
    }
    case 'descartar': {
      p.fotos = p.fotos.filter(x => x.id !== ui.editando);
      ui.editando = null;
      avisar('Factura borrada.'); guardar(); return render();
    }
    case 'excel-calculadora': {
      try { await exportarExcel({ periodo: p, cliente: clienteDe(p) }); avisar('Excel descargado.'); } catch (err) { avisar(err.message); }
      return;
    }
    case 'imprimir': return window.print();
  }
});

const lecturaVacia = () => ({
  es_comprobante: true, tipo_codigo: null, letra: null, punto_venta: null, numero: null, fecha: null, cuit_emisor: null,
  razon_social_emisor: null, cuit_receptor: null, moneda: 'PES', cotizacion: 1, alicuotas: [], no_gravado: null, exento: null,
  percepciones_iva: null, percepciones_iibb: null, percepciones_municipales: null, otros_tributos: null, total: null, cae: null, campos_dudosos: [],
});

// Pasa un comprobante ya cargado (centavos) a la forma de una lectura (pesos), para volver a combinarlo con el QR.
function lecturaDe(f) {
  const trib = t => (f.tributos?.find(x => x.tipo === t)?.importe ?? 0) / 100 || null;
  return {
    ...lecturaVacia(), tipo_codigo: f.tipo || null, punto_venta: f.ptoVta, numero: Number.isFinite(f.numero) ? f.numero : null,
    fecha: f.fecha || null, cuit_emisor: f.cuit || null, razon_social_emisor: f.denominacion, moneda: f.moneda, cotizacion: f.cotizacion,
    alicuotas: f.alicuotas.filter(a => a.neto || a.iva).map(a => ({ tasa: a.tasa, neto: a.neto / 100, iva: a.iva / 100 })),
    no_gravado: f.noGravado / 100 || null, exento: f.exento / 100 || null,
    percepciones_iva: trib('percepcion_iva'), percepciones_iibb: trib('percepcion_iibb'), percepciones_municipales: trib('municipal'),
    total: f.total ? f.total / 100 : null, cae: f.cae,
  };
}

// Mantiene lo tipeado al agregar una alícuota
function guardarBorrador(form, f) {
  const d = new FormData(form);
  const tasas = d.getAll('a-tasa'), netos = d.getAll('a-neto'), ivas = d.getAll('a-iva');
  f.alicuotas = tasas.map((t, i) => ({ tasa: Number(t), neto: aCentavos(netos[i]), iva: aCentavos(ivas[i]) }));
  f.total = aCentavos(d.get('total'));
}

document.addEventListener('submit', e => {
  const form = e.target;
  e.preventDefault();
  const d = new FormData(form);
  if (form.dataset.form === 'empresa') {
    const cuit = String(d.get('cuit')).replace(/\D/g, '');
    const nombre = String(d.get('nombre')).trim();
    const id = form.dataset.id;
    const err = !nombre ? 'Falta el nombre.' : cuit && !cuitValido(cuit) ? 'Esa CUIT no es válida: revisá el último dígito.'
      : cuit && S.clientes.some(c => c.cuit === cuit && c.id !== id) ? 'Ya hay una empresa con esa CUIT.' : '';
    if (err) { $('#emp-err').textContent = err; return; }
    if (id) Object.assign(S.clientes.find(c => c.id === id), { nombre, cuit });
    else { const c = { id: nuevoId('cli'), nombre, cuit }; S.clientes.push(c); abrirPeriodo(c.id, periodoActual()?.mes ?? mesActual()); }
    guardar(); cerrarDialogo(); render(); avisar(id ? 'Empresa actualizada.' : `Listo: ahora trabajás con ${nombre}.`);
  }
  if (form.dataset.form === 'factura') guardarFactura(form);
  if (form.dataset.form === 'ia') {
    const codigo = d.get('codigo');
    if (!String(codigo ?? '').trim()) return;
    activar(codigo).then(r => {
      if (r.ok) cerrarDialogo(); else dialogoIa();
      render(); avisar(r.ok ? `Lectura con IA activada. Te quedan ${r.limite - r.usadas} lecturas hoy.` : (r.error ?? 'No se pudo verificar el código.'));
    });
    dialogoIa();
  }
});

document.addEventListener('change', e => {
  const t = e.target; const p = periodoActual();
  if (t.matches('[data-empresa]')) {
    if (t.value === '__nueva' || t.value === '__editar') { const editar = t.value === '__editar'; t.value = clienteDe(p).id; return dialogoEmpresa(editar); }
    abrirPeriodo(t.value, p.mes); return render();
  }
  if (t.matches('[data-mes]')) { if (/^\d{4}-\d{2}$/.test(t.value)) { abrirPeriodo(p.clienteId, t.value); render(); } return; }
  if (t.dataset.archivo && t.files.length) return recibirArchivos(t.dataset.archivo, t.files);
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && document.querySelector('.dialogo')) { cerrarDialogo(); return; }
  if (e.key === 'Enter' && e.target.matches('tr.clic')) { e.preventDefault(); e.target.click(); }
});

// Arrastrar y soltar archivos sobre cada zona
for (const tipo of ['dragover', 'dragleave', 'drop']) {
  document.addEventListener(tipo, e => {
    const zona = e.target.closest?.('[data-drop]');
    if (!zona) return;
    e.preventDefault();
    zona.classList.toggle('sobre', tipo === 'dragover');
    if (tipo === 'drop' && e.dataTransfer.files.length) recibirArchivos(zona.dataset.drop, e.dataTransfer.files);
  });
}

// Ningún error queda en silencio: se muestra en pantalla (y se puede mandar una captura).
addEventListener('orbit-sin-espacio', () => avisar('El navegador no tiene más espacio: lo último no quedó guardado. Exportá el resultado antes de cerrar la página.'));
addEventListener('error', e => avisar(`Algo falló: ${e.message}`));
addEventListener('unhandledrejection', e => avisar(`Algo falló: ${e.reason?.message ?? e.reason}`));

// Atajo de desarrollo: #demo-conciliar carga el ejemplo y abre ese paso (sirve para capturas automáticas).
const demo = location.hash.match(/^#demo-(\w+)/);
if (demo) { await cargarEjemplo(); S.actual.paso = herramientaDe(demo[1]) ? demo[1] : 'inicio'; }
conciliador.conectar({ render, ir });
conciliador.instalarEventos(periodoActual);
render();
iaLista.then(async () => {
  if (nube.activa && ia.estado === 'activa') {
    try { await cargarDeLaCuenta(); } catch (e) { nube.estado = 'listo'; avisar(`No pudimos traer tus datos guardados: ${e.message}`); }
  }
  render();
});
// Indicador de guardado (sin volver a dibujar la pantalla)
const TEXTO_GUARDADO = { guardando: 'Guardando…', guardado: '✓ Guardado', error: 'Sin guardar · reintentando', listo: '' };
addEventListener('orbit-guardado', () => {
  const el = $('#estado-guardado');
  if (!el) return;
  el.textContent = TEXTO_GUARDADO[nube.estado] ?? '';
  el.className = `estado-guardado ${nube.estado}`;
  el.title = nube.error ?? '';
});
addEventListener('beforeunload', e => { if (hayCambiosSinGuardar()) { guardarAhora(); e.preventDefault(); e.returnValue = ''; } });
