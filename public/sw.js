/* Minimal service worker: makes the app installable and keeps the shell fast.
   API calls are never cached, so data is always live. Bump VERSION to force-refresh assets. */
const VERSION = "tf-v2";
const SHELL = ["/login", "/style.css", "/i18n.js", "/login.js", "/app.js", "/logo.svg", "/manifest.webmanifest"];

self.addEventListener("install", e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL).catch(() => {}))); self.skipWaiting(); });
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
  // network first, fall back to cache when offline
  e.respondWith(fetch(e.request).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match(e.request).then(hit => hit || caches.match("/login"))));
});
