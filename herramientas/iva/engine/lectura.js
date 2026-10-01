// Combina lo que lee la IA con lo que dice el QR y valida el resultado.
// La confianza de cada campo NO la decide la IA: sale de las validaciones (QR, dígito de CUIT, cuentas que cierran).
// Todo comprobante leído queda "pendiente" hasta que una persona lo apruebe (F1).

import { aCentavos, formatear } from './dinero.js';
import { infoTipo, normalizarCodigo } from './tipos.js';
import { cuitValido } from './cuit.js';

export const TASAS_VALIDAS = [0, 2.5, 5, 10.5, 21, 27];
const TOLERANCIA = 100; // centavos: $1 de diferencia por redondeo

// Esquema que se le pide a la IA (structured outputs). La API limita los campos opcionales (null), así que los datos
// faltantes vienen como "" o 0 y se convierten a null con normalizarLecturaIa() antes de los controles.
const TEXTO = { type: 'string' };
const NUMERO = { type: 'number' };

export const ESQUEMA_LECTURA = {
  type: 'object',
  additionalProperties: false,
  required: ['es_comprobante', 'tipo_codigo', 'letra', 'punto_venta', 'numero', 'fecha', 'cuit_emisor', 'razon_social_emisor',
    'cuit_receptor', 'moneda', 'cotizacion', 'alicuotas', 'no_gravado', 'exento', 'percepciones_iva', 'percepciones_iibb',
    'percepciones_municipales', 'otros_tributos', 'total', 'cae', 'campos_dudosos'],
  properties: {
    es_comprobante: { type: 'boolean' },
    tipo_codigo: TEXTO,
    letra: { type: 'string', enum: ['A', 'B', 'C', 'M', 'T', 'E', ''] },
    punto_venta: { type: 'integer' },
    numero: { type: 'integer' },
    fecha: TEXTO,
    cuit_emisor: TEXTO,
    razon_social_emisor: TEXTO,
    cuit_receptor: TEXTO,
    moneda: TEXTO,
    cotizacion: NUMERO,
    alicuotas: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['tasa', 'neto', 'iva'],
        properties: { tasa: { type: 'number', enum: TASAS_VALIDAS }, neto: NUMERO, iva: NUMERO },
      },
    },
    no_gravado: NUMERO,
    exento: NUMERO,
    percepciones_iva: NUMERO,
    percepciones_iibb: NUMERO,
    percepciones_municipales: NUMERO,
    otros_tributos: NUMERO,
    total: NUMERO,
    cae: TEXTO,
    campos_dudosos: { type: 'array', items: TEXTO },
  },
};

// "" y 0 de la respuesta de la IA pasan a null (dato faltante), como en la lectura por OCR.
export function normalizarLecturaIa(ia) {
  const n = { ...ia };
  for (const k of ['tipo_codigo', 'letra', 'fecha', 'cuit_emisor', 'razon_social_emisor', 'cuit_receptor', 'moneda', 'cae']) {
    if (n[k] === '') n[k] = null;
  }
  for (const k of ['punto_venta', 'numero', 'no_gravado', 'exento', 'percepciones_iva', 'percepciones_iibb', 'percepciones_municipales', 'otros_tributos', 'total']) {
    if (n[k] === 0) n[k] = null;
  }
  if (!n.cotizacion) n.cotizacion = 1;
  if (n.fecha && !/^\d{4}-\d{2}-\d{2}$/.test(n.fecha)) n.campos_dudosos = [...(n.campos_dudosos ?? []), 'fecha'];
  return n;
}

export const INSTRUCCIONES_LECTURA = `Leé el comprobante fiscal argentino de la imagen o el PDF y devolvé sus datos.
- Copiá los valores tal como figuran. Si un dato no se ve o no está, devolvé "" (texto) o 0 (número). No lo deduzcas ni lo calcules.
- fecha en formato AAAA-MM-DD.
- tipo_codigo: el código de 3 dígitos de ARCA que figura junto a la letra (por ejemplo "001" para Factura A). null si no se ve.
- Importes como números con punto decimal (1234.56), en la moneda del comprobante.
- alicuotas: una entrada por cada alícuota de IVA discriminada (neto gravado e IVA). En facturas B y C que no discriminan IVA, dejá la lista vacía.
- percepciones_iva, percepciones_iibb y percepciones_municipales (tasas o percepciones de municipios): sumá las de cada tipo si hay varias. No las repitas en otros_tributos. otros_tributos: impuestos internos y demás.
- campos_dudosos: nombres de los campos que leíste con dificultad (borrosos, cortados, manuscritos).
- es_comprobante: false si la imagen no es una factura, nota de crédito/débito o tique.
- Si el documento tiene varias páginas, pueden ser copias (ORIGINAL, DUPLICADO, TRIPLICADO) o la continuación del mismo comprobante: devolvé un solo comprobante con los importes finales, sin sumar las copias.`;

