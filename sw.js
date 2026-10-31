const CACHE_NAME = 'sofia-cache-v2';
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/css/styles.css?v=28',
  '/js/script.js?v=20',
  '/Logo-Boutique-Sofia-2.png',
  '/icono-192.png',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE_URLS))
  );
});

self.addEventListener('activate', event => {
  // Limpia versiones antiguas de la caché al activar la nueva
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // API y Push: siempre red, nunca caché (datos dinámicos)
  if (new URL(req.url).pathname.startsWith('/api/')) return;

  // Navegación (HTML): network-first, con fallback a caché sin conexión
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
        return res;
      }).catch(() => caches.match(req, { ignoreSearch: true }))
    );
    return;
  }

  // Estáticos (CSS, JS, imágenes, fuentes): cache-first con revalidación.
  // Instalación instantánea: sirve de caché y actualiza en segundo plano.
  event.respondWith(
    caches.match(req).then(cached => {
      const refresh = fetch(req).then(res => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
        }
        return res;
      }).catch(() => cached);

      return cached || refresh;
    })
  );
});

// ========= NOTIFICACIONES PUSH =========
self.addEventListener('push', event => {
  let data = { title: 'Sofia Boutique', body: 'Tenemos novedades para ti 🎉', url: '/' };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch (e) {
    if (event.data) data.body = event.data.text();
  }
  const options = {
    body: data.body,
    icon: data.icon || '/icono-192.png',
    badge: data.badge || '/icono-192.png',
    vibrate: [100, 50, 100],
    data: { url: data.url || '/' }
  };
  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Abrir la app al hacer clic en la notificación
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(winClients => {
      // Si la app ya está abierta, enfocarla; si no, abrirla
      for (const client of winClients) {
        if ('focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
