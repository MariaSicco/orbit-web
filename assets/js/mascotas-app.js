/* Mimitos by Orbit · app de la dueña o el dueño. Necesita mascotas-core.js (window.MZ).
   Estructura: 5 secciones (Inicio, Libreta, Agenda, Gastos, Cuenta) con ruta en el hash,
   alta guiada de cero, libreta sanitaria digital y guardado en la cuenta de Orbit. */
(() => {
'use strict';
const Z = window.MZ;
const { esc, fmt, pd, iso, isoLocal, money, TYPE, EXP } = Z;
const I = Z.icon;
const $ = s => document.querySelector(s);
const app = $('#app');
const uid = () => Math.random().toString(16).slice(2, 10) + Date.now().toString(16).slice(-4);
const kg = n => String(n).replace('.', ',') + ' kg';
const SUGGEST = {
  perro: { vacuna: ['Antirrábica', 'Séxtuple', 'Óctuple', 'Tos de las perreras'], desparasitacion: ['Pipeta antipulgas', 'Comprimido antipulgas', 'Collar antipulgas', 'Antiparasitario interno'], control: ['Control anual', 'Control de peso', 'Análisis de sangre'] },
  gato: { vacuna: ['Antirrábica', 'Triple felina', 'Leucemia felina'], desparasitacion: ['Pipeta antipulgas', 'Antiparasitario interno'], control: ['Control anual', 'Control de peso', 'Análisis de sangre'] },
  otra: { vacuna: [], desparasitacion: ['Antiparasitario'], control: ['Control anual'] },
};

/* ---------- estado ---------- */
let mode = 'loading', doc = { pets: [] }, rev = 0, me = { email: '', name: '' };
let purchase = null, notify = null, scans = [], curId = '';
/* funciones inteligentes: vencimiento y, solo si quedan pocas, cuántas importaciones quedan (api/_lib/petquota.js) */
let aiq = null, renewAsked = false;
/* link del cuidador: hasta cuándo anda ({ active, until } o { active:false, expired:true }), lo manda el servidor */
let sitterLinks = {};
/* Conectar tu mail: estado de cada proveedor (undefined mientras carga, null si la cuenta no está habilitada) y la búsqueda en curso */
const mstat = { gmail: undefined, outlook: undefined };
let gm = null, msenders = [];
let route = { name: 'inicio' }, lastKey = '';
const ui = { hist: { type: 'todo', year: '', q: '' }, lib: { year: '', q: '', page: 0 }, agenda: { ym: iso(Z.today()).slice(0, 7), sel: iso(Z.today()) }, gastos: { ym: iso(Z.today()).slice(0, 7), pet: 'all' } };
const store = { get(k) { try { return localStorage.getItem('mimitos:' + k); } catch { return null; } }, set(k, v) { try { localStorage.setItem('mimitos:' + k, v); } catch {} } };

const blankPet = () => ({ id: uid(), name: '', species: 'perro', speciesOther: '', breed: '', sex: '', birth: '', color: '', marks: '', temper: '', chip: '', weight: null, allergies: '', photo: '', photos: [], notes: '',
  contact: { show: false, name: '', phone: '', note: '' }, vet: { name: '', phone: '', address: '', er: '', erPhone: '' }, lost: { on: false, since: '', place: '', note: '' }, qrNote: { show: false, text: '' }, hue: '', photoFull: '',
  share: '', sitterToken: '', sitter: { name: '', from: '', to: '', food: '', walks: '', where: '', habits: '', emergency: '', key: '', vetAuth: false, contact: '' },
  food: { brand: '', bagKg: null, dailyG: null, opened: '', bags: [] }, fund: { goal: null, monthly: null, saved: null }, trip: { dest: '', date: '' },
  neutered: '', chronic: '', onboarded: false, conditions: [], surgeries: [], visits: [], studies: [], weights: [],
  records: [], meds: [], expenses: [], symptoms: [], log: [] });
/* migración suave: completa lo que falte sin tocar lo cargado. Los registros viejos ganan
   lote (si la lectura de la libreta lo había dejado en las notas), sticker y alcance vacíos. */
const normRec = r => {
  if (r.lot == null) { const m = /^Producto: (.+)$/.exec(r.notes || ''); r.lot = m ? m[1] : ''; if (m) r.notes = ''; }
  if (r.sticker == null) r.sticker = '';
  if (r.scope == null) r.scope = r.type === 'desparasitacion' ? Z.scopeOf(r) : '';
  return r;
};
const norm = p => {
  const b = blankPet();
  for (const k in b) if (p[k] == null) p[k] = b[k]; else if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k])) p[k] = { ...b[k], ...p[k] };
  p.records.forEach(normRec);
  if (!Array.isArray(p.food.bags)) p.food.bags = [];
  return p;
};
/* color de cada mascota: fondo del Inicio, tapa de la libreta y pasaporte. Texto encima siempre en tinta (AA ≥ 5,2:1) */
const HUES = { azul: ['#4A90E2', '#FFF0F3', 'Azul'], verde: ['#34A574', '#FBF4EA', 'Verde'], rosa: ['#F2789F', '#FFF5EC', 'Rosa'], lila: ['#A58BF0', '#FFF4EE', 'Lila'], naranja: ['#FF8A4C', '#FFF7EC', 'Naranja'], amarillo: ['#F5C430', '#FFFBEE', 'Amarillo'], turquesa: ['#2FB5C0', '#FFF1EE', 'Turquesa'] };
const hueOf = p => HUES[p?.hue] || HUES.azul;
function applyHue(p) { const h = hueOf(p); document.body.style.setProperty('--hero', h[0]); document.body.style.setProperty('--sheet', h[1]); }
const swatches = (name, val) => `<div class="tiles swatches" role="group" aria-label="Color de su perfil" data-tiles="${name}">${Object.entries(HUES).map(([k, [c, , l]]) => `<button type="button" class="tile sw-c" data-v="${k}" aria-pressed="${(val || 'azul') === k}" style="--sw:${c}"><span class="dot" aria-hidden="true"></span><span>${l}</span></button>`).join('')}</div>`;
const petById = id => doc.pets.find(p => p.id === id);
const curPet = () => petById(curId) || doc.pets[0] || null;
function selectPet(id) { curId = id; store.set('pet', id); }

/* ---------- guardado: en la cuenta, con aviso si no hay conexión ---------- */
const saveEl = $('#save');
let saveTimer = null, saving = false, pending = false, dirty = false;
/* el estado de guardado solo es un botón cuando hay que reintentar; si no, no entra en el orden de tab */
const setSave = (t, st) => { saveEl.textContent = t; saveEl.className = 'save' + (st ? ' ' + st : ''); saveEl.onclick = null; saveEl.tabIndex = st === 'err' ? 0 : -1; if (t) { saveEl.removeAttribute('aria-hidden'); saveEl.title = t; } else { saveEl.setAttribute('aria-hidden', 'true'); saveEl.removeAttribute('title'); } };
function changed() {
  render();
  if (mode !== 'full') return;
  dirty = true; setSave('Guardando…', 'busy');
  clearTimeout(saveTimer); saveTimer = setTimeout(flush, 600);
}
async function flush() {
  saveTimer = null;
  if (saving) { pending = true; return; }
  if (!navigator.onLine) { setSave('Sin conexión · se guarda cuando vuelvas', 'off'); return; }
  saving = true;
  try {
    const r = await fetch('/api/mascotas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ doc, rev }) });
    const d = await r.json().catch(() => ({}));
    if (r.status === 409 && d.doc) { adopt(d.doc); dirty = false; render(); toast('Había cambios desde otro dispositivo. Revisá lo último que cargaste.'); setSave('Guardado'); }
    else if (r.status === 401) { setSave('Entrá de nuevo para guardar', 'err'); saveEl.onclick = () => { location.href = '/acceso?next=mascotas'; }; }
    else if (r.status === 413) { setSave('No se guardó: hay demasiado cargado', 'err'); toast('No se pudo guardar: la cuenta llegó al máximo de datos. Borrá registros viejos o fotos que no uses.'); }
    else if (r.status === 402) { setSave('No se guardó', 'err'); toast('No encontramos la compra de Mimitos en esta cuenta, así que no se pudo guardar.'); }
    else if (!r.ok) throw new Error(d.error || r.status);
    else { rev = d.doc.rev; dirty = false; setSave('Guardado'); }
  } catch (e) {
    if (!navigator.onLine || e instanceof TypeError) setSave('Sin conexión · se guarda cuando vuelvas', 'off');
    else { setSave('No se guardó · reintentar', 'err'); saveEl.onclick = () => flush(); toast('No se pudo guardar el último cambio. Tocá "reintentar" arriba.'); }
  } finally {
    saving = false;
    if (pending) { pending = false; flush(); }
  }
}
window.addEventListener('online', () => { if (mode === 'full' && dirty) flush(); });
async function flushNow() { if (saveTimer) { clearTimeout(saveTimer); await flush(); } while (saving) await new Promise(r => setTimeout(r, 100)); }
function adopt(d) { doc = d; doc.pets = (doc.pets || []).map(norm); rev = d.rev || 0; }
window.addEventListener('beforeunload', e => { if (mode === 'full' && dirty) { e.preventDefault(); e.returnValue = ''; } });
/* lo que anota el cuidador aparece al volver a la app */
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible' || mode !== 'full' || dirty || saving) return;
  try { const r = await fetch('/api/mascotas'); const d = await r.json(); if (r.ok && d.doc && !dirty) { adopt(d.doc); render(); } } catch {}
});

/* ---------- toasts (uno a la vez, con "Deshacer" opcional) ---------- */
function toast(t, action) {
  const el = $('#toast'); const dlg = document.querySelector('dialog[open]'); (dlg || document.body).appendChild(el);
  el.innerHTML = `<span>${esc(t)}</span>${action ? `<button type="button">${esc(action.label || 'Deshacer')}</button>` : ''}`;
  el.classList.toggle('act', Boolean(action));
  if (action) el.querySelector('button').onclick = () => { el.classList.remove('on'); action.fn(); };
  el.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('on'), action ? 6000 : 3200);
}
/* sacar algo de una lista y devolver cómo volver a ponerlo */
const drop = (arr, x) => { const i = arr.indexOf(x); if (i < 0) return () => {}; arr.splice(i, 1); return () => arr.splice(Math.min(i, arr.length), 0, x); };
function undoable(msg, restore) { changed(); toast(msg, { label: 'Deshacer', fn: () => { restore(); changed(); toast('Listo, volvió.'); } }); }

/* ---------- utilidades ---------- */
const avatar = (p, cls = '') => `<div class="av ${cls}${p.photoFull ? ' cut' : ''}" style="background:${hueOf(p)[0]};color:var(--ink)">${p.photo ? `<img src="${esc(p.photo)}" alt="">` : Z.petIcon(p)}</div>`;
const bubble = (ic, c) => `<span class="ib c-${c}">${I(ic)}</span>`;
const la = p => p.sex === 'm' ? 'lo' : 'la';
/* "quien la cuida" / "quien lo cuida"; sin sexo cargado, neutro con el nombre */
const quienCuida = p => p.sex === 'm' ? 'quien lo cuida' : p.sex === 'h' ? 'quien la cuida' : `quien cuida a ${p.name}`;
const Cap = t => t.charAt(0).toUpperCase() + t.slice(1);
function download(name, text, type = 'text/calendar') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
function calendar(events, name) {
  events = events.filter(Boolean);
  if (!events.length) return toast('No hay fechas para agregar.');
  download(name.replace(/[^\wáéíóúñ -]/gi, '') + '.ics', Z.ics(events));
  toast('Abrí el archivo para sumarlo a tu calendario.');
}
function shrink(file, max, q) {
  return new Promise((ok, no) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => { const s = Math.min(1, max / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); ok(c.toDataURL('image/jpeg', q)); };
    img.onerror = () => { URL.revokeObjectURL(url); no(); };
    img.src = url;
  });
}
/* ---------- recorte de la foto (MediaPipe, en el navegador; se carga recién acá) ---------- */
let cutLib = null;
function loadCut() {
  if (window.MZCUT) return Promise.resolve(window.MZCUT);
  if (!cutLib) cutLib = new Promise((ok, no) => { const sc = document.createElement('script'); sc.type = 'module'; sc.src = '/assets/js/mascotas-cutout.js?v=3'; sc.onload = () => setTimeout(() => window.MZCUT ? ok(window.MZCUT) : no(new Error('cut')), 0); sc.onerror = () => { cutLib = null; no(new Error('cut')); }; document.head.appendChild(sc); });
  return cutLib;
}
function cutFlow(file, pet) {
  const dlg = $('#dCut'), body = $('#cutBody'), name = esc(pet.name || 'tu mascota'), bg = hueOf(pet)[0];
  return new Promise(async done => {
    let full, result = null, settled = false;
    const finish = v => { if (settled) return; settled = true; dlg.close(); done(v); };
    dlg.onclose = () => finish(null);
    try { full = await shrink(file, 1024, .85); } catch { toast('No pudimos leer esa foto. Probá con otra.'); return done(null); }
    const show = (html) => { body.innerHTML = html; };
    const actions = (cutPng, msg) => {
      result = cutPng;
      show(`<div class="cut-prev" style="--bg:${bg}">${CLOUDS}<img src="${cutPng}" alt="Recorte de ${name}"></div>
        <p class="dim">${msg}</p>
        <button class="btn big wide" id="cutUse">Usar recorte</button>
        <button class="btn ghost wide" id="cutFull">Usar foto entera</button>
        <button class="link" id="cutTouch">${I('hand')} No quedó bien: tocá a ${name} en la foto</button>`);
      $('#cutUse').onclick = async () => finish({ photo: result, photoFull: await shrink(file, 900, .8) });
      $('#cutFull').onclick = () => finish({ photo: full, photoFull: '' });
      $('#cutTouch').onclick = touchStep;
    };
    const touchStep = () => {
      show(`<p class="lead-s"><b>Tocá a ${name}</b> en la foto, en el medio del cuerpo.</p>
        <button class="cut-touch" id="cutPick" aria-label="Foto: tocá a tu mascota"><img src="${full}" alt=""></button>
        <p class="amsg" id="cutMsg" role="status"></p>
        <button class="btn ghost wide" id="cutRound">Mejor un recorte redondo</button>
        <button class="btn ghost wide" id="cutFull2">Usar foto entera</button>`);
      $('#cutFull2').onclick = () => finish({ photo: full, photoFull: '' });
      $('#cutRound').onclick = async () => { const r = await (await loadCut().catch(() => null))?.round(full).catch(() => null); finish(r ? { photo: r, photoFull: await shrink(file, 900, .8) } : { photo: full, photoFull: '' }); };
      $('#cutPick').onclick = async e => {
        const im = e.currentTarget.querySelector('img').getBoundingClientRect();
        const x = (e.clientX - im.left) / im.width, y = (e.clientY - im.top) / im.height;
        $('#cutMsg').textContent = 'Recortando…';
        try { const C = await loadCut(); const r = await C.touch(full, x, y); window.MZCUT_LAST = { ...(window.MZCUT_LAST || {}), touch: r.ms };
          if (r.found) actions(r.png, 'Así queda sobre su color.'); else $('#cutMsg').textContent = 'No la pudimos separar. Probá tocando en otro lugar o usá el recorte redondo.'; }
        catch { $('#cutMsg').textContent = 'Esto necesita conexión. Probá de nuevo o usá la foto entera.'; }
      };
    };
    show(`<div class="cut-prev busy" style="--bg:${bg}">${CLOUDS}<img src="${full}" alt=""><span class="cut-spin" aria-hidden="true"></span></div>
      <p class="dim" role="status">Recortando a ${name} del fondo… La primera vez tarda unos segundos.</p>
      <button class="btn ghost wide" id="cutFull0">Usar foto entera</button>`);
    $('#cutFull0').onclick = () => finish({ photo: full, photoFull: '' });
    if (!dlg.open) dlg.showModal();
    try {
      const t = performance.now(), C = await loadCut(), r = await C.auto(full);
      window.MZCUT_LAST = { auto: r.ms, model: r.loadMs, total: Math.round(performance.now() - t), found: r.found, label: r.label };
      if (settled) return;
      if (r.found) actions(r.png, `Así queda ${name} sobre su color. Si el recorte salió raro, usá la foto entera.`);
      else { touchStep(); $('#cutMsg').textContent = `No encontramos ${pet.species === 'gato' ? 'un gato' : pet.species === 'perro' ? 'un perro' : 'a tu mascota'} sola. Tocala en la foto.`; }
    } catch { if (!settled) { touchStep(); $('#cutMsg').textContent = 'El recorte necesita conexión. Podés usar la foto entera o un recorte redondo.'; } }
  });
}
const CUPO_MSG = 'Llegaste al espacio de fotos y estudios de tu cuenta (200 MB). Borrá estudios o fotos que no uses para subir más.';
async function uploadPhoto(data) {
  const r = await fetch('/api/mascotas?photo=1', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data }) });
  const d = await r.json().catch(() => ({})); if (!r.ok || !d.u) throw Object.assign(new Error(d.error || 'upload'), { msg: uploadErr(d, 'foto') }); return d.u;
}

const BUY_URL = '/p/ob-018';
/* el mismo mail de soporte que usa la web (orbitando.com.ar, términos y privacidad) */
const SUPPORT_MAIL = 'hola@orbitando.com.ar';
/* Precio aprobado (14/10/2026): lanzamiento hasta el 12/11/2026 inclusive. El 13/11 se saca el bloque
   de lanzamiento y queda el de lista (ver api/_lib/catalog.js y assets/js/products.js). */
const PRICE = { ars: 35990, usd: 24, listArs: 43990, listUsd: 29, until: '12/11/2026' };
const ars = n => '$\u00a0' + n.toLocaleString('es-AR');
const AI_ROUTES = ['lectura', 'preguntar', 'gmail', 'outlook'];
const aiExpired = () => Boolean(aiq?.expired);
const longDate = v => v ? fmt(String(v).slice(0, 10), { day: 'numeric', month: 'long', year: 'numeric' }) : '';
const AI_EXPIRED_MSG = () => `Tus funciones inteligentes vencieron el ${longDate(aiq?.expiresAt)}. Mimitos sigue siendo tuya con todo lo que cargaste.`;
/* el servidor devolvió cuántas quedan después de una importación */
const setQuota = q => { if (q && aiq?.imports && Number.isFinite(q.left)) { aiq.imports.left = q.left; aiq.imports.show = Boolean(q.show); } };
const markExpired = at => { aiq = { ...(aiq || {}), expired: true, expiresAt: at || aiq?.expiresAt || null }; };
/* "Te quedan N": solo con 10 o menos */
function aiLeftNote() {
  const n = aiq?.imports?.left;
  if (!aiq || aiq.expired || !aiq.imports?.show || !Number.isFinite(n)) return '';
  return `<p class="ai-left" role="status">${n === 0 ? 'No te quedan importaciones inteligentes por ahora.' : n === 1 ? 'Te queda 1 importación inteligente.' : `Te quedan ${n} importaciones inteligentes.`}</p>`;
}
/* por qué no se pudo leer con IA (topes internos o vencimiento) */
/* estados del servidor que no son topes de la persona: pausa general de la IA y demasiados reintentos fallidos en el día */
const AI_PAUSED_MSG = 'Las funciones inteligentes están en pausa un rato. Probá más tarde; todo lo demás funciona.';
const AI_RETRIES_MSG = 'Hubo demasiados reintentos fallidos hoy. Probá de nuevo mañana; mientras tanto, podés cargarlo a mano.';
const aiSoft = e => e === 'ai_paused' || e === 'limite_reintentos';
/* por qué no se pudo leer un archivo con IA (fuera de los topes): lo que devuelve el servidor en scan, studyscan e import */
function readErr(code, d = {}) {
  if (code === 'pdf_ilegible') return (d.message || 'No pudimos leer el PDF.') + ' Puede estar protegido o dañado.';
  if (code === 'ia_respuesta_truncada') return 'El documento tiene demasiado para leerlo de una vez.';
  if (code === 'archivo_rechazado') return 'El archivo no coincide con lo que se subió y lo descartamos. Subilo de nuevo.';
  if (code === 'pdf_muy_largo' || code === 'pdf_no_se_pudo_cortar') return 'No pudimos leer este PDF.';
  if (code === 'tipo_no_legible') return 'Este formato no se puede leer.';
  return '';
}
/* subidas de fotos y estudios: mensajes claros para lo que rechaza el servidor */
function uploadErr(d = {}, kind) {
  if (d.error === 'cupo_lleno') return d.photoQuota && kind === 'foto' ? `Llegaste al espacio para fotos de tu cuenta (${Math.round(d.photoQuota / 1048576)} MB). Borrá fotos que no uses para subir más.` : CUPO_MSG;
  if (d.error === 'limite_diario') return kind === 'foto' ? 'Llegaste al tope de fotos que se pueden subir hoy. Mañana podés seguir.' : 'Llegaste al tope de archivos que se pueden subir hoy. Mañana podés seguir.';
  if (d.error === 'tamano_invalido') return 'No pudimos subir el archivo: el tamaño no es válido. Elegí el archivo de nuevo.';
  if (d.error === 'archivo_rechazado') return readErr('archivo_rechazado');
  return '';
}
function limitMsg(d = {}) {
  if (d.error === 'ai_paused') return d.message || AI_PAUSED_MSG;
  if (d.error === 'limite_reintentos') return AI_RETRIES_MSG;
  if (d.error === 'ai_expired') { markExpired(d.expiredAt); return `Tus funciones inteligentes vencieron el ${longDate(aiq.expiresAt)}.`; }
  if (d.error === 'limite_diario') return 'Llegaste al tope de importaciones inteligentes de hoy. Mañana podés seguir.';
  if (d.error === 'limite_paginas') return 'Llegaste al máximo de páginas leídas que incluyen tus 12 meses.';
  if (d.error === 'limite_periodo' && d.renews) return `Usaste las importaciones inteligentes de tus primeros 30 días. Se suman más el ${longDate(d.renews)}.`;
  return 'Usaste las importaciones inteligentes que incluyen tus 12 meses.';
}

/* ---------- formulario genérico ---------- */
const dForm = $('#dForm'), dPanel = $('#dPanel');
document.querySelectorAll('[data-close]').forEach(b => { b.innerHTML = I('x'); b.addEventListener('click', () => b.closest('dialog').close()); });
document.querySelectorAll('dialog').forEach(d => d.addEventListener('click', e => { if (e.target === d) d.close(); }));
dForm.addEventListener('close', () => { $('#fBody').innerHTML = ''; });
dPanel.addEventListener('close', () => { $('#pBody').innerHTML = ''; $('#pBody').onclick = null; });
let form = null;
function field(f, v) {
  const id = 'f_' + f.k, val = v ?? '';
  const opt = f.opt ? ' <span class="opt">(opcional)</span>' : '';
  const lab = `<label for="${id}">${esc(f.label)}${opt}</label>`, hint = f.hint ? `<small id="${id}_h">${esc(f.hint)}</small>` : '';
  const desc = f.hint ? ` aria-describedby="${id}_h"` : '';
  switch (f.type) {
    case 'textarea': return `<div class="f" data-f="${f.k}">${lab}<textarea id="${id}" maxlength="${f.max || 300}" placeholder="${esc(f.ph || '')}"${desc}>${esc(val)}</textarea>${hint}</div>`;
    case 'select': return `<div class="f" data-f="${f.k}">${lab}<select id="${id}"${desc}>${f.options.map(([o, l]) => `<option value="${esc(o)}"${String(o) === String(val) ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>${hint}</div>`;
    case 'chips': return `<div class="f" data-f="${f.k}"><span class="lb" id="${id}_l">${esc(f.label)}${opt}</span><div class="chips" role="group" aria-labelledby="${id}_l" id="${id}" data-chips>${f.options.map(([o, l]) => `<button type="button" class="chip" data-v="${esc(o)}" aria-pressed="${String(o) === String(val)}">${esc(l)}</button>`).join('')}</div>${hint}</div>`;
    case 'check': return `<label class="toggle" data-f="${f.k}"><input type="checkbox" id="${id}"${val ? ' checked' : ''}><span><b>${esc(f.label)}</b>${f.hint ? `<br><small class="dim">${esc(f.hint)}</small>` : ''}</span></label>`;
    case 'photo': {
      const prev = f.square ? `<div class="stk ${val ? 'has' : 'empty-s'}" id="${id}_prev">${val ? `<img src="${esc(val)}" alt="">` : 'Sin foto'}</div>` : `<div class="av big" id="${id}_prev">${val ? `<img src="${esc(val)}" alt="">` : I('camera')}</div>`;
      return `<div class="photo-pick" data-f="${f.k}">${prev}<div class="f">${f.label ? `<span class="lb">${esc(f.label)}${opt}</span>` : ''}<label class="btn ghost sm" for="${id}">${I('camera')} ${val ? 'Cambiar foto' : 'Elegir foto'}</label><input id="${id}" type="file" accept="image/*" class="sr" data-square="${f.square ? 1 : ''}">${hint}</div></div>`;
    }
    case 'hue': return `<div class="f" data-f="${f.k}" id="${id}"><span class="lb">${esc(f.label)}${opt}</span>${swatches(f.k, val)}${hint}</div>`;
    case 'datalist': return `<div class="f" data-f="${f.k}">${lab}<input id="${id}" list="${id}_dl" maxlength="${f.max || 80}" value="${esc(val)}" placeholder="${esc(f.ph || '')}" autocomplete="off"${desc}><datalist id="${id}_dl">${(f.options || []).map(o => `<option value="${esc(o)}">`).join('')}</datalist>${hint}</div>`;
    default: {
      const t = f.type === 'datetime' ? 'datetime-local' : f.type || 'text';
      const extra = f.type === 'number' ? ' inputmode="decimal"' : f.type === 'tel' ? ' autocomplete="tel"' : '';
      return `<div class="f" data-f="${f.k}">${lab}<input id="${id}" type="${t === 'number' ? 'text' : t}"${extra} maxlength="${f.max || 120}" value="${esc(val)}" placeholder="${esc(f.ph || '')}"${desc}>${f.quick ? `<div class="chips">${f.quick.map(([d, l]) => `<button type="button" class="chip" data-quick="${id}" data-d="${d}">${l}</button>`).join('')}</div>` : ''}${hint}</div>`;
    }
  }
}
function openForm(o) {
  form = { ...o, photo: undefined };
  $('#dFormT').textContent = o.title;
  $('#fBody').innerHTML = (o.intro ? `<p class="note">${o.intro}</p>` : '') + o.fields.map(f => Array.isArray(f) ? `<div class="two${f.some(x => x.stack) ? ' stack-s' : ''}">${f.map(x => field(x, o.values?.[x.k])).join('')}</div>` : field(f, o.values?.[f.k])).join('');
  $('#fSave').textContent = o.saveLabel || 'Guardar';
  const alt = $('#fAlt'); alt.hidden = !o.alt; alt.textContent = o.alt?.label || ''; alt.onclick = o.alt ? () => o.alt.fn() : null;
  $('#fForm').classList.toggle('stick', Boolean(o.stick));
  const del = $('#fDel'); del.hidden = !o.onDelete; del.innerHTML = `${I('trash')} ${esc(o.deleteLabel || 'Borrar')}`; del.dataset.sure = '';
  $('#fErr').hidden = true;
  if (!dForm.open) dForm.showModal();
  o.after?.();
  const first = $('#fBody input:not([type=file]):not([type=checkbox]),#fBody textarea'); if (first && !o.values?.name && !o.noFocus) first.focus();
}
$('#fBody').addEventListener('click', e => {
  const sw = e.target.closest('.swatches .tile');
  if (sw) { sw.parentNode.querySelectorAll('.tile').forEach(x => x.setAttribute('aria-pressed', String(x === sw))); form.onHue?.(sw.dataset.v); return; }
  const c = e.target.closest('[data-chips] .chip');
  if (c) { c.parentNode.querySelectorAll('.chip').forEach(x => x.setAttribute('aria-pressed', String(x === c))); form.onChip?.(c.parentNode.id.slice(2), c.dataset.v); return; }
  const q = e.target.closest('[data-quick]');
  if (q) form.onQuick?.(q.dataset.quick.slice(2), q.dataset.d);
});
$('#fBody').addEventListener('change', async e => {
  if (e.target.type !== 'file' || !e.target.id.startsWith('f_')) return;
  const f = e.target.files[0]; if (!f) return;
  if (e.target.id === 'f_photo') {
    e.target.value = '';
    const hue = $('#f_hue [aria-pressed="true"]')?.dataset.v || '';
    const r = await cutFlow(f, { name: $('#f_name')?.value.trim() || 'tu mascota', hue }); if (!r) return;
    form.photo = r.photo; form.photoFull = r.photoFull;
    const prev = $('#f_photo_prev'); prev.innerHTML = `<img src="${r.photo}" alt="Foto elegida">`; prev.style.background = hueOf({ hue }).at(0); prev.classList.toggle('cut', Boolean(r.photoFull));
    const lb = $('label[for="f_photo"]'); if (lb) lb.innerHTML = `${I('camera')} Cambiar foto`;
    return;
  }
  try {
    form.photo = await shrink(f, e.target.dataset.square ? 520 : 640, .8);
    const prev = $(`#${e.target.id}_prev`); prev.innerHTML = `<img src="${form.photo}" alt="Foto elegida">`; if (prev.classList.contains('stk')) prev.className = 'stk has';
    const lb = $(`label[for="${e.target.id}"]`); if (lb) lb.innerHTML = `${I('camera')} Cambiar foto`;
  } catch { toast('No pudimos leer esa foto. Probá con otra.'); }
  e.target.value = '';
});
function readForm() {
  const out = {};
  for (const f of form.fields.flat()) {
    const el = $('#f_' + f.k); if (!el) continue;
    out[f.k] = f.type === 'hue' ? (el.querySelector('[aria-pressed="true"]')?.dataset.v || '') : f.type === 'chips' ? (el.querySelector('[aria-pressed="true"]')?.dataset.v || '') : f.type === 'check' ? el.checked : f.type === 'photo' ? form.photo : el.value.trim();
  }
  return out;
}
const showField = (k, on) => { const el = $(`#fBody [data-f="${k}"]`); if (el) el.hidden = !on; };
$('#fForm').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = $('#fSave'); btn.disabled = true; const label = btn.textContent; btn.textContent = 'Guardando…';
  try {
    const err = await form.onSave(readForm());
    if (err) { $('#fErr').textContent = err; $('#fErr').hidden = false; $('#fErr').scrollIntoView({ block: 'nearest' }); return; }
    const after = form.afterSave; dForm.close(); changed(); after?.();
  } finally { btn.disabled = false; btn.textContent = label; }
});
$('#fDel').addEventListener('click', () => {
  const b = $('#fDel');
  if (form.confirm && b.dataset.sure !== '1') { b.dataset.sure = '1'; b.textContent = form.confirm; setTimeout(() => { if (b.dataset.sure === '1') { b.dataset.sure = ''; b.innerHTML = `${I('trash')} ${esc(form.deleteLabel || 'Borrar')}`; } }, 4000); return; }
  const res = form.onDelete(); dForm.close();
  if (res && res.undo) undoable(res.msg || 'Borrado.', res.undo); else changed();
});
const setVal = (k, v) => { const el = $('#f_' + k); if (el) el.value = v; };
const numOrNull = v => { if (v === '' || v == null) return null; const n = parseFloat(String(v).replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) && n >= 0 ? n : NaN; };
const numDec = v => { if (v === '' || v == null) return null; const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) && n >= 0 ? n : NaN; };
const monthsBetween = (a, b) => { const x = pd(a), y = pd(b); if (!x || !y) return 12; return Math.max(1, Math.round((y - x) / (30.44 * Z.DAY))); };

