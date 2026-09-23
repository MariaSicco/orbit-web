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
const url = p => `/p/${p.id}`;
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
  if (p.status === 'soon') return `<button class="${cls}" type="button" data-soon="${p.id}">${L('Avisame cuando salga','Notify me')} <span class="ar">→</span></button>`;
  return `<button class="${cls}" type="button" data-buy="${p.id}">${L('Agregar al carrito','Add to cart')} — ${money(p.price)} <span class="ar">+</span></button>`;
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-buy]');
  if (b) { e.preventDefault(); cartAdd(b.dataset.buy); }
  const s = e.target.closest('[data-soon]');
  if (s) { e.preventDefault(); toast(tr('Pronto: acá va el formulario de lista de espera', 'Coming soon: the waitlist form goes here')); }
});

/* ---------- carrito ---------- */
const CART_KEY = 'orbit-cart';
let cart = [];
try { cart = JSON.parse(localStorage.getItem(CART_KEY) || '[]').filter(x => P.some(p => p.id === x.id)); } catch (e) {}
const saveCart = () => { try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch (e) {} paintCart(); };
const cartCount = () => cart.reduce((a, i) => a + i.qty, 0);
const cartTotal = () => cart.reduce((a, i) => a + (P.find(p => p.id === i.id)?.price || 0) * i.qty, 0);
function cartAdd(id) {
  const p = P.find(x => x.id === id); if (!p || p.status === 'soon') return;
  const line = cart.find(i => i.id === id);
  if (line) line.qty = Math.min(10, line.qty + 1); else cart.push({ id, qty: 1 });
  saveCart(); openDrawer();
  toast(tr(`${p.name} agregado al carrito`, `${p.name} added to cart`));
}
function cartSet(id, qty) {
  const line = cart.find(i => i.id === id); if (!line) return;
  line.qty = qty; if (line.qty < 1) cart = cart.filter(i => i.id !== id);
  saveCart();
}
function paintCart() {
  const btn = $('.cart-btn'); if (!btn) return;
  const n = cartCount();
  btn.classList.toggle('has', n > 0);
  $('b', btn).textContent = n;
  const box = $('#drawerItems'); if (!box) return;
  if (!cart.length) {
    box.innerHTML = `<div class="drawer-empty"><p class="mono">${L('Tu carrito está vacío','Your cart is empty')}</p><a class="btn btn-line" href="productos.html" style="margin-top:16px">${L('Ver catálogo','See catalog')}</a></div>`;
  } else {
    box.innerHTML = cart.map(({id, qty}) => { const p = P.find(x => x.id === id); return `<div class="ci">
      <div>${cover(p)}</div>
      <div><span class="mono dim">${p.code}</span><b>${p.name}</b>
        <div class="qty"><button type="button" data-q="${id}:-1" aria-label="${tr('Quitar uno','Remove one')}">−</button><span>${qty}</span><button type="button" data-q="${id}:1" aria-label="${tr('Agregar uno','Add one')}">+</button></div>
        <button type="button" class="rm" data-rm="${id}">${L('Quitar','Remove')}</button></div>
      <span class="pr">${money(p.price * qty)}</span></div>`; }).join('');
  }
  const foot = $('#drawerFoot'); if (foot) foot.hidden = !cart.length;
  const tot = $('#cartTotal'); if (tot) tot.textContent = money(cartTotal());
}
function openDrawer() { $('.drawer')?.classList.add('on'); document.documentElement.style.overflow = 'hidden'; }
function closeDrawer() { $('.drawer')?.classList.remove('on'); document.documentElement.style.overflow = ''; }

