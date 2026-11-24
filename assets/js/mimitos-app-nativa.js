/* Mimitos abierta desde la app de iPhone/Android (Capacitor, ver ~/OrbitStudio/mimitos-app).
   Apple y Google no dejan mostrar adentro de la app botones ni links para comprar afuera:
   todo lo que tenga la clase .solo-web se oculta acá, y la app lee window.MIMITOS_APP.
   En el navegador no hace nada. */
(() => {
  'use strict';
  const nativa = /MimitosApp/.test(navigator.userAgent) || Boolean(window.Capacitor?.isNativePlatform?.());
  if (!nativa) return;
  window.MIMITOS_APP = true;
  document.documentElement.classList.add('en-app');
  const s = document.createElement('style');
  s.textContent = '.en-app .solo-web{display:none!important}';
  document.head.appendChild(s);
})();
