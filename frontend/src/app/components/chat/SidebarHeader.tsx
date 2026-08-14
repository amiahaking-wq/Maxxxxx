'use client';
import { PanelLeftClose, PanelLeft } from 'lucide-react';
import { cn } from '@/app/lib/utils';

export function SidebarHeader({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <div className="flex items-center justify-between px-3 py-3">
      <span className="text-sm font-semibold text-cg-text">MAX</span>
      <button
        onClick={onToggle}
        className={cn(
          'rounded-md p-1.5 text-cg-muted hover:bg-cg-hover hover:text-cg-text',
          collapsed && 'hidden'
        )}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        <PanelLeftClose className="h-4 w-4" />
      </button>
      {collapsed && (
        <button
          onClick={onToggle}
          className="rounded-md p-1.5 text-cg-muted hover:bg-cg-hover hover:text-cg-text"
          aria-label="Expand sidebar"
          title="Expand sidebar"
        >
          <PanelLeft className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
