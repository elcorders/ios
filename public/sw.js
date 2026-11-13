/* global self, caches, fetch, URL, Response */
/* Minimal app-shell service worker. Never touches cross-origin or non-GET requests. */
const VERSION = 'v3';
const CACHE = 'nibm-ios-shell-' + VERSION;
const STATIC = /^\/(assets\/|icons\/|manifest\.webmanifest$|favicon\.svg$)/;

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('nibm-ios-shell-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && (url.pathname === '/' || url.pathname === '/index.html')) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put('/index.html', copy));
          }
          return res;
        })
        .catch(() => caches.match('/index.html').then((r) => r || Response.error())),
    );
    return;
  }

  if (STATIC.test(url.pathname)) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
  }
});

self.addEventListener('push', (event) => {
  let data;
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  data = data || {};
  const title = typeof data.title === 'string' && data.title ? data.title : 'NIBM iOS';
  const body = typeof data.body === 'string' ? data.body : '';
  const url = typeof data.url === 'string' ? data.url : '/';
  event.waitUntil(
    self.registration
      .showNotification(title, {
        body,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        data: { url },
      })
      .then(() => self.clients.matchAll({ type: 'window', includeUncontrolled: true }))
      .then((list) => list.forEach((c) => c.postMessage({ type: 'push' }))),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const raw = event.notification.data && event.notification.data.url;
  // same-origin paths only
  const target = typeof raw === 'string' && raw.startsWith('/') && !raw.startsWith('//') && !raw.startsWith('/\\') ? raw : '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const existing = list[0];
      if (existing) {
        return existing
          .focus()
          .then((c) => (c && 'navigate' in c ? c.navigate(target) : undefined))
          .catch(() => self.clients.openWindow(target));
      }
      return self.clients.openWindow(target);
    }),
  );
});
