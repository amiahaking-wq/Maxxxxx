/**
 * IndexedDB file store for MAX.
 *
 * Stores all files the agent creates, keyed by sessionId + path.
 * Files persist across page reloads and work on phone + PC.
 * IndexedDB can hold gigabytes (vs localStorage's 5-10MB).
 *
 * Each file record:
 *   { id, sessionId, path, content, language, size, tool, createdAt, updatedAt }
 */

const DB_NAME = 'max-files';
const DB_VERSION = 1;
const STORE = 'files';

let _db = null;

function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('sessionId', 'sessionId', { unique: false });
        store.createIndex('sessionIdPath', ['sessionId', 'path'], { unique: true });
      }
    };
    req.onsuccess = (e) => {
      _db = e.target.result;
      resolve(_db);
    };
    req.onerror = () => reject(req.error);
  });
}

/**
 * Save a file to IndexedDB.
 * @param {Object} file - { sessionId, path, content, language, tool }
 * @returns {Promise<string>} the file id
 */
export async function saveFile(file) {
  const db = await openDB();
  const id = `${file.sessionId}:${file.path}`;
  const existing = await getFile(file.sessionId, file.path);
  const record = {
    id,
    sessionId: file.sessionId,
    path: file.path,
    content: file.content || '',
    language: file.language || 'text',
    size: (file.content || '').length,
    tool: file.tool || 'write_file',
    createdAt: existing?.createdAt || Date.now(),
    updatedAt: Date.now()
  };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const req = store.put(record);
    req.onsuccess = () => resolve(id);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Get a single file by sessionId + path.
 */
export async function getFile(sessionId, path) {
  const db = await openDB();
  const id = `${sessionId}:${path}`;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

/**
 * List all files for a session.
 * @param {string} sessionId
 * @returns {Promise<Array>} sorted by updatedAt desc
 */
export async function listFiles(sessionId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    const idx = store.index('sessionId');
    const req = idx.getAll(sessionId);
    req.onsuccess = () => {
      const files = req.result || [];
      files.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      resolve(files);
    };
    req.onerror = () => reject(req.error);
  });
}

/**
 * Delete a file.
 */
export async function deleteFile(sessionId, path) {
  const db = await openDB();
  const id = `${sessionId}:${path}`;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const req = store.delete(id);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Delete all files for a session.
 */
export async function clearSession(sessionId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const idx = store.index('sessionId');
    const cursorReq = idx.openCursor(sessionId);
    cursorReq.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      } else {
        resolve(true);
      }
    };
    cursorReq.onerror = () => reject(cursorReq.error);
  });
}

/**
 * Trigger a browser download of a file from IndexedDB.
 * Works on phone + PC. Falls back to server sandbox-download endpoint
 * if the file isn't in IndexedDB.
 */
export async function downloadFile(sessionId, path) {
  const file = await getFile(sessionId, path);
  if (!file) {
    const url = `${window.location.origin}/api/files/sandbox-download/${encodeURIComponent(path)}`;
    window.open(url, '_blank');
    return;
  }
  const blob = new Blob([file.content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = path.split('/').pop() || 'download.txt';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Get total storage used across all sessions (in bytes).
 */
export async function getStorageInfo() {
  if (navigator.storage && navigator.storage.estimate) {
    const est = await navigator.storage.estimate();
    return { usage: est.usage || 0, quota: est.quota || 0 };
  }
  return { usage: 0, quota: 0 };
}

export default {
  saveFile,
  getFile,
  listFiles,
  deleteFile,
  clearSession,
  downloadFile,
  getStorageInfo
};
