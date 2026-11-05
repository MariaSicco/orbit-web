/* Mimitos · "Me fui" y Cámara Mimitos: corre cada 10 minutos (vercel.json → crons, "*\/10 * * * *").
   - Avisos de "Me fui" cuando la salida pasa el umbral que eligió la persona (y el doble), con dedupe por salida y escalón.
   - Resumen de los eventos de sonido que se agruparon (máximo 1 aviso cada 15 min por tipo).
   Con MIMITOS_MEFUI apagado sale enseguida, sin tocar KV (el plan Pro de Vercel permite crons cada minuto;
   esto son ~4.300 invocaciones por mes que, apagado, no hacen nada). */
import { timingSafeEqual } from 'node:crypto';
import { runAway, flushPending, mefuiOn } from '../_lib/petaway.js';

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret) { console.error('[mimitos] cron me fui bloqueado: falta CRON_SECRET'); return res.status(503).json({ error: 'cron_secret_no_configurado' }); }
  const got = Buffer.from(String(req.headers.authorization || '')), want = Buffer.from(`Bearer ${secret}`);
  if (got.length !== want.length || !timingSafeEqual(got, want)) return res.status(401).json({ error: 'unauthorized' });
  if (!mefuiOn()) return res.status(200).json({ apagado: true });
  try {
    const out = await runAway();
    out.camara = await flushPending();
    return res.status(200).json(out);
  } catch (e) { console.error('[mimitos] cron me fui falló', e?.message || e); return res.status(500).json({ error: 'cron_fallo' }); }
}