/* ---------- formularios concretos ---------- */
function petForm(p) {
  openForm({
    title: p ? 'Datos de ' + p.name : 'Nueva mascota',
    values: p ? { ...p, weight: p.weight ? String(p.weight).replace('.', ',') : '', ownerName: p.contact.name, ownerPhone: p.contact.phone } : { species: 'perro' },
    fields: [
      { k: 'photo', type: 'photo', hint: 'Una foto clara, con la mascota entera. La recortamos sola y la ponemos sobre su color.' },
      { k: 'hue', type: 'hue', label: 'Su color', hint: 'El fondo de su Inicio, la tapa de su libreta y su pasaporte.' },
      { k: 'name', label: 'Nombre', max: 60 },
      { k: 'species', label: 'Especie', type: 'chips', options: [['perro', 'Perro'], ['gato', 'Gato'], ['otra', 'Otra']] },
      { k: 'speciesOther', label: '¿Qué especie?', ph: 'Conejo, hurón, loro…', max: 40 },
      [{ k: 'breed', label: 'Raza', type: 'datalist', options: Z.BREEDS[p?.species || 'perro'] || [], ph: 'Escribí para buscar', max: 60 }, { k: 'sex', label: 'Sexo', type: 'select', options: [['', '—'], ['h', 'Hembra'], ['m', 'Macho']] }],
      [{ k: 'birth', label: 'Nacimiento', type: 'date', hint: 'Aproximado sirve.' }, { k: 'weight', label: 'Peso (kg)', type: 'number', ph: '12,5' }],
      [{ k: 'color', label: 'Color', max: 80 }, { k: 'chip', label: 'Microchip', max: 40, ph: '15 dígitos' }],
      { k: 'marks', label: 'Señas particulares', ph: 'Mancha blanca en el pecho, oreja caída…', max: 200, hint: 'Ayudan a reconocerla si se pierde.' },
      { k: 'neutered', label: '¿Está castrado o castrada?', type: 'chips', options: [['si', 'Sí'], ['no', 'No'], ['', 'No sé']] },
      [{ k: 'ownerName', label: 'Tutor o tutora', max: 60, ph: 'Tu nombre' }, { k: 'ownerPhone', label: 'Teléfono', type: 'tel', max: 40 }],
      { k: 'temper', label: 'Carácter', ph: 'Miedosa con extraños, se escapa si abren la puerta…', max: 200 },
      { k: 'allergies', label: 'Alergias', max: 300, ph: 'A un alimento, a un remedio…' },
      { k: 'chronic', label: 'Remedios que toma siempre', max: 300, ph: 'Nombre y dosis' },
      { k: 'notes', label: 'Notas privadas', type: 'textarea', max: 600, ph: 'Solo las ves vos.' },
    ],
    onChip: (k, v) => { if (k === 'species') { showField('speciesOther', v === 'otra'); $('#f_breed_dl').innerHTML = (Z.BREEDS[v] || []).map(o => `<option value="${esc(o)}">`).join(''); } },
    after: () => showField('speciesOther', (p?.species || 'perro') === 'otra'),
    onDelete: p ? () => { const undo = drop(doc.pets, p); if (curId === p.id) selectPet(doc.pets[0]?.id || ''); return { msg: `${p.name} se borró con toda su historia.`, undo: () => { undo(); selectPet(p.id); } }; } : null,
    deleteLabel: 'Borrar mascota', confirm: p ? `Tocá de nuevo para borrar a ${p.name} y toda su historia` : '',
    onHue(h) { applyHue({ hue: h }); },
    async onSave(v) {
      const full = form.photoFull;
      if (!v.name) return 'Poné el nombre de tu mascota.';
      const w = numDec(v.weight); if (Number.isNaN(w)) return 'El peso tiene que ser un número, por ejemplo 12,5.';
      if (v.birth && v.birth > iso(Z.today())) return 'La fecha de nacimiento no puede ser futura.';
      const pet = p || blankPet();
      Object.assign(pet, { name: v.name, species: v.species || 'perro', speciesOther: v.speciesOther, breed: v.breed, sex: v.sex, birth: v.birth, color: v.color, chip: v.chip, marks: v.marks, temper: v.temper, allergies: v.allergies, neutered: v.neutered, chronic: v.chronic, notes: v.notes });
      pet.contact = { ...pet.contact, name: v.ownerName, phone: v.ownerPhone };
      if (w !== pet.weight) { if (w) addWeight(pet, iso(Z.today()), w); else pet.weight = w; }
      pet.hue = v.hue || pet.hue || '';
      if (v.photo) { try { pet.photo = await uploadPhoto(v.photo); pet.photoFull = full ? await uploadPhoto(full) : ''; } catch (e) { toast((e?.msg || 'La foto no se pudo subir.') + ' El resto quedó guardado.'); } }
      if (!p) { doc.pets.push(pet); selectPet(pet.id); }
      toast(p ? 'Datos guardados.' : `${pet.name} ya está en Mimitos.`);
    },
  });
}
const REC_TYPES = [['vacuna', 'Vacuna'], ['desparasitacion', 'Antiparasitario'], ['control', 'Control'], ['otro', 'Otro']];
function recForm(p, r, preset) {
  const t = r?.type || preset?.type || 'vacuna';
  const sugg = ty => (SUGGEST[p.species] || SUGGEST.otra)[ty] || [];
  const base = r ? { ...r } : { type: t, date: iso(Z.today()), vet: p.vet?.name || '', scope: t === 'desparasitacion' ? 'externa' : '', ...preset };
  openForm({
    title: r ? 'Editar registro' : preset?.title || `Nuevo registro · ${p.name}`,
    values: base,
    fields: [
      { k: 'type', label: 'Tipo', type: 'chips', options: REC_TYPES },
      { k: 'scope', label: '¿Interna o externa?', type: 'chips', options: [['interna', 'Interna (parásitos)'], ['externa', 'Externa (pulgas, garrapatas)']] },
      { k: 'name', label: 'Nombre', type: 'datalist', options: sugg(t), ph: t === 'vacuna' ? 'Antirrábica' : 'Pipeta antipulgas', hint: 'Como figura en la libreta del veterinario.' },
      [{ k: 'date', label: 'Se aplicó el', type: 'date' }, { k: 'next', label: 'Próxima dosis', type: 'date', quick: [['1', '1 mes'], ['3', '3 meses'], ['12', '1 año']] }],
      [{ k: 'lot', label: 'Lote o marca', max: 80, ph: 'Nobivac R · A123', opt: true, stack: true }, { k: 'vet', label: 'Veterinaria', max: 80, opt: true }],
      { k: 'sticker', label: 'Foto del sticker', type: 'photo', square: true, opt: true, hint: 'El sticker que pega el veterinario. Aparece en la libreta como sello.' },
      { k: 'notes', label: 'Notas', type: 'textarea', max: 300, ph: 'Observaciones', opt: true },
    ],
    after: () => showField('scope', t === 'desparasitacion'),
    onChip: (k, v) => { if (k === 'type') { $('#f_name_dl').innerHTML = sugg(v).map(o => `<option value="${esc(o)}">`).join(''); showField('scope', v === 'desparasitacion'); } },
    onQuick: (k, m) => { const b = pd($('#f_date').value) || Z.today(); setVal('next', Z.addMonths(iso(b), +m)); },
    onDelete: r ? () => ({ msg: `${r.name || 'Registro'} borrado.`, undo: drop(p.records, r) }) : null,
    async onSave(v) {
      if (!v.name) return 'Poné qué se hizo, por ejemplo "Antirrábica".';
      if (!v.date && !v.next) return 'Cargá al menos una fecha: cuándo se aplicó o cuándo toca.';
      if (v.date && v.date > iso(Z.today())) return 'La fecha de aplicación no puede ser futura. Si todavía no se la pusieron, usá "Próxima dosis".';
      if (v.date && v.next && v.next < v.date) return 'La próxima dosis no puede ser anterior a la aplicación.';
      const rec = r || { id: uid(), sticker: '' };
      Object.assign(rec, { type: v.type || 'otro', name: v.name, date: v.date, next: v.next, vet: v.vet, lot: v.lot, notes: Z.isSug(rec) && v.date ? '' : v.notes, scope: v.type === 'desparasitacion' ? (v.scope || Z.scopeOf(v)) : '' });
      if (v.sticker) { try { rec.sticker = await uploadPhoto(v.sticker); } catch (e) { toast((e?.msg || 'La foto del sticker no se pudo subir.') + ' El resto quedó guardado.'); } }
      if (!r) p.records.push(rec);
      toast(r ? 'Registro actualizado.' : v.next ? `Guardado. Te avisamos antes del ${fmt(v.next, { day: 'numeric', month: 'short' })}.` : 'Guardado en la libreta.');
    },
  });
}
/* duplicar como próxima dosis: misma vacuna, aplicada en la fecha que tocaba, próxima con el mismo intervalo */
function nextDose(p, r) {
  const gap = r.date && r.next ? monthsBetween(r.date, r.next) : 12;
  const date = r.next && r.next <= iso(Z.today()) ? r.next : iso(Z.today());
  recForm(p, null, { title: 'Próxima dosis', type: r.type, name: r.name, vet: r.vet, scope: r.scope, lot: '', date, next: Z.addMonths(date, gap) });
}
/* ---------- "Ya se la di": un toque abre la hoja prellenada, el segundo guarda ---------- */
/* "14 de octubre", o "14 de octubre de 2027" si no es este año */
const dayLong = s => fmt(s, s.slice(0, 4) === iso(Z.today()).slice(0, 4) ? { day: 'numeric', month: 'long' } : { day: 'numeric', month: 'long', year: 'numeric' });
const doneBtn = (p, r, cls = '') => `<button type="button" class="ibtn go renew ${cls}" data-act="renew" data-pet="${p.id}" data-rec="${r.id}" aria-label="${Z.renewLabel(r)}: ${esc(r.name || TYPE[r.type])} de ${esc(p.name)}">${I('check')}<span>${Z.renewLabel(r)}</span></button>`;
function renewSheet(p, r) {
  const today = iso(Z.today()), plan = Z.renewPlan(p, r, today), what = r.name || TYPE[r.type];
  let gap = plan.gap, nextTouched = false;
  const nextHint = () => gap ? `La calculamos sola: cada ${gap} ${gap === 1 ? 'mes' : 'meses'}${plan.src === 'calendario' && gap === plan.gap ? ', según el calendario sugerido' : plan.src === 'anterior' && gap === plan.gap ? ', como la dosis anterior' : ''}.` : '¿Cada cuánto toca? Elegí un atajo o una fecha.';
  const press = (k, d) => document.querySelectorAll(`#fBody [data-quick="f_${k}"]`).forEach(c => c.setAttribute('aria-pressed', String(c.dataset.d === d)));
  const dateChip = v => v === today ? '0' : v === iso(new Date(Z.today().getTime() - Z.DAY)) ? '-1' : 'pick';
  const recalc = () => { const d = $('#f_date').value; if (gap && d && !nextTouched) setVal('next', Z.addMonths(d, gap)); press('date', dateChip(d)); const h = $('#f_next_h'); if (h) h.textContent = nextHint(); };
  openForm({
    title: Z.renewLabel(r),
    intro: `<span class="rn-what">${bubble(recIcon(r), 'salud')}<span><b>${esc(what)}</b><small>${TYPE[r.type]} de ${esc(p.name)}${r.next ? ` · tocaba el ${fmt(r.next, { day: 'numeric', month: 'short' })}` : ''}</small></span></span>`,
    values: { date: today, next: plan.next, vet: plan.vet, lot: plan.lot },
    noFocus: true, stick: true,
    fields: [
      { k: 'date', label: r.type === 'vacuna' ? 'Se la diste el' : r.type === 'desparasitacion' ? 'Se la pusiste el' : 'Fue el', type: 'date', quick: [['0', 'Hoy'], ['-1', 'Ayer'], ['pick', 'Elegir fecha']] },
      { k: 'next', label: 'Próxima', type: 'date', quick: [['1', '+1 mes'], ['3', '+3 meses'], ['6', '+6 meses'], ['12', '+12 meses']], hint: nextHint() },
      [{ k: 'vet', label: 'Veterinaria', max: 80, opt: true }, { k: 'lot', label: 'Lote o marca', max: 80, opt: true }],
      { k: 'sticker', label: 'Foto del sticker', type: 'photo', square: true, opt: true },
    ],
    alt: { label: `${Z.notYetLabel(r)} · Posponer`, fn: () => postponeSheet(p, r) },
    after() {
      $('#f_date').max = today; if (r.date && !Z.isSug(r)) $('#f_date').min = r.date;
      $('#f_date').addEventListener('input', recalc);
      $('#f_next').addEventListener('input', () => { nextTouched = true; press('next', ''); });
      press('date', '0'); press('next', String(gap));
    },
    onQuick(k, d) {
      if (k === 'date') {
        if (d === 'pick') { const el = $('#f_date'); press('date', 'pick'); try { el.showPicker(); } catch { el.focus(); } return; }
        setVal('date', iso(new Date(Z.today().getTime() + Number(d) * Z.DAY))); return recalc();
      }
      gap = +d; nextTouched = false; recalc(); press('next', d);
    },
    async onSave(v) {
      const err = Z.renewCheck(r, v); if (err) return err;
      const res = Z.applyRenew(p, r, v, uid());
      if (v.sticker) { try { res.rec.sticker = await uploadPhoto(v.sticker); } catch (e) { toast((e?.msg || 'La foto del sticker no se pudo subir.') + ' El resto quedó guardado.'); } }
      const msg = `Listo, anotamos ${Z.art(r)} de ${p.name}.${res.rec.next ? ` La próxima es el ${dayLong(res.rec.next)}.` : ''}`;
      form.afterSave = () => toast(msg, { label: 'Deshacer', fn: () => { res.undo(); changed(); toast('Listo, lo deshicimos.'); } });
    },
  });
}
/* "No se la di todavía": corre la fecha del registro vigente, sin crear una dosis */
function postponeSheet(p, r) {
  const what = r.name || TYPE[r.type], first = Z.inDays(7);
  openForm({
    title: 'Posponer',
    intro: `${esc(what)} de ${esc(p.name)}${r.next ? `, que tocaba el ${fmt(r.next, { day: 'numeric', month: 'long' })}` : ''}. Elegí la nueva fecha: no se anota ninguna dosis.`,
    values: { next: first }, noFocus: true,
    fields: [{ k: 'next', label: 'Nueva fecha', type: 'date', quick: [['7', 'En 1 semana'], ['14', 'En 2 semanas'], ['30', 'En 1 mes']] }],
    saveLabel: 'Posponer',
    after() { $('#f_next').min = iso(Z.today()); document.querySelectorAll('#fBody [data-quick]').forEach(c => c.setAttribute('aria-pressed', String(c.dataset.d === '7'))); $('#f_next').addEventListener('input', () => document.querySelectorAll('#fBody [data-quick]').forEach(c => c.setAttribute('aria-pressed', 'false'))); },
    onQuick(k, d) { setVal('next', Z.inDays(+d)); document.querySelectorAll('#fBody [data-quick]').forEach(c => c.setAttribute('aria-pressed', String(c.dataset.d === d))); },
    onSave(v) {
      if (!v.next) return 'Elegí la nueva fecha.';
      if (v.next < iso(Z.today())) return 'La nueva fecha no puede ser pasada.';
      const undo = Z.postpone(r, v.next);
      form.afterSave = () => toast(`Listo, pasamos ${Z.art(r)} de ${p.name} al ${dayLong(v.next)}.`, { label: 'Deshacer', fn: () => { undo(); changed(); toast('Listo, volvió a su fecha.'); } });
    },
  });
}
/* desde el aviso: #/renovar/<mascota>|<registro> */
function openRenewRoute(arg) {
  const [pid, rid] = String(arg || '').split('|');
  const q = petById(pid), r = q?.records.find(x => x.id === rid);
  setRoute('inicio');
  if (!q) return;
  selectPet(q.id);
  after(() => {
    if (!r) return toast('Esa fecha ya no está cargada.');
    if (!Z.upcoming(q).some(x => x.r.id === r.id)) return toast(`${Cap(Z.art(r))} de ${q.name} ya está anotada.`);
    renewSheet(q, r);
  });
}
function medForm(p, m) {
  const now = new Date(); now.setMinutes(0, 0, 0);
  openForm({
    title: m ? 'Editar remedio' : `Remedio · ${p.name}`,
    intro: m ? '' : 'Cargá lo que recetó el veterinario. La app te muestra cuándo toca y quién se lo dio.',
    values: m ? { ...m, every: String(m.every), days: m.days ? String(m.days) : '' } : { every: '24', start: isoLocal(now) },
    fields: [
      { k: 'name', label: 'Medicamento', max: 80, ph: 'Antibiótico, gotas para los oídos…' },
      { k: 'dose', label: 'Dosis', max: 80, ph: '1 comprimido, 5 gotas…' },
      { k: 'every', label: 'Cada cuánto', type: 'chips', options: [['8', '8 h'], ['12', '12 h'], ['24', '1 vez por día'], ['168', '1 vez por semana'], ['720', '1 vez por mes']] },
      [{ k: 'start', label: 'Primera toma', type: 'datetime' }, { k: 'days', label: 'Durante (días)', type: 'number', ph: 'Vacío = sin fin' }],
      { k: 'notes', label: 'Indicaciones', max: 200, ph: 'Con comida, en ayunas…', opt: true },
    ],
    onDelete: m ? () => ({ msg: `${m.name} borrado.`, undo: drop(p.meds, m) }) : null,
    onSave(v) {
      if (!v.name) return 'Poné el nombre del medicamento.';
      if (!v.start) return 'Poné cuándo es la primera toma.';
      const days = v.days ? parseInt(v.days, 10) : 0; if (v.days && !(days > 0)) return 'Los días tienen que ser un número, por ejemplo 7.';
      const med = m || { id: uid() };
      Object.assign(med, { name: v.name, dose: v.dose, every: parseInt(v.every, 10) || 24, start: v.start, days, notes: v.notes });
      if (!m) p.meds.push(med);
      toast(m ? 'Remedio actualizado.' : 'Remedio guardado. Sumalo al calendario para que te avise en cada toma.');
    },
  });
}
function expenseForm(p, x) {
  const many = !x && doc.pets.length > 1;
  openForm({
    title: x ? 'Editar gasto' : 'Nuevo gasto',
    values: x ? { ...x, amount: String(x.amount) } : { date: iso(Z.today()), cat: 'alimento', pet: p.id },
    fields: [
      ...(many ? [{ k: 'pet', label: '¿De quién?', type: 'chips', options: doc.pets.map(q => [q.id, q.name]) }] : []),
      { k: 'cat', label: 'En qué', type: 'chips', options: Object.entries(EXP) },
      [{ k: 'amount', label: 'Monto ($)', type: 'number', ph: '38000' }, { k: 'date', label: 'Fecha', type: 'date' }],
      { k: 'note', label: 'Detalle', max: 120, ph: 'Bolsa 15 kg, consulta…', opt: true },
    ],
    onDelete: x ? () => ({ msg: `Gasto de ${money(x.amount)} borrado.`, undo: drop(p.expenses, x) }) : null,
    onSave(v) {
      const a = numOrNull(v.amount); if (!(a > 0)) return 'Poné el monto, solo números. Por ejemplo 38000.';
      if (!v.date) return 'Poné la fecha.';
      const target = many ? petById(v.pet) || p : p;
      const e = x || { id: uid() }; Object.assign(e, { cat: v.cat || 'otros', amount: a, date: v.date, note: v.note });
      if (!x) target.expenses.push(e);
      ui.gastos.ym = v.date.slice(0, 7);
      /* un gasto de alimento nuevo: preguntamos si abrió una bolsa, así aprende cuánto le dura */
      const ask = !x && Z.bagPrompt(target, e);
      if (ask) form.afterSave = () => bagAsk(target, ask, a);
      else toast(x ? 'Gasto actualizado.' : `Gasto de ${money(a)} guardado.`);
    },
  });
}
/* ---------- alimento: cada bolsa que abrís le enseña a Mimitos cuánto le dura ---------- */
const kgTxt = n => String(n).replace('.', ',');
function bagSheet(p, pre = {}) {
  const today = iso(Z.today()), last = window.MZRULES.bagsOf(p.food).at(-1) || {};
  const kg = pre.kg ?? last.kg ?? p.food.bagKg, brand = pre.brand ?? (last.brand || p.food.brand || '');
  openForm({
    title: 'Bolsa nueva',
    intro: `Anotá cuándo abriste la bolsa de ${esc(p.name)}. Con cada bolsa aprendemos cuánto le dura y te avisamos antes de que se termine.`,
    values: { date: pre.date || today, kg: kg ? kgTxt(kg) : '', brand, price: pre.price ? String(pre.price) : '' },
    noFocus: true, stick: true,
    fields: [
      { k: 'date', label: 'La abriste el', type: 'date', quick: [['0', 'Hoy'], ['-1', 'Ayer']] },
      [{ k: 'kg', label: 'Bolsa (kg)', type: 'number', ph: '15' }, { k: 'price', label: 'Precio ($)', type: 'number', ph: '38000', opt: true, hint: pre.fromExpense ? 'Ya está en tus gastos.' : 'Si lo ponés, se anota también como gasto de alimento.' }],
      { k: 'brand', label: 'Marca', max: 80, ph: 'Marca y variedad', opt: true },
    ],
    after() { $('#f_date').max = today; },
    onQuick(k, d) { setVal('date', iso(new Date(Z.today().getTime() + Number(d) * Z.DAY))); },
    onSave(v) {
      const k = numDec(v.kg); if (!(k > 0)) return 'Poné cuántos kilos trae la bolsa, por ejemplo 15.';
      const price = numOrNull(v.price); if (Number.isNaN(price)) return 'El precio va solo con números, por ejemplo 38000.';
      if (!v.date) return 'Poné cuándo la abriste.'; if (v.date > today) return 'La fecha no puede ser futura.';
      const undoBag = Z.addBag(p, { date: v.date, kg: k, brand: v.brand, price: price || null });
      let exp = null;
      if (price && !pre.fromExpense) { exp = { id: uid(), cat: 'alimento', amount: price, date: v.date, note: `Bolsa de ${kgTxt(k)} kg${v.brand ? ' · ' + v.brand : ''}` }; p.expenses.push(exp); }
      const f = Z.food(p.food);
      const msg = f?.src === 'aprendido' ? `Anotada. Le dura en promedio ${f.days} días: se termina aprox. el ${fmt(f.end, { day: 'numeric', month: 'long' })}.` : f ? `Anotada. Se termina aprox. el ${fmt(f.end, { day: 'numeric', month: 'long' })}.` : 'Anotada. Con la próxima bolsa aprendemos cuánto le dura.';
      form.afterSave = () => toast(msg, { label: 'Deshacer', fn: () => { undoBag(); if (exp) drop(p.expenses, exp); changed(); toast('Listo, la sacamos.'); } });
    },
  });
}
/* después de un gasto de alimento */
function bagAsk(p, pre, amount) {
  panel('¿Abriste una bolsa nueva?', `<p class="note">Guardamos el gasto de ${money(amount)}. Si ese día abriste una bolsa de ${esc(p.name)}, anotala: así aprendemos cuánto le dura.</p><div class="d-acts"><button class="btn big wide" data-bag="si">Sí, la abrí ${pre.date === iso(Z.today()) ? 'hoy' : 'ese día'}</button><button class="btn ghost wide" data-bag="no">No</button></div>`);
  $('#pBody').onclick = e => {
    const b = e.target.closest('[data-bag]'); if (!b) return;
    dPanel.close();
    if (b.dataset.bag === 'si') bagSheet(p, { ...pre, fromExpense: true });
  };
}
function foodForm(p) {
  openForm({
    title: 'Alimento', intro: 'Los gramos por día son opcionales: si no los sabés, desde la segunda bolsa calculamos solos cuánto le dura.',
    values: { ...p.food, bagKg: p.food.bagKg ? String(p.food.bagKg).replace('.', ',') : '', dailyG: p.food.dailyG ? String(p.food.dailyG) : '', opened: p.food.opened || iso(Z.today()) },
    fields: [{ k: 'brand', label: 'Qué alimento', max: 80, ph: 'Marca y variedad' }, [{ k: 'bagKg', label: 'Bolsa (kg)', type: 'number', ph: '15' }, { k: 'dailyG', label: 'Come por día (g)', type: 'number', ph: '400', opt: true }], { k: 'opened', label: 'Abriste la bolsa el', type: 'date' }],
    onSave(v) {
      const k = numDec(v.bagKg), g = numDec(v.dailyG);
      if (!(k > 0)) return 'Poné cuántos kilos trae la bolsa.'; if (Number.isNaN(g)) return 'Los gramos por día van con números, por ejemplo 400.'; if (!v.opened) return 'Poné cuándo abriste la bolsa.';
      const bags = (p.food.bags || []).filter(b => b.date !== v.opened);
      bags.push({ date: v.opened, kg: k, brand: v.brand, price: (p.food.bags || []).find(b => b.date === v.opened)?.price || null });
      bags.sort((a, b) => a.date.localeCompare(b.date));
      p.food = { brand: v.brand, bagKg: k, dailyG: g || null, opened: bags.at(-1).date, bags: bags.slice(-50) }; toast('Alimento guardado.');
    },
  });
}
function fundForm(p) {
  openForm({
    title: 'Ahorro para imprevistos', intro: 'Una cirugía puede costar entre $300.000 y $450.000 (La Nación, abril 2026). Separar un poco por mes evita el susto.',
    values: { goal: p.fund.goal ?? '', monthly: p.fund.monthly ?? '', saved: p.fund.saved ?? '' },
    fields: [{ k: 'goal', label: 'Meta ($)', type: 'number', ph: '400000' }, [{ k: 'monthly', label: 'Separo por mes ($)', type: 'number', ph: '20000' }, { k: 'saved', label: 'Ya tengo ($)', type: 'number', ph: '0' }]],
    onSave(v) {
      const g = numOrNull(v.goal), m = numOrNull(v.monthly), s = numOrNull(v.saved);
      if ([g, m, s].some(Number.isNaN)) return 'Usá solo números, sin puntos ni signos.';
      p.fund = { goal: g, monthly: m, saved: s };
    },
  });
}
function vetForm(p) {
  openForm({
    title: 'Veterinaria y guardia', values: p.vet,
    fields: [{ k: 'name', label: 'Tu veterinaria', max: 80 }, [{ k: 'phone', label: 'Teléfono', type: 'tel', max: 40 }, { k: 'address', label: 'Dirección', max: 120 }], { k: 'er', label: 'Guardia 24 horas', max: 120, hint: 'La más cercana que atiende de noche y los fines de semana.', opt: true }, { k: 'erPhone', label: 'Teléfono de la guardia', type: 'tel', max: 40, opt: true }],
    onSave(v) { p.vet = v; toast('Veterinaria guardada.'); },
  });
}
function symptomForm(p, s) {
  openForm({
    title: s ? 'Editar anotación' : 'Algo que notaste', intro: 'Anotalo con fecha para contárselo al veterinario. La app no diagnostica.',
    values: s || { date: iso(Z.today()) },
    fields: [{ k: 'date', label: 'Fecha', type: 'date' }, { k: 'text', label: 'Qué notaste', type: 'textarea', max: 300, ph: 'Vomitó dos veces, no quiere comer, se rasca…' }],
    onDelete: s ? () => ({ msg: 'Anotación borrada.', undo: drop(p.symptoms, s) }) : null,
    onSave(v) { if (!v.text) return 'Escribí qué notaste.'; const x = s || { id: uid() }; Object.assign(x, v); if (!s) p.symptoms.push(x); toast('Anotado en su historia.'); },
  });
}
function tripForm(p) {
  openForm({
    title: 'Viaje al exterior', values: p.trip,
    fields: [{ k: 'dest', label: 'Destino', type: 'select', options: [['', 'Elegí'], ...Object.entries(Z.DEST)] }, { k: 'date', label: 'Fecha de salida', type: 'date' }],
    onDelete: p.trip.dest ? () => { const old = { ...p.trip }; p.trip = { dest: '', date: '' }; return { msg: 'Viaje quitado.', undo: () => { p.trip = old; } }; } : null, deleteLabel: 'Quitar viaje',
    onSave(v) { if (!v.dest) return 'Elegí el destino.'; if (!v.date) return 'Poné la fecha de salida.'; p.trip = v; },
  });
}
function visitForm(p, v) {
  openForm({
    title: v ? 'Consulta' : `Consulta de ${p.name}`, intro: v ? '' : 'Anotá lo que te dijo el veterinario para tenerlo la próxima vez.',
    values: v ? { ...v, weight: v.weight ? String(v.weight).replace('.', ',') : '' } : { date: iso(Z.today()), vet: p.vet.name || '' },
    fields: [
      [{ k: 'date', label: 'Fecha', type: 'date' }, { k: 'weight', label: 'Peso ese día (kg)', type: 'number', ph: '14,2', opt: true }],
      { k: 'reason', label: '¿Por qué fueron?', max: 160, ph: 'Control anual, se rasca, no come…' },
      { k: 'vet', label: 'Veterinaria o profesional', max: 80 },
      { k: 'findings', label: '¿Qué te dijo el veterinario?', type: 'textarea', max: 600, ph: 'Lo que encontró' },
      { k: 'plan', label: 'Indicaciones', type: 'textarea', max: 600, ph: 'Remedios, cuidados, cuándo volver', opt: true },
    ],
    onDelete: v ? () => ({ msg: 'Consulta borrada.', undo: drop(p.visits, v) }) : null,
    onSave(x) {
      if (!x.date) return 'Poné la fecha.';
      if (x.date > iso(Z.today())) return 'La fecha de la consulta no puede ser futura.';
      if (!x.reason && !x.findings) return 'Contá al menos por qué fueron o qué te dijeron.';
      const w = numDec(x.weight); if (Number.isNaN(w)) return 'El peso tiene que ser un número, por ejemplo 14,2.';
      const it = v || { id: uid() }; Object.assign(it, { date: x.date, reason: x.reason, vet: x.vet, findings: x.findings, plan: x.plan, weight: w });
      if (!v) p.visits.push(it);
      if (w) addWeight(p, x.date, w);
      toast('Consulta guardada en la libreta.');
    },
  });
}
function addWeight(p, date, k) {
  p.weights = p.weights.filter(w => w.date !== date); p.weights.push({ date, kg: k }); p.weights.sort((a, b) => a.date.localeCompare(b.date));
  p.weight = p.weights[p.weights.length - 1].kg;
}
function weightForm(p, w) {
  openForm({
    title: w ? 'Editar peso' : `Peso de ${p.name}`, values: w ? { kg: String(w.kg).replace('.', ','), date: w.date } : { date: iso(Z.today()) },
    fields: [[{ k: 'kg', label: 'Peso (kg)', type: 'number', ph: '14,2' }, { k: 'date', label: 'Fecha', type: 'date' }]],
    onDelete: w ? () => { const undo = drop(p.weights, w); p.weight = p.weights.at(-1)?.kg ?? null; return { msg: 'Peso borrado.', undo: () => { undo(); p.weight = p.weights.at(-1)?.kg ?? null; } }; } : null,
    onSave(x) {
      const k = numDec(x.kg); if (!(k > 0) || k > 2000) return 'Poné el peso en kilos, por ejemplo 14,2.'; if (!x.date) return 'Poné la fecha.';
      if (w) drop(p.weights, w);
      addWeight(p, x.date, k); toast('Peso guardado.');
    },
  });
}
function conditionForm(p, c) {
  openForm({
    title: c ? c.name : 'Problema de salud', intro: 'Anotá lo que te dijo el veterinario. La app no diagnostica: solo lo registra para que no se pierda.',
    values: c || { status: 'activa' },
    fields: [
      { k: 'name', label: '¿Qué tuvo o tiene?', type: 'datalist', options: Z.CONDITIONS[p.species] || Z.CONDITIONS.otra, ph: 'Otitis' },
      { k: 'status', label: '¿Cómo está hoy?', type: 'chips', options: [['activa', 'Lo tiene'], ['controlada', 'Controlado'], ['resuelta', 'Ya pasó']] },
      { k: 'since', label: '¿Desde cuándo? (año)', max: 10, ph: '2024', opt: true },
      { k: 'notes', label: 'Notas', type: 'textarea', max: 300, ph: 'Tratamiento, qué lo empeora, a qué veterinario fueron', opt: true },
    ],
    onDelete: c ? () => ({ msg: `${c.name} borrado.`, undo: drop(p.conditions, c) }) : null,
    onSave(x) { if (!x.name) return 'Poné qué tuvo.'; const it = c || { id: uid() }; Object.assign(it, { name: x.name, status: x.status || 'activa', since: x.since, notes: x.notes }); if (!c) p.conditions.push(it); },
  });
}
function surgeryForm(p, c) {
  openForm({
    title: c ? c.name : 'Cirugía', values: c || {},
    fields: [{ k: 'name', label: '¿Qué cirugía?', type: 'datalist', options: Z.SURGERIES, ph: 'Castración' }, { k: 'date', label: 'Fecha (aproximada sirve)', type: 'date', opt: true }, { k: 'notes', label: 'Notas', type: 'textarea', max: 300, opt: true }],
    onDelete: c ? () => ({ msg: `${c.name} borrada.`, undo: drop(p.surgeries, c) }) : null,
    onSave(x) {
      if (!x.name) return 'Poné qué cirugía fue.';
      const it = c || { id: uid() }; Object.assign(it, x); if (!c) p.surgeries.push(it);
      if (/castra/i.test(x.name)) p.neutered = 'si';
    },
  });
}
let studyFiles = [];
function studyForm(p, st) {
  studyFiles = st ? [...st.files] : [];
  openForm({
    title: st ? (st.title || 'Estudio') : 'Estudio', intro: st ? '' : 'Subí la foto o el PDF que te dio el laboratorio o la veterinaria. Queda guardado en su historia.',
    values: st || { date: iso(Z.today()), kind: 'sangre' },
    fields: [
      { k: 'kind', label: 'Tipo', type: 'chips', options: Object.entries(Z.STUDY) },
      [{ k: 'date', label: 'Fecha', type: 'date' }, { k: 'title', label: 'Nombre', max: 120, ph: 'Hemograma completo' }],
      { k: 'notes', label: 'Qué dijo el veterinario', type: 'textarea', max: 600, ph: 'Resultado o conclusión', opt: true },
    ],
    onDelete: st ? () => ({ msg: 'Estudio borrado.', undo: drop(p.studies, st) }) : null,
    onSave(x) {
      if (!x.date) return 'Poné la fecha.';
      if (!x.title && !studyFiles.length) return 'Poné un nombre o subí el archivo.';
      const it = st || { id: uid() }; Object.assign(it, { date: x.date, kind: x.kind || 'otro', title: x.title || Z.STUDY[x.kind], notes: x.notes, files: studyFiles });
      if (!st) p.studies.push(it);
      toast('Estudio guardado en su historia.');
    },
    after() {
      const box = document.createElement('div'); box.className = 'f';
      box.innerHTML = `<span class="lb">Archivos</span><div class="list" id="stFiles"></div><label class="btn ghost sm" for="stIn">${I('file')} Subir foto o PDF</label><input id="stIn" type="file" accept="image/*,application/pdf" multiple class="sr"><small id="stMsg" role="status"></small>`;
      $('#fBody').appendChild(box); drawFiles();
      $('#stIn').onchange = async e => {
        const files = [...e.target.files]; e.target.value = '';
        for (const f of files) {
          if (f.size > 15 * 1024 * 1024) { toast(`"${f.name}" pesa más de 15 MB.`); continue; }
          $('#stMsg').textContent = `Subiendo ${f.name}…`;
          try { studyFiles.push(await uploadStudy(f)); drawFiles(); $('#stMsg').textContent = ''; }
          catch { $('#stMsg').textContent = `No se pudo subir ${f.name}. Probá de nuevo.`; }
        }
      };
    },
  });
}
function fileUrl(f) { return f.ref.startsWith('blob:mascotas/') ? `/api/mascotas?file=${encodeURIComponent(f.ref)}` : f.ref; }
function drawFiles() {
  const box = $('#stFiles'); if (!box) return;
  box.hidden = !studyFiles.length;
  box.innerHTML = studyFiles.map((f, i) => `<div class="row">${bubble(f.type === 'application/pdf' ? 'file' : 'camera', 'viaje')}<span class="what"><b>${esc(f.name)}</b></span><button type="button" class="ibtn" data-rm="${i}" aria-label="Quitar ${esc(f.name)}">${I('x')}</button></div>`).join('');
  box.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { studyFiles.splice(+b.dataset.rm, 1); drawFiles(); });
}
async function uploadStudy(file) {
  const r = await fetch('/api/mascotas?upload=1', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: file.name, size: file.size, type: file.type || 'application/octet-stream' }) });
  const d = await r.json().catch(() => ({})); if (!r.ok) { const m = uploadErr(d, 'estudio'); if (m && d.error === 'cupo_lleno') toast(m); throw Object.assign(new Error(d.error || 'upload'), { msg: m }); }
  const put = await fetch(d.url, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
  if (!put.ok) throw new Error('put');
  return { ref: d.ref, name: file.name, type: file.type };
}

