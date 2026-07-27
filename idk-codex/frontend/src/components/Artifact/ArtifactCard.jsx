import { FileCode, Download, Eye, FileText, Image, Braces } from 'lucide-react';

const ICONS = { html: FileCode, css: FileCode, javascript: FileCode, jsx: FileCode, typescript: FileCode, tsx: FileCode, json: Braces, python: FileCode, markdown: FileText, svg: Image, text: FileText };
const COLORS = { html: '#e34f26', css: '#1572b6', javascript: '#f7df1e', jsx: '#61dafb', typescript: '#3178c6', tsx: '#61dafb', json: '#cbcb41', python: '#3776ab', markdown: '#555', svg: '#ff9900', text: '#888' };

export default function ArtifactCard({ file, onOpen, onDownload }) {
  const Icon = ICONS[file.language] || FileText;
  const color = COLORS[file.language] || '#888';
  const filename = (file.path || '').split('/').pop() || file.path || 'file';
  const sizeLabel = formatSize(file.size || (file.content || '').length);

  return (
    <div onClick={() => onOpen && onOpen(file)} className="mt-2 rounded-lg border border-gray-700 bg-gray-900 hover:border-blue-500 hover:bg-gray-800 cursor-pointer transition-all overflow-hidden group">
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <div className="flex-shrink-0 w-8 h-8 rounded flex items-center justify-center" style={{ backgroundColor: color + '20', color }}>
          <Icon size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-medium text-xs text-gray-100 truncate">{filename}</span>
            <span className="text-[10px] px-1 py-0.5 rounded bg-gray-800 text-gray-400 uppercase flex-shrink-0">{file.language}</span>
          </div>
          <div className="text-[10px] text-gray-500 mt-0.5 truncate">{file.path} · {sizeLabel}</div>
        </div>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          <button onClick={(e) => { e.stopPropagation(); onOpen && onOpen(file); }} className="p-1.5 hover:bg-gray-700 rounded text-gray-400 hover:text-blue-400"><Eye size={14} /></button>
          <button onClick={(e) => { e.stopPropagation(); onDownload && onDownload(file); }} className="p-1.5 hover:bg-gray-700 rounded text-gray-400 hover:text-green-400"><Download size={14} /></button>
        </div>
      </div>
    </div>
  );
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}
