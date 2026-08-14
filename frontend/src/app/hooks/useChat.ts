'use client';
import { useState, useCallback, useEffect, useRef } from 'react';
import { Message, ToolCall, Artifact } from '@/app/lib/types';
import { subscribeToSession, emitChatMessage, emitStopGeneration, getSocket } from '@/app/lib/socket';
import { conversationsApi } from '@/app/lib/api';

export function useChat(sessionId: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesRef = useRef<Message[]>([]);
  const streamingTextRef = useRef<string>('');

  useEffect(() => { messagesRef.current = messages; }, [messages]);

  // Load existing conversation messages when sessionId changes
  useEffect(() => {
    if (!sessionId || sessionId === 'default') {
      setMessages([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await conversationsApi.get(sessionId);
        if (cancelled) return;
        const loaded: Message[] = (res.conversation?.messages || []).map(m => ({
          id: m.id,
          role: m.role as Message['role'],
          content: m.content || '',
          reasoning: m.reasoning,
          provider: m.provider,
          model: m.model,
          toolCalls: m.tool_calls as ToolCall[],
          timestamp: m.created_at || new Date().toISOString(),
        }));
        setMessages(loaded);
      } catch (e) {
        // New conversation or load failed — start empty
        setMessages([]);
      }
    })();
    return () => { cancelled = true; };
  }, [sessionId]);

  // Subscribe to socket events for this session
  useEffect(() => {
    if (!sessionId) return;

    const cleanup = subscribeToSession(sessionId, {
      onToken: (data) => {
        const token = data.token || '';
        streamingTextRef.current += token;
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last && last.role === 'assistant' && last.isStreaming) {
            const updated = [...prev];
            updated[updated.length - 1] = {
              ...last,
              content: last.content + token,
              provider: data.provider || last.provider,
              model: data.model || last.model,
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
              ...last,
              reasoning: data.reasoning,
              reasoningDone: data.done,
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
            else toolCalls.push(data as ToolCall);
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
              ...last,
              provider: data.provider,
              model: data.model,
            };
            return updated;
          }
          return prev;
        });
      },
      onArtifact: (data) => {
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last && last.role === 'assistant') {
            const artifacts = [...(last.artifacts || []), data as Artifact];
            const updated = [...prev];
            updated[updated.length - 1] = { ...last, artifacts };
            return updated;
          }
          return prev;
        });
      },
      onFileCreated: (data) => {
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last && last.role === 'assistant') {
            const artifacts = [...(last.artifacts || []), {
              id: data.id || `file-${Date.now()}`,
              type: 'file' as const,
              title: data.path || data.filename || 'file',
              content: data.content || '',
              language: data.language,
              path: data.path,
            } as Artifact];
            const updated = [...prev];
            updated[updated.length - 1] = { ...last, artifacts };
            return updated;
          }
          return prev;
        });
      },
      onError: (data) => {
        setMessages(prev => [...prev, {
          id: `error-${Date.now()}`,
          role: 'system',
          content: `Error: ${data.message}`,
          timestamp: new Date().toISOString(),
        }]);
        setIsStreaming(false);
      },
      onDone: () => {
        // Mark the last assistant message as done streaming
        setMessages(prev => {
          if (prev.length === 0) return prev;
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last.role === 'assistant') {
            updated[updated.length - 1] = { ...last, isStreaming: false };
          }
          return updated;
        });
        setIsStreaming(false);
        streamingTextRef.current = '';
      },
    });

    return cleanup;
  }, [sessionId]);

  const sendMessage = useCallback(async (content: string, attachments?: any[]) => {
    if (!content.trim() && (!attachments || attachments.length === 0)) return;

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
      attachments: attachments || undefined,
    };
    const assistantMsg: Message = {
      id: `assistant-${Date.now()}`,
      role: 'assistant',
      content: '',
      reasoning: '',
      reasoningDone: false,
      isStreaming: true,
      timestamp: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setIsStreaming(true);
    streamingTextRef.current = '';

    // Ensure socket is connected before emitting
    const sock = getSocket();
    if (!sock.connected) {
      sock.connect();
      await new Promise<void>(resolve => {
        const onConnect = () => { sock.off('connect', onConnect); resolve(); };
        sock.on('connect', onConnect);
        setTimeout(() => { sock.off('connect', onConnect); resolve(); }, 5000);
      });
    }

    // If we have attachments, include their storage paths in the message
    // so the backend agent can access them
    let emitContent = content;
    if (attachments && attachments.length > 0) {
      const attList = attachments.map(a => `- ${a.filename} (${a.type}, ${a.mimeType}) at ${a.storagePath || 'memory'}`).join('\n');
      emitContent = `${content}\n\n[Attached files:\n${attList}\n]`;
    }

    emitChatMessage(sessionId, emitContent);
  }, [sessionId]);

  const stopGeneration = useCallback(() => {
    emitStopGeneration(sessionId);
    setIsStreaming(false);
    // Mark the streaming message as stopped (keep partial content)
    setMessages(prev => {
      if (prev.length === 0) return prev;
      const updated = [...prev];
      const last = updated[updated.length - 1];
      if (last.role === 'assistant' && last.isStreaming) {
        updated[updated.length - 1] = {
          ...last,
          isStreaming: false,
          content: last.content + (last.content ? ' ⏹' : '_(stopped)_'),
        };
      }
      return updated;
    });
  }, [sessionId]);

  const regenerate = useCallback(() => {
    // Find the last user message
    const msgs = messagesRef.current;
    let lastUserIdx = -1;
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === 'user') { lastUserIdx = i; break; }
    }
    if (lastUserIdx === -1) return;

    const lastUserMsg = msgs[lastUserIdx];
    // Truncate everything after the last user message
    setMessages(prev => prev.slice(0, lastUserIdx));
    // Re-send the user message
    setTimeout(() => sendMessage(lastUserMsg.content), 50);
  }, [sendMessage]);

  const setFeedback = useCallback((messageId: string, feedback: 'up' | 'down') => {
    setMessages(prev => prev.map(m =>
      m.id === messageId ? { ...m, feedback } : m
    ));
  }, []);

  const editUserMessage = useCallback((messageId: string, newContent: string) => {
    // Find the message index
    const msgs = messagesRef.current;
    const idx = msgs.findIndex(m => m.id === messageId);
    if (idx === -1) return;

    // Update the user message content
    setMessages(prev => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], content: newContent };
      // Truncate everything after the edited user message
      updated.length = idx + 1;
      return updated;
    });

    // Re-send the edited message (will trigger a new assistant response)
    setTimeout(() => sendMessage(newContent), 50);
  }, [sendMessage]);

  return { messages, isStreaming, sendMessage, stopGeneration, regenerate, setFeedback, editUserMessage };
}
