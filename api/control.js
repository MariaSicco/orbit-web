/* Control de Orbit: nichos, cola de investigación, productos en desarrollo,
   ventas por persona y equipo. Entra solo el equipo (ver _lib/team.js).

   GET  /api/control?a=estado        todo lo que muestra la página
   POST /api/control  { a, ... }     acciones (ver más abajo)

   Cada nicho, pedido y producto en desarrollo es una clave propia en la base,
   así dos personas pueden editar a la vez sin pisarse. */
import { requireTeam, getTeam, getTeamRaw, saveTeamRaw } from './_lib/team.js';
import { kvGet, kvSet, kvDel, kvKeys, kvMGet } from './_lib/kv.js';
import { getCatalog } from './_lib/catalog.js';
import { readBody, cleanEmail, isEmail, hashPassword, passwordProblem } from './_lib/auth.js';
import { getUser, saveUser } from './_lib/users.js';
import { randomBytes } from 'node:crypto';

export const config = { maxDuration: 120 };

const K = { nicho: id => `orbit:ctrl:nicho:${id}`, dev: id => `orbit:ctrl:dev:${id}`, cola: id => `orbit:ctrl:cola:${id}` };
const PAUTA = 'orbit:ctrl:pauta';
const ahora = () => new Date().toISOString();
const nuevoId = () => randomBytes(5).toString('hex');
const slug = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);
const ESTADOS = ['idea', 'investigando', 'validado', 'opcion', 'tomado', 'descartado'];
const FASES = ['Idea', 'F0 Tesis', 'F1 Spec', 'F2 Build', 'F3 QA', 'F4 Venta', 'Publicado'];
const NICHO_DE = { 'ob-006': 'Fleteros', 'ob-007': 'Fleteros', 'ob-008': 'Fleteros', 'ob-009': 'Abogados', 'ob-010': 'Abogados', 'ob-011': 'Abogados',
  'ob-012': 'Cocina', 'ob-014': 'Cocina', 'ob-015': 'Chicos', 'ob-016': 'Chicos', 'ob-017': 'Electricistas', 'ob-005': 'Contadores' };

async function todos(prefix) {
  const keys = await kvKeys(prefix + '*');
  return (await kvMGet(keys)).filter(Boolean);
}

/* Limpia lo que llega del navegador: solo campos conocidos, con largo tope. */
const txt = (v, n = 400) => (v == null ? '' : String(v)).slice(0, n);
const num = v => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
function limpiarNicho(p) {
  const o = {};
  for (const k of ['nicho', 'comprador', 'dolor', 'q', 'riesgo', 'resumen', 'fuente', 'gancho']) if (p[k] !== undefined) o[k] = txt(p[k], k === 'resumen' ? 1200 : 400);
  if (p.estado !== undefined && ESTADOS.includes(p.estado)) o.estado = p.estado;
  if (p.claims !== undefined) o.claims = Boolean(p.claims);
  if (p.investigadoEl !== undefined) o.investigadoEl = txt(p.investigadoEl, 40);
  if (Array.isArray(p.scores)) o.scores = p.scores.slice(0, 8).map(s => Math.max(1, Math.min(5, Math.round(num(s)) || 3)));
  if (Array.isArray(p.escalera)) o.escalera = p.escalera.slice(0, 4).map(x => ({ pieza: txt(x?.pieza, 20), nombre: txt(x?.nombre, 120), linea: txt(x?.linea, 20), precio: Math.max(0, Math.round(num(x?.precio))), descripcion: txt(x?.descripcion, 300) }));
  if (Array.isArray(p.operadores)) o.operadores = p.operadores.slice(0, 20).map(x => ({ nombre: txt(x?.nombre, 120), url: txt(x?.url, 600), anuncios: Math.max(0, Math.round(num(x?.anuncios))), dias: Math.max(0, Math.round(num(x?.dias))), precio: txt(x?.precio, 40), checkout: Boolean(x?.checkout), marcaPersonal: Boolean(x?.marcaPersonal), fuente: txt(x?.fuente, 60) }));
  if (Array.isArray(p.evidencia)) o.evidencia = p.evidencia.slice(0, 20).map(x => ({ t: txt(x?.t, 160), url: txt(x?.url, 600) }));
  return o;
}
function limpiarDev(p) {
  const o = {};
  for (const k of ['name', 'nicho', 'nichoId', 'pieza', 'linea', 'nota']) if (p[k] !== undefined) o[k] = txt(p[k], k === 'nota' ? 1200 : 160);
  if (p.usd !== undefined) o.usd = Math.max(0, Math.round(num(p.usd)));
  if (p.fase !== undefined && FASES.includes(p.fase)) o.fase = p.fase;
  return o;
}

