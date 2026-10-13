/* Mi Mes by Orbit · service worker: recibe y muestra los avisos. No guarda nada offline
   (los datos viven en el almacenamiento de la app, no acá). Patrón de mascotas-sw.js. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Mi Mes by Orbit', {
    body: d.body || '', tag: d.tag || undefined, data: { url: d.url || '/herramientas/mi-mes' },
    icon: '/assets/img/mi-mes/icon-192.png', badge: '/assets/img/mi-mes/icon-192.png', lang: 'es-AR',
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || '/herramientas/mi-mes', self.location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(lista => {
    for (const c of lista) if (c.url.startsWith(self.location.origin + '/herramientas/mi-mes') && 'focus' in c) return c.focus();
    return self.clients.openWindow(url);
  }));
});
