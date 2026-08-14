'use client';
import { useState, useEffect } from 'react';
import { CustomGPT } from '@/app/lib/types';
import { Search, Bot, X, TrendingUp } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  onSelectGpt: (gpt: CustomGPT) => void;
}

const CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'writing', label: 'Writing' },
  { id: 'productivity', label: 'Productivity' },
  { id: 'programming', label: 'Programming' },
  { id: 'education', label: 'Education' },
  { id: 'lifestyle', label: 'Lifestyle' },
  { id: 'business', label: 'Business' },
  { id: 'research', label: 'Research' },
  { id: 'other', label: 'Other' },
];

export function GptStore({ open, onClose, onSelectGpt }: Props) {
  const [gpts, setGpts] = useState<CustomGPT[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    const params = new URLSearchParams();
    if (category !== 'all') params.set('category', category);
    if (search) params.set('search', search);
    fetch(`/api/gpts/store?${params}`)
      .then(r => r.json())
      .then(data => setGpts(data.gpts || []))
      .catch(() => setGpts([]))
      .finally(() => setLoading(false));
  }, [open, category, search]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-2xl border border-cg-border bg-cg-canvas shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-cg-border px-6 py-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-cg-text">
            <Bot className="h-5 w-5" /> GPT Store
          </h2>
          <button onClick={onClose} className="rounded-md p-1 text-cg-muted hover:bg-cg-hover">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Search + categories */}
        <div className="border-b border-cg-border px-6 py-3">
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cg-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search GPTs..."
              className="w-full rounded-lg border border-cg-border bg-cg-canvas py-2 pl-9 pr-3 text-sm text-cg-text"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map(c => (
              <button
                key={c.id}
                onClick={() => setCategory(c.id)}
                className={`rounded-full px-3 py-1 text-xs ${
                  category === c.id
                    ? 'bg-cg-accent text-white'
                    : 'border border-cg-border text-cg-muted hover:bg-cg-hover'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {/* GPT grid */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="py-12 text-center text-cg-muted">Loading...</div>
          ) : gpts.length === 0 ? (
            <div className="py-12 text-center text-cg-muted">No GPTs found</div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {gpts.map(gpt => (
                <button
                  key={gpt.id}
                  onClick={() => { onSelectGpt(gpt); onClose(); }}
                  className="group flex flex-col gap-2 rounded-xl border border-cg-border p-4 text-left hover:border-cg-accent hover:shadow-md"
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-lg text-base font-bold text-white"
                      style={{ backgroundColor: gpt.iconColor || '#10a37f' }}
                    >
                      {gpt.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <div className="truncate text-sm font-semibold text-cg-text">{gpt.name}</div>
                      {gpt.category && (
                        <div className="text-xs text-cg-muted capitalize">{gpt.category}</div>
                      )}
                    </div>
                  </div>
                  <div className="line-clamp-2 text-xs text-cg-muted">
                    {gpt.description || 'No description'}
                  </div>
                  <div className="mt-auto flex items-center gap-1 text-xs text-cg-muted">
                    <TrendingUp className="h-3 w-3" />
                    {gpt.usageCount || 0} use{(gpt.usageCount || 0) !== 1 ? 's' : ''}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
