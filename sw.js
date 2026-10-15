// Offline support: the whole game is a handful of static files, cached when
// the service worker installs. Add new files to FILES.
//
// 'dev' is replaced with the commit hash when the game is deployed
// (scripts/stamp-version.mjs). Every release therefore has its own service
// worker and its own cache, and the browser swaps to it on its own.
const VERSION = 'dev';
const CACHE = `bended-arrows-${VERSION}`;
const FILES = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/style.css',
  'js/main.js',
  'js/app-info.js',
  'js/version.js',
  'js/board.js',
  'js/generator.js',
  'js/rng.js',
  'js/view.js',
  'js/audio.js',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
];
// Deployed pages load scripts and styles as file.js?v=<hash>.
const url = (file) => (VERSION !== 'dev' && /\.(js|css)$/.test(file) ? `${file}?v=${VERSION}` : file);

// GitHub Pages lets browsers keep files for ten minutes; 'no-cache' makes
// the browser check with the server, so a release is never cached stale.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(FILES.map((f) => new Request(url(f), { cache: 'no-cache' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k.startsWith('bended-arrows-') && k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

// A release is served from its own cache. A checkout ('dev') goes to the
// network first, so edits show up straight away, and falls back to the
// cache offline. version.json always comes from the network: it tells the
// page what the latest release is.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const { origin, pathname } = new URL(request.url);
  if (request.method !== 'GET' || origin !== location.origin || pathname.endsWith('/version.json')) return;
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = () => cache.match(request, { ignoreSearch: request.mode === 'navigate' });
      const network = () =>
        fetch(request, { cache: 'no-cache' }).then((res) => {
          if (res.ok) cache.put(request, res.clone());
          return res;
        });
      if (VERSION === 'dev') return network().catch(cached);
      return (await cached()) || network();
    }),
  );
});
