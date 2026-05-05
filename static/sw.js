/* VetGuardian Service Worker — shell + network-first, API без кеша */
const CACHE_NAME = "vetguardian-v15";

const PRECACHE_URLS = [
  "/",
  "/index.html",
  "/offline.html",
  "/offline_clinics.json",
  "/css/style.css?v=3",
  "/css/design.css?v=17",
  "/css/ai-assistant.css?v=19",
  "/css/offline.css?v=3",
  "/js/app.js?v=27",
  "/js/ai-assistant.js?v=2",
  "/js/knowledge_match.js?v=1",
  "/js/offline.js?v=7",
  "/js/veterinary_knowledge_offline.json",
  "/pictures/new_logo.png",
  "/pictures/new_logo_without_text.png",
  "/pictures/paw.png",
  "/static/manifest.json",
];

function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

function isApiOrBackendOnly(url) {
  const p = url.pathname;
  if (p.startsWith("/api/")) return true;
  if (p === "/chat" || p.startsWith("/chat/")) return true;
  if (p === "/transcribe" || p.startsWith("/transcribe")) return true;
  return false;
}

function isRootNavigationRequest(request, url) {
  if (request.mode !== "navigate") return false;
  return url.pathname === "/" || url.pathname === "/index.html";
}

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        Promise.all(
          PRECACHE_URLS.map((u) =>
            cache.add(u).catch((err) => {
              console.warn("[SW] precache skip:", u, err);
            })
          )
        )
      )
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  if (!isSameOrigin(url)) return;

  if (isApiOrBackendOnly(url)) {
    event.respondWith(fetch(request));
    return;
  }

  if (isRootNavigationRequest(request, url)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() =>
          caches.match("/offline.html").then((cached) => cached || Response.error())
        )
    );
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() =>
        caches.match(request).then((cached) => {
          if (cached) return cached;
          if (request.mode === "navigate") {
            return caches.match("/offline.html").then((o) => o || Response.error());
          }
          return Response.error();
        })
      )
  );
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = {};
  }
  const title = data.title || "VetGuardian";
  const body = data.body || "Напоминание о процедуре питомца.";
  const url = data.url || "/";
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/pictures/new_logo.png",
      badge: "/pictures/new_logo_without_text.png",
      data: { url },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(targetUrl) && "focus" in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
      return null;
    })
  );
});
