'use client';
import { ChevronDown } from 'lucide-react';

export function ScrollToBottomButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="absolute bottom-4 left-1/2 flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full border border-cg-border bg-cg-canvas shadow-md hover:bg-cg-hover"
      aria-label="Scroll to bottom"
      title="Scroll to bottom"
    >
      <ChevronDown className="h-4 w-4 text-cg-text" />
    </button>
  );
}