/* ---------- rutas y navegación ---------- */
const TABS = [['inicio', 'home', 'Inicio'], ['libreta', 'book', 'Libreta'], ['agenda', 'grid', 'Agenda'], ['gastos', 'wallet', 'Gastos'], ['cuenta', 'user', 'Cuenta']];
/* en el celu: 4 secciones y el + en el medio; Cuenta queda en el avatar de arriba */
const PILL = ['inicio', 'libreta', '+', 'agenda', 'gastos'];
const TAB_OF = { antecedentes: 'inicio', viajes: 'inicio', datos: 'inicio', pdf: 'libreta', avisos: 'cuenta' };
const BARE = ['alta', 'lectura', 'estudios', 'gmail', 'outlook', 'preguntar'];
const nav = $('#nav'), topBar = $('.top');
function parseHash() { const [name = 'inicio', arg = ''] = location.hash.replace(/^#\/?/, '').split('/'); return { name: name || 'inicio', arg: decodeURIComponent(arg) }; }
function go(name, arg) { const h = '#/' + name + (arg ? '/' + encodeURIComponent(arg) : ''); if (location.hash === h) render(); else location.hash = h; }
window.addEventListener('hashchange', () => { route = parseHash(); if (dPanel.open) dPanel.close(); mailRoute(); render(); window.scrollTo(0, 0); if (route.name === 'preguntar' && mode === 'full') askLoadLeft(); });
function drawNav() {
  const tab = TAB_OF[route.name] || route.name;
  nav.innerHTML = `<a class="brand side-only" href="#/inicio" aria-label="Mimitos, inicio">${HEART}<b>mimitos</b><span class="by">by Orbit</span></a>
    <button type="button" class="nav-add side-only" data-act="add">${I('plus')}<span>Cargar algo</span></button>
    <div class="nav-items">${PILL.map(k => k === '+' ? `<button type="button" class="nav-plus" data-act="add" aria-label="Cargar algo">${I('plus')}</button>` : (([kk, ic, l]) => `<a href="#/${kk}" class="nav-i" aria-label="${l}" ${tab === kk ? 'aria-current="page"' : ''}>${I(ic)}<span>${l}</span></a>`)(TABS.find(t => t[0] === k))).join('')}<a href="#/cuenta" class="nav-i side-only" ${tab === 'cuenta' ? 'aria-current="page"' : ''}>${I('user')}<span>Cuenta</span></a></div>
    <div class="side-only side-pets">${doc.pets.length ? `<span class="eyebrow">Tus mascotas</span>${doc.pets.map(p => `<button type="button" class="side-pet" data-act="pick" data-id="${p.id}" ${p.id === curPet()?.id ? 'aria-current="true"' : ''}>${avatar(p)}<span>${esc(p.name)}</span></button>`).join('')}<button type="button" class="side-pet add" data-act="newPet">${I('plus')}<span>Agregar mascota</span></button>` : ''}</div>`;
}
/* escritorio: en la barra entran pocas mascotas; con más, se muestran algunas (siempre la elegida) y "+N" abre la lista */
const wideTop = matchMedia('(min-width:1280px)');
function topPets(p) {
  const max = wideTop.matches ? 3 : 2;
  if (doc.pets.length <= max + 1) return doc.pets;
  const show = doc.pets.slice(0, max);
  if (p && !show.includes(p)) show[max - 1] = p;
  return show;
}
wideTop.addEventListener?.('change', () => { if (mode === 'full' && doc.pets.length > 3) drawTop(BARE.includes(route.name)); });
function petsPanel() {
  const cur = curPet();
  panel('Tus mascotas', `<div class="list">${doc.pets.map(x => `<button type="button" class="row link-row" data-pk="${x.id}" ${x.id === cur?.id ? 'aria-current="true"' : ''}>${avatar(x)}<span class="what"><b>${esc(x.name)}</b><small>${esc(petMeta(x))}</small></span>${x.id === cur?.id ? `<span class="badge ok">Elegida</span>` : '<span></span>'}</button>`).join('')}</div><button type="button" class="btn soft wide" data-pk="+">${I('plus')} Agregar mascota</button>`);
  $('#pBody').onclick = e => {
    const b = e.target.closest('[data-pk]'); if (!b) return;
    dPanel.close();
    if (b.dataset.pk === '+') return startOnboard();
    selectPet(b.dataset.pk); if (TAB_OF[route.name] === 'inicio' || route.name === 'inicio') return go('inicio'); render();
  };
}
function drawTop(bare) {
  const box = $('#topActs'), hi = $('#hi');
  if (bare) { box.innerHTML = ''; hi.hidden = true; $('#tnavBox').innerHTML = ''; return; }
  const ini = (me.name || me.email || '?').trim().charAt(0).toUpperCase();
  const p = curPet(), onHome = route.name === 'inicio' && p;
  hi.hidden = !onHome;
  hi.innerHTML = onHome ? `<a class="me" href="#/cuenta" aria-label="Tu cuenta">${esc(ini)}</a><span><small>${greet()}${me.name ? ',' : ''}</small><b>${me.name ? esc(me.name.split(' ')[0]) : 'Hola'}</b></span>` : '';
  const tab = TAB_OF[route.name] || route.name;
  /* escritorio: barra liviana con las secciones, las mascotas y el + */
  const desk = `<nav class="tnav desk-only" aria-label="Secciones">${TABS.filter(t => t[0] !== 'cuenta').map(([k, , l]) => `<a href="#/${k}" ${tab === k ? 'aria-current="page"' : ''}>${l}</a>`).join('')}</nav>
    ${doc.pets.length ? `<div class="tpets desk-only" aria-label="Tus mascotas">${topPets(p).map(x => `<button type="button" class="tpet" data-act="pick" data-id="${x.id}" aria-current="${x.id === p?.id}" title="${esc(x.name)}" aria-label="${esc(x.name)}">${avatar(x)}</button>`).join('')}${topPets(p).length < doc.pets.length ? `<button type="button" class="tpet more" data-act="petsMore" aria-label="Ver todas tus mascotas (${doc.pets.length})">+${doc.pets.length - topPets(p).length}</button>` : ''}<button type="button" class="tpet add" data-act="newPet" aria-label="Agregar mascota">${I('plus')}</button></div>` : ''}
    ${doc.pets.length ? askBtn('desk-only') : ''}
    <button type="button" class="btn sm lime desk-only" data-act="add">${I('plus')} Cargar algo</button>`;
  $('#tnavBox').innerHTML = desk;
  box.innerHTML = `${doc.pets.length ? `<button type="button" class="round ask-ic mob-only" data-act="askGo" aria-label="Preguntale a Mimitos">${ASK_IC.stars}</button>` : ''}<a class="round" href="#/avisos" aria-label="Avisos">${I('bell')}</a><a class="me${onHome ? ' desk-only' : ''}" href="#/cuenta" aria-label="Tu cuenta">${esc(ini)}</a>`;
}
const greet = () => { const h = new Date().getHours(); return h < 6 ? 'Buenas noches' : h < 13 ? 'Buen día' : h < 20 ? 'Buenas tardes' : 'Buenas noches'; };
const HEART = '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 27.5c-6.3-4.2-11-8.3-11-13.4C5 10.6 7.7 8 10.9 8c2.2 0 4 1.1 5.1 2.9C17.1 9.1 18.9 8 21.1 8 24.3 8 27 10.6 27 14.1c0 5.1-4.7 9.2-11 13.4z" fill="#D9694A"/><circle cx="12" cy="16" r="1.5" fill="#1F1A17"/><circle cx="20" cy="16" r="1.5" fill="#1F1A17"/><path d="M14 19.6c1.1.9 2.9.9 4 0" fill="none" stroke="#1F1A17" stroke-width="1.5" stroke-linecap="round"/></svg>';
window.addEventListener('scroll', () => $('.top').classList.toggle('scrolled', window.scrollY > 4), { passive: true });

/* ---------- render ---------- */
function render() {
  if (mode === 'full' && route.name === 'renovar') openRenewRoute(route.arg);
  const bare = mode !== 'full' || BARE.includes(route.name);
  document.body.dataset.shell = bare ? 'bare' : 'app';
  nav.hidden = bare;
  if (!bare) drawNav();
  document.body.dataset.route = bare ? '' : route.name;
  document.body.dataset.view = mode === 'full' ? route.name : '';
  applyHue(route.name === 'alta' && ob ? ob.pet : curPet());
  drawTop(bare);
  app.className = mode === 'full' && (BARE.includes(route.name) || !doc.pets.length && route.name !== 'cuenta' && route.name !== 'avisos') ? '' : 'wide';
  const key = mode + ':' + route.name + ':' + (route.name === 'inicio' || route.name === 'libreta' ? curId : '');
  const html = view();
  if (html != null) app.innerHTML = html;
  if (key !== lastKey) { app.classList.add('view-in'); lastKey = key; } else app.classList.remove('view-in');
  afterRender();
}
function view() {
  if (mode === 'loading') return skeleton();
  if (mode === 'guest') { after(gateArt); return renderGate(); }
  if (mode === 'nopurchase') return renderNoPurchase();
  if (mode === 'error') return renderError();
  if (route.name === 'alta') return renderOnboard();
  if (aiExpired() && AI_ROUTES.includes(route.name)) return renderAiExpired();
  if (route.name === 'lectura') return renderScan();
  if (route.name === 'estudios') return renderBulk();
  if (route.name === 'gmail' || route.name === 'outlook') return renderMail(route.name);
  if (route.name === 'preguntar') return renderAsk();
  if (!doc.pets.length && route.name !== 'cuenta' && route.name !== 'avisos') return renderFirst();
  const p = curPet(); if (p && p.id !== curId) curId = p.id;
  switch (route.name) {
    case 'libreta': return renderLibreta(p);
    case 'pdf': return renderPdf(p);
    case 'agenda': return renderAgenda();
    case 'gastos': return renderGastos(p);
    case 'cuenta': return renderCuenta();
    case 'avisos': return renderAvisos();
    case 'antecedentes': return renderAntecedentes(p);
    case 'viajes': return renderViajes(p);
    case 'datos': return renderDatos(p);
    default: return renderInicio(p);
  }
}
let afterFns = [];
const after = fn => afterFns.push(fn);
function afterRender() { const f = afterFns; afterFns = []; f.forEach(fn => fn()); }

function skeleton() {
  const b = (w, h, r = 12) => `<span class="sk" style="width:${w};height:${h}px;border-radius:${r}px"></span>`;
  return `<div class="sk-wrap" aria-busy="true" aria-label="Cargando tus mascotas">
    <div style="display:flex;gap:16px;align-items:center">${b('88px', 88, 44)}<div style="flex:1;display:flex;flex-direction:column;gap:10px">${b('60%', 34)}${b('80%', 14)}</div></div>
    ${b('100%', 54, 16)}
    <div style="display:flex;flex-direction:column;gap:10px">${b('40%', 18)}${b('100%', 64, 14)}${b('100%', 64, 14)}</div>
    ${b('100%', 128, 20)}</div>`;
}
function renderError() {
  return `<section class="state" role="alert">${bubble('wifi', 'perdida')}<h1 class="h-xl">No pudimos conectar</h1>
    <p class="lead">Revisá tu conexión. Tus datos están guardados en tu cuenta: no se perdió nada.</p>
    <button class="btn big" data-act="retry">Reintentar</button></section>`;
}

/* bienvenida sin sesión: sobria, con una sola acción principal */
function renderGate() {
  return `<section class="gate">
    <div class="gate-copy">
      <span class="eyebrow">Mimitos by Orbit</span>
      <h1>La libreta sanitaria de tu mascota, <em>siempre con vos</em>.</h1>
      <p class="lead">Vacunas, desparasitaciones, consultas y peso en una libreta digital que se arma con lo que cargás y queda lista para imprimir. Te avisamos antes de cada fecha.</p>
      <div class="feat" aria-label="Qué incluye">
        <div>${bubble('book', 'salud')}<span><b>Libreta digital</b><small>Como la del veterinario, con sus stickers. Se imprime o se guarda en PDF.</small></span></div>
        <div>${bubble('bell', 'plata')}<span><b>Avisos antes de cada dosis</b><small>En el celu o por mail, o en tu calendario.</small></span></div>
        <div>${bubble('qr', 'viaje')}<span><b>QR y modo perdida</b><small>Quien la encuentre escanea el QR y ve cómo contactarte.</small></span></div>
        <div>${bubble('grid', 'cuida')}<span><b>Agenda y gastos</b><small>Todas las fechas y lo que gastás, de todas tus mascotas.</small></span></div>
      </div>
      <div class="hooks">
        <span class="eyebrow">Lo que te ahorra trabajo</span>
        <div class="hook">${bubble('camera', 'viaje')}<span><b>Le sacás foto a la libreta y se cargan las vacunas</b><small>Hasta 4 páginas. Leemos vacunas, antiparasitarios y controles con su fecha, próxima dosis si está escrita, marca y veterinario. Vos revisás antes de guardar.</small></span></div>
        <div class="hook">${bubble('hand', 'cuida')}<span><b>Modo cuidador</b><small>Le mandás un link a quien la cuida con comida, paseos y remedios. Ahí marca si comió, paseó y le dio la pastilla, y vos lo ves en Mimitos.</small></span></div>
        <div class="hook">${bubble('flask', 'salud')}<span><b>Estudios guardados en su historia</b><small>Análisis, radiografías y ecografías en foto o PDF, con lo que dijo el veterinario.</small></span></div>
      </div>
      <div class="price-row">
        <span class="eyebrow">Precio de lanzamiento · hasta el ${PRICE.until}</span>
        <span class="price"><b class="now">${ars(PRICE.ars)}</b><s class="was"><span class="sr">Precio de lista: </span>${ars(PRICE.listArs)}</s></span>
        <small>O USD ${PRICE.usd} con PayPal <s><span class="sr">en lugar de </span>USD ${PRICE.listUsd}</s>. Una sola versión, para todas tus mascotas.</small>
        <ul class="terms">
          <li>${I('check')}<span><b>Pago único.</b> Mimitos es tuya para siempre.</span></li>
          <li>${I('check')}<span><b>Incluye 12 meses de funciones inteligentes.</b> Preguntale a Mimitos, lectura automática de la libreta y los estudios e importación desde el mail. Uso personal razonable.</span></li>
          <li>${I('check')}<span><b>No es una suscripción.</b> Pasados los 12 meses no perdés nada: solo se pausan esas funciones hasta que las renueves.</span></li>
        </ul>
      </div>
      <div class="cta">
        <a class="btn big wide" href="${BUY_URL}">Conseguir Mimitos</a>
        <a class="btn ghost wide" href="/acceso?next=mascotas">Ya la compré · Ingresar</a>
      </div>
      <p class="note">Necesitás una cuenta de Orbit con el mail de la compra. Tus datos quedan en tu cuenta, no en el celu. En iPhone, para recibir los avisos en el celu, agregás Mimitos a la pantalla de inicio.</p>
    </div>
    <div class="art" id="gateArt" aria-hidden="true"></div>
  </section>`;
}
/* ilustración de la bienvenida: se inserta el SVG en línea para que use Geist; si no carga, queda el espacio vacío */
let gateSvg = '';
async function gateArt() {
  const box = $('#gateArt'); if (!box) return;
  try { if (!gateSvg) { const r = await fetch('/assets/img/mimitos/bienvenida.svg?v=1'); if (r.ok) gateSvg = (await r.text()).replace(/<title>[^<]*<\/title>/, ''); } } catch {}
  if (gateSvg && $('#gateArt')) $('#gateArt').innerHTML = CLOUDS + gateSvg;
}

/* con sesión pero sin la compra de Mimitos */
function renderNoPurchase() {
  return `<section class="state nobuy">
    ${bubble('book', 'salud')}
    <span class="eyebrow">Mimitos by Orbit</span>
    <h1 class="h-xl">Mimitos es parte de tu compra en Orbit</h1>
    <p class="lead">No encontramos la compra de Mimitos en ${me.email ? `<b>${esc(me.email)}</b>` : 'esta cuenta'}. Con ella tenés la libreta digital, los avisos y el QR para todas tus mascotas.</p>
    <div class="cta"><a class="btn big wide" href="${BUY_URL}">Conseguir Mimitos</a>
    <button class="btn ghost wide" data-act="relogin">Ya la compré con otro mail</button></div>
    <p class="note">Si la compraste hace un momento y no aparece, recargá la página en unos minutos. ¿Sigue sin aparecer? Escribinos a <a href="mailto:${SUPPORT_MAIL}?subject=${encodeURIComponent('Mimitos: no veo mi compra')}">${SUPPORT_MAIL}</a> y lo resolvemos.</p>
  </section>`;
}
async function relogin() { try { await fetch('/api/auth/logout', { method: 'POST' }); } catch {} location.href = '/acceso?next=mascotas'; }

/* primer ingreso, cuenta sin mascotas */
function renderFirst() {
  const tabName = TABS.find(t => t[0] === (TAB_OF[route.name] || route.name))?.[2];
  if (route.name !== 'inicio' && tabName) return `<section class="empty" style="margin-top:8px">${bubble(TABS.find(t => t[2] === tabName)[1], 'salud')}<h2>${tabName} se arma con tu mascota</h2><p>Primero cargá a tu mascota. Después acá vas a ver ${{ Libreta: 'su libreta sanitaria completa', Agenda: 'todas las fechas que le tocan', Gastos: 'cuánto gastás por mes' }[tabName] || 'su información'}.</p><button class="btn" data-act="newPet">${I('plus')} Agregar a mi mascota</button></section>`;
  return `<section class="first">
    <span class="eyebrow">${me.name ? 'Hola, ' + esc(me.name.split(' ')[0]) : 'Bienvenida, bienvenido'}</span>
    <h1>Empecemos por tu mascota</h1>
    <p class="lead">En menos de un minuto tenés su libreta armada y sabés cuándo le toca la próxima vacuna.</p>
    <ol class="steps3">
      <li><span class="n">1</span><span><b>Nombre, especie y foto</b><small>La foto va en la tapa de su libreta.</small></span></li>
      <li><span class="n">2</span><span><b>Su última vacuna</b><small>La copiás de la libreta del veterinario o le sacás una foto.</small></span></li>
      <li><span class="n">3</span><span><b>Calendario sugerido</b><small>Fechas de referencia que confirmás con tu veterinario.</small></span></li>
    </ol>
    <button class="btn big wide" data-act="newPet">${I('plus')} Agregar a mi mascota</button>
  </section>`;
}

/* ---------- selector de mascota ---------- */
function switcher(p) {
  return `<nav class="switch" aria-label="Tus mascotas">${doc.pets.map(x => `<button class="sw" data-act="pick" data-id="${x.id}" aria-current="${x.id === p.id}">${avatar(x)}<span>${esc(x.name)}</span></button>`).join('')}<button class="sw add" data-act="newPet" aria-label="Agregar mascota">${I('plus')}<span>Agregar</span></button></nav>`;
}
function petMeta(p) { return [Z.species(p), p.breed, Z.age(p.birth), p.weight ? kg(p.weight) : ''].filter(Boolean).join(' · '); }

/* ---------- INICIO ---------- */
function nextItems(p) {
  const out = [];
  for (const m of p.meds) { const s = Z.medState(m, p.log); if (s.state === 'due' || s.state === 'late') out.push({ order: s.state === 'late' ? -2 : -1, html: medRow(p, m) }); }
  for (const x of Z.upcoming(p)) if (x.s.days <= 60) out.push({ kind: 'rec', order: x.s.days, html: `<div class="row ${x.s.c}">${bubble(recIcon(x.r), 'salud')}<button class="what plain" data-act="detail" data-kind="rec" data-id="${x.r.id}"><b>${esc(x.r.name)}</b><small><span class="stt">${x.s.t}</span>${Z.isSug(x.r) ? ' · sugerida, confirmala con tu veterinario' : ''}</small></button><button class="ibtn" data-act="icsRec" data-pet="${p.id}" data-rec="${x.r.id}" aria-label="Agregar ${esc(x.r.name)} al calendario">${I('cal')}</button></div>` });
  const f = Z.food(p.food); if (f && f.left <= 5) out.push({ order: f.left, html: `<div class="row ${f.left < 0 ? 'st-late' : 'st-soon'}">${bubble('bowl', 'comida')}<span class="what"><b>Comprar alimento</b><small class="stt">${f.left < 0 ? 'Ya se terminó' : f.left === 0 ? 'Se termina hoy' : `Quedan ${f.left} días`}</small></span><button class="ibtn" data-act="icsFood" data-pet="${p.id}" aria-label="Aviso para comprar alimento">${I('cal')}</button></div>` });
  return out.sort((a, b) => a.order - b.order);
}
const recIcon = r => r.type === 'vacuna' ? 'syringe' : r.type === 'desparasitacion' ? 'drop' : r.type === 'control' ? 'steth' : 'note';
function medRow(p, m) {
  const s = Z.medState(m, p.log);
  const tx = { soon: ['st-ok', `Empieza ${Z.fmtWhen(s.next)}`], ok: ['st-done', s.next ? `Dada. Próxima: ${Z.fmtWhen(s.next)}` : 'Dada. Era la última toma'], due: ['st-soon', `Le toca ahora (${Z.fmtTime(s.due)})`], late: ['st-late', `Atrasada: tocaba ${Z.fmtWhen(s.due)}`], ended: ['', 'Tratamiento terminado'], nostart: ['', 'Falta la primera toma'] }[s.state];
  const can = s.state === 'due' || s.state === 'late';
  return `<div class="row ${tx[0]}">${bubble('pill', 'med')}<button class="what plain" data-act="detail" data-kind="med" data-id="${m.id}"><b>${esc(m.name)}</b><small>${m.dose ? esc(m.dose) + ' · ' : ''}<span class="stt">${tx[1]}</span></small></button>${can ? `<button class="ibtn go" data-act="give" data-pet="${p.id}" data-med="${m.id}">Ya se la di</button>` : `<button class="ibtn" data-act="editMed" data-med="${m.id}" aria-label="Editar ${esc(m.name)}">${I('edit')}</button>`}</div>`;
}
function renderInicio(p) {
  /* las vacunas y pipetas van en Próximos cuidados; acá quedan remedios y alimento */
  const sm = Z.summary(p), next = nextItems(p).filter(x => x.kind !== 'rec').slice(0, 5);
  const activeMeds = p.meds.filter(m => ['ok', 'soon'].includes(Z.medState(m, p.log).state));
  const vacc = { ok: ['Al día', 'ok'], late: [`Vencida: ${sm.vaccLate.map(x => x.r.name).join(', ')}`, 'late'], none: ['Sin cargar', 'none'] }[sm.vacc];
  const anti = { ok: ['Al día', 'ok'], late: ['Vencido', 'late'], none: ['Sin cargar', 'none'], unknown: [`Último: ${sm.lastAnti ? fmt(sm.lastAnti.date, { day: 'numeric', month: 'short' }) : '—'}`, 'none'] }[sm.anti];
  const recs = p.records.filter(r => r.date).length;
  const quick = [['share', 'qr', 'viaje', 'QR del collar', `Para que te ${la(p)} devuelvan si se pierde`], ['sitter', 'hand', 'cuida', esc(Cap(quienCuida(p)).replace(/^Quien/, 'Quién')), 'Un link con todo para el cuidador'], ['lost', 'search', 'perdida', p.lost.on ? 'Modo perdida activo' : 'Se perdió', 'Cartel de búsqueda y qué hacer'], ['go:antecedentes', 'heart', 'cuida', 'Antecedentes', 'Problemas de salud, cirugías y alergias'], ['go:viajes', 'plane', 'viaje', 'Viaje al exterior', 'Qué papeles necesita y cuándo'], ['suggest', 'sparkle', 'salud', 'Calendario sugerido', 'Fechas de referencia por especie y edad'], ['go:datos', 'doc', 'plata', 'Datos y veterinaria', 'Microchip, señas, teléfonos y guardia']];
  return `<div class="dash">
    <div class="dash-l">${petHero(p, sm, vacc, anti)}</div>
    <div class="dash-r">
      ${askBtn('ask-home span2')}
      ${p.lost.on ? `<div class="banner lost">${bubble('search', 'perdida')}<span style="flex:1;min-width:160px"><b>Modo perdida activo</b>Desde ${p.lost.since ? Z.fmtWhen(new Date(p.lost.since)) : 'hoy'}</span><button class="btn sm" data-act="lost">Ver cartel</button></div>` : ''}
      ${scanBanner(p)}
      ${notify && !notify.devices && !notify.mail ? `<button class="banner nudge span2" data-act="go" data-to="avisos">${bubble('bell', 'plata')}<span style="flex:1"><b>Que no se te pase ninguna fecha</b><small class="dim">Activá los avisos en el celu o por mail.</small></span>${I('chevron')}</button>` : ''}
      ${next.length ? `<section class="sec card2 span2" aria-labelledby="h-next">
        <div class="sec-h"><h2 id="h-next">Hoy y estos días</h2><button class="link" data-act="go" data-to="agenda">Agenda ${I('next')}</button></div>
        <div class="list">${next.map(x => x.html).join('')}</div>
      </section>` : ''}
      ${careCard(p)}
      ${weightCard(p)}
      ${spendCard(p)}
      <section class="sec card2" aria-labelledby="h-health">
        <h2 id="h-health">Antecedentes y remedios</h2>
        <div class="summary">
          <button class="sum" data-act="libsec" data-sec="vac"><span>Vacunas</span><span class="badge ${vacc[1] === 'late' ? 'late' : vacc[1] === 'ok' ? 'ok' : 'none'}">${esc(vacc[0])}</span></button>
          <button class="sum" data-act="libsec" data-sec="des"><span>Antiparasitario</span><span class="badge ${anti[1] === 'late' ? 'late' : anti[1] === 'ok' ? 'ok' : 'none'}">${esc(anti[0])}</span></button>
          <button class="sum" data-act="go" data-to="antecedentes"><span>Problemas de salud</span><b>${sm.active.length ? esc(sm.active.map(c => c.name).join(', ')) : 'Ninguno cargado'}</b></button>
          <button class="sum" data-act="go" data-to="antecedentes"><span>Alergias</span><b>${esc(p.allergies || 'Ninguna cargada')}</b></button>
        </div>
        ${activeMeds.length ? `<div class="list">${activeMeds.map(m => medRow(p, m)).join('')}</div>` : ''}
      </section>
      <button class="bookcard span2 c-${Z.tone(p)}" data-act="go" data-to="libreta"><span class="mini">${avatar(p)}</span><span><span class="eyebrow">Libreta sanitaria</span><b>La libreta de ${esc(p.name)}</b><small>${recs ? `${recs} ${recs === 1 ? 'registro' : 'registros'} entre vacunas, desparasitaciones y controles. Lista para imprimir.` : 'Se completa sola con lo que cargás: vacunas, desparasitaciones, controles y peso.'}</small><span class="go">Abrir libreta ${I('next')}</span></span></button>
      ${sitterLog(p)}
      <div class="span2">${historySection(p)}</div>
      <section class="sec span2" aria-labelledby="h-more">
        <h2 id="h-more">Accesos rápidos</h2>
        <div class="list">${quick.map(([a, ic, c, t, d]) => { const [act, to] = a.split(':'); return `<button class="row link-row" data-act="${act}"${to ? ` data-to="${to}"` : ''}>${bubble(ic, c)}<span class="what"><b>${t}</b><small>${d}</small></span>${I('chevron')}</button>`; }).join('')}</div>
      </section>
    </div>
  </div>`;
}
/* Inicio: foto grande de la mascota y la hoja que sube encima con su estado */
const CLOUDS = `<svg class="clouds" viewBox="0 0 400 320" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><path d="M-20 250C60 170 140 300 230 210S360 120 430 170" fill="none" stroke="#fff" stroke-width="2" stroke-dasharray="2 9" stroke-linecap="round" opacity=".7"/><path d="M-10 90C80 40 150 140 260 80S380 30 420 60" fill="none" stroke="#fff" stroke-width="2" stroke-dasharray="2 9" stroke-linecap="round" opacity=".5"/><path d="M262 64a22 22 0 0 1 42-6 16 16 0 0 1 22 15H250a12 12 0 0 1 12-9z" fill="#fff" opacity=".85"/><path d="M24 168a18 18 0 0 1 34-5 13 13 0 0 1 18 12H14a10 10 0 0 1 10-7z" fill="#fff" opacity=".75"/></svg>`;
let heroArt = '';
async function loadHeroArt() {
  const box = $('#heroArt'); if (!box) return;
  try { if (!heroArt) { const r = await fetch('/assets/img/mimitos/sin-foto.svg?v=1'); if (r.ok) heroArt = await r.text(); } } catch {}
  if (heroArt && $('#heroArt')) $('#heroArt').innerHTML = heroArt;
}
function petHero(p, sm, vacc, anti) {
  const up = Z.upcoming(p), d = r => fmt(r.next, { day: 'numeric', month: 'short' }).replace('.', '');
  const pip = up.find(x => x.r.type === 'desparasitacion'), ctl = up.find(x => x.r.type === 'control');
  /* la primera fecha de cada tipo que ya se puede cerrar (vencida, hoy o en 14 días) lleva su "Ya se la di" */
  const due = t => up.find(x => x.r.type === t && Z.renewable(x.r));
  const stat = (act, to, ic, c, k, v, late, rn) => `<div class="pstat-w${rn ? ' has-rn' : ''}"><button class="pstat" data-act="${act}"${to}><span class="sic s-${c}">${I(ic)}</span><span><small>${k}</small><b${late ? ' class="late"' : ''}>${v}</b></span></button>${rn ? doneBtn(p, rn.r, 'wide') : ''}</div>`;
  const sexIc = p.sex === 'h' ? ['female', 'Hembra'] : p.sex === 'm' ? ['male', 'Macho'] : null;
  const cut = Boolean(p.photo && p.photoFull);
  if (!p.photo) after(loadHeroArt);
  /* selector de mascotas sobre el color: cada una en su propio color */
  const strip = `<nav class="pstrip" aria-label="Tus mascotas">${doc.pets.map(x => `<button class="pchip" data-act="pick" data-id="${x.id}" aria-current="${x.id === p.id}" aria-label="${esc(x.name)}">${avatar(x)}<span>${esc(x.name)}</span></button>`).join('')}<button class="pchip add" data-act="newPet" aria-label="Agregar mascota"><span class="av">${I('plus')}</span><span>Agregar</span></button></nav>`;
  return `<section class="phero${p.photo ? (cut ? ' has-cut' : ' has-photo') : ''}" aria-label="${esc(p.name)}">
    <div class="ph-stage">${CLOUDS}${strip}${p.photo ? `<img class="ph-img" src="${esc(p.photo)}" alt="Foto de ${esc(p.name)}">`
      : `<div class="ph-art" id="heroArt" aria-hidden="true"></div><button class="ph-up" data-act="editPet">${I('camera')} Subí su foto</button>`}</div>
    <div class="psheet">
      <span class="grab" aria-hidden="true"></span>
      <div class="ps-top">
        <div class="ps-name"><h1>${esc(p.name)}</h1><p>${esc([p.breed || Z.species(p), Z.age(p.birth)].filter(Boolean).join(' · ')) || 'Completá sus datos'}</p></div>
        <div class="ps-ic"><span class="round s-violeta" role="img" aria-label="${esc(Z.species(p))}">${Z.petIcon(p)}</span>${sexIc ? `<span class="round s-rosa" role="img" aria-label="${sexIc[1]}">${I(sexIc[0])}</span>` : ''}<button class="round" data-act="editPet" aria-label="Editar perfil de ${esc(p.name)}">${I('edit')}</button></div>
      </div>
      <div class="pstats">
        ${stat('libsec', ' data-sec="vac"', 'syringe', 'rosa', 'Vacunas', esc(vacc[1] === 'late' ? 'Vencida' : vacc[0]), vacc[1] === 'late', due('vacuna'))}
        ${stat('libsec', ' data-sec="des"', 'drop', 'naranja', 'Pipeta', pip ? (pip.s.days < 0 ? 'Vencida' : d(pip.r)) : esc(anti[0]), pip ? pip.s.days < 0 : anti[1] === 'late', due('desparasitacion'))}
        ${stat('go', ' data-to="agenda"', 'steth', 'violeta', 'Control', ctl ? d(ctl.r) : 'Sin turno', ctl && ctl.s.days < 0, due('control'))}
        ${stat('go', ' data-to="datos"', 'scale', 'verde', 'Peso', p.weight ? kg(p.weight) : 'Sin cargar', false)}
      </div>
    </div>
  </section>`;
}
/* próximos cuidados con la cinta de fecha a la derecha */
const RIB = { vacuna: 'r-azul', desparasitacion: 'r-rosa', control: 'r-naranja', otro: 'r-lila' };
function careCard(p) {
  const list = Z.upcoming(p).filter(x => x.s.days <= 180).slice(0, 4);
  const when = x => x.s.days < 0 ? `Vencida hace ${-x.s.days} d` : x.s.days === 0 ? 'Hoy' : x.s.days === 1 ? 'Mañana' : `En ${x.s.days} días`;
  return `<section class="sec card2 care-card" aria-labelledby="h-care"><h2 id="h-care">Próximos cuidados</h2>
    ${list.length ? `<div class="care">${list.map(x => `<div class="care-item"><button class="care-row" data-act="detail" data-kind="rec" data-id="${x.r.id}">
      <span class="sic s-${x.r.type === 'vacuna' ? 'violeta' : x.r.type === 'desparasitacion' ? 'rosa' : 'naranja'}">${I(recIcon(x.r))}</span>
      <span class="what"><b>${esc(x.r.name)}</b><small>${esc(x.r.vet || x.r.lot || Z.TYPE[x.r.type] || '')}${Z.isSug(x.r) ? ' · sugerida' : ''}</small></span>
      <span class="rib ${x.s.days < 0 ? 'r-late' : RIB[x.r.type] || 'r-lila'}"><b>${fmt(x.r.next, { day: 'numeric', month: 'short' }).replace('.', '')}</b><small>${when(x)}</small></span></button>${Z.renewable(x.r) ? `<div class="care-act">${doneBtn(p, x.r, 'wide')}</div>` : ''}</div>`).join('')}</div>`
      : `<p class="dim">Cuando cargues una vacuna o una pipeta con su próxima fecha, aparece acá.</p>${p.records.some(r => r.next) ? '' : `<button class="btn sm soft" data-act="suggest" style="align-self:flex-start">${I('sparkle')} Armar el calendario sugerido</button>`}`}
    <button class="btn ghost sm" data-act="go" data-to="agenda" style="align-self:flex-start">Ver más</button></section>`;
}
/* barras finas: la última, activa */
const bars = (vals, tone) => { const mx = Math.max(...vals, 1); return `<div class="vbars ${tone}" aria-hidden="true">${vals.map((v, i) => `<i style="height:${Math.max(8, Math.round(v / mx * 100))}%"${i === vals.length - 1 ? ' class="on"' : ''}></i>`).join('')}</div>`; };
function weightCard(p) {
  const w = [...(p.weights || [])].sort((a, b) => a.date.localeCompare(b.date)).slice(-10);
  const last = w[w.length - 1], prev = w[w.length - 2], dif = last && prev ? Math.round((last.kg - prev.kg) * 10) / 10 : 0;
  return `<section class="sec card2 mini-stat w-card" aria-labelledby="h-w"><div class="ms-h"><h2 id="h-w">Peso</h2><span class="sic s-verde">${I('scale')}</span></div>
    ${last ? `<p class="big-num">${kg(last.kg)}</p><small class="dim">${prev ? `${dif > 0 ? '+' : ''}${String(dif).replace('.', ',')} kg desde el ${fmt(prev.date, { day: 'numeric', month: 'short' })}` : 'Primer registro'}</small>${w.length > 1 ? bars(w.map(x => x.kg - Math.min(...w.map(y => y.kg)) * .8), 'violeta') : ''}`
      : `<p class="dim">Cargá su peso cada tanto y ves cómo va.</p><button class="btn ghost sm" data-act="newWeight" style="align-self:flex-start">${I('plus')} Cargar peso</button>`}</section>`;
}
function spendCard(p) {
  const now = iso(Z.today()).slice(0, 7), months = [];
  for (let i = 5; i >= 0; i--) { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i); months.push(iso(d).slice(0, 7)); }
  const tot = m => p.expenses.filter(x => x.date.startsWith(m)).reduce((a, x) => a + x.amount, 0);
  const vals = months.map(tot), has = vals.some(Boolean);
  return `<section class="sec card2 mini-stat s-card" aria-labelledby="h-g"><div class="ms-h"><h2 id="h-g">Gastos</h2><span class="sic s-naranja">${I('wallet')}</span></div>
    ${has ? `<p class="big-num">${Z.money(tot(now))}</p><small class="dim">Este mes. Promedio: ${Z.money(vals.reduce((a, b) => a + b, 0) / 6)}</small>${bars(vals, 'naranja')}`
      : `<p class="dim">Anotá lo que gastás en ${esc(p.name)} y ves cuánto es por mes.</p><button class="btn ghost sm" data-act="newExp" style="align-self:flex-start">${I('plus')} Anotar un gasto</button>`}</section>`;
}
/* lo que anotó el cuidador desde su link (últimos 10 días) */
function sitterLog(p) {
  const since = Date.now() - 10 * 864e5, KL = { comida: ['Comió', 'bowl', 'comida'], paseo: ['Salió a pasear', 'walk', 'viaje'], med: ['Remedio', 'pill', 'med'], ok: ['Todo bien', 'check', 'salud'], nota: ['Nota', 'note', 'plata'] };
  const list = p.log.filter(l => l.by !== 'Vos' && Date.parse(l.at) > since).slice(-6).reverse();
  if (!list.length) return '';
  const medName = id => p.meds.find(m => m.id === id)?.name || 'Remedio';
  return `<section class="sec"><h2>Lo que anotó ${esc(quienCuida(p))}</h2><div class="list">${list.map(l => { const k = KL[l.kind] || KL.nota; return `<div class="row">${bubble(k[1], k[2])}<span class="what"><b>${l.kind === 'med' ? 'Le dio ' + esc(medName(l.medId)) : l.kind === 'nota' ? esc(l.note) : k[0]}</b><small>${esc(l.by)}</small></span><span class="when">${Z.fmtWhen(new Date(l.at))}</span></div>`; }).join('')}</div></section>`;
}
function scanBanner(p) {
  const last = scans.filter(x => x.petId === p.id).pop();
  if (!last || Date.now() - Date.parse(last.at) > 7 * 864e5) return '';
  const t = last.kind === 'msg' ? `${last.name ? esc(last.name) : 'Alguien'} te avisó por ${esc(p.name)}` : `Escanearon el QR de ${esc(p.name)}`;
  const sub = last.kind === 'msg' ? [last.loc ? 'compartió su ubicación' : '', last.phone ? 'dejó su teléfono' : '', last.msg ? 'te dejó un mensaje' : ''].filter(Boolean).join(', ') : (last.city ? 'cerca de ' + esc(last.city) : '');
  return `<button class="banner scanned" data-act="share"><span class="pulse" aria-hidden="true"></span><span style="flex:1;text-align:left"><b>${t}</b>${esc(Z.fmtWhen(new Date(last.at)))}${sub ? ' · ' + sub : ''}</span>${I('chevron')}</button>`;
}
/* registro de escaneos del QR: quién avisó, desde dónde y cuándo */
function scanLog(p) {
  const list = scans.filter(x => x.petId === p.id).slice().reverse();
  if (!list.length) return `<section class="sec"><h2>Registro de escaneos</h2><p class="dim">Todavía nadie escaneó el QR. Cuando pase, te avisamos y queda anotado acá.</p></section>`;
  const telx = v => String(v || '').replace(/[^\d+]/g, '');
  const place = x => [x.city, x.region].filter(Boolean).join(', ');
  return `<section class="sec scanlog"><h2>Registro de escaneos</h2><div class="list">${list.slice(0, 30).map(x => x.kind === 'msg'
    ? `<div class="row">${bubble('pin', 'perdida')}<span class="what"><b>${x.name ? esc(x.name) + ' te avisó' : 'Te dejaron un aviso'}</b><small>${esc(Z.fmtWhen(new Date(x.at)))}${x.loc ? ' · con su ubicación' : place(x) ? ' · cerca de ' + esc(place(x)) + ' (aprox.)' : ''}${x.phone ? ' · ' + esc(x.phone) : ''}</small>${x.msg ? `<p class="msg">${esc(x.msg)}</p>` : ''}
        <span class="acts">${x.loc ? `<a class="btn sm" href="https://www.google.com/maps?q=${x.loc.lat},${x.loc.lng}" target="_blank" rel="noopener">${I('pin')} Ver en el mapa</a>` : ''}${x.phone ? `<a class="btn ghost sm" href="tel:${esc(telx(x.phone))}">${I('phone')} Llamar</a><a class="btn ghost sm" href="https://wa.me/${esc(telx(x.phone).replace(/^\+/, ''))}?text=${encodeURIComponent(`Hola, soy la familia de ${p.name}. Gracias por avisar.`)}" target="_blank" rel="noopener">WhatsApp</a>` : ''}</span></span></div>`
    : `<div class="row">${bubble('qr', 'viaje')}<span class="what"><b>Escanearon el QR</b><small>${esc(Z.fmtWhen(new Date(x.at)))}${place(x) ? ' · cerca de ' + esc(place(x)) + ' (aproximado por la conexión)' : ' · sin ubicación'}</small></span></div>`).join('')}</div>
    <button class="link danger" id="scanClear" type="button">Borrar el registro de ${esc(p.name)}</button></section>`;
}

/* historial con filtros: tipo, año y texto */
const KIND_UI = { vacuna: ['syringe', 'salud'], anti: ['drop', 'salud'], control: ['steth', 'cuida'], consulta: ['steth', 'cuida'], estudio: ['flask', 'viaje'], sintoma: ['note', 'plata'], cirugia: ['scalpel', 'perdida'], remedio: ['pill', 'med'] };
const FIL = [['todo', 'Todo'], ['vacuna', 'Vacunas'], ['anti', 'Antiparasitarios'], ['consulta', 'Consultas'], ['estudio', 'Estudios'], ['sintoma', 'Notas'], ['remedio', 'Remedios']];
const norm1 = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
function historyItems(p) {
  const h = ui.hist, q = norm1(h.q);
  return Z.timeline(p).filter(e => (h.type === 'todo' || e.k === h.type || (h.type === 'consulta' && (e.k === 'control' || e.k === 'cirugia'))) && (!h.year || e.date.startsWith(h.year)) && (!q || norm1(e.title + ' ' + e.sub).includes(q)));
}
function historySection(p) {
  const years = [...new Set(Z.timeline(p).map(e => e.date.slice(0, 4)))].sort().reverse();
  return `<section class="sec" aria-labelledby="h-hist">
    <div class="sec-h"><h2 id="h-hist">Historial</h2></div>
    <div class="filters">
      <label class="search">${I('search')}<span class="sr">Buscar en el historial</span><input type="search" id="histQ" placeholder="Buscar en el historial" value="${esc(ui.hist.q)}" autocomplete="off"></label>
      <label class="sel"><span class="sr">Año</span><select id="histY"><option value="">Año</option>${years.map(y => `<option${y === ui.hist.year ? ' selected' : ''}>${y}</option>`).join('')}</select></label>
    </div>
    <div class="chips scroll" role="group" aria-label="Tipo">${FIL.map(([k, l]) => `<button class="chip" data-act="hfilter" data-f="${k}" aria-pressed="${k === ui.hist.type}">${l}</button>`).join('')}</div>
    <div id="histList">${historyList(p)}</div>
  </section>`;
}
function historyList(p) {
  const tl = historyItems(p), any = Z.timeline(p).length;
  if (!tl.length) return any ? `<div class="empty dash"><p>No encontramos nada con esos filtros.</p><button class="btn sm ghost" data-act="hclear">Limpiar filtros</button></div>`
    : `<div class="empty dash"><p>Su historia empieza acá. Cada vacuna, consulta o estudio que cargues aparece en orden, con fecha.</p><button class="btn sm soft" data-act="add">${I('plus')} Cargar lo primero</button></div>`;
  let year = '';
  return `<p class="sr" role="status">${tl.length} resultados</p><div class="timeline">${tl.slice(0, 60).map(e => { const y = e.date.slice(0, 4), head = y !== year ? `<div class="year">${y}</div>` : ''; year = y; const u = KIND_UI[e.k]; return `${head}<button class="tl" data-act="detail" data-kind="${e.kind}" data-id="${e.ref.id}"><span class="tl-date">${fmt(e.date, { day: '2-digit', month: 'short' })}</span>${bubble(u[0], u[1])}<span class="what"><b>${esc(e.title)}</b>${e.sub ? `<small>${esc(e.sub)}</small>` : ''}</span>${I('chevron')}</button>`; }).join('')}</div>`;
}
app.addEventListener('input', e => {
  if (e.target.id === 'histQ') { ui.hist.q = e.target.value; $('#histList').innerHTML = historyList(curPet()); }
  if (e.target.id === 'libQ') { ui.lib.q = e.target.value; refreshLibreta(); }
});
app.addEventListener('change', e => {
  if (e.target.id === 'histY') { ui.hist.year = e.target.value; $('#histList').innerHTML = historyList(curPet()); }
  if (e.target.id === 'libY') { ui.lib.year = e.target.value; refreshLibreta(); }
});

/* ---------- detalle de un registro ---------- */
function detail(p, kind, id) {
  const find = { rec: p.records, visit: p.visits, study: p.studies, sym: p.symptoms, surg: p.surgeries, med: p.meds }[kind];
  const x = find?.find(r => r.id === id); if (!x) return;
  const dl = rows => `<dl class="dl">${rows.filter(r => r[1]).map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>`;
  let title = '', head = '', body = '', acts = '';
  const btn = (act, ic, label, cls = 'ghost') => `<button class="btn ${cls} wide" data-dact="${act}">${I(ic)} ${label}</button>`;
  if (kind === 'rec') {
    const s = Z.status(x.next);
    title = x.name || TYPE[x.type];
    head = `<div class="d-head">${x.sticker ? `<div class="stk has big"><img src="${esc(x.sticker)}" alt="Sticker de ${esc(title)}"></div>` : bubble(recIcon(x), 'salud')}<div><span class="eyebrow">${TYPE[x.type]}${x.type === 'desparasitacion' ? ' ' + Z.scopeOf(x) : ''}</span>${s ? `<span class="badge ${s.days < 0 ? 'late' : s.days <= 14 ? 'soon' : 'ok'}">${s.days < 0 ? s.t : 'Próxima: ' + (s.days <= 14 ? s.t.toLowerCase() : fmt(x.next))}</span>` : ''}</div></div>`;
    body = dl([['Se aplicó', x.date ? fmt(x.date, { day: 'numeric', month: 'long', year: 'numeric' }) : Z.isSug(x) ? 'Todavía no (fecha sugerida)' : ''], ['Próxima dosis', x.next ? fmt(x.next, { day: 'numeric', month: 'long', year: 'numeric' }) : ''], ['Lote o marca', esc(x.lot)], ['Veterinaria', esc(x.vet)], ['Notas', esc(x.notes)]]);
    if (Z.isSug(x)) body += '<p class="note">Fecha de referencia del calendario sugerido. Confirmala con tu veterinario y, cuando se la pongan, editala con la fecha real.</p>';
    const rn = Z.upcoming(p).some(u => u.r.id === x.id) && Z.renewable(x);
    acts = rn ? btn('renew', 'check', Z.renewLabel(x), 'big') + btn('postpone', 'cal', `${Z.notYetLabel(x)} · Posponer`) + btn('edit', 'edit', 'Editar', 'ghost')
      : btn('edit', 'edit', Z.isSug(x) ? 'Marcar como aplicada' : 'Editar', 'soft') + (x.type !== 'otro' ? btn('dup', 'copy', 'Duplicar como próxima dosis') : '');
    acts += x.next ? btn('ics', 'cal', 'Agregar al calendario') : '';
  } else if (kind === 'visit') {
    title = x.reason || 'Consulta';
    head = `<div class="d-head">${bubble('steth', 'cuida')}<div><span class="eyebrow">Consulta</span></div></div>`;
    body = dl([['Fecha', fmt(x.date, { day: 'numeric', month: 'long', year: 'numeric' })], ['Veterinaria', esc(x.vet)], ['Peso', x.weight ? kg(x.weight) : ''], ['Qué dijo', esc(x.findings)], ['Indicaciones', esc(x.plan)]]);
    acts = btn('edit', 'edit', 'Editar', 'soft');
  } else if (kind === 'study') {
    title = x.title || Z.STUDY[x.kind];
    head = `<div class="d-head">${bubble('flask', 'viaje')}<div><span class="eyebrow">${Z.STUDY[x.kind]}</span></div></div>`;
    body = dl([['Fecha', fmt(x.date, { day: 'numeric', month: 'long', year: 'numeric' })], ['Resultado', esc(x.notes)]]) + (x.files.length ? `<div class="list">${x.files.map(f => `<a class="row link-row" href="${esc(fileUrl(f))}" target="_blank" rel="noopener">${bubble(f.type === 'application/pdf' ? 'file' : 'camera', 'viaje')}<span class="what"><b>${esc(f.name)}</b><small>Abrir archivo</small></span>${I('chevron')}</a>`).join('')}</div>` : '<p class="note">Sin archivos. Editalo para subir la foto o el PDF del estudio.</p>');
    acts = btn('edit', 'edit', 'Editar', 'soft');
  } else if (kind === 'sym') {
    title = 'Algo que notaste';
    head = `<div class="d-head">${bubble('note', 'plata')}<div><span class="eyebrow">${fmt(x.date, { day: 'numeric', month: 'long', year: 'numeric' })}</span></div></div>`;
    body = `<p style="white-space:pre-wrap">${esc(x.text)}</p>`;
    acts = btn('edit', 'edit', 'Editar', 'soft');
  } else if (kind === 'surg') {
    title = x.name;
    head = `<div class="d-head">${bubble('scalpel', 'perdida')}<div><span class="eyebrow">Cirugía</span></div></div>`;
    body = dl([['Fecha', x.date ? fmt(x.date) : 'Sin fecha'], ['Notas', esc(x.notes)]]);
    acts = btn('edit', 'edit', 'Editar', 'soft');
  } else if (kind === 'med') {
    const st = Z.medState(x, p.log);
    title = x.name;
    head = `<div class="d-head">${bubble('pill', 'med')}<div><span class="eyebrow">Remedio</span></div></div>`;
    body = dl([['Dosis', esc(x.dose)], ['Cada', x.every >= 24 ? (x.every === 24 ? '1 vez por día' : x.every === 168 ? '1 vez por semana' : `${x.every / 24} días`) : `${x.every} horas`], ['Desde', x.start ? Z.fmtWhen(new Date(x.start)) : ''], ['Durante', x.days ? `${x.days} días` : 'Sin fin'], ['Estado', { ok: 'Al día', due: 'Le toca ahora', late: 'Atrasado', ended: 'Terminado', soon: 'Todavía no empezó', nostart: 'Sin empezar' }[st.state]], ['Indicaciones', esc(x.notes)]]);
    acts = btn('edit', 'edit', 'Editar', 'soft') + btn('icsMed', 'cal', 'Avisos de cada toma');
  }
  panel(title, `${head}${body}<div class="d-acts">${acts}<button class="btn ghost wide danger" data-dact="del">${I('trash')} Borrar</button></div>`);
  $('#pBody').onclick = e => {
    const b = e.target.closest('[data-dact]'); if (!b) return;
    const a = b.dataset.dact;
    if (a === 'del') {
      dPanel.close();
      const label = kind === 'rec' ? `${x.name || 'Registro'} borrado.` : kind === 'med' ? `${x.name} borrado.` : 'Borrado.';
      return undoable(label, drop(find, x));
    }
    if (a === 'ics') return calendar([Z.recordEvent(p, x)], `${p.name} ${x.name}`);
    if (a === 'icsMed') return calendar([Z.medEvent(p, x)], `${p.name} ${x.name}`);
    dPanel.close();
    if (a === 'dup') return nextDose(p, x);
    if (a === 'renew') return renewSheet(p, x);
    if (a === 'postpone') return postponeSheet(p, x);
    ({ rec: () => recForm(p, x), visit: () => visitForm(p, x), study: () => studyForm(p, x), sym: () => symptomForm(p, x), surg: () => surgeryForm(p, x), med: () => medForm(p, x) })[kind]();
  };
}
function panel(title, html) { $('#dPanelT').textContent = title; $('#pBody').innerHTML = html; $('#pBody').onclick = null; if (!dPanel.open) dPanel.showModal(); }

/* ---------- LIBRETA SANITARIA DIGITAL ----------
   Imita la libreta del veterinario y se arma con el mismo doc de la mascota:
   records (vacunas, desparasitaciones, controles), visits, weights y los datos de la ficha. */
const dd = s => s ? fmt(s, { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
const PER_PAGE = 5;
const LIB_SECS = [['tapa', 'Pasaporte'], ['id', 'Identificación'], ['vac', 'Vacunas'], ['des', 'Desparasitaciones'], ['ctl', 'Controles y consultas'], ['hist', 'Historial clínico'], ['peso', 'Peso']];
const byDate = (a, b) => (a.date || '9999').localeCompare(b.date || '9999') || (a.next || '').localeCompare(b.next || '');
function libFilter(text, date) {
  const q = norm1(ui.lib.q);
  return (!ui.lib.year || String(date || '').startsWith(ui.lib.year)) && (!q || norm1(text).includes(q));
}
const filtering = () => Boolean(ui.lib.q || ui.lib.year);
/* color del sticker según qué es: vacuna, desparasitación interna o externa */
const stkTone = r => r.type === 'vacuna' ? 't-vac' : r.type === 'desparasitacion' ? (Z.scopeOf(r) === 'externa' ? 't-ext' : 't-int') : 't-otro';
/* color de cada sticker: fijo por vacuna o tipo de antiparasitario, y el resto por un hash del nombre.
   [fondo, borde, texto]: el texto oscuro sobre el fondo claro pasa AA con margen (≥ 7:1). */
const STK = {
  poli: ['#D6E7FB', '#8DB4E2', '#173F6E'], rabia: ['#FFD9D1', '#E8907E', '#7A1E0B'], corona: ['#FCEBB5', '#D9B44A', '#5A4000'],
  felina: ['#E6DCFF', '#A58BF0', '#3E2591'], leucemia: ['#FFD6E1', '#E88AA6', '#80163A'], tos: ['#CFF0F1', '#6CC0C6', '#0E5459'],
  interna: ['#D2F0DC', '#6CC08F', '#12512F'], externa: ['#FFDCC8', '#F0A06E', '#7A2E06'],
};
const STK_HASH = [STK.poli, STK.felina, STK.leucemia, STK.tos, STK.corona, STK.interna];
function stkColor(r) {
  const n = String(r.name || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (r.type === 'desparasitacion') return Z.scopeOf(r) === 'externa' ? STK.externa : STK.interna;
  if (/quintuple|sextuple|octuple|polivalente|moquillo/.test(n)) return STK.poli;
  if (/rabi/.test(n)) return STK.rabia;
  if (/corona/.test(n)) return STK.corona;
  if (/triple felina|felina triple/.test(n)) return STK.felina;
  if (/leucemia|felv/.test(n)) return STK.leucemia;
  if (/tos|perrera|bordetella/.test(n)) return STK.tos;
  let h = 0; for (const ch of n) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return STK_HASH[h % STK_HASH.length];
}
function seal(r) {
  const t = stkTone(r), [bg, bd, fg] = stkColor(r), st = `style="--stk:${bg};--stk-b:${bd};--stk-i:${fg}"`;
  if (r.sticker) return `<div class="stk has ${t}" ${st}><img src="${esc(r.sticker)}" alt="Sticker de ${esc(r.name)}" loading="lazy"></div>`;
  if (!r.date) return `<div class="stk empty-s ${t}" ${st} aria-hidden="true">Pendiente</div>`;
  return `<div class="stk typed real ${t}" ${st} aria-hidden="true"><b>${esc(r.name)}</b><small>${esc(r.lot || (r.type === 'vacuna' ? 'Vacuna' : 'Dosis'))}</small></div>`;
}
/* cinta de la próxima fecha: solo en el registro que manda (el último de cada tipo + nombre, como mascotas-rules.js);
   las dosis anteriores con próxima fecha llevan "Renovada" en gris */
function nextRib(r, s, renewed, print = false) {
  if (renewed) return `<span class="lrib r-old${print ? ' pr' : ''}"><small>Renovada</small></span>`;
  const d = `${fmt(r.next, { day: '2-digit' })} ${fmt(r.next, { month: 'short' }).replace('.', '')}`;
  const cls = s.days < 0 ? 'r-late' : s.days <= 14 ? 'r-soon' : 'r-ok';
  const k = s.days < 0 ? 'Venció' : s.days === 0 ? '' : 'Próxima';
  return `<span class="lrib ${cls}${print ? ' pr' : ''}" title="${esc(s.t)}">${k ? `<small>${k}</small>` : ''}<b>${s.days === 0 ? 'HOY' : d}</b></span>`;
}
function recEntry(r, isLate, isCurrent, p) {
  const s = r.next ? Z.status(r.next) : null;
  const renewed = Boolean(r.next && r.date && !isCurrent && !isLate);
  const rib = s && (isCurrent || isLate || renewed) ? nextRib(r, s, renewed) : '';
  const nextTxt = r.next && !rib ? `<span><em>Próx.</em> ${dd(r.next)}</span>` : '';
  return `<li class="entry lrow${r.date ? '' : ' planned'}">${seal(r)}
    <div class="e-main"><span class="e-name">${esc(r.name)}</span>
      <span class="e-dates">${r.date ? `<span><em>Aplic.</em> ${dd(r.date)}</span>` : '<span><em>Sin aplicar</em></span>'}${nextTxt}</span>
      ${r.lot || r.vet ? `<span class="e-sub">${esc([r.lot ? 'Lote/marca: ' + r.lot : '', r.vet].filter(Boolean).join(' · '))}</span>` : ''}
      ${Z.isSug(r) ? '<span class="badge none" style="align-self:flex-start;margin-top:2px">Sugerida, sin confirmar</span>' : ''}
    </div>
    ${rib ? `<div class="e-rib">${rib}${p && (isCurrent || isLate) && Z.renewable(r) ? doneBtn(p, r) : ''}</div>` : ''}
    <button class="e-edit" data-act="detail" data-kind="rec" data-id="${r.id}" aria-label="Ver ${esc(r.name)}">${I('more')}</button></li>`;
}
/* lo último de cada vacuna manda: si ya se dio la de este año, la del año pasado no figura como vencida */
function lateIds(p) { return new Set(Z.upcoming(p).filter(x => x.s.days < 0).map(x => x.r.id)); }
function libPages(p) {
  const late = lateIds(p);
  const current = new Set(Z.upcoming(p).map(x => x.r.id));
  const recE = r => recEntry(r, late.has(r.id), current.has(r.id), p);
  const pages = [];
  const chunk = (sec, title, items, empty) => {
    if (!items.length) { pages.push({ sec, title, html: empty }); return; }
    for (let i = 0; i < items.length; i += PER_PAGE) {
      const part = items.slice(i, i + PER_PAGE); let g = null, html = '', open = false;
      for (const x of part) {
        if (x.group && x.group !== g) { if (open) html += '</ol>'; html += `<h3>${x.group}${g === null && i > 0 && items[i - 1].group === x.group ? ' (sigue)' : ''}</h3><ol class="entries">`; open = true; g = x.group; }
        else if (!open) { html += '<ol class="entries">'; open = true; }
        html += x.html;
      }
      if (open) html += '</ol>';
      pages.push({ sec, title, cont: i > 0, html });
    }
  };
  const emptyPg = (txt, act, label) => `<div class="pg-empty"><p>${filtering() ? 'No hay registros con esos filtros.' : txt}</p>${filtering() ? '<button class="btn sm ghost" data-act="lclear">Limpiar filtros</button>' : `<button class="btn sm" data-act="${act}">${I('plus')} ${label}</button>`}<div class="lines" aria-hidden="true"></div></div>`;
  pages.push({ sec: 'tapa', cover: true });
  pages.push({ sec: 'id', title: 'Identificación', html: idPage(p) });
  const vac = p.records.filter(r => r.type === 'vacuna' && libFilter(`${r.name} ${r.lot} ${r.vet}`, r.date || r.next)).sort(byDate);
  chunk('vac', 'Vacunas', vac.map(r => ({ html: recE(r) })), emptyPg(`Todavía no hay vacunas en la libreta. Cargá la última que figure en la libreta del veterinario, con su sticker si lo tenés.`, 'newVac', 'Cargar vacuna'));
  const des = p.records.filter(r => r.type === 'desparasitacion' && libFilter(`${r.name} ${r.lot} ${r.vet}`, r.date || r.next)).sort(byDate);
  const dItems = [...des.filter(r => Z.scopeOf(r) === 'interna').map(r => ({ group: 'Interna', html: recE(r) })), ...des.filter(r => Z.scopeOf(r) === 'externa').map(r => ({ group: 'Externa', html: recE(r) }))];
  chunk('des', 'Desparasitaciones', dItems, emptyPg('Anotá cada antiparasitario: los internos (comprimidos) y los externos (pipetas, collares, comprimidos antipulgas).', 'newAnti', 'Cargar antiparasitario'));
  const ctl = [
    ...p.records.filter(r => (r.type === 'control' || r.type === 'otro') && libFilter(`${r.name} ${r.vet} ${r.notes}`, r.date || r.next)).map(r => ({ date: r.date || r.next, html: `<li class="entry noseal${r.date ? '' : ' planned'}"><div class="e-main"><span class="e-name">${esc(r.name)}</span><span class="e-dates">${r.date ? `<span><em>Fecha</em> ${dd(r.date)}</span>` : '<span><em>Sin hacer</em></span>'}${r.next ? `<span><em>Próx.</em> ${dd(r.next)}</span>` : ''}</span>${r.vet || r.notes ? `<span class="e-sub">${esc([r.vet, r.notes].filter(Boolean).join(' · '))}</span>` : ''}</div><button class="e-edit" data-act="detail" data-kind="rec" data-id="${r.id}" aria-label="Ver ${esc(r.name)}">${I('more')}</button></li>` })),
    ...p.visits.filter(v => libFilter(`${v.reason} ${v.vet} ${v.findings} ${v.plan}`, v.date)).map(v => ({ date: v.date, html: `<li class="entry noseal"><div class="e-main"><span class="e-name">${esc(v.reason || 'Consulta')}</span><span class="e-dates"><span><em>Fecha</em> ${dd(v.date)}</span>${v.weight ? `<span><em>Peso</em> ${kg(v.weight)}</span>` : ''}</span>${v.vet || v.findings ? `<span class="e-sub">${esc([v.vet, v.findings].filter(Boolean).join(' · '))}</span>` : ''}</div><button class="e-edit" data-act="detail" data-kind="visit" data-id="${v.id}" aria-label="Ver consulta">${I('more')}</button></li>` })),
  ].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  chunk('ctl', 'Controles y consultas', ctl, emptyPg('Cada control o consulta queda acá con fecha, veterinaria y lo que te dijeron.', 'newVisit', 'Anotar consulta'));
  const hist = histEvents(p).filter(e => libFilter(`${e.title} ${e.sub} ${e.ref?.notes || ''} ${e.ref?.lab || ''}`, e.date));
  const intro = { html: `<li class="hist-intro"><p>${HIST_NOTE}</p><div class="hist-acts"><button class="btn sm" data-act="bulkStudies">${I('file')} Subir estudios</button>${gmailBtn()}</div></li>` };
  const histEmpty = emptyPg(`Consultas, estudios, cirugías, problemas de salud y lo que notaste, en orden. ${HIST_NOTE}`, 'bulkStudies', 'Subir estudios');
  chunk('hist', 'Historial clínico', hist.length ? [intro, ...hist.map(e => ({ html: histEntry(e) }))] : [], gmailBtn() && !filtering() ? histEmpty.replace('</button><div class="lines"', `</button>${gmailBtn()}<div class="lines"`) : histEmpty);
  pages.push({ sec: 'peso', title: 'Peso', html: weightPage(p) });
  return pages;
}
function idPage(p) {
  const fillBtn = (act, t) => `<button class="fill" data-act="${act}">${t}</button>`;
  const row = (k, v, act = 'editPet') => `<div class="idrow"><span>${k}</span>${v ? `<b>${v}</b>` : fillBtn(act, 'Completar')}</div>`;
  const sexTxt = p.sex === 'h' ? 'Hembra' : p.sex === 'm' ? 'Macho' : '';
  return `<div class="idlist">
    ${row('Nombre', esc(p.name))}
    ${row('Especie', esc(Z.species(p)))}
    ${row('Raza', esc(p.breed))}
    ${row('Nacimiento', p.birth ? `${dd(p.birth)} <span class="dim">(${Z.age(p.birth)})</span>` : '')}
    ${row('Sexo', sexTxt)}
    ${row('Color y señas', esc([p.color, p.marks].filter(Boolean).join('. ')))}
    ${row('Microchip', p.chip ? `<span class="num">${esc(p.chip)}</span>` : '')}
    ${row('Castrado/a', p.neutered === 'si' ? 'Sí' : p.neutered === 'no' ? 'No' : '')}
    ${row('Alergias', esc(p.allergies) || (p.allergies === '' ? '' : ''))}
    ${row('Tutor/a', esc([p.contact.name, p.contact.phone].filter(Boolean).join(' · ')))}
    ${row('Veterinaria', esc([p.vet.name, p.vet.phone].filter(Boolean).join(' · ')), 'vet')}
  </div>`;
}
function weightChart(p, h = 140) {
  const w = p.weights.filter(x => libFilter('', x.date)).slice(-12);
  if (w.length < 2) return '';
  const W = 340, H = h + 10, P = 28, min = Math.min(...w.map(x => x.kg)), max = Math.max(...w.map(x => x.kg)), r = max - min || 1;
  const x = i => P + i * (W - 2 * P) / (w.length - 1), y = v => H - P - (v - min) / r * (H - 2 * P);
  const pts = w.map((d, i) => `${x(i).toFixed(1)},${y(d.kg).toFixed(1)}`).join(' ');
  const last = w[w.length - 1];
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Peso de ${esc(p.name)}: de ${kg(w[0].kg)} a ${kg(last.kg)}">
    <line x1="${P}" x2="${W - P}" y1="${H - P}" y2="${H - P}" stroke="var(--line2)"/>
    <polyline points="${pts}" fill="none" stroke="var(--act)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    ${w.map((d, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(d.kg).toFixed(1)}" r="${i === w.length - 1 ? 4.5 : 3}" fill="${i === w.length - 1 ? 'var(--act)' : 'var(--paper)'}" stroke="var(--act)" stroke-width="1.75"/>`).join('')}
    <text x="${x(0)}" y="${H - 8}" font-size="10.5" fill="var(--ink3)" font-family="var(--mono)">${fmt(w[0].date, { month: 'short', year: '2-digit' })}</text>
    <text x="${x(w.length - 1)}" y="${H - 8}" font-size="10.5" fill="var(--ink3)" text-anchor="end" font-family="var(--mono)">${fmt(last.date, { month: 'short', year: '2-digit' })}</text>
    <text x="${W - P}" y="14" font-size="13" font-weight="600" fill="var(--ink)" text-anchor="end">Último: ${kg(last.kg)}</text>
  </svg>`;
}
function weightPage(p) {
  const w = p.weights.filter(x => libFilter('', x.date));
  if (!w.length) return `<div class="pg-empty"><p>${filtering() ? 'No hay pesos en ese año.' : 'Anotá su peso en cada consulta o cuando lo peses en casa. Con dos o más, ves cómo cambia.'}</p>${filtering() ? '<button class="btn sm ghost" data-act="lclear">Limpiar filtros</button>' : `<button class="btn sm" data-act="newWeight">${I('plus')} Anotar peso</button>`}<div class="lines" aria-hidden="true"></div></div>`;
  const rows = [...w].reverse().slice(0, 8);
  return `${weightChart(p) ? `<div class="wchart">${weightChart(p)}</div>` : ''}
    <ol class="entries">${rows.map((x, i) => { const prev = w[w.length - 2 - i]; const d = prev ? Math.round((x.kg - prev.kg) * 10) / 10 : null; return `<li class="entry noseal wrow"><div class="e-main"><span class="e-dates"><span><em>Fecha</em> ${dd(x.date)}</span></span></div><span class="wkg">${kg(x.kg)}${d ? `<small>${d > 0 ? '+' : ''}${String(d).replace('.', ',')}</small>` : ''}</span><button class="e-edit" data-act="editWeight" data-date="${x.date}" aria-label="Editar peso del ${dd(x.date)}">${I('more')}</button></li>`; }).join('')}</ol>
    <button class="link add-line" data-act="newWeight">${I('plus')} Anotar peso</button>`;
}
/* pasaporte: la primera página de la libreta y del PDF, con la foto original y el color de la mascota */
function passport(p, print = false) {
  const img = p.photoFull || p.photo, id = p.chip || p.id.toUpperCase();
  const upd = fmt((doc.updatedAt || new Date().toISOString()).slice(0, 10), { day: 'numeric', month: 'short', year: 'numeric' });
  const f = [['Nacimiento', p.birth ? dd(p.birth) : '—'], ['Sexo', p.sex === 'h' ? 'Hembra' : p.sex === 'm' ? 'Macho' : '—'], ['Especie', Z.species(p)], [p.chip ? 'Microchip' : 'ID Mimitos', id]];
  const band = `Libreta sanitaria · Actualizada el ${upd} · `;
  return `<div class="passport" style="--hero:${hueOf(p)[0]}">
    <div class="pp-top"><span class="pp-k">${HEART}Pasaporte</span><span class="pp-id num">N.º ${esc(id)}</span></div>
    <div class="pp-body">
      <div class="pp-photo">${img ? `<img src="${esc(img)}" alt="Foto de ${esc(p.name)}">` : Z.petIcon(p)}</div>
      <dl>${f.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
    </div>
    <div class="pp-band" aria-label="Actualizada el ${upd}"><span aria-hidden="true">${band.repeat(4)}</span></div>
    <div class="pp-name"><div><h2>${esc(p.name)},</h2><p>${esc(p.breed || Z.species(p))}${p.birth ? ' · ' + Z.age(p.birth) : ''}</p></div>${print ? '' : `<button class="pp-more" data-act="editPet" aria-label="Editar datos de ${esc(p.name)}">${I('more')}</button>`}</div>
  </div>`;
}
function coverPage(p) {
  return `${passport(p)}<span class="mark">${HEART}mimitos <small>by Orbit</small></span>`;
}
function coverPageOld(p) {
  const meta = [Z.species(p), p.breed].filter(Boolean).join(' · ');
  return `<div class="frame" aria-hidden="true"></div>
    <span class="kicker">Libreta sanitaria</span>
    <div class="photo">${p.photo ? `<img src="${esc(p.photo)}" alt="Foto de ${esc(p.name)}">` : Z.petIcon(p)}</div>
    <div><div class="pname">${esc(p.name)}</div><div class="pmeta">${esc(meta)}</div></div>
    <span class="mark">${HEART}mimitos <small>by Orbit</small></span>`;
}
function bookHtml(p) {
  const pages = libPages(p), total = pages.length;
  const secFirst = {}; pages.forEach((pg, i) => { if (!(pg.sec in secFirst)) secFirst[pg.sec] = i; });
  ui.lib.secFirst = secFirst; ui.lib.total = total; ui.lib.pages = pages;
  return `<div class="book">
    <div class="pages" id="pages" tabindex="0" role="region" aria-roledescription="libreta" aria-label="Libreta de ${esc(p.name)}. Usá las flechas para pasar de página.">
      ${pages.map((pg, i) => pg.cover
        ? `<section class="page cover" style="--hero:${hueOf(p)[0]}" aria-label="Pasaporte">${coverPage(p)}<div class="page-f"><span>Mimitos</span><span>${String(i + 1).padStart(2, '0')}</span></div></section>`
        : `<section class="page" aria-label="${pg.title}, página ${i + 1} de ${total}"><div class="page-h"><h2>${pg.title}${pg.cont ? ' <span class="dim" style="font-size:.6em">(sigue)</span>' : ''}</h2><span class="eyebrow">${esc(p.name)}</span></div>${pg.html}<div class="page-f"><span>Libreta de ${esc(p.name)}</span><span>${String(i + 1).padStart(2, '0')}</span></div></section>`).join('')}
    </div>
    <div class="pager">
      <button class="ibtn" data-act="lprev" aria-label="Página anterior">${I('back')}</button>
      <div class="pg-mid"><div class="dots" role="group" aria-label="Páginas">${pages.map((pg, i) => `<button type="button" data-act="lgo" data-i="${i}" aria-label="Página ${i + 1}: ${pg.cover ? 'Pasaporte' : pg.title}"><i></i></button>`).join('')}</div><span class="pg-label" id="pgLabel" aria-live="polite"></span></div>
      <button class="ibtn" data-act="lnext" aria-label="Página siguiente">${I('next')}</button>
    </div>
  </div>`;
}
function renderLibreta(p) {
  const years = [...new Set([...p.records.map(r => (r.date || r.next || '').slice(0, 4)), ...p.visits.map(v => v.date.slice(0, 4)), ...p.weights.map(w => w.date.slice(0, 4))].filter(Boolean))].sort().reverse();
  after(() => { const j = ui.lib.jumpSec ? ui.lib.secFirst?.[ui.lib.jumpSec] : ui.lib.jump; ui.lib.jumpSec = null; initBook(j); });
  return `${doc.pets.length > 1 ? switcher(p) : ''}
    <div class="lib-top">
      <div><span class="eyebrow">Libreta sanitaria</span><h1>La libreta de ${esc(p.name)}</h1></div>
      <div class="lib-tools"><button class="btn sm ghost" data-act="add">${I('plus')} Cargar</button><button class="btn sm" data-act="go" data-to="pdf">${I('print')} PDF</button></div>
    </div>
    <div class="lib-bar">
      <div class="chips scroll" role="group" aria-label="Secciones de la libreta" id="libSecs">${LIB_SECS.map(([k, l]) => `<button class="chip" data-act="lsec" data-sec="${k}" aria-pressed="false">${l}</button>`).join('')}</div>
      <div class="filters">
        <label class="search">${I('search')}<span class="sr">Buscar en la libreta</span><input type="search" id="libQ" placeholder="Buscar en la libreta" value="${esc(ui.lib.q)}" autocomplete="off"></label>
        <label class="sel"><span class="sr">Año</span><select id="libY"><option value="">Año</option>${years.map(y => `<option${y === ui.lib.year ? ' selected' : ''}>${y}</option>`).join('')}</select></label>
      </div>
    </div>
    <div id="bookWrap">${bookHtml(p)}</div>`;
}
function refreshLibreta() {
  const p = curPet(); $('#bookWrap').innerHTML = bookHtml(p);
  initBook(filtering() ? (ui.lib.secFirst.vac ?? 0) : ui.lib.page);
}
let bookIdx = 0;
function initBook(start) {
  const el = $('#pages'); if (!el) return;
  ui.lib.jump = null;
  const step = () => (matchMedia('(min-width:1024px)').matches ? 2 : 1);
  const pw = () => el.clientWidth / step();
  const sync = () => {
    bookIdx = Math.round(el.scrollLeft / pw()); ui.lib.page = bookIdx;
    const total = ui.lib.total, last = Math.min(total - 1, bookIdx + step() - 1);
    document.querySelectorAll('.dots button').forEach((b, i) => b.setAttribute('aria-current', String(i >= bookIdx && i <= last)));
    const pg = ui.lib.pages[bookIdx];
    $('#pgLabel').textContent = `${pg.cover ? 'Pasaporte' : pg.title} · ${bookIdx + 1}${last > bookIdx ? '–' + (last + 1) : ''} de ${total}`;
    $('[data-act="lprev"]').disabled = bookIdx <= 0; $('[data-act="lnext"]').disabled = last >= total - 1;
    const secs = ui.lib.pages.slice(bookIdx, last + 1).map(x => x.sec);
    document.querySelectorAll('#libSecs .chip').forEach(c => c.setAttribute('aria-pressed', String(secs.includes(c.dataset.sec))));
  };
  let raf = 0; el.addEventListener('scroll', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(sync); }, { passive: true });
  el.addEventListener('keydown', e => { if (e.key === 'ArrowRight') { e.preventDefault(); bookGo(bookIdx + step()); } if (e.key === 'ArrowLeft') { e.preventDefault(); bookGo(bookIdx - step()); } });
  const s = Math.max(0, Math.min(ui.lib.total - 1, start || 0));
  el.scrollLeft = (step() === 2 ? s - (s % 2) : s) * pw();
  sync();
}
function bookGo(i) {
  const el = $('#pages'); if (!el) return;
  const step = matchMedia('(min-width:1024px)').matches ? 2 : 1;
  i = Math.max(0, Math.min(ui.lib.total - 1, i)); if (step === 2) i -= i % 2;
  el.scrollTo({ left: i * (el.clientWidth / step), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}

/* ---------- PDF: vista previa en hoja A4, se imprime o se guarda como PDF ---------- */
function libretaDoc(p) {
  const t = rows => `<table>${rows}</table>`;
  const recs = type => p.records.filter(r => r.type === type).sort(byDate);
  const cur = new Set(Z.upcoming(p).map(x => x.r.id));
  const nx = r => !r.next ? '' : cur.has(r.id) ? nextRib(r, Z.status(r.next), false, true) : r.date ? `${dd(r.next)} <span class="m">(renovada)</span>` : dd(r.next);
  const vac = recs('vacuna'), des = recs('desparasitacion'), ctl = [...p.records.filter(r => r.type === 'control' || r.type === 'otro').map(r => ({ date: r.date, what: r.name, vet: r.vet, w: '', notes: r.notes, next: r.next })), ...p.visits.map(v => ({ date: v.date, what: v.reason || 'Consulta', vet: v.vet, w: v.weight ? kg(v.weight) : '', notes: [v.findings, v.plan].filter(Boolean).join(' · ') }))].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const kv = rows => `<div class="kv">${rows.map(([k, v]) => `<div><span>${k}</span><b>${v || '—'}</b></div>`).join('')}</div>`;
  const syms = [...p.symptoms].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 15);
  return `<article class="sheetdoc">
    <div class="pd-pass">${passport(p, true)}<div class="pd-brand">Libreta sanitaria<br>Mimitos by Orbit<br>Generada el ${dd(iso(Z.today()))}</div></div>
    <p class="pd-warn"><b>Mimitos es un organizador, no reemplaza al veterinario.</b> Datos cargados por el tutor o la tutora.</p>
    ${p.allergies ? `<p class="pd-alert"><b>Alergias:</b> ${esc(p.allergies)}</p>` : ''}
    <h2>Identificación</h2>
    ${kv([['Especie', esc(Z.species(p))], ['Raza', esc(p.breed)], ['Nacimiento', p.birth ? `${dd(p.birth)} (${Z.age(p.birth)})` : ''], ['Sexo', p.sex === 'h' ? 'Hembra' : p.sex === 'm' ? 'Macho' : ''], ['Color y señas', esc([p.color, p.marks].filter(Boolean).join('. '))], ['Microchip', esc(p.chip)], ['Castrado/a', p.neutered === 'si' ? 'Sí' : p.neutered === 'no' ? 'No' : ''], ['Peso', p.weight ? kg(p.weight) : ''], ['Tutor/a', esc([p.contact.name, p.contact.phone].filter(Boolean).join(' · '))], ['Veterinaria', esc([p.vet.name, p.vet.phone].filter(Boolean).join(' · '))]])}
    <h2>Vacunas</h2>
    ${vac.length ? t(`<tr><th>Fecha</th><th>Vacuna</th><th class="hide-s">Lote o marca</th><th class="hide-s">Veterinaria</th><th>Próxima</th><th class="hide-s">Sticker</th></tr>${vac.map(r => `<tr><td>${r.date ? dd(r.date) : '<span class="m">Sin aplicar</span>'}</td><td>${esc(r.name)}${Z.isSug(r) ? ' <span class="m">(sugerida)</span>' : ''}</td><td class="hide-s">${esc(r.lot)}</td><td class="hide-s">${esc(r.vet)}</td><td>${nx(r)}</td><td class="hide-s">${r.sticker ? `<img class="stkp" src="${esc(r.sticker)}" alt="">` : ''}</td></tr>`).join('')}`) : '<p class="m">Sin vacunas cargadas.</p>'}
    <h2>Desparasitaciones</h2>
    ${des.length ? t(`<tr><th>Fecha</th><th>Tipo</th><th>Producto</th><th class="hide-s">Lote o marca</th><th>Próxima</th></tr>${des.map(r => `<tr><td>${r.date ? dd(r.date) : '<span class="m">Sin aplicar</span>'}</td><td>${Z.scopeOf(r) === 'interna' ? 'Interna' : 'Externa'}</td><td>${esc(r.name)}</td><td class="hide-s">${esc(r.lot)}</td><td>${nx(r)}</td></tr>`).join('')}`) : '<p class="m">Sin desparasitaciones cargadas.</p>'}
    <h2>Controles y consultas</h2>
    ${ctl.length ? t(`<tr><th>Fecha</th><th>Motivo</th><th class="hide-s">Veterinaria</th><th>Peso</th><th>Indicaciones</th></tr>${ctl.map(c => `<tr><td>${c.date ? dd(c.date) : '<span class="m">Pendiente</span>'}</td><td>${esc(c.what)}</td><td class="hide-s">${esc(c.vet)}</td><td>${c.w}</td><td>${esc(c.notes)}</td></tr>`).join('')}`) : '<p class="m">Sin controles cargados.</p>'}
    <h2>Peso</h2>
    ${p.weights.length ? t(`<tr><th>Fecha</th><th>Peso</th></tr>${[...p.weights].reverse().slice(0, 10).map(w => `<tr><td>${dd(w.date)}</td><td>${kg(w.kg)}</td></tr>`).join('')}`) : '<p class="m">Sin pesos cargados.</p>'}
    <h2>Antecedentes</h2>
    ${kv([['Problemas de salud', p.conditions.length ? p.conditions.map(c => `${esc(c.name)} (${{ activa: 'activo', controlada: 'controlado', resuelta: 'resuelto' }[c.status]})`).join(', ') : 'Ninguno cargado'], ['Cirugías', p.surgeries.length ? p.surgeries.map(c => esc(c.name) + (c.date ? ' ' + dd(c.date) : '')).join(', ') : 'Ninguna cargada'], ['Remedios de siempre', esc(p.chronic) || 'Ninguno']])}
    ${(() => { const h = histEvents(p); return h.length ? `<h2>Historial clínico</h2><p class="m">${HIST_NOTE}</p>${t(`<tr><th>Fecha</th><th>Qué</th><th>Detalle</th></tr>${h.map(e => `<tr><td>${e.date ? dd(e.date) : '—'}</td><td><b>${esc(e.title)}</b><br><span class="m">${HK[e.k][2]}</span></td><td>${esc(e.kind === 'study' ? [e.ref.lab, e.ref.notes].filter(Boolean).join(' · ') : e.sub)}${e.kind === 'study' && e.ref.files?.length ? ` <span class="m">(${e.ref.files.length} archivo${e.ref.files.length > 1 ? 's' : ''} en Mimitos)</span>` : ''}</td></tr>`).join('')}`)}` : ''; })()}
    ${p.meds.length ? `<h2>Medicación</h2>${t(`<tr><th>Medicamento</th><th>Dosis</th><th>Frecuencia</th><th>Desde</th><th>Estado</th></tr>${p.meds.map(m => `<tr><td>${esc(m.name)}</td><td>${esc(m.dose)}</td><td>cada ${m.every} h</td><td>${m.start ? dd(m.start.slice(0, 10)) : ''}</td><td>${Z.medState(m, p.log).state === 'ended' ? 'Terminado' : 'En curso'}</td></tr>`).join('')}`)}` : ''}
    ${syms.length ? `<h2>Lo que notamos</h2>${t(syms.map(s => `<tr><td style="width:90px">${dd(s.date)}</td><td>${esc(s.text)}</td></tr>`).join(''))}` : ''}
    <p class="foot">Generado con Mimitos by Orbit (orbitando.com.ar/mascotas). Mimitos es un organizador: no reemplaza al veterinario ni su criterio.</p>
  </article>`;
}
function renderPdf(p) {
  after(() => { $('#print').innerHTML = libretaDoc(p); });
  return `<div class="pdf-wrap">
    <div class="lib-top"><div><button class="link" data-act="go" data-to="libreta">${I('back')} Libreta</button><h1>Libreta en PDF</h1><p class="dim">Así sale impresa. En el diálogo de impresión elegí "Guardar como PDF" para mandarla por WhatsApp o mail.</p></div>
      <div class="lib-tools"><button class="btn" data-act="print">${I('print')} Imprimir o guardar PDF</button></div></div>
    ${libretaDoc(p)}
  </div>`;
}

/* ---------- AGENDA: todas las fechas de todas las mascotas ---------- */
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const ymLabel = ym => { const [y, m] = ym.split('-').map(Number); return `${MONTHS[m - 1]} ${y}`; };
const ymAdd = (ym, n) => { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return iso(d).slice(0, 7); };
const stCls = s => !s ? 'none' : s.days < 0 ? 'late' : s.days <= 14 ? 'soon' : 'ok';
function agendaRow(x) {
  const ic = x.kind === 'food' ? ['bowl', 'comida'] : x.kind === 'trip' ? ['plane', 'viaje'] : [recIcon(x.r), 'salud'];
  const act = x.kind === 'rec' ? `data-act="detailOf" data-pet="${x.pet.id}" data-kind="rec" data-id="${x.r.id}"` : x.kind === 'food' ? `data-act="goPet" data-pet="${x.pet.id}" data-to="gastos"` : `data-act="goPet" data-pet="${x.pet.id}" data-to="viajes"`;
  const ics = x.kind === 'rec' && Z.renewable(x.r) ? doneBtn(x.pet, x.r) : x.kind === 'rec' ? `<button class="ibtn" data-act="icsRec" data-pet="${x.pet.id}" data-rec="${x.r.id}" aria-label="Agregar ${esc(x.title)} al calendario">${I('cal')}</button>` : x.kind === 'food' ? `<button class="ibtn" data-act="icsFood" data-pet="${x.pet.id}" aria-label="Aviso para comprar alimento">${I('cal')}</button>` : '<span></span>';
  return `<div class="row ${x.s?.c || ''}"><span class="ag-date"><b>${fmt(x.date, { day: 'numeric' })}</b><small>${fmt(x.date, { month: 'short' }).replace('.', '')}</small></span><button class="what plain" ${act}><b>${esc(x.title)}</b><small>${esc(x.pet.name)} · ${x.s && x.s.days <= 14 ? `<span class="stt">${x.s.t}</span>` : esc(x.sub)}${x.kind === 'rec' && Z.isSug(x.r) ? ' · sugerida, confirmala con tu veterinario' : ''}</small></button>${ics}</div>`;
}
function renderAgenda() {
  const all = Z.agenda(doc.pets), today = iso(Z.today());
  const ym = ui.agenda.ym, [y, m] = ym.split('-').map(Number);
  const first = new Date(y, m - 1, 1), startDow = (first.getDay() + 6) % 7, days = new Date(y, m, 0).getDate();
  const byDay = {}; for (const x of all) (byDay[x.date] = byDay[x.date] || []).push(x);
  let cells = ''; for (let i = 0; i < startDow; i++) cells += '<span></span>';
  for (let d = 1; d <= days; d++) {
    const ds = `${ym}-${String(d).padStart(2, '0')}`, ev = byDay[ds] || [];
    const worst = ev.some(x => x.s?.days < 0) ? 'late' : ev.some(x => x.s?.days <= 14) ? 'soon' : 'ok';
    cells += `<button class="day${ds === today ? ' today' : ''}" data-act="aday" data-d="${ds}" aria-pressed="${ds === ui.agenda.sel}" aria-label="${d} de ${MONTHS[m - 1]}${ev.length ? `, ${ev.length} ${ev.length === 1 ? 'fecha' : 'fechas'}` : ''}"><span>${d}</span>${ev.length ? `<i class="dot ${worst}"></i>` : ''}</button>`;
  }
  const sel = byDay[ui.agenda.sel] || [];
  const late = all.filter(x => x.date < today), soon = all.filter(x => x.date >= today).slice(0, 12);
  const events = doc.pets.flatMap(p => [...Z.upcoming(p).filter(x => x.s.days >= 0).map(x => Z.recordEvent(p, x.r)), Z.foodEvent(p, p.food)]).filter(Boolean);
  return `<div class="lib-top"><div><span class="eyebrow">${doc.pets.length > 1 ? 'Todas tus mascotas' : esc(doc.pets[0].name)}</span><h1 class="h-xl">Agenda</h1></div>
      <div class="lib-tools"><button class="btn sm ghost" data-act="go" data-to="avisos">${I('bell')} Avisos</button><button class="btn sm" data-act="icsAll" ${events.length ? '' : 'disabled'}>${I('download')} Todo al calendario</button></div></div>
    <div class="cols">
      <div class="col">
        <section class="cal card" aria-label="Calendario de ${ymLabel(ym)}">
          <div class="cal-h"><button class="ibtn" data-act="amonth" data-n="-1" aria-label="Mes anterior">${I('back')}</button><h2 aria-live="polite">${ymLabel(ym)}</h2><button class="ibtn" data-act="amonth" data-n="1" aria-label="Mes siguiente">${I('next')}</button></div>
          <div class="cal-g" aria-hidden="true">${['L', 'M', 'M', 'J', 'V', 'S', 'D'].map(d => `<span class="dow">${d}</span>`).join('')}</div>
          <div class="cal-g">${cells}</div>
          <div class="cal-legend"><span><i class="dot late"></i>Vencida</span><span><i class="dot soon"></i>En 14 días</span><span><i class="dot ok"></i>Más adelante</span></div>
        </section>
        <section class="sec"><h2>${fmt(ui.agenda.sel, { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
          ${sel.length ? `<div class="list">${sel.map(agendaRow).join('')}</div>` : `<p class="dim">Nada para este día.</p>`}</section>
      </div>
      <div class="col">
        ${late.length ? `<section class="sec"><h2>Vencidas <span class="count">${late.length}</span></h2><div class="list">${late.map(agendaRow).join('')}</div></section>` : ''}
        <section class="sec"><h2>Próximas fechas</h2>
          ${soon.length ? `<div class="list">${soon.map(agendaRow).join('')}</div>` : `<div class="empty dash"><p>Cuando cargues vacunas, antiparasitarios o controles con su próxima fecha, aparecen acá en orden, de todas tus mascotas.</p><button class="btn sm soft" data-act="suggest">${I('sparkle')} Armar calendario sugerido</button></div>`}
        </section>
        <p class="note">Cada fecha tiene su botón de calendario: baja un archivo .ics con aviso a las 9 de la mañana, 3 días antes y el mismo día. iPhone y Outlook avisan solos; en Google Calendar, activá el aviso en el evento.</p>
      </div>
    </div>`;
}

/* ---------- GASTOS ---------- */
/* alimento: cuánto le dura (aprendido de las bolsas), cuándo se termina, cuánto sale por mes y por día */
function foodCard(fp, ym) {
  const f = Z.food(fp.food), sp = Z.foodSpend(fp, ym);
  const hist = (fp.food.bags || []).slice(-4).reverse();
  const head = `<div class="sec-h"><h2>Alimento de ${esc(fp.name)}</h2>${f || hist.length ? `<button class="link" data-act="food" data-pet="${fp.id}">Editar</button>` : ''}</div>`;
  const spend = sp.avg || sp.perDay ? `<div class="stats food-stats"><div class="stat"><span>Alimento por mes</span><b>${sp.avg ? money(sp.avg) : '—'}</b><small>${sp.months ? `promedio de ${sp.months} ${sp.months === 1 ? 'mes' : 'meses'}` : 'cargá los gastos de alimento'}</small></div><div class="stat"><span>Por día</span><b>${sp.perDay ? money(sp.perDay) : '—'}</b><small>${sp.perDay ? 'según el precio de tus bolsas' : 'poné el precio de la bolsa'}</small></div></div>` : '';
  const histHtml = hist.length ? `<details class="bags"><summary>Tus bolsas <span class="count">${(fp.food.bags || []).length}</span></summary><ul>${hist.map(b => `<li><span><span class="bd">${fmt(b.date, { day: 'numeric', month: 'short', year: 'numeric' })}</span><small>${[b.kg ? kgTxt(b.kg) + ' kg' : '', esc(b.brand || '')].filter(Boolean).join(' · ')}</small></span><b>${b.price ? money(b.price) : ''}</b></li>`).join('')}</ul></details>` : '';
  if (!f) {
    const one = hist.length || fp.food.opened;
    return `<section class="sec">${head}<div class="${one ? 'card' : 'empty dash'}">${one ? `<div style="display:flex;gap:12px;align-items:center">${bubble('bowl', 'comida')}<span><b>${esc(fp.food.brand || 'Alimento')}</b><small class="dim" style="display:block">Abriste la bolsa el ${fmt(fp.food.opened, { day: 'numeric', month: 'long' })}</small></span></div><p>Con la próxima bolsa aprendemos cuánto le dura y te avisamos antes de que se termine.</p>` : `<p>Anotá la bolsa que abriste, con los kilos. Desde la segunda, Mimitos aprende cuánto le dura y te avisa antes de que se termine.</p>`}
      <div class="btns"><button class="btn sm" data-act="newBag" data-pet="${fp.id}">${I('plus')} ${one ? 'Abrí una bolsa nueva' : 'Anotar la bolsa'}</button>${one ? '' : `<button class="btn ghost sm" data-act="food" data-pet="${fp.id}">Sé cuánto come por día</button>`}</div>${histHtml}</div>${spend}</section>`;
  }
  const how = f.src === 'aprendido' ? `Le dura en promedio <b>${f.days} días</b> (según tus últimas ${f.n} ${f.n === 1 ? 'bolsa' : 'bolsas'}).` : `Le dura unos <b>${f.days} días</b>, por los ${fp.food.dailyG} g por día. Con la próxima bolsa lo ajustamos con lo real.`;
  return `<section class="sec">${head}<div class="card"><div style="display:flex;gap:12px;align-items:center">${bubble('bowl', 'comida')}<span><b>${esc(fp.food.brand || 'Alimento')}</b><small class="dim" style="display:block">Bolsa de ${kgTxt(f.bagKg)} kg, abierta el ${fmt(f.opened, { day: 'numeric', month: 'long' })}</small></span></div>
    <div class="bar c-comida" role="img" aria-label="Queda ${Math.round(f.pct * 100)}% de la bolsa"><i style="width:${Math.round(f.pct * 100)}%"></i></div>
    <p>${how}</p>
    <p>${f.left < 0 ? '<b>Ya se terminó la bolsa.</b> Cuando abras otra, anotala.' : `Se termina aprox. el <b>${fmt(f.end, { day: 'numeric', month: 'long' })}</b> (${f.left === 0 ? 'hoy' : f.left === 1 ? 'mañana' : `en ${f.left} días`}).`}</p>
    <div class="btns"><button class="btn sm" data-act="newBag" data-pet="${fp.id}">${I('plus')} Abrí una bolsa nueva</button><button class="btn ghost sm" data-act="icsFood" data-pet="${fp.id}">${I('cal')} Avisame antes</button></div>${histHtml}</div>${spend}</section>`;
}
function renderGastos(cur) {
  const ym = ui.gastos.ym, filt = ui.gastos.pet;
  const pets = filt === 'all' ? doc.pets : doc.pets.filter(p => p.id === filt);
  const all = pets.flatMap(p => p.expenses.map(e => ({ e, p })));
  const month = all.filter(x => x.e.date.startsWith(ym)).sort((a, b) => b.e.date.localeCompare(a.e.date));
  const total = month.reduce((a, x) => a + x.e.amount, 0);
  const prev3 = [1, 2, 3].map(n => ymAdd(ym, -n)).map(k => all.filter(x => x.e.date.startsWith(k)).reduce((a, x) => a + x.e.amount, 0)).filter(v => v > 0);
  const avg = prev3.length ? prev3.reduce((a, b) => a + b, 0) / prev3.length : 0;
  const year = ym.slice(0, 4), yearTotal = all.filter(x => x.e.date.startsWith(year)).reduce((a, x) => a + x.e.amount, 0);
  const byCat = {}; for (const x of month) byCat[x.e.cat] = (byCat[x.e.cat] || 0) + x.e.amount;
  const byPet = {}; for (const x of month) byPet[x.p.id] = (byPet[x.p.id] || 0) + x.e.amount;
  const maxC = Math.max(1, ...Object.values(byCat)), maxP = Math.max(1, ...Object.values(byPet));
  const diff = avg ? Math.round((total - avg) / avg * 100) : null;
  const fp = filt === 'all' ? cur : petById(filt) || cur;
  const fund = fp.fund, pct = fund.goal ? Math.min(1, (fund.saved || 0) / fund.goal) : 0;
  const monthsLeft = fund.goal && fund.monthly ? Math.ceil(Math.max(0, fund.goal - (fund.saved || 0)) / fund.monthly) : null;
  return `<div class="lib-top"><div><span class="eyebrow">Gastos</span><h1 class="h-xl">Cuánto gastás</h1></div><div class="lib-tools"><button class="btn sm" data-act="newExp">${I('plus')} Agregar gasto</button></div></div>
    ${doc.pets.length > 1 ? `<div class="chips scroll" role="group" aria-label="Mascota"><button class="chip" data-act="gpet" data-id="all" aria-pressed="${filt === 'all'}">Todas</button>${doc.pets.map(p => `<button class="chip" data-act="gpet" data-id="${p.id}" aria-pressed="${filt === p.id}">${esc(p.name)}</button>`).join('')}</div>` : ''}
    <div class="cols">
      <div class="col">
        <section class="card month">
          <div class="cal-h"><button class="ibtn" data-act="gmonth" data-n="-1" aria-label="Mes anterior">${I('back')}</button><h2 aria-live="polite">${ymLabel(ym)}</h2><button class="ibtn" data-act="gmonth" data-n="1" aria-label="Mes siguiente" ${ym >= iso(Z.today()).slice(0, 7) ? 'disabled' : ''}>${I('next')}</button></div>
          <div class="big-num"><b>${money(total)}</b><small>${diff == null ? 'Sin meses anteriores para comparar' : diff === 0 ? 'Igual que tu promedio' : `${diff > 0 ? '+' : ''}${diff}% contra tu promedio de ${money(avg)}`}</small></div>
          <div class="stats"><div class="stat"><span>Promedio mensual</span><b>${avg ? money(avg) : '—'}</b>${avg ? '<small>últimos 3 meses</small>' : '<small>Se calcula con los meses anteriores</small>'}</div><div class="stat"><span>En ${year}</span><b>${money(yearTotal)}</b></div></div>
        </section>
        ${month.length ? `<section class="sec"><h2>Por categoría</h2><div class="bars">${Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([c, v]) => `<div class="bl"><span>${EXP[c]}</span><div class="bar"><i style="width:${Math.round(v / maxC * 100)}%"></i></div><b>${money(v)}</b></div>`).join('')}</div></section>` : ''}
        ${month.length && filt === 'all' && doc.pets.length > 1 ? `<section class="sec"><h2>Por mascota</h2><div class="bars">${doc.pets.filter(p => byPet[p.id]).map(p => `<div class="bl"><span>${esc(p.name)}</span><div class="bar c-${Z.tone(p)}"><i style="width:${Math.round(byPet[p.id] / maxP * 100)}%;background:var(--ci)"></i></div><b>${money(byPet[p.id])}</b></div>`).join('')}</div></section>` : ''}
        <section class="sec"><h2>Movimientos <span class="count">${month.length}</span></h2>
          ${month.length ? `<div class="list">${month.map(({ e, p }) => `<button class="row link-row" data-act="editExp" data-pet="${p.id}" data-exp="${e.id}">${bubble('wallet', 'plata')}<span class="what"><b class="num">${money(e.amount)}</b><small>${EXP[e.cat]}${e.note ? ' · ' + esc(e.note) : ''}${doc.pets.length > 1 ? ' · ' + esc(p.name) : ''}</small></span><span class="when">${fmt(e.date, { day: 'numeric', month: 'short' })}</span></button>`).join('')}</div>`
            : `<div class="empty dash"><p>No hay gastos en ${ymLabel(ym)}. Anotá alimento, veterinaria, pipetas y peluquería para saber cuánto te sale por mes.</p><button class="btn sm soft" data-act="newExp">${I('plus')} Agregar gasto</button></div>`}
        </section>
      </div>
      <div class="col">
        ${foodCard(fp, ym)}
        <section class="sec"><div class="sec-h"><h2>Ahorro para imprevistos</h2>${fund.goal ? `<button class="link" data-act="fund" data-pet="${fp.id}">Editar</button>` : ''}</div>
          ${fund.goal ? `<div class="card"><div style="display:flex;gap:12px;align-items:center">${bubble('piggy', 'salud')}<span><b class="num">${money(fund.saved || 0)} de ${money(fund.goal)}</b><small class="dim" style="display:block">${pct >= 1 ? 'Meta cumplida.' : monthsLeft ? `Separando ${money(fund.monthly)} por mes, llegás en ${monthsLeft} ${monthsLeft === 1 ? 'mes' : 'meses'}.` : 'Poné cuánto separás por mes para ver cuándo llegás.'}</small></span></div>
            <div class="bar"><i style="width:${Math.round(pct * 100)}%"></i></div>${fund.monthly ? `<button class="btn ghost sm" data-act="fundAdd" data-pet="${fp.id}" style="align-self:flex-start">${I('plus')} Sumar ${money(fund.monthly)} de este mes</button>` : ''}</div>`
          : `<div class="empty dash"><p>Una cirugía puede costar entre $300.000 y $450.000. Armá una meta y separá un poco por mes.</p><button class="btn sm soft" data-act="fund" data-pet="${fp.id}">Armar meta</button></div>`}
        </section>
      </div>
    </div>`;
}

/* ---------- CUENTA ---------- */
function renderCuenta() {
  const nOn = notify && (notify.devices || notify.mail);
  const initial = (me.name || me.email || '?').trim()[0].toUpperCase();
  return `<div><span class="eyebrow">Cuenta</span><h1 class="h-xl">Tu cuenta</h1></div>
    <div class="cols"><div class="col">
      <section class="card profile"><span class="ini" aria-hidden="true">${esc(initial)}</span><span class="what"><b>${esc(me.name || 'Tu cuenta de Orbit')}</b><small>${esc(me.email)}</small></span></section>
      <section class="card buy-card">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px"><span><span class="eyebrow">Tu compra</span><b style="display:block;font-size:22px;line-height:1.15;font-weight:700;letter-spacing:-.02em">Mimitos by Orbit</b></span><span class="badge ok">Activa</span></div>
        <p class="dim">${purchase?.date ? `Comprada el ${longDate(purchase.date)}. ` : ''}Pago único. Mimitos es tuya para siempre, para todas tus mascotas. No es una suscripción.</p>
        ${aiCard()}
      </section>
      <section class="sec"><div class="sec-h"><h2>Tus mascotas</h2><button class="link" data-act="newPet">${I('plus')} Agregar</button></div>
        ${doc.pets.length ? `<div class="list">${doc.pets.map(p => `<button class="row link-row" data-act="editPetId" data-id="${p.id}">${avatar(p)}<span class="what"><b>${esc(p.name)}</b><small>${esc(petMeta(p))}</small></span>${I('edit')}</button>`).join('')}</div>` : `<div class="empty dash"><p>Todavía no cargaste ninguna.</p></div>`}
      </section>
    </div><div class="col">
      <section class="sec"><h2>Ajustes</h2>
        <div class="list">
          <button class="row link-row" data-act="go" data-to="avisos">${bubble('bell', 'plata')}<span class="what"><b>Centro de avisos</b><small>${nOn ? 'Activados' + (notify.devices ? ` en ${notify.devices} ${notify.devices === 1 ? 'dispositivo' : 'dispositivos'}` : '') + (notify.mail ? (notify.devices ? ' y por mail' : ' por mail') : '') : 'Apagados: activalos para no perderte fechas'}</small></span>${I('chevron')}</button>
          <button class="row link-row" data-act="export">${bubble('download', 'viaje')}<span class="what"><b>Exportar copia de tus datos</b><small>Un archivo con todo lo que cargaste (JSON)</small></span>${I('chevron')}</button>
          <a class="row link-row" href="/privacidad" target="_blank" rel="noopener">${bubble('shield', 'salud')}<span class="what"><b>Privacidad</b><small>Tus datos viven en tu cuenta. El QR solo muestra lo necesario para que te la devuelvan.</small></span>${I('chevron')}</a>
          <a class="row link-row" href="/terminos" target="_blank" rel="noopener">${bubble('doc', 'med')}<span class="what"><b>Términos y condiciones</b><small>Licencia y soporte</small></span>${I('chevron')}</a>
        </div>
      </section>
      ${gmailAccount()}
      <button class="btn ghost wide" data-act="logout">${I('logout')} Cerrar sesión</button>
    </div></div>`;
}
/* Cuenta → Tu compra: hasta cuándo están incluidas las funciones inteligentes */
function aiCard() {
  if (!aiq) return '';
  const what = 'Preguntale a Mimitos, lectura automática de la libreta y los estudios e importación desde el mail.';
  if (aiq.admin) return `<div class="ai-card"><span class="what"><b>Funciones inteligentes</b><small>Cuenta administradora: sin vencimiento.</small></span><span class="badge ok">Activas</span></div>`;
  if (aiq.expired) return `<div class="ai-card off"><span class="what"><b>Funciones inteligentes</b><small>${esc(AI_EXPIRED_MSG())}</small></span><span class="badge soon">Vencidas</span></div>
    ${renewBtn('btn sm ghost')}`;
  return `<div class="ai-card"><span class="what"><b>Incluye 12 meses de funciones inteligentes</b><small>Incluidas hasta el ${longDate(aiq.expiresAt)}. ${what} Uso personal razonable.</small></span><span class="badge ok">Activas</span></div>${aiLeftNote()}`;
}
const renewBtn = (cls = 'btn big wide') => renewAsked
  ? `<p class="ai-renew-ok" role="status">${I('check')} Listo: te avisamos cuando puedas renovar.</p>`
  : `<button class="${cls}" data-act="renewAsk">Avisame cuando pueda renovar</button>`;
/* pantalla de una función inteligente vencida: la app y los datos siguen; solo se pausa esto */
function renderAiExpired() {
  const back = route.name === 'preguntar' ? (ask.from || 'inicio') : route.name === 'lectura' ? 'inicio' : 'libreta';
  return `<section class="state ai-off">
    ${bubble('sparkle', 'salud')}
    <span class="eyebrow">Funciones inteligentes</span>
    <h1 class="h-xl">Tus funciones inteligentes vencieron el ${longDate(aiq?.expiresAt)}.</h1>
    <p class="lead">Mimitos sigue siendo tuya con todo lo que cargaste.</p>
    <p class="dim">La libreta, los avisos, el QR, el modo cuidador, la agenda y los gastos siguen andando. Se pausaron Preguntale a Mimitos, la lectura automática de la libreta y los estudios y la importación desde el mail. Mientras tanto, podés cargar todo a mano.</p>
    <div class="cta">${renewBtn()}<button class="btn ghost wide" data-act="go" data-to="${back}">Volver a Mimitos</button></div>
    <p class="note">Avisarte no te compromete a nada y no te cobramos nada.</p>
  </section>`;
}
async function renewAsk() {
  try {
    const r = await fetch('/api/mascotas?renew=1', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    if (!r.ok) throw new Error();
    renewAsked = true; render(); toast('Listo. Te avisamos cuando puedas renovar.');
  } catch { toast('No se pudo guardar. Probá de nuevo.'); }
}
function exportCopy() {
  const data = { app: 'mimitos-by-orbit', version: 2, exportedAt: new Date().toISOString(), pets: doc.pets };
  download(`mimitos-copia-${iso(Z.today())}.json`, JSON.stringify(data, null, 1), 'application/json');
  toast('Copia descargada. Guardala en un lugar seguro.');
}
async function logout() {
  if (dirty) await flushNow();
  try { await fetch('/api/auth/logout', { method: 'POST' }); } catch {}
  location.href = '/acceso?salir=1';
}

/* ---------- CENTRO DE AVISOS: push en el celu, mail y calendario (api/_lib/petpush.js) ---------- */
const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const b64 = s => { const p = '='.repeat((4 - s.length % 4) % 4), raw = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(raw, c => c.charCodeAt(0)); };
let pushHere = null;
async function currentSub() {
  if (!pushSupported()) return null;
  try { const reg = await navigator.serviceWorker.getRegistration('/mascotas'); return reg ? await reg.pushManager.getSubscription() : null; } catch { return null; }
}
async function refreshHere() {
  const here = await currentSub();
  const on = Boolean(here && notify?.endpoints?.some(e => here.endpoint.endsWith(e)));
  if (on !== pushHere) { pushHere = on; if (route.name === 'avisos') render(); }
}
/* zona horaria del navegador: el servidor manda los avisos a las 9 de acá */
const localTz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch { return ''; } };
async function notifyPost(body) {
  const r = await fetch('/api/mascotas?notify=1', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, tz: localTz() }) });
  const d = await r.json(); if (!r.ok) throw new Error(d.error || r.status); notify = d; return d;
}
const aMsg = (t, err) => { const el = $('#aMsg'); if (el) { el.textContent = t; el.hidden = !t; el.classList.toggle('err', Boolean(err)); } else if (t) toast(t); };
const withTimeout = (pr, ms, what) => Promise.race([pr, new Promise((_, no) => setTimeout(() => no(new Error(what)), ms))]);
function enablePush() {
  if (!pushSupported()) return aMsg(isIOS ? 'En iPhone primero agregá Mimitos a la pantalla de inicio y abrila desde el ícono.' : 'Este navegador no acepta avisos. En Android usá Chrome.', true);
  if (Notification.permission === 'denied') return aMsg('Los avisos están bloqueados para esta página. Habilitalos en los ajustes del navegador (Notificaciones) y volvé a tocar.', true);
  const btn = $('#aOn'); if (btn) { btn.disabled = true; btn.textContent = 'Activando…'; }
  aMsg('');
  /* el permiso se pide en el mismo toque: Safari no lo deja pedir después de esperar otra cosa */
  const perm = Notification.permission === 'granted' ? Promise.resolve('granted') : Notification.requestPermission();
  (async () => {
    try {
      if (await perm !== 'granted') throw new Error('permiso');
      if (!notify?.publicKey) notify = await (await fetch('/api/mascotas?notify=1')).json();
      if (notify?.pushReady === false) throw new Error('nopush');
      if (!notify?.publicKey) throw new Error('llave');
      const reg = await withTimeout(navigator.serviceWorker.register('/mascotas-sw.js', { scope: '/mascotas' }), 15000, 'sw');
      await withTimeout(navigator.serviceWorker.ready, 15000, 'sw');
      const old = await reg.pushManager.getSubscription();
      const sub = old || await withTimeout(reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(notify.publicKey) }), 20000, 'sub');
      await notifyPost({ sub: sub.toJSON(), test: true });
      pushHere = true; render();
      aMsg('Listo. Te mandamos uno de prueba: tiene que llegar en unos segundos.');
    } catch (e) {
      const m = { permiso: 'No diste permiso para los avisos. Si te arrepentís, habilitalos en los ajustes del navegador.', llave: 'No pudimos conectar con el servidor. Revisá tu conexión y probá de nuevo.', sw: 'El navegador no terminó de preparar los avisos. Cerrá y volvé a abrir Mimitos y probá otra vez.', sub: 'El servicio de avisos del navegador no respondió. Probá de nuevo en un rato.', nopush: 'Los avisos al celu no están disponibles en este momento. Activá los avisos por mail mientras tanto.' }[e.message];
      aMsg(m || `No se pudo activar (${String(e.message || e).slice(0, 80)}). Probá de nuevo.`, true);
      if (btn) { btn.disabled = false; btn.innerHTML = `${I('bell')} Activar en este celu`; }
    }
  })();
}
async function disablePush() {
  const sub = await currentSub();
  if (sub) { try { await notifyPost({ remove: sub.endpoint }); } catch {} await sub.unsubscribe().catch(() => {}); }
  pushHere = false; render(); toast('Avisos apagados en este celu.');
}
const KINDS_UI = [['vac', 'syringe', 'Vacunas y controles', '3 días antes y el mismo día'], ['pip', 'drop', 'Pipeta o antiparasitario', '3 días antes y el mismo día'], ['food', 'bowl', 'Alimento', '5 días antes de que se termine'], ['check', 'heart', 'Chequeo del mes', 'El primer domingo de cada mes'], ['qr', 'qr', 'Escanearon su QR o te dejaron un aviso', 'Al instante, en el celu y por mail si lo activaste']];
function renderAvisos() {
  const n = notify || { devices: 0, mail: false, off: {} };
  after(refreshHere);
  const nexts = Z.nextAlerts(doc.pets, n.off || {}, 4);
  const anyOn = pushHere || n.mail;
  let celu;
  if (pushHere) celu = `<div class="banner ok-b">${bubble('check', 'salud')}<span style="flex:1"><b>Activados en este celu</b><small class="dim">${n.devices > 1 ? `Y en ${n.devices - 1} dispositivo${n.devices > 2 ? 's' : ''} más.` : 'Te llegan aunque no tengas Mimitos abierta.'}</small></span></div>
    <div class="btns"><button class="btn ghost sm" data-act="aTest">Mandarme uno de prueba</button><button class="btn ghost sm danger" data-act="aOff">Apagar en este celu</button></div>`;
  else if (isIOS && !standalone()) celu = `<div class="ios-steps"><b>En iPhone, primero instalala</b><ol><li>Tocá <b>Compartir</b> abajo en Safari (el cuadrado con la flecha).</li><li>Elegí <b>Agregar a inicio</b>.</li><li>Abrí Mimitos desde el ícono y volvé acá.</li></ol><small class="dim">Necesita iOS 16.4 o más nuevo.</small></div>`;
  else if (!pushSupported()) celu = `<p class="note">Este navegador no acepta avisos. En Android usá Chrome; en iPhone, Safari con Mimitos agregada a inicio. Mientras tanto, activá el mail.</p>`;
  else celu = `<button class="btn wide" id="aOn" data-act="aOn">${I('bell')} Activar en este celu</button><p class="note">Llegan como los de cualquier app, aunque no tengas Mimitos abierta.</p>`;
  return `<button class="link" data-act="go" data-to="cuenta" style="align-self:flex-start">${I('back')} Cuenta</button>
    <div><span class="eyebrow">Centro de avisos</span><h1 class="h-xl">Avisos</h1><p class="lead-s" style="margin-top:6px">Te avisamos antes de cada fecha para que no se te pase nada.</p></div>
    <div class="cols"><div class="col">
      <div class="summary">
        <div class="sum static"><span>En este celu</span><span class="badge ${pushHere ? 'ok' : 'none'}">${pushHere ? 'Activados' : pushHere === null ? 'Revisando…' : 'Apagados'}</span></div>
        <div class="sum static"><span>Por mail</span><span class="badge ${n.mail ? 'ok' : 'none'}">${n.mail ? 'Activado' : 'Apagado'}</span></div>
      </div>
      <section class="sec"><h2>Próximos avisos</h2>
        ${nexts.length ? `<div class="list">${nexts.map(a => `<div class="row"><span class="ag-date"><b>${fmt(a.date, { day: 'numeric' })}</b><small>${fmt(a.date, { month: 'short' }).replace('.', '')}</small></span><span class="what"><b>${esc(a.text)}</b><small>${anyOn ? (pushHere && n.mail ? 'En el celu y por mail' : pushHere ? 'En el celu' : 'Por mail') + ', a la mañana' : 'No te va a llegar: los avisos están apagados'}</small></span><span></span></div>`).join('')}</div>`
          : `<div class="empty dash"><p>Todavía no hay fechas para avisarte. Cargá una vacuna con su próxima dosis o armá el calendario sugerido.</p></div>`}
      </section>
      <section class="sec"><h2>En el celu</h2>${celu}<p class="amsg" id="aMsg" role="status" hidden></p></section>
      <section class="sec"><h2>Por mail</h2>
        <label class="toggle"><input type="checkbox" id="aMail" ${n.mail ? 'checked' : ''}><span><b>Mandarme también un mail</b><br><small class="dim">Un solo mail con todo lo del día, a la mañana, a ${esc(me.email || 'tu casilla')}. Si escanean el QR, al momento.</small></span></label></section>
    </div><div class="col">
      <section class="sec"><h2>Qué te avisamos</h2>
        <div class="list">${KINDS_UI.map(([k, ic, t, d]) => `<label class="row toggle-row">${bubble(ic, 'salud')}<span class="what"><b>${t}</b><small>${d}</small></span><input type="checkbox" class="sw-in" data-kind="${k}" ${n.off?.[k] ? '' : 'checked'} aria-label="${t}"></label>`).join('')}</div></section>
      <section class="sec"><h2>En tu calendario</h2>
        <div class="card"><p class="dim">Si preferís tu calendario, bajá todas las fechas en un archivo .ics. iPhone y Outlook avisan solos a las 9; en Google Calendar, activá el aviso en el evento.</p><button class="btn ghost sm" data-act="icsAll" style="align-self:flex-start">${I('download')} Bajar todas las fechas</button></div></section>
    </div></div>`;
}
app.addEventListener('change', async e => {
  if (e.target.id === 'aMail') { const v = e.target.checked; try { await notifyPost({ mail: v }); toast(v ? 'Listo: también por mail.' : 'Sin mails.'); render(); } catch { e.target.checked = !v; toast('No se guardó. Revisá tu conexión.'); } }
  if (e.target.matches('[data-kind]')) {
    const off = {}; app.querySelectorAll('[data-kind]').forEach(x => { off[x.dataset.kind] = !x.checked; });
    try { await notifyPost({ off }); toast('Guardado.'); render(); } catch { e.target.checked = !e.target.checked; toast('No se guardó. Revisá tu conexión.'); }
  }
});

