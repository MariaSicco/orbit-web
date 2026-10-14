/* Mimitos · catálogo de alimentos de Argentina (assets/data/alimentos-ar.json).
   Sirve para autocompletar la bolsa (marca, variedad y kg) y mostrar un precio de referencia con su fuente.
   No recomienda marcas ni dice nada de nutrición: solo busca lo que la persona escribe.
   Lo usan la app (hoja "Bolsa nueva", Alimento y Gastos) y los tests. Sin dependencias. */
(g => {
  'use strict';
  const URL_DATA = '/assets/data/alimentos-ar.json';
  const NOTE = d => `Los precios son de referencia, sacados de tiendas online el ${fmtDay(d)}. Pueden variar.`;
  const norm = t => String(t == null ? '' : t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/(\d),(\d)/g, '$1.$2').replace(/[^a-z0-9.ñ ]+/g, ' ').replace(/\s+/g, ' ').trim();
  const fmtDay = d => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || ''); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; };
  const kgTxt = n => String(n).replace('.', ',');
  const money = n => '$' + Math.round(n).toLocaleString('es-AR');
  const label = it => [it.brand, it.line, it.variant].filter(Boolean).join(' ');
  const full = it => `${label(it)} · ${kgTxt(it.sizeKg)} kg`;

  /* etapa de la mascota por la edad: menos de 1 año cachorro (o kitten), desde los 7 senior */
  function stageOf(p, today = new Date()) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(p && p.birth || ''); if (!m) return '';
    let mo = (today.getFullYear() - +m[1]) * 12 + today.getMonth() - (+m[2] - 1); if (today.getDate() < +m[3]) mo--;
    if (mo < 0) return '';
    return mo < 12 ? 'cachorro' : mo >= 84 ? 'senior' : 'adulto';
  }
  /* valida lo que viene del JSON: solo filas completas, precio entero positivo y URL https */
  function clean(data) {
    const items = [];
    for (const it of (data && Array.isArray(data.items) ? data.items : [])) {
      if (!it || !it.id || !it.brand || !['perro', 'gato'].includes(it.species) || !(Number(it.sizeKg) > 0)) continue;
      const x = { id: String(it.id), brand: String(it.brand), line: String(it.line || ''), variant: String(it.variant || ''), species: it.species, stage: ['cachorro', 'adulto', 'senior'].includes(it.stage) ? it.stage : 'todas', sizeKg: Number(it.sizeKg) };
      const s = it.priceSource;
      if (Number(it.priceArs) > 0 && s && s.store && /^https:\/\//.test(s.url || '') && /^\d{4}-\d{2}-\d{2}$/.test(s.date || '')) { x.priceArs = Math.round(Number(it.priceArs)); x.priceSource = { store: String(s.store), url: String(s.url), date: s.date }; }
      x._h = norm(`${label(x)} ${x.sizeKg} kg ${x.sizeKg}kg`);
      items.push(x);
    }
    return { updated: /^\d{4}-\d{2}-\d{2}$/.test(data && data.updated || '') ? data.updated : '', items, byId: new Map(items.map(i => [i.id, i])) };
  }
  /* el catálogo va partido por especie (cada parte pesa menos de 150 KB): alimentos-ar.json es el índice
     { updated, parts: { perro: 'alimentos-ar-perro.json', gato: 'alimentos-ar-gato.json' } } y cada parte
     tiene { updated, species, items: [...] }. Se carga una sola vez por especie; si falla (sin conexión, etc.)
     devuelve null y la app sigue con texto libre. */
  const cache = new Map();
  const getJson = (fetchFn, url) => Promise.resolve().then(() => fetchFn(url)).then(r => r && r.ok !== false ? (typeof r.json === 'function' ? r.json() : r) : null);
  function load(species, fetchFn = g.fetch) {
    if (!['perro', 'gato'].includes(species)) return Promise.resolve(null);
    if (!cache.has(species)) cache.set(species, getJson(fetchFn, URL_DATA).then(ix => {
      const part = ix && ix.parts && ix.parts[species];
      if (!part || !/^[a-z0-9-]+\.json$/.test(part)) return null;
      return getJson(fetchFn, URL_DATA.replace(/[^/]+$/, part));
    }).then(d => d ? clean({ updated: d.updated, items: (d.items || []).filter(i => i && i.species === species) }) : null).catch(() => null)
      .then(c => { if (!c) cache.delete(species); return c; }));
    return cache.get(species);
  }
  /* busca por marca, línea, variedad o kg. Solo la especie de la mascota; primero su etapa */
  const RANK = { exact: 0, todas: 1, otra: 2 };
  function search(cat, q, { species = '', stage = '', limit = 8 } = {}) {
    if (!cat || !['perro', 'gato'].includes(species)) return [];
    const toks = norm(q).split(' ').filter(Boolean); if (!toks.length) return [];
    const out = [];
    for (const it of cat.items) {
      if (it.species !== species) continue;
      if (!toks.every(t => it._h.includes(t))) continue;
      const st = !stage ? RANK.todas : it.stage === stage ? RANK.exact : it.stage === 'todas' ? RANK.todas : RANK.otra;
      const lead = norm(it.brand).startsWith(toks[0]) ? 0 : 1;
      out.push({ it, k: [st, lead, it.priceArs ? 0 : 1] });
    }
    out.sort((a, b) => a.k[0] - b.k[0] || a.k[1] - b.k[1] || label(a.it).localeCompare(label(b.it), 'es') || a.it.sizeKg - b.it.sizeKg || a.k[2] - b.k[2]);
    return out.slice(0, limit).map(x => x.it);
  }
  /* lo que se completa al elegir: marca y variedad en un texto, kg y el precio sugerido */
  function prefill(it) {
    return { brand: label(it).slice(0, 80), kg: it.sizeKg, price: it.priceArs || null, cat: it.id,
      ref: it.priceArs ? { price: it.priceArs, store: it.priceSource.store, date: it.priceSource.date, url: it.priceSource.url } : null };
  }
  /* "Precio de referencia: $X en Tienda · al 14/10/2026" (sin el link, que arma la vista) */
  const refText = it => it && it.priceArs ? `Precio de referencia: ${money(it.priceArs)} en ${it.priceSource.store} · al ${fmtDay(it.priceSource.date)}` : '';
  const byId = (cat, id) => cat && id ? cat.byId.get(String(id)) || null : null;

  g.MZFOOD = { URL_DATA, NOTE, load, clean, search, prefill, refText, stageOf, byId, label, full, fmtDay, norm, _reset() { cache.clear(); } };
})(typeof window !== 'undefined' ? window : globalThis);
