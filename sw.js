// Precachea la app al instalar. Después: responde desde caché (funciona offline) y actualiza en segundo plano,
// así un deploy nuevo aparece la próxima vez que abrís la app. Si agregás un archivo, sumalo a FILES y subí CACHE.
const CACHE = 'finanzas-v39';
const FILES = [
  './', './index.html', './styles.css', './app.js', './calc.js', './db.js', './sample.js', './manifest.json',
  './vendor/chart.umd.min.js', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png',
];
// El lector de fotos de facturas (Tesseract, ~10 MB) va en su propia caché: no cambia con cada versión de la app,
// así se baja una sola vez. Subí OCR solo si cambian estos archivos.
const OCR = 'finanzas-ocr-v1';
const OCR_FILES = ['tesseract.min.js', 'worker.min.js', 'tesseract-core-simd-lstm.wasm.js', 'tesseract-core-lstm.wasm.js', 'spa.traineddata.gz']
  .map(f => `./vendor/tesseract/${f}`);

self.addEventListener('install', e => {
  // cache: 'reload' saltea la caché HTTP del navegador; si no, se precachea la versión vieja.
  // El lector: solo lo que falta, y si falla (sin señal) la app se instala igual y se baja la primera vez que se usa.
  e.waitUntil(Promise.all([
    caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))),
    caches.open(OCR).then(c => Promise.all(OCR_FILES.map(f => c.match(f).then(hit => hit || c.add(new Request(f, { cache: 'reload' })))))).catch(() => {}),
  ]));
  self.skipWaiting();
});

self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== OCR).map(k => caches.delete(k)))).then(() => self.clients.claim()),
));

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // Lector de fotos: de la caché propia; si no está, se baja y se guarda
  if (url.pathname.includes('/vendor/tesseract/')) {
    e.respondWith(caches.open(OCR).then(async c => (await c.match(e.request, { ignoreSearch: true }))
      ?? fetch(e.request).then(res => { if (res.ok) c.put(e.request, res.clone()); return res; })));
    return;
  }
  e.respondWith(caches.open(CACHE).then(async cache => {
    const hit = await cache.match(e.request, { ignoreSearch: true });
    const net = fetch(e.request, { cache: 'no-cache' }).then(res => { if (res.ok) cache.put(e.request, res.clone()); return res; }).catch(() => hit);
    if (hit) { e.waitUntil(net); return hit; }
    return net;
  }));
});
