/* Mimitos · recorte de la mascota en el navegador (gratis, sin servidor).
   - Librería: @mediapipe/tasks-vision 1.0.1 (Apache-2.0), desde jsDelivr.
   - Modelo automático: DeepLabV3 de MediaPipe (Apache-2.0, ~2,8 MB), clases de Pascal VOC: perro y gato.
   - Modelo "tocá a tu mascota": MagicTouch del InteractiveSegmenterLegacy de MediaPipe (~6,2 MB), solo si hace falta.
   Todo se baja recién cuando alguien sube una foto (no pesa en la carga de la app).
   Expone window.MZCUT = { auto, touch, round, warm }. */
const V = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1';
const M_AUTO = 'https://storage.googleapis.com/mediapipe-models/image_segmenter/deeplab_v3/float32/1/deeplab_v3.tflite';
const M_TOUCH = 'https://storage.googleapis.com/mediapipe-models/interactive_segmenter/magic_touch/float32/1/magic_touch.tflite';
const OUT = 800;
let lib = null, files = null, seg = null, inter = null;

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
const loadImg = src => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; });
/* la imagen de trabajo, como mucho de 1024 px */
function canvasOf(img, max = 1024) {
  const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); return c;
}
/* arma el PNG/WebP con transparencia a partir de una máscara de 0 a 1 */
function compose(src, alpha, w, h) {
  const m = document.createElement('canvas'); m.width = w; m.height = h;
  const mc = m.getContext('2d'), md = mc.createImageData(w, h);
  let x0 = w, y0 = h, x1 = 0, y1 = 0, on = 0;
  for (let i = 0; i < w * h; i++) {
    const a = Math.max(0, Math.min(1, (alpha[i] - .35) / .3));
    md.data[i * 4 + 3] = Math.round(a * 255);
    if (a > .5) { on++; const x = i % w, y = (i / w) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (on < w * h * .02) return null;
  mc.putImageData(md, 0, 0);
  /* bordes suaves: la máscara se desenfoca un poquito antes de aplicarla */
  const soft = document.createElement('canvas'); soft.width = w; soft.height = h;
  const sc = soft.getContext('2d'); sc.filter = 'blur(1.2px)'; sc.drawImage(m, 0, 0); sc.filter = 'none';
  sc.globalCompositeOperation = 'source-in'; sc.drawImage(src, 0, 0, w, h);
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

/* recorte automático: devuelve { png, found, ms, label } o { found: false } si no ve perro ni gato */
async function auto(dataUrl) {
  const start = t0();
  const s = await autoSeg(), loadMs = Math.round(t0() - start);
  const img = await loadImg(dataUrl), c = canvasOf(img);
  const labels = s.getLabels().map(x => String(x).toLowerCase());
  const want = ['dog', 'cat'].map(n => labels.indexOf(n)).filter(i => i >= 0);
  let out = { found: false };
  await new Promise(ok => s.segment(c, r => {
    const w = r.confidenceMasks[0].width, h = r.confidenceMasks[0].height;
    const alpha = new Float32Array(w * h);
    for (const k of want) { const a = r.confidenceMasks[k].getAsFloat32Array(); for (let i = 0; i < a.length; i++) alpha[i] = Math.max(alpha[i], a[i]); }
    const cat = r.categoryMask.getAsUint8Array(); let hit = 0; for (let i = 0; i < cat.length; i++) if (want.includes(cat[i])) hit++;
    const label = hit ? (labels[want.reduce((b, k) => (cat.filter(v => v === k).length > cat.filter(v => v === b).length ? k : b), want[0])]) : '';
    const png = hit > cat.length * .02 ? compose(c, alpha, w, h) : null;
    out = png ? { found: true, png, label } : { found: false };
    r.close?.(); ok();
  }));
  return { ...out, ms: Math.round(t0() - start), loadMs };
}
/* "tocá a tu mascota": x e y van de 0 a 1 sobre la foto */
async function touch(dataUrl, x, y) {
  const start = t0();
  const s = await touchSeg(), img = await loadImg(dataUrl), c = canvasOf(img);
  let png = null;
  await new Promise(ok => s.segment(c, { keypoint: { x, y } }, r => {
    const m = r.confidenceMasks?.[0];
    if (m) png = compose(c, m.getAsFloat32Array(), m.width, m.height);
    r.close?.(); ok();
  }));
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
const warm = () => autoSeg().catch(() => {});
window.MZCUT = { auto, touch, round, warm };
