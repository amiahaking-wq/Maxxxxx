'use client';
import { Message } from '@/app/lib/types';
import { ThinkingBox } from './ThinkingBox';
import { ModelBadge } from './ModelBadge';
import { ToolCallCard } from './ToolCallCard';
import { ArtifactCard } from './ArtifactCard';
import { MarkdownRenderer } from './MarkdownRenderer';
import { MessageActions } from './MessageActions';
import { UserMessage } from './UserMessage';
import { Bot } from 'lucide-react';

interface Props {
  message: Message;
  onRegenerate?: () => void;
  onFeedback?: (messageId: string, f: 'up' | 'down') => void;
  onEditUserMessage?: (messageId: string, newContent: string) => void;
}

export function MessageBubble({ message, onRegenerate, onFeedback, onEditUserMessage }: Props) {
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';

  if (isUser) {
    return (
      <UserMessage
        message={message}
        onEdit={onEditUserMessage ? (newContent) => onEditUserMessage(message.id, newContent) : undefined}
      />
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

      {/* Artifacts (files created by agent) */}
      {message.artifacts && message.artifacts.length > 0 && (
        <div className="mb-3 space-y-2">
          {message.artifacts.map(a => <ArtifactCard key={a.id} artifact={a} />)}
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
