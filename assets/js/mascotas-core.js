/* Libreta de tu Mascota · lógica compartida (app y ficha pública).
   Funciones puras: fechas, próximas fechas, medicación, alimento, viajes y calendario. */
(function (g) {
  'use strict';
  const DAY = 864e5, HOUR = 36e5;
  const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  const pd = s => { if (!s) return null; const [y, m, d] = s.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const isoLocal = d => `${iso(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const fmt = (s, o) => { const d = typeof s === 'string' ? pd(s) : s; return d ? d.toLocaleDateString('es-AR', o || { day: 'numeric', month: 'short', year: 'numeric' }) : '—'; };
  const fmtTime = d => d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
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
  function upcoming(p) {
    const last = new Map();
    for (const r of p.records || []) {
      const k = r.type + '|' + (r.name || '').toLowerCase().trim();
      const prev = last.get(k);
      if (!prev || (r.date || '') > (prev.date || '')) last.set(k, r);
    }
    return [...last.values()].filter(r => r.next).map(r => ({ pet: p, r, s: status(r.next) })).sort((a, b) => a.r.next.localeCompare(b.r.next));
  }

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
  function food(f) {
    if (!f || !f.bagKg || !f.dailyG || !f.opened) return null;
    const days = (f.bagKg * 1000) / f.dailyG;
    const end = new Date(pd(f.opened).getTime() + days * DAY);
    const left = Math.floor((end - today()) / DAY);
    const buy = new Date(end.getTime() - 3 * DAY);
    return { days: Math.round(days), end, left, buy, pct: Math.max(0, Math.min(1, left / days)) };
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
    L.push(`SUMMARY:${icsEsc(o.title)}`, `DESCRIPTION:${icsEsc(o.desc || 'Libreta de tu Mascota · Orbit')}`);
    for (const a of o.alarms || []) L.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEsc(o.title)}`, `TRIGGER:${a}`, 'END:VALARM');
    L.push('END:VEVENT');
    return L.join('\r\n');
  }
  const ics = events => ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Orbit//Libreta de tu Mascota//ES', 'CALSCALE:GREGORIAN', ...events.map(vevent), 'END:VCALENDAR'].join('\r\n');
  function recordEvent(pet, r) {
    return { uid: `${pet.id}-${r.id}-${r.next}`, allDay: true, start: pd(r.next), title: `${pet.name}: ${r.name || TYPE[r.type]}`, desc: `${TYPE[r.type]} · Libreta de tu Mascota (Orbit)`, alarms: ['-P3D', 'PT9H'] };
  }
  function medEvent(pet, m) {
    const s = new Date(m.start), h = m.every;
    const rrule = h % 168 === 0 ? `FREQ=WEEKLY;INTERVAL=${h / 168}` : h % 24 === 0 ? `FREQ=DAILY;INTERVAL=${h / 24}` : `FREQ=HOURLY;INTERVAL=${h}`;
    const count = m.days ? Math.max(1, Math.round(m.days * 24 / h)) : Math.min(500, Math.round(365 * 24 / h));
    return { uid: `${pet.id}-med-${m.id}`, start: s, rrule: `${rrule};COUNT=${count}`, title: `${pet.name}: ${m.name}${m.dose ? ' (' + m.dose + ')' : ''}`, desc: 'Medicación · Libreta de tu Mascota (Orbit)', alarms: ['PT0M'] };
  }
  function foodEvent(pet, f) {
    const st = food(f); if (!st) return null;
    return { uid: `${pet.id}-food-${f.opened}`, allDay: true, start: st.buy, title: `Comprar alimento de ${pet.name}`, desc: `Se termina alrededor del ${fmt(st.end)}.`, alarms: ['PT9H'] };
  }

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
    phone: '<path d="M5 4h3l2 5-2.5 1.5a11 11 0 0 0 6 6L15 14l5 2v3a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    alert: '<path d="M12 8v5M12 16.5v.5"/><circle cx="12" cy="12" r="9"/>',
    note: '<path d="M5 4h14v11l-5 5H5z"/><path d="M14 20v-5h5M8 9h8M8 12.5h5"/>',
    walk: '<circle cx="13" cy="4.5" r="1.8"/><path d="m9 21 2.5-6 2.5 2.5V21"/><path d="M8 11.5 10 8l3.5.5 2 3 2.5 1"/><path d="m11.5 15 1.5-6"/>',
    edit: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
    back: '<path d="M15 5l-7 7 7 7"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    piggy: '<path d="M19 11c0-3.3-3.1-5.5-7-5.5S4 8 4 11c0 1.7.8 3.1 2 4.2V19h3v-2h5v2h3v-3.6c.9-.7 1.6-1.6 2-2.4h1.5V10H19"/><circle cx="15.5" cy="10" r=".6"/><path d="M9.5 6.2 8 3.5"/>',
    share: '<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.6-4.6M8.2 13.2l7.6 4.6"/>',
    home: '<path d="M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1z"/>',
  };
  const icon = (n, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${P[n] || P.paw}</svg>`;
  const petIcon = p => icon(p.species === 'gato' ? 'cat' : p.species === 'perro' ? 'dog' : 'paw');
  const TONES = ['comida', 'viaje', 'salud', 'med', 'cuida', 'plata'];
  const tone = p => { let h = 0; for (const ch of String(p.id || p.name || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return TONES[h % TONES.length]; };
  const recIcon = t => ({ vacuna: 'syringe', desparasitacion: 'drop', control: 'heart', otro: 'note' })[t] || 'note';

  g.MZ = { icon, petIcon, tone, recIcon, DAY, HOUR, today, pd, iso, isoLocal, fmt, fmtTime, fmtWhen, money, esc, TYPE, EXP, DEST, species, age, status, upcoming, medState, food, trip, ics, recordEvent, medEvent, foodEvent };
})(typeof window !== 'undefined' ? window : globalThis);
