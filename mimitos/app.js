/* Mimitos · landing V2 · motion system
   - Texto: máscara vertical + desplazamiento corto + stagger moderado (reveal()).
   - UI: resorte suave (SPR) y snap. Datos: count-up, barras y piezas que viajan a su destino (travel()).
   - Escenas sticky: el CSS hace el sticky; ScrollTrigger solo mapea el progreso del scroll a un timeline (scrub()).
   - Demos automáticas: arrancan al entrar en pantalla, se pausan al salir y respiran entre vueltas (auto()).
   - prefers-reduced-motion: no se arma nada; queda el estado final que define el CSS (.rm). */
(() => {
'use strict';
const CHECKOUT = '/producto.html?id=ob-018';           // ficha real de orbit-web (carrito + /api/checkout)
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const root = document.documentElement;
const fmt = n => Math.round(n).toLocaleString('es-AR');

/* ---------- lo que funciona con o sin motion ---------- */
$$('[data-buy]').forEach(a => { a.href = CHECKOUT; });
const spot = $('#spot'), spotV = $('#spotVideo');
$$('[data-spot]').forEach(b => b.addEventListener('click', () => { spot.showModal(); spotV.play().catch(() => {}); }));
spot.addEventListener('click', e => { if (e.target === spot || e.target.closest('[data-close]')) spot.close(); });
spot.addEventListener('close', () => spotV.pause());

/* cambiar de mascota en el Inicio del hero: el universo cambia de color */
const PETS = {
  felisa: { src: '/mimitos/media/fotos/felisa.webp', name: 'Felisa', breed: 'Gata · 3 años', vac: 'Al día', drop: '28 oct', cal: '14 nov · 18:30', kg: '4,2 kg', docs: '3 estudios', food: 'Alimento · 5 días', alt: 'Felisa, una gata tricolor, recortada sobre su color' },
  aika:   { src: '/mimitos/media/fotos/aika.webp', name: 'Aika', breed: 'Golden · 4 años', vac: 'Al día', drop: '2 nov', cal: 'Mañana · 18:30', kg: '30 kg', docs: '5 estudios', food: 'Alimento · 9 días', alt: 'Aika, una golden, recortada sobre su color' },
};
const hero = $('#top'), heroPet = $('#heroPet');
function setPet(k) {
  const d = PETS[k]; if (!d || hero.dataset.pet === k) return;
  hero.dataset.pet = k;
  $$('.pav').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.pick === k)));
  const swap = () => { heroPet.src = d.src; heroPet.alt = d.alt; $$('[data-f]', hero).forEach(el => { el.textContent = d[el.dataset.f]; }); };
  if (!window.gsap || root.classList.contains('rm')) return swap();
  gsap.timeline()
    .to(heroPet, { scale: .85, opacity: 0, duration: .25, ease: 'power2.in' })
    .add(swap)
    .to(heroPet, { scale: 1, opacity: 1, duration: .6, ease: 'back.out(1.8)' })
    .fromTo($$('.tile b, .home-name b', hero), { y: 8, opacity: 0 }, { y: 0, opacity: 1, stagger: .04, duration: .4, ease: 'expo.out' }, '<');
}
$$('.pav').forEach(b => b.addEventListener('click', () => setPet(b.dataset.pick)));

/* partir títulos en renglones para la máscara */
$$('[data-split]').forEach(el => { el.innerHTML = el.innerHTML.split(/<br\s*\/?>/i).map(p => `<span class="ln"><span>${p.trim()}</span></span>`).join(''); });

/* versión del hero para revisar: ?hero=a|b|c (A por defecto) */
const HV = (new URLSearchParams(location.search).get('hero') || 'a').toLowerCase().replace(/[^abc]/g, '') || 'a';
document.body.dataset.hero = HV;
$$('.review-switch button').forEach(b => { b.setAttribute('aria-pressed', String(b.dataset.hv === HV)); b.addEventListener('click', () => { const u = new URL(location.href); u.searchParams.set('hero', b.dataset.hv); u.hash = ''; location.href = u.toString(); }); });

const reduce = matchMedia('(prefers-reduced-motion: reduce)');
if (!window.gsap || !window.ScrollTrigger || reduce.matches) { root.classList.add('rm'); return; }
gsap.registerPlugin(ScrollTrigger);

const E = 'expo.out', IO = 'power3.inOut', SPR = 'back.out(1.7)';
/* posición de un elemento relativa a otro (para piezas que viajan) */
const rel = (el, box) => { const a = el.getBoundingClientRect(), b = box.getBoundingClientRect(); return { x: a.left - b.left, y: a.top - b.top, w: a.width, h: a.height }; };
/* una pieza viaja de A a B dentro de "box": se calcula al primer render del tween, cuando A y B ya están en su lugar */
function travel(tl, piece, from, to, box, at, dur = .9) {
  tl.set(piece, { x: () => rel(from, box).x, y: () => rel(from, box).y, opacity: 0, scale: .9 }, at)
    .to(piece, { opacity: 1, scale: 1.05, duration: dur * .2, ease: 'power2.out' }, at)
    .to(piece, { x: () => rel(to, box).x, y: () => rel(to, box).y, scale: .95, duration: dur * .65, ease: IO }, at + dur * .2)
    .to(piece, { opacity: 0, duration: dur * .15 }, at + dur * .85);
}
const scrub = (trigger, tl, extra = {}) => ScrollTrigger.create({ trigger, start: 'top top', end: 'bottom bottom', scrub: .6, animation: tl, invalidateOnRefresh: true, ...extra });
function auto(trigger, tl, start = 'top 65%') {
  tl.pause();
  ScrollTrigger.create({ trigger, start, end: 'bottom 15%', onEnter: () => tl.play(), onEnterBack: () => tl.play(), onLeave: () => tl.pause(), onLeaveBack: () => tl.pause() });
  return tl;
}

