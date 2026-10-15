/* Mimitos · "Me fui" y Cámara Mimitos (lado de la dueña o el dueño). Necesita mascotas-core.js (window.MZ),
   mascotas-away-rules.js (window.MZAWAYR) y el puente de mascotas-app.js (window.MZAPP).
   Solo aparece si el servidor habilita la cuenta (GET /api/mascotas → mefui: true; MIMITOS_MEFUI + lista).

   - "Me fui": hoja con checklist opcional (agua, comida, puerta, ventanas), mascotas que quedan y aviso a las X h.
     La salida vive en el doc (doc.away) y se guarda como todo lo demás; el cron de avisos la lee del servidor.
   - "Volví": cierra la salida (va a doc.awayLog) y muestra el resumen, con lo que detectó la cámara.
   - Historial: tiempo sola por día en los últimos 7 días (las mismas cuentas que el servidor y Preguntale).
   - Cámaras: emparejar un celu viejo con un código de un solo uso (vence a los 10 min), listarlas y desconectarlas.
   - Línea de tiempo de la cámara y "Ver en vivo" (carga mascotas-rtc.js recién al tocar). */
(() => {
'use strict';
const Z = window.MZ, R = window.MZAWAYR;
const { esc } = Z;
const I = Z.icon;
const A = () => window.MZAPP;
const $ = s => document.querySelector(s);
const uid = () => Math.random().toString(16).slice(2, 10) + Date.now().toString(16).slice(-4);
const st = { cams: null, camsAt: 0, events: null, evKey: '', pair: null, pairTimer: null, weekPet: '' };

/* ---------- utilidades ---------- */
const D = () => A().doc;
const awayPets = () => D().pets.filter(p => R.covers(D().away, p.id));
const hm = ms => new Date(ms).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const dayKey = ms => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const sola = p => p.sex === 'm' ? 'solo' : 'sola';
/* gemido y llanto son los menos confiables del detector: van como "posible" (igual que en los avisos) */
const VERB = { ladrido: 'Ladró', aullido: 'Aulló', maullido: 'Maulló' };
const evText = e => { const m = Math.round(e.dur / 60); const len = e.dur < 60 ? `${Math.max(1, e.dur)} segundos` : `${m} ${m === 1 ? 'minuto' : 'minutos'}`; const at = hm(Date.parse(e.start)); return VERB[e.type] ? `${VERB[e.type]} ${len} a las ${at}` : `Posible ${e.type} de ${len} a las ${at}`; };
/* último paseo anotado (por la familia o el cuidador) */
function lastWalk(p) {
  const t = (p.log || []).filter(l => l.kind === 'paseo').map(l => Date.parse(l.at)).filter(Number.isFinite).sort((a, b) => b - a)[0];
  return t || null;
}
/* "Aika está sola hace 1 h 34 min" / "Aika y Toto están solos hace 2 h" */
function estaSola(pets, ms) {
  const names = pets.map(p => p.name).filter(Boolean);
  if (!names.length) return `Saliste hace ${R.dur(ms)}`;
  const who = names.length === 1 ? names[0] : names.slice(0, -1).join(', ') + ' y ' + names[names.length - 1];
  const adj = names.length === 1 ? sola(pets[0]) : pets.every(p => p.sex === 'h') ? 'solas' : 'solos';
  return `${who} ${names.length === 1 ? 'está' : 'están'} ${adj} hace ${R.dur(ms)}`;
}
function clockHtml() {
  const a = D().away, pets = awayPets(), ms = R.elapsed(a);
  const p = pets.length === 1 ? pets[0] : null, w = p && lastWalk(p);
  return `<b>${esc(estaSola(pets.length ? pets : D().pets, ms))}</b>${w ? ` <span class="mf-sep" aria-hidden="true">·</span> <span>última salida hace ${esc(R.dur(Date.now() - w))}</span>` : ''}`;
}

/* ---------- "Me fui" que interpreta: el estado en frases ----------
   Checklist, sonidos (de los eventos que ya trae la línea de tiempo) y la cámara (por el último "sigo acá" que guarda
   el ping cada 5 min: no hay consultas nuevas a KV). */
const NOUN = { ladrido: ['período de ladridos', 'períodos de ladridos'], aullido: ['período de aullidos', 'períodos de aullidos'], maullido: ['período de maullidos', 'períodos de maullidos'] };
const minsTxt = ms => { const m = Math.max(1, Math.round(ms / 60e3)); return `${m} ${m === 1 ? 'minuto' : 'minutos'}`; };
const evEnd = e => Date.parse(e.start) + e.dur * 1000;
function checkLine(a) {
  const done = R.CHECKS.filter(([k]) => a.check[k]), miss = R.CHECKS.filter(([k]) => !a.check[k]);
  if (!done.length) return null;
  if (!miss.length) return { ic: 'check', tone: 'ok', text: 'Checklist completo' };
  return { ic: 'alert', tone: 'warn', text: `Checklist: no marcaste ${miss.map(([, l]) => l.toLowerCase()).join(', ')}` };
}
function soundLine(since) {
  const cams = st.cams || [];
  if (!cams.length || st.events == null) return null;
  const evs = st.events.filter(e => evEnd(e) >= since);
  const quiet = (from) => `Sin ladridos ni maullidos en los últimos ${minsTxt(Date.now() - from)}`;
  if (!evs.length) return { ic: 'check', tone: 'ok', text: since > Date.now() - 864e5 && D().away.on ? quiet(since).replace(/en los últimos .*/, 'desde que saliste') : quiet(since) };
  const last = evs[evs.length - 1];
  const ago = Date.now() - evEnd(last);
  const lastTxt = evText(last);
  /* lo último fue hace rato: se dice primero que está tranquila */
  if (ago > 10 * 60e3) return { ic: 'check', tone: 'ok', text: `${quiet(evEnd(last))}. Lo último: ${lastTxt.charAt(0).toLowerCase() + lastTxt.slice(1)}` };
  return { ic: ICON[last.type] || 'bell', tone: 'warn', text: lastTxt };
}
function camLine() {
  const cams = st.cams || [];
  if (!cams.length) return null;
  const on = cams.filter(c => c.online);
  if (on.length) {
    const paused = on.every(c => c.listen === 'pausado'), err = on.every(c => c.listen === 'error');
    return { ic: 'camera', tone: paused || err ? 'warn' : 'ok', text: `Cámara activa · ${err ? 'no está escuchando' : paused ? 'en pausa (pantalla bloqueada o en segundo plano)' : 'escuchando'}${cams.length > 1 ? ` (${on.map(c => c.name).join(', ')})` : ''}` };
  }
  const seen = Math.max(...cams.map(c => Date.parse(c.seen) || 0));
  return { ic: 'alert', tone: 'warn', text: seen ? `Cámara sin conexión desde las ${hm(seen)}` : 'Cámara sin conexión' };
}
function statusHtml(noCam) {
  const a = D().away; if (!a.on) return '';
  const since = Date.parse(a.since);
  const lines = [checkLine(a), soundLine(since), noCam ? null : camLine()].filter(Boolean);
  if (!lines.length) return '';
  return `<ul class="mf-lines">${lines.map(l => `<li class="t-${l.tone}">${I(l.ic)}<span>${esc(l.text)}</span></li>`).join('')}</ul>`;
}
/* "Se detectaron 3 períodos de ladridos, 7 minutos en total" (+ posibles gemidos o llanto) */
function summaryText(evs) {
  if (!evs.length) return '';
  const by = {}; for (const e of evs) { const k = NOUN[e.type] ? e.type : 'posible'; (by[k] = by[k] || []).push(e); }
  const parts = Object.entries(by).filter(([k]) => k !== 'posible').map(([k, l]) => `${l.length} ${NOUN[k][l.length === 1 ? 0 : 1]}, ${minsTxt(l.reduce((t, e) => t + e.dur * 1000, 0))} en total`);
  const pos = by.posible ? `${by.posible.length === 1 ? 'Hubo 1 posible gemido o llanto' : `Hubo ${by.posible.length} posibles gemidos o llantos`} (son los menos seguros: mirá la línea de tiempo).` : '';
  return (parts.length ? `Se ${parts.length === 1 && by[Object.keys(by).find(k => k !== 'posible')].length === 1 ? 'detectó' : 'detectaron'} ${parts.join('; ')}.` : '') + (pos ? (parts.length ? ' ' : '') + pos : '');
}
const alertLine = () => { const h = D().awaySet.alertH; return h ? `Te avisamos si pasa de ${h} h${D().awaySet.sitter && D().awaySet.sitterMail ? ', a vos y a quien la cuida' : ''}.` : 'Sin aviso: solo contamos el tiempo.'; };

/* ---------- Inicio ----------
   Con cámara: "Ver a {nombre} en vivo" arriba de todo (1 toque al video), con el estado de la cámara, lo último que
   escuchó y "Me fui" (o el estado de la salida en curso). Sin cámara: "Me fui" y "Usar un celu viejo como cámara". */
const camState = c => !c.online ? 'sin conexión' : c.listen === 'error' ? 'activa · no está escuchando' : c.listen === 'pausado' ? 'activa · en pausa' : 'activa · escuchando';
const bestCam = () => { const cams = st.cams || []; return cams.find(c => c.online && c.listen !== 'pausado' && c.listen !== 'error') || cams.find(c => c.online) || cams[0] || null; };
function recentHtml() {
  if (st.events == null) return '<p class="dim mf-rec-empty">Buscando lo último que escuchó…</p>';
  const evs = st.events.slice(-3).reverse();
  /* con "Me fui" en curso, el estado en frases ya dice "sin ladridos desde que saliste" */
  if (!evs.length) return D().away.on ? '' : '<p class="dim mf-rec-empty">Sin ladridos, maullidos ni llanto en las últimas 24 horas.</p>';
  return `<ol class="mf-rec">${evs.map(e => `<li><span class="ib c-cuida">${I(ICON[e.type] || 'bell')}</span><span>${esc(evText(e))}</span></li>`).join('')}</ol>`;
}
function camHomeCard(p) {
  const a = D().away, c = bestCam(), others = (st.cams || []).filter(x => x !== c && x.online);
  const pet = A().petById(c.petId) || p || D().pets[0];
  const since = a.on ? Date.parse(a.since) : (st.dayKey ||= Date.now() - 864e5);
  if (st.evKey !== String(since) && !st.loadingHome) {
    st.loadingHome = true;
    loadEvents(since, true).finally(() => { st.loadingHome = false; if (A().route.name === 'inicio' && !document.querySelector('dialog[open]')) A().render(); });
  }
  return `<section class="mf-cam span2" aria-labelledby="h-mfcam">
    <div class="mf-cam-h"><span class="mf-cam-ic" aria-hidden="true">${I('camera')}</span><div><h2 id="h-mfcam">Ver a ${esc(pet?.name || 'tu mascota')} en vivo</h2>
      <p class="mf-cam-st ${c.online ? 'on' : 'off'}"><span class="mf-cam-dot" aria-hidden="true"></span>${esc(c.name)} · ${esc(camState(c))}</p></div></div>
    ${a.on ? `<div class="mf-cam-away"><div class="mf-top"><span class="mf-dot" aria-hidden="true"></span><span class="eyebrow">Me fui · en curso</span></div><p class="mf-clock" data-away-clock>${clockHtml()}</p>${statusHtml(true)}</div>` : ''}
    <div class="btns"><button class="btn big" data-mf="live" data-cam="${c.camId}">${I('camera')} Ver en vivo</button>${a.on ? `<button class="btn ghost" data-mf="back">${I('check')} Volví</button>` : `<button class="btn ghost" data-mf="leave">${I('home')} Me fui</button>`}</div>
    ${c.online ? '' : '<p class="note">Para verla, en el celu de casa abrí la Cámara Mimitos y tocá "Prender cámara".</p>'}
    ${others.length ? `<div class="mf-cam-more">${others.map(x => `<button class="link" data-mf="live" data-cam="${x.camId}">Ver ${esc(x.name)}</button>`).join('')}</div>` : ''}
    <div class="mf-rec-h"><h3 class="mf-h3">${a.on ? 'Desde que saliste' : 'Lo último que escuchó'}</h3><button class="link" data-mf="refresh">Actualizar</button></div>
    ${recentHtml()}
    <button class="link" data-mf="open">Ver todo en Me fui ${I('chevron')}</button>
  </section>`;
}
function homeCard(p) {
  const a = D().away;
  if (!D().pets.length) return '';
  if ((st.cams || []).length) return camHomeCard(p);
  /* sin cámara (lista ya cargada): "Me fui" y el atajo al emparejado */
  if (st.cams && !a.on) {
    const one = D().pets.length === 1 ? D().pets[0] : null;
    const who = one ? `se queda ${esc(one.name)} ${sola(one)}` : 'se quedan solas tus mascotas';
    return `<section class="mf-cam none span2" aria-labelledby="h-mfnone">
      <div class="mf-cam-h"><span class="mf-cam-ic" aria-hidden="true">${I('away')}</span><div><h2 id="h-mfnone">Me fui</h2><p class="mf-cam-st">Contamos cuánto tiempo ${who}${D().awaySet.alertH ? ` y te avisamos si pasa de ${D().awaySet.alertH} h` : ''}. Con un celu viejo en casa, además la ves en vivo y te avisamos si ladra.</p></div></div>
      <div class="btns"><button class="btn big" data-mf="leave">${I('home')} Me fui</button><button class="btn ghost" data-mf="pair">${I('camera')} Convertir un celu viejo en cámara</button></div>
    </section>`;
  }
  if (!a.on) {
    const one = D().pets.length === 1 ? D().pets[0] : null;
    const who = one ? `se queda ${esc(one.name)} ${sola(one)}` : 'se quedan solas tus mascotas';
    return `<button class="mf-start span2" data-mf="leave">${bubbleI('home')}<span class="what"><b>Me fui</b><small>Contamos cuánto tiempo ${who}${D().awaySet.alertH ? ` y te avisamos si pasa de ${D().awaySet.alertH} h` : ''}.</small></span>${I('chevron')}</button>`;
  }
  if ((st.cams || []).length && st.tried !== a.since) { st.tried = a.since; refreshAway(); }
  return `<section class="mf-card span2" aria-labelledby="h-mf">
    <div class="mf-top"><span class="mf-dot" aria-hidden="true"></span><h2 id="h-mf" class="eyebrow">Me fui · en curso</h2></div>
    <p class="mf-clock" data-away-clock>${clockHtml()}</p>
    ${statusHtml()}
    <small class="dim">Saliste a las ${hm(Date.parse(a.since))}. ${esc(alertLine())}</small>
    <div class="btns"><button class="btn" data-mf="back">${I('check')} Volví</button><button class="btn ghost" data-mf="open">Ver detalle</button></div>
    ${st.cams && !st.cams.length ? `<button class="link" data-mf="pair">${I('camera')} Convertir un celu viejo en cámara</button>` : ''}
  </section>`;
}
const bubbleI = (ic, c = 'cuida') => `<span class="ib c-${c}">${I(ic)}</span>`;

/* ---------- "Me fui": la hoja ---------- */
function leaveForm() {
  const pets = D().pets, set = D().awaySet;
  const fields = [];
  if (pets.length > 1) pets.forEach(p => fields.push({ k: 'pet_' + p.id, type: 'check', label: `Queda ${p.name}` }));
  fields.push({ k: 'chk_agua', type: 'check', label: 'Le dejé agua' }, { k: 'chk_comida', type: 'check', label: 'Le dejé comida' },
    { k: 'chk_puerta', type: 'check', label: 'Cerré la puerta' }, { k: 'chk_ventanas', type: 'check', label: 'Ventanas y balcón cerrados' },
    { k: 'alertH', type: 'select', label: 'Avisame si pasa de', options: R.ALERT_HOURS.map(h => [String(h), h ? `${h} ${h === 1 ? 'hora' : 'horas'}` : 'Sin aviso']) });
  const values = { alertH: String(set.alertH) };
  pets.forEach(p => { values['pet_' + p.id] = true; });
  A().openForm({
    title: 'Me fui', saveLabel: 'Me fui', intro: 'Repasá antes de salir (es opcional). Contamos desde que tocás "Me fui".', fields, values, noFocus: true,
    onSave: v => {
      const chosen = pets.length > 1 ? pets.filter(p => v['pet_' + p.id]).map(p => p.id) : pets.map(p => p.id);
      if (!chosen.length) return 'Elegí al menos una mascota.';
      D().away = { on: true, id: uid(), since: new Date().toISOString(), pets: chosen.length === pets.length ? [] : chosen,
        check: { agua: Boolean(v.chk_agua), comida: Boolean(v.chk_comida), puerta: Boolean(v.chk_puerta), ventanas: Boolean(v.chk_ventanas) } };
      D().awaySet.alertH = Number(v.alertH) || 0;
    },
    afterSave: () => {
      const n = A().notify;
      const off = n && !n.devices && !n.mail && D().awaySet.alertH;
      A().toast(off ? 'Listo, contamos desde ahora. Para que te llegue el aviso, activá los avisos.' : 'Listo, contamos desde ahora. Cuando vuelvas, tocá "Volví".', off ? { label: 'Activar avisos', fn: () => A().go('avisos') } : undefined);
    },
  });
}

/* ---------- "Volví": cierra la salida y muestra el resumen ---------- */
async function comeBack() {
  const a = D().away; if (!a.on) return;
  const prev = JSON.parse(JSON.stringify(a));
  const now = Date.now(), pets = awayPets();
  const entry = { id: uid(), from: a.since, to: new Date(now).toISOString(), pets: a.pets || [] };
  D().awayLog.push(entry); D().awayLog = D().awayLog.slice(-R.MAX_LOG);
  D().away = R.blankAway();
  A().changed();
  const head = R.soloText(pets, now - Date.parse(prev.since)).replace(' lleva ', ' estuvo ').replace(' llevan ', ' estuvieron ') + '.';
  A().panel('Volviste', `<p class="mf-big">${esc(head)}</p><p class="dim">De ${hm(Date.parse(prev.since))} a ${hm(now)}.</p>
    <div id="mfSum" aria-live="polite"><p class="dim">Buscando lo que detectó la cámara…</p></div>
    <div class="d-acts"><button class="btn wide" data-mfp="ok">Listo</button><button class="btn ghost wide" data-mfp="undo">Me equivoqué, sigo afuera</button></div>`);
  $('#pBody').onclick = e => {
    const b = e.target.closest('[data-mfp]'); if (!b) return;
    if (b.dataset.mfp === 'undo') { D().awayLog = D().awayLog.filter(x => x.id !== entry.id); D().away = prev; A().changed(); A().toast('Listo, la salida sigue.'); }
    A().dPanel.close();
  };
  const evs = await loadEvents(Date.parse(prev.since), true);
  const box = $('#mfSum'); if (!box) return;
  if (!evs) { box.innerHTML = (st.cams || []).length ? '<p class="dim">No pudimos traer lo de la cámara. Lo ves en "Me fui".</p>' : ''; return; }
  box.innerHTML = evs.length ? `<p class="mf-sum">${esc(summaryText(evs))}</p><h3 class="mf-h3">Línea de tiempo</h3>${timelineHtml(evs)}` : (st.cams || []).length ? '<p class="mf-sum">La cámara no detectó ladridos, maullidos ni llanto.</p>' : '';
}

/* ---------- datos del servidor: cámaras y eventos ---------- */
async function loadCams(force) {
  if (!force && st.cams && Date.now() - st.camsAt < 30e3) return st.cams;
  try { const r = await fetch('/api/mascotas?cam=list'); if (!r.ok) return st.cams; const d = await r.json(); st.cams = d.cams || []; st.camsAt = Date.now(); st.max = d.max || 4; }
  catch {}
  return st.cams;
}
async function loadEvents(since, fresh) {
  const key = String(since);
  if (!fresh && st.evKey === key && st.events) return st.events;
  try { const r = await fetch('/api/mascotas?cam=events&since=' + encodeURIComponent(new Date(since).toISOString())); if (!r.ok) return null; const d = await r.json(); st.events = d.events || []; st.evKey = key; return st.events; }
  catch { return null; }
}
const ICON = { ladrido: 'dog', aullido: 'dog', maullido: 'cat', gemido: 'heart', llanto: 'heart' };
function timelineHtml(evs) {
  return `<ol class="mf-tl">${evs.slice().reverse().map(e => `<li><span class="ib c-cuida">${I(ICON[e.type] || 'bell')}</span><span class="what"><b>${esc(evText(e))}</b><small>${esc(camName(e.camId))}${e.n > 1 ? ` · ${e.n} episodios juntos` : ''}</small></span></li>`).join('')}</ol>`;
}
const camName = id => (st.cams || []).find(c => c.camId === id)?.name || 'Cámara';

/* ---------- pantalla "Me fui" ---------- */
function weekHtml() {
  const pets = D().pets; if (!pets.length) return '';
  const pid = pets.some(p => p.id === st.weekPet) ? st.weekPet : (A().curPet()?.id || pets[0].id);
  const p = pets.find(x => x.id === pid);
  const now = Date.now(), w = R.week(D().awayLog, D().away, pid, now, dayKey);
  const days = [...Array(7)].map((_, i) => { const d = new Date(now); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - (6 - i)); return d; });
  const max = Math.max(4 * R.H, ...days.map(d => w.byDay[dayKey(d.getTime())] || 0));
  const bars = days.map(d => { const ms = w.byDay[dayKey(d.getTime())] || 0; const lbl = d.toLocaleDateString('es-AR', { weekday: 'short' }).replace('.', ''); return `<li><span class="mf-bar${ms ? '' : ' zero'}" style="--h:${Math.round(ms / max * 100)}%" aria-hidden="true"></span><span class="mf-bl">${esc(lbl)}</span><span class="sr">${esc(d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric' }))}: ${ms ? esc(R.dur(ms)) : 'nada'}</span></li>`; }).join('');
  return `<section class="sec card2" aria-labelledby="h-mfw">
    <div class="sec-h"><h2 id="h-mfw">Esta semana</h2>${pets.length > 1 ? `<div class="chips" role="group" aria-label="Mascota">${pets.map(x => `<button type="button" class="chip" data-mf="week" data-id="${x.id}" aria-pressed="${x.id === pid}">${esc(x.name)}</button>`).join('')}</div>` : ''}</div>
    <p class="mf-big">${w.total ? `${esc(p.name)} estuvo ${sola(p)} ${esc(R.dur(w.total))}` : `${esc(p.name)} no estuvo ${sola(p)} esta semana`}</p>
    ${w.total ? `<small class="dim">${w.count} ${w.count === 1 ? 'salida' : 'salidas'}${w.longest ? ` · la más larga, ${esc(R.dur(w.longest.ms))}` : ''}. Cuenta solo lo que marcaste con "Me fui".</small>` : '<small class="dim">Se arma solo cuando usás "Me fui" y "Volví".</small>'}
    <ol class="mf-bars" aria-label="Tiempo ${sola(p)} por día">${bars}</ol>
  </section>`;
}
function camsListHtml(withLive) {
  const cams = st.cams;
  if (!cams) return '<p class="dim">Cargando cámaras…</p>';
  const rows = cams.map(c => `<div class="row x4"><span class="ib c-${c.online ? 'salud' : 'plata'}">${I('camera')}</span><span class="what"><b>${esc(c.name)}</b><small>${c.online ? '<span class="mf-on">Activa ahora</span>' : `Vista por última vez ${esc(Z.fmtWhen(new Date(c.seen)))}`}${D().pets.length > 1 ? ' · ' + esc(A().petById(c.petId)?.name || '') : ''}</small></span>${withLive && c.online ? `<button class="btn sm soft" data-mf="live" data-cam="${c.camId}">Ver en vivo</button>` : '<span></span>'}<button class="btn sm ghost" data-mf="revoke" data-cam="${c.camId}" aria-label="Desconectar ${esc(c.name)}">Desconectar</button>${withLive ? `<label class="mf-sens"><span>Sensibilidad</span><select data-mfsens="${c.camId}" aria-label="Sensibilidad de ${esc(c.name)}">${[['baja', 'Baja'], ['media', 'Media'], ['alta', 'Alta']].map(([v, l]) => `<option value="${v}"${(c.sens || 'media') === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>` : ''}</div>`).join('');
  return `${cams.length ? `<div class="list">${rows}</div>` : ''}
    ${cams.length < (st.max || 4) ? `<button class="btn ${cams.length ? 'ghost' : ''} wide" data-mf="pair">${I('camera')} Convertir un celu viejo en cámara</button>` : `<p class="note">Llegaste al máximo de ${st.max || 4} cámaras. Desconectá una para sumar otra.</p>`}`;
}
function render(p) {
  const a = D().away;
  if (!st.cams) loadCams().then(() => { if (A().route.name === 'mefui' || A().route.name === 'cuenta') A().render(); });
  /* la ventana de 24 h queda fija entre dibujos (si no, cada render pediría de nuevo); el refresco de 1 min la corre */
  const since = a.on ? Date.parse(a.since) : (st.dayKey ||= Date.now() - 864e5);
  const evKey = String(since);
  if (st.evKey !== evKey && (st.cams || []).length) { st.evKey = evKey; st.events = null; loadEvents(since, true).then(() => { if (A().route.name === 'mefui') A().render(); }); }
  const set = D().awaySet;
  return `<div class="mf">
    <button class="link" data-act="go" data-to="inicio">${I('back')} Inicio</button>
    <div><span class="eyebrow">Me fui</span><h1 class="h-xl">${a.on ? 'Estás afuera' : 'Cuando salgas'}</h1></div>
    ${a.on ? `<section class="mf-card" aria-labelledby="h-mf2"><div class="mf-top"><span class="mf-dot" aria-hidden="true"></span><h2 id="h-mf2" class="eyebrow">En curso</h2></div>
      <p class="mf-clock" data-away-clock>${clockHtml()}</p>
      ${statusHtml()}
      <small class="dim">Saliste a las ${hm(Date.parse(a.since))}. ${esc(alertLine())}</small>
      <button class="btn big wide" data-mf="back">${I('check')} Volví</button></section>`
    : `<section class="card"><p>Tocá "Me fui" cuando salgas: contamos cuánto tiempo queda ${D().pets.length === 1 ? sola(D().pets[0]) : 'sola'} y te avisamos si pasa del tiempo que elijas.</p><button class="btn big wide" data-mf="leave">${I('home')} Me fui</button></section>`}
    <div class="cols"><div class="col">
      ${weekHtml()}
      <section class="sec" aria-labelledby="h-mfa"><div class="sec-h"><h2 id="h-mfa">Avisos</h2><button class="link" data-mf="settings">Cambiar</button></div>
        <div class="card"><p>${set.alertH ? `Si pasa de <b>${set.alertH} h</b>, te avisamos por push${A().notify?.mail ? ' y por mail' : ''}; y otra vez al doble.` : 'Sin aviso por tiempo.'}</p>
        <p class="dim">${set.sitter && set.sitterMail ? `También le escribimos a <b>${esc(set.sitterMail)}</b> al pasar el umbral.` : 'Si querés, también le avisamos a quien la cuida (por mail).'}</p></div>
      </section>
    </div><div class="col">
      <section class="sec" aria-labelledby="h-mfc"><h2 id="h-mfc">Cámara Mimitos</h2>
        <p class="note">Un celu viejo enchufado en casa que escucha ladridos, maullidos y llanto. El audio se analiza en ese celu y nunca sale de ahí: solo nos llega "ladró 4 minutos a las 15:20".</p>
        ${camsListHtml(true)}
      </section>
      ${(st.cams || []).length ? `<section class="sec" aria-labelledby="h-mft"><h2 id="h-mft">${a.on ? 'Desde que saliste' : 'Últimas 24 horas'}</h2>
        ${st.events == null ? '<p class="dim">Cargando…</p>' : st.events.length ? timelineHtml(st.events) : '<p class="dim">Sin ladridos, maullidos ni llanto.</p>'}</section>` : ''}
    </div></div>
  </div>`;
}

/* ---------- ajustes del aviso ---------- */
function settingsForm() {
  const s = D().awaySet;
  const guess = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(A().curPet()?.sitter?.contact || '') ? A().curPet().sitter.contact : '';
  A().openForm({
    title: 'Avisos de "Me fui"', fields: [
      { k: 'alertH', type: 'select', label: 'Avisame si pasa de', options: R.ALERT_HOURS.map(h => [String(h), h ? `${h} ${h === 1 ? 'hora' : 'horas'}` : 'Sin aviso']) },
      { k: 'sitter', type: 'check', label: 'Avisarle también a quien la cuida', hint: 'Le llega un mail cuando pasa el umbral. Pedile permiso antes.' },
      { k: 'sitterMail', type: 'email', label: 'Mail de quien la cuida', opt: true, max: 120, ph: 'nombre@mail.com' },
    ], values: { alertH: String(s.alertH), sitter: s.sitter, sitterMail: s.sitterMail || guess },
    onSave: v => {
      const mail = String(v.sitterMail || '').trim().toLowerCase();
      if (v.sitter && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) return 'Para avisarle a quien la cuida, escribí su mail.';
      D().awaySet = { alertH: Number(v.alertH) || 0, sitter: Boolean(v.sitter), sitterMail: mail };
    },
  });
}

/* ---------- emparejar un celu como cámara ---------- */
const CONSENT = `<ul class="mf-ul">
  <li><b>Qué escucha:</b> el micrófono del celu cámara, solo para reconocer ladridos, aullidos, maullidos, gemidos y llanto. Se analiza <b>en ese celu</b>.</li>
  <li><b>Qué se manda:</b> solo el evento (qué fue, a qué hora, cuánto duró y qué tan seguro está). El audio nunca sale del celu.</li>
  <li><b>No se graba:</b> ni audio ni video. El video en vivo va directo de un celu al otro y no se guarda.</li>
  <li><b>Cómo se apaga:</b> en el celu cámara, "Apagar cámara"; o acá, "Desconectar", y deja de andar al toque.</li>
  <li><b>Otras personas:</b> no la apuntes a lugares donde haya personas (empleadas, visitas, vecinos) sin que lo sepan y estén de acuerdo.</li></ul>`;
function pairPanel() {
  clearInterval(st.pairTimer); st.pair = null;
  A().panel('Convertir un celu viejo en Cámara Mimitos', `<p>Sirve cualquier celu viejo con Chrome o Safari. Dejalo enchufado, con la pantalla hacia arriba, cerca de donde se queda.</p>${CONSENT}
    <label class="toggle"><input type="checkbox" id="mfOk"><span><b>Entiendo y no la voy a apuntar a otras personas sin su consentimiento</b></span></label>
    <div class="f"><label for="mfName">Nombre de la cámara <span class="opt">(opcional)</span></label><input id="mfName" maxlength="40" placeholder="Living, cocina, patio…"></div>
    <div id="mfPairErr" class="err-msg" role="alert" hidden></div>
    <div class="d-acts"><button class="btn wide" data-mfp="code" disabled>Generar código</button></div>`);
  const ok = $('#mfOk'), btn = $('#pBody [data-mfp="code"]');
  ok.onchange = () => { btn.disabled = !ok.checked; };
  $('#pBody').onclick = async e => {
    const b = e.target.closest('[data-mfp]'); if (!b) return;
    if (b.dataset.mfp === 'code') return makeCode(b);
    if (b.dataset.mfp === 'close') A().dPanel.close();
  };
  A().dPanel.addEventListener('close', () => { clearInterval(st.pairTimer); st.pairTimer = null; }, { once: true });
}
async function makeCode(btn) {
  btn.disabled = true; btn.textContent = 'Generando…';
  const err = $('#mfPairErr');
  try {
    const r = await fetch('/api/mascotas?cam=pair', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ petId: A().curPet()?.id || '', name: $('#mfName')?.value.trim() || '' }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { err.textContent = d.error === 'demasiadas_camaras' ? `Ya tenés ${d.max} cámaras. Desconectá una para sumar otra.` : d.error === 'limite' ? 'Generaste muchos códigos seguidos. Probá en un rato.' : 'No pudimos generar el código. Probá de nuevo.'; err.hidden = false; btn.disabled = false; btn.textContent = 'Generar código'; return; }
    const before = new Set((st.cams || []).map(c => c.camId));
    st.pair = { code: d.code, exp: Date.parse(d.exp) };
    const url = `${location.origin}/mascotas/camara#c=${d.code}`;
    $('#pBody').innerHTML = `<p>En el celu viejo, abrí <b>${esc(location.host)}/mascotas/camara</b> y escribí este código, o escaneá el QR con la cámara de ese celu.</p>
      <p class="mf-code" aria-label="Código ${esc(d.code.split('').join(' '))}">${esc(d.code.slice(0, 4))}<span aria-hidden="true">-</span>${esc(d.code.slice(4))}</p>
      <div class="mf-qr" id="mfQr" role="img" aria-label="QR para emparejar la cámara"></div>
      <p class="dim" id="mfLeft" aria-live="polite">Vence en 10 minutos. Sirve una sola vez.</p>
      <div class="d-acts"><button class="btn ghost wide" data-mfp="close">Cerrar</button></div>`;
    if (window.QRCode) new QRCode($('#mfQr'), { text: url, width: 200, height: 200, colorDark: '#1F1A17', colorLight: '#FFFFFF', correctLevel: QRCode.CorrectLevel.M });
    /* espera a que el celu cámara canjee el código */
    let ticks = 0;
    st.pairTimer = setInterval(async () => {
      const left = st.pair.exp - Date.now();
      const el = $('#mfLeft');
      if (left <= 0) { clearInterval(st.pairTimer); if (el) el.textContent = 'El código venció. Cerrá y generá otro.'; return; }
      if (el && ++ticks % 4 === 0) el.textContent = `Vence en ${Math.ceil(left / 60e3)} min. Sirve una sola vez.`;
      const cams = await loadCams(true);
      const nu = (cams || []).find(c => !before.has(c.camId));
      if (nu) {
        clearInterval(st.pairTimer);
        $('#pBody').innerHTML = `<p class="mf-big">${I('check')} Listo, "${esc(nu.name)}" quedó conectada.</p><p class="dim">En ese celu, dale permiso al micrófono y dejalo enchufado. Desde acá la podés desconectar cuando quieras.</p><div class="d-acts"><button class="btn wide" data-mfp="close">Listo</button></div>`;
        A().render();
      }
    }, 3000);
  } catch { err.textContent = 'Sin conexión. Probá de nuevo.'; err.hidden = false; btn.disabled = false; btn.textContent = 'Generar código'; }
}
async function revoke(b) {
  if (b.dataset.sure !== '1') { b.dataset.sure = '1'; b.textContent = '¿Seguro?'; setTimeout(() => { if (b.isConnected) { b.dataset.sure = ''; b.textContent = 'Desconectar'; } }, 4000); return; }
  b.disabled = true;
  try {
    const r = await fetch('/api/mascotas?cam=revoke', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ camId: b.dataset.cam }) });
    if (!r.ok && r.status !== 404) throw new Error();
    await loadCams(true); A().render(); A().toast('Listo, esa cámara quedó desconectada.');
  } catch { b.disabled = false; A().toast('No pudimos desconectarla. Probá de nuevo.'); }
}

