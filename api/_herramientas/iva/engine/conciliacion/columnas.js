// Esquema interno estándar de un comprobante y reconocimiento de columnas.
// Primero por nombre (alias conocidos de ARCA, CHESS y exports genéricos) y por contenido (cómo se ven los datos).
// Lo que no se reconoce así lo puede proponer Claude (server/ai/columnas.js); el usuario siempre confirma el mapeo.

import { normalizarTipo } from '../tipos.js';
import { convertir } from '../dinero.js';
import { normCuit, normEntero, partirComprobante, normImporte, normFecha, normProveedor, normTipo, soloDigitos } from './normalizar.js';

export const CAMPOS = {
  fecha: { nombre: 'Fecha', requerido: true },
  tipo: { nombre: 'Tipo de comprobante' },
  letra: { nombre: 'Letra (si va aparte)' },
  comprobante: { nombre: 'Punto de venta y número juntos' },
  ptoVta: { nombre: 'Punto de venta' },
  numero: { nombre: 'Número de comprobante' },
  cuit: { nombre: 'CUIT', requerido: true },
  proveedor: { nombre: 'Razón social' },
  neto: { nombre: 'Neto gravado' },
  iva: { nombre: 'IVA' },
  noGravado: { nombre: 'No gravado' },
  exento: { nombre: 'Exento' },
  otrosTributos: { nombre: 'Otros tributos / percepciones' },
  total: { nombre: 'Total', requerido: true },
  moneda: { nombre: 'Moneda' },
  cotizacion: { nombre: 'Tipo de cambio' },
};

