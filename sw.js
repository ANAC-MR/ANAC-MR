// ANAC Mauritanie — Service Worker
// Version: met à jour ce numéro pour forcer le rechargement du cache
const CACHE_NAME = 'anac-v1';

// Fichiers à mettre en cache pour fonctionner hors ligne
const STATIC_ASSETS = [
  '/ANAC-MR/',
  '/ANAC-MR/index.html',
  '/ANAC-MR/admin.html',
  '/ANAC-MR/ldm.html',
  '/ANAC-MR/styles.css',
  '/ANAC-MR/app.js',
  '/ANAC-MR/firebase.js',
  '/ANAC-MR/manifest.json',
  '/ANAC-MR/icons/icon-192.png',
  '/ANAC-MR/icons/icon-512.png',
];

// ── INSTALLATION : met en cache les fichiers statiques
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      console.log('[SW] Mise en cache des fichiers statiques');
      // On utilise addAll avec gestion d'erreur individuelle
      return Promise.allSettled(
        STATIC_ASSETS.map(function(url) {
          return cache.add(url).catch(function(err) {
            console.warn('[SW] Impossible de mettre en cache:', url, err);
          });
        })
      );
    }).then(function() {
      // Force l'activation immédiate sans attendre la fermeture des onglets
      return self.skipWaiting();
    })
  );
});

// ── ACTIVATION : supprime les anciens caches
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames
          .filter(function(name) { return name !== CACHE_NAME; })
          .map(function(name) {
            console.log('[SW] Suppression ancien cache:', name);
            return caches.delete(name);
          })
      );
    }).then(function() {
      // Prend le contrôle de tous les onglets ouverts immédiatement
      return self.clients.claim();
    })
  );
});

// ── FETCH : stratégie Network First pour Firebase, Cache First pour statique
self.addEventListener('fetch', function(event) {
  var url = event.request.url;

  // Firebase et APIs externes → toujours réseau (pas de cache)
  if (
    url.includes('firestore.googleapis.com') ||
    url.includes('firebase') ||
    url.includes('googleapis.com') ||
    url.includes('gstatic.com') ||
    url.includes('accounts.google.com') ||
    url.includes('gmail.googleapis.com') ||
    url.includes('cdnjs.cloudflare.com') ||
    url.includes('fonts.googleapis.com') ||
    url.includes('tesseract')
  ) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Fichiers statiques → Cache First (réseau en fallback)
  event.respondWith(
    caches.match(event.request).then(function(cached) {
      if (cached) {
        // Retourne le cache ET met à jour en arrière-plan
        var fetchPromise = fetch(event.request).then(function(networkResponse) {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then(function(cache) {
              cache.put(event.request, networkResponse.clone());
            });
          }
          return networkResponse;
        }).catch(function() { return cached; });
        return cached; // Retourne le cache immédiatement
      }
      // Pas en cache → réseau
      return fetch(event.request).then(function(response) {
        if (response && response.status === 200) {
          var responseClone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      }).catch(function() {
        // Hors ligne et pas en cache → page offline basique
        if (event.request.destination === 'document') {
          return caches.match('/ANAC-MR/index.html');
        }
      });
    })
  );
});
