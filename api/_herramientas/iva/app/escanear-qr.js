// "Escanear QR": abre la cámara, busca el QR de la factura y devuelve su texto.
// Lector principal: ZXing (WebAssembly), servido desde la propia app (app/vendor/zxing), robusto con QR chicos
// y disponible también en iPhone. Mientras carga, o si no carga, se usa BarcodeDetector (Chrome/Android) o jsQR,
// sin esperar: la cámara nunca se queda "colgada" esperando al lector.

const WASM = new URL('vendor/zxing/zxing_reader.wasm', document.baseURI).href;
const OPCIONES = profundo => ({ formats: ['QRCode'], tryHarder: profundo, maxNumberOfSymbols: 1 });

// Estado del lector ZXing: 'cargando' | 'listo' | 'falló'
export const lector = { estado: 'cargando', error: null, modulo: null };
const listo = (async () => {
  try {
    const Z = globalThis.ZXingWASM;
    if (!Z) throw new Error('el archivo del lector no cargó');
    await Promise.race([
      Z.prepareZXingModule({ overrides: { locateFile: (ruta, prefijo) => (ruta.endsWith('.wasm') ? WASM : prefijo + ruta) }, fireImmediately: true }),
      new Promise((_, no) => setTimeout(() => no(new Error('tardó más de 30 s en cargar')), 30000)),
    ]);
    lector.modulo = Z;
    lector.estado = 'listo';
  } catch (e) {
    lector.estado = 'falló';
    lector.error = e?.message ?? String(e);
  }
})();
export const lectorListo = () => listo;

let detector;
async function crearDetector() {
  if (detector !== undefined) return detector;
  try {
    detector = 'BarcodeDetector' in globalThis && (await BarcodeDetector.getSupportedFormats()).includes('qr_code')
      ? new BarcodeDetector({ formats: ['qr_code'] }) : null;
  } catch { detector = null; }
  return detector;
}

const pausa = () => new Promise(ok => setTimeout(ok, 0)); // deja respirar a la pantalla entre búsquedas

// Abre una foto (JPG, PNG, HEIC en Safari) y la achica para que el lado mayor no pase de `maxLado`.
export async function cargarImagen(archivo, maxLado = 2000) {
  let fuente;
  try {
    fuente = await createImageBitmap(archivo);
  } catch {
    fuente = await new Promise((ok, no) => {
      const img = new Image();
      img.onload = () => ok(img);
      img.onerror = () => no(new Error('No pude abrir la imagen. ¿Es una foto válida?'));
      setTimeout(() => no(new Error('La imagen tardó demasiado en abrirse.')), 20000);
      img.src = URL.createObjectURL(archivo);
    });
  }
  const ancho = fuente.width || fuente.naturalWidth, alto = fuente.height || fuente.naturalHeight;
  const escala = Math.min(1, maxLado / Math.max(ancho, alto));
  const c = document.createElement('canvas');
  c.width = Math.round(ancho * escala); c.height = Math.round(alto * escala);
  c.getContext('2d').drawImage(fuente, 0, 0, c.width, c.height);
  fuente.close?.();
  return c;
}

// Para el QR se usa la foto casi en tamaño original (hasta 4096 px, el límite seguro de los celulares):
// achicarla borra los cuadraditos del QR.
export const LADO_QR = 4096;

export function achicar(canvas, maxLado) {
  const escala = Math.min(1, maxLado / Math.max(canvas.width, canvas.height));
  if (escala === 1) return canvas;
  const c = document.createElement('canvas');
  c.width = Math.round(canvas.width * escala); c.height = Math.round(canvas.height * escala);
  c.getContext('2d').drawImage(canvas, 0, 0, c.width, c.height);
  return c;
}

function jsqrEn(ctx, x, y, w, h, lado) {
  const v = jsqrEn.lienzo ??= document.createElement('canvas');
  v.width = lado; v.height = lado;
  const vctx = v.getContext('2d', { willReadFrequently: true });
  vctx.drawImage(ctx.canvas, x, y, w, h, 0, 0, lado, lado);
  return jsQR(vctx.getImageData(0, 0, lado, lado).data, lado, lado, { inversionAttempts: 'attemptBoth' })?.data ?? null;
}

// Busca un QR en un canvas. Sin `profundo`: una pasada rápida (para la cámara).
// Con `profundo`: búsqueda exhaustiva (para fotos, donde el QR suele salir chico).
export async function buscarQr(canvas, { profundo = false } = {}) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (lector.estado === 'listo') {
    const r = await lector.modulo.readBarcodes(ctx.getImageData(0, 0, canvas.width, canvas.height), OPCIONES(profundo)).catch(() => []);
    return r[0]?.text || null;
  }
  const d = await crearDetector();
  if (d) {
    try { const r = await d.detect(canvas); if (r[0]?.rawValue) return r[0].rawValue; } catch { /* sigue con jsQR */ }
  }
  if (!globalThis.jsQR) return null;
  const W = canvas.width, H = canvas.height;
  const directo = jsqrEn(ctx, 0, 0, W, H, Math.min(1000, Math.max(W, H)));
  if (directo || !profundo) return directo;
  for (const ventana of W * H > 6e6 ? [900] : [700, 450]) {
    const paso = Math.round(ventana / 2);
    for (let y = 0; y < H; y += paso) {
      for (let x = 0; x < W; x += paso) {
        const w = Math.min(ventana, W - x), h = Math.min(ventana, H - y);
        if (w < ventana / 2 || h < ventana / 2) continue;
        const q = jsqrEn(ctx, x, y, w, h, 720);
        if (q) return q;
        await pausa();
      }
    }
  }
  return null;
}

