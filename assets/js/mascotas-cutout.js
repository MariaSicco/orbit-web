/* Mimitos · recorte de la mascota en el navegador (gratis, sin servidor). v3
   Cómo recorta (todo se baja recién cuando alguien sube una foto):
   1. DeepLabV3 de MediaPipe (Apache-2.0, 2,8 MB) dice DÓNDE está el perro o el gato (clases de Pascal VOC)
      y dónde hay una persona (para no recortar los brazos de quien lo tiene alzado).
   2. U²-Netp (Apache-2.0, 4,6 MB, servido desde /assets/models) da la SILUETA fina del sujeto principal,
      con onnxruntime-web (MIT) desde jsDelivr.
   3. Se cruzan las dos, se queda con la mancha más grande y se refinan los bordes con un guided filter
      sobre la foto original (pelo, orejas, patas), con un feather suave de ~2 px.
   4. Se recorta al rectángulo de la mascota con margen.
   "Tocá a tu mascota" (MagicTouch de MediaPipe, ~6,2 MB) queda como respaldo, con el mismo refinamiento.
   Expone window.MZCUT = { auto, touch, round, warm }. */
const V = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1';
const ORT = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/';
const M_AUTO = 'https://storage.googleapis.com/mediapipe-models/image_segmenter/deeplab_v3/float32/1/deeplab_v3.tflite';
const M_TOUCH = 'https://storage.googleapis.com/mediapipe-models/interactive_segmenter/magic_touch/float32/1/magic_touch.tflite';
const M_SAL = new URL('../models/u2netp.onnx', import.meta.url).href;
const OUT = 800, WORK = 1024, SAL = 256;
let lib = null, files = null, seg = null, inter = null, ort = null, sal = null;

async function base() {
  if (!lib) lib = await import(/* webpackIgnore: true */ V + '/vision_bundle.mjs');
  if (!files) files = await lib.FilesetResolver.forVisionTasks(V + '/wasm');
  return lib;
}
async function autoSeg() {
  await base();
  if (!seg) seg = await lib.ImageSegmenter.createFromOptions(files, { baseOptions: { modelAssetPath: M_AUTO, delegate: 'CPU' }, runningMode: 'IMAGE', outputCategoryMask: true, outputConfidenceMasks: true });
  return seg;
}
async function touchSeg() {
  await base();
  if (!inter) inter = await lib.InteractiveSegmenterLegacy.createFromOptions(files, { baseOptions: { modelAssetPath: M_TOUCH, delegate: 'CPU' }, outputCategoryMask: false, outputConfidenceMasks: true });
  return inter;
}
async function salSeg() {
  if (!ort) {
    const o = await import(/* webpackIgnore: true */ ORT + 'ort.wasm.min.mjs');
    o.env.wasm.wasmPaths = ORT; o.env.wasm.numThreads = 1; o.env.wasm.proxy = false;
    ort = o;
  }
  if (!sal) sal = await ort.InferenceSession.create(M_SAL, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
  return sal;
}
const loadImg = src => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; });
/* la imagen de trabajo, como mucho de 1024 px */
function canvasOf(img, max = WORK) {
  const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
  c.getContext('2d', { willReadFrequently: true }).drawImage(img, 0, 0, c.width, c.height); return c;
}

