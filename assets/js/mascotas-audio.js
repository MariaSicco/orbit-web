/* Mimitos · Modo Me fui · detección de sonidos en el celu que queda en casa. v1
   Escucha el micrófono y reconoce ladridos, aullidos, maullidos, gemidos y llanto EN EL DISPOSITIVO.
   El audio nunca sale del navegador: hacia afuera solo van el tipo, la hora, la duración y la confianza.

   Cómo funciona:
   1. getUserMedia (solo audio, sin cancelación de eco ni supresión de ruido, que apagan los ladridos).
   2. Un AudioWorklet (este mismo archivo) junta las muestras; si no hay, ScriptProcessor de respaldo.
   3. Cada ~1 s toma la última ventana de 0,975 s. Si está en silencio, no corre el modelo (ahorra CPU).
      Si hay sonido, corre YAMNet (Google, Apache-2.0, 4,1 MB, servido desde /assets/models/audio)
      con MediaPipe Tasks Audio (Apache-2.0, wasm desde jsDelivr), en CPU.
   4. Las clases de AudioSet se mapean a nuestros 5 tipos (mapScores) y se comparan con el umbral
      de la sensibilidad elegida.
   5. Los fragmentos del mismo tipo se agrupan en un episodio; el episodio se cierra después de
      ~10 s sin ese sonido y recién ahí se avisa con onEvent.
   6. Si la pestaña pasa a segundo plano, pausa y avisa (onState); al volver, reanuda.

   API (ES module):
     isSupported() -> boolean
     loadModel() -> Promise  (precarga wasm + modelo; se puede llamar antes de pedir el micrófono)
     startListening({ onEvent, onLevel, onState, sensitivity: 'baja'|'media'|'alta' }) -> Promise<{ stop, pause, resume, state, track }>
       onEvent({ type, start, end, durationSec, confidence, hits })   start/end en ms epoch
       onLevel(rms)   0..1, ~10 veces por segundo, para el vúmetro
       onState({ state: 'escuchando'|'pausado'|'detenido', reason, message })
     Errores de startListening: Error con .code 'no-soportado' | 'permiso-denegado' | 'sin-microfono' | 'modelo'.
   También expone window.MZAUDIO con lo mismo. */

const MP = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-audio@1.0.1';
// Ojo: en el AudioWorkletGlobalScope no existe URL, así que la ruta local se arma recién en loadModel().
const modelLocal = () => new URL('../models/audio/yamnet.tflite', import.meta.url).href;
const MODEL_CDN = 'https://storage.googleapis.com/mediapipe-models/audio_classifier/yamnet/float32/1/yamnet.tflite';

export const TYPES = ['ladrido', 'aullido', 'maullido', 'gemido', 'llanto'];
export const GAP_MS = 10000;       // silencio de ese tipo que cierra el episodio
export const HOP_SEC = 1;          // cada cuánto se analiza
export const WIN_SEC = 0.975;      // ventana de YAMNet (15600 muestras a 16 kHz)

/* Umbrales por sensibilidad, elegidos con las pruebas de audio (ver test/mascotas-audio.test.mjs).
   gate: RMS mínimo para correr el modelo. th: puntaje mínimo por tipo. minHits: ventanas con sonido
   para que un episodio cuente. */
export const SENS = {
  baja:  { gate: 0.003, minHits: 2, th: { ladrido: 0.45, aullido: 0.35, maullido: 0.40, gemido: 0.18, llanto: 0.35 } },
  media: { gate: 0.002, minHits: 1, th: { ladrido: 0.25, aullido: 0.20, maullido: 0.20, gemido: 0.12, llanto: 0.20 } },
  alta:  { gate: 0.002, minHits: 1, th: { ladrido: 0.15, aullido: 0.12, maullido: 0.12, gemido: 0.10, llanto: 0.12 } },
};

/* Clases de AudioSet (nombres exactos de YAMNet) que mira el módulo. */
export const LABELS = [
  'Dog', 'Bark', 'Yip', 'Howl', 'Bow-wow', 'Growling', 'Whimper (dog)', 'Canidae, dogs, wolves',
  'Cat', 'Purr', 'Meow', 'Hiss', 'Caterwaul',
  'Crying, sobbing', 'Baby cry, infant cry', 'Whimper', 'Wail, moan',
  'Animal', 'Domestic animals, pets',
  'Speech', 'Music', 'Television',
];

const g = (s, k) => (s && typeof s[k] === 'number' ? s[k] : 0);