/* ---------- ALTA GUIADA DE CERO: mascota y su próxima vacuna en menos de un minuto ---------- */
let ob = null;
const OB_STEPS = 5;
const newOb = () => ({ step: 0, pet: blankPet(), photo: null, vac: { name: '', date: '', next: '' }, sug: [], conds: {} });
function startOnboard() { ob = newOb(); go('alta'); }
/* cambiar de vista sin esperar al hashchange (que llega después) */
function setRoute(name) { route = { name, arg: '' }; history.replaceState(null, '', '#/' + name); }
function obHead(title, sub) {
  return `<div class="ob-top"><button class="link" data-ob="back">${I('back')} ${ob.step ? 'Atrás' : 'Cancelar'}</button><span class="eyebrow">Paso ${ob.step + 1} de ${OB_STEPS}</span></div>
    <div class="progress" style="--n:${OB_STEPS}" aria-hidden="true">${Array.from({ length: OB_STEPS }, (_, i) => `<i class="${i <= ob.step ? 'on' : ''}"></i>`).join('')}</div>
    <h1>${title}</h1>${sub ? `<p class="sub">${sub}</p>` : ''}`;
}
function tiles(name, opts, val) { return `<div class="tiles" role="group" data-tiles="${name}">${opts.map(([v, l, ic]) => `<button type="button" class="tile" data-v="${v}" aria-pressed="${v === val}">${ic ? I(ic) : ''}<span>${l}</span></button>`).join('')}</div>`; }
function renderOnboard() {
  if (!ob) ob = newOb();
  const p = ob.pet, n = esc(p.name || 'tu mascota');
  let h = '', primary = 'Siguiente', skip = '';
  if (ob.step === 0) {
    h = obHead('¿Cómo se llama?', 'Empezamos por lo básico. Lo demás lo completás cuando quieras.') + `
    <div class="f"><label for="ob_name" class="sr">Nombre</label><input id="ob_name" class="big-input" maxlength="60" value="${esc(p.name)}" placeholder="Nombre" autocomplete="off"></div>
    <div class="f"><span class="lb">Es un…</span>${tiles('species', [['perro', 'Perro', 'dog'], ['gato', 'Gato', 'cat'], ['otra', 'Otro', 'paw']], p.species)}</div>
    <div class="f" ${p.species === 'otra' ? '' : 'hidden'}><label for="ob_other">¿Qué es?</label><input id="ob_other" maxlength="40" value="${esc(p.speciesOther)}" placeholder="Conejo, hurón, loro…"></div>
    <div class="photo-pick"><div class="av big${ob.photoFull ? ' cut' : ''}" id="ob_prev" style="background:${hueOf(p)[0]}">${ob.photo ? `<img src="${ob.photo}" alt="">` : Z.petIcon(p)}</div><div class="f"><label class="btn ghost sm" for="ob_photo">${I('camera')} ${ob.photo ? 'Cambiar foto' : 'Agregar una foto'}</label><input id="ob_photo" type="file" accept="image/*" class="sr"><small>Opcional. La recortamos sola y la ponemos sobre su color.</small></div></div>
    <div class="f"><span class="lb">Su color <span class="opt">(opcional)</span></span>${swatches('hue', p.hue)}<small>Lo podés cambiar cuando quieras.</small></div>`;
    primary = 'Empezar';
    if (!p.name) after(() => $('#ob_name')?.focus());
  }
  if (ob.step === 1) {
    h = obHead(`Contanos de ${n}`, 'Con la fecha de nacimiento armamos el calendario que le corresponde. Aproximada sirve.') + `
    <div class="two"><div class="f"><label for="ob_birth">Nacimiento</label><input id="ob_birth" type="date" max="${iso(Z.today())}" value="${esc(p.birth)}"></div><div class="f"><label for="ob_weight">Peso (kg) <span class="opt">(opcional)</span></label><input id="ob_weight" inputmode="decimal" value="${p.weight ? String(p.weight).replace('.', ',') : ''}" placeholder="12,5"></div></div>
    <div class="f"><span class="lb">Sexo</span>${tiles('sex', [['h', 'Hembra'], ['m', 'Macho']], p.sex)}</div>
    <div class="f"><label for="ob_breed">Raza <span class="opt">(opcional)</span></label><input id="ob_breed" list="ob_breeds" maxlength="60" value="${esc(p.breed)}" placeholder="Escribí para buscar" autocomplete="off"><datalist id="ob_breeds">${(Z.BREEDS[p.species] || []).map(b => `<option value="${esc(b)}">`).join('')}</datalist></div>
    <div class="f"><span class="lb">¿Está castrado o castrada?</span>${tiles('neutered', [['si', 'Sí'], ['no', 'No'], ['ns', 'No sé']], p.neutered || '')}</div>`;
  }
  if (ob.step === 2) {
    const opts = (SUGGEST[p.species] || SUGGEST.otra).vacuna;
    h = obHead(`¿Cuál fue su última vacuna?`, `Copiala de la libreta del veterinario. Con esto ya sabemos cuándo le toca la próxima.`) + `
    ${opts.length ? `<div class="f"><span class="lb">Vacuna</span><div class="chips" role="group" data-vac>${opts.map(o => `<button type="button" class="chip" data-v="${esc(o)}" aria-pressed="${ob.vac.name === o}">${esc(o)}</button>`).join('')}</div></div>` : ''}
    <div class="f"><label for="ob_vname">${opts.length ? 'O escribila' : 'Vacuna'}</label><input id="ob_vname" maxlength="80" value="${esc(opts.includes(ob.vac.name) ? '' : ob.vac.name)}" placeholder="Como figura en la libreta"></div>
    <div class="two"><div class="f"><label for="ob_vdate">Se aplicó el</label><input id="ob_vdate" type="date" max="${iso(Z.today())}" value="${esc(ob.vac.date)}"></div><div class="f"><label for="ob_vnext">Próxima dosis</label><input id="ob_vnext" type="date" value="${esc(ob.vac.next)}"></div></div>
    <div class="chips"><button type="button" class="chip" data-ob="plus" data-m="1">+1 mes</button><button type="button" class="chip" data-ob="plus" data-m="12">+1 año</button></div>
    <div class="or">o</div>
    <label class="scanbox" for="ob_scan">${bubble('camera', 'viaje')}<span><b>Sacarle foto a la libreta</b><small>Leemos vacunas, antiparasitarios y controles con sus fechas. Vos revisás antes de guardar.</small></span></label><input id="ob_scan" type="file" accept="image/*" multiple class="sr">`;
    skip = 'Todavía no tiene vacunas o no sé';
  }
  if (ob.step === 3) {
    h = obHead('Su calendario sugerido', `Fechas de referencia general para ${Z.stage(p) === 'cachorro' ? 'un cachorro' : 'un adulto'}. Destildá lo que no quieras y cambiá las fechas. <b>Es una referencia: confirmalo con tu veterinario.</b>`) + (ob.sug.length ? sugRows(ob.sug) : `<div class="empty dash"><p>${n} ya tiene próxima fecha para todo lo del calendario de referencia.</p></div>`);
    skip = ob.sug.length ? 'Ahora no' : '';
  }
  if (ob.step === 4) {
    const list = Z.CONDITIONS[p.species] || Z.CONDITIONS.otra;
    h = obHead(`¿Algo de su salud que convenga anotar?`, 'Opcional. Marcá lo que te haya dicho un veterinario. Va a sus antecedentes.') + `
      <div class="chips" role="group" aria-label="Problemas de salud" data-conds>${list.map(c => `<button type="button" class="chip" data-c="${esc(c)}" aria-pressed="${Boolean(ob.conds[c])}">${esc(c)}</button>`).join('')}</div>
      <div class="f"><label for="ob_all">Alergias <span class="opt">(opcional)</span></label><input id="ob_all" maxlength="300" value="${esc(p.allergies)}" placeholder="A un alimento, a un remedio…"></div>`;
    primary = `Listo, ver a ${n}`; skip = 'Saltar';
  }
  return `<section class="sec onboard" aria-live="polite">${h}<p class="err-msg" id="obErr" role="alert" hidden></p>
    <div class="ob-actions"><button class="btn big wide" data-ob="next">${primary}</button>${skip ? `<button class="btn ghost wide" data-ob="skipstep">${skip}</button>` : ''}</div></section>`;
}
function obRead() {
  const p = ob.pet, v = id => $(id)?.value.trim() ?? '';
  if (ob.step === 0) { p.name = v('#ob_name'); p.speciesOther = v('#ob_other'); }
  if (ob.step === 1) { p.birth = v('#ob_birth'); const w = numDec(v('#ob_weight')); p.weight = Number.isNaN(w) ? p.weight : w; p.breed = v('#ob_breed'); }
  if (ob.step === 2) { const typed = v('#ob_vname'); if (typed) ob.vac.name = typed; ob.vac.date = v('#ob_vdate'); ob.vac.next = v('#ob_vnext'); }
  if (ob.step === 3 && ob.sug.length) ob.sug = readSug(app, ob.sug);
  if (ob.step === 4) p.allergies = v('#ob_all');
}
function obErr(t) { const e = $('#obErr'); e.textContent = t; e.hidden = false; }
async function obFinish(scanFiles) {
  const p = ob.pet;
  p.conditions = Object.keys(ob.conds).map(name => ({ id: uid(), name, status: 'activa', since: '', notes: '' }));
  if (p.neutered === 'ns') p.neutered = '';
  if (p.weight) p.weights = [{ date: iso(Z.today()), kg: p.weight }];
  if (ob.vac.name && (ob.vac.date || ob.vac.next)) p.records.push(normRec({ id: uid(), type: 'vacuna', name: ob.vac.name, date: ob.vac.date, next: ob.vac.next, vet: '', notes: '', lot: '' }));
  p.onboarded = true;
  if (ob.photo) { try { p.photo = await uploadPhoto(ob.photo); p.photoFull = ob.photoFull ? await uploadPhoto(ob.photoFull) : ''; } catch (e) { toast((e?.msg ? e.msg + ' ' : 'La foto no se pudo subir. ') + 'Podés agregarla después.'); } }
  applySug(p, ob.sug || []);
  doc.pets.push(p); selectPet(p.id); ob = null;
  if (scanFiles?.length) { changed(); return runScan(p, scanFiles); }
  setRoute('inicio'); changed(); window.scrollTo(0, 0);
  const nx = Z.upcoming(p)[0];
  toast(nx ? `Listo. Próxima: ${nx.r.name}, ${nx.s.t.toLowerCase()}.` : `Listo. Esta es la libreta de ${p.name}.`);
}
app.addEventListener('click', e => {
  if (route.name !== 'alta' || !ob) return;
  const t = e.target.closest('[data-tiles] .tile');
  if (t) { const k = t.parentNode.dataset.tiles; obRead(); ob.pet[k] = t.dataset.v; render(); return; }
  const vc = e.target.closest('[data-vac] .chip');
  if (vc) { obRead(); ob.vac.name = ob.vac.name === vc.dataset.v ? '' : vc.dataset.v; const i = $('#ob_vname'); if (i) i.value = ''; render(); if (!ob.vac.date) $('#ob_vdate')?.focus(); return; }
  const c = e.target.closest('[data-conds] .chip');
  if (c) { obRead(); const n = c.dataset.c; if (ob.conds[n]) delete ob.conds[n]; else ob.conds[n] = 'activa'; render(); return; }
  const b = e.target.closest('[data-ob]'); if (!b) return;
  const a = b.dataset.ob;
  if (a === 'plus') { obRead(); const base = ob.vac.date || iso(Z.today()); ob.vac.next = Z.addMonths(base, +b.dataset.m); render(); return; }
  if (a === 'back') { if (!ob.step) { ob = null; go('inicio'); return; } obRead(); ob.step--; render(); return; }
  if (a === 'skipstep') { if (ob.step === 2) ob.vac = { name: '', date: '', next: '' }; if (ob.step === 3) ob.sug = []; if (ob.step === 4) { ob.conds = {}; ob.pet.allergies = ''; return obFinish(); } }
  else {
    obRead();
    if (ob.step === 0 && !ob.pet.name) return obErr('Poné su nombre para seguir.');
    if (ob.step === 1 && ob.pet.birth && ob.pet.birth > iso(Z.today())) return obErr('La fecha de nacimiento no puede ser futura.');
    if (ob.step === 2 && (ob.vac.date || ob.vac.next) && !ob.vac.name) return obErr('Elegí o escribí qué vacuna fue.');
    if (ob.step === 2 && ob.vac.name && !ob.vac.date && !ob.vac.next) return obErr('Poné cuándo se aplicó o cuándo le toca la próxima.');
    if (ob.step === 2 && ob.vac.date && ob.vac.next && ob.vac.next < ob.vac.date) return obErr('La próxima dosis no puede ser anterior a la aplicación.');
    if (ob.step === 4) return obFinish();
  }
  ob.step++;
  if (ob.step === 3) { const tmp = { ...ob.pet, records: ob.vac.name && ob.vac.next ? [{ type: 'vacuna', name: ob.vac.name, date: ob.vac.date, next: ob.vac.next }] : [] }; ob.sug = Z.suggested(tmp).map(x => ({ ...x, keep: true })); }
  render(); window.scrollTo(0, 0);
});
app.addEventListener('change', async e => {
  if (route.name !== 'alta' || !ob) return;
  if (e.target.id === 'ob_photo') { const f = e.target.files[0]; if (!f) return; e.target.value = ''; obRead(); const r = await cutFlow(f, ob.pet); if (r) { ob.photo = r.photo; ob.photoFull = r.photoFull; render(); } }
  if (e.target.id === 'ob_scan') { const files = [...e.target.files].slice(0, 4); if (!files.length) return; obRead(); obFinish(files); }
});

