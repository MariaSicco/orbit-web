/* Cámara Mimitos · la página del celu viejo que queda en casa (/mascotas/camara). Sin login: anda con el token
   del dispositivo que da el emparejado (código de un solo uso que se genera en la app).

   - El token se guarda en este navegador (localStorage, dentro de try/catch; si no se puede, dura lo que dure la
     pestaña). En el servidor solo está su hash y se revoca desde Cuenta → Cámaras o con "Desvincular este celu".
   - Escucha con assets/js/mascotas-audio.js (clasificador en el dispositivo). El audio NUNCA se manda: solo el
     evento { type, start, dur, conf } a /api/mascotas?cam=event.
   - Video en vivo opcional con assets/js/mascotas-rtc.js (P2P, no se graba).
   - Wake Lock para que la pantalla no se apague, capa negra para atenuarla y el indicador "Cámara activa" siempre visible. */
const API = '/api/mascotas?cam=';
const $ = s => document.querySelector(s);
const main = $('#cam');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hm = ms => new Date(ms).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const VERB = { ladrido: 'Ladrido', aullido: 'Aullido', maullido: 'Maullido', gemido: 'Gemido', llanto: 'Llanto' };
const LOGO = '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 27.5c-6.3-4.2-11-8.3-11-13.4C5 10.6 7.7 8 10.9 8c2.2 0 4 1.1 5.1 2.9C17.1 9.1 18.9 8 21.1 8 24.3 8 27 10.6 27 14.1c0 5.1-4.7 9.2-11 13.4z" fill="#D9694A"/><circle cx="12" cy="16" r="1.5" fill="#1F1A17"/><circle cx="20" cy="16" r="1.5" fill="#1F1A17"/></svg>';
const head = `<div class="brand">${LOGO}<span>Cámara Mimitos</span><small>by Orbit</small></div>`;

/* ---------- token del dispositivo ---------- */
let mem = null;
const KEY = 'mimitos:cam';
const store = {
  get() { try { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); return v && typeof v.token === 'string' ? v : mem; } catch { return mem; } },
  set(v) { mem = v; try { localStorage.setItem(KEY, JSON.stringify(v)); } catch {} },
  clear() { mem = null; try { localStorage.removeItem(KEY); } catch {} },
};
const pref = { get(k, d) { try { return localStorage.getItem('mimitos:cam:' + k) ?? d; } catch { return d; } }, set(k, v) { try { localStorage.setItem('mimitos:cam:' + k, v); } catch {} } };
async function api(act, { method = 'GET', body, token } = {}) {
  const r = await fetch(API + act, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined, credentials: 'omit', cache: 'no-store' });
  const d = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, d };
}

/* ---------- estado ---------- */
const S = { me: null, audio: null, rtc: null, wake: null, ping: null, events: [], queue: [], level: 0, listen: 'off', video: 'off', battery: null, dimTimer: null, started: 0 };

