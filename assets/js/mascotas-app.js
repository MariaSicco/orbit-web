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
  neutered: '', chronic: '', onboarded: false, conditions: [], surgeries: [], visits: [], studies: [], weights: [],
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
    neutered: 'si', onboarded: true, chronic: '',
    conditions: [{ id: 'c1', name: 'Otitis', since: '2025', status: 'controlada', notes: 'Oído izquierdo. Vuelve en verano.' }, { id: 'c2', name: 'Parvovirus', since: '2022', status: 'resuelta', notes: 'De cachorra, internada 4 días.' }],
    surgeries: [{ id: 'q1', name: 'Castración', date: '2023-03-14', notes: '' }],
    visits: [{ id: 'v1', date: d(-20), reason: 'Se rasca la oreja', vet: 'Veterinaria San Martín', findings: 'Otitis externa en el oído izquierdo.', plan: 'Gotas 2 veces por día durante 10 días. Control en 2 semanas.', weight: 14.2 }],
    studies: [{ id: 'x1', date: d(-120), kind: 'sangre', title: 'Análisis de sangre completo', notes: 'Todo dentro de lo normal según la veterinaria.', files: [] }],
    weights: [{ date: d(-400), kg: 12.8 }, { date: d(-240), kg: 13.6 }, { date: d(-120), kg: 14.0 }, { date: d(-20), kg: 14.2 }],
    log: [{ id: 'l1', at: at(-1, 20).toISOString(), kind: 'med', medId: 'm1', by: 'Majo', note: '' }, { id: 'l2', at: at(0, 8).toISOString(), kind: 'comida', medId: '', by: 'Majo', note: '' }] });
  const michi = Object.assign(blankPet(), { id: 'demo2', name: 'Michi', species: 'gato', breed: 'Común europeo', sex: 'm', birth: d(-730), color: 'Atigrado', weight: 4.6, neutered: 'si', onboarded: true,
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
const avatar = (p, big) => `<div class="av${big ? ' big' : ''}">${p.photo ? `<img src="${esc(p.photo)}" alt="">` : Z.petIcon(p)}</div>`;
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
      { k: 'neutered', label: '¿Está castrado o castrada?', type: 'chips', options: [['si', 'Sí'], ['no', 'No'], ['', 'No sé']] },
      { k: 'allergies', label: 'Alergias', max: 300, ph: 'A un alimento, a un remedio…' },
      { k: 'chronic', label: 'Remedios que toma siempre', max: 300, ph: 'Nombre y dosis' },
      { k: 'notes', label: 'Notas privadas', type: 'textarea', max: 600, ph: 'Solo las ves vos.' },
    ],
    onChip: (k, v) => { if (k === 'species') $('#f_speciesOther').closest('.f').hidden = v !== 'otra'; },
    onDelete: p ? () => { doc.pets = doc.pets.filter(x => x !== p); view = { name: 'home' }; toast('Mascota borrada.'); } : null,
    deleteLabel: 'Borrar mascota', confirm: p ? `Tocá de nuevo para borrar a ${p.name} y todo su historial` : '',
    async onSave(v) {
      if (!v.name) return 'Poné el nombre de tu mascota.';
      const w = numDec(v.weight); if (Number.isNaN(w)) return 'El peso tiene que ser un número, por ejemplo 12,5.';
      const pet = p || blankPet();
      Object.assign(pet, { name: v.name, species: v.species || 'perro', speciesOther: v.speciesOther, breed: v.breed, sex: v.sex, birth: v.birth, weight: w, color: v.color, chip: v.chip, marks: v.marks, temper: v.temper, allergies: v.allergies, neutered: v.neutered, chronic: v.chronic, notes: v.notes });
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

/* ---------- formularios de la historia clínica ---------- */
function visitForm(p, v) {
  openForm({
    title: v ? 'Consulta' : `Consulta de ${p.name}`, intro: v ? '' : 'Anotá lo que te dijo el veterinario para no olvidarte y tenerlo la próxima vez.',
    values: v ? { ...v, weight: v.weight ? String(v.weight).replace('.', ',') : '' } : { date: iso(Z.today()), vet: p.vet.name || '' },
    fields: [
      [{ k: 'date', label: 'Fecha', type: 'date' }, { k: 'weight', label: 'Peso ese día (kg)', type: 'number', ph: '14,2' }],
      { k: 'reason', label: '¿Por qué fueron?', max: 160, ph: 'Control anual, se rasca, no come…' },
      { k: 'vet', label: 'Veterinaria o profesional', max: 80 },
      { k: 'findings', label: '¿Qué te dijo el veterinario?', type: 'textarea', max: 600, ph: 'Diagnóstico o lo que encontró' },
      { k: 'plan', label: 'Indicaciones', type: 'textarea', max: 600, ph: 'Remedios, cuidados, cuándo volver' },
    ],
    onDelete: v ? () => { p.visits = p.visits.filter(x => x !== v); } : null,
    onSave(x) {
      if (!x.date) return 'Poné la fecha.';
      if (!x.reason && !x.findings) return 'Contá al menos por qué fueron o qué te dijeron.';
      const w = numDec(x.weight); if (Number.isNaN(w)) return 'El peso tiene que ser un número, por ejemplo 14,2.';
      const it = v || { id: uid() }; Object.assign(it, { date: x.date, reason: x.reason, vet: x.vet, findings: x.findings, plan: x.plan, weight: w });
      if (!v) p.visits.push(it);
      if (w) addWeight(p, x.date, w);
      toast('Consulta guardada en su historia.');
    },
  });
}
function addWeight(p, date, kg) {
  p.weights = p.weights.filter(w => w.date !== date); p.weights.push({ date, kg }); p.weights.sort((a, b) => a.date.localeCompare(b.date));
  p.weight = p.weights[p.weights.length - 1].kg;
}
function weightForm(p) {
  openForm({
    title: `Peso de ${p.name}`, values: { date: iso(Z.today()) },
    fields: [[{ k: 'kg', label: 'Peso (kg)', type: 'number', ph: '14,2' }, { k: 'date', label: 'Fecha', type: 'date' }]],
    onSave(x) { const kg = numDec(x.kg); if (!(kg > 0)) return 'Poné el peso, por ejemplo 14,2.'; if (!x.date) return 'Poné la fecha.'; addWeight(p, x.date, kg); toast('Peso guardado.'); },
  });
}
function conditionForm(p, c) {
  openForm({
    title: c ? c.name : 'Problema de salud', intro: 'Anotá lo que te dijo el veterinario. La app no diagnostica: solo lo registra para que no se pierda.',
    values: c || { status: 'activa' },
    fields: [
      { k: 'name', label: '¿Qué tuvo o tiene?', type: 'datalist', options: Z.CONDITIONS[p.species] || Z.CONDITIONS.otra, ph: 'Otitis' },
      { k: 'status', label: '¿Cómo está hoy?', type: 'chips', options: [['activa', 'Lo tiene'], ['controlada', 'Controlado'], ['resuelta', 'Ya pasó']] },
      { k: 'since', label: '¿Desde cuándo? (año)', max: 10, ph: '2024' },
      { k: 'notes', label: 'Notas', type: 'textarea', max: 300, ph: 'Tratamiento, qué lo empeora, a qué veterinario fueron' },
    ],
    onDelete: c ? () => { p.conditions = p.conditions.filter(x => x !== c); } : null,
    onSave(x) { if (!x.name) return 'Poné qué tuvo.'; const it = c || { id: uid() }; Object.assign(it, { name: x.name, status: x.status || 'activa', since: x.since, notes: x.notes }); if (!c) p.conditions.push(it); },
  });
}
function surgeryForm(p, c) {
  openForm({
    title: c ? c.name : 'Cirugía', values: c || {},
    fields: [{ k: 'name', label: '¿Qué cirugía?', type: 'datalist', options: Z.SURGERIES, ph: 'Castración' }, { k: 'date', label: 'Fecha (aproximada sirve)', type: 'date' }, { k: 'notes', label: 'Notas', type: 'textarea', max: 300 }],
    onDelete: c ? () => { p.surgeries = p.surgeries.filter(x => x !== c); } : null,
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
      { k: 'notes', label: 'Qué dijo el veterinario', type: 'textarea', max: 600, ph: 'Resultado o conclusión' },
    ],
    onDelete: st ? () => { p.studies = p.studies.filter(x => x !== st); } : null,
    onSave(x) {
      if (!x.date) return 'Poné la fecha.';
      if (!x.title && !studyFiles.length) return 'Poné un nombre o subí el archivo.';
      const it = st || { id: uid() }; Object.assign(it, { date: x.date, kind: x.kind || 'otro', title: x.title || Z.STUDY[x.kind], notes: x.notes, files: studyFiles });
      if (!st) p.studies.push(it);
      toast('Estudio guardado en su historia.');
    },
  });
  const box = document.createElement('div'); box.className = 'f';
  box.innerHTML = `<span class="lb">Archivos</span><div class="list" id="stFiles"></div><label class="btn ghost sm" for="stIn">${I('file')} Subir foto o PDF</label><input id="stIn" type="file" accept="image/*,application/pdf" multiple hidden><small id="stMsg"></small>`;
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
}
function fileUrl(f) { return f.ref.startsWith('blob:mascotas/') ? `/api/mascotas?file=${encodeURIComponent(f.ref)}` : f.ref; }
function drawFiles() {
  const box = $('#stFiles'); if (!box) return;
  box.innerHTML = studyFiles.map((f, i) => `<div class="row">${bubble(f.type === 'application/pdf' ? 'file' : 'camera', 'viaje')}<span class="what"><b>${esc(f.name)}</b></span><button type="button" class="ibtn" data-rm="${i}" aria-label="Quitar ${esc(f.name)}">${I('x')}</button></div>`).join('');
  box.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { studyFiles.splice(+b.dataset.rm, 1); drawFiles(); });
}
async function uploadStudy(file) {
  if (mode !== 'full') return { ref: URL.createObjectURL(file), name: file.name, type: file.type };
  const r = await fetch('/api/mascotas?upload=1', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: file.name, size: file.size, type: file.type || 'application/octet-stream' }) });
  const d = await r.json(); if (!r.ok) throw new Error(d.error);
  const put = await fetch(d.url, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
  if (!put.ok) throw new Error('put');
  return { ref: d.ref, name: file.name, type: file.type };
}