/* Puntajes de AudioSet ({ etiqueta: 0..1 }) -> puntaje 0..1 de cada tipo de Mimitos.
   - ladrido: Bark/Yip/Bow-wow/Growling; "Dog" solo, sin otra pista, cuenta como ladrido atenuado.
   - aullido: Howl (y "Wail, moan" si hay contexto de perro).
   - maullido: Meow/Caterwaul; "Cat" solo atenuado; Hiss solo si hay contexto de gato.
   - gemido: Whimper (dog); "Whimper" genérico solo con contexto de perro o mascota.
   - llanto: Crying/Baby cry/Wail con contexto de animal; sin contexto vale la mitad (TV, bebés).
   El ronroneo (Purr) no es una alerta: no se mapea. */
export function mapScores(s) {
  const dogCtx = Math.max(g(s, 'Dog'), g(s, 'Canidae, dogs, wolves'));
  const catCtx = g(s, 'Cat');
  const petCtx = Math.max(dogCtx, catCtx, g(s, 'Domestic animals, pets'), g(s, 'Animal'));
  const barkSpecific = Math.max(g(s, 'Bark'), g(s, 'Yip'), g(s, 'Bow-wow'), g(s, 'Growling'));
  const howl = Math.max(g(s, 'Howl'), dogCtx >= 0.15 ? g(s, 'Wail, moan') * 0.8 : 0);
  const whimper = Math.max(g(s, 'Whimper (dog)'), petCtx >= 0.1 ? g(s, 'Whimper') : 0);
  const otherDog = Math.max(howl, whimper);
  const ladrido = Math.max(barkSpecific, otherDog < 0.1 ? dogCtx * 0.7 : 0);
  const meow = Math.max(g(s, 'Meow'), g(s, 'Caterwaul'));
  const maullido = Math.max(meow, catCtx * 0.7, catCtx >= 0.1 ? g(s, 'Hiss') * 0.8 : 0);
  const cry = Math.max(g(s, 'Crying, sobbing'), g(s, 'Baby cry, infant cry'), g(s, 'Wail, moan') * 0.8);
  const llanto = cry * (petCtx >= 0.05 ? 1 : 0.5);
  return { ladrido, aullido: howl, maullido, gemido: whimper, llanto };
}

/* Del puntaje de cada tipo a las detecciones de la ventana, según la sensibilidad. */
export function detect(mapped, sensitivity = 'media') {
  const cfg = SENS[sensitivity] || SENS.media;
  const out = [];
  for (const t of TYPES) if (mapped[t] >= cfg.th[t]) out.push({ type: t, confidence: mapped[t] });
  return out;
}

/* Agrupa ventanas en episodios por tipo. add() por cada detección; tick(ahora) cierra los episodios
   con más de gapMs sin ese sonido; flush() cierra todo (al parar o pausar). */
export function createEpisodeTracker({ gapMs = GAP_MS, minHits = 1, onEvent = () => {} } = {}) {
  const open = new Map();
  const close = (type) => {
    const e = open.get(type);
    open.delete(type);
    if (!e || e.hits < minHits) return;
    onEvent({
      type, start: e.start, end: e.end,
      durationSec: Math.max(0, Math.round((e.end - e.start) / 100) / 10),
      confidence: Math.round(e.confidence * 100) / 100,
      hits: e.hits,
    });
  };
  return {
    add(type, confidence, start, end) {
      const e = open.get(type);
      if (e && start - e.end < gapMs) {
        e.end = Math.max(e.end, end); e.hits++; e.confidence = Math.max(e.confidence, confidence);
      } else {
        if (e) close(type);
        open.set(type, { start, end, hits: 1, confidence });
      }
    },
    tick(now) { for (const [type, e] of [...open]) if (now - e.end >= gapMs) close(type); },
    flush() { for (const type of [...open.keys()]) close(type); },
    get open() { return open.size; },
  };
}

export function rms(buf, from = 0, to = buf.length) {
  let s = 0;
  for (let i = from; i < to; i++) s += buf[i] * buf[i];
  return to > from ? Math.sqrt(s / (to - from)) : 0;
}

/* ---------- Navegador ---------- */

const hasWindow = typeof window !== 'undefined' && typeof document !== 'undefined';

export function isSupported() {
  if (!hasWindow) return false;
  const AC = window.AudioContext || window.webkitAudioContext;
  return !!(window.isSecureContext && navigator.mediaDevices && navigator.mediaDevices.getUserMedia && AC && typeof WebAssembly === 'object');
}

