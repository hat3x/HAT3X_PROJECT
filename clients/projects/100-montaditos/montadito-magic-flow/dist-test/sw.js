self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data?.json() ?? {}; } catch {}

  const title = data.title ?? '¡Tu pedido está listo! 🥖';
  const body  = data.body  ?? 'Ya puedes pasar a recogerlo en la barra.';
  const tag   = `pedido-listo-${data.numero_pedido ?? ''}`;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon:               '/favicon.png',
      badge:              '/favicon.png',
      tag,
      renotify:           true,
      vibrate:            [300, 100, 300, 100, 600],
      requireInteraction: true,
      data:               { url: self.location.origin },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) return client.focus();
      }
      return clients.openWindow('/');
    })
  );
});
