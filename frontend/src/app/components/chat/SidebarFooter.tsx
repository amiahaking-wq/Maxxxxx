'use client';
import { Settings, User } from 'lucide-react';

export function SidebarFooter() {
  return (
    <div className="border-t border-cg-border p-2">
      <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-cg-text hover:bg-cg-hover">
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-cg-accent text-white">
          <User className="h-3.5 w-3.5" />
        </div>
        <span className="flex-1 text-left">User</span>
        <Settings className="h-4 w-4 text-cg-muted" />
      </button>
    </div>
  );
}