/* ---------- máscaras (Float32Array de 0 a 1) ---------- */
/* reescala bilineal de una máscara mw×mh a w×h */
function resize(m, mw, mh, w, h) {
  if (mw === w && mh === h) return m;
  const o = new Float32Array(w * h), sx = mw / w, sy = mh / h;
  for (let y = 0; y < h; y++) {
    const fy = Math.max(0, (y + .5) * sy - .5), y0 = Math.min(mh - 1, fy | 0), y1 = Math.min(mh - 1, y0 + 1), ty = fy - y0;
    for (let x = 0; x < w; x++) {
      const fx = Math.max(0, (x + .5) * sx - .5), x0 = Math.min(mw - 1, fx | 0), x1 = Math.min(mw - 1, x0 + 1), tx = fx - x0;
      const a = m[y0 * mw + x0] + (m[y0 * mw + x1] - m[y0 * mw + x0]) * tx, b = m[y1 * mw + x0] + (m[y1 * mw + x1] - m[y1 * mw + x0]) * tx;
      o[y * w + x] = a + (b - a) * ty;
    }
  }
  return o;
}
/* promedio en una caja de radio r (separable, O(n)) */
function box(src, w, h, r) {
  const t = new Float32Array(w * h), o = new Float32Array(w * h), d = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    const row = y * w; let s = 0;
    for (let x = -r; x <= r; x++) s += src[row + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      t[row + x] = s / d;
      s += src[row + Math.min(w - 1, x + r + 1)] - src[row + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let s = 0;
    for (let y = -r; y <= r; y++) s += t[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      o[y * w + x] = s / d;
      s += t[Math.min(h - 1, y + r + 1) * w + x] - t[Math.max(0, y - r) * w + x];
    }
  }
  return o;
}
/* dilata una máscara binaria (umbral th) r píxeles */
function grow(m, w, h, r, th = .5) {
  const b = new Float32Array(m.length); for (let i = 0; i < m.length; i++) b[i] = m[i] > th ? 1 : 0;
  const s = box(b, w, h, r); for (let i = 0; i < s.length; i++) s[i] = s[i] > 1e-4 ? 1 : 0; return s;
}
/* etiqueta las manchas (4-vecinos) de m > th: devuelve { lab, sizes } */
function label(m, w, h, th = .5) {
  const lab = new Int32Array(w * h), sizes = [0], stack = new Int32Array(w * h);
  let n = 0;
  for (let i = 0; i < w * h; i++) {
    if (m[i] <= th || lab[i]) continue;
    n++; let sp = 0, cnt = 0; stack[sp++] = i; lab[i] = n;
    while (sp) {
      const p = stack[--sp], x = p % w; cnt++;
      if (x > 0 && !lab[p - 1] && m[p - 1] > th) { lab[p - 1] = n; stack[sp++] = p - 1; }
      if (x < w - 1 && !lab[p + 1] && m[p + 1] > th) { lab[p + 1] = n; stack[sp++] = p + 1; }
      if (p >= w && !lab[p - w] && m[p - w] > th) { lab[p - w] = n; stack[sp++] = p - w; }
      if (p < w * (h - 1) && !lab[p + w] && m[p + w] > th) { lab[p + w] = n; stack[sp++] = p + w; }
    }
    sizes.push(cnt);
  }
  return { lab, sizes };
}
/* deja de m solo las manchas marcadas en keep[], con un margen de 3 px para no perder el borde suave */
function only(m, w, h, lab, keep) {
  const k = new Float32Array(w * h); let area = 0;
  for (let i = 0; i < w * h; i++) if (keep[lab[i]]) { k[i] = 1; area++; }
  const allow = grow(k, w, h, 3), out = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) out[i] = allow[i] ? m[i] : 0;
  return { mask: out, area };
}
/* se queda con la mancha más grande (y las que tengan al menos 25 % de su tamaño, por si una pata quedó separada) */
function largest(m, w, h, th = .5) {
  const { lab, sizes } = label(m, w, h, th);
  if (sizes.length < 2) return { mask: null, area: 0 };
  let big = 0; for (let k = 1; k < sizes.length; k++) if (sizes[k] > big) big = sizes[k];
  return only(m, w, h, lab, sizes.map((s, k) => k > 0 && s >= big * .25));
}
/* guided filter a color (He et al.), rápido: los coeficientes se calculan a la mitad del tamaño.
   Hace que el borde de la máscara siga los bordes reales de la foto: pelo, orejas, bigotes. */
