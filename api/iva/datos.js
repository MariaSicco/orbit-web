/* Orbit IVA · guardado en la cuenta.
   GET    ?doc=estado                  empresas, perfiles y lista de períodos
   GET    ?doc=periodo&id=per-…        un período (facturas, conciliación, reglas, decisiones)
   PUT    { doc, id?, datos }          guarda (reemplaza) el documento
   DELETE ?doc=periodo&id=per-…        borra un período
   Solo la cuenta dueña, con Orbit IVA comprada. Nunca se guardan fotos. */
import { accesoIva } from '../_lib/iva-acceso.js';
import { readBody } from '../_lib/auth.js';
import { leer, escribir, borrar, idValido } from '../_lib/iva-datos.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const acc = await accesoIva(req);
  if (acc.status) return res.status(acc.status).json({ ok: false, error: acc.error, motivo: acc.motivo });
  const q = req.query || {};
  const body = req.method === 'PUT' ? await readBody(req) : {};
  const doc = q.doc || body.doc, id = q.id || body.id;
  if (doc !== 'estado' && doc !== 'periodo') return res.status(400).json({ ok: false, error: 'Documento desconocido.' });
  if (doc === 'periodo' && !idValido(id)) return res.status(400).json({ ok: false, error: 'Período inválido.' });
  try {
    if (req.method === 'GET') return res.status(200).json({ ok: true, datos: await leer(acc.email, doc, id) });
    if (req.method === 'PUT') {
      if (!body.datos || typeof body.datos !== 'object') return res.status(400).json({ ok: false, error: 'Faltan los datos.' });
      const r = await escribir(acc.email, doc, id, body.datos);
      if (!r.ok) return res.status(413).json({ ok: false, error: 'Este período es demasiado grande para guardarlo (más de 4 MB). Exportá el Excel para no perderlo.' });
      return res.status(200).json({ ok: true, guardado: new Date().toISOString() });
    }
    if (req.method === 'DELETE' && doc === 'periodo') { await borrar(acc.email, doc, id); return res.status(200).json({ ok: true }); }
    return res.status(405).json({ ok: false, error: 'Método no permitido.' });
  } catch (e) {
    console.error('iva/datos:', req.method, doc, e?.name);   // sin datos fiscales en los logs
    return res.status(502).json({ ok: false, error: 'No pudimos acceder a tus datos guardados. Probá de nuevo en un rato.' });
  }
}
