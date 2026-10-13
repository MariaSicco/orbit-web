/* Mimitos · service worker: solo recibe y muestra los avisos. No guarda nada offline. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Mimitos', {
    body: d.body || '', tag: d.tag || undefined, data: { url: d.url || '/mascotas' },
    icon: '/assets/img/mimitos/icon-192.png', badge: '/assets/img/mimitos/icon-192.png', lang: 'es-AR',
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || '/mascotas', self.location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) if (c.url.startsWith(self.location.origin + '/mascotas') && 'focus' in c) return c.focus();
    return self.clients.openWindow(url);
  }));
});
