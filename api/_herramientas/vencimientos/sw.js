/* Vencimientos de la Casa · service worker: recibe y muestra los avisos. No guarda nada offline
   (los datos viven en el almacenamiento de la app). Patrón de Mi Mes y Mimitos. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Vencimientos de la Casa', {
    body: d.body || '', tag: d.tag || undefined, data: { url: d.url || '/herramientas/vencimientos' },
    icon: '/assets/img/vencimientos/icon-192.png', badge: '/assets/img/vencimientos/icon-192.png', lang: 'es-AR',
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || '/herramientas/vencimientos', self.location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(lista => {
    for (const c of lista) if (c.url.startsWith(self.location.origin + '/herramientas/vencimientos') && 'focus' in c) return c.focus();
    return self.clients.openWindow(url);
  }));
});
