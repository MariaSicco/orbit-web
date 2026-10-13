/* Libreta de tu Mascota · app de la dueña o el dueño. Necesita mascotas-core.js (window.MZ). */
(() => {
'use strict';
const Z = window.MZ;
const { esc, fmt, pd, iso, isoLocal, money, TYPE, EXP } = Z;
const $ = s => document.querySelector(s);
const app = $('#app');
const uid = () => Math.random().toString(16).slice(2, 10) + Date.now().toString(16).slice(-4);
const ICAL = '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="3" y="4.5" width="14" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M3 8.5h14M7 3v3M13 3v3M10 10.5v4M8 12.5h4" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';
const SUGGEST = {
  perro: { vacuna: ['Antirrábica', 'Séxtuple', 'Óctuple', 'Tos de las perreras'], desparasitacion: ['Pipeta antipulgas', 'Comprimido antipulgas', 'Collar antipulgas', 'Antiparasitario interno'], control: ['Control anual', 'Control de peso', 'Análisis de sangre'] },
  gato: { vacuna: ['Antirrábica', 'Triple felina', 'Leucemia felina'], desparasitacion: ['Pipeta antipulgas', 'Antiparasitario interno'], control: ['Control anual', 'Control de peso', 'Análisis de sangre'] },
  otra: { vacuna: [], desparasitacion: ['Antiparasitario'], control: ['Control anual'] },
};

/* ---------- estado ---------- */
let mode = 'loading', doc = { pets: [] }, rev = 0, view = { name: 'home' }, cta = '';
const blankPet = () => ({ id: uid(), name: '', species: 'perro', speciesOther: '', breed: '', sex: '', birth: '', color: '', marks: '', temper: '', chip: '', weight: null, allergies: '', photo: '', photos: [], notes: '',
  contact: { show: false, name: '', phone: '', note: '' }, vet: { name: '', phone: '', address: '', er: '', erPhone: '' }, lost: { on: false, since: '', place: '', note: '' },
  share: '', sitterToken: '', sitter: { name: '', from: '', to: '', food: '', walks: '', where: '', habits: '', emergency: '', key: '', vetAuth: false, contact: '' },
  food: { brand: '', bagKg: null, dailyG: null, opened: '' }, fund: { goal: null, monthly: null, saved: null }, trip: { dest: '', date: '' },
  records: [], meds: [], expenses: [], symptoms: [], log: [] });
const norm = p => { const b = blankPet(); for (const k in b) if (p[k] == null) p[k] = b[k]; else if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k])) p[k] = { ...b[k], ...p[k] }; return p; };

function demoDoc() {
  const t = Z.today(), d = n => { const x = new Date(t); x.setDate(x.getDate() + n); return iso(x); };
  const at = (n, h) => { const x = new Date(t); x.setDate(x.getDate() + n); x.setHours(h, 0, 0, 0); return x; };
  const lola = Object.assign(blankPet(), { id: 'demo1', name: 'Lola', species: 'perro', breed: 'Mestiza', sex: 'h', birth: d(-1500), color: 'Negra con pecho blanco', marks: 'Oreja izquierda caída', temper: 'Buena, pero se asusta con los autos', weight: 14.2, allergies: 'Pollo',
    contact: { show: true, name: 'Majo', phone: '+54 9 362 000-0000', note: '' }, vet: { name: 'Veterinaria San Martín', phone: '+54 9 362 111-1111', address: 'San Martín 450', er: 'Guardia 24 h Centro', erPhone: '+54 9 362 222-2222' },
    sitter: { name: 'Caro', from: d(20), to: d(27), food: '200 g a la mañana y 200 g a la noche. El alimento está en el placard de la cocina.', walks: '2 paseos: 8 y 19 h. Siempre con correa.', where: 'Correa y bolsitas en la entrada. Transportadora en el lavadero.', habits: 'Si llueve no quiere salir. Le tiene miedo a los cohetes.', emergency: 'Llamá a la veterinaria. Si no atienden, guardia 24 h.', key: 'Otra llave: la vecina del 2B, Marta.', vetAuth: true, contact: 'Majo +54 9 362 000-0000' },
    food: { brand: 'Balanceado adulto 15 kg', bagKg: 15, dailyG: 400, opened: d(-33) }, fund: { goal: 400000, monthly: 20000, saved: 140000 }, trip: { dest: 'uruguay', date: d(75) },
    records: [
      { id: 'r1', type: 'vacuna', name: 'Antirrábica', date: d(-350), next: d(15), vet: 'Veterinaria San Martín', notes: '' },
      { id: 'r2', type: 'desparasitacion', name: 'Pipeta antipulgas', date: d(-33), next: d(-3), vet: '', notes: '' },
      { id: 'r3', type: 'vacuna', name: 'Séxtuple', date: d(-200), next: d(165), vet: 'Veterinaria San Martín', notes: '' },
      { id: 'r4', type: 'control', name: 'Control anual', date: d(-120), next: d(245), vet: '', notes: 'Todo bien.' } ],
    meds: [{ id: 'm1', name: 'Antiinflamatorio', dose: '1/2 comprimido', every: 12, start: isoLocal(at(-2, 8)), days: 5, notes: 'Con comida' }],
    expenses: [
      { id: 'e1', date: d(-33), cat: 'alimento', amount: 38000, note: 'Bolsa 15 kg' }, { id: 'e2', date: d(-33), cat: 'salud', amount: 15000, note: 'Pipeta' },
      { id: 'e3', date: d(-20), cat: 'veterinaria', amount: 34000, note: 'Consulta' }, { id: 'e4', date: d(-10), cat: 'peluqueria', amount: 40000, note: 'Baño y corte' },
      { id: 'e5', date: d(-64), cat: 'alimento', amount: 36000, note: '' } ],
    symptoms: [{ id: 's1', date: d(-3), text: 'Se rasca mucho la oreja izquierda.' }],
    log: [{ id: 'l1', at: at(-1, 20).toISOString(), kind: 'med', medId: 'm1', by: 'Majo', note: '' }, { id: 'l2', at: at(0, 8).toISOString(), kind: 'comida', medId: '', by: 'Majo', note: '' }] });
  const michi = Object.assign(blankPet(), { id: 'demo2', name: 'Michi', species: 'gato', breed: 'Común europeo', sex: 'm', birth: d(-730), color: 'Atigrado', weight: 4.6,
    records: [{ id: 'r5', type: 'vacuna', name: 'Triple felina', date: d(-358), next: d(6), vet: '', notes: '' }] });
  return { pets: [lola, michi] };
}

/* ---------- guardado ---------- */
const saveEl = $('#save');
let saveTimer = null, saving = false, pending = false, dirty = false;
const setSave = (t, err) => { saveEl.textContent = t; saveEl.classList.toggle('err', Boolean(err)); };
function changed() {
  render();
  if (mode !== 'full') return;
  dirty = true; setSave('Guardando…');
  clearTimeout(saveTimer); saveTimer = setTimeout(flush, 600);
}
async function flush() {
  saveTimer = null;
  if (saving) { pending = true; return; }
  saving = true;
  try {
    const r = await fetch('/api/mascotas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ doc, rev }) });
    const d = await r.json().catch(() => ({}));
    if (r.status === 409 && d.doc) { adopt(d.doc); dirty = false; render(); toast('Había cambios desde otro dispositivo. Revisá lo último que cargaste.'); setSave('Guardado'); }
    else if (r.status === 401) { setSave('Entrá de nuevo para guardar', true); saveEl.onclick = () => location.href = '/acceso?next=mascotas'; }
    else if (!r.ok) throw new Error(d.error || r.status);
    else { rev = d.doc.rev; dirty = false; setSave('Guardado'); }
  } catch {
    setSave('No se guardó · reintentar', true);
    saveEl.onclick = () => { saveEl.onclick = null; flush(); };
  } finally {
    saving = false;
    if (pending) { pending = false; flush(); }
  }
}
async function flushNow() { if (saveTimer) { clearTimeout(saveTimer); await flush(); } while (saving) await new Promise(r => setTimeout(r, 100)); }
function adopt(d) { doc = d; doc.pets = (doc.pets || []).map(norm); rev = d.rev || 0; }
window.addEventListener('beforeunload', e => { if (mode === 'full' && dirty) { e.preventDefault(); e.returnValue = ''; } });
/* lo que anota el cuidador aparece al volver a la app */
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible' || mode !== 'full' || dirty || saving) return;
  try { const r = await fetch('/api/mascotas'); const d = await r.json(); if (r.ok && d.doc && !dirty) { adopt(d.doc); render(); } } catch {}
});

/* ---------- utilidades ---------- */
function toast(t) { const el = $('#toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('on'), 3000); }
const avatar = (p, big) => `<div class="av${big ? ' big' : ''}">${p.photo ? `<img src="${esc(p.photo)}" alt="">` : esc((p.name || '?').slice(0, 1))}</div>`;
const petById = id => doc.pets.find(p => p.id === id);
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
async function uploadPhoto(data) {
  if (mode !== 'full') return data;
  const r = await fetch('/api/mascotas?photo=1', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data }) });
  const d = await r.json(); if (!r.ok || !d.u) throw new Error('upload'); return d.u;
}
const needFull = () => { if (mode === 'full') return false; toast('En la demo esto no se guarda. Conseguí la libreta para usarlo.'); return true; };

