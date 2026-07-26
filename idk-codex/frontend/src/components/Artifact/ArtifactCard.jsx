/**
 * ArtifactCard — Claude-style file card shown in chat.
 *
 * Renders as a clickable card below an assistant message. Clicking it opens
 * the ArtifactPreview modal which renders the file content (HTML = live iframe,
 * SVG = inline, code = syntax highlighted, etc.).
 */

import { FileCode, Download, Eye, FileText, Image, Braces } from 'lucide-react';

const ICONS = {
  html: FileCode,
  css: FileCode,
  javascript: FileCode,
  jsx: FileCode,
  typescript: FileCode,
  tsx: FileCode,
  json: Braces,
  python: FileCode,
  markdown: FileText,
  svg: Image,
  text: FileText
};

const COLORS = {
  html: '#e34f26',
  css: '#1572b6',
  javascript: '#f7df1e',
  jsx: '#61dafb',
  typescript: '#3178c6',
  tsx: '#61dafb',
  json: '#cbcb41',
  python: '#3776ab',
  markdown: '#555',
  svg: '#ff9900',
  text: '#888'
};

export default function ArtifactCard({ file, onOpen, onDownload }) {
  const Icon = ICONS[file.language] || FileText;
  const color = COLORS[file.language] || '#888';
  const filename = (file.path || '').split('/').pop() || file.path || 'file';
  const sizeLabel = formatSize(file.size || (file.content || '').length);

  return (
    <div
      onClick={() => onOpen && onOpen(file)}
      className="mt-3 mb-1 rounded-xl border border-gray-700 bg-gray-900 hover:border-blue-500 hover:bg-gray-800 cursor-pointer transition-all overflow-hidden group"
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <div
          className="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: color + '20', color }}
        >
          <Icon size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm text-gray-100 truncate">{filename}</span>
            <span className="text-xs px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 uppercase">
              {file.language}
            </span>
          </div>
          <div className="text-xs text-gray-500 mt-0.5">
            {file.path} · {sizeLabel}
          </div>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => { e.stopPropagation(); onOpen && onOpen(file); }}
            className="p-2 hover:bg-gray-700 rounded-lg text-gray-400 hover:text-blue-400"
            title="Preview"
          >
            <Eye size={16} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDownload && onDownload(file); }}
            className="p-2 hover:bg-gray-700 rounded-lg text-gray-400 hover:text-green-400"
            title="Download"
          >
            <Download size={16} />
          </button>
        </div>
      </div>
      <div className="px-4 py-2 bg-gray-950/50 text-xs text-gray-500 border-t border-gray-800 flex items-center gap-1">
        <Eye size={12} />
        <span>Click to preview</span>
      </div>
    </div>
  );
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}
