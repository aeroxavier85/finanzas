var CACHE = 'finanzas-v40';
var ARCHIVOS = [
  './',
  './index.html',
  './css/app.css',
  './js/config.js',
  './js/corte.js',
  './js/dinero.js',
  './js/formato.js',
  './js/api.js',
  './js/dashboard.js',
  './js/movimientos.js',
  './js/formulario.js',
  './js/recurrentes.js',
  './js/mesada.js',
  './js/app.js',
  './manifest.webmanifest',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png',
  './img/billete-vuela.png',
  './img/billetes-caen.png',
  './img/esposa-ahorca.png',
  './img/fabiana.jpg',
  './img/mia.jpg'
];

self.addEventListener('install', function (event) {
  event.waitUntil(caches.open(CACHE).then(function (cache) {
    return cache.addAll(ARCHIVOS);
  }));
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(caches.keys().then(function (claves) {
    return Promise.all(claves.filter(function (clave) {
      return clave !== CACHE;
    }).map(function (clave) {
      return caches.delete(clave);
    }));
  }));
  self.clients.claim();
});

self.addEventListener('fetch', function (event) {
  var url = new URL(event.request.url);
  if (url.pathname.indexOf('/api/') !== -1) return;
  event.respondWith(fetch(event.request).catch(function () {
    return caches.match(event.request).then(function (guardado) {
      return guardado || caches.match('./index.html');
    });
  }));
});
