'use client';
import { Message } from '@/app/lib/types';
import { ThinkingBox } from './ThinkingBox';
import { ModelBadge } from './ModelBadge';
import { ToolCallCard } from './ToolCallCard';
import { MarkdownRenderer } from './MarkdownRenderer';
import { MessageActions } from './MessageActions';
import { Bot } from 'lucide-react';

interface Props {
  message: Message;
  onRegenerate?: () => void;
  onFeedback?: (messageId: string, f: 'up' | 'down') => void;
}

export function MessageBubble({ message, onRegenerate, onFeedback }: Props) {
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';

  if (isUser) {
    // ChatGPT style: user messages are right-aligned gray bubbles
    return (
      <div className="mb-6 flex justify-end">
        <div className="max-w-[75%] whitespace-pre-wrap break-words rounded-3xl bg-cg-bubble px-4 py-2.5 text-[15px] text-cg-text">
          {message.content}
        </div>
      </div>
    );
  }

  // Assistant messages: NO bubble, bare text on canvas, left-aligned
  return (
    <div className="group mb-6">
      {/* Avatar row */}
      <div className="mb-2 flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-cg-accent text-white">
          <Bot className="h-4 w-4" />
        </div>
        <span className="text-sm font-semibold text-cg-text">MAX</span>
      </div>

      {/* Reasoning (collapsible) */}
      {isAssistant && message.reasoning && (
        <ThinkingBox reasoning={message.reasoning} done={message.reasoningDone || false} />
      )}

      {/* Tool calls */}
      {message.toolCalls && message.toolCalls.length > 0 && (
        <div className="mb-3 space-y-2">
          {message.toolCalls.map(tc => <ToolCallCard key={tc.id} toolCall={tc} />)}
        </div>
      )}

      {/* Main content — markdown rendered for assistant */}
      {message.content && (
        <MarkdownRenderer content={message.content} />
      )}

      {/* Message actions (visible on hover) */}
      {isAssistant && message.content && !message.isStreaming && (
        <MessageActions
          content={message.content}
          onRegenerate={onRegenerate}
          feedback={message.feedback}
          onFeedback={(f) => onFeedback?.(message.id, f)}
        />
      )}

      {/* Model badge */}
      {isAssistant && <ModelBadge provider={message.provider} model={message.model} />}
    </div>
  );
}
