/* VetGuardian Service Worker — shell + network-first, API без кеша */
const CACHE_NAME = "vetguardian-v1";

const PRECACHE_URLS = [
  "/",
  "/index.html",
  "/offline.html",
  "/css/style.css?v=3",
  "/css/design.css?v=14",
  "/css/ai-assistant.css?v=9",
  "/css/offline.css",
  "/js/app.js?v=18",
  "/js/ai-assistant.js?v=2",
  "/js/offline.js",
  "/pictures/new_logo.png",
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
