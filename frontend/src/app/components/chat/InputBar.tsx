'use client';
import { useState, KeyboardEvent, useRef, useEffect } from 'react';
import { Send, Paperclip, Square, Mic } from 'lucide-react';
import { cn } from '@/app/lib/utils';

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  isStreaming: boolean;
  onStop: () => void;
}

export function InputBar({ value, onChange, onSend, isStreaming, onStop }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-grow textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
  }, [value]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (value.trim() && !isStreaming) onSend();
    }
  };

  return (
    <div className="border-t border-cg-border bg-cg-canvas px-4 py-3">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-end gap-2 rounded-[28px] border border-cg-border bg-cg-canvas px-4 py-3 shadow-sm focus-within:border-cg-accent/50">
          <button
            className="rounded-md p-1 text-cg-muted hover:bg-cg-hover hover:text-cg-text"
            aria-label="Attach file"
            title="Attach file"
          >
            <Paperclip className="h-5 w-5" />
          </button>
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message MAX..."
            rows={1}
            className="flex-1 resize-none bg-transparent text-[15px] text-cg-text placeholder:text-cg-muted outline-none"
            style={{ maxHeight: '200px' }}
          />
          <button
            className="rounded-md p-1 text-cg-muted hover:bg-cg-hover hover:text-cg-text"
            aria-label="Voice input"
            title="Voice input"
          >
            <Mic className="h-5 w-5" />
          </button>
          {isStreaming ? (
            <button
              onClick={onStop}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-cg-text text-cg-canvas hover:opacity-90"
              aria-label="Stop generating"
              title="Stop"
            >
              <Square className="h-3.5 w-3.5 fill-current" />
            </button>
          ) : (
            <button
              onClick={onSend}
              disabled={!value.trim()}
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-full',
                value.trim()
                  ? 'bg-cg-text text-cg-canvas hover:opacity-90'
                  : 'bg-cg-border text-cg-muted'
              )}
              aria-label="Send message"
              title="Send"
            >
              <Send className="h-4 w-4" />
            </button>
          )}
        </div>
        <p className="mt-2 text-center text-xs text-cg-muted">
          MAX can make mistakes. Check important info.
        </p>
      </div>
    </div>
  );
}
