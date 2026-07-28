// Service Worker for MAX — push notifications + background sync + offline shell
const CACHE_NAME = 'max-agent-v3';
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.svg',
  '/favicon-32x32.png',
  '/icon-192x192.png',
  '/icon-512x512.png',
  '/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => clients.claim())
  );
});

// ===== FETCH — network-first for API, cache-first for app shell =====
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Don't intercept API calls or WebSocket upgrades
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/socket.io/')) {
    return;
  }

  // Cache-first for static assets
  if (event.request.method === 'GET' && APP_SHELL.includes(url.pathname)) {
    event.respondWith(
      caches.match(event.request).then(cached => cached || fetch(event.request))
    );
  }
});

// ===== PUSH NOTIFICATIONS =====
self.addEventListener('push', (event) => {
  let data = { title: 'MAX', body: 'New message from MAX' };
  try {
    data = JSON.parse(event.data.text());
  } catch (e) {
    data.body = event.data.text();
  }

  const options = {
    body: data.body,
    icon: '/icon-192x192.png',
    badge: '/icon-192x192.png',
    vibrate: [100, 50, 100],
    data: { url: data.url || '/' },
    actions: [
      { action: 'open', title: 'Open' },
      { action: 'close', title: 'Close' }
    ],
    tag: data.tag || 'max-notification',
    renotify: !!data.renotify
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'MAX', options)
  );
});

// Notification click — open the app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'close') return;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      // If app is already open, focus it
      for (const client of clientList) {
        if ('focus' in client) {
          client.navigate(event.notification.data.url || '/');
          return client.focus();
        }
      }
      // Otherwise open new window
      if (clients.openWindow) {
        return clients.openWindow(event.notification.data.url || '/');
      }
    })
  );
});

// ===== BACKGROUND SYNC (for missed messages) =====
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-messages') {
    event.waitUntil(syncMessages());
  }
});

async function syncMessages() {
  try {
    const sessionId = await getSessionId();
    if (!sessionId) return;

    const response = await fetch(`/api/sessions/${sessionId}/messages`);
    if (!response.ok) return;

    const messages = await response.json();
    if (!Array.isArray(messages) || messages.length === 0) return;

    // Check for new messages since last check
    const lastMessageId = await getLastMessageId();
    const newMessages = lastMessageId
      ? messages.filter(m => m.id > lastMessageId)
      : messages.slice(-1);

    if (newMessages.length > 0) {
      const lastMsg = newMessages[newMessages.length - 1];
      // Show notification for new messages
      self.registration.showNotification('MAX', {
        body: lastMsg.content?.substring(0, 100) || 'New message',
        icon: '/icon-192x192.png',
        badge: '/icon-192x192.png',
        vibrate: [100, 50, 100],
        data: { url: '/' }
      });
      // Save last message ID
      await setLastMessageId(lastMsg.id);
    }
  } catch (e) {
    console.error('[SW] Sync failed:', e);
  }
}

// ===== HELPERS =====
function getSessionId() {
  return new Promise(resolve => {
    const channel = new MessageChannel();
    channel.port1.onmessage = (e) => resolve(e.data.sessionId);
    self.clients.matchAll().then(clients => {
      if (clients[0]) {
        clients[0].postMessage({ type: 'GET_SESSION_ID' }, [channel.port2]);
      } else {
        resolve(null);
      }
    });
  });
}

function getLastMessageId() {
  return idbGet('lastMessageId');
}

function setLastMessageId(id) {
  return idbSet('lastMessageId', id);
}

function idbGet(key) {
  return new Promise(resolve => {
    const request = indexedDB.open('max-sw', 1);
    request.onupgradeneeded = (e) => {
      e.target.result.createObjectStore('kv');
    };
    request.onsuccess = (e) => {
      const db = e.target.result;
      const tx = db.transaction('kv', 'readonly');
      const store = tx.objectStore('kv');
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    };
    request.onerror = () => resolve(null);
  });
}

function idbSet(key, value) {
  return new Promise(resolve => {
    const request = indexedDB.open('max-sw', 1);
    request.onupgradeneeded = (e) => {
      e.target.result.createObjectStore('kv');
    };
    request.onsuccess = (e) => {
      const db = e.target.result;
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').put(value, key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    };
  });
}

// ===== MESSAGE HANDLER (from page) =====
self.addEventListener('message', (event) => {
  if (event.data?.type === 'GET_SESSION_ID') {
    // Page responds with session ID — handled above
  }
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
