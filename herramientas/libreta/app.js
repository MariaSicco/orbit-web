/* Mimitos by Orbit · la libreta de tu mascota · interfaz. Necesita core.js (window.LB).
   Datos solo en el dispositivo: localStorage "orbit-libreta:v1". Sin storage, funciona en memoria y avisa. */
(() => {
'use strict';
const L = window.LB;
const { esc, fmt, iso, icon: I } = L;
const KEY = 'orbit-libreta:v1';
const $ = s => document.querySelector(s);
const app = $('#app'), dlg = $('#dlg'), dlgBody = $('#dlgBody'), dlgFoot = $('#dlgFoot'), dlgErr = $('#dlgErr'), dlgT = $('#dlgT');
const cfm = $('#cfm');

/* ---------- almacenamiento ---------- */
function getStore() {
  try { const s = window.localStorage, k = '__orbit_lb_test'; s.setItem(k, '1'); s.removeItem(k); return s; } catch { return null; }
}
const store = getStore();
const isQuota = e => Boolean(e) && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22 || e.code === 1014);
function load() {
  if (!store) return L.normDoc({});
  let raw = null;
  try { raw = store.getItem(KEY); } catch { return L.normDoc({}); }
  if (!raw) return L.normDoc({});
  try { return L.normDoc(JSON.parse(raw)); }
  catch {
    /* si el contenido está roto, lo apartamos en vez de pisarlo sin aviso */
    try { store.setItem(KEY + ':roto', raw); } catch {}
    return L.normDoc({});
  }
}
const clone = o => (typeof structuredClone === 'function' ? structuredClone(o) : JSON.parse(JSON.stringify(o)));

/* ---------- estado ---------- */
let mode = 'real';            // 'real' | 'demo'
let realDoc = load();
let doc = realDoc;
let filter = 'todo';

/* Aplica un cambio. En modo real lo guarda; si no entra, no cambia nada y devuelve el error. */
function commit(mut) {
  const draft = clone(doc);
  mut(draft);
  if (mode === 'real' && store) {
    try { store.setItem(KEY, JSON.stringify(draft)); }
    catch (e) {
      return { ok: false, msg: isQuota(e)
        ? 'No hay más lugar en este navegador. Probá con una foto más chica o quitale la foto a alguna mascota.'
        : 'No se pudo guardar. Probá de nuevo.' };
    }
  }
  doc = draft;
  if (mode === 'real') realDoc = doc;
  render();
  return { ok: true };
}

/* ---------- utilidades de interfaz ---------- */
function toast(t) {
  const el = $('#toast');
  const open = cfm.open ? cfm : dlg.open ? dlg : null;
  (open || document.body).appendChild(el);
  el.textContent = t; el.classList.add('on');
  clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('on'), 3200);
}
const cur = () => doc.pets.find(p => p.id === doc.current) || doc.pets[0];
const avatar = (p, cls = '') => `<span class="av c-${L.tone(p)} ${cls}">${p.photo ? `<img src="${esc(p.photo)}" alt="">` : L.petIcon(p)}</span>`;
const kg = w => (w ? String(w).replace('.', ',') + ' kg' : '');
const ageTxt = p => { const a = L.age(p.birth); return a ? (p.birthApprox ? `${a} aprox.` : a) : ''; };
const recName = r => r.name || L.TYPE[r.type];
function focusKey(k) {
  if (!k) return false;
  const el = document.querySelector(`[data-k="${CSS.escape(k)}"]`);
  if (el) { el.focus({ preventScroll: false }); return true; }
  return false;
}

/* ---------- render ---------- */
function render() {
  const ae = document.activeElement;
  const k = ae && app.contains(ae) ? ae.dataset.k : null;
  $('#demoBar').hidden = mode !== 'demo';
  $('#memBar').hidden = Boolean(store) || mode === 'demo';
  const tag = $('#localTag span');
  tag.textContent = mode === 'demo' ? 'Ejemplo · no se guarda' : store ? 'Solo en este dispositivo' : 'Sin guardar';
  if (!doc.pets.length) renderWelcome(); else renderPet(cur());
  if (k) focusKey(k);
}

