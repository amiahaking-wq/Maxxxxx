'use client';
import { useState, KeyboardEvent } from 'react';
import { Send, Paperclip, Square } from 'lucide-react';

export function InputBar({ onSend, isStreaming, onStop }: {
  onSend: (content: string) => void; isStreaming: boolean; onStop: () => void;
}) {
  const [input, setInput] = useState('');
  const handleSend = () => {
    if (!input.trim()) return;
    onSend(input); setInput('');
  };
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };
  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-end gap-2 bg-gray-900 rounded-2xl border border-gray-700 p-3">
        <button className="p-2 text-gray-400 hover:text-white"><Paperclip className="w-5 h-5" /></button>
        <textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown}
          placeholder="Message MAX..." rows={1}
          className="flex-1 bg-transparent text-white placeholder-gray-500 resize-none outline-none max-h-32"
          disabled={isStreaming} />
        {isStreaming ? (
          <button onClick={onStop} className="p-2 text-red-400 hover:text-red-300">
            <Square className="w-5 h-5 fill-current" />
          </button>
        ) : (
          <button onClick={handleSend} className="p-2 bg-orange-600 text-white rounded-xl hover:bg-orange-500">
            <Send className="w-5 h-5" />
          </button>
        )}
      </div>
      <p className="text-center text-xs text-gray-600 mt-2">MAX can make mistakes. Always verify important results.</p>
    </div>
  );
}
