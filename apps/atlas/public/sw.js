//
// Service worker de Atlas.
//
// Es el ÚNICO fichero del proyecto que no pasa por TypeScript ni por el
// bundler: vive en `public/` porque un service worker tiene que servirse desde
// la raíz del sitio para poder controlar todas las rutas.
//
// El contrato del evento `push` es exactamente `AvisoEnviable` de
// supabase/functions/avisar/correo.ts — { titulo, cuerpo, url }. Si cambia allí,
// cambia aquí.
//

const CACHE = "atlas-v1";

self.addEventListener("install", () => self.skipWaiting());

// Al activarse se lleva por delante las cachés de versiones anteriores. Sin
// esto, un despliegue viejo puede seguir sirviéndose durante días.
self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((claves) =>
        Promise.all(claves.filter((c) => c !== CACHE).map((c) => caches.delete(c)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("push", (evento) => {
  let aviso = { titulo: "Atlas", cuerpo: "Algo ha pasado.", url: "/" };
  try {
    if (evento.data) aviso = { ...aviso, ...evento.data.json() };
  } catch {
    // Un push con basura dentro no debe impedir que se avise: mejor un aviso
    // genérico que ninguno.
  }

  evento.waitUntil(
    self.registration.showNotification(aviso.titulo, {
      body: aviso.cuerpo,
      icon: "/iconos/atlas-192.png",
      badge: "/iconos/atlas-192.png",
      // Agrupa por destino: dos avisos del mismo proyecto no apilan dos burbujas.
      tag: aviso.url,
      renotify: true,
      data: { url: aviso.url },
      actions: [
        { action: "abrir", title: "Ver" },
        { action: "silenciar", title: "Silenciar 1 h" },
      ],
    })
  );
});

self.addEventListener("notificationclick", (evento) => {
  evento.notification.close();
  const url = evento.notification.data?.url ?? "/";

  // «Silenciar» va al enlace firmado, que ya lleva el token dentro. La ruta
  // /api/silenciar responde sin sesión: por eso el guardia no la toca.
  let destino = url;
  if (evento.action === "silenciar") {
    const token = new URL(url, self.location.origin).searchParams.get("silenciar");
    if (token) destino = `/api/silenciar?t=${encodeURIComponent(token)}`;
  }

  evento.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((abiertas) => {
        // Si Atlas ya está abierto se reutiliza esa ventana, en vez de llenar el
        // navegador de pestañas iguales.
        for (const ventana of abiertas) {
          if (ventana.url.startsWith(self.location.origin) && "focus" in ventana) {
            ventana.navigate?.(destino);
            return ventana.focus();
          }
        }
        return self.clients.openWindow(destino);
      })
  );
});

//
// Caché del último estado conocido. Primero la red y, si no hay, lo último que
// se vio: abrir Atlas sin conexión y encontrar algo es mejor que un dinosaurio.
//
self.addEventListener("fetch", (evento) => {
  const peticion = evento.request;

  // Solo páginas. Las escrituras y la API no se cachean nunca: servir una
  // respuesta vieja de /api sería mucho peor que fallar.
  if (peticion.method !== "GET") return;
  if (!peticion.headers.get("accept")?.includes("text/html")) return;
  if (new URL(peticion.url).pathname.startsWith("/api/")) return;

  evento.respondWith(
    fetch(peticion)
      .then((respuesta) => {
        const copia = respuesta.clone();
        caches.open(CACHE).then((c) => c.put(peticion, copia));
        return respuesta;
      })
      .catch(() => caches.match(peticion).then((r) => r ?? caches.match("/")))
  );
});
