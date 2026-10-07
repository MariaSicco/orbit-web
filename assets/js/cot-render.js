/* ORBIT · Cotizador Pro — motor de la propuesta.
   Un mismo objeto de datos (P) se dibuja como:
   - páginas A4 de 794×1123 px (para PDF), con paginado automático por bloques
   - página web continua (link para el cliente)
   - tarjeta 1080×1350 para WhatsApp / historias
   Las 4 estéticas viven en assets/css/cot-doc.css (clases th-*). */
(() => {
const { T, LOCALE } = window.COT;
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const nl2br = s => esc(s).replace(/\n/g, '<br>');
const num = v => { const n = parseFloat(String(v ?? '').replace(',', '.')); return isFinite(n) ? n : 0; };

function money(v, P) {
  const n = Math.round(num(v) * 100) / 100;
  try {
    return new Intl.NumberFormat(LOCALE[P.lang] || 'es-AR', { style: 'currency', currency: P.cur || 'USD', minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 }).format(n);
  } catch (e) { return (P.cur || '') + ' ' + n.toLocaleString(LOCALE[P.lang] || 'es-AR'); }
}
function fdate(s, P) {
  if (!s) return '';
  const d = new Date(s + 'T12:00:00'); if (isNaN(d)) return esc(s);
  return d.toLocaleDateString(LOCALE[P.lang] || 'es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
}
const addDays = (s, n) => { const d = new Date((s || new Date().toISOString().slice(0, 10)) + 'T12:00:00'); d.setDate(d.getDate() + (Number(n) || 0)); return d.toISOString().slice(0, 10); };

/* ---------- cuentas ---------- */
function totalsFor(base, P) {
  const sub = Math.max(0, base);
  const d = P.disc || {}; let disc = num(d.v);
  disc = d.t === 'amt' ? Math.min(disc, sub) : sub * Math.min(disc, 100) / 100;
  const net = sub - disc;
  const tax = P.taxPct ? net * num(P.taxPct) / 100 : 0;
  const total = net + tax;
  const pay = P.pay || {}; let dep = num(pay.dep);
  dep = pay.depT === 'amt' ? Math.min(dep, total) : total * Math.min(dep, 100) / 100;
  const rest = total - dep, inst = Math.max(1, parseInt(pay.inst, 10) || 1);
  return { sub, disc, tax, total, dep, rest, inst, cuota: rest / inst };
}
function calc(P) {
  const items = (P.items || []).filter(i => (i.n || '').trim() || num(i.p));
  const lines = items.map(i => num(i.q || 1) * num(i.p));
  const pk = (P.pkgs || []).filter(p => (p.n || '').trim() || num(p.p));
  if (P.priceMode === 'packages' && pk.length) {
    const per = pk.map(p => totalsFor(num(p.p), P));
    const recI = Math.max(0, pk.findIndex(p => p.rec));
    return { mode: 'packages', pk, per, rec: recI, main: per[recI], from: Math.min(...per.map(x => x.total)) };
  }
  const t = totalsFor(lines.reduce((a, b) => a + b, 0), P);
  return { mode: 'items', items, lines, main: t, from: t.total };
}

/* ---------- piezas ---------- */
const L = P => T[P.lang] || T.es;
const docTitle = P => P.docType === 'quote' ? L(P).quote : L(P).proposal;
const contactLine = P => [P.biz.phone, P.biz.mail, P.biz.web].filter(Boolean).map(esc).join('  ·  ');
const logo = (P, cls = 'logo') => P.biz.logo ? `<img class="${cls}" src="${P.biz.logo}" alt="">` : `<span class="${cls} logo-txt">${esc((P.biz.name || '·').trim().slice(0, 1).toUpperCase())}</span>`;
const list = (arr, cls = 'ul') => `<ul class="${cls}">${arr.filter(x => String(x).trim()).map(x => `<li>${esc(x)}</li>`).join('')}</ul>`;
const has = arr => (arr || []).some(x => String(x).trim());

const phSrc = ph => ph && (ph.d || ph.u) || '';
function coverHtml(P) {
  const t = L(P), c = calc(P);
  const photos = (P.biz.photos || []).filter(phSrc), cov = photos[P.coverIdx || 0];
  const valid = P.dIssue ? addDays(P.dIssue, P.valid || 15) : '';
  return `<div class="cv${cov ? ' has-img' : ''}">${cov ? `<div class="cv-img"><img src="${phSrc(cov)}" alt=""></div>` : ''}
    <div class="cv-top">${logo(P)}<div class="cv-biz"><b>${esc(P.biz.name)}</b><span>${esc(P.biz.tag)}</span></div></div>
    <div class="cv-mid">
      <div class="cv-kicker">${esc(docTitle(P))} · ${esc(P.num)}</div>
      <h1 class="cv-title">${esc(P.proj || docTitle(P))}</h1>
      <div class="cv-for"><span>${t.for}</span><b>${esc(P.cli.name)}</b>${P.cli.co ? `<em>${esc(P.cli.co)}</em>` : ''}</div>
    </div>
    <div class="cv-bot">
      <div><span>${t.date}</span><b>${fdate(P.dIssue, P)}</b></div>
      ${valid ? `<div><span>${t.valid}</span><b>${fdate(valid, P)}</b></div>` : ''}
      ${c.from ? `<div><span>${c.mode === 'packages' ? t.from : t.total}</span><b>${money(c.from, P)}</b></div>` : ''}
    </div>
    <div class="cv-deco" aria-hidden="true"></div>
  </div>`;
}

/* Bloques en orden. Cada bloque: { h: html, sec?: true (título), cont?: html para repetir si sigue en otra página } */
function blocks(P) {
  const t = L(P), S = P.sections || {}, out = [], c = calc(P);
  let n = 0;
  const sec = (title, sub) => { n++; out.push({ sec: true, h: `<div class="b-sec"><span class="k">${String(n).padStart(2, '0')}</span><h2>${esc(title)}</h2>${sub ? `<p>${esc(sub)}</p>` : ''}</div>` }); };

  const F = {};
  F.about = () => {
  if (S.about !== false && (P.biz.bio || has(P.biz.why))) {
    sec(t.about);
    if (P.biz.bio) out.push({ h: `<p class="b-lead">${nl2br(P.biz.bio)}</p>` });
    if (has(P.biz.why)) out.push({ h: `<div class="b-why">${P.biz.why.filter(x => x.trim()).slice(0, 4).map((w, i) => `<div><span class="k">${String(i + 1).padStart(2, '0')}</span><p>${esc(w)}</p></div>`).join('')}</div>` });
  }
  };
  const photos = (P.biz.photos || []).filter(phSrc);
  const gal = photos.filter((p, i) => i !== (P.coverIdx || 0) || photos.length < 3).slice(0, 6);
  F.gallery = () => {
  if (S.gallery !== false && gal.length) {
    if (!(S.about !== false && (P.biz.bio || has(P.biz.why))) || order().indexOf('gallery') !== order().indexOf('about') + 1) sec(t.work);
    for (let i = 0; i < gal.length; i += 3) out.push({ h: `<div class="b-gal n${Math.min(3, gal.length - i)}">${gal.slice(i, i + 3).map(p => `<div><img src="${phSrc(p)}" alt=""></div>`).join('')}</div>` });
  }
  };
  const ans = (P.answers || []).filter(a => String(a.v || '').trim());
  F.project = () => {
  if (S.project !== false && (P.goal || ans.length)) {
    sec(t.theProject);
    if (P.goal) out.push({ h: `<div class="b-goal"><span class="lb">${t.goal}</span><p>${nl2br(P.goal)}</p></div>` });
    for (let i = 0; i < ans.length; i += 2) out.push({ h: `<div class="b-kv">${ans.slice(i, i + 2).map(a => `<div><span class="lb">${esc(a.l)}</span><b>${nl2br(a.v)}</b></div>`).join('')}</div>` });
  }
  };
  F.scope = () => {
  if (S.scope !== false) {
    if (c.mode === 'items' && c.items.length) {
      sec(t.scope);
      const head = `<div class="b-row b-th"><span>${t.service}</span><span>${t.qty}</span><span>${t.price}</span><span>${t.subtotal}</span></div>`;
      out.push({ h: head });
      c.items.forEach((it, i) => out.push({ cont: head, h: `<div class="b-row"><span><b>${esc(it.n)}</b>${it.d ? `<small>${nl2br(it.d)}</small>` : ''}</span><span>${esc(it.q || 1)}</span><span>${money(it.p, P)}</span><span>${money(c.lines[i], P)}</span></div>` }));
    } else if (has(P.inc) || has(P.del)) sec(t.scope);
    if (has(P.inc) || has(P.exc)) out.push({ h: `<div class="b-cols">${has(P.inc) ? `<div><span class="lb">${t.includes}</span>${list(P.inc, 'ul ok')}</div>` : ''}${has(P.exc) ? `<div><span class="lb">${t.excludes}</span>${list(P.exc, 'ul no')}</div>` : ''}</div>` });
    if (has(P.del)) out.push({ h: `<div class="b-del"><span class="lb">${t.deliverables}</span>${list(P.del, 'ul del')}</div>` });
  }
  };
  const phases = (P.phases || []).filter(p => (p.n || '').trim());
  F.timeline = () => {
  if (S.timeline !== false && (phases.length || P.dStart || P.dDelivery)) {
    sec(t.timeline);
    phases.forEach((p, i) => out.push({ h: `<div class="b-ph"><span class="k">${String(i + 1).padStart(2, '0')}</span><b>${esc(p.n)}</b><span class="d">${esc(p.d)}</span></div>` }));
    if (P.dStart || P.dDelivery) out.push({ h: `<div class="b-dates">${P.dStart ? `<div><span class="lb">${t.start}</span><b>${fdate(P.dStart, P)}</b></div>` : ''}${P.dDelivery ? `<div><span class="lb">${t.delivery}</span><b>${fdate(P.dDelivery, P)}</b></div>` : ''}</div>` });
  }
  };
  F.investment = () => {
  if (S.investment !== false) {
    sec(t.investment);
    const taxLbl = P.taxName || t.tax;
    if (c.mode === 'packages') {
      out.push({ h: `<div class="b-pk n${c.pk.length}">${c.pk.map((p, i) => { const x = c.per[i]; return `<div class="pk${p.rec ? ' rec' : ''}">
        ${p.rec ? `<span class="tag">${t.recommended}</span>` : `<span class="tag ghost">${t.option} ${i + 1}</span>`}
        <h3>${esc(p.n)}</h3>${p.d ? `<p>${nl2br(p.d)}</p>` : ''}
        <div class="pr">${money(x.total, P)}</div>
        ${x.disc || x.tax ? `<small>${x.disc ? `${t.discount} −${money(x.disc, P)}` : ''}${x.disc && x.tax ? ' · ' : ''}${x.tax ? `${esc(taxLbl)} ${money(x.tax, P)}` : ''}</small>` : ''}
        ${has(p.f) ? list(p.f, 'ul ok') : ''}
        ${x.total ? `<div class="pk-pay">${t.deposit}: <b>${money(x.dep, P)}</b>${x.rest ? `<br>${t.balance}: ${money(x.rest, P)}${x.inst > 1 ? ` ${t.in} ${x.inst} ${t.installments} ${money(x.cuota, P)}` : ''}` : ''}</div>` : ''}
      </div>`; }).join('')}</div>` });
    } else if (c.main.total || c.main.sub) {
      const m = c.main;
      out.push({ h: `<div class="b-tot">
        <div><span>${t.subtotal}</span><span>${money(m.sub, P)}</span></div>
        ${m.disc ? `<div><span>${t.discount}${P.disc && P.disc.t !== 'amt' ? ` (${esc(P.disc.v)}%)` : ''}</span><span>− ${money(m.disc, P)}</span></div>` : ''}
        ${m.tax ? `<div><span>${esc(taxLbl)} (${esc(P.taxPct)}%)</span><span>${money(m.tax, P)}</span></div>` : ''}
        <div class="T"><span>${t.total}</span><span>${money(m.total, P)}</span></div></div>` });
      if (m.total) out.push({ h: `<div class="b-pay"><div><span class="lb">${t.deposit}</span><b>${money(m.dep, P)}</b></div><div><span class="lb">${t.balance}</span><b>${money(m.rest, P)}</b>${m.inst > 1 && m.rest ? `<small>${t.in} ${m.inst} ${t.installments} ${money(m.cuota, P)}</small>` : ''}</div></div>` });
    }
    const ex = (P.extras || []).filter(e => (e.n || '').trim());
    if (ex.length) {
      out.push({ h: `<div class="b-sub">${t.extras}</div>` });
      ex.forEach(e => out.push({ h: `<div class="b-ex"><span>${esc(e.n)}${e.d ? `<small>${esc(e.d)}</small>` : ''}</span><b>${num(e.p) ? '+ ' + money(e.p, P) : ''}</b></div>` }));
    }
    const pay = P.pay || {};
    if (has(pay.methods) || pay.data) out.push({ h: `<div class="b-methods">${has(pay.methods) ? `<div><span class="lb">${t.payment}</span><p>${pay.methods.filter(Boolean).map(esc).join(' · ')}</p></div>` : ''}${pay.data ? `<div><span class="lb">${t.paymentData}</span><p>${nl2br(pay.data)}</p></div>` : ''}</div>` });
  }
  };
  F.terms = () => {
  if (S.terms !== false && (has(P.terms) || P.notes)) {
    sec(t.terms);
    (P.terms || []).filter(x => x.trim()).forEach((x, i) => out.push({ h: `<div class="b-term"><span class="k">${i + 1}.</span><p>${esc(x)}</p></div>` }));
    if (P.notes) out.push({ h: `<div class="b-notes"><span class="lb">${t.notes}</span><p>${nl2br(P.notes)}</p></div>` });
  }
  };
  const order = () => sectionOrder(P);
  order().forEach(k => F[k] && F[k]());
  if (S.accept !== false) {
    out.push({ h: `<div class="b-accept"><h2>${t.accept}</h2><p>${t.acceptText}</p>
      <div class="sig"><div><i></i><span>${t.signClient}</span><span>${t.clarify}: ${esc(P.cli.name)}</span></div><div><i></i><span>${t.signPro}</span><span>${t.clarify}: ${esc(P.biz.owner || P.biz.name)}</span></div></div></div>` });
  }
  out.push({ h: `<div class="b-close"><p class="thx">${t.thanks}</p><p>${contactLine(P)}</p></div>` });
  return out;
}

/* ---------- ajustes de diseño ---------- */
const ORDER = ['about', 'gallery', 'project', 'scope', 'timeline', 'investment', 'terms'];
function sectionOrder(P) {
  const o = ((P.design || {}).order || []).filter(k => ORDER.includes(k));
  return [...o, ...ORDER.filter(k => !o.includes(k))];
}
const PAIRS = {
  clasica: { n: 'Clásica', h: "'Fraunces', Georgia, serif", b: "'Instrument Sans', sans-serif", hw: 300 },
  moderna: { n: 'Moderna', h: "'Schibsted Grotesk', sans-serif", b: "'Schibsted Grotesk', sans-serif", hw: 800 },
  impacto: { n: 'Impacto', h: "'Unbounded', sans-serif", b: "'Familjen Grotesk', sans-serif", hw: 800 },
  lujo:    { n: 'Lujo', h: "'Bodoni Moda', Georgia, serif", b: "'Jost', sans-serif", hw: 400 },
  amable:  { n: 'Amable', h: "'Bricolage Grotesque', sans-serif", b: "'Instrument Sans', sans-serif", hw: 700 },
  tecnica: { n: 'Técnica', h: "'Archivo', sans-serif", b: "'Archivo', sans-serif", hw: 800 },
};
/* aplica la tipografía elegida sobre la de la estética */
function applyDesign(el, P) {
  const f = PAIRS[(P.design || {}).font];
  ['--hf', '--bf', '--hw'].forEach(v => el.style.removeProperty(v));
  if (!f) return;
  el.style.setProperty('--hf', f.h); el.style.setProperty('--bf', f.b); el.style.setProperty('--hw', String(f.hw));
}

/* ---------- páginas A4 ---------- */
function pageShell(P, i) {
  const el = document.createElement('div');
  el.className = 'cp';
  el.innerHTML = `<div class="cp-head"><span>${esc(P.biz.name)}</span><span>${esc(docTitle(P))} · ${esc(P.num)}</span></div><div class="cp-flow"></div><div class="cp-foot"><span>${contactLine(P)}${P.biz.tax ? '  ·  ' + esc(P.biz.tax) : ''}</span><span>${L(P).notInvoice} <b class="pg"></b></span></div>`;
  return el;
}
function render(container, P) {
  container.innerHTML = '';
  container.className = `cot-doc th-${P.theme || 'minimal'}`;
  container.style.setProperty('--c', P.color || '#3047FF');
  container.style.setProperty('--ct', onColor(P.color || '#3047FF'));
  applyDesign(container, P);
  const cover = document.createElement('div');
  cover.className = 'cp cover'; cover.innerHTML = coverHtml(P);
  container.appendChild(cover);
  let page = pageShell(P); container.appendChild(page);
  let flow = page.querySelector('.cp-flow');
  const fits = () => flow.scrollHeight <= flow.clientHeight + 1;
  for (const b of blocks(P)) {
    const tmp = document.createElement('div'); tmp.innerHTML = b.h; const el = tmp.firstElementChild;
    flow.appendChild(el);
    if (!fits() && flow.children.length > 1) {
      el.remove();
      const carry = [];
      const last = flow.lastElementChild;
      if (last && last.classList.contains('b-sec')) { carry.push(last); last.remove(); }
      if (last && last.classList.contains('b-th') && b.cont) { last.remove(); }
      page = pageShell(P); container.appendChild(page); flow = page.querySelector('.cp-flow');
      carry.forEach(x => flow.appendChild(x));
      if (b.cont && !carry.length) { const t2 = document.createElement('div'); t2.innerHTML = b.cont; flow.appendChild(t2.firstElementChild); }
      flow.appendChild(el);
    }
  }
  const pages = [...container.querySelectorAll('.cp')];
  pages.forEach((p, i) => { const pg = p.querySelector('.pg'); if (pg) pg.textContent = `${L(P).page} ${i + 1}/${pages.length}`; });
  return pages;
}

/* ---------- web ---------- */
function webHtml(P) {
  let html = `<section class="w-cover cp cover">${coverHtml(P)}</section><section class="w-body">`;
  for (const b of blocks(P)) html += b.h.replace(/^<div class="/, '<div data-rv class="');
  return html + '</section>';
}

/* ---------- tarjeta para WhatsApp (1080×1350) ---------- */
function cardHtml(P, url) {
  const t = L(P), c = calc(P);
  const pts = (c.mode === 'packages' ? c.pk.map(p => p.n) : (c.items || []).map(i => i.n)).filter(Boolean).slice(0, 4);
  const photos = (P.biz.photos || []).filter(phSrc), cov = photos[P.coverIdx || 0];
  return `<div class="cw${cov ? ' has-img' : ''}">${cov ? `<div class="cw-img"><img src="${phSrc(cov)}" alt=""></div>` : ''}
    <div class="cw-top">${logo(P)}<b>${esc(P.biz.name)}</b></div>
    <div class="cw-k">${esc(docTitle(P))} · ${esc(P.num)}</div>
    <h1>${esc(P.proj || docTitle(P))}</h1>
    <div class="cw-for">${t.for} <b>${esc(P.cli.name)}</b></div>
    ${pts.length ? `<ul>${pts.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
    <div class="cw-pr"><span>${c.mode === 'packages' ? t.from : t.total}</span><b>${money(c.from, P)}</b></div>
    <div class="cw-foot">${url ? `<span>${t.viewOnline} →</span><b>${esc(url.replace(/^https?:\/\//, ''))}</b>` : `<span>${contactLine(P)}</span>`}</div>
  </div>`;
}

/* contraste del texto sobre el color de marca */
function onColor(h) {
  const m = String(h).replace('#', ''); const n = parseInt(m.length === 3 ? m.split('').map(x => x + x).join('') : m, 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); });
  return (.2126 * ch[0] + .7152 * ch[1] + .0722 * ch[2]) > .42 ? '#111111' : '#FFFFFF';
}

window.COTR = { PAIRS, ORDER, sectionOrder, applyDesign, render, webHtml, cardHtml, calc, money, fdate, addDays, esc, onColor, L, docTitle };
})();