/* ---------- formulario genérico ---------- */
const dForm = $('#dForm'), dPanel = $('#dPanel');
document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));
document.querySelectorAll('dialog').forEach(d => d.addEventListener('click', e => { if (e.target === d) d.close(); }));
/* al cerrar se vacía: así los campos de un formulario no chocan con los de otro */
dForm.addEventListener('close', () => { $('#fBody').innerHTML = ''; });
dPanel.addEventListener('close', () => { $('#pBody').innerHTML = ''; });
let form = null;
function field(f, v) {
  const id = 'f_' + f.k, val = v ?? '';
  const lab = `<label for="${id}">${esc(f.label)}</label>`, hint = f.hint ? `<small>${esc(f.hint)}</small>` : '';
  switch (f.type) {
    case 'textarea': return `<div class="f">${lab}<textarea id="${id}" maxlength="${f.max || 300}" placeholder="${esc(f.ph || '')}">${esc(val)}</textarea>${hint}</div>`;
    case 'select': return `<div class="f">${lab}<select id="${id}">${f.options.map(([o, l]) => `<option value="${esc(o)}"${String(o) === String(val) ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>${hint}</div>`;
    case 'chips': return `<div class="f"><span class="lb" id="${id}_l">${esc(f.label)}</span><div class="chips" role="group" aria-labelledby="${id}_l" id="${id}" data-chips>${f.options.map(([o, l]) => `<button type="button" class="chip" data-v="${esc(o)}" aria-pressed="${String(o) === String(val)}">${esc(l)}</button>`).join('')}</div>${hint}</div>`;
    case 'check': return `<label class="toggle"><input type="checkbox" id="${id}"${val ? ' checked' : ''}><span><b>${esc(f.label)}</b>${f.hint ? `<br><small class="dim">${esc(f.hint)}</small>` : ''}</span></label>`;
    case 'photo': return `<div class="photo-pick"><div class="av big" id="${id}_prev">${val ? `<img src="${esc(val)}" alt="">` : ''}</div><div class="f"><label class="btn ghost sm" for="${id}">${val ? 'Cambiar foto' : 'Elegir foto'}</label><input id="${id}" type="file" accept="image/*" hidden>${hint}</div></div>`;
    case 'datalist': return `<div class="f">${lab}<input id="${id}" list="${id}_dl" maxlength="${f.max || 80}" value="${esc(val)}" placeholder="${esc(f.ph || '')}"><datalist id="${id}_dl">${(f.options || []).map(o => `<option value="${esc(o)}">`).join('')}</datalist>${hint}</div>`;
    default: {
      const t = f.type === 'datetime' ? 'datetime-local' : f.type || 'text';
      const extra = f.type === 'number' ? ' inputmode="decimal"' : '';
      return `<div class="f">${lab}<input id="${id}" type="${t === 'number' ? 'text' : t}"${extra} maxlength="${f.max || 120}" value="${esc(val)}" placeholder="${esc(f.ph || '')}">${f.quick ? `<div class="chips">${f.quick.map(([d, l]) => `<button type="button" class="chip" data-quick="${id}" data-d="${d}">${l}</button>`).join('')}</div>` : ''}${hint}</div>`;
    }
  }
}
function openForm(o) {
  form = { ...o, photo: undefined };
  $('#dFormT').textContent = o.title;
  $('#fBody').innerHTML = (o.intro ? `<p class="note">${o.intro}</p>` : '') + o.fields.map(f => Array.isArray(f) ? `<div class="two">${f.map(x => field(x, o.values?.[x.k])).join('')}</div>` : field(f, o.values?.[f.k])).join('');
  $('#fSave').textContent = o.saveLabel || 'Guardar';
  $('#fDel').hidden = !o.onDelete; $('#fDel').textContent = o.deleteLabel || 'Borrar'; $('#fDel').dataset.sure = '';
  $('#fErr').hidden = true;
  dForm.showModal();
  const first = $('#fBody input:not([type=file]),#fBody textarea'); if (first && !o.values) first.focus();
}
$('#fBody').addEventListener('click', e => {
  const c = e.target.closest('[data-chips] .chip');
  if (c) { c.parentNode.querySelectorAll('.chip').forEach(x => x.setAttribute('aria-pressed', String(x === c))); form.onChip?.(c.parentNode.id.slice(2), c.dataset.v); return; }
  const q = e.target.closest('[data-quick]');
  if (q) form.onQuick?.(q.dataset.quick.slice(2), q.dataset.d);
});
$('#fBody').addEventListener('change', async e => {
  if (e.target.type !== 'file') return;
  const f = e.target.files[0]; if (!f) return;
  try { form.photo = await shrink(f, 640, .82); $(`#${e.target.id}_prev`).innerHTML = `<img src="${form.photo}" alt="">`; } catch { toast('No pudimos leer esa foto. Probá con otra.'); }
  e.target.value = '';
});
function readForm() {
  const out = {};
  for (const f of form.fields.flat()) {
    const el = $('#f_' + f.k); if (!el) continue;
    out[f.k] = f.type === 'chips' ? (el.querySelector('[aria-pressed="true"]')?.dataset.v || '') : f.type === 'check' ? el.checked : f.type === 'photo' ? form.photo : el.value.trim();
  }
  return out;
}
$('#fForm').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = $('#fSave'); btn.disabled = true;
  try {
    const err = await form.onSave(readForm());
    if (err) { $('#fErr').textContent = err; $('#fErr').hidden = false; return; }
    dForm.close(); changed();
  } finally { btn.disabled = false; }
});
$('#fDel').addEventListener('click', () => {
  const b = $('#fDel');
  if (b.dataset.sure !== '1') { b.dataset.sure = '1'; b.textContent = form.confirm || 'Tocá de nuevo para borrar'; setTimeout(() => { if (b.dataset.sure === '1') { b.dataset.sure = ''; b.textContent = form.deleteLabel || 'Borrar'; } }, 4000); return; }
  form.onDelete(); dForm.close(); changed();
});
const setVal = (k, v) => { const el = $('#f_' + k); if (el) el.value = v; };
const numOrNull = v => { if (v === '' || v == null) return null; const n = parseFloat(String(v).replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) && n >= 0 ? n : NaN; };
const numDec = v => { if (v === '' || v == null) return null; const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) && n >= 0 ? n : NaN; };

