/* Service worker: la app funciona sin conexión.
   Sube el número de VERSION cuando cambies archivos para que los móviles se actualicen. */
const VERSION = "v4";
const SHELL = `gastos-coche-shell-${VERSION}`;
const RUNTIME = "gastos-coche-runtime";
const FILES = [
  "./", "index.html", "manifest.webmanifest",
  "icon-192.png", "icon-512.png", "maskable-512.png", "apple-touch-icon.png", "favicon.svg"
];
// Recursos del lector OCR: se guardan la primera vez que se usan.
const OCR_HOSTS = ["cdn.jsdelivr.net", "tessdata.projectnaptha.com", "unpkg.com"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => Promise.all(FILES.map((f) => c.add(f).catch(() => null)))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith("gastos-coche-shell-") && k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    e.respondWith(
      caches.match(req, { ignoreSearch: true }).then((hit) => {
        const net = fetch(req).then((res) => {
          if (res.ok) caches.open(SHELL).then((c) => c.put(req, res.clone()));
          return res;
        }).catch(() => hit);
        return hit || net;
      })
    );
  } else if (OCR_HOSTS.includes(url.hostname)) {
    e.respondWith(
      caches.open(RUNTIME).then((c) => c.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) c.put(req, res.clone());
        return res;
      })))
    );
  }
});
