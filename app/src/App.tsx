import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import {
  Send,
  Terminal as TerminalIcon,
  ChevronUp,
  ChevronDown,
  Bot,
  User,
  Loader2,
  Plus,
  Circle,
  Server,
} from 'lucide-react';
import '@xterm/xterm/css/xterm.css';

const API_BASE = '';
const USER_ID = 'default-user';

interface ModelOption {
  id: string;
  name: string;
  provider: string;
  speed?: string;
  speedLabel?: string;
  description?: string;
}

interface ProviderStatus {
  name: string;
  connected: boolean;
  speed?: string;
}

interface Config {
  providers: ProviderStatus[];
  model: string;
  repo?: string | null;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  phase?: string;
  status?: string;
}

function buildAssistantText(content: string, phase?: string, status?: string) {
  if (!phase && !status) return content;
  const statusLine = [phase, status].filter(Boolean).join(' · ');
  return content ? `${content}\n\n[${statusLine}]` : `[${statusLine}]`;
}

export default function App() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [terminalReady, setTerminalReady] = useState(false);
  const [terminalInput, setTerminalInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const terminalContainerRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);

  // Scroll to bottom of chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Connect to backend and load config
  useEffect(() => {
    const s = io({ transports: ['websocket', 'polling'] });
    setSocket(s);

    s.on('connect', () => setConnected(true));
    s.on('disconnect', () => setConnected(false));

    s.on('progress', (data: { sessionId?: string; phase?: string; status?: string; [key: string]: unknown }) => {
      if (!data.sessionId) return;
      setMessages((prev) => {
        const assistantId = `assistant-${data.sessionId}`;
        const existing = prev.find((m) => m.id === assistantId);
        const statusText = typeof data.phase === 'string' ? `Phase: ${data.phase}` : '';
        const statusExtra = typeof data.status === 'string' ? `Status: ${data.status}` : '';
        const content = [statusText, statusExtra].filter(Boolean).join(' · ');
        if (existing) {
          return prev.map((m) =>
            m.id === assistantId ? { ...m, content: buildAssistantText(content, data.phase, data.status), phase: data.phase, status: data.status } : m
          );
        }
        return prev;
      });
    });

    s.on('message', (data: { sessionId?: string; role?: string; content?: string; id?: string }) => {
      if (!data.sessionId || data.role !== 'assistant') return;
      setMessages((prev) => {
        const assistantId = `assistant-${data.sessionId}`;
        const existing = prev.find((m) => m.id === assistantId);
        if (existing) {
          return prev.map((m) =>
            m.id === assistantId ? { ...m, content: data.content || '', phase: undefined, status: undefined } : m
          );
        }
        return [...prev, { id: data.id || assistantId, role: 'assistant', content: data.content || '' }];
      });
      setIsLoading(false);
    });

    s.on('terminal:output', (data: { sessionId?: string; output?: string }) => {
      if (data.output && xtermRef.current) {
        xtermRef.current.write(data.output);
      }
    });

    s.on('terminal:command', (data: { sessionId?: string; command?: string }) => {
      if (data.command && xtermRef.current) {
        xtermRef.current.write(`\r\n$ ${data.command}\r\n`);
      }
    });

    s.on('terminal:error', (data: { message?: string }) => {
      if (data.message && xtermRef.current) {
        xtermRef.current.write(`\r\n[error] ${data.message}\r\n`);
      }
    });

    s.on('terminal:ready', () => setTerminalReady(true));

    fetch(`${API_BASE}/api/health`)
      .then((r) => r.json())
      .catch(() => null);

    fetch(`${API_BASE}/api/config/models`)
      .then((r) => r.json())
      .then((data: { models?: ModelOption[] }) => {
        const list = data.models || [];
        setModels(list);
        if (list.length > 0 && !selectedModel) {
          setSelectedModel(list[0].id);
        }
      })
      .catch(() => setModels([]));

    fetch(`${API_BASE}/api/config`)
      .then((r) => r.json())
      .then((data: Config) => {
        setProviders(data.providers || []);
        if (data.model) setSelectedModel(data.model);
      })
      .catch(() => null);

    return () => {
      s.close();
    };
  }, []);

  // Initialize xterm.js terminal when drawer opens
  useEffect(() => {
    if (!terminalOpen || !terminalContainerRef.current || xtermRef.current) return;

    const term = new Terminal({
      theme: { background: '#0f0f1a', foreground: '#e0e0e0', cursor: '#6c5ce7' },
      fontSize: 13,
      cursorBlink: true,
      fontFamily: 'JetBrains Mono, monospace',
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(terminalContainerRef.current);
    fit.fit();
    term.writeln('Welcome to MAX. Terminal connected to backend.');
    xtermRef.current = term;

    const handleResize = () => fit.fit();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [terminalOpen]);

  // Initialize terminal for the active session
  useEffect(() => {
    if (socket && sessionId && terminalOpen && !terminalReady) {
      socket.emit('terminal:init', { sessionId });
    }
  }, [socket, sessionId, terminalOpen, terminalReady]);

  const createSession = async () => {
    const res = await fetch(`${API_BASE}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: USER_ID, platform: 'web' }),
    });
    const data = await res.json();
    if (data.sessionId) {
      setSessionId(data.sessionId);
      socket?.emit('subscribe', data.sessionId);
      return data.sessionId;
    }
    throw new Error(data.error || 'Failed to create session');
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    const text = input.trim();
    setInput('');

    try {
      let id = sessionId;
      if (!id) {
        id = await createSession();
      }

      setMessages((prev) => [
        ...prev,
        { id: `user-${Date.now()}`, role: 'user', content: text },
        { id: `assistant-${id}`, role: 'assistant', content: 'Starting...', phase: 'init', status: 'started' },
      ]);
      setIsLoading(true);

      const res = await fetch(`${API_BASE}/api/agent/task`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task: text, sessionId: id, userId: USER_ID, model: selectedModel || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to start task');
      if (data.sessionId && data.sessionId !== id) {
        setSessionId(data.sessionId);
        socket?.emit('subscribe', data.sessionId);
      }
    } catch (error) {
      const err = error instanceof Error ? error.message : 'Unknown error';
      setMessages((prev) => [...prev, { id: `error-${Date.now()}`, role: 'assistant', content: `Error: ${err}` }]);
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const submitTerminalCommand = () => {
    if (!terminalInput.trim() || !socket || !sessionId) return;
    const cmd = terminalInput.trim();
    setTerminalInput('');
    socket.emit('terminal:command', { sessionId, command: cmd });
  };

  const handleTerminalSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    submitTerminalCommand();
  };

  const startNewChat = () => {
    setSessionId(null);
    setMessages([]);
    setIsLoading(false);
    setTerminalReady(false);
    if (socket) {
      socket.emit('terminal:kill', { sessionId });
    }
  };

  const currentProvider = providers.find((p) => p.name.toLowerCase() === (models.find((m) => m.id === selectedModel)?.provider || '').toLowerCase());

  return (
    <div className="h-screen w-screen flex flex-col bg-[#0f0f1a] text-[#e0e0e0] overflow-hidden font-sans">
      {/* Header */}
      <header className="h-14 flex items-center justify-between px-4 border-b border-[#2a2a3e] bg-[#13131f] shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#6c5ce7] to-[#a855f7] flex items-center justify-center">
            <Bot size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-[#e0e0e0]">MAX</h1>
            <p className="text-[10px] text-[#6b6b8d]">Autonomous coding agent</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Connection status */}
          <div className="flex items-center gap-1.5 text-[10px] text-[#6b6b8d] px-2 py-1 rounded-full bg-[#1a1a2e] border border-[#2a2a3e]">
            <Circle size={6} className={connected ? 'fill-emerald-500 text-emerald-500' : 'fill-red-500 text-red-500'} />
            {connected ? 'Connected' : 'Offline'}
          </div>

          {/* Model selector */}
          <div className="flex items-center gap-2">
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="text-xs bg-[#1a1a2e] border border-[#2a2a3e] rounded-md px-2 py-1.5 text-[#e0e0e0] outline-none focus:border-[#6c5ce7]"
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.provider})
                </option>
              ))}
            </select>
            {currentProvider && (
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded ${
                  currentProvider.connected ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                }`}
              >
                {currentProvider.connected ? '●' : '○'} {currentProvider.name}
              </span>
            )}
          </div>

          <button
            onClick={startNewChat}
            className="flex items-center gap-1 text-xs px-2 py-1.5 rounded-md bg-[#1a1a2e] border border-[#2a2a3e] hover:bg-[#2a2a3e] text-[#a0a0c0] transition-colors"
          >
            <Plus size={12} />
            New
          </button>
        </div>
      </header>

      {/* Chat area */}
      <main className="flex-1 overflow-y-auto px-4 py-6 space-y-5">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#6c5ce7] to-[#a855f7] flex items-center justify-center mb-4 shadow-lg shadow-[#6c5ce7]/20">
              <Bot size={28} className="text-white" />
            </div>
            <h2 className="text-lg font-medium text-[#e0e0e0] mb-1">What do you want to build?</h2>
            <p className="text-xs text-[#6b6b8d] max-w-sm mb-6">
              MAX can plan, write, test, and deploy code. All work runs in the terminal drawer below.
            </p>
            <div className="grid grid-cols-2 gap-3 max-w-md w-full">
              {[
                'Create a simple REST API',
                'Refactor a React component',
                'Fix failing tests',
                'Add a database migration',
              ].map((s) => (
                <button
                  key={s}
                  onClick={() => setInput(s)}
                  className="text-xs p-3 rounded-lg bg-[#1a1a2e] border border-[#2a2a3e] text-[#a0a0c0] hover:border-[#6c5ce7] hover:text-[#e0e0e0] transition-all text-left"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'assistant' && (
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#6c5ce7] to-[#a855f7] flex items-center justify-center shrink-0">
                <Bot size={16} className="text-white" />
              </div>
            )}
            <div
              className={`max-w-[80%] rounded-xl px-4 py-3 text-sm whitespace-pre-wrap leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-[#6c5ce7] text-white'
                  : 'bg-[#1a1a2e] border border-[#2a2a3e] text-[#e0e0e0]'
              }`}
            >
              {msg.content}
              {isLoading && msg.role === 'assistant' && msg.id === `assistant-${sessionId}` && (
                <Loader2 size={14} className="inline ml-2 animate-spin text-[#6c5ce7]" />
              )}
            </div>
            {msg.role === 'user' && (
              <div className="w-8 h-8 rounded-lg bg-[#2a2a3e] flex items-center justify-center shrink-0">
                <User size={16} className="text-[#a0a0c0]" />
              </div>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </main>

      {/* Terminal drawer */}
      <div
        className={`shrink-0 border-t border-[#2a2a3e] bg-[#13131f] transition-all duration-300 ease-in-out ${
          terminalOpen ? 'h-80' : 'h-10'
        }`}
      >
        <div className="h-10 flex items-center justify-between px-4 border-b border-[#2a2a3e]">
          <button
            onClick={() => setTerminalOpen(!terminalOpen)}
            className="flex items-center gap-2 text-xs text-[#a0a0c0] hover:text-[#e0e0e0] transition-colors"
          >
            <TerminalIcon size={14} />
            <span>Terminal</span>
            {terminalReady && <span className="text-[10px] text-emerald-400">● ready</span>}
            {terminalOpen ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>
          <span className="text-[10px] text-[#6b6b8d]">Session: {sessionId || 'none'}</span>
        </div>

        {terminalOpen && (
          <div className="flex flex-col h-[calc(100%-2.5rem)]">
            <div ref={terminalContainerRef} className="flex-1 p-2 overflow-hidden" />
            <form onSubmit={handleTerminalSubmit} className="h-10 flex items-center gap-2 px-3 border-t border-[#2a2a3e] bg-[#0f0f1a]">
              <span className="text-[#6c5ce7] text-xs font-mono">$</span>
              <input
                value={terminalInput}
                onChange={(e) => setTerminalInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    submitTerminalCommand();
                  }
                }}
                placeholder={sessionId ? 'Type command...' : 'Start a chat to open a terminal session'}
                disabled={!sessionId}
                className="flex-1 bg-transparent text-xs text-[#e0e0e0] outline-none font-mono placeholder-[#4a4a6a]"
                autoFocus={terminalOpen}
              />
            </form>
          </div>
        )}
      </div>

      {/* Input bar */}
      <div className="p-4 border-t border-[#2a2a3e] bg-[#13131f] shrink-0">
        <div className="flex items-end gap-2 bg-[#1a1a2e] border border-[#2a2a3e] rounded-xl px-3 py-2.5 focus-within:border-[#6c5ce7] transition-colors">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask MAX to build something..."
            rows={1}
            disabled={isLoading}
            className="flex-1 bg-transparent text-sm text-[#e0e0e0] placeholder-[#4a4a6a] resize-none outline-none max-h-32 min-h-[24px] py-1"
          />
          <button
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
            className="p-2 rounded-lg bg-[#6c5ce7] text-white hover:bg-[#5b4dd1] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
          </button>
        </div>
        <div className="mt-2 flex items-center justify-between text-[10px] text-[#6b6b8d]">
          <span>Models: {models.map((m) => m.name).join(', ') || 'Loading...'}</span>
          <span className="flex items-center gap-1">
            <Server size={10} />
            {providers.filter((p) => p.connected).length} provider(s) online
          </span>
        </div>
      </div>
    </div>
  );
}
