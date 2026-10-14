/* Mimitos · "Veterinarias cerca" y turnos. Necesita mascotas-core.js (window.MZ), mascotas-turnos.js
   (window.MZTURNOS) y el puente de mascotas-app.js (window.MZAPP).

   - La ubicación se pide solo al tocar "Usar mi ubicación" y vive en memoria mientras la pantalla está abierta:
     no se guarda en el navegador ni en el servidor. Si no hay permiso: "Barrio o ciudad".
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

/* estado en memoria (nunca en localStorage) */
const st = { from: 'inicio', kind: 'vet', coords: null, area: '', phase: 'idle', err: '', cfg: null, res: {}, ctx: { petId: '', recId: '' }, sel: null };
const resKey = () => st.kind + '|' + (st.coords ? `${st.coords.lat.toFixed(3)},${st.coords.lng.toFixed(3)}` : 'q:' + st.area.toLowerCase());

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
  try { out = st.coords ? await api('nearby', { kind: st.kind, lat: st.coords.lat, lng: st.coords.lng }) : await api('text', { kind: st.kind, q: st.area }); }
  catch { st.phase = 'error'; st.err = 'Sin conexión. Probá de nuevo en un rato.'; return A().render(); }
  const { ok, status, d } = out;
  if (ok) {
    let list = d.places || [];
    if (st.coords) list = list.map(p => ({ ...p, m: dist(st.coords, p) })).sort((a, b) => (a.m ?? 1e9) - (b.m ?? 1e9));
    st.res[key] = list; st.phase = 'ok';
    if (st.cfg && Number.isFinite(d.left)) st.cfg.left = d.left;
  } else if (d.error === 'maps_paused') { st.phase = 'paused'; if (st.cfg) st.cfg.paused = true; }
  else if (d.error === 'maps_no_configurado') { st.phase = 'off'; }
  else if (status === 429) { st.phase = 'error'; st.err = `Llegaste a las ${d.limit || 20} búsquedas de hoy. Mañana se renuevan; mientras tanto, buscá directo en Google Maps.`; }
  else if (status === 401) { st.phase = 'error'; st.err = 'Entrá de nuevo a tu cuenta para buscar.'; }
  else { st.phase = 'error'; st.err = 'Google no respondió. Probá de nuevo en un rato.'; }
  A().render();
}
function locate() {
  if (!('geolocation' in navigator)) { st.phase = 'denied'; return A().render(); }
  st.phase = 'locating'; A().render();
  navigator.geolocation.getCurrentPosition(pos => {
    st.coords = { lat: pos.coords.latitude, lng: pos.coords.longitude }; st.area = '';
    search();
  }, () => { st.phase = 'denied'; A().render(); requestAnimationFrame(() => $('#vxArea')?.focus()); }, { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 });
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
    : st.coords ? `${base}search?key=${encodeURIComponent(key)}&q=${encodeURIComponent(kindWords(st.kind))}&center=${st.coords.lat.toFixed(3)},${st.coords.lng.toFixed(3)}&zoom=14&language=es&region=AR`
    : `${base}search?key=${encodeURIComponent(key)}&q=${encodeURIComponent(kindWords(st.kind) + ' en ' + st.area)}&language=es&region=AR`;
  /* referrerpolicy: la página va con no-referrer, pero la clave del mapa está restringida por referrer */
  return list.length ? `<div class="vx-map"><iframe title="Mapa de ${esc(KINDS.find(k => k[0] === st.kind)[1].toLowerCase())} en Google Maps" src="${esc(src)}" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></div>` : '';
}

function placeRow(pl, i) {
  const meta = [pl.m != null ? distTxt(pl.m) : '', pl.address].filter(Boolean).map(esc).join(' · ');
  return `<button type="button" class="row link-row vx-row" data-vx="place" data-i="${i}" aria-current="${st.sel === pl.id}">
    <span class="vx-n" aria-hidden="true">${i + 1}</span>
    <span class="what"><b>${esc(pl.name)}</b><small>${meta}</small><span class="vx-meta">${openTag(pl.open)}${stars(pl.rating, pl.ratings)}</span></span>${I('chevron')}</button>`;
}

function locBox() {
  const denied = st.phase === 'denied';
  return `<section class="card vx-loc" aria-labelledby="vxLocH">
    <h2 id="vxLocH">${denied ? 'No pudimos usar tu ubicación' : '¿Dónde buscamos?'}</h2>
    ${denied ? '<p class="dim">Está bien. Escribí tu barrio o tu ciudad y buscamos por ahí.</p>' : `<button type="button" class="btn big wide" data-vx="locate"${st.phase === 'locating' ? ' disabled' : ''}>${I('pin')} ${st.phase === 'locating' ? 'Buscando tu ubicación…' : 'Usar mi ubicación'}</button>`}
    <form class="vx-area" id="vxAreaF" novalidate><label for="vxArea">Barrio o ciudad</label><div class="vx-area-r"><input id="vxArea" maxlength="80" autocomplete="address-level2" placeholder="Palermo, Córdoba, Mar del Plata…" value="${esc(st.area)}"><button class="btn ${denied ? '' : 'ghost'}" type="submit">Buscar</button></div></form>
    <p class="note">Usamos tu ubicación aproximada solo para esta búsqueda, con Google. No la guardamos.</p>
  </section>`;
}

