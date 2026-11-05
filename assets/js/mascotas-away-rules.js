/* Mimitos · "Me fui": reglas compartidas entre la app (navegador), el cron de avisos y "Preguntale a Mimitos".
   Script clásico sin import/export (como mascotas-rules.js): en el navegador va con <script>, en Node se importa
   por efecto y las dos partes leen globalThis.MZAWAYR. Así el contador, los avisos y las respuestas no divergen.

   Modelo en el doc (lo limpia cleanAway en api/_lib/petaway.js; norm de la app completa lo que falte):
   - doc.away    = { on, id, since, pets: [petId], check: { agua, comida, puerta, ventanas } }
   - doc.awaySet = { alertH, sitter, sitterMail }      alertH: horas para el aviso (0 = sin aviso)
   - doc.awayLog = [{ id, from, to, pets: [petId] }]   salidas cerradas con "Volví" (las últimas MAX_LOG) */
(function (g) {
  'use strict';
  const H = 36e5, M = 6e4, DAY = 864e5;
  const ALERT_HOURS = [0, 1, 2, 3, 4, 6, 8, 10, 12];
  const DEFAULT_ALERT = 4;
  const MAX_LOG = 200;
  const CHECKS = [['agua', 'Agua'], ['comida', 'Comida'], ['puerta', 'Puerta cerrada'], ['ventanas', 'Ventanas y balcón']];
  const t = s => { const x = Date.parse(s || ''); return Number.isFinite(x) ? x : NaN; };

  const blankAway = () => ({ on: false, id: '', since: '', pets: [], check: { agua: false, comida: false, puerta: false, ventanas: false } });
  const blankSet = () => ({ alertH: DEFAULT_ALERT, sitter: false, sitterMail: '' });

  /* cuánto lleva la salida en curso (0 si no hay) */
  function elapsed(away, now = Date.now()) {
    if (!away || !away.on) return 0;
    const s = t(away.since);
    return Number.isFinite(s) ? Math.max(0, now - s) : 0;
  }
  const covers = (away, petId) => Boolean(away && away.on && (!away.pets || !away.pets.length || away.pets.includes(petId)));

  /* "3 h 20 min", "45 min", "menos de 1 min" */
  function dur(ms) {
    const m = Math.floor(Math.max(0, ms) / M);
    if (m < 1) return 'menos de 1 min';
    const h = Math.floor(m / 60), r = m % 60;
    if (!h) return `${r} min`;
    return r ? `${h} h ${r} min` : `${h} h`;
  }

  /* avisos que ya tocan en la salida en curso. Escalones: al umbral (a la persona y, si lo pidió, al cuidador)
     y al doble del umbral (solo a la persona). El dedupe lo hace el servidor con un candado por (salida, escalón). */
  function dueSteps(away, set, now = Date.now()) {
    const h = Number(set && set.alertH) || 0;
    if (!away || !away.on || !away.id || !h) return [];
    const e = elapsed(away, now), out = [];
    if (e >= h * H) out.push({ step: 1, hours: h, sitter: Boolean(set.sitter && set.sitterMail) });
    if (e >= 2 * h * H) out.push({ step: 2, hours: 2 * h, sitter: false });
    return out;
  }

  /* intervalos (de la mascota) que caen en [from, to): salidas cerradas + la que está en curso */
  function intervals(log, away, petId, from, to) {
    const out = [];
    for (const x of log || []) {
      if (petId && x.pets && x.pets.length && !x.pets.includes(petId)) continue;
      const a = t(x.from), b = t(x.to);
      if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) continue;
      const s = Math.max(a, from), e = Math.min(b, to);
      if (e > s) out.push({ from: s, to: e, full: b - a, id: x.id });
    }
    if (away && away.on && (!petId || covers(away, petId))) {
      const a = t(away.since);
      if (Number.isFinite(a)) { const s = Math.max(a, from); if (to > s) out.push({ from: s, to, full: to - a, id: away.id, live: true }); }
    }
    return out;
  }

  /* resumen de los últimos `days` días (por defecto 7). dayOf(ms) → "AAAA-MM-DD" en la zona de quien mira:
     el navegador usa su hora local y el servidor la zona guardada en los avisos */
  function week(log, away, petId, now = Date.now(), dayOf, days = 7) {
    const from = now - days * DAY;
    const list = intervals(log, away, petId, from, now);
    const total = list.reduce((a, x) => a + (x.to - x.from), 0);
    const byDay = {};
    for (const x of list) {
      /* un intervalo que cruza la medianoche se reparte entre los días */
      let s = x.from;
      while (s < x.to) {
        const d = dayOf(s);
        let e = x.to;
        if (dayOf(x.to - 1) !== d) {
          /* búsqueda binaria del primer instante del día siguiente */
          let lo = s, hi = x.to - 1;
          while (hi - lo > 1) { const mid = Math.floor((lo + hi) / 2); if (dayOf(mid) === d) lo = mid; else hi = mid; }
          e = hi;
        }
        byDay[d] = (byDay[d] || 0) + (e - s);
        s = e;
      }
    }
    const longest = list.reduce((a, x) => (x.full > (a ? a.full : 0) ? x : a), null);
    return { total, count: list.length, byDay, longest: longest ? { ms: longest.full, from: longest.from, live: Boolean(longest.live) } : null };
  }

  /* "Feliza lleva 3 h 20 min sola" / "Feliza y Toto llevan 2 h solos" */
  function soloText(pets, ms) {
    const names = pets.map(p => p.name).filter(Boolean);
    if (!names.length) return `Hace ${dur(ms)} que saliste`;
    const who = names.length === 1 ? names[0] : names.slice(0, -1).join(', ') + ' y ' + names[names.length - 1];
    const fem = pets.every(p => p.sex === 'h');
    const sola = names.length === 1 ? (pets[0].sex === 'm' ? 'solo' : 'sola') : fem ? 'solas' : 'solos';
    return `${who} ${names.length === 1 ? 'lleva' : 'llevan'} ${dur(ms)} ${sola}`;
  }

  g.MZAWAYR = { H, M, DAY, ALERT_HOURS, DEFAULT_ALERT, MAX_LOG, CHECKS, blankAway, blankSet, elapsed, covers, dur, dueSteps, intervals, week, soloText };
})(typeof window !== 'undefined' ? window : globalThis);
