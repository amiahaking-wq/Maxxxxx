/**
 * IndexedDB file store — persists agent-created files in the browser.
 * Works on phone + PC. Holds gigabytes (vs localStorage's 5-10MB).
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
      }
    };
    req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
    req.onerror = () => reject(req.error);
  });
}

export async function saveFile(file) {
  const db = await openDB();
  const id = `${file.sessionId}:${file.path}`;
  const existing = await getFile(file.sessionId, file.path);
  const record = {
    id, sessionId: file.sessionId, path: file.path,
    content: file.content || '', language: file.language || 'text',
    size: (file.content || '').length, tool: file.tool || 'write_file',
    createdAt: existing?.createdAt || Date.now(), updatedAt: Date.now()
  };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(record);
    tx.oncomplete = () => resolve(id);
    tx.onerror = () => reject(tx.error);
  });
}

export async function getFile(sessionId, path) {
  const db = await openDB();
  const id = `${sessionId}:${path}`;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function listFiles(sessionId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).index('sessionId').getAll(sessionId);
    req.onsuccess = () => {
      const files = req.result || [];
      files.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      resolve(files);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function deleteFile(sessionId, path) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(`${sessionId}:${path}`);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

export async function downloadFile(sessionId, path) {
  const file = await getFile(sessionId, path);
  if (!file) {
    window.open(`${window.location.origin}/api/files/sandbox-download/${encodeURIComponent(path)}`, '_blank');
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

export default { saveFile, getFile, listFiles, deleteFile, downloadFile };
