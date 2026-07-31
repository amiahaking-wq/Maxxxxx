'use client';
import { ChevronDown, Brain } from 'lucide-react';
import { useState } from 'react';

export function ThinkingBox({ reasoning, done }: { reasoning: string; done: boolean }) {
  const [isOpen, setIsOpen] = useState(!done);
  if (!reasoning || !reasoning.trim()) return null;
  return (
    <details className="mb-3 rounded-lg border border-amber-500/20 bg-amber-500/5 overflow-hidden"
      open={isOpen} onToggle={(e) => setIsOpen((e.target as HTMLDetailsElement).open)}>
      <summary className="flex items-center gap-2 px-3 py-2 cursor-pointer select-none hover:bg-amber-500/10">
        <Brain className="w-4 h-4 text-amber-400" />
        <span className="text-sm font-medium text-amber-400">
          {done ? '💭 Thinking (done)' : '💭 Thinking...'}
        </span>
        <ChevronDown className={`w-4 h-4 text-amber-400 ml-auto transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </summary>
      <div className="px-3 pb-3">
        <pre className="text-xs text-amber-200/70 whitespace-pre-wrap font-mono leading-relaxed">
          {reasoning}
        </pre>
      </div>
    </details>
  );
}
