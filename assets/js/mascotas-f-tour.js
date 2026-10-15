/* Mimitos · introducción de bienvenida (interruptor FEATURES.tour, prendido para el 19/10).
   La primera vez que alguien entra (después del alta de la primera mascota, o al entrar si ya tiene mascotas y nunca
   la vio) aparece un recorrido de cartelitos: cada uno ilumina la parte real de la pantalla y explica para qué sirve.
   En el celu y en la compu apunta a lo que se ve en cada una (la barra es distinta); si algo no está, esa parada se saltea.
   Se muestra una sola vez: queda en el doc de la cuenta (doc.seen.tour, así no vuelve en otro celu) y en este navegador
   como respaldo. En Cuenta, "Ver la introducción de nuevo". "Empezar de cero" la vuelve a mostrar.
   Accesible: role="dialog" con aria-modal, el resto de la página inerte, foco atrapado en el cartel, Esc = Saltar,
   el paso se anuncia a los lectores de pantalla y sin animaciones con movimiento reducido. */
(() => {
'use strict';
const A = window.MZAPP, Z = window.MZ, F = window.MZFEAT;
if (!A || !Z || !F || !F.on.tour) return;
const { esc } = Z, I = Z.icon;
const KEY = 'tour';
const today = () => Z.iso(Z.today());
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/* un elemento cuenta si se ve en pantalla (las versiones de celu y de compu se esconden con display:none) */
const visible = el => { if (!el) return false; const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
const pick = sels => { for (const s of sels) for (const el of document.querySelectorAll(s)) if (visible(el)) return el; return null; };

/* paradas: { id, sel: [candidatos en orden], t: título, d: texto, when?: condición } */
function stops() {
  const p = A.curPet(), n = esc(p?.name || 'tu mascota');
  return [
    { id: 'ficha', sel: ['#app .phero .ps-top'], t: `La ficha de ${n}`, d: 'Con el lápiz cambiás su foto, sus datos y su color. El color pinta su inicio, su libreta y su QR.' },
    { id: 'estado', sel: ['#app .phero .pstats'], t: 'Su estado, de un vistazo', d: 'Vacunas, antiparasitario, control y peso. Cuando algo le toca, aparece un botón ("Ya se la di" o "Ya se la puse") para anotarlo en un toque.' },
    { id: 'cargar', sel: ['.top .btn.lime[data-act=add]', '#nav .nav-plus', '#nav .nav-add'], t: '+ Cargar', d: 'Vacunas, pipetas, consultas, peso, gastos o estudios: todo entra por acá.' },
    { id: 'libreta', sel: ['.top .tnav a[href="#/libreta"]', '#nav a[href="#/libreta"]'], t: 'Libreta', d: `Su libreta sanitaria digital, como la del vete. De ahí sacás el PDF${F.on.vete ? ' y la hoja Para el vete' : ''}.` },
    { id: 'agenda', sel: ['.top .tnav a[href="#/agenda"]', '#nav a[href="#/agenda"]'], t: 'Agenda y avisos', d: 'Todas las fechas de tus mascotas. Con los avisos prendidos, te llega un recordatorio al celu antes de cada dosis.' },
    { id: 'preguntar', sel: ['.top .ask-cta', '.top .ask-ic', '#app .ask-home'], t: 'Preguntale a Mimitos', d: 'Preguntale lo que quieras sobre lo que cargaste, por ejemplo cuándo fue la última pipeta. No reemplaza al veterinario.' },
    { id: 'mefui', sel: ['.top .tnav-mf', '.top a[href="#/mefui"]'], t: 'Me fui', d: 'Cuando salís, te avisa cuánto tiempo lleva sola. Con un celu viejo como cámara, sabés si ladra o maúlla.', when: () => A.mefui },
    { id: 'cuenta', sel: ['.top a.me', '#hi a.me'], t: 'Tu cuenta', d: 'Conectá tu mail para traer los estudios solos. El QR del collar y el link para quien la cuida están en Accesos rápidos, en Inicio.' },
  ].filter(s => !s.when || s.when());
}
const FINAL = () => { const n = esc(A.curPet()?.name || 'tu mascota'); return { id: 'fin', t: 'Listo, ya la conocés', d: `Empezá cargando la próxima vacuna de ${n}: así te avisamos a tiempo.` }; };

/* ---------- vista ---------- */
let st = null;          // { list, i, root, spot, card, live, back, inertEls }
let forced = false, timer = 0;
const isOpen = () => Boolean(st);

function build() {
  const root = document.createElement('div');
  root.className = 'tour' + (reduced() ? ' still' : '');
  root.innerHTML = `<div class="tour-shade" aria-hidden="true"></div><div class="tour-spot" aria-hidden="true"></div>
    <section class="tour-card" role="dialog" aria-modal="true" aria-labelledby="tourT" aria-describedby="tourD">
      <div class="tour-h"><span class="tour-n" id="tourN"></span><button type="button" class="tour-skip" data-tour="skip">Saltar</button></div>
      <h2 id="tourT"></h2><p id="tourD"></p>
      <div class="tour-dots" aria-hidden="true"></div>
      <div class="tour-acts"><button type="button" class="btn sm ghost" data-tour="back">${I('back')} Atrás</button><button type="button" class="btn sm" data-tour="next"></button></div>
    </section>
    <p class="sr" aria-live="polite" id="tourLive"></p>`;
  document.body.appendChild(root);
  return root;
}

function open(list) {
  if (st) return;
  const back = document.activeElement;
  const root = build();
  /* el resto de la página no recibe foco ni lo leen los lectores mientras está el cartel */
  const inertEls = [...document.body.children].filter(el => el !== root && !el.hasAttribute('inert') && el.tagName !== 'SCRIPT');
  inertEls.forEach(el => el.setAttribute('inert', ''));
  st = { list: [...list, FINAL()], i: 0, root, spot: root.querySelector('.tour-spot'), card: root.querySelector('.tour-card'), live: root.querySelector('#tourLive'), back, inertEls };
  root.addEventListener('click', onClick);
  document.addEventListener('keydown', onKey, true);
  addEventListener('resize', place); addEventListener('scroll', onScroll, { passive: true });
  document.body.classList.add('tour-on');
  show(0);
}

function close(done) {
  if (!st) return;
  const s = st; st = null;
  removeEventListener('resize', place); removeEventListener('scroll', onScroll);
  document.removeEventListener('keydown', onKey, true);
  s.inertEls.forEach(el => el.removeAttribute('inert'));
  document.body.classList.remove('tour-on');
  s.root.remove();
  markSeen();
  if (done === 'vacuna') { const p = A.curPet(); if (p && A.recForm) return A.recForm(p); }
  (s.back && document.contains(s.back) ? s.back : document.getElementById('app'))?.focus?.({ preventScroll: true });
}

function show(i) {
  const s = st; s.i = Math.max(0, Math.min(i, s.list.length - 1));
  const step = s.list[s.i], last = s.i === s.list.length - 1;
  /* si el elemento desapareció (cambió la pantalla), esa parada se saltea */
  step.el = step.sel ? pick(step.sel) : null;
  if (step.sel && !step.el) { s.list.splice(s.i, 1); return show(s.i); }
  const total = s.list.length;
  s.card.querySelector('#tourN').textContent = `${s.i + 1} de ${total}`;
  s.card.querySelector('#tourT').textContent = step.t;
  s.card.querySelector('#tourD').textContent = step.d;
  s.card.querySelector('.tour-dots').innerHTML = s.list.map((_, k) => `<i class="${k === s.i ? 'on' : ''}"></i>`).join('');
  const bk = s.card.querySelector('[data-tour=back]'), nx = s.card.querySelector('[data-tour=next]');
  bk.hidden = s.i === 0;
  nx.innerHTML = last ? `${I('plus')} Cargar su vacuna` : `Siguiente ${I('next')}`;
  s.card.querySelector('[data-tour=skip]').textContent = last ? 'Después' : 'Saltar';
  s.card.classList.toggle('final', last);
  s.live.textContent = `Paso ${s.i + 1} de ${total}. ${step.t}. ${step.d}`;
  if (step.el) {
    /* lo de la barra de arriba (fija) no se scrollea; lo del contenido se centra en la pantalla */
    if (!step.el.closest('.top, #nav')) step.el.scrollIntoView({ block: 'center', behavior: 'auto' });
  }
  s.card.classList.remove('in'); void s.card.offsetWidth; s.card.classList.add('in');
  place();
  nx.focus({ preventScroll: true });
}

/* el cartel va abajo o arriba del elemento (o al costado en la compu), nunca encima; si no entra, del lado con más lugar */
const GAP = 12, M = 16, PAD = 6;
function place() {
  const s = st; if (!s) return;
  const step = s.list[s.i], vw = document.documentElement.clientWidth, vh = innerHeight;
  const card = s.card, cw = Math.min(360, vw - 2 * M);
  card.style.width = cw + 'px';
  const ch = card.offsetHeight;
  if (!step.el || !visible(step.el)) {
    s.spot.hidden = true; s.root.classList.add('no-spot');
    card.style.left = Math.round((vw - cw) / 2) + 'px'; card.style.top = Math.round(Math.max(M, (vh - ch) / 2)) + 'px';
    return;
  }
  s.spot.hidden = false; s.root.classList.remove('no-spot');
  const r = step.el.getBoundingClientRect();
  const t = { l: r.left - PAD, t: r.top - PAD, w: r.width + 2 * PAD, h: r.height + 2 * PAD };
  Object.assign(s.spot.style, { left: t.l + 'px', top: t.t + 'px', width: t.w + 'px', height: t.h + 'px' });
  const below = vh - (t.t + t.h) - GAP - M, above = t.t - GAP - M;
  const right = vw - (t.l + t.w) - GAP - M, left = t.l - GAP - M;
  let x, y;
  if (below >= ch) { y = t.t + t.h + GAP; x = t.l + t.w / 2 - cw / 2; }
  else if (above >= ch) { y = t.t - GAP - ch; x = t.l + t.w / 2 - cw / 2; }
  else if (right >= cw) { x = t.l + t.w + GAP; y = t.t + t.h / 2 - ch / 2; }
  else if (left >= cw) { x = t.l - GAP - cw; y = t.t + t.h / 2 - ch / 2; }
  else if (below >= above) { y = vh - M - ch; x = (vw - cw) / 2; }
  else { y = M; x = (vw - cw) / 2; }
  x = Math.max(M, Math.min(x, vw - M - cw)); y = Math.max(M, Math.min(y, vh - M - ch));
  card.style.left = Math.round(x) + 'px'; card.style.top = Math.round(y) + 'px';
  card.dataset.side = y >= t.t + t.h ? 'abajo' : y + ch <= t.t ? 'arriba' : 'costado';
}
let raf = 0;
const onScroll = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(place); };

function onClick(e) {
  const b = e.target.closest('[data-tour]'); if (!b || !st) return;
  const a = b.dataset.tour, last = st.i === st.list.length - 1;
  if (a === 'skip') return close();
  if (a === 'back') return show(st.i - 1);
  if (a === 'next') return last ? close('vacuna') : show(st.i + 1);
}
function onKey(e) {
  if (!st) return;
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); return close(); }
  if (e.key === 'Tab') {
    const f = [...st.card.querySelectorAll('button:not([hidden]):not([disabled])')];
    if (!f.length) return;
    const i = f.indexOf(document.activeElement);
    e.preventDefault();
    f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
    return;
  }
  if (e.key === 'ArrowRight' && st.i < st.list.length - 1) { e.preventDefault(); show(st.i + 1); }
  if (e.key === 'ArrowLeft' && st.i > 0) { e.preventDefault(); show(st.i - 1); }
}

