const CACHE_NAME = "cirrestour-v25";
const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./firebase-init.js",
  "./organisateur.js",
  "./sync.js",
  "./defis-sync.js",
  "./dashboard.js",
  "./defis-editor.js",
  "./validation.js",
  "./manifest.json",
  "./manifest-organisateur.json",
  "./assets/logo.png",
  "./assets/repere-montee.jpg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return; // laisser Firebase/gstatic/googleapis passer en réseau natif, sans les mettre en cache
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          const copie = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copie));
          return response;
        })
        .catch(() => cached);
    })
  );
});
