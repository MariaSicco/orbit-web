// Conciliador ARCA ↔ sistema contable (CHESS u otro): pantallas y acciones.
// Flujo: 1 Archivos → 2 Columnas → 3 Reglas → 4 Resultados → 5 Exportar.
// La interfaz no calcula nada: muestra lo que devuelve el motor y registra las decisiones del usuario.

import { S, guardar } from './estado.js';
import { $, esc, plataO, cuitLindo, fechaCorta, fechaLarga, nombreMes, avisar, abrirDialogo, cerrarDialogo } from './util.js';
import { conc, perfil, leerFilas, crearFuente, tablaDe, resumenFuente, guardarMapeoEnPerfil, reglasDeCorrida, reglasDelPerfil, fijarRegla, agregarRegla, configActual, listo, resultadoDe, registrarCorrida, registrarDecision, deshacerDecision } from './conciliador-datos.js';
import { CAMPOS, validarMapeo } from '../engine/conciliacion/columnas.js';
import { describirRegla, interpretarReglaLocal, validarRegla, CAMPOS_COMPARABLES } from '../engine/conciliacion/reglas.js';
import { NOMBRE_ETIQUETA } from '../engine/conciliacion/motor.js';
import { explicacionLocal, detalleDiferencia } from '../engine/conciliacion/explicar.js';
import { reglasSugeridas } from '../engine/conciliacion/aprender.js';
import { infoTipo } from '../engine/tipos.js';
import { formatear } from '../engine/dinero.js';
import { ia, pedirAsistente } from './ia.js';
import { exportarConciliacion, exportarCsv } from './conciliador-excel.js';

export const PASOS = [['archivos', 'Archivos'], ['columnas', 'Columnas'], ['reglas', 'Reglas'], ['conciliar', 'Resultados'], ['exportar-conc', 'Exportar']];

let app = { render: () => {}, ir: () => {} };
export const conectar = x => { app = x; };

const ui = { filtro: 'pendientes', busqueda: '', proveedor: '', difMin: '', orden: 'estado', abierta: null, candidato: 0, limite: 150, propuesta: null, ocupado: null, guardarMapeo: true };

const nombreSistema = p => perfil(p).sistemaNombre || 'Sistema';
const ESTADO_UI = p => ({
  pendientes: ['!', 'Necesitan atención'],
  coincide: ['✓', 'Coincide'], diferencia: ['≠', 'Diferencia'], revision: ['?', 'Revisar'],
  solo_arca: ['A', 'Solo ARCA'], solo_sistema: ['S', `Solo ${nombreSistema(p)}`], duplicado: ['×2', 'Duplicado'],
});
const tag = (p, e) => `<span class="estado-tag e-${e}"><span class="ic" aria-hidden="true">${ESTADO_UI(p)[e][0]}</span>${esc(ESTADO_UI(p)[e][1])}</span>`;
const compTexto = r => (r ? `${infoTipo(r.tipo)?.clase ?? (r.tipo ? r.tipo : '?')} ${String(r.ptoVta ?? 0).padStart(4, '0')}-${r.numero != null ? String(r.numero).padStart(8, '0') : 's/n'}` : '—');
const ladoTexto = l => (l === 'compra' ? 'Compras' : 'Ventas');

function cabecera(p, titulo, bajada) {
  const c = conc(p);
  return `<header class="cabecera">
    <span class="mono">02 — Conciliador ARCA · ${esc(nombreMes(p.mes))} · ${ladoTexto(c.lado)}</span>
    <h1>${titulo}</h1>
    ${bajada ? `<p class="bajada">${bajada}</p>` : ''}
    <div class="segmentado" role="group" aria-label="Compras o ventas">
      ${['compra', 'venta'].map(l => `<button class="${c.lado === l ? 'on' : ''}" data-caccion="lado" data-valor="${l}" aria-pressed="${c.lado === l}">${ladoTexto(l)}</button>`).join('')}
    </div>
  </header>`;
}

// ——— Estado para la navegación y el inicio ———
export function estadoPasos(p) {
  const c = conc(p), f = c.fuentes[c.lado];
  const res = resultadoDe(p);
  return {
    archivos: f.sistema && f.arca ? ['ok', '✓'] : ['', ''],
    columnas: f.sistema?.confirmado && f.arca?.confirmado ? ['ok', '✓'] : ['', ''],
    reglas: todasLasCorridas(p) ? ['ok', '✓'] : ['', ''],
    conciliar: !res ? ['', ''] : res.resumen.pendientes ? ['', `${res.resumen.pendientes}`] : ['ok', '✓'],
    'exportar-conc': c.exportado ? ['ok', '✓'] : ['', ''],
  };
}
const todasLasCorridas = p => conc(p).corridas.some(x => x.lado === conc(p).lado);

export function resumenInicio(p) {
  const c = conc(p);
  const lados = ['compra', 'venta'].filter(l => c.fuentes[l].sistema || c.fuentes[l].arca);
  if (!lados.length) return { texto: 'Sin archivos este mes', paso: 'archivos' };
  const listos = lados.filter(l => listo(p, l));
  if (!listos.length) return { texto: 'Falta revisar las columnas', paso: 'columnas' };
  const pend = listos.reduce((s, l) => s + resultadoDe(p, l).resumen.pendientes, 0);
  return { texto: pend ? `${pend} ${pend === 1 ? 'caso necesita' : 'casos necesitan'} atención` : 'Todo conciliado', paso: 'conciliar' };
}

