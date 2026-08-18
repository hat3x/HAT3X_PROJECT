/* Service worker mínimo de Kairos.
 *
 * Objetivo: habilitar la INSTALACIÓN (una PWA necesita un SW con handler de
 * `fetch`) y una cáscara offline — SIN precachear los chunks de Next (que rotan
 * de hash entre despliegues y provocarían ChunkLoadError). Por eso solo se
 * interceptan las NAVEGACIONES con estrategia network-first; todo lo demás pasa
 * directo a la red (comportamiento idéntico a no tener SW cuando hay conexión).
 */
const CACHE = "kairos-shell-v1";
const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.add(OFFLINE_URL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  // Solo navegaciones GET: red primero, y si no hay conexión, la página /offline.
  if (request.method !== "GET" || request.mode !== "navigate") return;
  event.respondWith(
    (async () => {
      try {
        return await fetch(request);
      } catch {
        const cache = await caches.open(CACHE);
        return (await cache.match(OFFLINE_URL)) || Response.error();
      }
    })(),
  );
});
