/* Mimitos · recorte de la mascota en el navegador (gratis, sin servidor). v4
   Cómo recorta (todo se baja recién cuando alguien sube una foto):
   1. DeepLabV3 de MediaPipe (Apache-2.0, 2,8 MB) dice DÓNDE está el perro o el gato (clases de Pascal VOC)
      y dónde hay una persona (para no recortar los brazos de quien lo tiene alzado).
   2. U²-Netp (Apache-2.0, 4,6 MB, servido desde /assets/models) da la SILUETA fina. v4: corre dos veces, sobre
      la foto entera y sobre el rectángulo de la mascota (más resolución donde importa: pelo, orejas, patas).
   3. Se cruzan, se queda SOLO con la mancha más grande (sin islas sueltas) y se tapan los agujeritos.
   4. Bordes: guided filter con radio según el tamaño de la mascota y más ancho donde hay pelo (textura),
      feather suave y "decontaminación": el color del borde se recalcula restando el fondo estimado, así no
      queda el halo verde del pasto o gris del sillón.
   5. Control de calidad: si la máscara cubre menos del 8 % o más del 92 % de la foto, si el borde es muy
      ruidoso o si quedó partida, no se entrega un recorte feo: se devuelve un recorte redondo y prolijo
      centrado en la mascota (fallback: 'round').
   "Tocá a tu mascota" (MagicTouch de MediaPipe, ~6,2 MB) queda como respaldo, con el mismo refinamiento.
   Expone window.MZCUT = { auto, touch, round, warm, quality }. */
const V = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1';
const ORT = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/';
const M_AUTO = 'https://storage.googleapis.com/mediapipe-models/image_segmenter/deeplab_v3/float32/1/deeplab_v3.tflite';
const M_TOUCH = 'https://storage.googleapis.com/mediapipe-models/interactive_segmenter/magic_touch/float32/1/magic_touch.tflite';
const M_SAL = new URL('../models/u2netp.onnx', import.meta.url).href;
const OUT = 800, WORK = 1024, SAL = 320;
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
/* se queda solo con la mancha más grande (las islas sueltas eran pasto, almohadones o sombras) */
function largest(m, w, h, th = .5) {
  const { lab, sizes } = label(m, w, h, th);
  if (sizes.length < 2) return { mask: null, area: 0, rest: 0 };
  let big = 0, k0 = 0, tot = 0; for (let k = 1; k < sizes.length; k++) { tot += sizes[k]; if (sizes[k] > big) { big = sizes[k]; k0 = k; } }
  const r = only(m, w, h, lab, sizes.map((s, k) => k === k0));
  return { ...r, rest: tot ? (tot - big) / tot : 0 };
}
/* tapa los agujeros chicos dentro de la mascota (manchas de fondo que no tocan el borde y miden < 0,6 % de ella) */
function fillHoles(m, w, h, area) {
  const inv = new Float32Array(w * h); for (let i = 0; i < w * h; i++) inv[i] = m[i] > .5 ? 0 : 1;
  const { lab, sizes } = label(inv, w, h), edge = new Uint8Array(sizes.length);
  for (let x = 0; x < w; x++) { edge[lab[x]] = 1; edge[lab[(h - 1) * w + x]] = 1; }
  for (let y = 0; y < h; y++) { edge[lab[y * w]] = 1; edge[lab[y * w + w - 1]] = 1; }
  const out = Float32Array.from(m);
  for (let i = 0; i < w * h; i++) { const k = lab[i]; if (k && !edge[k] && sizes[k] < area * .006) out[i] = 1; }
  return out;
}
/* rectángulo de lo que supera th, con margen pad (proporción del lado mayor) */
function bboxOf(m, w, h, th = .5, pad = .12) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (m[y * w + x] > th) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return null;
  const p = Math.round(Math.max(x1 - x0, y1 - y0) * pad);
  x0 = Math.max(0, x0 - p); y0 = Math.max(0, y0 - p); x1 = Math.min(w - 1, x1 + p); y1 = Math.min(h - 1, y1 + p);
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
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
/* desvío local de la luminancia (radio r): alto en pelo y pasto, bajo en paredes y almohadones lisos */
function texture(rgba, w, h, r) {
  const L = new Float32Array(w * h), L2 = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) { const v = (rgba[i * 4] * .299 + rgba[i * 4 + 1] * .587 + rgba[i * 4 + 2] * .114) / 255; L[i] = v; L2[i] = v * v; }
  const m = box(L, w, h, r), m2 = box(L2, w, h, r), o = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) o[i] = Math.sqrt(Math.max(0, m2[i] - m[i] * m[i]));
  return o;
}
/* refinamiento: mancha más grande + agujeros + guided filter de radio adaptativo + corte de la bruma.
   Devuelve { alpha, bb, stats } o null */
