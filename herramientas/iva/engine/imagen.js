// Limpieza de una foto antes del OCR: escala de grises, agrandado si es chica y blanco y negro con umbral automático (Otsu).
// Ayuda con papel térmico gastado y fondos con dibujos. Trabaja sobre píxeles RGBA, así que sirve en el navegador y en Node.

export function umbralOtsu(grises) {
  const hist = new Array(256).fill(0);
  for (const g of grises) hist[g]++;
  const total = grises.length;
  let suma = 0;
  for (let i = 0; i < 256; i++) suma += i * hist[i];
  let sumaFondo = 0, pesoFondo = 0, mejor = 0, umbral = 128;
  for (let t = 0; t < 256; t++) {
    pesoFondo += hist[t];
    if (!pesoFondo) continue;
    const pesoFrente = total - pesoFondo;
    if (!pesoFrente) break;
    sumaFondo += t * hist[t];
    const mediaFondo = sumaFondo / pesoFondo, mediaFrente = (suma - sumaFondo) / pesoFrente;
    const varianza = pesoFondo * pesoFrente * (mediaFondo - mediaFrente) ** 2;
    if (varianza > mejor) { mejor = varianza; umbral = t; }
  }
  return umbral;
}

// rgba: Uint8ClampedArray/Uint8Array (ancho × alto × 4). Devuelve { data, ancho, alto } en blanco y negro.
export function limpiarParaOcr(rgba, ancho, alto, { altoMinimo = 2000, desplazamiento = 0 } = {}) {
  const escala = alto < altoMinimo ? Math.min(3, Math.ceil(altoMinimo / alto)) : 1;
  const A = ancho * escala, H = alto * escala;
  const grises = new Uint8Array(ancho * alto);
  for (let i = 0; i < grises.length; i++) {
    grises[i] = Math.round(0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2]);
  }
  // El fondo (mesa, dibujos) sube el umbral de Otsu: por eso se prueban también umbrales más bajos (desplazamiento negativo).
  const umbral = Math.max(40, umbralOtsu(grises) + desplazamiento);
  const data = new Uint8ClampedArray(A * H * 4);
  for (let y = 0; y < H; y++) {
    const fila = Math.floor(y / escala) * ancho;
    for (let x = 0; x < A; x++) {
      const v = grises[fila + Math.floor(x / escala)] <= umbral ? 0 : 255;
      const o = (y * A + x) * 4;
      data[o] = data[o + 1] = data[o + 2] = v;
      data[o + 3] = 255;
    }
  }
  return { data, ancho: A, alto: H, umbral, escala };
}

export const DESPLAZAMIENTOS = [0, -20, -40];

// Une varias lecturas del mismo comprobante (la foto original y versiones limpias) campo por campo:
// para cada dato, el valor que más se repite; la CUIT, la primera que pasa el dígito verificador;
// las alícuotas, las que cierran (IVA = neto × tasa) y, si hay total, suman el total.
export function unirLecturas(lecturas, cuitValido) {
  const validas = lecturas.filter(Boolean);
  if (!validas.length) return null;
  const masRepetido = campo => {
    const cuenta = new Map();
    for (const l of validas) {
      const v = l[campo];
      if (v == null || v === '' || v === 0) continue;
      cuenta.set(JSON.stringify(v), (cuenta.get(JSON.stringify(v)) ?? 0) + 1);
    }
    let mejor = null, max = 0;
    for (const [v, n] of cuenta) if (n > max) { max = n; mejor = JSON.parse(v); }
    return mejor;
  };
  const u = { ...validas[0] };
  for (const campo of Object.keys(u)) {
    if (['alicuotas', 'campos_dudosos', 'cuit_emisor'].includes(campo)) continue;
    const v = masRepetido(campo);
    if (v != null) u[campo] = v;
  }
  u.es_comprobante = validas.some(l => l.es_comprobante);
  u.cuit_emisor = validas.map(l => l.cuit_emisor).find(c => c && cuitValido(c)) ?? masRepetido('cuit_emisor');
  const cierra = a => a.length && a.every(x => x.iva != null && Math.abs(x.iva - x.neto * x.tasa / 100) <= 1);
  const sumaTotal = a => u.total == null || Math.abs(a.reduce((s, x) => s + x.neto + x.iva, 0) - u.total) <= 1;
  u.alicuotas = validas.map(l => l.alicuotas).find(a => cierra(a) && sumaTotal(a))
    ?? validas.map(l => l.alicuotas).find(cierra)
    ?? validas.map(l => l.alicuotas).find(a => a.length) ?? [];
  u.campos_dudosos = [];
  return u;
}
