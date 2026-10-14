/* Mimitos · "Me fui": video en vivo del celu cámara a la dueña (WebRTC P2P, sin servidor de video).
   Señalización por /api/mascotas?rtc=… (api/_lib/petrtc.js). Nada se graba ni se guarda.

   window.MZRTC = { startBroadcast, startViewer, MSG }

   Lado cámara (celu viejo en casa, con el token del emparejado):
     const cam = MZRTC.startBroadcast({ camToken, onStatus, audio: false })
     cam.setAudio(true|false)   prende o apaga el micrófono (apagado por defecto; recién ahí pide permiso)
     cam.stop()
   Lado dueña (con sesión):
     const v = MZRTC.startViewer({ camId, videoEl, onStatus })
     v.setMuted(false)          el sonido arranca silenciado (autoplay)
     v.retry()                  volver a intentar después de un fallo
     v.stop()
   onStatus({ state, message }) con message listo para mostrar. Estados:
     cámara: 'preparando' 'esperando' 'conectando' 'en-vivo' 'sin-permiso' 'sin-camara' 'invalida' 'error' 'detenida'
     viewer: 'conectando' 'en-vivo' 'reconectando' 'apagada' 'ocupada' 'otra-pantalla' 'fallo' 'sin-acceso' 'no-disponible' 'detenido'

   Video: 640x480 a 15 fps, tope ~450 kbps (batería y datos). Si la red no deja conectar directo en 15 s
   (sin TURN), se avisa y se suma al contador de fallos del servidor. */