/* ---------- calendario sugerido ---------- */
const everyTxt = n => n === 1 ? 'cada mes' : n === 12 ? 'cada año' : `cada ${n} meses`;
const sugRows = list => `<div class="list sug-list">${list.map((x, i) => `<div class="row sug-row">
  <label class="sg-ck"><input type="checkbox" id="sg_k${i}" data-sgk="${i}" ${x.keep !== false ? 'checked' : ''}></label>
  <label for="sg_k${i}" class="what"><b>${esc(x.name)}</b><small>${TYPE[x.type]} · ${everyTxt(x.every)}${x.note ? ' · ' + esc(x.note) : ''}</small></label>
  <span class="sug-d"><label for="sg_d${i}">Próxima</label><input type="date" id="sg_d${i}" data-sgd="${i}" value="${esc(x.next)}"></span></div>`).join('')}</div>`;
const readSug = (root, list) => list.map((x, i) => ({ ...x, keep: Boolean(root.querySelector(`[data-sgk="${i}"]`)?.checked), next: root.querySelector(`[data-sgd="${i}"]`)?.value || x.next }));
function applySug(p, list) {
  let n = 0;
  for (const x of list) if (x.keep && x.next) { p.records.push(normRec({ id: uid(), type: x.type, name: x.name, date: '', next: x.next, vet: '', notes: Z.SUG_NOTE, lot: '' })); n++; }
  return n;
}
function suggestPanel(p) {
  const list = Z.suggested(p).map(x => ({ ...x, keep: true }));
  panel('Calendario sugerido', `<p class="lead-s">Fechas de referencia general para ${Z.stage(p) === 'cachorro' ? 'un cachorro' : 'un adulto'} (${esc(Z.species(p).toLowerCase())}). Si ya cargaste la última aplicación, la próxima se calcula desde ahí. <b>Es una referencia general: confirmalo con tu veterinario.</b></p>
    ${list.length ? `${sugRows(list)}<button class="btn wide" id="sgSave" type="button">Sumar a lo que le toca</button>` : `<div class="empty dash"><p>${esc(p.name)} ya tiene próxima fecha para todo lo del calendario sugerido.</p></div>`}`);
  const b = $('#sgSave');
  if (b) b.onclick = () => { const n = applySug(p, readSug($('#pBody'), list)); dPanel.close(); changed(); toast(n ? `Listo: ${n} ${n === 1 ? 'fecha sumada' : 'fechas sumadas'}.` : 'No marcaste ninguna fecha.'); };
}

