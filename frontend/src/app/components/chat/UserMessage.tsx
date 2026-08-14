'use client';
import { useState, useRef, useEffect } from 'react';
import { Message } from '@/app/lib/types';
import { Pencil, Check, X } from 'lucide-react';

interface Props {
  message: Message;
  onEdit?: (newContent: string) => void;
}

export function UserMessage({ message, onEdit }: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(message.content);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isEditing) {
      textareaRef.current?.focus();
      // Auto-resize
      const ta = textareaRef.current;
      if (ta) {
        ta.style.height = 'auto';
        ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
      }
    }
  }, [isEditing]);

  const saveEdit = () => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== message.content && onEdit) {
      onEdit(trimmed);
    } else {
      setEditValue(message.content);
    }
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <div className="mb-6 flex flex-col items-end gap-2">
        <div className="max-w-[75%] rounded-3xl border border-cg-accent bg-cg-bubble px-4 py-2.5">
          <textarea
            ref={textareaRef}
            value={editValue}
            onChange={(e) => {
              setEditValue(e.target.value);
              const ta = e.target;
              ta.style.height = 'auto';
              ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit(); }
              if (e.key === 'Escape') { setEditValue(message.content); setIsEditing(false); }
            }}
            className="w-full resize-none bg-transparent text-[15px] text-cg-text outline-none"
            rows={1}
          />
        </div>
        <div className="flex gap-1">
          <button onClick={saveEdit} className="rounded-md p-1.5 text-cg-accent hover:bg-cg-hover" aria-label="Save">
            <Check className="h-4 w-4" />
          </button>
          <button onClick={() => { setEditValue(message.content); setIsEditing(false); }} className="rounded-md p-1.5 text-cg-muted hover:bg-cg-hover" aria-label="Cancel">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="group mb-6 flex justify-end items-start gap-2">
      <button
        onClick={() => setIsEditing(true)}
        className="mt-1 rounded-md p-1.5 text-cg-muted opacity-0 hover:bg-cg-hover hover:text-cg-text group-hover:opacity-100"
        aria-label="Edit message"
        title="Edit"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
      <div className="max-w-[75%] whitespace-pre-wrap break-words rounded-3xl bg-cg-bubble px-4 py-2.5 text-[15px] text-cg-text">
        {message.content}
      </div>
    </div>
  );
}