(() => {
'use strict';
const API = '/api/mascotas?rtc=';
const DEFAULT_ICE = [{ urls: 'stun:stun.l.google.com:19302' }];
const VIDEO = { facingMode: { ideal: 'environment' }, width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 15, max: 15 } };
const MAX_BITRATE = 450000;
const CONNECT_TIMEOUT = 15000;

const MSG = {
  preparando: 'Prendiendo la cámara…',
  esperando: 'Cámara lista. Cuando abras Mimitos en tu celu, vas a ver la casa en vivo.',
  'cam-conectando': 'Alguien de tu cuenta está entrando a mirar…',
  'cam-en-vivo': 'Transmitiendo en vivo. No se graba nada.',
  'sin-permiso': 'Necesitamos permiso para usar la cámara. Activalo en los ajustes del navegador y volvé a abrir esta pantalla.',
  'sin-camara': 'No encontramos una cámara en este celu.',
  invalida: 'Esta cámara ya no está vinculada a tu cuenta. Volvé a emparejarla desde Mimitos.',
  error: 'Algo falló con la cámara. Probá cerrar y volver a abrir esta pantalla.',
  detenida: 'Cámara apagada.',
  conectando: 'Conectando con la cámara de casa…',
  'en-vivo': 'En vivo',
  reconectando: 'Se cortó la conexión. Reconectando…',
  apagada: 'La cámara de casa no está prendida. Fijate que el celu tenga Mimitos abierto, wifi y batería.',
  ocupada: 'Ya la están mirando desde otra pantalla.',
  'otra-pantalla': 'Lo abriste en otra pantalla, así que acá se pausó.',
  fallo: 'No pudimos conectar en vivo desde esta red. Probá con el celu en el mismo wifi o más tarde.',
  'sin-acceso': 'Entrá con tu cuenta de Orbit para ver la cámara.',
  'no-disponible': 'El video en vivo todavía no está disponible para tu cuenta.',
  detenido: 'Video cerrado.',
};

async function call(action, body, keepalive) {
  let r;
  try {
    r = await fetch(API + action, { method: 'POST', credentials: 'same-origin', keepalive: Boolean(keepalive),
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  } catch { return { status: 0, data: {} }; }
  let data = {};
  try { data = await r.json(); } catch {}
  return { status: r.status, data };
}
const candJSON = c => ({ candidate: c.candidate, sdpMid: c.sdpMid, sdpMLineIndex: c.sdpMLineIndex });

/* junta candidatos y los manda de a tandas (menos pedidos) */
function iceSender(send) {
  let q = [], t = null;
  const flush = () => { t = null; if (!q.length) return; const batch = q; q = []; send(batch); };
  return { add(c) { q.push(candJSON(c)); if (!t) t = setTimeout(flush, 250); }, clear() { q = []; clearTimeout(t); t = null; } };
}
async function addIce(pc, list) {
  for (const c of list || []) { try { if (c.candidate) await pc.addIceCandidate(c); } catch (e) { console.warn('[mimitos-rtc] candidato ICE descartado', e && e.message); } }
}

/* ======================= lado cámara ======================= */
function startBroadcast({ camToken, onStatus = () => {}, audio = false, iceServers } = {}) {
  let stopped = false, stream = null, mic = null, pc = null, sid = null, since = 0, timer = null, wake = null, polls = 0, lastBeat = 0;
  let ice = iceServers || DEFAULT_ICE, wantAudio = Boolean(audio), sender = null;
  const status = (state, key = state) => { if (!stopped || state === 'detenida') onStatus({ state, message: MSG[key] }); };

  async function getVideo() {
    const s = await navigator.mediaDevices.getUserMedia({ video: VIDEO, audio: false });
    const tr = s.getVideoTracks()[0];
    try { tr.contentHint = 'motion'; } catch {}
    /* si el sistema corta la cámara (otra app, bloqueo), se vuelve a pedir */
    tr.onended = () => { if (!stopped) setTimeout(reacquire, 2000); };
    return s;
  }
  async function reacquire() {
    if (stopped) return;
    try {
      stream = await getVideo();
      const vs = pc && pc.getTransceivers().find(t => t.receiver.track.kind === 'video');
      if (vs) await vs.sender.replaceTrack(stream.getVideoTracks()[0]);
    } catch { status('error'); }
  }
  async function getMic() {
    const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
    return s.getAudioTracks()[0];
  }
  async function keepAwake() {
    try { if ('wakeLock' in navigator && document.visibilityState === 'visible') wake = await navigator.wakeLock.request('screen'); } catch {}
  }
  const onVis = () => { if (document.visibilityState === 'visible' && !stopped) keepAwake(); };

  function closePc() {
    if (sender) sender.clear();
    if (pc) { pc.onconnectionstatechange = null; pc.onicecandidate = null; try { pc.close(); } catch {} }
    pc = null; sid = null; since = 0; sender = null;
  }

  async function answer(newSid, offer, viewerIce) {
    closePc();
    sid = newSid;
    status('conectando', 'cam-conectando');
    const mySid = sid;
    pc = new RTCPeerConnection({ iceServers: ice });
    sender = iceSender(cands => { if (sid === mySid) call('ice', { token: camToken, sid: mySid, cands }); });
    pc.onicecandidate = e => { if (e.candidate) sender.add(e.candidate); };
    pc.onconnectionstatechange = () => {
      if (!pc || sid !== mySid) return;
      const s = pc.connectionState;
      if (s === 'connected') status('en-vivo', 'cam-en-vivo');
      else if (s === 'failed' || s === 'closed') { closePc(); status('esperando'); }
    };
    await pc.setRemoteDescription({ type: 'offer', sdp: offer });
    for (const t of pc.getTransceivers()) {
      const kind = t.receiver.track.kind;
      t.direction = 'sendonly';
      if (kind === 'video') {
        await t.sender.replaceTrack(stream.getVideoTracks()[0]);
        try {
          const p = t.sender.getParameters();
          p.encodings = p.encodings && p.encodings.length ? p.encodings : [{}];
          p.encodings[0].maxBitrate = MAX_BITRATE;
          p.encodings[0].maxFramerate = 15;
          p.degradationPreference = 'balanced';
          await t.sender.setParameters(p);
        } catch {}
      } else if (kind === 'audio') {
        await t.sender.replaceTrack(wantAudio && mic ? mic : null);
      }
    }
    const ans = await pc.createAnswer();
    await pc.setLocalDescription(ans);
    const r = await call('answer', { token: camToken, sid: mySid, sdp: pc.localDescription.sdp });
    if (r.status !== 200) { closePc(); status('esperando'); return; }
    await addIce(pc, viewerIce);
  }

  async function poll() {
    if (stopped) return;
    const beat = Date.now() - lastBeat > 20000;
    const r = await call('poll', { token: camToken, sid, since, beat });
    if (stopped) return;
    if (r.status === 401 || r.status === 404) { status('invalida'); stop(true); return; }
    if (r.status === 200) {
      if (beat) lastBeat = Date.now();
      const d = r.data;
      if (d.iceServers) ice = d.iceServers;
      try {
        if (d.sid && d.sid !== sid) { await answer(d.sid, d.offer, d.ice); since = d.next || 0; }
        else if (!d.sid && sid) { closePc(); status('esperando'); }
        else if (d.sid && pc) { await addIce(pc, d.ice); since = d.next || since; }
        else if (!d.sid && polls === 0) status('esperando');
      } catch (e) { console.warn('[mimitos-rtc] no se pudo responder la oferta', e); closePc(); status('esperando'); }
    }
    polls++;
    /* rápido mientras se negocia; lento cuando nadie mira o ya está conectado */
    const negotiating = pc && pc.connectionState !== 'connected';
    timer = setTimeout(poll, negotiating ? 1000 : 5000);
  }

  function stop(silent) {
    if (stopped) return;
    stopped = true;
    clearTimeout(timer);
    if (sid) call('hangup', { token: camToken, sid }, true);
    closePc();
    if (stream) stream.getTracks().forEach(t => t.stop());
    if (mic) mic.stop();
    try { wake && wake.release(); } catch {}
    document.removeEventListener('visibilitychange', onVis);
    if (!silent) status('detenida');
  }

  async function setAudio(on) {
    wantAudio = Boolean(on);
    if (wantAudio && !mic) {
      try { mic = await getMic(); } catch { wantAudio = false; return false; }
    }
    if (!wantAudio && mic) { mic.stop(); mic = null; }
    const at = pc && pc.getTransceivers().find(t => t.receiver.track.kind === 'audio');
    if (at) await at.sender.replaceTrack(wantAudio ? mic : null).catch(() => {});
    return wantAudio;
  }

  (async () => {
    status('preparando');
    try { stream = await getVideo(); }
    catch (e) {
      status(e && (e.name === 'NotAllowedError' || e.name === 'SecurityError') ? 'sin-permiso' : e && e.name === 'NotFoundError' ? 'sin-camara' : 'error');
      stopped = true; return;
    }
    if (wantAudio) await setAudio(true);
    keepAwake();
    document.addEventListener('visibilitychange', onVis);
    poll();
  })();

  return { stop: () => stop(false), setAudio, get stream() { return stream; } };
}

/* ======================= lado dueña ======================= */
function startViewer({ camId, videoEl, onStatus = () => {}, iceServers, takeover = true } = {}) {
  let stopped = false, pc = null, sid = null, since = 0, timer = null, deadline = null, dropTimer = null;
  let ice = iceServers || DEFAULT_ICE, answered = false, live = false, reported = false, attempts = 0, offline = 0, sender = null;
  const status = state => { if (!stopped || state === 'detenido') onStatus({ state, message: MSG[state] }); };

  function teardown(reason) {
    clearTimeout(timer); clearTimeout(deadline); clearTimeout(dropTimer);
    if (sender) sender.clear();
    if (sid) call('hangup', { camId, sid, reason }, true);
    if (pc) { pc.ontrack = null; pc.onconnectionstatechange = null; pc.onicecandidate = null; try { pc.close(); } catch {} }
    pc = null; sid = null; since = 0; answered = false; live = false; reported = false; sender = null;
  }

  function again(state) {
    teardown('viewer');
    if (stopped) return;
    attempts++;
    if (attempts > 5) { status('fallo'); return; }
    status(state);
    timer = setTimeout(connect, Math.min(2000 * 2 ** (attempts - 1), 15000));
  }

  async function connect() {
    if (stopped) return;
    status(attempts ? 'reconectando' : 'conectando');
    pc = new RTCPeerConnection({ iceServers: ice });
    const myPc = pc;
    /* los candidatos salen apenas se arma la oferta: se guardan hasta tener sid */
    const early = [];
    pc.onicecandidate = e => { if (e.candidate) (sender ? sender.add(e.candidate) : early.push(e.candidate)); };
    pc.addTransceiver('video', { direction: 'recvonly' });
    pc.addTransceiver('audio', { direction: 'recvonly' });
    /* un MediaStream por conexión: si se reusara, el video seguiría mostrando la pista vieja (terminada) */
    const ms = new MediaStream();
    pc.ontrack = e => {
      if (pc !== myPc) return;
      if (!ms.getTracks().includes(e.track)) ms.addTrack(e.track);
      if (videoEl.srcObject !== ms) videoEl.srcObject = ms;
      videoEl.play().catch(() => {});
    };
    pc.onconnectionstatechange = () => {
      if (pc !== myPc) return;
      const s = pc.connectionState;
      if (s === 'connected') {
        clearTimeout(deadline); clearTimeout(dropTimer);
        live = true; attempts = 0; offline = 0; status('en-vivo');
      } else if (s === 'disconnected') {
        /* a veces vuelve sola; si en 5 s no volvió, se renegocia */
        clearTimeout(dropTimer);
        dropTimer = setTimeout(() => { if (pc === myPc && pc.connectionState !== 'connected') again('reconectando'); }, 5000);
      } else if (s === 'failed') {
        if (live) again('reconectando'); else fail();
      }
    };
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    const r = await call('offer', { camId, sdp: pc.localDescription.sdp, takeover });
    if (stopped || pc !== myPc) return;
    if (r.status !== 200) {
      teardown('viewer');
      if (r.status === 409 && r.data.error === 'cam_offline') {
        status('apagada');
        /* se reintenta solo un rato (la dueña puede estar prendiendo la cámara) */
        if (++offline <= 15) timer = setTimeout(connect, 8000);
        return;
      }
      if (r.status === 409) { status('ocupada'); return; }
      if (r.status === 401 || r.status === 402 || r.status === 403) { status('sin-acceso'); return; }
      if (r.status === 404) { status('no-disponible'); return; }
      again('reconectando'); return;
    }
    sid = r.data.sid;
    if (r.data.iceServers) ice = r.data.iceServers;
    const mySid = sid;
    sender = iceSender(cands => { if (sid === mySid) call('ice', { camId, sid: mySid, cands }); });
    early.forEach(c => sender.add(c));
    deadline = setTimeout(() => { if (pc === myPc && !live) fail(); }, CONNECT_TIMEOUT);
    poll();
  }

  function fail() {
    console.warn('[mimitos-rtc] no conectó en vivo en 15 s (sin TURN)', { camId, ice: pc && pc.iceConnectionState });
    teardown('timeout');
    status('fallo');
  }

  async function poll() {
    if (stopped || !sid) return;
    const mySid = sid, myPc = pc;
    const r = await call('poll', { camId, sid, since, connected: live && !reported });
    if (stopped || sid !== mySid) return;
    if (r.status === 200) {
      const d = r.data;
      if (live) reported = true;
      if (d.ended) {
        if (d.reason === 'replaced') { teardown('viewer'); status('otra-pantalla'); return; }
        /* la cámara cortó o se perdió la sesión: si estaba en vivo, se reconecta */
        if (live || answered) { again('reconectando'); return; }
      }
      try {
        if (d.answer && !answered) { answered = true; await myPc.setRemoteDescription({ type: 'answer', sdp: d.answer }); }
        if (answered) { await addIce(myPc, d.ice); since = d.next || since; }
      } catch (e) { console.warn('[mimitos-rtc] respuesta inválida', e); }
    } else if (r.status === 401 || r.status === 403) { teardown('viewer'); status('sin-acceso'); return; }
    timer = setTimeout(poll, live ? 10000 : 1000);
  }

  videoEl.muted = true; videoEl.autoplay = true; videoEl.playsInline = true;
  videoEl.setAttribute('playsinline', '');
  const onHide = () => { if (sid) call('hangup', { camId, sid }, true); };
  window.addEventListener('pagehide', onHide);
  connect().catch(e => { console.warn('[mimitos-rtc]', e); fail(); });

  return {
    stop() { if (stopped) return; stopped = true; window.removeEventListener('pagehide', onHide); teardown('viewer'); try { videoEl.srcObject = null; } catch {} status('detenido'); },
    retry() { if (stopped) return; teardown('viewer'); attempts = 0; offline = 0; connect().catch(fail); },
    setMuted(m) { videoEl.muted = Boolean(m); if (!m) videoEl.play().catch(() => {}); },
  };
}

window.MZRTC = { startBroadcast, startViewer, MSG };
})();