/* ---------- formularios concretos ---------- */
function petForm(p) {
  openForm({
    title: p ? 'Datos de ' + p.name : 'Nueva mascota',
    values: p ? { ...p, weight: p.weight ? String(p.weight).replace('.', ',') : '' } : { species: 'perro' },
    fields: [
      { k: 'photo', type: 'photo', hint: 'Una foto clara de frente. Se usa en la ficha y en el cartel si se pierde.' },
      { k: 'name', label: 'Nombre', max: 60 },
      { k: 'species', label: 'Especie', type: 'chips', options: [['perro', 'Perro'], ['gato', 'Gato'], ['otra', 'Otra']] },
      { k: 'speciesOther', label: '¿Qué especie?', ph: 'Conejo, hurón, loro…', max: 40 },
      [{ k: 'breed', label: 'Raza', ph: 'Mestizo', max: 60 }, { k: 'sex', label: 'Sexo', type: 'select', options: [['', '—'], ['h', 'Hembra'], ['m', 'Macho']] }],
      [{ k: 'birth', label: 'Nacimiento', type: 'date', hint: 'Aproximado sirve.' }, { k: 'weight', label: 'Peso (kg)', type: 'number', ph: '12,5' }],
      [{ k: 'color', label: 'Color', max: 80 }, { k: 'chip', label: 'Microchip', max: 40 }],
      { k: 'marks', label: 'Señas particulares', ph: 'Mancha blanca en el pecho, oreja caída…', max: 200, hint: 'Ayudan a reconocerla si se pierde.' },
      { k: 'temper', label: 'Carácter', ph: 'Miedosa con extraños, se escapa si abren la puerta…', max: 200 },
      { k: 'allergies', label: 'Alergias o cuidados especiales', max: 300 },
      { k: 'notes', label: 'Notas privadas', type: 'textarea', max: 600, ph: 'Solo las ves vos.' },
    ],
    onChip: (k, v) => { if (k === 'species') $('#f_speciesOther').closest('.f').hidden = v !== 'otra'; },
    onDelete: p ? () => { doc.pets = doc.pets.filter(x => x !== p); view = { name: 'home' }; toast('Mascota borrada.'); } : null,
    deleteLabel: 'Borrar mascota', confirm: p ? `Tocá de nuevo para borrar a ${p.name} y todo su historial` : '',
    async onSave(v) {
      if (!v.name) return 'Poné el nombre de tu mascota.';
      const w = numDec(v.weight); if (Number.isNaN(w)) return 'El peso tiene que ser un número, por ejemplo 12,5.';
      const pet = p || blankPet();
      Object.assign(pet, { name: v.name, species: v.species || 'perro', speciesOther: v.speciesOther, breed: v.breed, sex: v.sex, birth: v.birth, weight: w, color: v.color, chip: v.chip, marks: v.marks, temper: v.temper, allergies: v.allergies, notes: v.notes });
      if (v.photo) { try { pet.photo = await uploadPhoto(v.photo); } catch { toast('La foto no se pudo subir. El resto quedó guardado.'); } }
      if (!p) { doc.pets.push(pet); view = { name: 'pet', id: pet.id, tab: 'salud' }; window.scrollTo(0, 0); }
    },
  });
  $('#f_speciesOther').closest('.f').hidden = (p?.species || 'perro') !== 'otra';
}
function recForm(p, r, preset) {
  const t = r?.type || preset?.type || 'vacuna';
  const sugg = ty => (SUGGEST[p.species] || SUGGEST.otra)[ty] || [];
  openForm({
    title: r ? 'Editar registro' : `Nuevo registro · ${p.name}`,
    values: r || { type: t, name: preset?.name || '', date: iso(Z.today()), vet: p.vet?.name || '' },
    fields: [
      { k: 'type', label: 'Tipo', type: 'chips', options: [['vacuna', 'Vacuna'], ['desparasitacion', 'Antiparasitario'], ['control', 'Control'], ['otro', 'Otro']] },
      { k: 'name', label: 'Nombre', type: 'datalist', options: sugg(t), ph: 'Antirrábica', hint: 'Como figura en la libreta del veterinario.' },
      [{ k: 'date', label: 'Se hizo el', type: 'date' }, { k: 'next', label: 'Próxima fecha', type: 'date', quick: [['1', '1 mes'], ['3', '3 meses'], ['6', '6 meses'], ['12', '1 año']], hint: 'La que te indicó tu veterinario.' }],
      { k: 'vet', label: 'Veterinaria o profesional', max: 80 },
      { k: 'notes', label: 'Notas', type: 'textarea', max: 300, ph: 'Marca, lote, observaciones' },
    ],
    onChip: (k, v) => { if (k === 'type') $('#f_name_dl').innerHTML = sugg(v).map(o => `<option value="${esc(o)}">`).join(''); },
    onQuick: (k, m) => { const base = pd($('#f_date').value) || Z.today(); const d = new Date(base); d.setMonth(d.getMonth() + +m); setVal('next', iso(d)); },
    onDelete: r ? () => { p.records = p.records.filter(x => x !== r); toast('Registro borrado.'); } : null,
    onSave(v) {
      if (!v.name) return 'Poné qué se hizo, por ejemplo "Antirrábica".';
      if (!v.date && !v.next) return 'Cargá al menos una fecha.';
      if (v.date && v.next && v.next < v.date) return 'La próxima fecha no puede ser anterior a la que se hizo.';
      const rec = r || { id: uid() };
      Object.assign(rec, { type: v.type || 'otro', name: v.name, date: v.date, next: v.next, vet: v.vet, notes: v.notes });
      if (!r) p.records.push(rec);
      toast(v.next ? `Listo. Te mostramos "${v.name}" cuando se acerque.` : 'Registro guardado.');
    },
  });
}
function medForm(p, m) {
  const now = new Date(); now.setMinutes(0, 0, 0);
  openForm({
    title: m ? 'Editar medicación' : `Medicación · ${p.name}`,
    intro: 'Cargá lo que te recetó el veterinario. La app te muestra cuándo toca y quién se la dio.',
    values: m ? { ...m, every: String(m.every), days: m.days ? String(m.days) : '' } : { every: '24', start: isoLocal(now) },
    fields: [
      { k: 'name', label: 'Medicamento', max: 80, ph: 'Antibiótico, gotas para los oídos…' },
      { k: 'dose', label: 'Dosis', max: 80, ph: '1 comprimido, 5 gotas…' },
      { k: 'every', label: 'Cada cuánto', type: 'chips', options: [['8', '8 h'], ['12', '12 h'], ['24', '1 vez por día'], ['168', '1 vez por semana'], ['720', '1 vez por mes']] },
      [{ k: 'start', label: 'Primera toma', type: 'datetime' }, { k: 'days', label: 'Durante (días)', type: 'number', ph: 'Vacío = sin fin' }],
      { k: 'notes', label: 'Indicaciones', max: 200, ph: 'Con comida, en ayunas…' },
    ],
    onDelete: m ? () => { p.meds = p.meds.filter(x => x !== m); toast('Medicación borrada.'); } : null,
    onSave(v) {
      if (!v.name) return 'Poné el nombre del medicamento.';
      if (!v.start) return 'Poné cuándo es la primera toma.';
      const days = v.days ? parseInt(v.days, 10) : 0; if (v.days && !(days > 0)) return 'Los días tienen que ser un número, por ejemplo 7.';
      const med = m || { id: uid() };
      Object.assign(med, { name: v.name, dose: v.dose, every: parseInt(v.every, 10) || 24, start: v.start, days, notes: v.notes });
      if (!m) p.meds.push(med);
      toast('Medicación guardada. Sumala al calendario para que te avise en cada toma.');
    },
  });
}
function expenseForm(p, x) {
  openForm({
    title: x ? 'Editar gasto' : 'Nuevo gasto',
    values: x ? { ...x, amount: String(x.amount) } : { date: iso(Z.today()), cat: 'alimento' },
    fields: [
      { k: 'cat', label: 'En qué', type: 'chips', options: Object.entries(EXP) },
      [{ k: 'amount', label: 'Monto ($)', type: 'number', ph: '38000' }, { k: 'date', label: 'Fecha', type: 'date' }],
      { k: 'note', label: 'Detalle', max: 120, ph: 'Bolsa 15 kg, consulta…' },
    ],
    onDelete: x ? () => { p.expenses = p.expenses.filter(e => e !== x); } : null,
    onSave(v) {
      const a = numOrNull(v.amount); if (!(a > 0)) return 'Poné el monto, por ejemplo 38000.';
      if (!v.date) return 'Poné la fecha.';
      const e = x || { id: uid() }; Object.assign(e, { cat: v.cat || 'otros', amount: a, date: v.date, note: v.note });
      if (!x) p.expenses.push(e);
    },
  });
}
function foodForm(p) {
  openForm({
    title: 'Alimento', intro: 'Con esto calculamos cuándo se termina la bolsa y te avisamos para comprar a tiempo.',
    values: { ...p.food, bagKg: p.food.bagKg ? String(p.food.bagKg).replace('.', ',') : '', dailyG: p.food.dailyG ? String(p.food.dailyG) : '', opened: p.food.opened || iso(Z.today()) },
    fields: [{ k: 'brand', label: 'Qué alimento', max: 80, ph: 'Marca y variedad' }, [{ k: 'bagKg', label: 'Bolsa (kg)', type: 'number', ph: '15' }, { k: 'dailyG', label: 'Come por día (g)', type: 'number', ph: '400' }], { k: 'opened', label: 'Abriste la bolsa el', type: 'date' }],
    onSave(v) {
      const kg = numDec(v.bagKg), g = numDec(v.dailyG);
      if (!(kg > 0)) return 'Poné cuántos kilos trae la bolsa.'; if (!(g > 0)) return 'Poné cuántos gramos come por día.'; if (!v.opened) return 'Poné cuándo abriste la bolsa.';
      p.food = { brand: v.brand, bagKg: kg, dailyG: g, opened: v.opened };
    },
  });
}
function fundForm(p) {
  openForm({
    title: 'Fondo para imprevistos', intro: 'Una cirugía puede costar entre $300.000 y $450.000 (La Nación, abril 2026). Separar un poco por mes evita el susto.',
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
    title: 'Veterinaria y emergencias', values: p.vet,
    fields: [{ k: 'name', label: 'Tu veterinaria', max: 80 }, [{ k: 'phone', label: 'Teléfono', type: 'tel', max: 40 }, { k: 'address', label: 'Dirección', max: 120 }], { k: 'er', label: 'Guardia 24 horas', max: 120, hint: 'La más cercana que atiende de noche y los fines de semana.' }, { k: 'erPhone', label: 'Teléfono de la guardia', type: 'tel', max: 40 }],
    onSave(v) { p.vet = v; },
  });
}
function symptomForm(p, s) {
  openForm({
    title: s ? 'Editar síntoma' : 'Anotar algo que notaste', intro: 'Anotalo con fecha para contárselo al veterinario. La app no diagnostica.',
    values: s || { date: iso(Z.today()) },
    fields: [{ k: 'date', label: 'Fecha', type: 'date' }, { k: 'text', label: 'Qué notaste', type: 'textarea', max: 300, ph: 'Vomitó dos veces, no quiere comer, se rasca…' }],
    onDelete: s ? () => { p.symptoms = p.symptoms.filter(x => x !== s); } : null,
    onSave(v) { if (!v.text) return 'Escribí qué notaste.'; const x = s || { id: uid() }; Object.assign(x, v); if (!s) p.symptoms.push(x); },
  });
}
function tripForm(p) {
  openForm({
    title: 'Viaje al exterior', values: p.trip,
    fields: [{ k: 'dest', label: 'Destino', type: 'select', options: [['', 'Elegí'], ...Object.entries(Z.DEST)] }, { k: 'date', label: 'Fecha de salida', type: 'date' }],
    onDelete: p.trip.dest ? () => { p.trip = { dest: '', date: '' }; } : null, deleteLabel: 'Quitar viaje',
    onSave(v) { if (!v.dest) return 'Elegí el destino.'; if (!v.date) return 'Poné la fecha de salida.'; p.trip = v; },
  });
}

