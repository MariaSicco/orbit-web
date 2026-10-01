// Las cuatro tareas del conciliador que usan a Claude. Cada una recibe lo mínimo necesario y su respuesta
// se valida con el mismo código del motor antes de devolverla. Claude interpreta; el motor calcula y decide.

import { pedirJson } from './cliente.js';
import { CAMPOS, validarMapeo } from '../../../../herramientas/iva/engine/conciliacion/columnas.js';
import { TIPOS_REGLA, CAMPOS_COMPARABLES, validarRegla, describirRegla } from '../../../../herramientas/iva/engine/conciliacion/reglas.js';

const texto = { type: 'string' };
const cadenas = { type: 'array', items: texto };

// ——— 1. Reconocer columnas ———
// Entrada: encabezados y hasta 5 filas de muestra (no el archivo entero).
export async function detectarColumnas({ encabezados, muestras, origen }) {
  const lista = encabezados.slice(0, 80).map(String);
  const esquema = {
    type: 'object', additionalProperties: false, required: ['mapeo', 'notas'],
    properties: {
      mapeo: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false, required: ['campo', 'encabezado', 'seguridad'],
          properties: { campo: { type: 'string', enum: Object.keys(CAMPOS) }, encabezado: texto, seguridad: { type: 'string', enum: ['alta', 'media', 'baja'] } },
        },
      },
      notas: texto,
    },
  };
  const contenido = `Archivo de ${origen === 'arca' ? 'ARCA (Mis Comprobantes)' : 'un sistema contable argentino (por ejemplo CHESS)'}.
Encabezados (exactos): ${JSON.stringify(lista)}
Filas de muestra: ${JSON.stringify(muestras.slice(0, 5).map(f => f.slice(0, 80).map(c => String(c ?? '').slice(0, 60))))}

Campos internos: ${Object.entries(CAMPOS).map(([c, d]) => `${c} (${d.nombre})`).join(', ')}.
Para cada campo interno que exista en el archivo, decí qué encabezado le corresponde, copiándolo exacto. Si un campo no está, no lo incluyas.
"comprobante" es solo cuando punto de venta y número vienen juntos en una columna (ej. 0003-00001234). "Tipo Doc." de ARCA es el tipo de documento, no el tipo de comprobante.`;
  const r = await pedirJson({
    tarea: 'columnas', esquema, contenido,
    sistema: 'Reconocés columnas de archivos contables argentinos. Respondés solo con el JSON pedido. Nunca inventás encabezados.',
    validar: j => {
      const mapeo = {};
      const seguridad = {};
      for (const m of j.mapeo ?? []) {
        if (!lista.includes(m.encabezado) || mapeo[m.campo]) continue;
        mapeo[m.campo] = m.encabezado; seguridad[m.campo] = m.seguridad;
      }
      const v = validarMapeo(mapeo, lista);
      return { ok: true, valor: { mapeo: v.mapeo, seguridad, faltantes: v.errores, notas: String(j.notas ?? '').slice(0, 500) } };
    },
  });
  return r;
}

// ——— 2. Interpretar una instrucción en lenguaje natural ———
export async function interpretarRegla({ instruccion }) {
  const esquema = {
    type: 'object', additionalProperties: false, required: ['entendida', 'reglas', 'duda'],
    properties: {
      entendida: { type: 'boolean' },
      reglas: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false,
          required: ['tipo', 'monto_pesos', 'porcentaje', 'dias', 'texto', 'cuit', 'nombres', 'origen', 'modo', 'campos', 'campo'],
          properties: {
            tipo: { type: 'string', enum: Object.keys(TIPOS_REGLA) },
            monto_pesos: { type: 'number' }, porcentaje: { type: 'number' }, dias: { type: 'integer' },
            texto: texto, cuit: texto, nombres: cadenas,
            origen: { type: 'string', enum: ['sistema', 'arca', 'ambos', ''] },
            modo: { type: 'string', enum: ['por_tipo', 'como_viene', ''] },
            campos: { type: 'array', items: { type: 'string', enum: CAMPOS_COMPARABLES } },
            campo: { type: 'string', enum: [...CAMPOS_COMPARABLES, ''] },
          },
        },
      },
      duda: texto,
    },
  };
  const contenido = `Instrucción del usuario para esta conciliación entre su sistema contable y ARCA:
"""${String(instruccion).slice(0, 1000)}"""

Traducila a reglas de estos tipos (completá solo los campos que usa cada tipo; el resto en 0, "" o []):
- tolerancia_monto: monto_pesos (y cuit si es solo para un proveedor)
- tolerancia_porcentaje: porcentaje
- tolerancia_fecha: dias
- excluir_proveedor: texto (nombre o CUIT)
- alias_proveedor: cuit y nombres (nombres con que figura en el sistema)
- signo_notas_credito: origen (sistema, arca o ambos) y modo (por_tipo = el signo sale del tipo de comprobante; como_viene = se respeta el signo del archivo)
- campos_obligatorios: campos que deben coincidir
- ignorar_campo: campo cuyas diferencias no cuentan
Si la instrucción pide algo que no entra en estos tipos, entendida = false y explicá en "duda" qué no se puede hacer. No inventes reglas.`;
  return pedirJson({
    tarea: 'regla', esquema, contenido,
    sistema: 'Convertís instrucciones de conciliación contable en reglas estructuradas. No ejecutás acciones: solo describís reglas del catálogo.',
    validar: j => {
      const reglas = [], rechazadas = [];
      for (const x of j.reglas ?? []) {
        const cruda = {
          tolerancia_monto: { valor: Math.round((x.monto_pesos ?? 0) * 100), cuit: x.cuit || undefined },
          tolerancia_porcentaje: { valor: x.porcentaje },
          tolerancia_fecha: { dias: x.dias },
          excluir_proveedor: { valor: x.texto },
          alias_proveedor: { cuit: x.cuit, nombres: x.nombres },
          signo_notas_credito: { origen: x.origen || 'ambos', modo: x.modo },
          campos_obligatorios: { campos: x.campos },
          ignorar_campo: { campo: x.campo },
        }[x.tipo];
        const v = validarRegla({ tipo: x.tipo, ...cruda, alcance: 'corrida' });
        if (v.ok) reglas.push({ ...v.regla, descripcion: describirRegla(v.regla) });
        else rechazadas.push(v.error);
      }
      if (j.entendida && !reglas.length) return { ok: false, error: 'marcó entendida pero ninguna regla es válida' };
      return { ok: true, valor: { entendida: !!j.entendida && reglas.length > 0, reglas, rechazadas, duda: String(j.duda ?? '').slice(0, 500) } };
    },
  });
}