function refine(c, m, opts = {}, pet = null) {
  const w = c.width, h = c.height;
  const big = largest(m, w, h);
  if (!big.mask || big.area < w * h * .02) return null;
  const solid = fillHoles(big.mask, w, h, big.area), bb = bboxOf(solid, w, h, .5, 0);
  if (opts.guided === false) return { alpha: solid, bb, stats: stats(solid, w, h, big.rest, pet) };
  const rgba = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
  /* radio según el tamaño de la mascota (no de la foto): de 3 a 14 px a 1024 */
  const r = Math.max(3, Math.min(14, Math.round(Math.max(bb.w, bb.h) / (opts.rdiv || 90))));
  const eps = opts.eps || 1e-3;
  const q1 = guided(rgba, solid, w, h, r, eps), q2 = guided(rgba, solid, w, h, r * 2, eps * .5), tx = texture(rgba, w, h, r);
  /* solo cerca de la mascota (el filtro no puede inventar manchas lejos) */
  const zone = grow(solid, w, h, r * 2, .3), q = new Float32Array(w * h);
  for (let i = 0; i < q.length; i++) {
    if (!zone[i]) continue;
    const t = Math.min(1, tx[i] / .12), v = q1[i] * (1 - t) + q2[i] * t;
    q[i] = Math.max(0, Math.min(1, (v - .06) / .86));
  }
  /* lo que el filtro dejó suelto afuera (manchitas de pasto) también se va */
  const fin = largest(q, w, h, .35).mask || q;
  return { alpha: fin, bb, stats: stats(fin, w, h, big.rest, pet) };
}
/* cobertura, ruido del borde (perímetro / raíz del área: un círculo da ~3,5; una mascota prolija, 6 a 14) y cuánto quedó afuera */
function stats(a, w, h, rest = 0, pet = null) {
  let area = 0, per = 0, fuzz = 0, onPet = 0;
  const pts = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (a[i] > .12 && a[i] < .88) fuzz++;
    if (a[i] <= .5) continue; area++; if (pet && pet[i] > .3) onPet++;
    if (x === 0 || y === 0 || x === w - 1 || y === h - 1 || a[i - 1] <= .5 || a[i + 1] <= .5 || a[i - w] <= .5 || a[i + w] <= .5) { per++; pts.push([x, y]); }
  }
  /* fuzz: cuánto borde quedó a medias (bruma); pet: cuánto del recorte ve DeepLab como perro o gato */
  /* solid: área / área de la envolvente convexa. Una mascota prolija da 0,7 a 0,9; con manchas en punta, menos */
  const hull = convex(pts); let ha = 0; for (let k = 0; k < hull.length; k++) { const [x1, y1] = hull[k], [x2, y2] = hull[(k + 1) % hull.length]; ha += x1 * y2 - x2 * y1; }
  return { solid: ha ? Math.min(1, area / Math.abs(ha / 2)) : 0, cover: area / (w * h), noise: area ? per / Math.sqrt(area) : 99, rest, fuzz: area ? fuzz / area : 1, pet: pet && area ? onPet / area : 1 };
}
function convex(p) {
  if (p.length < 3) return p;
  p.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), lo = [], up = [];
  for (const q of p) { while (lo.length > 1 && cr(lo.at(-2), lo.at(-1), q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length > 1 && cr(up.at(-2), up.at(-1), q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
/* ¿vale la pena el recorte? Si no, mejor redondo y prolijo que recortado feo */
const NOISE_MAX = 24, REST_MAX = .35, FUZZ_MAX = .3, PET_MIN = .45, SOLID_MIN = .62;
const quality = st => !st ? 'none' : st.cover < .08 || st.cover > .92 ? 'cover' : st.noise > NOISE_MAX ? 'noise' : st.rest > REST_MAX ? 'pieces' : st.fuzz > FUZZ_MAX ? 'fuzz' : st.pet < PET_MIN ? 'shape' : st.solid < SOLID_MIN ? 'spiky' : 'ok';
/* arma el WebP/PNG con transparencia: feather suave y color del borde sin el fondo pegado (decontaminación) */
function compose(c, res) {
  const w = c.width, h = c.height, src = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
  const a0 = res.alpha, a = box(a0, w, h, 1);
  /* fondo y frente promedio alrededor de cada píxel (solo donde está claro qué es cada cosa) */
  const R = Math.max(6, Math.round(Math.max(res.bb.w, res.bb.h) / 40));
  const bw = new Float32Array(w * h), fw = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) { bw[i] = a0[i] < .05 ? 1 : 0; fw[i] = a0[i] > .95 ? 1 : 0; }
  const ch = k => { const o = new Float32Array(w * h); for (let i = 0; i < w * h; i++) o[i] = src[i * 4 + k]; return o; };
  const mul = (x, y) => { const o = new Float32Array(w * h); for (let i = 0; i < w * h; i++) o[i] = x[i] * y[i]; return o; };
  const sb = box(bw, w, h, R), sf = box(fw, w, h, R), C = [ch(0), ch(1), ch(2)];
  const B = C.map(x => box(mul(x, bw), w, h, R)), F = C.map(x => box(mul(x, fw), w, h, R));
  const m = document.createElement('canvas'); m.width = w; m.height = h;
  const mc = m.getContext('2d'), md = mc.createImageData(w, h), d = md.data;
  for (let i = 0; i < w * h; i++) {
    const al = a[i] < .02 ? 0 : a[i] > .98 ? 1 : a[i]; d[i * 4 + 3] = Math.round(al * 255);
    for (let k = 0; k < 3; k++) {
      let v = src[i * 4 + k];
      if (al > 0 && al < 1 && sb[i] > .02) {
        const bg = B[k][i] / sb[i], fgm = sf[i] > .02 ? F[k][i] / sf[i] : v;
        const est = (v - (1 - al) * bg) / Math.max(al, .15);
        /* con poca opacidad la cuenta es inestable: se acerca al color del pelo de al lado */
        v = al < .35 ? fgm + (est - fgm) * (al / .35) : est;
      }
      d[i * 4 + k] = v < 0 ? 0 : v > 255 ? 255 : v;
    }
  }
  mc.putImageData(md, 0, 0);
  /* recorte ajustado al rectángulo de la mascota, con 4 % de margen */
  const bb = res.bb, pad = Math.round(Math.max(bb.w, bb.h) * .04);
  const x0 = Math.max(0, bb.x - pad), y0 = Math.max(0, bb.y - pad), x1 = Math.min(w - 1, bb.x + bb.w - 1 + pad), y1 = Math.min(h - 1, bb.y + bb.h - 1 + pad);
  const cw = x1 - x0 + 1, chh = y1 - y0 + 1, s = Math.min(1, OUT / Math.max(cw, chh));
  const o = document.createElement('canvas'); o.width = Math.round(cw * s); o.height = Math.round(chh * s);
  const oc = o.getContext('2d'); oc.imageSmoothingQuality = 'high'; oc.drawImage(m, x0, y0, cw, chh, 0, 0, o.width, o.height);
  return encode(o);
}
/* recorte redondo y prolijo centrado en la mascota (o en la foto, sin rectángulo) */
function roundAt(img, bb, sc = 1) {
  const W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
  const cx = bb ? (bb.x + bb.w / 2) / sc : W / 2, cy = bb ? (bb.y + bb.h / 2) / sc : H / 2;
  let d = bb ? Math.max(bb.w, bb.h) / sc * 1.08 : Math.min(W, H); d = Math.min(d, W, H);
  const x = Math.max(0, Math.min(W - d, cx - d / 2)), y = Math.max(0, Math.min(H - d, cy - d / 2)), n = Math.round(Math.min(OUT, d));
  const c = document.createElement('canvas'); c.width = c.height = n; const g = c.getContext('2d');
  g.beginPath(); g.arc(n / 2, n / 2, n / 2, 0, Math.PI * 2); g.clip(); g.imageSmoothingQuality = 'high';
  g.drawImage(img, x, y, d, d, 0, 0, n, n);
  return encode(c);
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
    const cat = r.categoryMask.getAsUint8Array(), count = {}; let hit = 0, ph = 0;
    for (let i = 0; i < cat.length; i++) { if (cat[i] === person) ph++; if (want.includes(cat[i])) { hit++; count[cat[i]] = (count[cat[i]] || 0) + 1; } }
    const best = Object.keys(count).sort((a, b) => count[b] - count[a])[0];
    out = { pet: resize(pet, mw, mh, c.width, c.height), person: resize(per, mw, mh, c.width, c.height), hit: hit / cat.length, personHit: ph / cat.length, label: best != null ? labels[best] : '' };
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
/* U²-Netp sobre el rectángulo de la mascota: más resolución donde importa. Fuera del rectángulo queda la pasada entera */
async function saliencyBoth(c, petMask, L = SAL) {
  const full = await saliency(c, L), bb = bboxOf(petMask, c.width, c.height, .3, .18);
  if (!bb || bb.w * bb.h > c.width * c.height * .8) return full;
  const t = document.createElement('canvas'); t.width = bb.w; t.height = bb.h;
  t.getContext('2d', { willReadFrequently: true }).drawImage(c, bb.x, bb.y, bb.w, bb.h, 0, 0, bb.w, bb.h);
  const crop = await saliency(t, L), out = Float32Array.from(full);
  /* en los 6 px del borde del rectángulo se mezcla con la pasada entera, para que no quede un corte recto */
  const e = 6;
  for (let y = 0; y < bb.h; y++) for (let x = 0; x < bb.w; x++) {
    const k = Math.min(1, Math.min(x, y, bb.w - 1 - x, bb.h - 1 - y) / e), i = (y + bb.y) * c.width + x + bb.x;
    out[i] = crop[y * bb.w + x] * k + full[i] * (1 - k);
  }
  return out;
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

/* brazos y manos de quien la alza: fuera del corazón de la mascota, lo que DeepLab ve como persona se va
   (salvo que DeepLab vea mucha más persona que mascota: perros negros) */
function trimPerson(c, p, m) {
  const w = c.width, h = c.height, n = w * h; let petA = 0, perA = 0;
  for (let i = 0; i < n; i++) { if (p.pet[i] > .5) petA++; if (p.person[i] > .5) perA++; }
  if (!perA || petA < perA * .25) return m;
  const core = grow(p.pet, w, h, Math.round(Math.max(w, h) * .01), .5), o = Float32Array.from(m);
  for (let i = 0; i < n; i++) if (p.person[i] > .6 && p.pet[i] < .25 && !core[i]) o[i] = 0;
  return o;
}
/* recorte automático: devuelve { found, png, label, ms, loadMs, fallback, quality }.
   fallback: 'round' cuando la máscara salió pobre y se entrega el recorte redondo en su lugar.
   opts.mode es solo para comparar en pruebas: 'fusion' (el de la app), 'deeplab', 'u2netp' o 'legacy' */
async function auto(dataUrl, opts = {}) {
  const mode = opts.mode || 'fusion', start = t0();
  await Promise.all([autoSeg(), mode === 'fusion' || mode === 'u2netp' ? salSeg() : null]);
  const loadMs = Math.round(t0() - start), img = await loadImg(dataUrl), c = canvasOf(img), sc = c.width / img.naturalWidth;
  const p = await pets(c), done = o => ({ ...o, ms: Math.round(t0() - start), loadMs, hit: Math.round(p.hit * 1000) / 10, personHit: Math.round(p.personHit * 1000) / 10 });
  if (p.hit < (mode === 'fusion' ? .004 : .02) && mode !== 'u2netp') return done(opts.noFallback ? { found: false } : { found: true, png: roundAt(img, null), fallback: 'round', quality: 'none' });
  const m = mode === 'deeplab' || mode === 'legacy' ? p.pet : mode === 'u2netp' ? await saliency(c, opts.sal) : fuse(c, p, await saliencyBoth(c, p.pet, opts.sal));
  const res = refine(c, trimPerson(c, p, m), opts, mode === 'u2netp' ? null : p.pet);
  /* DeepLab ve casi tanta "persona" como mascota: típico de perros negros (la cabeza sale como persona).
     El recorte no es confiable: mejor redondo */
  /* y si hay una persona y el recorte se lleva bastante de ella (brazos, cara), también */
  const qa = mode === 'fusion' && p.personHit > p.hit * .75 ? 'ambiguous' : mode === 'fusion' && p.personHit > .08 && res?.stats.pet < .85 ? 'person' : quality(res?.stats);
  if (qa !== 'ok') {
    if (opts.noFallback) return done({ found: false, quality: qa, stats: res?.stats });
    return done({ found: true, png: roundAt(img, bboxOf(p.pet, c.width, c.height, .3, .1), sc), fallback: 'round', quality: qa, stats: res?.stats, label: p.label });
  }
  return done({ found: true, png: compose(c, res), label: p.label, quality: qa, stats: res.stats });
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
  const res = m && refine(c, m), qa = quality(res?.stats);
  return { found: qa === 'ok', png: qa === 'ok' ? compose(c, res) : null, quality: qa, ms: Math.round(t0() - start) };
}
/* plan C: recorte redondo y centrado */
async function round(dataUrl) { return roundAt(await loadImg(dataUrl), null); }
/* se puede llamar apenas la persona toca "Elegir foto", para ganar tiempo */
const warm = () => Promise.all([autoSeg(), salSeg()]).catch(() => {});
window.MZCUT = { auto, touch, round, warm, quality };
