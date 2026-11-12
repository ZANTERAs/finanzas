// Precachea la app al instalar. Después: responde desde caché (funciona offline) y actualiza en segundo plano,
// así un deploy nuevo aparece la próxima vez que abrís la app. Si agregás un archivo, sumalo a FILES y subí CACHE.
const CACHE = 'finanzas-v32';
const FILES = [
  './', './index.html', './styles.css', './app.js', './calc.js', './db.js', './sample.js', './manifest.json',
  './vendor/chart.umd.min.js', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png',
];

self.addEventListener('install', e => {
  // cache: 'reload' saltea la caché HTTP del navegador; si no, se precachea la versión vieja.
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))));
  self.skipWaiting();
});

self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()),
));

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(async cache => {
    const hit = await cache.match(e.request, { ignoreSearch: true });
    const net = fetch(e.request, { cache: 'no-cache' }).then(res => { if (res.ok) cache.put(e.request, res.clone()); return res; }).catch(() => hit);
    if (hit) { e.waitUntil(net); return hit; }
    return net;
  }));
});
