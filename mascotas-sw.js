/* Mimitos · service worker: solo recibe y muestra los avisos. No guarda nada offline.
   Los avisos de una fecha traen url (#/renovar/...) y un botón "Ya se la di": tocar el aviso o el botón
   abre esa hoja en la app. Donde el sistema no muestra botones en los avisos, tocar el aviso hace lo mismo. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data && e.data.text() }; }
  const max = (self.Notification && Notification.maxActions) || 0;
  const actions = Array.isArray(d.actions) && max ? d.actions.slice(0, max) : undefined;
  e.waitUntil(self.registration.showNotification(d.title || 'Mimitos', {
    body: d.body || '', tag: d.tag || undefined, data: { url: d.url || '/mascotas' }, actions,
    icon: '/assets/img/mimitos/icon-192.png?v=2', badge: '/assets/img/mimitos/icon-192.png?v=2', lang: 'es-AR',
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || '/mascotas', self.location.origin).href;
  /* el aviso con la ubicación exacta abre Google Maps directo (solo ese destino externo) */
  if (/^https:\/\/www\.google\.com\/maps\?q=-?[\d.]+,-?[\d.]+$/.test(url)) { e.waitUntil(self.clients.openWindow(url)); return; }
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) if (c.url.startsWith(self.location.origin + '/mascotas') && 'focus' in c) {
      /* la app ya está abierta: le pasamos a dónde ir (#/renovar/...) y la traemos al frente */
      c.postMessage({ type: 'mimitos:open', url });
      return c.focus();
    }
    return self.clients.openWindow(url);
  }));
});