/* ---------- "cargar algo" ---------- */
function addPanel(p) {
  const opt = (act, ic, c, t, d) => `<button class="row link-row" data-add="${act}">${bubble(ic, c)}<span class="what"><b>${t}</b><small>${d}</small></span>${I('chevron')}</button>`;
  panel(`Cargar en la libreta de ${p.name}`, `<div class="list">
    ${opt('vacuna', 'syringe', 'salud', 'Vacuna', 'Con lote, veterinaria y foto del sticker')}
    ${opt('anti', 'drop', 'salud', 'Antiparasitario', 'Interno o externo: pipeta, collar, comprimido')}
    ${opt('consulta', 'steth', 'cuida', 'Consulta o control', 'Por qué fueron y qué te dijeron')}
    ${opt('peso', 'scale', 'comida', 'Peso', 'Para ver cómo cambia')}
    ${opt('remedio', 'pill', 'med', 'Remedio', 'Con horarios y aviso en cada toma')}
    ${opt('estudio', 'flask', 'viaje', 'Estudio', 'Análisis, radiografía o ecografía')}
    ${opt('estudios', 'file', 'viaje', 'Subir varios estudios', 'Fotos o PDF de una: los leemos y los ordenamos')}
    ${opt('sintoma', 'note', 'plata', 'Algo que notaste', 'No come, vomita, se rasca…')}
    ${opt('problema', 'heart', 'perdida', 'Problema de salud', 'Algo que tuvo o tiene')}
  </div>
  <button class="scanbox" data-add="scan">${bubble('camera', 'viaje')}<span><b>Foto de la libreta</b><small>${aiExpired() ? 'Función inteligente vencida: podés cargar las vacunas a mano.' : 'Leemos vacunas, antiparasitarios y controles con sus fechas. Vos revisás antes de guardar.'}</small></span></button>
  ${aiLeftNote()}`);
  $('#pBody').onclick = e => {
    const b = e.target.closest('[data-add]'); if (!b) return;
    dPanel.close();
    ({ estudios: () => startBulk(p), scan: () => startScan(p), vacuna: () => recForm(p), anti: () => recForm(p, null, { type: 'desparasitacion', name: p.species === 'otra' ? 'Antiparasitario' : 'Pipeta antipulgas', scope: 'externa' }), consulta: () => visitForm(p), estudio: () => studyForm(p), sintoma: () => symptomForm(p), remedio: () => medForm(p), peso: () => weightForm(p), problema: () => conditionForm(p) })[b.dataset.add]();
  };
}

/* ---------- historial clínico: consultas, estudios, cirugías, problemas y síntomas, en orden ---------- */
const HK = { consulta: ['steth', 'cuida', 'Consulta'], estudio: ['flask', 'viaje', 'Estudio'], cirugia: ['scalpel', 'perdida', 'Cirugía'], sintoma: ['note', 'plata', 'Algo que notaste'], problema: ['heart', 'med', 'Problema de salud'] };
const HIST_NOTE = 'Mimitos guarda y ordena tus estudios; no los interpreta. Consultá siempre a tu veterinario.';
function histEvents(p) {
  const ev = Z.timeline(p).filter(e => HK[e.k]);
  const st = { activa: 'Lo tiene', controlada: 'Controlado', resuelta: 'Resuelto' };
  for (const c of p.conditions || []) ev.push({ k: 'problema', date: /^\d{4}-\d{2}-\d{2}$/.test(c.since || '') ? c.since : /^\d{4}-\d{2}$/.test(c.since || '') ? c.since + '-01' : '', title: c.name, sub: [st[c.status], c.notes].filter(Boolean).join(' · '), kind: 'cond', ref: c });
  for (const c of p.surgeries || []) if (!/^\d{4}-\d{2}-\d{2}$/.test(c.date || '')) ev.push({ k: 'cirugia', date: '', title: c.name, sub: 'Cirugía', kind: 'surg', ref: c });
  return ev.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
}
function histEntry(e) {
  const [ic, c, lab] = HK[e.k], st = e.kind === 'study' ? e.ref : null;
  const files = st?.files?.length ? `<span class="h-files">${st.files.map(f => `<a href="/api/mascotas?file=${encodeURIComponent(f.ref)}" target="_blank" rel="noopener">${I('file')} ${esc(f.name)}</a>`).join('')}</span>` : '';
  const sub = st ? [st.lab, st.notes].filter(Boolean).join(' · ') : e.sub;
  const det = e.kind && e.kind !== 'cond' ? `<button class="e-edit" data-act="detail" data-kind="${e.kind}" data-id="${e.ref.id}" aria-label="Ver ${esc(e.title)}">${I('more')}</button>` : '<span></span>';
  return `<li class="entry noseal hist"><div class="e-main"><span class="h-k">${bubble(ic, c)}<span><span class="e-name">${esc(e.title)}</span><span class="e-dates"><span>${e.date ? dd(e.date) : 'Sin fecha'}</span><span><em>${lab}</em></span></span></span></span>${sub ? `<span class="e-sub">${esc(sub)}</span>` : ''}${files}</div>${det}</li>`;
}

/* ---------- subir varios estudios de una: se suben, se leen con IA y se revisan antes de guardar ---------- */
let bulk = null;
const BULK_MAX = 20;
const dataToFile = (d, name) => { const [h, b] = d.split(','); const bin = atob(b); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new File([u], name, { type: /data:(.*?);/.exec(h)[1] }); };
function startBulk(p) {
  if (!p) return;
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*,application/pdf'; inp.multiple = true;
  inp.onchange = () => { const files = [...inp.files]; if (files.length) runBulk(p, files); };
  inp.click();
}
async function runBulk(p, files) {
  const extra = files.length > BULK_MAX;
  bulk = { petId: p.id, state: 'working', note: extra ? `Elegiste ${files.length} archivos: subimos los primeros ${BULK_MAX}.` : '', items: files.slice(0, BULK_MAX).map((f, i) => ({ i, file: f, name: f.name, status: 'pendiente', keep: true, data: { date: '', kind: 'otro', title: f.name.replace(/\.[^.]+$/, ''), lab: '', summary: '', confidence: '', warnings: [] } })) };
  setRoute('estudios'); render(); window.scrollTo(0, 0);
  for (const it of bulk.items) {
    if (!bulk) return;
    if (bulk.full) { it.status = 'error'; it.keep = false; it.msg = typeof bulk.full === 'string' ? bulk.full : 'No se subió: no hay más espacio en tu cuenta.'; continue; }
    try {
      it.status = 'subiendo'; render();
      let f = it.file;
      if (/^image\/(jpeg|png|webp)$/.test(f.type)) { try { f = dataToFile(await shrink(f, 1800, .85), f.name.replace(/\.[^.]+$/, '') + '.jpg'); } catch {} }
      if (f.size > 15 * 1024 * 1024) { it.status = 'error'; it.keep = false; it.msg = 'Pesa más de 15 MB: no se pudo subir.'; continue; }
      it.ref = await uploadStudy(f);
      if (!/^(image\/(jpeg|png|webp)|application\/pdf)$/.test(f.type)) { it.status = 'manual'; it.msg = 'Este formato no se puede leer: quedó adjunto, completalo a mano.'; continue; }
      if (bulk.noIA) { it.status = 'manual'; it.msg = bulk.noIA + ' Quedó adjunto: completalo a mano.'; continue; }
      it.status = 'leyendo'; render();
      const r = await fetch('/api/mascotas?studyscan=1', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ref: it.ref.ref }) });
      const d = await r.json().catch(() => ({}));
      if (r.status === 429 || d.error === 'ai_expired' || aiSoft(d.error)) { bulk.noIA = limitMsg(d); it.status = 'manual'; it.msg = bulk.noIA + ' Quedó adjunto: completalo a mano.'; continue; }
      if (!r.ok && d.error === 'archivo_rechazado') { it.status = 'error'; it.keep = false; it.msg = 'No se subió: ' + readErr(d.error).charAt(0).toLowerCase() + readErr(d.error).slice(1); continue; }
      if (!r.ok) { it.status = 'manual'; it.msg = (readErr(d.error, d) || 'No lo pudimos leer.') + ' Quedó adjunto: completalo a mano.'; continue; }
      setQuota(d.quota);
      if (d.truncated) it.msg = d.note || 'Leímos las primeras 20 páginas; el archivo completo quedó guardado.';
      it.data = { ...it.data, ...d, title: d.title || it.data.title }; it.status = d.confidence === 'baja' || d.warnings?.length || !d.date ? 'revisar' : 'listo';
    } catch (e) {
      if (String(e.message) === 'cupo_lleno') { bulk.full = true; it.msg = 'No se subió: no hay más espacio en tu cuenta (200 MB).'; }
      else if (String(e.message) === 'limite_diario') { it.msg = 'No se subió: ' + e.msg.charAt(0).toLowerCase() + e.msg.slice(1); bulk.full = it.msg; }
      else it.msg = e.msg ? 'No se subió. ' + e.msg : 'No se pudo subir. Revisá la conexión.';
      it.status = 'error'; it.keep = false;
    }
  }
  if (bulk) { bulk.state = 'review'; render(); }
}
const BULK_ST = { cola: ['En cola', 'none'], pendiente: ['En espera', 'none'], subiendo: ['Subiendo…', 'none'], leyendo: ['Leyendo…', 'none'], listo: ['Leído', 'ok'], revisar: ['Revisalo', 'soon'], manual: ['Completalo a mano', 'soon'], error: ['No se subió', 'late'] };
function renderBulk() {
  const p = petById(bulk?.petId); if (!p || !bulk) { setTimeout(() => go('libreta')); return ''; }
  const working = bulk.state === 'working', done = bulk.items.filter(x => !['pendiente', 'subiendo', 'leyendo'].includes(x.status)).length;
  const keep = bulk.items.filter(x => x.keep && x.ref).length;
  const card = it => {
    const [st, cls] = BULK_ST[it.status], d = it.data, id = 'bk' + it.i, edit = !working && it.ref;
    return `<article class="bk-card ${it.status}">
      <div class="bk-h">${bubble(/pdf$/i.test(it.name) ? 'doc' : 'file', 'viaje')}<span class="what"><b>${esc(it.name)}</b></span><span class="badge ${cls}">${st}</span></div>
      ${it.msg ? `<p class="bk-msg">${esc(it.msg)}</p>` : ''}
      ${it.acts?.length || it.retry ? `<div class="gm-acts">${it.retry ? `<button type="button" class="btn sm" data-act="bulkRetry" data-i="${it.i}">Reintentar</button>` : ''}${(it.acts || []).map(a => `<a class="btn sm ghost" href="${esc(a.href)}" target="_blank" rel="noopener noreferrer">${esc(a.label)}</a>`).join('')}</div>` : ''}
      ${d.warnings?.length ? `<ul class="warn-list">${d.warnings.map(w => `<li>${I('alert')}<span>${esc(w)}</span></li>`).join('')}</ul>` : ''}
      ${edit ? `<div class="two"><div class="f"><label for="${id}_date">Fecha</label><input id="${id}_date" type="date" value="${esc(d.date)}" max="${iso(Z.today())}"></div>
        <div class="f"><label for="${id}_kind">Tipo</label><select id="${id}_kind">${Object.entries(Z.STUDY).map(([k, l]) => `<option value="${k}"${k === d.kind ? ' selected' : ''}>${l}</option>`).join('')}</select></div></div>
        <div class="two"><div class="f"><label for="${id}_title">Nombre</label><input id="${id}_title" maxlength="120" value="${esc(d.title)}"></div>
        <div class="f"><label for="${id}_lab">Laboratorio o veterinaria <span class="opt">(opcional)</span></label><input id="${id}_lab" maxlength="80" value="${esc(d.lab)}"></div></div>
        <div class="f"><label for="${id}_sum">Qué dice <span class="opt">(resumen, sin interpretar)</span></label><textarea id="${id}_sum" maxlength="600" rows="3">${esc(d.summary)}</textarea></div>
        ${bulk.source === 'mail' && doc.pets.length > 1 ? petPick(it, id) : ''}
        <label class="toggle"><input type="checkbox" id="${id}_keep" ${it.keep ? 'checked' : ''}><span><b>Guardar este estudio</b></span></label>` : ''}
    </article>`;
  };
  return `<section class="sec bulk">
    <button class="link" data-act="bulkBack" style="align-self:flex-start">${I('back')} ${bulk.source === 'mail' ? PROV[bulk.prov].label : `Libreta de ${esc(p.name)}`}</button>
    <div><span class="eyebrow">Historial clínico</span><h1 class="h-xl">${working ? `Subiendo y leyendo ${done} de ${bulk.items.length}` : `Revisá ${bulk.items.length === 1 ? 'el estudio' : `los ${bulk.items.length} estudios`}`}</h1>
      <p class="lead-s" style="margin-top:6px">${working ? 'Cada archivo se sube y lo leemos para sacar la fecha, el tipo y un resumen. Podés esperar acá.' : 'Corregí lo que haga falta antes de guardar. Lo que no se pudo leer quedó adjunto para que lo completes.'}</p>
      ${bulk.note ? `<p class="note">${esc(bulk.note)}</p>` : ''}</div>
    ${working ? `<div class="progress-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${bulk.items.length}" aria-valuenow="${done}"><i style="width:${Math.round(done / bulk.items.length * 100)}%"></i></div>` : ''}
    <div class="bk-list">${bulk.items.map(card).join('')}</div>
    ${bulk.queued ? `<p class="bk-msg" role="status">${esc(bulk.queued)}</p>` : ''}
    ${aiLeftNote()}
    <p class="note">${HIST_NOTE} Cada archivo leído cuenta como una importación inteligente: uso personal razonable, incluido por 12 meses.</p>
    ${working ? '' : `<p class="err-msg" id="bkErr" role="alert" hidden></p><button class="btn big wide" data-act="bulkSave"${keep ? '' : ' disabled'}>Guardar ${keep} ${keep === 1 ? 'estudio' : 'estudios'} en su historial</button>`}
  </section>`;
}
function saveBulk() {
  const p = petById(bulk?.petId); if (!p) return;
  const out = [], v = id => ($('#' + id)?.value || '').trim();
  const err = (t, el) => { const e = $('#bkErr'); e.hidden = false; e.textContent = t; el?.focus(); };
  for (const it of bulk.items) {
    const id = 'bk' + it.i; if (!it.ref || !$('#' + id + '_keep')?.checked) continue;
    const date = v(id + '_date');
    if (!date) return err(`Falta la fecha de "${it.name}". Si no figura, poné una aproximada.`, $('#' + id + '_date'));
    /* desde Gmail cada estudio puede ir a una mascota distinta */
    const to = $('#' + id + '_pet') ? petById(v(id + '_pet')) : p;
    if (!to) return err(`Elegí de qué mascota es "${it.name}".`, $('#' + id + '_pet'));
    const kind = v(id + '_kind') || 'otro';
    out.push({ to, st: { id: uid(), date, kind, title: v(id + '_title') || Z.STUDY[kind], lab: v(id + '_lab'), notes: v(id + '_sum'), files: [it.ref] } });
  }
  if (!out.length) return;
  for (const x of out) x.to.studies.push(x.st);
  const pets = [...new Set(out.map(x => x.to))];
  if (pets.length === 1) selectPet(pets[0].id);
  bulk = null; ui.lib.jumpSec = 'hist'; setRoute('libreta'); changed(); window.scrollTo(0, 0);
  toast(`${out.length} ${out.length === 1 ? 'estudio guardado' : 'estudios guardados'} en ${pets.length === 1 ? `el historial de ${pets[0].name}` : 'sus historiales'}.`);
}

/* ---------- Conectar tu mail (Gmail u Outlook): busca estudios y los trae por el mismo motor (api/_lib/petmail.js) ----------
   Nada se descarga ni se lee con IA hasta que la persona elige. Está para todos los compradores (salvo lista en
   MIMITOS_MAIL_ALLOW); Gmail tiene el cupo de Google para apps sin verificar: con el cupo lleno, status.full. */
const LIMITED_USE = 'https://developers.google.com/terms/api-services-user-data-policy';
const PROV = {
  /* see: lo que la persona va a ver en la pantalla del proveedor, paso a paso, antes de ir */
  gmail: { label: 'Gmail', company: 'Google', see: ['Google te va a mostrar “Google no verificó esta app”. Es normal mientras Google revisa Mimitos.', 'Tocá “Configuración avanzada” y después “Ir a Mimitos”.', 'Aceptá el permiso de leer tus mails y volvés a Mimitos.'], remove: 'myaccount.google.com/permissions' },
  outlook: { label: 'Outlook', company: 'Microsoft', who: 'Outlook, Hotmail, Live o Microsoft 365', see: ['Microsoft te va a mostrar “editor no verificado”: tocá Aceptar.', 'Con una cuenta de trabajo o de la facultad, tu organización puede no permitirla: en ese caso, usá tu cuenta personal.'], remove: 'account.live.com/consent/Manage' },
};
const MAILS = ['gmail', 'outlook'];
const mErr = (p, code) => ({
  vencido: `La conexión con ${PROV[p].label} venció o se quitó el permiso. Volvé a conectar y seguís.`,
  limite: `${PROV[p].label} nos pidió esperar un poco. Probá de nuevo en un rato.`,
  no_conectado: `${PROV[p].label} no está conectado.`,
  no_configurado: `La conexión con ${PROV[p].label} todavía no está configurada.`,
}[String(code || '').replace(/^(gmail|outlook)_/, '')] || ({
  cupo_lleno: 'Llegaste al espacio de tu cuenta (200 MB).',
  too_big: 'El archivo pesa más de 15 MB: no se pudo traer.',
  ya_importado: 'Ya lo habías traído.',
  blob_no_configurado: 'El guardado de archivos no está disponible en este momento.',
  adjunto_no_encontrado: 'Ese adjunto ya no está en el mail.',
})[code]);
const mBack = (p, arg) => ({
  cancelado: `No se conectó: cancelaste en la pantalla de ${PROV[p].company}. Cuando quieras, probá de nuevo.`,
  sinpermiso: `Para buscar tus estudios, Mimitos necesita el permiso de leer tus mails. En la pantalla de ${PROV[p].company}, aceptalo.`,
  error: `No pudimos conectar ${PROV[p].label}. Probá de nuevo en un rato.`,
  sinconfig: `La conexión con ${PROV[p].label} todavía no está configurada.`,
  completo: GMAIL_FULL,
})[arg];
const GMAIL_FULL = 'Gmail está completo por ahora. Podés usar Outlook o Subir estudios; te avisamos cuando se libere.';
/* Gmail completo para esta cuenta: no la conectó nunca y Google ya no deja sumar usuarios hasta verificar la app */
const mFull = p => Boolean(mstat[p]?.full && !mstat[p]?.connected);
let mInterest = false;
function mailInterest(p) {
  if (mInterest || !mFull(p)) return;
  mInterest = true;
  fetch(`/api/mascotas?${p}=interest`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => { mInterest = false; });
}
const mOn = () => MAILS.some(p => mstat[p]?.allowed);
const mAny = () => MAILS.some(p => mstat[p]?.connected);
const gmailBtn = () => mOn() ? `<button class="btn sm ghost" data-act="mailPick">${I('mail')} ${mAny() ? 'Buscar en tu mail' : 'Conectar tu mail'}</button>` : '';
/* "Conectar tu mail" existe para las cuentas habilitadas (hoy, todos los compradores). El GET principal trae mail.allowed:
   si dice que no, no se consulta el estado (así no quedan 403 en la consola). Si el servidor
   todavía no manda el dato (null), se consulta como antes. */
