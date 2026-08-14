'use client';
import { useState } from 'react';
import { useGPTs } from '@/app/hooks/useGPTs';
import { GptEditor } from './GptEditor';
import { CustomGPT } from '@/app/lib/types';
import { Plus, Pencil, Bot, X } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  onSelectGpt?: (gpt: CustomGPT) => void;
}

export function MyGptsPanel({ open, onClose, onSelectGpt }: Props) {
  const { gpts, create, update, remove } = useGPTs();
  const [editing, setEditing] = useState<CustomGPT | null>(null);
  const [creating, setCreating] = useState(false);

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      <div className="fixed right-0 top-0 z-40 h-full w-96 max-w-[90vw] overflow-y-auto border-l border-cg-border bg-cg-sidebar p-4">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-cg-text">My GPTs</h2>
          <div className="flex gap-1">
            <button
              onClick={() => { setEditing(null); setCreating(true); }}
              className="rounded-md p-1.5 text-cg-muted hover:bg-cg-hover hover:text-cg-text"
              title="Create new GPT"
            >
              <Plus className="h-4 w-4" />
            </button>
            <button onClick={onClose} className="rounded-md p-1.5 text-cg-muted hover:bg-cg-hover hover:text-cg-text">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {gpts.length === 0 ? (
          <div className="mt-8 text-center">
            <Bot className="mx-auto mb-2 h-10 w-10 text-cg-muted" />
            <p className="text-sm text-cg-muted">No GPTs yet</p>
            <button
              onClick={() => { setEditing(null); setCreating(true); }}
              className="mt-3 rounded-lg bg-cg-accent px-4 py-2 text-sm text-white hover:opacity-90"
            >
              Create your first GPT
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {gpts.map(gpt => (
              <div
                key={gpt.id}
                className="group flex items-center gap-3 rounded-lg border border-cg-border bg-cg-canvas p-3 hover:bg-cg-hover"
              >
                <div
                  className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white"
                  style={{ backgroundColor: gpt.iconColor || '#10a37f' }}
                >
                  {gpt.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 overflow-hidden">
                  <div className="truncate text-sm font-medium text-cg-text">{gpt.name}</div>
                  <div className="truncate text-xs text-cg-muted">
                    {gpt.description || (gpt.visibility === 'public' ? 'Public' : 'Private')}
                    {' · '}{gpt.usageCount} use{gpt.usageCount !== 1 ? 's' : ''}
                  </div>
                </div>
                {onSelectGpt && (
                  <button
                    onClick={() => { onSelectGpt(gpt); onClose(); }}
                    className="rounded-md px-2 py-1 text-xs text-cg-accent hover:bg-cg-hover"
                  >
                    Use
                  </button>
                )}
                <button
                  onClick={() => { setEditing(gpt); setCreating(true); }}
                  className="rounded-md p-1 text-cg-muted opacity-0 hover:bg-cg-hover hover:text-cg-text group-hover:opacity-100"
                  title="Edit"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <GptEditor
        open={creating}
        gpt={editing}
        onClose={() => { setCreating(false); setEditing(null); }}
        onSave={async (data) => {
          if (editing) {
            const ok = await update(editing.id, data);
            return !!ok;
          } else {
            const ok = await create(data);
            return !!ok;
          }
        }}
        onDelete={editing ? async (id) => await remove(id) : undefined}
      />
    </>
  );
}