/* ---------- vistas ---------- */
function render() {
  if (mode === 'loading') { app.innerHTML = '<p class="dim">Cargando…</p>'; return; }
  const p = view.name === 'pet' && petById(view.id);
  if (p) return renderPet(p);
  view = { name: 'home' }; renderHome();
}
function dueRow(pet, r, s, showPet) {
  return `<div class="row x4 ${s.c}"><span class="dot" aria-hidden="true"></span>
    <span class="what"><b>${esc(r.name || TYPE[r.type])}</b><small>${showPet ? esc(pet.name) + ' · ' : ''}${TYPE[r.type]}</small></span>
    <span class="when">${s.t}</span>
    <button class="ibtn" data-act="icsRec" data-pet="${pet.id}" data-rec="${r.id}" aria-label="Agregar ${esc(r.name)} al calendario">${ICAL}</button></div>`;
}
function medRow(p, m, compact) {
  const s = Z.medState(m, p.log);
  const tx = { soon: ['st-ok', `Empieza ${Z.fmtWhen(s.next)}`], ok: ['st-done', s.next ? `Dada ✓ · próxima ${Z.fmtWhen(s.next)}` : 'Dada ✓ · última toma'], due: ['st-soon', `Toca ahora (${Z.fmtTime(s.due)})`], late: ['st-late', `Atrasada: tocaba ${Z.fmtWhen(s.due)}`], ended: ['', 'Tratamiento terminado'], nostart: ['', 'Sin fecha de inicio'] }[s.state];
  const who = s.last ? ` · última: ${Z.fmtWhen(new Date(s.last.at))} (${esc(s.last.by || '')})` : '';
  const can = s.state === 'due' || s.state === 'late';
  return `<div class="row x4 ${tx[0]}"><span class="dot" aria-hidden="true"></span>
    <span class="what"><b>${compact ? esc(p.name) + ': ' : ''}${esc(m.name)}</b><small>${esc(m.dose || '')}${m.dose ? ' · ' : ''}${tx[1]}${compact ? '' : who}</small></span>
    ${can ? `<button class="ibtn go" data-act="give" data-pet="${p.id}" data-med="${m.id}">Ya se la di</button>` : '<span></span>'}
    ${compact ? '<span></span>' : `<button class="ibtn" data-act="editMed" data-med="${m.id}" aria-label="Editar ${esc(m.name)}">Editar</button>`}</div>`;
}
function renderHome() {
  if (!doc.pets.length) {
    app.innerHTML = `<section class="sec"><div class="mono dim">Libreta de tu Mascota</div><h1>Todo lo de tu mascota, <i>en un lugar</i></h1></section>
      <div class="empty"><h2>Empezá por tu mascota</h2><p>Cargá sus datos y la última vacuna o pipeta. Con eso ya te mostramos qué viene, y después sumás medicación, comida, gastos y viajes.</p><button class="btn blue" data-act="newPet">+ Agregar mascota</button></div>`;
    return;
  }
  const lost = doc.pets.filter(p => p.lost.on);
  const recs = doc.pets.flatMap(Z.upcoming).filter(x => x.s.days <= 30);
  const meds = doc.pets.flatMap(p => p.meds.map(m => ({ p, m, s: Z.medState(m, p.log) }))).filter(x => ['due', 'late', 'ok', 'soon'].includes(x.s.state));
  const foods = doc.pets.map(p => ({ p, f: Z.food(p.food) })).filter(x => x.f && x.f.left <= 7);
  const late = recs.some(x => x.s.days < 0) || meds.some(x => x.s.state === 'late');
  const any = recs.length || meds.length || foods.length;
  app.innerHTML = `
    <section class="sec"><div class="mono dim">Libreta de tu Mascota · ${Z.fmt(Z.today(), { weekday: 'long', day: 'numeric', month: 'long' })}</div>
      <h1>${lost.length ? `Buscando a <i>${esc(lost[0].name)}</i>` : late ? 'Hay cosas <i>atrasadas</i>' : any ? 'Lo que <i>viene</i>' : 'Todo <i>al día</i>'}</h1></section>
    ${lost.map(p => `<div class="banner lost"><b>${esc(p.name)} está en modo perdida.</b><span>Compartí el cartel y el link en los grupos de tu zona.</span><button class="btn sm" data-act="lost" data-pet="${p.id}">Ver cartel y pasos</button></div>`).join('')}
    ${meds.length ? `<section class="sec"><h2>Medicación</h2><div class="list">${meds.map(x => medRow(x.p, x.m, true)).join('')}</div></section>` : ''}
    <section class="sec"><div class="sec-h"><h2>Próximos 30 días</h2>${doc.pets.some(p => Z.upcoming(p).length) ? '<button class="link" data-act="icsAll">Agregar todo al calendario</button>' : ''}</div>
      ${recs.length || foods.length ? `<div class="list">${foods.map(({ p, f }) => `<div class="row x4 ${f.left < 0 ? 'st-late' : 'st-soon'}"><span class="dot"></span><span class="what"><b>Comprar alimento</b><small>${esc(p.name)} · ${esc(p.food.brand || 'Alimento')}</small></span><span class="when">${f.left < 0 ? 'Ya se terminó' : f.left === 0 ? 'Se termina hoy' : `Quedan ${f.left} días`}</span><button class="ibtn" data-act="icsFood" data-pet="${p.id}" aria-label="Aviso para comprar alimento">${ICAL}</button></div>`).join('')}${recs.map(x => dueRow(x.pet, x.r, x.s, true)).join('')}</div>`
        : '<p class="dim">Nada en los próximos 30 días. Cuando cargues una vacuna o pipeta con próxima fecha, aparece acá.</p>'}</section>
    <section class="sec"><h2>Tus mascotas</h2><div class="pets">
      ${doc.pets.map(p => { const n = Z.upcoming(p)[0]; return `<button class="pet" data-act="open" data-id="${p.id}">${avatar(p)}<span><b>${esc(p.name)}</b><small>${esc(Z.species(p))}${p.birth ? ' · ' + Z.age(p.birth) : ''}</small>${p.lost.on ? '<small style="color:var(--or);font-weight:700">Perdida</small>' : n ? `<small class="${n.s.c}"><span class="when">${esc(n.r.name)}: ${n.s.t}</span></small>` : ''}</span></button>`; }).join('')}
      <button class="pet add" data-act="newPet">+ Agregar mascota</button></div></section>`;
}

