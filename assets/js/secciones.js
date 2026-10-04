/* ============================================================
   ORBIT® — secciones compartidas
   Cuatro piezas que viven en más de una página: la vista previa
   interactiva, las disciplinas, el quiz y el pedido a medida.
   Cada una se arma sola si encuentra su contenedor, y no hace nada
   si no está. Así la misma pieza sirve en cualquier página.
   ============================================================ */
(() => {
if (!window.ORBIT) return;
const {C, $, $$, L, tr, lang, sym, bigWm, card, cover, buyBtn, mountBox,
       follow, reveal, toast, money, P, FAM, url, RM} = ORBIT;

/* ---------- mirá por dentro: probá el producto antes de comprarlo ---------- */
if ($('#win') && $('#ptabs')) {
  /* ---------- mirá por dentro ---------- */
  const win = $('#win');
  /* La vista previa muestra las pantallas reales de cada producto (las mismas
     capturas de su ficha): nada de demos inventadas. */
  let pant = 0;
  function demo(p) {
    const PS = p.pantallas || [];
    if (!PS.length) return `<div class="dhead"><b>${p.name}</b></div><p>${L(p.tagline)}</p>`;
    const i = Math.min(pant, PS.length - 1), [img, t, d] = PS[i];
    return `<div class="dhead"><b>${L(t)}</b><span class="mono dim">${L(d)}</span></div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px">${PS.map(([, tt], k) => `<button class="chip" data-pant="${k}" aria-pressed="${k===i}" style="color:var(--k)">${L(tt)}</button>`).join('')}</div>
      <div style="max-height:420px;overflow:auto;border:1px solid rgba(13,13,14,.12);background:var(--b)"><img src="assets/img/${p.pantallasDir}/${img}.png" alt="${tr(t)}" loading="lazy" style="width:100%;display:block"></div>`;
  }
  const PV = ORBIT.ordenados().filter(p => p.status !== 'soon' && (p.pantallas || []).length);
  let cur = PV[0] || P[0];
  function renderWin() {
    win.innerHTML = `<div class="bar"><i></i><i></i><i></i><span class="mono">${cur.code} — ${cur.name}</span><span class="mono dim" style="margin-left:auto">${L('Vista previa','Preview')}</span></div>
      <div class="body" id="wbody">${demo(cur)}</div>
      <div class="foot"><div><span class="mono dim">${L('Versión completa','Full version')}: ${L(cur.specs[0][1])} ${L(cur.specs[0][0])}</span><div class="price">${cur.status==='soon' ? L('Pronto','Soon') : money(cur)}</div></div><div style="display:flex;gap:8px;flex-wrap:wrap">${buyBtn(cur)}<a class="btn btn-line" href="${url(cur)}" style="color:var(--k)">${L('Ver detalle','See details')}</a></div></div>`;
    }
  /* Arranca todo cerrado. Cada solapa lleva su hueco y la ventana se muda
     al hueco de la que abrís, así la demo aparece pegada a lo que tocaste.
     Tocar la que ya está abierta la cierra. */
  const guarida = $('.peek');
  let abierta = cur.id;   /* la primera llega abierta: si no, la sección parece vacía */
  $('#ptabs').innerHTML = PV.map(p => `<div class="pfila"><button role="tab" data-id="${p.id}" aria-selected="false" aria-expanded="false"><span class="mono">${p.code}</span><b>${p.name}</b><span class="sig" aria-hidden="true">+</span></button><div class="phueco"></div></div>`).join('');
  function mudar() {
    const fila = abierta ? $(`#ptabs .pfila > button[data-id="${abierta}"]`).closest('.pfila') : null;
    $$('#ptabs .pfila').forEach(f => f.classList.toggle('abierta', f === fila));
    $$('#ptabs .pfila > button').forEach(b => {
      const mia = b.dataset.id === abierta;
      b.setAttribute('aria-selected', String(mia));
      b.setAttribute('aria-expanded', String(mia));
    });
    if (!fila) { win.hidden = true; if (win.parentElement !== guarida) guarida.appendChild(win); return; }
    win.hidden = false;
    const hueco = $('.phueco', fila);
    if (win.parentElement !== hueco) hueco.appendChild(win);
  }
  $$('#ptabs .pfila > button').forEach(b => b.onclick = () => {
    const id = b.dataset.id;
    if (abierta === id) { abierta = null; mudar(); return; }
    abierta = id; cur = P.find(p => p.id === id); pant = 0;
    renderWin(); mudar();
    b.scrollIntoView({behavior: RM ? 'auto' : 'smooth', block: 'start'});
  });
  win.addEventListener('click', e => {
    const b = e.target.closest('[data-pant]'); if (b) { pant = +b.dataset.pant; renderWin(); }
  });
  addEventListener('orbit:lang', renderWin);
  renderWin();
  mudar();
}

/* ---------- disciplinas: una órbita para cada oficio ---------- */
if ($('#disc')) {
  /* disciplinas: cada una despliega un deslizador con sus productos */
  /* un oficio por fila, con sus productos en el orden de la escalera:
     entrada → ancla → complemento. Sale del catálogo (ORBIT.nichos). */
  const DISC = ORBIT.nichos().map(n => [n.n.es, n.n.en, n.d.es, n.d.en, n.items.map(p => ({id:p.id})), n.id]);
  const DACC = [C.blue, C.or, C.ac];
  function pvCard(item, i, di) {
    const p = item.id && P.find(x => x.id === item.id);
    if (p) {
      const soon = p.status === 'soon';
      return `<a class="pv${soon ? ' soon' : ''}" href="${url(p)}"><div class="sy">${sym({ring: soon ? C.b : C.k, dot: DACC[i % 3]})}</div><div class="t"><span class="mono">${p.code}</span><span class="bd">${soon ? L('Próximamente','Coming soon') : L(ORBIT.PIEZA_N[p.pieza] || {es:'Disponible', en:'Available'})}</span></div><div><h5>${p.name}</h5><p>${L(p.tagline)}</p></div><div class="f"><b>${soon ? L('Pronto','Soon') : money(p)}</b><span class="mono">${L('Ver','View')} →</span></div></a>`;
    }
    return `<a class="pv soon" href="productos.html"><div class="sy">${sym({ring:C.b, dot:DACC[i % 3]})}</div><div class="t"><span class="mono">OB—D0${di+1}.${i+1}</span><span class="bd">${L('Próximamente','Coming soon')}</span></div><div><h5>${item.n}</h5><p>${L(...item.d)}</p></div><div class="f"><b>${L('Pronto','Soon')}</b><span class="mono dim">${L('En desarrollo','In the works')}</span></div></a>`;
  }
  /* Sólo las disciplinas que hoy tienen un producto cargado, y dentro de
     cada una sólo los productos reales. Nada de nombres que todavía no
     existen: cuando cargues uno nuevo al catálogo, aparece solo. */
  const REALES = DISC
    .map(d => [d[0], d[1], d[2], d[3], d[4].filter(x => x.id && P.some(p => p.id === x.id)), d[5]])
    .filter(d => d[4].length);
  $('#disc').innerHTML = REALES.map(([es,en,des,den,items,nid],i) => `<div class="drow rv" data-i="${i}">
    <button class="dh" aria-expanded="false" aria-controls="dp${i}"><span class="mono">OB—D0${i+1}</span><b>${L(es,en)}</b><p>${L(des,den)}</p><span class="s">${sym({ring:'currentColor', dot:C.blue, rot:i*45})}</span></button>
    <div class="dpanel" id="dp${i}" role="region"><div>
      <div class="dtop"><span class="mono">${L(es,en)} — ${items.length} ${L('herramientas','tools')}</span><div class="darrows"><button data-dir="-1" aria-label="Anterior">←</button><button data-dir="1" aria-label="Siguiente">→</button></div></div>
      <div class="dslide">${items.map((it,k) => pvCard(it,k,i)).join('')}<a class="pv all" href="productos.html#${nid}"><span class="mono">${L(es,en)}</span><h5>${L('Ver catálogo','See catalog')} →</h5></a></div>
    </div></div>
  </div>`).join('');
  $$('#disc .drow').forEach(row => {
    const btn = $('.dh', row);
    btn.onclick = () => {
      const open = !row.classList.contains('open');
      $$('#disc .drow.open').forEach(r => { r.classList.remove('open'); $('.dh', r).setAttribute('aria-expanded','false'); });
      if (open) { row.classList.add('open'); btn.setAttribute('aria-expanded','true'); setTimeout(() => row.scrollIntoView({behavior: RM ? 'auto' : 'smooth', block:'nearest'}), 300); }
    };
    $$('.darrows button', row).forEach(b => b.onclick = () => { const sl = $('.dslide', row); sl.scrollBy({left: +b.dataset.dir * (sl.clientWidth * .8), behavior: RM ? 'auto' : 'smooth'}); });
  });
}

/* ---------- quiz: encontrá tu sistema ---------- */
if ($('#qbox')) {
  /* ---------- quiz: encontrá tu sistema ---------- */
  const Q = [
    {q:['¿A qué te dedicás?','What do you do?'], o:[
      [['Transporte y fletes','Transport and freight'], {'ob-006':10,'ob-007':10,'ob-008':10}],
      [['Abogacía','Law'], {'ob-009':10,'ob-010':10,'ob-011':10}],
    ]},
    {q:['¿Qué te quita el sueño?','What keeps you up at night?'], o:[
      [['Cobrar bien mis viajes','Charging right for my trips'], {'ob-006':3,'ob-007':3}],
      [['Que no se me pase un vencimiento','Never missing a deadline'], {'ob-009':3,'ob-010':2}],
      [['No sé quién me debe ni desde cuándo','Not knowing who owes me or since when'], {'ob-008':3,'ob-011':3}],
      [['Tengo todo desordenado en mil lugares','Everything is scattered in a thousand places'], {'ob-010':3,'ob-007':3}],
    ]},
    {q:['¿Qué querés hoy?','What do you want today?'], o:[
      [['Una herramienta puntual, para arrancar ya','One focused tool, to start right away'], {'ob-006':2,'ob-009':2}],
      [['El sistema completo','The complete system'], {'ob-007':2,'ob-010':2}],
      [['Controlar la plata que entra','Track the money coming in'], {'ob-008':2,'ob-011':2}],
    ]},
  ];
  const WHY = {
    'ob-006': [['Sabés cuánto cobrar cada viaje en un minuto','Know what to charge for each trip in a minute'],['El costo incluye la vuelta vacía y los fijos','The cost includes the empty return and fixed costs'],['Presupuesto listo para mandar por WhatsApp','A quote ready to send on WhatsApp']],
    'ob-007': [['Tu costo real por km, camión por camión','Your real cost per km, truck by truck'],['Tarifa sugerida por cliente y ruta','Suggested rate per client and route'],['Ves qué cliente te hace ganar y cuál no','See which client makes you money and which does not']],
    'ob-008': [['Ningún viaje se queda sin facturar','No trip goes uninvoiced'],['Saldo por cliente y antigüedad de la deuda','Balance per client and debt aging'],['La lista de a quién llamar esta semana','The list of who to call this week']],
    'ob-009': [['Días hábiles contados solos, con feriados','Business days counted for you, with holidays'],['Todo lo que vence esta semana, ordenado','Everything due this week, sorted'],['Una planilla que compartís con tu socia o socio','A sheet you share with your partner']],
    'ob-010': [['Abrís el día sabiendo qué vence','Start the day knowing what is due'],['Cada caso con todo adentro','Every case with everything inside'],['Sabés cuánto te deben de honorarios','Know how much you are owed in fees']],
    'ob-011': [['Sabés quién te debe y desde cuándo','Know who owes you and since when'],['Cuánto vas a cobrar los próximos 6 meses','How much you will collect over the next 6 months'],['El plan de cobro se arma solo','The payment plan builds itself']],
  };
  let qi = 0, score = {};
  const qbox = $('#qbox');
  function renderQ() {
    const prog = `<div class="qprog">${Q.map((_,i) => `<i class="${i<=qi?'on':''}"></i>`).join('')}</div>`;
    if (qi < Q.length) {
      /* después de elegir oficio, sólo las opciones que tocan productos de ese oficio */
      const ni = qi ? (P.find(p => p.id === Object.keys(score).sort((a,b) => score[b]-score[a])[0]) || {}).nicho : null;
      const it = {q: Q[qi].q, o: Q[qi].o.filter(([, w]) => !ni || Object.keys(w).some(id => (P.find(p => p.id === id) || {}).nicho === ni))};
      qbox.innerHTML = `<span class="mono">${L('Pregunta','Question')} ${qi+1} / ${Q.length}</span>${prog}<p class="qq">${L(...it.q)}</p>
        <div class="qopts">${it.o.map(([t],i) => `<button data-i="${i}"><span class="mono">0${i+1}</span><span>${L(...t)}</span><span class="ar">→</span></button>`).join('')}</div>
        ${qi ? `<button class="chip qback" data-back>${L('← Atrás','← Back')}</button>` : ''}`;
      $$('.qopts button', qbox).forEach(b => b.onclick = () => { const w = it.o[+b.dataset.i][1]; hist.push(w); for (const k in w) score[k] = (score[k]||0) + w[k]; qi++; renderQ(); });
      const back = $('[data-back]', qbox); if (back) back.onclick = () => { const w = hist.pop(); for (const k in w) score[k] -= w[k]; qi--; renderQ(); };
      return;
    }
    const rank = P.filter(p => p.status !== 'soon' && WHY[p.id]).map(p => [p, score[p.id]||0]).sort((a,b) => b[1]-a[1]);
    const [best] = rank[0], alt = rank[1][0];
    qbox.innerHTML = `<span class="mono">${L('Tu órbita','Your orbit')}</span>${prog}
      <div class="qres"><div>${cover(best)}</div><div>
        <span class="mono">${best.code} · ${FAM[best.family][0]}</span>
        <h3 class="display">${best.name}</h3>
        <p style="margin:0;opacity:.8">${L(best.tagline)}</p>
        <ul>${WHY[best.id].map(w => `<li>${L(...w)}</li>`).join('')}</ul>
        <div class="acts2">${buyBtn(best)}<a class="btn btn-line" href="${url(best)}">${L('Ver detalle','See details')}</a></div>
        <p class="mono dim" style="margin-top:18px">${L('También te puede servir','You might also like')}: <a href="${url(alt)}">${alt.code} ${alt.name} →</a></p>
      </div></div>
      <button class="chip qback" data-restart>${L('↻ Empezar de nuevo','↻ Start over')}</button>`;
    $('[data-restart]', qbox).onclick = () => { qi = 0; score = {}; hist.length = 0; renderQ(); };
  }
  const hist = [];
  renderQ();
}

/* ---------- a medida: el pedido, con formulario ---------- */
if ($('#cform')) {
  /* ---------- a medida ---------- */
  const OPTS = {
    type: [['Planilla a medida','Custom spreadsheet'],['Sistema en Notion','Notion system'],['Herramienta web','Web tool'],['Automatización','Automation'],['Otra idea','Something else']],
    budget: [['Hasta 500 mil','< 500'],['500 mil – 1,5 M','500 – 1,500'],['Más de 1,5 M','1,500 +'],['No sé','Not sure']],
    time: [['Sin apuro','No rush'],['1 mes','1 month'],['Urgente','Urgent']],
  };
  /* `type` admite varias: alguien puede necesitar un sistema Y plantillas.
     Los demás son una sola opción, y avisan al elegir para que el
     formulario pueda pasar solo a la pregunta siguiente. */
  const pick = {type:[], budget:null, time:null};
  $$('.cform .opts').forEach(box => {
    const g = box.dataset.group, varias = box.dataset.varias !== undefined;
    box.innerHTML = OPTS[g].map((o,i) => `<button type="button" class="chip" data-i="${i}" aria-pressed="false">${L(...o)}</button>`).join('');
    $$('.chip', box).forEach(b => b.onclick = () => {
      const i = +b.dataset.i;
      if (varias) {
        const k = pick[g].indexOf(i);
        k < 0 ? pick[g].push(i) : pick[g].splice(k, 1);
        b.setAttribute('aria-pressed', String(k < 0));
      } else {
        pick[g] = i;
        $$('.chip', box).forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      }
      box.dispatchEvent(new CustomEvent('orbit:opcion', {bubbles:true, detail:{grupo:g, varias}}));
    });
  });
  $('#cform').addEventListener('submit', e => {
    e.preventDefault();
    const name = $('#cName').value.trim(), mail = $('#cMail').value.trim(), idea = $('#cIdea').value.trim(), err = $('#cErr');
    if (!name || !/^\S+@\S+\.\S+$/.test(mail) || !idea) { err.textContent = tr('Completá nombre, un email válido y la idea.', 'Please add your name, a valid email and the idea.'); return; }
    err.textContent = '';
    const val = g => Array.isArray(pick[g])
      ? (pick[g].length ? pick[g].map(i => tr(...OPTS[g][i])).join(', ') : '—')
      : (pick[g] === null ? '—' : tr(...OPTS[g][pick[g]]));
    const body = `${tr('Nombre','Name')}: ${name}\nEmail: ${mail}\n${tr('Qué necesito','What I need')}: ${val('type')}\n${tr('Presupuesto (ARS)','Budget (USD)')}: ${val('budget')}\n${tr('Plazo','Timeline')}: ${val('time')}\n\n${idea}`;
    location.href = `mailto:hola@orbitando.com.ar?subject=${encodeURIComponent(tr('Pedido a medida — ','Custom request — ') + name)}&body=${encodeURIComponent(body)}`;
    toast(tr('Abrimos tu email con el pedido listo para enviar','Opening your email with the request ready to send'));
  });

}
})();
