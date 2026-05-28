/* ──────────────────────────────────────────────────────────────────────────
   KILL-SWITCH service worker.

   This app no longer uses a service worker. Older installs (especially the
   phone home-screen PWA) may still have a cached, stale service worker that
   keeps serving an out-of-date build — and clearing the browser cache does NOT
   remove it. Browsers re-check this sw.js for changes on each navigation, so
   this minimal worker takes over, deletes every cache, unregisters itself, and
   reloads any open windows — guaranteeing the device drops to the live build.

   It has NO fetch handler, so all requests go straight to the network.
   ────────────────────────────────────────────────────────────────────────── */
self.addEventListener('install', function () {
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil((async function () {
    // 1) Delete every cache this origin holds.
    try {
      var keys = await caches.keys();
      await Promise.all(keys.map(function (k) { return caches.delete(k); }));
    } catch (_) {}
    // 2) Unregister this service worker so it never controls the page again.
    try { await self.registration.unregister(); } catch (_) {}
    // 3) Reload any open windows so they fetch the fresh build immediately.
    try {
      var clientList = await self.clients.matchAll({ type: 'window' });
      clientList.forEach(function (c) { try { c.navigate(c.url); } catch (_) {} });
    } catch (_) {}
  })());
});
