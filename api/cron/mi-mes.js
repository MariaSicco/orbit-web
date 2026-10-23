/* Mi Mes by Orbit: corre una vez por día (vercel.json → crons, 13:00 UTC =
   10:00 de Argentina). A cada cuenta con avisos le manda lo que toca hoy:
   cerró el resumen, vence en 3 días / mañana / hoy, dólares (5 días
   antes) y, una vez por mes, si lo que vence en tarjetas supera la plata líquida. Sin montos. Nunca repite un aviso (sent por tag). */
import { kvKeys, kvMGet, getPurchases } from '../_lib/kv.js';
import { mandarPush, guardarAvisos, hoyAR, limpiarMeses, leerAvisos } from '../_lib/mi-mes-avisos.js';
import { trabajoDiario } from '../_lib/mi-mes-mail.js';
import { vigenciaIA } from '../_lib/mi-mes-ia.js';
import { isAdmin } from '../_lib/admin.js';
import { sendEmail, emailReady, layout, it } from '../_lib/email.js';
import { avisosPushDeHoy, limpiarTarjetasAvisos } from '../_herramientas/mi-mes/calculos.js';

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  /* en producción sin CRON_SECRET no corre: el user-agent se puede falsificar */
  if (!secret && process.env.VERCEL_ENV === 'production') return res.status(401).json({ error: 'falta CRON_SECRET' });
  const ok = secret ? req.headers.authorization === `Bearer ${secret}` : /vercel-cron/i.test(req.headers['user-agent'] || '');
  if (!ok) return res.status(401).json({ error: 'unauthorized' });
  const inicio = Date.now();

  const hoy = String(req.query?.hoy || '').match(/^\d{4}-\d{2}-\d{2}$/) && !process.env.VERCEL_ENV?.startsWith('prod') ? req.query.hoy : hoyAR();
  const claves = await kvKeys('orbit:mi-mes:avisos:*');
  const todas = (await kvMGet(claves)).filter(Boolean);
  const out = { cuentas: todas.length, avisos: 0, push: 0, errores: 0 };
  const limite = new Date(Date.parse(hoy) - 60 * 864e5).toISOString().slice(0, 10);
  for (const raw of todas) {
    const email = String(raw.email || '').toLowerCase();
    if (!email || !Array.isArray(raw.subs) || !raw.subs.length) continue;
    const n = { email, subs: raw.subs, tarjetas: limpiarTarjetasAvisos(raw.tarjetas), credito: limpiarMeses(raw.credito), sent: raw.sent || {} };
    try {
      const items = avisosPushDeHoy(n.tarjetas, hoy, n.credito).filter(i => !n.sent[i.tag]);
      if (!items.length) continue;
      for (const i of items) { out.push += await mandarPush(n, { title: i.title, body: i.body, url: '/herramientas/mi-mes', tag: i.tag }); out.avisos++; }
      for (const i of items) n.sent[i.tag] = hoy;
      for (const [k, d] of Object.entries(n.sent)) if (d < limite) delete n.sent[k];
      await guardarAvisos(n);
    } catch { out.errores++; }
  }
  /* mail conectado por 6 meses: avisos de vencimiento del permiso, búsqueda de lo nuevo y lectura (ver _lib/mi-mes-mail.js) */
  try { out.mail = await trabajoDiario({ hoy, finMs: inicio + 230_000, avisar: avisarMail, habilitada: lecturaHabilitada }); }
  catch (e) { out.mail = { error: String(e?.code || e?.message || 'error').slice(0, 60) }; }
  res.status(200).json(out);
}

/* sin la compra de Mi Mes o con la lectura automática vencida (12 meses), no se lee el mail */
async function lecturaHabilitada(email) {
  if (isAdmin(email)) return true;
  const compras = await getPurchases(email).catch(() => []);
  if (!compras.some(p => p.productId === 'ob-019')) return false;
  return !(await vigenciaIA({ email, admin: false }, compras)).vencida;
}
/* aviso del vencimiento del permiso: al celu (si activó los avisos) y por mail */
async function avisarMail(email, { title, body }, tipo) {
  try { const n = await leerAvisos(email); if (n.subs.length) await mandarPush(n, { title, body, url: '/herramientas/mi-mes#subir', tag: `mm:mail:${tipo}` }); } catch {}
  if (!emailReady()) return;
  const url = `${process.env.SITE_URL || 'https://www.orbitando.com.ar'}/herramientas/mi-mes#subir`;
  try {
    await sendEmail({ to: email, subject: title, text: `${body}\n\n${url}`, html: layout({ eyebrow: 'Mi Mes by Orbit', title: tipo === 'vencido' ? `Tu mail ya no está ${it('conectado.')}` : `Renová el permiso ${it('de tu mail.')}`, body: `<p style="margin:0">${body}</p>`, cta: tipo === 'vencido' ? 'Volver a conectar' : 'Renovar el permiso', ctaUrl: url, sign: false }) });
  } catch (e) { console.warn(`[mi-mes] aviso de vencimiento del mail: ${String(e).slice(0, 120)}`); }
}
