/* ORBIT® — núcleo compartido del sitio */
(() => {
const C = {k:'#0D0D0E', b:'#F2EFE8', blue:'#3047FF', or:'#FF4F2E', ac:'#D9FF45', k2:'#161617', b2:'#E4E0D6'};
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (s, r=document) => r.querySelector(s), $$ = (s, r=document) => [...r.querySelectorAll(s)];

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

/* ---------- productos ---------- */
const P = window.ORBIT_PRODUCTS || [], FAM = window.ORBIT_FAMILIES || {};
const ACC = {blue:C.blue, or:C.or, ac:C.ac, b:C.k};
const money = n => `${window.ORBIT_CURRENCY || 'USD'} ${n}`;
const url = p => `producto.html?id=${p.id}`;
const cover = p => `<div class="cover">
  <div class="spine">${wm({color:C.b}, false)}</div>
  <div class="body">${wm({color:C.k, dot:C.blue})}
    ${p.status==='soon' ? '<span class="mono badge">Coming soon</span>' : ''}
    <div class="num">${p.n}</div><div class="ttl">${p.name.replace(' ', '<br>')}</div>
    <div class="art">${sym({ring:C.k, dot:ACC[p.accent]||C.blue, sw:22})}</div>
    <div class="mono meta">${p.specs[0][1]} ${p.specs[0][0].toLowerCase()}<br>${p.specs[2][1]}<br>${p.code} · V.01</div>
  </div></div>`;
const card = p => `<a class="pcard rv" href="${url(p)}" data-fam="${p.family}">${cover(p)}
  <div class="row"><span class="mono">${p.code}</span><span class="mono dim">${(FAM[p.family]||[''])[0]}</span></div>
  <div class="row" style="border:0;padding:0"><h3>${p.name}</h3><span class="price">${p.status==='soon' ? '<span class="mono">Pronto</span>' : money(p.price)}</span></div></a>`;

/* ---------- toast ---------- */
let tT;
function toast(m) {
  let t = $('.toast'); if (!t) { t = document.createElement('div'); t.className = 'toast mono'; t.setAttribute('role','status'); document.body.append(t); }
  t.textContent = m; t.classList.add('on'); clearTimeout(tT); tT = setTimeout(() => t.classList.remove('on'), 2600);
}
/* botón de compra */
function buyBtn(p, cls='btn btn-acid') {
  if (p.status === 'soon') return `<a class="${cls}" href="#" data-soon="${p.id}">Avisame cuando salga <span class="ar">→</span></a>`;
  return `<a class="${cls}" href="${p.checkout || '#'}" data-buy="${p.id}" ${p.checkout ? 'target="_blank" rel="noopener"' : ''}>Comprar — ${money(p.price)} <span class="ar">→</span></a>`;
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-buy]');
  if (b && b.getAttribute('href') === '#') { e.preventDefault(); toast('El pago todavía no está conectado — agregá el link de checkout en products.js'); }
  const s = e.target.closest('[data-soon]');
  if (s) { e.preventDefault(); toast('Pronto: acá va el formulario de lista de espera'); }
});

/* ---------- nav + footer compartidos ---------- */
const page = document.body.dataset.page;
const links = [['index.html','Inicio','home'],['productos.html','Productos','productos'],['nosotros.html','Nosotros','nosotros']];
const nav = document.createElement('header');
nav.className = 'nav';
nav.innerHTML = `<a class="logo" href="index.html" aria-label="Orbit, inicio">${wm({color:'#F2EFE8'})}</a>
  <ul>${links.map(([h,t,k]) => `<li><a href="${h}"${k===page?' aria-current="page"':''}>${t}</a></li>`).join('')}</ul>
  <a class="cta" href="productos.html">Explorar productos →</a>
  <button class="menu" aria-expanded="false" aria-controls="mnav">Menú</button>`;
document.body.prepend(nav);
const mnav = document.createElement('nav');
mnav.className = 'mnav'; mnav.id = 'mnav'; mnav.hidden = true; mnav.setAttribute('aria-label','Menú');
mnav.innerHTML = `<button class="chip x">Cerrar</button><div>${links.map(([h,t]) => `<a href="${h}">${t}</a>`).join('')}</div><span class="mono">Orbit® — Ideas in motion. Est. 2026</span>`;
document.body.append(mnav);
$('.menu', nav).onclick = () => { mnav.hidden = false; $('.menu', nav).setAttribute('aria-expanded','true'); };
$('.x', mnav).onclick = () => { mnav.hidden = true; $('.menu', nav).setAttribute('aria-expanded','false'); };
addEventListener('keydown', e => { if (e.key === 'Escape') mnav.hidden = true; });