/* la entrada animada solo cuando cambia la pantalla o la mascota, no en cada guardado */
let lastView = '';
const enterCls = v => { const c = v !== lastView ? ' enter' : ''; lastView = v; return c; };
function renderWelcome() {
  document.title = 'Mimitos by Orbit · la libreta de tu mascota';
  app.innerHTML = `<section class="welcome${enterCls('welcome:' + mode)}">
    <span class="ib big c-comida">${I('paw')}</span>
    <h1 class="w-title">La libreta de tu mascota, <span class="it">siempre a mano</span></h1>
    <p class="lead">Anotá vacunas, desparasitaciones y controles. La libreta te muestra qué le toca y cuándo.</p>
    <ol class="steps">
      <li><span class="num">1</span><b>Cargás a tu mascota</b><small>Nombre, especie y edad. Menos de un minuto.</small></li>
      <li><span class="num">2</span><b>Anotás lo último que le dieron</b><small>Vacunas, pipetas, antiparasitarios y controles.</small></li>
      <li><span class="num">3</span><b>Ves lo que le toca</b><small>Vencido, pronto o al día, en orden.</small></li>
    </ol>
    <div class="actions">
      <button class="btn btn-acid big" type="button" data-act="newPet" data-k="newPet">${I('plus')} Agregar a mi mascota</button>
      <button class="btn btn-line big" type="button" data-act="demo" data-k="demo">Ver un ejemplo</button>
    </div>
    <p class="note">${I('device')}<span>Tus datos quedan solo en este dispositivo. Es un organizador, no reemplaza al veterinario.</span></p>
  </section>`;
}

/* Fuentes de "lo que le toca". Paso 2: sumar acá el calendario sugerido (misma forma: { r, s, source }). */
const DUE_SOURCES = [p => L.upcoming(p)];
const dueItems = p => DUE_SOURCES.flatMap(fn => fn(p)).sort((a, b) => a.s.days - b.s.days);

const FILTERS = [['todo', 'Todo'], ['vacuna', 'Vacunas'], ['desp_int', 'Desp. interna'], ['desp_ext', 'Desp. externa'], ['control', 'Controles']];