let mailAllowed = null;
async function loadMail() {
  if (mailAllowed === false) { MAILS.forEach(p => { mstat[p] = null; }); mailRoute(); return render(); }
  await Promise.all(MAILS.map(async p => {
    try { const r = await fetch(`/api/mascotas?${p}=status`); const d = await r.json().catch(() => null); mstat[p] = r.ok && d?.allowed ? d : null; if (mstat[p]?.senders) msenders = mstat[p].senders; }
    catch { mstat[p] = null; }
  }));
  mailRoute(); render();
}
/* al volver del proveedor (#/gmail/conectado, #/outlook/conectado) arranca la búsqueda; el resto de los regresos muestran un mensaje */
function mailRoute() {
  const p = route.name;
  if (!MAILS.includes(p) || mode !== 'full' || !mstat[p]) return;
  if (route.arg === 'conectado') { history.replaceState(null, '', '#/' + p); route.arg = ''; gm = null; if (mstat[p].connected) mailSearch(p, 'all'); return; }
  if (mBack(p, route.arg)) { gm = { ...(gm?.p === p ? gm : {}), p, phase: 'intro', back: mBack(p, route.arg) }; history.replaceState(null, '', '#/' + p); route.arg = ''; }
}
/* un solo botón en el historial: elegís Gmail u Outlook (o buscás en el que ya conectaste) */
function mailPickPanel() {
  const row = p => {
    const s = mstat[p]; if (!s) return '';
    const sub = s.connected ? `Conectado como ${esc(s.address || PROV[p].label)}` : !s.ready ? 'Todavía no disponible' : mFull(p) ? 'Completo por ahora' : s.expired ? 'La conexión venció: volvé a conectar' : p === 'outlook' ? 'Outlook, Hotmail, Live o Microsoft 365' : 'Tu cuenta de Google';
    return `<button class="row link-row" data-mail="${p}"${s.ready || s.connected ? '' : ' disabled'}>${bubble('mail', p === 'gmail' ? 'viaje' : 'cuida')}<span class="what"><b>${s.connected ? `Buscar en ${PROV[p].label}` : `Conectar ${PROV[p].label}`}</b><small>${sub}</small></span>${I('chevron')}</button>`;
  };
  panel('Traé estudios desde tu mail', `<p class="dim">Buscamos los análisis, ecografías, radiografías, recetas e informes que te mandaron y elegís cuáles sumar. Podés conectar uno o los dos.</p><div class="list">${MAILS.map(row).join('')}</div>`);
  $('#pBody').onclick = e => { const b = e.target.closest('[data-mail]'); if (!b || b.disabled) return; dPanel.close(); openMail(b.dataset.mail, 'new'); };
}
function openMail(p, m) {
  if (!mstat[p]) return;
  if (!mstat[p].connected) { gm = { p, phase: 'intro' }; return go(p); }
  go(p); mailSearch(p, m);
}
async function mailConnect(p) {
  if (dirty) await flushNow();
  const range = (gm?.p === p && gm.range) || mstat[p]?.range || '12m';
  location.href = `/api/mascotas?${p}=start&range=${encodeURIComponent(range)}`;
}
const gmFiles = () => (gm?.cands || []).flatMap(c => c.files.map(f => c.m + '|' + f.part));
const gmFile = k => { const [m, part] = k.split('|'); const c = gm.cands.find(x => x.m === m); const f = c?.files.find(x => x.part === part); return f ? { m, part, name: f.name, type: f.type, url: f.url || '', mail: c.link || '' } : null; };
async function mailSearch(p, mode, more, range) {
  if (gm?.phase === 'searching' && gm.p === p) return;
  const prev = more && gm?.p === p ? gm : null;
  gm = { p, phase: 'searching', mode, cands: prev ? prev.cands : [], noFile: prev ? prev.noFile : [], sel: prev ? prev.sel : new Set(), scanned: prev ? prev.scanned : 0, more: null, range: range || gm?.range };
  if (range) mstat[p].range = range;
  render();
  let cursor = more || null; const base = gm.scanned;
  try {
    do {
      const r = await fetch(`/api/mascotas?${p}=search`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode, cursor, ...(range && !cursor ? { range } : {}) }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw Object.assign(new Error(d.error || 'error'), { code: d.error });
      gm.cands.push(...d.candidates); gm.noFile.push(...(d.noFile || [])); gm.cands.sort((a, b) => (b.score || 0) - (a.score || 0)); gm.scanned = base + d.scanned; gm.more = d.more || null;
      cursor = d.cursor;
      if (route.name === p) render();
    } while (cursor);
    gm.phase = 'list';
    if (!gm.more) mstat[p].lastSearch = new Date().toISOString();
  } catch (e) {
    if (/_vencido$/.test(e.code || '')) { mstat[p].connected = false; mstat[p].expired = true; gm = { p, phase: 'intro', back: mErr(p, e.code) }; }
    else { gm.phase = 'error'; gm.err = mErr(p, e.code) || `No pudimos buscar en tu ${PROV[p].label}. Revisá la conexión y probá de nuevo.`; }
  }
  if (route.name === p) render();
}
const kb = n => n >= 1048576 ? (n / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
function renderMail(p) {
  const s = mstat[p];
  if (s === undefined) return skeleton();
  if (!s) { setTimeout(() => go('libreta')); return skeleton(); }
  if (gm && gm.p !== p) gm = null;
  const pet = curPet(), L = PROV[p].label;
  const back = `<button class="link" data-act="go" data-to="libreta" style="align-self:flex-start">${I('back')} ${pet ? `Libreta de ${esc(pet.name)}` : 'Volver'}</button>`;
  if (!s.connected || gm?.phase === 'intro' || !gm) {
    if (s.connected && !gm) { after(() => mailSearch(p, s.lastSearch ? 'new' : 'all')); return `<section class="sec reading"><div class="ib big c-viaje spin">${I('mail')}</div><h1 class="h-xl">Buscando en tu ${L}</h1></section>`; }
    if (mFull(p)) mailInterest(p);
    return mailIntro(p, back);
  }
  if (gm.phase === 'searching') return `<section class="sec reading" aria-busy="true">${back}<div class="ib big c-viaje spin">${I('mail')}</div><h1 class="h-xl">Buscando en tu ${L}</h1><p class="dim" role="status">Revisamos ${gm.scanned} ${gm.scanned === 1 ? 'mail' : 'mails'}${gm.cands.length ? ` y encontramos ${gmFiles().length} ${gmFiles().length === 1 ? 'documento' : 'documentos'}` : ''}. Solo miramos el asunto, quién lo mandó y los adjuntos.</p></section>`;
  if (gm.phase === 'error') return `<section class="sec">${back}<h1 class="h-xl">No pudimos buscar</h1><p class="dim">${esc(gm.err)}</p><button class="btn big wide" data-act="mailOpen" data-p="${p}" data-mode="${gm.mode}">Probar de nuevo</button></section>`;
  const files = gmFiles(), n = gm.sel.size, queue = s.queue || [];
  const qBox = queue.length ? `<div class="gm-queue"><span class="what"><b>${queue.length} en cola</b><small>Los elegiste y no entraron en el tope de importaciones inteligentes. Seguí cuando se renueve.</small></span><button class="btn sm ghost" data-act="mailQueue">Seguir con la cola</button></div>` : '';
  const moreBox = gm.more ? `<div class="gm-more"><p class="note">Revisamos los ${gm.scanned} mails más recientes. Puede haber más viejos.</p><button class="btn sm ghost" data-act="mailMore">Buscar 200 más</button></div>` : '';
  const who = s.address ? `${L} · ${esc(s.address)}` : L;
  const noFile = gm.noFile?.length ? `<section class="gm-nofile"><h2>Sin archivo adjunto: abrilo en ${L}</h2><p class="note">Parecen de tu veterinaria o laboratorio, pero no traen el PDF (muchos mandan un link). Abrilo, bajá el estudio y sumalo con “Subir estudios”.</p>
    <div class="list">${gm.noFile.map(x => `<a class="row link-row" href="${esc(x.link)}" target="_blank" rel="noopener">${bubble('mail', 'plata')}<span class="what"><b>${esc(x.subject || '(Sin asunto)')}</b><small>${esc(x.from)}${x.date ? ' · ' + fmt(x.date.slice(0, 10), { day: 'numeric', month: 'short', year: 'numeric' }) : ''}</small></span>${I('chevron')}</a>`).join('')}</div></section>` : '';
  /* pocos o ningún resultado: qué probar */
  const tips = files.length < 3 ? `<div class="gm-tips"><b>${files.length ? '¿Falta alguno?' : '¿Qué probar?'}</b><ul>
      ${s.range !== 'all' ? `<li>Buscar en más tiempo: ${s.range === '12m' ? `<button class="link" data-act="mailRangeGo" data-v="3y">últimos 3 años</button> o ` : ''}<button class="link" data-act="mailRangeGo" data-v="all">todo</button>.</li>` : ''}
      <li>Agregá tu veterinaria o laboratorio acá abajo: los mails de ese remitente entran aunque no digan “veterinaria”.</li>
      <li>Muchos laboratorios mandan un <b>link</b> y no el PDF adjunto. En ese caso, bajá el PDF y usá <button class="link" data-act="bulkStudies">Subir estudios</button>, o reenviátelo con el PDF adjunto.</li></ul></div>` : '';
  const srcBox = sendersBox(p, true);
  if (!files.length) return `<section class="sec gmail">${back}<div><span class="eyebrow">${who}</span><h1 class="h-xl">${gm.mode === 'new' ? 'No hay documentos nuevos' : 'No encontramos documentos'}</h1>
    <p class="lead-s" style="margin-top:6px">${gm.mode === 'new' ? 'Desde la última búsqueda no llegaron mails veterinarios con estudios.' : `Buscamos mails de veterinarias y laboratorios, o que nombren a ${doc.pets.length === 1 ? esc(doc.pets[0].name) : 'tus mascotas'}. Lo genérico (cursos, certificados, facturas) lo dejamos afuera.`} Lo que ya trajiste no aparece de nuevo.</p></div>
    ${qBox}${tips}${srcBox}${noFile}${moreBox}<button class="btn big wide" data-act="go" data-to="libreta">Volver a la libreta</button></section>`;
  const date = c => c.date ? fmt(c.date.slice(0, 10), { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  return `<section class="sec gmail">${back}
    <div><span class="eyebrow">${who}</span><h1 class="h-xl">Encontramos ${files.length} ${files.length === 1 ? 'documento que podría ser' : 'documentos que podrían ser'} de tus mascotas</h1>
      <p class="lead-s" style="margin-top:6px">Elegí cuáles traer. Nada se descarga ni se lee hasta que tocás Importar.</p></div>
    ${qBox}
    <div class="gm-bar"><span class="dim">${n ? `${n} ${n === 1 ? 'elegido' : 'elegidos'}` : 'Ninguno elegido'}</span><button class="link" data-act="mailAll">${files.every(k => gm.sel.has(k)) ? 'Desmarcar todos' : 'Marcar todos'}</button></div>
    <div class="gm-list">${gm.cands.map(c => `<article class="gm-mail"><div class="gm-h"><b>${esc(c.subject || '(Sin asunto)')}</b><small>${esc(c.from)}${c.date ? ' · ' + date(c) : ''}</small></div>
      ${c.files.map(f => { const k = c.m + '|' + f.part; return `<label class="gm-file"><input type="checkbox" data-gsel="${esc(k)}" ${gm.sel.has(k) ? 'checked' : ''}>${bubble(f.type === 'link' ? 'download' : f.type === 'application/pdf' ? 'doc' : 'camera', f.type === 'link' ? 'cuida' : 'viaje')}<span class="what"><b>${esc(f.name)}</b><small>${f.type === 'link' ? 'Link en el mail · lo bajamos del sitio del laboratorio' : `${f.type === 'application/pdf' ? 'PDF' : 'Foto'} · ${kb(f.size)}`}${/heic|heif/.test(f.type) ? ' · se adjunta sin leer' : ''}</small></span></label>`; }).join('')}
    </article>`).join('')}</div>
    ${moreBox}${noFile}${tips}${srcBox}
    ${aiLeftNote()}
    <p class="note">Cada archivo que importás se lee con IA (Claude, de Anthropic) y cuenta como una importación inteligente. Buscar y elegir no cuenta. Lo revisás antes de guardar.</p>
    <div class="gm-go"><button class="btn big wide" data-act="mailImport"${n ? '' : ' disabled'}>Importar seleccionados${n ? ` (${n})` : ''}</button></div>
  </section>`;
}
/* "¿De dónde te llegan los estudios?": nombre o mail de la veterinaria o el laboratorio (compartido entre Gmail y Outlook) */
function sendersBox(p, after) {
  return `<div class="f gm-src"><label for="srcIn">¿De dónde te llegan los estudios? <span class="opt">(opcional)</span></label>
    <div class="gm-src-row"><input id="srcIn" maxlength="80" autocomplete="off" placeholder="Veterinaria, laboratorio o mail"><button type="button" class="btn sm ghost" data-act="srcAdd" data-p="${p}">Agregar</button></div>
    ${msenders.length ? `<div class="chips gm-src-chips">${msenders.map(x => `<span class="chip on">${esc(x)}<button type="button" class="chip-x" data-act="srcRm" data-v="${esc(x)}" aria-label="Quitar ${esc(x)}">${I('x')}</button></span>`).join('')}</div>` : ''}
    <small class="hint">Por ejemplo “Panda” o lab@…. Lo sumamos a la búsqueda: sus mails entran aunque no digan “veterinaria”.</small>
    ${after && gm?.srcDirty ? `<button type="button" class="btn sm" data-act="mailRangeGo" data-v="${esc(mstat[p].range || '12m')}">Buscar de nuevo con esto</button>` : ''}</div>`;
}
async function sendersPost(body) {
  try {
    const r = await fetch(`/api/mascotas?${MAILS.find(x => mstat[x]) || 'gmail'}=senders`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const d = await r.json(); if (!r.ok) throw new Error();
    msenders = d.senders || []; if (gm) gm.srcDirty = true; render();
  } catch { toast('No se pudo guardar. Probá de nuevo.'); }
}
function mailIntro(p, back) {
  const s = mstat[p], P = PROV[p], L = P.label;
  const range = (gm?.p === p && gm.range) || s.range || '12m';
  const fact = (ic, c, t, d) => `<li>${bubble(ic, c)}<span><b>${t}</b><small>${d}</small></span></li>`;
  const msg = mFull(p) ? '' : (gm?.p === p && gm.back) || (s.expired ? mErr(p, 'vencido') : '');
  const removeTxt = p === 'gmail' ? 'Desconectás cuando quieras desde Cuenta y lo revocamos en Google.' : 'Desconectás cuando quieras desde Cuenta y borramos todo lo guardado; el permiso en Microsoft lo quitás en account.live.com/consent/Manage (cuenta personal) o en myapps.microsoft.com (trabajo).';
  return `<section class="sec gmail-intro">${back}
    <div><span class="eyebrow">Historial clínico</span><h1 class="h-xl">Traé los estudios desde tu ${L}</h1>
      <p class="lead-s" style="margin-top:6px">Buscamos en tu mail${P.who ? ` (${P.who})` : ''} los análisis, ecografías, radiografías, recetas e informes que te mandaron, y elegís cuáles sumar al historial.</p></div>
    ${msg ? `<p class="bk-msg" role="status">${esc(msg)}</p>` : ''}
    <ul class="gm-facts">
      ${fact('mail', 'viaje', 'Qué lee', 'Busca mails que parezcan veterinarios o que nombren a tus mascotas o a sus veterinarias, y te muestra el asunto, quién lo mandó, la fecha y los adjuntos. De esos mails veterinarios lee el texto solo para encontrar el link al estudio, cuando el laboratorio lo manda así; el texto no se guarda.')}
      ${fact('shield', 'salud', 'Qué guarda', `Solo los PDF y fotos que elijas importar, en tu cuenta. Además, el permiso de ${P.company} cifrado, la fecha de la última búsqueda y qué adjuntos ya trajiste. De lo que no importás no queda nada.`)}
      ${fact('sparkle', 'plata', 'Qué se manda a la IA', `Cada archivo que importás se manda a la IA (Claude, de Anthropic) para leer la fecha, el tipo, un resumen y de qué mascota parece. Lo revisás antes de guardar. Tus datos de ${L} no se usan para publicidad ni para entrenar IA.`)}
      ${fact('x', 'med', 'Qué no hace', `Mimitos no manda, no borra ni modifica mails: el permiso es solo de lectura. ${removeTxt}`)}
    </ul>
    ${mFull(p) ? '' : `<div class="f"><span class="lb" id="gmRangeL">Dónde buscar la primera vez</span>
      <div class="tiles" role="group" aria-labelledby="gmRangeL">${[['12m', 'Últimos 12 meses'], ['3y', 'Últimos 3 años'], ['all', 'Todo']].map(([v, l]) => `<button type="button" class="tile" data-act="mailRange" data-p="${p}" data-v="${v}" aria-pressed="${v === range}"><span>${l}</span></button>`).join('')}</div></div>
    ${sendersBox(p, false)}`}
    ${mFull(p) ? `<div class="gm-full" role="status"><p class="bk-msg">${GMAIL_FULL}</p>
      <div class="gm-acts">${mstat.outlook && p !== 'outlook' ? `<button class="btn" data-act="mailOpen" data-p="outlook">${I('mail')} Usar Outlook</button>` : ''}<button class="btn ghost" data-act="bulkStudies">${I('file')} Subir estudios</button></div></div>`
    : !s.ready ? `<p class="bk-msg">${mBack(p, 'sinconfig')}</p>`
    : `<div class="gm-see" role="group" aria-labelledby="gmSeeT"><span class="lb" id="gmSeeT">Lo que vas a ver en ${P.company}</span>
      <ol>${P.see.map(t => `<li>${t}</li>`).join('')}</ol></div>
    <button class="btn big wide" data-act="mailConnect" data-p="${p}">${I('mail')} ${s.expired ? `Volver a conectar ${L}` : `Conectar ${L}`}</button>`}
    ${p === 'gmail' ? `<p class="note">El uso que hace Mimitos de la información recibida de las API de Google cumple la <a href="${LIMITED_USE}" target="_blank" rel="noopener">Política de Datos del Usuario de los Servicios de API de Google</a>, incluidos los requisitos de Uso Limitado. Más detalle en <a href="/privacidad" target="_blank" rel="noopener">Privacidad</a>.</p>` : `<p class="note">Más detalle en <a href="/privacidad" target="_blank" rel="noopener">Privacidad</a>.</p>`}
  </section>`;
}
app.addEventListener('keydown', e => { if (e.target.id === 'srcIn' && e.key === 'Enter') { e.preventDefault(); app.querySelector('[data-act="srcAdd"]')?.click(); } });
app.addEventListener('change', e => { const k = e.target.closest('[data-gsel]'); if (k && gm?.sel) { if (k.checked) gm.sel.add(k.dataset.gsel); else gm.sel.delete(k.dataset.gsel); render(); } });
/* importa los elegidos uno por uno y termina en la misma revisión que "Subir estudios" */
/* por qué no se pudo bajar un estudio por link: el motivo real y qué hacer */
const LINK_WHY = {
  http: 'El link no es seguro (http, sin cifrar) y por seguridad no lo bajamos solos.',
  tls: 'El sitio del laboratorio tiene un problema de seguridad (su conexión cifrada no funciona bien), así que no lo bajamos solos.',
  login: 'Este laboratorio pide iniciar sesión o muestra una página en vez del archivo.',
  grande: 'El archivo pesa más de 15 MB.',
  no_existe: 'El link venció o ya no existe. Si lo necesitás, pedile a la veterinaria que te lo mande de nuevo.',
  tiempo: 'El sitio del laboratorio no respondió a tiempo. Probá de nuevo en un rato.',
  tipo: 'El link no lleva a un estudio: es otro tipo de archivo.',
  bloqueado: 'El link apunta a una dirección que Mimitos no abre por seguridad.',
  red: 'No pudimos conectarnos con el sitio del laboratorio. Probá de nuevo en un rato.',
};
const LINK_FIX = { http: 1, tls: 1, login: 1, grande: 1, tipo: 1, bloqueado: 1 };
const outLink = u => /^https?:\/\//i.test(u || '') ? u : '';
/* trae un solo archivo elegido (adjunto o link). Devuelve la respuesta del tope si quedó sin lugar */
async function importItem(p, it, done) {
  const key = x => x.m + '|' + x.part;
  it.msg = ''; it.acts = null; it.retry = false;
  try {
    it.status = 'subiendo'; render();
    const r = await fetch(`/api/mascotas?${p}=import`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ m: it.gm.m, part: it.gm.part }) });
    const d = await r.json().catch(() => ({}));
    if (r.status === 429 && d.queued) return d;
    const mailBtn = it.gm.mail ? { href: it.gm.mail, label: `Abrir el mail en ${PROV[p].label}` } : null;
    if (!r.ok && d.error === 'link_error') {
      /* no se importa: el motivo real, y los botones para resolverlo a mano */
      const why = LINK_WHY[d.motivo] || LINK_WHY.red;
      it.status = 'error'; it.keep = false;
      it.msg = why + (LINK_FIX[d.motivo] ? ' Abrilo, bajá el PDF y usá «Subir estudios».' : '');
      it.acts = [outLink(d.url || it.gm.url) ? { href: outLink(d.url || it.gm.url), label: 'Abrir el link' } : null, mailBtn].filter(Boolean);
      it.retry = true;
      return null;
    }
    if (!r.ok) {
      it.status = 'error'; it.keep = false;
      it.msg = aiSoft(d.error) ? limitMsg(d) : mErr(p, d.error) || (r.status >= 500 || !d.error ? 'No se pudo traer: el servidor no respondió bien. Probá de nuevo.' : `No se pudo traer (${String(d.error).slice(0, 40)}).`);
      if (d.error === 'ya_importado') done?.add(key(it.gm));
      else it.retry = !/_vencido$/.test(d.error || '');
      if (/_vencido$/.test(d.error || '')) { mstat[p].connected = false; mstat[p].expired = true; }
      if (it.gm.type === 'link') it.acts = [outLink(it.gm.url) ? { href: outLink(it.gm.url), label: 'Abrir el link' } : null, mailBtn].filter(Boolean);
      return null;
    }
    done?.add(key(it.gm));
    it.ref = d.ref; it.petId = d.petId || ''; it.sug = d.petId || ''; it.keep = true;
    if (it.gm.type === 'link' && d.ref?.name) it.name = d.ref.name;
    if (d.data) { it.data = { ...it.data, ...d.data, title: d.data.title || it.data.title }; it.status = d.data.confidence === 'baja' || d.data.warnings?.length || !d.data.date ? 'revisar' : 'listo'; }
    else { it.status = 'manual'; it.msg = (/^limite|^ai_expired$|^ai_paused$/.test(d.manual) ? limitMsg({ error: d.manual, message: d.message }) : readErr(d.manual, d) || 'No lo pudimos leer.') + ' Quedó adjunto: completalo a mano.'; }
    setQuota(d.quota);
    if (d.data && d.truncated) it.msg = d.note || 'Leímos las primeras 20 páginas; el archivo completo quedó guardado.';
  } catch { it.status = 'error'; it.keep = false; it.msg = 'No se pudo traer: revisá la conexión.'; it.retry = true; }
  return null;
}
async function queueRest(p, rest, d) {
  rest.forEach(x => { x.status = 'cola'; x.keep = false; x.msg = ''; x.acts = null; x.retry = false; });
  const q = await fetch(`/api/mascotas?${p}=queue`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: rest.map(x => x.gm) }) }).then(x => x.json()).catch(() => null);
  if (q?.queue) mstat[p].queue = q.queue;
  const n = rest.length === 1 ? 'Quedó 1 en cola' : `Quedaron ${rest.length} en cola`;
  bulk.queued = d?.error === 'ai_paused' ? `${limitMsg(d)} ${n}: más tarde, entrá a tu mail desde el historial y tocá «Seguir con la cola».` : `${limitMsg(d)} ${n}: cuando se renueve, entrá a tu mail desde el historial y tocá «Seguir con la cola».`;
}
/* importa los elegidos uno por uno y termina en la misma revisión que "Subir estudios" */
async function mailImport(p, list) {
  const pet = curPet(); if (!pet || !list.length) return;
  bulk = { petId: pet.id, source: 'mail', prov: p, state: 'working', note: '', items: list.map((x, i) => ({ i, gm: x, name: x.name, status: 'pendiente', keep: true, petId: '', sug: '', data: { date: '', kind: 'otro', title: x.name.replace(/\.[^.]+$/, ''), lab: '', summary: '', confidence: '', warnings: [] } })) };
  setRoute('estudios'); render(); window.scrollTo(0, 0);
  const done = new Set(), key = x => x.m + '|' + x.part;
  for (const [n, it] of bulk.items.entries()) {
    if (!bulk) return;
    const stop = await importItem(p, it, done);
    /* sin tope de IA: este y los que siguen quedan en cola para seguir otro día */
    if (stop) { await queueRest(p, bulk.items.slice(n), stop); break; }
  }
  /* lo traído (o en cola) ya no se ofrece en la lista */
  if (mstat[p]) mstat[p].queue = (mstat[p].queue || []).filter(x => !done.has(key(x)));
  if (gm?.p === p && gm.cands) { const gone = new Set([...done, ...(bulk?.items || []).filter(x => x.status === 'cola').map(x => key(x.gm))]); gm.cands = gm.cands.map(c => ({ ...c, files: c.files.filter(f => !gone.has(c.m + '|' + f.part)) })).filter(c => c.files.length); gone.forEach(k => gm.sel.delete(k)); }
  if (bulk) { bulk.state = 'review'; render(); }
}
/* "Reintentar" en una fila que falló, sin volver a importar todo */
async function retryItem(i) {
  const it = bulk?.items?.[i]; if (!it || it.status !== 'error' || !bulk.prov || it.busy) return;
  const p = bulk.prov; it.busy = true;
  const done = new Set();
  const stop = await importItem(p, it, done);
  it.busy = false;
  if (stop) await queueRest(p, [it], stop);
  if (gm?.p === p && gm.cands && done.size) { gm.cands = gm.cands.map(c => ({ ...c, files: c.files.filter(f => !done.has(c.m + '|' + f.part)) })).filter(c => c.files.length); done.forEach(k => gm.sel.delete(k)); }
  render();
}
function petPick(it, id) {
  const s = petById(it.sug);
  return `<div class="f pet-pick">${s ? `<p class="sug">${I('paw')}<span>Parece de <b>${esc(s.name)}</b> · ¿Agregar a ${esc(s.name)}?</span></p>` : `<p class="sug">${I('paw')}<span>No sabemos de quién es: elegí la mascota.</span></p>`}
    <label for="${id}_pet">Mascota</label><select id="${id}_pet">${s ? '' : '<option value="">Elegí…</option>'}${doc.pets.map(q => `<option value="${q.id}"${q.id === (it.petId || '') ? ' selected' : ''}>${esc(q.name)}</option>`).join('')}</select></div>`;
}
function gmailAccount() {
  if (!mOn()) return '';
  const card = p => {
    const s = mstat[p]; if (!s) return '';
    const L = PROV[p].label;
    const last = s.lastSearch ? `Última búsqueda: ${fmt(isoLocal(new Date(s.lastSearch)).slice(0, 10), { day: 'numeric', month: 'long' })}` : 'Todavía no buscaste';
    if (s.connected) return `<div class="card gm-acc">
      <div class="gm-acc-h">${bubble('mail', p === 'gmail' ? 'viaje' : 'cuida')}<span class="what"><b>${L} · ${esc(s.address || 'conectado')}</b><small>${last}${s.queue?.length ? ` · ${s.queue.length} en cola` : ''}</small></span></div>
      <div class="gm-acts"><button class="btn sm" data-act="mailOpen" data-p="${p}" data-mode="new">Buscar de nuevo</button><button class="btn sm ghost" data-act="mailOff" data-p="${p}">Desconectar</button></div></div>`;
    return `<div class="list"><button class="row link-row" data-act="mailOpen" data-p="${p}"${s.ready ? '' : ' disabled'}>${bubble('mail', p === 'gmail' ? 'viaje' : 'cuida')}<span class="what"><b>${s.expired ? `Volver a conectar ${L}` : `Conectar ${L}`}</b><small>${!s.ready ? 'Todavía no disponible' : mFull(p) ? 'Completo por ahora: te avisamos cuando se libere' : s.expired ? 'La conexión venció o se quitó el permiso.' : p === 'gmail' ? 'Tu cuenta de Google' : 'Outlook, Hotmail, Live o Microsoft 365'}</small></span>${I('chevron')}</button></div>`;
  };
  return `<section class="sec"><h2>Tu mail</h2><div class="gm-accs">${MAILS.map(card).join('')}</div><p class="note">Solo lectura. Mimitos no manda ni modifica mails.</p></section>`;
}
function mailOffPanel(p) {
  const L = PROV[p].label, revokes = mstat[p]?.revokes;
  panel(`¿Desconectar ${L}?`, `<p class="dim">${revokes ? 'Revocamos el permiso en Google y borramos' : 'Borramos'} lo que guardamos de ${L}: el permiso cifrado, la fecha de la última búsqueda, la cola y la lista de lo que ya trajiste. Los estudios que importaste quedan en el historial.</p>
    ${revokes ? '' : `<p class="dim">Microsoft no deja que una app se quite el permiso sola: para sacarlo del todo, entrá a <a href="https://account.live.com/consent/Manage" target="_blank" rel="noopener">account.live.com/consent/Manage</a> (cuenta personal) o a <a href="https://myapps.microsoft.com" target="_blank" rel="noopener">myapps.microsoft.com</a> (trabajo o facultad).</p>`}
    <button class="btn big wide" id="gmOffYes">Desconectar ${L}</button><button class="btn ghost wide" id="gmOffNo">Cancelar</button>`);
  $('#gmOffNo').onclick = () => dPanel.close();
  $('#gmOffYes').onclick = async () => {
    $('#gmOffYes').disabled = true;
    try {
      const r = await fetch(`/api/mascotas?${p}=disconnect`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error();
      dPanel.close(); if (gm?.p === p) gm = null; await loadMail();
      toast(d.revoked ? `Listo: ${L} desconectado y permiso revocado.` : d.revokes ? `Listo: ${L} desconectado. Si querés, revisá también los permisos en tu cuenta de Google.` : `Listo: ${L} desconectado. Para quitar el permiso en Microsoft, entrá a account.live.com/consent/Manage.`);
    } catch { $('#gmOffYes').disabled = false; toast('No se pudo desconectar. Probá de nuevo.'); }
  };
}

/* ---------- leer la libreta con IA ---------- */
let scan = null;
function startScan(p) {
  if (aiExpired()) { setRoute('lectura'); return render(); }
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = true;
  inp.onchange = () => { const files = [...inp.files].slice(0, 4); if (files.length) runScan(p, files); };
  inp.click();
}
async function runScan(p, files) {
  const prev = scan?.state === 'review' && scan.petId === p.id ? scan.items : [];
  scan = { petId: p.id, state: 'reading', n: files.length, items: [], warnings: [] };
  setRoute('lectura'); render(); window.scrollTo(0, 0);
  try {
    const images = []; for (const f of files) images.push(await shrink(f, 1600, .85));
    const r = await fetch('/api/mascotas?scan=1', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ images, species: p.species }) });
    const d = await r.json();
    if (r.status === 402) { scan = null; mode = 'nopurchase'; return render(); }
    if (d.error === 'ai_expired') { markExpired(d.expiredAt); scan = null; return render(); }
    if (!r.ok) throw Object.assign(new Error(d.error === 'ai_paused' ? limitMsg(d) + ' Mientras tanto, cargá las vacunas a mano.' : d.error === 'ia_respuesta_truncada' ? 'Las fotos tienen demasiados registros para leerlas de una vez. Probá con menos fotos por tanda.' : d.error === 'limite_reintentos' ? 'Hubo demasiados reintentos fallidos hoy. Probá de nuevo mañana; mientras tanto, cargá las vacunas a mano.' : /^limite_/.test(d.error || '') ? limitMsg(d) + ' Mientras tanto, cargá las vacunas a mano.' : d.error === 'ia_no_configurada' || d.error === 'sin_fotos' ? 'La lectura automática no está disponible en este momento. Cargá las vacunas a mano y probá más tarde.' : 'No pudimos leer las fotos.'), { plain: d.error !== 'ia_respuesta_invalida' && d.error !== undefined && !String(d.error).startsWith('ia_error') });
    setQuota(d.quota);
    scan = { ...scan, state: 'review', items: prev.concat(d.items.map(x => ({ ...x, keep: x.confidence !== 'baja' || Boolean(x.date) }))), warnings: d.warnings || [] };
  } catch (err) { scan = { ...scan, state: 'error', msg: err.message || 'No pudimos leer las fotos.', plain: Boolean(err.plain) }; }
  render();
}
function renderScan() {
  const p = petById(scan?.petId); if (!p || !scan) { setTimeout(() => go('inicio')); return ''; }
  if (scan.state === 'reading') return `<section class="sec reading"><div class="ib big c-viaje spin">${I('sparkle')}</div><h1 class="h-xl">Leyendo la libreta</h1><p class="dim">Estamos pasando ${scan.n === 1 ? 'la foto' : `las ${scan.n} fotos`} a la libreta de ${esc(p.name)}. Tarda unos segundos.</p></section>`;
  if (scan.state === 'error') return `<section class="sec"><h1 class="h-xl">No pudimos leerla</h1><p class="dim">${esc(scan.msg)}${scan.plain ? '' : ' Probá con una foto con más luz, de frente y sin reflejos, o cargá las vacunas a mano.'}</p><button class="btn wide" data-act="scan">${I('camera')} Probar con otra foto</button><button class="btn ghost wide" data-act="scanBack">Volver a ${esc(p.name)}</button></section>`;
  const sel = scan.items.filter(x => x.keep).length;
  return `<section class="sec">
    <button class="link" data-act="scanBack" style="align-self:flex-start">${I('back')} ${esc(p.name)}</button>
    <h1 class="h-xl">Encontramos ${scan.items.length} ${scan.items.length === 1 ? 'registro' : 'registros'}</h1>
    <p class="dim">Revisá que esté bien. Lo marcado con borde ocre conviene mirarlo con la libreta al lado. Tocá cualquiera para corregirlo.</p>
    ${scan.warnings.length ? `<ul class="warn-list" aria-label="Para revisar">${scan.warnings.map(w => `<li>${I('alert')}<span>${esc(w)}</span></li>`).join('')}</ul>` : ''}
    <div class="list">${scan.items.map((x, i) => `<div class="row scanrow${x.confidence === 'baja' ? ' doubt' : ''}">
      <label class="checkbox"><input type="checkbox" data-keep="${i}" ${x.keep ? 'checked' : ''} aria-label="Guardar ${esc(x.name)}"></label>
      <button class="what plain" data-fix="${i}"><b>${esc(x.name || 'Sin nombre')}${x.product ? ` <span class="dim" style="font-weight:500">(${esc(x.product)})</span>` : ''}</b><small>${TYPE[x.type]} · ${x.date ? fmt(x.date) : 'sin fecha'}${x.next ? ' · próxima ' + fmt(x.next) : ''}${x.vet ? ' · ' + esc(x.vet) : ''}</small>${x.note ? `<small style="color:var(--soon)">${esc(x.note)}</small>` : ''}</button>
      ${I('edit')}</div>`).join('')}</div>
    <button class="btn big wide" data-act="scanSave" ${sel ? '' : 'disabled'}>Guardar ${sel} en la libreta de ${esc(p.name)}</button>
    <button class="btn ghost wide" data-act="scan">${I('camera')} Agregar otra página</button>
  </section>`;
}
app.addEventListener('change', e => { const k = e.target.closest('[data-keep]'); if (k && scan) { scan.items[+k.dataset.keep].keep = k.checked; render(); } });
function fixScanItem(i) {
  const x = scan.items[i], p = petById(scan.petId);
  openForm({
    title: 'Corregir', values: { ...x, lot: x.product },
    fields: [{ k: 'type', label: 'Tipo', type: 'chips', options: REC_TYPES }, { k: 'name', label: 'Nombre', type: 'datalist', options: (SUGGEST[p.species] || SUGGEST.otra)[x.type] || [] }, [{ k: 'date', label: 'Se aplicó', type: 'date' }, { k: 'next', label: 'Próxima', type: 'date' }], [{ k: 'lot', label: 'Lote o marca', max: 80 }, { k: 'vet', label: 'Veterinaria', max: 80 }]],
    onSave(v) { if (!v.name) return 'Poné el nombre.'; Object.assign(x, v, { product: v.lot, confidence: 'alta', note: '', keep: true }); },
  });
}
function saveScan() {
  const p = petById(scan.petId), add = scan.items.filter(x => x.keep);
  for (const x of add) p.records.push(normRec({ id: uid(), type: x.type, name: x.name, date: x.date, next: x.next, vet: x.vet, lot: x.product || '', notes: '' }));
  scan = null; ui.lib.jump = null; setRoute('libreta'); changed();
  toast(`Listo: ${add.length} ${add.length === 1 ? 'registro cargado' : 'registros cargados'} en la libreta de ${p.name}.`);
}

/* ---------- subpáginas de Inicio ---------- */
const backTo = (p, to = 'inicio', label) => `<button class="link" data-act="go" data-to="${to}" style="align-self:flex-start">${I('back')} ${esc(label || p.name)}</button>`;
function renderAntecedentes(p) {
  const sm = Z.summary(p);
  const cRow = c => `<button class="row link-row" data-act="editCond" data-id="${c.id}">${bubble('heart', c.status === 'resuelta' ? 'salud' : 'perdida')}<span class="what"><b>${esc(c.name)}</b><small>${{ activa: 'Lo tiene', controlada: 'Controlado', resuelta: 'Ya pasó' }[c.status]}${c.since ? ' · desde ' + esc(c.since) : ''}${c.notes ? ' · ' + esc(c.notes) : ''}</small></span>${I('chevron')}</button>`;
  return `${backTo(p)}
    <div><span class="eyebrow">${esc(p.name)}</span><h1 class="h-xl">Antecedentes</h1><p class="dim" style="margin-top:6px">Lo que le pasó a lo largo de su vida. Es lo primero que pregunta un veterinario nuevo.</p></div>
    <section class="sec"><div class="sec-h"><h2>Problemas de salud</h2><button class="link" data-act="newCond">${I('plus')} Agregar</button></div>
      ${sm.active.length || sm.past.length ? `${sm.active.length ? `<div class="list">${sm.active.map(cRow).join('')}</div>` : ''}${sm.past.length ? `<h3 class="eyebrow" style="margin-top:6px">Ya pasaron</h3><div class="list">${sm.past.map(cRow).join('')}</div>` : ''}` : `<div class="empty dash"><p>Si un veterinario le diagnosticó algo (otitis, alergia, un problema de riñón), anotalo acá con su estado. La app no diagnostica: solo lo registra.</p></div>`}</section>
    <section class="sec"><div class="sec-h"><h2>Cirugías</h2><button class="link" data-act="newSurg">${I('plus')} Agregar</button></div>
      ${p.surgeries.length ? `<div class="list">${p.surgeries.map(c => `<button class="row link-row" data-act="detail" data-kind="surg" data-id="${c.id}">${bubble('scalpel', 'perdida')}<span class="what"><b>${esc(c.name)}</b><small>${c.date ? fmt(c.date) : 'Sin fecha'}</small></span>${I('chevron')}</button>`).join('')}</div>` : `<div class="empty dash"><p>Castración, limpieza dental, una fractura: con fecha aproximada alcanza.</p></div>`}</section>
    <section class="sec"><div class="sec-h"><h2>Alergias y remedios de siempre</h2><button class="link" data-act="editPet">${I('edit')} Editar</button></div>
      <div class="facts"><div><span>Alergias</span><b>${esc(p.allergies || 'Ninguna cargada')}</b></div><div><span>Remedios que toma siempre</span><b>${esc(p.chronic || 'Ninguno')}</b></div><div><span>Castración</span><b>${p.neutered === 'si' ? 'Sí' : p.neutered === 'no' ? 'No' : 'Sin dato'}</b></div></div></section>`;
}
function renderViajes(p) {
  const t = Z.trip(p);
  return `${backTo(p)}<div><span class="eyebrow">${esc(p.name)}</span><h1 class="h-xl">Viaje al exterior</h1></div>
    ${t ? `<div class="sec-h"><h2>${esc(t.dest)}, ${fmt(t.date, { day: 'numeric', month: 'long' })}</h2><button class="link" data-act="trip">Cambiar</button></div>
      <p class="dim">${t.daysTo < 0 ? 'La fecha ya pasó.' : `Faltan ${t.daysTo} días. Esto es lo que necesita ${esc(p.name)}:`}</p>
      <div class="list">${t.items.map(i => `<div class="check ${i.st}"><span class="ic">${I(i.st === 'ok' ? 'check' : i.st === 'no' ? 'alert' : 'plus')}</span><span><b>${esc(i.t)}</b><small>${esc(i.d)}</small></span></div>`).join('')}</div>
      <p class="note">Información general según SENASA (costos a octubre de 2025: trámite normal $1.604, digital o urgente $22.731). Los requisitos cambian: confirmalos en <a href="https://www.argentina.gob.ar/senasa" target="_blank" rel="noopener">argentina.gob.ar/senasa</a> antes de viajar.</p>`
    : `<div class="empty">${bubble('plane', 'viaje')}<h2>¿Viajás con ${esc(p.name)}?</h2><p>Poné destino y fecha y te armamos qué preparar y cuándo: antirrábica, certificado del veterinario, certificado de SENASA y lo que pide cada país.</p><button class="btn" data-act="trip">Planear un viaje</button></div>`}`;
}
function renderDatos(p) {
  const facts = [['Especie', Z.species(p)], ['Raza', p.breed], ['Sexo', p.sex === 'h' ? 'Hembra' : p.sex === 'm' ? 'Macho' : ''], ['Nacimiento', p.birth ? fmt(p.birth) : ''], ['Peso', p.weight ? kg(p.weight) : ''], ['Color', p.color], ['Microchip', p.chip], ['Señas', p.marks], ['Carácter', p.temper]].filter(f => f[1]);
  const call = n => `<a class="ibtn go" href="tel:${esc(n.replace(/[^\d+]/g, ''))}" aria-label="Llamar">${I('phone')}</a>`;
  return `${backTo(p)}<div><span class="eyebrow">${esc(p.name)}</span><h1 class="h-xl">Datos y veterinaria</h1></div>
    <section class="sec"><div class="sec-h"><h2>Sus datos</h2><button class="link" data-act="editPet">${I('edit')} Editar</button></div>
      ${facts.length ? `<div class="facts">${facts.map(([k, v]) => `<div><span>${k}</span><b>${esc(v)}</b></div>`).join('')}</div>` : `<div class="empty dash"><p>Raza, color, microchip y señas ayudan a reconocerla si se pierde.</p></div>`}</section>
    <section class="sec"><div class="sec-h"><h2>Veterinaria y guardia</h2><button class="link" data-act="vet">${p.vet.name || p.vet.er ? `${I('edit')} Editar` : ''}</button></div>
      ${p.vet.name || p.vet.er ? `<div class="list">
        ${p.vet.name ? `<div class="row">${bubble('heart', 'salud')}<span class="what"><b>${esc(p.vet.name)}</b><small>${esc(p.vet.address || 'Su veterinaria')}</small></span>${p.vet.phone ? call(p.vet.phone) : '<span></span>'}</div>` : ''}
        ${p.vet.er ? `<div class="row">${bubble('alert', 'perdida')}<span class="what"><b>${esc(p.vet.er)}</b><small>Guardia 24 horas</small></span>${p.vet.erPhone ? call(p.vet.erPhone) : '<span></span>'}</div>` : ''}</div>`
      : `<div class="empty dash"><p>Cargá tu veterinaria y una guardia 24 horas. En una urgencia no hay tiempo de buscar.</p><button class="btn sm soft" data-act="vet">Cargar veterinaria</button></div>`}</section>
    ${p.notes ? `<section class="sec"><h2>Notas privadas</h2><div class="card"><p style="white-space:pre-wrap">${esc(p.notes)}</p></div></section>` : ''}`;
}

/* ---------- ficha + QR ---------- */
function qrCanvas(text, size = 400) {
  const box = $('#qrScratch'); box.innerHTML = '';
  if (!window.QRCode) return null;
  new QRCode(box, { text, width: size, height: size, colorDark: '#1F1A17', colorLight: '#FFFFFF', correctLevel: QRCode.CorrectLevel.M });
  const src = box.querySelector('canvas'); if (!src) return null;
  const c = document.createElement('canvas'); c.width = src.width; c.height = src.height; c.getContext('2d').drawImage(src, 0, 0);
  box.innerHTML = ''; return c;
}
async function makeLink(p, kind) {
  await flushNow();
  const r = await fetch(`/api/mascotas?${kind}=1`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ petId: p.id }) });
  const d = await r.json(); if (!r.ok) throw new Error(d.error); adopt(d.doc);
  if (kind === 'sitter') sitterLinks[p.id] = d.until ? { active: true, until: d.until } : { active: Boolean(d.token) };
  if (kind === 'unsitter') delete sitterLinks[p.id];
  return petById(p.id);
}
function copyBtn(sel, url) { $(sel).onclick = async () => { try { await navigator.clipboard.writeText(url); toast('Link copiado.'); } catch { const i = $(sel).previousElementSibling; i.select(); } }; }
function sharePanel(p) {
  const contact = `<div class="fbody" style="border-top:1px solid var(--line);padding-top:16px">
    <label class="toggle"><input type="checkbox" id="cShow" ${p.contact.show ? 'checked' : ''}><span><b>Mostrar mi contacto</b><br><small class="dim">Para quien ${la(p)} encuentre si se pierde. En modo perdida se muestra siempre.</small></span></label>
    <div class="two"><div class="f"><label for="cName">Tu nombre</label><input id="cName" maxlength="60" value="${esc(p.contact.name)}"></div><div class="f"><label for="cPhone">Teléfono</label><input id="cPhone" type="tel" maxlength="40" value="${esc(p.contact.phone)}"></div></div></div>`;
  const urgent = `<div class="fbody" style="border-top:1px solid var(--line);padding-top:16px">
    <label class="toggle"><input type="checkbox" id="uShow" ${p.qrNote.show ? 'checked' : ''}><span><b>Mostrar en el QR un dato urgente</b><br><small class="dim">Solo si hace falta: una alergia o una medicación que no puede cortar. Es lo único de salud que se ve en el QR.</small></span></label>
    <div class="f"><label for="uText">Dato urgente</label><textarea id="uText" maxlength="200" rows="2" placeholder="Es alérgica a la penicilina. Toma un remedio para la epilepsia 2 veces por día.">${esc(p.qrNote.text)}</textarea></div></div>`;
  if (!p.share) {
    panel('QR del collar', `<p class="lead-s">Un QR para la chapita de ${esc(p.name)}. Quien ${la(p)} encuentre ve su foto, su nombre, cómo reconocer${la(p)} y botones para llamarte o mandarte un WhatsApp. No muestra nada de salud. Para el veterinario usá la libreta en PDF.</p><button class="btn wide" id="mk">Crear el QR</button>${contact}${urgent}`);
    $('#mk').onclick = async () => { $('#mk').disabled = true; try { sharePanel(await makeLink(p, 'share')); render(); } catch { toast('No pudimos crear el link. Probá de nuevo.'); $('#mk').disabled = false; } };
  } else {
    const url = `${location.origin}/mascota/${p.share}`;
    panel('QR del collar', `<div class="qr" id="qrBox" role="img" aria-label="QR de la ficha de ${esc(p.name)}"></div>
      <div class="linkbox"><input readonly value="${esc(url)}" aria-label="Link de la ficha"><button class="btn sm" id="cp" type="button">Copiar</button></div>
      <div class="btns"><a class="btn sm" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(`Ficha de ${p.name}: ${url}`)}">WhatsApp</a><button class="btn ghost sm" id="tag" type="button">QR para la chapita</button><a class="btn ghost sm" href="${esc(url)}" target="_blank" rel="noopener">Ver ficha</a></div>
      <p class="note">"QR para la chapita" baja una imagen con el QR y el nombre. Imprimila en papel autoadhesivo o llevala a cualquier grabado.</p>
      <p class="note">Cuando alguien lo escanea te avisamos al momento (celu y mail, según tengas activado) con la hora y la ciudad aproximada. Si quien ${la(p)} encontró comparte su ubicación o te deja un mensaje, también te llega.</p>
      ${contact}${urgent}${scanLog(p)}<button class="link danger" id="off" type="button">Apagar link</button>`);
    const c = qrCanvas(url); if (c) $('#qrBox').appendChild(c); else $('#qrBox').textContent = 'No se pudo dibujar el QR. Usá el link.';
    copyBtn('#cp', url);
    $('#tag').onclick = () => tagImage(p, url);
    $('#off').onclick = async () => {
      const b = $('#off'); if (b.dataset.sure !== '1') { b.dataset.sure = '1'; b.textContent = 'Tocá de nuevo: el link y el QR dejan de funcionar'; return; }
      try { sharePanel(await makeLink(p, 'unshare')); render(); toast('Link apagado.'); } catch { toast('No pudimos apagar el link.'); }
    };
  }
  const upd = () => { p.contact = { ...p.contact, show: $('#cShow').checked, name: $('#cName').value.trim(), phone: $('#cPhone').value.trim() }; p.qrNote = { show: $('#uShow').checked, text: $('#uText').value.trim() }; changed(); };
  ['#cShow', '#cName', '#cPhone', '#uShow', '#uText'].forEach(s => $(s).addEventListener('change', upd));
  const clr = $('#scanClear');
  if (clr) clr.onclick = async () => {
    if (clr.dataset.sure !== '1') { clr.dataset.sure = '1'; clr.textContent = 'Tocá de nuevo para borrar el registro'; return; }
    try { const r = await fetch('/api/mascotas?scanclear=1', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ petId: p.id }) }); const d = await r.json(); if (!r.ok) throw 0; scans = d.scans || []; sharePanel(p); render(); toast('Registro borrado.'); } catch { toast('No pudimos borrar el registro.'); }
  };
}
function tagImage(p, url) {
  const q = qrCanvas(url, 600); if (!q) return toast('No se pudo dibujar el QR.');
  const c = document.createElement('canvas'); c.width = 700; c.height = 860; const x = c.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, 700, 860); x.drawImage(q, 50, 50, 600, 600);
  x.fillStyle = '#1F1A17'; x.textAlign = 'center'; x.font = '600 64px Geist, system-ui, sans-serif'; x.fillText(p.name.toUpperCase(), 350, 740);
  x.font = '500 34px Geist, system-ui, sans-serif'; x.fillStyle = '#5E554E'; x.fillText('Escaneame si me encontrás', 350, 800);
  const a = document.createElement('a'); a.href = c.toDataURL('image/png'); a.download = `QR-${p.name}.png`; a.click();
}

