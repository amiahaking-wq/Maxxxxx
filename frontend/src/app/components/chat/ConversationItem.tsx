'use client';
import { useState, useRef, useEffect } from 'react';
import { Conversation } from '@/app/lib/types';
import { cn, formatRelativeTime } from '@/app/lib/utils';
import { MoreHorizontal, Pencil, Trash2, Check, X } from 'lucide-react';

interface Props {
  conversation: Conversation;
  isActive: boolean;
  onSelect: () => void;
  onRename?: (newTitle: string) => void;
  onDelete?: () => void;
}

export function ConversationItem({ conversation, isActive, onSelect, onRename, onDelete }: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(conversation.title);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing) inputRef.current?.focus();
  }, [isEditing]);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  const saveRename = () => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== conversation.title && onRename) {
      onRename(trimmed);
    } else {
      setEditValue(conversation.title);
    }
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <div className="flex items-center gap-1 rounded-lg px-2 py-1.5">
        <input
          ref={inputRef}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') saveRename();
            if (e.key === 'Escape') { setEditValue(conversation.title); setIsEditing(false); }
          }}
          className="flex-1 rounded border border-cg-accent bg-transparent px-2 py-1 text-sm text-cg-text outline-none"
        />
        <button onClick={saveRename} className="rounded p-1 hover:bg-cg-hover"><Check className="h-3.5 w-3.5" /></button>
        <button onClick={() => { setEditValue(conversation.title); setIsEditing(false); }} className="rounded p-1 hover:bg-cg-hover"><X className="h-3.5 w-3.5" /></button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'group relative flex items-center rounded-lg px-3 py-2 text-sm cursor-pointer',
        isActive ? 'bg-cg-hover text-cg-text' : 'text-cg-text hover:bg-cg-hover'
      )}
      onClick={onSelect}
    >
      <span className="flex-1 truncate">{conversation.title}</span>

      {/* Hover menu trigger */}
      <div className="relative" ref={menuRef}>
        <button
          onClick={(e) => { e.stopPropagation(); setMenuOpen(o => !o); }}
          className={cn(
            'rounded p-1 text-cg-muted hover:bg-cg-hover hover:text-cg-text',
            menuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          )}
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-7 z-10 w-40 rounded-lg border border-cg-border bg-cg-canvas py-1 shadow-lg">
            {onRename && (
              <button
                onClick={(e) => { e.stopPropagation(); setMenuOpen(false); setIsEditing(true); }}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-cg-text hover:bg-cg-hover"
              >
                <Pencil className="h-3.5 w-3.5" /> Rename
              </button>
            )}
            {onDelete && (
              <button
                onClick={(e) => { e.stopPropagation(); setMenuOpen(false); if (confirm('Delete this conversation?')) onDelete(); }}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-cg-hover"
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