function renderPet(p) {
  document.title = `${p.name} · Mimitos`;
  const due = dueItems(p);
  const hist = L.history(p, filter);
  const counts = Object.fromEntries(FILTERS.map(([k]) => [k, L.history(p, k).length]));
  const meta1 = [L.species(p), p.breed].filter(Boolean).join(' · ');
  const meta2 = [ageTxt(p), kg(p.weight)].filter(Boolean).join(' · ');
  let year = '';
  app.innerHTML = `
  <nav class="pets" aria-label="Tus mascotas">
    ${doc.pets.map(x => `<button class="pet-sw" type="button" data-act="switch" data-id="${esc(x.id)}" data-k="sw-${esc(x.id)}" aria-current="${x.id === p.id ? 'true' : 'false'}">${avatar(x)}<span class="nm">${esc(x.name)}</span></button>`).join('')}
    <button class="pet-sw add" type="button" data-act="newPet" data-k="addPet">${'<span class="av add">' + I('plus') + '</span>'}<span class="nm">Agregar</span></button>
  </nav>
  <div class="grid${enterCls('pet:' + p.id)}" data-pet="${esc(p.id)}">
    <div class="col-a">
      <section class="pethead c-${L.tone(p)}" aria-labelledby="petName">
        ${avatar(p, 'big')}
        <div class="ph-txt">
          <p class="ph-kind">${esc(meta1)}</p>
          <h1 class="ph-name" id="petName">${esc(p.name)}</h1>
          ${meta2 ? `<p class="ph-meta">${esc(meta2)}</p>` : ''}
        </div>
        <button class="btn-mini" type="button" data-act="editPet" data-k="editPet">${I('edit')}<span>Editar perfil</span></button>
      </section>

      <button class="btn btn-acid big wide main-cta" type="button" data-act="addRec" data-k="addRec">${I('plus')} Cargar algo de ${esc(p.name)}</button>

      <section class="block" aria-labelledby="dueT">
        <div class="block-h"><h2 id="dueT">Lo que le toca a <span class="it">${esc(p.name)}</span></h2>${due.length ? `<span class="count">${due.length}</span>` : ''}</div>
        ${due.length ? `<p class="hint">Tocá una fecha para anotar que ya se la dieron.</p>
        <ul class="due-list" role="list">${due.map(x => `<li><button class="due st-${x.s.k}" type="button" data-act="renew" data-id="${esc(x.r.id)}" data-k="due-${esc(x.r.id)}" aria-label="${esc(recName(x.r))}, ${esc(L.TYPE[x.r.type])}. ${x.s.label}: ${esc(x.s.t)}. Anotar la nueva aplicación">
          <span class="ic c-${L.recTone(x.r.type)}">${I(L.recIcon(x.r.type))}</span>
          <span class="what"><b>${esc(recName(x.r))}</b><small>${esc(L.TYPE_SHORT[x.r.type])} · ${esc(x.s.t)}</small></span>
          <span class="pill ${x.s.k}">${x.s.label}</span>
        </button></li>`).join('')}</ul>`
        : `<div class="empty"><p>Cuando cargues algo con <b>próxima fecha</b>, aparece acá con su estado: vencido, pronto o al día.</p></div>`}
      </section>
    </div>

    <div class="col-b">
      <section class="block" aria-labelledby="histT">
        <div class="block-h"><h2 id="histT">Historial</h2>${p.records.length ? `<span class="count">${p.records.length}</span>` : ''}</div>
        ${p.records.length ? `<div class="filters" role="group" aria-label="Filtrar por tipo">${FILTERS.map(([k, l]) => `<button class="chip" type="button" data-act="filter" data-f="${k}" data-k="f-${k}" aria-pressed="${k === filter}">${l}<span class="n">${counts[k]}</span></button>`).join('')}</div>` : ''}
        ${hist.length ? `<ul class="hist" role="list">${hist.map(r => {
          const y = r.date.slice(0, 4), head = y !== year ? `<li class="year" aria-hidden="true">${y}</li>` : ''; year = y;
          const sub = [L.TYPE_SHORT[r.type], r.vet].filter(Boolean).join(' · ');
          return `${head}<li><button class="hrow" type="button" data-act="editRec" data-id="${esc(r.id)}" data-k="rec-${esc(r.id)}" aria-label="${esc(recName(r))}, ${esc(fmt(r.date))}. Editar">
            <span class="h-date">${esc(fmt(r.date, { day: 'numeric', month: 'short' }))}</span>
            <span class="ic c-${L.recTone(r.type)}">${I(L.recIcon(r.type))}</span>
            <span class="what"><b>${esc(recName(r))}</b><small>${esc(sub)}</small>${r.notes ? `<small class="notes">${esc(r.notes)}</small>` : ''}</span>
            ${r.next ? `<span class="h-next">Próx. ${esc(fmt(r.next, { day: 'numeric', month: 'short', year: '2-digit' }))}</span>` : ''}
          </button></li>`;
        }).join('')}</ul>`
        : `<div class="empty"><p>${p.records.length ? 'No hay nada de este tipo todavía.' : `Su historial empieza acá. Cargá la última vacuna, pipeta o control de ${esc(p.name)} y queda en orden.`}</p></div>`}
      </section>
    </div>
  </div>`;
}

/* ---------- diálogos ---------- */
let dlgState = null;
function openDialog({ title, body, foot, onSubmit, onMount, returnKey }) {
  dlgT.textContent = title;
  dlgBody.innerHTML = body;
  dlgFoot.innerHTML = foot;
  dlgErr.hidden = true; dlgErr.textContent = '';
  dlgState = { onSubmit, returnKey };
  dlg.showModal();
  dlgBody.scrollTop = 0;
  if (onMount) onMount(dlgBody);
  const first = dlgBody.querySelector('[autofocus]') || dlgBody.querySelector('input,select,textarea,button');
  if (first) first.focus();
}
function showErr(msg, field) {
  dlgErr.textContent = msg; dlgErr.hidden = false;
  if (field) { field.setAttribute('aria-invalid', 'true'); field.focus(); }
}
$('#dlgForm').addEventListener('submit', async e => {
  e.preventDefault();
  if (!dlgState) return;
  dlgBody.querySelectorAll('[aria-invalid]').forEach(x => x.removeAttribute('aria-invalid'));
  dlgErr.hidden = true;
  const res = await dlgState.onSubmit(e.submitter && e.submitter.value);
  if (res === true) dlg.close();
});
dlg.addEventListener('click', e => {
  if (e.target === dlg) dlg.close();
  if (e.target.closest('[data-close]')) dlg.close();
});
dlg.addEventListener('close', () => {
  const k = dlgState && dlgState.returnKey;
  dlgState = null;
  document.body.appendChild($('#toast'));
  requestAnimationFrame(() => { if (!focusKey(k) && !focusKey('addRec') && !focusKey('newPet')) app.focus(); });
});

