/* Biblioteca: botón y estado de cada compra.
   Las herramientas online (la compra trae `herramienta` desde /api/me) se abren
   en el sitio con "Abrir"; el resto se descarga como siempre. */
(function (g) {
  var esc = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  var ruta = function (compra) {
    var r = compra && compra.herramienta;
    return typeof r === 'string' && /^\/herramientas\/[a-z0-9-]+$/.test(r) ? r : null;
  };

  function accion(p, compra, L) {
    var r = ruta(compra);
    if (r) return '<a class="btn btn-acid" href="' + esc(r) + '">' + L('Abrir', 'Open') + ' <span class="ar">→</span></a>';
    return '<button class="btn btn-acid" data-dl="' + esc(p.id) + '">' + L('Descargar', 'Download') + ' <span class="ar">↓</span></button>';
  }

  function estado(compra, L) {
    if (ruta(compra)) return L('Herramienta online · lista para usar', 'Online tool · ready to use');
    return compra && compra.downloadable ? L('Listo para descargar', 'Ready to download') : L('Archivo en preparación', 'File in preparation');
  }

  /* Una herramienta que todavía no está en products.js (por ejemplo, la de
     prueba en preview) igual aparece en la biblioteca con lo que manda el servidor. */
  function productoMinimo(compra) {
    if (!ruta(compra)) return null;
    var tool = {es: 'Herramienta online', en: 'Online tool'};
    return {
      id: compra.productId, code: compra.code || '', n: '', name: compra.name || compra.productId,
      cover: 'archive', accent: 'blue', status: 'available',
      tagline: {es: '', en: ''},
      specs: [[{es: 'Formato', en: 'Format'}, tool], [{es: 'Uso', en: 'Use'}, tool], [{es: 'Entrega', en: 'Delivery'}, {es: 'Acceso inmediato', en: 'Instant access'}]],
    };
  }

  g.OrbitHerramientas = {accion: accion, estado: estado, productoMinimo: productoMinimo};
})(typeof window !== 'undefined' ? window : globalThis);
