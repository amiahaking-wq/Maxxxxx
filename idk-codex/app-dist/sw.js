// Service Worker for background WebSocket persistence on iOS
const CACHE_NAME = 'max-agent-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

// Background sync for missed messages
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-messages') {
    event.waitUntil(syncMessages());
  }
});

/**
 * Sync missed messages from server when service worker wakes up
 * @returns {Promise<void>}
 */
async function syncMessages() {
  try {
    const sessionId = await getSessionId();
    if (!sessionId) return;

    // Fetch missed messages from API
    const response = await fetch(`/api/sessions/${sessionId}/messages?since=${await getLastMessageId()}`);
    if (!response.ok) return;

    const messages = await response.json();

    // Notify all clients
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({ type: 'SYNC_MESSAGES', messages });
    });
  } catch (error) {
    // Sync failed silently
  }
}

// Singleton resolvers to prevent memory leaks
let sessionIdResolver = null;
let lastMessageIdResolver = null;

// Global message handler - registered once
self.addEventListener('message', (event) => {
  if (event.data.type === 'SESSION_ID' && sessionIdResolver) {
    sessionIdResolver(event.data.sessionId);
    sessionIdResolver = null;
  } else if (event.data.type === 'LAST_MESSAGE_ID' && lastMessageIdResolver) {
    lastMessageIdResolver(event.data.lastMessageId);
    lastMessageIdResolver = null;
  }
});

/**
 * Get current session ID from active client
 * @returns {Promise<string|null>} Session ID or null if no clients
 */
async function getSessionId() {
  const clients = await self.clients.matchAll();
  if (clients.length === 0) return null;

  return new Promise((resolve) => {
    sessionIdResolver = resolve;
    clients[0].postMessage({ type: 'GET_SESSION_ID' });

    // Timeout to prevent hanging
    setTimeout(() => {
      if (sessionIdResolver === resolve) {
        sessionIdResolver = null;
        resolve(null);
      }
    }, 5000);
  });
}

/**
 * Get last received message ID from active client
 * @returns {Promise<string|null>} Last message ID or null if no clients
 */
async function getLastMessageId() {
  const clients = await self.clients.matchAll();
  if (clients.length === 0) return null;

  return new Promise((resolve) => {
    lastMessageIdResolver = resolve;
    clients[0].postMessage({ type: 'GET_LAST_MESSAGE_ID' });

    // Timeout to prevent hanging
    setTimeout(() => {
      if (lastMessageIdResolver === resolve) {
        lastMessageIdResolver = null;
        resolve(null);
      }
    }, 5000);
  });
}
