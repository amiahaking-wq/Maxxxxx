'use client';
import { useState, useEffect } from 'react';
import { CustomGPT } from '@/app/lib/types';
import { X, Trash2, Save } from 'lucide-react';

const ICON_COLORS = [
  '#10a37f', '#3b82f6', '#8b5cf6', '#ec4899',
  '#f59e0b', '#ef4444', '#06b6d4', '#84cc16',
];

interface Props {
  open: boolean;
  onClose: () => void;
  gpt?: CustomGPT | null; // null = creating new
  onSave: (data: Partial<CustomGPT>) => Promise<boolean>;
  onDelete?: (id: string) => Promise<boolean>;
}

export function GptEditor({ open, onClose, gpt, onSave, onDelete }: Props) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [instructions, setInstructions] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [iconColor, setIconColor] = useState(ICON_COLORS[0]);
  const [visibility, setVisibility] = useState<'private' | 'public'>('private');
  const [category, setCategory] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(gpt?.name || '');
      setDescription(gpt?.description || '');
      setInstructions(gpt?.instructions || '');
      setSystemPrompt(gpt?.systemPrompt || '');
      setIconColor(gpt?.iconColor || ICON_COLORS[0]);
      setVisibility(gpt?.visibility === 'public' ? 'public' : 'private');
      setCategory(gpt?.category || '');
      setError(null);
    }
  }, [open, gpt]);

  if (!open) return null;

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    setSaving(true);
    setError(null);
    const ok = await onSave({
      name: name.trim(),
      description,
      instructions,
      systemPrompt,
      iconColor,
      visibility,
      category: category || undefined,
    });
    setSaving(false);
    if (ok) onClose();
    else setError('Failed to save');
  };

  const handleDelete = async () => {
    if (!gpt?.id || !onDelete) return;
    if (!confirm(`Delete "${gpt.name}"? This cannot be undone.`)) return;
    const ok = await onDelete(gpt.id);
    if (ok) onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-cg-border bg-cg-canvas p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-cg-text">
            {gpt ? 'Edit GPT' : 'Create new GPT'}
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

        {/* Icon + Name */}
        <div className="mb-4 flex items-center gap-3">
          <div
            className="flex h-12 w-12 items-center justify-center rounded-xl text-lg font-bold text-white"
            style={{ backgroundColor: iconColor }}
          >
            {name.charAt(0).toUpperCase() || 'G'}
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-cg-muted">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Code Reviewer"
              className="w-full rounded-lg border border-cg-border bg-cg-canvas px-3 py-2 text-sm text-cg-text"
            />
          </div>
        </div>

        {/* Icon color picker */}
        <div className="mb-4">
          <label className="mb-1 block text-xs font-medium text-cg-muted">Icon color</label>
          <div className="flex gap-2">
            {ICON_COLORS.map(c => (
              <button
                key={c}
                onClick={() => setIconColor(c)}
                className={`h-8 w-8 rounded-full ${iconColor === c ? 'ring-2 ring-offset-2 ring-cg-accent' : ''}`}
                style={{ backgroundColor: c }}
                aria-label={`Color ${c}`}
              />
            ))}
          </div>
        </div>

        {/* Description */}
        <div className="mb-4">
          <label className="mb-1 block text-xs font-medium text-cg-muted">Description</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What does this GPT do?"
            className="w-full rounded-lg border border-cg-border bg-cg-canvas px-3 py-2 text-sm text-cg-text"
          />
        </div>

        {/* Instructions */}
        <div className="mb-4">
          <label className="mb-1 block text-xs font-medium text-cg-muted">
            Instructions (what the GPT should do)
          </label>
          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="You are a code reviewer. Analyze code for bugs, security issues, and style. Suggest improvements..."
            rows={4}
            className="w-full resize-none rounded-lg border border-cg-border bg-cg-canvas px-3 py-2 text-sm text-cg-text"
          />
        </div>

        {/* System Prompt (advanced) */}
        <div className="mb-4">
          <label className="mb-1 block text-xs font-medium text-cg-muted">
            System prompt (optional — overrides instructions)
          </label>
          <textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            placeholder="Leave empty to auto-generate from instructions"
            rows={3}
            className="w-full resize-none rounded-lg border border-cg-border bg-cg-canvas px-3 py-2 text-sm text-cg-text font-mono text-xs"
          />
        </div>

        {/* Visibility + Category */}
        <div className="mb-6 grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-cg-muted">Visibility</label>
            <select
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as 'private' | 'public')}
              className="w-full rounded-lg border border-cg-border bg-cg-canvas px-3 py-2 text-sm text-cg-text"
            >
              <option value="private">Private (only you)</option>
              <option value="public">Public (in GPT store)</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-cg-muted">Category (if public)</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-lg border border-cg-border bg-cg-canvas px-3 py-2 text-sm text-cg-text"
            >
              <option value="">None</option>
              <option value="writing">Writing</option>
              <option value="productivity">Productivity</option>
              <option value="programming">Programming</option>
              <option value="education">Education</option>
              <option value="lifestyle">Lifestyle</option>
              <option value="business">Business</option>
              <option value="research">Research</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-between gap-2">
          {gpt && onDelete ? (
            <button
              onClick={handleDelete}
              className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50"
            >
              <Trash2 className="h-4 w-4" /> Delete
            </button>
          ) : <div />}
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="rounded-lg border border-cg-border px-4 py-2 text-sm text-cg-text hover:bg-cg-hover"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1 rounded-lg bg-cg-accent px-4 py-2 text-sm text-white hover:opacity-90 disabled:opacity-50"
            >
              <Save className="h-4 w-4" /> {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
