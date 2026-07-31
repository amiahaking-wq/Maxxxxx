'use client';
import { useChat } from '@/app/hooks/useChat';
import { MessageBubble } from './MessageBubble';
import { InputBar } from './InputBar';
import { useParams } from 'next/navigation';

export function ChatContainer() {
  const params = useParams();
  const sessionId = (params.sessionId as string) || 'default';
  const { messages, isStreaming, sendMessage, stopGeneration } = useChat(sessionId);
  return (
    <div className="flex flex-col h-full bg-gray-950">
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full text-gray-500">
            <div className="text-center">
              <h2 className="text-2xl font-bold mb-2">MAX Agent</h2>
              <p>How can I help you today?</p>
            </div>
          </div>
        )}
        {messages.map(msg => <MessageBubble key={msg.id} message={msg} />)}
      </div>
      <div className="border-t border-gray-800 p-4">
        <InputBar onSend={sendMessage} isStreaming={isStreaming} onStop={stopGeneration} />
      </div>
    </div>
  );
}
