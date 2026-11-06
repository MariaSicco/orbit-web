/* Páginas de las apps: sin dependencias. Cada efecto parte de un estado que ya se lee sin JavaScript. */
(() => {
const quieto = matchMedia('(prefers-reduced-motion:reduce)').matches;
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const cl = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const ease = x => x * x * (3 - 2 * x);
const barra = $('.barra'), fija = $('.fija'), hero = $('.hero');
const pan = $('.escena .pan'), flotas = $$('.flota');
const caos = $('.caos'), pz = caos ? $$('.pz', caos) : [];
/* cada pieza arranca en su lugar, repartida alrededor del título */
pz.forEach((p, i) => { const a = i * 2.399, R = 1; p._x = Math.cos(a) * R; p._y = Math.sin(a) * R; });
function pintar() {
  const y = scrollY, vh = innerHeight, vw = innerWidth;
  barra.classList.toggle('sol', y > 30);
  if (fija) fija.classList.toggle('on', y > hero.offsetHeight * .7 && !enPrecio());
  if (quieto) return;
  if (pan && vw > 860) { const k = cl(y / vh); pan.style.transform = `rotateY(${-9 + k * 9}deg) rotateX(${3 - k * 3}deg) translateY(${-k * 40}px)`; }
  flotas.forEach((f, i) => { f.style.transform = `translateY(${-y * (.08 + i * .05)}px)`; });
  if (caos) {
    const r = caos.getBoundingClientRect(), k = ease(cl(-r.top / Math.max(1, r.height - vh)));
    const rx = Math.min(vw * .44, 640), ry = vh * .4;
    pz.forEach((p, i) => { const e = ease(cl(k * 1.5 - i * .025)); p.style.transform = `translate(-50%,-50%) translate(${p._x * rx * (1 - e)}px,${p._y * ry * (1 - e)}px) rotate(${(1 - e) * (i % 2 ? 8 : -7)}deg) scale(${1 - e * .75})`; p.style.opacity = 1 - cl((e - .78) / .22); });
  }
}
const pre = $('.pre');
const enPrecio = () => pre && pre.getBoundingClientRect().top < innerHeight * .8;
addEventListener('scroll', () => requestAnimationFrame(pintar), {passive: true});
addEventListener('resize', pintar);
pintar();
/* recorrido: el texto que está en pantalla decide qué captura se ve */
const pasos = $$('.paso'), pantallas = $$('.pantallas .pan');
if (pasos.length) {
  const io = new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return;
    const i = pasos.indexOf(e.target);
    pasos.forEach((p, k) => p.classList.toggle('on', k === i));
    pantallas.forEach((p, k) => p.classList.toggle('on', k === i));
  }), {rootMargin: '-45% 0px -45% 0px'});
  pasos.forEach(p => io.observe(p));
  pasos[0].classList.add('on'); if (pantallas[0]) pantallas[0].classList.add('on');
}
/* números que suben una vez */
$$('[data-cuenta]').forEach(el => {
  const fin = Number(el.dataset.cuenta), fmt = n => '$ ' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  if (quieto) { el.textContent = fmt(fin); return; }
  const io = new IntersectionObserver(([e]) => { if (!e.isIntersecting) return; io.disconnect(); const t0 = performance.now();
    (function f(t) { const k = cl((t - t0) / 1300); el.textContent = fmt(fin * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(f); })(t0); });
  io.observe(el);
});
})();
