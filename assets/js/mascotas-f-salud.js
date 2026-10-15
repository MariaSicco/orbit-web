/* Mimitos · F1 "Salud" (interruptor FEATURES.salud). Reemplaza a Antecedentes: cada problema de salud con sus 3 estados
   (Lo tiene / Controlado / Ya pasó) a un toque, los frecuentes de la especie para sumar con otro, alergias,
   remedios en curso y cirugías. Mimitos no diagnostica: solo lo anota. */
(() => {
'use strict';
const A = window.MZAPP, Z = window.MZ, F = window.MZFEAT;
if (!A || !Z || !F || !F.on.salud) return;
const { esc, fmt } = Z, I = Z.icon, $ = s => document.querySelector(s);
const ST = [['activa', 'Lo tiene'], ['controlada', 'Controlado'], ['resuelta', 'Ya pasó']];
const sinceTxt = s => { s = String(s || ''); const m = s.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/); if (!m) return s; const d = new Date(+m[1], +m[2] - 1, +(m[3] || 1)); return m[3] ? d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' }) : d.toLocaleDateString('es-AR', { month: 'short', year: 'numeric' }); };
const n1 = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
function render(p) {
  const common = (Z.CONDITIONS[p.species] || Z.CONDITIONS.otra).filter(n => !p.conditions.some(c => n1(c.name) === n1(n)));
  const meds = p.meds.filter(m => Z.medState(m, p.log).state !== 'ended');
  const row = c => `<div class="cond" role="group" aria-label="${esc(c.name)}">
      <button type="button" class="cond-n" data-act="editCond" data-id="${c.id}"><b>${esc(c.name)}</b>${c.since || c.notes ? `<small>${esc([c.since ? 'desde ' + sinceTxt(c.since) : '', c.notes].filter(Boolean).join(' · '))}</small>` : ''}</button>
      <div class="chips">${ST.map(([k, l]) => `<button type="button" class="chip" data-act="condSet" data-id="${c.id}" data-st="${k}" aria-pressed="${c.status === k}">${l}</button>`).join('')}</div></div>`;
  const list = [...p.conditions].sort((a, b) => (a.status === 'resuelta') - (b.status === 'resuelta'));
  return `${A.backTo(p)}
    <div><span class="eyebrow">${esc(p.name)}</span><h1 class="h-xl">Salud</h1><p class="dim" style="margin-top:6px">Lo primero que pregunta un veterinario nuevo. Mimitos no diagnostica: solo lo anota.</p></div>
    <section class="sec"><div class="sec-h"><h2>Lo que tiene o tuvo</h2><button class="link" data-act="newCond">${I('plus')} Otro</button></div>
      ${list.length ? `<div class="conds">${list.map(row).join('')}</div>` : `<div class="empty dash"><p>Nada anotado. Tocá abajo lo que te haya dicho un veterinario: queda como "Lo tiene" y le cambiás el estado con un toque.</p></div>`}
      ${common.length ? `<span class="eyebrow">Frecuentes en ${p.species === 'gato' ? 'gatos' : p.species === 'perro' ? 'perros' : 'mascotas'}</span><div class="chips" role="group" aria-label="Agregar un problema frecuente">${common.map(n => `<button type="button" class="chip" data-act="condAdd" data-n="${esc(n)}">${I('plus')} ${esc(n)}</button>`).join('')}</div>` : ''}
    </section>
    <section class="sec"><div class="sec-h"><h2>Alergias y remedios de siempre</h2><button class="link" data-act="editPet">${I('edit')} Editar</button></div>
      <div class="facts"><div><span>Alergias</span><b>${esc(p.allergies || 'Ninguna cargada')}</b></div><div><span>Remedios que toma siempre</span><b>${esc(p.chronic || 'Ninguno')}</b></div><div><span>Castración</span><b>${p.neutered === 'si' ? 'Sí' : p.neutered === 'no' ? 'No' : 'Sin dato'}</b></div></div></section>
    <section class="sec"><div class="sec-h"><h2>Remedios en curso</h2><button class="link" data-act="newMed">${I('plus')} Remedio</button></div>
      ${meds.length ? `<div class="list">${meds.map(m => A.medRow(p, m)).join('')}</div>` : '<p class="dim">Ninguno ahora.</p>'}</section>
    <section class="sec"><div class="sec-h"><h2>Cirugías</h2><button class="link" data-act="newSurg">${I('plus')} Agregar</button></div>
      ${p.surgeries.length ? `<div class="list">${p.surgeries.map(c => `<button class="row link-row" data-act="detail" data-kind="surg" data-id="${c.id}">${A.bubble('scalpel', 'perdida')}<span class="what"><b>${esc(c.name)}</b><small>${c.date ? fmt(c.date) : 'Sin fecha'}</small></span>${I('chevron')}</button>`).join('')}</div>` : `<div class="empty dash"><p>Castración, limpieza dental, una fractura: con fecha aproximada alcanza.</p></div>`}</section>`;
}
F.routes.salud = F.routes.antecedentes = render;
(F.hooks.antecedentesLabel ||= []).push(() => 'Salud');
F.actions.condSet = (b, p, cur) => {
  const c = cur.conditions.find(x => x.id === b.dataset.id); if (!c) return;
  const before = c.status; c.status = b.dataset.st; A.changed();
  A.toast(`${c.name}: ${ST.find(x => x[0] === c.status)[1].toLowerCase()}.`, { label: 'Deshacer', fn: () => { c.status = before; A.changed(); } });
};
F.actions.condAdd = (b, p, cur) => {
  const c = { id: A.uid(), name: b.dataset.n, status: 'activa', since: '', notes: '' };
  cur.conditions.push(c); A.changed();
  A.toast(`${c.name}: lo tiene. Cambiale el estado si hace falta.`, { label: 'Deshacer', fn: () => { A.drop(cur.conditions, c)(); A.changed(); } });
};
F.actions.newMed = (b, p, cur) => A.medForm(cur);
window.MZSALUD = { render, ST };
})();
