/* Mimitos · F2 "Restaurar una copia" (interruptor FEATURES.restaurar). En Cuenta: se elige el JSON que bajó "Exportar copia",
   se ve qué trae (mascotas, registros y fecha) y se confirma dos veces antes de reemplazar. Se puede deshacer unos segundos.
   El servidor vuelve a limpiar todo al guardar (cleanDoc), así que un archivo raro no entra. */
(() => {
'use strict';
const A = window.MZAPP, Z = window.MZ, F = window.MZFEAT;
if (!A || !Z || !F || !F.on.restaurar) return;
const { esc, fmt } = Z, I = Z.icon, $ = s => document.querySelector(s);
const MAX = 8 * 1024 * 1024;
const valid = d => Boolean(d && d.app === 'mimitos-by-orbit' && Array.isArray(d.pets) && d.pets.every(x => x && typeof x === 'object' && typeof x.name === 'string'));
const n = l => (Array.isArray(l) ? l.length : 0);
const count = d => d.pets.reduce((a, x) => a + n(x.records) + n(x.visits) + n(x.studies) + n(x.symptoms) + n(x.weights) + n(x.expenses) + n(x.meds), 0);
async function read(file) { if (!file || file.size > MAX) return null; try { const d = JSON.parse(await file.text()); return valid(d) ? d : null; } catch { return null; } }
function pick() {
  const i = document.createElement('input'); i.type = 'file'; i.accept = 'application/json,.json';
  i.onchange = async () => { const d = await read(i.files[0]); if (i.files[0]) d ? preview(d) : wrong(); };
  i.click();
}
function wrong() {
  A.panel('Restaurar una copia', `<p class="amsg err">Ese archivo no es una copia de Mimitos. Elegí el .json que bajaste con "Exportar copia de tus datos".</p><button class="btn ghost wide" data-rs="again">Elegir otro archivo</button>`);
  $('#pBody').onclick = e => { if (e.target.closest('[data-rs]')) { A.dPanel.close(); setTimeout(pick, 0); } };
}
function preview(d) {
  const regs = count(d), now = A.doc.pets.length;
  const when = d.exportedAt ? fmt(String(d.exportedAt).slice(0, 10), { day: 'numeric', month: 'long', year: 'numeric' }) : 'fecha desconocida';
  A.panel('Restaurar una copia', `<div class="rs-sum"><b>${d.pets.length} ${d.pets.length === 1 ? 'mascota' : 'mascotas'}, ${regs} ${regs === 1 ? 'registro' : 'registros'}</b><small>Copia del ${esc(when)}: ${esc(d.pets.map(x => x.name).join(', ') || 'sin mascotas')}</small></div>
    <p class="amsg err"><b>Reemplaza todo lo que hay ahora en Mimitos</b>${now ? ` (${now} ${now === 1 ? 'mascota' : 'mascotas'})` : ''}. Los turnos y los avisos no se tocan. Si te arrepentís, tenés unos segundos para deshacerlo.</p>
    <button class="btn wide rs-go" id="rsGo" data-step="1">Reemplazar todo</button><button class="btn ghost wide" data-close>Cancelar</button>`);
  const b = $('#rsGo');
  b.onclick = () => {
    if (b.dataset.step === '1') { b.dataset.step = '2'; b.textContent = 'Sí, reemplazar todo con la copia'; b.classList.add('armed'); b.focus(); return; }
    apply(d);
  };
}
function apply(d) {
  const doc = A.doc, prev = doc.pets, prevCur = A.curId;
  doc.pets = d.pets.map(x => A.norm(JSON.parse(JSON.stringify(x))));
  A.curId = doc.pets[0]?.id || ''; A.dPanel.close(); A.changed(); A.go('inicio');
  A.toast(`Listo: restauramos ${doc.pets.length} ${doc.pets.length === 1 ? 'mascota' : 'mascotas'} de la copia.`, { label: 'Deshacer', fn: () => { doc.pets = prev; A.curId = prevCur; A.changed(); A.toast('Listo, volvió a como estaba.'); } });
}
(F.hooks.exportSub ||= []).push(() => 'Un archivo con todo lo que cargaste, para guardarlo en tu compu o en Drive. Lo podés volver a cargar acá abajo.');
(F.hooks.cuentaAjustes ||= []).push(() => `<button class="row link-row" data-act="restore">${A.bubble('copy', 'viaje')}<span class="what"><b>Restaurar una copia</b><small>Elegís el archivo, ves qué trae y confirmás dos veces antes de reemplazar.</small></span>${I('chevron')}</button>`);
F.actions.restore = () => pick();
window.MZRESTORE = { valid, count, preview, apply };
})();