const TABS = [['salud', 'Salud'], ['meds', 'Medicación'], ['comida', 'Comida y gastos'], ['viajes', 'Viajes'], ['datos', 'Datos y veterinaria']];
function renderPet(p) {
  const tab = view.tab || 'salud';
  app.innerHTML = `
    <button class="link" data-act="home" style="align-self:flex-start">← Todas las mascotas</button>
    <section class="head">${avatar(p, true)}<div><div class="mono dim">${esc(Z.species(p))}${p.birth ? ' · ' + Z.age(p.birth) : ''}${p.weight ? ' · ' + String(p.weight).replace('.', ',') + ' kg' : ''}</div><h1>${esc(p.name)}</h1></div></section>
    ${p.lost.on ? `<div class="banner lost"><b>En modo perdida desde ${p.lost.since ? Z.fmtWhen(new Date(p.lost.since)) : 'hoy'}.</b><button class="btn sm" data-act="lost">Ver cartel y pasos</button></div>` : ''}
    ${p.allergies ? `<div class="banner info"><span class="mono">Alergias y cuidados</span><b>${esc(p.allergies)}</b></div>` : ''}
    <div class="actions">
      <button class="act" data-act="share"><b>Ficha y QR</b><small>Para el veterinario y la chapita</small></button>
      <button class="act" data-act="sitter"><b>Modo cuidador</b><small>Link con todo para quien la cuida</small></button>
      <button class="act" data-act="vetpdf"><b>Para el veterinario</b><small>Historial en PDF</small></button>
      <button class="act lost" data-act="lost"><b>${p.lost.on ? 'Está perdida' : 'Se perdió'}</b><small>Cartel y primeros pasos</small></button>
    </div>
    <nav class="tabs" role="tablist" aria-label="Secciones">${TABS.map(([k, l]) => `<button role="tab" aria-selected="${k === tab}" data-act="tab" data-tab="${k}">${l}</button>`).join('')}</nav>
    <div role="tabpanel">${({ salud: tabSalud, meds: tabMeds, comida: tabComida, viajes: tabViajes, datos: tabDatos })[tab](p)}</div>`;
}
function tabSalud(p) {
  const up = Z.upcoming(p), recs = [...p.records].sort((a, b) => (b.date || b.next || '').localeCompare(a.date || a.next || ''));
  const anti = up.find(x => x.r.type === 'desparasitacion');
  return `<div class="sec">
    <div class="chips"><button class="btn blue sm" data-act="newRec">+ Registro</button><button class="btn ghost sm" data-act="newAnti">+ Pipeta o antipulgas</button><button class="btn ghost sm" data-act="newSym">+ Algo que noté</button></div>
    ${!anti ? '<p class="note">Tip: cargá la última pipeta o antipulgas con su próxima fecha. Es el olvido más común: casi la mitad de los dueños se lo saltearon el último año (Merck Animal Health, 2025).</p>' : ''}
    <div class="sec-h"><h2>Próximas fechas</h2>${up.length ? '<button class="link" data-act="icsPet">Agregar al calendario</button>' : ''}</div>
    ${up.length ? `<div class="list">${up.map(x => dueRow(p, x.r, x.s)).join('')}</div>` : '<p class="dim">Sin próximas fechas.</p>'}
    <h2>Historial</h2>
    ${recs.length ? `<div class="list">${recs.map(r => `<div class="row"><span class="tag">${TYPE[r.type]}</span><span class="what"><b>${esc(r.name)}</b><small>${r.date ? fmt(r.date) : 'Sin fecha'}${r.vet ? ' · ' + esc(r.vet) : ''}</small></span><button class="ibtn" data-act="editRec" data-rec="${r.id}" aria-label="Editar ${esc(r.name)}">Editar</button></div>`).join('')}</div>`
      : '<div class="empty"><p>Todavía no hay registros. Abrí la libreta del veterinario y cargá la última vacuna: con eso ya te avisamos la próxima.</p></div>'}
    <h2>Lo que notaste</h2>
    ${p.symptoms.length ? `<div class="list">${[...p.symptoms].sort((a, b) => b.date.localeCompare(a.date)).map(s => `<div class="row"><span class="tag">${fmt(s.date, { day: 'numeric', month: 'short' })}</span><span class="what"><small style="color:var(--k);font-size:15px">${esc(s.text)}</small></span><button class="ibtn" data-act="editSym" data-sym="${s.id}">Editar</button></div>`).join('')}</div>`
      : '<p class="dim">Si notás algo raro (no come, vomita, se rasca), anotalo con fecha. Sale en el PDF para el veterinario.</p>'}
  </div>`;
}
function tabMeds(p) {
  const recent = [...p.log].reverse().slice(0, 12), medName = id => p.meds.find(m => m.id === id)?.name || 'Medicación';
  const kind = { comida: 'Comió', paseo: 'Paseó', med: 'Medicación', ok: 'Todo bien', nota: 'Nota' };
  return `<div class="sec">
    <div class="chips"><button class="btn blue sm" data-act="newMed">+ Medicación</button>${p.meds.length ? '<button class="btn ghost sm" data-act="icsMeds">Avisos en el calendario</button>' : ''}</div>
    ${p.meds.length ? `<div class="list">${p.meds.map(m => medRow(p, m)).join('')}</div>` : '<div class="empty"><p>Cuando el veterinario le recete algo, cargalo acá: te mostramos cuándo toca cada toma y quién se la dio, así nadie la repite ni la saltea.</p></div>'}
    <h2>Registro del día a día</h2>
    <p class="note">Lo que marcás vos y lo que marca el cuidador desde su link.</p>
    <div class="chips"><button class="btn ghost sm" data-act="log" data-kind="comida">Comió</button><button class="btn ghost sm" data-act="log" data-kind="paseo">Paseó</button></div>
    ${recent.length ? `<div class="list">${recent.map(l => `<div class="row"><span class="tag">${kind[l.kind]}</span><span class="what"><b>${l.kind === 'med' ? esc(medName(l.medId)) : l.kind === 'nota' ? esc(l.note) : kind[l.kind]}</b><small>${esc(l.by || '')}</small></span><span class="when">${Z.fmtWhen(new Date(l.at))}</span></div>`).join('')}</div>` : '<p class="dim">Todavía no hay anotaciones.</p>'}
  </div>`;
}
function tabComida(p) {
  const f = Z.food(p.food), now = Z.today(), ym = iso(now).slice(0, 7);
  const months = {}; for (const e of p.expenses) months[e.date.slice(0, 7)] = (months[e.date.slice(0, 7)] || 0) + e.amount;
  const keys = Object.keys(months).sort().slice(-6), last3 = Object.entries(months).filter(([k]) => k < ym).sort().slice(-3);
  const avg = last3.length ? last3.reduce((a, [, v]) => a + v, 0) / last3.length : 0;
  const year = iso(now).slice(0, 4), byCat = {}; for (const e of p.expenses) if (e.date.startsWith(year)) byCat[e.cat] = (byCat[e.cat] || 0) + e.amount;
  const maxCat = Math.max(1, ...Object.values(byCat)), fund = p.fund, pct = fund.goal ? Math.min(1, (fund.saved || 0) / fund.goal) : 0;
  const monthsLeft = fund.goal && fund.monthly ? Math.ceil(Math.max(0, fund.goal - (fund.saved || 0)) / fund.monthly) : null;
  return `<div class="sec">
    <div class="sec-h"><h2>Alimento</h2><button class="link" data-act="food">${f ? 'Editar' : 'Cargar'}</button></div>
    ${f ? `<div class="card"><div class="sec-h"><b>${esc(p.food.brand || 'Alimento')}</b><span class="mono ${f.left <= 3 ? 'dim' : ''}">${p.food.bagKg} kg · ${p.food.dailyG} g/día</span></div>
      <div class="bar" role="img" aria-label="Queda ${Math.round(f.pct * 100)}% de la bolsa"><i style="width:${Math.round(f.pct * 100)}%;background:${f.left <= 3 ? 'var(--or)' : 'var(--blue)'}"></i></div>
      <p>${f.left < 0 ? '<b>Ya se terminó la bolsa.</b> Cuando abras otra, actualizá la fecha.' : `Quedan <b>${f.left} días</b>. Se termina alrededor del ${fmt(f.end)}.`}</p>
      <div class="chips"><button class="btn ghost sm" data-act="icsFood">Aviso 3 días antes</button><button class="btn ghost sm" data-act="newBag">Abrí una bolsa nueva</button></div></div>`
      : '<div class="empty"><p>Cargá cuánto trae la bolsa y cuánto come por día: te avisamos antes de que se termine, para no salir corriendo un domingo.</p></div>'}
    <div class="sec-h"><h2>Gastos</h2><button class="btn blue sm" data-act="newExp">+ Gasto</button></div>
    <div class="stats"><div class="stat"><span>Este mes</span><b>${money(months[ym] || 0)}</b></div><div class="stat"><span>Promedio</span><b>${money(avg)}</b><small>últimos ${last3.length || 0} meses</small></div><div class="stat"><span>En ${year}</span><b>${money(Object.values(byCat).reduce((a, b) => a + b, 0))}</b></div></div>
    ${Object.keys(byCat).length ? `<div class="bars" aria-label="Gastos de ${year} por categoría">${Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([c, v]) => `<div class="bl"><span>${EXP[c]}</span><div class="bar"><i style="width:${Math.round(v / maxCat * 100)}%"></i></div><b>${money(v)}</b></div>`).join('')}</div>` : ''}
    ${p.expenses.length ? `<div class="list">${[...p.expenses].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8).map(e => `<div class="row"><span class="tag">${fmt(e.date, { day: 'numeric', month: 'short' })}</span><span class="what"><b>${money(e.amount)}</b><small>${EXP[e.cat]}${e.note ? ' · ' + esc(e.note) : ''}</small></span><button class="ibtn" data-act="editExp" data-exp="${e.id}">Editar</button></div>`).join('')}</div>` : '<p class="dim">Anotá lo que gastás en alimento, veterinaria, pipetas y peluquería para saber cuánto te sale por mes.</p>'}
    <div class="sec-h"><h2>Fondo para imprevistos</h2><button class="link" data-act="fund">${fund.goal ? 'Editar' : 'Armar'}</button></div>
    ${fund.goal ? `<div class="card"><div class="sec-h"><b>${money(fund.saved || 0)} de ${money(fund.goal)}</b><span class="mono">${Math.round(pct * 100)}%</span></div><div class="bar"><i style="width:${Math.round(pct * 100)}%"></i></div>
      <p class="dim">${pct >= 1 ? 'Meta cumplida.' : monthsLeft ? `Separando ${money(fund.monthly)} por mes, llegás en ${monthsLeft} ${monthsLeft === 1 ? 'mes' : 'meses'}.` : 'Poné cuánto separás por mes para ver cuándo llegás.'}</p>
      ${fund.monthly ? `<button class="btn ghost sm" data-act="fundAdd">Sumar ${money(fund.monthly)} de este mes</button>` : ''}</div>`
      : '<div class="empty"><p>Una cirugía puede costar entre $300.000 y $450.000. Armá una meta y separá un poco por mes.</p></div>'}
  </div>`;
}
function tabViajes(p) {
  const t = Z.trip(p);
  return `<div class="sec">
    ${t ? `<div class="sec-h"><h2>${esc(t.dest)} · ${fmt(t.date)}</h2><button class="link" data-act="trip">Cambiar</button></div>
      <p class="dim">${t.daysTo < 0 ? 'La fecha ya pasó.' : `Faltan ${t.daysTo} días.`}</p>
      <div>${t.items.map(i => `<div class="check ${i.st}"><span class="ic">${i.st === 'ok' ? '✓' : i.st === 'no' ? '!' : '•'}</span><span><b>${esc(i.t)}</b><small>${esc(i.d)}</small></span></div>`).join('')}</div>
      <p class="note">Información general según SENASA (costos a octubre de 2025: trámite normal $1.604; digital o urgente $22.731). Los requisitos cambian: confirmalos en <a href="https://www.argentina.gob.ar/senasa" target="_blank" rel="noopener">argentina.gob.ar/senasa</a> antes de viajar.</p>`
      : `<div class="empty"><h2>¿Viajás con ${esc(p.name)}?</h2><p>Poné destino y fecha y te armamos qué preparar y cuándo: antirrábica, certificado del veterinario, certificado de SENASA y lo que pide cada país.</p><button class="btn blue sm" data-act="trip">Planear un viaje</button></div>`}
  </div>`;
}
function tabDatos(p) {
  const facts = [['Especie', Z.species(p)], ['Raza', p.breed], ['Sexo', p.sex === 'h' ? 'Hembra' : p.sex === 'm' ? 'Macho' : ''], ['Nacimiento', p.birth ? fmt(p.birth) : ''], ['Peso', p.weight ? String(p.weight).replace('.', ',') + ' kg' : ''], ['Color', p.color], ['Microchip', p.chip], ['Señas', p.marks], ['Carácter', p.temper]].filter(f => f[1]);
  return `<div class="sec">
    <div class="sec-h"><h2>Datos</h2><button class="link" data-act="editPet">Editar</button></div>
    ${facts.length ? `<div class="facts">${facts.map(([k, v]) => `<div><span>${k}</span><b>${esc(v)}</b></div>`).join('')}</div>` : ''}
    <div class="sec-h"><h2>Veterinaria y emergencias</h2><button class="link" data-act="vet">${p.vet.name || p.vet.er ? 'Editar' : 'Cargar'}</button></div>
    ${p.vet.name || p.vet.er ? `<div class="list">
      ${p.vet.name ? `<div class="row"><span class="tag">Veterinaria</span><span class="what"><b>${esc(p.vet.name)}</b><small>${esc(p.vet.address)}</small></span>${p.vet.phone ? `<a class="ibtn go" href="tel:${esc(p.vet.phone.replace(/[^\d+]/g, ''))}">Llamar</a>` : '<span></span>'}</div>` : ''}
      ${p.vet.er ? `<div class="row"><span class="tag">24 h</span><span class="what"><b>${esc(p.vet.er)}</b><small>${esc(p.vet.erPhone)}</small></span>${p.vet.erPhone ? `<a class="ibtn go" href="tel:${esc(p.vet.erPhone.replace(/[^\d+]/g, ''))}">Llamar</a>` : '<span></span>'}</div>` : ''}</div>`
      : '<div class="empty"><p>Cargá tu veterinaria y una guardia 24 horas. En una emergencia no hay tiempo de buscar.</p></div>'}
    ${p.notes ? `<h2>Notas privadas</h2><p style="white-space:pre-wrap">${esc(p.notes)}</p>` : ''}
  </div>`;
}

