import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent as ReactChangeEvent,
  type FormEvent as ReactFormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
} from 'react';
import { io, type Socket } from 'socket.io-client';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import {
  Bot,
  Brain,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Circle,
  Loader2,
  Menu,
  MessageSquare,
  Plus,
  Search,
  Send,
  Server,
  Settings,
  Terminal as TerminalIcon,
  Trash2,
  User,
  Wrench,
  X,
} from 'lucide-react';
import '@xterm/xterm/css/xterm.css';

// ============================================================================
// CONSTANTS
// ============================================================================

const API_BASE = '';
const USER_ID = 'default-user';
const MAX_ITERATIONS_DEFAULT = 15;

const SUGGESTIONS = [
  'Create a REST API with Express',
  'Refactor a React component',
  'Fix failing tests in my repo',
  'Add a database migration',
] as const;

const GLOBAL_STYLES = `
  .xterm { padding: 6px 8px; height: 100%; }
  .xterm-viewport { background-color: transparent !important; }
  .xterm-screen { background-color: transparent !important; }
  @keyframes max-typing-dot {
    0%, 60%, 100% { opacity: 0.25; transform: translateY(0); }
    30% { opacity: 1; transform: translateY(-3px); }
  }
  .max-typing-dot { animation: max-typing-dot 1.2s ease-in-out infinite; }
  @keyframes max-fade-in {
    from { opacity: 0; transform: translateY(4px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .max-fade-in { animation: max-fade-in 0.2s ease-out; }
`;

// ============================================================================
// TYPES
// ============================================================================

interface ModelOption {
  id: string;
  name: string;
  provider: string;
  contextWindow?: number;
}

interface ProviderStatus {
  name: string;
  connected: boolean;
}

interface AppConfig {
  providers: ProviderStatus[];
  model: string;
  telegramConnected?: boolean;
  phoneConnected?: boolean;
}

interface ConversationSummary {
  id: string;
  title: string;
  platform: string;
  updatedAt: string;
  preview: string;
  messageCount: number;
}

interface MessageMetadata {
  type?: string;
  iterations?: number;
  filesModified?: string[];
}

interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  metadata?: MessageMetadata | null;
  createdAt: string;
}

interface ConversationDetail extends ConversationSummary {
  messages: ConversationMessage[];
}

interface ProgressPayload {
  sessionId?: string;
  phase?: string;
  status?: string;
  iteration?: number;
  maxIterations?: number;
  reasoning?: string;
  tool?: string;
  args?: Record<string, unknown>;
  result?: string;
  summary?: string;
  task?: string;
  toolCount?: number;
  filesModified?: string[];
}

interface MessagePayload {
  sessionId?: string;
  role?: string;
  content?: string;
  type?: string;
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

interface ToolCall {
  id: string;
  tool: string;
  args?: Record<string, unknown>;
  result?: string;
  status: 'executing' | 'done';
}

type IterationStatus = 'thinking' | 'acting' | 'executing_tool' | 'complete';

interface ReActIteration {
  iteration: number;
  status: IterationStatus;
  reasoning?: string;
  toolCalls: ToolCall[];
}

interface AgentRunState {
  conversationId: string;
  active: boolean;
  iterations: ReActIteration[];
  maxIterations: number;
  summary?: string;
  startedAt: number;
}

// ============================================================================
// HELPERS
// ============================================================================

function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return '';
  const diff = Date.now() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (seconds < 60) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatArgs(args?: Record<string, unknown>): string {
  if (!args) return '';
  const entries = Object.entries(args);
  if (entries.length === 0) return '';
  return entries
    .map(([k, v]) => {
      const val = typeof v === 'string' ? v : JSON.stringify(v);
      const truncated = val.length > 80 ? val.slice(0, 80) + '…' : val;
      return `${k}: ${truncated}`;
    })
    .join(' · ');
}

function applyProgress(prev: AgentRunState, data: ProgressPayload): AgentRunState {
  const iter = data.iteration ?? 0;
  const status = data.status;
  const maxIter = data.maxIterations ?? prev.maxIterations;

  if (status === 'complete') {
    return {
      ...prev,
      maxIterations: maxIter,
      active: false,
      summary: data.summary,
    };
  }

  if (iter === 0) {
    return { ...prev, maxIterations: maxIter };
  }

  const existingIdx = prev.iterations.findIndex((i) => i.iteration === iter);

  if (existingIdx === -1) {
    const newIter: ReActIteration = {
      iteration: iter,
      status: 'thinking',
      reasoning: data.reasoning,
      toolCalls: [],
    };
    return {
      ...prev,
      maxIterations: maxIter,
      iterations: [...prev.iterations, newIter].sort((a, b) => a.iteration - b.iteration),
    };
  }

  const updatedIterations = prev.iterations.map((it, idx) => {
    if (idx !== existingIdx) return it;

    let reasoning = it.reasoning;
    let itStatus = it.status;
    let toolCalls = it.toolCalls;

    if (data.reasoning) reasoning = data.reasoning;

    if (status === 'acting') itStatus = 'acting';
    else if (status === 'executing_tool') itStatus = 'executing_tool';

    if (status === 'executing_tool' && data.tool) {
      toolCalls = [
        ...toolCalls,
        {
          id: `tool-${iter}-${toolCalls.length + 1}-${Date.now()}`,
          tool: data.tool,
          args: data.args,
          status: 'executing' as const,
        },
      ];
      itStatus = 'executing_tool';
    } else if (status === 'tool_result' && data.tool) {
      for (let j = toolCalls.length - 1; j >= 0; j--) {
        if (toolCalls[j].tool === data.tool && toolCalls[j].status === 'executing') {
          toolCalls = toolCalls.map((tc, i) =>
            i === j
              ? { ...tc, result: data.result, status: 'done' as const }
              : tc,
          );
          break;
        }
      }
    }

    return { ...it, reasoning, status: itStatus, toolCalls };
  });

  return { ...prev, maxIterations: maxIter, iterations: updatedIterations };
}

// ============================================================================
// MAIN APP
// ============================================================================

export default function App() {
  // Socket + connection state
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);

