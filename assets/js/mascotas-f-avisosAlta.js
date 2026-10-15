/* Mimitos · F4 "Avisos como último paso del alta" (interruptor FEATURES.avisosAlta). Lo que se vende es "te avisamos":
   al terminar el alta, si los avisos están apagados, una pantalla más los activa en el celu o, en iPhone sin instalar,
   muestra los 3 pasos para agregarla al inicio. También ofrece el mail. Se puede saltear. */
(() => {
'use strict';
const A = window.MZAPP, Z = window.MZ, F = window.MZFEAT;
if (!A || !Z || !F || !F.on.avisosAlta) return;
const { esc, fmt } = Z, I = Z.icon, $ = s => document.querySelector(s);
let st = null;
function render() {
  const p = A.petById(st?.pet) || A.curPet(); if (!p) { A.go('inicio'); return ''; }
  const n = A.notify, on = A.pushHere || (n && (n.devices || n.mail));
  const ios = A.isIOS && !A.standalone(), canPush = A.pushSupported() && !ios;
  const how = on ? `<div class="banner ok-b">${A.bubble('check', 'salud')}<span style="flex:1"><b>Los avisos ya están activados</b><small class="dim">Te avisamos 3 días antes y el mismo día, a la mañana.</small></span></div>`
    : ios ? `<div class="ios-steps"><b>En iPhone, primero agregala al inicio</b><ol><li>Tocá <b>Compartir</b> abajo en Safari (el cuadrado con la flecha).</li><li>Elegí <b>Agregar a inicio</b>.</li><li>Abrí Mimitos desde el ícono y tocá la campana: ahí se activan.</li></ol><small class="dim">Necesita iOS 16.4 o más nuevo. Mientras tanto, te podemos avisar por mail.</small></div>`
    : canPush ? `<button type="button" class="btn big wide" id="aOn" data-act="aaPush">${I('bell')} Activar avisos en este celu</button>`
    : `<p class="note">Este navegador no acepta avisos en el celu. Te podemos avisar por mail.</p>`;
  const nx = st?.next ? ` La próxima es ${esc(st.next)}.` : '';
  return `<section class="sec onboard" aria-live="polite">
    <div class="ob-top"><span></span><span class="eyebrow">Último paso</span></div>
    <div class="progress" style="--n:1" aria-hidden="true"><i class="on"></i></div>
    <h1>¿Te avisamos antes de cada fecha?</h1><p class="sub">${esc(p.name)} ya está en Mimitos.${nx} Así no se te pasa ninguna vacuna ni pipeta.</p>
    ${how}<p class="amsg" id="aMsg" role="status" hidden></p>
    ${n?.mail ? '' : `<label class="toggle"><input type="checkbox" id="aaMail" ${on || canPush ? '' : 'checked'}><span><b>También por mail</b><br><small class="dim">Un solo mail a la mañana con lo del día, a ${esc(A.me.email || 'tu casilla')}.</small></span></label>`}
    <div class="ob-actions"><button class="btn ${canPush && !on ? 'ghost' : 'big'} wide" data-act="aaDone">Listo, ver a ${esc(p.name)}</button></div>
  </section>`;
}
F.routes['alta-avisos'] = render;
F.bare.push('alta-avisos');
(F.hooks.afterOnboard ||= []).push((p, nx, avOff) => {
  if (!avOff) return false;
  st = { pet: p.id, next: nx ? `${nx.r.name}, el ${fmt(nx.r.next || nx.r.date, { day: 'numeric', month: 'short' })}` : '' };
  A.go('alta-avisos'); return true;
});
F.actions.aaPush = () => A.enablePush();
F.actions.aaDone = async () => {
  const m = $('#aaMail');
  if (m?.checked) { try { await A.notifyPost({ mail: true }); } catch {} }
  const on = A.pushHere || A.notify?.devices || A.notify?.mail;
  A.go('inicio'); A.toast(on ? 'Listo. Te avisamos antes de cada fecha.' : 'Listo. Cuando quieras, los avisos están en la campana de arriba.');
};
window.MZAVISOSALTA = { render, get state() { return st; } };
})();