function confirmBox(title, text, yes = 'Sí, borrar') {
  return new Promise(ok => {
    $('#cfmT').textContent = title; $('#cfmD').textContent = text; $('#cfmYes').textContent = yes;
    cfm.returnValue = '';
    const done = () => { cfm.removeEventListener('close', done); ok(cfm.returnValue === 'yes'); };
    cfm.addEventListener('close', done);
    cfm.showModal();
    $('#cfmNo').focus();
  });
}

/* ---------- foto: se achica a ~400 px en JPEG ---------- */
function shrink(file, max = 400) {
  return new Promise((ok, no) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      try {
        const s = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.width * s)); c.height = Math.max(1, Math.round(img.height * s));
        const x = c.getContext('2d'); x.fillStyle = '#242426'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
        let data = c.toDataURL('image/jpeg', 0.82);
        if (data.length > 160000) data = c.toDataURL('image/jpeg', 0.6);
        ok(data);
      } catch (e) { no(e); } finally { URL.revokeObjectURL(url); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); no(new Error('img')); };
    img.src = url;
  });
}

/* ---------- alta y edición de mascota ---------- */
const breedOptions = sp => (L.BREEDS[sp] || []).map(b => `<option value="${esc(b)}"></option>`).join('');
function petForm(p, isNew) {
  const approx = p.birthApprox;
  const m = p.birth ? L.monthsSince(p.birth) : null;
  const apN = approx && m != null ? (m >= 24 && m % 12 === 0 ? m / 12 : m >= 24 ? Math.round(m / 12) : m) : '';
  const apU = approx && m != null && m >= 24 ? 'y' : 'm';
  const extraOpen = !isNew || p.breed || p.photo || p.weight;
  return `
  <div class="field">
    <label for="fName" class="mono">Nombre</label>
    <input id="fName" name="name" type="text" maxlength="40" autocomplete="off" value="${esc(p.name)}" required autofocus>
  </div>
  <fieldset class="field">
    <legend class="mono">Especie</legend>
    <div class="seg">
      <input type="radio" name="species" id="spP" value="perro" ${p.species !== 'gato' ? 'checked' : ''}><label for="spP">${I('dog')} Perro</label>
      <input type="radio" name="species" id="spG" value="gato" ${p.species === 'gato' ? 'checked' : ''}><label for="spG">${I('cat')} Gato</label>
    </div>
  </fieldset>
  <fieldset class="field">
    <legend class="mono">Edad</legend>
    <div class="seg small">
      <input type="radio" name="ageMode" id="amD" value="date" ${!approx ? 'checked' : ''}><label for="amD">Sé la fecha</label>
      <input type="radio" name="ageMode" id="amA" value="approx" ${approx ? 'checked' : ''}><label for="amA">Más o menos</label>
    </div>
    <div class="age-date" ${approx ? 'hidden' : ''}>
      <label for="fBirth" class="sr">Fecha de nacimiento</label>
      <input id="fBirth" name="birth" type="date" max="${iso(L.today())}" value="${!approx ? esc(p.birth) : ''}">
    </div>
    <div class="age-approx row2" ${approx ? '' : 'hidden'}>
      <label for="fAgeN" class="sr">Edad aproximada</label>
      <input id="fAgeN" name="ageN" type="number" inputmode="numeric" min="0" max="40" step="1" placeholder="Ej.: 3" value="${apN}">
      <label for="fAgeU" class="sr">Unidad</label>
      <select id="fAgeU" name="ageU"><option value="m" ${apU === 'm' ? 'selected' : ''}>meses</option><option value="y" ${apU === 'y' ? 'selected' : ''}>años</option></select>
    </div>
  </fieldset>
  <details class="more" ${extraOpen ? 'open' : ''}>
    <summary><span>Raza, foto y peso</span><span class="mono dim">Opcional</span></summary>
    <div class="field">
      <label for="fBreed" class="mono">Raza</label>
      <input id="fBreed" name="breed" type="text" list="breedList" maxlength="60" autocomplete="off" placeholder="Escribí para buscar" value="${esc(p.breed)}">
      <datalist id="breedList">${breedOptions(p.species)}</datalist>
    </div>
    <div class="field">
      <span class="mono lbl" id="photoL">Foto</span>
      <div class="photo-pick">
        <span class="av big" id="photoPrev">${p.photo ? `<img src="${esc(p.photo)}" alt="">` : L.petIcon(p)}</span>
        <div class="photo-btns">
          <label class="btn btn-line sm file-btn">${I('camera')} <span id="photoTxt">${p.photo ? 'Cambiar foto' : 'Elegir foto'}</span><input id="fPhoto" type="file" accept="image/*" class="sr" aria-labelledby="photoL photoTxt"></label>
          <button class="btn-mini" type="button" id="photoDel" ${p.photo ? '' : 'hidden'}>Quitar foto</button>
        </div>
      </div>
    </div>
    <div class="field">
      <label for="fWeight" class="mono">Peso actual (kg)</label>
      <input id="fWeight" name="weight" type="text" inputmode="decimal" maxlength="6" placeholder="Ej.: 12,5" value="${p.weight ? esc(String(p.weight).replace('.', ',')) : ''}">
    </div>
  </details>`;
}
function openPetForm(id) {
  const base = id ? doc.pets.find(p => p.id === id) : null;
  const isNew = !base;
  const p = base ? clone(base) : L.blankPet();
  let photo = p.photo;
  openDialog({
    title: isNew ? (doc.pets.length ? 'Otra mascota' : 'Tu mascota') : `Perfil de ${p.name}`,
    body: petForm(p, isNew),
    foot: `<button class="btn btn-acid big wide" type="submit" value="save">${isNew ? 'Listo, agregar' : 'Guardar cambios'}</button>
      ${isNew ? '' : `<button class="btn btn-danger-line wide" type="submit" value="del" formnovalidate>Borrar a ${esc(p.name)}</button>`}`,
    returnKey: isNew ? 'addRec' : 'editPet',
    onMount(b) {
      const sync = () => {
        const sp = b.querySelector('[name=species]:checked').value;
        b.querySelector('#breedList').innerHTML = breedOptions(sp);
        if (!photo) b.querySelector('#photoPrev').innerHTML = L.petIcon({ species: sp });
      };
      b.querySelectorAll('[name=species]').forEach(r => r.addEventListener('change', sync));
      b.querySelectorAll('[name=ageMode]').forEach(r => r.addEventListener('change', () => {
        const ap = b.querySelector('#amA').checked;
        b.querySelector('.age-date').hidden = ap; b.querySelector('.age-approx').hidden = !ap;
        (ap ? b.querySelector('#fAgeN') : b.querySelector('#fBirth')).focus();
      }));
      const input = b.querySelector('#fPhoto');
      input.addEventListener('change', async () => {
        const f = input.files && input.files[0]; if (!f) return;
        if (!/^image\//.test(f.type || 'image/')) return showErr('Ese archivo no es una imagen.');
        try {
          photo = await shrink(f);
          b.querySelector('#photoPrev').innerHTML = `<img src="${photo}" alt="">`;
          b.querySelector('#photoTxt').textContent = 'Cambiar foto';
          b.querySelector('#photoDel').hidden = false;
          dlgErr.hidden = true;
        } catch { showErr('No pudimos leer esa imagen. Probá con una foto JPG o PNG.'); }
        input.value = '';
      });
      b.querySelector('#photoDel').addEventListener('click', e => {
        photo = ''; e.currentTarget.hidden = true;
        b.querySelector('#photoTxt').textContent = 'Elegir foto';
        sync(); b.querySelector('#fPhoto').focus();
      });
    },
    async onSubmit(action) {
      if (action === 'del') {
        const n = base.records.length;
        const ok = await confirmBox(`¿Borrar a ${base.name}?`, `Se borra su perfil${n ? ` y sus ${n} registro${n > 1 ? 's' : ''}` : ''}. No se puede deshacer.`);
        if (!ok) return false;
        const r = commit(d => { d.pets = d.pets.filter(x => x.id !== base.id); d.current = d.pets[0] ? d.pets[0].id : ''; });
        if (!r.ok) return showErr(r.msg), false;
        filter = 'todo';
        toast(`Listo, borramos a ${base.name}.`);
        dlgState.returnKey = 'addRec';
        return true;
      }
      const b = dlgBody;
      const name = b.querySelector('#fName').value.trim();
      if (!name) return showErr('Poné su nombre.', b.querySelector('#fName')), false;
      const sp = b.querySelector('[name=species]:checked').value;
      let birth = '', approx = false;
      if (b.querySelector('#amA').checked) {
        const nEl = b.querySelector('#fAgeN'), n = Number(nEl.value);
        if (nEl.value === '' || !Number.isFinite(n) || n < 0 || n > 40 || !Number.isInteger(n)) return showErr('Poné la edad en números enteros (por ejemplo, 3).', nEl), false;
        const months = b.querySelector('#fAgeU').value === 'y' ? n * 12 : n;
        if (months > 360) return showErr('Revisá la edad: parece demasiado.', nEl), false;
        birth = L.addMonths(iso(L.today()), -months); approx = true;
      } else {
        const bEl = b.querySelector('#fBirth');
        birth = bEl.value;
        if (!L.isISO(birth)) return showErr('Poné la fecha de nacimiento o elegí "Más o menos".', bEl), false;
        if (birth > iso(L.today())) return showErr('La fecha de nacimiento no puede ser futura.', bEl), false;
        if (L.monthsSince(birth) > 360) return showErr('Revisá el año de nacimiento.', bEl), false;
      }
      const wEl = b.querySelector('#fWeight');
      const wRaw = wEl.value.trim().replace(',', '.');
      let weight = null;
      if (wRaw) {
        weight = Number(wRaw);
        if (!Number.isFinite(weight) || weight <= 0 || weight >= 200) return showErr('Revisá el peso: va en kilos, por ejemplo 12,5.', wEl), false;
        weight = Math.round(weight * 10) / 10;
      }
      const next = { ...p, name, species: sp, birth, birthApprox: approx, breed: b.querySelector('#fBreed').value.trim(), weight, photo };
      const r = commit(d => {
        const i = d.pets.findIndex(x => x.id === p.id);
        if (i >= 0) d.pets[i] = { ...d.pets[i], ...next, records: d.pets[i].records };
        else d.pets.push(next);
        d.current = p.id;
      });
      if (!r.ok) return showErr(r.msg), false;
      if (isNew) { filter = 'todo'; toast(`Listo, ${name} ya está en tu libreta.`); }
      else toast('Guardado.');
      return true;
    },
  });
}

/* ---------- alta y edición de registros ---------- */
const NEXT_SHORTCUTS = [[1, '1 mes'], [3, '3 meses'], [6, '6 meses'], [12, '1 año']];
function recForm(p, r) {
  return `
  <fieldset class="field">
    <legend class="mono">Qué fue</legend>
    <div class="seg grid2">
      ${L.TYPES.map(t => `<input type="radio" name="type" id="ty_${t}" value="${t}" ${r.type === t ? 'checked' : ''}><label for="ty_${t}">${I(L.recIcon(t))} ${esc(L.TYPE[t])}</label>`).join('')}
    </div>
  </fieldset>
  <div class="field">
    <label for="rName" class="mono">Nombre</label>
    <input id="rName" name="name" type="text" list="sugList" maxlength="80" autocomplete="off" placeholder="Ej.: Antirrábica" value="${esc(r.name)}">
    <datalist id="sugList"></datalist>
    <div class="sugs" id="sugs" role="group" aria-label="Sugerencias"></div>
  </div>
  <div class="field">
    <label for="rDate" class="mono">Fecha en que se la dieron</label>
    <input id="rDate" name="date" type="date" max="${iso(L.today())}" value="${esc(r.date)}" required>
  </div>
  <div class="field">
    <label for="rNext" class="mono">Próxima fecha <span class="dim">· opcional</span></label>
    <input id="rNext" name="next" type="date" value="${esc(r.next)}" aria-describedby="nextHelp">
    <div class="sugs" role="group" aria-label="Calcular la próxima fecha desde la fecha en que se la dieron">
      ${NEXT_SHORTCUTS.map(([n, l]) => `<button class="chip" type="button" data-plus="${n}">+ ${l}</button>`).join('')}
      <button class="chip ghost" type="button" data-plus="0">Sin próxima</button>
    </div>
    <small class="help" id="nextHelp">Si la cargás, aparece en "Lo que le toca a ${esc(p.name)}". Usá la que te indicó tu veterinaria.</small>
  </div>
  <div class="field">
    <label for="rVet" class="mono">Veterinaria <span class="dim">· opcional</span></label>
    <input id="rVet" name="vet" type="text" maxlength="80" autocomplete="off" value="${esc(r.vet)}">
  </div>
  <div class="field">
    <label for="rNotes" class="mono">Notas <span class="dim">· opcional</span></label>
    <textarea id="rNotes" name="notes" rows="2" maxlength="500">${esc(r.notes)}</textarea>
  </div>`;
}
function openRecForm(p, rec, opts = {}) {
  const isNew = !rec || opts.renew;
  const r = rec ? (opts.renew ? { ...L.blankRecord(), type: rec.type, name: rec.name, vet: rec.vet } : clone(rec)) : L.blankRecord();
  openDialog({
    title: opts.renew ? `Nueva aplicación · ${recName(rec)}` : isNew ? `Cargar algo de ${p.name}` : 'Editar registro',
    body: recForm(p, r),
    foot: `<button class="btn btn-acid big wide" type="submit" value="save">${isNew ? 'Guardar' : 'Guardar cambios'}</button>
      ${isNew ? '' : '<button class="btn btn-danger-line wide" type="submit" value="del" formnovalidate>Borrar registro</button>'}`,
    returnKey: isNew ? 'addRec' : `rec-${r.id}`,
    onMount(b) {
      const nameEl = b.querySelector('#rName'), sugs = b.querySelector('#sugs'), list = b.querySelector('#sugList');
      const paint = () => {
        const t = b.querySelector('[name=type]:checked').value;
        const s = L.suggest(p.species, t);
        list.innerHTML = s.map(x => `<option value="${esc(x)}"></option>`).join('');
        sugs.innerHTML = s.map(x => `<button class="chip" type="button" data-name="${esc(x)}" aria-pressed="${nameEl.value === x}">${esc(x)}</button>`).join('');
        nameEl.placeholder = s[0] ? `Ej.: ${s[0]}` : 'Nombre';
      };
      b.querySelectorAll('[name=type]').forEach(x => x.addEventListener('change', paint));
      nameEl.addEventListener('input', () => sugs.querySelectorAll('[data-name]').forEach(c => c.setAttribute('aria-pressed', String(c.dataset.name === nameEl.value))));
      sugs.addEventListener('click', e => {
        const c = e.target.closest('[data-name]'); if (!c) return;
        nameEl.value = c.dataset.name; nameEl.dispatchEvent(new Event('input'));
      });
      b.addEventListener('click', e => {
        const c = e.target.closest('[data-plus]'); if (!c) return;
        const n = Number(c.dataset.plus), dEl = b.querySelector('#rDate'), nx = b.querySelector('#rNext');
        if (!n) { nx.value = ''; return; }
        const from = L.isISO(dEl.value) ? dEl.value : iso(L.today());
        nx.value = L.addMonths(from, n);
      });
      paint();
      /* en una renovación, el tipo y el nombre ya vienen: el foco va a la fecha */
      if (opts.renew) b.querySelector('#rDate').focus();
      else if (isNew) b.querySelector('[name=type]:checked').focus();
    },
    async onSubmit(action) {
      if (action === 'del') {
        const ok = await confirmBox('¿Borrar este registro?', `${recName(r)} del ${fmt(r.date)}. No se puede deshacer.`);
        if (!ok) return false;
        const res = commit(d => { const q = d.pets.find(x => x.id === p.id); q.records = q.records.filter(x => x.id !== r.id); });
        if (!res.ok) return showErr(res.msg), false;
        dlgState.returnKey = 'addRec';
        toast('Registro borrado.');
        return true;
      }
      const b = dlgBody;
      const dEl = b.querySelector('#rDate'), nEl = b.querySelector('#rNext');
      const date = dEl.value, next = nEl.value;
      if (!L.isISO(date)) return showErr('Poné la fecha en que se la dieron.', dEl), false;
      if (date > iso(L.today())) return showErr('Esa fecha todavía no pasó. Si es un turno, cargalo como próxima fecha.', dEl), false;
      if (next && !L.isISO(next)) return showErr('Revisá la próxima fecha.', nEl), false;
      if (next && next <= date) return showErr('La próxima fecha tiene que ser después de la fecha en que se la dieron.', nEl), false;
      const out = { ...r, type: b.querySelector('[name=type]:checked').value, name: b.querySelector('#rName').value.trim(), date, next, vet: b.querySelector('#rVet').value.trim(), notes: b.querySelector('#rNotes').value.trim() };
      const res = commit(d => {
        const q = d.pets.find(x => x.id === p.id);
        const i = q.records.findIndex(x => x.id === out.id);
        if (i >= 0) q.records[i] = out; else q.records.push(out);
      });
      if (!res.ok) return showErr(res.msg), false;
      if (filter !== 'todo' && filter !== out.type) filter = 'todo';
      dlgState.returnKey = `rec-${out.id}`;
      const st = out.next ? L.status(out.next) : null;
      toast(st ? `Guardado. ${st.t}.` : 'Guardado en el historial.');
      return true;
    },
  });
}

/* ---------- ejemplo (no se guarda) ---------- */
function demoDoc() {
  const d = n => { const x = L.today(); x.setDate(x.getDate() + n); return iso(x); };
  const pet = (o, recs) => L.norm({ ...L.blankPet(), ...o, records: recs.map((r, i) => ({ id: `${o.id}r${i}`, vet: '', notes: '', next: '', ...r })) });
  const lola = pet({ id: 'demo-lola', name: 'Lola', species: 'perro', breed: 'Mestizo', birth: d(-1500), weight: 14.2 }, [
    { type: 'vacuna', name: 'Antirrábica', date: d(-372), next: d(-7), vet: 'Veterinaria San Martín' },
    { type: 'desp_ext', name: 'Pipeta antipulgas', date: d(-24), next: d(6), notes: 'Talle 10 a 20 kg.' },
    { type: 'vacuna', name: 'Séxtuple', date: d(-200), next: d(165), vet: 'Veterinaria San Martín' },
    { type: 'desp_int', name: 'Antiparasitario interno', date: d(-80), next: d(100) },
    { type: 'control', name: 'Control anual', date: d(-120), next: d(245), notes: 'Todo bien.' },
    { type: 'vacuna', name: 'Antirrábica', date: d(-737), next: d(-372), vet: 'Veterinaria San Martín' },
  ]);
  const michi = pet({ id: 'demo-michi', name: 'Michi', species: 'gato', breed: 'Común europeo (mestizo)', birth: d(-730), birthApprox: true, weight: 4.6 }, [
    { type: 'vacuna', name: 'Triple felina', date: d(-358), next: d(7) },
    { type: 'desp_int', name: 'Antiparasitario interno', date: d(-40), next: d(50) },
  ]);
  const uma = pet({ id: 'demo-uma', name: 'Uma', species: 'perro', breed: 'Labrador Retriever', birth: d(-110), weight: 11 }, [
    { type: 'vacuna', name: 'Séxtuple', date: d(-20), next: d(1), notes: 'Segunda dosis.' },
    { type: 'desp_int', name: 'Antiparasitario interno', date: d(-20), next: d(10) },
  ]);
  return { v: 1, pets: [lola, michi, uma], current: 'demo-lola' };
}
function enterDemo() { mode = 'demo'; doc = demoDoc(); filter = 'todo'; render(); window.scrollTo(0, 0); $('#demoExit').focus(); }
function exitDemo() { mode = 'real'; doc = realDoc; filter = 'todo'; render(); window.scrollTo(0, 0); if (!focusKey('newPet') && !focusKey('addRec')) app.focus(); }
$('#demoExit').addEventListener('click', exitDemo);

/* ---------- acciones ---------- */
app.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const act = el.dataset.act, p = cur();
  if (act === 'newPet') return openPetForm(null);
  if (act === 'demo') return enterDemo();
  if (!p) return;
  if (act === 'switch') {
    if (el.dataset.id === doc.current) return;
    filter = 'todo';
    const id = el.dataset.id;
    /* cambiar de mascota es comodidad: si no se puede guardar, igual se cambia */
    if (!commit(d => { d.current = id; }).ok) { doc = { ...doc, current: id }; if (mode === 'real') realDoc = doc; render(); }
    return;
  }
  if (act === 'editPet') return openPetForm(p.id);
  if (act === 'addRec') return openRecForm(p, null);
  if (act === 'editRec') { const r = p.records.find(x => x.id === el.dataset.id); if (r) openRecForm(p, r); return; }
  if (act === 'renew') { const r = p.records.find(x => x.id === el.dataset.id); if (r) openRecForm(p, r, { renew: true }); return; }
  if (act === 'filter') { filter = el.dataset.f; render(); }
});

/* otra pestaña cambió los datos */
window.addEventListener('storage', e => {
  if (e.key !== KEY || mode !== 'real' || dlg.open) return;
  realDoc = load(); doc = realDoc; render();
});

render();
})();
