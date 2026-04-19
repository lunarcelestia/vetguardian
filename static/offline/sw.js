/**
 * Service Worker: офлайн-пакет «Красная кнопка» VetGuardian.
 * Кеш: vetguardian-offline-v1 — при смене версии старый удаляется.
 */
const CACHE_NAME = "vetguardian-offline-v1";

/** Все URL для предкеширования (абсолютные от корня сайта). */
const PRECACHE_URLS = [
  "/offline/index.html",
  "/offline/handbook.html",
  "/offline/quicktest.html",
  "/offline/styles.css",
  "/offline/script.js",
  "/offline/manifest.json",
  "/offline/icon-192.png",
  "/offline/icon-512.png",
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(function (cache) {
        return cache.addAll(PRECACHE_URLS).catch(function (err) {
          console.error("[SW] precache failed:", err);
          throw err;
        });
      })
      .then(function () {
        return self.skipWaiting();
      })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches
      .keys()
      .then(function (keys) {
        return Promise.all(
          keys.map(function (key) {
            if (key !== CACHE_NAME) {
              return caches.delete(key);
            }
          })
        );
      })
      .then(function () {
        return self.clients.claim();
      })
  );
});

self.addEventListener("message", function (event) {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (req.method !== "GET") return;

  var url = new URL(req.url);
  // Только наш офлайн-scope
  if (!url.pathname.startsWith("/offline/")) return;

  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then(function (cached) {
      if (cached) return cached;
      return fetch(req)
        .then(function (res) {
          if (!res || res.status !== 200 || res.type !== "basic") return res;
          var copy = res.clone();
          caches.open(CACHE_NAME).then(function (cache) {
            cache.put(req, copy);
          });
          return res;
        })
        .catch(function () {
          return caches.match("/offline/index.html");
        });
    })
  );
});