/* ---------- vistas ---------- */
const I = Z.icon;
const bubble = (ic, c) => `<span class="ib c-${c}">${I(ic)}</span>`;
const KIND_UI = { vacuna: ['syringe', 'salud'], anti: ['drop', 'salud'], control: ['steth', 'cuida'], consulta: ['steth', 'cuida'], estudio: ['flask', 'viaje'], sintoma: ['note', 'plata'], cirugia: ['scalpel', 'perdida'], remedio: ['pill', 'med'] };
function render() {
  if (mode === 'loading') { app.innerHTML = '<p class="dim">Cargando…</p>'; return; }
  if (view.name === 'onboard') return renderOnboard();
  if (view.name === 'scan') return renderScan();
  if (!doc.pets.length) return renderWelcome();
  let p = petById(view.id);
  if (!p) { p = doc.pets[0]; view = { name: 'pet', id: p.id }; }
  if (view.name === 'sub') return renderSub(p);
  renderPet(p);
}
function renderWelcome() {
  app.innerHTML = `<section class="welcome">
    <div class="ib big c-comida">${I('paw')}</div>
    <h1>La historia clínica de tu mascota, en el celu</h1>
    <p class="lead">Vacunas, consultas, estudios y todo lo que le pasó, en un solo lugar. Te avisamos antes de cada fecha y lo compartís con el veterinario en un toque.</p>
    <button class="btn blue wide big" data-act="newPet">${I('plus')} Agregar a mi mascota</button>
    <p class="note">Te hacemos unas preguntas cortas y, si tenés la libreta a mano, le sacás una foto y la cargamos por vos.</p>
  </section>`;
}
function switcher(p) {
  if (doc.pets.length < 2) return '';
  return `<nav class="switch" aria-label="Tus mascotas">${doc.pets.map(x => `<button class="sw${x.id === p.id ? ' on' : ''}" data-act="open" data-id="${x.id}" aria-current="${x.id === p.id}">${avatar(x)}<span>${esc(x.name)}</span></button>`).join('')}<button class="sw" data-act="newPet"><span class="av add-av">${I('plus')}</span><span>Agregar</span></button></nav>`;
}
function nextItems(p) {
  const out = [];
  for (const m of p.meds) { const s = Z.medState(m, p.log); if (s.state === 'due' || s.state === 'late') out.push({ order: s.state === 'late' ? -2 : -1, html: medRow(p, m) }); }
  for (const x of Z.upcoming(p)) if (x.s.days <= 45) out.push({ order: x.s.days, html: `<div class="row ${x.s.c}">${bubble(x.r.type === 'vacuna' ? 'syringe' : x.r.type === 'desparasitacion' ? 'drop' : 'steth', 'salud')}<span class="what"><b>${esc(x.r.name)}</b><small class="stt">${x.s.t}</small></span><button class="ibtn" data-act="icsRec" data-pet="${p.id}" data-rec="${x.r.id}" aria-label="Agregar al calendario">${I('cal')}</button></div>` });
  const f = Z.food(p.food); if (f && f.left <= 5) out.push({ order: f.left, html: `<div class="row ${f.left < 0 ? 'st-late' : 'st-soon'}">${bubble('bowl', 'comida')}<span class="what"><b>Comprar alimento</b><small class="stt">${f.left < 0 ? 'Ya se terminó' : f.left === 0 ? 'Se termina hoy' : `Quedan ${f.left} días`}</small></span><button class="ibtn" data-act="icsFood" data-pet="${p.id}" aria-label="Aviso para comprar">${I('cal')}</button></div>` });
  return out.sort((a, b) => a.order - b.order);
}
function medRow(p, m) {
  const s = Z.medState(m, p.log);
  const tx = { soon: ['st-ok', `Empieza ${Z.fmtWhen(s.next)}`], ok: ['st-done', s.next ? `Dada. Próxima: ${Z.fmtWhen(s.next)}` : 'Dada. Era la última toma'], due: ['st-soon', `Le toca ahora (${Z.fmtTime(s.due)})`], late: ['st-late', `Atrasada: tocaba ${Z.fmtWhen(s.due)}`], ended: ['', 'Tratamiento terminado'], nostart: ['', 'Falta la primera toma'] }[s.state];
  const can = s.state === 'due' || s.state === 'late';
  return `<div class="row ${tx[0]}">${bubble('pill', 'med')}<span class="what"><b>${esc(m.name)}</b><small>${m.dose ? esc(m.dose) + ' · ' : ''}<span class="stt">${tx[1]}</span></small></span>${can ? `<button class="ibtn go" data-act="give" data-pet="${p.id}" data-med="${m.id}">Ya se la di</button>` : `<button class="ibtn" data-act="editMed" data-med="${m.id}" aria-label="Editar ${esc(m.name)}">${I('edit')}</button>`}</div>`;
}
function renderPet(p) {
  const sm = Z.summary(p), next = nextItems(p).slice(0, 4);
  const meta = [Z.species(p), p.breed, Z.age(p.birth), p.weight ? String(p.weight).replace('.', ',') + ' kg' : ''].filter(Boolean).join(' · ');
  const filt = view.filter || 'todo';
  const FIL = [['todo', 'Todo'], ['vacuna', 'Vacunas'], ['consulta', 'Consultas'], ['estudio', 'Estudios'], ['sintoma', 'Síntomas'], ['remedio', 'Remedios']];
  const tl = Z.timeline(p).filter(e => filt === 'todo' || e.k === filt || (filt === 'vacuna' && (e.k === 'anti' || e.k === 'control')) || (filt === 'consulta' && e.k === 'cirugia'));
  let year = '';
  const activeMeds = p.meds.filter(m => ['ok', 'soon'].includes(Z.medState(m, p.log).state));
  const vaccTxt = { ok: ['Al día', 'ok'], late: [`Vencida: ${sm.vaccLate.map(x => x.r.name).join(', ')}`, 'late'], none: ['Sin cargar', 'none'] }[sm.vacc];
  const antiTxt = { ok: ['Al día', 'ok'], late: ['Vencido', 'late'], none: ['Sin cargar', 'none'], unknown: [`Último: ${sm.lastAnti ? fmt(sm.lastAnti.date, { day: 'numeric', month: 'short' }) : '—'}`, 'none'] }[sm.anti];
  app.innerHTML = `
    ${switcher(p)}
    <section class="pethead">
      ${avatar(p, true)}
      <div class="ph-txt"><h1>${esc(p.name)}</h1><p class="dim">${esc(meta)}</p></div>
    </section>
    ${p.lost.on ? `<div class="banner lost">${bubble('search', 'perdida')}<span style="flex:1;min-width:160px"><b>En modo perdida</b>Desde ${p.lost.since ? Z.fmtWhen(new Date(p.lost.since)) : 'hoy'}</span><button class="btn sm" data-act="lost">Ver cartel</button></div>` : ''}
    <button class="btn blue wide big" data-act="add">${I('plus')} Cargar algo de ${esc(p.name)}</button>

    ${next.length ? `<section class="sec"><h2>Pendiente</h2><div class="list">${next.map(x => x.html).join('')}</div></section>` : ''}

    <section class="sec">
      <div class="sec-h"><h2>Su salud hoy</h2><button class="link" data-act="vetpdf">${I('doc')} PDF para el veterinario</button></div>
      <div class="summary">
        <button class="sum s-${vaccTxt[1]}" data-act="filter" data-f="vacuna"><span>Vacunas</span><b>${esc(vaccTxt[0])}</b></button>
        <button class="sum s-${antiTxt[1]}" data-act="filter" data-f="vacuna"><span>Pipeta o antiparasitario</span><b>${esc(antiTxt[0])}</b></button>
        <button class="sum ${sm.active.length ? 's-warn' : 's-none'}" data-act="sub" data-sub="clinica"><span>Problemas de salud</span><b>${sm.active.length ? esc(sm.active.map(c => c.name).join(', ')) : 'Ninguno cargado'}</b></button>
        <button class="sum ${p.allergies ? 's-warn' : 's-none'}" data-act="sub" data-sub="clinica"><span>Alergias</span><b>${esc(p.allergies || 'Ninguna cargada')}</b></button>
      </div>
      <button class="row link-row" data-act="sub" data-sub="clinica">${bubble('heart', 'salud')}<span class="what"><b>Antecedentes</b><small>${esc([p.neutered === 'si' ? (p.sex === 'h' ? 'Castrada' : 'Castrado') : p.neutered === 'no' ? 'Sin castrar' : '', p.surgeries.length ? `${p.surgeries.length} cirugía${p.surgeries.length > 1 ? 's' : ''}` : '', sm.past.length ? `${sm.past.length} problema${sm.past.length > 1 ? 's' : ''} que ya pasó` : '', p.chronic ? 'Toma remedios siempre' : ''].filter(Boolean).join(' · ') || 'Enfermedades que tuvo, cirugías y remedios de siempre')}</small></span>${I('chevron')}</button>
      ${activeMeds.length ? `<div class="list">${activeMeds.map(m => medRow(p, m)).join('')}</div>` : ''}
    </section>

    <section class="sec">
      <h2>Historia clínica</h2>
      <div class="chips scroll">${FIL.map(([k, l]) => `<button class="chip" data-act="filter" data-f="${k}" aria-pressed="${k === filt}">${l}</button>`).join('')}</div>
      ${tl.length ? `<div class="timeline">${tl.map(e => { const y = e.date.slice(0, 4), head = y !== year ? `<div class="year">${y}</div>` : ''; year = y; const u = KIND_UI[e.k]; return `${head}<button class="tl" data-act="openEv" data-kind="${e.kind}" data-id="${e.ref.id}"><span class="tl-date">${fmt(e.date, { day: 'numeric', month: 'short' })}</span>${bubble(u[0], u[1])}<span class="what"><b>${esc(e.title)}</b>${e.sub ? `<small>${esc(e.sub)}</small>` : ''}</span></button>`; }).join('')}</div>`
        : `<div class="empty"><p>${filt === 'todo' ? 'Su historia empieza acá. Cargá la libreta, una consulta o un estudio y aparece en orden.' : 'Todavía no hay nada de este tipo.'}</p>${filt === 'todo' ? `<button class="btn ghost sm" data-act="scan">${I('camera')} Sacarle foto a la libreta</button>` : ''}</div>`}
    </section>

    <section class="sec">
      <h2>Más para ${esc(p.name)}</h2>
      <div class="list">
        ${[['share', 'qr', 'viaje', 'Ficha y QR', 'Para el veterinario, el paseador y la chapita'], ['sitter', 'hand', 'cuida', `Quién ${p.sex === 'm' ? 'lo' : 'la'} cuida`, `Un link con todo para quien ${p.sex === 'm' ? 'lo' : 'la'} cuida`], ['lost', 'search', 'perdida', p.lost.on ? (p.sex === 'm' ? 'Está perdido' : 'Está perdida') : 'Se perdió', 'Cartel de búsqueda y qué hacer'], ['sub:comida', 'bowl', 'comida', 'Comida y gastos', 'Cuándo se termina el alimento y cuánto gastás'], ['sub:viajes', 'plane', 'viaje', 'Viaje al exterior', 'Qué papeles necesita y cuándo'], ['sub:datos', 'doc', 'plata', 'Datos y veterinaria', 'Microchip, señas, teléfonos']].map(([a, ic, c, t, d]) => { const [act, sub] = a.split(':'); return `<button class="row link-row" data-act="${act}"${sub ? ` data-sub="${sub}"` : ''}>${bubble(ic, c)}<span class="what"><b>${t}</b><small>${d}</small></span>${I('chevron')}</button>`; }).join('')}
      </div>
    </section>`;
}