let modelP = null;
export function loadModel() {
  if (!modelP) {
    modelP = (async () => {
      const lib = await import(/* webpackIgnore: true */ MP + '/audio_bundle.mjs');
      const files = await lib.FilesetResolver.forAudioTasks(MP + '/wasm');
      const opts = (path) => ({ baseOptions: { modelAssetPath: path, delegate: 'CPU' }, maxResults: -1, scoreThreshold: 0, categoryAllowlist: LABELS });
      try { return await lib.AudioClassifier.createFromOptions(files, opts(modelLocal())); }
      catch (e) { return await lib.AudioClassifier.createFromOptions(files, opts(MODEL_CDN)); }
    })();
    modelP.catch(() => { modelP = null; });
  }
  return modelP;
}

function fail(code, message, cause) {
  const e = new Error(message);
  e.code = code; if (cause) e.cause = cause;
  return e;
}

/* Corre YAMNet sobre la ventana y devuelve { etiqueta: puntaje máximo }. */
function classify(clf, samples, sampleRate) {
  const res = clf.classify(samples, sampleRate) || [];
  const s = {};
  for (const r of res) for (const c of (r.classifications && r.classifications[0] ? r.classifications[0].categories : [])) {
    const k = c.categoryName || c.displayName;
    if (!(k in s) || c.score > s[k]) s[k] = c.score;
  }
  return s;
}

const MSG = {
  pausaFondo: 'Pausamos la escucha porque Mimitos quedó en segundo plano. Volvé a esta pantalla para seguir escuchando.',
  sigue: 'Escuchando de nuevo.',
  micCortado: 'El micrófono se cortó. Tocá "Empezar" para volver a escuchar.',
};