/* ---------- ver en vivo (módulo aparte, se carga al tocar) ---------- */
function loadRtc() {
  if (window.MZRTC) return Promise.resolve(window.MZRTC);
  return new Promise(ok => { const s = document.createElement('script'); s.src = '/assets/js/mascotas-rtc.js?v=4'; s.onload = () => ok(window.MZRTC || null); s.onerror = () => ok(null); document.head.appendChild(s); });
}
const WAKING = 'Despertando la cámara… puede tardar hasta 30 segundos.';
/* íconos de los controles del video (trazo, como el resto de la app) */
const SV = d => `<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const IC = {
  on: SV('<path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/>'),
  off: SV('<path d="M11 5 6 9H3v6h3l5 4z"/><path d="m16 9 5 6"/><path d="m21 9-5 6"/>'),
  full: SV('<path d="M4 9V4h5"/><path d="M20 9V4h-5"/><path d="M4 15v5h5"/><path d="M20 15v5h-5"/>'),
  exit: SV('<path d="M9 4v5H4"/><path d="M15 4v5h5"/><path d="M9 20v-5H4"/><path d="M15 20v-5h5"/>'),
  mic: SV('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3"/>'),
  hang: SV('<path d="M3 15.5c5-4.7 13-4.7 18 0l-2.4 2.4-3.3-1.6v-2.7a10 10 0 0 0-6.6 0v2.7l-3.3 1.6z"/>'),
};
const AUDIO_ERR = {
  'sin-permiso': 'El celu cámara no tiene permiso para el micrófono. En ese celu, abrí la Cámara Mimitos y aceptá el permiso del micrófono.',
  'sin-microfono': 'El celu cámara no tiene un micrófono disponible.',
  'sin-respuesta': 'La cámara no respondió. Probá de nuevo en unos segundos.',
};
async function live(camId) {
  const dlg = A().dPanel;
  dlg.classList.add('mf-live-open');
  A().panel(`En vivo · ${camName(camId)}`, `<div class="mf-live" id="mfLive">
      <video id="mfVideo" playsinline autoplay muted></video>
      <p class="mf-live-st" id="mfLiveSt" role="status">${WAKING}</p>
      <div class="mf-ctl" role="group" aria-label="Controles del video">
        <button type="button" class="mf-cb" data-mfp="sound" aria-pressed="false">${IC.off}<span>Escuchar</span></button>
        <button type="button" class="mf-cb talk" id="mfTalk" aria-pressed="false">${IC.mic}<span>Mantené para hablar</span></button>
        <button type="button" class="mf-cb" data-mfp="full" aria-pressed="false">${IC.full}<span>Pantalla completa</span></button>
        <button type="button" class="mf-cb hang" data-mfp="close">${IC.hang}<span>Colgar</span></button>
      </div>
    </div>
    <p class="note" id="mfAudioNote" role="status">Va directo de un celu al otro y no se graba. El sonido arranca apagado: tocá "Escuchar". Doble toque para pantalla completa.</p>
    <button class="btn ghost wide" data-mfp="retry" hidden>Probar de nuevo</button>`);
  let viewer = null;
  const v = $('#mfVideo'), stEl = $('#mfLiveSt'), wrap = $('#mfLive'), note = $('#mfAudioNote');
  /* la caja toma la proporción que manda la cámara (4:3, 16:9 o vertical) y el video entra entero */
  const fit = () => { if (v.videoWidth && v.videoHeight) wrap.style.setProperty('--ar', `${v.videoWidth} / ${v.videoHeight}`); };
  v.addEventListener('loadedmetadata', fit); v.addEventListener('resize', fit);
  const soundBtn = () => $('#pBody [data-mfp="sound"]');
  /* "Hablarle": mantener apretado para hablar; o tocar para empezar y tocar para terminar (teclado y lectores) */
  const TALK_ERR = { 'sin-permiso': 'Para hablarle, dale permiso al micrófono de este celu.', 'sin-microfono': 'No encontramos un micrófono en este celu.', 'sin-conexion': 'Esperá a que conecte el video para hablarle.' };
  const talkBtn = $('#mfTalk');
  let talkHold = null, talkBusy = false;
  /* solo cambia el texto (no el botón entero): reemplazar el contenido bajo el dedo dispara pointerleave */
  const talkUI = on => { talkBtn.setAttribute('aria-pressed', String(on)); talkBtn.querySelector('span').textContent = on ? 'Hablando… soltá o tocá para terminar' : 'Mantené para hablar'; wrap.classList.toggle('is-talking', on); };
  let talkNext = null;
  async function talk(on) {
    if (!viewer?.talk) return;
    /* si todavía se está prendiendo (permiso del micrófono), el soltar queda anotado y se aplica al terminar */
    if (talkBusy) { talkNext = on; return; }
    talkBusy = true;
    let r = await viewer.talk(on);
    while (talkNext !== null && talkNext !== r.on) { const n = talkNext; talkNext = null; r = await viewer.talk(n); }
    talkNext = null;
    talkBusy = false;
    talkUI(r.on);
    note.textContent = r.error ? TALK_ERR[r.error] || TALK_ERR['sin-conexion'] : r.on ? 'Te está escuchando por el parlante del celu cámara.' : note.textContent;
  }
  talkBtn.addEventListener('pointerdown', e => {
    if (e.button > 0) return;
    e.preventDefault();
    /* captura: el soltar llega acá aunque el dedo se corra del botón */
    try { talkBtn.setPointerCapture(e.pointerId); } catch {}
    const was = talkBtn.getAttribute('aria-pressed') === 'true';
    talkHold = { t: Date.now(), was };
    if (!was) talk(true);
  });
  const release = () => {
    if (!talkHold) return;
    const { t, was } = talkHold; talkHold = null;
    /* apretado más de medio segundo: era "mantener"; un toque corto deja hablando (o corta si ya hablaba) */
    if (was || Date.now() - t > 500) talk(false);
  };
  talkBtn.addEventListener('pointerup', release); talkBtn.addEventListener('pointercancel', release);
  talkBtn.addEventListener('contextmenu', e => e.preventDefault());
  /* teclado (Enter o Espacio): alterna */
  talkBtn.addEventListener('click', e => { if (e.detail === 0) talk(talkBtn.getAttribute('aria-pressed') !== 'true'); });
  const setSound = (on, msg) => {
    const b = soundBtn(); if (!b) return;
    b.setAttribute('aria-pressed', String(on));
    b.innerHTML = `${on ? IC.on : IC.off}<span>${on ? 'Silenciar' : 'Escuchar'}</span>`;
    if (msg != null) note.textContent = msg;
  };
  const onAudio = r => {
    if (r.on) { setSound(true, 'Escuchando la casa en vivo. No se graba.'); return; }
    v.muted = true;
    setSound(false, r.error ? AUDIO_ERR[r.error] || AUDIO_ERR['sin-respuesta'] : 'Sonido apagado. La cámara dejó de mandar el micrófono.');
  };
  /* pantalla completa: la caja entera (con los controles); en iPhone, la del video del sistema */
  const isFull = () => Boolean(document.fullscreenElement || document.webkitFullscreenElement);
  async function toggleFull() {
    try {
      if (isFull()) { await (document.exitFullscreen || document.webkitExitFullscreen).call(document); return; }
      if (wrap.requestFullscreen) { await wrap.requestFullscreen({ navigationUI: 'hide' }); try { await screen.orientation?.lock?.('landscape'); } catch {} }
      else if (wrap.webkitRequestFullscreen) wrap.webkitRequestFullscreen();
      else if (v.webkitEnterFullscreen) v.webkitEnterFullscreen();
    } catch { if (v.webkitEnterFullscreen) try { v.webkitEnterFullscreen(); } catch {} }
  }
  const onFs = () => { const b = $('#pBody [data-mfp="full"]'); if (!b) return; const f = isFull(); b.setAttribute('aria-pressed', String(f)); b.innerHTML = `${f ? IC.exit : IC.full}<span>${f ? 'Salir' : 'Pantalla completa'}</span>`; if (!f) try { screen.orientation?.unlock?.(); } catch {} };
  document.addEventListener('fullscreenchange', onFs); document.addEventListener('webkitfullscreenchange', onFs);
  /* doble toque (dedo) o doble clic (mouse) sobre el video = pantalla completa */
  let lastTap = 0;
  wrap.addEventListener('pointerup', e => { if (e.pointerType === 'mouse' || e.target.closest('.mf-ctl')) return; const t = Date.now(); if (t - lastTap < 320) { lastTap = 0; toggleFull(); } else lastTap = t; });
  wrap.addEventListener('dblclick', e => { if (e.target.closest('.mf-ctl')) return; toggleFull(); });
  $('#pBody').onclick = e => {
    const b = e.target.closest('[data-mfp]'); if (!b) return;
    if (b.dataset.mfp === 'sound') {
      const on = b.getAttribute('aria-pressed') !== 'true';
      if (on) {
        /* dentro del gesto: desmutear y play(); después se le pide el micrófono a la cámara */
        v.muted = false; v.play().catch(() => {});
        setSound(true, 'Pidiéndole el sonido a la cámara…');
        viewer?.setAudio?.(true).then(r => { if (r.error === 'sin-respuesta' && r.pending) note.textContent = 'Cuando conecte, prendemos el sonido.'; else if (r.error) onAudio(r); });
      } else {
        v.muted = true; setSound(false, 'Sonido apagado.');
        viewer?.setAudio?.(false);
      }
    }
    if (b.dataset.mfp === 'full') toggleFull();
    if (b.dataset.mfp === 'retry') { b.hidden = true; viewer?.retry?.(); }
    if (b.dataset.mfp === 'close') dlg.close();
  };
  dlg.addEventListener('close', () => {
    dlg.classList.remove('mf-live-open');
    document.removeEventListener('fullscreenchange', onFs); document.removeEventListener('webkitfullscreenchange', onFs);
    if (isFull()) try { (document.exitFullscreen || document.webkitExitFullscreen).call(document); } catch {}
    try { viewer?.talk?.(false); } catch {}
    try { viewer?.stop?.(); } catch {}
    st.viewer = null;
  }, { once: true });
  const rtc = await loadRtc();
  if (!rtc?.startViewer) { stEl.textContent = 'El video en vivo todavía no está disponible.'; return; }
  try {
    viewer = st.viewer = rtc.startViewer({ camId, videoEl: v, onAudio, onStatus: s => {
      if (!stEl.isConnected) return;
      /* la cámara en reposo consulta cada 30–60 s: el primer conectar puede tardar */
      stEl.textContent = s.state === 'en-vivo' ? '' : s.state === 'conectando' ? WAKING : s.message || WAKING;
      wrap.classList.toggle('is-live', s.state === 'en-vivo');
      const rb = $('#pBody [data-mfp="retry"]'); if (rb) rb.hidden = !['fallo', 'apagada'].includes(s.state);
    } });
  } catch { stEl.textContent = 'No pudimos conectar en vivo desde esta red.'; }
}

/* ---------- Cuenta → Cámaras ---------- */
function cuentaSection() {
  if (!st.cams) loadCams().then(() => { if (A().route.name === 'cuenta') A().render(); });
  return `<section class="sec" aria-labelledby="h-cams"><h2 id="h-cams">Cámaras Mimitos</h2>
    <p class="note">Celus usados como Cámara Mimitos. Desconectá los que ya no uses: dejan de andar al toque.</p>${camsListHtml(false)}${(st.cams || []).length ? `<a class="link" href="#/mefui" style="align-self:flex-start">${(st.cams || []).some(c => c.online) ? 'Ver en vivo en Me fui' : 'Ir a Me fui'} ›</a>` : ''}</section>`;
}

/* ---------- acciones ---------- */
document.addEventListener('click', e => {
  const b = e.target.closest('[data-mf]'); if (!b || !['app', 'nav', 'pBody'].some(id => document.getElementById(id)?.contains(b)) && !document.querySelector('.top')?.contains(b)) return;
  switch (b.dataset.mf) {
    case 'leave': return leaveForm();
    case 'back': return comeBack();
    case 'open': return A().go('mefui');
    case 'settings': return settingsForm();
    case 'week': st.weekPet = b.dataset.id; return A().render();
    case 'pair': return pairPanel();
    case 'revoke': return revoke(b);
    case 'live': return live(b.dataset.cam);
    case 'refresh': return refreshAway(true, b);
    /* desde el "+": con cámara va a "Me fui"; sin cámara, directo a emparejar */
    case 'hub': return (st.cams || []).length || D().away.on ? A().go('mefui') : pairPanel();
  }
});
/* sensibilidad de cada cámara (la cámara la toma en su próximo aviso de "sigo acá", como mucho en 5 minutos) */
document.addEventListener('change', async e => {
  const sel = e.target.closest?.('[data-mfsens]'); if (!sel) return;
  try {
    const r = await fetch('/api/mascotas?cam=sens', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ camId: sel.dataset.mfsens, sens: sel.value }) });
    if (!r.ok) throw new Error();
    const c = (st.cams || []).find(x => x.camId === sel.dataset.mfsens); if (c) c.sens = sel.value;
    A().toast('Listo. La cámara la toma en unos minutos.');
  } catch { A().toast('No pudimos cambiarla. Probá de nuevo.'); }
});
/* el contador se actualiza solo (cada 30 s; no hace falta más precisión que el minuto) */
setInterval(() => {
  if (A()?.mode !== 'full' || !A().mefui || !D().away?.on) return;
  document.querySelectorAll('[data-away-clock]').forEach(el => { el.innerHTML = clockHtml(); });
}, 30e3);
/* trae cámaras y eventos de la salida en curso y vuelve a dibujar si cambió algo */
let refreshing = false;
async function refreshAway(manual, btn) {
  if (refreshing) return; refreshing = true;
  if (btn) { btn.disabled = true; btn.textContent = 'Actualizando…'; }
  try {
    const since = D().away.on ? Date.parse(D().away.since) : (st.dayKey = Date.now() - 864e5);
    const [, evs] = await Promise.all([loadCams(true), loadEvents(since, true)]);
    if (!document.querySelector('dialog[open]') && ['inicio', 'mefui'].includes(A().route.name)) A().render();
    if (manual) A().toast(evs ? 'Listo, actualizado.' : 'No pudimos actualizar. Probá de nuevo.');
  } finally { refreshing = false; }
}
/* con Inicio o "Me fui" abiertos y una salida en curso, el estado se refresca cada minuto (solo si hay cámaras) */
setInterval(async () => {
  if (A()?.mode !== 'full' || !A().mefui || !['mefui', 'inicio'].includes(A().route.name) || document.hidden || !(st.cams || []).length) return;
  const since = D().away.on ? Date.parse(D().away.since) : (st.dayKey = Date.now() - 864e5);
  const sig = () => JSON.stringify([(st.events || []).map(e => e.id + e.dur), (st.cams || []).map(c => c.camId + c.online)]);
  const before = sig();
  await Promise.all([loadCams(true), loadEvents(since, true)]);
  /* solo se vuelve a dibujar si cambió algo (así no se pierde el foco) */
  if (sig() !== before && !document.querySelector('dialog[open]')) A().render();
}, 60e3);
/* al cargar, si hay una salida en curso, se piden las cámaras para el "Cámara activa" del Inicio */
setTimeout(function wait() { if (A()?.mode === 'full') { if (A().mefui) loadCams().then(() => A().render()); } else if (A()?.mode === 'loading') setTimeout(wait, 400); }, 400);

/* acceso fijo en la barra de arriba: píldora con texto ("Me fui", o "En vivo" con punto verde si hay una cámara activa).
   Antes era un ícono de cámara solo y se leía como "sacar una foto". */
function topIcon() {
  const on = (st.cams || []).some(c => c.online), away = D().away?.on;
  const txt = on ? 'En vivo' : 'Me fui';
  const lbl = on ? 'Me fui: Cámara Mimitos en vivo' : away ? 'Me fui: salida en curso' : 'Me fui';
  return `<a class="round mf-topic mf-pill${on ? ' is-on' : ''}${away ? ' is-away' : ''}" href="#/mefui" aria-label="${lbl}" title="${lbl}">${on || away ? '<span class="mf-topdot" aria-hidden="true"></span>' : ''}<span>${txt}</span></a>`;
}
const hasCamOn = () => (st.cams || []).some(c => c.online);
window.MZAWAY = { homeCard, render, cuentaSection, loadCams, topIcon, hasCamOn, state: st };
})();
