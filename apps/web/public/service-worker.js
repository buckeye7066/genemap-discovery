const CACHE_NAME = 'genemap-shell-v2';
const PRECACHE_URLS = ['/', '/index.html'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(PRECACHE_URLS);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith('genemap-') && key !== CACHE_NAME)
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

async function cacheResponse(key, response) {
  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(key, response);
  } catch {
    // Storage exhaustion/private browsing must not turn a good network response
    // into a failed navigation or an unhandled promise rejection.
  }
}

async function cachedResponse(key) {
  try {
    const cache = await caches.open(CACHE_NAME);
    return await cache.match(key);
  } catch {
    return undefined;
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Never cache/intercept auth, health records, generated output, or API calls.
  // In particular, a Railway/CORS failure must not become a fake local 503.
  if (/^\/(?:api|auth|billing|education|genomics|entities|llm|assistants|advertising|advertising-link|admin|account)(?:\/|$)/u.test(url.pathname)) return;
  const navigation = request.mode === 'navigate';
  const asset = /^\/(?:assets|icons)\//u.test(url.pathname);
  if (!navigation && !asset) return;

  event.respondWith((async () => {
    let response;
    try {
      response = await fetch(request);
    } catch {
      // Offline/network interruption: try only this app's public shell/assets.
    }
    if (response?.ok) {
      const contentType = response.headers.get('content-type') || '';
      if (navigation && contentType.includes('text/html')) {
        await cacheResponse('/index.html', response.clone());
      } else if (asset) {
        await cacheResponse(request, response.clone());
      }
      return response;
    }
    if (!response || response.status >= 500) {
      const cached = await cachedResponse(navigation ? '/index.html' : request);
      if (cached) return cached;
    }
    // Preserve real HTTP errors instead of concealing them as success.
    if (response) return response;
    if (navigation) {
      return new Response('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>GeneMap connection unavailable</title><body><h1>GeneMap could not connect</h1><p>Check your connection, then try again. No research search was run.</p><p><a href="/search">Try again</a></p></body></html>', {
        status: 503,
        statusText: 'Service Unavailable',
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
      });
    }
    return Response.error();
  })());
});
