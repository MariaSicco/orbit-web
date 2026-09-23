/* Productos: leer y editar precio, estado, nombre, bajada y archivo. */
import { requireAdmin } from '../_lib/admin.js';
import { getCatalog, saveOverride, envFileName } from '../_lib/catalog.js';
import { readBody } from '../_lib/auth.js';
import { isBlobRef, refPath, datosDe } from '../_lib/blob.js';

export default async function handler(req, res) {
  const s = requireAdmin(req, res); if (!s) return;

  if (req.method === 'POST') {
    const { id, ...patch } = await readBody(req);
    const saved = await saveOverride(id, patch);
    if (!saved) return res.status(400).json({ error: 'producto_desconocido' });
    return res.status(200).json({ ok: true, producto: { id, ...saved, env: envFileName(id) } });
  }

  const CAT = await getCatalog();
  const productos = await Promise.all(Object.entries(CAT).map(async ([id, p]) => ({
    id, ...p, env: envFileName(id),
    ...(isBlobRef(p.file) ? { archivo: await datosDe(refPath(p.file)) } : {}),
  })));
  res.status(200).json({ productos });
}
