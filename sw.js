const CACHE_NAME = 'sofia-cache-v5';
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/css/styles.css?v=30',
  '/js/script.js?v=25',
  '/Logo-Boutique-Sofia-2.png',
  '/icono-192.png',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css'
];

self.addEventListener('install', event => {
  // Activar la versión nueva inmediatamente (sin esperar a cierre de pestañas)
  self.skipWaiting();
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

// Abrir la app al hacer clic en la notificación (prioriza la PWA instalada)
self.addEventListener('notificationclick', event => {
  event.notification.close();
  // Convertir a URL absoluta para evitar ambigüedades de scope
  const urlToOpen = new URL(
    (event.notification.data && event.notification.data.url) || '/',
    self.location.origin
  ).href;

  event.waitUntil(
    (async () => {
      const winClients = await clients.matchAll({ type: 'window', includeUncontrolled: true });
      // Solo reutilizar clients de la PWA real (la app instalada no es "auxiliary")
      const appClients = winClients.filter(c => c.frameType !== 'auxiliary');
      if (appClients.length > 0) {
        // La app ya está abierta: navegar y enfocar
        const client = appClients[0];
        try { await client.navigate(urlToOpen); } catch (e) { /* algunos clients no permiten navigate */ }
        return client.focus();
      }
      // No hay clients de la app: abrir la URL (si la PWA está instalada,
      // Chrome/Android la abre en modo standalone)
      return clients.openWindow(urlToOpen);
    })()
  );
});