/* ---------- paneles ---------- */
function panel(title, html) { $('#dPanelT').textContent = title; $('#pBody').innerHTML = html; if (!dPanel.open) dPanel.showModal(); }
function qrCanvas(text, size = 400) {
  const box = $('#qrScratch'); box.innerHTML = '';
  if (!window.QRCode) return null;
  new QRCode(box, { text, width: size, height: size, colorDark: '#0D0D0E', colorLight: '#FFFFFF', correctLevel: QRCode.CorrectLevel.M });
  const src = box.querySelector('canvas'); if (!src) return null;
  /* copia propia: la librería oculta su canvas cuando arma la imagen */
  const c = document.createElement('canvas'); c.width = src.width; c.height = src.height; c.getContext('2d').drawImage(src, 0, 0);
  box.innerHTML = ''; return c;
}
async function makeLink(p, kind) {
  await flushNow();
  const r = await fetch(`/api/mascotas?${kind}=1`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ petId: p.id }) });
  const d = await r.json(); if (!r.ok) throw new Error(d.error); adopt(d.doc); return petById(p.id);
}
function copyBtn(sel, url) { $(sel).onclick = async () => { try { await navigator.clipboard.writeText(url); toast('Link copiado.'); } catch { const i = $(sel).previousElementSibling; i.select(); } }; }

/* ficha + QR */
function sharePanel(p) {
  if (mode !== 'full') return panel('Ficha y QR', `<p class="note">Con la libreta completa generás un link y un QR con los datos y las vacunas de ${esc(p.name)}: para mandar al veterinario por WhatsApp o imprimir y pegar en la chapita que ya tiene.</p>${cta}`);
  const contact = `<div class="f" style="border-top:1px solid var(--b2);padding-top:14px">
    <label class="toggle"><input type="checkbox" id="cShow" ${p.contact.show ? 'checked' : ''}><span><b>Mostrar mi contacto</b><br><small class="dim">Para quien la encuentre si se pierde. En modo perdida se muestra siempre.</small></span></label>
    <div class="two"><div class="f"><label for="cName">Tu nombre</label><input id="cName" maxlength="60" value="${esc(p.contact.name)}"></div><div class="f"><label for="cPhone">Teléfono</label><input id="cPhone" type="tel" maxlength="40" value="${esc(p.contact.phone)}"></div></div></div>`;
  if (!p.share) {
    panel('Ficha y QR', `<p class="note">Quien abra el link ve los datos, las vacunas y los controles de ${esc(p.name)}. No ve tus notas, gastos ni medicación.</p><button class="btn blue wide" id="mk">Crear link y QR</button>${contact}`);
    $('#mk').onclick = async () => { $('#mk').disabled = true; try { sharePanel(await makeLink(p, 'share')); render(); } catch { toast('No pudimos crear el link. Probá de nuevo.'); $('#mk').disabled = false; } };
  } else {
    const url = `${location.origin}/mascota/${p.share}`;
    panel('Ficha y QR', `<div class="qr" id="qrBox" aria-label="QR de la ficha de ${esc(p.name)}"></div>
      <div class="linkbox"><input readonly value="${esc(url)}" aria-label="Link de la ficha"><button class="btn sm" id="cp" type="button">Copiar</button></div>
      <div class="chips"><a class="btn blue sm" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(`Ficha de ${p.name}: ${url}`)}">WhatsApp</a><button class="btn ghost sm" id="tag" type="button">QR para la chapita</button><a class="btn ghost sm" href="${esc(url)}" target="_blank" rel="noopener">Ver ficha</a></div>
      <p class="note">"QR para la chapita" baja una imagen con el QR y el nombre. Imprimila en papel autoadhesivo o llevala a cualquier grabado: no hace falta comprar nada especial.</p>
      ${contact}<button class="link danger" id="off" type="button">Apagar link</button>`);
    const c = qrCanvas(url); if (c) $('#qrBox').appendChild(c); else $('#qrBox').textContent = 'No se pudo dibujar el QR. Usá el link.';
    copyBtn('#cp', url);
    $('#tag').onclick = () => tagImage(p, url);
    $('#off').onclick = async () => {
      const b = $('#off'); if (b.dataset.sure !== '1') { b.dataset.sure = '1'; b.textContent = 'Tocá de nuevo: el link y el QR dejan de funcionar'; return; }
      try { sharePanel(await makeLink(p, 'unshare')); render(); toast('Link apagado.'); } catch { toast('No pudimos apagar el link.'); }
    };
  }
  const upd = () => { p.contact = { ...p.contact, show: $('#cShow').checked, name: $('#cName').value.trim(), phone: $('#cPhone').value.trim() }; changed(); };
  ['#cShow', '#cName', '#cPhone'].forEach(s => $(s).addEventListener('change', upd));
}
function tagImage(p, url) {
  const q = qrCanvas(url, 600); if (!q) return toast('No se pudo dibujar el QR.');
  const c = document.createElement('canvas'); c.width = 700; c.height = 860; const x = c.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, 700, 860); x.drawImage(q, 50, 50, 600, 600);
  x.fillStyle = '#0D0D0E'; x.textAlign = 'center'; x.font = '900 64px "Inter Tight", system-ui, sans-serif'; x.fillText(p.name.toUpperCase(), 350, 740);
  x.font = '600 34px "Inter Tight", system-ui, sans-serif'; x.fillStyle = '#5F5D58'; x.fillText('Escaneame si me encontrás', 350, 800);
  const a = document.createElement('a'); a.href = c.toDataURL('image/png'); a.download = `QR-${p.name}.png`; a.click();
}

