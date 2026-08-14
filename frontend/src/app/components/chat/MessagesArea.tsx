'use client';
import { Message } from '@/app/lib/types';
import { EmptyState } from './EmptyState';
import { MessageBubble } from './MessageBubble';
import { StreamingCursor } from './StreamingCursor';
import { ScrollToBottomButton } from './ScrollToBottomButton';
import { useAutoScroll } from '@/app/hooks/useAutoScroll';

interface Props {
  messages: Message[];
  setInputValue: (v: string) => void;
  onRegenerate?: () => void;
  onFeedback?: (messageId: string, f: 'up' | 'down') => void;
}

export function MessagesArea({ messages, setInputValue, onRegenerate, onFeedback }: Props) {
  const isEmpty = messages.length === 0;
  const { containerRef, isPinned, scrollToBottom } = useAutoScroll([messages]);

  return (
    <div className="relative flex-1 overflow-hidden bg-cg-canvas">
      <div ref={containerRef} className="h-full overflow-y-auto">
        {isEmpty ? (
          <EmptyState onSuggestionClick={(text) => setInputValue(text)} />
        ) : (
          <div className="mx-auto max-w-3xl px-4 py-6">
            {messages.map(msg => (
              <MessageBubble
                key={msg.id}
                message={msg}
                onRegenerate={msg.role === 'assistant' ? onRegenerate : undefined}
                onFeedback={onFeedback}
              />
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

      {/* Scroll to bottom button */}
      {!isPinned && messages.length > 0 && (
        <ScrollToBottomButton onClick={() => scrollToBottom({ behavior: 'smooth' })} />
      )}
    </div>
  );
}