export const normEncabezado = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[.:°º#_]/g, ' ').replace(/\s+/g, ' ').trim();

const ALIAS = {
  fecha: ['fecha', 'fecha emision', 'fecha de emision', 'fecha comprobante', 'fecha cbte', 'fecha factura', 'fec emision', 'f emision', 'fecha doc', 'fecha documento', 'emision'],
  tipo: ['tipo', 'tipo de comprobante', 'tipo comprobante', 'tipo cbte', 'tipo de cbte', 'cbte tipo', 'clase comprobante', 'tipo documento comercial', 'tc'],
  letra: ['letra', 'let'],
  comprobante: ['nro comprobante completo', 'comprobante completo', 'pto vta y numero'],
  ptoVta: ['punto de venta', 'pto vta', 'pto de vta', 'pv', 'punto vta', 'pto venta', 'sucursal', 'prefijo'],
  numero: ['numero', 'nro', 'numero comprobante', 'nro comprobante', 'numero desde', 'nro desde', 'n comprobante', 'comprobante nro', 'nro cbte', 'numero cbte', 'numero de comprobante', 'nro de comprobante', 'nro factura', 'numero factura'],
  cuit: ['cuit', 'cuit proveedor', 'cuit cliente', 'nro doc', 'nro doc emisor', 'nro doc receptor', 'nro documento', 'numero de documento', 'nro doc emisor/receptor', 'identificacion fiscal', 'cuit/dni', 'documento', 'id fiscal', 'cuit emisor', 'cuit receptor', 'c u i t'],
  proveedor: ['razon social', 'proveedor', 'cliente', 'denominacion', 'denominacion emisor', 'denominacion receptor', 'nombre', 'razon social proveedor', 'nombre proveedor', 'nombre cliente', 'razon social cliente'],
  neto: ['neto', 'neto gravado', 'imp neto gravado', 'importe neto', 'neto grav', 'gravado', 'base imponible', 'importe neto gravado', 'subtotal'],
  iva: ['iva', 'imp iva', 'importe iva', 'total iva', 'iva total', 'monto iva'],
  noGravado: ['no gravado', 'imp neto no gravado', 'neto no gravado', 'importe no gravado', 'conceptos no gravados'],
  exento: ['exento', 'imp op exentas', 'exentas', 'operaciones exentas', 'importe exento'],
  otrosTributos: ['otros tributos', 'percepciones', 'otros impuestos', 'impuestos', 'tributos'],
  total: ['total', 'imp total', 'importe total', 'total comprobante', 'monto total', 'importe', 'total factura', 'monto'],
  moneda: ['moneda', 'mon'],
  cotizacion: ['tipo cambio', 'tipo de cambio', 'cotizacion', 'tc cambio'],
};
// Columnas que se parecen a un campo pero son otra cosa (en ARCA, "Tipo Doc." es el tipo de documento: 80 = CUIT).
const IGNORAR = [/^tipo doc/, /^numero hasta/, /^nro hasta/, /^cod autorizacion/, /^cae/];

const ALIAS_INVERSO = new Map(Object.entries(ALIAS).flatMap(([campo, lista]) => lista.map(a => [a, campo])));

export function aliasDeCampo(encabezado) {
  const n = normEncabezado(encabezado);
  if (!n || IGNORAR.some(re => re.test(n))) return null;
  if (alicuotaDe(encabezado)) return 'alicuota';
  return ALIAS_INVERSO.get(n) ?? null;
}

// "Imp. Neto Gravado IVA 21%" → { tasa: 21, parte: 'neto' } · "IVA 10,5%" → { tasa: 10.5, parte: 'iva' }
export function alicuotaDe(encabezado) {
  const n = normEncabezado(encabezado);
  let m = n.match(/neto gravado(?: iva)? (\d+(?:,\d+)?) ?%/);
  if (m) return { tasa: Number(m[1].replace(',', '.')), parte: 'neto' };
  m = n.match(/^(?:imp |importe )?iva (\d+(?:,\d+)?) ?%/);
  if (m) return { tasa: Number(m[1].replace(',', '.')), parte: 'iva' };
  return null;
}

const proporcion = (valores, prueba) => {
  const llenos = valores.filter(v => String(v ?? '').trim() !== '');
  return llenos.length ? llenos.filter(prueba).length / llenos.length : 0;
};

const PRUEBAS = {
  cuit: v => /^[\d\s-]+$/.test(String(v).trim()) && soloDigitos(v).length === 11,
  comprobante: v => /\d{1,5}\s*-\s*\d{1,8}/.test(String(v)),
  fecha: v => normFecha(v) !== null,
  tipo: v => !/^\d+$/.test(String(v).trim()) && normalizarTipo(v) !== '',
};

// Propone un mapeo { campo: encabezado } mirando nombres y contenido. origen dice cómo se decidió cada campo.
export function detectarColumnas(encabezados, datos = []) {
  const mapeo = {}, origen = {}, usados = new Set();
  const alicuotas = [];
  encabezados.forEach(h => {
    const a = alicuotaDe(h);
    if (!a) return;
    let x = alicuotas.find(y => y.tasa === a.tasa);
    if (!x) alicuotas.push(x = { tasa: a.tasa });
    x[a.parte] = h;
    usados.add(h);
  });
  const asignar = (campo, h, como) => { mapeo[campo] = h; origen[campo] = como; usados.add(h); };
  // 1. Nombre exacto
  for (const h of encabezados) {
    const campo = aliasDeCampo(h);
    if (campo && campo !== 'alicuota' && !mapeo[campo] && !usados.has(h)) asignar(campo, h, 'nombre');
  }
  // 2. Nombre que contiene la palabra clave ("CUIT del proveedor", "Fecha de la factura")
  const CONTIENE = [['cuit', /\bcuit\b/], ['fecha', /\bfecha\b/], ['total', /\btotal\b/], ['proveedor', /\b(razon social|proveedor|denominacion)\b/], ['numero', /\b(numero|nro)\b/]];
  for (const [campo, re] of CONTIENE) {
    if (mapeo[campo]) continue;
    const h = encabezados.find(x => !usados.has(x) && re.test(normEncabezado(x)) && !IGNORAR.some(r => r.test(normEncabezado(x))));
    if (h) asignar(campo, h, 'nombre');
  }
  // 3. Contenido: columnas sin reconocer que tienen cara de CUIT, comprobante, fecha o tipo
  const valores = h => datos.slice(0, 30).map(d => d.celdas[encabezados.indexOf(h)]);
  for (const campo of ['cuit', 'comprobante', 'fecha', 'tipo']) {
    if (mapeo[campo] || (campo === 'comprobante' && mapeo.numero && proporcion(valores(mapeo.numero), PRUEBAS.comprobante) < 0.7)) continue;
    const h = encabezados.find(x => !usados.has(x) && proporcion(valores(x), PRUEBAS[campo]) >= 0.7);
    if (h) asignar(campo, h, 'contenido');
  }
  // Una columna "Número" que trae "0003-00001234" es en realidad punto de venta y número juntos
  if (mapeo.numero && !mapeo.comprobante && proporcion(valores(mapeo.numero), PRUEBAS.comprobante) >= 0.7) {
    mapeo.comprobante = mapeo.numero; origen.comprobante = 'contenido'; delete mapeo.numero; delete origen.numero;
  }
  // "Punto de venta" de ARCA 09/2025 trae punto de venta y número juntos
  if (mapeo.ptoVta && !mapeo.numero && !mapeo.comprobante && proporcion(valores(mapeo.ptoVta), PRUEBAS.comprobante) >= 0.7) {
    mapeo.comprobante = mapeo.ptoVta; origen.comprobante = 'contenido'; delete mapeo.ptoVta; delete origen.ptoVta;
  }
  // "FC A 0003-00001234": la misma columna trae el tipo y el número
  if (!mapeo.tipo && mapeo.comprobante && proporcion(valores(mapeo.comprobante), PRUEBAS.tipo) >= 0.7) { mapeo.tipo = mapeo.comprobante; origen.tipo = 'contenido'; }
  if (alicuotas.length) mapeo.alicuotas = alicuotas;
  return { mapeo, origen, faltantes: faltantes(mapeo) };
}

export function faltantes(mapeo) {
  const f = Object.entries(CAMPOS).filter(([c, d]) => d.requerido && !mapeo[c]).map(([c]) => c);
  if (!mapeo.numero && !mapeo.comprobante) f.push('numero');
  return f;
}

const MENSAJE_FALTA = {
  fecha: 'No encontramos una columna que podamos identificar como fecha. Seleccionala manualmente.',
  cuit: 'No encontramos una columna que podamos identificar como CUIT. Seleccionala manualmente.',
  total: 'No encontramos una columna que podamos identificar como total. Seleccionala manualmente.',
  numero: 'No encontramos una columna que podamos identificar como número de comprobante. Seleccionala manualmente.',
};

// Controla un mapeo (propuesto por código, por Claude o elegido a mano) contra los encabezados reales del archivo.
export function validarMapeo(mapeo, encabezados) {
  const errores = [];
  const limpio = {};
  for (const [campo, h] of Object.entries(mapeo ?? {})) {
    if (campo === 'alicuotas') {
      const ok = (Array.isArray(h) ? h : []).filter(a => Number.isFinite(a?.tasa) && (!a.neto || encabezados.includes(a.neto)) && (!a.iva || encabezados.includes(a.iva)));
      if (ok.length) limpio.alicuotas = ok;
      continue;
    }
    if (!CAMPOS[campo] || !h) continue;
    if (!encabezados.includes(h)) { errores.push(`La columna "${h}" elegida para ${CAMPOS[campo].nombre} no está en el archivo.`); continue; }
    limpio[campo] = h;
  }
  for (const c of faltantes(limpio)) errores.push(MENSAJE_FALTA[c]);
  return { mapeo: limpio, errores, ok: errores.length === 0 };
}

export const firmaEncabezados = encabezados => [...encabezados].map(normEncabezado).filter(Boolean).sort().join('|');

// Convierte las filas del archivo en comprobantes del esquema interno. Guarda lo original en `crudo`.
export function importarRegistros(tabla, mapeo, { origen, lado = 'compra' } = {}) {
  const idx = Object.fromEntries(Object.entries(mapeo).filter(([c]) => c !== 'alicuotas').map(([c, h]) => [c, tabla.encabezados.indexOf(h)]));
  const errores = [];
  const registros = tabla.datos.map(({ n, celdas }) => {
    const val = campo => (idx[campo] >= 0 && idx[campo] !== undefined ? celdas[idx[campo]] : undefined);
    const crudo = {};
    for (const campo of Object.keys(idx)) crudo[campo] = celdas[idx[campo]] instanceof Date ? celdas[idx[campo]].toISOString().slice(0, 10) : String(celdas[idx[campo]] ?? '');
    const errs = [];
    const importe = campo => {
      const r = normImporte(val(campo));
      if (r.error) errs.push(r.error);
      return r.valor;
    };
    let ptoVta = normEntero(val('ptoVta')), numero = normEntero(val('numero'));
    if (idx.comprobante !== undefined) {
      const p = partirComprobante(val('comprobante'));
      ptoVta = p.ptoVta ?? ptoVta; numero = p.numero ?? numero;
    }
    const alicuotas = (mapeo.alicuotas ?? []).map(a => ({
      tasa: a.tasa,
      neto: normImporte(celdas[tabla.encabezados.indexOf(a.neto)]).valor ?? 0,
      iva: normImporte(celdas[tabla.encabezados.indexOf(a.iva)]).valor ?? 0,
    })).filter(a => a.neto || a.iva);
    const moneda = normMoneda(val('moneda'));
    const cotizacion = moneda === 'PES' ? 1 : (normImporte(val('cotizacion')).valor ?? 100) / 100 || 1;
    const aPesos = c => (c == null ? null : convertir(c, cotizacion));
    let neto = importe('neto'), iva = importe('iva');
    if (neto == null && alicuotas.length) neto = alicuotas.reduce((s, a) => s + a.neto, 0);
    if (iva == null && alicuotas.length) iva = alicuotas.reduce((s, a) => s + a.iva, 0);
    const total = importe('total');
    const fecha = normFecha(val('fecha'));
    const cuit = normCuit(val('cuit'));
    const tipo = normTipo(val('tipo'), val('letra'));
    if (!fecha && crudo.fecha) errs.push(`Fecha ilegible: "${crudo.fecha}"`);
    if (total == null) errs.push('Sin total');
    if (!cuit.valor) errs.push('Sin CUIT');
    else if (!cuit.valido) errs.push(`CUIT ${cuit.valor} no pasa el dígito verificador`);
    if (numero == null) errs.push('Sin número de comprobante');
    if (errs.length) errores.push({ fila: n, errores: errs });
    return {
      id: `${origen}-${lado}-${n}`, origen, lado, fila: n,
      fecha, tipo, ptoVta, numero,
      cuit: cuit.valor, cuitValido: cuit.valido,
      proveedor: String(val('proveedor') ?? '').trim(), proveedorNorm: normProveedor(val('proveedor')),
      neto: aPesos(neto), iva: aPesos(iva), noGravado: aPesos(importe('noGravado')), exento: aPesos(importe('exento')),
      otrosTributos: aPesos(importe('otrosTributos')), total: aPesos(total),
      moneda, cotizacion, alicuotas, crudo, errores: errs,
    };
  });
  return { registros, errores };
}

const normMoneda = m => {
  const s = String(m ?? '').trim();
  return (!s || s === '$' || /^pes/i.test(s) || /^ars$/i.test(s)) ? 'PES' : /^(usd|u\$s|dol)/i.test(s) ? 'DOL' : s.toUpperCase();
};

// Mes más frecuente entre las fechas: el período probable del archivo.
export function periodoProbable(registros) {
  const cuenta = new Map();
  for (const r of registros) if (r.fecha) cuenta.set(r.fecha.slice(0, 7), (cuenta.get(r.fecha.slice(0, 7)) ?? 0) + 1);
  const [mes, n] = [...cuenta.entries()].sort((a, b) => b[1] - a[1])[0] ?? [null, 0];
  return { mes, proporcion: registros.length ? n / registros.length : 0 };
}
