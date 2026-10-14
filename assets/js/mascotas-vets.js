/* Mimitos · "Veterinarias cerca" y turnos. Necesita mascotas-core.js (window.MZ), mascotas-turnos.js
   (window.MZTURNOS) y el puente de mascotas-app.js (window.MZAPP).

   - Dónde buscar: "Usar mi ubicación" (GPS) o "Barrio, ciudad o dirección" con autocompletar de Google
     (Places Autocomplete (New) por el proxy del servidor, solo Argentina, con session token). Al elegir una
     sugerencia, el servidor pide sus coordenadas (Place Details Essentials, mismo session token) y se busca con
     Nearby alrededor, redondeado a 3 decimales. Texto libre nunca va a Google como dirección: Enter usa la
     sugerencia si es una sola o la primera es muy probable; si no, pide elegir de la lista.
   - Barra "Cerca de: …" arriba de la lista y del mapa, con "Cambiar". Al confirmar se busca en la pestaña actual
     y se limpia la caché de las otras. Las tres pestañas usan las mismas coordenadas y el mapa se centra ahí.
   - La última ubicación queda en sessionStorage (solo esta pestaña, coordenadas redondeadas + el texto de la barra).
     "Guardar como mi zona" es opcional y va a la cuenta (doc.zone: texto corto + coordenadas redondeadas); se borra
     desde "Cambiar". Si no hay permiso de GPS: queda el campo.
   - Los resultados de Google se muestran y quedan en memoria solo para cambiar de pestaña sin volver a pagar.
   - Mapa: Maps Embed API (gratis). Atribución "Google Maps" siempre visible debajo de la lista.
   - "Pedir turno por WhatsApp" (si el teléfono parece celular argentino), "Llamar", "Cómo llegar",
     "Guardar como mi veterinaria" (vetPlace + vet) y "Anotar turno" (doc.appointments). */
