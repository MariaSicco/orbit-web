/* ORBIT · Cotizador Pro — la propuesta como experiencia web.
   COTW.mount(el, P, { onAccept, accepted, preview }) arma la página y sus animaciones.
   Usa GSAP + ScrollTrigger si están; si no (o con movimiento reducido) queda estática. */
(() => {
const R = window.COTR, { FONTS } = window.COT;
const esc = R.esc;
const nl2br = s => esc(s).replace(/\n/g, '<br>');
const has = a => (a || []).some(x => String(x || '').trim());
const OK = '<svg viewBox="0 0 20 20"><path d="M4 10.5l4 4 8-9" fill="none" stroke-width="2"/></svg>';
const NO = '<svg viewBox="0 0 20 20"><path d="M5 5l10 10M15 5L5 15" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';
const words = (s, cls = 'w') => esc(s).split(/\s+/).filter(Boolean).map(w => `<span class="${cls}"><span>${w}</span></span>`).join(' ');
const photoUrl = ph => ph && (ph.u || ph.d) || '';

function titleHtml(P) {
  const t = String(P.proj || R.docTitle(P)).trim();
  if (!['editorial', 'dark'].includes(P.theme)) return words(t);
  const ws = t.split(/\s+/); const k = Math.max(1, Math.floor(ws.length / 2));
  return words(ws.slice(0, k).join(' ')) + ' <em>' + words(ws.slice(k).join(' ')) + '</em>';
}

function build(P, opt) {
  const t = R.L(P), c = R.calc(P), S = P.sections || {}, m = v => R.money(v, P);
  const photos = (P.biz.photos || []).filter(photoUrl);
  const cover = photos[P.coverIdx || 0] && photoUrl(photos[P.coverIdx || 0]);
  const valid = P.dIssue ? R.addDays(P.dIssue, P.valid || 15) : '';
  const logo = P.biz.logo ? `<img class="x-logo" src="${P.biz.logo}" alt="">` : `<span class="x-ini">${esc((P.biz.name || '·')[0])}</span>`;
  let n = 0; const lab = (s) => `<div class="x-lab x-mono x-rv"><b>${String(++n).padStart(2, '0')}</b>${esc(s)}</div>`;
  const ans = (P.answers || []).filter(a => String(a.v || '').trim());
  const svc = (c.mode === 'packages' ? c.pk.map(p => p.n) : (c.items || []).map(i => i.n)).concat(P.del || []).filter(x => String(x || '').trim()).slice(0, 8);
  const phone = String(P.biz.phone || '').replace(/[^\d]/g, '');
  let h = '';

  h += `<div class="x-progress"></div>`;
  h += `<div class="x-curtain"><div>${P.biz.logo ? `<img src="${P.biz.logo}" alt="">` : ''}<b>${esc(P.biz.name)}</b></div></div>`;
  if (P.theme === 'dark') h += `<div class="x-glow" aria-hidden="true"></div>`;
  h += `<nav class="x-nav"><span class="pill">${logo}<b>${esc(P.biz.name)}</b></span><span class="sp"></span>${S.accept !== false ? `<a href="#aceptar">${t.acceptBtn}</a>` : ''}</nav>`;

  h += `<header class="x-hero${cover ? ' has-img' : ''}">
    ${cover ? `<div class="x-hero-media"><img src="${cover}" alt=""></div>` : ''}
    ${P.theme === 'editorial' && !cover ? '<div class="x-blob" aria-hidden="true"></div>' : ''}
    ${P.theme === 'dark' ? '<div class="x-ring" aria-hidden="true"></div>' : ''}
    ${P.theme === 'minimal' ? '<div class="x-dot" aria-hidden="true"></div>' : ''}
    ${P.theme === 'bold' ? `<div class="x-sticker" aria-hidden="true"><svg viewBox="0 0 200 200"><defs><path id="cp" d="M100,100 m-78,0 a78,78 0 1,1 156,0 a78,78 0 1,1 -156,0"/></defs><circle cx="100" cy="100" r="98" fill="var(--ink)"/><text font-family="Unbounded" font-weight="700" font-size="15" fill="var(--bg)"><textPath href="#cp" textLength="486" lengthAdjust="spacing">${esc(((R.docTitle(P) + ' · ' + (P.num || '') + ' · ').repeat(2)).toUpperCase())}</textPath></text><circle cx="100" cy="100" r="18" fill="var(--c)"/></svg></div>` : ''}
    <div class="x-in">
      <div class="x-kick x-mono"><span>${esc(R.docTitle(P))} · ${esc(P.num)}</span><span>${t.for} ${esc(P.cli.name)}${P.cli.co ? ' · ' + esc(P.cli.co) : ''}</span></div>
      <h1 class="x-h x-title">${titleHtml(P)}</h1>
      <div class="x-hmeta"><div><span class="x-mono">${t.date}</span><b>${R.fdate(P.dIssue, P)}</b></div>${valid ? `<div><span class="x-mono">${t.valid}</span><b>${R.fdate(valid, P)}</b></div>` : ''}${c.from ? `<div><span class="x-mono">${c.mode === 'packages' ? t.from : t.total}</span><b>${m(c.from)}</b></div>` : ''}</div>
    </div>
    <span class="x-cue x-mono">${t.scroll}</span>
  </header>`;

  if (svc.length) { const row = svc.map(s => `<span>${esc(s)}</span>`).join(''); h += `<div class="x-mq" aria-hidden="true"><div>${row}${row}${row}${row}</div></div>`; }

  const F = {};
  F.about = () => {
  if (S.about !== false && (P.biz.bio || has(P.biz.why))) {
    h += `<section class="x-sec"><div class="x-in">${lab(t.about)}${P.biz.bio ? `<p class="x-statement">${esc(P.biz.bio).split(/\s+/).map(w => `<span class="sw">${w}</span>`).join(' ')}</p>` : ''}
      ${has(P.biz.why) ? `<ol class="x-why">${P.biz.why.filter(x => x.trim()).map((w, i) => `<li class="x-rv"><span>${String(i + 1).padStart(2, '0')}</span>${esc(w)}</li>`).join('')}</ol>` : ''}</div></section>`;
  }
  };
  F.gallery = () => {
  if (S.gallery !== false && photos.length > (cover ? 1 : 0)) {
    const gal = photos.filter((p, i) => !(cover && i === (P.coverIdx || 0)) || photos.length < 3);
    h += `<section class="x-gal" aria-label="${t.work}"><div class="x-in">${lab(t.work)}</div><div class="x-gal-track">${gal.map(p => `<figure><img src="${photoUrl(p)}" alt="" loading="lazy"></figure>`).join('')}</div></section>`;
  }
  };
  F.project = () => {
  if (S.project !== false && (P.goal || ans.length)) {
    h += `<section class="x-sec"><div class="x-in">${lab(t.theProject)}${P.goal ? `<blockquote class="x-goal x-rv">${nl2br(P.goal)}</blockquote>` : ''}
      ${ans.length ? `<dl class="x-specs">${ans.map(a => `<div class="x-rv"><dt class="x-mono">${esc(a.l)}</dt><dd>${nl2br(a.v)}</dd></div>`).join('')}</dl>` : ''}</div></section>`;
  }
  };
  F.scope = () => {
  if (S.scope !== false && ((c.mode === 'items' && c.items.length) || has(P.inc) || has(P.exc) || has(P.del))) {
    h += `<section class="x-sec"><div class="x-in">${lab(t.scope)}`;
    if (c.mode === 'items' && c.items.length) h += `<ul class="x-items">${c.items.map((it, i) => `<li class="x-rv"><span class="n">${String(i + 1).padStart(2, '0')}</span><b>${esc(it.n)}</b><strong>${m(c.lines[i])}</strong>${it.d ? `<small>${nl2br(it.d)}</small>` : ''}${Number(it.q) !== 1 ? `<em>${esc(it.q)} × ${m(it.p)}</em>` : ''}</li>`).join('')}</ul>`;
    if (has(P.inc) || has(P.exc)) h += `<div class="x-cols">${has(P.inc) ? `<div class="x-rv"><span class="x-mono" style="color:var(--mut)">${t.includes}</span><ul class="x-ok">${P.inc.filter(x => x.trim()).map(x => `<li>${OK}<span>${esc(x)}</span></li>`).join('')}</ul></div>` : ''}${has(P.exc) ? `<div class="x-rv"><span class="x-mono" style="color:var(--mut)">${t.excludes}</span><ul class="x-no">${P.exc.filter(x => x.trim()).map(x => `<li>${NO}<span>${esc(x)}</span></li>`).join('')}</ul></div>` : ''}</div>`;
    if (has(P.del)) h += `<div class="x-rv" style="margin-top:clamp(40px,6vw,70px)"><span class="x-mono" style="color:var(--mut)">${t.deliverables}</span><div class="x-del">${P.del.filter(x => x.trim()).map(x => `<span>${esc(x)}</span>`).join('')}</div></div>`;
    h += `</div></section>`;
  }
  };
  const phases = (P.phases || []).filter(p => (p.n || '').trim());
  F.timeline = () => {
  if (S.timeline !== false && (phases.length || P.dStart || P.dDelivery)) {
    h += `<section class="x-sec"><div class="x-in">${lab(t.timeline)}${phases.length ? `<ol class="x-tl"><i class="x-tl-line"><i></i></i>${phases.map((p, i) => `<li class="x-rv"><span class="k x-mono">${String(i + 1).padStart(2, '0')}</span><b>${esc(p.n)}</b><span class="d">${esc(p.d)}</span></li>`).join('')}</ol>` : ''}
      ${P.dStart || P.dDelivery ? `<div class="x-dates x-rv">${P.dStart ? `<div><span class="x-mono">${t.start}</span><b>${R.fdate(P.dStart, P)}</b></div>` : ''}${P.dDelivery ? `<div><span class="x-mono">${t.delivery}</span><b>${R.fdate(P.dDelivery, P)}</b></div>` : ''}</div>` : ''}</div></section>`;
  }
  };
  F.investment = () => {
  if (S.investment !== false) {
    h += `<section class="x-sec" id="inversion"><div class="x-in">${lab(t.investment)}`;
    const taxL = P.taxName || t.tax;
    if (c.mode === 'packages') {
      h += `<div class="x-pk">${c.pk.map((p, i) => { const x = c.per[i]; return `<article class="x-card x-rv${p.rec ? ' rec' : ''}"><span class="tg x-mono">${p.rec ? t.recommended : t.option + ' ' + (i + 1)}</span><h3>${esc(p.n)}</h3>${p.d ? `<p>${esc(p.d)}</p>` : ''}<div class="pr" data-count="${x.total}">${m(x.total)}</div>${has(p.f) ? `<ul>${p.f.filter(f => f.trim()).map(f => `<li>${OK}<span>${esc(f)}</span></li>`).join('')}</ul>` : ''}${x.total ? `<div class="pp">${t.deposit}: <b>${m(x.dep)}</b>${x.rest ? `<br>${t.balance}: ${m(x.rest)}${x.inst > 1 ? ` ${t.in} ${x.inst} ${t.installments} ${m(x.cuota)}` : ''}` : ''}</div>` : ''}</article>`; }).join('')}</div>`;
    } else {
      const x = c.main;
      h += `<div class="x-total x-rv">${x.disc || x.tax ? `<div class="r"><span>${t.subtotal}</span><span>${m(x.sub)}</span></div>` : ''}${x.disc ? `<div class="r"><span>${t.discount}</span><span>− ${m(x.disc)}</span></div>` : ''}${x.tax ? `<div class="r"><span>${esc(taxL)} (${esc(P.taxPct)}%)</span><span>${m(x.tax)}</span></div>` : ''}</div>
        <div class="x-price x-h" data-count="${x.total}">${m(x.total)}</div>
        ${x.total ? `<div class="x-dep x-rv"><div><span class="x-mono" style="color:var(--mut)">${t.deposit}</span><b>${m(x.dep)}</b></div><div><span class="x-mono" style="color:var(--mut)">${t.balance}</span><b>${m(x.rest)}</b>${x.inst > 1 && x.rest ? `<small>${t.in} ${x.inst} ${t.installments} ${m(x.cuota)}</small>` : ''}</div></div>` : ''}`;
    }
    const ex = (P.extras || []).filter(e => (e.n || '').trim());
    if (ex.length) h += `<div class="x-ex x-rv"><span class="x-mono" style="color:var(--mut)">${t.extras}</span>${ex.map(e => `<div class="r"><span>${esc(e.n)}</span><b>${Number(e.p) ? '+ ' + m(e.p) : ''}</b></div>`).join('')}</div>`;
    const pay = P.pay || {};
    if (has(pay.methods) || pay.data) h += `<div class="x-pay x-rv">${has(pay.methods) ? `<div><span class="x-mono" style="color:var(--mut)">${t.payment}</span><p>${pay.methods.filter(Boolean).map(esc).join(' · ')}</p></div>` : ''}${pay.data ? `<div><span class="x-mono" style="color:var(--mut)">${t.paymentData}</span><p>${esc(pay.data)}</p></div>` : ''}</div>`;
    h += `</div></section>`;
  }
  };
  F.terms = () => {
  if (S.terms !== false && (has(P.terms) || P.notes)) {
    h += `<section class="x-sec"><div class="x-in">${lab(t.terms)}<div class="x-terms x-rv">${has(P.terms) ? `<details open><summary>${t.terms}</summary><ol>${P.terms.filter(x => x.trim()).map(x => `<li>${esc(x)}</li>`).join('')}</ol></details>` : ''}${P.notes ? `<details><summary>${t.notes}</summary><p>${esc(P.notes)}</p></details>` : ''}</div></div></section>`;
  }
  };
  R.sectionOrder(P).forEach(k => F[k] && F[k]());
  if (S.accept !== false) {
    h += `<section class="x-acc" id="aceptar"><div class="x-in"><div class="x-lab x-mono" style="color:inherit;opacity:.6"><b>✦</b>${t.accept}</div><div id="xAccBox"></div></div></section>`;
  }
  h += `<footer class="x-foot"><div class="x-in"><p class="x-h x-big">${t.thanks}</p>
    <div class="x-ct">${phone ? `<a class="wa" href="https://wa.me/${phone}?text=${encodeURIComponent((P.lang === 'en' ? 'Hi! About the proposal: ' : P.lang === 'pt' ? 'Oi! Sobre a proposta: ' : 'Hola! Sobre la propuesta: ') + (P.proj || ''))}" target="_blank" rel="noopener">${t.wa}</a>` : ''}${P.biz.mail ? `<a href="mailto:${esc(P.biz.mail)}">${esc(P.biz.mail)}</a>` : ''}${P.biz.web ? `<span class="x-ct-s" style="padding:14px 4px;color:var(--mut)">${esc(P.biz.web)}</span>` : ''}</div>
    <p class="x-mono" style="color:var(--mut);margin-top:28px">${t.notInvoice}${P.biz.tax ? ' · ' + esc(P.biz.tax) : ''}</p>
    ${opt.preview ? '' : `<a class="x-made x-mono" href="/cotizador?utm_source=propuesta&utm_medium=referral" target="_blank" rel="noopener">${t.made} · Cotizador Pro</a>`}</div></footer>`;
  h += `<div class="x-bar" id="xBar"></div>`;
  return h;
}

/* ---------- aceptar ---------- */
function acceptUI(root, P, opt, state) {
  const t = R.L(P), c = R.calc(P), m = v => R.money(v, P), box = root.querySelector('#xAccBox'), bar = root.querySelector('#xBar');
  const drawBar = () => {
    if (!bar) return;
    bar.innerHTML = `<div class="t"><span class="x-mono">${c.mode === 'packages' ? t.from : t.total}</span><b>${m(c.from)}</b></div><span class="sp"></span>` +
      (state.accepted ? `<span class="ok">✓ ${t.accepted}${state.accepted.option ? ' · ' + esc(state.accepted.option) : ''}</span>` : (box ? `<a href="#aceptar">${t.acceptBtn}</a>` : ''));
  };
  const done = () => {
    const a = state.accepted;
    box.innerHTML = `<div class="x-done"><h3>✓ ${t.accepted}</h3><p>${t.signed} <b>${esc(a.name)}</b>${a.option ? ` · ${t.yourOption}: <b>${esc(a.option)}</b>` : ''}</p>${a.sig ? `<img src="${a.sig}" alt="">` : ''}</div>`;
  };
  drawBar();
  if (!box) return;
  if (state.accepted) { done(); return; }
  box.innerHTML = `<h2 class="x-h x-big">${t.letsGo}</h2><p class="sub">${t.letsGoSub}</p>
    <div class="x-form">
      ${c.mode === 'packages' ? `<div class="x-opts" role="radiogroup" aria-label="${t.choose}">${c.pk.map((p, i) => `<label class="x-opt"><input type="radio" name="xop" value="${esc(p.n)}" ${p.rec ? 'checked' : ''}>${esc(p.n)}<b>${m(c.per[i].total)}</b></label>`).join('')}</div>` : ''}
      <label class="f">${t.yourName}<input type="text" id="xName" autocomplete="name" maxlength="120"></label>
      <div class="x-sig"><canvas id="xSig" aria-label="${t.sign}"></canvas><span>${t.sign}</span><button type="button" id="xClr">${t.clear}</button></div>
      <button class="x-go" type="button" id="xGo">${t.acceptBtn}</button><p class="x-err" id="xErr" role="alert"></p>
    </div>`;
  // firma
  const cv = box.querySelector('#xSig'), ctx = cv.getContext('2d'); let drawn = false, down = false, last = null;
  const size = () => { const r = cv.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1); cv.width = r.width * d; cv.height = r.height * d; ctx.scale(d, d); ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = getComputedStyle(cv).color; drawn = false; };
  size(); addEventListener('resize', () => { if (!drawn) size(); });
  const pt = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  cv.addEventListener('pointerdown', e => { down = true; last = pt(e); cv.setPointerCapture(e.pointerId); });
  cv.addEventListener('pointermove', e => { if (!down) return; const p = pt(e); ctx.beginPath(); ctx.moveTo(...last); ctx.lineTo(...p); ctx.stroke(); last = p; drawn = true; });
  ['pointerup', 'pointercancel'].forEach(ev => cv.addEventListener(ev, () => { down = false; }));
  box.querySelector('#xClr').onclick = () => { ctx.clearRect(0, 0, cv.width, cv.height); drawn = false; };
  box.querySelector('#xGo').onclick = async () => {
    const name = box.querySelector('#xName').value.trim(), err = box.querySelector('#xErr');
    if (name.length < 2) { err.textContent = t.yourName; box.querySelector('#xName').focus(); return; }
    if (!drawn) { err.textContent = t.needSign; return; }
    const out = document.createElement('canvas'); out.width = 420; out.height = 150; const o = out.getContext('2d');
    o.drawImage(cv, 0, 0, out.width, out.height);
    const id = o.getImageData(0, 0, 420, 150); for (let i = 0; i < id.data.length; i += 4) { const a = id.data[i + 3]; id.data[i] = id.data[i + 1] = id.data[i + 2] = 20; id.data[i + 3] = a; } o.putImageData(id, 0, 0);
    const sig = out.toDataURL('image/png');
    const op = box.querySelector('input[name=xop]:checked');
    const b = box.querySelector('#xGo'); b.disabled = true; err.textContent = '';
    try {
      const a = await opt.onAccept({ name, option: op ? op.value : '', sig });
      state.accepted = a; done(); drawBar();
    } catch (e) { b.disabled = false; err.textContent = { es: 'No se pudo enviar. Probá de nuevo.', en: 'Could not send. Please try again.', pt: 'Não foi possível enviar. Tente de novo.' }[P.lang] || 'Error'; }
  };
}

/* ---------- animación ---------- */
function animate(root, P) {
  const motion = (P.design || {}).motion || 'full';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches || motion === 'none';
  const soft = motion === 'soft';
  const g = window.gsap, ST = window.ScrollTrigger;
  const bar = root.querySelector('#xBar');
  const showBar = () => bar && bar.classList.toggle('on', scrollY > innerHeight * .6);
  addEventListener('scroll', showBar, { passive: true });
  const prog = root.querySelector('.x-progress');
  addEventListener('scroll', () => { const h = document.documentElement.scrollHeight - innerHeight; prog.style.transform = `scaleX(${h > 0 ? scrollY / h : 0})`; }, { passive: true });
  if (reduce || !g || !ST) { root.classList.add('x-static'); return; }
  g.registerPlugin(ST);
  const E = 'power3.out';
  if (soft) {
    root.querySelector('.x-curtain')?.remove();
    g.from('.x-hero .x-in > *', { y: 24, opacity: 0, duration: 1, ease: E, stagger: .1 });
    ST.batch(root.querySelectorAll('.x-rv'), { start: 'top 90%', onEnter: els => g.to(els, { opacity: 1, y: 0, duration: .8, ease: E, stagger: .06, overwrite: true }) });
    root.querySelectorAll('.x-statement .sw').forEach(w => w.style.opacity = 1);
    root.querySelectorAll('.x-tl li').forEach(li => li.classList.add('on'));
    root.querySelectorAll('.x-tl-line i').forEach(l => l.style.transform = 'none');
    const gal = root.querySelector('.x-gal'); if (gal) { gal.style.overflowX = 'auto'; gal.querySelectorAll('img').forEach(i => i.style.transform = 'none'); }
    return;
  }
  const tl = g.timeline();
  tl.from('.x-curtain div', { y: 30, opacity: 0, duration: .6, ease: E })
    .to('.x-curtain', { yPercent: -100, duration: .9, ease: 'expo.inOut' }, '+=.35')
    .set('.x-curtain', { display: 'none' })
    .from('.x-title .w>span', { yPercent: 115, duration: 1.1, ease: 'expo.out', stagger: .07 }, '-=.45')
    .from('.x-kick, .x-hmeta', { y: 20, opacity: 0, duration: .8, ease: E, stagger: .1 }, '-=.8')
    .from('.x-hero-media', { clipPath: 'inset(100% 0 0 0)', duration: 1.4, ease: 'expo.inOut' }, '-=1.3')
    .from('.x-blob, .x-ring, .x-sticker, .x-dot', { scale: .4, opacity: 0, duration: 1.3, ease: 'expo.out' }, '-=1.2');
  g.to('.x-hero-media img', { yPercent: -12, ease: 'none', scrollTrigger: { trigger: '.x-hero', start: 'top top', end: 'bottom top', scrub: true } });
  g.to('.x-hero .x-in', { yPercent: -18, opacity: .2, ease: 'none', scrollTrigger: { trigger: '.x-hero', start: 'top top', end: 'bottom top', scrub: true } });
  // frase de presentación que se enciende palabra por palabra
  root.querySelectorAll('.x-statement').forEach(el => g.to(el.querySelectorAll('.sw'), { opacity: 1, stagger: .05, ease: 'none', scrollTrigger: { trigger: el, start: 'top 80%', end: 'bottom 45%', scrub: true } }));
  // revelados
  ST.batch(root.querySelectorAll('.x-rv'), { start: 'top 88%', onEnter: els => g.to(els, { opacity: 1, y: 0, duration: 1, ease: E, stagger: .08, overwrite: true }) });
  // galería horizontal
  const track = root.querySelector('.x-gal-track');
  if (track && matchMedia('(min-width: 821px)').matches && track.scrollWidth > innerWidth) {
    g.to(track, { x: () => -(track.scrollWidth - innerWidth), ease: 'none', scrollTrigger: { trigger: '.x-gal', start: 'top top', end: () => '+=' + (track.scrollWidth - innerWidth), pin: true, scrub: .6, invalidateOnRefresh: true } });
    root.querySelectorAll('.x-gal img').forEach(img => g.to(img, { scale: 1, ease: 'none', scrollTrigger: { trigger: '.x-gal', start: 'top top', end: () => '+=' + (track.scrollWidth - innerWidth), scrub: true } }));
  }
  // cronograma
  const line = root.querySelector('.x-tl-line i');
  if (line) {
    g.to(line, { scaleY: 1, ease: 'none', scrollTrigger: { trigger: '.x-tl', start: 'top 70%', end: 'bottom 60%', scrub: true } });
    root.querySelectorAll('.x-tl li').forEach(li => ST.create({ trigger: li, start: 'top 65%', onEnter: () => li.classList.add('on'), onLeaveBack: () => li.classList.remove('on') }));
  }
  // precios que cuentan
  root.querySelectorAll('[data-count]').forEach(el => {
    const v = Number(el.dataset.count) || 0; if (!v) return;
    const o = { n: 0 };
    ST.create({ trigger: el, start: 'top 90%', once: true, onEnter: () => g.to(o, { n: v, duration: 1.6, ease: 'expo.out', onUpdate: () => { el.textContent = R.money(Math.round(o.n), P); } }) });
  });
  // tarjetas con inclinación
  if (matchMedia('(hover:hover)').matches) root.querySelectorAll('.x-card').forEach(card => {
    if (P.theme === 'bold') return;
    card.addEventListener('pointermove', e => { const r = card.getBoundingClientRect(); const x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5; g.to(card, { rotateY: x * 8, rotateX: -y * 8, duration: .4, ease: E, transformPerspective: 900 }); });
    card.addEventListener('pointerleave', () => g.to(card, { rotateY: 0, rotateX: 0, duration: .6, ease: E }));
  });
  // luz que sigue al puntero (Premium)
  const glow = root.querySelector('.x-glow');
  if (glow && matchMedia('(hover:hover)').matches) { const qx = g.quickTo(glow, 'left', { duration: .8, ease: E }), qy = g.quickTo(glow, 'top', { duration: .8, ease: E }); addEventListener('pointermove', e => { qx(e.clientX); qy(e.clientY); }); }
  addEventListener('load', () => ST.refresh());
  document.fonts && document.fonts.ready.then(() => ST.refresh());
}

function mount(root, P, opt = {}) {
  root.className = `xw t-${P.theme || 'minimal'}`;
  root.style.setProperty('--c', P.color || '#3047FF');
  root.style.setProperty('--ct', R.onColor(P.color || '#3047FF'));
  R.applyDesign(root, P);
  if (((P.design || {}).motion) === 'none') root.classList.add('x-static');
  document.documentElement.style.background = getComputedStyle(root).getPropertyValue('--bg');
  root.innerHTML = build(P, opt);
  document.documentElement.style.background = getComputedStyle(root).backgroundColor;
  document.body.style.background = getComputedStyle(root).backgroundColor;
  acceptUI(root, P, opt, { accepted: opt.accepted || null });
  animate(root, P);
}
window.COTW = { mount };
})();
