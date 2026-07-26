/**
 * ArtifactPreview — Claude-style preview modal.
 *
 * Renders file content based on its language:
 *  - HTML: live sandboxed iframe
 *  - SVG: inline render
 *  - Markdown: rendered HTML
 *  - Code (js, py, ts, json, css, etc.): syntax-highlighted code block
 *  - Images: inline img
 *
 * Has three tabs: Preview | Code | Download
 */

import { useState, useMemo, useEffect, useRef } from 'react';
import { X, Eye, Code2, Download, Copy, Check, ExternalLink, RefreshCw } from 'lucide-react';

export default function ArtifactPreview({ file, onClose, onDownload }) {
  const [tab, setTab] = useState('preview');
  const [copied, setCopied] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);
  const iframeRef = useRef(null);

  // Default to "code" tab for non-previewable types
  useEffect(() => {
    if (!file) return;
    const previewable = ['html', 'svg', 'markdown'];
    if (!previewable.includes(file.language)) {
      setTab('code');
    } else {
      setTab('preview');
    }
  }, [file]);

  // Build the iframe srcdoc for HTML files
  const srcDoc = useMemo(() => {
    if (!file) return '';
    if (file.language === 'html') {
      // If it's a full HTML document, use as-is. Otherwise wrap it.
      const content = file.content || '';
      if (content.trim().startsWith('<!DOCTYPE') || content.trim().startsWith('<html')) {
        return content;
      }
      return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 16px; margin: 0; }
</style>
</head>
<body>
${content}
</body>
</html>`;
    }
    if (file.language === 'svg') {
      return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>body{margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#1a1a1a}</style></head>
<body>${file.content}</body></html>`;
    }
    if (file.language === 'markdown') {
      return `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 24px; max-width: 720px; margin: 0 auto; color: #1a1a1a; }
  h1, h2, h3 { margin-top: 1.5em; }
  code { background: #f0f0f0; padding: 2px 6px; border-radius: 4px; font-family: 'SF Mono', Menlo, monospace; }
  pre { background: #1a1a1a; color: #f0f0f0; padding: 12px; border-radius: 8px; overflow-x: auto; }
  pre code { background: transparent; padding: 0; }
  a { color: #0066cc; }
  blockquote { border-left: 3px solid #ccc; padding-left: 12px; color: #666; }
  table { border-collapse: collapse; }
  th, td { border: 1px solid #ddd; padding: 6px 12px; }
</style>
</head><body>${markdownToHtml(file.content)}</body></html>`;
    }
    return '';
  }, [file]);

  if (!file) return null;

  const filename = (file.path || '').split('/').pop() || file.path || 'file';
  const isPreviewable = ['html', 'svg', 'markdown'].includes(file.language);

  const handleCopy = () => {
    navigator.clipboard.writeText(file.content || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenInNewTab = () => {
    if (!isPreviewable) return;
    const blob = new Blob([srcDoc], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-gray-950 border border-gray-800 rounded-xl w-full max-w-6xl h-full max-h-[95vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 bg-gray-900">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="flex-shrink-0 w-8 h-8 rounded flex items-center justify-center text-xs font-bold uppercase"
              style={{ backgroundColor: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa' }}
            >
              {file.language.slice(0, 3)}
            </div>
            <div className="min-w-0">
              <div className="font-medium text-sm text-gray-100 truncate">{filename}</div>
              <div className="text-xs text-gray-500 truncate">{file.path}</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Tabs */}
            {isPreviewable && (
              <div className="flex bg-gray-800 rounded-lg p-0.5">
                <button
                  onClick={() => setTab('preview')}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium transition-colors ${tab === 'preview' ? 'bg-gray-700 text-white' : 'text-gray-400'}`}
                >
                  <Eye size={14} /> Preview
                </button>
                <button
                  onClick={() => setTab('code')}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium transition-colors ${tab === 'code' ? 'bg-gray-700 text-white' : 'text-gray-400'}`}
                >
                  <Code2 size={14} /> Code
                </button>
              </div>
            )}

            {/* Refresh (for HTML preview) */}
            {tab === 'preview' && isPreviewable && (
              <button
                onClick={() => setIframeKey(k => k + 1)}
                className="p-2 hover:bg-gray-800 rounded-lg text-gray-400 hover:text-white"
                title="Refresh preview"
              >
                <RefreshCw size={16} />
              </button>
            )}

            {/* Open in new tab */}
            {tab === 'preview' && isPreviewable && (
              <button
                onClick={handleOpenInNewTab}
                className="p-2 hover:bg-gray-800 rounded-lg text-gray-400 hover:text-white"
                title="Open in new tab"
              >
                <ExternalLink size={16} />
              </button>
            )}

            {/* Copy code */}
            {tab === 'code' && (
              <button
                onClick={handleCopy}
                className="p-2 hover:bg-gray-800 rounded-lg text-gray-400 hover:text-white"
                title="Copy code"
              >
                {copied ? <Check size={16} className="text-green-400" /> : <Copy size={16} />}
              </button>
            )}

            {/* Download */}
            <button
              onClick={() => onDownload && onDownload(file)}
              className="p-2 hover:bg-gray-800 rounded-lg text-gray-400 hover:text-green-400"
              title="Download"
            >
              <Download size={16} />
            </button>

            {/* Close */}
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-800 rounded-lg text-gray-400 hover:text-red-400"
              title="Close"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-hidden bg-gray-950">
          {tab === 'preview' && isPreviewable ? (
            <iframe
              key={iframeKey}
              ref={iframeRef}
              srcDoc={srcDoc}
              title="preview"
              sandbox="allow-scripts allow-forms allow-modals allow-popups allow-same-origin"
              className="w-full h-full bg-white"
              style={{ border: 'none' }}
            />
          ) : (
            <div className="h-full overflow-auto">
              <pre className="p-4 text-sm text-gray-100 font-mono whitespace-pre-wrap break-words">
                <code>{file.content}</code>
              </pre>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-gray-800 bg-gray-900 text-xs text-gray-500 flex items-center justify-between">
          <span>{(file.content || '').length.toLocaleString()} chars · {file.language}</span>
          <span>{file.tool || 'write_file'} · {new Date(file.updatedAt || file.timestamp || Date.now()).toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Tiny markdown-to-HTML converter for the preview iframe.
 * Supports: headings, bold, italic, code blocks, inline code, links,
 * lists, blockquotes, hr, paragraphs.
 */
function markdownToHtml(md) {
  if (!md) return '';
  let html = md;
  // Escape HTML
  html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Code blocks (```lang\ncode```)
  html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (m, lang, code) => {
    return `<pre><code>${code.replace(/\n$/, '')}</code></pre>`;
  });

  // Headings
  html = html.replace(/^######\s+(.+)$/gm, '<h6>$1</h6>');
  html = html.replace(/^#####\s+(.+)$/gm, '<h5>$1</h5>');
  html = html.replace(/^####\s+(.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^#\s+(.+)$/gm, '<h1>$1</h1>');

  // Horizontal rule
  html = html.replace(/^---+$/gm, '<hr>');

  // Blockquote
  html = html.replace(/^&gt;\s+(.+)$/gm, '<blockquote>$1</blockquote>');

  // Bold + italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');

  // Lists (unordered)
  html = html.replace(/^[\*\-]\s+(.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>[\s\S]+?<\/li>)/g, '<ul>$1</ul>');
  html = html.replace(/<\/ul>\s*<ul>/g, '');

  // Lists (ordered)
  html = html.replace(/^\d+\.\s+(.+)$/gm, '<li>$1</li>');

  // Paragraphs (double newline)
  html = html.replace(/\n\n/g, '</p><p>');
  html = '<p>' + html + '</p>';

  // Clean up empty paragraphs
  html = html.replace(/<p>\s*<\/p>/g, '');
  html = html.replace(/<p>(<(h\d|ul|ol|pre|blockquote|hr))/g, '$1');
  html = html.replace(/(<\/(h\d|ul|ol|pre|blockquote|hr)>)<\/p>/g, '$1');

  return html;
}
