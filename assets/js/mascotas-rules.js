/* Mimitos · reglas compartidas entre la app (navegador) y el servidor (api/_lib/petpush.js y el cron).
   Es un script clásico sin import/export: en el navegador se carga con <script> antes de mascotas-core.js,
   y en Node se importa por efecto (import '../../assets/js/mascotas-rules.js'). Las dos partes leen
   globalThis.MZRULES, así la app y los avisos no pueden divergir. */
(function (g) {
  'use strict';
  /* fecha del calendario sugerido: tiene próxima, todavía no fecha de aplicación, y la marca en las notas */
  const SUG_NOTE = 'Calendario sugerido: referencia general, confirmalo con tu veterinario.';
  const isSug = r => Boolean(r) && !r.date && String(r.notes || '').startsWith('Calendario sugerido');
  const key = r => (r.type || '') + '|' + String(r.name || '').toLowerCase().trim();
  /* lo último de cada tipo + nombre manda: si ya cargaste la Séxtuple real, la sugerida (sin fecha)
     y las dosis anteriores dejan de contar. Una dosis adelantada reemplaza a la próxima que estaba prevista.
     Con la misma fecha de aplicación gana la cargada después ("Ya se la di" el mismo día que la anterior). */
  function latest(records) {
    const last = new Map();
    for (const r of records || []) {
      const k = key(r), prev = last.get(k);
      if (!prev || (r.date || '') >= (prev.date || '')) last.set(k, r);
    }
    return [...last.values()];
  }
  /* las próximas fechas vigentes, ordenadas */
  const dueRecords = records => latest(records).filter(r => r.next).sort((a, b) => a.next.localeCompare(b.next));

  /* ---------- alimento: cuánto le dura la bolsa ----------
     food = { brand, bagKg, dailyG, opened, bags: [{ date, kg?, brand?, price?, cat?, refPrice?, refStore?, refDate? }] }.
     cat es el id del catálogo de alimentos (assets/data/alimentos-ar.json); las bolsas viejas no lo tienen.
     Con 2 bolsas o más aprende: promedio de días entre aperturas (sin atípicos: menos de la mitad
     o más del doble de la mediana), normalizado por kg si cambia el tamaño. Lo aprendido manda sobre
     el cálculo por gramos; sin bolsas suficientes, se usa bagKg y dailyG como antes.
     Fechas como 'AAAA-MM-DD', sin zona horaria: el cron y la app cuentan igual. */
  const dnum = s => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ''); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / 864e5 : NaN; };
  const dstr = n => new Date(n * 864e5).toISOString().slice(0, 10);
  const pos = v => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };
  const LEARN_MAX = 8;   // cuántas bolsas terminadas mira, las últimas
  function bagsOf(f) {
    const seen = new Map();
    for (const b of (f && Array.isArray(f.bags) ? f.bags : [])) if (Number.isFinite(dnum(b && b.date))) seen.set(b.date.slice(0, 10), { date: b.date.slice(0, 10), kg: pos(b.kg), brand: b.brand || '', price: pos(b.price), ...(b.cat ? { cat: String(b.cat), refPrice: pos(b.refPrice), refStore: b.refStore || '', refDate: b.refDate || '' } : {}) });
    /* docs viejos: la bolsa abierta sin historial cuenta como la primera */
    if (f && Number.isFinite(dnum(f.opened)) && !seen.has(f.opened.slice(0, 10)) && ![...seen.keys()].some(d => d > f.opened)) seen.set(f.opened.slice(0, 10), { date: f.opened.slice(0, 10), kg: pos(f.bagKg), brand: f.brand || '', price: 0 });
    return [...seen.values()].sort((a, b) => a.date.localeCompare(b.date));
  }
  const median = a => { const x = [...a].sort((p, q) => p - q), m = x.length >> 1; return x.length % 2 ? x[m] : (x[m - 1] + x[m]) / 2; };
  function foodLearn(f) {
    const bags = bagsOf(f);
    if (!bags.length) return null;
    const cur = bags[bags.length - 1], curKg = cur.kg || pos(f && f.bagKg);
    /* cada bolsa terminada: días hasta la siguiente apertura, y sus kg */
    let gaps = [];
    for (let i = 1; i < bags.length; i++) { const days = dnum(bags[i].date) - dnum(bags[i - 1].date); if (days > 0) gaps.push({ days, kg: bags[i - 1].kg || pos(f && f.bagKg), price: bags[i - 1].price }); }
    gaps = gaps.slice(-LEARN_MAX);
    const byKg = gaps.length && curKg && gaps.every(g => g.kg);
    const val = g => byKg ? g.days / g.kg : g.days;
    let kept = [];
    if (gaps.length) { const md = median(gaps.map(val)); kept = gaps.filter(g => val(g) >= md / 2 && val(g) <= md * 2); }
    let days = 0, src = '', avg = 0;
    if (kept.length) {
      const mean = kept.reduce((a, g) => a + val(g), 0) / kept.length;
      avg = byKg ? mean * curKg : mean;
      days = Math.max(1, Math.round(avg)); src = 'aprendido';
    } else if (curKg && pos(f && f.dailyG)) { days = Math.floor(curKg * 1000 / f.dailyG); src = 'gramos'; }
    /* costo por día: lo que costó cada bolsa terminada sobre los días que duró */
    const priced = kept.filter(g => g.price);
    const perDay = priced.length ? priced.reduce((a, g) => a + g.price / g.days, 0) / priced.length : cur.price && days ? cur.price / days : 0;
    if (!days) return { src: '', opened: cur.date, bagKg: curKg, bags, n: 0, days: 0, end: '', perDay: 0 };
    return { src, opened: cur.date, bagKg: curKg, bags, n: kept.length, days, avg, end: dstr(dnum(cur.date) + days), perDay };
  }
  /* días que le quedan a la bolsa abierta (negativo: ya se terminó) */
  const foodLeft = (L, today) => L && L.days ? L.days - (dnum(today) - dnum(L.opened)) : null;

  g.MZRULES = { SUG_NOTE, isSug, latest, dueRecords, foodLearn, foodLeft, bagsOf };
})(typeof window !== 'undefined' ? window : globalThis);
