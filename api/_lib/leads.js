/* Leads de las muestras gratis: guardado, secuencia de 3 mails y baja.
   Mail 1 sale al pedir la muestra; el 2 al día siguiente y el 3 a los 3 días
   (los manda /api/cron/leads una vez por día). Si la persona compra el
   producto o se da de baja, la secuencia se corta. */
import { createHmac } from 'node:crypto';
import { kvGet, kvSet, getPurchases } from './kv.js';
import { getCatalog } from './catalog.js';
import { sendEmail, emailReady, layout, it } from './email.js';

const SITE = () => process.env.SITE_URL || 'https://www.orbitando.com.ar';
const SECRET = () => process.env.SESSION_SECRET || 'orbit-leads';
export const leadKey = (email, prod) => `orbit:lead:${prod}:${email.toLowerCase()}`;
const DAY = 864e5;

const money = n => '$' + Number(n || 0).toLocaleString('es-AR');
const link = (prod, path, step) => `${SITE()}${path}?utm_source=email&utm_medium=lead&utm_campaign=${prod.replace('-', '')}&utm_content=m${step}`;

/* Contenido por producto. Precios del catálogo en vivo al momento de enviar. */
export const SEQ = {
  'ob-015': {
    name: 'Tardes sin pantalla',
    landing: '/tardes',
    sample: '/muestras/tardes-sin-pantalla-muestra.pdf',
    accent: 'acid',
    mails: [
      p => ({
        subject: 'Tus 5 páginas para imprimir',
        eyebrow: 'Tardes sin pantalla · Muestra',
        title: `Acá están tus ${it('5 páginas.', '#D9FF45')}`,
        body: `<p style="margin:0 0 12px">Imprimí una sola hoja y dásela sin explicar demasiado: las consignas están pensadas para que la hagan solos, de 10 a 15 minutos.</p><p style="margin:0">Un tip: dejá que elija cuál quiere hacer primero. Elegir es parte del juego.</p>`,
        cta: 'Bajar las 5 páginas →', ctaUrl: `${SITE()}/muestras/tardes-sin-pantalla-muestra.pdf`,
      }),
      p => ({
        subject: '¿Cuál le gustó más?',
        eyebrow: 'Tardes sin pantalla',
        title: `Si le gustó una, ${it('hay 120.', '#D9FF45')}`,
        body: `<p style="margin:0 0 12px">El cuaderno completo trae 120 actividades en 6 secciones: laberintos, trazos, números, patrones, juegos de encontrar y colorear con consigna. Van de fácil a difícil, para chicos de 4 a 7 años.</p><p style="margin:0">En blanco y negro para gastar poca tinta, con las soluciones al final y un diploma para cuando lo terminan. Pago único de ${money(p.ars)}, imprimís todas las veces que quieras.</p>`,
        cta: 'Ver el cuaderno completo →',
      }),
      p => ({
        subject: 'Lo último sobre el cuaderno',
        eyebrow: 'Tardes sin pantalla',
        title: `Una hoja, ${it('una tarde.', '#D9FF45')}`,
        body: `<p style="margin:0 0 12px">Te escribo una última vez sobre esto. El cuaderno completo es un PDF que bajás apenas pagás: 120 actividades, las soluciones, un registro para ir marcando y el diploma.</p><p style="margin:0 0 12px">Si al abrirlo no es lo que esperabas, tenés 10 días corridos para arrepentirte y te devolvemos el dinero.</p><p style="margin:0">Pago único de ${money(p.ars)}.</p>`,
        cta: 'Quiero el cuaderno →',
      }),
    ],
  },
  'ob-017': {
    name: 'Comandos eléctricos',
    landing: '/comandos',
    sample: '/muestras/comandos-electricos-muestra.pdf',
    accent: 'fuego',
    mails: [
      p => ({
        subject: 'Tu muestra: 6 páginas de la guía',
        eyebrow: 'Comandos eléctricos · Muestra',
        title: `Tus ${it('6 páginas.', '#FF4F2E')}`,
        body: `<p style="margin:0 0 12px">Acá tenés la muestra de la guía: la tapa, los símbolos y dos diagramas completos, con potencia y comando.</p><p style="margin:0">Cada comando de la guía se simuló antes de dibujarse, con la secuencia, los materiales y la prueba antes de entregar.</p>`,
        cta: 'Bajar la muestra →', ctaUrl: `${SITE()}/muestras/comandos-electricos-muestra.pdf`,
      }),
      p => ({
        subject: '¿Qué térmico le ponés a un motor de 5,5 kW?',
        eyebrow: 'Comandos eléctricos',
        title: `La cuenta del tablero, ${it('hecha.', '#FF4F2E')}`,
        body: `<p style="margin:0 0 12px">Con la guía viene una calculadora de tablero que funciona en el celular, sin internet. Le cargás el motor y te da la corriente, el térmico, el contactor, un cable orientativo y la lista de materiales para copiar.</p><p style="margin:0 0 12px">Ejemplo: motor trifásico de 5,5 kW en 380 V → 11,5 A. Directo, inversión o estrella-triángulo.</p><p style="margin:0">Guía de 25 comandos + 20 ejercicios con soluciones + calculadora: ${money(p.ars)}, pago único.</p>`,
        cta: 'Ver la guía completa →',
      }),
      p => ({
        subject: 'Lo último sobre la guía de comandos',
        eyebrow: 'Comandos eléctricos',
        title: `25 comandos, ${it('verificados.', '#FF4F2E')}`,
        body: `<p style="margin:0 0 12px">Te escribo una última vez sobre esto. La guía tiene 79 páginas: 25 diagramas de potencia y comando, 20 ejercicios de fallas con la solución explicada, tablas orientativas y la calculadora de tablero.</p><p style="margin:0 0 12px">La bajás apenas pagás. Si no es lo que esperabas, tenés 10 días corridos para arrepentirte y te devolvemos el dinero.</p><p style="margin:0">Pago único de ${money(p.ars)}.</p>`,
        cta: 'Quiero la guía →',
      }),
    ],
  },
};

