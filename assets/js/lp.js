/* ORBIT — comportamiento de las landings de producto.
   Necesita orbit.js (carrito, pago, cookies y píxel) cargado antes. */
(function () {
  var O = window.ORBIT; if (!O) return;
  var b = document.body, main = b.dataset.prod, bump = b.dataset.bump;
  var P = function (id) { return O.P.find(function (p) { return p.id === id; }); };
  var fmt = function (n) { return '$' + Number(n).toLocaleString('es-AR'); };
  var inCart = function (id) { try { return JSON.parse(localStorage.getItem('orbit-cart') || '[]').some(function (i) { return i.id === id; }); } catch (e) { return false; } };

  /* precios desde el catálogo (así no quedan desfasados si cambia el precio) */
  var pm = P(main), pb = bump ? P(bump) : null;
  document.querySelectorAll('[data-price]').forEach(function (el) { var p = P(el.dataset.price); if (p && p.ars) el.textContent = fmt(p.ars); });
  function total() {
    var on = document.querySelector('[data-bump-check]');
    var t = (pm ? pm.ars : 0) + (on && on.checked && pb ? pb.ars : 0);
    document.querySelectorAll('[data-total]').forEach(function (el) { el.textContent = fmt(t); });
  }
  document.addEventListener('change', function (e) { if (e.target.matches('[data-bump-check]')) { document.querySelectorAll('[data-bump-check]').forEach(function (c) { c.checked = e.target.checked; }); total(); } });
  total();

  /* comprar: suma el producto (y el agregado si está tildado) y abre el carrito con el pago */
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-lp-buy]'); if (!btn) return;
    e.preventDefault();
    var withBump = btn.dataset.lpBuy === 'bump' || Array.prototype.some.call(document.querySelectorAll('[data-bump-check]'), function (c) { return c.checked; });
    if (!inCart(main)) O.cartAdd(main);
    if (withBump && bump && !inCart(bump)) O.cartAdd(bump);
    O.openDrawer();
    setTimeout(function () { var m = document.getElementById('cartMail'); if (m && innerWidth > 700) m.focus(); }, 400);
  });

  /* muestra por mail: guarda el lead, manda el mail 1 y deja bajar el PDF igual */
  document.addEventListener('submit', function (e) {
    var f = e.target.closest('[data-lead]'); if (!f) return;
    e.preventDefault();
    var inp = f.querySelector('input[type=email]'), msg = f.querySelector('.lead-msg'), btn = f.querySelector('button');
    var email = (inp.value || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { msg.textContent = 'Escribí un email válido.'; inp.focus(); return; }
    btn.disabled = true; msg.textContent = 'Enviando…';
    var payload = Object.assign({ email: email, prod: f.dataset.lead }, O.attr ? O.attr() : {});
    fetch('/api/lead', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d.ok) throw new Error(d.error || 'error');
        O.track.lead && O.track.lead(f.dataset.lead);
        msg.textContent = d.mail === 'ok' || d.mail === 'ya enviado' ? 'Listo. Te la mandamos a ' + email + '. Si no llega en unos minutos, revisá Promociones o Spam.' : 'Listo. Bajala con el link de abajo.';
        inp.value = '';
      })
      .catch(function () { msg.textContent = 'No pudimos mandarla. Bajala directo con el link de abajo.'; })
      .then(function () { btn.disabled = false; });
  });

  if (pm) O.track.viewContent(pm);

  /* barra fija: aparece cuando el botón del hero sale de pantalla */
  var bar = document.querySelector('.lp-bar'), hero = document.querySelector('.lp-hero .lp-cta');
  if (bar && hero && 'IntersectionObserver' in window) {
    new IntersectionObserver(function (es) { es.forEach(function (x) { bar.classList.toggle('on', !x.isIntersecting && x.boundingClientRect.top < 0); }); }).observe(hero);
  }
  /* aparición suave al scrollear */
  var rm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var rv = document.querySelectorAll('.rv');
  if (rm || !('IntersectionObserver' in window)) rv.forEach(function (el) { el.classList.add('in'); });
  else { var io = new IntersectionObserver(function (es) { es.forEach(function (x) { if (x.isIntersecting) { x.target.classList.add('in'); io.unobserve(x.target); } }); }, { rootMargin: '0px 0px -6% 0px' }); rv.forEach(function (el) { io.observe(el); }); }
  /* el video del hero no corre si la persona pidió menos movimiento */
  if (rm) document.querySelectorAll('video[autoplay]').forEach(function (v) { v.removeAttribute('autoplay'); v.pause(); });
})();