export async function startListening({ onEvent = () => {}, onLevel = () => {}, onState = () => {}, sensitivity = 'media', _onFrame } = {}) {
  if (!isSupported()) throw fail('no-soportado', 'Este navegador no puede escuchar el micrófono. Probá con Chrome o Safari actualizados.');
  const cfg = SENS[sensitivity] || SENS.media;

  let clf;
  const modelLoading = loadModel();
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 }, video: false });
  } catch (e) {
    const n = e && e.name;
    if (n === 'NotAllowedError' || n === 'SecurityError') throw fail('permiso-denegado', 'No nos diste permiso para usar el micrófono. Habilitalo en los permisos del navegador y probá de nuevo.', e);
    throw fail('sin-microfono', 'No encontramos un micrófono disponible en este dispositivo.', e);
  }
  try { clf = await modelLoading; }
  catch (e) { stream.getTracks().forEach((t) => t.stop()); throw fail('modelo', 'No pudimos cargar el detector de sonidos. Revisá la conexión y probá de nuevo.', e); }

  const AC = window.AudioContext || window.webkitAudioContext;
  const ctx = new AC();
  const sr = ctx.sampleRate;
  const win = Math.round(WIN_SEC * sr), hop = Math.round(HOP_SEC * sr);
  const ring = new Float32Array(win);
  const frame = new Float32Array(win);
  let wpos = 0, filled = 0, sinceHop = 0, levelAcc = 0, levelN = 0, lastLevel = 0;
  let state = 'escuchando', stopped = false;

  const tracker = createEpisodeTracker({ gapMs: GAP_MS, minHits: cfg.minHits, onEvent: (ev) => { try { onEvent(ev); } catch (e) { console.error(e); } } });
  const setState = (st, reason, message) => { state = st; try { onState({ state: st, reason, message }); } catch (e) { console.error(e); } };

  function analyze() {
    const now = Date.now();
    // copia ordenada de la ventana circular
    const head = ring.subarray(wpos), tail = ring.subarray(0, wpos);
    frame.set(head, 0); frame.set(tail, head.length);
    const level = rms(frame);
    let mapped = null, scores = null, ms = 0;
    if (level >= cfg.gate) {
      const t0 = performance.now();
      try { scores = classify(clf, frame, sr); } catch (e) { console.error(e); }
      ms = performance.now() - t0;
      if (scores) {
        mapped = mapScores(scores);
        for (const d of detect(mapped, sensitivity)) tracker.add(d.type, d.confidence, now - WIN_SEC * 1000, now);
      }
    }
    tracker.tick(now);
    if (_onFrame) try { _onFrame({ t: now, rms: level, ms, scores, mapped }); } catch (e) { /* solo pruebas */ }
  }

  function push(chunk) {
    if (stopped || state !== 'escuchando') return;
    for (let i = 0; i < chunk.length; i++) {
      const v = chunk[i];
      ring[wpos] = v; wpos = (wpos + 1) % win;
      levelAcc += v * v; levelN++;
    }
    filled = Math.min(win, filled + chunk.length);
    sinceHop += chunk.length;
    if (levelN >= sr / 10) {
      lastLevel = Math.sqrt(levelAcc / levelN); levelAcc = 0; levelN = 0;
      try { onLevel(lastLevel); } catch (e) { console.error(e); }
    }
    if (sinceHop >= hop && filled >= win) { sinceHop = 0; analyze(); }
  }

  const src = ctx.createMediaStreamSource(stream);
  const sink = ctx.createGain(); sink.gain.value = 0; sink.connect(ctx.destination);
  let node = null;
  try {
    await ctx.audioWorklet.addModule(import.meta.url);
    node = new AudioWorkletNode(ctx, 'mz-audio-tap', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
    node.port.onmessage = (e) => push(e.data);
  } catch (e) {
    node = ctx.createScriptProcessor(4096, 1, 1);
    node.onaudioprocess = (ev) => push(ev.inputBuffer.getChannelData(0));
  }
  src.connect(node); node.connect(sink);
  if (ctx.state === 'suspended') { try { await ctx.resume(); } catch (e) { /* lo reintenta resume() */ } }

  async function pause(reason = 'manual', message) {
    if (stopped || state === 'pausado') return;
    tracker.flush();
    try { await ctx.suspend(); } catch (e) { /* nada */ }
    setState('pausado', reason, message);
  }
  async function resume() {
    if (stopped || state === 'escuchando') return;
    const track = stream.getAudioTracks()[0];
    if (!track || track.readyState === 'ended') { cleanup(); setState('detenido', 'microfono', MSG.micCortado); return; }
    try { await ctx.resume(); } catch (e) { /* nada */ }
    wpos = 0; filled = 0; sinceHop = 0;
    setState('escuchando', 'reanudado', MSG.sigue);
  }
  const onVis = () => { if (document.visibilityState === 'hidden') pause('segundo-plano', MSG.pausaFondo); else if (state === 'pausado') resume(); };
  document.addEventListener('visibilitychange', onVis);
  const track = stream.getAudioTracks()[0];
  const onEnded = () => { if (!stopped) { tracker.flush(); cleanup(); setState('detenido', 'microfono', MSG.micCortado); } };
  if (track) track.addEventListener('ended', onEnded);

  function cleanup() {
    if (stopped) return;
    stopped = true;
    document.removeEventListener('visibilitychange', onVis);
    if (track) track.removeEventListener('ended', onEnded);
    try { node.port && (node.port.onmessage = null); node.onaudioprocess = null; src.disconnect(); node.disconnect(); } catch (e) { /* nada */ }
    stream.getTracks().forEach((t) => t.stop());
    ctx.close().catch(() => {});
  }

  setState('escuchando', 'inicio');
  if (document.visibilityState === 'hidden') pause('segundo-plano', MSG.pausaFondo);

  return {
    stop() { if (stopped) return; tracker.flush(); cleanup(); setState('detenido', 'manual'); },
    pause: () => pause('manual'),
    resume,
    get state() { return state; },
    get sampleRate() { return sr; },
    /* la pista del micrófono, para compartirla con el video en vivo (mascotas-rtc.js la clona) */
    get track() { return stopped ? null : (stream.getAudioTracks()[0] || null); },
  };
}

/* ---------- AudioWorklet: este mismo archivo se carga como módulo del worklet ---------- */
if (typeof registerProcessor === 'function' && typeof AudioWorkletProcessor === 'function') {
  registerProcessor('mz-audio-tap', class extends AudioWorkletProcessor {
    constructor() { super(); this.buf = new Float32Array(2048); this.n = 0; }
    process(inputs) {
      const ch = inputs[0] && inputs[0][0];
      if (ch) {
        for (let i = 0; i < ch.length; i++) {
          this.buf[this.n++] = ch[i];
          if (this.n === this.buf.length) { this.port.postMessage(this.buf, [this.buf.buffer]); this.buf = new Float32Array(2048); this.n = 0; }
        }
      }
      return true;
    }
  });
}

if (hasWindow) window.MZAUDIO = { isSupported, loadModel, startListening, TYPES, SENS };
