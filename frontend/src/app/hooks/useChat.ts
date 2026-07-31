'use client';
import { useState, useCallback, useEffect, useRef } from 'react';
import { Message } from '@/app/lib/types';
import { getSocket, subscribeToSession } from '@/app/lib/socket';

export function useChat(sessionId: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesRef = useRef<Message[]>([]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  useEffect(() => {
    if (!sessionId) return;
    const cleanup = subscribeToSession(sessionId, {
      onToken: (data) => {
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last && last.role === 'assistant' && last.isStreaming) {
            const updated = [...prev];
            updated[updated.length - 1] = {
              ...last, content: last.content + (data.token || ''),
              provider: data.provider || last.provider, model: data.model || last.model,
            };
            return updated;
          }
          return prev;
        });
      },
      onReasoning: (data) => {
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last && last.role === 'assistant') {
            const updated = [...prev];
            updated[updated.length - 1] = {
              ...last, reasoning: data.reasoning, reasoningDone: data.done,
            };
            return updated;
          }
          return prev;
        });
      },
      onToolCall: (data) => {
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last && last.role === 'assistant') {
            const toolCalls = [...(last.toolCalls || [])];
            const existing = toolCalls.find(t => t.id === data.id);
            if (existing) Object.assign(existing, data);
            else toolCalls.push(data);
            const updated = [...prev];
            updated[updated.length - 1] = { ...last, toolCalls };
            return updated;
          }
          return prev;
        });
      },
      onModelBadge: (data) => {
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last && last.role === 'assistant') {
            const updated = [...prev];
            updated[updated.length - 1] = {
              ...last, provider: data.provider, model: data.model, isStreaming: false,
            };
            return updated;
          }
          return prev;
        });
        setIsStreaming(false);
      },
      onArtifact: (data) => {
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last && last.role === 'assistant') {
            const artifacts = [...(last.artifacts || []), data];
            const updated = [...prev];
            updated[updated.length - 1] = { ...last, artifacts };
            return updated;
          }
          return prev;
        });
      },
      onError: (data) => {
        setMessages(prev => [...prev, {
          id: `error-${Date.now()}`, role: 'system', content: `Error: ${data.message}`,
          timestamp: new Date().toISOString(),
        }]);
        setIsStreaming(false);
      },
      onDone: () => { setIsStreaming(false); },
    });
    return cleanup;
  }, [sessionId]);

  const sendMessage = useCallback(async (content: string) => {
    const userMsg: Message = {
      id: `user-${Date.now()}`, role: 'user', content,
      timestamp: new Date().toISOString(),
    };
    const assistantMsg: Message = {
      id: `assistant-${Date.now()}`, role: 'assistant', content: '',
      reasoning: '', reasoningDone: false, isStreaming: true,
      timestamp: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setIsStreaming(true);
    getSocket().emit('chat_message', { sessionId, content });
  }, [sessionId]);

  const stopGeneration = useCallback(() => {
    getSocket().emit('stop_generation', { sessionId });
    setIsStreaming(false);
  }, [sessionId]);

  return { messages, isStreaming, sendMessage, stopGeneration };
}