const foot = document.createElement('footer');
foot.className = 'foot';
foot.innerHTML = `<div class="wrap">
  <div style="display:flex;justify-content:space-between;gap:20px"><span class="mono">OB—000</span><span class="mono" style="text-align:right">Ideas<br>Recursos<br>Crecimiento<br>Libertad</span></div>
  <h2 class="display" style="margin-top:40px">Enter<br>the orbit.</h2>
  <div class="cols">
    <div><span class="mono dim">Productos</span>${P.map(p => `<a href="${url(p)}">${p.code} ${p.name}</a>`).join('')}</div>
    <div><span class="mono dim">Familias</span>${Object.values(FAM).map(([n]) => `<a href="productos.html">${n}</a>`).join('')}</div>
    <div><span class="mono dim">Orbit</span><a href="nosotros.html">Nosotros</a><a href="nosotros.html#manifiesto">Manifiesto</a><a href="https://mariasicco.github.io/orbit-brand-manual/">Manual de marca</a></div>
    <div><span class="mono dim">Contacto</span><a href="mailto:hola@orbit.studio">hola@orbit.studio</a><a href="#">Instagram</a><a href="#">Newsletter</a></div>
  </div>
  <div class="base"><div>${wm({color:C.b})}<p class="mono" style="margin:10px 0 0">Digital goods for creative people.</p></div><span class="mono dim" style="text-align:right">Mismas personas. Más herramientas.<br>Un mejor mañana. — Est. 2026</span></div>
</div>`;
document.body.append(foot);

/* ---------- placeholders declarativos ---------- */
$$('[data-wm]').forEach(el => el.outerHTML = wm({color: el.dataset.wm || undefined}));
$$('[data-sym]').forEach(el => { const o = JSON.parse(el.dataset.sym || '{}'); if (o.ring && C[o.ring]) o.ring = C[o.ring]; if (o.dot && C[o.dot]) o.dot = C[o.dot]; el.innerHTML = sym(o, 'sym', 'width:100%;height:auto'); });
$$('[data-photo]').forEach(el => el.style.backgroundImage = `url(assets/img/${el.dataset.photo}.jpg)`);
$$('[data-ticker]').forEach(el => { const h = el.dataset.ticker.split('|').map(t => `<span>${t}</span><i>·</i>`).join(''); el.innerHTML = `<div>${h}${h}</div>`; });

/* ---------- reveal (solo lo que está debajo de la primera pantalla) ---------- */
function reveal(root=document) {
  if (RM || !('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.remove('pre'); io.unobserve(e.target); } }), {rootMargin:'0px 0px -8% 0px'});
  $$('.rv', root).forEach(el => { if (el.getBoundingClientRect().top > innerHeight) { el.classList.add('pre'); io.observe(el); } });
}

/* ---------- caja 3D ---------- */
function mountBox(stage, p) {
  stage.innerHTML = `<div class="box"><div class="f front">${cover(p)}</div><div class="f side">${wm({color:C.b}, false)}</div><div class="f lside"></div>
    <div class="f back"><span class="mono">${p.code}<br>Digital goods</span><span class="it" style="font-size:22px;line-height:1.05">${p.tagline}</span><span class="mono">Orbit® — Ideas in motion<br>Est. 2026</span></div>
    <div class="f top"></div><div class="f bottom"></div></div><span class="mono hint">Arrastrá para girar</span>`;
  const box = $('.box', stage);
  let ry = -28, rx = -8, drag = null, spin = !RM;
  stage.addEventListener('pointerdown', e => { drag = {x:e.clientX, y:e.clientY, ry, rx}; spin = false; stage.setPointerCapture(e.pointerId); });
  stage.addEventListener('pointermove', e => { if (!drag) return; ry = drag.ry + (e.clientX - drag.x)*.5; rx = Math.max(-30, Math.min(20, drag.rx - (e.clientY - drag.y)*.3)); });
  const end = () => drag = null; stage.addEventListener('pointerup', end); stage.addEventListener('pointercancel', end);
  (function f() { if (spin && !drag) ry += .15; box.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg)`; requestAnimationFrame(f); })();
}

/* ---------- símbolo que sigue al cursor ---------- */
function follow(g, target) {
  g.innerHTML = symInner({ring:'currentColor', dot:C.blue});
  let rot = 0, tgt = 0, active = false, last = 0;
  addEventListener('pointermove', e => { const o = target.getBoundingClientRect(); if (o.bottom < 0 || o.top > innerHeight) return; tgt = Math.atan2(e.clientY - (o.top+o.height/2), e.clientX - (o.left+o.width/2))*180/Math.PI - DOTA; active = true; last = performance.now(); });
  if (RM) return;
  (function f(now) { if (!active || now - last > 2600) { active = false; tgt += .12; } rot += (((tgt - rot + 540) % 360) - 180) * .09; g.setAttribute('transform', `rotate(${rot.toFixed(2)} 50 50)`); requestAnimationFrame(f); })(0);
}

window.ORBIT = {C, RM, $, $$, sym, symInner, wm, cover, card, buyBtn, money, url, toast, reveal, mountBox, follow, P, FAM, ACC};
})();
