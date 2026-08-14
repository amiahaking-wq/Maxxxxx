'use client';
import { Message } from '@/app/lib/types';
import { EmptyState } from './EmptyState';
import { MessageBubble } from './MessageBubble';
import { StreamingCursor } from './StreamingCursor';

interface Props {
  messages: Message[];
  setInputValue: (v: string) => void;
}

export function MessagesArea({ messages, setInputValue }: Props) {
  const isEmpty = messages.length === 0;

  return (
    <div className="flex-1 overflow-y-auto bg-cg-canvas">
      {isEmpty ? (
        <EmptyState onSuggestionClick={(text) => setInputValue(text)} />
      ) : (
        <div className="mx-auto max-w-3xl px-4 py-6">
          {messages.map(msg => (
            <MessageBubble key={msg.id} message={msg} />
          ))}
          {/* Show streaming cursor at the end if last message is still streaming */}
          {messages.length > 0 && messages[messages.length - 1].isStreaming && (
            <div className="mb-6 ml-11">
              <StreamingCursor />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
