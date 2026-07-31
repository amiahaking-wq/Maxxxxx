import { Message } from '@/app/lib/types';
import { ThinkingBox } from './ThinkingBox';
import { ModelBadge } from './ModelBadge';
import { ToolCallCard } from './ToolCallCard';
import { StreamingCursor } from './StreamingCursor';
import { User, Bot } from 'lucide-react';

export function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';
  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'} mb-6`}>
      <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${isUser ? 'bg-blue-600' : 'bg-orange-600'}`}>
        {isUser ? <User className="w-4 h-4 text-white" /> : <Bot className="w-4 h-4 text-white" />}
      </div>
      <div className={`flex flex-col max-w-[80%] ${isUser ? 'items-end' : 'items-start'}`}>
        {isAssistant && message.reasoning && (
          <ThinkingBox reasoning={message.reasoning} done={message.reasoningDone || false} />
        )}
        <div className={`rounded-2xl px-4 py-3 ${isUser ? 'bg-blue-600 text-white rounded-br-sm' : 'bg-gray-800 text-gray-100 rounded-bl-sm'}`}>
          <div className="prose prose-invert prose-sm max-w-none">
            {message.content}
            {message.isStreaming && <StreamingCursor />}
          </div>
        </div>
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="mt-2 space-y-2 w-full">
            {message.toolCalls.map(tc => <ToolCallCard key={tc.id} toolCall={tc} />)}
          </div>
        )}
        {isAssistant && <ModelBadge provider={message.provider} model={message.model} />}
      </div>
    </div>
  );
}
