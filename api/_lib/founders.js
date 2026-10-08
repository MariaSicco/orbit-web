/* Programa Fundadores: los primeros 10 compradores reales reciben una
   herramienta chica hecha a medida (≈3 h de trabajo, 1 ronda de ajustes,
   entrega en 10 días hábiles).
   - Cuenta compras pagas desde el arranque de la pauta (06.10.2026).
   - No cuenta cuentas de administración ni pedidos de prueba.
   - Una persona = un lugar, aunque compre dos veces. */
import { createHmac } from 'node:crypto';
import { kvGet, kvSet, kvKeys, kvMGet } from './kv.js';
import { isAdmin, adminEmails } from './admin.js';
import { sendEmail, emailReady, layout, it } from './email.js';

export const MAX = 10;
const START = Date.parse('2026-10-06T00:00:00-03:00');
const LIST = 'orbit:founders';
const REQ = email => `orbit:founder-req:${email}`;
const SITE = () => process.env.SITE_URL || 'https://www.orbitando.com.ar';

export const founderToken = email =>
  createHmac('sha256', process.env.SESSION_SECRET || 'orbit-founders').update(`fundador|${String(email).toLowerCase()}`).digest('base64url').slice(0, 24);

const eligible = o => o && o.status === 'paid' && o.email
  && !/@orbitando\.com\.ar$/i.test(o.email) && !isAdmin(o.email)
  && Date.parse(o.paidAt || o.date) >= START;

/* La lista guardada manda. Si todavía no existe, se arma con las compras
   que ya hubo (la primera vez que se consulta). */
export async function listFounders() {
  const saved = await kvGet(LIST);
  if (Array.isArray(saved)) return saved;
  const orders = (await kvMGet(await kvKeys('orbit:order:*'))).filter(eligible)
    .sort((a, b) => Date.parse(a.paidAt || a.date) - Date.parse(b.paidAt || b.date));
  const list = [];
  for (const o of orders) {
    if (list.length >= MAX) break;
    if (list.some(f => f.email === o.email)) continue;
    list.push({ n: list.length + 1, email: o.email, order: o.id, at: o.paidAt || o.date, invited: null });
  }
  await kvSet(LIST, list);
  return list;
}
const save = list => kvSet(LIST, list);

export async function founderOf(email) {
  const e = String(email || '').toLowerCase();
  return (await listFounders()).find(f => f.email === e) || null;
}

/* Se llama al acreditar un pago. Si hay lugar, suma a la persona y le
   manda la invitación. Nunca tira error hacia afuera. */
export async function claimFounder(order) {
  try {
    if (!eligible(order)) return null;
    const list = await listFounders();
    const ya = list.find(f => f.email === order.email);
    if (ya) {
      /* si la lista se armó recién con esta misma compra, falta la invitación */
      if (ya.order === order.id && !ya.invited) { ya.invited = await sendInvite(ya); await save(list); }
      return ya.n;
    }
    if (list.length >= MAX) return null;
    const f = { n: list.length + 1, email: order.email, order: order.id, at: order.paidAt, invited: null };
    list.push(f); await save(list);
    f.invited = await sendInvite(f);
    await save(list);
    return f.n;
  } catch (e) { return null; }
}

export async function sendInvite(f) {
  if (!emailReady()) return 'sin servicio de email';
  const link = `${SITE()}/fundadores?e=${encodeURIComponent(f.email)}&t=${founderToken(f.email)}`;
  try {
    await sendEmail({
      to: f.email,
      subject: `Sos fundador #${f.n} de Orbit`,
      text: `Fuiste de las primeras 10 personas en comprar en Orbit. Como agradecimiento, te armamos sin cargo una herramienta chica a medida para tu trabajo: una planilla, una plantilla de Notion o una adaptación de lo que compraste.\n\nContanos qué necesitás acá: ${link}\n\nLo resolvemos en 10 días hábiles, con una ronda de ajustes. Si respondés este mail también nos llega.`,
      html: layout({
        accent: 'blue',
        preheader: 'Una herramienta a medida para tu trabajo, sin cargo.',
        eyebrow: `Fundadores · ${String(f.n).padStart(2, '0')} de ${MAX}`,
        title: `Sos ${it('fundador.', '#3047FF')}`,
        body: `<p style="margin:0 0 12px">Fuiste de las primeras 10 personas en comprar en Orbit. Como agradecimiento, te armamos <b>sin cargo una herramienta chica a medida</b> para tu trabajo: una planilla, una plantilla de Notion o una adaptación de lo que compraste a tu caso.</p><p style="margin:0">Contanos qué necesitás en 3 minutos. Lo resolvemos en 10 días hábiles, con una ronda de ajustes.</p>`,
        meta: [['Lugar', `${f.n} de ${MAX}`], ['Entrega', '10 días hábiles'], ['Costo', 'Sin cargo']],
        cta: 'Pedir mi herramienta →', ctaUrl: link,
        foot: 'Si preferís, respondé este mail contándonos qué te sirve. No hace falta que sepas cómo se hace: con el problema alcanza.',
      }),
    });
    return new Date().toISOString();
  } catch (e) { return 'error: ' + String(e).slice(0, 120); }
}

export async function markInvited(email, value) {
  const list = await listFounders();
  const f = list.find(x => x.email === email); if (!f) return null;
  f.invited = value; await save(list); return f;
}

export const getRequest = email => kvGet(REQ(String(email).toLowerCase()));

export async function saveRequest(f, data) {
  const req = { ...data, n: f.n, email: f.email, at: new Date().toISOString() };
  await kvSet(REQ(f.email), req);
  const list = await listFounders();
  const x = list.find(y => y.email === f.email); if (x) { x.pedido = req.at; await save(list); }
  /* aviso al equipo */
  const to = adminEmails()[0] || 'hola@orbitando.com.ar';
  if (emailReady()) {
    const rows = [['Fundador', `#${f.n} · ${f.email}`], ['Rubro', data.rubro], ['Qué necesita', data.problema], ['Formato', data.formato], ['Hoy lo resuelve con', data.hoy], ['WhatsApp', data.wa || '—'], ['Se puede mostrar', data.mostrar ? 'Sí' : 'No'], ['Asistente', data.guia || 'No lo usó']];
    await sendEmail({
      to, subject: `Fundador #${f.n} pidió su herramienta`,
      text: rows.map(([k, v]) => `${k}: ${v}`).join('\n'),
      html: layout({ accent: 'blue', eyebrow: 'Fundadores · pedido nuevo', title: `Pedido de ${it('#' + f.n, '#3047FF')}`, meta: rows.map(([k, v]) => [k, String(v || '—').slice(0, 300)]) }),
    }).catch(() => {});
  }
  return req;
}
