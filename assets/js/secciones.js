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
  const DAYS = [['Lun','Mon'],['Mar','Tue'],['Mié','Wed'],['Jue','Thu'],['Vie','Fri'],['Sáb','Sat'],['Dom','Sun']];
  const STAT = [[['Idea','Idea'],'#e8e5dd',C.k],[['Producción','In progress'],C.or,C.k],[['Listo','Ready'],C.ac,C.k],[['Publicado','Published'],C.blue,C.b]];
  const POSTS = [[0,['Carrusel: 5 errores','Carousel: 5 mistakes'],2],[1,['Reel detrás de escena','Behind-the-scenes reel'],1],[2,['Post: caso de cliente','Post: client case'],3],[3,['Story: encuesta','Story: poll'],0],[4,['Carrusel: guía rápida','Carousel: quick guide'],1],[5,['Reel: tip semanal','Reel: weekly tip'],0],[6,['Post: frase de marca','Post: brand quote'],2]].map(([d,t,s]) => ({d,t,s}));
  const DEALS = [{n:'Estudio Norte',v:1200,c:0},{n:'Café Lumen',v:800,c:0},{n:'Atlas Arq.',v:2400,c:1},{n:'Nómade Co.',v:950,c:1},{n:'Río Films',v:1800,c:2},{n:'Plano Studio',v:600,c:3}];
  const COLS_K = [['Contacto','Lead'],['Propuesta','Proposal'],['En curso','In progress'],['Cobrado','Paid']];
  const LIBF = [['all',['Todo','All']],['shape',['Formas','Shapes']],['tex',['Texturas','Textures']],['type',['Tipografía','Type']],['mock',['Mockups','Mockups']]];
  const ASSETS = [
    ['shape', `<div style="width:100%;height:100%;background:${C.k};display:grid;place-items:center">${sym({ring:C.b,dot:C.blue},'sym','width:60%')}</div>`],
    ['tex', `<div class="photo" style="position:absolute;inset:0;background-image:url(assets/img/arch.jpg)"></div>`],
    ['type', `<div style="width:100%;height:100%;background:${C.b};display:flex;align-items:center;justify-content:center;font-weight:800;font-size:30cqw;letter-spacing:-.05em">Aa</div>`],
    ['shape', `<svg viewBox="0 0 100 100" style="width:100%;height:100%;background:${C.or}"><path d="M-10 90 A80 80 0 0 1 70 10" stroke="${C.k}" stroke-width="12" fill="none"/></svg>`],
    ['mock', `<div style="width:100%;height:100%;background:#ddd9cf;display:grid;place-items:center"><div style="width:60%;aspect-ratio:3/4;background:${C.k};box-shadow:6px 8px 0 rgba(0,0,0,.2)"></div></div>`],
    ['tex', `<div class="photo" style="position:absolute;inset:0;background-image:url(assets/img/landing.jpg)"></div>`],
    ['type', `<div style="width:100%;height:100%;background:${C.k};color:${C.b};display:flex;align-items:center;justify-content:center;font-family:var(--serif);font-style:italic;font-size:26cqw">next.</div>`],
    ['shape', `<div style="width:100%;height:100%;background:${C.ac};display:grid;grid-template-columns:1fr 1fr;gap:8%;padding:16%">${[0,1,2,3].map(i => sym({ring:C.k,dot:C.k,rot:i*90},'sym','width:100%')).join('')}</div>`],
    ['mock', `<div style="width:100%;height:100%;background:${C.blue};display:grid;place-items:center"><div style="width:70%;aspect-ratio:16/10;background:${C.b};border-radius:4px"></div></div>`],
    ['tex', `<div class="photo" style="position:absolute;inset:0;background-image:url(assets/img/corridor.jpg)"></div>`],
    ['type', `<div style="width:100%;height:100%;background:${C.or};display:flex;align-items:flex-end;padding:10%;font-weight:800;font-size:16cqw;line-height:.85;letter-spacing:-.05em;text-transform:uppercase">Tools<br>that move</div>`],
    ['mock', `<div style="width:100%;height:100%;background:#ddd9cf;display:grid;place-items:center"><div style="width:44%;aspect-ratio:9/19;background:${C.k};border-radius:10px"></div></div>`],
  ];
  const TAGN = {shape:['Forma','Shape'], tex:['Textura','Texture'], type:['Tipo','Type'], mock:['Mockup','Mockup']};
  const WF = [
    [['Investigar','Research'], ['Actuá como investigador. Sobre el tema «{t}», armá un resumen con: 5 ideas clave, 3 datos verificables con su fuente, 3 preguntas que se hace mi audiencia y 2 ángulos poco explorados.','Act as a researcher. On the topic “{t}”, give me: 5 key ideas, 3 verifiable facts with sources, 3 questions my audience asks and 2 underexplored angles.']],
    [['Estructurar','Structure'], ['Con este material sobre «{t}», proponé 3 estructuras distintas (lista, historia, paso a paso). Para cada una: título, gancho de una línea y 5 secciones.','Using this material on “{t}”, propose 3 different structures (list, story, step-by-step). For each: title, one-line hook and 5 sections.']],
    [['Escribir','Write'], ['Escribí el borrador de la estructura elegida sobre «{t}». Frases cortas, tono directo, sin clichés ni lenguaje de gurú. Marcá con [DATO] donde falte un dato real.','Write the draft of the chosen structure on “{t}”. Short sentences, direct tone, no clichés or guru language. Mark [FACT] where a real fact is missing.']],
    [['Revisar','Review'], ['Revisá este texto sobre «{t}» como editor exigente: señalá lo que sobra, lo que no se entiende y 3 cambios que lo harían más claro. No lo reescribas entero.','Review this text on “{t}” like a demanding editor: point out what’s extra, what’s unclear and 3 changes that would make it clearer. Don’t rewrite it all.']],
  ];
  let wfStep = 0, wfTopic = '';
  const libSel = new Set(); let libF = 'all';

  function demo(p) {
    if (p.id === 'ob-001') {
      const done = POSTS.filter(x => x.s === 3).length;
      return `<div class="dhead"><b>${L('Calendario editorial — Semana 12','Editorial calendar — Week 12')}</b><span class="mono dim">${L('Tocá una pieza para avanzarla','Tap a post to move it forward')} · ${done}/7 ${L('publicadas','published')}</span></div>
        <div class="cal">${DAYS.map((d,i) => `<div class="d"><span>${L(...d)}</span>${POSTS.filter(x => x.d===i).map(x => { const [n,bg,fg] = STAT[x.s]; return `<button class="post" data-post="${POSTS.indexOf(x)}"><span class="st" style="background:${bg};color:${fg}">${L(...n)}</span>${L(...x.t)}</button>`; }).join('')}</div>`).join('')}</div>`;
    }
    if (p.id === 'ob-003') {
      const paid = DEALS.filter(d => d.c === 3).reduce((a,d) => a + d.v, 0), total = DEALS.reduce((a,d) => a + d.v, 0);
      return `<div class="dhead"><b>${L('Pipeline de clientes','Client pipeline')}</b><span class="mono dim">${L('Tocá un cliente para avanzarlo','Tap a client to move it forward')}</span></div>
        <div class="kan">${COLS_K.map((c,i) => { const ds = DEALS.filter(d => d.c === i); return `<div class="col"><span>${L(...c)}<span>${ds.length}</span></span>${ds.map(d => `<button class="deal" data-deal="${DEALS.indexOf(d)}"><b>${d.n}</b><small>USD ${d.v.toLocaleString('en-US')}</small></button>`).join('')}</div>`; }).join('')}</div>
        <div class="dhead" style="margin:16px 0 0"><span class="mono">${L('Cobrado este mes','Paid this month')}</span><b>USD ${paid.toLocaleString('en-US')} <span class="mono dim">/ ${total.toLocaleString('en-US')}</span></b></div>
        <div class="kbar"><i style="transform:scaleX(${(paid/total).toFixed(3)})"></i></div>`;
    }
    if (p.id === 'ob-002') {
      return `<div class="dhead"><b>${L('Biblioteca — Vol.01','Library — Vol.01')}</b><span class="mono dim">${L('Elegí recursos para tu tablero','Pick resources for your board')} · ${libSel.size} ${L('elegidos','selected')}</span></div>
        <div class="sw2" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px">${LIBF.map(([k,n]) => `<button class="chip" data-libf="${k}" aria-pressed="${k===libF}" style="color:var(--k)">${L(...n)}</button>`).join('')}</div>
        <div class="lib">${ASSETS.map(([k,h],i) => (libF==='all'||libF===k) ? `<button class="asset${libSel.has(i)?' sel':''}" data-asset="${i}" aria-pressed="${libSel.has(i)}">${h}<span class="tag">${L(...TAGN[k])}</span><span class="ok">✓</span></button>` : '').join('')}</div>`;
    }
    const topic = wfTopic || tr('lanzar un producto digital','launching a digital product');
    const text = tr(...WF[wfStep][1]).replace('{t}', `<mark>${topic.replace(/[<>&]/g,'')}</mark>`);
    return `<div class="dhead"><b>${L('Workflow: de idea a texto publicado','Workflow: from idea to published text')}</b><span class="mono dim">${L('Muestra gratis — copiala y usala','Free sample — copy it and use it')}</span></div>
      <div class="wf"><div class="steps">${WF.map(([n],i) => `<button data-wf="${i}" aria-pressed="${i===wfStep}"><span class="mono">0${i+1}</span>${L(...n)}</button>`).join('')}</div>
      <div><label class="mono" for="wfTopic">${L('Tu tema','Your topic')}</label><input id="wfTopic" value="${wfTopic.replace(/"/g,'&quot;')}" placeholder="${tr('ej: lanzar un producto digital','e.g. launching a digital product')}">
      <div class="prompt" id="wfOut">${text}</div>
      <div style="display:flex;justify-content:space-between;gap:10px;margin-top:10px;flex-wrap:wrap"><span class="mono dim">${L('Paso','Step')} ${wfStep+1} / 4</span><button class="chip" data-copy style="color:var(--k)">${L('Copiar prompt','Copy prompt')}</button></div></div></div>`;
  }
  let cur = P[0];
  function renderWin() {
    win.innerHTML = `<div class="bar"><i></i><i></i><i></i><span class="mono">${cur.code} — ${cur.name}</span><span class="mono dim" style="margin-left:auto">${L('Vista previa','Preview')}</span></div>
      <div class="body" id="wbody">${demo(cur)}</div>
      <div class="foot"><div><span class="mono dim">${L('Versión completa','Full version')}: ${L(cur.specs[0][1])} ${L(cur.specs[0][0])}</span><div class="price">${cur.status==='soon' ? L('Pronto','Soon') : money(cur.price)}</div></div><div style="display:flex;gap:8px;flex-wrap:wrap">${buyBtn(cur)}<a class="btn btn-line" href="${url(cur)}" style="color:var(--k)">${L('Ver detalle','See details')}</a></div></div>`;
    }
  /* Arranca todo cerrado. Cada solapa lleva su hueco y la ventana se muda
     al hueco de la que abrís, así la demo aparece pegada a lo que tocaste.
     Tocar la que ya está abierta la cierra. */
  const guarida = $('.peek');
  let abierta = null;
  $('#ptabs').innerHTML = P.map(p => `<div class="pfila"><button role="tab" data-id="${p.id}" aria-selected="false" aria-expanded="false"><span class="mono">${p.code}</span><b>${p.name}</b><span class="sig" aria-hidden="true">+</span></button><div class="phueco"></div></div>`).join('');
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
    abierta = id; cur = P.find(p => p.id === id);
    renderWin(); mudar();
    b.scrollIntoView({behavior: RM ? 'auto' : 'smooth', block: 'start'});
  });
  win.addEventListener('click', e => {
    const t = e.target;
    const po = t.closest('[data-post]'); if (po) { const x = POSTS[+po.dataset.post]; x.s = (x.s + 1) % 4; renderWin(); return; }
    const de = t.closest('[data-deal]'); if (de) { const d = DEALS[+de.dataset.deal]; d.c = (d.c + 1) % 4; renderWin(); return; }
    const lf = t.closest('[data-libf]'); if (lf) { libF = lf.dataset.libf; renderWin(); return; }
    const as = t.closest('[data-asset]'); if (as) { const i = +as.dataset.asset; libSel.has(i) ? libSel.delete(i) : libSel.add(i); renderWin(); return; }
    const wf = t.closest('[data-wf]'); if (wf) { wfStep = +wf.dataset.wf; renderWin(); return; }
    if (t.closest('[data-copy]')) { const txt = $('#wfOut').innerText; (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(() => toast(tr('Prompt copiado','Prompt copied')), () => toast(tr('Seleccioná el texto para copiarlo','Select the text to copy it'))); }
  });
  win.addEventListener('input', e => { if (e.target.id === 'wfTopic') { wfTopic = e.target.value; const topic = wfTopic || tr('lanzar un producto digital','launching a digital product'); $('#wfOut').innerHTML = tr(...WF[wfStep][1]).replace('{t}', `<mark>${topic.replace(/[<>&]/g,'')}</mark>`); } });
  addEventListener('orbit:lang', () => { if (cur.id === 'ob-004') renderWin(); });
  renderWin();
  mudar();
}