/* modo cuidador */
function sitterPanel(p) {
  const s = p.sitter;
  const fields = [
    [{ k: 'name', label: 'Quién la cuida', max: 60, ph: 'Caro' }, { k: 'contact', label: 'Tu contacto mientras no estás', max: 120 }],
    [{ k: 'from', label: 'Desde', type: 'date' }, { k: 'to', label: 'Hasta', type: 'date' }],
    { k: 'food', label: 'Comida', type: 'textarea', max: 400, ph: 'Cuánto, a qué hora y dónde está el alimento.' },
    { k: 'walks', label: 'Paseos y salidas', type: 'textarea', max: 300, ph: 'Horarios, si va con correa, si se puede soltar.' },
    { k: 'where', label: 'Dónde está cada cosa', type: 'textarea', max: 300, ph: 'Correa, bolsitas, transportadora, remedios.' },
    { k: 'habits', label: 'Mañas y miedos', type: 'textarea', max: 400, ph: 'Se escapa si abren la puerta, le tiene miedo a los cohetes…' },
    { k: 'key', label: 'Llave de respaldo', max: 200, ph: 'Quién tiene otra llave por si se queda afuera.' },
    { k: 'emergency', label: 'Si pasa algo', type: 'textarea', max: 400, ph: 'A quién llamar primero y qué hacer.' },
    { k: 'vetAuth', label: 'Avisé a la veterinaria que puede atenderla en mi nombre', type: 'check', hint: 'Es lo que más se olvida: sin ese aviso, en una emergencia pueden no atenderla si no te ubican.' },
  ];
  const link = p.sitterToken ? `${location.origin}/cuida/${p.sitterToken}` : '';
  panel('Modo cuidador', `<p class="note">Completalo una vez. El cuidador abre un link con todo esto, la medicación con sus horarios y la veterinaria, y marca cada día si comió, paseó y le dio los remedios. Vos lo ves en "Medicación".</p>
    <div class="fbody">${fields.map(f => Array.isArray(f) ? `<div class="two">${f.map(x => field(x, s[x.k])).join('')}</div>` : field(f, s[f.k])).join('')}</div>
    <button class="btn blue wide" id="sSave">${link ? 'Guardar cambios' : mode === 'full' ? 'Guardar y crear link' : 'Guardar'}</button>
    ${link ? `<div class="linkbox"><input readonly value="${esc(link)}" aria-label="Link del cuidador"><button class="btn sm" id="sCp" type="button">Copiar</button></div>
      <a class="btn ghost wide" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(`Todo lo de ${p.name} mientras no estoy: ${link}`)}">Mandar por WhatsApp</a>
      <button class="link danger" id="sOff" type="button">Apagar link</button>` : ''}`);
  $('#sSave').onclick = async () => {
    const v = {}; for (const f of fields.flat()) { const el = $('#f_' + f.k); v[f.k] = f.type === 'check' ? el.checked : el.value.trim(); }
    if (v.from && v.to && v.to < v.from) return toast('La fecha "hasta" no puede ser anterior a "desde".');
    p.sitter = v; changed();
    if (mode !== 'full') return toast('Guardado en la demo. Con la libreta completa se genera el link.');
    if (!p.sitterToken) { try { sitterPanel(await makeLink(p, 'sitter')); toast('Link creado. Mandáselo a quien la cuida.'); } catch { toast('No pudimos crear el link. Probá de nuevo.'); } }
    else toast('Guardado. El cuidador ve los cambios al recargar.');
  };
  if (link) {
    copyBtn('#sCp', link);
    $('#sOff').onclick = async () => { const b = $('#sOff'); if (b.dataset.sure !== '1') { b.dataset.sure = '1'; b.textContent = 'Tocá de nuevo: el cuidador deja de ver la información'; return; } try { sitterPanel(await makeLink(p, 'unsitter')); toast('Link apagado.'); } catch { toast('No pudimos apagar el link.'); } };
  }
}

/* modo perdida */
function lostPanel(p) {
  if (!p.lost.on) {
    panel(`Se perdió ${p.name}`, `<p class="note">Las primeras 24 a 48 horas son las más importantes. Completá esto y te armamos el cartel para los grupos de tu zona.</p>
      <div class="fbody">${field({ k: 'place', label: 'Dónde se vio por última vez', max: 160, ph: 'Plaza San Martín, esquina Güemes' }, p.lost.place)}
      ${field({ k: 'since', label: 'Cuándo', type: 'datetime' }, p.lost.since ? p.lost.since.slice(0, 16) : isoLocal(new Date()))}
      ${field({ k: 'phone', label: 'Teléfono para el cartel', type: 'tel', max: 40 }, p.contact.phone)}
      ${field({ k: 'note', label: 'Algo más para el cartel', max: 300, ph: 'Tiene collar rojo. Responde a su nombre.' }, p.lost.note)}</div>
      <button class="btn orange wide" id="lOn">Activar modo perdida</button>`);
    $('#lOn').onclick = async () => {
      const phone = $('#f_phone').value.trim();
      if (!phone) return toast('Poné un teléfono para que te puedan llamar.');
      p.contact.phone = phone;
      p.lost = { on: true, place: $('#f_place').value.trim(), since: $('#f_since').value || isoLocal(new Date()), note: $('#f_note').value.trim() };
      changed();
      if (mode === 'full' && !p.share) { try { p = await makeLink(p, 'share'); render(); } catch {} }
      lostPanel(petById(p.id) || p);
    };
    return;
  }
  const url = p.share ? `${location.origin}/mascota/${p.share}` : '';
  panel(`Buscando a ${p.name}`, `
    <canvas id="poster" class="preview" width="1080" height="1350" aria-label="Cartel de búsqueda de ${esc(p.name)}"></canvas>
    <div class="chips"><button class="btn orange sm" id="pShare">Compartir cartel</button><button class="btn ghost sm" id="pDl">Descargar</button>${url ? `<a class="btn ghost sm" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(`Se perdió ${p.name}. Si la ves, avisame: ${url}`)}">Link por WhatsApp</a>` : ''}</div>
    ${!p.photo ? '<p class="note">Sumá una foto clara en "Datos": el cartel con foto se reconoce mucho más rápido.</p>' : ''}
    <h3>Primeras horas</h3>
    <ol class="steps"><li>Buscá en tu casa y alrededores: debajo de autos, garajes, patios y arbustos.</li><li>Dejá su cama o una prenda con tu olor, agua y comida en la puerta.</li><li>Avisá a vecinos, veterinarias y refugios de la zona.</li><li>Publicá el cartel en los grupos de tu barrio y en tus redes.</li><li>Recorré la zona temprano a la mañana y al atardecer, cuando hay menos ruido.</li><li>Si la ves, no la persigas: agachate y llamala con calma.</li></ol>
    ${url ? '<p class="note">Mientras esté en modo perdida, la ficha del QR muestra "Estoy perdida" y tu teléfono.</p>' : ''}
    <button class="btn wide" id="lOff">¡Apareció! Desactivar modo perdida</button>`);
  drawPoster(p, url).then(() => {
    const cv = $('#poster');
    $('#pDl').onclick = () => { const a = document.createElement('a'); a.href = cv.toDataURL('image/png'); a.download = `Se-busca-${p.name}.png`; a.click(); };
    $('#pShare').onclick = () => cv.toBlob(async b => {
      const file = new File([b], `Se-busca-${p.name}.png`, { type: 'image/png' });
      try { if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], text: `Se perdió ${p.name}${url ? '. ' + url : ''}` }); else $('#pDl').click(); } catch {}
    }, 'image/png');
  });
  $('#lOff').onclick = () => { p.lost = { on: false, since: '', place: '', note: '' }; dPanel.close(); changed(); toast(`¡Qué alegría! ${p.name} volvió a casa.`); };
}
function loadImg(src) { return new Promise(ok => { if (!src) return ok(null); const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src; }); }
function wrap(x, text, X, Y, maxW, lh, maxLines) {
  const words = String(text).split(/\s+/); let line = '', n = 0;
  for (const w of words) { const t = line ? line + ' ' + w : w; if (x.measureText(t).width > maxW && line) { x.fillText(line, X, Y + n * lh); line = w; if (++n >= maxLines - 1) break; } else line = t; }
  if (line) x.fillText(line, X, Y + n * lh); return Y + (n + 1) * lh;
}
async function drawPoster(p, url) {
  try { await document.fonts.ready; } catch {}
  const c = $('#poster'), x = c.getContext('2d'), W = 1080, H = 1350, F = '"Inter Tight", system-ui, sans-serif';
  x.fillStyle = '#F2EFE8'; x.fillRect(0, 0, W, H);
  x.fillStyle = '#FF4F2E'; x.fillRect(0, 0, W, 210);
  x.fillStyle = '#fff'; x.font = `900 150px ${F}`; x.textBaseline = 'middle'; x.fillText('SE BUSCA', 60, 112);
  const img = await loadImg(p.photo);
  const py = 240, ph = 560;
  if (img) { const s = Math.max(W / img.width, ph / img.height), w = img.width * s, h = img.height * s; x.save(); x.beginPath(); x.rect(0, py, W, ph); x.clip(); x.drawImage(img, (W - w) / 2, py + (ph - h) / 2, w, h); x.restore(); }
  else { x.fillStyle = '#0D0D0E'; x.fillRect(0, py, W, ph); x.fillStyle = '#F2EFE8'; x.font = `900 300px ${F}`; x.textAlign = 'center'; x.fillText(p.name.slice(0, 1).toUpperCase(), W / 2, py + ph / 2); x.textAlign = 'left'; }
  x.textBaseline = 'alphabetic'; x.fillStyle = '#0D0D0E';
  x.font = `900 96px ${F}`; x.fillText(p.name.toUpperCase(), 60, 905);
  x.font = `500 34px ${F}`; x.fillStyle = '#242426';
  let y = wrap(x, [Z.species(p), p.breed, p.color, p.marks].filter(Boolean).join(' · '), 60, 958, W - 120, 44, 2);
  x.font = `700 34px ${F}`; x.fillStyle = '#0D0D0E';
  y = wrap(x, `Se perdió ${p.lost.since ? Z.fmtWhen(new Date(p.lost.since)) : ''}${p.lost.place ? ' · ' + p.lost.place : ''}`, 60, y + 8, W - 380, 44, 2);
  if (p.lost.note || p.temper) { x.font = `500 30px ${F}`; x.fillStyle = '#5F5D58'; y = wrap(x, [p.lost.note, p.temper].filter(Boolean).join('. '), 60, y + 4, W - 380, 40, 2); }
  x.fillStyle = '#0D0D0E'; x.fillRect(0, 1180, W, 170);
  x.fillStyle = '#D9FF45'; x.font = `600 30px ${F}`; x.fillText('NO LA PERSIGAS. LLAMÁ A:', 60, 1235);
  x.fillStyle = '#fff'; x.font = `900 64px ${F}`; x.fillText(p.contact.phone || '', 60, 1310);
  if (url) { const q = qrCanvas(url, 240); if (q) { x.fillStyle = '#fff'; x.fillRect(W - 290, 960, 240, 240); x.drawImage(q, W - 280, 970, 220, 220); } }
}

/* PDF para el veterinario: una página para imprimir o guardar como PDF */
function vetPdf(p) {
  const recs = [...p.records].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const syms = [...p.symptoms].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 20);
  const meds = p.meds.map(m => ({ m, s: Z.medState(m, p.log) }));
  const td = s => `<td>${s}</td>`;
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(p.name)} · historial</title>
  <style>body{font:13px/1.45 system-ui,sans-serif;color:#0D0D0E;margin:32px;max-width:760px}h1{font-size:28px;margin:0 0 4px}h2{font-size:15px;margin:22px 0 6px;text-transform:uppercase;letter-spacing:.06em}table{width:100%;border-collapse:collapse}td,th{text-align:left;padding:6px 8px;border-bottom:1px solid #ddd;vertical-align:top}th{font-size:11px;text-transform:uppercase;color:#5F5D58}.m{color:#5F5D58}.b{background:#FFF1EC;border:1px solid #FF4F2E;padding:8px 10px;border-radius:6px;margin-top:10px}@media print{button{display:none}body{margin:12mm}}</style></head><body>
  <button onclick="print()" style="float:right;padding:10px 16px;border-radius:999px;border:0;background:#0D0D0E;color:#fff;font-weight:700;cursor:pointer">Imprimir o guardar PDF</button>
  <h1>${esc(p.name)}</h1><div class="m">${esc([Z.species(p), p.breed, p.sex === 'h' ? 'Hembra' : p.sex === 'm' ? 'Macho' : '', p.birth ? `${Z.age(p.birth)} (nac. ${fmt(p.birth)})` : '', p.weight ? String(p.weight).replace('.', ',') + ' kg' : '', p.chip ? 'Chip ' + p.chip : ''].filter(Boolean).join(' · '))}</div>
  ${p.allergies ? `<div class="b"><b>Alergias y cuidados:</b> ${esc(p.allergies)}</div>` : ''}
  <h2>Lo que notamos</h2>${syms.length ? `<table>${syms.map(s => `<tr>${td(fmt(s.date))}${td(esc(s.text))}</tr>`).join('')}</table>` : '<p class="m">Sin anotaciones.</p>'}
  <h2>Medicación</h2>${meds.length ? `<table><tr><th>Medicamento</th><th>Dosis</th><th>Frecuencia</th><th>Desde</th><th>Estado</th></tr>${meds.map(({ m, s }) => `<tr>${td(esc(m.name))}${td(esc(m.dose))}${td('cada ' + m.every + ' h')}${td(m.start ? fmt(m.start) : '')}${td(s.state === 'ended' ? 'Terminado' : 'En curso')}</tr>`).join('')}</table>` : '<p class="m">Sin medicación cargada.</p>'}
  <h2>Vacunas, antiparasitarios y controles</h2>${recs.length ? `<table><tr><th>Fecha</th><th>Tipo</th><th>Nombre</th><th>Próxima</th><th>Profesional</th></tr>${recs.map(r => `<tr>${td(r.date ? fmt(r.date) : '')}${td(TYPE[r.type])}${td(esc(r.name))}${td(r.next ? fmt(r.next) : '')}${td(esc(r.vet))}</tr>`).join('')}</table>` : '<p class="m">Sin registros.</p>'}
  ${p.food.brand ? `<h2>Alimentación</h2><p>${esc(p.food.brand)}${p.food.dailyG ? ` · ${p.food.dailyG} g por día` : ''}</p>` : ''}
  <p class="m" style="margin-top:28px">Generado el ${fmt(Z.today())} con Libreta de tu Mascota (Orbit). Datos cargados por el tutor.</p></body></html>`;
  const w = window.open('', '_blank');
  if (!w) { download(`${p.name}-historial.html`, html, 'text/html'); return toast('Se descargó el historial. Abrilo e imprimilo como PDF.'); }
  w.document.open(); w.document.write(html); w.document.close();
}