/* subpáginas */
function renderSub(p) {
  const back = `<button class="link" data-act="back" style="align-self:flex-start">${I('back')} ${esc(p.name)}</button>`;
  const body = { clinica: subClinica, comida: tabComida, viajes: tabViajes, datos: tabDatos }[view.sub] || subClinica;
  app.innerHTML = back + body(p);
}
function subClinica(p) {
  const sm = Z.summary(p);
  const cRow = c => `<button class="row link-row" data-act="editCond" data-id="${c.id}">${bubble('heart', c.status === 'resuelta' ? 'salud' : 'perdida')}<span class="what"><b>${esc(c.name)}</b><small>${{ activa: 'Lo tiene', controlada: 'Controlado', resuelta: 'Ya pasó' }[c.status]}${c.since ? ' · desde ' + esc(c.since) : ''}${c.notes ? ' · ' + esc(c.notes) : ''}</small></span>${I('chevron')}</button>`;
  return `<div class="sec">
    <h1>Antecedentes</h1>
    <p class="dim">Lo que le pasó a ${esc(p.name)} a lo largo de su vida. Es lo primero que pregunta un veterinario nuevo.</p>
    <div class="sec-h"><h2>Problemas de salud</h2><button class="link" data-act="newCond">${I('plus')} Agregar</button></div>
    ${sm.active.length ? `<div class="list">${sm.active.map(cRow).join('')}</div>` : '<p class="dim">Ninguno activo.</p>'}
    ${sm.past.length ? `<h3>Ya pasaron</h3><div class="list">${sm.past.map(cRow).join('')}</div>` : ''}
    <div class="sec-h"><h2>Cirugías</h2><button class="link" data-act="newSurg">${I('plus')} Agregar</button></div>
    ${p.surgeries.length ? `<div class="list">${p.surgeries.map(c => `<button class="row link-row" data-act="editSurg" data-id="${c.id}">${bubble('scalpel', 'perdida')}<span class="what"><b>${esc(c.name)}</b><small>${c.date ? fmt(c.date) : 'Sin fecha'}</small></span>${I('chevron')}</button>`).join('')}</div>` : '<p class="dim">Ninguna cargada.</p>'}
    <div class="sec-h"><h2>Alergias y remedios de siempre</h2><button class="link" data-act="editPet">Editar</button></div>
    <div class="facts"><div><span>Alergias</span><b>${esc(p.allergies || 'Ninguna cargada')}</b></div><div><span>Remedios que toma siempre</span><b>${esc(p.chronic || 'Ninguno')}</b></div><div><span>Castración</span><b>${p.neutered === 'si' ? 'Sí' : p.neutered === 'no' ? 'No' : 'Sin dato'}</b></div></div>
    <div class="sec-h"><h2>Peso</h2><button class="link" data-act="newWeight">${I('plus')} Anotar peso</button></div>
    ${weightChart(p)}
  </div>`;
}
function weightChart(p) {
  const w = p.weights.slice(-12);
  if (w.length < 2) return `<p class="dim">${w.length ? `Último: ${String(w[0].kg).replace('.', ',')} kg (${fmt(w[0].date)}).` : 'Anotá su peso en cada consulta para ver cómo cambia.'}</p>`;
  const W = 320, H = 120, P = 24, min = Math.min(...w.map(x => x.kg)), max = Math.max(...w.map(x => x.kg)), r = max - min || 1;
  const x = i => P + i * (W - 2 * P) / (w.length - 1), y = v => H - P - (v - min) / r * (H - 2 * P);
  const pts = w.map((d, i) => `${x(i).toFixed(1)},${y(d.kg).toFixed(1)}`).join(' ');
  return `<div class="card"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Peso de ${esc(p.name)}: de ${String(w[0].kg).replace('.', ',')} a ${String(w[w.length - 1].kg).replace('.', ',')} kg" style="width:100%;height:auto">
    <polyline points="${pts}" fill="none" stroke="var(--blue)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    ${w.map((d, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(d.kg).toFixed(1)}" r="${i === w.length - 1 ? 5 : 3}" fill="${i === w.length - 1 ? 'var(--blue)' : '#fff'}" stroke="var(--blue)" stroke-width="2"/>`).join('')}
    <text x="${x(0)}" y="${H - 4}" font-size="11" fill="var(--ink2)">${fmt(w[0].date, { month: 'short', year: '2-digit' })}</text>
    <text x="${x(w.length - 1)}" y="${H - 4}" font-size="11" fill="var(--ink2)" text-anchor="end">${fmt(w[w.length - 1].date, { month: 'short', year: '2-digit' })}</text>
    <text x="${x(w.length - 1)}" y="${y(w[w.length - 1].kg) - 10}" font-size="13" font-weight="700" fill="var(--ink)" text-anchor="end">${String(w[w.length - 1].kg).replace('.', ',')} kg</text>
  </svg></div>`;
}

/* ---------- "cargar algo" ---------- */
function addPanel(p) {
  const opt = (act, ic, c, t, d, hero) => `<button class="row link-row${hero ? ' hero-opt' : ''}" data-add="${act}">${bubble(ic, c)}<span class="what"><b>${t}</b><small>${d}</small></span>${I('chevron')}</button>`;
  panel(`¿Qué querés cargar?`, `<div class="list">
    ${opt('scan', 'camera', 'viaje', 'Foto de la libreta', 'La leemos y cargamos las vacunas por vos', true)}
    ${opt('vacuna', 'syringe', 'salud', 'Vacuna', 'Una vacuna que le pusieron')}
    ${opt('anti', 'drop', 'salud', 'Pipeta o antiparasitario', 'Antipulgas, garrapatas o parásitos internos')}
    ${opt('consulta', 'steth', 'cuida', 'Consulta al veterinario', 'Por qué fueron y qué te dijeron')}
    ${opt('estudio', 'flask', 'viaje', 'Estudio', 'Análisis, radiografía o ecografía, con su archivo')}
    ${opt('sintoma', 'note', 'plata', 'Algo que notaste', 'No come, vomita, se rasca…')}
    ${opt('remedio', 'pill', 'med', 'Remedio', 'Con horarios y aviso en cada toma')}
    ${opt('peso', 'scale', 'comida', 'Peso', 'Para ver cómo cambia')}
    ${opt('problema', 'heart', 'perdida', 'Problema de salud o cirugía', 'Algo que tuvo o tiene')}
  </div>`);
  $('#pBody').onclick = e => {
    const b = e.target.closest('[data-add]'); if (!b) return;
    dPanel.close();
    ({ scan: () => startScan(p), vacuna: () => recForm(p), anti: () => recForm(p, null, { type: 'desparasitacion', name: p.species === 'otra' ? 'Antiparasitario' : 'Pipeta antipulgas' }), consulta: () => visitForm(p), estudio: () => studyForm(p), sintoma: () => symptomForm(p), remedio: () => medForm(p), peso: () => weightForm(p), problema: () => conditionForm(p) })[b.dataset.add]();
  };
}

/* ---------- alta guiada ---------- */
let ob = null;
function startOnboard() { ob = { step: 0, pet: blankPet(), photo: null, conds: {}, otherCond: '', surg: new Set(), otherSurg: '' }; view = { name: 'onboard' }; render(); window.scrollTo(0, 0); }
const OB_STEPS = 5;
function obHead(title, sub) {
  return `<div class="ob-top"><button class="link" data-ob="back">${I('back')} ${ob.step ? 'Atrás' : 'Cancelar'}</button><span class="dim">Paso ${ob.step + 1} de ${OB_STEPS}</span></div>
    <div class="progress"><i style="width:${(ob.step + 1) / OB_STEPS * 100}%"></i></div>
    <h1>${title}</h1>${sub ? `<p class="dim">${sub}</p>` : ''}`;
}
function tiles(name, opts, val) { return `<div class="tiles" data-tiles="${name}">${opts.map(([v, l, ic]) => `<button type="button" class="tile" data-v="${v}" aria-pressed="${v === val}">${ic ? I(ic) : ''}<span>${l}</span></button>`).join('')}</div>`; }
function renderOnboard() {
  const p = ob.pet, n = esc(p.name || 'tu mascota');
  let h = '';
  if (ob.step === 0) h = obHead('¿Cómo se llama?') + `
    <div class="f"><label for="ob_name" class="sr">Nombre</label><input id="ob_name" class="big-input" maxlength="60" value="${esc(p.name)}" placeholder="Nombre" autocomplete="off"></div>
    <div class="f"><span class="lb">Es un…</span>${tiles('species', [['perro', 'Perro', 'dog'], ['gato', 'Gato', 'cat'], ['otra', 'Otro', 'paw']], p.species)}</div>
    <div class="f" ${p.species === 'otra' ? '' : 'hidden'} id="ob_otherW"><label for="ob_other">¿Qué es?</label><input id="ob_other" maxlength="40" value="${esc(p.speciesOther)}" placeholder="Conejo, hurón, loro…"></div>
    <div class="photo-pick"><div class="av big" id="ob_prev">${ob.photo ? `<img src="${ob.photo}" alt="">` : Z.petIcon(p)}</div><div class="f"><label class="btn ghost sm" for="ob_photo">${I('camera')} ${ob.photo ? 'Cambiar foto' : 'Agregar una foto'}</label><input id="ob_photo" type="file" accept="image/*" hidden><small>Opcional. Sirve para la ficha y por si algún día se pierde.</small></div></div>`;
  if (ob.step === 1) h = obHead(`Contanos de ${n}`, 'Si no sabés algo, dejalo vacío.') + `
    <div class="two"><div class="f"><label for="ob_birth">Nacimiento</label><input id="ob_birth" type="date" value="${esc(p.birth)}"><small>Aproximado sirve.</small></div><div class="f"><label for="ob_weight">Peso (kg)</label><input id="ob_weight" inputmode="decimal" value="${p.weight ? String(p.weight).replace('.', ',') : ''}" placeholder="12,5"></div></div>
    <div class="f"><span class="lb">Sexo</span>${tiles('sex', [['h', 'Hembra'], ['m', 'Macho']], p.sex)}</div>
    <div class="f"><span class="lb">¿Está castrado o castrada?</span>${tiles('neutered', [['si', 'Sí'], ['no', 'No'], ['ns', 'No sé']], p.neutered || '')}</div>
    <div class="f"><label for="ob_breed">Raza</label><input id="ob_breed" maxlength="60" value="${esc(p.breed)}" placeholder="Mestizo"></div>`;
  if (ob.step === 2) {
    const list = Z.CONDITIONS[p.species] || Z.CONDITIONS.otra;
    h = obHead(`¿${n} tuvo algún problema de salud?`, 'Marcá lo que te haya dicho un veterinario alguna vez. Después podés sumar más.') + `
      <div class="chips" data-conds>${list.map(c => `<button type="button" class="chip" data-c="${esc(c)}" aria-pressed="${Boolean(ob.conds[c])}">${esc(c)}</button>`).join('')}</div>
      <div class="f"><label for="ob_ocond">Otro</label><input id="ob_ocond" maxlength="80" value="${esc(ob.otherCond)}" placeholder="Escribilo"></div>
      ${Object.keys(ob.conds).length ? `<h3>¿Cómo está hoy?</h3><div class="list">${Object.entries(ob.conds).map(([c, st]) => `<div class="row" style="grid-template-columns:minmax(0,1fr) auto"><span class="what"><b>${esc(c)}</b></span><span class="seg" data-cst="${esc(c)}"><button type="button" data-v="activa" aria-pressed="${st === 'activa'}">Lo tiene</button><button type="button" data-v="resuelta" aria-pressed="${st === 'resuelta'}">Ya pasó</button></span></div>`).join('')}</div>` : ''}`;
  }
  if (ob.step === 3) h = obHead('Cirugías, alergias y remedios') + `
    <div class="f"><span class="lb">¿Le hicieron alguna cirugía?</span><div class="chips" data-surg>${Z.SURGERIES.map(c => `<button type="button" class="chip" data-s="${esc(c)}" aria-pressed="${ob.surg.has(c)}">${esc(c)}</button>`).join('')}</div>
      <input id="ob_osurg" maxlength="80" value="${esc(ob.otherSurg)}" placeholder="Otra cirugía"></div>
    <div class="f"><label for="ob_all">¿Tiene alguna alergia?</label><input id="ob_all" maxlength="300" value="${esc(p.allergies)}" placeholder="A un alimento, a un remedio… o dejalo vacío"></div>
    <div class="f"><label for="ob_chr">¿Toma algún remedio todos los días?</label><input id="ob_chr" maxlength="300" value="${esc(p.chronic)}" placeholder="Nombre y dosis, o dejalo vacío"></div>`;
  if (ob.step === 4) h = obHead('Ahora, su libreta', `Si tenés la libreta del veterinario a mano, sacale una foto a cada página con vacunas. Las leemos y las cargamos por vos; vos solo revisás.`) + `
    <div class="scanbox">${I('camera')}<b>Foto de la libreta</b><span>Hasta 4 páginas, con buena luz y sin reflejos</span></div>
    <label class="btn blue wide big" for="ob_scan">${I('camera')} Sacar o elegir fotos</label><input id="ob_scan" type="file" accept="image/*" multiple hidden>
    <button class="btn ghost wide" data-ob="skip">La cargo después</button>`;
  app.innerHTML = `<section class="sec onboard">${h}${ob.step < 4 ? `<button class="btn blue wide big" data-ob="next">${ob.step === 0 ? 'Empezar' : 'Siguiente'}</button>${ob.step >= 2 ? `<button class="btn ghost wide" data-ob="skipstep">${ob.step === 2 ? 'No tuvo nada' : 'Nada de esto'}</button>` : ''}` : ''}<p class="err-msg" id="obErr" role="alert" hidden></p></section>`;
  if (ob.step === 0 && !p.name) $('#ob_name')?.focus();
}
function obRead() {
  const p = ob.pet, v = id => $(id)?.value.trim() ?? '';
  if (ob.step === 0) { p.name = v('#ob_name'); p.speciesOther = v('#ob_other'); }
  if (ob.step === 1) { p.birth = v('#ob_birth'); const w = numDec(v('#ob_weight')); p.weight = Number.isNaN(w) ? p.weight : w; p.breed = v('#ob_breed'); }
  if (ob.step === 2) ob.otherCond = v('#ob_ocond');
  if (ob.step === 3) { ob.otherSurg = v('#ob_osurg'); p.allergies = v('#ob_all'); p.chronic = v('#ob_chr'); }
}
function obErr(t) { const e = $('#obErr'); e.textContent = t; e.hidden = false; }
async function obFinish(scanFiles) {
  const p = ob.pet;
  if (ob.otherCond) ob.conds[ob.otherCond] = ob.conds[ob.otherCond] || 'activa';
  p.conditions = Object.entries(ob.conds).map(([name, status]) => ({ id: uid(), name, status, since: '', notes: '' }));
  if (ob.otherSurg) ob.surg.add(ob.otherSurg);
  p.surgeries = [...ob.surg].map(name => ({ id: uid(), name, date: '', notes: '' }));
  if (ob.surg.has('Castración')) p.neutered = 'si';
  if (p.neutered === 'ns') p.neutered = '';
  if (p.weight) p.weights = [{ date: iso(Z.today()), kg: p.weight }];
  p.onboarded = true;
  if (ob.photo) { try { p.photo = await uploadPhoto(ob.photo); } catch { toast('La foto no se pudo subir. Podés agregarla después.'); } }
  doc.pets.push(p); ob = null;
  view = { name: 'pet', id: p.id };
  changed();
  if (scanFiles?.length) runScan(p, scanFiles); else { window.scrollTo(0, 0); toast(`Listo. Esta es la libreta de ${p.name}.`); }
}
app.addEventListener('click', e => {
  if (view.name !== 'onboard') return;
  const t = e.target.closest('[data-tiles] .tile');
  if (t) { const k = t.parentNode.dataset.tiles; obRead(); ob.pet[k] = t.dataset.v; render(); return; }
  const c = e.target.closest('[data-conds] .chip');
  if (c) { obRead(); const n = c.dataset.c; if (ob.conds[n]) delete ob.conds[n]; else ob.conds[n] = 'activa'; render(); return; }
  const st = e.target.closest('[data-cst] button');
  if (st) { obRead(); ob.conds[st.parentNode.dataset.cst] = st.dataset.v; render(); return; }
  const sg = e.target.closest('[data-surg] .chip');
  if (sg) { obRead(); const n = sg.dataset.s; ob.surg.has(n) ? ob.surg.delete(n) : ob.surg.add(n); render(); return; }
  const b = e.target.closest('[data-ob]'); if (!b) return;
  const a = b.dataset.ob;
  if (a === 'back') { if (!ob.step) { ob = null; view = { name: 'pet', id: doc.pets[0]?.id }; render(); return; } obRead(); ob.step--; render(); return; }
  if (a === 'skip') return obFinish();
  if (a === 'skipstep') { if (ob.step === 2) { ob.conds = {}; ob.otherCond = ''; } if (ob.step === 3) { ob.surg.clear(); ob.otherSurg = ''; } }
  else obRead();
  if (ob.step === 0 && !ob.pet.name) return obErr('Poné su nombre para seguir.');
  ob.step++; render(); window.scrollTo(0, 0);
});
app.addEventListener('change', async e => {
  if (view.name !== 'onboard') return;
  if (e.target.id === 'ob_photo') { const f = e.target.files[0]; if (!f) return; try { ob.photo = await shrink(f, 640, .82); obRead(); render(); } catch { toast('No pudimos leer esa foto.'); } }
  if (e.target.id === 'ob_scan') { const files = [...e.target.files].slice(0, 4); if (files.length) obFinish(files); }
});

/* ---------- leer la libreta ---------- */
let scan = null;
function startScan(p) {
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = true;
  inp.onchange = () => { const files = [...inp.files].slice(0, 4); if (files.length) runScan(p, files); };
  inp.click();
}
async function runScan(p, files) {
  const prev = scan?.state === 'review' && scan.petId === p.id ? scan.items : [];
  scan = { petId: p.id, state: 'reading', n: files.length, items: [], warnings: [] };
  view = { name: 'scan', id: p.id }; render(); window.scrollTo(0, 0);
  try {
    const images = []; for (const f of files) images.push(await shrink(f, 1600, .85));
    let d;
    if (mode === 'full') {
      const r = await fetch('/api/mascotas?scan=1', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ images, species: p.species }) });
      d = await r.json();
      if (!r.ok) throw Object.assign(new Error(d.error === 'limite_diario' ? 'Llegaste al límite de lecturas de hoy. Probá mañana o cargá las vacunas a mano.' : d.error === 'ia_no_configurada' || d.error === 'sin_fotos' ? 'La lectura automática no está disponible en este momento. Cargá las vacunas a mano y probá más tarde.' : 'No pudimos leer las fotos.'), { plain: d.error !== 'ia_respuesta_invalida' && d.error !== undefined && !String(d.error).startsWith('ia_error') });
    } else {
      await new Promise(r => setTimeout(r, 1800));
      const t = Z.today(), dd = n => { const x = new Date(t); x.setDate(x.getDate() + n); return iso(x); };
      d = { demo: true, items: [
        { type: 'vacuna', name: 'Antirrábica', product: 'Rabisin', date: dd(-340), next: dd(25), vet: 'Dra. Gómez MP 1234', confidence: 'alta' },
        { type: 'vacuna', name: 'Séxtuple', product: 'Vanguard Plus', date: dd(-340), next: dd(25), vet: 'Dra. Gómez MP 1234', confidence: 'alta' },
        { type: 'desparasitacion', name: 'Comprimido antipulgas', product: 'NexGard', date: dd(-40), next: '', vet: '', confidence: 'media' },
        { type: 'vacuna', name: 'Tos de las perreras', product: '', date: dd(-700), next: '', vet: '', confidence: 'baja', note: 'La fecha se lee a medias' },
      ], warnings: ['Ejemplo: así se ve lo que leemos. En la versión completa leemos tus fotos.'] };
    }
    scan = { ...scan, state: 'review', items: prev.concat(d.items.map(x => ({ ...x, keep: x.confidence !== 'baja' || Boolean(x.date) }))), warnings: d.warnings || [], demo: d.demo };
  } catch (err) { scan = { ...scan, state: 'error', msg: err.message || 'No pudimos leer las fotos.', plain: Boolean(err.plain) }; }
  render();
}
function renderScan() {
  const p = petById(scan?.petId); if (!p || !scan) { view = { name: 'pet', id: doc.pets[0]?.id }; return render(); }
  if (scan.state === 'reading') { app.innerHTML = `<section class="sec reading"><div class="ib big c-viaje spin">${I('sparkle')}</div><h1>Leyendo la libreta</h1><p class="dim">Estamos pasando ${scan.n === 1 ? 'la foto' : `las ${scan.n} fotos`} a la historia de ${esc(p.name)}. Tarda unos segundos.</p></section>`; return; }
  if (scan.state === 'error') { app.innerHTML = `<section class="sec"><h1>No pudimos leerla</h1><p class="dim">${esc(scan.msg)}${scan.plain ? '' : ' Probá con una foto con más luz, de frente y sin reflejos, o cargá las vacunas a mano.'}</p><button class="btn blue wide" data-act="scan">${I('camera')} Probar con otra foto</button><button class="btn ghost wide" data-act="back">Volver a ${esc(p.name)}</button></section>`; return; }
  const sel = scan.items.filter(x => x.keep).length;
  app.innerHTML = `<section class="sec">
    <button class="link" data-act="back" style="align-self:flex-start">${I('back')} ${esc(p.name)}</button>
    <h1>Encontramos ${scan.items.length} ${scan.items.length === 1 ? 'registro' : 'registros'}</h1>
    <p class="dim">Revisá que esté bien. Lo que tiene el borde naranja conviene mirarlo con la libreta al lado. Tocá cualquiera para corregirlo.</p>
    ${scan.warnings.map(w => `<div class="banner care${scan.demo ? ' soft' : ''}">${bubble(scan.demo ? 'sparkle' : 'alert', scan.demo ? 'viaje' : 'perdida')}<span>${esc(w)}</span></div>`).join('')}
    <div class="list">${scan.items.map((x, i) => `<div class="row scanrow${x.confidence === 'baja' ? ' doubt' : ''}" style="grid-template-columns:auto minmax(0,1fr) auto">
      <label class="checkbox"><input type="checkbox" data-keep="${i}" ${x.keep ? 'checked' : ''} aria-label="Guardar ${esc(x.name)}"></label>
      <button class="what plain" data-fix="${i}"><b>${esc(x.name || 'Sin nombre')}${x.product ? ` <span class="dim" style="font-weight:500">(${esc(x.product)})</span>` : ''}</b><small>${TYPE[x.type]} · ${x.date ? fmt(x.date) : 'sin fecha'}${x.next ? ' · próxima ' + fmt(x.next) : ''}${x.vet ? ' · ' + esc(x.vet) : ''}</small>${x.note ? `<small style="color:var(--warn)">${esc(x.note)}</small>` : ''}</button>
      ${I('edit')}</div>`).join('')}</div>
    <button class="btn blue wide big" data-act="scanSave" ${sel ? '' : 'disabled'}>Guardar ${sel} en la historia de ${esc(p.name)}</button>
    <button class="btn ghost wide" data-act="scan">${I('camera')} Agregar otra página</button>
  </section>`;
}
app.addEventListener('change', e => { const k = e.target.closest('[data-keep]'); if (k && scan) { scan.items[+k.dataset.keep].keep = k.checked; render(); } });
function fixScanItem(i) {
  const x = scan.items[i], p = petById(scan.petId);
  openForm({
    title: 'Corregir', values: x,
    fields: [{ k: 'type', label: 'Tipo', type: 'chips', options: [['vacuna', 'Vacuna'], ['desparasitacion', 'Antiparasitario'], ['control', 'Control'], ['otro', 'Otro']] }, { k: 'name', label: 'Nombre', type: 'datalist', options: (SUGGEST[p.species] || SUGGEST.otra)[x.type] || [] }, [{ k: 'date', label: 'Se aplicó', type: 'date' }, { k: 'next', label: 'Próxima', type: 'date' }], { k: 'vet', label: 'Veterinario', max: 80 }],
    onSave(v) { if (!v.name) return 'Poné el nombre.'; Object.assign(x, v, { confidence: 'alta', note: '', keep: true }); },
  });
}
function saveScan() {
  const p = petById(scan.petId), add = scan.items.filter(x => x.keep);
  for (const x of add) p.records.push({ id: uid(), type: x.type, name: x.name, date: x.date, next: x.next, vet: x.vet, notes: x.product ? `Producto: ${x.product}` : '' });
  scan = null; view = { name: 'pet', id: p.id }; changed(); window.scrollTo(0, 0);
  toast(`Listo: ${add.length} ${add.length === 1 ? 'registro cargado' : 'registros cargados'} en la historia de ${p.name}.`);
}

/* subpáginas heredadas */
function tabComida(p) {
  const f = Z.food(p.food), now = Z.today(), ym = iso(now).slice(0, 7);
  const months = {}; for (const e of p.expenses) months[e.date.slice(0, 7)] = (months[e.date.slice(0, 7)] || 0) + e.amount;
  const last3 = Object.entries(months).filter(([k]) => k < ym).sort().slice(-3);
  const avg = last3.length ? last3.reduce((a, [, v]) => a + v, 0) / last3.length : 0;
  const year = iso(now).slice(0, 4), byCat = {}; for (const e of p.expenses) if (e.date.startsWith(year)) byCat[e.cat] = (byCat[e.cat] || 0) + e.amount;
  const maxCat = Math.max(1, ...Object.values(byCat)), fund = p.fund, pct = fund.goal ? Math.min(1, (fund.saved || 0) / fund.goal) : 0;
  const monthsLeft = fund.goal && fund.monthly ? Math.ceil(Math.max(0, fund.goal - (fund.saved || 0)) / fund.monthly) : null;
  return `<div class="sec">
    <div class="sec-h"><h2>Comida</h2><button class="link" data-act="food">${f ? 'Editar' : 'Cargar'}</button></div>
    ${f ? `<div class="card c-comida"><div style="display:flex;gap:12px;align-items:center">${bubble('bowl', 'comida')}<span><b>${esc(p.food.brand || 'Alimento')}</b><small class="dim" style="display:block">${String(p.food.bagKg).replace('.', ',')} kg, come ${p.food.dailyG} g por día</small></span></div>
      <div class="bar" role="img" aria-label="Queda ${Math.round(f.pct * 100)}% de la bolsa"><i style="width:${Math.round(f.pct * 100)}%;${f.left <= 3 ? 'background:var(--perdida-i)' : ''}"></i></div>
      <p>${f.left < 0 ? '<b>Ya se terminó la bolsa.</b> Cuando abras otra, tocá "Abrí una bolsa nueva".' : `Le quedan <b>${f.left} días</b> de alimento. Se termina alrededor del ${fmt(f.end, { day: 'numeric', month: 'long' })}.`}</p>
      <div class="chips"><button class="btn ghost sm" data-act="icsFood">${I('cal')} Avisame 3 días antes</button><button class="btn ghost sm" data-act="newBag">Abrí una bolsa nueva</button></div></div>`
      : `<div class="empty">${bubble('bowl', 'comida')}<p>Cargá cuánto trae la bolsa y cuánto come por día. Te avisamos antes de que se termine, para no salir corriendo un domingo.</p></div>`}
    <div class="sec-h"><h2>Gastos</h2><button class="btn blue sm" data-act="newExp">${I('plus')} Gasto</button></div>
    <div class="stats"><div class="stat"><span>Este mes</span><b>${money(months[ym] || 0)}</b></div><div class="stat"><span>Por mes, en promedio</span><b>${money(avg)}</b></div><div class="stat"><span>En ${year}</span><b>${money(Object.values(byCat).reduce((a, b) => a + b, 0))}</b></div></div>
    ${Object.keys(byCat).length ? `<div class="bars c-plata" aria-label="Gastos de ${year} por rubro">${Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([c, v]) => `<div class="bl"><span>${EXP[c]}</span><div class="bar"><i style="width:${Math.round(v / maxCat * 100)}%"></i></div><b>${money(v)}</b></div>`).join('')}</div>` : ''}
    ${p.expenses.length ? `<div class="list">${[...p.expenses].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8).map(e => `<div class="row">${bubble('wallet', 'plata')}<span class="what"><b>${money(e.amount)}</b><small>${EXP[e.cat]}${e.note ? ', ' + esc(e.note) : ''} · ${fmt(e.date, { day: 'numeric', month: 'short' })}</small></span><button class="ibtn" data-act="editExp" data-exp="${e.id}" aria-label="Editar">${I('edit')}</button></div>`).join('')}</div>` : '<p class="dim">Anotá lo que gastás en alimento, veterinaria, pipetas y peluquería para saber cuánto te sale por mes.</p>'}
    <div class="sec-h"><h2>Ahorro para imprevistos</h2><button class="link" data-act="fund">${fund.goal ? 'Editar' : 'Armar'}</button></div>
    ${fund.goal ? `<div class="card c-salud"><div style="display:flex;gap:12px;align-items:center">${bubble('piggy', 'salud')}<span><b>${money(fund.saved || 0)} de ${money(fund.goal)}</b><small class="dim" style="display:block">${pct >= 1 ? '¡Meta cumplida!' : monthsLeft ? `Separando ${money(fund.monthly)} por mes, llegás en ${monthsLeft} ${monthsLeft === 1 ? 'mes' : 'meses'}.` : 'Poné cuánto separás por mes para ver cuándo llegás.'}</small></span></div>
      <div class="bar"><i style="width:${Math.round(pct * 100)}%"></i></div>
      ${fund.monthly ? `<button class="btn ghost sm" data-act="fundAdd">${I('plus')} Sumar ${money(fund.monthly)} de este mes</button>` : ''}</div>`
      : `<div class="empty">${bubble('piggy', 'salud')}<p>Una cirugía puede costar entre $300.000 y $450.000. Armá una meta y separá un poco por mes.</p></div>`}
  </div>`;
}
function tabViajes(p) {
  const t = Z.trip(p);
  return `<div class="sec">
    ${t ? `<div class="sec-h"><h2>${esc(t.dest)}, ${fmt(t.date, { day: 'numeric', month: 'long' })}</h2><button class="link" data-act="trip">Cambiar</button></div>
      <p class="dim">${t.daysTo < 0 ? 'La fecha ya pasó.' : `Faltan ${t.daysTo} días. Esto es lo que necesita ${esc(p.name)}:`}</p>
      <div class="list">${t.items.map(i => `<div class="check ${i.st}"><span class="ic">${I(i.st === 'ok' ? 'check' : i.st === 'no' ? 'alert' : 'plus')}</span><span><b>${esc(i.t)}</b><small>${esc(i.d)}</small></span></div>`).join('')}</div>
      <p class="note">Información general según SENASA (costos a octubre de 2025: trámite normal $1.604, digital o urgente $22.731). Los requisitos cambian: confirmalos en <a href="https://www.argentina.gob.ar/senasa" target="_blank" rel="noopener">argentina.gob.ar/senasa</a> antes de viajar.</p>`
      : `<div class="empty">${bubble('plane', 'viaje')}<h2>¿Viajás con ${esc(p.name)}?</h2><p>Poné destino y fecha y te armamos qué preparar y cuándo: antirrábica, certificado del veterinario, certificado de SENASA y lo que pide cada país.</p><button class="btn blue sm" data-act="trip">Planear un viaje</button></div>`}
  </div>`;
}
function tabDatos(p) {
  const facts = [['Especie', Z.species(p)], ['Raza', p.breed], ['Sexo', p.sex === 'h' ? 'Hembra' : p.sex === 'm' ? 'Macho' : ''], ['Nacimiento', p.birth ? fmt(p.birth) : ''], ['Peso', p.weight ? String(p.weight).replace('.', ',') + ' kg' : ''], ['Color', p.color], ['Microchip', p.chip], ['Señas', p.marks], ['Carácter', p.temper]].filter(f => f[1]);
  const call = n => `<a class="ibtn go" href="tel:${esc(n.replace(/[^\d+]/g, ''))}" aria-label="Llamar">${I('phone')}</a>`;
  return `<div class="sec">
    <div class="sec-h"><h2>Sus datos</h2><button class="link" data-act="editPet">${I('edit')} Editar</button></div>
    ${facts.length ? `<div class="facts">${facts.map(([k, v]) => `<div><span>${k}</span><b>${esc(v)}</b></div>`).join('')}</div>` : ''}
    <div class="sec-h"><h2>Veterinaria y urgencias</h2><button class="link" data-act="vet">${p.vet.name || p.vet.er ? 'Editar' : 'Cargar'}</button></div>
    ${p.vet.name || p.vet.er ? `<div class="list">
      ${p.vet.name ? `<div class="row">${bubble('heart', 'salud')}<span class="what"><b>${esc(p.vet.name)}</b><small>${esc(p.vet.address || 'Su veterinaria')}</small></span>${p.vet.phone ? call(p.vet.phone) : '<span></span>'}</div>` : ''}
      ${p.vet.er ? `<div class="row">${bubble('alert', 'perdida')}<span class="what"><b>${esc(p.vet.er)}</b><small>Guardia 24 horas</small></span>${p.vet.erPhone ? call(p.vet.erPhone) : '<span></span>'}</div>` : ''}</div>`
      : `<div class="empty">${bubble('heart', 'salud')}<p>Cargá tu veterinaria y una guardia 24 horas. En una urgencia no hay tiempo de buscar.</p></div>`}
    ${p.notes ? `<h3>Notas privadas</h3><div class="card"><p style="white-space:pre-wrap">${esc(p.notes)}</p></div>` : ''}
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
  panel(`Quién cuida a ${p.name}`, `<p class="note">Completalo una vez. El cuidador abre un link con todo esto, la medicación con sus horarios y la veterinaria, y marca cada día si comió, paseó y le dio los remedios. Vos lo ves en "Medicación".</p>
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
  <h2>Antecedentes</h2><table>
    <tr>${td('<b>Castración</b>')}${td(p.neutered === 'si' ? 'Sí' : p.neutered === 'no' ? 'No' : 'Sin dato')}</tr>
    <tr>${td('<b>Problemas de salud</b>')}${td(p.conditions.length ? p.conditions.map(c => `${esc(c.name)} (${{ activa: 'activo', controlada: 'controlado', resuelta: 'resuelto' }[c.status]}${c.since ? ', ' + esc(c.since) : ''})${c.notes ? ': ' + esc(c.notes) : ''}`).join('<br>') : 'Ninguno cargado')}</tr>
    <tr>${td('<b>Cirugías</b>')}${td(p.surgeries.length ? p.surgeries.map(c => `${esc(c.name)}${c.date ? ' (' + fmt(c.date) + ')' : ''}`).join('<br>') : 'Ninguna cargada')}</tr>
    <tr>${td('<b>Remedios de siempre</b>')}${td(esc(p.chronic || 'Ninguno'))}</tr>
    ${p.weights.length ? `<tr>${td('<b>Peso</b>')}${td(p.weights.slice(-5).map(w => `${String(w.kg).replace('.', ',')} kg (${fmt(w.date)})`).join(' · '))}</tr>` : ''}
  </table>
  <h2>Consultas</h2>${p.visits.length ? `<table><tr><th>Fecha</th><th>Motivo</th><th>Lo que dijo el veterinario</th><th>Indicaciones</th></tr>${[...p.visits].sort((a, b) => b.date.localeCompare(a.date)).map(v => `<tr>${td(fmt(v.date))}${td(esc(v.reason))}${td(esc(v.findings))}${td(esc(v.plan))}</tr>`).join('')}</table>` : '<p class="m">Sin consultas cargadas.</p>'}
  <h2>Estudios</h2>${p.studies.length ? `<table><tr><th>Fecha</th><th>Estudio</th><th>Resultado</th></tr>${[...p.studies].sort((a, b) => b.date.localeCompare(a.date)).map(x => `<tr>${td(fmt(x.date))}${td(esc(x.title || Z.STUDY[x.kind]))}${td(esc(x.notes))}</tr>`).join('')}</table>` : '<p class="m">Sin estudios cargados.</p>'}
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
  const fx = e.target.closest('[data-fix]'); if (fx && scan) return fixScanItem(+fx.dataset.fix);
  const b = e.target.closest('[data-act]'); if (!b) return;
  const cur = petById(view.id);
  const p = b.dataset.pet ? petById(b.dataset.pet) : cur;
  const go = v => { view = v; render(); window.scrollTo(0, 0); };
  switch (b.dataset.act) {
    case 'newPet': return startOnboard();
    case 'open': return go({ name: 'pet', id: b.dataset.id });
    case 'back': scan = null; return go({ name: 'pet', id: cur?.id || view.id });
    case 'sub': return go({ name: 'sub', id: cur.id, sub: b.dataset.sub });
    case 'filter': view.filter = b.dataset.f; render(); return document.querySelector('.timeline, .sec:has(.chips.scroll)')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    case 'add': return addPanel(cur);
    case 'scan': return startScan(cur);
    case 'scanSave': return saveScan();
    case 'openEv': {
      const id = b.dataset.id, k = b.dataset.kind;
      if (k === 'rec') return recForm(cur, cur.records.find(r => r.id === id));
      if (k === 'visit') return visitForm(cur, cur.visits.find(r => r.id === id));
      if (k === 'study') return studyForm(cur, cur.studies.find(r => r.id === id));
      if (k === 'sym') return symptomForm(cur, cur.symptoms.find(r => r.id === id));
      if (k === 'surg') return surgeryForm(cur, cur.surgeries.find(r => r.id === id));
      if (k === 'med') return medForm(cur, cur.meds.find(r => r.id === id));
      return;
    }
    case 'editPet': return petForm(cur);
    case 'newCond': return conditionForm(cur);
    case 'editCond': return conditionForm(cur, cur.conditions.find(c => c.id === b.dataset.id));
    case 'newSurg': return surgeryForm(cur);
    case 'editSurg': return surgeryForm(cur, cur.surgeries.find(c => c.id === b.dataset.id));
    case 'newWeight': return weightForm(cur);
    case 'editMed': return medForm(cur, cur.meds.find(m => m.id === b.dataset.med));
    case 'give': { const m = p.meds.find(x => x.id === b.dataset.med); p.log.push({ id: uid(), at: new Date().toISOString(), kind: 'med', medId: m.id, by: 'Vos', note: '' }); changed(); return toast(`Listo: ${m.name} dada.`); }
    case 'newExp': return expenseForm(cur);
    case 'editExp': return expenseForm(cur, cur.expenses.find(x => x.id === b.dataset.exp));
    case 'food': return foodForm(cur);
    case 'newBag': cur.food.opened = iso(Z.today()); changed(); return toast('Bolsa nueva: el contador arrancó de cero.');
    case 'fund': return fundForm(cur);
    case 'fundAdd': cur.fund.saved = (cur.fund.saved || 0) + (cur.fund.monthly || 0); changed(); return toast('Sumado al ahorro.');
    case 'trip': return tripForm(cur);
    case 'vet': return vetForm(cur);
    case 'share': return sharePanel(cur);
    case 'sitter': return sitterPanel(cur);
    case 'lost': return lostPanel(p);
    case 'vetpdf': return vetPdf(cur);
    case 'icsRec': { const r = p.records.find(x => x.id === b.dataset.rec); return calendar([Z.recordEvent(p, r)], `${p.name} ${r.name}`); }
    case 'icsMeds': return calendar(cur.meds.filter(m => m.start && Z.medState(m, cur.log).state !== 'ended').map(m => Z.medEvent(cur, m)), `${cur.name} remedios`);
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
    $('#demoCta').innerHTML = st === 200 ? '<a href="/productos">Conseguila para guardar</a>' : '<a href="/acceso?next=mascotas">Ya la compré: entrar</a>';
    $('#demo').hidden = false;
  }
  view = { name: 'pet', id: doc.pets[0]?.id };
  render();
})();
})();