/* ---------- cuándo aparece ---------- */
const seen = () => Boolean(A.doc?.seen?.tour) || Boolean(A.store.get(KEY));
function markSeen() {
  const d = today();
  A.store.set(KEY, d);
  if (A.doc?.seen?.tour) return;
  A.doc.seen = { ...(A.doc.seen || {}), tour: d };
  A.changed();
}
function maybeStart() {
  clearTimeout(timer);
  if (st || A.mode !== 'full' || A.route.name !== 'inicio' || !A.doc.pets.length) return;
  if (!forced && seen()) return;
  /* deja que termine de dibujarse (y que se vaya el toast del alta) antes de medir */
  timer = setTimeout(() => {
    if (st || A.mode !== 'full' || A.route.name !== 'inicio' || document.querySelector('dialog[open]')) return;
    if (!forced && seen()) return;
    const list = stops().filter(s => pick(s.sel));
    if (!list.length) return;
    forced = false;
    open(list);
  }, 700);
}
(F.hooks.afterRender ||= []).push(maybeStart);
/* "Empezar de cero" la vuelve a mostrar (el doc nuevo ya no tiene seen) */
(F.hooks.afterReset ||= []).push(() => { try { localStorage.removeItem('mimitos:' + KEY); } catch {} });
(F.hooks.cuentaAjustes ||= []).push(() => `<button class="row link-row" data-act="tourAgain">${A.bubble('sparkle', 'salud')}<span class="what"><b>Ver la introducción de nuevo</b><small>Un recorrido corto por las partes de Mimitos</small></span>${I('chevron')}</button>`);
F.actions.tourAgain = () => {
  if (!A.doc.pets.length) return A.toast('Primero cargá a tu mascota.');
  forced = true;
  if (A.route.name === 'inicio') return maybeStart();
  A.go('inicio');
};
window.MZTOUR = { stops, open, close, isOpen, place, get step() { return st ? { i: st.i, n: st.list.length, id: st.list[st.i].id } : null; } };
})();
