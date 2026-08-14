'use client';
import { ChevronDown, Brain } from 'lucide-react';
import { useState } from 'react';

export function ThinkingBox({ reasoning, done }: { reasoning: string; done: boolean }) {
  const [isOpen, setIsOpen] = useState(!done);
  if (!reasoning || !reasoning.trim()) return null;

  return (
    <details
      className="mb-3 overflow-hidden rounded-lg border border-cg-border bg-cg-sidebar"
      open={isOpen}
      onToggle={(e) => setIsOpen((e.target as HTMLDetailsElement).open)}
    >
      <summary className="flex cursor-pointer select-none items-center gap-2 px-3 py-2 text-sm hover:bg-cg-hover">
        <Brain className="h-4 w-4 text-cg-muted" />
        <span className="font-medium text-cg-muted">
          {done ? `Thought process` : 'Thinking...'}
        </span>
        <ChevronDown
          className={`ml-auto h-4 w-4 text-cg-muted transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </summary>
      <div className="border-t border-cg-border px-3 py-3">
        <pre className="whitespace-pre-wrap text-xs text-cg-muted leading-relaxed">
          {reasoning}
        </pre>
      </div>
    </details>
  );
}