  // Config
  const [models, setModels] = useState<ModelOption[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [config, setConfig] = useState<AppConfig | null>(null);

  // Conversations
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [activeTitle, setActiveTitle] = useState<string>('');
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [agentRun, setAgentRun] = useState<AgentRunState | null>(null);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // UI state
  const [searchQuery, setSearchQuery] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [terminalReady, setTerminalReady] = useState(false);
  const [terminalInput, setTerminalInput] = useState('');
  const [modelMenuOpen, setModelMenuOpen] = useState(false);

  // Refs
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const terminalContainerRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const modelMenuRef = useRef<HTMLDivElement>(null);
  const activeConversationIdRef = useRef<string | null>(null);
  const previousConversationIdRef = useRef<string | null>(null);

  // Derived
  const filteredConversations = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter(
      (c) =>
        c.title.toLowerCase().includes(q) || c.preview.toLowerCase().includes(q),
    );
  }, [conversations, searchQuery]);

  const currentModel = useMemo(
    () => models.find((m) => m.id === selectedModel),
    [models, selectedModel],
  );
  const connectedProviders = config?.providers.filter((p) => p.connected).length ?? 0;
  const showEmptyState = !activeConversationId || messages.length === 0;
  const activeAgentRun =
    agentRun && agentRun.conversationId === activeConversationId ? agentRun : null;

  // Keep active conversation ref in sync (for socket handlers)
  useEffect(() => {
    activeConversationIdRef.current = activeConversationId;
  }, [activeConversationId]);

  // ------------------------------------------------------------------------
  // SOCKET + CONFIG INITIALIZATION
  // ------------------------------------------------------------------------

  const refreshConversations = async () => {
    setLoadingConversations(true);
    try {
      const res = await fetch(`${API_BASE}/api/conversations?userId=${USER_ID}`);
      if (!res.ok) throw new Error('Failed to load conversations');
      const data = await res.json();
      setConversations(data.conversations || []);
    } catch {
      // silently fail — sidebar will show empty state
    } finally {
      setLoadingConversations(false);
    }
  };

  useEffect(() => {
    const s = io({ transports: ['websocket', 'polling'] });
    setSocket(s);

    s.on('connect', () => setConnected(true));
    s.on('disconnect', () => setConnected(false));

    s.on('progress', (data: ProgressPayload) => {
      if (!data.sessionId) return;
      setAgentRun((prev) => {
        if (!prev || prev.conversationId !== data.sessionId) return prev;
        return applyProgress(prev, data);
      });
      // Also clear loading state on completion (defensive — 'message' is the primary trigger)
      if (data.status === 'complete') {
        setIsLoading(false);
      }
    });

    s.on('message', (data: MessagePayload) => {
      if (!data.sessionId || data.role !== 'assistant') return;
      if (data.sessionId !== activeConversationIdRef.current) return;
      const content = data.content || '';
      setMessages((prev) => [
        ...prev,
        {
          id: data.id || `assistant-${Date.now()}`,
          role: 'assistant',
          content,
          metadata: data.type ? { type: data.type } : null,
          createdAt: data.timestamp || new Date().toISOString(),
        },
      ]);
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
      .then((data: AppConfig) => {
        setConfig(data);
        if (data.model) {
          setSelectedModel(data.model);
        }
      })
      .catch(() => null);

    // Load conversations list
    void refreshConversations();

    return () => {
      s.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Subscribe / unsubscribe on conversation switch
  useEffect(() => {
    if (!socket) return;
    const prev = previousConversationIdRef.current;
    if (prev && prev !== activeConversationId) {
      socket.emit('unsubscribe', prev);
    }
    if (activeConversationId) {
      socket.emit('subscribe', activeConversationId);
    }
    previousConversationIdRef.current = activeConversationId;
  }, [socket, activeConversationId]);

  // Auto-scroll to bottom on new messages / loading / agent run changes
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    }
  }, [messages, isLoading, agentRun]);

  // Auto-resize textarea (cap at ~5 lines)
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 140)}px`;
  }, [input]);

  // Close model menu on outside click
  useEffect(() => {
    if (!modelMenuOpen) return;
    const handler = (e: globalThis.MouseEvent) => {
      if (modelMenuRef.current && !modelMenuRef.current.contains(e.target as Node)) {
        setModelMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [modelMenuOpen]);

  // ------------------------------------------------------------------------
  // TERMINAL INITIALIZATION
  // ------------------------------------------------------------------------

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

  // Refit terminal shortly after toggling open
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
    if (socket && activeConversationId && terminalOpen && !terminalReady) {
      socket.emit('terminal:init', { sessionId: activeConversationId });
    }
  }, [socket, activeConversationId, terminalOpen, terminalReady]);

  // Dispose terminal on full unmount
  useEffect(() => {
    return () => {
      if (xtermRef.current) {
        xtermRef.current.dispose();
        xtermRef.current = null;
      }
    };
  }, []);

  // ------------------------------------------------------------------------
  // HANDLERS
  // ------------------------------------------------------------------------

  const createConversation = async (): Promise<string> => {
    const res = await fetch(`${API_BASE}/api/conversations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: USER_ID,
        platform: 'web',
        title: 'New Conversation',
      }),
    });
    if (!res.ok) throw new Error('Failed to create conversation');
    const data = await res.json();
    const conv = data.conversation as {
      id: string;
      userId: string;
      title: string;
      platform: string;
    };

    setConversations((prev) => [
      {
        id: conv.id,
        title: conv.title,
        platform: conv.platform,
        updatedAt: new Date().toISOString(),
        preview: '',
        messageCount: 0,
      },
      ...prev,
    ]);
    setActiveConversationId(conv.id);
    setActiveTitle(conv.title);
    setMessages([]);
    setAgentRun(null);
    setIsLoading(false);
    setSidebarOpen(false);
    return conv.id;
  };

  const handleNewChat = async () => {
    if (isLoading) return;
    setInput('');
    setError(null);
    try {
      await createConversation();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create conversation');
    }
  };

  const handleSelectConversation = async (id: string) => {
    if (id === activeConversationId) {
      setSidebarOpen(false);
      return;
    }
    setLoadingConversation(true);
    setSidebarOpen(false);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/conversations/${id}?userId=${USER_ID}`);
      if (!res.ok) throw new Error('Failed to load conversation');
      const data = await res.json();
      const conv = data.conversation as ConversationDetail;
      setActiveConversationId(conv.id);
      setActiveTitle(conv.title);
      setMessages(conv.messages || []);
      setAgentRun(null);
      setIsLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load conversation');
    } finally {
      setLoadingConversation(false);
    }
  };

  const handleDeleteConversation = async (id: string) => {
    try {
      const res = await fetch(
        `${API_BASE}/api/conversations/${id}?userId=${USER_ID}`,
        { method: 'DELETE' },
      );
      if (!res.ok) throw new Error('Failed to delete conversation');
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (id === activeConversationId) {
        setActiveConversationId(null);
        setActiveTitle('');
        setMessages([]);
        setAgentRun(null);
        setIsLoading(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  const sendMessage = async (convId: string, text: string) => {
    const userMsg: ConversationMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);

    setAgentRun({
      conversationId: convId,
      active: true,
      iterations: [],
      maxIterations: MAX_ITERATIONS_DEFAULT,
      startedAt: Date.now(),
    });
    setIsLoading(true);
    setError(null);

    socket?.emit('subscribe', convId);

    try {
      const res = await fetch(`${API_BASE}/api/conversations/${convId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          runAgent: true,
          userId: USER_ID,
        }),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `Failed to send message (${res.status})`);
      }

      const data = await res.json();
      if (!data.agentStarted) {
        setAgentRun((prev) => (prev ? { ...prev, active: false } : prev));
        setIsLoading(false);
      }

      // Refresh conversation list to pick up the new title / preview
      void refreshConversations();
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error';
      setMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          role: 'assistant',
          content: `⚠️ ${errMsg}`,
          createdAt: new Date().toISOString(),
        },
      ]);
      setAgentRun(null);
      setIsLoading(false);
    }
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isLoading) return;
    setInput('');

    let convId = activeConversationId;
    if (!convId) {
      try {
        convId = await createConversation();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create conversation');
        return;
      }
    }
    await sendMessage(convId, text);
  };

  const handleSuggestionClick = (suggestion: string) => {
    setInput(suggestion);
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const handleTerminalSubmit = (e: ReactFormEvent) => {
    e.preventDefault();
    if (!terminalInput.trim() || !socket || !activeConversationId) return;
    const cmd = terminalInput.trim();
    setTerminalInput('');
    socket.emit('terminal:command', { sessionId: activeConversationId, command: cmd });
  };

  const toggleTerminal = () => setTerminalOpen((p) => !p);

  // ------------------------------------------------------------------------
  // RENDER
  // ------------------------------------------------------------------------

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-[#0a0a0f] font-sans text-[#f1f5f9]">
      <style>{GLOBAL_STYLES}</style>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ============================================================ */}
      {/* SIDEBAR                                                       */}
      {/* ============================================================ */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-[280px] shrink-0 flex-col border-r border-[#1f1f2e] bg-[#0d0d18] transition-transform duration-300 ease-in-out',
          'md:relative md:z-auto md:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {/* Sidebar header */}
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-[#1f1f2e] px-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 shadow-md shadow-indigo-500/20">
              <Bot size={16} className="text-white" />
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-semibold text-white">MAX 2.0</span>
              <span className="text-[10px] text-[#64748b]">Autonomous Agent</span>
            </div>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="rounded-md p-1.5 text-[#94a3b8] hover:bg-[#1e293b] hover:text-white md:hidden"
            aria-label="Close sidebar"
          >
            <X size={18} />
          </button>
        </div>

        {/* New Chat button */}
        <div className="shrink-0 p-3">
          <button
            onClick={() => void handleNewChat()}
            disabled={isLoading}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-indigo-500/20 transition-all hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus size={16} />
            New Chat
          </button>
        </div>

        {/* Search */}
        <div className="shrink-0 px-3 pb-2">
          <div className="flex items-center gap-2 rounded-lg border border-[#1f1f2e] bg-[#13131f] px-3 py-2 focus-within:border-indigo-500/50">
            <Search size={14} className="shrink-0 text-[#64748b]" />
            <input
              value={searchQuery}
              onChange={(e: ReactChangeEvent<HTMLInputElement>) =>
                setSearchQuery(e.target.value)
              }
              placeholder="Search conversations"
              className="min-w-0 flex-1 bg-transparent text-base text-[#f1f5f9] outline-none placeholder:text-[#64748b] md:text-sm"
              autoComplete="off"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="shrink-0 text-[#64748b] hover:text-white"
                aria-label="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Conversation list */}
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {loadingConversations ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={18} className="animate-spin text-[#64748b]" />
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="px-3 py-8 text-center text-xs text-[#64748b]">
              {searchQuery ? 'No conversations match' : 'No conversations yet'}
            </div>
          ) : (
            <ul className="space-y-1">
              {filteredConversations.map((conv) => {
                const isActive = conv.id === activeConversationId;
                return (
                  <li key={conv.id}>
                    <button
                      onClick={() => void handleSelectConversation(conv.id)}
                      className={cn(
                        'group flex w-full items-start gap-2 rounded-lg px-3 py-2.5 text-left transition-colors',
                        isActive
                          ? 'bg-gradient-to-r from-indigo-500/15 to-purple-500/10 text-white'
                          : 'text-[#cbd5e1] hover:bg-[#13131f]',
                      )}
                    >
                      <MessageSquare
                        size={14}
                        className={cn(
                          'mt-0.5 shrink-0',
                          isActive ? 'text-indigo-400' : 'text-[#64748b]',
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={cn(
                              'truncate text-sm',
                              isActive && 'font-medium text-white',
                            )}
                          >
                            {conv.title || 'New Conversation'}
                          </span>
                          <span className="shrink-0 text-[10px] text-[#64748b]">
                            {formatRelativeTime(conv.updatedAt)}
                          </span>
                        </div>
                        {conv.preview && (
                          <p className="mt-0.5 truncate text-xs text-[#64748b]">
                            {conv.preview}
                          </p>
                        )}
                      </div>
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleDeleteConversation(conv.id);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            e.stopPropagation();
                            void handleDeleteConversation(conv.id);
                          }
                        }}
                        className="shrink-0 rounded p-1 text-[#64748b] opacity-0 transition-opacity hover:bg-red-500/10 hover:text-red-400 focus:opacity-100 group-hover:opacity-100"
                        aria-label="Delete conversation"
                      >
                        <Trash2 size={13} />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Sidebar footer */}
        <div className="shrink-0 border-t border-[#1f1f2e] p-3">
          <div className="mb-2 flex items-center justify-between rounded-lg bg-[#13131f] px-3 py-2 text-[11px] text-[#94a3b8]">
            <div className="flex items-center gap-1.5">
              <Circle
                size={8}
                className={cn(
                  connected
                    ? 'fill-emerald-500 text-emerald-500'
                    : 'fill-red-500 text-red-500',
                )}
              />
              <span>{connected ? 'Connected' : 'Offline'}</span>
            </div>
            <span className="flex items-center gap-1">
              <Server size={11} />
              {connectedProviders} provider{connectedProviders === 1 ? '' : 's'}
            </span>
          </div>
          <button
            onClick={() => setError('Settings panel coming soon')}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-[#94a3b8] transition-colors hover:bg-[#13131f] hover:text-white"
          >
            <Settings size={14} />
            Settings
          </button>
        </div>
      </aside>

      {/* ============================================================ */}
      {/* MAIN CHAT AREA                                                */}
      {/* ============================================================ */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-[#1f1f2e] bg-[#0f0f1a]/80 px-3 backdrop-blur-md md:px-4">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <button
              onClick={() => setSidebarOpen(true)}
              className="rounded-md p-1.5 text-[#94a3b8] hover:bg-[#1e293b] hover:text-white md:hidden"
              aria-label="Open sidebar"
            >
              <Menu size={20} />
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-sm font-medium text-white">
                {activeTitle || 'New Chat'}
              </h1>
              <p className="hidden text-[10px] text-[#64748b] sm:block">
                {messages.length > 0
                  ? `${messages.length} message${messages.length === 1 ? '' : 's'}`
                  : 'Start a conversation'}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {/* Model selector dropdown */}
            <div className="relative" ref={modelMenuRef}>
              <button
                onClick={() => setModelMenuOpen((p) => !p)}
                className="flex items-center gap-1.5 rounded-lg border border-[#1f1f2e] bg-[#13131f] px-2.5 py-1.5 text-xs text-[#cbd5e1] transition-colors hover:border-indigo-500/50 hover:text-white"
                aria-label="Select model"
              >
                <Brain size={13} className="text-indigo-400" />
                <span className="max-w-[90px] truncate sm:max-w-[150px]">
                  {currentModel ? currentModel.name : 'Select model'}
                </span>
                <ChevronDown size={12} className="text-[#64748b]" />
              </button>
              {modelMenuOpen && (
                <div className="absolute right-0 top-full z-50 mt-1 w-64 overflow-hidden rounded-xl border border-[#1f1f2e] bg-[#13131f] shadow-xl max-fade-in">
                  <div className="max-h-72 overflow-y-auto py-1">
                    {models.length === 0 ? (
                      <div className="px-3 py-2 text-xs text-[#64748b]">
                        No models available
                      </div>
                    ) : (
                      models.map((m) => {
                        const provider = config?.providers.find(
                          (p) => p.name.toLowerCase() === m.provider.toLowerCase(),
                        );
                        const isSelected = m.id === selectedModel;
                        return (
                          <button
                            key={m.id}
                            onClick={() => {
                              setSelectedModel(m.id);
                              setModelMenuOpen(false);
                            }}
                            className={cn(
                              'flex w-full items-start gap-2 px-3 py-2 text-left transition-colors hover:bg-[#1e293b]',
                              isSelected && 'bg-indigo-500/10',
                            )}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="truncate text-xs font-medium text-white">
                                  {m.name}
                                </span>
                                {isSelected && (
                                  <CheckCircle2
                                    size={12}
                                    className="shrink-0 text-indigo-400"
                                  />
                                )}
                              </div>
                              <div className="mt-0.5 flex items-center gap-2 text-[10px] text-[#64748b]">
                                <span>{m.provider}</span>
                                {provider && (
                                  <span
                                    className={cn(
                                      'flex items-center gap-1',
                                      provider.connected
                                        ? 'text-emerald-400'
                                        : 'text-red-400',
                                    )}
                                  >
                                    <Circle
                                      size={6}
                                      className={cn(
                                        provider.connected
                                          ? 'fill-emerald-500 text-emerald-500'
                                          : 'fill-red-500 text-red-500',
                                      )}
                                    />
                                    {provider.connected ? 'online' : 'offline'}
                                  </span>
                                )}
                                {m.contextWindow ? (
                                  <span>{Math.round(m.contextWindow / 1000)}k ctx</span>
                                ) : null}
                              </div>
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Terminal toggle */}
            <button
              onClick={toggleTerminal}
              className={cn(
                'flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs transition-colors',
                terminalOpen
                  ? 'border-indigo-500/50 bg-indigo-500/10 text-indigo-300'
                  : 'border-[#1f1f2e] bg-[#13131f] text-[#94a3b8] hover:border-indigo-500/50 hover:text-white',
              )}
              aria-label="Toggle terminal"
              title="Toggle terminal"
            >
              <TerminalIcon size={14} />
              <span className="hidden sm:inline">Terminal</span>
            </button>
          </div>
        </header>

        {/* Messages */}
        <main
          ref={scrollContainerRef}
          className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden"
        >
          <div className="mx-auto w-full max-w-3xl px-3 py-4 md:px-6 md:py-6">
            {showEmptyState ? (
              <EmptyState
                onSuggestion={handleSuggestionClick}
                loading={loadingConversation}
              />
            ) : (
              <div className="space-y-4 md:space-y-5">
                {messages.map((msg) => (
                  <MessageBubble key={msg.id} message={msg} />
                ))}
                {activeAgentRun && <ReActLoopCard run={activeAgentRun} />}
                <div className="h-1" />
              </div>
            )}
          </div>
        </main>

        {/* Terminal drawer */}
        <TerminalDrawer
          open={terminalOpen}
          ready={terminalReady}
          onToggle={toggleTerminal}
          sessionId={activeConversationId}
          terminalInput={terminalInput}
          onTerminalInputChange={setTerminalInput}
          onSubmit={handleTerminalSubmit}
          terminalContainerRef={terminalContainerRef}
        />

        {/* Input bar */}
        <footer className="relative shrink-0 border-t border-[#1f1f2e] bg-[#0f0f1a] px-3 py-2.5 md:px-4 md:py-3">
          <div className="mx-auto w-full max-w-3xl">
            <div className="flex items-end gap-2 rounded-2xl border border-[#1f1f2e] bg-[#13131f] px-3 py-2 transition-colors focus-within:border-indigo-500/50">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e: ReactChangeEvent<HTMLTextAreaElement>) =>
                  setInput(e.target.value)
                }
                onKeyDown={handleKeyDown}
                placeholder="Ask MAX to build something…"
                rows={1}
                disabled={isLoading}
                className="max-h-[140px] min-h-[24px] flex-1 resize-none bg-transparent py-1 text-base text-[#f1f5f9] outline-none placeholder:text-[#64748b] disabled:opacity-50 md:text-sm"
                autoComplete="off"
                spellCheck={false}
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
            <div className="mt-1.5 flex items-center justify-between px-1 text-[10px] text-[#64748b]">
              <span className="truncate">
                {isLoading ? (
                  <span className="flex items-center gap-1 text-indigo-400">
                    <Loader2 size={10} className="animate-spin" />
                    MAX is thinking…
                  </span>
                ) : currentModel ? (
                  <>
                    <span className="text-[#94a3b8]">{currentModel.name}</span>
                    <span className="ml-1.5 text-[#475569]">·</span>
                    <span className="ml-1.5 text-[#64748b]">{currentModel.provider}</span>
                  </>
                ) : (
                  'Loading models…'
                )}
              </span>
              <span className="hidden shrink-0 items-center gap-1 sm:flex">
                <kbd className="rounded border border-[#1f1f2e] px-1 py-0.5">Enter</kbd>
                to send ·
                <kbd className="rounded border border-[#1f1f2e] px-1 py-0.5">
                  Shift+Enter
                </kbd>
                for newline
              </span>
            </div>
          </div>
        </footer>
      </div>

      {/* Error toast */}
      {error && (
        <div className="max-fade-in fixed bottom-20 left-1/2 z-50 -translate-x-1/2 rounded-xl border border-red-500/30 bg-[#13131f] px-4 py-3 text-sm text-red-300 shadow-xl md:bottom-6">
          <div className="flex items-center gap-2">
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              className="rounded p-0.5 text-red-400 hover:text-white"
              aria-label="Dismiss error"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function EmptyState({
  onSuggestion,
  loading,
}: {
  onSuggestion: (s: string) => void;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="flex h-full flex-col items-center justify-center py-20">
        <Loader2 size={32} className="animate-spin text-indigo-400" />
        <p className="mt-4 text-sm text-[#64748b]">Loading conversation…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-10 text-center md:py-16">
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-500 shadow-xl shadow-indigo-500/30 md:h-20 md:w-20">
        <Bot size={32} className="text-white" />
      </div>
      <h2 className="mb-2 text-xl font-semibold text-white md:text-2xl">
        What do you want to build?
      </h2>
      <p className="mb-8 max-w-md text-sm text-[#94a3b8]">
        MAX plans, writes, tests, and deploys code autonomously. Describe your task
        and watch it work in real time.
      </p>
      <div className="grid w-full max-w-md grid-cols-1 gap-2.5 sm:grid-cols-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => onSuggestion(s)}
            className="rounded-xl border border-[#1f1f2e] bg-[#13131f] p-3 text-left text-xs text-[#cbd5e1] transition-all hover:border-indigo-500/50 hover:bg-[#1e293b] hover:text-white"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: ConversationMessage }) {
  const isUser = message.role === 'user';
  const isError = message.content.startsWith('⚠️');

  return (
    <div
      className={cn(
        'flex items-end gap-2 max-fade-in',
        isUser ? 'justify-end' : 'justify-start',
      )}
    >
      {!isUser && (
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500 shadow-md shadow-indigo-500/20 md:h-8 md:w-8">
          <Bot size={15} className="text-white" />
        </div>
      )}
      <div
        className={cn(
          'max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed md:max-w-[75%]',
          isUser
            ? 'rounded-br-md bg-gradient-to-br from-indigo-500 to-purple-500 text-white shadow-lg shadow-indigo-500/20'
            : isError
              ? 'rounded-bl-md border border-red-500/30 bg-[#13131f] text-red-200'
              : 'rounded-bl-md border border-[#1f1f2e] bg-[#13131f] text-[#f1f5f9]',
        )}
      >
        {message.content}
      </div>
      {isUser && (
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[#1f1f2e] bg-[#1e293b] md:h-8 md:w-8">
          <User size={15} className="text-[#94a3b8]" />
        </div>
      )}
    </div>
  );
}

function ReActLoopCard({ run }: { run: AgentRunState }) {
  const [collapsed, setCollapsed] = useState(false);
  const currentIter = run.iterations.length;
  const progressPct =
    run.maxIterations > 0 ? Math.min((currentIter / run.maxIterations) * 100, 100) : 0;

  return (
    <div className="max-fade-in rounded-2xl border border-[#1f1f2e] bg-[#0f0f1a] p-3 md:p-4">
      <button
        onClick={() => setCollapsed((p) => !p)}
        className="flex w-full items-center justify-between gap-2"
      >
        <div className="flex min-w-0 items-center gap-2">
          {run.active ? (
            <Loader2 size={14} className="shrink-0 animate-spin text-indigo-400" />
          ) : (
            <CheckCircle2 size={14} className="shrink-0 text-emerald-400" />
          )}
          <span className="truncate text-xs font-medium text-white">
            {run.active ? 'Agent working' : 'Agent complete'}
          </span>
          <span className="shrink-0 rounded-full bg-[#1e293b] px-2 py-0.5 text-[10px] text-[#94a3b8]">
            Iteration {currentIter}/{run.maxIterations}
          </span>
        </div>
        {collapsed ? (
          <ChevronRight size={14} className="shrink-0 text-[#64748b]" />
        ) : (
          <ChevronDown size={14} className="shrink-0 text-[#64748b]" />
        )}
      </button>

      {!collapsed && (
        <>
          <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-[#1e293b]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>

          <div className="mt-3 space-y-2.5">
            {run.iterations.length === 0 && run.active && (
              <div className="flex items-center gap-2 rounded-xl border border-[#1f1f2e] bg-[#13131f] px-3 py-2.5 text-xs text-[#94a3b8]">
                <Brain size={12} className="text-indigo-400" />
                <span>Thinking…</span>
                <span className="ml-auto inline-flex items-center gap-1 py-0.5">
                  <span
                    className="max-typing-dot h-1.5 w-1.5 rounded-full bg-[#64748b]"
                    style={{ animationDelay: '0ms' }}
                  />
                  <span
                    className="max-typing-dot h-1.5 w-1.5 rounded-full bg-[#64748b]"
                    style={{ animationDelay: '150ms' }}
                  />
                  <span
                    className="max-typing-dot h-1.5 w-1.5 rounded-full bg-[#64748b]"
                    style={{ animationDelay: '300ms' }}
                  />
                </span>
              </div>
            )}
            {run.iterations.map((iter) => (
              <IterationCard key={iter.iteration} iteration={iter} />
            ))}
          </div>

          {run.summary && !run.active && (
            <div className="mt-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs text-emerald-100">
              <div className="mb-1 flex items-center gap-1.5 font-medium">
                <CheckCircle2 size={12} className="text-emerald-400" />
                Summary
              </div>
              <p className="whitespace-pre-wrap leading-relaxed">{run.summary}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const ITERATION_STATUS_LABELS: Record<IterationStatus, string> = {
  thinking: 'Thinking',
  acting: 'Acting',
  executing_tool: 'Executing tool',
  complete: 'Complete',
};

const ITERATION_STATUS_COLORS: Record<IterationStatus, string> = {
  thinking: 'bg-indigo-500/15 text-indigo-300',
  acting: 'bg-purple-500/15 text-purple-300',
  executing_tool: 'bg-amber-500/15 text-amber-300',
  complete: 'bg-emerald-500/15 text-emerald-300',
};

function IterationCard({ iteration }: { iteration: ReActIteration }) {
  return (
    <div className="rounded-xl border border-[#1f1f2e] bg-[#13131f] p-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium text-[#94a3b8]">
          Iteration {iteration.iteration}
        </span>
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-[10px] font-medium',
            ITERATION_STATUS_COLORS[iteration.status],
          )}
        >
          {ITERATION_STATUS_LABELS[iteration.status]}
        </span>
      </div>

      {iteration.reasoning && (
        <p className="mt-2 text-xs leading-relaxed text-[#cbd5e1]">
          {iteration.reasoning}
        </p>
      )}

      {iteration.toolCalls.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {iteration.toolCalls.map((tc) => (
            <ToolCallItem key={tc.id} toolCall={tc} />
          ))}
        </div>
      )}
    </div>
  );
}

function ToolCallItem({ toolCall }: { toolCall: ToolCall }) {
  const [expanded, setExpanded] = useState(false);
  const argsStr = formatArgs(toolCall.args);
  const isExecuting = toolCall.status === 'executing';
  const hasResult = Boolean(toolCall.result);

  return (
    <div className="rounded-lg border border-[#1f1f2e] bg-[#0a0a0f] p-2">
      <button
        onClick={() => hasResult && setExpanded((p) => !p)}
        className={cn(
          'flex w-full items-center gap-1.5 text-left',
          !hasResult && 'cursor-default',
        )}
        disabled={!hasResult}
      >
        <Wrench
          size={11}
          className={cn(
            'shrink-0',
            isExecuting ? 'text-amber-400' : 'text-emerald-400',
          )}
        />
        <span className="shrink-0 font-mono text-[11px] text-[#f1f5f9]">
          {toolCall.tool}
        </span>
        {argsStr && (
          <span className="min-w-0 truncate font-mono text-[10px] text-[#64748b]">
            → {argsStr}
          </span>
        )}
        {isExecuting && (
          <Loader2
            size={11}
            className="ml-auto shrink-0 animate-spin text-amber-400"
          />
        )}
        {hasResult && (
          <ChevronDown
            size={11}
            className={cn(
              'ml-auto shrink-0 text-[#64748b] transition-transform',
              expanded && 'rotate-180',
            )}
          />
        )}
      </button>
      {expanded && hasResult && toolCall.result && (
        <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-[#0d0d18] p-2 font-mono text-[10px] leading-relaxed text-[#94a3b8]">
          {toolCall.result}
        </pre>
      )}
    </div>
  );
}

function TerminalDrawer({
  open,
  ready,
  onToggle,
  sessionId,
  terminalInput,
  onTerminalInputChange,
  onSubmit,
  terminalContainerRef,
}: {
  open: boolean;
  ready: boolean;
  onToggle: () => void;
  sessionId: string | null;
  terminalInput: string;
  onTerminalInputChange: (v: string) => void;
  onSubmit: (e: ReactFormEvent) => void;
  terminalContainerRef: RefObject<HTMLDivElement | null>;
}) {
  return (
    <section
      className={cn(
        'shrink-0 border-t border-[#1f1f2e] bg-[#0f0f1a] transition-[height] duration-300 ease-in-out',
        open ? 'h-[40vh] md:h-80' : 'h-11',
      )}
    >
      <button
        onClick={onToggle}
        className="flex h-11 w-full items-center justify-between px-3 transition-colors hover:bg-[#13131f] md:px-4"
        aria-expanded={open}
        aria-label="Toggle terminal"
      >
        <div className="flex items-center gap-2">
          <TerminalIcon size={14} className="text-indigo-400" />
          <span className="text-xs font-medium text-[#94a3b8]">Terminal</span>
          {ready && (
            <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-400">
              <Circle size={6} className="fill-emerald-500 text-emerald-500" />
              ready
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden text-[10px] text-[#64748b] sm:inline">
            {sessionId ? `session ${sessionId.slice(0, 8)}…` : 'no session'}
          </span>
          {open ? (
            <ChevronDown size={14} className="text-[#94a3b8]" />
          ) : (
            <ChevronUp size={14} className="text-[#94a3b8]" />
          )}
        </div>
      </button>

      {open && (
        <div className="flex h-[calc(100%-2.75rem)] flex-col">
          <div
            ref={terminalContainerRef}
            className="min-h-0 flex-1 overflow-hidden bg-[#0a0a0f]"
          />
          <form
            onSubmit={onSubmit}
            className="flex h-10 shrink-0 items-center gap-2 border-t border-[#1f1f2e] bg-[#0a0a0f] px-3"
          >
            <span className="font-mono text-xs text-indigo-400">$</span>
            <input
              value={terminalInput}
              onChange={(e: ReactChangeEvent<HTMLInputElement>) =>
                onTerminalInputChange(e.target.value)
              }
              placeholder={
                sessionId ? 'Type a command…' : 'Start a chat to open a terminal'
              }
              disabled={!sessionId}
              className="flex-1 bg-transparent font-mono text-xs text-[#e0e0e0] outline-none placeholder:text-[#475569] disabled:opacity-50"
              autoComplete="off"
              spellCheck={false}
            />
            {terminalInput.trim() && (
              <button
                type="submit"
                className="rounded px-2 py-0.5 text-[10px] text-indigo-400 hover:bg-[#1e293b]"
                aria-label="Run command"
              >
                ↵
              </button>
            )}
          </form>
        </div>
      )}
    </section>
  );
}
