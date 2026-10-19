// Family Purse offline cache. The app's own files only: figures always come fresh from the database,
// and nothing about the family's money is stored here.
const CACHE = 'family-purse-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // the database and anything else: straight to the network

  // Opening the app: the newest version when online, the last one seen when offline.
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res.ok) {
          const c = await caches.open(CACHE);
          // A new version of the app: drop the old version's files, so the saved copy doesn't grow with every update.
          const old = await c.match('./');
          const fresh = await res.clone().text();
          if (old && (await old.text()) !== fresh) for (const k of await c.keys()) await c.delete(k);
          await c.put('./', new Response(fresh, { headers: res.headers }));
        }
        return res;
      } catch {
        return (await caches.match('./')) || Response.error();
      }
    })());
    return;
  }

  // Code, styles, icons and fonts (all served with the app): their names change with every version, so a saved copy is always right.
  e.respondWith((async () => {
    const hit = await caches.match(req);
    if (hit) return hit;
    const res = await fetch(req);
    if (res.ok) { const c = await caches.open(CACHE); c.put(req, res.clone()); }
    return res;
  })());
});