// ——— 3. Analizar pocos candidatos ambiguos ———
// Recibe un registro del sistema y hasta 3 candidatos de ARCA, con las señales y diferencias que ya calculó el motor.
export async function resolverCandidatos({ sistema, candidatos }) {
  const ids = candidatos.slice(0, 3).map(c => String(c.id));
  const esquema = {
    type: 'object', additionalProperties: false, required: ['decision', 'candidato_id', 'razones', 'conflictos'],
    properties: {
      decision: { type: 'string', enum: ['mismo', 'distinto', 'incierto'] },
      candidato_id: texto, razones: cadenas, conflictos: cadenas,
    },
  };
  const contenido = `Registro del sistema contable: ${JSON.stringify(sistema)}
Candidatos de ARCA (con señales y diferencias ya calculadas por el motor; los importes están en pesos): ${JSON.stringify(candidatos.slice(0, 3))}

¿Alguno es el mismo comprobante? Respondé "mismo" solo si hay evidencia suficiente (por ejemplo, un número mal tipeado con el resto igual). Si dudás, "incierto". Si ninguno lo es, "distinto". No recalcules importes: usá las diferencias dadas.`;
  return pedirJson({
    tarea: 'candidatos', esquema, contenido, pensar: true, maxTokens: 6000,
    sistema: 'Ayudás a conciliar comprobantes fiscales argentinos. Nunca afirmás que dos comprobantes son el mismo sin evidencia. Tu respuesta es una sugerencia para un humano.',
    validar: j => {
      let decision = j.decision, id = String(j.candidato_id ?? '');
      if (decision === 'mismo' && !ids.includes(id)) decision = 'incierto';
      if (decision !== 'mismo') id = '';
      return { ok: true, valor: { decision, candidatoId: id, razones: (j.razones ?? []).slice(0, 5).map(String), conflictos: (j.conflictos ?? []).slice(0, 5).map(String) } };
    },
  });
}

// ——— 4. Explicar un resultado con palabras ———
// Solo puede usar los números que le pasamos: se controla que cada importe citado esté en los datos.
export async function explicarResultado({ resultado }) {
  const esquema = { type: 'object', additionalProperties: false, required: ['explicacion'], properties: { explicacion: texto } };
  const permitidos = new Set((JSON.stringify(resultado).match(/\d[\d.]*,\d{2}/g) ?? []));
  const contenido = `Resultado de la conciliación (calculado por el motor): ${JSON.stringify(resultado)}
Explicalo en una o dos oraciones, en español rioplatense, para una persona contable. Usá solo los datos y los importes escritos arriba, tal cual. No hagas cuentas nuevas.`;
  return pedirJson({
    tarea: 'explicar', esquema, contenido, maxTokens: 800,
    sistema: 'Explicás resultados de conciliación contable con claridad y sin inventar datos.',
    validar: j => {
      const citados = String(j.explicacion ?? '').match(/\d[\d.]*,\d{2}/g) ?? [];
      const ajeno = citados.find(n => !permitidos.has(n));
      if (ajeno) return { ok: false, error: `citó un importe que no está en los datos (${ajeno})` };
      return { ok: true, valor: { explicacion: String(j.explicacion).slice(0, 600) } };
    },
  });
}
