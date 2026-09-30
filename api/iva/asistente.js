/* Orbit IVA · asistente del conciliador (columnas, reglas, candidatos dudosos, explicaciones).
   Solo recibe lo mínimo (muestras, una instrucción, pocos candidatos). No gasta lecturas: tiene tope diario por cuenta. */
import { accesoIva, usarAsistente, TOPE_ASISTENTE_DIARIO } from '../_lib/iva-acceso.js';
import { detectarColumnas, interpretarRegla, resolverCandidatos, explicarResultado } from '../_lib/iva/ai/tareas.js';
import { ErrorIa } from '../_lib/iva/ai/cliente.js';

const TAREAS = {
  columnas: { fn: detectarColumnas, valido: d => Array.isArray(d.encabezados) && d.encabezados.length > 0 && Array.isArray(d.muestras) },
  regla: { fn: interpretarRegla, valido: d => typeof d.instruccion === 'string' && d.instruccion.trim().length > 0 },
  candidatos: { fn: resolverCandidatos, valido: d => d.sistema && Array.isArray(d.candidatos) && d.candidatos.length > 0 },
  explicar: { fn: explicarResultado, valido: d => d.resultado && typeof d.resultado === 'object' },
};

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Método no permitido.' });
  const acc = await accesoIva(req);
  if (acc.status) return res.status(acc.status).json({ ok: false, error: acc.error, motivo: acc.motivo });
  const { tarea, datos } = req.body ?? {};
  const t = TAREAS[tarea];
  if (!t || !datos || !t.valido(datos)) return res.status(400).json({ ok: false, error: 'Pedido incompleto para el asistente.' });
  if (JSON.stringify(datos).length > 200_000) return res.status(413).json({ ok: false, error: 'Demasiados datos para el asistente.' });
  if (!acc.ilimitado && !(await usarAsistente(acc.email))) return res.status(429).json({ ok: false, error: `Llegaste al tope de ${TOPE_ASISTENTE_DIARIO} consultas al asistente por hoy.` });
  try {
    const r = await t.fn(datos);
    return res.status(200).json({ ok: true, ...r.valor, modelo: r.uso.modelo });
  } catch (e) {
    if (!(e instanceof ErrorIa)) console.error(`iva/asistente:${tarea}`, e?.name);
    return res.status(502).json({ ok: false, error: e instanceof ErrorIa ? e.message : 'El asistente tuvo un error. Podés seguir sin IA.' });
  }
}

export const config = { maxDuration: 60 };
