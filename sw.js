/* Service Worker: Offline-Caching für MERS PWA */
const CACHE_NAME = 'mers-v32';
const ASSETS = [
  'index.html',
  'scripts/main.js',
  'scripts/role.js',
  'scripts/logic.js',
  'scripts/data.js',
  'scripts/combatMusic.js',
  'scripts/events.js',
  'scripts/critParser.js',
  'scripts/campaigns.js',
  'scripts/kampftracker.js',
  'scripts/audio.js',
  'scripts/dom.js',
  'scripts/state.js',
  'scripts/constants.js',
  'scripts/pwa.js',
  'styles/base.css',
  'styles/overrides.css',
  'assets/data/treffer_tabellen_strukturiert.json',
  'assets/data/tables_processed.json',
  'assets/fonts/Aniron.ttf',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;

  e.respondWith(
    fetch(e.request).catch(() =>
      caches.match(e.request).then((r) => r || (e.request.mode === 'navigate' ? caches.match('index.html') : null))
    )
  );
});
