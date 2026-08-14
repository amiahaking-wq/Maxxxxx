'use client';
import { useApp } from './AppProvider';
import { useTheme } from './ThemeProvider';
import { ModelSelector } from './ModelSelector';
import { ShareDialog } from './ShareDialog';
import { Menu, Sun, Moon, Share, User, FileJson, FileText, Printer } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { exportAsJson, exportAsText, exportAsPdf } from '@/app/lib/export';

export function TopBar({ messages = [] }: { messages?: Array<{ role: string; content: string; reasoning?: string; provider?: string; model?: string }> }) {
  const { setMobileSidebarOpen, currentConversationId, conversations } = useApp();
  const { theme, toggleTheme } = useTheme();
  const [profileOpen, setProfileOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [sharedLinks, setSharedLinks] = useState<Array<{ id: string; conversationId: string; title: string; viewCount: number; expiresAt?: string; createdAt: string }>>([]);
  const profileRef = useRef<HTMLDivElement>(null);
  const exportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false);
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setExportOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [profileOpen, exportOpen]);

  const currentConv = conversations.conversations.find(c => c.id === currentConversationId);
  const convTitle = currentConv?.title || 'Conversation';

  const handleExport = (format: 'json' | 'text' | 'pdf') => {
    setExportOpen(false);
    setProfileOpen(false);
    if (messages.length === 0) {
      alert('No messages to export yet.');
      return;
    }
    if (format === 'json') exportAsJson(messages as any, convTitle);
    else if (format === 'text') exportAsText(messages as any, convTitle);
    else if (format === 'pdf') exportAsPdf(messages as any, convTitle);
  };

  return (
    <header className="flex h-12 items-center justify-between border-b border-cg-border bg-cg-canvas px-3">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setMobileSidebarOpen(true)}
          className="rounded-md p-1.5 text-cg-muted hover:bg-cg-hover hover:text-cg-text md:hidden"
          aria-label="Open sidebar"
        >
          <Menu className="h-5 w-5" />
        </button>
        <ModelSelector />
      </div>

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
          onClick={async () => {
            setShareOpen(true);
            // Load existing shared links for this conversation
            if (currentConversationId) {
              try {
                const token = typeof window !== 'undefined' ? localStorage.getItem('max_token') : null;
                const res = await fetch('/api/shared', {
                  headers: token ? { Authorization: `Bearer ${token}` } : {},
                });
                if (res.ok) {
                  const data = await res.json();
                  setSharedLinks((data.sharedLinks || []).filter((l: any) => l.conversationId === currentConversationId));
                }
              } catch {}
            }
          }}
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
            <div className="absolute right-0 top-9 z-20 w-56 rounded-lg border border-cg-border bg-cg-canvas py-1 shadow-lg">
              <div className="border-b border-cg-border px-3 py-2 text-sm">
                <div className="font-medium text-cg-text">User</div>
                <div className="text-xs text-cg-muted">user@example.com</div>
              </div>

              {/* Export submenu */}
              <div className="relative" ref={exportRef}>
                <button
                  onClick={() => setExportOpen(o => !o)}
                  className="flex w-full items-center justify-between px-3 py-2 text-sm text-cg-text hover:bg-cg-hover"
                >
                  <span className="flex items-center gap-2">
                    <FileText className="h-3.5 w-3.5" /> Export
                  </span>
                  <span className="text-xs text-cg-muted">›</span>
                </button>
                {exportOpen && (
                  <div className="absolute left-56 top-0 z-30 w-44 rounded-lg border border-cg-border bg-cg-canvas py-1 shadow-lg">
                    <button
                      onClick={() => handleExport('pdf')}
                      className="flex w-full items-center gap-2 px-3 py-2 text-sm text-cg-text hover:bg-cg-hover"
                    >
                      <Printer className="h-3.5 w-3.5" /> PDF (print)
                    </button>
                    <button
                      onClick={() => handleExport('json')}
                      className="flex w-full items-center gap-2 px-3 py-2 text-sm text-cg-text hover:bg-cg-hover"
                    >
                      <FileJson className="h-3.5 w-3.5" /> JSON
                    </button>
                    <button
                      onClick={() => handleExport('text')}
                      className="flex w-full items-center gap-2 px-3 py-2 text-sm text-cg-text hover:bg-cg-hover"
                    >
                      <FileText className="h-3.5 w-3.5" /> Markdown
                    </button>
                  </div>
                )}
              </div>

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

      <ShareDialog
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        conversationId={currentConversationId}
        conversationTitle={convTitle}
        existingLinks={sharedLinks}
        onCreated={() => {
          // Refresh the list after creating
          if (currentConversationId) {
            fetch('/api/shared', {
              headers: typeof window !== 'undefined' && localStorage.getItem('max_token')
                ? { Authorization: `Bearer ${localStorage.getItem('max_token')}` }
                : {},
            }).then(r => r.json()).then(data => {
              setSharedLinks((data.sharedLinks || []).filter((l: any) => l.conversationId === currentConversationId));
            }).catch(() => {});
          }
        }}
        onDeleted={(id) => setSharedLinks(prev => prev.filter(l => l.id !== id))}
      />
    </header>
  );
}