/* ---------- 1. emparejar ---------- */
function codeFromHash() { const m = /[#&]c=([A-Za-z0-9-]{8,9})/.exec(location.hash); return m ? m[1].replace('-', '').toUpperCase() : ''; }
function renderPair(msg = '') {
  const code = codeFromHash();
  main.innerHTML = `${head}
    <h1>Usar este celu como cámara</h1>
    <p class="dim2">En tu celu de siempre, en Mimitos → "Me fui" → "Usar un celu como cámara", te damos un código. Escribilo acá.</p>
    <form id="pairF" class="card" novalidate>
      <div class="f"><label for="code">Código</label><input id="code" class="code-in" inputmode="text" autocomplete="one-time-code" autocapitalize="characters" maxlength="9" value="${esc(code ? code.slice(0, 4) + '-' + code.slice(4) : '')}" placeholder="XXXX-XXXX" aria-describedby="codeH"><small id="codeH" class="dim2">Vence a los 10 minutos y sirve una sola vez.</small></div>
      <div class="f"><label for="label">Nombre de esta cámara <span class="dim2">(opcional)</span></label><input id="label" maxlength="40" placeholder="Living, cocina, patio…"></div>
      <p id="pairErr" class="err" role="alert"${msg ? '' : ' hidden'}>${esc(msg)}</p>
      <button class="btn" id="pairB">Conectar este celu</button>
    </form>
    ${privacy()}`;
  $('#code').addEventListener('input', e => { const v = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8); e.target.value = v.length > 4 ? v.slice(0, 4) + '-' + v.slice(4) : v; });
  $('#pairF').addEventListener('submit', async e => {
    e.preventDefault();
    const c = $('#code').value.replace(/[^A-Za-z0-9]/g, '');
    const err = $('#pairErr');
    if (c.length !== 8) { err.textContent = 'El código tiene 8 letras y números.'; err.hidden = false; $('#code').focus(); return; }
    const b = $('#pairB'); b.disabled = true; b.textContent = 'Conectando…';
    try {
      const r = await api('redeem', { method: 'POST', body: { code: c, label: $('#label').value.trim() } });
      if (!r.ok) {
        err.textContent = { codigo_vencido: 'Ese código venció o ya se usó. Generá uno nuevo en la app.', codigo_usado: 'Ese código ya se usó. Generá uno nuevo en la app.', codigo_invalido: 'Ese código no es válido. Revisalo.', demasiadas_camaras: 'Tu cuenta ya tiene el máximo de cámaras. Desconectá una desde la app.', limite: 'Probaste muchas veces. Esperá un rato.', not_found: 'La Cámara Mimitos todavía no está disponible para tu cuenta.' }[r.d.error] || 'No pudimos conectar. Probá de nuevo.';
        err.hidden = false; b.disabled = false; b.textContent = 'Conectar este celu'; return;
      }
      store.set({ token: r.d.token, camId: r.d.camId });
      history.replaceState(null, '', location.pathname);
      boot();
    } catch { err.textContent = 'Sin conexión. Revisá el wifi y probá de nuevo.'; err.hidden = false; b.disabled = false; b.textContent = 'Conectar este celu'; }
  });
  if (!code) $('#code').focus();
}
const privacy = () => `<details class="card"><summary><b>Qué hace esta cámara con tu casa</b></summary>
  <ul class="list">
    <li><b>Qué escucha:</b> el micrófono de este celu, solo para reconocer ladridos, aullidos, maullidos, gemidos y llanto. Se analiza acá, en este celu.</li>
    <li><b>Qué se manda:</b> solo el evento: qué fue, a qué hora, cuánto duró y qué tan seguro está. El audio nunca sale de este celu.</li>
    <li><b>No se graba:</b> ni audio ni video. El video en vivo (si lo activás) va directo a tu celu y no se guarda.</li>
    <li><b>Cómo se apaga:</b> "Apagar cámara" acá, cerrar esta pestaña, o "Desconectar" en la app.</li>
    <li><b>Otras personas:</b> no la apuntes a lugares donde haya personas sin que lo sepan y estén de acuerdo.</li>
  </ul></details>`;

/* ---------- 2. lista para prender (el permiso del micrófono necesita un toque) ---------- */
function renderReady(note = '') {
  const me = S.me;
  const sens = pref.get('sens', 'media');
  main.innerHTML = `${head}
    <h1>${esc(me.name || 'Cámara')} ${me.pet ? `· ${esc(me.pet)}` : ''}</h1>
    ${note ? `<p class="warn" role="status">${esc(note)}</p>` : ''}
    <div class="card">
      <p><b>Antes de prender</b></p>
      <ul class="list">
        <li>Dejalo <b>enchufado</b>: escuchar todo el día gasta batería.</li>
        <li>Apoyalo cerca de donde se queda ${me.pet ? esc(me.pet) : 'tu mascota'}, lejos de la tele y de la calle.</li>
        <li>Dejá <b>esta pantalla abierta</b>. La vamos a atenuar para que no ilumine el cuarto.</li>
      </ul>
    </div>
    <label class="toggle"><input type="checkbox" id="okP"><span><b>Entiendo qué escucha y qué se manda, y no la voy a apuntar a otras personas sin su consentimiento.</b></span></label>
    <label class="toggle"><input type="checkbox" id="okV"${pref.get('video', '1') === '1' ? ' checked' : ''}><span><b>Permitir ver en vivo desde mi celu</b><br><small class="dim2">Usa la cámara de este celu solo mientras mirás. No se graba. El sonido en vivo arranca apagado.</small></span></label>
    <fieldset class="card" style="border:0;margin:0"><legend class="dim2" style="padding:0">Sensibilidad</legend><div class="chips" role="radiogroup" aria-label="Sensibilidad">${['baja', 'media', 'alta'].map(s => `<label class="chip"><input type="radio" name="sens" value="${s}"${s === sens ? ' checked' : ''}> ${s[0].toUpperCase() + s.slice(1)}</label>`).join('')}</div>
    <small class="dim2">Alta detecta más, pero puede confundir otros ruidos.</small></fieldset>
    <button class="btn" id="go" disabled>Prender cámara</button>
    <button class="btn ghost" id="unpair">Desvincular este celu</button>
    ${privacy()}`;
  const ok = $('#okP'), go = $('#go');
  ok.onchange = () => { go.disabled = !ok.checked; };
  go.onclick = () => { pref.set('sens', document.querySelector('input[name=sens]:checked')?.value || 'media'); pref.set('video', $('#okV').checked ? '1' : '0'); start(); };
  $('#unpair').onclick = unpair;
}
async function unpair() {
  const b = $('#unpair');
  if (b.dataset.sure !== '1') { b.dataset.sure = '1'; b.textContent = 'Tocá de nuevo para desvincular'; return; }
  const t = store.get()?.token;
  if (t) await api('unpair', { method: 'POST', token: t }).catch(() => {});
  store.clear(); renderPair();
}

/* ---------- 3. cámara activa ---------- */
async function start() {
  const tok = store.get()?.token; if (!tok) return renderPair();
  S.started = Date.now(); S.events = [];
  renderActive();
  /* pantalla siempre prendida */
  await wakeOn();
  /* escuchar */
  try {
    const A = await import('/assets/js/mascotas-audio.js?v=1');
    const fn = A.startListening || window.MZAUDIO?.startListening;
    if (!fn) throw Object.assign(new Error('sin módulo'), { code: 'modelo' });
    S.listen = 'cargando'; paint();
    S.audio = await fn({ sensitivity: pref.get('sens', 'media'), onEvent: onSound, onLevel: l => { S.level = l; meter(); },
      onState: s => { S.listen = s.state || 'escuchando'; S.listenMsg = s.message || ''; paint(); } });
    S.listen = 'escuchando'; paint();
  } catch (e) {
    S.listen = 'error';
    S.listenMsg = { 'permiso-denegado': 'Necesitamos permiso para el micrófono. Activalo en los ajustes del navegador y volvé a prender.', 'sin-microfono': 'No encontramos un micrófono en este celu.', 'no-soportado': 'Este navegador no puede escuchar. Probá con Chrome actualizado.' }[e?.code] || 'No pudimos prender la escucha. Probá cerrar y volver a abrir esta pantalla.';
    paint();
  }
  /* video en vivo (opcional) */
  if (pref.get('video', '1') === '1') {
    const rtc = await loadScript('/assets/js/mascotas-rtc.js?v=1', 'MZRTC');
    if (rtc?.startBroadcast) {
      try { S.rtc = rtc.startBroadcast({ camToken: tok, onStatus: s => { S.video = s.state; S.videoMsg = s.message || ''; if (s.state === 'invalida') revoked(); else paint(); } }); }
      catch { S.video = 'error'; paint(); }
    } else { S.video = 'no-disponible'; paint(); }
  }
  /* "visto" cada minuto; si la desconectaron desde la app, se apaga */
  clearInterval(S.ping);
  S.ping = setInterval(async () => {
    try { const r = await api('ping', { method: 'POST', token: tok }); if (r.status === 401) return revoked(); S.away = Boolean(r.d.away); flushQueue(); paint(); } catch {}
  }, 60e3);
  battery();
  armDim();
}
function loadScript(src, global) {
  if (window[global]) return Promise.resolve(window[global]);
  return new Promise(ok => { const s = document.createElement('script'); s.src = src; s.onload = () => ok(window[global] || null); s.onerror = () => ok(null); document.head.appendChild(s); });
}
async function onSound(e) {
  const ev = { type: e.type, start: new Date(e.start).toISOString(), dur: Math.max(1, Math.round(e.durationSec ?? ((e.end - e.start) / 1000) ?? 1)), conf: Math.round((e.confidence ?? 0) * 100) / 100 };
  S.events.unshift({ ...ev, sent: false }); S.events = S.events.slice(0, 20);
  S.queue.push(ev); await flushQueue(); paint();
}
async function flushQueue() {
  const tok = store.get()?.token; if (!tok) return;
  while (S.queue.length) {
    try {
      const r = await api('event', { method: 'POST', token: tok, body: S.queue[0] });
      if (r.status === 401) return revoked();
      /* 400 (inválido) o 429 (tope): se descarta; error de red: se reintenta en el próximo ping */
      const ev = S.queue.shift();
      const local = S.events.find(x => x.start === ev.start && x.type === ev.type); if (local) local.sent = r.ok;
    } catch { break; }
  }
  S.queue = S.queue.slice(-50);
}
async function wakeOn() {
  if (!('wakeLock' in navigator)) { S.wakeSt = 'no'; return; }
  try { S.wake = await navigator.wakeLock.request('screen'); S.wakeSt = 'si'; S.wake.addEventListener('release', () => { S.wakeSt = document.hidden ? 'pausa' : 'no'; paint(); }); }
  catch { S.wakeSt = 'no'; }
  paint();
}
/* el sistema suelta el Wake Lock cuando la pestaña pasa a segundo plano: al volver, se pide de nuevo */
document.addEventListener('visibilitychange', () => { if (!document.hidden && S.started) wakeOn(); });
async function battery() {
  try { const b = await navigator.getBattery?.(); if (!b) return; const up = () => { S.battery = { charging: b.charging, level: b.level }; paint(); }; b.addEventListener('chargingchange', up); b.addEventListener('levelchange', up); up(); } catch {}
}
function stopAll() {
  try { S.audio?.stop?.(); } catch {} S.audio = null;
  try { S.rtc?.stop?.(); } catch {} S.rtc = null;
  try { S.wake?.release?.(); } catch {} S.wake = null;
  clearInterval(S.ping); clearTimeout(S.dimTimer); S.started = 0; S.listen = 'off'; S.video = 'off';
  $('#dim').hidden = true;
}
function revoked() { stopAll(); store.clear(); main.innerHTML = `${head}<h1>Esta cámara se desconectó</h1><p class="dim2">La desconectaron desde la app de Mimitos (o la cuenta ya no la tiene). Para volver a usarla, generá un código nuevo.</p><button class="btn" id="again">Emparejar de nuevo</button>`; $('#again').onclick = () => renderPair(); }

function renderActive() {
  main.innerHTML = `${head}
    <section class="live" id="live" aria-labelledby="liveT"><span class="live-dot" aria-hidden="true"></span><b id="liveT">Cámara activa</b><p class="dim2" id="liveSub">Prendiendo…</p><div class="meter" aria-hidden="true"><span id="lvl"></span></div></section>
    <div class="chips" id="chips" aria-label="Estado"></div>
    <p class="dim2" id="note"></p>
    <section class="card" aria-labelledby="evT"><b id="evT">Lo que detectó</b><ul class="evs" id="evs"></ul></section>
    <div class="row2"><button class="btn ghost" id="dimB">Atenuar pantalla</button><button class="btn stop" id="stopB">Apagar cámara</button></div>
    ${privacy()}`;
  $('#stopB').onclick = () => { stopAll(); renderReady('Cámara apagada. No escucha ni transmite.'); };
  $('#dimB').onclick = dim;
  paint();
}
function chip(ok, text) { return `<span class="chip ${ok ? 'ok' : 'no'}">${ok ? '●' : '▲'} ${esc(text)}</span>`; }
function paint() {
  if (!$('#live')) return;
  const L = S.listen;
  const live = $('#live'); live.classList.toggle('paused', L === 'pausado' || L === 'cargando'); live.classList.toggle('off', L === 'error' || L === 'detenido');
  $('#liveT').textContent = L === 'error' ? 'No está escuchando' : L === 'pausado' ? 'En pausa' : 'Cámara activa';
  $('#liveSub').textContent = L === 'escuchando' ? `Escuchando desde las ${hm(S.started)}. El audio no sale de este celu.` : L === 'cargando' ? 'Preparando el reconocimiento de sonidos…' : S.listenMsg || 'Prendiendo…';
  const b = S.battery;
  $('#chips').innerHTML = [
    chip(S.wakeSt === 'si', S.wakeSt === 'si' ? 'Pantalla siempre prendida' : 'La pantalla se puede apagar'),
    b ? chip(b.charging, b.charging ? 'Enchufado' : `Sin enchufar (${Math.round(b.level * 100)}%)`) : '',
    S.video !== 'off' ? chip(['esperando', 'cam-en-vivo', 'en-vivo', 'cam-conectando', 'conectando'].includes(S.video), S.video === 'en-vivo' || S.video === 'cam-en-vivo' ? 'Transmitiendo en vivo' : S.video === 'no-disponible' ? 'Video en vivo no disponible' : 'Video en vivo listo') : '',
    S.away === true ? chip(true, 'Me fui activo: avisamos') : S.away === false ? chip(false, 'Estás en casa: solo registra') : '',
  ].join('');
  $('#note').textContent = S.wakeSt === 'no' ? 'Este navegador no deja la pantalla prendida: subí el tiempo de apagado de pantalla en los ajustes del celu.' : b && !b.charging ? 'Enchufalo: escuchar todo el día gasta batería.' : S.videoMsg && S.video !== 'esperando' ? S.videoMsg : '';
  $('#evs').innerHTML = S.events.length ? S.events.slice(0, 8).map(e => `<li><span>${esc(VERB[e.type] || e.type)} · ${e.dur < 60 ? e.dur + ' s' : Math.round(e.dur / 60) + ' min'}</span><small>${hm(Date.parse(e.start))}</small></li>`).join('') : '<li><small>Todavía nada. Si ladra, maúlla o llora, aparece acá.</small></li>';
}
function meter() { const el = $('#lvl'); if (el) el.style.setProperty('--l', Math.min(100, Math.round(Math.sqrt(S.level) * 160)) + '%'); }

/* ---------- pantalla atenuada ---------- */
function dim() { $('#dim').hidden = false; $('#dimOff').focus(); }
function armDim() { clearTimeout(S.dimTimer); S.dimTimer = setTimeout(() => { if (S.started) dim(); }, 90e3); }
$('#dimOff').addEventListener('click', () => { $('#dim').hidden = true; armDim(); });
['pointerdown', 'keydown'].forEach(t => document.addEventListener(t, () => { if (S.started && $('#dim').hidden) armDim(); }, { passive: true }));

/* ---------- arranque ---------- */
async function boot() {
  const s = store.get();
  if (!s?.token) return renderPair();
  try {
    const r = await api('me', { token: s.token });
    if (r.status === 401) { store.clear(); return renderPair(codeFromHash() ? '' : 'Esta cámara ya no está vinculada. Generá un código nuevo en la app.'); }
    if (r.status === 404) { main.innerHTML = `${head}<h1>Todavía no está disponible</h1><p class="dim2">La Cámara Mimitos está en prueba y no está habilitada para tu cuenta.</p>`; return; }
    if (!r.ok) throw new Error();
    S.me = r.d; S.away = Boolean(r.d.away);
    renderReady();
  } catch { main.innerHTML = `${head}<h1>Sin conexión</h1><p class="dim2">Revisá el wifi de este celu.</p><button class="btn" id="re">Probar de nuevo</button>`; $('#re').onclick = boot; }
}
window.addEventListener('pagehide', () => { if (S.started) stopAll(); });
boot();
