import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Send, Paperclip, Zap, FastForward,
  ExternalLink, MoreVertical, Copy, Check, Play
} from 'lucide-react';
import { getSession, getMessages, sendMessage, executeTask } from '../services/api';
import { useWebSocket } from '../hooks/useWebSocket';

export default function ChatDetailPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [autopilot, setAutopilot] = useState(false);
  const [copiedCode, setCopiedCode] = useState(null);
  const messagesEndRef = useRef(null);
  const socket = useWebSocket();

  useEffect(() => {
    loadChatData();
  }, [sessionId]);

  useEffect(() => {
    if (socket && sessionId) {
      socket.on('message', handleNewMessage);
      socket.on('phase_update', handlePhaseUpdate);
      socket.on('process_started', handleProcessStarted);

      return () => {
        socket.off('message', handleNewMessage);
        socket.off('phase_update', handlePhaseUpdate);
        socket.off('process_started', handleProcessStarted);
      };
    }
  }, [socket, sessionId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const loadChatData = async () => {
    try {
      setLoading(true);
      const [sessionData, messagesData] = await Promise.all([
        getSession(sessionId),
        getMessages(sessionId, 100, 0)
      ]);
      setSession(sessionData);
      setMessages(messagesData.messages || []);
    } catch (error) {
      console.error('Failed to load chat data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleNewMessage = (message) => {
    if (message.sessionId === sessionId) {
      setMessages(prev => [...prev, message]);
    }
  };

  const handlePhaseUpdate = (data) => {
    if (data.sessionId === sessionId) {
      setMessages(prev => [...prev, {
        role: 'system',
        content: `[${data.phase}] ${data.message}`,
        phase: data.phase,
        timestamp: new Date().toISOString()
      }]);
    }
  };

  const handleProcessStarted = (data) => {
    if (data.sessionId === sessionId) {
      setMessages(prev => [...prev, {
        role: 'system',
        content: `Process started: ${data.name} on port ${data.port}`,
        processInfo: data,
        timestamp: new Date().toISOString()
      }]);
    }
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim() || sending) return;

    const userMessage = input.trim();
    setInput('');
    setSending(true);

    try {
      await sendMessage(sessionId, userMessage, 'user');

      if (autopilot) {
        await executeTask(sessionId, userMessage, 'web_user');
      }
    } catch (error) {
      console.error('Failed to send message:', error);
    } finally {
      setSending(false);
    }
  };

  const copyCode = (code, index) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(index);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const renderMessage = (message, index) => {
    const isAgent = message.role === 'assistant' || message.role === 'agent';
    const isSystem = message.role === 'system';

    if (isSystem && message.phase) {
      return (
        <div key={index} className="flex justify-center mb-4">
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${getPhaseColor(message.phase)}`}>
            {message.content}
          </span>
        </div>
      );
    }

    if (isSystem && message.processInfo) {
      return (
        <div key={index} className="flex justify-center mb-4">
          <div className="flex items-center gap-2 px-4 py-2 bg-success/10 border border-success/30 rounded-full">
            <div className="w-2 h-2 bg-success rounded-full animate-pulse" />
            <span className="text-sm font-medium text-success">
              Running: {message.processInfo.name} (port {message.processInfo.port})
            </span>
          </div>
        </div>
      );
    }

    return (
      <div key={index} className={`flex mb-6 ${isAgent ? 'justify-start' : 'justify-end'}`}>
        <div className={`max-w-[80%] ${isAgent ? '' : 'flex flex-col items-end'}`}>
          <div
            className={`rounded-xl p-4 ${
              isAgent
                ? 'bg-surface border-l-4 border-accent'
                : 'bg-accent/10 border border-accent/20'
            }`}
          >
            <div className="prose prose-sm max-w-none">
              {renderMessageContent(message.content, index)}
            </div>
          </div>
          <span className="text-xs text-text-secondary mt-1 px-2">
            {new Date(message.timestamp || message.createdAt).toLocaleTimeString()}
          </span>
        </div>
      </div>
    );
  };

  const renderMessageContent = (content, messageIndex) => {
    const codeBlockRegex = /```(\w+)?\n([\s\S]+?)```/g;
    const parts = [];
    let lastIndex = 0;
    let match;
    let codeIndex = 0;

    while ((match = codeBlockRegex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        parts.push(
          <p key={`text-${lastIndex}`} className="whitespace-pre-wrap text-text-primary">
            {content.slice(lastIndex, match.index)}
          </p>
        );
      }

      const lang = match[1] || 'text';
      const code = match[2].trim();
      const copyIndex = `${messageIndex}-${codeIndex}`;

      parts.push(
        <div key={`code-${match.index}`} className="relative my-4 group">
          <div className="flex items-center justify-between bg-gray-800 px-4 py-2 rounded-t-lg">
            <span className="text-xs text-gray-400 font-mono">{lang}</span>
            <button
              onClick={() => copyCode(code, copyIndex)}
              className="flex items-center gap-1 px-2 py-1 text-xs text-gray-400 hover:text-white transition-colors"
            >
              {copiedCode === copyIndex ? (
                <>
                  <Check className="w-3 h-3" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  Copy
                </>
              )}
            </button>
          </div>
          <pre className="bg-gray-900 text-gray-100 p-4 rounded-b-lg overflow-x-auto">
            <code className="text-sm font-mono">{code}</code>
          </pre>
        </div>
      );

      lastIndex = match.index + match[0].length;
      codeIndex++;
    }

    if (lastIndex < content.length) {
      parts.push(
        <p key={`text-${lastIndex}`} className="whitespace-pre-wrap text-text-primary">
          {content.slice(lastIndex)}
        </p>
      );
    }

    return parts.length > 0 ? parts : (
      <p className="whitespace-pre-wrap text-text-primary">{content}</p>
    );
  };

  const getPhaseColor = (phase) => {
    const colors = {
      Planning: 'bg-phase-planning/20 text-phase-planning border border-phase-planning/30',
      Executing: 'bg-phase-executing/20 text-phase-executing border border-phase-executing/30',
      Testing: 'bg-phase-testing/20 text-phase-testing border border-phase-testing/30',
      Deploying: 'bg-phase-deploying/20 text-phase-deploying border border-phase-deploying/30'
    };
    return colors[phase] || 'bg-text-secondary/20 text-text-secondary border border-text-secondary/30';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-text-secondary">Loading chat...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col pb-20 md:pb-0">
      {/* Header */}
      <div className="bg-surface border-b border-border px-4 py-3 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/chat')}
              className="p-2 hover:bg-background rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-text-primary" />
            </button>
            <div>
              <h1 className="text-lg font-semibold text-text-primary">
                {session?.metadata?.title || `Session ${sessionId.slice(0, 8)}`}
              </h1>
              {session?.metadata?.repo && (
                <p className="text-xs text-text-secondary">{session.metadata.repo}</p>
              )}
            </div>
          </div>

          {/* Toolbar */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setAutopilot(!autopilot)}
              className={`p-2 rounded-lg transition-colors ${
                autopilot ? 'bg-accent text-white' : 'hover:bg-background text-text-secondary'
              }`}
              title="Autopilot"
            >
              <Zap className="w-4 h-4" />
            </button>
            <button className="p-2 hover:bg-background rounded-lg transition-colors text-text-secondary" title="Fast forward">
              <FastForward className="w-4 h-4" />
            </button>
            <button className="p-2 hover:bg-background rounded-lg transition-colors text-text-secondary" title="Open in new tab">
              <ExternalLink className="w-4 h-4" />
            </button>
            <button className="p-2 hover:bg-background rounded-lg transition-colors text-text-secondary" title="More">
              <MoreVertical className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-4 py-6">
          {messages.length === 0 ? (
            <div className="text-center py-12 text-text-secondary">
              <p>No messages yet. Start the conversation!</p>
            </div>
          ) : (
            messages.map((message, index) => renderMessage(message, index))
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <div className="bg-surface border-t border-border px-4 py-4 sticky bottom-0">
        <form onSubmit={handleSend} className="max-w-4xl mx-auto">
          <div className="flex items-end gap-2">
            <button
              type="button"
              className="p-3 hover:bg-background rounded-lg transition-colors text-text-secondary"
            >
              <Paperclip className="w-5 h-5" />
            </button>
            <div className="flex-1 relative">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend(e);
                  }
                }}
                placeholder="Type your message..."
                rows={1}
                className="w-full px-4 py-3 bg-background border border-border rounded-xl text-text-primary placeholder-text-secondary focus:outline-none focus:ring-2 focus:ring-accent resize-none"
                style={{ minHeight: '50px', maxHeight: '150px' }}
              />
            </div>
            <button
              type="submit"
              disabled={!input.trim() || sending}
              className="p-3 bg-accent text-white rounded-lg hover:bg-opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {sending ? <Play className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
