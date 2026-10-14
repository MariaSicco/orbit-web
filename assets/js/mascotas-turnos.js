/* Mimitos · turnos y "Pedir turno": reglas compartidas entre la app (navegador) y el servidor (cron y Preguntale).
   Script clásico sin import/export, como mascotas-rules.js: en el navegador va con <script>, y en Node se importa
   por efecto (import '../../assets/js/mascotas-turnos.js'). Los dos lados leen globalThis.MZTURNOS, así los avisos
   de la app y los del cron no pueden divergir.

   Turno: { id, petId, date: 'AAAA-MM-DD', time: 'HH:MM' | '', place: { name, phone, address, placeId }, reason, logged }
   La fecha y la hora son las del reloj de la persona (su zona horaria: la que guarda Avisos).

   Avisos de cada turno (push o mail, con candado por turno y por tipo en el servidor):
   - 'dia': el día anterior, desde las 9 de la mañana.
   - '2h':  dos horas antes (con hora). Sin hora: 'hoy', el mismo día desde las 9. */
(function (g) {
  'use strict';
  const SEND_HOUR = 9;
  const pad = n => String(n).padStart(2, '0');
  const okDate = v => /^\d{4}-\d{2}-\d{2}$/.test(v || '');
  const okTime = v => /^([01]\d|2[0-3]):[0-5]\d$/.test(v || '');
  const mins = t => okTime(t) ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)) : null;
  const addDays = (ymd, n) => new Date(Date.parse(ymd + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);

  /* reloj local de una zona IANA: { date: 'AAAA-MM-DD', min: minutos desde las 00:00 } */
  function localNow(tz, d = new Date()) {
    let parts;
    try { parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d); }
    catch { return localNow('America/Argentina/Buenos_Aires', d); }
    const o = Object.fromEntries(parts.map(p => [p.type, p.value]));
    return { date: `${o.year}-${o.month}-${o.day}`, min: (Number(o.hour) % 24) * 60 + Number(o.minute) };
  }
  /* comparación en "minutos absolutos" del reloj local (fecha + minutos), sin zonas */
  const abs = (date, min) => Math.round(Date.parse(date + 'T00:00:00Z') / 6e4) + (min || 0);
  const startOf = a => abs(a.date, mins(a.time) ?? 0);

  /* ¿qué avisos tocan ahora? now = localNow(...) */
  function reminders(appts, now) {
    const out = [], t = abs(now.date, now.min);
    for (const a of appts || []) {
      if (!a || !okDate(a.date)) continue;
      const m = mins(a.time);
      const start = abs(a.date, m ?? 24 * 60 - 1);
      if (t >= start) continue;   /* ya pasó */
      if (now.date === addDays(a.date, -1) && now.min >= SEND_HOUR * 60) out.push({ a, kind: 'dia' });
      if (m != null) { if (t >= start - 120) out.push({ a, kind: '2h' }); }
      else if (now.date === a.date && now.min >= SEND_HOUR * 60) out.push({ a, kind: 'hoy' });
    }
    return out;
  }
  /* turnos que todavía no pasaron, ordenados */
  const upcoming = (appts, now) => (appts || []).filter(a => okDate(a.date) && startOf(a) + (okTime(a.time) ? 0 : 24 * 60) > abs(now.date, now.min)).sort((x, y) => startOf(x) - startOf(y));
  /* pasó (una hora después de la hora, o el día siguiente si no tiene hora) y no se cargó lo que le hicieron */
  const toLog = (appts, now) => (appts || []).filter(a => okDate(a.date) && !a.logged && abs(now.date, now.min) >= startOf(a) + (okTime(a.time) ? 60 : 24 * 60) && a.date >= addDays(now.date, -30));

  const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const dayLong = ymd => { const d = new Date(ymd + 'T12:00:00Z'); return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} de ${MONTHS[d.getUTCMonth()]}`; };
  const dayShort = ymd => { const d = new Date(ymd + 'T12:00:00Z'); return `${d.getUTCDate()} de ${MONTHS[d.getUTCMonth()]}`; };
  const hhmm = t => okTime(t) ? (t.endsWith(':00') ? `${Number(t.slice(0, 2))} h` : `${Number(t.slice(0, 2))}:${t.slice(3)}`) : '';
  const placeName = a => String(a?.place?.name || '').trim() || 'la veterinaria';

  /* texto de cada aviso (push, mail y la app) */
  function notice(a, petName, kind) {
    const at = hhmm(a.time), where = placeName(a), why = String(a.reason || '').trim();
    const title = kind === 'dia' ? `Mañana ${petName} tiene turno${at ? ' a las ' + at : ''}`
      : kind === '2h' ? `En 2 horas: turno de ${petName}${at ? ' a las ' + at : ''}`
      : `Hoy ${petName} tiene turno`;
    const body = `${where}${why ? ' · ' + why : ''}${a.place?.address ? ' · ' + a.place.address : ''}.`;
    return { title, body, tag: `appt:${a.id}:${kind}` };
  }

  /* ---------- WhatsApp ----------
     Devuelve los dígitos para wa.me (549 + característica + número) si el teléfono parece un celular argentino; si no, ''.
     - Internacional de Google: "+54 9 11 2345-6789" (el 9 marca el celular).
     - Nacional con 15: "011 15-2345-6789", "(0351) 15 123-4567", "2944 15 12-3456".
     Un fijo ("011 4567-8901") o un número de otro país no van a WhatsApp: queda "Llamar". */
  function waPhone(phone) {
    let d = String(phone || '').replace(/[^\d+]/g, '');
    const intl = d.startsWith('+') || d.startsWith('00');
    d = d.replace(/^\+|^00/, '');
    if (intl && !d.startsWith('54')) return '';
    if (d.startsWith('54')) {
      d = d.slice(2);
      if (d.startsWith('9') && d.length === 11) return '549' + d.slice(1);
      if (d.startsWith('0')) d = d.slice(1);
    } else if (d.startsWith('0')) d = d.slice(1);
    if (d.length === 12) for (const a of [2, 3, 4]) if (d.slice(a, a + 2) === '15') return '549' + d.slice(0, a) + d.slice(a + 2);
    return '';
  }
  const speciesWord = p => p?.species === 'perro' ? 'perro' : p?.species === 'gato' ? 'gato' : String(p?.speciesOther || '').trim().toLowerCase() || 'mascota';
  /* motivo precargado desde una fecha vencida o próxima: "la Antirrábica — vencida el 2 de octubre" */
  function reasonFrom(r, today) {
    if (!r) return '';
    const what = String(r.name || '').trim() || ({ vacuna: 'vacuna', desparasitacion: 'desparasitación', control: 'control' }[r.type] || 'consulta');
    const art = /^(el|la|los|las) /i.test(what) ? '' : (/a$/i.test(what.split(' ')[0]) ? 'la ' : 'el ');
    const when = r.next ? (today && r.next < today ? `vencida el ${dayShort(r.next)}` : `para el ${dayShort(r.next)}`) : '';
    return `${art}${what}${when ? ' — ' + when : ''}`;
  }
  function waMessage(pet, reason) {
    const why = String(reason || '').trim();
    return `Hola, quería pedir un turno para ${pet?.name || 'mi mascota'} (${speciesWord(pet)}).${why ? ` Le toca ${why}.` : ''} ¿Tienen disponibilidad?`;
  }
  const waLink = (phone, text) => { const n = waPhone(phone); return n ? `https://wa.me/${n}?text=${encodeURIComponent(text)}` : ''; };
  const telLink = phone => { const d = String(phone || '').replace(/[^\d+]/g, ''); return d.length >= 6 ? 'tel:' + d : ''; };

  g.MZTURNOS = { SEND_HOUR, okDate, okTime, localNow, reminders, upcoming, toLog, notice, dayLong, dayShort, hhmm, waPhone, waMessage, waLink, telLink, reasonFrom, speciesWord, addDays };
})(typeof window !== 'undefined' ? window : globalThis);
