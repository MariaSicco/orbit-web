/* Mimitos · "Hoy con {mascota}": reglas compartidas entre la app, el link del cuidador y el servidor.
   Script clásico (como mascotas-rules.js): en el navegador con <script>, en Node se importa por efecto
   y las dos partes leen globalThis.MZHOY. Así el servidor valida exactamente la misma lista que se ve.

   Todo se cuenta en hora de Argentina (UTC-3, sin horario de verano), en "minutos de reloj":
   días como 'AAAA-MM-DD', horarios como 'HH:MM'. Los remedios guardan su primera toma como
   'AAAA-MM-DDTHH:MM' (hora de reloj) o con zona; las dos formas dan lo mismo.

   La rutina del día:
   - p.routine: [{ id, kind: comida|paseo|otro, time: 'HH:MM', label, qty }]. Si no está (docs viejos o
     nunca la editaron), se arma sola desde lo cargado: dos comidas (con la mitad de la ración diaria si
     está), dos paseos si es perro y agua fresca.
   - los remedios salen siempre de p.meds (frecuencia y primera toma): una fila por toma del día.
   Cada ítem tiene una clave estable: 'c:<id>', 'p:<id>', 'o:<id>' o 'm:<medId>:<HHMM>'. */
(function (g) {
  'use strict';
  const AR_OFF = -180, MIN = 60000, HOUR = 36e5;
  const KINDS = ['comida', 'paseo', 'otro'];
  const LABEL = { comida: 'Comida', paseo: 'Paseo', med: 'Remedio', otro: 'Otro' };
  const dnum = s => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ''); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / 864e5 : NaN; };
  const dstr = n => new Date(n * 864e5).toISOString().slice(0, 10);
  const hm = min => String(Math.floor(min / 60)).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0');
  /* minutos de reloj de Argentina de una marca de tiempo (con zona o sin zona) */
  function wall(stamp) {
    const s = String(stamp || '');
    const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(s); if (!m) return NaN;
    if (/(Z|[+-]\d{2}:\d{2})$/.test(s)) { const t = Date.parse(s); return Number.isFinite(t) ? Math.floor(t / MIN) + AR_OFF : NaN; }
    return dnum(m[1]) * 1440 + (+m[2]) * 60 + (+m[3]);
  }
  const instant = w => (w - AR_OFF) * MIN;                        /* minutos de reloj → ms reales */
  const todayAR = (now = Date.now()) => dstr(Math.floor((Math.floor(now / MIN) + AR_OFF) / 1440));
  const addDays = (ymd, n) => dstr(dnum(ymd) + n);
  const hhmm = ms => hm(((Math.floor(ms / MIN) + AR_OFF) % 1440 + 1440) % 1440);   /* hora de Argentina de un instante */

  function defaultRoutine(p) {
    const gr = Number(p && p.food && p.food.dailyG) || 0, q = gr ? Math.round(gr / 2) + ' g' : '';
    const out = [
      { id: 'c1', kind: 'comida', time: '08:00', label: 'Desayuno', qty: q },
      { id: 'c2', kind: 'comida', time: '20:00', label: 'Cena', qty: q },
    ];
    if (p && p.species === 'perro') out.push({ id: 'p1', kind: 'paseo', time: '08:30', label: 'Paseo de la mañana', qty: '' }, { id: 'p2', kind: 'paseo', time: '19:00', label: 'Paseo de la tarde', qty: '' });
    out.push({ id: 'o1', kind: 'otro', time: '09:00', label: 'Agua fresca', qty: '' });
    return out;
  }
  const routineOf = p => Array.isArray(p && p.routine) ? p.routine : defaultRoutine(p);

  /* ventana en la que una toma cuenta como dada (la misma regla que medState: desde 25 % antes, máx. 3 h, hasta la próxima) */
  const medWin = every => Math.min(every * 0.25, 3) * HOUR;

  function plan(p, ymd) {
    const d0 = dnum(ymd) * 1440, d1 = d0 + 1440, items = [];
    if (!Number.isFinite(d0)) return items;
    for (const r of routineOf(p)) {
      const t = /^(\d{2}):(\d{2})$/.exec(r && r.time || ''); if (!t || !KINDS.includes(r.kind)) continue;
      const min = +t[1] * 60 + +t[2]; if (min >= 1440) continue;
      items.push({ key: r.kind[0] + ':' + r.id, kind: r.kind, min, time: r.time, label: r.label || LABEL[r.kind], qty: r.qty || '', at: instant(d0 + min) });
    }
    for (const m of (p && p.meds) || []) {
      const s = wall(m.start); if (!Number.isFinite(s)) continue;
      const every = Math.max(1, Number(m.every) || 24), ev = every * 60, end = m.days ? s + m.days * 1440 : Infinity;
      let n = 0;
      for (let w = s + Math.max(0, Math.ceil((d0 - s) / ev)) * ev; w < d1 && w < end && n < 24; w += ev, n++) {
        const min = w - d0, at = instant(w);
        items.push({ key: 'm:' + m.id + ':' + hm(min).replace(':', ''), kind: 'med', medId: m.id, min, time: hm(min), label: m.name, qty: m.dose || '', at, from: at - medWin(every), to: at + every * HOUR - medWin(every) });
      }
    }
    return items.sort((a, b) => a.min - b.min || a.key.localeCompare(b.key));
  }
  const find = (p, ymd, key) => plan(p, ymd).find(i => i.key === key) || null;

  /* ¿ya se dio esta toma? (cualquier anotación del remedio dentro de su ventana: app, cuidador o "Ya se la di") */
  function medGiven(item, log) {
    let hit = null;
    for (const l of log || []) {
      if (!l || l.kind !== 'med' || l.medId !== item.medId) continue;
      const t = Date.parse(l.at); if (t >= item.from && t < item.to && (!hit || t < Date.parse(hit.at))) hit = l;
    }
    return hit;
  }
  /* ¿ya comió hace poco? (otra comida anotada en las últimas 3 horas) */
  function recentMeal(log, now = Date.now()) {
    let hit = null;
    for (const l of log || []) { if (!l || l.kind !== 'comida') continue; const t = Date.parse(l.at); if (t <= now && now - t < 3 * HOUR && (!hit || t > Date.parse(hit.at))) hit = l; }
    return hit;
  }

  g.MZHOY = { KINDS, LABEL, defaultRoutine, routineOf, plan, find, medGiven, recentMeal, todayAR, addDays, hhmm, wall, dnum };
})(typeof window !== 'undefined' ? window : globalThis);