/* ---------- disciplinas: una órbita para cada oficio ---------- */
if ($('#disc')) {
  /* disciplinas: cada una despliega un deslizador con sus productos */
  const DISC = [
    ['Diseño','Design','Plantillas, mockups y sistemas visuales','Templates, mockups and visual systems', [
      {id:'ob-002'}, {n:'Brand Kit System', d:['Tu identidad lista para aplicar en todo','Your identity, ready to apply everywhere']}, {n:'Mockup Pack', d:['Presentá tu trabajo como un estudio','Present your work like a studio']}]],
    ['Contenido','Content','Calendarios, portadas y formatos','Calendars, covers and formats', [
      {id:'ob-001'}, {n:'Reels Script Kit', d:['Guiones y ganchos para videos cortos','Scripts and hooks for short videos']}, {n:'Carousel Templates', d:['Carruseles editables que se guardan','Editable carousels people save']}]],
    ['Negocios','Business','CRM, finanzas y procesos','CRM, finances and processes', [
      {id:'ob-003'}, {n:'Client Onboarding Kit', d:['Del “sí” al primer entregable, sin fricción','From “yes” to first delivery, frictionless']}, {n:'Finance Tracker', d:['Ingresos, gastos y proyección simple','Income, expenses and a simple forecast']}]],
    ['Ventas','Sales','Funnels, emails y propuestas','Funnels, emails and proposals', [
      {n:'Proposal Kit', d:['Propuestas que se entienden y se aprueban','Proposals that get read and approved']}, {n:'Funnel Map', d:['El recorrido de tu cliente, paso a paso','Your customer journey, step by step']}, {n:'Email Sequences', d:['Secuencias listas para vender','Ready-to-sell email sequences']}]],
    ['Marketing','Marketing','Campañas, ads y reportes','Campaigns, ads and reports', [
      {n:'Campaign Planner', d:['Una campaña completa en un tablero','A full campaign on one board']}, {n:'Ads Creative Kit', d:['Piezas para anuncios que convierten','Ad creatives that convert']}, {n:'Monthly Report', d:['Reportes claros para clientes','Clear reports for clients']}]],
    ['IA','AI','Workflows y automatizaciones','Workflows and automations', [
      {id:'ob-004'}, {n:'Prompt Library', d:['Prompts probados por disciplina','Tested prompts by discipline']}, {n:'Automation Starter', d:['Tus primeras automatizaciones, guiadas','Your first automations, guided']}]],
    ['Productividad','Productivity','Planners y sistemas personales','Planners and personal systems', [
      {n:'Personal OS', d:['Tu semana, tus metas y tus ideas en un lugar','Your week, goals and ideas in one place']}, {n:'Weekly Planner', d:['Planificá en 20 minutos, ejecutá toda la semana','Plan in 20 minutes, execute all week']}, {n:'Habit System', d:['Hábitos que se sostienen','Habits that stick']}]],
    ['Educación','Education','Workbooks, clases y presentaciones','Workbooks, lessons and decks', [
      {n:'Course Builder', d:['Estructurá tu curso de principio a fin','Structure your course end to end']}, {n:'Workbook Templates', d:['Cuadernos de trabajo para tus alumnos','Workbooks for your students']}, {n:'Lesson Deck', d:['Presentaciones de clase con estilo editorial','Editorial-style lesson decks']}]],
  ];
  const DACC = [C.blue, C.or, C.ac];
  function pvCard(item, i, di) {
    const p = item.id && P.find(x => x.id === item.id);
    if (p) {
      const soon = p.status === 'soon';
      return `<a class="pv${soon ? ' soon' : ''}" href="${url(p)}"><div class="sy">${sym({ring: soon ? C.b : C.k, dot: DACC[i % 3]})}</div><div class="t"><span class="mono">${p.code}</span><span class="bd">${soon ? L('Próximamente','Coming soon') : L('Disponible','Available')}</span></div><div><h5>${p.name}</h5><p>${L(p.tagline)}</p></div><div class="f"><b>${soon ? L('Pronto','Soon') : money(p.price)}</b><span class="mono">${L('Ver','View')} →</span></div></a>`;
    }
    return `<a class="pv soon" href="productos.html"><div class="sy">${sym({ring:C.b, dot:DACC[i % 3]})}</div><div class="t"><span class="mono">OB—D0${di+1}.${i+1}</span><span class="bd">${L('Próximamente','Coming soon')}</span></div><div><h5>${item.n}</h5><p>${L(...item.d)}</p></div><div class="f"><b>${L('Pronto','Soon')}</b><span class="mono dim">${L('En desarrollo','In the works')}</span></div></a>`;
  }
  /* Sólo las disciplinas que hoy tienen un producto cargado, y dentro de
     cada una sólo los productos reales. Nada de nombres que todavía no
     existen: cuando cargues uno nuevo al catálogo, aparece solo. */
  const REALES = DISC
    .map(d => [d[0], d[1], d[2], d[3], d[4].filter(x => x.id && P.some(p => p.id === x.id))])
    .filter(d => d[4].length);
  $('#disc').innerHTML = REALES.map(([es,en,des,den,items],i) => `<div class="drow rv" data-i="${i}">
    <button class="dh" aria-expanded="false" aria-controls="dp${i}"><span class="mono">OB—D0${i+1}</span><b>${L(es,en)}</b><p>${L(des,den)}</p><span class="s">${sym({ring:'currentColor', dot:C.blue, rot:i*45})}</span></button>
    <div class="dpanel" id="dp${i}" role="region"><div>
      <div class="dtop"><span class="mono">${L(es,en)} — ${items.length} ${L('herramientas','tools')}</span><div class="darrows"><button data-dir="-1" aria-label="Anterior">←</button><button data-dir="1" aria-label="Siguiente">→</button></div></div>
      <div class="dslide">${items.map((it,k) => pvCard(it,k,i)).join('')}<a class="pv all" href="productos.html"><span class="mono">${L('Todo en','All in')} ${L(es,en)}</span><h5>${L('Ver catálogo','See catalog')} →</h5></a></div>
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
    {q:['¿Qué querés resolver?','What do you want to solve?'], o:[
      [['Publicar contenido con constancia','Publish content consistently'], {'ob-001':3}],
      [['Tener recursos gráficos listos para usar','Have ready-to-use graphic resources'], {'ob-002':3}],
      [['Ordenar mi negocio: clientes, proyectos, plata','Organize my business: clients, projects, money'], {'ob-003':3}],
      [['Trabajar mejor y más rápido con IA','Work better and faster with AI'], {'ob-004':3}],
    ]},
    {q:['¿Cómo trabajás hoy?','How do you work today?'], o:[
      [['Solo/a, con mi propia marca','Solo, on my own brand'], {'ob-001':1,'ob-004':1}],
      [['Con un equipo chico','With a small team'], {'ob-003':1,'ob-004':1}],
      [['Para clientes','For clients'], {'ob-002':1,'ob-003':1}],
    ]},
    {q:['¿Qué herramienta usás más?','Which tool do you use most?'], o:[
      [['Notion','Notion'], {'ob-003':1,'ob-001':1,'ob-004':1}],
      [['Figma','Figma'], {'ob-002':1,'ob-001':1}],
      [['Canva','Canva'], {'ob-001':1,'ob-002':1}],
      [['Todavía ninguna','None yet'], {'ob-001':1,'ob-004':1}],
    ]},
  ];
  const WHY = {
    'ob-001': [['Planificás un mes de contenido en una tarde','Plan a month of content in one afternoon'],['Plantillas que mantienen tu marca consistente','Templates that keep your brand consistent'],['Un calendario que muestra qué está listo','A calendar that shows what’s ready']],
    'ob-002': [['Recursos listos para cualquier proyecto','Resources ready for any project'],['Presentás trabajo como un estudio','Present work like a studio'],['Licencia comercial para clientes','Commercial license for client work']],
    'ob-003': [['Clientes, proyectos y cobros en un solo lugar','Clients, projects and payments in one place'],['Sabés qué entra y qué sale cada mes','Know what comes in and goes out each month'],['Procesos que no dependen de tu memoria','Processes that don’t depend on your memory']],
    'ob-004': [['Workflows probados, no prompts sueltos','Proven workflows, not random prompts'],['Producís más sin perder tu voz','Produce more without losing your voice'],['Automatizás lo repetitivo','Automate the repetitive work']],
  };
  let qi = 0, score = {};
  const qbox = $('#qbox');
  function renderQ() {
    const prog = `<div class="qprog">${Q.map((_,i) => `<i class="${i<=qi?'on':''}"></i>`).join('')}</div>`;
    if (qi < Q.length) {
      const it = Q[qi];
      qbox.innerHTML = `<span class="mono">${L('Pregunta','Question')} ${qi+1} / ${Q.length}</span>${prog}<p class="qq">${L(...it.q)}</p>
        <div class="qopts">${it.o.map(([t],i) => `<button data-i="${i}"><span class="mono">0${i+1}</span><span>${L(...t)}</span><span class="ar">→</span></button>`).join('')}</div>
        ${qi ? `<button class="chip qback" data-back>${L('← Atrás','← Back')}</button>` : ''}`;
      $$('.qopts button', qbox).forEach(b => b.onclick = () => { const w = it.o[+b.dataset.i][1]; hist.push(w); for (const k in w) score[k] = (score[k]||0) + w[k]; qi++; renderQ(); });
      const back = $('[data-back]', qbox); if (back) back.onclick = () => { const w = hist.pop(); for (const k in w) score[k] -= w[k]; qi--; renderQ(); };
      return;
    }
    const rank = P.map(p => [p, score[p.id]||0]).sort((a,b) => b[1]-a[1]);
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
    type: [['Sistema en Notion','Notion system'],['Plantillas de marca','Brand templates'],['Kit de contenido','Content kit'],['Workflow de IA','AI workflow'],['Otra idea','Something else']],
    budget: [['< 500','< 500'],['500 – 1.500','500 – 1,500'],['1.500 +','1,500 +'],['No sé','Not sure']],
    time: [['Sin apuro','No rush'],['1 mes','1 month'],['Urgente','Urgent']],
  };
  const pick = {type:null, budget:null, time:null};
  $$('.cform .opts').forEach(box => {
    const g = box.dataset.group;
    box.innerHTML = OPTS[g].map((o,i) => `<button type="button" class="chip" data-i="${i}" aria-pressed="false">${L(...o)}</button>`).join('');
    $$('.chip', box).forEach(b => b.onclick = () => { pick[g] = +b.dataset.i; $$('.chip', box).forEach(x => x.setAttribute('aria-pressed', String(x === b))); });
  });
  $('#cform').addEventListener('submit', e => {
    e.preventDefault();
    const name = $('#cName').value.trim(), mail = $('#cMail').value.trim(), idea = $('#cIdea').value.trim(), err = $('#cErr');
    if (!name || !/^\S+@\S+\.\S+$/.test(mail) || !idea) { err.textContent = tr('Completá nombre, un email válido y la idea.', 'Please add your name, a valid email and the idea.'); return; }
    err.textContent = '';
    const val = g => pick[g] === null ? '—' : tr(...OPTS[g][pick[g]]);
    const body = `${tr('Nombre','Name')}: ${name}\nEmail: ${mail}\n${tr('Qué necesito','What I need')}: ${val('type')}\n${tr('Presupuesto (USD)','Budget (USD)')}: ${val('budget')}\n${tr('Plazo','Timeline')}: ${val('time')}\n\n${idea}`;
    location.href = `mailto:hola@orbitando.com.ar?subject=${encodeURIComponent(tr('Pedido a medida — ','Custom request — ') + name)}&body=${encodeURIComponent(body)}`;
    toast(tr('Abrimos tu email con el pedido listo para enviar','Opening your email with the request ready to send'));
  });

}
})();
