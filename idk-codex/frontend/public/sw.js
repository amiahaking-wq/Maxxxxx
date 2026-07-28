// Service Worker for MAX — push notifications + background sync
const CACHE_NAME = 'max-agent-v2';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
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
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    vibrate: [100, 50, 100],
    data: { url: data.url || '/' },
    actions: [
      { action: 'open', title: 'Open' },
      { action: 'close', title: 'Close' }
    ]
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
        icon: '/favicon.svg',
        badge: '/favicon.svg',
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