export async function qrDeFoto(archivo) {
  await Promise.race([listo, new Promise(ok => setTimeout(ok, 15000))]); // para una foto sí vale esperar al lector bueno
  if (lector.estado === 'listo') {
    const r = await lector.modulo.readBarcodes(archivo, OPCIONES(true)).catch(() => []);
    if (r[0]?.text) return r[0].text;
  }
  return buscarQr(await cargarImagen(archivo, LADO_QR), { profundo: true });
}

export function escanearQr() {
  return new Promise(resolve => {
    const previo = document.activeElement;
    const capa = document.createElement('div');
    capa.className = 'escaner';
    capa.setAttribute('role', 'dialog');
    capa.setAttribute('aria-modal', 'true');
    capa.setAttribute('aria-labelledby', 'escaner-titulo');
    capa.innerHTML = `
      <div class="escaner-caja">
        <h2 id="escaner-titulo">Escanear el QR</h2>
        <p class="escaner-ayuda">Apuntá al QR de la factura hasta que ocupe el recuadro, con buena luz.</p>
        <div class="escaner-video"><video playsinline muted autoplay></video><span class="escaner-guia" aria-hidden="true"></span></div>
        <p class="escaner-estado" role="status">Abriendo la cámara…</p>
        <div class="fila">
          <label class="btn" data-foto>Elegir una foto del QR<input class="sr" type="file" accept="image/*"></label>
          <button class="btn" type="button" data-reabrir hidden>Volver a la cámara</button>
          <button class="btn" type="button" data-cerrar>Cancelar</button>
        </div>
      </div>`;
    document.body.append(capa);
    const video = capa.querySelector('video');
    const estado = capa.querySelector('.escaner-estado');
    const reabrir = capa.querySelector('[data-reabrir]');
    const lienzo = document.createElement('canvas');
    lienzo.width = lienzo.height = 480;
    const lctx = lienzo.getContext('2d', { willReadFrequently: true });
    let stream = null, activo = true, generacion = 0;

    const decir = texto => { if (estado.textContent !== texto) estado.textContent = texto; };
    const apagarCamara = () => { generacion++; stream?.getTracks().forEach(t => t.stop()); stream = null; video.srcObject = null; };
    const terminar = texto => {
      if (!activo) return;
      activo = false;
      apagarCamara();
      capa.remove();
      document.removeEventListener('keydown', teclas);
      previo?.focus?.();
      resolve(texto);
    };
    const teclas = e => { if (e.key === 'Escape') terminar(null); };
    document.addEventListener('keydown', teclas);
    capa.querySelector('[data-cerrar]').addEventListener('click', () => terminar(null));
    capa.querySelector('[data-cerrar]').focus();

    // Elegir foto: primero se apaga la cámara (en iPhone, dos usos de la cámara a la vez hacen que la foto se pierda)
    capa.querySelector('[data-foto]').addEventListener('click', () => {
      apagarCamara();
      reabrir.hidden = false;
      decir('Elegí la foto del QR (de cerca). Si cancelás, tocá “Volver a la cámara”.');
    });
    reabrir.addEventListener('click', () => abrirCamara());
    capa.querySelector('input[type=file]').addEventListener('change', async e => {
      const archivo = e.target.files[0];
      e.target.value = '';
      if (!archivo) return;
      decir('Buscando el QR en la foto…');
      const texto = await qrDeFoto(archivo).catch(() => null);
      if (texto) terminar(texto);
      else decir('No encontré el QR en esa foto. Probá con una más de cerca, o volvé a la cámara.');
    });

    async function abrirCamara() {
      const mia = ++generacion;
      reabrir.hidden = true;
      if (!navigator.mediaDevices?.getUserMedia) {
        decir('Este navegador no deja usar la cámara. Elegí una foto del QR.');
        return;
      }
      decir('Abriendo la cámara…');
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
        if (mia !== generacion || !activo) { s.getTracks().forEach(t => t.stop()); return; }
        stream = s;
      } catch {
        decir('No pude abrir la cámara (¿falta el permiso?). Podés elegir una foto del QR.');
        reabrir.hidden = false;
        return;
      }
      video.srcObject = stream;
      await video.play().catch(() => {});
      const inicio = Date.now();
      const buscar = async () => {
        if (!activo || mia !== generacion) return;
        const vw = video.videoWidth, vh = video.videoHeight;
        if (vw) {
          const lado = Math.round(Math.min(vw, vh) * 0.75);
          lctx.drawImage(video, (vw - lado) / 2, (vh - lado) / 2, lado, lado, 0, 0, 480, 480);
          const texto = await buscarQr(lienzo).catch(() => null);
          if (texto) return terminar(texto);
          const lectorTxt = lector.estado === 'listo' ? '' : lector.estado === 'cargando' ? ' (cargando el lector)' : ' (lector simple)';
          decir(Date.now() - inicio > 8000
            ? `No veo el QR todavía${lectorTxt}. Acercate hasta que el QR llene el recuadro, sin reflejos.`
            : `Buscando el QR…${lectorTxt}`);
        }
        setTimeout(buscar, 120);
      };
      buscar();
    }
    abrirCamara();
  });
}