// ——— 1 · Archivos ———
function tarjetaFuente(p, origen) {
  const c = conc(p), f = c.fuentes[c.lado][origen];
  const titulo = origen === 'sistema' ? 'Sistema contable' : 'ARCA';
  const ayuda = origen === 'sistema'
    ? `El Excel o CSV que exporta ${esc(nombreSistema(p))} con las ${c.lado === 'compra' ? 'compras' : 'ventas'} del mes.`
    : `Mis Comprobantes ${c.lado === 'compra' ? 'Recibidos' : 'Emitidos'} del mes, en Excel o CSV.`;
  let info = '';
  if (f) {
    const r = resumenFuente(f, origen, c.lado);
    const otroMes = r.periodo.mes && r.periodo.mes !== p.mes;
    info = `<div class="fuente-info">
      <p class="fuente-nombre">✓ ${esc(f.nombre)}</p>
      <dl class="datos compactos">
        <div><dt>Registros</dt><dd>${r.tabla.datos.length}</dd></div>
        <div><dt>Columnas</dt><dd>${r.tabla.encabezados.length}</dd></div>
        <div><dt>Período probable</dt><dd>${r.periodo.mes ? esc(nombreMes(r.periodo.mes)) : '—'}</dd></div>
      </dl>
      <details><summary>Columnas detectadas</summary><p class="muted">${r.tabla.encabezados.map(esc).join(' · ')}</p></details>
      ${otroMes ? `<p class="alerta-linea">El archivo parece de ${esc(nombreMes(r.periodo.mes))} y el período elegido es ${esc(nombreMes(p.mes))}.</p>` : ''}
      ${r.tabla.avisos.map(a => `<p class="muted chico">${esc(a)}</p>`).join('')}
      ${r.errores.length ? `<details class="errores"><summary>${r.errores.length} ${r.errores.length === 1 ? 'fila con problemas' : 'filas con problemas'} de lectura</summary><ul>${r.errores.slice(0, 20).map(e => `<li>Fila ${e.fila}: ${esc(e.errores.join(', '))}</li>`).join('')}${r.errores.length > 20 ? `<li>… y ${r.errores.length - 20} más</li>` : ''}</ul></details>` : ''}
    </div>`;
  }
  return `<div class="fuente ${f ? 'cargada' : ''}" data-drop="conc-${origen}">
    <span class="mono">Archivo ${origen === 'sistema' ? '1' : '2'}</span>
    <h2 class="fuente-titulo">${titulo}</h2>
    ${origen === 'sistema' ? `<label class="campo angosto"><span class="sr">Nombre del sistema</span><input data-csistema value="${esc(nombreSistema(p))}" aria-label="Nombre del sistema contable" maxlength="40"></label>` : ''}
    <p class="muted">${ayuda}</p>
    ${info}
    <div class="fila">
      <label class="btn ${f ? '' : 'primario'}">${f ? 'Reemplazar' : 'Elegir archivo'}<input class="sr" type="file" data-archivo="conc-${origen}" accept=".xlsx,.xls,.csv,.txt,.tsv"></label>
      ${f ? `<button class="btn" data-caccion="quitar-fuente" data-valor="${origen}">Quitar</button>` : ''}
    </div>
    <p class="muted chico">También podés arrastrarlo acá. Hasta 15 MB.</p>
  </div>`;
}

function pantallaArchivos(p) {
  const f = conc(p).fuentes[conc(p).lado];
  return `${cabecera(p, 'Conciliador <em>ARCA</em>', `Subí los dos archivos del mes. Los leemos acá, sin mandarlos completos a ningún lado.`)}
    <div class="fuentes">${tarjetaFuente(p, 'sistema')}${tarjetaFuente(p, 'arca')}</div>
    <div class="acciones"><button class="btn primario" data-ir="columnas" ${f.sistema && f.arca ? '' : 'disabled'}>Revisar columnas →</button></div>`;
}

export async function recibirArchivo(p, clave, archivo) {
  const origen = clave.replace('conc-', '');
  const c = conc(p);
  const filas = await leerFilas(archivo);
  const fuente = crearFuente(p, origen, archivo, filas);
  c.fuentes[c.lado][origen] = fuente;
  c.exportado = false;
  const n = tablaDe(fuente).datos.length;
  avisar(`${origen === 'arca' ? 'ARCA' : nombreSistema(p)}: ${n} registros leídos.`);
  // Si por nombre y contenido no alcanzó para reconocer las columnas, Claude las propone solo (sin apretar nada)
  if (ia.estado === 'activa' && !validarMapeo(fuente.mapeo, tablaDe(fuente).encabezados).ok) setTimeout(() => columnasConIa(p, origen, true), 0);
}

// ——— 2 · Columnas ———
const ORIGEN_MAPEO = { nombre: 'Por el nombre', contenido: 'Por el contenido', perfil: 'Guardado para esta empresa', ia: 'Sugerido por Claude', manual: 'Elegido a mano' };