(() => {
'use strict';
const Z = window.MZ, T = window.MZTURNOS;
const { esc, fmt, iso } = Z;
const I = Z.icon;
const A = () => window.MZAPP;
const $ = s => document.querySelector(s);

const KINDS = [['vet', 'Veterinarias', 'veterinaria'], ['er', 'Guardias 24 h', 'veterinaria guardia 24 horas'], ['pet', 'Pet shops', 'pet shop']];
const kindWords = k => (KINDS.find(x => x[0] === k) || KINDS[0])[2];
const mapsSearch = (k, area = '') => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(kindWords(k) + (area ? ' ' + area : ''))}`;
const directions = pl => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent([pl.name, pl.address].filter(Boolean).join(', '))}${pl.placeId || pl.id ? `&destination_place_id=${encodeURIComponent(pl.placeId || pl.id)}` : ''}`;

/* estado en memoria; la última ubicación elegida, además, en sessionStorage (ver saveLoc) */
const st = { from: 'inicio', kind: 'vet', coords: null, label: '', zoneLabel: '', phase: 'idle', err: '', cfg: null, res: {}, ctx: { petId: '', recId: '' }, sel: null,
  editing: false, locating: false, locMsg: '', draft: '', zoneTried: false,
  /* autocompletar */
  token: '', sug: [], sugFor: '', active: -1, sugMsg: '', sugBusy: false, picking: false };
const resKey = () => st.kind + '|' + (st.coords ? `${st.coords.lat.toFixed(3)},${st.coords.lng.toFixed(3)}` : '');
const searched = () => Boolean(st.coords);

const SS_KEY = 'mimitos:vets:ubicacion';
const r3 = n => Math.round(n * 1000) / 1000;
const okLL = c => c && Number.isFinite(c.lat) && Number.isFinite(c.lng) && Math.abs(c.lat) <= 90 && Math.abs(c.lng) <= 180 && Boolean(c.lat || c.lng);
const clip = (t, n) => String(t || '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
/* última ubicación: solo en esta pestaña del navegador, nunca en el servidor */
function saveLoc() {
  try {
    if (st.coords) sessionStorage.setItem(SS_KEY, JSON.stringify({ c: { lat: r3(st.coords.lat), lng: r3(st.coords.lng) }, l: st.label, z: st.zoneLabel }));
    else sessionStorage.removeItem(SS_KEY);
  } catch {}
}
function loadLoc() {
  try {
    const v = JSON.parse(sessionStorage.getItem(SS_KEY) || 'null');
    if (v && okLL(v.c)) return { coords: { lat: r3(v.c.lat), lng: r3(v.c.lng) }, label: clip(v.l, 120), zoneLabel: clip(v.z, 60) };
  } catch {}
  return null;
}
Object.assign(st, loadLoc() || {});

/* "mi zona" (en la cuenta): texto corto + coordenadas redondeadas */
const zone = () => { const z = A()?.doc?.zone; return z && okLL(z) && z.label ? z : null; };
const isZone = () => { const z = zone(); return Boolean(z && st.coords && r3(st.coords.lat) === z.lat && r3(st.coords.lng) === z.lng); };

const focusArea = () => requestAnimationFrame(() => { const i = $('#vxArea'); if (i) { i.focus(); i.select?.(); } });

/* distancia en el navegador (la ubicación exacta no sale de acá) */
function dist(a, b) {
  if (!a || !b || b.lat == null) return null;
  const R = 6371e3, r = x => x * Math.PI / 180, dLa = r(b.lat - a.lat), dLo = r(b.lng - a.lng);
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const distTxt = m => m == null ? '' : m < 950 ? `${Math.max(50, Math.round(m / 50) * 50)} m` : `${(m / 1000).toFixed(m < 9950 ? 1 : 0).replace('.', ',')} km`;
const stars = (r, n) => r == null ? '' : `<span class="vx-stars" aria-label="${String(r).replace('.', ',')} estrellas${n ? `, ${n} opiniones` : ''}">${I('star')}<b>${r.toFixed(1).replace('.', ',')}</b>${n ? `<small>(${n.toLocaleString('es-AR')})</small>` : ''}</span>`;
const openTag = o => o == null ? '' : o ? '<span class="badge ok">Abierto ahora</span>' : '<span class="badge none">Cerrado</span>';
const ATTR = '<p class="vx-attr" translate="no">Google Maps</p>';

async function api(action, body) {
  const r = await fetch('/api/mascotas?places=' + action, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  const d = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, d };
}
async function loadCfg() {
  if (st.cfg) return st.cfg;
  try { const { ok, d } = await api('config'); st.cfg = ok ? d : { ready: false }; } catch { st.cfg = { ready: false, offline: true }; }
  return st.cfg;
}

/* ---------- búsquedas ---------- */
async function search() {
  const key = resKey();
  if (st.res[key]) { st.phase = 'ok'; return A().render(); }
  st.phase = 'loading'; st.err = ''; A().render();
  let out;
  try { out = await api('nearby', { kind: st.kind, lat: st.coords.lat, lng: st.coords.lng }); }
  catch { st.phase = 'error'; st.err = 'Sin conexión. Probá de nuevo en un rato.'; return A().render(); }
  /* si mientras tanto cambió la ubicación o la pestaña, esta respuesta ya no va */
  if (key !== resKey()) return;
  const { ok, status, d } = out;
  if (ok) {
    const list = (d.places || []).map(p => ({ ...p, m: dist(st.coords, p) })).sort((a, b) => (a.m ?? 1e9) - (b.m ?? 1e9));
    if (st.cfg && Number.isFinite(d.left)) st.cfg.left = d.left;
    st.res[key] = list; st.phase = 'ok';
  } else if (d.error === 'maps_paused') { st.phase = 'paused'; if (st.cfg) st.cfg.paused = true; }
  else if (d.error === 'maps_no_configurado') { st.phase = 'off'; }
  else if (status === 429) { st.phase = 'error'; st.err = `Llegaste a las ${d.limit || 20} búsquedas de hoy. Mañana se renuevan; mientras tanto, buscá directo en Google Maps.`; }
  else if (status === 401) { st.phase = 'error'; st.err = 'Entrá de nuevo a tu cuenta para buscar.'; }
  else { st.phase = 'error'; st.err = 'Google no respondió. Probá de nuevo en un rato.'; }
  A().render();
}
/* nueva ubicación (GPS, sugerencia o "mi zona"): limpia la caché de todas las pestañas y busca en la actual */
function setLoc(next) {
  Object.assign(st, { coords: next.coords, label: next.label || '', zoneLabel: next.zoneLabel || '', res: {}, sel: null, editing: false, locMsg: '', draft: '', sug: [], sugFor: '', active: -1, sugMsg: '' });
  saveLoc();
  search();
}
function denied() {
  st.locating = false; st.locMsg = 'denied'; st.editing = searched();
  A().render(); focusArea();
}
function locate() {
  st.locMsg = '';
  if (!('geolocation' in navigator)) return denied();
  st.locating = true; A().render();
  navigator.geolocation.getCurrentPosition(pos => {
    st.locating = false;
    setLoc({ coords: { lat: pos.coords.latitude, lng: pos.coords.longitude } });
  }, denied, { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 });
}

/* ---------- autocompletar (combobox) ---------- */
const MIN_Q = 4, DEBOUNCE = 300;
const newToken = () => { try { return crypto.randomUUID(); } catch { return Array.from({ length: 4 }, () => Math.random().toString(36).slice(2, 10)).join('').slice(0, 32); } };
const norm = t => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
/* "muy probable": una sola sugerencia, o la primera coincide con lo escrito y ninguna otra tiene el mismo nombre */
function likely(q, list) {
  if (list.length === 1) return list[0];
  const n = norm(q), a = list[0]; if (!a || !n) return null;
  const m0 = norm(a.main);
  if (!(m0 === n || norm(a.text).startsWith(n))) return null;
  return list.slice(1).some(s => norm(s.main) === m0) ? null : a;
}
/* localidad de la sugerencia ("W3400 Corrientes, Argentina" → "Corrientes") */
const locality = s => clip(String(s.sub || '').split(',')[0].replace(/^[A-Z]\d{4}[A-Z]{0,3}\s+/, '').replace(/^\d{4}\s+/, ''), 60);
const labelOf = s => clip(s.main && locality(s) && !/argentina/i.test(locality(s)) ? `${s.main}, ${locality(s)}` : s.text || s.main, 120);

function sugHtml() {
  const q = st.sugFor;
  if (st.sugMsg === 'paused') return `<div class="vx-sug-msg" role="status">La búsqueda está en pausa por este mes. <a class="btn sm ghost" href="${esc(mapsSearch(st.kind, st.draft))}" target="_blank" rel="noopener noreferrer">${I('search')} Buscar en Google Maps</a></div>`;
  if (st.sugMsg === 'limit') return `<div class="vx-sug-msg" role="status">Llegaste al tope de sugerencias de hoy. <a class="btn sm ghost" href="${esc(mapsSearch(st.kind, st.draft))}" target="_blank" rel="noopener noreferrer">${I('search')} Buscar en Google Maps</a></div>`;
  if (st.sugMsg === 'error') return '<div class="vx-sug-msg" role="status">No pudimos traer sugerencias. Probá de nuevo en un rato.</div>';
  if (st.sugMsg === 'none') return '<p class="vx-err" role="alert">No encontramos esa dirección, probá con barrio y ciudad.</p>';
  const pick = st.sugMsg === 'pick' ? '<p class="vx-err vx-pick" role="alert">Hay más de una con ese nombre. Elegí la tuya de la lista.</p>' : '';
  if (!st.sug.length || !q) return pick;
  return `${pick}<ul class="vx-sug" id="vxSug" role="listbox" aria-label="Sugerencias de Google">${st.sug.map((s, i) => `<li role="option" id="vxSug-${i}" class="vx-opt" data-vxs="${i}" aria-selected="${i === st.active}">${I('pin')}<span><b>${esc(s.main || s.text)}</b>${s.sub ? `<small>${esc(s.sub)}</small>` : ''}</span></li>`).join('')}</ul><p class="vx-attr vx-sug-attr" translate="no">Google Maps</p>`;
}
/* el campo no se vuelve a dibujar mientras se escribe: solo la lista */
function patchSug() {
  const box = $('#vxSugBox'), inp = $('#vxArea'); if (!box || !inp) return;
  box.innerHTML = sugHtml();
  const open = Boolean(st.sug.length && st.sugFor);
  inp.setAttribute('aria-expanded', String(open));
  if (open && st.active >= 0) inp.setAttribute('aria-activedescendant', 'vxSug-' + st.active); else inp.removeAttribute('aria-activedescendant');
  inp.setAttribute('aria-invalid', String(st.sugMsg === 'none'));
}
let timer = 0, seq = 0;
async function fetchSug(q) {
  clearTimeout(timer);
  q = clip(q, 80);
  if (q.length < MIN_Q) { st.sug = []; st.sugFor = ''; st.sugMsg = ''; st.active = -1; patchSug(); return; }
  if (q === st.sugFor && !st.sugMsg) return;
  if (!st.token) st.token = newToken();
  const my = ++seq; st.sugBusy = true;
  const bias = st.coords || zone();
  let out;
  try { out = await api('autocomplete', { q, token: st.token, kind: st.kind, ...(bias ? { lat: bias.lat, lng: bias.lng } : {}) }); }
  catch { out = { ok: false, status: 0, d: {} }; }
  if (my !== seq) return;
  st.sugBusy = false; st.active = -1;
  const { ok, status, d } = out;
  if (ok) { st.sug = (d.suggestions || []).slice(0, 5); st.sugFor = q; st.sugMsg = st.sug.length ? '' : 'none'; }
  else { st.sug = []; st.sugFor = q; st.sugMsg = d.error === 'maps_paused' ? 'paused' : status === 429 ? 'limit' : 'error'; if (d.error === 'maps_paused' && st.cfg) st.cfg.paused = true; }
  patchSug();
}
async function pickSug(s) {
  if (!s || st.picking) return;
  st.picking = true;
  let out;
  try { out = await api('pick', { id: s.id, token: st.token }); } catch { out = { ok: false, status: 0, d: {} }; }
  st.picking = false;
  /* la sesión de autocompletar termina con este detalle: la próxima búsqueda arranca un token nuevo */
  st.token = '';
  const { ok, status, d } = out;
  if (ok && d.place && okLL(d.place)) return setLoc({ coords: { lat: d.place.lat, lng: d.place.lng }, label: labelOf(s) || clip(d.place.address, 120), zoneLabel: locality(s) || clip(s.main, 60) });
  st.sugMsg = d.error === 'maps_paused' ? 'paused' : status === 429 ? 'limit' : 'error';
  patchSug();
}
async function submitArea() {
  const inp = $('#vxArea'); if (!inp) return;
  const q = clip(inp.value, 80); st.draft = q;
  if (st.active >= 0 && st.sug[st.active]) return pickSug(st.sug[st.active]);
  if (q.length < MIN_Q) { inp.focus(); return A().toast('Escribí tu barrio, ciudad o dirección (4 letras o más).'); }
  if (st.sugFor !== q || st.sugMsg === 'error') await fetchSug(q);
  if (st.sugMsg) return patchSug();
  const best = likely(q, st.sug);
  if (best) return pickSug(best);
  st.sugMsg = 'pick'; st.active = 0; patchSug(); inp.focus();
}
/* ---------- pantalla ---------- */
function ctxOf(arg) {
  const [petId = '', recId = ''] = String(arg || '').split('|');
  return { petId, recId };
}
function contextRec(p) { return st.ctx.recId ? (p.records || []).find(r => r.id === st.ctx.recId) || null : null; }

function myVetCard(p) {
  const v = p.vet || {};
  if (!v.name || !(v.phone || p.vetPlace?.placeId)) return '';
  const rec = contextRec(p), msg = T.waMessage(p, T.reasonFrom(rec, iso(Z.today())));
  const wa = T.waLink(v.phone, msg), tel = T.telLink(v.phone);
  const place = { name: v.name, address: v.address, placeId: p.vetPlace?.name === v.name ? p.vetPlace.placeId : '' };
  return `<section class="card vx-mine" aria-labelledby="vxMine">
    <div class="vx-mine-h"><span class="ib c-cuida">${I('steth')}</span><span><span class="eyebrow">Mi veterinaria</span><h2 id="vxMine">${esc(v.name)}</h2>${v.address ? `<small class="dim">${esc(v.address)}</small>` : ''}</span></div>
    <div class="btns">${wa ? `<a class="btn" href="${esc(wa)}" target="_blank" rel="noopener noreferrer">${I('chat')} Pedir turno por WhatsApp</a>` : ''}${tel ? `<a class="btn ${wa ? 'ghost' : ''}" href="${esc(tel)}">${I('phone')} Llamar</a>` : ''}<a class="btn ghost" href="${esc(directions(place))}" target="_blank" rel="noopener noreferrer">${I('pin')} Cómo llegar</a><button type="button" class="btn ghost" data-vx="appt" data-src="mine">${I('cal')} Anotar turno</button></div>
  </section>`;
}

function mapFrame(list) {
  const key = st.cfg?.mapsKey; if (!key) return '';
  const base = 'https://www.google.com/maps/embed/v1/';
  const src = st.sel ? `${base}place?key=${encodeURIComponent(key)}&q=place_id:${encodeURIComponent(st.sel)}&language=es&region=AR`
    : `${base}search?key=${encodeURIComponent(key)}&q=${encodeURIComponent(kindWords(st.kind))}&center=${st.coords.lat.toFixed(3)},${st.coords.lng.toFixed(3)}&zoom=14&language=es&region=AR`;
  /* referrerpolicy: la página va con no-referrer, pero la clave del mapa está restringida por referrer */
  return list.length ? `<div class="vx-map"><iframe title="Mapa de ${esc(KINDS.find(k => k[0] === st.kind)[1].toLowerCase())} en Google Maps" src="${esc(src)}" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></div>` : '';
}

function placeRow(pl, i) {
  const meta = [pl.m != null ? distTxt(pl.m) : '', pl.address].filter(Boolean).map(esc).join(' · ');
  return `<button type="button" class="row link-row vx-row" data-vx="place" data-i="${i}" aria-current="${st.sel === pl.id}">
    <span class="vx-n" aria-hidden="true">${i + 1}</span>
    <span class="what"><b>${esc(pl.name)}</b><small>${meta}</small><span class="vx-meta">${openTag(pl.open)}${stars(pl.rating, pl.ratings)}</span></span>${I('chevron')}</button>`;
}

/* barra siempre visible arriba de la lista y del mapa */
function locBar() {
  const z = zone(), canSave = st.label && st.zoneLabel && !isZone();
  return `<div class="vx-bar" id="vxBar"><div class="vx-bar-r"><span class="vx-bar-t">${I('pin')}<span>${st.label ? `Cerca de: <b>${esc(st.label)}</b>` : '<b>Cerca de tu ubicación</b>'}</span></span>
    <button type="button" class="btn sm ghost" data-vx="where" aria-label="Cambiar la ubicación de la búsqueda">Cambiar</button></div>
    ${canSave ? `<button type="button" class="link vx-zone" data-vx="zoneSave">${I('heart')} Guardar ${esc(st.zoneLabel)} como mi zona</button>` : isZone() && z ? `<span class="vx-zone-on">${I('heart')} Tu zona</span>` : ''}</div>`;
}
/* dónde buscar: la primera vez, o al tocar "Cambiar". Combobox con sugerencias de Google (solo Argentina). */
function locForm(paused) {
  const edit = searched(), denied = st.locMsg === 'denied', z = zone();
  const val = st.draft;
  if (paused) return `<section class="card vx-loc" id="vxLoc" aria-labelledby="vxLocH"><h2 id="vxLocH">Buscalo en Google Maps</h2>
    <div class="vx-area"><label for="vxMapsQ">Barrio, ciudad o dirección</label><div class="vx-area-r"><input id="vxMapsQ" maxlength="80" autocomplete="street-address" value="${esc(val || st.label)}"><a class="btn" id="vxMapsA" href="${esc(mapsSearch(st.kind, val || st.label))}" target="_blank" rel="noopener noreferrer">${I('search')} Buscar</a></div></div></section>`;
  const gps = denied ? '' : `<button type="button" class="btn ${edit ? 'ghost' : 'big'} wide" data-vx="locate"${st.locating ? ' disabled aria-busy="true"' : ''}>${I('pin')} ${st.locating ? 'Buscando tu ubicación…' : 'Usar mi ubicación'}</button>`;
  const zoneRow = z ? `<div class="vx-zrow"><span>${I('heart')} Mi zona: <b>${esc(z.label)}</b></span><span class="vx-zbtns">${isZone() ? '' : '<button type="button" class="btn sm soft" data-vx="zoneUse">Usar</button>'}<button type="button" class="btn sm ghost" data-vx="zoneDel" aria-label="Borrar mi zona guardada">Borrar</button></span></div>` : '';
  return `<section class="card vx-loc" id="vxLoc" aria-labelledby="vxLocH">
    <h2 id="vxLocH">${edit ? 'Cambiar ubicación' : '¿Dónde buscamos?'}</h2>
    ${denied ? '<p class="vx-err" role="alert">No pudimos usar tu ubicación. Escribí tu barrio, ciudad o dirección y elegila de la lista.</p>' : ''}
    ${edit ? '' : gps}
    <form class="vx-area" id="vxAreaF" novalidate autocomplete="off"><label for="vxArea" id="vxAreaL">Barrio, ciudad o dirección</label>
      <div class="vx-area-r"><input id="vxArea" maxlength="80" autocomplete="off" spellcheck="false" enterkeyhint="search" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="vxSug" aria-describedby="vxAreaH" placeholder="Gobernador Martínez 2786, Corrientes" value="${esc(val)}"><button class="btn ${edit || denied ? '' : 'ghost'}" type="submit">Buscar</button></div>
      <small class="dim" id="vxAreaH">Escribí y elegí de la lista (calle y número, barrio o ciudad).</small>
      <div class="vx-sug-box" id="vxSugBox" aria-live="polite">${sugHtml()}</div></form>
    ${zoneRow}
    ${edit ? `<div class="vx-loc-acts">${gps}<button type="button" class="btn ghost wide" data-vx="cancel">Cancelar</button></div>` : ''}
    <p class="note">Usamos la ubicación aproximada solo para esta búsqueda, con Google. Este navegador recuerda la última hasta que cierres la pestaña; "mi zona" queda en tu cuenta solo si la guardás.</p>
  </section>`;
}

function results(force) {
  const list = st.res[resKey()] || [];
  const k = st.kind, area = st.label, phase = force || st.phase;
  if (phase === 'loading') return `<div class="vx-busy" role="status" aria-live="polite">${'<span class="sk" style="height:64px;border-radius:14px"></span>'.repeat(4)}<span class="sr">Buscando…</span></div>`;
  if (phase === 'paused') return `<div class="empty">${'<span class="ib c-viaje">' + I('search') + '</span>'}<h2>La búsqueda está en pausa</h2><p>Por este mes llegamos al límite de búsquedas de Mimitos. Buscá directo en Google Maps: es gratis y abre en tu celu.</p><a class="btn" href="${esc(mapsSearch(k, area))}" target="_blank" rel="noopener noreferrer">${I('search')} Buscar en Google Maps</a></div>`;
  if (phase === 'off') return `<div class="empty"><h2>Todavía no está activo</h2><p>Mientras tanto, buscá directo en Google Maps.</p><a class="btn" href="${esc(mapsSearch(k, area))}" target="_blank" rel="noopener noreferrer">${I('search')} Buscar en Google Maps</a></div>`;
  if (phase === 'error') return `<div class="empty"><h2>No pudimos buscar</h2><p>${esc(st.err)}</p><div class="btns"><button type="button" class="btn" data-vx="retry">Probar de nuevo</button><a class="btn ghost" href="${esc(mapsSearch(k, area))}" target="_blank" rel="noopener noreferrer">Buscar en Google Maps</a></div></div>`;
  if (!list.length) return `<div class="empty dash"><p>No encontramos ${k === 'pet' ? 'pet shops' : k === 'er' ? 'guardias' : 'veterinarias'} a menos de 5 km.</p><a class="btn sm ghost" href="${esc(mapsSearch(k, area))}" target="_blank" rel="noopener noreferrer">Buscar en Google Maps</a></div>`;
  const credits = [...new Map(list.flatMap(p => p.credits || []).map(c => [c.provider, c])).values()];
  return `<div class="vx-res">
    ${mapFrame(list)}
    <div class="vx-list"><div class="list" role="list">${list.map(placeRow).join('')}</div>
    ${ATTR}${credits.length ? `<p class="note vx-credits">Datos también de ${credits.map(c => c.uri ? `<a href="${esc(c.uri)}" target="_blank" rel="noopener noreferrer">${esc(c.provider)}</a>` : esc(c.provider)).join(', ')}.</p>` : ''}
    ${k === 'er' ? '<p class="note">Llamá antes de ir: el horario de guardia puede cambiar los feriados.</p>' : ''}</div>
  </div>`;
}

function render(p, arg) {
  const c = ctxOf(arg);
  if (c.petId !== st.ctx.petId || c.recId !== st.ctx.recId) { st.ctx = c; st.sel = null; }
  const pet = (c.petId && A().petById(c.petId)) || p;
  if (!st.cfg) loadCfg().then(() => A().render());
  const rec = contextRec(pet);
  const has = searched();
  const tabs = `<div class="chips vx-tabs" role="group" aria-label="Qué buscar">${KINDS.map(([k, l]) => `<button type="button" class="chip" data-vx="kind" data-k="${k}" aria-pressed="${st.kind === k}">${l}</button>`).join('')}</div>`;
  const left = st.cfg && Number.isFinite(st.cfg.left) && st.cfg.left <= 5 && !st.cfg.paused ? `<p class="note">Te ${st.cfg.left === 1 ? 'queda 1 búsqueda' : `quedan ${st.cfg.left} búsquedas`} hoy.</p>` : '';
  const off = st.cfg && !st.cfg.ready, paused = st.cfg?.paused;
  const blocked = paused || off;
  /* ubicación recordada (o restaurada) sin resultados en memoria: se busca una vez, ya con la config cargada */
  /* sin ubicación en esta pestaña: arranca en "mi zona" si la guardó (una vez) */
  if (!has && !st.zoneTried && zone() && st.cfg?.ready) { st.zoneTried = true; const z = zone(); Object.assign(st, { coords: { lat: z.lat, lng: z.lng }, label: z.label, zoneLabel: z.label, phase: 'idle' }); }
  const hasNow = searched();
  if (hasNow && st.phase === 'idle' && !st.res[resKey()] && st.cfg?.ready && !blocked) { st.phase = 'loading'; setTimeout(search, 0); }
  const loc = off ? '' : paused ? locForm(true) : !hasNow || st.editing ? locForm() : locBar();
  const main = blocked ? results(off ? 'off' : 'paused') : hasNow ? results() : '';
  return `<button class="link" data-act="go" data-to="${esc(st.from)}" style="align-self:flex-start">${I('back')} ${st.from === 'agenda' ? 'Agenda' : st.from === 'libreta' ? 'Libreta' : 'Inicio'}</button>
  <div class="vx">
    <div class="lib-top"><div><span class="eyebrow">Pedir turno · ${esc(pet.name)}</span><h1 class="h-xl">Veterinarias cerca</h1></div>
</div>
    ${rec ? `<div class="banner vx-why">${'<span class="ib c-salud">' + I('syringe') + '</span>'}<span><b>${esc(Z.TYPE[rec.type] || 'Fecha')}: ${esc(rec.name)}</b><small class="dim">${esc(Cap(T.reasonFrom(rec, iso(Z.today()))))}. Lo sumamos al mensaje.</small></span></div>` : ''}
    ${myVetCard(pet)}
    ${tabs}
    ${loc}
    ${main}
    ${left}
  </div>`;
}
const Cap = t => t.charAt(0).toUpperCase() + t.slice(1);

/* ---------- ficha de un lugar ---------- */
async function openPlace(i) {
  const list = st.res[resKey()] || [], pl = list[i]; if (!pl) return;
  st.sel = pl.id;
  const p = A().petById(st.ctx.petId) || A().curPet();
  /* con el field mask Pro (o si Google no trajo el teléfono en la lista) el detalle se pide al tocar */
  if (!pl.detailed) {
    A().panel(pl.name, '<div class="vx-busy" role="status" aria-live="polite"><span class="sk" style="height:120px;border-radius:14px"></span><span class="sr">Cargando…</span></div>');
    try { const { ok, d } = await api('details', { id: pl.id }); if (ok && d.place) Object.assign(pl, { ...d.place, m: pl.m, name: pl.name || d.place.name }); pl.detailed = true; } catch {}
  }
  placeSheet(p, pl);
}
function placeSheet(p, pl) {
  const rec = contextRec(p), today = iso(Z.today());
  const reason = T.reasonFrom(rec, today);
  const phone = pl.intl || pl.phone;
  const msg = T.waMessage(p, reason), wa = T.waLink(phone, msg), tel = T.telLink(pl.phone || pl.intl);
  const asEr = st.kind === 'er';
  const saved = asEr ? p.vet?.er === pl.name : p.vetPlace?.placeId === pl.id;
  const dl = [['Dirección', esc(pl.address)], ['Distancia', distTxt(pl.m)], ['Ahora', pl.open == null ? '' : pl.open ? 'Abierto' : 'Cerrado'], ['Opiniones en Google', pl.rating != null ? `${pl.rating.toFixed(1).replace('.', ',')} de 5${pl.ratings ? ` (${pl.ratings.toLocaleString('es-AR')})` : ''}` : ''], ['Teléfono', esc(pl.phone || pl.intl)]].filter(r => r[1]);
  A().panel(pl.name, `<dl class="dl">${dl.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
    ${wa ? `<div class="f vx-msg"><label for="vxMsg">Mensaje para WhatsApp</label><textarea id="vxMsg" maxlength="500" rows="4">${esc(msg)}</textarea><small>Editalo como quieras antes de mandarlo.</small></div>` : ''}
    <div class="d-acts">
      ${wa ? `<a class="btn wide big" id="vxWa" href="${esc(wa)}" target="_blank" rel="noopener noreferrer">${I('chat')} Pedir turno por WhatsApp</a>` : ''}
      ${tel ? `<a class="btn wide ${wa ? 'ghost' : 'big'}" href="${esc(tel)}">${I('phone')} Llamar</a>` : '<p class="note">Google no tiene su teléfono. Probá con "Cómo llegar" o buscalo en Google Maps.</p>'}
      <a class="btn ghost wide" href="${esc(pl.maps ? directions(pl) : directions(pl))}" target="_blank" rel="noopener noreferrer">${I('pin')} Cómo llegar</a>
      <button type="button" class="btn ghost wide" data-vp="save"${saved ? ' disabled' : ''}>${I('heart')} ${saved ? (asEr ? 'Es tu guardia' : 'Es tu veterinaria') : asEr ? 'Guardar como mi guardia 24 h' : `Guardar como mi veterinaria`}</button>
      <button type="button" class="btn soft wide" data-vp="appt">${I('cal')} Anotar turno</button>
      ${pl.maps ? `<a class="link" href="${esc(pl.maps)}" target="_blank" rel="noopener noreferrer">Ver en Google Maps</a>` : ''}
    </div>${ATTR}`);
  const body = $('#pBody');
  const ta = $('#vxMsg');
  if (ta) ta.addEventListener('input', () => { const a = $('#vxWa'); if (a) a.href = T.waLink(phone, ta.value) || a.href; });
  body.onclick = e => {
    const b = e.target.closest('[data-vp]'); if (!b) return;
    if (b.dataset.vp === 'save') {
      if (asEr) { p.vet = { ...p.vet, er: pl.name.slice(0, 120), erPhone: (pl.phone || pl.intl || '').slice(0, 40) }; }
      else {
        const old = { vet: { ...p.vet }, vetPlace: { ...(p.vetPlace || {}) } };
        p.vetPlace = { name: pl.name, phone: pl.phone || pl.intl || '', address: pl.address || '', placeId: pl.id };
        p.vet = { ...p.vet, name: pl.name.slice(0, 80), phone: (pl.phone || pl.intl || '').slice(0, 40), address: (pl.address || '').slice(0, 120) };
        A().changed();
        b.disabled = true; b.innerHTML = `${I('heart')} Es tu veterinaria`;
        return A().toast(`${pl.name} quedó como la veterinaria de ${p.name}.`, { label: 'Deshacer', fn: () => { p.vet = old.vet; p.vetPlace = old.vetPlace; A().changed(); } });
      }
      A().changed(); b.disabled = true; b.innerHTML = `${I('heart')} Es tu guardia`;
      return A().toast(`${pl.name} quedó como la guardia de ${p.name}.`);
    }
    if (b.dataset.vp === 'appt') { A().dPanel.close(); apptForm(p, null, { place: { name: pl.name, phone: pl.phone || pl.intl || '', address: pl.address || '', placeId: pl.id }, rec }); }
  };
  A().render();
}

/* ---------- turnos ---------- */
const appts = () => { const d = A().doc; if (!Array.isArray(d.appointments)) d.appointments = []; return d.appointments; };
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
function apptForm(p, a, preset = {}) {
  const pets = A().doc.pets;
  const reason0 = a ? a.reason : preset.reason || (preset.rec ? Cap(T.reasonFrom(preset.rec, '').replace(/ — .*$/, '')) : '');
  const v = a ? { pet: a.petId, date: a.date, time: a.time, name: a.place.name, phone: a.place.phone, address: a.place.address, reason: a.reason }
    : { pet: p.id, date: '', time: '', name: preset.place?.name || p.vet?.name || '', phone: preset.place?.phone || p.vet?.phone || '', address: preset.place?.address || p.vet?.address || '', reason: reason0 };
  const placeId = a ? a.place.placeId : preset.place?.placeId || (p.vetPlace?.name && p.vetPlace.name === p.vet?.name ? p.vetPlace.placeId : '');
  A().openForm({
    title: a ? 'Turno' : 'Anotar turno', intro: a ? '' : 'Te avisamos el día anterior y 2 horas antes.', values: v, noFocus: true,
    fields: [
      ...(pets.length > 1 ? [{ k: 'pet', label: '¿Para quién?', type: 'select', options: pets.map(x => [x.id, x.name]) }] : []),
      [{ k: 'date', label: 'Día', type: 'date' }, { k: 'time', label: 'Hora', type: 'time', opt: true }],
      { k: 'name', label: 'Dónde', max: 120, ph: 'Veterinaria San Roque' },
      [{ k: 'phone', label: 'Teléfono', type: 'tel', max: 40, opt: true }, { k: 'address', label: 'Dirección', max: 160, opt: true }],
      { k: 'reason', label: 'Motivo', max: 200, ph: 'Antirrábica, control anual, se rasca…', opt: true },
    ],
    onDelete: a ? () => { const list = appts(), i = list.indexOf(a); if (i < 0) return null; list.splice(i, 1); return { msg: 'Turno borrado.', undo: () => list.splice(i, 0, a) }; } : null,
    deleteLabel: 'Borrar turno',
    onSave(x) {
      if (!x.date) return 'Elegí el día del turno.';
      if (!a && x.date < iso(Z.today())) return 'El día ya pasó. Si ya fueron, cargalo como consulta.';
      if (x.time && !T.okTime(x.time)) return 'La hora tiene que ser como 17:30.';
      const it = a || { id: uid(), logged: false };
      Object.assign(it, { petId: x.pet || p.id, date: x.date, time: x.time || '', reason: x.reason, place: { name: x.name, phone: x.phone, address: x.address, placeId: x.name === v.name ? placeId : '' } });
      if (!a) appts().push(it);
      const on = A().notify && (A().notify.devices || A().notify.mail);
      A().toast(a ? 'Turno actualizado.' : on ? `Anotado. Te avisamos el ${T.dayShort(T.addDays(x.date, -1))} y 2 horas antes.` : 'Anotado en la agenda. Activá los avisos para que te recordemos.');
    },
  });
}
function apptPanel(a) {
  const p = A().petById(a.petId); if (!p) return;
  const now = T.localNow(), past = T.toLog([{ ...a, logged: false }], now).length > 0;
  const wa = T.waLink(a.place.phone, T.waMessage(p, a.reason)), tel = T.telLink(a.place.phone);
  const dl = [['Cuándo', `${Cap(T.dayLong(a.date))}${a.time ? ', ' + T.hhmm(a.time) : ''}`], ['Dónde', esc(a.place.name)], ['Dirección', esc(a.place.address)], ['Teléfono', esc(a.place.phone)], ['Motivo', esc(a.reason)]].filter(r => r[1]);
  A().panel(`Turno de ${p.name}`, `<dl class="dl">${dl.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
    <div class="d-acts">
      ${past && !a.logged ? `<button type="button" class="btn big wide" data-vp="log">${I('steth')} Cargá lo que le hicieron</button>` : ''}
      ${!past && wa ? `<a class="btn wide" href="${esc(wa)}" target="_blank" rel="noopener noreferrer">${I('chat')} Escribir por WhatsApp</a>` : ''}
      ${!past && tel ? `<a class="btn ghost wide" href="${esc(tel)}">${I('phone')} Llamar</a>` : ''}
      ${!past && (a.place.name || a.place.address) ? `<a class="btn ghost wide" href="${esc(directions(a.place))}" target="_blank" rel="noopener noreferrer">${I('pin')} Cómo llegar</a>` : ''}
      ${!past ? `<button type="button" class="btn ghost wide" data-vp="ics">${I('cal')} Agregar al calendario</button>` : ''}
      <button type="button" class="btn ghost wide" data-vp="edit">${I('edit')} Editar o borrar</button>
    </div>`);
  $('#pBody').onclick = e => {
    const b = e.target.closest('[data-vp]'); if (!b) return;
    if (b.dataset.vp === 'ics') return A().calendar([apptEvent(a)], `${p.name} turno`);
    A().dPanel.close();
    if (b.dataset.vp === 'edit') return apptForm(p, a);
    if (b.dataset.vp === 'log') return logAppt(a);
  };
}
/* "¿Cómo te fue?": la carga de consulta prellenada con lo del turno */
function logAppt(a) {
  const p = A().petById(a.petId); if (!p) return;
  A().visitForm(p, null, { date: a.date, reason: a.reason, vet: a.place.name, onSaved: () => { a.logged = true; } });
}
function apptEvent(a) {
  const p = A().petById(a.petId); if (!p) return null;
  const [y, m, d] = a.date.split('-').map(Number);
  const title = `${p.name}: turno${a.place.name ? ' en ' + a.place.name : ''}`;
  const desc = [a.reason, a.place.address, a.place.phone].filter(Boolean).join(' · ') + ' · Mimitos';
  if (T.okTime(a.time)) return { uid: `${p.id}-appt-${a.id}`, start: new Date(y, m - 1, d, +a.time.slice(0, 2), +a.time.slice(3)), title, desc, alarms: ['-P1D', '-PT2H'] };
  /* sin hora: día completo, aviso a las 9 del día anterior y a las 9 del día */
  return { uid: `${p.id}-appt-${a.id}`, allDay: true, start: new Date(y, m - 1, d), title, desc, alarms: ['-PT15H', 'PT9H'] };
}
const events = doc => T.upcoming(doc.appointments || [], T.localNow()).map(apptEvent).filter(Boolean);

/* Agenda: turnos que vienen, con el mismo formato que las demás fechas */
function agendaItems(doc) {
  return T.upcoming(doc.appointments || [], T.localNow()).map(a => { const pet = doc.pets.find(p => p.id === a.petId); return pet && { date: a.date, pet, kind: 'appt', a, s: Z.status(a.date), title: `Turno${a.place.name ? ' en ' + a.place.name : ''}`, sub: [a.time ? T.hhmm(a.time) : '', a.reason].filter(Boolean).join(' · ') || 'Turno' }; }).filter(Boolean);
}
function agendaRow(x) {
  return `<div class="row ${x.s?.c || ''}"><span class="ag-date"><b>${fmt(x.date, { day: 'numeric' })}</b><small>${fmt(x.date, { month: 'short' }).replace('.', '')}</small></span><button class="what plain" data-vx="apptOpen" data-id="${esc(x.a.id)}"><b>${esc(x.title)}</b><small>${esc(x.pet.name)} · ${x.s && x.s.days <= 14 ? `<span class="stt">${x.s.t}${x.a.time ? ', ' + T.hhmm(x.a.time) : ''}</span>${x.a.reason ? ' · ' + esc(x.a.reason) : ''}` : esc(x.sub)}</small></button><button class="ibtn" data-vx="apptIcs" data-id="${esc(x.a.id)}" aria-label="Agregar el turno al calendario">${I('cal')}</button></div>`;
}
/* Inicio: turnos de los próximos 14 días y "¿Cómo te fue?" de los que ya pasaron */
function homeItems(p) {
  const now = T.localNow(), list = (A().doc.appointments || []).filter(a => a.petId === p.id), out = [];
  for (const a of T.toLog(list, now)) out.push({ order: -3, html: `<div class="row st-soon"><span class="ib c-cuida">${I('steth')}</span><button class="what plain" data-vx="apptLog" data-id="${esc(a.id)}"><b>¿Cómo te fue${a.place.name ? ' en ' + esc(a.place.name) : ''}?</b><small>Cargá lo que le hicieron</small></button><button class="ibtn" data-vx="apptSkip" data-id="${esc(a.id)}" aria-label="No hace falta cargarlo">${I('x')}</button></div>` });
  for (const a of T.upcoming(list, now)) {
    const s = Z.status(a.date); if (!s || s.days > 14) continue;
    out.push({ order: s.days, html: `<div class="row ${s.c}"><span class="ib c-cuida">${I('cal')}</span><button class="what plain" data-vx="apptOpen" data-id="${esc(a.id)}"><b>Turno${a.place.name ? ' en ' + esc(a.place.name) : ''}</b><small><span class="stt">${s.t}${a.time ? ', ' + T.hhmm(a.time) : ''}</span>${a.reason ? ' · ' + esc(a.reason) : ''}</small></button><button class="ibtn" data-vx="apptIcs" data-id="${esc(a.id)}" aria-label="Agregar el turno al calendario">${I('cal')}</button></div>` });
  }
  return out;
}

/* "Pedir turno" desde una fecha vencida: con "Mi veterinaria", directo a ella; si no, a buscar */
async function start(p, rec, from = 'inicio') {
  st.from = from;
  /* si venimos de otra hoja, su evento "close" (que limpia el panel) llega en la próxima vuelta: esperamos */
  await new Promise(r => setTimeout(r, 0));
  const arg = p.id + (rec ? '|' + rec.id : '');
  const v = p.vet || {};
  if (v.name && v.phone) {
    const msg = T.waMessage(p, T.reasonFrom(rec, iso(Z.today()))), wa = T.waLink(v.phone, msg), tel = T.telLink(v.phone);
    A().panel(`Pedir turno en ${v.name}`, `<p class="dim">${esc(msg)}</p><div class="d-acts">
      ${wa ? `<a class="btn big wide" href="${esc(wa)}" target="_blank" rel="noopener noreferrer">${I('chat')} Pedir turno por WhatsApp</a>` : ''}
      ${tel ? `<a class="btn wide ${wa ? 'ghost' : 'big'}" href="${esc(tel)}">${I('phone')} Llamar</a>` : ''}
      <button type="button" class="btn ghost wide" data-vp="appt">${I('cal')} Anotar turno</button>
      <button type="button" class="btn ghost wide" data-vp="other">${I('search')} Buscar otra veterinaria</button></div>`);
    $('#pBody').onclick = e => {
      const b = e.target.closest('[data-vp]'); if (!b) return;
      A().dPanel.close();
      if (b.dataset.vp === 'appt') return apptForm(p, null, { rec });
      A().go('vets', arg);
    };
    return;
  }
  A().go('vets', arg);
}

/* ---------- acciones ---------- */
document.addEventListener('click', e => {
  const b = e.target.closest('[data-vx]'); if (!b || !$('#app').contains(b)) return;
  const id = b.dataset.id, find = () => appts().find(a => a.id === id);
  switch (b.dataset.vx) {
    case 'locate': return locate();
    case 'open': st.from = b.dataset.from || 'inicio'; return A().go('vets', b.dataset.arg || '');
    case 'kind': st.kind = b.dataset.k; st.sel = null; if (searched()) return search(); return A().render();
    case 'retry': return search();
    case 'where': Object.assign(st, { editing: true, locMsg: '', draft: '', sug: [], sugFor: '', sugMsg: '', active: -1 }); A().render(); return focusArea();
    case 'cancel': return closeEdit();
    case 'zoneSave': return saveZone();
    case 'zoneUse': { const z = zone(); return z && setLoc({ coords: { lat: z.lat, lng: z.lng }, label: z.label, zoneLabel: z.label }); }
    case 'zoneDel': return delZone();
    case 'place': return openPlace(+b.dataset.i);
    case 'appt': { const p = A().petById(st.ctx.petId) || A().curPet(); const v = p.vet || {}; return apptForm(p, null, { place: { name: v.name, phone: v.phone, address: v.address, placeId: p.vetPlace?.name === v.name ? p.vetPlace.placeId : '' }, rec: contextRec(p) }); }
    case 'apptOpen': { const a = find(); return a && apptPanel(a); }
    case 'apptIcs': { const a = find(); const p = a && A().petById(a.petId); return a && A().calendar([apptEvent(a)], `${p.name} turno`); }
    case 'apptLog': { const a = find(); return a && logAppt(a); }
    case 'apptSkip': { const a = find(); if (!a) return; a.logged = true; A().changed(); return A().toast('Listo.', { label: 'Deshacer', fn: () => { a.logged = false; A().changed(); } }); }
    case 'newAppt': { const p = A().curPet(); return p && apptForm(p, null, {}); }
  }
});
function closeEdit() {
  clearTimeout(timer); seq++;
  Object.assign(st, { editing: false, locMsg: '', draft: '', sug: [], sugFor: '', sugMsg: '', active: -1, token: '' });
  A().render(); requestAnimationFrame(() => $('[data-vx="where"]')?.focus());
}
function saveZone() {
  const d = A().doc; if (!st.coords || !st.zoneLabel) return;
  const old = d.zone;
  d.zone = { label: st.zoneLabel.slice(0, 60), lat: r3(st.coords.lat), lng: r3(st.coords.lng) };
  A().changed(); A().render();
  A().toast(`Listo: ${d.zone.label} quedó como tu zona. La próxima vez arrancamos ahí.`, { label: 'Deshacer', fn: () => { if (old) d.zone = old; else delete d.zone; A().changed(); A().render(); } });
}
function delZone() {
  const d = A().doc, old = d.zone; if (!old) return;
  delete d.zone; A().changed(); A().render(); focusArea();
  A().toast('Borramos tu zona de la cuenta.', { label: 'Deshacer', fn: () => { d.zone = old; A().changed(); A().render(); } });
}
document.addEventListener('submit', e => {
  if (e.target.id !== 'vxAreaF') return;
  e.preventDefault(); submitArea();
});
/* combobox: 300 ms de pausa y 4 letras antes de pedir sugerencias; la lista se dibuja sola, sin tocar el campo */
document.addEventListener('input', e => {
  if (e.target.id === 'vxMapsQ') { const a = $('#vxMapsA'); if (a) a.href = mapsSearch(st.kind, clip(e.target.value, 80)); st.draft = clip(e.target.value, 80); return; }
  if (e.target.id !== 'vxArea') return;
  st.draft = e.target.value; st.active = -1;
  if (st.sugMsg === 'pick' || st.sugMsg === 'none') st.sugMsg = '';
  clearTimeout(timer);
  const q = clip(e.target.value, 80);
  if (q.length < MIN_Q) { seq++; st.sug = []; st.sugFor = ''; st.sugMsg = ''; return patchSug(); }
  timer = setTimeout(() => fetchSug(q), DEBOUNCE);
});
document.addEventListener('click', e => {
  const o = e.target.closest?.('[data-vxs]'); if (!o) return;
  e.preventDefault(); pickSug(st.sug[+o.dataset.vxs]);
});
document.addEventListener('keydown', e => {
  if (e.target.id === 'vxArea' && st.sug.length && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
    e.preventDefault();
    const n = st.sug.length; st.active = e.key === 'ArrowDown' ? (st.active + 1) % n : (st.active - 1 + n) % n;
    return patchSug();
  }
  if (e.key !== 'Escape' || !st.editing && !st.sug.length || !e.target.closest?.('#vxLoc')) return;
  e.preventDefault();
  /* Escape: primero cierra la lista; después, la edición sin cambiar nada */
  if (st.sug.length) { st.sug = []; st.sugFor = ''; st.active = -1; st.sugMsg = ''; return patchSug(); }
  closeEdit();
});

window.MZVETS = { render, start, agendaItems, agendaRow, homeItems, events, apptForm, state: st };
})();