// ia: objeto con la forma de ESQUEMA_LECTURA · qr: resultado de leerQrArca o null · cuitCliente: CUIT del cliente del período
export function combinarLectura(ia, qr, { cuitCliente, id, archivoId } = {}) {
  const alertas = [];
  const confianza = {};
  if (!ia?.es_comprobante && !qr) {
    return { ok: false, alertas: [{ tipo: 'no_es_comprobante', mensaje: 'No parece un comprobante. Revisá el archivo.' }] };
  }
  const dudosos = new Set(ia?.campos_dudosos || []);
  const conf = (campo, base) => (dudosos.has(campo) && base === 'alta' ? 'media' : base);

  const cuitIa = soloDigitos(ia?.cuit_emisor);
  const tipoIa = ia?.tipo_codigo ? normalizarCodigo(ia.tipo_codigo) : tipoDesdeLetra(ia?.letra);
  const cab = {
    tipo: tipoIa, ptoVta: ia?.punto_venta ?? null, numero: ia?.numero ?? null, fecha: ia?.fecha ?? null,
    cuit: cuitIa, moneda: normMoneda(ia?.moneda), cotizacion: ia?.cotizacion || 1, cae: soloDigitos(ia?.cae) || null,
  };
  for (const k of Object.keys(cab)) confianza[k] = conf(mapaCampo(k), cab[k] == null || cab[k] === '' ? 'baja' : 'media');
  if (!ia?.tipo_codigo) confianza.tipo = 'baja'; // deducido de la letra: podría ser una nota de crédito

  if (qr) {
    const pares = { tipo: qr.tipo, ptoVta: qr.ptoVta, numero: qr.numero, fecha: qr.fecha, cuit: qr.cuit, moneda: qr.moneda, cotizacion: qr.cotizacion, cae: qr.cae };
    for (const [k, v] of Object.entries(pares)) {
      if (v == null || v === '') continue;
      if (cab[k] != null && cab[k] !== '' && String(cab[k]) !== String(v)) {
        alertas.push({ tipo: 'qr_distinto', campo: k, mensaje: `El QR dice ${v} y la lectura ${cab[k]} en "${k}". Se toma el QR.` });
      }
      cab[k] = v;
      confianza[k] = 'alta';
    }
  }

  if (cab.cuit && !cuitValido(cab.cuit)) {
    confianza.cuit = 'baja';
    alertas.push({ tipo: 'cuit_invalido', mensaje: `La CUIT ${cab.cuit} no pasa el dígito verificador.` });
  } else if (cab.cuit && !qr) {
    confianza.cuit = conf('cuit_emisor', 'alta');
  }

  // Datos que no se pudieron leer: nunca se completan solos. Quedan vacíos y marcados para revisar.
  if (!cab.cuit) alertas.push({ tipo: 'sin_cuit', campo: 'cuit', mensaje: 'Revisar CUIT: no se pudo leer con seguridad.' });
  if (cab.numero == null) alertas.push({ tipo: 'sin_numero', campo: 'numero', mensaje: 'No se pudo leer el número de comprobante.' });
  if (!cab.fecha) alertas.push({ tipo: 'sin_fecha', campo: 'fecha', mensaje: 'No se pudo leer la fecha.' });
  for (const campo of dudosos) {
    const nombre = { cuit_emisor: 'la CUIT', numero: 'el número', punto_venta: 'el punto de venta', fecha: 'la fecha', total: 'el total', alicuotas: 'el IVA' }[campo];
    if (nombre && !alertas.some(x => x.campo === mapaCampoInverso(campo))) alertas.push({ tipo: 'dudoso', campo: mapaCampoInverso(campo), mensaje: `Revisar ${nombre}: la lectura no fue segura.` });
  }

  const tipo = infoTipo(cab.tipo);
  if (!tipo) alertas.push({ tipo: 'tipo_desconocido', mensaje: `Tipo de comprobante ${cab.tipo || 'sin leer'}: fuera del MVP o ilegible.` });
  if (tipo && ia?.letra && ['A', 'B', 'C', 'M'].includes(ia.letra) && tipo.clase !== ia.letra && confianza.tipo !== 'alta') {
    confianza.tipo = 'baja';
    alertas.push({ tipo: 'tipo_letra', mensaje: `El código dice ${tipo.nombre} pero la letra de la factura parece ${ia.letra}. Revisá el tipo.` });
  }

  const lado = cuitCliente && cab.cuit === soloDigitos(cuitCliente) ? 'venta' : 'compra';

  let alicuotas = (ia?.alicuotas || []).map(a => ({ tasa: a.tasa, neto: aCentavos(a.neto), iva: aCentavos(a.iva) }));
  const tributos = [];
  if (ia?.percepciones_iva) tributos.push({ tipo: 'percepcion_iva', importe: aCentavos(ia.percepciones_iva) });
  if (ia?.percepciones_iibb) tributos.push({ tipo: 'percepcion_iibb', importe: aCentavos(ia.percepciones_iibb) });
  if (ia?.percepciones_municipales) tributos.push({ tipo: 'municipal', importe: aCentavos(ia.percepciones_municipales) });
  if (ia?.otros_tributos) tributos.push({ tipo: 'otros', importe: aCentavos(ia.otros_tributos) });
  const noGravado = aCentavos(ia?.no_gravado ?? 0);
  const exento = aCentavos(ia?.exento ?? 0);
  let total = ia?.total != null ? aCentavos(ia.total) : null;
  confianza.total = conf('total', total == null ? 'baja' : 'media');
  if (qr?.total != null) {
    if (total != null && Math.abs(total - qr.total) > TOLERANCIA) {
      alertas.push({ tipo: 'qr_distinto', campo: 'total', mensaje: 'El total leído no coincide con el del QR. Se toma el QR.' });
    }
    total = qr.total;
    confianza.total = 'alta';
  }

  if (total == null && !alicuotas.length) {
    alertas.push({ tipo: 'sin_total', mensaje: 'No se pudo leer el total. Completalo mirando la factura.' });
  }

  // Sin total leído pero con importes: se propone la suma, marcada para revisar
  if (total == null && alicuotas.length) {
    total = alicuotas.reduce((s, a) => s + a.neto + a.iva, 0) + noGravado + exento + tributos.reduce((s, t) => s + t.importe, 0);
    confianza.total = 'baja';
    alertas.push({ tipo: 'total_calculado', mensaje: 'No se pudo leer el total: se completó sumando los importes. Confirmalo con la factura.' });
  }

  // Cada alícuota: IVA ≈ neto × tasa
  confianza.alicuotas = conf('alicuotas', 'alta');
  for (const a of alicuotas) {
    const esperado = Math.round(a.neto * a.tasa / 100);
    if (Math.abs(esperado - a.iva) > TOLERANCIA) {
      confianza.alicuotas = 'baja';
      alertas.push({ tipo: 'alicuota_no_cierra', mensaje: `El IVA ${a.tasa}% no coincide con el neto × tasa.` });
    }
  }

  // Una A o M sin IVA discriminado es casi siempre una lectura incompleta
  if (tipo && (tipo.clase === 'A' || tipo.clase === 'M') && alicuotas.length === 0) {
    confianza.alicuotas = 'baja';
    alertas.push({ tipo: 'sin_desglose', mensaje: 'Factura A o M sin IVA discriminado: falta leer el neto y el IVA.' });
  }

  // La suma de conceptos tiene que dar el total
  if (total != null) {
    const suma = alicuotas.reduce((s, a) => s + a.neto + a.iva, 0) + noGravado + exento
      + tributos.reduce((s, t) => s + t.importe, 0);
    const sinDesglose = alicuotas.length === 0 && !noGravado && !exento;
    if (!sinDesglose && Math.abs(suma - total) > TOLERANCIA) {
      confianza.total = confianza.total === 'alta' ? 'alta' : 'baja';
      confianza.alicuotas = 'baja';
      alertas.push({ tipo: 'no_cierra', mensaje: `Revisar comprobante: la suma no da el total. Total informado ${formatear(total)} · total calculado ${formatear(suma)} · diferencia ${formatear(total - suma)}.`, informado: total, calculado: suma });
    }
  }

  // B y C recibidas no discriminan IVA a efectos del crédito fiscal
  let ivaInformativo;
  if (tipo && lado === 'compra' && (tipo.clase === 'B' || tipo.clase === 'C') && alicuotas.length) {
    ivaInformativo = alicuotas.reduce((s, a) => s + a.iva, 0);
    alicuotas = [];
  }

  const comprobante = {
    id, archivoId, origen: 'foto', lado,
    tipo: cab.tipo, ptoVta: cab.ptoVta, numero: cab.numero, fecha: cab.fecha,
    cuit: cab.cuit, denominacion: ia?.razon_social_emisor ?? '',
    moneda: cab.moneda, cotizacion: cab.cotizacion, cae: cab.cae,
    total: total ?? 0, alicuotas, tributos, noGravado, exento, ivaInformativo,
    estadoRevision: 'pendiente', confianza,
  };
  const todoAlto = Object.values(confianza).every(c => c === 'alta');
  return { ok: true, comprobante, alertas, revisionRapida: todoAlto && alertas.length === 0 };
}

const soloDigitos = s => String(s ?? '').replace(/\D/g, '');
const normMoneda = m => (!m || m === '$' || /^pes/i.test(m) || /^ars$/i.test(m)) ? 'PES' : /^(usd|u\$s|dol)/i.test(m) ? 'DOL' : m;
const tipoDesdeLetra = l => ({ A: '001', B: '006', C: '011', M: '051' }[l] || '');
const mapaCampoInverso = k => ({ tipo_codigo: 'tipo', punto_venta: 'ptoVta', cuit_emisor: 'cuit' }[k] || k);
const mapaCampo = k => ({ tipo: 'tipo_codigo', ptoVta: 'punto_venta', cuit: 'cuit_emisor' }[k] || k);
