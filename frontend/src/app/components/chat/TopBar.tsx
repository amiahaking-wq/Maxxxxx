'use client';
import { useApp } from './AppProvider';
import { useTheme } from './ThemeProvider';
import { Menu, Sun, Moon, Share, User } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

export function TopBar() {
  const { setMobileSidebarOpen } = useApp();
  const { theme, toggleTheme } = useTheme();
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!profileOpen) return;
    const handler = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [profileOpen]);

  return (
    <header className="flex h-12 items-center justify-between border-b border-cg-border bg-cg-canvas px-3">
      {/* Left: mobile hamburger + model selector placeholder */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setMobileSidebarOpen(true)}
          className="rounded-md p-1.5 text-cg-muted hover:bg-cg-hover hover:text-cg-text md:hidden"
          aria-label="Open sidebar"
        >
          <Menu className="h-5 w-5" />
        </button>
        <button className="rounded-md px-2 py-1 text-sm font-medium text-cg-text hover:bg-cg-hover">
          MAX <span className="text-cg-muted">·</span> <span className="text-cg-muted">Auto</span>
        </button>
      </div>

      {/* Right: theme toggle + share + profile */}
      <div className="flex items-center gap-1">
        <button
          onClick={toggleTheme}
          className="rounded-md p-1.5 text-cg-muted hover:bg-cg-hover hover:text-cg-text"
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
        <button
          className="rounded-md p-1.5 text-cg-muted hover:bg-cg-hover hover:text-cg-text"
          aria-label="Share conversation"
          title="Share"
        >
          <Share className="h-4 w-4" />
        </button>
        <div className="relative" ref={profileRef}>
          <button
            onClick={() => setProfileOpen(o => !o)}
            className="flex h-7 w-7 items-center justify-center rounded-full border border-cg-border bg-cg-hover text-cg-text hover:bg-cg-hover"
            aria-label="Profile menu"
          >
            <User className="h-3.5 w-3.5" />
          </button>
          {profileOpen && (
            <div className="absolute right-0 top-9 z-10 w-48 rounded-lg border border-cg-border bg-cg-canvas py-1 shadow-lg">
              <div className="border-b border-cg-border px-3 py-2 text-sm">
                <div className="font-medium text-cg-text">User</div>
                <div className="text-xs text-cg-muted">user@example.com</div>
              </div>
              <button className="flex w-full items-center gap-2 px-3 py-2 text-sm text-cg-text hover:bg-cg-hover">
                <User className="h-3.5 w-3.5" /> Profile
              </button>
              <button className="flex w-full items-center gap-2 px-3 py-2 text-sm text-cg-text hover:bg-cg-hover">
                <Share className="h-3.5 w-3.5" /> Shared links
              </button>
              <button className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-cg-hover">
                Log out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
