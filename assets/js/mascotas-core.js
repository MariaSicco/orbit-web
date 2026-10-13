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

  g.MZ = { DAY, HOUR, today, pd, iso, isoLocal, fmt, fmtTime, fmtWhen, money, esc, TYPE, EXP, DEST, species, age, status, upcoming, medState, food, trip, ics, recordEvent, medEvent, foodEvent };
})(typeof window !== 'undefined' ? window : globalThis);
