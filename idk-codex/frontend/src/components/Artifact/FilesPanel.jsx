import { useState, useEffect } from 'react';
import { X, FileCode, FileText, Image, Braces, Download, Trash2, RefreshCw, Folder } from 'lucide-react';
import { listFiles, deleteFile, downloadFile } from '../../lib/fileStore';

const API_BASE = import.meta.env.VITE_API_URL || window.location.origin;
const ICONS = { html: FileCode, css: FileCode, javascript: FileCode, jsx: FileCode, typescript: FileCode, tsx: FileCode, json: Braces, python: FileCode, markdown: FileText, svg: Image, text: FileText };
const COLORS = { html: '#e34f26', css: '#1572b6', javascript: '#f7df1e', jsx: '#61dafb', typescript: '#3178c6', tsx: '#61dafb', json: '#cbcb41', python: '#3776ab', markdown: '#555', svg: '#ff9900', text: '#888' };

function detectLang(path) {
  const ext = (path.split('.').pop() || '').toLowerCase();
  const map = { html: 'html', htm: 'html', css: 'css', js: 'javascript', jsx: 'jsx', ts: 'typescript', tsx: 'tsx', json: 'json', py: 'python', md: 'markdown', svg: 'svg', txt: 'text' };
  return map[ext] || 'text';
}

export default function FilesPanel({ sessionId, open, onClose, onOpenFile }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [serverFiles, setServerFiles] = useState([]);

  useEffect(() => { if (open && sessionId) loadFiles(); }, [open, sessionId]);

  async function loadFiles() {
    setLoading(true);
    try {
      const local = await listFiles(sessionId);
      setFiles(local);
      try {
        const r = await fetch(`${API_BASE}/api/files/sandbox-list`);
        if (r.ok) { const data = await r.json(); if (data.success) setServerFiles(data.files || []); }
      } catch (e) {}
    } finally { setLoading(false); }
  }

  async function handleDelete(file) { if (!confirm(`Delete ${file.path}?`)) return; await deleteFile(file.sessionId, file.path); loadFiles(); }
  async function handleDownload(file) { await downloadFile(file.sessionId, file.path); }

  const localPaths = new Set(files.map(f => f.path));
  const serverOnly = serverFiles.filter(f => !localPaths.has(f.path));
  const allFiles = [
    ...files.map(f => ({ ...f, source: 'local' })),
    ...serverOnly.map(f => ({ ...f, source: 'server', language: detectLang(f.path), content: '' }))
  ];

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div className="relative bg-gray-950 border-l border-gray-800 w-full max-w-md h-full flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
          <div className="flex items-center gap-2"><Folder size={20} className="text-blue-400" /><h2 className="font-semibold text-gray-100">Files</h2><span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded">{allFiles.length}</span></div>
          <div className="flex items-center gap-1">
            <button onClick={loadFiles} className="p-2 hover:bg-gray-800 rounded-lg text-gray-400"><RefreshCw size={16} className={loading ? 'animate-spin' : ''} /></button>
            <button onClick={onClose} className="p-2 hover:bg-gray-800 rounded-lg text-gray-400"><X size={18} /></button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading && files.length === 0 ? (
            <div className="text-center py-12 text-gray-500 text-sm">Loading...</div>
          ) : allFiles.length === 0 ? (
            <div className="text-center py-12 px-4"><Folder size={48} className="mx-auto text-gray-700 mb-3" /><p className="text-gray-500 mb-1">No files yet</p><p className="text-xs text-gray-600">Files the agent creates will appear here and persist in your browser.</p></div>
          ) : (
            <div className="divide-y divide-gray-900">
              {allFiles.map((file, idx) => {
                const Icon = ICONS[file.language] || FileText;
                const color = COLORS[file.language] || '#888';
                const filename = (file.path || '').split('/').pop();
                return (
                  <div key={idx} onClick={() => onOpenFile && onOpenFile(file)} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-900 cursor-pointer group">
                    <div className="flex-shrink-0 w-8 h-8 rounded flex items-center justify-center" style={{ backgroundColor: color + '20', color }}><Icon size={16} /></div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2"><span className="text-sm text-gray-100 truncate">{filename}</span>{file.source === 'server' && <span className="text-[10px] px-1 py-0.5 rounded bg-yellow-900/50 text-yellow-400">server</span>}</div>
                      <div className="text-xs text-gray-500 truncate">{file.path} · {formatSize(file.size)}</div>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
                      <button onClick={(e) => { e.stopPropagation(); handleDownload(file); }} className="p-1.5 hover:bg-gray-800 rounded text-gray-400 hover:text-green-400"><Download size={14} /></button>
                      {file.source === 'local' && <button onClick={(e) => { e.stopPropagation(); handleDelete(file); }} className="p-1.5 hover:bg-gray-800 rounded text-gray-400 hover:text-red-400"><Trash2 size={14} /></button>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="px-4 py-2 border-t border-gray-800 bg-gray-900 text-xs text-gray-500">Files stored locally in your browser (IndexedDB).</div>
      </div>
    </div>
  );
}

function formatSize(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}
