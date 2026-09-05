/* Service worker mínimo de Salón OS · Staff.
 *
 * Objetivo: hacer la app INSTALABLE (PWA) y que arranque el app-shell sin red. Es
 * CONSERVADOR a propósito para no romper nada de lo que ya funciona:
 *   · Solo intercepta GET del MISMO origen. Nunca toca Supabase ni otras APIs
 *     cross-origin (auth, RPCs y datos siempre van a la red directamente).
 *   · Navegaciones (documentos): network-first con fallback a caché → nunca sirve un
 *     index.html rancio mientras haya red.
 *   · Estáticos con hash de Vite: cache-first (sus nombres cambian en cada build, así
 *     que no hay riesgo de servir un asset viejo).
 *   · skipWaiting + clients.claim: un despliegue nuevo toma el control de inmediato.
 */
const CACHE = 'salonos-staff-v1';
const APP_SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
      .catch(() => {
        /* Si algún recurso del shell no está disponible, seguimos: la app funciona online. */
      }),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // deja pasar Supabase / CDNs externos.

  // Navegaciones: red primero, caché como red de seguridad offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('/index.html', copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then((cached) => cached || caches.match('/index.html'))),
    );
    return;
  }

  // Resto de GET same-origin: caché primero, con relleno perezoso desde la red.
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res && res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      });
    }),
  );
});