export const unsubToken = (email, prod) => createHmac('sha256', SECRET()).update(`${email.toLowerCase()}|${prod}`).digest('base64url').slice(0, 24);
const unsubUrl = (email, prod) => `${SITE()}/api/lead?baja=1&e=${encodeURIComponent(email)}&p=${prod}&t=${unsubToken(email, prod)}`;

export async function sendStep(lead, step) {
  const seq = SEQ[lead.prod];
  if (!seq || !emailReady()) return 'sin servicio de email';
  const CAT = await getCatalog();
  const p = CAT[lead.prod] || {};
  const m = seq.mails[step - 1](p);
  const ctaUrl = m.ctaUrl || link(lead.prod, seq.landing, step);
  const baja = unsubUrl(lead.email, lead.prod);
  try {
    await sendEmail({
      to: lead.email,
      subject: m.subject,
      text: `${m.body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()}\n\n${m.cta.replace(' →', '')}: ${ctaUrl}\n\nNo quiero recibir más mails sobre esto: ${baja}`,
      html: layout({
        accent: seq.accent, eyebrow: m.eyebrow, title: m.title, body: m.body,
        preheader: m.subject, cta: m.cta, ctaUrl,
        foot: `Te escribimos porque pediste la muestra de ${seq.name} en orbitando.com.ar. <a href="${baja}" style="color:#77756F">No quiero recibir más mails sobre esto</a>.`,
      }),
    });
    return 'ok';
  } catch (e) { return String(e).slice(0, 160); }
}

export async function saveLead({ email, prod, ref = null, src = null }) {
  const k = leadKey(email, prod);
  const prev = await kvGet(k);
  if (prev) return { lead: prev, nuevo: false };
  const lead = { email: email.toLowerCase(), prod, ref, src, createdAt: new Date().toISOString(), step: 0, log: [] };
  await kvSet(k, lead, 60 * 60 * 24 * 120);
  return { lead, nuevo: true };
}

export async function advance(lead, step) {
  const res = await sendStep(lead, step);
  lead.step = step; lead.log = [...(lead.log || []), { step, at: new Date().toISOString(), res }];
  await kvSet(leadKey(lead.email, lead.prod), lead, 60 * 60 * 24 * 120);
  return res;
}

/* qué paso le toca hoy: 2 desde el día 1, 3 desde el día 3 */
export function dueStep(lead, now = Date.now()) {
  if (lead.unsub || lead.step >= 3 || lead.step < 1) return 0;
  const age = now - new Date(lead.createdAt).getTime();
  if (lead.step === 1 && age >= 1 * DAY - 3600e3) return 2;
  if (lead.step === 2 && age >= 3 * DAY - 3600e3) return 3;
  return 0;
}

export async function bought(lead) {
  const list = await getPurchases(lead.email);
  return list.some(x => x.productId === lead.prod);
}