/* Ventas pagadas por producto, desde los pedidos de la web. */
async function ventasPorProducto() {
  const orders = (await kvMGet(await kvKeys('orbit:order:*'))).filter(o => o && o.status === 'paid');
  const v = {};
  const hace30 = Date.now() - 30 * 86400000;
  for (const o of orders) for (const i of o.items || []) {
    const r = v[i.id] || (v[i.id] = { unidades: 0, ars: 0, usd: 0, unidades30: 0, ars30: 0, usd30: 0, ultima: null });
    const q = i.qty || 1, rec = new Date(o.paidAt || o.date).getTime() > hace30;
    r.unidades += q; if (rec) r.unidades30 += q;
    if (o.via === 'paypal') { r.usd += (i.usd || 0) * q; if (rec) r.usd30 += (i.usd || 0) * q; }
    else { r.ars += (i.ars || 0) * q; if (rec) r.ars30 += (i.ars || 0) * q; }
    if (!r.ultima || (o.paidAt || '') > r.ultima) r.ultima = o.paidAt;
  }
  return v;
}

async function estado(yo) {
  const [equipo, CAT, ventas, pauta, nichos, dev, cola] = await Promise.all([
    getTeam(), getCatalog(), ventasPorProducto(), kvGet(PAUTA).then(x => x || {}), todos('orbit:ctrl:nicho:'), todos('orbit:ctrl:dev:'), todos('orbit:ctrl:cola:'),
  ]);
  const admin = yo.admin;
  const publicados = Object.entries(CAT).map(([id, p]) => {
    const duena = p.duena || equipo.find(m => m.admin)?.email || null;
    const mio = duena === yo.email;
    const v = ventas[id] || { unidades: 0, ars: 0, usd: 0, unidades30: 0, ars30: 0, usd30: 0, ultima: null };
    return {
      id, tipo: 'catalogo', code: p.code, name: p.name, nicho: NICHO_DE[id] || '', usd: p.usd, ars: p.ars, soon: Boolean(p.soon),
      duena, fase: p.soon ? 'F4 Venta' : 'Publicado',
      /* cada una ve el detalle de sus ventas; la administradora ve todo */
      ventas: admin || mio ? v : { unidades: v.unidades },
      pauta: pauta[id] || null,
    };
  });
  /* resumen de ventas por persona (los montos solo los ve la administradora o la dueña) */
  const porPersona = equipo.map(m => {
    const ps = publicados.filter(p => p.duena === m.email);
    const t = { email: m.email, unidades: 0, ars: 0, usd: 0, unidades30: 0, ars30: 0, usd30: 0, productos: ps.length + dev.filter(d => d.duena === m.email).length };
    for (const p of ps) { const v = ventas[p.id] || {}; t.unidades += v.unidades || 0; t.unidades30 += v.unidades30 || 0; t.ars += v.ars || 0; t.usd += v.usd || 0; t.ars30 += v.ars30 || 0; t.usd30 += v.usd30 || 0; }
    if (!admin && m.email !== yo.email) { delete t.ars; delete t.usd; delete t.ars30; delete t.usd30; }
    return t;
  });
  return {
    yo, equipo, porPersona, generado: ahora(),
    productos: publicados.concat(dev.map(d => ({ ...d, tipo: 'dev' }))),
    nichos: nichos.sort((a, b) => (b.actualizado || '').localeCompare(a.actualizado || '')),
    cola: cola.sort((a, b) => (b.creado || '').localeCompare(a.creado || '')).slice(0, 60),
  };
}