function mountDrawer() {
  const d = document.createElement('div');
  d.className = 'drawer'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-label', tr('Carrito','Cart'));
  d.innerHTML = `<div class="drawer-box">
    <div class="drawer-top"><h3>${L('Carrito','Cart')}</h3><button class="chip" data-close>${L('Cerrar','Close')}</button></div>
    <div class="drawer-items" id="drawerItems"></div>
    <div class="drawer-foot" id="drawerFoot" hidden>
      <div class="tot"><span class="mono">${L('Total','Total')}</span><b id="cartTotal"></b></div>
      <div><label class="mono" for="cartMail" style="display:block;margin-bottom:8px">${L('Tu email (ahí llega el acceso)','Your email (where access is sent)')}</label><input id="cartMail" type="email" autocomplete="email" placeholder="hola@tuestudio.com"></div>
      <button class="btn btn-acid" data-pay="mercadopago">${L('Pagar con Mercado Pago','Pay with Mercado Pago')} <span class="ar">→</span></button>
      <button class="btn btn-line" data-pay="paypal">${L('Pagar con PayPal o tarjeta','Pay with PayPal or card')} <span class="ar">→</span></button>
      <p class="err" id="cartErr" role="alert"></p>
      <p class="note">${L('Mercado Pago cobra en pesos; PayPal, en dólares. Pago único, acceso para siempre.','Mercado Pago charges in ARS; PayPal in USD. One-time payment, lifetime access.')}</p>
    </div></div>`;
  document.body.append(d);
  d.addEventListener('click', async e => {
    if (e.target === d || e.target.closest('[data-close]')) return closeDrawer();
    const q = e.target.closest('[data-q]');
    if (q) { const [id, delta] = q.dataset.q.split(':'); const line = cart.find(i => i.id === id); cartSet(id, (line?.qty || 0) + Number(delta)); return; }
    const rm = e.target.closest('[data-rm]'); if (rm) { cartSet(rm.dataset.rm, 0); return; }
    const pay = e.target.closest('[data-pay]');
    if (pay) {
      const email = $('#cartMail').value.trim(), err = $('#cartErr');
      if (!/^\S+@\S+\.\S+$/.test(email)) { err.textContent = tr('Escribí un email válido.','Enter a valid email.'); return; }
      err.textContent = ''; const old = pay.innerHTML; pay.innerHTML = tr('Abriendo…','Opening…');
      try {
        const r = await fetch(`/api/checkout/${pay.dataset.pay}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: cart, email }),
        });
        const data = await r.json();
        if (data.url) { try { localStorage.setItem('orbit-last-order', data.orderId || ''); } catch (e) {} location.href = data.url; return; }
        err.textContent = data.error === 'not_configured'
          ? tr('Ese medio de pago todavía no está activo.','That payment method is not live yet.')
          : tr('No pudimos abrir el pago. Escribinos a hola@orbitando.com.ar','We couldn’t open the payment. Email hola@orbitando.com.ar');
      } catch (e) { err.textContent = tr('Sin conexión con el servidor de pagos.','No connection to the payment server.'); }
      pay.innerHTML = old;
    }
  });
  addEventListener('keydown', e => { if (e.key === 'Escape') closeDrawer(); });
  paintCart();
}

/* ---------- medición anónima de visitas ----------
   Cuenta páginas vistas sin cookies, sin identificadores y sin seguir a
   nadie entre sitios. Por eso no hace falta pedir consentimiento. */
window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };
(() => {
  const m = document.createElement('script');
  m.defer = true; m.src = '/_vercel/insights/script.js';
  document.head.append(m);
})();

/* ---------- sesión abierta ---------- */
/* La cookie orbit_user la pone el servidor al entrar y se borra sola al cerrar el navegador. */
const readCookie = name => {
  const hit = document.cookie.split(';').map(c => c.trim()).find(c => c.startsWith(name + '='));
  if (!hit) return null;
  try { return decodeURIComponent(hit.slice(name.length + 1)); } catch { return hit.slice(name.length + 1); }
};
const session = () => { const v = readCookie('orbit_user'); return v ? { name: v === '1' ? '' : v } : null; };

/* ---------- nav + footer compartidos ---------- */
const page = document.body.dataset.page;
const links = [['index.html',L('Inicio','Home'),'home'],['productos.html',L('Productos','Products'),'productos'],['nosotros.html',L('Nosotros','About'),'nosotros']];
const langSw = `<div class="langsw" role="group" aria-label="Idioma / Language"><button data-set="es" aria-pressed="${lang()==='es'}">ES</button><span>/</span><button data-set="en" aria-pressed="${lang()==='en'}">EN</button></div>`;
const nav = document.createElement('header');
nav.className = 'nav';
nav.innerHTML = `<a class="logo" href="index.html" aria-label="Orbit">${wm({color:'#F2EFE8'})}</a>
  <ul>${links.map(([h,t,k]) => `<li><a href="${h}"${k===page?' aria-current="page"':''}>${t}</a></li>`).join('')}</ul>
  <div class="right"><button class="cart-btn" type="button" aria-label="${tr('Carrito','Cart')}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 8h10l1.4 10.2a1.6 1.6 0 0 1-1.6 1.8H7.2a1.6 1.6 0 0 1-1.6-1.8L7 8Z" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M9.3 9.5V7.2a2.7 2.7 0 0 1 5.4 0v2.3" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg><b>0</b></button><a class="acc-link" href="acceso.html" aria-label="${tr('Iniciar sesión','Sign in')}" title="${tr('Iniciar sesión','Sign in')}" data-acc><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8.2" r="3.6" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M4.6 20.2c.7-4 3.7-6.2 7.4-6.2s6.7 2.2 7.4 6.2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg></a>${langSw}<button class="menu" aria-expanded="false" aria-controls="mnav">${L('Menú','Menu')}</button></div>`;
document.body.prepend(nav);

/* con sesión abierta el icono lleva al panel y muestra la inicial */
function paintAccount() {
  const a = $('[data-acc]', nav); if (!a) return;
  const s = session();
  a.classList.toggle('on', Boolean(s));
  a.href = s ? 'biblioteca.html' : 'acceso.html';
  const label = s ? (s.name ? tr('Mi cuenta', 'My account') + ' — ' + s.name : tr('Mi cuenta', 'My account')) : tr('Iniciar sesión', 'Sign in');
  a.setAttribute('aria-label', label); a.title = label;
  const ini = s && s.name ? s.name.trim()[0] : '';
  a.querySelector('.ini')?.remove();
  /* en SVG la propiedad .hidden no existe: hay que usar el atributo */
  const icon = a.querySelector('svg');
  if (ini) icon.setAttribute('hidden', ''); else icon.removeAttribute('hidden');
  if (ini) { const b = document.createElement('span'); b.className = 'ini'; b.textContent = ini; a.append(b); }
}
paintAccount();
addEventListener('orbit:lang', paintAccount);
addEventListener('orbit:session', paintAccount);
addEventListener('pageshow', paintAccount);
addEventListener('focus', paintAccount);
const navSolid = () => nav.classList.toggle('solid', scrollY > 12 || 'navSolid' in document.body.dataset);
addEventListener('scroll', navSolid, {passive:true}); navSolid();
const mnav = document.createElement('nav');
mnav.className = 'mnav'; mnav.id = 'mnav'; mnav.hidden = true; mnav.setAttribute('aria-label','Menu');
mnav.innerHTML = `<button class="chip x">${L('Cerrar','Close')}</button><div>${links.map(([h,t]) => `<a href="${h}">${t}</a>`).join('')}</div><div style="display:flex;justify-content:space-between;align-items:center;gap:16px">${langSw}<span class="mono">Orbit® — Ideas in motion</span></div>`;
document.body.append(mnav);
mountDrawer();
$('.cart-btn', nav).onclick = openDrawer;
$('.menu', nav).onclick = () => { mnav.hidden = false; $('.menu', nav).setAttribute('aria-expanded','true'); };
$('.x', mnav).onclick = () => { mnav.hidden = true; $('.menu', nav).setAttribute('aria-expanded','false'); };
addEventListener('keydown', e => { if (e.key === 'Escape') mnav.hidden = true; });
document.addEventListener('click', e => { const b = e.target.closest('.langsw button'); if (b) setLang(b.dataset.set); });

const foot = document.createElement('footer');
foot.className = 'foot';
foot.innerHTML = `<div class="wrap">
  <div style="display:flex;justify-content:space-between;gap:20px"><span class="mono">OB—000</span><span class="mono" style="text-align:right">${L('Ideas<br>Recursos<br>Crecimiento<br>Libertad','Ideas<br>Resources<br>Growth<br>Freedom')}</span></div>
  <h2 class="display" style="margin-top:40px">${L('Entrá<br>en órbita.','Enter<br>the orbit.')}</h2>
  <div class="cols">
    <div><span class="mono dim">${L('Productos','Products')}</span>${P.map(p => `<a href="${url(p)}">${p.code} ${p.name}</a>`).join('')}</div>
    <div><span class="mono dim">${L('Familias','Families')}</span>${Object.entries(FAM).map(([k,[n]]) => `<a href="productos.html#${k}">${n}</a>`).join('')}</div>
    <div><span class="mono dim">Orbit</span><a href="nosotros.html">${L('Nosotros','About')}</a><a href="index.html#a-medida">${L('Pedidos a medida','Custom requests')}</a><a href="${session() ? 'biblioteca.html' : 'acceso.html'}">${L('Mi cuenta','My account')}</a><a href="nosotros.html#manifiesto">${L('Manifiesto','Manifesto')}</a><a href="https://mariasicco.github.io/orbit-brand-manual/">${L('Manual de marca','Brand manual')}</a></div>
    <div><span class="mono dim">${L('Contacto','Contact')}</span><a href="mailto:hola@orbitando.com.ar">hola@orbitando.com.ar</a><a href="https://www.instagram.com/orbitando.ba/" target="_blank" rel="noopener">Instagram</a><a href="acceso.html?nuevo=1">Newsletter</a></div>
    <div><span class="mono dim">Legal</span><a href="terminos.html">${L('Términos y condiciones','Terms and conditions')}</a><a href="privacidad.html">${L('Política de privacidad','Privacy policy')}</a><a href="terminos.html#arrepentimiento">${L('Botón de arrepentimiento','Right to cancel')}</a></div>
  </div>
  <div class="base"><div>${wm({color:C.b})}<p class="mono" style="margin:10px 0 0">${L('Orden en movimiento.','Order in motion.')}</p></div><span class="mono dim" style="text-align:right">${L('Mismas personas. Más herramientas.<br>Un mejor mañana.','Same people. More tools.<br>A brighter tomorrow.')} — Est. 2026</span></div>
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
function pintarTickers() {
  $$('[data-ticker], [data-ticker-es]').forEach(el => {
    const frases = el.dataset['ticker' + (lang() === 'en' ? 'En' : 'Es')] || el.dataset.ticker || '';
    const h = frases.split('|').map(t => `<span>${t}</span><i>·</i>`).join('');
    el.innerHTML = `<div>${h}${h}</div>`;
  });
}
pintarTickers();
addEventListener('orbit:lang', pintarTickers);

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

window.ORBIT = {C, RM, $, $$, L, tr, lang, setLang, cartAdd, openDrawer, sym, symInner, wm, bigWm, cover, card, buyBtn, money, url, toast, reveal: needGate ? () => {} : reveal, mountBox, follow, P, FAM, ACC};
})();
