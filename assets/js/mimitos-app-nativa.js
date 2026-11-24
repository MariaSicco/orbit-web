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

  /* Avisos nativos (los activa mascotas-app.js en Avisos → "Activar en este celu") */
  const P = window.Capacitor?.Plugins?.PushNotifications;
  if (!P) return;
  /* tocar el aviso abre la hoja que corresponde (#/mefui, #/renovar/…); el de la ubicación abre Google Maps */
  P.addListener('pushNotificationActionPerformed', a => {
    const raw = a?.notification?.data?.url;
    if (!raw) return;
    if (/^https:\/\/www\.google\.com\/maps\?q=-?[\d.]+,-?[\d.]+$/.test(raw)) { window.open(raw, '_blank'); return; }
    const u = new URL(raw, location.origin);
    if (u.origin !== location.origin) return;
    if (location.pathname === u.pathname) location.hash = u.hash; else location.href = u.href;
  });
  /* Apple puede cambiar el token del iPhone: si los avisos estaban activos, lo renovamos sin preguntar */
  const viejo = localStorage.getItem('mz-apns');
  if (!viejo || !/\/mascotas/.test(location.pathname)) return;
  P.checkPermissions().then(p => {
    if (p.receive !== 'granted') return;
    P.addListener('registration', t => {
      if (!t?.value || t.value === viejo) return;
      fetch('/api/mascotas?notify=1', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apns: t.value, removeApns: viejo }) })
        .then(r => { if (r.ok) localStorage.setItem('mz-apns', t.value); }).catch(() => {});
    });
    P.register().catch(() => {});
  }).catch(() => {});
})();
