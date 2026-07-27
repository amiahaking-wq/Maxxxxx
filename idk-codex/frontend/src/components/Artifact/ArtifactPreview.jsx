import { useState, useMemo, useEffect, useRef } from 'react';
import { X, Eye, Code2, Download, Copy, Check, ExternalLink, RefreshCw } from 'lucide-react';

export default function ArtifactPreview({ file, onClose, onDownload }) {
  const [tab, setTab] = useState('preview');
  const [copied, setCopied] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);

  useEffect(() => {
    if (!file) return;
    const previewable = ['html', 'svg', 'markdown'];
    setTab(previewable.includes(file.language) ? 'preview' : 'code');
  }, [file]);

  const srcDoc = useMemo(() => {
    if (!file) return '';
    if (file.language === 'html') {
      const c = file.content || '';
      if (c.trim().startsWith('<!DOCTYPE') || c.trim().startsWith('<html')) return c;
      return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;padding:16px;margin:0;}</style></head><body>${c}</body></html>`;
    }
    if (file.language === 'svg') return `<!DOCTYPE html><html><head><style>body{margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#1a1a1a}</style></head><body>${file.content}</body></html>`;
    if (file.language === 'markdown') return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:-apple-system,sans-serif;padding:24px;max-width:720px;margin:0 auto;color:#1a1a1a;}h1,h2,h3{margin-top:1.5em;}code{background:#f0f0f0;padding:2px 6px;border-radius:4px;font-family:monospace;}pre{background:#1a1a1a;color:#f0f0f0;padding:12px;border-radius:8px;overflow-x:auto;}a{color:#0066cc;}</style></head><body>${mdToHtml(file.content)}</body></html>`;
    return '';
  }, [file]);

  if (!file) return null;
  const filename = (file.path || '').split('/').pop() || file.path || 'file';
  const isPreviewable = ['html', 'svg', 'markdown'].includes(file.language);

  const handleCopy = () => { navigator.clipboard.writeText(file.content || ''); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  const handleOpenNew = () => { if (!isPreviewable) return; const blob = new Blob([srcDoc], { type: 'text/html' }); const url = URL.createObjectURL(blob); window.open(url, '_blank'); setTimeout(() => URL.revokeObjectURL(url), 10000); };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-2" onClick={onClose}>
      <div className="bg-gray-950 border border-gray-800 rounded-xl w-full max-w-6xl h-full max-h-[95vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-800 bg-gray-900 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex-shrink-0 w-7 h-7 rounded flex items-center justify-center text-[10px] font-bold uppercase bg-blue-500/20 text-blue-400">{file.language.slice(0, 3)}</div>
            <div className="min-w-0"><div className="font-medium text-sm text-gray-100 truncate">{filename}</div><div className="text-[10px] text-gray-500 truncate">{file.path}</div></div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {isPreviewable && (
              <div className="flex bg-gray-800 rounded-lg p-0.5">
                <button onClick={() => setTab('preview')} className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium ${tab === 'preview' ? 'bg-gray-700 text-white' : 'text-gray-400'}`}><Eye size={12} /> Preview</button>
                <button onClick={() => setTab('code')} className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium ${tab === 'code' ? 'bg-gray-700 text-white' : 'text-gray-400'}`}><Code2 size={12} /> Code</button>
              </div>
            )}
            {tab === 'preview' && isPreviewable && <button onClick={() => setIframeKey(k => k + 1)} className="p-1.5 hover:bg-gray-800 rounded-lg text-gray-400 hover:text-white"><RefreshCw size={14} /></button>}
            {tab === 'preview' && isPreviewable && <button onClick={handleOpenNew} className="p-1.5 hover:bg-gray-800 rounded-lg text-gray-400 hover:text-white"><ExternalLink size={14} /></button>}
            {tab === 'code' && <button onClick={handleCopy} className="p-1.5 hover:bg-gray-800 rounded-lg text-gray-400 hover:text-white">{copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}</button>}
            <button onClick={() => onDownload && onDownload(file)} className="p-1.5 hover:bg-gray-800 rounded-lg text-gray-400 hover:text-green-400"><Download size={14} /></button>
            <button onClick={onClose} className="p-1.5 hover:bg-gray-800 rounded-lg text-gray-400 hover:text-red-400"><X size={16} /></button>
          </div>
        </div>
        <div className="flex-1 overflow-hidden bg-gray-950">
          {tab === 'preview' && isPreviewable ? (
            <iframe key={iframeKey} srcDoc={srcDoc} title="preview" sandbox="allow-scripts allow-forms allow-modals allow-popups allow-same-origin" className="w-full h-full bg-white" style={{ border: 'none' }} />
          ) : (
            <div className="h-full overflow-auto"><pre className="p-4 text-xs text-gray-100 font-mono whitespace-pre-wrap break-words"><code>{file.content}</code></pre></div>
          )}
        </div>
        <div className="px-3 py-1.5 border-t border-gray-800 bg-gray-900 text-[10px] text-gray-500 flex items-center justify-between"><span>{(file.content || '').length.toLocaleString()} chars · {file.language}</span><span>{file.tool || 'write_file'}</span></div>
      </div>
    </div>
  );
}

function mdToHtml(md) {
  if (!md) return '';
  let html = md.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (m, l, c) => `<pre><code>${c.replace(/\n$/, '')}</code></pre>`);
  html = html.replace(/^######\s+(.+)$/gm, '<h6>$1</h6>').replace(/^#####\s+(.+)$/gm, '<h5>$1</h5>').replace(/^####\s+(.+)$/gm, '<h4>$1</h4>').replace(/^###\s+(.+)$/gm, '<h3>$1</h3>').replace(/^##\s+(.+)$/gm, '<h2>$1</h2>').replace(/^#\s+(.+)$/gm, '<h1>$1</h1>');
  html = html.replace(/^---+$/gm, '<hr>').replace(/^&gt;\s+(.+)$/gm, '<blockquote>$1</blockquote>');
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
  html = html.replace(/^[\*\-]\s+(.+)$/gm, '<li>$1</li>').replace(/(<li>[\s\S]+?<\/li>)/g, '<ul>$1</ul>').replace(/<\/ul>\s*<ul>/g, '');
  html = html.replace(/\n\n/g, '</p><p>').replace(/^/,'<p>').replace(/$/,'</p>').replace(/<p>\s*<\/p>/g,'').replace(/<p>(<(h\d|ul|ol|pre|blockquote|hr))/g,'$1').replace(/(<\/(h\d|ul|ol|pre|blockquote|hr)>)<\/p>/g,'$1');
  return html;
}