/* ---------- IA (clave en ANTHROPIC_API_KEY) ---------- */
const REGLAS = `Sos el socio de producto de Orbit, una marca argentina que vende herramientas digitales de pago único (plantillas de Excel o Google Sheets, sistemas en Notion o de varias hojas, y microapps web) para oficios y profesiones concretas, en español, con tráfico frío de Meta Ads en Argentina.
Reglas de Orbit:
- Un nicho es un oficio o tipo de negocio con nombre y tamaño (ej.: "carpinteros de melamina con taller propio").
- La herramienta ahorra tiempo, genera plata u ordena un proceso. Nada de promesas de salud, legales, financieras ni de ingresos.
- En Argentina hay calculadoras sueltas gratis de casi todo: lo que se cobra es el sistema (historial, PDF para el cliente, actualización por inflación, cartera).
- Escalera: ancla USD 39–69 (sistema completo), entrada USD 19–29 (una parte que se vende sola), complemento USD 9–19 (bump).
- Un producto de menos de USD 19 no paga su propio anuncio.
- Aprendido de nuestros anuncios: los ganchos que funcionan son preguntas técnicas del oficio ("¿Qué térmico le pongo?"), no los emocionales.
- La IA nunca es el núcleo del producto.
- No uses salud, nutrición, infancia, espiritualidad ni recetas caseras.`;

async function claude(prompt, maxTokens = 4000) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw Object.assign(new Error('ia_no_configurada'), { status: 503 });
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: process.env.ORBIT_MODEL || 'claude-sonnet-5-5', max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] }),
  });
  if (!r.ok) throw Object.assign(new Error('ia_error_' + r.status), { status: 502 });
  const d = await r.json();
  const t = (d.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
  const a = t.indexOf('['), o = t.indexOf('{');
  const start = a >= 0 && (o < 0 || a < o) ? a : o;
  const end = Math.max(t.lastIndexOf(']'), t.lastIndexOf('}'));
  try { return JSON.parse(t.slice(start, end + 1)); } catch { throw Object.assign(new Error('ia_respuesta_invalida'), { status: 502 }); }
}