/* ---------- acciones ---------- */
app.addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const cur = view.name === 'pet' ? petById(view.id) : null;
  const p = b.dataset.pet ? petById(b.dataset.pet) : cur;
  switch (b.dataset.act) {
    case 'newPet': return petForm();
    case 'open': view = { name: 'pet', id: b.dataset.id, tab: 'salud' }; render(); return window.scrollTo(0, 0);
    case 'home': view = { name: 'home' }; render(); return window.scrollTo(0, 0);
    case 'tab': view.tab = b.dataset.tab; return render();
    case 'editPet': return petForm(cur);
    case 'newRec': return recForm(cur);
    case 'newAnti': return recForm(cur, null, { type: 'desparasitacion', name: cur.species === 'otra' ? 'Antiparasitario' : 'Pipeta antipulgas' });
    case 'editRec': return recForm(cur, cur.records.find(r => r.id === b.dataset.rec));
    case 'newSym': return symptomForm(cur);
    case 'editSym': return symptomForm(cur, cur.symptoms.find(s => s.id === b.dataset.sym));
    case 'newMed': return medForm(cur);
    case 'editMed': return medForm(cur, cur.meds.find(m => m.id === b.dataset.med));
    case 'give': { const m = p.meds.find(x => x.id === b.dataset.med); p.log.push({ id: uid(), at: new Date().toISOString(), kind: 'med', medId: m.id, by: 'Vos', note: '' }); changed(); return toast(`Listo: ${m.name} dada.`); }
    case 'log': cur.log.push({ id: uid(), at: new Date().toISOString(), kind: b.dataset.kind, medId: '', by: 'Vos', note: '' }); changed(); return toast('Anotado.');
    case 'newExp': return expenseForm(cur);
    case 'editExp': return expenseForm(cur, cur.expenses.find(x => x.id === b.dataset.exp));
    case 'food': return foodForm(cur);
    case 'newBag': cur.food.opened = iso(Z.today()); changed(); return toast('Bolsa nueva: el contador arrancó de cero.');
    case 'fund': return fundForm(cur);
    case 'fundAdd': cur.fund.saved = (cur.fund.saved || 0) + (cur.fund.monthly || 0); changed(); return toast('Sumado al fondo.');
    case 'trip': return tripForm(cur);
    case 'vet': return vetForm(cur);
    case 'share': return sharePanel(cur);
    case 'sitter': return sitterPanel(cur);
    case 'lost': return lostPanel(p);
    case 'vetpdf': return vetPdf(cur);
    case 'icsAll': return calendar(doc.pets.flatMap(x => Z.upcoming(x).filter(u => u.s.days >= 0).map(u => Z.recordEvent(x, u.r))), 'mascotas');
    case 'icsPet': return calendar(Z.upcoming(cur).filter(u => u.s.days >= 0).map(u => Z.recordEvent(cur, u.r)), cur.name);
    case 'icsRec': { const r = p.records.find(x => x.id === b.dataset.rec); return calendar([Z.recordEvent(p, r)], `${p.name} ${r.name}`); }
    case 'icsMeds': return calendar(cur.meds.filter(m => m.start && Z.medState(m, cur.log).state !== 'ended').map(m => Z.medEvent(cur, m)), `${cur.name} medicación`);
    case 'icsFood': return calendar([Z.foodEvent(p, p.food)], `${p.name} alimento`);
  }
});

/* ---------- arranque ---------- */
(async () => {
  render();
  let d = null, st = 0;
  try { const r = await fetch('/api/mascotas', { credentials: 'same-origin' }); st = r.status; d = await r.json(); } catch {}
  if (st === 200 && d.access === 'full') { mode = 'full'; adopt(d.doc || { pets: [], rev: 0 }); setSave(doc.pets.length ? 'Guardado' : ''); }
  else {
    mode = 'demo'; doc = demoDoc();
    cta = st === 200 ? '<a class="btn blue wide" href="/productos">Conseguir la libreta</a>' : '<a class="btn blue wide" href="/acceso?next=mascotas">Ya la tengo: entrar</a><a class="btn ghost wide" href="/productos">Conseguir la libreta</a>';
    $('#demoCta').innerHTML = st === 200 ? '<a href="/productos">Conseguila para guardar →</a>' : '<a href="/acceso?next=mascotas">Ya la compré: entrar →</a>';
    $('#demo').hidden = false;
  }
  render();
})();
})();
