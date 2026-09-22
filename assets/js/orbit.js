/* ORBIT® — núcleo compartido del sitio (bilingüe ES / EN) */
(() => {
const C = {k:'#0D0D0E', b:'#F2EFE8', blue:'#3047FF', or:'#FF4F2E', ac:'#D9FF45', k2:'#161617', b2:'#E4E0D6'};
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (s, r=document) => r.querySelector(s), $$ = (s, r=document) => [...r.querySelectorAll(s)];
const root = document.documentElement;

/* ---------- idioma ---------- */
const lang = () => root.dataset.lang === 'en' ? 'en' : 'es';
/* L(): texto bilingüe en HTML — se muestra el que corresponde vía CSS */
const L = (es, en) => (typeof es === 'object' && es) ? L(es.es, es.en) : (en === undefined ? String(es) : `<span data-l="es">${es}</span><span data-l="en">${en}</span>`);
/* tr(): texto plano en el idioma actual (títulos, avisos, atributos) */
const tr = (es, en) => (typeof es === 'object' && es) ? es[lang()] : (lang() === 'en' && en !== undefined ? en : es);
function store(l) { for (const s of [localStorage, sessionStorage]) { try { s.setItem('orbit-lang', l); } catch (e) {} } }
function setLang(l, save=true) {
  root.dataset.lang = l; root.lang = l; if (save) store(l);
  const t = document.body.dataset['title' + (l === 'en' ? 'En' : 'Es')]; if (t) document.title = t;
  $$('[data-aria-es]').forEach(el => el.setAttribute('aria-label', el.dataset['aria' + (l === 'en' ? 'En' : 'Es')]));
  $$('.langsw button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.set === l)));
  dispatchEvent(new CustomEvent('orbit:lang', {detail: l}));
}

/* ---------- símbolo: círculo incompleto + apertura + punto ---------- */
const R = 39, SW = 22, DOTA = 50;
const pt = (a, r=R) => [50 + r*Math.cos(a*Math.PI/180), 50 + r*Math.sin(a*Math.PI/180)];
function symInner({gap=68, rot=0, dot=C.blue, ring='currentColor', dotOff=0, dotOn=true, sw=SW, dr=12.5}={}) {
  const end = DOTA + rot, span = 360 - gap;
  let ringEl = '';
  if (gap <= .5) ringEl = `<circle cx="50" cy="50" r="${R}" fill="none" stroke="${ring}" stroke-width="${sw}"/>`;
  else if (span > .5) {
    const [x0,y0] = pt(end - span), [x1,y1] = pt(end);
    ringEl = `<path d="M${x0.toFixed(2)} ${y0.toFixed(2)} A${R} ${R} 0 ${span>180?1:0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}" fill="none" stroke="${ring}" stroke-width="${sw}"/>`;
  }
  const [dx,dy] = pt(end + dotOff);
  return ringEl + (dotOn ? `<circle cx="${dx.toFixed(2)}" cy="${dy.toFixed(2)}" r="${dr}" fill="${dot}"/>` : '');
}
const sym = (o={}, cls='sym', style='') => `<svg class="${cls}" viewBox="0 0 100 100" style="overflow:visible;${style}" aria-hidden="true">${symInner(o)}</svg>`;
const wm = (o={}, reg=true) => `<span class="wm"${o.color?` style="color:${o.color}"`:''}><svg class="o" viewBox="0 0 100 100" aria-hidden="true">${symInner({dot:o.dot||C.blue, ...o})}</svg>RBIT${reg?'<sup>®</sup>':''}</span>`;
/* wordmark gigante con la O que sigue al cursor */
const bigWm = id => `<span class="wm"><svg class="o" viewBox="0 0 100 100" aria-hidden="true"><g id="${id}"></g></svg>RBIT<sup>®</sup></span>`;

/* ---------- símbolo que sigue al cursor ---------- */
function follow(g, target) {
  g.innerHTML = symInner({ring:'currentColor', dot:C.blue});
  let rot = 0, tgt = 0, active = false, last = 0, alive = true;
  const mv = e => { const o = target.getBoundingClientRect(); if (o.bottom < 0 || o.top > innerHeight) return; tgt = Math.atan2(e.clientY - (o.top+o.height/2), e.clientX - (o.left+o.width/2))*180/Math.PI - DOTA; active = true; last = performance.now(); };
  addEventListener('pointermove', mv);
  if (!RM) (function f(now) { if (!alive) return; if (!active || now - last > 2600) { active = false; tgt += .12; } rot += (((tgt - rot + 540) % 360) - 180) * .09; g.setAttribute('transform', `rotate(${rot.toFixed(2)} 50 50)`); requestAnimationFrame(f); })(0);
  return () => { alive = false; removeEventListener('pointermove', mv); };
}

/* ---------- productos ---------- */
const P = window.ORBIT_PRODUCTS || [], FAM = window.ORBIT_FAMILIES || {};
const ACC = {blue:C.blue, or:C.or, ac:C.ac, b:C.k};
const money = n => `${window.ORBIT_CURRENCY || 'USD'} ${n}`;
const url = p => `producto.html?id=${p.id}`;
const bookSpine = (p, wmColor) => `<div class="spine">${wm({color:wmColor}, false)}<span class="mono sp-code">${p.code}</span></div>`;
const pages = '<span class="pages" aria-hidden="true"></span>';
const soonBadge = p => p.status === 'soon' ? `<span class="mono badge">${L('Próximamente','Coming soon')}</span>` : '';
const COVERS = {
  /* 01 — archivo: tapa bone, lomo negro */
  archive: p => `<div class="cover cv-archive">${bookSpine(p, C.b)}
    <div class="body">${wm({color:C.k, dot:C.blue})}${soonBadge(p)}
      <div class="num">${p.n}</div><div class="ttl">${p.name.replace(' ','<br>')}</div>
      <div class="art">${sym({ring:C.k, dot:C.blue, sw:22})}</div>
      <div class="mono meta">${L(p.specs[0][1])} ${L(p.specs[0][0])}<br>${L(p.specs[2][1])}<br>V.01</div>
    </div>${pages}</div>`,
  /* 02 — poster: tapa naranja, lomo bone */
  poster: p => `<div class="cover cv-poster">${bookSpine(p, C.k)}
    <div class="body">
      <div class="arcs">${[0,1,2].map(i => `<svg viewBox="0 0 100 100" style="width:100%"><path d="M0 100 A100 100 0 0 1 100 0" fill="none" stroke="${C.k}" stroke-width="${7 - i*2}" opacity="${.85 - i*.25}"/></svg>`).join('')}</div>
      <div class="t">${wm({color:C.k, dot:C.b})}${soonBadge(p)}</div>
      <div class="mid"><div class="num">${p.n}</div><div class="ttl">${p.name.replace(' ','<br>')}</div></div>
      <div class="mono meta">${L(p.specs[0][1])} ${L(p.specs[0][0])} · ${L(p.specs[2][1])}</div>
    </div>${pages}</div>`,
  /* 03 — grilla: tapa negra, lomo ácido */
  grid: p => `<div class="cover cv-grid">${bookSpine(p, C.k)}
    <div class="body">
      <div class="lines">${'<i></i>'.repeat(5)}</div>
      <div class="t">${wm({color:C.b, dot:C.ac})}${soonBadge(p)}</div>
      <div class="ttl">${p.name.replace(' ','<br>')}</div>
      <div class="b"><div class="num">${p.n}</div><div class="mono meta">${L(p.specs[0][1])} ${L(p.specs[0][0])}<br>${L(p.specs[2][1])}</div></div>
      <span class="dot"></span>
    </div>${pages}</div>`,
  /* 04 — trayectoria: tapa azul, lomo negro */
  trajectory: p => `<div class="cover cv-tra">${bookSpine(p, C.b)}
    <div class="body">
      <svg class="paths" viewBox="0 0 100 130" preserveAspectRatio="none"><path d="M-5 120 C 30 120 40 30 105 22" fill="none" stroke="${C.b}" stroke-width=".7" opacity=".75"/><path d="M-5 134 C 45 128 60 58 105 50" fill="none" stroke="${C.b}" stroke-width=".7" opacity=".45"/><circle cx="66" cy="34" r="3.2" fill="${C.ac}"/></svg>
      <div class="t">${wm({color:C.b, dot:C.ac})}${soonBadge(p)}</div>
      <div class="num">${p.n}</div>
      <div class="b"><div class="ttl">${p.name.replace(' ','<br>')}</div><div class="mono meta">${L(p.specs[0][1])} ${L(p.specs[0][0])} · ${L(p.specs[2][1])}</div></div>
    </div>${pages}</div>`,
};
const cover = p => (COVERS[p.cover] || COVERS.archive)(p);
const card = p => `<a class="pcard rv" href="${url(p)}" data-fam="${p.family}">${cover(p)}
  <div class="row"><span class="mono">${p.code}</span><span class="mono dim">${(FAM[p.family]||[''])[0]}</span></div>
  <div class="row" style="border:0;padding:0"><h3>${p.name}</h3><span class="price">${p.status==='soon' ? `<span class="mono">${L('Pronto','Soon')}</span>` : money(p.price)}</span></div></a>`;

/* ---------- toast ---------- */
let tT;
function toast(m) {
  let t = $('.toast'); if (!t) { t = document.createElement('div'); t.className = 'toast mono'; t.setAttribute('role','status'); document.body.append(t); }
  t.textContent = m; t.classList.add('on'); clearTimeout(tT); tT = setTimeout(() => t.classList.remove('on'), 2800);
}
/* botón de compra */
function buyBtn(p, cls='btn btn-acid') {
  if (p.status === 'soon') return `<a class="${cls}" href="#" data-soon="${p.id}">${L('Avisame cuando salga','Notify me')} <span class="ar">→</span></a>`;
  return `<a class="${cls}" href="${p.checkout || '#'}" data-buy="${p.id}" ${p.checkout ? 'target="_blank" rel="noopener"' : ''}>${L('Comprar','Buy')} — ${money(p.price)} <span class="ar">→</span></a>`;
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-buy]');
  if (b && b.getAttribute('href') === '#') { e.preventDefault(); toast(tr('El pago todavía no está conectado — agregá el link de checkout en products.js', 'Checkout is not connected yet — add the payment link in products.js')); }
  const s = e.target.closest('[data-soon]');
  if (s) { e.preventDefault(); toast(tr('Pronto: acá va el formulario de lista de espera', 'Coming soon: the waitlist form goes here')); }
});

/* ---------- nav + footer compartidos ---------- */
const page = document.body.dataset.page;
const links = [['index.html',L('Inicio','Home'),'home'],['productos.html',L('Productos','Products'),'productos'],['nosotros.html',L('Nosotros','About'),'nosotros']];
const langSw = `<div class="langsw" role="group" aria-label="Idioma / Language"><button data-set="es" aria-pressed="${lang()==='es'}">ES</button><span>/</span><button data-set="en" aria-pressed="${lang()==='en'}">EN</button></div>`;
const nav = document.createElement('header');
nav.className = 'nav';
nav.innerHTML = `<a class="logo" href="index.html" aria-label="Orbit">${wm({color:'#F2EFE8'})}</a>
  <ul>${links.map(([h,t,k]) => `<li><a href="${h}"${k===page?' aria-current="page"':''}>${t}</a></li>`).join('')}</ul>
  <div class="right">${langSw}<button class="menu" aria-expanded="false" aria-controls="mnav">${L('Menú','Menu')}</button></div>`;
document.body.prepend(nav);
const navSolid = () => nav.classList.toggle('solid', scrollY > 12 || 'navSolid' in document.body.dataset);
addEventListener('scroll', navSolid, {passive:true}); navSolid();
const mnav = document.createElement('nav');
mnav.className = 'mnav'; mnav.id = 'mnav'; mnav.hidden = true; mnav.setAttribute('aria-label','Menu');
mnav.innerHTML = `<button class="chip x">${L('Cerrar','Close')}</button><div>${links.map(([h,t]) => `<a href="${h}">${t}</a>`).join('')}</div><div style="display:flex;justify-content:space-between;align-items:center;gap:16px">${langSw}<span class="mono">Orbit® — Ideas in motion</span></div>`;
document.body.append(mnav);
$('.menu', nav).onclick = () => { mnav.hidden = false; $('.menu', nav).setAttribute('aria-expanded','true'); };
$('.x', mnav).onclick = () => { mnav.hidden = true; $('.menu', nav).setAttribute('aria-expanded','false'); };
addEventListener('keydown', e => { if (e.key === 'Escape') mnav.hidden = true; });
document.addEventListener('click', e => { const b = e.target.closest('.langsw button'); if (b) setLang(b.dataset.set); });

const foot = document.createElement('footer');
foot.className = 'foot';
foot.innerHTML = `<div class="wrap">
  <div style="display:flex;justify-content:space-between;gap:20px"><span class="mono">OB—000</span><span class="mono" style="text-align:right">${L('Ideas<br>Recursos<br>Crecimiento<br>Libertad','Ideas<br>Resources<br>Growth<br>Freedom')}</span></div>
  <h2 class="display" style="margin-top:40px">Enter<br>the orbit.</h2>
  <div class="cols">
    <div><span class="mono dim">${L('Productos','Products')}</span>${P.map(p => `<a href="${url(p)}">${p.code} ${p.name}</a>`).join('')}</div>
    <div><span class="mono dim">${L('Familias','Families')}</span>${Object.entries(FAM).map(([k,[n]]) => `<a href="productos.html#${k}">${n}</a>`).join('')}</div>
    <div><span class="mono dim">Orbit</span><a href="nosotros.html">${L('Nosotros','About')}</a><a href="index.html#a-medida">${L('Pedidos a medida','Custom requests')}</a><a href="nosotros.html#manifiesto">${L('Manifiesto','Manifesto')}</a><a href="https://mariasicco.github.io/orbit-brand-manual/">${L('Manual de marca','Brand manual')}</a></div>
    <div><span class="mono dim">${L('Contacto','Contact')}</span><a href="mailto:hola@orbit.studio">hola@orbit.studio</a><a href="#">Instagram</a><a href="#">Newsletter</a></div>
  </div>
  <div class="base"><div>${wm({color:C.b})}<p class="mono" style="margin:10px 0 0">Digital goods for creative people.</p></div><span class="mono dim" style="text-align:right">${L('Mismas personas. Más herramientas.<br>Un mejor mañana.','Same people. More tools.<br>A brighter tomorrow.')} — Est. 2026</span></div>
</div>`;
document.body.append(foot);

/* ---------- volver arriba ---------- */
const top = document.createElement('button');
top.className = 'totop'; top.setAttribute('aria-label', 'Volver arriba / Back to top');
top.innerHTML = `<svg viewBox="0 0 100 100" aria-hidden="true" style="overflow:visible">${symInner({ring:'currentColor', dotOn:false, sw:7, gap:64, rot:-140})}<path d="M50 70 V32 M35 46 L50 31 L65 46" fill="none" stroke="${C.blue}" stroke-width="9" stroke-linecap="square"/></svg>${L('Arriba','Top')}`;
top.onclick = () => scrollTo({top:0, behavior: RM ? 'auto' : 'smooth'});
document.body.append(top);
const topShow = () => top.classList.toggle('on', scrollY > innerHeight * .6);
addEventListener('scroll', topShow, {passive:true}); topShow();

/* ---------- placeholders declarativos ---------- */
$$('[data-sym]').forEach(el => { const o = JSON.parse(el.dataset.sym || '{}'); if (o.ring && C[o.ring]) o.ring = C[o.ring]; if (o.dot && C[o.dot]) o.dot = C[o.dot]; el.innerHTML = sym(o, 'sym', 'width:100%;height:auto'); });
$$('[data-photo]').forEach(el => el.style.backgroundImage = `url(assets/img/${el.dataset.photo}.jpg?v=12)`);
$$('[data-ticker]').forEach(el => { const h = el.dataset.ticker.split('|').map(t => `<span>${t}</span><i>·</i>`).join(''); el.innerHTML = `<div>${h}${h}</div>`; });

/* ---------- reveal (solo lo que está debajo de la primera pantalla) ---------- */
function reveal(rootEl=document) {
  if (RM || !('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.remove('pre'); io.unobserve(e.target); } }), {rootMargin:'0px 0px -8% 0px'});
  $$('.rv', rootEl).forEach(el => { if (el.getBoundingClientRect().top > innerHeight) { el.classList.add('pre'); io.observe(el); } });
}

/* ---------- caja 3D ---------- */
function mountBox(stage, p) {
  stage.innerHTML = `<div class="box"><div class="f front">${cover(p)}</div><div class="f side">${wm({color:C.b}, false)}</div><div class="f lside"></div>
    <div class="f back"><span class="mono">${p.code}<br>Digital goods</span><span class="it" style="font-size:21px;line-height:1.05">${L(p.tagline)}</span><span class="mono">Orbit® — Ideas in motion<br>Est. 2026</span></div>
    <div class="f top"></div><div class="f bottom"></div></div><span class="mono hint">${L('Arrastrá para girar','Drag to rotate')}</span>`;
  const box = $('.box', stage);
  let ry = -28, rx = -8, drag = null, spin = !RM;
  stage.addEventListener('pointerdown', e => { drag = {x:e.clientX, y:e.clientY, ry, rx}; spin = false; stage.setPointerCapture(e.pointerId); });
  stage.addEventListener('pointermove', e => { if (!drag) return; ry = drag.ry + (e.clientX - drag.x)*.5; rx = Math.max(-30, Math.min(20, drag.rx - (e.clientY - drag.y)*.3)); });
  const end = () => drag = null; stage.addEventListener('pointerup', end); stage.addEventListener('pointercancel', end);
  (function f() { if (spin && !drag) ry += .15; box.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg)`; requestAnimationFrame(f); })();
}

/* ---------- pantalla de entrada: elegir idioma ---------- */
function gate() {
  const g = document.createElement('div');
  g.className = 'gate'; g.setAttribute('role','dialog'); g.setAttribute('aria-modal','true'); g.setAttribute('aria-label','Elegí tu idioma / Choose your language');
  g.innerHTML = `<div class="g-top"><span class="mono">OB—000<br>Orbit® — Digital goods</span><span class="mono" style="text-align:right">Ideas in motion<br>Est. 2026</span></div>
    <div class="g-mid"><div class="g-word" id="gWord">${bigWm('gateG')}</div></div>
    <div class="g-bot">
      <p class="mono g-ask">Elegí tu idioma<br><span class="dim">Choose your language</span></p>
      <div class="g-opts">
        <button data-pick="es" lang="es"><span class="mono">01</span>Español<span class="ar">→</span></button>
        <button data-pick="en" lang="en"><span class="mono">02</span>English<span class="ar">→</span></button>
      </div>
    </div>`;
  document.body.append(g);
  const stop = follow($('#gateG', g), $('#gWord svg', g));
  $$('[data-pick]', g).forEach(b => b.onclick = () => {
    setLang(b.dataset.pick);
    const o = $('#gWord svg', g).getBoundingClientRect();
    g.style.setProperty('--gx', (o.left + o.width/2) + 'px'); g.style.setProperty('--gy', (o.top + o.height/2) + 'px');
    root.classList.remove('gate-on');
    g.classList.add('out');
    setTimeout(() => { stop(); g.remove(); reveal(); }, RM ? 0 : 1000);
  });
  $('[data-pick]', g).focus({preventScroll:true});
}
const needGate = root.classList.contains('gate-on');
if (needGate) gate();
setLang(lang(), false);

window.ORBIT = {C, RM, $, $$, L, tr, lang, setLang, sym, symInner, wm, bigWm, cover, card, buyBtn, money, url, toast, reveal: needGate ? () => {} : reveal, mountBox, follow, P, FAM, ACC};
})();