function results(force) {
  const list = st.res[resKey()] || [];
  const k = st.kind, area = st.coords ? '' : st.area, phase = force || st.phase;
  if (phase === 'loading' || phase === 'locating') return `<div class="vx-busy" role="status" aria-live="polite">${'<span class="sk" style="height:64px;border-radius:14px"></span>'.repeat(4)}<span class="sr">Buscando…</span></div>`;
  if (phase === 'paused') return `<div class="empty">${'<span class="ib c-viaje">' + I('search') + '</span>'}<h2>La búsqueda está en pausa</h2><p>Por este mes llegamos al límite de búsquedas de Mimitos. Buscá directo en Google Maps: es gratis y abre en tu celu.</p><a class="btn" href="${esc(mapsSearch(k, area))}" target="_blank" rel="noopener noreferrer">${I('search')} Buscar en Google Maps</a></div>`;
  if (phase === 'off') return `<div class="empty"><h2>Todavía no está activo</h2><p>Mientras tanto, buscá directo en Google Maps.</p><a class="btn" href="${esc(mapsSearch(k, area))}" target="_blank" rel="noopener noreferrer">${I('search')} Buscar en Google Maps</a></div>`;
  if (phase === 'error') return `<div class="empty"><h2>No pudimos buscar</h2><p>${esc(st.err)}</p><div class="btns"><button type="button" class="btn" data-vx="retry">Probar de nuevo</button><a class="btn ghost" href="${esc(mapsSearch(k, area))}" target="_blank" rel="noopener noreferrer">Buscar en Google Maps</a></div></div>`;
  if (!list.length) return `<div class="empty dash"><p>No encontramos ${k === 'pet' ? 'pet shops' : k === 'er' ? 'guardias' : 'veterinarias'} ${st.coords ? 'a menos de 5 km' : `en "${esc(st.area)}"`}.</p><a class="btn sm ghost" href="${esc(mapsSearch(k, area))}" target="_blank" rel="noopener noreferrer">Buscar en Google Maps</a></div>`;
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
  const searched = st.coords || st.area;
  const tabs = `<div class="chips vx-tabs" role="group" aria-label="Qué buscar">${KINDS.map(([k, l]) => `<button type="button" class="chip" data-vx="kind" data-k="${k}" aria-pressed="${st.kind === k}">${l}</button>`).join('')}</div>`;
  const left = st.cfg && Number.isFinite(st.cfg.left) && st.cfg.left <= 5 && !st.cfg.paused ? `<p class="note">Te ${st.cfg.left === 1 ? 'queda 1 búsqueda' : `quedan ${st.cfg.left} búsquedas`} hoy.</p>` : '';
  const off = st.cfg && !st.cfg.ready, paused = st.cfg?.paused;
  const main = paused || off ? results(off ? 'off' : 'paused') : searched && st.phase !== 'denied' ? results() : locBox();
  return `<button class="link" data-act="go" data-to="${esc(st.from)}" style="align-self:flex-start">${I('back')} ${st.from === 'agenda' ? 'Agenda' : st.from === 'libreta' ? 'Libreta' : 'Inicio'}</button>
  <div class="vx">
    <div class="lib-top"><div><span class="eyebrow">Pedir turno · ${esc(pet.name)}</span><h1 class="h-xl">Veterinarias cerca</h1></div>
      ${searched ? `<div class="lib-tools"><button type="button" class="btn sm ghost" data-vx="where">${I('pin')} ${st.coords ? 'Cerca tuyo' : esc(st.area)} · Cambiar</button></div>` : ''}</div>
    ${rec ? `<div class="banner vx-why">${'<span class="ib c-salud">' + I('syringe') + '</span>'}<span><b>${esc(Z.TYPE[rec.type] || 'Fecha')}: ${esc(rec.name)}</b><small class="dim">${esc(Cap(T.reasonFrom(rec, iso(Z.today()))))}. Lo sumamos al mensaje.</small></span></div>` : ''}
    ${myVetCard(pet)}
    ${tabs}
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
    case 'kind': st.kind = b.dataset.k; st.sel = null; if (st.coords || st.area) return search(); return A().render();
    case 'retry': return search();
    case 'where': st.coords = null; st.phase = 'idle'; st.sel = null; A().render(); return $('#vxArea')?.focus();
    case 'place': return openPlace(+b.dataset.i);
    case 'appt': { const p = A().petById(st.ctx.petId) || A().curPet(); const v = p.vet || {}; return apptForm(p, null, { place: { name: v.name, phone: v.phone, address: v.address, placeId: p.vetPlace?.name === v.name ? p.vetPlace.placeId : '' }, rec: contextRec(p) }); }
    case 'apptOpen': { const a = find(); return a && apptPanel(a); }
    case 'apptIcs': { const a = find(); const p = a && A().petById(a.petId); return a && A().calendar([apptEvent(a)], `${p.name} turno`); }
    case 'apptLog': { const a = find(); return a && logAppt(a); }
    case 'apptSkip': { const a = find(); if (!a) return; a.logged = true; A().changed(); return A().toast('Listo.', { label: 'Deshacer', fn: () => { a.logged = false; A().changed(); } }); }
    case 'newAppt': { const p = A().curPet(); return p && apptForm(p, null, {}); }
  }
});
document.addEventListener('submit', e => {
  if (e.target.id !== 'vxAreaF') return;
  e.preventDefault();
  const v = ($('#vxArea')?.value || '').trim();
  if (v.length < 3) { $('#vxArea')?.focus(); return A().toast('Escribí tu barrio o tu ciudad (3 letras o más).'); }
  st.area = v; st.coords = null; st.sel = null; search();
});

window.MZVETS = { render, start, agendaItems, agendaRow, homeItems, events, apptForm, state: st };
})();
