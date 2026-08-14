'use client';
import { useState, KeyboardEvent, useRef, useEffect } from 'react';
import { Send, Paperclip, Square, Mic, MicOff } from 'lucide-react';
import { cn } from '@/app/lib/utils';
import { useVoiceInput } from '@/app/hooks/useVoiceInput';
import { useFileUpload } from '@/app/hooks/useFileUpload';
import { AttachmentPreview } from './AttachmentPreview';

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSend: (attachments?: any[]) => void;
  isStreaming: boolean;
  onStop: () => void;
}

export function InputBar({ value, onChange, onSend, isStreaming, onStop }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { isListening, transcript, interimTranscript, start, stop, reset } = useVoiceInput();
  const {
    attachments,
    uploading,
    error: uploadError,
    fileInputRef,
    addFiles,
    removeAttachment,
    clearAttachments,
    openFilePicker,
    handleFileInputChange,
  } = useFileUpload();
  const lastTranscriptRef = useRef('');

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
  }, [value]);

  useEffect(() => {
    if (transcript && transcript !== lastTranscriptRef.current) {
      const newValue = value ? `${value} ${transcript}`.trim() : transcript;
      onChange(newValue);
      lastTranscriptRef.current = transcript;
      reset();
    }
  }, [transcript, value, onChange, reset]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSend = () => {
    if ((!value.trim() && attachments.length === 0) || isStreaming) return;
    if (isListening) stop();
    onSend(attachments);
    clearAttachments();
  };

  const handleMicClick = () => {
    if (isListening) stop();
    else { lastTranscriptRef.current = ''; start(); }
  };

  // Drag-and-drop support
  const [isDragging, setIsDragging] = useState(false);
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  };

  return (
    <div className="border-t border-cg-border bg-cg-canvas px-4 py-3">
      <div className="mx-auto max-w-3xl">
        {/* Attachment previews */}
        <AttachmentPreview
          attachments={attachments}
          onRemove={removeAttachment}
          uploading={uploading}
        />
        {uploadError && (
          <div className="mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-700">
            {uploadError}
          </div>
        )}

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleFileInputChange}
          className="hidden"
          accept="image/*,.txt,.md,.json,.yaml,.yml,.csv,.tsv,.pdf,.xlsx,.xls,.doc,.docx,.py,.js,.ts,.tsx,.jsx,.go,.rs,.java,.c,.cpp,.h,.cs,.php,.html,.css,.scss,.sh,.sql,.xml,.env"
        />

        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={cn(
            'flex items-end gap-2 rounded-[28px] border bg-cg-canvas px-4 py-3 shadow-sm transition-colors focus-within:border-cg-accent/50',
            isListening ? 'border-red-400 ring-2 ring-red-100' : '',
            isDragging ? 'border-cg-accent ring-2 ring-cg-accent/20' : 'border-cg-border'
          )}
        >
          <button
            onClick={openFilePicker}
            className="rounded-md p-1 text-cg-muted hover:bg-cg-hover hover:text-cg-text"
            aria-label="Attach file"
            title="Attach file"
          >
            <Paperclip className="h-5 w-5" />
          </button>
          <div className="flex-1">
            <textarea
              ref={textareaRef}
              value={value + (isListening && interimTranscript ? ' ' + interimTranscript : '')}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isListening ? 'Listening...' : isDragging ? 'Drop files here...' : 'Message MAX...'}
              rows={1}
              className="w-full resize-none bg-transparent text-[15px] text-cg-text placeholder:text-cg-muted outline-none"
              style={{ maxHeight: '200px' }}
            />
          </div>
          <button
            onClick={handleMicClick}
            className={cn(
              'rounded-md p-1 hover:bg-cg-hover',
              isListening ? 'text-red-500 hover:text-red-600' : 'text-cg-muted hover:text-cg-text'
            )}
            aria-label={isListening ? 'Stop voice input' : 'Start voice input'}
            title={isListening ? 'Stop voice input' : 'Voice input'}
          >
            {isListening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          </button>
          {isStreaming ? (
            <button
              onClick={onStop}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-cg-text text-cg-canvas hover:opacity-90"
              aria-label="Stop generating"
              title="Stop"
            >
              <Square className="h-3.5 w-3.5 fill-current" />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!value.trim() && attachments.length === 0}
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-full',
                (value.trim() || attachments.length > 0)
                  ? 'bg-cg-text text-cg-canvas hover:opacity-90'
                  : 'bg-cg-border text-cg-muted'
              )}
              aria-label="Send message"
              title="Send"
            >
              <Send className="h-4 w-4" />
            </button>
          )}
        </div>
        <p className="mt-2 text-center text-xs text-cg-muted">
          MAX can make mistakes. Check important info.
        </p>
      </div>
    </div>
  );
}
