/**
 * ChatInput — fixed bottom input bar.
 */
import { useRef, useEffect } from 'react';
import { Paperclip, ArrowUp, Square } from 'lucide-react';

export default function ChatInput({ value, onChange, onSend, onStop, isStreaming, disabled, placeholder }) {
  const textareaRef = useRef(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + 'px';
    }
  }, [value]);

  const handleSend = () => {
    if (!value.trim() || isStreaming || disabled) return;
    onSend();
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

        {/* Input bar */}
        <div className="flex items-end gap-2 bg-[#1e1e1e] border border-[#2a2a2a] rounded-2xl px-3 py-2 focus-within:border-[#FF6B35]/30">
          <button className="p-1.5 text-[#666] hover:text-[#999] flex-shrink-0" title="Attach file">
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
              disabled={!value.trim() || disabled}
              className={`flex-shrink-0 p-1.5 rounded-full transition-colors ${value.trim() && !disabled ? 'bg-[#FF6B35] hover:bg-[#e55a24] text-white' : 'bg-[#2a2a2a] text-[#555]'}`}
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
