import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type FormEvent as ReactFormEvent,
} from 'react';
import { io, type Socket } from 'socket.io-client';
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
  contextWindow?: number;
  maxOutputTokens?: number;
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
  telegramConnected?: boolean;
  phoneConnected?: boolean;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  phase?: string;
  status?: string;
  timestamp: number;
}

interface ProgressPayload {
  sessionId?: string;
  phase?: string;
  status?: string;
  message?: string;
  [key: string]: unknown;
}

interface MessagePayload {
  sessionId?: string;
  role?: string;
  content?: string;
  id?: string;
  timestamp?: string;
}

interface TerminalOutputPayload {
  sessionId?: string;
  output?: string;
}

interface TerminalCommandPayload {
  sessionId?: string;
  command?: string;
}

interface TerminalErrorPayload {
  sessionId?: string;
  message?: string;
}

const SUGGESTIONS = [
  'Create a REST API with Express',
  'Refactor a React component',
  'Fix failing tests in my repo',
  'Add a database migration',
];

function buildAssistantText(content: string, phase?: string, status?: string): string {
  const statusLine = [phase, status].filter(Boolean).join(' · ');
  if (!statusLine) return content;
  return content ? `${content}\n\n[${statusLine}]` : `[${statusLine}]`;
}

export default function App() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [terminalReady, setTerminalReady] = useState(false);
  const [terminalInput, setTerminalInput] = useState('');

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const terminalContainerRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom on new messages / loading changes
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    }
  }, [messages, isLoading]);

  // Auto-resize textarea to fit content (cap at 160px)
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }, [input]);

  // Connect to backend and load config
  useEffect(() => {
    const s = io({ transports: ['websocket', 'polling'] });
    setSocket(s);

    s.on('connect', () => setConnected(true));
    s.on('disconnect', () => setConnected(false));

    s.on('progress', (data: ProgressPayload) => {
      if (!data.sessionId) return;
      const assistantId = `assistant-${data.sessionId}`;
      setMessages((prev) => {
        const existing = prev.find((m) => m.id === assistantId);
        if (existing) {
          const newContent =
            typeof data.message === 'string' && data.message.length > 0
              ? data.message
              : existing.content;
          return prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content: newContent,
                  phase: data.phase,
                  status: data.status,
                }
              : m
          );
        }
        if (data.message || data.phase || data.status) {
          return [
            ...prev,
            {
              id: assistantId,
              role: 'assistant' as const,
              content: data.message || '',
              phase: data.phase,
              status: data.status,
              timestamp: Date.now(),
            },
          ];
        }
        return prev;
      });
    });

    s.on('message', (data: MessagePayload) => {
      if (!data.sessionId || data.role !== 'assistant') return;
      const assistantId = `assistant-${data.sessionId}`;
      const content = data.content || '';
      setMessages((prev) => {
        const existing = prev.find((m) => m.id === assistantId);
        if (existing) {
          return prev.map((m) =>
            m.id === assistantId
              ? { ...m, content, phase: undefined, status: undefined }
              : m
          );
        }
        return [
          ...prev,
          {
            id: data.id || assistantId,
            role: 'assistant' as const,
            content,
            timestamp: Date.now(),
          },
        ];
      });
      setIsLoading(false);
    });

    s.on('terminal:output', (data: TerminalOutputPayload) => {
      if (data.output && xtermRef.current) {
        xtermRef.current.write(data.output);
      }
    });

    s.on('terminal:command', (data: TerminalCommandPayload) => {
      if (data.command && xtermRef.current) {
        xtermRef.current.write(`\r\n$ ${data.command}\r\n`);
      }
    });

    s.on('terminal:error', (data: TerminalErrorPayload) => {
      if (data.message && xtermRef.current) {
        xtermRef.current.write(`\r\n\x1b[31m[error] ${data.message}\x1b[0m\r\n`);
      }
    });

    s.on('terminal:ready', () => setTerminalReady(true));

    // Load models
    fetch(`${API_BASE}/api/config/models`)
      .then((r) => r.json())
      .then((data: { models?: ModelOption[] }) => {
        const list = data.models || [];
        setModels(list);
        if (list.length > 0) {
          setSelectedModel((prev) => prev || list[0].id);
        }
      })
      .catch(() => setModels([]));

    // Load config (providers + default model)
    fetch(`${API_BASE}/api/config`)
      .then((r) => r.json())
      .then((data: Config) => {
        setProviders(data.providers || []);
        if (data.model) {
          setSelectedModel(data.model);
        }
      })
      .catch(() => null);

    return () => {
      s.close();
    };
  }, []);

  // Initialize xterm.js when the drawer opens for the first time
  useEffect(() => {
    if (!terminalOpen || !terminalContainerRef.current || xtermRef.current) return;

    const term = new Terminal({
      theme: {
        background: '#0a0a0f',
        foreground: '#e0e0e0',
        cursor: '#a855f7',
        selectionBackground: 'rgba(99, 102, 241, 0.3)',
      },
      fontSize: 13,
      cursorBlink: true,
      fontFamily: 'JetBrains Mono, Fira Code, ui-monospace, monospace',
      allowProposedApi: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(terminalContainerRef.current);
    try {
      fit.fit();
    } catch {
      // ignore initial fit errors
    }
    term.writeln('\x1b[36mMAX terminal connected.\x1b[0m');
    term.writeln('Output from the agent will stream here. Type commands below.');
    xtermRef.current = term;
    fitRef.current = fit;

    const handleResize = () => {
      try {
        fit.fit();
      } catch {
        // ignore
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [terminalOpen]);

  // Refit the terminal shortly after it toggles open (lets the height transition settle)
  useEffect(() => {
    if (terminalOpen && fitRef.current) {
      const t = setTimeout(() => {
        try {
          fitRef.current?.fit();
        } catch {
          // ignore
        }
      }, 280);
      return () => clearTimeout(t);
    }
  }, [terminalOpen]);

  // Ask backend to initialize a PTY for this session
  useEffect(() => {
    if (socket && sessionId && terminalOpen && !terminalReady) {
      socket.emit('terminal:init', { sessionId });
    }
  }, [socket, sessionId, terminalOpen, terminalReady]);

  // Dispose terminal on full unmount
  useEffect(() => {
    return () => {
      if (xtermRef.current) {
        xtermRef.current.dispose();
        xtermRef.current = null;
      }
    };
  }, []);

  const createSession = async (): Promise<string> => {
    const res = await fetch(`${API_BASE}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: USER_ID, platform: 'web' }),
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error || `Failed to create session (${res.status})`);
    }
    const data = await res.json();
    if (!data.sessionId) {
      throw new Error('No sessionId returned');
    }
    setSessionId(data.sessionId);
    socket?.emit('subscribe', data.sessionId);
    return data.sessionId as string;
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
      const assistantId = `assistant-${id}`;

      setMessages((prev) => [
        ...prev,
        {
          id: `user-${Date.now()}`,
          role: 'user' as const,
          content: text,
          timestamp: Date.now(),
        },
        {
          id: assistantId,
          role: 'assistant' as const,
          content: '',
          timestamp: Date.now(),
        },
      ]);
      setIsLoading(true);

      const res = await fetch(`${API_BASE}/api/agent/task`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task: text,
          sessionId: id,
          userId: USER_ID,
          model: selectedModel || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `Failed to start task (${res.status})`);
      }
      if (data.sessionId && data.sessionId !== id) {
        setSessionId(data.sessionId);
        socket?.emit('subscribe', data.sessionId);
      }
    } catch (error) {
      const err = error instanceof Error ? error.message : 'Unknown error';
      setMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          role: 'assistant' as const,
          content: `⚠️ ${err}`,
          timestamp: Date.now(),
        },
      ]);
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const submitTerminalCommand = () => {
    if (!terminalInput.trim() || !socket || !sessionId) return;
    const cmd = terminalInput.trim();
    setTerminalInput('');
    socket.emit('terminal:command', { sessionId, command: cmd });
  };

  const handleTerminalSubmit = (e: ReactFormEvent) => {
    e.preventDefault();
    submitTerminalCommand();
  };

  const startNewChat = () => {
    if (socket && sessionId) {
      socket.emit('terminal:kill', { sessionId });
    }
    setSessionId(null);
    setMessages([]);
    setIsLoading(false);
    setTerminalReady(false);
    setInput('');
    if (xtermRef.current) {
      xtermRef.current.clear();
    }
  };

  const toggleTerminal = () => setTerminalOpen((p) => !p);

  const currentModel = models.find((m) => m.id === selectedModel);
  const currentProvider = currentModel
    ? providers.find((p) => p.name.toLowerCase() === currentModel.provider.toLowerCase())
    : undefined;
  const connectedProviders = providers.filter((p) => p.connected).length;
  const activeAssistantId = sessionId ? `assistant-${sessionId}` : null;

  return (
    <div className="flex h-[100dvh] w-full flex-col overflow-hidden bg-[#0a0a0f] font-sans text-[#e0e0e0]">
      <style>{`
        .xterm { padding: 6px 8px; height: 100%; }
        .xterm-viewport { background-color: transparent !important; }
        .xterm-screen { background-color: transparent !important; }
        @keyframes max-typing-dot {
          0%, 60%, 100% { opacity: 0.25; transform: translateY(0); }
          30% { opacity: 1; transform: translateY(-3px); }
        }
        .max-typing-dot { animation: max-typing-dot 1.2s ease-in-out infinite; }
      `}</style>

      {/* Header */}
      <header className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-[#1f1f2e] bg-[#0f0f1a]/80 px-3 backdrop-blur-md md:h-14 md:px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 shadow-lg shadow-indigo-500/20 md:h-9 md:w-9">
            <Bot size={18} className="text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold leading-tight tracking-tight text-white">
              MAX
            </h1>
            <p className="hidden text-[10px] leading-tight text-[#6b6b8d] sm:block">
              Autonomous coding agent
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 md:gap-2">
          <div
            className="flex items-center gap-1.5 rounded-full border border-[#1f1f2e] bg-[#1a1a2e] px-2 py-1"
            aria-label={connected ? 'Online' : 'Offline'}
          >
            <Circle
              size={7}
              aria-hidden="true"
              className={
                connected
                  ? 'fill-emerald-500 text-emerald-500'
                  : 'fill-red-500 text-red-500'
              }
            />
            <span className="hidden text-[10px] font-medium text-[#a0a0c0] sm:inline">
              {connected ? 'Online' : 'Offline'}
            </span>
          </div>

          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            className="max-w-[130px] truncate rounded-lg border border-[#1f1f2e] bg-[#1a1a2e] py-1.5 pl-2 pr-6 text-xs text-[#e0e0e0] outline-none transition-colors [color-scheme:dark] hover:border-indigo-500/50 focus:border-indigo-500 md:max-w-[180px]"
            aria-label="Select model"
          >
            {models.length === 0 && <option value="">Loading…</option>}
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>

          <button
            onClick={startNewChat}
            className="flex h-8 items-center gap-1 rounded-lg border border-[#1f1f2e] bg-[#1a1a2e] px-2 text-xs text-[#a0a0c0] transition-colors hover:border-indigo-500/50 hover:text-white"
            aria-label="New chat"
            title="New chat"
          >
            <Plus size={14} />
            <span className="hidden md:inline">New</span>
          </button>
        </div>
      </header>

      {/* Chat area */}
      <main
        ref={scrollContainerRef}
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden"
      >
        <div className="mx-auto w-full max-w-3xl px-3 py-4 md:px-6 md:py-8">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center md:py-20">
              <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-500 shadow-xl shadow-indigo-500/30 md:h-20 md:w-20">
                <Bot size={32} className="text-white" />
              </div>
              <h2 className="mb-2 text-xl font-semibold text-white md:text-2xl">
                What do you want to build?
              </h2>
              <p className="mb-8 max-w-md text-sm text-[#6b6b8d]">
                MAX plans, writes, tests, and deploys code autonomously. Watch it work in
                the terminal below.
              </p>
              <div className="grid w-full max-w-md grid-cols-1 gap-2.5 sm:grid-cols-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => setInput(s)}
                    className="rounded-xl border border-[#1f1f2e] bg-[#13131f] p-3 text-left text-xs text-[#a0a0c0] transition-all hover:border-indigo-500/50 hover:bg-[#1a1a2e] hover:text-white"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4 md:space-y-5">
              {messages.map((msg) => {
                const isUser = msg.role === 'user';
                const isActive = activeAssistantId === msg.id && isLoading;
                const displayed = buildAssistantText(msg.content, msg.phase, msg.status);
                const isEmpty = displayed.length === 0;
                return (
                  <div
                    key={msg.id}
                    className={`flex items-end gap-2 ${isUser ? 'justify-end' : 'justify-start'}`}
                  >
                    {!isUser && (
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500 shadow-md shadow-indigo-500/20 md:h-8 md:w-8">
                        <Bot size={15} className="text-white" />
                      </div>
                    )}
                    <div
                      className={`max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed md:max-w-[75%] ${
                        isUser
                          ? 'rounded-br-md bg-gradient-to-br from-indigo-500 to-purple-500 text-white shadow-lg shadow-indigo-500/20'
                          : 'rounded-bl-md border border-[#1f1f2e] bg-[#13131f] text-[#e0e0e0]'
                      }`}
                    >
                      {isEmpty && isActive ? (
                        <TypingDots />
                      ) : (
                        <span>{displayed}</span>
                      )}
                      {isActive && !isEmpty && (
                        <Loader2
                          size={13}
                          className="ml-2 inline animate-spin text-indigo-400"
                        />
                      )}
                    </div>
                    {isUser && (
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[#1f1f2e] bg-[#1a1a2e] md:h-8 md:w-8">
                        <User size={15} className="text-[#a0a0c0]" />
                      </div>
                    )}
                  </div>
                );
              })}
              <div className="h-1" />
            </div>
          )}
        </div>
      </main>

      {/* Terminal drawer */}
      <section
        className={`shrink-0 border-t border-[#1f1f2e] bg-[#0f0f1a] transition-[height] duration-300 ease-in-out ${
          terminalOpen ? 'h-[40vh] md:h-80' : 'h-11'
        }`}
      >
        <button
          onClick={toggleTerminal}
          className="flex h-11 w-full items-center justify-between px-3 transition-colors hover:bg-[#13131f] md:px-4"
          aria-expanded={terminalOpen}
          aria-label="Toggle terminal"
        >
          <div className="flex items-center gap-2">
            <TerminalIcon size={14} className="text-indigo-400" />
            <span className="text-xs font-medium text-[#a0a0c0]">Terminal</span>
            {terminalReady && (
              <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-400">
                <Circle size={6} className="fill-emerald-500 text-emerald-500" />
                ready
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden text-[10px] text-[#6b6b8d] sm:inline">
              {sessionId ? `session ${sessionId.slice(0, 8)}…` : 'no session'}
            </span>
            {terminalOpen ? (
              <ChevronDown size={14} className="text-[#a0a0c0]" />
            ) : (
              <ChevronUp size={14} className="text-[#a0a0c0]" />
            )}
          </div>
        </button>

        {terminalOpen && (
          <div className="flex h-[calc(100%-2.75rem)] flex-col">
            <div
              ref={terminalContainerRef}
              className="min-h-0 flex-1 overflow-hidden bg-[#0a0a0f]"
            />
            <form
              onSubmit={handleTerminalSubmit}
              className="flex h-10 shrink-0 items-center gap-2 border-t border-[#1f1f2e] bg-[#0a0a0f] px-3"
            >
              <span className="font-mono text-xs text-indigo-400">$</span>
              <input
                value={terminalInput}
                onChange={(e) => setTerminalInput(e.target.value)}
                placeholder={
                  sessionId ? 'Type a command…' : 'Start a chat to open a terminal'
                }
                disabled={!sessionId}
                className="flex-1 bg-transparent font-mono text-xs text-[#e0e0e0] outline-none placeholder:text-[#4a4a6a] disabled:opacity-50"
                autoComplete="off"
                spellCheck={false}
              />
              {terminalInput.trim() && (
                <button
                  type="submit"
                  className="rounded px-2 py-0.5 text-[10px] text-indigo-400 hover:bg-[#1a1a2e]"
                  aria-label="Run command"
                >
                  ↵
                </button>
              )}
            </form>
          </div>
        )}
      </section>

      {/* Input bar */}
      <footer className="shrink-0 border-t border-[#1f1f2e] bg-[#0f0f1a] px-3 py-2.5 md:px-4 md:py-3">
        <div className="mx-auto w-full max-w-3xl">
          <div className="flex items-end gap-2 rounded-2xl border border-[#1f1f2e] bg-[#13131f] px-3 py-2 transition-colors focus-within:border-indigo-500/50">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask MAX to build something…"
              rows={1}
              disabled={isLoading}
              className="max-h-40 min-h-[24px] flex-1 resize-none bg-transparent py-1 text-base text-[#e0e0e0] outline-none placeholder:text-[#4a4a6a] disabled:opacity-50 md:text-sm"
            />
            <button
              onClick={() => void handleSend()}
              disabled={isLoading || !input.trim()}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 text-white shadow-lg shadow-indigo-500/30 transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
              aria-label="Send message"
            >
              {isLoading ? (
                <Loader2 size={17} className="animate-spin" />
              ) : (
                <Send size={17} />
              )}
            </button>
          </div>
          <div className="mt-1.5 flex items-center justify-between px-1 text-[10px] text-[#6b6b8d]">
            <span className="truncate">
              {currentModel ? (
                <>
                  <span className="text-[#a0a0c0]">{currentModel.name}</span>
                  {currentProvider && (
                    <span
                      className={`ml-1.5 ${
                        currentProvider.connected ? 'text-emerald-400' : 'text-red-400'
                      }`}
                    >
                      ● {currentProvider.name}
                    </span>
                  )}
                </>
              ) : (
                'Loading models…'
              )}
            </span>
            <span className="flex shrink-0 items-center gap-1">
              <Server size={10} />
              {connectedProviders} provider{connectedProviders === 1 ? '' : 's'} online
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}

function TypingDots() {
  return (
    <span
      className="inline-flex items-center gap-1 py-0.5"
      aria-label="Assistant is typing"
    >
      <span
        className="max-typing-dot h-1.5 w-1.5 rounded-full bg-[#6b6b8d]"
        style={{ animationDelay: '0ms' }}
      />
      <span
        className="max-typing-dot h-1.5 w-1.5 rounded-full bg-[#6b6b8d]"
        style={{ animationDelay: '150ms' }}
      />
      <span
        className="max-typing-dot h-1.5 w-1.5 rounded-full bg-[#6b6b8d]"
        style={{ animationDelay: '300ms' }}
      />
    </span>
  );
}