const mm = gsap.matchMedia();
mm.add({ mobile: '(max-width: 899px)', desk: '(min-width: 900px)' }, ctx => {
  const { mobile } = ctx.conditions;
  const PN = [];
  /* ---------- reveals de texto (un solo patrón) ---------- */
  const heads = $$('[data-split]').filter(h => h.id !== 'hero-h');
  heads.forEach(h => gsap.set($$('.ln>span', h), { yPercent: 110, opacity: 0 }));
  ScrollTrigger.batch(heads, { start: 'top 86%', once: true, onEnter: els => els.forEach(h => gsap.to($$('.ln>span', h), { yPercent: 0, opacity: 1, duration: .9, ease: E, stagger: .08 })) });
  const fades = $$('[data-fade]').filter(f => !f.closest('#top'));
  gsap.set(fades, { y: 18, opacity: 0 });
  ScrollTrigger.batch(fades, { start: 'top 90%', once: true, onEnter: els => gsap.to(els, { y: 0, opacity: 1, duration: .8, ease: E, stagger: .1 }) });

  /* nav y CTA fija */
  const nav = $('#nav');
  ScrollTrigger.create({ start: 40, end: 'max', onToggle: s => nav.classList.toggle('solid', s.isActive) });
  ScrollTrigger.create({ trigger: '#afterLib', start: 'top 70%', endTrigger: '#precio', end: 'top 85%', toggleClass: { targets: '#stickyBuy', className: 'show' } });

  /* texto del hero: igual en las tres versiones */
  function heroCopy() {
    return gsap.timeline().from($$('#hero-h .ln>span'), { yPercent: 110, opacity: 0, duration: 1, ease: E, stagger: .1 })
      .from(['.hero-sub', '.buy'], { y: 18, opacity: 0, duration: .8, ease: E, stagger: .12 }, .45);
  }

  /* ================= 1B · HERO collage: la mascota y Mimitos trabajando alrededor ================= */
  if (HV === 'b') {
    const cards = $$('.cbc').filter(c => getComputedStyle(c).display !== 'none'), v = $('.cbc.c2 video');
    const tl = gsap.timeline({ delay: .15 });
    tl.add(heroCopy(), 0)
      .from('.cb-disc', { scale: .4, opacity: 0, duration: 1, ease: E }, .2)
      .from('.cb-pet', { y: 40, opacity: 0, duration: 1, ease: 'back.out(1.4)' }, .35)
      .from(cards, { opacity: 0, scale: .7, y: 20, duration: .7, ease: SPR, stagger: .18 }, .9)
      .add(() => { v.preload = 'auto'; v.play().catch(() => {}); }, 1.2);
    cards.forEach((c, i) => gsap.to(c, { y: i % 2 ? 7 : -7, duration: 2.4 + i * .3, ease: 'sine.inOut', yoyo: true, repeat: -1, delay: 2 + i * .2 }));
    const ping = gsap.timeline({ repeat: -1, delay: 3.5 });
    cards.forEach(c => ping.to(c, { scale: 1.06, duration: .3, ease: 'power2.out' }).to(c, { scale: 1, duration: .5, ease: E }).to({}, { duration: 1.6 }));
    ScrollTrigger.create({ trigger: '#top', start: 'top top', end: 'bottom top', onToggle: s => { s.isActive ? (ping.resume(), v.play().catch(() => {})) : (ping.pause(), v.pause()); } });
    if (!mobile && matchMedia('(pointer:fine)').matches) {
      const box = $('.cb'), qx = gsap.quickTo('.cb-pet', 'x', { duration: .8, ease: 'power3' });
      const onMove = e => { const r = box.getBoundingClientRect(); qx(((e.clientX - r.left) / r.width - .5) * 14); };
      box.addEventListener('pointermove', onMove); ctx.add(() => () => box.removeEventListener('pointermove', onMove));
    }
  }

  /* ================= 1C · HERO en vivo: un celu viejo en casa y el tuyo ================= */
  if (HV === 'c') {
    const v = $('.cc-mine video');
    const tl = gsap.timeline({ delay: .15 });
    tl.add(heroCopy(), 0)
      .from('.cc-mine', { x: 60, opacity: 0, duration: 1, ease: E }, .3)
      .from('.cc-old', { x: -50, rotation: -16, opacity: 0, duration: 1, ease: E }, .5)
      .from('.cc-tag', { opacity: 0, duration: .6 }, 1.2)
      .add(() => { v.preload = 'auto'; v.play().catch(() => {}); }, .6);
    const lv = gsap.to('#ccMeter', { scaleX: () => gsap.utils.random(.08, .5), duration: .18, repeat: -1, repeatRefresh: true, ease: 'none' });
    const push = gsap.timeline({ repeat: -1, repeatDelay: 3, delay: 2.4 });
    push.to('#ccMeter', { scaleX: 1, duration: .2 })
      .fromTo('#ccPush', { opacity: 0, y: -20 }, { opacity: 1, y: 0, duration: .5, ease: SPR }, .2)
      .to('#ccPush', { keyframes: [{ x: -4, duration: .05 }, { x: 4, duration: .05 }, { x: 0, duration: .05 }] }, .7)
      .to('#ccPush', { opacity: 0, y: -12, duration: .4, ease: 'power2.in' }, 3.6);
    ScrollTrigger.create({ trigger: '#top', start: 'top top', end: 'bottom top', onToggle: s => { [lv, push].forEach(t => s.isActive ? t.resume() : t.pause()); s.isActive ? v.play().catch(() => {}) : v.pause(); } });
  }

  /* ================= 2 · se acuerda por vos: caos → un aviso → Mimitos ================= */
  {
    const dcs = $$('.dc').filter(d => getComputedStyle(d).display !== 'none'), lock = $('#lock'), first = $('#lock .an-1'), rest = $$('#lock .an').filter(a => a !== first);
    const fill = $('#bagFill'), pct = $('#bagPct'), o = { p: 100 };
    const draw = () => { fill.style.transform = `scaleX(${o.p / 100})`; pct.textContent = Math.round(o.p); };
    const tl = gsap.timeline({ defaults: { ease: 'none' } });
    tl.set('.rc-l.l3', { opacity: 0 }, 0).set(lock, { opacity: 0, scale: .92 }, 0).set($$('#lock .an'), { opacity: 0, y: -16 }, 0).call(() => { o.p = 100; draw(); }, null, 0)
      .fromTo('.rc-l.l1', { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: .4, ease: 'power2.out' }, 0)
      .fromTo(dcs, { opacity: 0, scale: .6, rotation: () => gsap.utils.random(-10, 10) }, { opacity: 1, scale: 1, duration: .35, stagger: { each: .04, from: 'random' }, ease: 'back.out(2)' }, .1)
      .to('.rc-l.l1', { opacity: 0, y: -30, duration: .3, ease: 'power2.in' }, 1.25)
      .fromTo('.rc-l.l2', { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: .4, ease: 'power2.out' }, 1.45)
      /* todo se junta en un solo aviso */
      .to(lock, { opacity: 1, scale: 1, duration: .4, ease: 'power2.out' }, 1.6)
      .to(dcs, { x: (i, el) => { const a = el.getBoundingClientRect(), b = first.getBoundingClientRect(); return b.left + b.width / 2 - (a.left + a.width / 2); },
                 y: (i, el) => { const a = el.getBoundingClientRect(), b = first.getBoundingClientRect(); return b.top + b.height / 2 - (a.top + a.height / 2); },
                 scale: .3, opacity: 0, rotation: 0, duration: .6, stagger: .02, ease: 'power3.in' }, 1.7)
      .to(first, { opacity: 1, y: 0, duration: .35, ease: SPR }, 2.3)
      .to('.rc-l.l2', { opacity: 0, y: -30, duration: .3, ease: 'power2.in' }, 2.9)
      .fromTo('.rc-l.l3', { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: .4, ease: 'power2.out' }, 3.1)
      .to(rest, { opacity: 1, y: 0, duration: .35, stagger: .25, ease: SPR }, 3.3)
      .to(o, { p: 12, duration: .9, onUpdate: draw }, 3.6)
      .to({}, { duration: .5 });
    scrub('#recuerda', tl);
  }

  /* ================= 1A · HERO vidriera: caos → orden → funciones que pasan solas ================= */
  if (HV === 'a') {
    const world = $('#hbox'), home = $('#home'), abs = $('#absorb');
    const frs = $$('.fr', world).filter(f => getComputedStyle(f).display !== 'none');
    const tiles = $$('.tile', home), minis = $$('.mini', home);
    gsap.set(heroPet, { xPercent: -50, yPercent: -50, x: 0, y: 0, scale: 1.08 });
    gsap.set(home, { clipPath: 'circle(0% at 50% 28%)' });
    gsap.set(tiles.concat(minis, [$('.home-name', home), $('.pets-sw', home)]), { opacity: 0, y: 14 });
    const tl = gsap.timeline({ delay: .15 });
    tl.add(heroCopy(), 0)
      .from(heroPet, { scale: .5, opacity: 0, duration: 1, ease: 'back.out(1.5)' }, .25)
      /* las piezas sueltas llegan desordenadas */
      .fromTo(frs, { opacity: 0, scale: .6, x: () => gsap.utils.random(-60, 60), y: () => gsap.utils.random(-40, 40) },
        { opacity: 1, scale: 1, x: 0, y: 0, duration: .8, ease: SPR, stagger: { each: .07, from: 'random' } }, .7)
      .to(frs, { y: () => gsap.utils.random(-7, 7), rotation: () => gsap.utils.random(-4, 4), duration: .7, ease: 'sine.inOut', stagger: .03 }, 1.6)
      /* Mimitos las absorbe */
      .addLabel('absorb', 2.55)
      .to(frs, { x: (i, el) => { const a = el.getBoundingClientRect(), b = heroPet.getBoundingClientRect(); return b.left + b.width / 2 - (a.left + a.width / 2); },
        y: (i, el) => { const a = el.getBoundingClientRect(), b = heroPet.getBoundingClientRect(); return b.top + b.height / 2 - (a.top + a.height / 2); },
        scale: .2, opacity: 0, rotation: 0, duration: .65, ease: 'power3.in', stagger: .035 }, 'absorb')
      .fromTo(abs, { scale: .3, opacity: 0 }, { keyframes: [{ scale: .9, opacity: 1, duration: .25 }, { scale: 2.2, opacity: 0, duration: .55 }], ease: 'power2.out' }, 'absorb+=.55')
      .to(heroPet, { scale: 1.08, duration: .2, yoyo: true, repeat: 1, ease: 'power2.out' }, 'absorb+=.55')
      /* y todo queda ordenado alrededor de ella */
      .to(home, { clipPath: 'circle(150% at 50% 28%)', duration: 1.1, ease: IO }, 'absorb+=.8')
      .to(heroPet, { yPercent: -97, scale: 1, duration: 1.1, ease: IO }, 'absorb+=.8')
      .to([$('.pets-sw', home), $('.home-name', home)], { opacity: 1, y: 0, duration: .6, ease: E, stagger: .08 }, 'absorb+=1.4')
      .to(tiles, { opacity: 1, y: 0, duration: .7, ease: SPR, stagger: .08 }, 'absorb+=1.5')
      .to(minis, { opacity: 1, y: 0, duration: .6, ease: SPR, stagger: .07 }, 'absorb+=1.85')
      .add(() => startReel(), '+=.6');

    /* vidriera: en el mismo lugar de la ficha van pasando solas las mejores funciones */
    const slides = $$('.sl', world), bars = $$('.reel-bars button'), cap = $('#reelCap');
    const CAPS = [['Su ficha.', 'Todo lo que le toca, de un vistazo.'], ['En vivo.', 'Un celu viejo en casa la acompaña y te avisa si ladra.'], ['Estudios del mail.', 'Mimitos los encuentra y los suma a su historial.'],
      ['Preguntale.', 'Responde con sus datos y te dice de dónde salió.'], ['Chapita con QR.', 'Si alguien la encuentra, te enterás al toque.']];
    const DUR = [4.5, 6, 5.5, 6, 5.5];
    let cur = 0, prog = null, inner = null, z = 5, live = true;
    const fill = (i, p) => bars[i].firstElementChild.style.setProperty('--p', p);
    const SC = {
      0: s => gsap.timeline().from(tiles, { y: 12, opacity: 0, stagger: .06, duration: .5, ease: SPR }, .2),
      1: s => { const v = $('video', s); v.preload = 'auto'; try { v.currentTime = 0; } catch (e) {} v.play().catch(() => {});
        return gsap.timeline().fromTo($$('.wv i', s), { scaleY: .25 }, { scaleY: 1, stagger: .03, duration: .3, yoyo: true, repeat: 5, ease: 'sine.inOut' }, 1.3); },
      2: s => gsap.timeline().from($('.m-mail', s), { y: -16, duration: .5, ease: E }, .3)
        .from($('.m-arrow', s), { opacity: 0, y: -10, duration: .4 }, 1)
        .fromTo($('.m-row.new', s), { opacity: 0, y: -12, backgroundColor: '#FFE38A' }, { opacity: 1, y: 0, backgroundColor: '#FFFBEE', duration: .8, ease: SPR }, 1.5)
        .from($('.m-new', s), { scale: 0, duration: .35, ease: SPR }, 2),
      3: s => { const q = $('.r-qt', s), txt = '¿Cuándo fue la última pipeta de Aika?', n = { c: 0 };
        return gsap.timeline().set($$('.r-trail > *', s), { opacity: 0, scale: .8 }).set($('.r-ans', s), { opacity: 0, y: 16 })
          .to(n, { c: txt.length, duration: 1.1, ease: 'none', onUpdate: () => { q.textContent = txt.slice(0, Math.round(n.c)); } }, .3)
          .to($$('.r-trail > *', s), { opacity: 1, scale: 1, stagger: .22, duration: .35, ease: SPR }, 1.6)
          .to($('.r-ans', s), { opacity: 1, y: 0, duration: .6, ease: E }, 2.9); },
      4: s => gsap.timeline().set([$('.r-notif', s), $('.r-pub', s)], { opacity: 0 })
        .fromTo($('.r-vf', s), { opacity: 0, scale: 1.4 }, { opacity: 1, scale: 1, duration: .45, ease: 'power3.out' }, .5)
        .to(s, { backgroundColor: '#FFFFFF', duration: .08, yoyo: true, repeat: 1 }, 1.05)
        .to($('.r-vf', s), { opacity: 0, duration: .3 }, 1.3)
        .fromTo($('.r-notif', s), { opacity: 0, y: -20 }, { opacity: 1, y: 0, duration: .5, ease: SPR }, 1.3)
        .to($('.r-notif', s), { keyframes: [{ x: -4, duration: .05 }, { x: 4, duration: .05 }, { x: 0, duration: .05 }] }, 1.8)
        .fromTo($('.r-pub', s), { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: .6, ease: SPR }, 2.4),
    };
    const run = i => {
      fill(i, 0); const o = { p: 0 };
      prog = gsap.to(o, { p: 1, duration: DUR[i], ease: 'none', onUpdate: () => fill(i, o.p), onComplete: () => go((i + 1) % slides.length) });
      if (!live) prog.pause();
    };
    const go = i => {
      if (prog) prog.kill(); if (inner) inner.kill();
      bars.forEach((b, j) => { fill(j, j < i ? 1 : 0); b.setAttribute('aria-current', String(j === i)); });
      const prev = slides[cur], next = slides[i];
      if (i !== cur) {
        gsap.to(prev, { autoAlpha: 0, scale: .95, duration: .45, ease: 'power2.in', onComplete: () => { gsap.set(prev, { scale: 1 }); const v = $('video', prev); if (v) v.pause(); } });
        gsap.to(heroPet, { autoAlpha: i === 0 ? 1 : 0, duration: i === 0 ? .6 : .3, delay: i === 0 ? .3 : 0 });
        gsap.set(next, { zIndex: ++z });
        gsap.fromTo(next, { autoAlpha: 0, scale: 1.05, clipPath: 'inset(7% 7% 7% 7% round 30px)' }, { autoAlpha: 1, scale: 1, clipPath: 'inset(0% 0% 0% 0% round 30px)', duration: .8, ease: E, delay: .15 });
        gsap.fromTo($$('[data-in]', next), { y: 18, opacity: 0 }, { y: 0, opacity: 1, stagger: .12, duration: .6, ease: SPR, delay: .35 });
        gsap.to(cap, { opacity: 0, y: -6, duration: .2, onComplete: () => { cap.innerHTML = `<b>${CAPS[i][0]}</b> ${CAPS[i][1]}`; gsap.to(cap, { opacity: 1, y: 0, duration: .4, ease: E }); } });
      }
      cur = i; inner = SC[i] ? SC[i](next).delay(.35) : null; if (inner && !live) inner.pause();
      run(i);
    };
    const startReel = () => { bars.forEach(b => b.addEventListener('click', () => go(+b.dataset.go))); bars[0].setAttribute('aria-current', 'true'); run(0); };
    ScrollTrigger.create({ trigger: '#top', start: 'top top', end: 'bottom top+=10%', onToggle: s => {
      live = s.isActive; [prog, inner].forEach(t => t && (live ? t.resume() : t.pause()));
      const v = $('video', slides[cur]); if (v) live ? v.play().catch(() => {}) : v.pause(); } });
    ctx.add(() => () => { if (prog) prog.kill(); if (inner) inner.kill(); });

    /* la mascota sigue al cursor, apenas */
    if (!mobile && matchMedia('(pointer:fine)').matches) {
      const qx = gsap.quickTo(heroPet, 'x', { duration: .8, ease: 'power3' });
      const onMove = e => { const r = world.getBoundingClientRect(); qx(((e.clientX - r.left) / r.width - .5) * 16); };
      world.addEventListener('pointermove', onMove);
      ctx.add(() => () => world.removeEventListener('pointermove', onMove));
    }
  }

  /* ================= 2 · se carga casi sola: foto + mail → su libreta (el libro real de la app) ================= */
  {
    const sec = $('#libreta'), world = $('#libWorld'), book = $('#book'), inbox = $('#libInbox');
    const leaves = $$('.leaf', world), steps = $$('#libSteps .cs'), dots = $$('.cs-dots i', sec);
    const boxMap = [['b1', 'vacuna'], ['b2', 'fecha'], ['b3', 'lab'], ['b4', 'prox']];
    const placeBoxes = () => boxMap.forEach(([b, k]) => {
      const t = $(`[data-box="${k}"]`, book), bx = $('.' + b, book);
      let x = 0, y = 0, el = t; while (el && el !== book) { x += el.offsetLeft; y += el.offsetTop; el = el.offsetParent; }
      Object.assign(bx.style, { left: x - 4 + 'px', top: y - 3 + 'px', width: t.offsetWidth + 8 + 'px', height: t.offsetHeight + 6 + 'px' });
    });
    placeBoxes(); ScrollTrigger.addEventListener('refreshInit', placeBoxes);
    ctx.add(() => () => ScrollTrigger.removeEventListener('refreshInit', placeBoxes));
    const mk = txt => { const c = document.createElement('span'); c.className = 'fly'; c.textContent = txt; world.appendChild(c); return c; };
    const chips = ['Antirrábica', '05/11/2025', 'Nobivac R A123', 'Próxima 05/11/26'].map(mk), pdfs = ['eco.pdf', 'hemograma.pdf'].map(mk);
    ctx.add(() => () => chips.concat(pdfs).forEach(c => c.remove()));
    /* dar vuelta una hoja: a mitad de camino pasa a estar arriba del lado izquierdo */
    const flip = (i, at, back = false, dur = .9) => {
      tl.to(leaves[i], { rotationY: back ? 0 : -180, duration: dur, ease: IO }, at)
        .set(leaves[i], { zIndex: back ? 3 - i : 4 + i }, at + dur / 2);
    };
    const stepAt = t => (t < 4.7 ? 0 : t < 7.6 ? 1 : 2);
    let last = -1;
    const tl = gsap.timeline({ defaults: { ease: 'none' }, onUpdate: () => { const s = stepAt(tl.time()); if (s !== last) { last = s; steps.forEach((li, i) => li.classList.toggle('on', i === s)); dots.forEach((d, i) => d.classList.toggle('on', i <= s)); } } });
    gsap.set(leaves, { rotationY: 0 });
    tl.set(['#hlVac', '#hlEco', '#hlHem'], { opacity: 0 }, 0)
      .fromTo('#rbook', { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: .6, ease: 'power2.out' }, 1.75)
      .fromTo(book, { yPercent: 25, rotation: -14, opacity: 0 }, { yPercent: 0, rotation: -4, opacity: 1, duration: .9, ease: 'power2.out' }, 0);
    flip(0, .55);                                                     /* se abre en Vacunas */
    tl.fromTo('.viewfinder', { opacity: 0, scale: 1.15 }, { opacity: 1, scale: 1, duration: .5, ease: 'power3.out' }, 1)
      .to('.flash', { keyframes: [{ opacity: .85, duration: .08 }, { opacity: 0, duration: .35 }] }, 1.5)
      .to(book, { scale: .97, duration: .08, yoyo: true, repeat: 1 }, 1.5)
      .to('.viewfinder', { opacity: 0, duration: .3 }, 1.95)
      .fromTo($$('.box', book), { opacity: 0, scale: .9 }, { opacity: 1, scale: 1, duration: .3, stagger: .28, ease: SPR }, 1.95);
    chips.forEach((c, i) => travel(tl, c, $('.b' + (i + 1), book), $('#hlVac'), world, 3 + i * .3, .85));
    tl.fromTo('#hlVac', { opacity: 0, scale: 1.04 }, { opacity: 1, scale: 1, duration: .35, ease: SPR }, 3.75)
      .to(book, { xPercent: -30, opacity: 0, duration: .5, ease: 'power2.in' }, 4.6)
      /* paso 2: el mail */
      .fromTo(inbox, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: .6, ease: 'power2.out' }, 4.95)
      .fromTo($$('.li-row.v', inbox), { backgroundColor: '#FFFFFF' }, { backgroundColor: '#FFF7D6', stagger: .25, duration: .3 }, 5.35);
    flip(1, 5.3);                                                     /* → Controles | Historial */
    travel(tl, pdfs[0], $('#att2'), $('#hlEco'), world, 6.05, .85);
    tl.fromTo('#hlEco', { opacity: 0 }, { opacity: 1, duration: .3 }, 6.8);
    flip(2, 6.6);                                                     /* → Historial (sigue) | Peso */
    travel(tl, pdfs[1], $('#att1'), $('#hlHem'), world, 6.85, .85);
    tl.fromTo('#hlHem', { opacity: 0 }, { opacity: 1, duration: .3 }, 7.6)
      .to(inbox, { opacity: 0, y: -20, duration: .4, ease: 'power2.in' }, 7.3);
    /* paso 3: la hojeás entera y vuelve a la tapa */
    flip(2, 8.1, true, .7); flip(1, 8.45, true, .7); flip(0, 8.8, true, .7);
    tl.to({}, { duration: .9 }, 9.3);
    scrub(sec, tl);
  }

  /* ================= 7 · Me fui ================= */
  {
    const sec = $('#mefui'), vid = $('#feed video'), meter = $('#meter'), steps = $$('#mfSteps .cs'), dots = $$('.cs-dots i', sec);
    let last = -1;
    const stepAt = t => (t < 2.9 ? 0 : t < 4.8 ? 1 : t < 6.5 ? 2 : 3);
    let playing = false;
    const vidSync = () => { const show = gsap.getProperty('#feed', 'opacity') > .4; if (show && !playing) { vid.preload = 'auto'; vid.play().catch(() => {}); playing = true; } else if (!show && playing) { vid.pause(); playing = false; } };
    const tl = gsap.timeline({ defaults: { ease: 'none' }, onUpdate: () => { const s = stepAt(tl.time()); if (s !== last) { last = s; steps.forEach((c, i) => c.classList.toggle('on', i === s)); dots.forEach((d, i) => d.classList.toggle('on', i <= s)); } } });
    tl.fromTo('#oldph', { rotationX: 74, y: 40, scale: .9 }, { rotationX: 0, y: 0, scale: 1, duration: 1.2, ease: 'power2.out' })
      .to('.op-off', { opacity: 0, duration: .4 }, 1.05)
      .from('.cam-live', { scale: .85, opacity: 0, duration: .5, ease: 'power2.out' }, 1.2)
      .fromTo('#myph', { xPercent: 70, opacity: 0 }, { xPercent: 0, opacity: 1, duration: 1, ease: 'power3.out' }, 1.7)
      .fromTo('.p2p', { opacity: 0 }, { opacity: 1, duration: .4 }, 2.4)
      .from($$('.mp-away > *'), { y: 16, opacity: 0, stagger: .12, duration: .5, ease: 'power2.out' }, 2.2)
      .fromTo('#hit', { opacity: 0, y: -10 }, { opacity: 1, y: 0, duration: .3 }, 3.1)
      .fromTo($$('.bark .wv i'), { scaleY: .3 }, { scaleY: 1, stagger: .02, duration: .4 }, 3.1)
      .fromTo('#mpPush', { opacity: 0, y: -24 }, { opacity: 1, y: 0, duration: .35, ease: 'power3.out' }, 3.4)
      .to('#mpPush', { keyframes: [{ x: -3, duration: .04 }, { x: 3, duration: .04 }, { x: -2, duration: .04 }, { x: 0, duration: .04 }] }, 3.75)
      .to(['#mpPush', '#hit'], { opacity: 0, y: -10, duration: .3 }, 4.5)
      .to('#seeLive', { scale: .93, duration: .1, yoyo: true, repeat: 1 }, 4.75)
      .fromTo('#feed', { opacity: 0, scale: 1.04 }, { opacity: 1, scale: 1, duration: .6, ease: 'power2.out' }, 4.95)
      .fromTo('#week', { yPercent: 105 }, { yPercent: 0, duration: .7, ease: 'power3.out' }, 6.6)
      .from($$('#week .bars i'), { scaleY: 0, stagger: .06, duration: .4, ease: 'power2.out' }, 6.9)
      .to({}, { duration: .6 });
    scrub(sec, tl, { onUpdate: vidSync });
    /* lo que escucha la cámara: un nivel que respira, con pico en el ladrido */
    const lv = gsap.to(meter, { scaleX: () => gsap.utils.random(.08, .34), duration: .18, repeat: -1, repeatRefresh: true, ease: 'none', paused: true });
    ScrollTrigger.create({ trigger: sec, start: 'top bottom', end: 'bottom top', onToggle: s => s.isActive ? lv.play() : lv.pause() });
  }

  /* ================= 4 · Preguntale (rota sola entre 3 preguntas) ================= */
  {
    const Q = [
      { q: '¿Cuándo fue la última pipeta de Aika?', t: ['Libreta', 'Desparasitación externa', '14 de septiembre'], a: 'La última pipeta registrada fue el <b>14 de septiembre</b>.', s: 'Fuente: Libreta › Desparasitación externa', viz: '' },
      { q: '¿Cuánto subió de peso Aika este año?', t: ['Libreta', 'Peso', '9 registros de 2026'], a: 'Subió <b>1,2 kg</b> este año: de 28,8 a 30 kg.', s: 'Fuente: Libreta › Peso',
        viz: '<svg viewBox="0 0 300 96" preserveAspectRatio="none"><path class="ch-a" d="M0 80 L37 74 L75 77 L112 62 L150 58 L187 50 L225 41 L262 30 L300 16 L300 96 L0 96Z" fill="rgba(242,120,159,.16)"/><path class="ch" d="M0 80 L37 74 L75 77 L112 62 L150 58 L187 50 L225 41 L262 30 L300 16" fill="none" stroke="#9E1F48" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/><circle class="ch-d" cx="300" cy="16" r="5" fill="#9E1F48"/></svg>' },
      { q: '¿Cuánto gasté en veterinario este mes?', t: ['Gastos', 'Veterinaria', 'Octubre'], a: 'En octubre llevás <b>$<span class="cnt">48.500</span></b> en veterinaria.', s: 'Fuente: Gastos › Veterinaria', viz: '<div class="viz-rows"><span>Consulta · 3 oct</span><b>$25.000</b><span>Análisis · 13 oct</span><b>$23.500</b></div>' },
    ];
    const qTxt = $('#qTxt'), trail = $('#trail'), ans = $('#ans'), aTxt = $('#aTxt'), aViz = $('#aViz'), aSrc = $('#aSrc'), dots = $$('.ask-dots i');
    const build = i => {
      const d = Q[i], tl = gsap.timeline({ onComplete: () => { cur = (i + 1) % Q.length; play(); } });
      const n = { c: 0 };
      tl.set(trail, { opacity: 1 }).set(ans, { opacity: 0, y: 16 })
        .call(() => { dots.forEach((x, j) => x.classList.toggle('on', j === i)); $$('.tn b', trail).forEach((b, j) => { b.textContent = d.t[j]; }); aTxt.innerHTML = d.a; aViz.innerHTML = d.viz; aSrc.textContent = d.s; })
        .set($$('.tn', trail), { opacity: 0, scale: .8 }).set($$('.tl', trail), { scaleX: 0 })
        .to(n, { c: d.q.length, duration: d.q.length * .035, ease: 'none', onUpdate: () => { qTxt.textContent = d.q.slice(0, Math.round(n.c)); } })
        .addLabel('look', '+=.25');
      $$('.tn', trail).forEach((tn, j) => {
        tl.to(tn, { opacity: 1, scale: 1, duration: .35, ease: SPR }, `look+=${j * .5}`);
        if (j < 2) tl.to($$('.tl', trail)[j], { scaleX: 1, duration: .3, ease: 'power2.out' }, `look+=${j * .5 + .3}`);
      });
      tl.to(ans, { opacity: 1, y: 0, duration: .6, ease: E }, 'look+=1.45');
      if (i === 1) tl.call(() => { const p = $('.ch', aViz), L = p.getTotalLength(); gsap.fromTo(p, { strokeDasharray: L, strokeDashoffset: L }, { strokeDashoffset: 0, duration: 1.1, ease: IO }); gsap.from($('.ch-a', aViz), { opacity: 0, duration: 1, delay: .4 }); gsap.from($('.ch-d', aViz), { scale: 0, transformOrigin: 'center', duration: .4, delay: 1, ease: SPR }); }, null, 'look+=1.6');
      if (i === 2) tl.call(() => { const c = $('.cnt', aTxt), o = { v: 0 }; gsap.to(o, { v: 48500, duration: 1, ease: 'power2.out', onUpdate: () => { c.textContent = fmt(o.v); } }); gsap.from($$('.viz-rows > *', aViz), { opacity: 0, y: 8, stagger: .06, duration: .4, delay: .3 }); }, null, 'look+=1.6');
      tl.to({}, { duration: 3.6 })
        .to([ans, trail], { opacity: 0, y: -8, duration: .35, ease: 'power2.in' })
        .to(n, { c: 0, duration: .3, ease: 'none', onUpdate: () => { qTxt.textContent = d.q.slice(0, Math.round(n.c)); } })
        .set(trail, { y: 0 });
      return tl;
    };
    let cur = 0, live = null, on = false;
    const play = () => { if (!on) return; live = build(cur); };
    PN[0] = { restart: () => { on = true; if (live) live.kill(); cur = 0; play(); }, pause: () => { on = false; if (live) live.pause(); } };
    ctx.add(() => () => { on = false; if (live) live.kill(); });
  }

  /* ================= 8 · QR / se perdió (automática) ================= */
  {
    const tl = gsap.timeline({ repeat: -1, repeatDelay: 4 });
    tl.set(['#scanner', '#qrNotif', '#qrPublic', '#lost'], { opacity: 0 }).set('#scanner', { x: 40 }).set('#qrNotif', { y: -20 }).set(['#qrPublic', '#lost'], { y: 30 })
      .call(() => $('.lost-sw').classList.add('off'))
      .to('.qr-pet', { scale: 1.22, duration: 1.3, ease: IO }, .3)
      .to('#scanner', { opacity: 1, x: 0, duration: .6, ease: E }, 1.1)
      .from('.sc-vf', { scale: 1.3, duration: .5, ease: 'power3.out' }, 1.3)
      .to('#tag', { scale: 1.25, duration: .12, yoyo: true, repeat: 1 }, 2)
      .to('#scanner', { backgroundColor: '#D9FF45', duration: .08, yoyo: true, repeat: 1 }, 2)
      .to('#qrNotif', { opacity: 1, y: 0, duration: .5, ease: SPR }, 2.4)
      .to('#qrNotif', { keyframes: [{ x: -4, duration: .05 }, { x: 4, duration: .05 }, { x: -2, duration: .05 }, { x: 0, duration: .05 }] }, 2.9)
      .to('#scanner', { opacity: 0, x: 40, duration: .4 }, 3.2)
      .to('.qr-pet', { scale: 1, duration: 1, ease: IO }, 3.2)
      .to('#qrPublic', { opacity: 1, y: 0, duration: .6, ease: SPR }, 3.6)
      .from($$('#qrPublic > *'), { y: 10, opacity: 0, stagger: .08, duration: .4, ease: E }, 3.7);
    if (mobile) tl.to('#qrPublic', { opacity: 0, y: 20, duration: .4 }, 6.2);
    tl.to('#lost', { opacity: 1, y: 0, duration: .5, ease: E }, 6.4)
      .call(() => $('.lost-sw').classList.remove('off'), null, 7)
      .from($$('.poster > *'), { opacity: 0, y: 10, stagger: .1, duration: .4, ease: E }, 7.3)
      .from('.poster', { rotation: 6, scale: .9, duration: .6, ease: SPR }, 7.2)
      .to({}, { duration: 2 });
    PN[1] = tl;
  }

  /* ================= 9 · guardia → tu veterinaria (automática) ================= */
  {
    const vet = $('#pn2'), clock = $('#clock'), sit = $('#vetSit');
    const SIT = { n: '<b>¿Una guardia, ahora?</b> Mimitos te muestra la más cerca que está abierta: llamás o vas.', d: '<b>¿Un turno, de día?</b> Tu veterinaria guardada y el WhatsApp con el mensaje armado.' };
    const tl = gsap.timeline({ repeat: -1, repeatDelay: 1.5 });
    tl.call(() => { vet.classList.remove('day'); clock.textContent = '22:43'; sit.innerHTML = SIT.n; })
      .set('#vcMine', { opacity: 0, y: 30 }).set('#vcER', { opacity: 0, y: 30 })
      .fromTo($$('.mpin'), { y: -30, opacity: 0 }, { y: 0, opacity: 1, stagger: .12, duration: .55, ease: 'expo.out' }, .2)
      .to('#vcER', { opacity: 1, y: 0, duration: .5, ease: SPR }, .8)
      .to({}, { duration: 2.6 })
      .call(() => { vet.classList.add('day'); clock.textContent = '10:15'; sit.innerHTML = SIT.d; })
      .to('#vcER', { opacity: 0, y: 20, duration: .3 })
      .to('#vcMine', { opacity: 1, y: 0, duration: .5, ease: SPR })
      .from('.wa-msg', { scale: .85, opacity: 0, transformOrigin: '100% 100%', duration: .4, ease: SPR })
      .to({}, { duration: 2.8 });
    PN[2] = tl;
  }

  /* ================= cuidador (automática) ================= */
  {
    const tasks = $$('.sitter .task'), feed = $$('.owner .feed-i');
    const tl = gsap.timeline({ repeat: -1, repeatDelay: 3 });
    tl.call(() => tasks.slice(0, 2).forEach(t => t.classList.remove('done'))).set(feed, { opacity: 0, y: 10 }).set('#dose', { opacity: 0, height: 0, padding: 0 })
      .fromTo('#careLink', { scale: .6, opacity: 0 }, { scale: 1, opacity: 1, duration: .5, ease: SPR }, .2);
    tasks.slice(0, 2).forEach((t, i) => {
      tl.call(() => t.classList.add('done'), null, .9 + i * .9).fromTo(t, { scale: .97 }, { scale: 1, duration: .3, ease: SPR }, .9 + i * .9)
        .to(feed[i], { opacity: 1, y: 0, duration: .4, ease: E }, 1.15 + i * .9);
    });
    tl.to('#gotas', { scale: .96, duration: .1, yoyo: true, repeat: 1 }, 3)
      .to('#dose', { opacity: 1, height: 'auto', padding: '9px 10px', duration: .5, ease: SPR }, 3.2)
      .to({}, { duration: 2 });
    PN[3] = tl;
  }

  /* ================= gastos (automática) ================= */
  {
    const D = { all: [123500, 46, 32, 22], aika: [81200, 48, 37, 15], felisa: [42300, 42, 24, 34] };
    const tot = $('#mTotal'), segs = $$('.m-bar i'), pcts = $$('.m-leg b'), tabs = $$('.m-tabs button');
    const show = k => { const [t, a, v, o] = D[k]; tabs.forEach(b => b.setAttribute('aria-selected', String(b.dataset.m === k)));
      const cur = { n: parseInt(tot.textContent.replace(/\D/g, ''), 10) || 0 }; gsap.to(cur, { n: t, duration: .8, ease: 'power2.out', onUpdate: () => { tot.textContent = fmt(cur.n); } });
      [a, v, o].forEach((p, i) => { segs[i].style.setProperty('--w', p); pcts[i].textContent = p + '%'; });
      gsap.fromTo('.m-bar', { scaleX: .35, opacity: .4 }, { scaleX: 1, opacity: 1, duration: .7, ease: E }); };
    tabs.forEach(b => b.addEventListener('click', () => { tl.pause(); show(b.dataset.m); }));
    const tl = gsap.timeline({ repeat: -1, repeatDelay: 2 });
    tl.call(() => { tot.textContent = '0'; segs.forEach(s => s.style.setProperty('--w', 0)); tabs.forEach(b => b.setAttribute('aria-selected', String(b.dataset.m === 'all'))); })
      .fromTo($$('.mv'), { y: -24, opacity: 0, rotation: () => gsap.utils.random(-6, 6) }, { y: 0, opacity: 1, rotation: 0, stagger: .14, duration: .5, ease: SPR }, .2)
      .to($$('.mv'), { y: 40, scale: .6, opacity: 0, stagger: .06, duration: .45, ease: 'power3.in' }, 1.6)
      .call(() => show('all'), null, 1.9)
      .call(() => show('aika'), null, 4.4)
      .call(() => show('felisa'), null, 6.6)
      .set($$('.mv'), { y: 0, scale: 1, opacity: 1 }, 8.6);
    PN[4] = tl;
  }

  /* ================= 5 · y además: pestañas que pasan solas ================= */
  {
    PN.forEach(t => t && t.pause());
    const tabs = $$('.mas-tabs button'), pns = $$('.pn'), DUR = [11, 10, 9, 8, 8];
    let cur = 0, prog = null, live = false;
    const fillT = (i, p) => tabs[i].style.setProperty('--p', p);
    const go = (i, user) => {
      if (prog) prog.kill();
      if (PN[cur]) PN[cur].pause();
      tabs.forEach((t, j) => { t.setAttribute('aria-selected', String(j === i)); fillT(j, 0); });
      if (i !== cur) { gsap.to(pns[cur], { autoAlpha: 0, y: -10, duration: .3 }); pns[cur].classList.remove('on'); }
      pns[i].classList.add('on'); gsap.fromTo(pns[i], { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: .5, ease: E });
      cur = i;
      if (PN[i]) PN[i].restart();
      const o = { p: 0 };
      prog = gsap.to(o, { p: 1, duration: DUR[i], ease: 'none', onUpdate: () => fillT(i, o.p), onComplete: () => go((i + 1) % tabs.length) });
      if (!live) { prog.pause(); if (PN[i]) PN[i].pause(); }
    };
    tabs.forEach((t, i) => t.addEventListener('click', () => go(i, true)));
    pns.forEach((p, i) => { if (i) gsap.set(p, { autoAlpha: 0 }); });
    ScrollTrigger.create({ trigger: '.mas-panels', start: 'top 70%', end: 'bottom 20%', onToggle: s => {
      live = s.isActive;
      if (live) { if (!prog) go(0); else { prog.resume(); if (PN[cur]) PN[cur].resume ? PN[cur].resume() : PN[cur].restart(); } }
      else { if (prog) prog.pause(); if (PN[cur]) PN[cur].pause(); } } });
    ctx.add(() => () => { if (prog) prog.kill(); });
  }

  /* ================= precio ================= */
  {
    const n = $('#prNum'), o = { v: 0 };
    ScrollTrigger.create({ trigger: '.pr-num', start: 'top 85%', once: true, onEnter: () => gsap.fromTo(o, { v: 0 }, { v: 43990, duration: 1.4, ease: 'power3.out', onUpdate: () => { n.textContent = fmt(o.v); } }) });
  }

  /* ================= cierre: todo orbita y se acomoda ================= */
  {
    const tl = gsap.timeline({ repeat: -1, repeatDelay: 4 });
    tl.set('.orbit', { rotation: 0, scale: 1, opacity: 1 }).set($$('.ob svg'), { rotation: 0 }).set('.fin-logo', { scale: 0 })
      .fromTo($$('.ob'), { opacity: 0, scale: .4 }, { opacity: 1, scale: 1, stagger: .09, duration: .5, ease: SPR }, .2)
      .to('.orbit', { rotation: 140, duration: 3, ease: 'power1.inOut' }, .4)
      .to($$('.ob svg'), { rotation: -140, duration: 3, ease: 'power1.inOut' }, .4)
      .to('.orbit', { scale: .2, opacity: 0, duration: .8, ease: 'power3.in' }, 3.2)
      .fromTo('.fin-pet', { scale: 1 }, { scale: 1.06, duration: .25, yoyo: true, repeat: 1 }, 3.9)
      .to('.fin-logo', { scale: 1, duration: .6, ease: SPR }, 4)
      .to({}, { duration: 2 });
    auto('.fin-world', tl, 'top 75%');
  }

  return () => {};
});

/* si cambia la preferencia de movimiento, recargar es lo más simple y seguro */
reduce.addEventListener('change', () => location.reload());
addEventListener('load', () => ScrollTrigger.refresh());
})();