/* ---------- modo cuidador ---------- */
function sitterPanel(p) {
  const s = p.sitter;
  const fields = [
    [{ k: 'name', label: Cap(quienCuida(p)).replace(/^Quien/, 'Quién'), max: 60, ph: 'Caro' }, { k: 'contact', label: 'Tu contacto mientras no estás', max: 120 }],
    [{ k: 'from', label: 'Desde', type: 'date' }, { k: 'to', label: 'Hasta', type: 'date' }],
    { k: 'food', label: 'Comida', type: 'textarea', max: 400, ph: 'Cuánto, a qué hora y dónde está el alimento.' },
    { k: 'walks', label: 'Paseos y salidas', type: 'textarea', max: 300, ph: 'Horarios, si va con correa, si se puede soltar.' },
    { k: 'where', label: 'Dónde está cada cosa', type: 'textarea', max: 300, ph: 'Correa, bolsitas, transportadora, remedios.' },
    { k: 'habits', label: 'Mañas y miedos', type: 'textarea', max: 400, ph: 'Se escapa si abren la puerta, le tiene miedo a los cohetes…' },
    { k: 'key', label: 'Llave de respaldo', max: 200, ph: 'Quién tiene otra llave por si se queda afuera.' },
    { k: 'emergency', label: 'Si pasa algo', type: 'textarea', max: 400, ph: 'A quién llamar primero y qué hacer.' },
    { k: 'vetAuth', label: `Avisé a la veterinaria que puede atender${la(p)} en mi nombre`, type: 'check', hint: 'Es lo que más se olvida: sin ese aviso, en una emergencia pueden no atenderla si no te ubican.' },
  ];
  const sl = sitterLinks[p.id], gone = Boolean(p.sitterToken && sl?.expired);
  const link = p.sitterToken && !gone ? `${location.origin}/cuida/${p.sitterToken}` : '';
  const vig = gone ? `<p class="banner sl-state" role="status">${bubble('alert', 'perdida')}<span><b>Este link venció</b>El cuidador ya no ve la información. Si lo sigue necesitando, creá uno nuevo.</span></p>`
    : link && sl?.until ? `<p class="sl-state dim" role="status">Vigente hasta el ${esc(longDate(sl.until))}. Después se apaga solo.</p>` : '';
  panel(`Quién cuida a ${p.name}`, `<p class="lead-s">Completalo una vez. El cuidador abre un link con todo esto, los remedios con sus horarios y la veterinaria, y marca cada día si comió, paseó y le dio los remedios. Lo ves en Inicio, en "Lo que anotó ${esc(quienCuida(p))}". No te llega un aviso al celu.</p>
    <div class="fbody">${fields.map(f => Array.isArray(f) ? `<div class="two">${f.map(x => field(x, s[x.k])).join('')}</div>` : field(f, s[f.k])).join('')}</div>
    ${vig}
    <button class="btn wide" id="sSave">${link ? 'Guardar cambios' : gone ? 'Guardar y crear un link nuevo' : 'Guardar y crear link'}</button>
    ${link ? `<div class="linkbox"><input readonly value="${esc(link)}" aria-label="Link del cuidador"><button class="btn sm" id="sCp" type="button">Copiar</button></div>
      <a class="btn ghost wide" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(`Todo lo de ${p.name} mientras no estoy: ${link}`)}">Mandar por WhatsApp</a>
      <button class="link danger" id="sOff" type="button">Apagar link</button>` : ''}`);
  $('#sSave').onclick = async () => {
    const v = {}; for (const f of fields.flat()) { const el = $('#f_' + f.k); v[f.k] = f.type === 'check' ? el.checked : el.value.trim(); }
    if (v.from && v.to && v.to < v.from) return toast('La fecha "hasta" no puede ser anterior a "desde".');
    p.sitter = v; changed();
    if (!p.sitterToken || gone) { try { sitterPanel(await makeLink(p, 'sitter')); toast(`Link creado. Mandáselo a ${quienCuida(p)}.`); } catch { toast('No pudimos crear el link. Probá de nuevo.'); } }
    else { toast('Guardado. El cuidador ve los cambios al recargar.'); try { sitterPanel(await makeLink(p, 'sitter')); } catch {} }
  };
  if (link) {
    copyBtn('#sCp', link);
    $('#sOff').onclick = async () => { const b = $('#sOff'); if (b.dataset.sure !== '1') { b.dataset.sure = '1'; b.textContent = 'Tocá de nuevo: el cuidador deja de ver la información'; return; } try { sitterPanel(await makeLink(p, 'unsitter')); toast('Link apagado.'); } catch { toast('No pudimos apagar el link.'); } };
  }
}

/* ---------- modo perdida ---------- */
function lostPanel(p) {
  if (!p.lost.on) {
    panel(`Se perdió ${p.name}`, `<p class="lead-s">Las primeras 24 a 48 horas son las más importantes. Completá esto y te armamos el cartel para los grupos de tu zona.</p>
      <div class="fbody">${field({ k: 'place', label: 'Dónde se vio por última vez', max: 160, ph: 'Plaza San Martín, esquina Güemes' }, p.lost.place)}
      ${field({ k: 'since', label: 'Cuándo', type: 'datetime' }, p.lost.since ? p.lost.since.slice(0, 16) : isoLocal(new Date()))}
      ${field({ k: 'phone', label: 'Teléfono para el cartel', type: 'tel', max: 40 }, p.contact.phone)}
      ${field({ k: 'note', label: 'Algo más para el cartel', max: 300, ph: 'Tiene collar rojo. Responde a su nombre.', opt: true }, p.lost.note)}</div>
      <button class="btn orange wide" id="lOn">Activar modo perdida</button>`);
    $('#lOn').onclick = async () => {
      const phone = $('#f_phone').value.trim();
      if (!phone) return toast('Poné un teléfono para que te puedan llamar.');
      p.contact.phone = phone;
      p.lost = { on: true, place: $('#f_place').value.trim(), since: $('#f_since').value || isoLocal(new Date()), note: $('#f_note').value.trim() };
      changed();
      if (!p.share) { try { p = await makeLink(p, 'share'); render(); } catch {} }
      lostPanel(petById(p.id) || p);
    };
    return;
  }
  const url = p.share ? `${location.origin}/mascota/${p.share}` : '';
  panel(`Buscando a ${p.name}`, `
    <canvas id="poster" class="preview" width="1080" height="1350" role="img" aria-label="Cartel de búsqueda de ${esc(p.name)}"></canvas>
    <div class="btns"><button class="btn orange sm" id="pShare">Compartir cartel</button><button class="btn ghost sm" id="pDl">Descargar</button>${url ? `<a class="btn ghost sm" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(`Se perdió ${p.name}. Si la ves, avisame: ${url}`)}">Link por WhatsApp</a>` : ''}</div>
    ${!p.photo ? '<p class="note">Sumá una foto clara en sus datos: el cartel con foto se reconoce mucho más rápido.</p>' : ''}
    <h3>Primeras horas</h3>
    <ol class="steps"><li>Buscá en tu casa y alrededores: debajo de autos, garajes, patios y arbustos.</li><li>Dejá su cama o una prenda con tu olor, agua y comida en la puerta.</li><li>Avisá a vecinos, veterinarias y refugios de la zona.</li><li>Publicá el cartel en los grupos de tu barrio y en tus redes.</li><li>Recorré la zona temprano a la mañana y al atardecer, cuando hay menos ruido.</li><li>Si ${la(p)} ves, no ${la(p)} persigas: agachate y llamal${p.sex === 'm' ? 'o' : 'a'} con calma.</li></ol>
    ${url ? '<p class="note">Mientras esté en modo perdida, la ficha del QR muestra el aviso y tu teléfono.</p>' : ''}
    <button class="btn wide" id="lOff">Apareció: desactivar modo perdida</button>`);
  drawPoster(p, url).then(() => {
    const cv = $('#poster'); if (!cv) return;
    $('#pDl').onclick = () => { const a = document.createElement('a'); a.href = cv.toDataURL('image/png'); a.download = `Se-busca-${p.name}.png`; a.click(); };
    $('#pShare').onclick = () => cv.toBlob(async b => {
      const file = new File([b], `Se-busca-${p.name}.png`, { type: 'image/png' });
      try { if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], text: `Se perdió ${p.name}${url ? '. ' + url : ''}` }); else $('#pDl').click(); } catch {}
    }, 'image/png');
  });
  $('#lOff').onclick = () => { p.lost = { on: false, since: '', place: '', note: '' }; dPanel.close(); changed(); toast(`Qué alegría: ${p.name} volvió a casa.`); };
}
function loadImg(src) { return new Promise(ok => { if (!src) return ok(null); const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src; }); }
function wrap(x, text, X, Y, maxW, lh, maxLines) {
  const words = String(text).split(/\s+/); let line = '', n = 0;
  for (const w of words) { const t = line ? line + ' ' + w : w; if (x.measureText(t).width > maxW && line) { x.fillText(line, X, Y + n * lh); line = w; if (++n >= maxLines - 1) break; } else line = t; }
  if (line) x.fillText(line, X, Y + n * lh); return Y + (n + 1) * lh;
}
async function drawPoster(p, url) {
  try { await document.fonts.ready; } catch {}
  const c = $('#poster'); if (!c) return; const x = c.getContext('2d'), W = 1080, H = 1350, F = 'Geist, system-ui, sans-serif';
  x.fillStyle = '#F7F3EE'; x.fillRect(0, 0, W, H);
  x.fillStyle = '#A32D18'; x.fillRect(0, 0, W, 210);
  x.fillStyle = '#fff'; x.font = `700 150px ${F}`; x.textBaseline = 'middle'; x.fillText('SE BUSCA', 60, 112);
  const img = await loadImg(p.photo);
  const py = 240, ph = 560;
  if (img) { const s = Math.max(W / img.width, ph / img.height), w = img.width * s, h = img.height * s; x.save(); x.beginPath(); x.rect(0, py, W, ph); x.clip(); x.drawImage(img, (W - w) / 2, py + (ph - h) / 2, w, h); x.restore(); }
  else { x.fillStyle = '#1F1A17'; x.fillRect(0, py, W, ph); x.fillStyle = '#F7F3EE'; x.font = `700 300px ${F}`; x.textAlign = 'center'; x.fillText(p.name.slice(0, 1).toUpperCase(), W / 2, py + ph / 2); x.textAlign = 'left'; }
  x.textBaseline = 'alphabetic'; x.fillStyle = '#1F1A17';
  x.font = `700 96px ${F}`; x.fillText(p.name.toUpperCase(), 60, 905);
  x.font = `500 34px ${F}`; x.fillStyle = '#3A322D';
  let y = wrap(x, [Z.species(p), p.breed, p.color, p.marks].filter(Boolean).join(' · '), 60, 958, W - 120, 44, 2);
  x.font = `600 34px ${F}`; x.fillStyle = '#1F1A17';
  y = wrap(x, `Se perdió ${p.lost.since ? Z.fmtWhen(new Date(p.lost.since)) : ''}${p.lost.place ? ' · ' + p.lost.place : ''}`, 60, y + 8, W - 380, 44, 2);
  if (p.lost.note || p.temper) { x.font = `500 30px ${F}`; x.fillStyle = '#5E554E'; wrap(x, [p.lost.note, p.temper].filter(Boolean).join('. '), 60, y + 4, W - 380, 40, 2); }
  x.fillStyle = '#1F1A17'; x.fillRect(0, 1180, W, 170);
  x.fillStyle = '#F6EBDA'; x.font = `600 30px ${F}`; x.fillText('NO LA PERSIGAS. LLAMÁ A:', 60, 1235);
  x.fillStyle = '#fff'; x.font = `700 64px ${F}`; x.fillText(p.contact.phone || '', 60, 1310);
  if (url) { const q = qrCanvas(url, 240); if (q) { x.fillStyle = '#fff'; x.fillRect(W - 290, 960, 240, 240); x.drawImage(q, W - 280, 970, 220, 220); } }
}

/* ---------- PREGUNTALE A MIMITOS ----------
   Chat que responde SOLO con lo cargado en la cuenta (api/mascotas?ask). La conversación queda en memoria
   y en sessionStorage de este navegador; al servidor viajan solo las últimas 6 vueltas, y no se guarda allá. */
const ASK_MAX = 500, ASK_TURNS = 6, ASK_LOW = 10;
const ASK_IC = {
  stars: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M10 3.5l1.7 4.6 4.6 1.7-4.6 1.7L10 16.1l-1.7-4.6L3.7 9.8l4.6-1.7z"/><path d="M18 13.5l.9 2.3 2.3.9-2.3.9-.9 2.3-.9-2.3-2.3-.9 2.3-.9z"/></svg>',
  send: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M5.5 11.5 12 5l6.5 6.5"/></svg>',
};
const askStore = { get() { try { return JSON.parse(sessionStorage.getItem('mimitos:ask') || 'null'); } catch { return null; } }, set(v) { try { sessionStorage.setItem('mimitos:ask', JSON.stringify(v)); } catch {} }, clear() { try { sessionStorage.removeItem('mimitos:ask'); } catch {} } };
const ask = { turns: (askStore.get()?.turns || []).filter(t => t && t.q && t.a).slice(-30), pending: '', error: null, left: null, draft: '', from: 'inicio' };
const askSave = () => askStore.set({ turns: ask.turns.slice(-30) });
const askBtn = (cls = '') => `<button type="button" class="ask-cta ${cls}" data-act="askGo">${ASK_IC.stars}<span>Preguntale a Mimitos</span></button>`;
/* ejemplos con los nombres reales de la cuenta */
function askExamples() {
  const a = curPet(); if (!a) return [];
  const b = doc.pets.find(x => x.id !== a.id) || a;
  const surg = doc.pets.find(x => x.surgeries.some(s => s.name));
  const out = [
    a.records.some(r => r.type === 'desparasitacion') ? `¿Cuándo fue la última pipeta de ${a.name}?` : `¿Cuándo le toca la próxima vacuna a ${a.name}?`,
    `¿${b.name} tiene todas las vacunas al día?`,
    `¿Cuánto aumentó de peso ${a.name} este año?`,
    `¿Cuándo fue la última vez que ${a.name} tuvo diarrea?`,
    ...(surg ? [`¿Qué estudios le hicieron a ${surg.name} antes de la cirugía?`, `¿Qué medicación tomó ${surg.name} después de la cirugía?`] : []),
    '¿Cuánto gasté en veterinario este mes?',
  ];
  return out;
}
const ddmm = d => d && /^\d{4}-\d{2}-\d{2}/.test(d) ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : '';
function citeChip(c, i) {
  const lab = String(c.label || ''), short = lab.length > 24 ? lab.slice(0, 23).trim() + '…' : lab;
  const many = doc.pets.length > 1 ? `${c.petName} · ` : '';
  const when = c.kind === 'gastos' ? (c.date || '').slice(5, 7) + '/' + (c.date || '').slice(0, 4) : ddmm(c.date);
  return `<button type="button" class="cite" data-act="askCite" data-t="${i}" data-c="${esc(c.id)}" aria-label="Ver ${esc(c.label)}${c.petName ? ' de ' + esc(c.petName) : ''}${c.date ? ', ' + esc(c.date) : ''}"><span class="n" aria-hidden="true">${i + 1}</span>${esc(many + short)}${when ? ` · ${esc(when)}` : ''}</button>`;
}
/* el texto de la respuesta: escapado, con las citas como numeritos que también abren el registro */
function askText(t, ti) {
  const ids = (t.cites || []).map(c => c.id);
  return esc(t.a).replace(/\[r:([a-z0-9]+)\]/g, (m, id) => { const k = ids.indexOf(id); return k < 0 ? '' : `<button type="button" class="cref" data-act="askCite" data-t="${ti}" data-c="${id}" aria-label="Fuente ${k + 1}">${k + 1}</button>`; })
    .split(/\n{2,}/).map(par => `<p>${par.replace(/\n/g, '<br>')}</p>`).join('');
}
function askLog() {
  const p = curPet();
  const left = ask.left;
  const turns = ask.turns.map((t, i) => `<div class="ask-turn">
      <p class="ask-q"><span class="sr">Vos: </span>${esc(t.q)}</p>
      <div class="ask-a${t.medical ? ' med' : ''}"><span class="sr">Mimitos: </span>${askText(t, i)}
        ${t.trimmed ? '<p class="ask-trim">Tenías muchos datos: miré lo más reciente.</p>' : ''}
        ${t.cites?.length ? `<div class="cites" role="group" aria-label="De dónde sale">${t.cites.map(citeChip).join('')}</div>` : ''}</div></div>`).join('');
  const pending = ask.pending ? `<div class="ask-turn"><p class="ask-q"><span class="sr">Vos: </span>${esc(ask.pending)}</p>
      <div class="ask-a thinking" aria-busy="true"><span class="think-t">${ASK_IC.stars} Pensando…</span><span class="sk" style="width:92%;height:12px;border-radius:6px"></span><span class="sk" style="width:76%;height:12px;border-radius:6px"></span><span class="sk" style="width:54%;height:12px;border-radius:6px"></span></div></div>` : '';
  const err = ask.error ? `<div class="ask-err" role="alert">${I('alert')}<span><b>${esc(ask.error.t)}</b>${ask.error.d ? `<small>${esc(ask.error.d)}</small>` : ''}</span>${ask.error.retry ? '<button type="button" class="btn sm" data-act="askRetry">Reintentar</button>' : ''}</div>` : '';
  const intro = !ask.turns.length && !ask.pending ? `<div class="ask-intro">
      <span class="ask-mark">${ASK_IC.stars}</span>
      <h1>¿Qué querés saber de ${doc.pets.length > 1 ? 'tus mascotas' : esc(p.name)}?</h1>
      <p class="dim">Busco en lo que cargaste: vacunas, pipetas, peso, gastos, consultas, estudios y notas. Te digo de dónde sale cada dato.</p>
      <div class="ask-ex" role="group" aria-label="Ejemplos para preguntar">${askExamples().map(q => `<button type="button" class="chip" data-act="askEx" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div></div>` : '';
  const capped = left && (left.day <= 0 || left.month <= 0);
  const leftTxt = capped ? '' : left && Math.min(left.day, left.month) <= ASK_LOW ? `<p class="ask-left">${Math.min(left.day, left.month) === 1 ? 'Te queda 1 pregunta' : `Te quedan ${Math.min(left.day, left.month)} preguntas`} ${left.day <= left.month ? 'por hoy' : 'este mes'}.</p>` : '';
  return intro + turns + pending + err + leftTxt;
}
function renderAsk() {
  const p = curPet();
  const head = `<header class="ask-h"><button type="button" class="round" data-act="askBack" aria-label="Volver">${I('back')}</button><h1 class="ask-title">${ASK_IC.stars}<span>Preguntale a Mimitos</span></h1>${ask.turns.length ? `<button type="button" class="btn ghost sm" data-act="askNew">${I('plus')}<span>Nueva<span class="ask-long"> conversación</span></span></button>` : '<span class="ask-sp"></span>'}</header>`;
  if (!p) return `<section class="ask">${head}<div class="empty" style="margin-top:12px">${bubble('paw', 'salud')}<h2>Primero cargá a tu mascota</h2><p>Mimitos responde con lo que cargás. Cuando tengas a tu mascota y algún dato, preguntale lo que quieras.</p><button class="btn" data-act="newPet">${I('plus')} Agregar a mi mascota</button></div></section>`;
  const left = ask.left, capped = left && (left.day <= 0 || left.month <= 0);
  after(() => { const el = $('#askIn'); if (el && !ask.pending && !capped && !matchMedia('(pointer:coarse)').matches) el.focus({ preventScroll: true }); askScroll(); });
  return `<section class="ask">${head}
    ${aiq?.paused ? `<p class="ask-note" role="status">${I('alert')}<span>${esc(AI_PAUSED_MSG)}</span></p>` : ''}
    <p class="ask-note">${I('alert')}<span>Mimitos responde con lo que cargaste. No es un veterinario: ante cualquier duda de salud, consultá con tu vete.</span></p>
    <div class="ask-log" id="askLog">${askLog()}</div>
    <p class="sr" aria-live="polite" id="askLive"></p>
    <form class="ask-form" id="askForm" novalidate>
      ${capped ? `<p class="ask-cap" role="status">${left.day <= 0 ? 'Llegaste al tope de preguntas de hoy. Mañana podés seguir preguntando.' : 'Llegaste al tope de preguntas de este mes. El mes que viene se renueva.'}</p>` : `
      <div class="ask-box"><label class="sr" for="askIn">Tu pregunta</label>
        <textarea id="askIn" rows="1" maxlength="${ASK_MAX}" placeholder="Preguntá sobre ${esc(doc.pets.length > 1 ? 'tus mascotas' : p.name)}…" aria-describedby="askCount askPriv" ${ask.pending ? 'disabled' : ''}>${esc(ask.draft)}</textarea>
        <button type="submit" class="ask-send" aria-label="Preguntar" ${ask.pending ? 'disabled' : ''}>${ASK_IC.send}</button></div>
      <p class="ask-count" id="askCount" aria-live="polite">${ask.draft.length > ASK_MAX - 80 ? `${ask.draft.length}/${ASK_MAX}` : ''}</p>`}
      <p class="ask-priv" id="askPriv">La conversación no se guarda en nuestro servidor: queda solo en esta pestaña hasta que la cierres.</p>
    </form></section>`;
}
function askScroll() { if (ask.turns.length || ask.pending) requestAnimationFrame(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })); }
/* redibuja solo la conversación (así no se pierde lo que estás escribiendo) */
function askDraw() {
  if (route.name !== 'preguntar') return;
  const log = $('#askLog');
  if (!log || Boolean($('.ask-cap')) !== Boolean(ask.left && (ask.left.day <= 0 || ask.left.month <= 0)) || Boolean($('[data-act="askNew"]')) !== Boolean(ask.turns.length)) return render();
  log.innerHTML = askLog();
  const el = $('#askIn'), sb = $('.ask-send'); if (el) el.disabled = Boolean(ask.pending); if (sb) sb.disabled = Boolean(ask.pending);
  askScroll();
}
async function askLoadLeft() { if (aiExpired()) return; try { const r = await fetch('/api/mascotas?ask=1'); if (r.ok) { ask.left = (await r.json()).left || null; askDraw(); } } catch {} }
function askOpen() { if (route.name !== 'preguntar') ask.from = route.name; go('preguntar'); }
async function askSend(q) {
  q = String(q || '').trim();
  if (!q || ask.pending) return;
  if (q.length > ASK_MAX) { ask.error = { t: `La pregunta es muy larga: hasta ${ASK_MAX} caracteres.` }; return askDraw(); }
  ask.pending = q; ask.error = null; ask.draft = '';
  const el = $('#askIn'); if (el) { el.value = ''; askGrow(el); }
  const c = $('#askCount'); if (c) c.textContent = '';
  askDraw();
  const live = $('#askLive'); if (live) live.textContent = 'Pensando…';
  const history = ask.turns.slice(-ASK_TURNS).map(t => ({ q: t.q, a: t.a }));
  let tz = ''; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch {}
  let r = null, d = null;
  try { r = await fetch('/api/mascotas?ask=1', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: q, petId: curPet()?.id || '', history, tz }) }); d = await r.json().catch(() => null); } catch { r = null; }
  ask.pending = '';
  if (r && r.ok && d && typeof d.answer === 'string') {
    ask.turns.push({ q, a: d.answer, cites: d.citations || [], medical: Boolean(d.medical), trimmed: Boolean(d.trimmed) });
    ask.left = d.left || ask.left; askSave();
    askDraw();
    if ($('#askLive')) $('#askLive').textContent = 'Mimitos respondió: ' + d.answer.replace(/\[r:[a-z0-9]+\]/g, '');
    const f = $('#askIn'); if (f && !matchMedia('(pointer:coarse)').matches) f.focus({ preventScroll: true });
    return;
  }
  const e = d?.error || '';
  if (e === 'ai_expired') { markExpired(d.expiredAt); ask.draft = q; return render(); }
  if (e === 'ai_paused') { ask.error = { t: 'Mimitos no puede responder ahora.', d: d?.message || 'Probá más tarde; todo lo demás funciona.' }; ask.draft = q; askDraw(); if ($('#askLive')) $('#askLive').textContent = ask.error.t + ' ' + ask.error.d; return; }
  if (e === 'limite_reintentos') { ask.error = { t: 'Hubo demasiados reintentos fallidos hoy.', d: 'Probá de nuevo mañana. Tus datos están bien.' }; ask.draft = q; askDraw(); if ($('#askLive')) $('#askLive').textContent = ask.error.t + ' ' + ask.error.d; return; }
  if (r?.status === 429 && /limite/.test(e)) { ask.left = d.left || { day: e === 'limite_diario' ? 0 : 1, month: e === 'limite_mensual' ? 0 : 1, perDay: d.limit, perMonth: d.limit }; ask.error = null; ask.draft = q; return render(); }
  if (r?.status === 401) ask.error = { t: 'Se cerró tu sesión.', d: 'Entrá de nuevo para seguir preguntando.' };
  else if (r?.status === 409 && e === 'sin_mascotas') ask.error = { t: 'Primero cargá a tu mascota.' };
  else if (e === 'ia_no_configurada') ask.error = { t: 'Mimitos no está disponible en este momento.', d: 'Tus datos están bien. Probá de nuevo más tarde.' };
  else if (!r) ask.error = { t: 'No pudimos conectar.', d: 'Revisá tu conexión y reintentá.', retry: q };
  else ask.error = { t: 'No pudimos responder esta vez.', d: 'No se descontó de tus preguntas. Reintentá en un ratito.', retry: q };
  ask.draft = ask.error.retry ? '' : q;
  askDraw();
  if ($('#askLive')) $('#askLive').textContent = ask.error.t;
}
function askGrow(el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 160) + 'px'; }
/* abrir de dónde sale el dato */
function askCite(ti, id) {
  const c = ask.turns[ti]?.cites?.find(x => x.id === id); if (!c) return;
  const p = petById(c.petId); if (!p) return toast('Ese dato ya no está cargado.');
  selectPet(p.id);
  const has = (list, key) => (list || []).some(x => x.id === key);
  switch (c.section) {
    case 'rec': case 'visit': case 'study': case 'sym': case 'surg': case 'med': {
      const list = { rec: p.records, visit: p.visits, study: p.studies, sym: p.symptoms, surg: p.surgeries, med: p.meds }[c.section];
      return has(list, c.itemId) ? detail(p, c.section, c.itemId) : toast('Ese dato ya no está cargado.');
    }
    case 'weight': { const w = p.weights.find(x => x.date === c.itemId); return w ? panel(`Peso de ${p.name}`, `<dl class="dl"><div><dt>Fecha</dt><dd>${fmt(w.date, { day: 'numeric', month: 'long', year: 'numeric' })}</dd></div><div><dt>Peso</dt><dd>${kg(w.kg)}</dd></div></dl><div class="d-acts"><button class="btn soft wide" data-askgo="datos">Ver sus datos</button></div>`) : toast('Ese peso ya no está cargado.'); }
    case 'expense': { const x = p.expenses.find(e => e.id === c.itemId); if (!x) return toast('Ese gasto ya no está cargado.'); ui.gastos.ym = x.date.slice(0, 7); ui.gastos.pet = p.id; return go('gastos'); }
    case 'gastos': ui.gastos.ym = String(c.itemId).slice(0, 7); ui.gastos.pet = p.id; return go('gastos');
    case 'antecedentes': return go('antecedentes');
    case 'datos': return go('datos');
    case 'qr': return sharePanel(p);
    default: return go('inicio');
  }
}
/* el panel del peso citado vive fuera de #app: su botón se resuelve acá */
$('#pBody').addEventListener('click', e => { const b = e.target.closest('[data-askgo]'); if (b) { dPanel.close(); go(b.dataset.askgo); } });
app.addEventListener('submit', e => { if (e.target.id !== 'askForm') return; e.preventDefault(); askSend($('#askIn')?.value); });
app.addEventListener('input', e => {
  if (e.target.id !== 'askIn') return;
  ask.draft = e.target.value; askGrow(e.target);
  const c = $('#askCount'); if (c) c.textContent = ask.draft.length > ASK_MAX - 80 ? `${ask.draft.length}/${ASK_MAX}` : '';
});
app.addEventListener('keydown', e => { if (e.target.id === 'askIn' && e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); askSend(e.target.value); } });

/* ---------- acciones ---------- */
document.addEventListener('click', e => {
  const fx = e.target.closest('[data-fix]'); if (fx && scan && app.contains(fx)) return fixScanItem(+fx.dataset.fix);
  /* la barra de arriba (escritorio) también tiene acciones: elegir mascota, + Agregar y Cargar algo */
  const b = e.target.closest('[data-act]'); if (!b || (!app.contains(b) && !nav.contains(b) && !topBar.contains(b))) return;
  const cur = curPet();
  const p = b.dataset.pet ? petById(b.dataset.pet) : cur;
  switch (b.dataset.act) {
    case 'retry': mode = 'loading'; render(); return boot();
    case 'newPet': return startOnboard();
    case 'bulkStudies': return startBulk(cur);
    case 'bulkSave': return saveBulk();
    case 'bulkBack': { const g = bulk?.source === 'mail' ? bulk.prov : ''; bulk = null; return go(g || 'libreta'); }
    case 'mailPick': return mailPickPanel();
    case 'bulkRetry': return retryItem(+b.dataset.i);
    case 'mailOpen': return openMail(b.dataset.p, b.dataset.mode || 'new');
    case 'mailConnect': return mailConnect(b.dataset.p);
    case 'mailRange': gm = { ...(gm?.p === b.dataset.p ? gm : {}), p: b.dataset.p, phase: gm?.phase || 'intro', range: b.dataset.v }; b.parentNode.querySelectorAll('.tile').forEach(t => t.setAttribute('aria-pressed', String(t === b))); return;
    case 'mailAll': { const all = gmFiles(); const on = all.some(k => !gm.sel.has(k)); gm.sel = new Set(on ? all : []); return render(); }
    case 'mailImport': return mailImport(gm.p, [...gm.sel].map(k => gmFile(k)).filter(Boolean));
    case 'mailQueue': return mailImport(gm.p, mstat[gm.p].queue.map(x => ({ m: x.m, part: x.part, name: x.name, type: x.type })));
    case 'mailMore': return mailSearch(gm.p, gm.mode, gm.more);
    case 'mailOff': return mailOffPanel(b.dataset.p);
    case 'mailRangeGo': return mailSearch(route.name, 'all', null, b.dataset.v);
    case 'srcAdd': { const v = ($('#srcIn')?.value || '').trim(); if (v.length < 3) { $('#srcIn')?.focus(); return toast('Escribí el nombre o el mail (3 letras o más).'); } return sendersPost({ add: v }); }
    case 'srcRm': return sendersPost({ remove: b.dataset.v });
    case 'petsMore': return petsPanel();
    case 'pick': selectPet(b.dataset.id); if (TAB_OF[route.name] === 'inicio') return go('inicio'); return render();
    case 'go': return go(b.dataset.to);
    case 'askGo': return askOpen();
    case 'askBack': return go(ask.from && ask.from !== 'preguntar' ? ask.from : 'inicio');
    case 'askNew': ask.turns = []; ask.error = null; ask.pending = ''; askStore.clear(); render(); return $('#askIn')?.focus();
    case 'askEx': return askSend(b.dataset.q);
    case 'askRetry': { const q = ask.error?.retry; ask.error = null; return askSend(q); }
    case 'askCite': return askCite(+b.dataset.t, b.dataset.c);
    case 'goPet': selectPet(b.dataset.pet); return go(b.dataset.to);
    case 'relogin': return relogin();
    case 'renewAsk': return renewAsk();
    case 'add': return cur ? addPanel(cur) : startOnboard();
    case 'scan': return startScan(petById(scan?.petId) || cur);
    case 'scanSave': return saveScan();
    case 'scanBack': scan = null; return go('inicio');
    case 'detail': return detail(cur, b.dataset.kind, b.dataset.id);
    case 'detailOf': return detail(p, b.dataset.kind, b.dataset.id);
    case 'hfilter': ui.hist.type = b.dataset.f; b.parentNode.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-pressed', String(c === b))); $('#histList').innerHTML = historyList(cur); return;
    case 'hclear': ui.hist = { type: 'todo', year: '', q: '' }; return render();
    case 'libsec': ui.lib.jump = ui.lib.secFirst?.[b.dataset.sec] ?? ({ vac: 2, des: 3 }[b.dataset.sec] || 0); return go('libreta');
    case 'lsec': return bookGo(ui.lib.secFirst[b.dataset.sec]);
    case 'lprev': return bookGo(bookIdx - (matchMedia('(min-width:1024px)').matches ? 2 : 1));
    case 'lnext': return bookGo(bookIdx + (matchMedia('(min-width:1024px)').matches ? 2 : 1));
    case 'lgo': return bookGo(+b.dataset.i);
    case 'lclear': ui.lib.q = ''; ui.lib.year = ''; return render();
    case 'newVac': return recForm(cur);
    case 'newAnti': return recForm(cur, null, { type: 'desparasitacion', name: '', scope: 'interna' });
    case 'newVisit': return visitForm(cur);
    case 'print': $('#print').innerHTML = libretaDoc(cur); return window.print();
    case 'editPet': return petForm(cur);
    case 'editPetId': return petForm(petById(b.dataset.id));
    case 'newCond': return conditionForm(cur);
    case 'editCond': return conditionForm(cur, cur.conditions.find(c => c.id === b.dataset.id));
    case 'newSurg': return surgeryForm(cur);
    case 'newWeight': return weightForm(cur);
    case 'editWeight': return weightForm(cur, cur.weights.find(w => w.date === b.dataset.date));
    case 'editMed': return medForm(cur, cur.meds.find(m => m.id === b.dataset.med));
    case 'give': { const m = p.meds.find(x => x.id === b.dataset.med); const l = { id: uid(), at: new Date().toISOString(), kind: 'med', medId: m.id, by: 'Vos', note: '' }; p.log.push(l); changed(); return toast(`Listo: ${m.name} dada.`, { label: 'Deshacer', fn: () => { drop(p.log, l); changed(); } }); }
    case 'newExp': return expenseForm(ui.gastos.pet !== 'all' ? petById(ui.gastos.pet) || cur : cur);
    case 'editExp': return expenseForm(p, p.expenses.find(x => x.id === b.dataset.exp));
    case 'gpet': ui.gastos.pet = b.dataset.id; return render();
    case 'gmonth': ui.gastos.ym = ymAdd(ui.gastos.ym, +b.dataset.n); return render();
    case 'amonth': ui.agenda.ym = ymAdd(ui.agenda.ym, +b.dataset.n); return render();
    case 'aday': ui.agenda.sel = b.dataset.d; return render();
    case 'food': return foodForm(p);
    case 'newBag': return bagSheet(p);
    case 'fund': return fundForm(p);
    case 'fundAdd': p.fund.saved = (p.fund.saved || 0) + (p.fund.monthly || 0); changed(); return toast('Sumado al ahorro.', { label: 'Deshacer', fn: () => { p.fund.saved -= p.fund.monthly || 0; changed(); } });
    case 'trip': return tripForm(cur);
    case 'vet': return vetForm(cur);
    case 'share': return sharePanel(cur);
    case 'sitter': return sitterPanel(cur);
    case 'lost': return lostPanel(cur);
    case 'suggest': return suggestPanel(cur);
    case 'export': return exportCopy();
    case 'logout': return logout();
    case 'aOn': return enablePush();
    case 'aOff': return disablePush();
    case 'aTest': return notifyPost({ test: true }).then(() => toast('Mandado. Llega en unos segundos.')).catch(() => toast('No se pudo mandar.'));
    case 'renew': { const r = p?.records.find(x => x.id === b.dataset.rec); return r ? renewSheet(p, r) : null; }
    case 'icsRec': { const r = p.records.find(x => x.id === b.dataset.rec); return calendar([Z.recordEvent(p, r)], `${p.name} ${r.name}`); }
    case 'icsFood': return calendar([Z.foodEvent(p, p.food)], `${p.name} alimento`);
    case 'icsAll': return calendar(doc.pets.flatMap(q => [...Z.upcoming(q).filter(x => x.s.days >= 0).map(x => Z.recordEvent(q, x.r)), Z.foodEvent(q, q.food), ...q.meds.filter(m => m.start && Z.medState(m, q.log).state !== 'ended').map(m => Z.medEvent(q, m))]), 'Mimitos fechas');
  }
});

/* ---------- arranque ---------- */
async function boot() {
  let d = null, st = 0;
  try { const r = await fetch('/api/mascotas', { credentials: 'same-origin' }); st = r.status; d = await r.json().catch(() => null); } catch { st = 0; }
  if (st === 200 && d && d.doc) {
    mode = 'full'; purchase = d.purchase || null; me.email = d.email || ''; aiq = d.ai || null; renewAsked = Boolean(d.renew); sitterLinks = d.sitterLinks && typeof d.sitterLinks === 'object' ? d.sitterLinks : {}; mailAllowed = d.mail && typeof d.mail === 'object' ? Boolean(d.mail.allowed) : null;
    adopt(d.doc); setSave(doc.pets.length ? 'Guardado' : ''); scans = d.scans || [];
    curId = petById(store.get('pet'))?.id || doc.pets[0]?.id || '';
    fetch('/api/mascotas?notify=1').then(r => r.json()).then(x => {
      if (!x || !('devices' in x)) return;
      notify = x; render();
      /* quien activó los avisos antes de que guardáramos la zona (o cambió de país): la actualizamos sin hacer ruido */
      if ((x.devices || x.mail) && localTz() && x.tz !== localTz()) notifyPost({}).catch(() => {});
    }).catch(() => {});
    loadMail();
    if (route.name === 'preguntar') askLoadLeft();
    fetch('/api/me').then(r => r.ok ? r.json() : null).then(x => { if (x?.name) { me.name = x.name; if (route.name === 'cuenta' || !doc.pets.length) render(); else if (mode === 'full') drawTop(BARE.includes(route.name)); } }).catch(() => {});
  } else if (st === 402 && d?.error === 'no_purchase') { mode = 'nopurchase'; me.email = d.email || ''; }
  else if (st === 401 || st === 403) mode = 'guest';
  else mode = 'error';
  render();
}
/* el aviso tocado con la app abierta: el service worker manda a qué hoja ir */
try {
  navigator.serviceWorker?.addEventListener('message', e => {
    if (e.data?.type !== 'mimitos:open') return;
    const u = new URL(e.data.url, location.origin);
    if (u.origin === location.origin && u.hash.startsWith('#/renovar/')) location.hash = u.hash;
  });
  navigator.serviceWorker?.startMessages?.();
} catch {}
route = parseHash();
render();
boot();
})();