export default async function handler(req, res) {
  const yo = await requireTeam(req, res); if (!yo) return;

  if (req.method === 'GET') return res.status(200).json(await estado(yo));
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const b = await readBody(req);
  const soloAdmin = () => { if (!yo.admin) { res.status(403).json({ error: 'solo_admin' }); return true; } return false; };

  try {
    switch (b.a) {
      /* crear o editar un nicho */
      case 'nicho': {
        const p = limpiarNicho(b.patch || {});
        let id = b.id ? slug(b.id) : '';
        const cur = id ? await kvGet(K.nicho(id)) : null;
        if (!cur) { id = id || slug(p.nicho) || nuevoId(); if (await kvGet(K.nicho(id))) id += '-' + nuevoId().slice(0, 4); }
        if (p.estado === 'opcion' && !yo.admin) return res.status(403).json({ error: 'solo_admin_aprueba' });
        const next = { ...(cur || { id, estado: 'idea', creado: ahora(), pedidoPor: yo.email, operadores: [], evidencia: [], scores: [], escalera: [] }), ...p, id, actualizado: ahora() };
        /* tomar un nicho: una persona, un nicho activo */
        if (p.estado === 'tomado') {
          const otros = (await todos('orbit:ctrl:nicho:')).filter(n => n.estado === 'tomado' && n.duena === yo.email && n.id !== id);
          if (otros.length) return res.status(409).json({ error: 'ya_tenes_nicho', nicho: otros[0].nicho });
          if (cur?.estado === 'tomado' && cur.duena && cur.duena !== yo.email) return res.status(409).json({ error: 'ya_tomado' });
          next.duena = yo.email; next.tomadoEl = ahora();
        }
        if (b.soltar && (cur?.duena === yo.email || yo.admin)) { next.duena = null; next.estado = 'opcion'; }
        await kvSet(K.nicho(id), next);
        return res.status(200).json({ ok: true, nicho: next });
      }
      case 'nicho-borrar': {
        if (soloAdmin()) return;
        await kvDel(K.nicho(slug(b.id)));
        return res.status(200).json({ ok: true });
      }
      /* pedir investigación */
      case 'cola': {
        const id = nuevoId();
        const q = { id, tipo: b.tipo === 'espiad' ? 'espiad' : 'nicho', consulta: txt(b.consulta, 200), nichoId: b.nichoId ? slug(b.nichoId) : null, pedidoPor: yo.email, estado: 'pendiente', creado: ahora() };
        await kvSet(K.cola(id), q);
        if (q.nichoId) { const n = await kvGet(K.nicho(q.nichoId)); if (n) await kvSet(K.nicho(q.nichoId), { ...n, estado: 'investigando', actualizado: ahora() }); }
        return res.status(200).json({ ok: true, pedido: q });
      }
      case 'cola-upd': {
        const cur = await kvGet(K.cola(slug(b.id)));
        if (!cur) return res.status(404).json({ error: 'no_existe' });
        const next = { ...cur, ...(b.estado ? { estado: txt(b.estado, 20) } : {}), ...(b.resultado !== undefined ? { resultado: txt(b.resultado, 300) } : {}), actualizado: ahora() };
        await kvSet(K.cola(cur.id), next);
        return res.status(200).json({ ok: true, pedido: next });
      }
      /* productos en desarrollo */
      case 'dev': {
        const p = limpiarDev(b.patch || {});
        const id = b.id ? slug(b.id) : nuevoId();
        const cur = b.id ? await kvGet(K.dev(id)) : null;
        if (b.id && !cur) return res.status(404).json({ error: 'no_existe' });
        if (cur && cur.duena !== yo.email && !yo.admin) return res.status(403).json({ error: 'no_es_tuyo' });
        if (p.fase === 'Publicado' && !yo.admin) return res.status(403).json({ error: 'publicar_lo_aprueba_majo' });
        const next = { ...(cur || { id, fase: 'F0 Tesis', duena: yo.email, creado: ahora() }), ...p, id, actualizado: ahora() };
        if (b.duena && yo.admin) next.duena = cleanEmail(b.duena);
        await kvSet(K.dev(id), next);
        return res.status(200).json({ ok: true, producto: next });
      }
      case 'dev-borrar': {
        const cur = await kvGet(K.dev(slug(b.id)));
        if (cur && cur.duena !== yo.email && !yo.admin) return res.status(403).json({ error: 'no_es_tuyo' });
        await kvDel(K.dev(slug(b.id)));
        return res.status(200).json({ ok: true });
      }
      /* pauta de Meta por producto (la carga la administradora) */
      case 'pauta': {
        if (soloAdmin()) return;
        const all = (await kvGet(PAUTA)) || {};
        all[slug(b.id)] = { gasto: num(b.gasto), ventas: num(b.ventas), clics: num(b.clics), impresiones: num(b.impresiones), conjuntos: num(b.conjuntos), nota: txt(b.nota, 600), hasta: txt(b.hasta, 20), actualizado: ahora() };
        await kvSet(PAUTA, all);
        return res.status(200).json({ ok: true });
      }
      /* equipo: alta con nombre, email y contraseña (la pasa Majo) */
      case 'equipo-alta': {
        if (soloAdmin()) return;
        const email = cleanEmail(b.email), name = txt(b.name, 60).trim();
        if (!isEmail(email) || !name) return res.status(400).json({ error: 'faltan_datos' });
        if (b.password) {
          const pw = passwordProblem(b.password); if (pw) return res.status(400).json({ error: 'contrasena_debil', reason: pw });
          const u = (await getUser(email)) || { email, name, news: false, createdAt: ahora() };
          await saveUser({ ...u, name: u.name || name, hash: hashPassword(b.password) });
        } else if (!(await getUser(email))?.hash) return res.status(400).json({ error: 'falta_contrasena' });
        const raw = (await getTeamRaw()).filter(m => m.email !== email);
        raw.push({ email, name, desde: ahora() });
        await saveTeamRaw(raw);
        return res.status(200).json({ ok: true, equipo: await getTeam() });
      }
      case 'equipo-baja': {
        if (soloAdmin()) return;
        const email = cleanEmail(b.email);
        await saveTeamRaw((await getTeamRaw()).filter(m => m.email !== email));
        return res.status(200).json({ ok: true, equipo: await getTeam() });
      }
      /* traer datos de otro lado (una sola vez) */
      case 'importar': {
        if (soloAdmin()) return;
        let n = 0;
        for (const raw of (Array.isArray(b.nichos) ? b.nichos.slice(0, 200) : [])) {
          const id = slug(raw.id || raw.nicho); if (!id) continue;
          const cur = await kvGet(K.nicho(id));
          const p = limpiarNicho(raw);
          await kvSet(K.nicho(id), { ...(cur || { id, creado: raw.creado || ahora(), pedidoPor: yo.email }), ...p, id, duena: cur?.duena || null, actualizado: ahora() }); n++;
        }
        for (const raw of (Array.isArray(b.cola) ? b.cola.slice(0, 100) : [])) {
          const id = slug(raw.id) || nuevoId();
          await kvSet(K.cola(id), { id, tipo: raw.tipo === 'espiad' ? 'espiad' : 'nicho', consulta: txt(raw.consulta, 200), nichoId: raw.nichoId ? slug(raw.nichoId) : null, pedidoPor: yo.email, estado: txt(raw.estado || 'pendiente', 20), resultado: txt(raw.resultado, 300), creado: raw.creado || ahora() }); n++;
        }
        return res.status(200).json({ ok: true, importados: n });
      }
      /* IA: proponer nichos */
      case 'generar': {
        const nichos = await todos('orbit:ctrl:nicho:');
        const tema = txt(b.tema, 200).trim(), linea = ['plantilla', 'sistema', 'microapp'].includes(b.linea) ? b.linea : '';
        const ideas = await claude(`${REGLAS}

Tarea: proponé 6 nichos NUEVOS${tema ? ` dentro de: "${tema}"` : ''}${linea ? `, donde la línea principal sea ${linea}` : ''}. No repitas estos que ya tenemos: ${nichos.map(n => n.nicho).slice(0, 120).join('; ')}.
Para cada uno estimá el puntaje de 1 a 5 en este orden: demanda, ticket posible, facilidad de creación, diferenciación, potencial visual, escalabilidad, posibilidad de bundle, encaje con Orbit. Sé exigente: es una hipótesis sin evidencia.
Respondé SOLO con un array JSON de 6 objetos con esta forma exacta:
[{"nicho":"","comprador":"","dolor":"qué hace hoy a mano, una oración","q":"2-4 palabras para buscar en la Biblioteca de anuncios de Meta","escalera":[{"pieza":"Ancla","nombre":"","linea":"plantilla|sistema|microapp","precio":49,"descripcion":"una oración"},{"pieza":"Entrada","nombre":"","linea":"","precio":19,"descripcion":""},{"pieza":"Complemento","nombre":"","linea":"","precio":12,"descripcion":""}],"scores":[4,3,4,4,4,4,4,4],"riesgo":"una oración","gancho":"un gancho técnico para el anuncio"}]`);
        return res.status(200).json({ ok: true, ideas: (Array.isArray(ideas) ? ideas : []).slice(0, 8).map(limpiarNicho) });
      }
      /* IA: analizar un nicho con los datos cargados */
      case 'analizar': {
        const id = slug(b.id); const n = await kvGet(K.nicho(id));
        if (!n) return res.status(404).json({ error: 'no_existe' });
        const r = await claude(`${REGLAS}

Analizá este nicho con los datos que hay. No inventes anunciantes ni datos de mercado: si falta evidencia, decilo.
Datos: ${JSON.stringify({ nicho: n.nicho, comprador: n.comprador, dolor: n.dolor, anunciantes: n.operadores, escalera: n.escalera, puntaje: n.scores })}
Respondé SOLO con JSON: {"scores":[8 números 1-5],"resumen":"2-3 oraciones: si conviene y por qué","riesgo":"una oración","escalera":[3 objetos {"pieza":"Ancla|Entrada|Complemento","nombre":"","linea":"plantilla|sistema|microapp","precio":0,"descripcion":""}],"claims":false}`, 2000);
        const p = limpiarNicho(r || {});
        const next = { ...n, ...p, resumen: 'IA: ' + (p.resumen || ''), actualizado: ahora() };
        await kvSet(K.nicho(id), next);
        return res.status(200).json({ ok: true, nicho: next });
      }
      default: return res.status(400).json({ error: 'accion_desconocida' });
    }
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message || 'error' });
  }
}