function bloqueMapeo(p, origen) {
  const c = conc(p), f = c.fuentes[c.lado][origen];
  if (!f) return '';
  const r = resumenFuente(f, origen, c.lado);
  const primera = r.tabla.datos[0]?.celdas ?? [];
  const ejemplo = h => { const i = r.tabla.encabezados.indexOf(h); return i === -1 ? '' : String(primera[i] ?? ''); };
  const filas = Object.entries(CAMPOS).map(([campo, d]) => {
    const h = f.mapeo?.[campo] ?? '';
    return `<tr>
      <th scope="row">${esc(d.nombre)}${d.requerido ? ' <span class="req" title="Obligatorio">*</span>' : ''}</th>
      <td><select data-cmapeo="${origen}:${campo}" aria-label="Columna para ${esc(d.nombre)}"><option value="">— no está —</option>${r.tabla.encabezados.map(x => `<option ${x === h ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></td>
      <td class="muted chico">${h ? esc(ORIGEN_MAPEO[f.origenMapeo?.[campo]] ?? '') : ''}</td>
      <td class="num chico">${h ? esc(ejemplo(h).slice(0, 40)) : ''}</td>
    </tr>`;
  }).join('');
  const muestra = r.registros.slice(0, 3);
  return `<section class="bloque">
    <div class="bloque-cab"><h2>${origen === 'sistema' ? esc(nombreSistema(p)) : 'ARCA'} · ${esc(f.nombre)}</h2>
      ${ui.ocupado === `columnas-${origen}` ? '<span class="muted chico" role="status">Claude está revisando las columnas…</span>' : ia.estado === 'activa' ? `<button class="btn chico" data-caccion="columnas-ia" data-valor="${origen}" ${ui.ocupado ? 'disabled' : ''}>Volver a detectar con Claude</button>` : ''}</div>
    ${r.validacion.errores.length ? `<ul class="alertas">${r.validacion.errores.map(e => `<li>${esc(e)}</li>`).join('')}</ul>` : '<p class="ok-linea">✓ Están todos los datos necesarios para conciliar.</p>'}
    <div class="tabla-wrap"><table class="mapeo"><thead><tr><th>Dato</th><th>Columna del archivo</th><th>Cómo lo detectamos</th><th>Ejemplo</th></tr></thead><tbody>${filas}</tbody></table></div>
    ${f.mapeo?.alicuotas?.length ? `<p class="muted chico">También tomamos el neto y el IVA por alícuota: ${f.mapeo.alicuotas.map(a => `${String(a.tasa).replace('.', ',')}%`).join(', ')}.</p>` : ''}
    ${muestra.length && r.validacion.ok ? `<p class="mono muted" style="margin-top:16px">Así quedan los primeros registros</p>
      <div class="tabla-wrap"><table><thead><tr><th>Fila</th><th>Fecha</th><th>CUIT</th><th>Comprobante</th><th class="der">Neto</th><th class="der">IVA</th><th class="der">Total</th></tr></thead>
      <tbody>${muestra.map(x => `<tr><td class="num">${x.fila}</td><td class="num">${esc(fechaLarga(x.fecha) || '⚠ sin fecha')}</td><td class="num">${esc(cuitLindo(x.cuit) || '⚠ sin CUIT')}</td><td class="num">${esc(compTexto(x))}</td><td class="der num">${plataO(x.neto)}</td><td class="der num">${plataO(x.iva)}</td><td class="der num">${plataO(x.total)}</td></tr>`).join('')}</tbody></table></div>` : ''}
  </section>`;
}

function pantallaColumnas(p) {
  const f = conc(p).fuentes[conc(p).lado];
  if (!f.sistema || !f.arca) return `${cabecera(p, 'Detectamos estas <em>columnas</em>')}<div class="vacio"><p>Primero subí los dos archivos.</p><button class="btn primario" data-ir="archivos">Subir archivos</button></div>`;
  return `${cabecera(p, 'Detectamos estas <em>columnas</em>', 'Revisá qué columna es cada dato. Si algo no está bien, elegilo en la lista.')}
    ${bloqueMapeo(p, 'sistema')}${bloqueMapeo(p, 'arca')}
    <label class="check"><input type="checkbox" data-cguardar-mapeo ${ui.guardarMapeo ? 'checked' : ''}> Recordar estas columnas para ${esc(S.clientes.find(x => x.id === p.clienteId)?.nombre)} (la próxima vez no te las pregunto)</label>
    <div class="acciones"><button class="btn primario" data-caccion="confirmar-columnas">Confirmar columnas →</button></div>`;
}

// ——— 3 · Reglas ———
function pantallaReglas(p) {
  if (!listo(p)) return `${cabecera(p, 'Reglas de esta <em>conciliación</em>')}<div class="vacio"><p>Primero confirmá las columnas de los dos archivos.</p><button class="btn primario" data-ir="columnas">Revisar columnas</button></div>`;
  const cfg = configActual(p);
  const tol = cfg.tolMonto / 100;
  const opcionesTol = [0, 0.5, 1, 2, 5, 10];
  const instrucciones = reglasDeCorrida(p).map((r, i) => ({ r, i })).filter(x => x.r.deInstruccion);
  const pr = ui.propuesta;
  return `${cabecera(p, 'Reglas de esta <em>conciliación</em>', 'Lo que hoy le aclarás a mano a quien concilia. Se aplica antes de cruzar y queda registrado.')}
    <div class="reglas-grid">
      <div class="campo"><label for="r-tol">Tolerancia de importe</label>
        <select id="r-tol" data-cregla="tolerancia_monto">${opcionesTol.map(v => `<option value="${v}" ${v === tol ? 'selected' : ''}>${v ? `Hasta ${formatear(v * 100)}` : 'Sin tolerancia'}</option>`).join('')}${opcionesTol.includes(tol) ? '' : `<option value="${tol}" selected>Hasta ${formatear(cfg.tolMonto)}</option>`}</select></div>
      <div class="campo"><label for="r-pct">Tolerancia porcentual (opcional)</label>
        <input id="r-pct" data-cregla="tolerancia_porcentaje" inputmode="decimal" value="${cfg.tolPct ? String(cfg.tolPct).replace('.', ',') : ''}" placeholder="0 %"></div>
      <div class="campo"><label for="r-dias">Tolerancia de fecha</label>
        <select id="r-dias" data-cregla="tolerancia_fecha">${[0, 1, 2, 3, 5, 7].map(d => `<option value="${d}" ${d === cfg.tolDias ? 'selected' : ''}>${d ? `± ${d} ${d === 1 ? 'día' : 'días'}` : 'Misma fecha'}</option>`).join('')}</select></div>
      ${['sistema', 'arca'].map(o => `<div class="campo"><label for="r-signo-${o}">Notas de crédito en ${o === 'arca' ? 'ARCA' : esc(nombreSistema(p))}</label>
        <select id="r-signo-${o}" data-cregla="signo_notas_credito" data-origen="${o}"><option value="por_tipo" ${cfg.signos[o] === 'por_tipo' ? 'selected' : ''}>Signo según el tipo (recomendado)</option><option value="como_viene" ${cfg.signos[o] === 'como_viene' ? 'selected' : ''}>Respetar el signo del archivo</option></select></div>`).join('')}
    </div>
    <fieldset class="campos-obligatorios"><legend>Tienen que coincidir</legend>
      ${CAMPOS_COMPARABLES.map(cp => `<label class="check"><input type="checkbox" data-cobligatorio="${cp}" ${cfg.obligatorios.has(cp) ? 'checked' : ''}> ${{ total: 'Total', neto: 'Neto gravado', iva: 'IVA', fecha: 'Fecha', tipo: 'Tipo de comprobante' }[cp]}</label>`).join('')}
      <p class="muted chico">Lo que no marques se muestra como información, sin marcar diferencia.</p>
    </fieldset>

    <section class="bloque">
      <div class="bloque-cab"><h2>Instrucción adicional</h2><span class="muted">Escribila como se la dirías a una persona.</span></div>
      <textarea id="c-instruccion" rows="2" placeholder="Ej.: Ignorá diferencias menores a $1. · Admití fechas con dos días de diferencia. · No incluyas al proveedor X. · Las notas de crédito de este archivo vienen con signo positivo.">${esc(pr?.texto ?? '')}</textarea>
      <div class="fila" style="margin-top:10px"><button class="btn" data-caccion="interpretar" ${ui.ocupado ? 'disabled' : ''}>${ui.ocupado === 'regla' ? 'Interpretando…' : 'Interpretar'}</button>
        <span class="muted chico">${ia.estado === 'activa' ? 'La interpreta Claude y la controla el sistema.' : 'Sin IA disponible entiendo las instrucciones más comunes (abrí el link de acceso para el resto).'}</span></div>
      ${pr ? `<div class="propuesta" role="status">
        ${pr.reglas.length ? `<p class="mono">Entendimos esta regla así${pr.fuente === 'ia' ? ' (Claude)' : ''}</p><ul>${pr.reglas.map(r => `<li>${esc(describirRegla(r))}</li>`).join('')}</ul>
          <div class="fila"><button class="btn primario chico" data-caccion="aplicar-propuesta">Aplicar en esta conciliación</button><button class="btn chico" data-caccion="guardar-propuesta">Aplicar y guardar para la empresa</button><button class="btn chico" data-caccion="descartar-propuesta">Descartar</button></div>`
        : `<p><b>No la pude convertir en una regla.</b> ${esc(pr.duda || 'Probá escribirla de otra forma o usá los controles de arriba.')}</p><button class="btn chico" data-caccion="descartar-propuesta">Cerrar</button>`}
      </div>` : ''}
      ${instrucciones.length ? `<p class="mono muted" style="margin-top:16px">Aplicadas en esta conciliación</p><ul class="lista-reglas">${instrucciones.map(({ r, i }) => `<li><span>${esc(describirRegla(r))}<br><span class="muted chico">“${esc(r.deInstruccion)}”</span></span><button class="btn chico" data-caccion="quitar-regla" data-valor="${i}">Quitar</button></li>`).join('')}</ul>` : ''}
    </section>

    <section class="bloque">
      <div class="bloque-cab"><h2>Guardadas para la empresa</h2><button class="btn chico" data-caccion="guardar-controles">Guardar estos controles para la empresa</button></div>
      ${reglasDelPerfil(p).length ? `<ul class="lista-reglas">${reglasDelPerfil(p).map((r, i) => `<li><span>${esc(describirRegla(r))}</span><button class="btn chico" data-caccion="quitar-regla-perfil" data-valor="${i}">Quitar</button></li>`).join('')}</ul>` : '<p class="muted">Todavía no hay reglas guardadas. Las correcciones que guardes desde los resultados aparecen acá.</p>'}
    </section>
    <div class="acciones"><button class="btn primario grande" data-caccion="conciliar">Conciliar</button></div>`;
}

// ——— 4 · Resultados ———
function filtrar(p, res) {
  const q = ui.busqueda.trim().toLowerCase();
  const difMin = Number(String(ui.difMin).replace(',', '.')) * 100 || 0;
  let lista = res.resultados.filter(r => {
    if (ui.filtro === 'pendientes' ? (r.ignorado || (r.estado === 'coincide' && !r.requiereRevision)) : ui.filtro !== 'todos' && r.estado !== ui.filtro) return false;
    const x = r.sistema ?? r.arca;
    if (ui.proveedor && (r.arca?.cuit ?? x.cuit) !== ui.proveedor && x.cuit !== ui.proveedor) return false;
    if (q && ![x.proveedor, r.arca?.proveedor, x.cuit, compTexto(x), compTexto(r.arca)].join(' ').toLowerCase().includes(q)) return false;
    if (difMin && Math.abs(difTotal(r) ?? 0) < difMin) return false;
    return true;
  });
  const orden = {
    estado: () => 0,
    fecha: (a, b) => String((a.sistema ?? a.arca).fecha).localeCompare(String((b.sistema ?? b.arca).fecha)),
    diferencia: (a, b) => Math.abs(difTotal(b) ?? 0) - Math.abs(difTotal(a) ?? 0),
    proveedor: (a, b) => String((a.sistema ?? a.arca).proveedor).localeCompare(String((b.sistema ?? b.arca).proveedor)),
    score: (a, b) => a.score - b.score,
  }[ui.orden] ?? (() => 0);
  return [...lista].sort(orden);
}
const difTotal = r => (r.sistema && r.arca && r.sistema.total != null && r.arca.total != null ? r.sistema.total - r.arca.total : null);

function pantallaResultados(p) {
  if (!listo(p)) return `${cabecera(p, 'Resultados')}<div class="vacio"><p>Faltan los archivos o confirmar las columnas.</p><button class="btn primario" data-ir="archivos">Ir a archivos</button></div>`;
  const res = resultadoDe(p);
  const rs = res.resumen;
  const lista = filtrar(p, res);
  const proveedores = [...new Map(res.resultados.map(r => r.sistema ?? r.arca).filter(x => x.cuit).map(x => [x.cuit, x.proveedor || x.cuit])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const contador = (clave, n, etiqueta, extra = '') => `<button class="indicador ${extra} ${ui.filtro === clave ? 'on' : ''}" data-caccion="filtro" data-valor="${clave}" aria-pressed="${ui.filtro === clave}"><b>${n}</b><span>${etiqueta}</span></button>`;
  const filas = lista.slice(0, ui.limite).map(r => filaResultado(p, r)).join('');
  return `${cabecera(p, 'Resultados', '')}
    <div class="indicadores" role="group" aria-label="Filtrar resultados">
      ${contador('pendientes', rs.pendientes, 'Necesitan atención', 'fuerte')}
      ${contador('todos', rs.total, 'Total registros')}
      ${contador('coincide', rs.coincide, 'Conciliados')}
      ${contador('solo_arca', rs.solo_arca, 'Solo ARCA')}
      ${contador('solo_sistema', rs.solo_sistema, `Solo ${esc(nombreSistema(p))}`)}
      ${contador('diferencia', rs.diferencia, 'Con diferencias')}
      ${contador('revision', rs.revision, 'Requieren revisión')}
      ${contador('duplicado', rs.duplicado, 'Duplicados')}
    </div>
    ${rs.excluidos || rs.ignorados ? `<p class="muted chico">${rs.excluidos ? `${rs.excluidos} registros excluidos por reglas. ` : ''}${rs.ignorados ? `${rs.ignorados} ignorados por decisión.` : ''}</p>` : ''}
    <div class="filtros">
      <div class="campo"><label for="c-buscar">Buscar</label><input id="c-buscar" type="search" data-cfiltro="busqueda" value="${esc(ui.busqueda)}" placeholder="Proveedor, CUIT o número"></div>
      <div class="campo"><label for="c-prov">Proveedor</label><select id="c-prov" data-cfiltro="proveedor"><option value="">Todos</option>${proveedores.map(([cuit, n]) => `<option value="${esc(cuit)}" ${ui.proveedor === cuit ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></div>
      <div class="campo"><label for="c-dif">Diferencia desde ($)</label><input id="c-dif" data-cfiltro="difMin" inputmode="decimal" value="${esc(ui.difMin)}" placeholder="0"></div>
      <div class="campo"><label for="c-orden">Ordenar por</label><select id="c-orden" data-cfiltro="orden">${[['estado', 'Prioridad'], ['diferencia', 'Mayor diferencia'], ['fecha', 'Fecha'], ['proveedor', 'Proveedor'], ['score', 'Menor coincidencia']].map(([v, t]) => `<option value="${v}" ${ui.orden === v ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
    </div>
    ${lista.length ? `<div class="tabla-wrap"><table class="resultados">
      <thead><tr><th>Estado</th><th>Fecha</th><th>Proveedor</th><th>CUIT</th><th>Comprobante</th><th class="der">${esc(nombreSistema(p))}</th><th class="der">ARCA</th><th class="der">Diferencia</th><th>Motivo</th><th>Match</th></tr></thead>
      <tbody>${filas}</tbody></table></div>
      ${lista.length > ui.limite ? `<div class="acciones"><button class="btn" data-caccion="mas">Mostrar ${Math.min(150, lista.length - ui.limite)} más (de ${lista.length})</button></div>` : ''}`
      : `<div class="vacio"><p>${ui.filtro === 'pendientes' ? 'No queda nada que necesite tu atención.' : 'No hay resultados con estos filtros.'}</p>${ui.filtro === 'pendientes' ? '<button class="btn primario" data-ir="exportar-conc">Exportar</button>' : ''}</div>`}
    <div class="acciones"><button class="btn primario" data-ir="exportar-conc">Exportar →</button></div>`;
}

function filaResultado(p, r) {
  const x = r.sistema ?? r.arca;
  const abierta = ui.abierta === r.id;
  const d = difTotal(r);
  return `<tr class="clic ${abierta ? 'sel' : ''} ${r.ignorado ? 'ignorado' : ''}" data-cfila="${esc(r.id)}" tabindex="0" aria-expanded="${abierta}">
    <td>${tag(p, r.estado)}${r.ignorado ? '<div class="muted chico">Ignorado</div>' : r.decision ? '<div class="muted chico">Decidido por vos</div>' : ''}</td>
    <td class="num">${esc(fechaCorta(x.fecha))}</td>
    <td>${esc(x.proveedor || r.arca?.proveedor || '—')}</td>
    <td class="num">${esc(cuitLindo(x.cuit) || '—')}</td>
    <td class="num">${esc(compTexto(x))}</td>
    <td class="der num">${r.sistema ? plataO(r.sistema.total) : '—'}</td>
    <td class="der num">${r.arca ? plataO(r.arca.total) : r.candidatos.length ? '<span class="muted">¿?</span>' : '—'}</td>
    <td class="der num">${d ? formatear(d) : ''}</td>
    <td class="motivo">${esc(r.motivo)}</td>
    <td>${r.sistema && (r.arca || r.candidatos.length) ? `<span class="match m-${r.etiqueta}">${esc(NOMBRE_ETIQUETA[r.etiqueta])}</span>` : ''}</td>
  </tr>${abierta ? `<tr class="detalle"><td colspan="10">${detalle(p, r)}</td></tr>` : ''}`;
}

const CAMPOS_DETALLE = [
  ['fecha', 'Fecha', x => fechaLarga(x.fecha)], ['cuit', 'CUIT', x => cuitLindo(x.cuit)], ['proveedor', 'Proveedor', x => x.proveedor],
  ['tipo', 'Tipo', x => infoTipo(x.tipo)?.nombre ?? x.tipo], ['numero', 'Comprobante', compTexto],
  ['neto', 'Neto', x => plataO(x.neto)], ['iva', 'IVA', x => plataO(x.iva)], ['total', 'Total', x => plataO(x.total)],
];

function tablaComparacion(p, s, a, comp) {
  const marca = campo => {
    if (comp.diferencias.some(d => d.campo === campo)) return '<span class="marca-dif">≠ Distinto</span>';
    if (comp.toleradas.some(d => d.campo === campo)) return '<span class="marca-tol">≈ Dentro de tolerancia</span>';
    if (campo === 'numero' && comp.informativas.some(d => d.campo === campo)) return '<span class="marca-dif">≠ Número distinto</span>';
    if (comp.informativas.some(d => d.campo === campo)) return '<span class="marca-info">ℹ Distinto, no cuenta</span>';
    return '<span class="marca-ok">✓</span>';
  };
  return `<table class="compara-tabla"><thead><tr><th>Dato</th><th>${esc(nombreSistema(p))}</th><th>ARCA</th><th></th></tr></thead><tbody>
    ${CAMPOS_DETALLE.map(([campo, nombre, f]) => {
      const m = s && a ? marca(campo) : '';
      const dif = /marca-dif/.test(m);
      return `<tr class="${dif ? 'fila-dif' : ''}"><th scope="row">${nombre}</th><td class="num">${s ? esc(f(s) || '—') : '—'}</td><td class="num">${a ? esc(f(a) || '—') : '—'}</td><td>${m}</td></tr>`;
    }).join('')}</tbody></table>`;
}

function detalle(p, r) {
  const c = conc(p);
  const partes = [];
  if (r.estado === 'revision' && r.candidatos.length) {
    const k = Math.min(ui.candidato, r.candidatos.length - 1);
    const cand = r.candidatos[k];
    partes.push(`<div class="fila" role="tablist" aria-label="Candidatos">${r.candidatos.map((x, i) => `<button class="btn chico ${i === k ? 'primario' : ''}" role="tab" aria-selected="${i === k}" data-caccion="candidato" data-valor="${i}">Candidato ${i + 1} · ${esc(NOMBRE_ETIQUETA[x.etiqueta ?? (x.score >= 85 ? 'fuerte' : x.score >= 60 ? 'posible' : 'revision')])}</button>`).join('')}</div>`);
    partes.push(tablaComparacion(p, r.sistema, cand.arca, cand));
    partes.push(`<p class="muted chico">Señales: ${esc(cand.senales.join(' · ') || 'pocas')} — puntaje heurístico ${cand.score}/100 (no es una probabilidad). ${esc(cand.motivo)}.</p>`);
    const sug = c.sugerencias[r.id];
    if (sug) {
      const nombre = sug.decision === 'mismo' ? `Claude sugiere que es el candidato ${r.candidatos.findIndex(x => x.arca.id === sug.candidatoId) + 1}` : sug.decision === 'distinto' ? 'Claude sugiere que ninguno es el mismo' : 'Claude no está seguro';
      partes.push(`<div class="sugerencia"><p class="mono">Sugerencia (no se aplica sola)</p><p><b>${esc(nombre)}.</b> ${esc(sug.razones.join(' '))}</p>${sug.conflictos.length ? `<p class="muted chico">En contra: ${esc(sug.conflictos.join(' '))}</p>` : ''}</div>`);
    }
    partes.push(`<div class="fila"><button class="btn primario chico" data-caccion="mismo" data-valor="${esc(cand.arca.id)}">Son el mismo</button><button class="btn chico" data-caccion="distinto" data-valor="${esc(cand.arca.id)}">No son el mismo</button><button class="btn chico" data-caccion="ignorar">Ignorar</button>
</div>`);
    if (!sug && ui.ocupado === 'candidatos') partes.push('<p class="muted chico" role="status">Claude está analizando los candidatos…</p>');
  } else {
    partes.push(tablaComparacion(p, r.sistema, r.arca, r));
    if (r.sistema && r.arca) partes.push(`<p class="muted chico">Señales: ${esc(r.senales.join(' · ') || '—')} — puntaje heurístico ${r.score}/100 (no es una probabilidad). Método: ${esc(METODOS[r.metodo] ?? r.metodo)}.</p>`);
    const botones = [];
    if (r.decision && r.decision.tipo !== 'ignorar') botones.push(`<button class="btn chico" data-caccion="deshacer" data-valor="${esc(r.decision.id)}">Deshacer mi decisión</button>`);
    if (r.ignorado) botones.push(`<button class="btn chico" data-caccion="deshacer" data-valor="${esc(r.decision.id)}">Dejar de ignorar</button>`);
    else botones.push('<button class="btn chico" data-caccion="ignorar">Ignorar</button>');
    if (r.sistema && r.arca && !r.decision) botones.push(`<button class="btn chico" data-caccion="distinto" data-valor="${esc(r.arca.id)}">No son el mismo</button>`);
    if (r.sistema && r.arca && reglasSugeridas(r).length) botones.push('<button class="btn chico" data-caccion="guardar-regla">Guardar regla</button>');
    partes.push(`<div class="fila">${botones.join('')}</div>`);
  }
  const avisos = [...r.avisos, ...r.ajustes];
  if (avisos.length) partes.push(`<ul class="alertas info">${avisos.map(a => `<li class="info">${esc(a)}</li>`).join('')}</ul>`);
  const exp = c.explicaciones[r.id];
  partes.push(`<div class="explicacion"><p>${esc(exp?.texto ?? explicacionLocal(r))}</p>${exp ? '<p class="muted chico">Redactado por Claude con los datos calculados.</p>' : `<button class="enlace" data-caccion="explicar-ia" ${ui.ocupado ? 'disabled' : ''}>${ui.ocupado === 'explicar' ? 'Redactando…' : 'Explicar con Claude'}</button>`}</div>`);
  partes.push(`<div class="campo" style="margin-top:12px"><label for="nota-c">Nota (sale en el Excel)</label><input id="nota-c" data-cnota="${esc(r.id)}" value="${esc(c.notas[r.id] ?? '')}" placeholder="Ej.: el proveedor la anuló"></div>`);
  return `<div class="detalle-conc">${partes.join('')}</div>`;
}

export const METODOS = {
  clave_exacta: 'CUIT + tipo + punto de venta + número', clave_sin_tipo: 'CUIT + punto de venta + número (un lado sin tipo)',
  cuit_numero_total: 'CUIT + número + total (sin punto de venta)', cuit_fecha_total: 'CUIT + fecha + total (sin número)',
  decision_usuario: 'Decisión del usuario', candidatos: 'Candidatos para revisar', sin_pareja: 'Sin pareja', duplicado: 'Duplicado en la fuente',
};

// ——— 5 · Exportar ———
function pantallaExportar(p) {
  const c = conc(p);
  const res = resultadoDe(p);
  const corridas = c.corridas.filter(x => x.lado === c.lado).slice(-10).reverse();
  const decisiones = c.decisiones.filter(d => d.lado === c.lado);
  return `${cabecera(p, 'Exportar', 'Un Excel con el resumen, cada estado en su pestaña, las reglas aplicadas y la auditoría. Se abre igual en Google Sheets.')}
    ${res ? `<div class="fila"><button class="btn primario grande" data-caccion="excel">Descargar Excel</button><button class="btn" data-caccion="csv">Descargar CSV</button></div>` : '<div class="vacio"><p>Todavía no hay una conciliación para exportar.</p></div>'}
    <section class="bloque"><div class="bloque-cab"><h2>Auditoría</h2><span class="muted">Qué se usó en cada conciliación de ${ladoTexto(c.lado).toLowerCase()}</span></div>
      ${corridas.length ? `<div class="tabla-wrap"><table><thead><tr><th>Fecha y hora</th><th>Archivos</th><th>Reglas</th><th>Motor · IA</th><th>Resultado</th></tr></thead><tbody>
        ${corridas.map(x => `<tr><td class="num">${esc(new Date(x.fecha).toLocaleString('es-AR'))}</td><td>${x.archivos.map(a => `${esc(a.origen === 'arca' ? 'ARCA' : x.sistemaNombre)}: ${esc(a.nombre)} (${a.filas} filas)`).join('<br>')}</td><td class="chico">${x.reglas.map(r => esc(describirRegla(r))).join('<br>')}</td><td class="chico">${esc(x.motor)}<br>${esc(x.modelos.join(', ') || 'sin IA')}</td><td class="chico">${x.resumen.coincide} conciliados · ${x.resumen.pendientes} pendientes</td></tr>`).join('')}
      </tbody></table></div>` : '<p class="muted">Todavía no conciliaste este período.</p>'}
      <p class="muted chico">${decisiones.length} ${decisiones.length === 1 ? 'decisión manual registrada' : 'decisiones manuales registradas'}${c.deshechas?.length ? ` · ${c.deshechas.length} deshechas` : ''}. Todo queda en la pestaña “Reglas aplicadas” del Excel.</p>
    </section>`;
}

export const pantallas = { archivos: pantallaArchivos, columnas: pantallaColumnas, reglas: pantallaReglas, conciliar: pantallaResultados, 'exportar-conc': pantallaExportar };

// ——— Acciones ———
const resultadoAbierto = p => resultadoDe(p)?.resultados.find(r => r.id === ui.abierta);

function resumenParaIa(x) {
  return x && { id: x.id, fecha: x.fecha, cuit: x.cuit, proveedor: x.proveedor, tipo: infoTipo(x.tipo)?.nombre ?? x.tipo, comprobante: compTexto(x), neto: plataO(x.neto), iva: plataO(x.iva), total: plataO(x.total) };
}

async function accion(p, b) {
  const c = conc(p);
  const v = b.dataset.valor;
  switch (b.dataset.caccion) {
    case 'lado': c.lado = v; ui.abierta = null; ui.propuesta = null; break;
    case 'quitar-fuente': c.fuentes[c.lado][v] = null; break;
    case 'filtro': ui.filtro = v; ui.abierta = null; ui.limite = 150; break;
    case 'mas': ui.limite += 150; break;
    case 'candidato': ui.candidato = Number(v); break;
    case 'columnas-ia': return columnasConIa(p, v);
    case 'confirmar-columnas': return confirmarColumnas(p);
    case 'interpretar': return interpretar(p);
    case 'aplicar-propuesta':
    case 'guardar-propuesta': {
      const guardarEnPerfil = b.dataset.caccion === 'guardar-propuesta';
      for (const r of ui.propuesta.reglas) agregarRegla(p, r, { guardarEnPerfil, deInstruccion: guardarEnPerfil ? '' : ui.propuesta.texto });
      avisar(guardarEnPerfil ? 'Regla aplicada y guardada para la empresa.' : 'Regla aplicada en esta conciliación.');
      ui.propuesta = null; break;
    }
    case 'descartar-propuesta': ui.propuesta = null; break;
    case 'quitar-regla': c.reglas.splice(Number(v), 1); break;
    case 'quitar-regla-perfil': perfil(p).reglas.splice(Number(v), 1); break;
    case 'guardar-controles': {
      for (const r of reglasDeCorrida(p).filter(x => !x.deInstruccion)) agregarRegla(p, r, { guardarEnPerfil: true });
      perfil(p).reglas = dedupe(perfil(p).reglas);
      avisar('Controles guardados para la empresa.'); break;
    }
    case 'conciliar': registrarCorrida(p); ui.filtro = 'pendientes'; return app.ir('conciliar');
    case 'mismo':
    case 'distinto': {
      const r = resultadoAbierto(p);
      const arca = r.arca ?? r.candidatos.find(x => x.arca.id === v)?.arca;
      registrarDecision(p, { tipo: b.dataset.caccion, sistemaId: r.sistema.id, arcaId: v, resultadoId: r.id, motor: r.motivo });
      if (b.dataset.caccion === 'mismo') {
        const sug = reglasSugeridas({ ...r, arca }, arca);
        ui.abierta = `${r.sistema.id}|${v}`;
        if (sug.length) { app.render(); return dialogoReglas(p, sug, 'Listo: quedaron relacionados en esta conciliación.'); }
        avisar('Listo: quedaron relacionados en esta conciliación.');
      } else { ui.abierta = null; avisar('Anotado: no son el mismo comprobante.'); }
      break;
    }
    case 'ignorar': registrarDecision(p, { tipo: 'ignorar', resultadoId: ui.abierta }); avisar('Ignorado. Queda registrado y sale del listado de pendientes.'); break;
    case 'deshacer': deshacerDecision(p, v); avisar('Decisión deshecha.'); break;
    case 'guardar-regla': return dialogoReglas(p, reglasSugeridas(resultadoAbierto(p)), '');
    case 'guardar-sugerida': {
      const r = ui.sugeridas?.[Number(v)];
      if (r) { agregarRegla(p, r, { guardarEnPerfil: true }); perfil(p).reglas = dedupe(perfil(p).reglas); avisar('Regla guardada para las próximas conciliaciones de la empresa.'); }
      cerrarDialogo(); break;
    }
    case 'sugerencia-ia': return sugerenciaIa(p);
    case 'explicar-ia': return explicarIa(p);
    case 'excel': await exportarConciliacion(p); c.exportado = true; avisar('Excel descargado.'); break;
    case 'csv': exportarCsv(p); c.exportado = true; avisar('CSV descargado.'); break;
    default: return;
  }
  guardar(); app.render();
}

const dedupe = lista => [...new Map(lista.map(r => [JSON.stringify({ ...r, creada: undefined }), r])).values()];

function dialogoReglas(p, sugeridas, encabezado) {
  ui.sugeridas = sugeridas;
  abrirDialogo('¿Guardar como regla?', `
    ${encabezado ? `<p>${esc(encabezado)}</p>` : ''}
    <p class="muted">Podés dejarlo solo para esta conciliación o guardar una regla para que ORBIT lo reconozca la próxima vez. Nada se guarda sin que lo elijas.</p>
    <ul class="lista-reglas">${sugeridas.map((r, i) => `<li><span>${esc(describirRegla(r))}</span><button class="btn chico primario" data-caccion="guardar-sugerida" data-valor="${i}">Guardar</button></li>`).join('')}</ul>
    <button class="btn" data-accion="cerrar-dialogo">Solo esta conciliación</button>`);
}

async function columnasConIa(p, origen, automatico = false) {
  const c = conc(p), f = c.fuentes[c.lado][origen];
  const tabla = tablaDe(f);
  ui.ocupado = `columnas-${origen}`; app.render();
  const r = await pedirAsistente('columnas', { origen, encabezados: tabla.encabezados, muestras: tabla.datos.slice(0, 5).map(d => d.celdas) });
  ui.ocupado = null;
  if (!r.ok) { if (!automatico) avisar(r.error); return app.render(); }
  const n = Object.keys(r.mapeo).length;
  for (const [campo, h] of Object.entries(r.mapeo)) { f.mapeo[campo] = h; f.origenMapeo[campo] = 'ia'; }
  f.confirmado = false;
  avisar(`Claude propuso ${n} columnas. Revisalas antes de confirmar.`);
  guardar(); app.render();
}

function confirmarColumnas(p) {
  const c = conc(p), f = c.fuentes[c.lado];
  const errores = [];
  for (const origen of ['sistema', 'arca']) {
    const v = validarMapeo(f[origen].mapeo, tablaDe(f[origen]).encabezados);
    if (!v.ok) errores.push(`${origen === 'arca' ? 'ARCA' : nombreSistema(p)}: ${v.errores[0]}`);
  }
  if (errores.length) return avisar(errores.join(' '));
  for (const origen of ['sistema', 'arca']) {
    f[origen].confirmado = true;
    if (ui.guardarMapeo) guardarMapeoEnPerfil(p, origen, f[origen]);
  }
  guardar();
  app.ir('reglas');
}

async function interpretar(p) {
  const texto = $('#c-instruccion')?.value.trim();
  if (!texto) return avisar('Escribí la instrucción primero.');
  if (ia.estado === 'activa') {
    ui.ocupado = 'regla'; app.render();
    const r = await pedirAsistente('regla', { instruccion: texto });
    ui.ocupado = null;
    if (r.ok) { ui.propuesta = { texto, fuente: 'ia', reglas: r.reglas ?? [], duda: r.duda }; return app.render(); }
    avisar(`${r.error} Probé entenderla sin IA.`);
  }
  const local = interpretarReglaLocal(texto);
  const v = local && validarRegla(local);
  ui.propuesta = { texto, fuente: 'local', reglas: v?.ok ? [v.regla] : [], duda: v?.ok ? '' : ia.estado === 'activa' ? '' : 'Sin IA solo entiendo tolerancias de importe, de fecha y porcentuales, exclusiones de proveedores y signo de notas de crédito. Con el link de acceso, Claude entiende instrucciones más libres.' };
  app.render();
}

async function sugerenciaIa(p, automatico = false) {
  const r = resultadoAbierto(p);
  ui.ocupado = 'candidatos'; app.render();
  const resp = await pedirAsistente('candidatos', {
    sistema: resumenParaIa(r.sistema),
    candidatos: r.candidatos.map(x => ({ ...resumenParaIa(x.arca), senales: x.senales, diferencias: [...x.diferencias, ...x.toleradas, ...x.informativas].map(detalleDiferencia), puntaje: x.score })),
  });
  ui.ocupado = null;
  if (!resp.ok) { if (!automatico) avisar(resp.error); return app.render(); }
  conc(p).sugerencias[r.id] = { decision: resp.decision, candidatoId: resp.candidatoId, razones: resp.razones, conflictos: resp.conflictos, modelo: resp.modelo, fecha: new Date().toISOString() };
  guardar(); app.render();
}

async function explicarIa(p) {
  const r = resultadoAbierto(p);
  ui.ocupado = 'explicar'; app.render();
  const resp = await pedirAsistente('explicar', {
    resultado: {
      estado: r.estado, motivo: r.motivo, sistema: resumenParaIa(r.sistema), arca: resumenParaIa(r.arca),
      senales: r.senales, diferencias: r.diferencias.map(detalleDiferencia), toleradas: r.toleradas.map(detalleDiferencia),
      candidatos: r.candidatos.map(x => ({ arca: resumenParaIa(x.arca), senales: x.senales, diferencias: x.diferencias.map(detalleDiferencia) })),
    },
  });
  ui.ocupado = null;
  if (!resp.ok) { avisar(resp.error); return app.render(); }
  conc(p).explicaciones[r.id] = { texto: resp.explicacion, modelo: resp.modelo };
  guardar(); app.render();
}

// Eventos del conciliador (los generales —pasos, archivos, arrastrar— los maneja app.js)
export function instalarEventos(periodoActual) {
  document.addEventListener('click', e => {
    const fila = e.target.closest('tr[data-cfila]');
    if (fila && !e.target.closest('.detalle')) {
      ui.abierta = ui.abierta === fila.dataset.cfila ? null : fila.dataset.cfila; ui.candidato = 0;
      app.render();
      // Caso dudoso: Claude analiza los candidatos solo al abrirlo (una vez; la sugerencia queda guardada)
      const p = periodoActual(), r = resultadoAbierto(p);
      if (r?.estado === 'revision' && r.candidatos.length && !conc(p).sugerencias[r.id] && ia.estado === 'activa' && !ui.ocupado) sugerenciaIa(p, true).catch(() => {});
      return;
    }
    const b = e.target.closest('[data-caccion]');
    if (b && !b.disabled) accion(periodoActual(), b).catch(err => { ui.ocupado = null; avisar(err.message); app.render(); });
  });
  document.addEventListener('change', e => {
    const t = e.target, p = periodoActual();
    if (!p) return;
    if (t.dataset.cmapeo) {
      const [origen, campo] = t.dataset.cmapeo.split(':');
      const f = conc(p).fuentes[conc(p).lado][origen];
      if (t.value) { f.mapeo[campo] = t.value; f.origenMapeo[campo] = 'manual'; } else { delete f.mapeo[campo]; delete f.origenMapeo[campo]; }
      f.confirmado = false; guardar(); return app.render();
    }
    if (t.matches('[data-cguardar-mapeo]')) { ui.guardarMapeo = t.checked; return; }
    if (t.matches('[data-csistema]')) { perfil(p).sistemaNombre = t.value.trim().slice(0, 40) || 'Sistema'; guardar(); return app.render(); }
    if (t.dataset.cregla) {
      const tipo = t.dataset.cregla;
      const regla = tipo === 'tolerancia_monto' ? { tipo, valor: Math.round(Number(t.value) * 100) }
        : tipo === 'tolerancia_porcentaje' ? { tipo, valor: Number(String(t.value || '0').replace(',', '.')) }
          : tipo === 'tolerancia_fecha' ? { tipo, dias: Number(t.value) }
            : { tipo, origen: t.dataset.origen, modo: t.value };
      const v = fijarRegla(p, regla);
      if (!v.ok) avisar(v.error);
      guardar(); return app.render();
    }
    if (t.dataset.cobligatorio) {
      const campos = [...document.querySelectorAll('[data-cobligatorio]')].filter(x => x.checked).map(x => x.dataset.cobligatorio);
      const v = fijarRegla(p, { tipo: 'campos_obligatorios', campos });
      if (!v.ok) { avisar(v.error); t.checked = true; }
      guardar(); return app.render();
    }
    if (t.dataset.cfiltro && t.dataset.cfiltro !== 'busqueda') { ui[t.dataset.cfiltro] = t.value; ui.limite = 150; return app.render(); }
    if (t.dataset.cnota) { conc(p).notas[t.dataset.cnota] = t.value; guardar(); }
  });
  let espera;
  document.addEventListener('input', e => {
    if (e.target.dataset.cfiltro !== 'busqueda') return;
    ui.busqueda = e.target.value;
    clearTimeout(espera);
    espera = setTimeout(() => { app.render(); const i = $('#c-buscar'); i?.focus(); i?.setSelectionRange(i.value.length, i.value.length); }, 250);
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.matches('tr[data-cfila]')) { e.preventDefault(); e.target.click(); }
  });
}
