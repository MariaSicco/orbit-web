/* Mimitos ×  Orbit · lógica compartida (app y ficha pública).
   Funciones puras: fechas, próximas fechas, medicación, alimento, viajes y calendario. */
(function (g) {
  'use strict';
  const DAY = 864e5, HOUR = 36e5;
  const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  const pd = s => { if (!s) return null; const [y, m, d] = s.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const isoLocal = d => `${iso(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const fmt = (s, o) => { const d = typeof s === 'string' ? pd(s) : s; return d ? d.toLocaleDateString('es-AR', o || { day: 'numeric', month: 'short', year: 'numeric' }) : '—'; };
  const fmtTime = d => d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const fmtWhen = d => {
    const t = today(), dd = new Date(d); dd.setHours(0, 0, 0, 0);
    const diff = Math.round((dd - t) / DAY);
    const day = diff === 0 ? 'hoy' : diff === 1 ? 'mañana' : diff === -1 ? 'ayer' : fmt(d, { day: 'numeric', month: 'short' });
    return `${day} ${fmtTime(d)}`;
  };
  const money = n => (Number(n) || 0).toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const TYPE = { vacuna: 'Vacuna', desparasitacion: 'Antiparasitario', control: 'Control', otro: 'Otro' };
  const EXP = { alimento: 'Alimento', veterinaria: 'Veterinaria', salud: 'Remedios y pipetas', peluqueria: 'Baño y peluquería', accesorios: 'Accesorios', otros: 'Otros' };
  const species = p => p.species === 'otra' ? (p.speciesOther || 'Mascota') : p.species === 'perro' ? 'Perro' : 'Gato';

  function age(birth) {
    const b = pd(birth); if (!b) return '';
    const t = today(); let m = (t.getFullYear() - b.getFullYear()) * 12 + t.getMonth() - b.getMonth(); if (t.getDate() < b.getDate()) m--;
    if (m < 0) return '';
    if (m < 12) return `${m} ${m === 1 ? 'mes' : 'meses'}`;
    const y = Math.floor(m / 12); return `${y} ${y === 1 ? 'año' : 'años'}`;
  }
  function status(next) {
    const d = pd(next); if (!d) return null;
    const days = Math.round((d - today()) / DAY);
    if (days < 0) return { c: 'st-late', t: days === -1 ? 'Venció ayer' : `Venció hace ${-days} días`, days };
    if (days === 0) return { c: 'st-soon', t: 'Hoy', days };
    if (days <= 14) return { c: 'st-soon', t: days === 1 ? 'Mañana' : `En ${days} días`, days };
    return { c: 'st-ok', t: fmt(next), days };
  }
  /* lo último de cada tipo + nombre manda: si ya cargaste la vacuna de este año, la del año pasado no vence */
  /* la regla vive en mascotas-rules.js: la usa también el cron de avisos */
  const R = g.MZRULES;
  function upcoming(p) { return R.dueRecords(p.records).map(r => ({ pet: p, r, s: status(r.next) })); }

  /* ---------- medicación ---------- */
  function medState(m, log, now = new Date()) {
    if (!m.start) return { state: 'nostart' };
    const s = new Date(m.start), every = m.every * HOUR;
    const end = m.days ? s.getTime() + m.days * DAY : Infinity;
    const total = m.days ? Math.max(1, Math.round(m.days * 24 / m.every)) : null;
    if (now < s) return { state: 'soon', next: s, total, done: 0 };
    if (now.getTime() >= end) return { state: 'ended', total };
    const k = Math.floor((now - s) / every);
    const due = new Date(s.getTime() + k * every);
    const win = Math.min(every * 0.25, 3 * HOUR);
    const given = (log || []).filter(l => l.kind === 'med' && l.medId === m.id);
    const last = given.length ? given[given.length - 1] : null;
    const ok = given.some(l => Date.parse(l.at) >= due - win);
    const nextT = due.getTime() + every;
    const next = nextT < end ? new Date(nextT) : null;
    if (ok) return { state: 'ok', due, next, last, total, done: k + 1 };
    return { state: now - due > HOUR ? 'late' : 'due', due, next, last, total, done: k };
  }

  /* ---------- alimento ---------- */
  /* la duración sale de mascotas-rules.js (la misma que usa el cron): aprendida de las bolsas o por gramos */
  function food(f) {
    const L = R.foodLearn(f); if (!L || !L.days) return null;
    const end = pd(L.end), left = Math.round((end - today()) / DAY);
    const buy = new Date(end.getTime() - 3 * DAY);
    return { days: L.days, end, left, buy, pct: Math.max(0, Math.min(1, left / L.days)), src: L.src, n: L.n, opened: L.opened, bagKg: L.bagKg, perDay: L.perDay, bags: L.bags };
  }
  /* "Compré / abrí bolsa nueva": suma la bolsa y deja la ficha al día. Devuelve cómo deshacer */
  function addBag(p, b) {
    const f = p.food = p.food || {};
    const before = JSON.stringify(f);
    f.bags = (Array.isArray(f.bags) ? f.bags : []).filter(x => x.date !== b.date);
    /* la primera vez, la bolsa que ya estaba abierta (docs viejos) entra al historial */
    if (!f.bags.length && f.opened && f.opened < b.date) f.bags.push({ date: f.opened, kg: f.bagKg || null, brand: f.brand || '', price: null });
    /* cat: id del catálogo de alimentos (opcional); refPrice/refStore/refDate: el precio de referencia que vio al elegirla */
    const ref = b.cat ? { cat: String(b.cat), ...(b.refPrice ? { refPrice: b.refPrice, refStore: b.refStore || '', refDate: b.refDate || '' } : {}) } : {};
    f.bags.push({ date: b.date, kg: b.kg || null, brand: b.brand || '', price: b.price || null, ...ref });
    f.bags.sort((x, y) => x.date.localeCompare(y.date)); f.bags = f.bags.slice(-50);
    if (!f.opened || b.date >= f.opened) { f.opened = b.date; if (b.kg) f.bagKg = b.kg; if (b.brand) f.brand = b.brand; }
    return () => { const o = JSON.parse(before); for (const k of Object.keys(f)) delete f[k]; Object.assign(f, o); };
  }
  /* al cargar un gasto de alimento: ¿abrió una bolsa nueva? Lo prellenado, o null si no corresponde preguntar */
  function bagPrompt(p, e) {
    if (!e || e.cat !== 'alimento' || !e.date) return null;
    const f = p.food || {};
    if ((f.bags || []).some(b => b.date === e.date) || f.opened === e.date) return null;
    const last = R.bagsOf(f).at(-1) || {};
    return { date: e.date, kg: last.kg || f.bagKg || null, brand: last.brand || f.brand || '', price: e.amount || null };
  }
  /* gastos de alimento: este mes, promedio de los meses con gasto (hasta 6) y costo por día */
  function foodSpend(p, ym) {
    const by = {}; for (const e of p.expenses || []) if (e.cat === 'alimento' && e.date) by[e.date.slice(0, 7)] = (by[e.date.slice(0, 7)] || 0) + (Number(e.amount) || 0);
    const months = Object.keys(by).filter(k => k <= ym).sort().slice(-6);
    const f = food(p.food);
    return { month: by[ym] || 0, avg: months.length ? months.reduce((a, k) => a + by[k], 0) / months.length : 0, months: months.length, perDay: f?.perDay || 0, byMonth: by };
  }

  /* ---------- viajes (información general, se confirma en SENASA) ---------- */
  const DEST = { uruguay: 'Uruguay', brasil: 'Brasil', paraguay: 'Paraguay', chile: 'Chile', bolivia: 'Bolivia', otro: 'Otro país' };
  const MERCOSUR = ['uruguay', 'brasil', 'paraguay'];
  function trip(p) {
    const t = p.trip || {}; if (!t.dest || !t.date) return null;
    const date = pd(t.date), daysTo = Math.round((date - today()) / DAY);
    const rab = (p.records || []).filter(r => r.type === 'vacuna' && /rrab|rabia|rabic/i.test(String(r.name).normalize('NFD').replace(/[\u0300-\u036f]/g, ''))).sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0];
    const items = [];
    if (!rab) items.push({ st: 'no', t: 'Antirrábica vigente', d: 'No la tenés cargada. Es obligatoria para salir del país: pedile la constancia a tu veterinario.' });
    else if (rab.next && rab.next < t.date) items.push({ st: 'no', t: 'Antirrábica vigente', d: `Vence el ${fmt(rab.next)}, antes del viaje. Hablá con tu veterinario para renovarla a tiempo.` });
    else items.push({ st: 'ok', t: 'Antirrábica vigente', d: rab.next ? `Vigente hasta el ${fmt(rab.next)}.` : `Aplicada el ${fmt(rab.date)}. Confirmá la vigencia con tu veterinario.` });
    if (t.dest === 'uruguay') {
      items.push(p.chip ? { st: 'ok', t: 'Microchip', d: `Cargado: ${p.chip}.` } : { st: 'no', t: 'Microchip', d: 'Uruguay lo exige y no tenés uno cargado.' });
      items.push({ st: 'todo', t: 'Test de leishmaniasis', d: 'Uruguay lo exige. Consultá con tu veterinario cuándo hacerlo.' });
    }
    items.push({ st: 'todo', t: 'Certificado de salud de tu veterinario', d: 'Lo firma un veterinario matriculado. Pedilo cerca de la fecha: el plazo depende del destino.' });
    const cviBy = new Date(date.getTime() - 7 * DAY);
    items.push({ st: 'todo', t: 'Certificado Veterinario Internacional (SENASA)', d: `Con el certificado de salud, tramitalo en SENASA. La versión digital tarda hasta 96 horas hábiles: empezá antes del ${fmt(cviBy)}. ${MERCOSUR.includes(t.dest) ? 'Para Brasil, Paraguay y Uruguay vale 60 días.' : 'Fuera del Mercosur vale entre 2 y 30 días según el destino.'} No se puede extender.` });
    items.push({ st: 'todo', t: 'Requisitos de la aerolínea o el transporte', d: 'Cada empresa pide cosas distintas (transportadora, peso, cupo). Consultalos antes de sacar el pasaje.' });
    return { dest: DEST[t.dest] || t.dest, date, daysTo, items };
  }

  /* ---------- calendario (.ics) ---------- */
  const icsEsc = s => String(s).replace(/[\\;,]/g, m => '\\' + m).replace(/\n/g, '\\n');
  const stampNow = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const dt = d => isoLocal(d).replace(/[-:]/g, '') + '00';
  function vevent(o) {
    const L = ['BEGIN:VEVENT', `UID:${o.uid}@orbitando.com.ar`, `DTSTAMP:${stampNow()}`];
    if (o.allDay) { const n = new Date(o.start); n.setDate(n.getDate() + 1); L.push(`DTSTART;VALUE=DATE:${iso(o.start).replace(/-/g, '')}`, `DTEND;VALUE=DATE:${iso(n).replace(/-/g, '')}`); }
    else { const e = new Date(o.start.getTime() + 15 * 60000); L.push(`DTSTART:${dt(o.start)}`, `DTEND:${dt(e)}`); }
    if (o.rrule) L.push(`RRULE:${o.rrule}`);
    L.push(`SUMMARY:${icsEsc(o.title)}`, `DESCRIPTION:${icsEsc(o.desc || 'Mimitos')}`);
    for (const a of o.alarms || []) L.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEsc(o.title)}`, `TRIGGER:${a}`, 'END:VALARM');
    L.push('END:VEVENT');
    return L.join('\r\n');
  }
  const ics = events => ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Orbit//Mimitos//ES', 'CALSCALE:GREGORIAN', ...events.map(vevent), 'END:VCALENDAR'].join('\r\n');
  /* día completo: los avisos son relativos a las 00:00 del día. -P2DT15H = 9:00 de 3 días antes; PT9H = 9:00 del día */
  function recordEvent(pet, r) {
    const sug = R.isSug(r);
    return { uid: `${pet.id}-${r.id}-${r.next}`, allDay: true, start: pd(r.next), title: `${pet.name}: ${r.name || TYPE[r.type]}${sug ? ' (sugerida, confirmala con tu veterinario)' : ''}`, desc: sug ? `Fecha sugerida: es una referencia general, confirmala con tu veterinario. ${TYPE[r.type]} · Mimitos` : `${TYPE[r.type]} · Mimitos`, alarms: ['-P2DT15H', 'PT9H'] };
  }
  function medEvent(pet, m) {
    const s = new Date(m.start), h = m.every;
    const rrule = h % 168 === 0 ? `FREQ=WEEKLY;INTERVAL=${h / 168}` : h % 24 === 0 ? `FREQ=DAILY;INTERVAL=${h / 24}` : `FREQ=HOURLY;INTERVAL=${h}`;
    const count = m.days ? Math.max(1, Math.round(m.days * 24 / h)) : Math.min(500, Math.round(365 * 24 / h));
    return { uid: `${pet.id}-med-${m.id}`, start: s, rrule: `${rrule};COUNT=${count}`, title: `${pet.name}: ${m.name}${m.dose ? ' (' + m.dose + ')' : ''}`, desc: 'Medicación · Mimitos', alarms: ['PT0M'] };
  }
  function foodEvent(pet, f) {
    const st = food(f); if (!st) return null;
    return { uid: `${pet.id}-food-${f.opened}`, allDay: true, start: st.buy, title: `Comprar alimento de ${pet.name}`, desc: `Se termina alrededor del ${fmt(st.end)}.`, alarms: ['PT9H'] };
  }

  /* ---------- calendario sugerido ----------
     Referencia general por especie y etapa (cachorro: menos de 12 meses). NO es una indicación médica:
     arma fechas de partida que la persona edita y confirma con su veterinario.
     first = en cuántos días proponer la fecha si no hay una aplicación anterior cargada; every = cada cuántos meses. */
  const SCHEDULE = {
    perro: {
      cachorro: [
        { type: 'vacuna', name: 'Séxtuple', every: 1, first: 21, note: 'En cachorros suelen ser varias dosis, separadas por 3 o 4 semanas.' },
        { type: 'vacuna', name: 'Antirrábica', every: 12, first: 30, note: 'Suele aplicarse a partir de los 3 meses.' },
        { type: 'desparasitacion', name: 'Antiparasitario interno', every: 1, first: 15, note: 'En cachorros suele ser más seguido.' },
        { type: 'desparasitacion', name: 'Pipeta antipulgas', every: 1, first: 30 },
        { type: 'control', name: 'Control de cachorro', every: 1, first: 30 },
      ],
      adulto: [
        { type: 'vacuna', name: 'Antirrábica', every: 12, first: 30 },
        { type: 'vacuna', name: 'Séxtuple', every: 12, first: 30, note: 'Refuerzo anual.' },
        { type: 'desparasitacion', name: 'Antiparasitario interno', every: 3, first: 30 },
        { type: 'desparasitacion', name: 'Pipeta antipulgas', every: 1, first: 30 },
        { type: 'control', name: 'Control anual', every: 12, first: 60 },
      ],
    },
    gato: {
      cachorro: [
        { type: 'vacuna', name: 'Triple felina', every: 1, first: 21, note: 'En cachorros suelen ser varias dosis, separadas por 3 o 4 semanas.' },
        { type: 'vacuna', name: 'Antirrábica', every: 12, first: 30, note: 'Suele aplicarse a partir de los 3 meses.' },
        { type: 'desparasitacion', name: 'Antiparasitario interno', every: 1, first: 15, note: 'En cachorros suele ser más seguido.' },
        { type: 'control', name: 'Control de cachorro', every: 1, first: 30 },
      ],
      adulto: [
        { type: 'vacuna', name: 'Triple felina', every: 12, first: 30, note: 'Refuerzo anual.' },
        { type: 'vacuna', name: 'Antirrábica', every: 12, first: 30 },
        { type: 'desparasitacion', name: 'Antiparasitario interno', every: 3, first: 30 },
        { type: 'desparasitacion', name: 'Pipeta antipulgas', every: 1, first: 30 },
        { type: 'control', name: 'Control anual', every: 12, first: 60 },
      ],
    },
    otra: { cachorro: [{ type: 'control', name: 'Control', every: 6, first: 30 }], adulto: [{ type: 'control', name: 'Control anual', every: 12, first: 60 }] },
  };
  function stage(p) {
    const b = pd(p.birth); if (!b) return 'adulto';
    const t = today(); let m = (t.getFullYear() - b.getFullYear()) * 12 + t.getMonth() - b.getMonth(); if (t.getDate() < b.getDate()) m--;
    return m >= 0 && m < 12 ? 'cachorro' : 'adulto';
  }
  const addMonths = (s, n) => { const d = pd(s); if (!d) return ''; const day = d.getDate(); const x = new Date(d.getFullYear(), d.getMonth() + n, 1); x.setDate(Math.min(day, new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate())); return iso(x); };
  const inDays = n => { const x = today(); x.setDate(x.getDate() + n); return iso(x); };
  /* lo sugerido para esta mascota, sin lo que ya tiene con próxima fecha cargada */
  function suggested(p) {
    const st = stage(p), list = (SCHEDULE[p.species] || SCHEDULE.otra)[st];
    const key = (t, n) => t + '|' + String(n || '').toLowerCase().trim();
    const have = new Set((p.records || []).filter(r => r.next).map(r => key(r.type, r.name)));
    return list.filter(x => !have.has(key(x.type, x.name))).map(x => {
      const last = (p.records || []).filter(r => key(r.type, r.name) === key(x.type, x.name) && r.date).sort((a, b) => b.date.localeCompare(a.date))[0];
      let next = last ? addMonths(last.date, x.every) : inDays(x.first);
      if (next < iso(today())) next = inDays(7);
      return { ...x, stage: st, next };
    });
  }

  /* un registro del calendario sugerido: tiene próxima fecha, todavía no fecha de aplicación, y la marca en las notas */
  const { SUG_NOTE, isSug } = R;

  /* ---------- "Ya se la di": cerrar una fecha vencida, de hoy o de los próximos 14 días ----------
     Crea la dosis nueva (el último registro manda, mascotas-rules.js), así la vieja queda "Renovada"
     y el cron deja de avisar por ella. Una fecha del calendario sugerido (sin aplicar) se completa en el lugar. */
  const RENEW_DAYS = 14;
  const renewable = r => { const s = r && status(r.next); return Boolean(s && s.days <= RENEW_DAYS); };
  const renewLabel = r => r.type === 'vacuna' ? 'Ya se la di' : r.type === 'desparasitacion' ? 'Ya se la puse' : 'Ya fue';
  const notYetLabel = r => r.type === 'vacuna' ? 'No se la di todavía' : r.type === 'desparasitacion' ? 'No se la puse todavía' : 'No fue todavía';
  const monthsBetween = (a, b) => { const x = pd(a), y = pd(b); return x && y ? Math.max(1, Math.round((y - x) / (30.44 * DAY))) : 0; };
  const nameKey = n => String(n || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  /* cada cuántos meses: el intervalo de la dosis anterior; si no hay, el del calendario sugerido por especie y edad */
  function renewGap(p, r) {
    if (r.date && r.next && !isSug(r)) return { months: monthsBetween(r.date, r.next), src: 'anterior' };
    const prev = (p.records || []).filter(x => x !== r && x.type === r.type && nameKey(x.name) === nameKey(r.name) && x.date && x.next && !isSug(x)).sort((a, b) => b.date.localeCompare(a.date))[0];
    if (prev) return { months: monthsBetween(prev.date, prev.next), src: 'anterior' };
    const sch = ((SCHEDULE[p.species] || SCHEDULE.otra)[stage(p)] || []).find(x => x.type === r.type && nameKey(x.name) === nameKey(r.name));
    return sch ? { months: sch.every, src: 'calendario' } : { months: 0, src: '' };
  }
  /* lo que la hoja trae prellenado */
  function renewPlan(p, r, date = iso(today())) {
    const g = renewGap(p, r);
    return { type: r.type, name: r.name, scope: r.scope || '', date, next: g.months ? addMonths(date, g.months) : '', gap: g.months, src: g.src, vet: r.vet || p.vet?.name || '', lot: r.lot || '' };
  }
  function renewCheck(r, v) {
    const t = iso(today());
    if (!v.date) return 'Elegí cuándo fue.';
    if (v.date > t) return 'La fecha no puede ser futura. Si todavía no pasó, usá "Posponer".';
    if (r.date && v.date < r.date && !isSug(r)) return `Esa fecha es anterior a la dosis que ya tenías (${fmt(r.date)}).`;
    if (v.next && v.next <= v.date) return 'La próxima tiene que ser después de la fecha de hoy.';
    return '';
  }
  /* aplica y devuelve { rec, undo } */
  function applyRenew(p, r, v, id) {
    const vals = { date: v.date, next: v.next || '', vet: v.vet || '', lot: v.lot || '' };
    if (isSug(r)) {
      const snap = { ...r };
      Object.assign(r, vals, { notes: '', sticker: v.sticker || r.sticker || '' });
      return { rec: r, undo: () => { for (const k of Object.keys(r)) delete r[k]; Object.assign(r, snap); } };
    }
    const rec = { id, type: r.type, name: r.name, scope: r.scope || '', ...vals, notes: '', sticker: v.sticker || '' };
    p.records.push(rec);
    return { rec, undo: () => { const i = p.records.indexOf(rec); if (i >= 0) p.records.splice(i, 1); } };
  }
  /* "No se la di todavía": corre la próxima fecha del registro vigente, sin crear una dosis */
  function postpone(r, next) { const old = r.next; r.next = next; return () => { r.next = old; }; }
  /* "la Antirrábica", "la Pipeta antipulgas", "el Control anual" */
  const art = r => (r.type === 'vacuna' || /a$/i.test(String(r.name || '').trim().split(/\s+/)[0]) ? 'la ' : 'el ') + (r.name || TYPE[r.type]);

  /* ---------- íconos (línea, puntas redondeadas) ---------- */
  const P = {
    paw: '<circle cx="7" cy="9" r="1.9"/><circle cx="12" cy="6.5" r="1.9"/><circle cx="17" cy="9" r="1.9"/><path d="M12 12c-3 0-5.5 3.2-5.5 5.6 0 1.6 1.3 2.4 2.8 2.4 1 0 1.8-.5 2.7-.5s1.7.5 2.7.5c1.5 0 2.8-.8 2.8-2.4C17.5 15.2 15 12 12 12z"/>',
    dog: '<path d="M8.2 6.4C6.6 4.9 4 5.3 3.5 7.4s.4 4.6 2 4.8"/><path d="M15.8 6.4c1.6-1.5 4.2-1.1 4.7 1s-.4 4.6-2 4.8"/><path d="M6.5 9.2c0-2.2 2.5-3.7 5.5-3.7s5.5 1.5 5.5 3.7v4.3a5.5 5.5 0 0 1-11 0z"/><circle cx="9.7" cy="11.3" r=".7"/><circle cx="14.3" cy="11.3" r=".7"/><path d="M10.8 14.2h2.4L12 15.5z"/><path d="M12 15.5v1.3"/>',
    cat: '<path d="M5 13V5l4 3h6l4-3v8a7 7 0 0 1-14 0z"/><circle cx="9.3" cy="12" r=".6"/><circle cx="14.7" cy="12" r=".6"/><path d="M11 15h2l-1 1z"/><path d="M3 14.5h4M3 17h4M17 14.5h4M17 17h4"/>',
    syringe: '<path d="m18 2 4 4"/><path d="m17 7 3-3"/><path d="M19 9 9 19l-4 1 1-4L16 6z"/><path d="m9 11 4 4"/><path d="m12 8 4 4"/>',
    drop: '<path d="M12 3s6 6.4 6 11a6 6 0 0 1-12 0c0-4.6 6-11 6-11z"/><path d="M9.5 14.5a2.5 2.5 0 0 0 2.5 2.5"/>',
    heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/><path d="M8.5 11h2l1-2 1.5 4 1-2h1.5"/>',
    pill: '<path d="M4.9 12.7 12.7 4.9a4.5 4.5 0 0 1 6.4 6.4l-7.8 7.8a4.5 4.5 0 0 1-6.4-6.4z"/><path d="m8.8 8.8 6.4 6.4"/>',
    bowl: '<path d="M3 12h18a9 6 0 0 1-18 0z"/><path d="M7 12c0-2 1.5-3.5 3-3.5M12 12c0-2.5 1.5-4.5 3.5-4.5"/><path d="M8 19h8"/>',
    wallet: '<rect x="3" y="6" width="18" height="13" rx="3"/><path d="M3 10h18"/><circle cx="16.5" cy="14.5" r="1.2"/><path d="M7 6V4.5h9V6"/>',
    plane: '<path d="M10.5 13.5 4 12l-1.5-2 3 .5L8 8 6 3h2.5l5 6.5 4.5-1.5c1.5-.5 3 .5 3 1.5s-1.3 1.5-2.5 2L12 14l-1.5 6H8l1-5.5"/>',
    qr: '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><path d="M14 14h2v2h-2zM18 18h2v2h-2zM14 18h2M18 14h2v2"/>',
    hand: '<path d="M7 12V6.5a1.5 1.5 0 0 1 3 0V11"/><path d="M10 10V5a1.5 1.5 0 0 1 3 0v5"/><path d="M13 10V6a1.5 1.5 0 0 1 3 0v6"/><path d="M16 11.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7h-.5A6.5 6.5 0 0 1 5 15.5L4 12.5a1.5 1.5 0 0 1 2.7-1.2L8 13"/>',
    search: '<circle cx="11" cy="11" r="6"/><path d="m20 20-4.2-4.2"/><path d="M11 8v3l2 1.5"/>',
    doc: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
    cal: '<rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4M12 13v4M10 15h4"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    female: '<circle cx="12" cy="9" r="5"/><path d="M12 14v7M9 18h6"/>',
    male: '<circle cx="10" cy="14" r="5"/><path d="M13.5 10.5 19 5M14.5 5H19v4.5"/>',
    pin: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
    chat: '<path d="M4 5h16v11H9l-5 4z"/>',
    phone: '<path d="M5 4h3l2 5-2.5 1.5a11 11 0 0 0 6 6L15 14l5 2v3a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    alert: '<path d="M12 8v5M12 16.5v.5"/><circle cx="12" cy="12" r="9"/>',
    note: '<path d="M5 4h14v11l-5 5H5z"/><path d="M14 20v-5h5M8 9h8M8 12.5h5"/>',
    walk: '<circle cx="13" cy="4.5" r="1.8"/><path d="m9 21 2.5-6 2.5 2.5V21"/><path d="M8 11.5 10 8l3.5.5 2 3 2.5 1"/><path d="m11.5 15 1.5-6"/>',
    edit: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
    back: '<path d="M15 5l-7 7 7 7"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    mail: '<rect x="3.5" y="5.5" width="17" height="13" rx="2.5"/><path d="m4.5 7 7.5 6 7.5-6"/>',
    piggy: '<path d="M19 11c0-3.3-3.1-5.5-7-5.5S4 8 4 11c0 1.7.8 3.1 2 4.2V19h3v-2h5v2h3v-3.6c.9-.7 1.6-1.6 2-2.4h1.5V10H19"/><circle cx="15.5" cy="10" r=".6"/><path d="M9.5 6.2 8 3.5"/>',
    share: '<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.6-4.6M8.2 13.2l7.6 4.6"/>',
    home: '<path d="M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1z"/>',
    /* "Me fui": la casa con la puerta abierta */
    away: '<path d="M4 11 12 4l8 7v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/><path d="M9.5 20v-7h5v7"/><path d="m9.5 13 3.8 1.8V20"/>',
    camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
    flask: '<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3"/><path d="M7.5 15h9"/>',
    steth: '<path d="M6 3v5a4 4 0 0 0 8 0V3"/><path d="M10 12v3a5 5 0 0 0 10 0v-1"/><circle cx="20" cy="12" r="2"/>',
    scalpel: '<path d="M3 21 14 10l3 3-6 6z"/><path d="m14 10 6-6 1 1-4 8"/>',
    scale: '<rect x="4" y="5" width="16" height="15" rx="4"/><path d="M9 10a3 3 0 0 1 6 0M12 10l1.5-1.5"/>',
    sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
    more: '<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>',
    chevron: '<path d="m9 5 7 7-7 7"/>',
    file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
    book: '<path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5z"/><path d="M5 19.5A1.5 1.5 0 0 0 6.5 21H19v-3"/><path d="M12 7.5v5M9.5 10h5"/>',
    grid: '<rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 17h.01M12 17h.01"/>',
    user: '<circle cx="12" cy="8.5" r="3.5"/><path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5"/>',
    bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
    trash: '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13"/><path d="M10 11v5M14 11v5"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    print: '<path d="M7 9V3.5h10V9"/><rect x="3.5" y="9" width="17" height="8" rx="2"/><path d="M7 14h10v6.5H7z"/>',
    next: '<path d="m9 5 7 7-7 7"/>',
    filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
    logout: '<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"/><path d="M10 16l-4-4 4-4M6 12h10"/>',
    shield: '<path d="M12 3.5 19 6v5.5c0 4.2-2.9 7.7-7 9-4.1-1.3-7-4.8-7-9V6z"/><path d="m9 12 2 2 4-4"/>',
    download: '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5"/><path d="M5 19.5h14"/>',
    star: '<path d="m12 4 2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 16.4 7.2 18.9l.9-5.4-3.9-3.8 5.4-.8z"/>',
    sticker: '<path d="M14.5 20H7a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v7.5z"/><path d="M14.5 20v-3.5a2 2 0 0 1 2-2H20"/>',
    vomit: '<path d="M7 9a5 5 0 0 1 10 0c0 2.2-1.4 3.6-3 4.4"/><path d="M9.5 8.5h.01M14.5 8.5h.01"/><path d="M12 13v2.5"/><path d="M12 15.5s-2.5 2.2-2.5 3.7a2.5 2.5 0 0 0 5 0c0-1.5-2.5-3.7-2.5-3.7z"/>',
    poop: '<path d="M7.5 19.5h9a3 3 0 0 0 .9-5.9 3 3 0 0 0-2.9-3.9 2.6 2.6 0 0 0-2.2-4.2c.2 1.6-2.3 2-2.3 4.2a3 3 0 0 0-2.7 3.9 3 3 0 0 0 .2 5.9z"/>',
    scratch: '<path d="M6 4.5c1.5 5 1.5 10 0 15M11 3.5c1.6 5.5 1.6 11.5 0 17M16 4.5c1.5 5 1.5 10 0 15"/>',
    bandage: '<rect x="2.5" y="8.5" width="19" height="7" rx="3.5" transform="rotate(-45 12 12)"/><path d="M10.6 10.6h.01M13.4 13.4h.01M10.6 13.4h.01M13.4 10.6h.01"/>',
    cough: '<path d="M3.5 9h9a2.5 2.5 0 1 0-2.5-2.5"/><path d="M3.5 13h14a2.5 2.5 0 1 1-2.5 2.5"/><path d="M3.5 17h6"/>',
    limp: '<path d="M8 21l2-6-2-4 2-5"/><path d="M14 21l-1-6 3-3-1-5"/><circle cx="12" cy="4" r="1.6"/>',
    mood: '<circle cx="12" cy="12" r="8.5"/><path d="M9 10h.01M15 10h.01"/><path d="M8.5 15.5c1-1 2-1 3 0s2 1 3 0"/>',
    video: '<rect x="3" y="6" width="13" height="12" rx="2.5"/><path d="m16 10.5 5-3v9l-5-3"/>',
    wifi: '<path d="M3 3l18 18"/><path d="M8.5 16.5a5 5 0 0 1 7 0M5 12.5a10 10 0 0 1 4-2.3M15 10.2a10 10 0 0 1 4 2.3"/><path d="M12 20h.01"/>',
  };
  const icon = (n, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${P[n] || P.paw}</svg>`;
  const petIcon = p => icon(p.species === 'gato' ? 'cat' : p.species === 'perro' ? 'dog' : 'paw');
  const TONES = ['comida', 'viaje', 'salud', 'med', 'cuida', 'plata'];
  const tone = p => { let h = 0; for (const ch of String(p.id || p.name || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return TONES[h % TONES.length]; };
  const recIcon = t => ({ vacuna: 'syringe', desparasitacion: 'drop', control: 'heart', otro: 'note' })[t] || 'note';

  /* ---------- historia clínica ---------- */
  /* Antecedentes frecuentes para elegir rápido en el alta. Son nombres para registrar lo que dijo
     el veterinario, no un diagnóstico de la app. */
  const CONDITIONS = {
    perro: ['Otitis', 'Alergia o dermatitis', 'Problemas digestivos', 'Parvovirus', 'Moquillo', 'Ehrlichiosis (garrapata)', 'Leishmaniasis', 'Displasia de cadera', 'Problemas de columna', 'Epilepsia o convulsiones', 'Problemas de riñón', 'Problemas de corazón', 'Diabetes', 'Sobrepeso'],
    gato: ['Problemas urinarios o cistitis', 'Enfermedad renal', 'Rinotraqueítis o gripe felina', 'Leucemia felina (FeLV)', 'Inmunodeficiencia felina (FIV)', 'Alergia o dermatitis', 'Problemas digestivos', 'Hipertiroidismo', 'Diabetes', 'Problemas dentales', 'Sobrepeso'],
    otra: ['Problemas de piel', 'Problemas digestivos', 'Problemas respiratorios', 'Problemas dentales', 'Sobrepeso'],
  };
  const BREEDS = { perro: ["Mestizo", "Akita Inu", "Alaskan Malamute", "American Bully", "Basenji", "Basset Hound", "Beagle", "Bichón Frisé", "Bichón Maltés", "Bloodhound", "Border Collie", "Boston Terrier", "Bóxer", "Boyero de Berna", "Braco Alemán", "Bull Terrier", "Bulldog Francés", "Bulldog Inglés", "Bullmastiff", "Cane Corso", "Caniche Toy", "Caniche Mini", "Caniche Estándar", "Cavalier King Charles", "Chihuahua", "Chow Chow", "Cimarrón Uruguayo", "Cocker Spaniel Inglés", "Cocker Spaniel Americano", "Collie", "Dachshund (Salchicha)", "Dálmata", "Doberman", "Dogo Argentino", "Dogo de Burdeos", "Fila Brasileiro", "Fox Terrier", "Galgo", "Golden Retriever", "Gran Danés", "Husky Siberiano", "Jack Russell Terrier", "Labrador Retriever", "Lhasa Apso", "Mastín Napolitano", "Ovejero Alemán", "Ovejero Belga", "Pastor Australiano", "Pastor Blanco Suizo", "Pekinés", "Pinscher Miniatura", "Pit Bull", "Pointer", "Pomerania", "Pug", "Rottweiler", "Samoyedo", "San Bernardo", "Schnauzer Miniatura", "Schnauzer Estándar", "Schnauzer Gigante", "Setter Irlandés", "Shar Pei", "Shiba Inu", "Shih Tzu", "Springer Spaniel", "Staffordshire Bull Terrier", "Teckel", "Terranova", "Vizsla", "Weimaraner", "West Highland Terrier", "Whippet", "Yorkshire Terrier"], gato: ["Común europeo (mestizo)", "Abisinio", "American Shorthair", "Angora Turco", "Azul Ruso", "Bengalí", "Birmano", "Bombay", "British Shorthair", "Burmés", "Cornish Rex", "Devon Rex", "Esfinge (Sphynx)", "Exótico de pelo corto", "Himalayo", "Maine Coon", "Manx", "Munchkin", "Bosque de Noruega", "Oriental", "Persa", "Ragdoll", "Savannah", "Scottish Fold", "Siamés", "Siberiano", "Somalí", "Van Turco"], otra: [] };
  const SURGERIES = ['Castración', 'Limpieza dental o extracción', 'Extracción de un bulto o tumor', 'Fractura', 'Cirugía de ojos', 'Cesárea'];
  const STUDY = { sangre: 'Análisis de sangre', orina: 'Análisis de orina', materia: 'Análisis de materia fecal', rx: 'Radiografía', eco: 'Ecografía', otro: 'Otro estudio' };
  /* ---------- "+ Algo pasó": registro rápido de lo que le pasa en el día a día ----------
     Vive en p.symptoms (el mismo lugar que "Algo que notaste"), con campos opcionales:
     { id, date, text, kind?, at?, sev?, media?: [{ ref, type, name, thumb? }], check?, res? }.
     Las anotaciones viejas ({ id, date, text }) siguen andando igual: sin kind son una nota libre.
     Mimitos solo lo anota: nunca diagnostica ni sugiere tratamientos. */
  const ALGO = [['vomito', 'Vómito', 'vomit'], ['diarrea', 'Diarrea', 'poop'], ['picazon', 'Picazón', 'scratch'], ['herida', 'Herida', 'bandage'], ['nocomio', 'No comió', 'bowl'], ['tos', 'Tos o estornudos', 'cough'], ['cojea', 'Cojea', 'limp'], ['raro', 'Comportamiento raro', 'mood'], ['otro', 'Otro', 'note']];
  const ALGO_L = Object.fromEntries(ALGO.map(([k, l]) => [k, l]));
  const ALGO_I = Object.fromEntries(ALGO.map(([k, , i]) => [k, i]));
  const SEV = { leve: 'Leve', moderada: 'Moderada', fuerte: 'Fuerte' };
  const ALGO_NOTE = 'Mimitos solo lo anota. Si te preocupa, consultá con tu vete; si es urgente, buscá una guardia.';
  /* video corto: hasta 15 s y 20 MB (el servidor vuelve a mirar el tamaño y el tipo) */
  const VIDEO_MAX_S = 15, VIDEO_MAX_BYTES = 20 * 1024 * 1024;
  const VIDEO_TYPES = /^video\/(mp4|quicktime|webm)$/;
  function videoCheck(v) {
    if (!VIDEO_TYPES.test(v?.type || '')) return 'Ese formato de video no se puede subir. Probá con uno grabado con la cámara del celu.';
    if (!(v.size > 0) || v.size > VIDEO_MAX_BYTES) return `El video pesa más de 20 MB. Grabá uno más corto, de hasta ${VIDEO_MAX_S} segundos.`;
    if (!Number.isFinite(v.dur) || v.dur <= 0) return 'No pudimos leer el video. Probá con otro.';
    if (v.dur > VIDEO_MAX_S + 0.5) return `El video dura ${Math.round(v.dur)} segundos: puede durar hasta ${VIDEO_MAX_S}. Recortalo o grabá uno más corto.`;
    return '';
  }
  /* cuándo pasó: la hora si la hay (hora local AAAA-MM-DDTHH:MM); si no, el mediodía del día */
  const epAt = s => { if (s?.at && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s.at)) { const [d, t] = s.at.split('T'); const [y, m, dd] = d.split('-').map(Number); const [h, mi] = t.split(':').map(Number); return new Date(y, m - 1, dd, h, mi); } const d = pd(s?.date); if (d) d.setHours(12); return d; };
  const epTitle = s => s.kind ? (s.kind === 'otro' && s.text ? s.text : ALGO_L[s.kind] || 'Algo pasó') : s.text;
  const isEp = s => Boolean(s && s.kind);
  /* cuándo, en palabras: "hoy 14:30", "ayer 9:10", "12 oct 18:00" */
  const epWhen = s => s.at ? fmtWhen(epAt(s)) : fmt(s.date, { day: 'numeric', month: 'short' });
  /* las horas rápidas de la hoja: ahora, hace 1 h y hoy a la mañana (9:00, o ahora si todavía no son las 9) */
  function quickAt(k, now = new Date()) {
    const d = new Date(now); d.setSeconds(0, 0);
    if (k === '1h') d.setTime(d.getTime() - HOUR);
    if (k === 'manana') { const m = new Date(d); m.setHours(9, 0, 0, 0); if (m < d) d.setTime(m.getTime()); }
    return isoLocal(d);
  }

  /* ---------- seguimiento: el mismo tipo en las últimas 72 h ---------- */
  const REPEAT_MS = 72 * HOUR;
  const WD = ['el domingo', 'el lunes', 'el martes', 'el miércoles', 'el jueves', 'el viernes', 'el sábado'];
  const dayDiff = (a, b) => { const x = new Date(a), y = new Date(b); x.setHours(0, 0, 0, 0); y.setHours(0, 0, 0, 0); return Math.round((y - x) / DAY); };
  /* "hoy", "ayer", "anteayer" o el día de la semana, contado desde `now` */
  const sinceWord = (d, now = new Date()) => { const n = dayDiff(d, now); return n <= 0 ? 'hoy' : n === 1 ? 'ayer' : n === 2 ? 'anteayer' : n < 7 ? WD[d.getDay()] : 'el ' + fmt(d, { day: 'numeric', month: 'short' }); };
  const episodes = p => (p?.symptoms || []).filter(isEp).sort((a, b) => epAt(a) - epAt(b));
  /* cuántas veces pasó lo mismo en las 72 h que terminan en este episodio (contándolo) y desde cuándo */
  function epRepeat(p, s) {
    const t = epAt(s); if (!t || !isEp(s)) return { n: 1, first: t };
    const same = episodes(p).filter(x => x.kind === s.kind && epAt(x) <= t && t - epAt(x) < REPEAT_MS);
    return { n: Math.max(1, same.length), first: same.length ? epAt(same[0]) : t };
  }
  const ordinal = n => `${n}.ª`;
  /* "Es la 3.ª vez desde ayer" (solo desde la segunda vez) */
  const repeatText = (r, now = new Date()) => r && r.n > 1 ? `Es la ${ordinal(r.n)} vez desde ${sinceWord(r.first, now)}` : '';
  /* para la línea de tiempo: episodios del mismo tipo, cada uno a menos de 72 h del anterior, van juntos */
  function epGroups(p) {
    const open = {}, out = [];
    for (const s of episodes(p)) {
      const g = open[s.kind];
      if (g && epAt(s) - epAt(g.items.at(-1)) < REPEAT_MS) g.items.push(s);
      else { open[s.kind] = { kind: s.kind, items: [s] }; out.push(open[s.kind]); }
    }
    return out.map(g => ({ ...g, last: g.items.at(-1), first: g.items[0], n: g.items.length }));
  }
  /* "¿Sigue igual?": al día siguiente (hasta 2 días después) del último episodio de cada tipo, si pidió que le preguntemos */
  const RES = { igual: 'Sigue igual', mejor: 'Está mejor', paso: 'Ya pasó' };
  function followUps(p, now = new Date()) {
    return epGroups(p).map(g => g.last).filter(s => s.check && !s.res && (d => d >= 1 && d <= 2)(dayDiff(epAt(s), now)));
  }
  /* los últimos 7 días (hoy incluido), de lo más nuevo a lo más viejo, agrupados */
  function lastWeek(p, now = new Date()) {
    return epGroups(p).filter(g => dayDiff(epAt(g.last), now) <= 6 && epAt(g.last) <= now).sort((a, b) => epAt(b.last) - epAt(a.last));
  }

  /* PDF para el veterinario: los grupos de los últimos `days` días, de lo más nuevo a lo más viejo, con sus
     notas, intensidades y hasta 4 fotos o videos por fila */
  function recentEpisodes(p, days = 60, now = new Date(), max = 20) {
    const since = new Date(now); since.setHours(0, 0, 0, 0); since.setTime(since.getTime() - days * DAY);
    return epGroups(p).filter(g => epAt(g.last) >= since && epAt(g.last) <= now).sort((a, b) => epAt(b.last) - epAt(a.last)).slice(0, max).map(g => ({
      ...g, notes: g.items.map(x => x.kind === 'otro' ? '' : x.text).filter(Boolean), sevs: [...new Set(g.items.map(x => SEV[x.sev]).filter(Boolean))],
      media: g.items.flatMap(x => x.media || []).slice(0, 4), hours: g.n > 1 ? Math.max(1, Math.round((epAt(g.last) - epAt(g.first)) / HOUR)) : 0,
    }));
  }

  /* todo lo que le pasó, en una sola línea de tiempo */
  function timeline(p) {
    const ev = [];
    for (const r of p.records || []) if (r.date) ev.push({ k: r.type === 'vacuna' ? 'vacuna' : r.type === 'desparasitacion' ? 'anti' : 'control', date: r.date, title: r.name || TYPE[r.type], sub: [TYPE[r.type], r.vet].filter(Boolean).join(' · '), ref: r, kind: 'rec' });
    for (const v of p.visits || []) ev.push({ k: 'consulta', date: v.date, title: v.reason || 'Consulta', sub: [v.vet, v.findings].filter(Boolean).join(' · '), ref: v, kind: 'visit' });
    for (const x of p.studies || []) ev.push({ k: 'estudio', date: x.date, title: x.title || STUDY[x.kind], sub: [STUDY[x.kind], x.files?.length ? `${x.files.length} archivo${x.files.length > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · '), ref: x, kind: 'study' });
    for (const s of p.symptoms || []) if (!isEp(s)) ev.push({ k: 'sintoma', date: s.date, title: s.text, sub: 'Algo pasó', ref: s, kind: 'sym' });
    /* "+ Algo pasó": el mismo tipo a menos de 72 h del anterior va en una sola entrada ("Vómito · 3 veces") */
    for (const g of epGroups(p)) {
      const s = g.last, nMedia = g.items.reduce((a, x) => a + (x.media?.length || 0), 0);
      const span = g.n > 1 ? (g.first.date === s.date ? `${g.n} veces hoy` : `${g.n} veces, del ${fmt(g.first.date, { day: 'numeric', month: 'short' })} al ${fmt(s.date, { day: 'numeric', month: 'short' })}`) : '';
      ev.push({ k: 'sintoma', date: s.date, at: s.at || '', title: g.n > 1 ? `${epTitle(s)} · ${g.n} veces` : epTitle(s), n: g.n, items: g.items,
        sub: ['Algo pasó', span || (s.at ? fmtTime(epAt(s)) : ''), SEV[s.sev] || '', s.kind === 'otro' ? '' : s.text, RES[s.res] ? 'Al día siguiente: ' + RES[s.res].toLowerCase() : '', nMedia ? `${nMedia} ${nMedia > 1 ? 'adjuntos' : 'adjunto'}` : ''].filter(Boolean).join(' · '), ref: s, kind: 'sym' });
    }
    for (const c of p.surgeries || []) if (/^\d{4}-\d{2}-\d{2}$/.test(c.date || '')) ev.push({ k: 'cirugia', date: c.date, title: c.name, sub: 'Cirugía', ref: c, kind: 'surg' });
    for (const m of p.meds || []) if (m.start) ev.push({ k: 'remedio', date: m.start.slice(0, 10), title: m.name, sub: ['Remedio', m.dose].filter(Boolean).join(' · '), ref: m, kind: 'med' });
    return ev.sort((a, b) => b.date.localeCompare(a.date) || String(b.at || '').localeCompare(String(a.at || '')));
  }
  /* el resumen que un veterinario quiere ver primero */
  function summary(p) {
    const up = upcoming(p);
    const vacc = up.filter(x => x.r.type === 'vacuna'), anti = up.filter(x => x.r.type === 'desparasitacion');
    const lastAnti = (p.records || []).filter(r => r.type === 'desparasitacion' && r.date).sort((a, b) => b.date.localeCompare(a.date))[0];
    /* "Al día" solo con algo cargado de verdad: si todo lo que hay son fechas del calendario sugerido, es "sug" (sin confirmar) */
    const allSug = l => l.every(x => isSug(x.r));
    return {
      vacc: !vacc.length ? 'none' : vacc.some(x => x.s.days < 0) ? 'late' : allSug(vacc) ? 'sug' : 'ok',
      vaccLate: vacc.filter(x => x.s.days < 0), vaccNext: vacc[0] || null,
      anti: !anti.length ? (lastAnti ? 'unknown' : 'none') : anti.some(x => x.s.days < 0) ? 'late' : allSug(anti) ? 'sug' : 'ok', lastAnti, antiNext: anti[0] || null,
      active: (p.conditions || []).filter(c => c.status !== 'resuelta'),
      past: (p.conditions || []).filter(c => c.status === 'resuelta'),
    };
  }

  /* ---------- desparasitación interna o externa ----------
     r.scope manda; si no está (registros viejos), se deduce del nombre */
  const scopeOf = r => r.scope === 'interna' || r.scope === 'externa' ? r.scope
    : /pulga|garrapat|pipeta|collar|extern|spray|sarna/i.test(String(r.name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')) ? 'externa' : 'interna';

  /* ---------- agenda: todo lo que tiene fecha, de todas las mascotas ---------- */
  function agenda(pets) {
    const out = [];
    for (const p of pets || []) {
      for (const x of upcoming(p)) out.push({ date: x.r.next, pet: p, kind: 'rec', r: x.r, s: x.s, title: x.r.name || TYPE[x.r.type], sub: TYPE[x.r.type] });
      const f = food(p.food); if (f) out.push({ date: iso(f.buy), pet: p, kind: 'food', s: status(iso(f.buy)), title: 'Comprar alimento', sub: `Se termina alrededor del ${fmt(f.end, { day: 'numeric', month: 'short' })}` });
      if (p.trip && p.trip.dest && p.trip.date) out.push({ date: p.trip.date, pet: p, kind: 'trip', s: status(p.trip.date), title: `Viaje a ${DEST[p.trip.dest] || p.trip.dest}`, sub: 'Viaje' });
    }
    return out.sort((a, b) => a.date.localeCompare(b.date));
  }

  /* ---------- próximos avisos: misma regla que api/_lib/petpush.js (3 días antes y el día; alimento 5 días antes y el día; chequeo el primer domingo) ---------- */
  const KIND_OF = { vacuna: 'vac', desparasitacion: 'pip', control: 'vac', otro: 'vac' };
  function nextAlerts(pets, off = {}, n = 3) {
    const t = iso(today()), out = [];
    for (const p of pets || []) {
      for (const x of upcoming(p)) {
        const k = KIND_OF[x.r.type] || 'vac'; if (off[k]) continue;
        const d0 = pd(x.r.next), d3 = new Date(d0); d3.setDate(d3.getDate() - 3);
        const sg = isSug(x.r) ? ' (sugerida, confirmala con tu veterinario)' : '';
        for (const [d, early] of [[d3, true], [d0, false]]) if (iso(d) >= t) out.push({ date: iso(d), kind: k, pet: p, text: (early ? `${p.name}: ${x.r.name} en 3 días` : `${p.name}: hoy toca ${x.r.name}`) + sg });
      }
      const f = food(p.food);
      if (f && !off.food) for (const back of [5, 0]) { const d = new Date(f.end); d.setDate(d.getDate() - back); d.setHours(0, 0, 0, 0); if (iso(d) >= t) out.push({ date: iso(d), kind: 'food', pet: p, text: back ? `${p.name}: quedan 5 días de alimento` : `${p.name}: se termina el alimento` }); }
    }
    if (!off.check && (pets || []).length) {
      const d = today(); d.setDate(1);
      for (let i = 0; i < 2; i++) { const m = new Date(d.getFullYear(), d.getMonth() + i, 1); while (m.getDay() !== 0) m.setDate(m.getDate() + 1); if (iso(m) >= t) { out.push({ date: iso(m), kind: 'check', pet: null, text: 'Chequeo del mes' }); break; } }
    }
    return out.sort((a, b) => a.date.localeCompare(b.date)).slice(0, n);
  }

  g.MZ = { recentEpisodes, REPEAT_MS, sinceWord, episodes, epRepeat, repeatText, epGroups, RES, followUps, lastWeek, VIDEO_MAX_S, VIDEO_MAX_BYTES, videoCheck, ALGO, ALGO_L, ALGO_I, SEV, ALGO_NOTE, epAt, epTitle, epWhen, isEp, quickAt, addBag, bagPrompt, foodSpend, RENEW_DAYS, renewable, renewLabel, notYetLabel, renewGap, renewPlan, renewCheck, applyRenew, postpone, art, inDays, monthsBetween, scopeOf, agenda, nextAlerts, SCHEDULE, stage, suggested, addMonths, SUG_NOTE, isSug, BREEDS, CONDITIONS, SURGERIES, STUDY, timeline, summary, icon, petIcon, tone, recIcon, DAY, HOUR, today, pd, iso, isoLocal, fmt, fmtTime, fmtWhen, money, esc, TYPE, EXP, DEST, species, age, status, upcoming, medState, food, trip, ics, recordEvent, medEvent, foodEvent };
})(typeof window !== 'undefined' ? window : globalThis);
