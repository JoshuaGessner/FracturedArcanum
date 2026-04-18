const STATIC_CACHE = 'fractured-arcanum-static-v6'
const CORE_ASSETS = [
  '/',
  '/manifest.webmanifest',
  '/fractured-arcanum-icon-512.svg',
  '/fractured-arcanum-crest.svg',
  '/fractured-arcanum-icon-192.png',
  '/fractured-arcanum-icon-512.png',
  '/fractured-arcanum-icon-maskable-192.png',
  '/fractured-arcanum-icon-maskable-512.png',
  '/apple-touch-icon.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll(CORE_ASSETS)))
  // Do NOT call skipWaiting here — wait for user to accept the update
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(keys.filter((key) => key !== STATIC_CACHE).map((key) => caches.delete(key)))

      if ('navigationPreload' in self.registration) {
        await self.registration.navigationPreload.enable()
      }

      await self.clients.claim()
    })(),
  )
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

async function networkFirst(request) {
  try {
    const response = await fetch(request, { cache: 'no-store' })

    if (response && response.ok && request.method === 'GET') {
      const cache = await caches.open(STATIC_CACHE)
      await cache.put(request, response.clone())
    }

    return response
  } catch {
    const cached = await caches.match(request)
    return cached ?? caches.match('/')
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(STATIC_CACHE)
  const cached = await cache.match(request)
  const fetchPromise = fetch(request)
    .then((response) => {
      if (response && response.ok) {
        void cache.put(request, response.clone())
      }

      return response
    })
    .catch(() => cached)

  return cached ?? fetchPromise
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  if (
    request.method !== 'GET' ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/socket.io')
  ) {
    return
  }

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request))
    return
  }

  if (url.pathname.endsWith('/sw.js') || url.pathname.endsWith('/manifest.webmanifest')) {
    event.respondWith(fetch(request, { cache: 'no-store' }))
    return
  }

  if (
    request.destination === 'script' ||
    request.destination === 'style' ||
    request.destination === 'image' ||
    request.destination === 'font'
  ) {
    event.respondWith(staleWhileRevalidate(request))
  }
})
