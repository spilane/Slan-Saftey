const CACHE_NAME = 'slan-safety-v5';
const ASSETS = ['/', '/index.html', '/manifest.json'];

// Install — cache app shell
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

// Activate — clean old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch — serve from cache, fall back to network
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).then(resp => {
      const clone = resp.clone();
      caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
      return resp;
    }))
  );
});

// Background sync — fire queued submissions when back online
self.addEventListener('sync', e => {
  if (e.tag === 'sync-submissions') {
    e.waitUntil(syncSubmissions());
  }
});

async function syncSubmissions() {
  const db = await openDB();
  const tx = db.transaction('queue', 'readwrite');
  const store = tx.objectStore('queue');
  const all = await getAllFromStore(store);

  for (const item of all) {
    try {
      const endpoint = item.endpoint || '';
      if (!endpoint) continue;
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item.data)
      });
      if (resp.ok) {
        const delTx = db.transaction('queue', 'readwrite');
        delTx.objectStore('queue').delete(item.id);
      }
    } catch (_) {}
  }
}

function openDB() {
  return new Promise((res, rej) => {
    const req = indexedDB.open('slan-safety', 1);
    req.onupgradeneeded = e => e.target.result.createObjectStore('queue', { keyPath: 'id', autoIncrement: true });
    req.onsuccess = e => res(e.target.result);
    req.onerror = () => rej(req.error);
  });
}

function getAllFromStore(store) {
  return new Promise((res, rej) => {
    const req = store.getAll();
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

// Push notifications
self.addEventListener('push', e => {
  if (!e.data) return;
  let payload;
  try { payload = e.data.json(); } catch { payload = { title: 'Slán Safety', body: e.data.text() }; }
  e.waitUntil(self.registration.showNotification(payload.title || 'Slán Safety', {
    body:  payload.body  || '',
    icon:  '/apple-touch-icon.png',
    badge: '/apple-touch-icon.png',
    tag:   payload.tag   || 'slan-notification',
    data:  payload.data  || {},
    vibrate: [200, 100, 200],
    requireInteraction: payload.tag === 'prestart-reminder'
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const screen = e.notification.data?.screen;
  e.waitUntil(
    clients.matchAll({ type:'window', includeUncontrolled:true }).then(list => {
      for (const client of list) {
        if (client.url.includes(self.registration.scope)) {
          client.focus();
          if (screen) client.postMessage({ action:'navigate', screen });
          return;
        }
      }
      return clients.openWindow(self.registration.scope + (screen ? '#'+screen : ''));
    })
  );
});
