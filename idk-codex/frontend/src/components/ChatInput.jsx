/**
 * ChatInput — fixed bottom input bar with file upload.
 */
import { useRef, useEffect, useState } from 'react';
import { Paperclip, ArrowUp, Square, X, FileText } from 'lucide-react';

export default function ChatInput({ value, onChange, onSend, onStop, isStreaming, disabled, placeholder, onFileUpload }) {
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const [pendingFiles, setPendingFiles] = useState([]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + 'px';
    }
  }, [value]);

  const handleSend = () => {
    if ((!value.trim() && pendingFiles.length === 0) || isStreaming || disabled) return;
    onSend(pendingFiles);
    setPendingFiles([]);
  };

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const newFiles = files.map(f => ({ name: f.name, size: f.size, type: f.type, file: f }));
    setPendingFiles(prev => [...prev, ...newFiles]);
    e.target.value = '';
  };

  const removeFile = (idx) => {
    setPendingFiles(prev => prev.filter((_, i) => i !== idx));
  };

  const formatSize = (b) => {
    if (b < 1024) return b + ' B';
    if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
    return (b / 1048576).toFixed(1) + ' MB';
  };

  return (
    <div className="px-3 pt-2 flex-shrink-0" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
      <div className="max-w-3xl mx-auto">
        {/* Agent running indicator */}
        {isStreaming && (
          <div className="flex items-center justify-center gap-3 mb-2">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-[#666]">MAX is working</span>
              <div className="flex gap-0.5">
                <span className="w-1 h-1 bg-[#FF6B35] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1 h-1 bg-[#FF6B35] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1 h-1 bg-[#FF6B35] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
            <button onClick={onStop} className="px-3 py-1 bg-[#FF6B35] hover:bg-[#e55a24] text-white rounded-full text-xs font-medium transition-colors">Stop</button>
          </div>
        )}

        {/* Pending files */}
        {pendingFiles.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {pendingFiles.map((f, i) => (
              <div key={i} className="flex items-center gap-1.5 px-2 py-1 bg-[#212121] border border-[#2a2a2a] rounded-lg">
                <FileText size={12} className="text-[#FF6B35]" />
                <span className="text-xs text-[#ccc] max-w-[100px] truncate">{f.name}</span>
                <span className="text-[10px] text-[#666]">{formatSize(f.size)}</span>
                <button onClick={() => removeFile(i)} className="text-[#666] hover:text-red-400"><X size={12} /></button>
              </div>
            ))}
          </div>
        )}

        {/* Input bar */}
        <div className="flex items-end gap-2 bg-[#1e1e1e] border border-[#2a2a2a] rounded-2xl px-3 py-2 focus-within:border-[#FF6B35]/30">
          <input ref={fileInputRef} type="file" multiple onChange={handleFileSelect} className="hidden" />
          <button onClick={() => fileInputRef.current?.click()} className="p-1.5 text-[#666] hover:text-[#999] flex-shrink-0" title="Attach file">
            <Paperclip size={18} />
          </button>
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder || 'Message MAX...'}
            rows={1}
            disabled={disabled}
            className="flex-1 bg-transparent text-[#ececec] text-sm placeholder-[#666] focus:outline-none resize-none py-1.5 max-h-[200px]"
            style={{ minHeight: '24px' }}
          />
          {isStreaming ? (
            <button onClick={onStop} className="flex-shrink-0 p-1.5 bg-red-600 hover:bg-red-700 text-white rounded-full transition-colors" title="Stop">
              <Square size={16} />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={(!value.trim() && pendingFiles.length === 0) || disabled}
              className={`flex-shrink-0 p-1.5 rounded-full transition-colors ${value.trim() || pendingFiles.length > 0 ? 'bg-[#FF6B35] hover:bg-[#e55a24] text-white' : !disabled ? 'bg-[#2a2a2a] text-[#555]' : 'bg-[#2a2a2a] text-[#555]'}`}
              title="Send"
            >
              <ArrowUp size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
