'use client';
import { useState } from 'react';
import { Share2, Copy, Check, X, Trash2, ExternalLink } from 'lucide-react';
import { cn } from '@/app/lib/utils';

interface SharedLink {
  id: string;
  conversationId: string;
  title: string;
  url: string;
  expiresAt?: string;
  createdAt: string;
  messageCount: number;
}

interface ExistingLink {
  id: string;
  conversationId: string;
  title: string;
  viewCount: number;
  expiresAt?: string;
  createdAt: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  conversationId: string | null;
  conversationTitle: string;
  existingLinks: ExistingLink[];
  onCreated: () => void;
  onDeleted: (id: string) => void;
}

export function ShareDialog({ open, onClose, conversationId, conversationTitle, existingLinks, onCreated, onDeleted }: Props) {
  const [creating, setCreating] = useState(false);
  const [newLink, setNewLink] = useState<SharedLink | null>(null);
  const [copied, setCopied] = useState(false);
  const [expiresInDays, setExpiresInDays] = useState<number>(0); // 0 = never
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleCreate = async () => {
    if (!conversationId) return;
    setCreating(true);
    setError(null);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('max_token') : null;
      const res = await fetch('/api/shared', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          conversationId,
          title: conversationTitle,
          expiresInDays: expiresInDays > 0 ? expiresInDays : undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to create shared link');
      }
      const data = await res.json();
      setNewLink(data.sharedLink);
      onCreated();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCreating(false);
    }
  };

  const handleCopy = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this shared link? Anyone with the URL will no longer be able to view it.')) return;
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('max_token') : null;
      await fetch(`/api/shared/${id}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      onDeleted(id);
      if (newLink?.id === id) setNewLink(null);
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl border border-cg-border bg-cg-canvas p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-cg-text">
            <Share2 className="h-5 w-5" /> Share conversation
          </h2>
          <button onClick={onClose} className="rounded-md p-1 text-cg-muted hover:bg-cg-hover">
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Create new link */}
        {!newLink && (
          <div className="mb-4">
            <label className="mb-1 block text-sm font-medium text-cg-text">
              Expiration
            </label>
            <select
              value={expiresInDays}
              onChange={(e) => setExpiresInDays(Number(e.target.value))}
              className="mb-3 w-full rounded-lg border border-cg-border bg-cg-canvas px-3 py-2 text-sm text-cg-text"
            >
              <option value={0}>Never expires</option>
              <option value={1}>1 day</option>
              <option value={7}>7 days</option>
              <option value={30}>30 days</option>
              <option value={90}>90 days</option>
            </select>
            <button
              onClick={handleCreate}
              disabled={creating || !conversationId}
              className="w-full rounded-lg bg-cg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {creating ? 'Creating...' : 'Create shared link'}
            </button>
          </div>
        )}

        {/* New link created — show URL */}
        {newLink && (
          <div className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3">
            <div className="mb-2 text-sm font-medium text-green-800">Link created!</div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newLink.url}
                readOnly
                className="flex-1 rounded border border-cg-border bg-cg-canvas px-2 py-1 text-xs text-cg-text"
              />
              <button
                onClick={() => handleCopy(newLink.url)}
                className="rounded-md p-1.5 text-cg-muted hover:bg-cg-hover hover:text-cg-text"
                title="Copy URL"
              >
                {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
              </button>
              <a
                href={newLink.url}
                target="_blank"
                rel="noreferrer"
                className="rounded-md p-1.5 text-cg-muted hover:bg-cg-hover hover:text-cg-text"
                title="Open in new tab"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            </div>
            <button
              onClick={() => setNewLink(null)}
              className="mt-2 text-xs text-cg-accent hover:underline"
            >
              Create another
            </button>
          </div>
        )}

        {/* Existing links for this conversation */}
        {existingLinks.length > 0 && (
          <div>
            <div className="mb-2 text-sm font-medium text-cg-text">Existing links</div>
            <div className="space-y-2">
              {existingLinks.map(link => (
                <div key={link.id} className="flex items-center justify-between rounded-lg border border-cg-border px-3 py-2">
                  <div className="flex-1 overflow-hidden">
                    <div className="truncate text-sm font-medium text-cg-text">{link.title}</div>
                    <div className="text-xs text-cg-muted">
                      {link.viewCount} view{link.viewCount !== 1 ? 's' : ''}
                      {link.expiresAt && ` · expires ${new Date(link.expiresAt).toLocaleDateString()}`}
                      {' · created ' + new Date(link.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(link.id)}
                    className="rounded-md p-1.5 text-cg-muted hover:bg-cg-hover hover:text-red-600"
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
