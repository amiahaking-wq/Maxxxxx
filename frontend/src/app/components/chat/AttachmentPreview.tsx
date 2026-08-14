'use client';
import { Attachment } from '@/app/lib/types';
import { formatFileSize } from '@/app/hooks/useFileUpload';
import { X, FileText, Image as ImageIcon, Loader2 } from 'lucide-react';

interface Props {
  attachments: Attachment[];
  onRemove: (id: string) => void;
  uploading?: boolean;
}

export function AttachmentPreview({ attachments, onRemove, uploading }: Props) {
  if (attachments.length === 0 && !uploading) return null;

  return (
    <div className="flex flex-wrap gap-2 px-4 pt-2">
      {attachments.map(att => (
        <div
          key={att.id}
          className="group relative flex items-center gap-2 rounded-lg border border-cg-border bg-cg-sidebar py-1.5 pl-1.5 pr-2"
        >
          {att.type === 'image' && att.previewUrl ? (
            <img
              src={att.previewUrl}
              alt={att.filename}
              className="h-8 w-8 rounded object-cover"
            />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded bg-cg-hover">
              <FileText className="h-4 w-4 text-cg-muted" />
            </div>
          )}
          <div className="max-w-[140px]">
            <div className="truncate text-xs font-medium text-cg-text">{att.filename}</div>
            <div className="text-xs text-cg-muted">{formatFileSize(att.size)}</div>
          </div>
          <button
            onClick={() => onRemove(att.id)}
            className="rounded p-0.5 text-cg-muted hover:bg-cg-hover hover:text-cg-text"
            aria-label="Remove attachment"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
      {uploading && (
        <div className="flex items-center gap-2 rounded-lg border border-cg-border bg-cg-sidebar px-2 py-1.5">
          <Loader2 className="h-4 w-4 animate-spin text-cg-muted" />
          <span className="text-xs text-cg-muted">Uploading...</span>
        </div>
      )}
    </div>
  );
}