function guided(rgba, p, w, h, r, eps) {
  const s = 2, sw = Math.ceil(w / s), sh = Math.ceil(h / s), n = sw * sh;
  const I = [new Float32Array(n), new Float32Array(n), new Float32Array(n)], P = new Float32Array(n);
  for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
    const i = y * sw + x, j = Math.min(h - 1, y * s) * w + Math.min(w - 1, x * s);
    I[0][i] = rgba[j * 4] / 255; I[1][i] = rgba[j * 4 + 1] / 255; I[2][i] = rgba[j * 4 + 2] / 255; P[i] = p[j];
  }
  const R = Math.max(1, Math.round(r / s)), mul = (a, b) => { const o = new Float32Array(n); for (let i = 0; i < n; i++) o[i] = a[i] * b[i]; return o; };
  const mI = I.map(c => box(c, sw, sh, R)), mP = box(P, sw, sh, R), mIP = I.map(c => box(mul(c, P), sw, sh, R));
  const vrr = box(mul(I[0], I[0]), sw, sh, R), vrg = box(mul(I[0], I[1]), sw, sh, R), vrb = box(mul(I[0], I[2]), sw, sh, R),
    vgg = box(mul(I[1], I[1]), sw, sh, R), vgb = box(mul(I[1], I[2]), sw, sh, R), vbb = box(mul(I[2], I[2]), sw, sh, R);
  const A = [new Float32Array(n), new Float32Array(n), new Float32Array(n)], B = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const r0 = mI[0][i], g0 = mI[1][i], b0 = mI[2][i], pm = mP[i];
    const cr = mIP[0][i] - r0 * pm, cg = mIP[1][i] - g0 * pm, cb = mIP[2][i] - b0 * pm;
    const a11 = vrr[i] - r0 * r0 + eps, a12 = vrg[i] - r0 * g0, a13 = vrb[i] - r0 * b0,
      a22 = vgg[i] - g0 * g0 + eps, a23 = vgb[i] - g0 * b0, a33 = vbb[i] - b0 * b0 + eps;
    const i11 = a22 * a33 - a23 * a23, i12 = a13 * a23 - a12 * a33, i13 = a12 * a23 - a13 * a22,
      i22 = a11 * a33 - a13 * a13, i23 = a12 * a13 - a11 * a23, i33 = a11 * a22 - a12 * a12;
    const det = a11 * i11 + a12 * i12 + a13 * i13;
    const ar = (cr * i11 + cg * i12 + cb * i13) / det, ag = (cr * i12 + cg * i22 + cb * i23) / det, ab = (cr * i13 + cg * i23 + cb * i33) / det;
    A[0][i] = ar; A[1][i] = ag; A[2][i] = ab; B[i] = pm - ar * r0 - ag * g0 - ab * b0;
  }
  const mA = A.map(c => resize(box(c, sw, sh, R), sw, sh, w, h)), mB = resize(box(B, sw, sh, R), sw, sh, w, h);
  const q = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const v = (mA[0][i] * rgba[i * 4] + mA[1][i] * rgba[i * 4 + 1] + mA[2][i] * rgba[i * 4 + 2]) / 255 + mB[i];
    q[i] = v < 0 ? 0 : v > 1 ? 1 : v;
  }
  return q;
}
/* refinamiento: mancha más grande + guided filter + corte de la bruma. Devuelve la máscara final o null */
function refine(c, m, opts = {}) {
  const w = c.width, h = c.height;
  const big = largest(m, w, h);
  if (!big.mask || big.area < w * h * .02) return null;
  if (opts.guided === false) return big.mask;
  const rgba = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
  const r = Math.max(4, Math.round(Math.max(w, h) / (opts.rdiv || 110)));
  const q = guided(rgba, big.mask, w, h, r, opts.eps || 1e-3);
  /* solo cerca de la mascota (el filtro no puede inventar manchas lejos) */
  const zone = grow(big.mask, w, h, r * 2, .3);
  for (let i = 0; i < q.length; i++) q[i] = zone[i] ? Math.max(0, Math.min(1, (q[i] - .06) / .86)) : 0;
  return q;
}
/* arma el PNG/WebP con transparencia a partir de la máscara final (del tamaño de c) */
function compose(c, alpha, opts = {}) {
  const w = c.width, h = c.height;
  const m = document.createElement('canvas'); m.width = w; m.height = h;
  const mc = m.getContext('2d'), md = mc.createImageData(w, h);
  let x0 = w, y0 = h, x1 = 0, y1 = 0, on = 0;
  for (let i = 0; i < w * h; i++) {
    const a = alpha[i];
    md.data[i * 4 + 3] = Math.round(a * 255);
    if (a > .5) { on++; const x = i % w, y = (i / w) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (on < w * h * .02) return null;
  mc.putImageData(md, 0, 0);
  /* feather: el borde se suaviza ~2 px a la escala final */
  const f = opts.feather ?? Math.max(.8, Math.max(w, h) / OUT);
  const soft = document.createElement('canvas'); soft.width = w; soft.height = h;
  const sc = soft.getContext('2d'); sc.filter = `blur(${f}px)`; sc.drawImage(m, 0, 0); sc.filter = 'none';
  sc.globalCompositeOperation = 'source-in'; sc.drawImage(c, 0, 0, w, h);
  /* recorte ajustado al rectángulo de la mascota, con 4 % de margen */
  const pad = Math.round(Math.max(x1 - x0, y1 - y0) * .04);
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(h - 1, y1 + pad);
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1, s = Math.min(1, OUT / Math.max(bw, bh));
  const o = document.createElement('canvas'); o.width = Math.round(bw * s); o.height = Math.round(bh * s);
  o.getContext('2d').drawImage(soft, x0, y0, bw, bh, 0, 0, o.width, o.height);
  return encode(o);
}
/* WebP con transparencia si el navegador lo sabe hacer; si no, PNG. Si pesa mucho, se achica. */
function encode(c) {
  for (let i = 0; i < 4; i++) {
    let d = c.toDataURL('image/webp', .86);
    if (!d.startsWith('data:image/webp')) d = c.toDataURL('image/png');
    if (d.length < 430 * 1024) return d;
    const n = document.createElement('canvas'); n.width = Math.round(c.width * .8); n.height = Math.round(c.height * .8);
    n.getContext('2d').drawImage(c, 0, 0, n.width, n.height); c = n;
  }
  return c.toDataURL('image/png');
}
const t0 = () => performance.now();

/* DeepLab: probabilidad de perro/gato y de persona, al tamaño de c */
async function pets(c) {
  const s = await autoSeg();
  const labels = s.getLabels().map(x => String(x).toLowerCase());
  const want = ['dog', 'cat'].map(n => labels.indexOf(n)).filter(i => i >= 0), person = labels.indexOf('person');
  let out = null;
  await new Promise(ok => s.segment(c, r => {
    const mw = r.confidenceMasks[0].width, mh = r.confidenceMasks[0].height, pet = new Float32Array(mw * mh);
    for (const k of want) { const a = r.confidenceMasks[k].getAsFloat32Array(); for (let i = 0; i < a.length; i++) pet[i] = Math.max(pet[i], a[i]); }
    const per = person >= 0 ? Float32Array.from(r.confidenceMasks[person].getAsFloat32Array()) : new Float32Array(mw * mh);
    const cat = r.categoryMask.getAsUint8Array(), count = {}; let hit = 0;
    for (let i = 0; i < cat.length; i++) if (want.includes(cat[i])) { hit++; count[cat[i]] = (count[cat[i]] || 0) + 1; }
    const best = Object.keys(count).sort((a, b) => count[b] - count[a])[0];
    out = { pet: resize(pet, mw, mh, c.width, c.height), person: resize(per, mw, mh, c.width, c.height), hit: hit / cat.length, label: best != null ? labels[best] : '' };
    r.close?.(); ok();
  }));
  return out;
}
/* U²-Netp: silueta del sujeto principal, al tamaño de c.
   Corre con el lado largo en SAL px respetando la proporción (múltiplos de 32): menos píxeles que el cuadrado
   de 320 de siempre y sin deformar a la mascota. */
async function saliency(c, L = SAL) {
  const s = await salSeg(), k = L / Math.max(c.width, c.height);
  const sw = Math.max(64, Math.round(c.width * k / 32) * 32), sh = Math.max(64, Math.round(c.height * k / 32) * 32), n = sw * sh;
  const t = document.createElement('canvas'); t.width = sw; t.height = sh;
  const x = t.getContext('2d', { willReadFrequently: true }); x.drawImage(c, 0, 0, sw, sh);
  const d = x.getImageData(0, 0, sw, sh).data, inp = new Float32Array(3 * n);
  let mx = 1; for (let i = 0; i < n * 4; i++) if ((i & 3) !== 3 && d[i] > mx) mx = d[i];
  const mean = [.485, .456, .406], std = [.229, .224, .225];
  for (let i = 0; i < n; i++) for (let j = 0; j < 3; j++) inp[j * n + i] = (d[i * 4 + j] / mx - mean[j]) / std[j];
  const res = await s.run({ [s.inputNames[0]]: new ort.Tensor('float32', inp, [1, 3, sh, sw]) }), o = res[s.outputNames[0]].data;
  let lo = Infinity, hi = -Infinity; for (let i = 0; i < n; i++) { if (o[i] < lo) lo = o[i]; if (o[i] > hi) hi = o[i]; }
  const m = new Float32Array(n); for (let i = 0; i < n; i++) m[i] = (o[i] - lo) / ((hi - lo) || 1);
  for (const r in res) res[r].dispose?.();
  return resize(m, sw, sh, c.width, c.height);
}
/* cruza las dos. U²-Netp manda en la forma; DeepLab decide cuál de sus manchas es la mascota:
   - nada lejos del perro o gato que ve DeepLab;
   - se borra lo que DeepLab ve como persona, pero solo fuera de la zona de la mascota (la cara y el torso
     de quien la alza) y solo si la mascota se ve clara: a los perros negros DeepLab a veces los confunde con personas;
   - quedan solo las manchas de U²-Netp que se superponen con la mascota.
   Si U²-Netp no encontró nada que coincida, queda la máscara de DeepLab. */
function fuse(c, p, s) {
  const w = c.width, h = c.height, n = w * h, d = Math.max(w, h), m = new Float32Array(n);
  const near = grow(p.pet, w, h, Math.round(d * .1), .15), core = grow(p.pet, w, h, Math.round(d * .025), .5);
  /* si DeepLab ve mucha más "persona" que mascota, lo más probable es que la mascota sea la "persona" (pasa con perros negros) */
  let petA = 0, perA = 0; for (let i = 0; i < n; i++) { if (p.pet[i] > .5) petA++; if (p.person[i] > .5) perA++; }
  const cut = petA >= perA * .25;
  for (let i = 0; i < n; i++) m[i] = !near[i] || (cut && p.person[i] > .5 && (!core[i] || (p.person[i] > .8 && p.pet[i] < .1))) ? 0 : s[i];
  const { lab, sizes } = label(m, w, h), hit = new Float32Array(sizes.length);
  let petArea = 0;
  for (let i = 0; i < n; i++) if (p.pet[i] > .2) { petArea++; if (lab[i]) hit[lab[i]]++; }
  const keep = sizes.map((z, k) => k > 0 && (hit[k] >= petArea * .15 || hit[k] >= z * .3));
  return keep.some(Boolean) ? only(m, w, h, lab, keep).mask : p.pet;
}

/* recorte automático: devuelve { found, png, label, ms, loadMs }.
   opts.mode es solo para comparar en pruebas: 'fusion' (el de la app), 'deeplab', 'u2netp' o 'legacy' (el de antes) */
async function auto(dataUrl, opts = {}) {
  const mode = opts.mode || 'fusion', start = t0();
  await Promise.all([autoSeg(), mode === 'fusion' || mode === 'u2netp' ? salSeg() : null]);
  const loadMs = Math.round(t0() - start), img = await loadImg(dataUrl), c = canvasOf(img);
  const p = await pets(c), done = o => ({ ...o, ms: Math.round(t0() - start), loadMs, hit: Math.round(p.hit * 1000) / 10 });
  if (p.hit < (mode === 'fusion' ? .004 : .02) && mode !== 'u2netp') return done({ found: false });
  let png = null;
  if (mode === 'legacy') png = compose(c, p.pet.map(v => Math.max(0, Math.min(1, (v - .35) / .3))), { feather: 1.2 });
  else {
    const m = mode === 'deeplab' ? p.pet : mode === 'u2netp' ? await saliency(c, opts.sal) : fuse(c, p, await saliency(c, opts.sal));
    const q = refine(c, m, opts);
    if (q) png = compose(c, q);
  }
  return done(png ? { found: true, png, label: p.label } : { found: false });
}
/* "tocá a tu mascota": x e y van de 0 a 1 sobre la foto */
async function touch(dataUrl, x, y) {
  const start = t0();
  const s = await touchSeg(), img = await loadImg(dataUrl), c = canvasOf(img);
  let m = null;
  await new Promise(ok => s.segment(c, { keypoint: { x, y } }, r => {
    const k = r.confidenceMasks?.[0];
    if (k) m = resize(Float32Array.from(k.getAsFloat32Array()), k.width, k.height, c.width, c.height);
    r.close?.(); ok();
  }));
  const q = m && refine(c, m), png = q ? compose(c, q) : null;
  return { found: Boolean(png), png, ms: Math.round(t0() - start) };
}
/* plan C: recorte redondo y centrado */
async function round(dataUrl) {
  const img = await loadImg(dataUrl), s = Math.min(img.naturalWidth, img.naturalHeight), n = Math.min(OUT, s);
  const c = document.createElement('canvas'); c.width = c.height = n; const x = c.getContext('2d');
  x.beginPath(); x.arc(n / 2, n / 2, n / 2, 0, Math.PI * 2); x.clip();
  x.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, n, n);
  return encode(c);
}
/* se puede llamar apenas la persona toca "Elegir foto", para ganar tiempo */
const warm = () => Promise.all([autoSeg(), salSeg()]).catch(() => {});
window.MZCUT = { auto, touch, round, warm };
