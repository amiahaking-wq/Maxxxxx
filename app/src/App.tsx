import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent as ReactChangeEvent,
  type FormEvent as ReactFormEvent,
  type RefObject,
} from 'react';
import { io, type Socket } from 'socket.io-client';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import {
  Bot,
  Brain,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Circle,
  Download,
  File as FileIcon,
  Folder,
  Image as ImageIcon,
  Loader2,
  Menu,
  MessageSquare,
  Plus,
  RefreshCw,
  Search,
  Send,
  Server,
  Settings,
  Square,
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
const MAX_SELECTED_MODEL_KEY = 'max-selected-model';

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

interface MessageImage {
  filename: string;
  path: string;
  url: string;
  mimeType: string;
}

interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  metadata?: MessageMetadata | null;
  createdAt: string;
  images?: MessageImage[];
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
  images?: MessageImage[];
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

interface FileEntry {
  name: string;
  type: 'file' | 'directory';
  size?: number;
}

interface FileViewerState {
  path: string;
  content: string;
  size?: number;
  loading: boolean;
}

type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

type SidebarTab = 'chats' | 'files';

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

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const commaIdx = result.indexOf(',');
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
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

  // Config
  const [models, setModels] = useState<ModelOption[]>([]);
  const [selectedModel, setSelectedModel] = useState(() => {
    if (typeof window === 'undefined') return '';
    try {
      return window.localStorage.getItem(MAX_SELECTED_MODEL_KEY) || '';
    } catch {
      return '';
    }
  });
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [branding, setBranding] = useState({ name: 'MAX', tagline: 'Your AI Agent' });

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
  const [thinkingContent, setThinkingContent] = useState('');
  const [liveTokens, setLiveTokens] = useState('');
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  // UI state
  const [searchQuery, setSearchQuery] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [terminalReady, setTerminalReady] = useState(false);
  const [terminalInput, setTerminalInput] = useState('');
  const [modelMenuOpen, setModelMenuOpen] = useState(false);

  // Image upload state
  const [pendingImage, setPendingImage] = useState<MessageImage | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadFileSize, setUploadFileSize] = useState(0);

  // Connection status (finer-grained than `connected`)
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>('connecting');

  // File browser state
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('chats');
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [filesError, setFilesError] = useState<string | null>(null);
  const [fileViewer, setFileViewer] = useState<FileViewerState | null>(null);

  // Refs
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const terminalContainerRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const modelMenuRef = useRef<HTMLDivElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const activeConversationIdRef = useRef<string | null>(null);
  const previousConversationIdRef = useRef<string | null>(null);
  const cancelledRef = useRef(false);

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

  const loadFiles = async () => {
    setFilesLoading(true);
    setFilesError(null);
    try {
      const res = await fetch(`${API_BASE}/api/files/sandbox/`);
      if (!res.ok) throw new Error('Failed to load files');
      const data = await res.json();
      if (!data.success) throw new Error('Failed to load files');
      const rawEntries: Array<{ name: string; type: string; size?: number }> =
        data.entries || [];
      const entries: FileEntry[] = rawEntries.map((e) => ({
        name: e.name,
        type: e.type === 'directory' ? 'directory' : 'file',
        size: typeof e.size === 'number' ? e.size : undefined,
      }));
      entries.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      setFiles(entries);
    } catch (err) {
      setFilesError(err instanceof Error ? err.message : 'Failed to load files');
    } finally {
      setFilesLoading(false);
    }
  };

  const viewFile = async (entry: FileEntry) => {
    if (entry.type !== 'file') return;
    setFileViewer({ path: entry.name, content: '', loading: true });
    try {
      const res = await fetch(
        `${API_BASE}/api/files/sandbox/${encodeURIComponent(entry.name)}`,
      );
      if (!res.ok) throw new Error('Failed to load file');
      const data = await res.json();
      if (!data.success) throw new Error('Failed to load file');
      const content =
        typeof data.content === 'string'
          ? data.content
          : JSON.stringify(data.content, null, 2);
      setFileViewer({
        path: entry.name,
        content,
        size: typeof data.size === 'number' ? data.size : undefined,
        loading: false,
      });
    } catch (err) {
      setFileViewer({
        path: entry.name,
        content: err instanceof Error ? err.message : 'Failed to load file',
        loading: false,
      });
    }
  };

  const downloadFile = (path: string) => {
    const url = `${API_BASE}/api/files/download/${encodeURIComponent(path)}`;
    const a = document.createElement('a');
    a.href = url;
    a.download = path;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  useEffect(() => {
    const s = io({ transports: ['polling', 'websocket'] });
    setSocket(s);

    s.on('connect', () => {
      setConnectionStatus('connected');
    });
    s.on('disconnect', () => {
      setConnectionStatus('disconnected');
    });
    s.on('connect_error', () => {
      setConnectionStatus('reconnecting');
    });

    // Streaming events — live token + thinking display
    s.on('agent:stream', (data: { text?: string }) => {
      if (data.text) setLiveTokens(prev => prev + data.text);
    });

    s.on('agent:reasoning', (data: { text?: string }) => {
      if (data.text) setThinkingContent(prev => prev + data.text);
    });

    s.on('token', (data: { type?: string; text?: string }) => {
      if (data.type === 'start') { setLiveTokens(''); setThinkingContent(''); }
      else if (data.type === 'token' && data.text) setLiveTokens(prev => prev + data.text);
      else if (data.type === 'done') { setThinkingContent(''); }
    });

    s.on('agent:done', () => {
      setThinkingContent('');
      setLiveTokens('');
    });

    s.on('progress', (data: ProgressPayload) => {
      if (!data.sessionId) return;
      // When the task completes, push the summary as a regular assistant message
      if (data.status === 'complete' && data.summary) {
        const summary = data.summary;
        if (data.sessionId === activeConversationIdRef.current) {
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.role === 'assistant' && last.content === summary) {
              return prev; // avoid duplicate if 'message' event already added it
            }
            return [
              ...prev,
              {
                id: `assistant-summary-${data.sessionId}-${Date.now()}`,
                role: 'assistant' as const,
                content: summary,
                createdAt: new Date().toISOString(),
              },
            ];
          });
        }
      }
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
      if (!content) return;
      // Push notification when the app is in the background
      if (
        document.hidden &&
        'Notification' in window &&
        Notification.permission === 'granted'
      ) {
        try {
          new Notification('MAX', {
            body: content.substring(0, 100),
            icon: '/manifest.json',
          });
        } catch {
          // ignore notification errors
        }
      }
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.role === 'assistant' && last.content === content) {
          return prev; // avoid duplicate if 'progress' complete already added it
        }
        return [
          ...prev,
          {
            id: data.id || `assistant-${Date.now()}`,
            role: 'assistant',
            content,
            metadata: data.type ? { type: data.type } : null,
            createdAt: data.timestamp || new Date().toISOString(),
            images: data.images,
            model: (data as any).model,
          },
        ];
      });
      setIsLoading(false);
      setThinkingContent('');
      setLiveTokens('');
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
          setSelectedModel((prev) => {
            if (prev && list.some((m) => m.id === prev)) return prev;
            return list[0].id;
          });
        }
      })
      .catch(() => setModels([]));

    // Load config (providers + default model + branding)
    fetch(`${API_BASE}/api/config`)
      .then((r) => r.json())
      .then((data: AppConfig) => {
        setConfig(data);
        setSelectedModel((prev) => prev || data.model || '');
        if (data.name) setBranding(prev => ({ ...prev, name: data.name as string }));
        if (data.tagline) setBranding(prev => ({ ...prev, tagline: data.tagline as string }));
      })
      .catch(() => null);

    // Load conversations list
    void refreshConversations();

    // Request notification permission for PWA background alerts
    if ('Notification' in window && Notification.permission === 'default') {
      void Notification.requestPermission();
    }

    // Register service worker for PWA / background notifications
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // ignore registration errors (non-PWA environment)
      });
    }

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

  // Keyboard detection for PWA — adjusts layout when keyboard opens
  useEffect(() => {
    const handleResize = () => {
      if (window.visualViewport) {
        const heightDiff = window.innerHeight - window.visualViewport.height;
        setKeyboardHeight(heightDiff > 100 ? heightDiff : 0);
      }
    };

    window.visualViewport?.addEventListener('resize', handleResize);
    window.addEventListener('resize', handleResize);

    return () => {
      window.visualViewport?.removeEventListener('resize', handleResize);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

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

  // Load sandbox files when the Files tab is first opened
  useEffect(() => {
    if (
      sidebarTab === 'files' &&
      files.length === 0 &&
      !filesLoading &&
      !filesError
    ) {
      void loadFiles();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sidebarTab]);

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

  const sendMessage = async (convId: string, text: string, image?: MessageImage) => {
    cancelledRef.current = false;
    const userMsg: ConversationMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      createdAt: new Date().toISOString(),
      images: image ? [image] : undefined,
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
      const payload: Record<string, unknown> = {
        message: text,
        runAgent: true,
        userId: USER_ID,
      };
      if (image) {
        payload.image = {
          filename: image.filename,
          path: image.path,
          url: image.url,
          mimeType: image.mimeType,
        };
      }
      const res = await fetch(`${API_BASE}/api/conversations/${convId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
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
    const image = pendingImage;
    if ((!text && !image) || isLoading) return;
    setInput('');
    setPendingImage(null);

    let convId = activeConversationId;
    if (!convId) {
      try {
        convId = await createConversation();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create conversation');
        return;
      }
    }
    await sendMessage(convId, text || '(image)', image ?? undefined);
  };

  const handleImageSelect = (e: ReactChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // reset so the same file can be re-selected
    if (!file) return;
    setUploadingImage(true);
    setUploadProgress(0);
    setUploadFileSize(file.size);
    setError(null);

    void (async () => {
      try {
        const base64 = await fileToBase64(file);
        const body = JSON.stringify({
          image: base64,
          filename: file.name,
          mimeType: file.type || 'image/octet-stream',
        });

        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.upload.addEventListener('progress', (ev) => {
            if (ev.lengthComputable) {
              const percent = Math.round((ev.loaded / ev.total) * 100);
              setUploadProgress(percent);
            }
          });
          xhr.addEventListener('load', () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              try {
                const data = JSON.parse(xhr.responseText) as {
                  success?: boolean;
                  error?: string;
                  filename?: string;
                  path?: string;
                  url?: string;
                };
                if (!data.success) {
                  reject(new Error(data.error || 'Upload failed'));
                  return;
                }
                setPendingImage({
                  filename: data.filename || file.name,
                  path: data.path || '',
                  url: data.url || '',
                  mimeType: file.type || 'image/octet-stream',
                });
                resolve();
              } catch {
                reject(new Error('Invalid response from server'));
              }
            } else {
              let msg = `Upload failed (${xhr.status})`;
              try {
                const errBody = JSON.parse(xhr.responseText) as { error?: string };
                if (errBody.error) msg = errBody.error;
              } catch {
                if (xhr.responseText) msg = xhr.responseText.slice(0, 200);
              }
              reject(new Error(msg));
            }
          });
          xhr.addEventListener('error', () =>
            reject(new Error('Network error during upload')),
          );
          xhr.addEventListener('abort', () => reject(new Error('Upload aborted')));
          xhr.open('POST', `${API_BASE}/api/upload`);
          xhr.setRequestHeader('Content-Type', 'application/json');
          xhr.send(body);
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to upload image');
      } finally {
        setUploadingImage(false);
        setUploadProgress(0);
      }
    })();
  };

  const handleSuggestionClick = (suggestion: string) => {
    setInput(suggestion);
    textareaRef.current?.focus();
  };

  const handleStop = () => {
    cancelledRef.current = true;
    setIsLoading(false);
    setAgentRun((prev) => (prev ? { ...prev, active: false } : prev));
    setMessages((prev) => [
      ...prev,
      {
        id: `cancelled-${Date.now()}`,
        role: 'assistant',
        content: 'Cancelled by user',
        createdAt: new Date().toISOString(),
      },
    ]);
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
    <div className="h-[100dvh] w-screen flex flex-col bg-slate-950 text-white overflow-hidden">
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
              <span className="text-sm font-semibold text-white">{branding.name}</span>
              <span className="text-[10px] text-[#64748b]">{branding.tagline}</span>
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

        {/* Search (chats tab only) */}
        {sidebarTab === 'chats' && (
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
        )}

        {/* Tabs */}
        <div className="flex shrink-0 gap-1 px-3 pb-2">
          <button
            onClick={() => setSidebarTab('chats')}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
              sidebarTab === 'chats'
                ? 'bg-[#1e293b] text-white'
                : 'text-[#94a3b8] hover:bg-[#13131f] hover:text-white',
            )}
          >
            <MessageSquare size={13} />
            Chats
          </button>
          <button
            onClick={() => setSidebarTab('files')}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
              sidebarTab === 'files'
                ? 'bg-[#1e293b] text-white'
                : 'text-[#94a3b8] hover:bg-[#13131f] hover:text-white',
            )}
          >
            <Folder size={13} />
            Files
          </button>
        </div>

        {/* Tab content */}
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {sidebarTab === 'chats' ? (
            loadingConversations ? (
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
            )
          ) : (
            <FileBrowser
              files={files}
              loading={filesLoading}
              error={filesError}
              onRefresh={loadFiles}
              onView={viewFile}
              onDownload={(entry) => downloadFile(entry.name)}
            />
          )}
        </div>

        {/* Sidebar footer */}
        <div className="shrink-0 border-t border-[#1f1f2e] p-3">
          <div className="mb-2 flex items-center justify-between rounded-lg bg-[#13131f] px-3 py-2 text-[11px] text-[#94a3b8]">
            <div className="flex items-center gap-1.5">
              <Circle
                size={8}
                className={cn(
                  connectionStatus === 'connected'
                    ? 'fill-emerald-500 text-emerald-500'
                    : connectionStatus === 'reconnecting'
                      ? 'fill-amber-500 text-amber-500'
                      : 'fill-red-500 text-red-500',
                )}
              />
              <span>
                {connectionStatus === 'connected'
                  ? 'Connected'
                  : connectionStatus === 'reconnecting'
                    ? 'Reconnecting…'
                    : 'Disconnected'}
              </span>
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
        <header className="safe-area-top safe-area-x flex h-14 shrink-0 items-center justify-between gap-2 border-b border-[#1f1f2e] bg-[#0f0f1a]/80 px-3 backdrop-blur-md md:px-4 z-40">
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
                              try {
                                window.localStorage.setItem(
                                  MAX_SELECTED_MODEL_KEY,
                                  m.id,
                                );
                              } catch {
                                // ignore storage errors
                              }
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
          className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden no-scrollbar"
          style={{
            paddingBottom: keyboardHeight > 0 ? `${keyboardHeight + 80}px` : 'env(safe-area-inset-bottom)'
          }}
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

                {/* Thinking block — shows when model is reasoning */}
                {thinkingContent && (
                  <div className="mb-2 rounded-lg bg-amber-500/10 border border-amber-500/20 p-3">
                    <div className="flex items-center gap-2 text-xs text-amber-400 font-medium mb-1">
                      <span className="animate-pulse">💭</span>
                      <span>Thinking...</span>
                    </div>
                    <div className="text-xs text-amber-300/70 font-mono whitespace-pre-wrap">
                      {thinkingContent}
                    </div>
                  </div>
                )}

                {/* Live tokens — shows streaming response before final message */}
                {liveTokens && (
                  <div className="flex gap-3">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500">
                      <Bot size={14} className="text-white" />
                    </div>
                    <div className="flex-1 text-sm text-slate-200 whitespace-pre-wrap">
                      {liveTokens}
                      <span className="animate-pulse">▊</span>
                    </div>
                  </div>
                )}

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
        <footer
          className="safe-area-x relative shrink-0 border-t border-[#1f1f2e] bg-[#0f0f1a]/95 backdrop-blur-sm px-3 py-2.5 md:px-4 md:py-3 z-50"
          style={{
            paddingBottom: keyboardHeight > 0 ? '12px' : 'max(12px, env(safe-area-inset-bottom))'
          }}
        >
          <div className="mx-auto w-full max-w-3xl">
            {/* Pending image preview / uploading state */}
            {(pendingImage || uploadingImage) && (
              <div className="mb-2 flex items-center gap-2 rounded-xl border border-[#1f1f2e] bg-[#13131f] p-2">
                {uploadingImage ? (
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[#1e293b]">
                      <Loader2 size={16} className="animate-spin text-indigo-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-[#94a3b8]">Uploading image…</span>
                        <span className="text-[10px] text-[#64748b]">
                          {formatFileSize(uploadFileSize)}
                        </span>
                      </div>
                      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[#1e293b]">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-200"
                          style={{ width: `${uploadProgress}%` }}
                        />
                      </div>
                      <div className="mt-1 text-[10px] text-[#64748b]">
                        {uploadProgress}%
                      </div>
                    </div>
                  </div>
                ) : pendingImage ? (
                  <>
                    <img
                      src={pendingImage.url}
                      alt={pendingImage.filename}
                      className="h-12 w-12 shrink-0 rounded-lg object-cover"
                    />
                    <span className="min-w-0 flex-1 truncate text-xs text-[#94a3b8]">
                      {pendingImage.filename}
                    </span>
                    <button
                      onClick={() => setPendingImage(null)}
                      className="shrink-0 rounded p-1 text-[#64748b] transition-colors hover:bg-[#1e293b] hover:text-red-400"
                      aria-label="Remove image"
                    >
                      <X size={14} />
                    </button>
                  </>
                ) : null}
              </div>
            )}
            <div className="flex items-end gap-2 rounded-2xl border border-[#1f1f2e] bg-[#13131f] px-3 py-2 transition-colors focus-within:border-indigo-500/50">
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) => handleImageSelect(e)}
                className="hidden"
              />
              <input
                ref={galleryInputRef}
                type="file"
                accept="image/*"
                onChange={(e) => handleImageSelect(e)}
                className="hidden"
              />
              <button
                onClick={() => cameraInputRef.current?.click()}
                disabled={uploadingImage || isLoading}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[#94a3b8] transition-colors hover:bg-[#1e293b] hover:text-indigo-400 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Take photo"
                title="Camera"
              >
                <Camera size={17} />
              </button>
              <button
                onClick={() => galleryInputRef.current?.click()}
                disabled={uploadingImage || isLoading}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[#94a3b8] transition-colors hover:bg-[#1e293b] hover:text-indigo-400 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Pick image from gallery"
                title="Gallery"
              >
                <ImageIcon size={17} />
              </button>
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e: ReactChangeEvent<HTMLTextAreaElement>) =>
                  setInput(e.target.value)
                }
                placeholder="Ask MAX to build something…"
                rows={1}
                disabled={isLoading}
                className="max-h-[140px] min-h-[24px] flex-1 resize-none bg-transparent py-1 text-base text-[#f1f5f9] outline-none placeholder:text-[#64748b] disabled:opacity-50 md:text-sm"
                autoComplete="off"
                spellCheck={false}
              />
              {isLoading ? (
                <button
                  onClick={handleStop}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-500 text-white shadow-lg shadow-red-500/30 transition-all hover:bg-red-600 active:scale-[0.98]"
                  aria-label="Stop generation"
                  title="Stop"
                >
                  <Square size={16} fill="currentColor" />
                </button>
              ) : (
                <button
                  onClick={() => void handleSend()}
                  disabled={!input.trim() && !pendingImage}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 text-white shadow-lg shadow-indigo-500/30 transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
                  aria-label="Send message"
                >
                  <Send size={17} />
                </button>
              )}
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
                <kbd className="rounded border border-[#1f1f2e] px-1 py-0.5">
                  Send
                </kbd>
                to submit · Enter for newline
              </span>
            </div>
          </div>
        </footer>
      </div>

      {/* File viewer modal */}
      {fileViewer && (
        <div
          className="max-fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setFileViewer(null)}
        >
          <div
            className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[#1f1f2e] bg-[#13131f] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2 border-b border-[#1f1f2e] px-4 py-3">
              <div className="flex min-w-0 items-center gap-2">
                <FileIcon size={16} className="shrink-0 text-indigo-400" />
                <span className="truncate text-sm font-medium text-white">
                  {fileViewer.path}
                </span>
                {fileViewer.size !== undefined && (
                  <span className="shrink-0 text-[10px] text-[#64748b]">
                    {formatFileSize(fileViewer.size)}
                  </span>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  onClick={() => downloadFile(fileViewer.path)}
                  className="rounded-lg p-1.5 text-[#94a3b8] transition-colors hover:bg-[#1e293b] hover:text-indigo-400"
                  aria-label="Download file"
                  title="Download"
                >
                  <Download size={16} />
                </button>
                <button
                  onClick={() => setFileViewer(null)}
                  className="rounded-lg p-1.5 text-[#94a3b8] transition-colors hover:bg-[#1e293b] hover:text-white"
                  aria-label="Close file viewer"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-4">
              {fileViewer.loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 size={20} className="animate-spin text-[#64748b]" />
                </div>
              ) : (
                <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-[#cbd5e1]">
                  {fileViewer.content}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}

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
        {branding.name} — {branding.tagline}
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
  const hasImages = Boolean(message.images && message.images.length > 0);

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
          'max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed md:max-w-[75%]',
          isUser
            ? 'rounded-br-md bg-gradient-to-br from-indigo-500 to-purple-500 text-white shadow-lg shadow-indigo-500/20'
            : isError
              ? 'rounded-bl-md border border-red-500/30 bg-[#13131f] text-red-200'
              : 'rounded-bl-md border border-[#1f1f2e] bg-[#13131f] text-[#f1f5f9]',
        )}
      >
        {hasImages && message.images && (
          <div
            className={cn(
              'flex flex-wrap gap-2',
              message.content && 'mb-2',
            )}
          >
            {message.images.map((img, idx) => (
              <img
                key={`${img.filename}-${idx}`}
                src={img.url}
                alt={img.filename}
                className="max-h-48 max-w-full rounded-lg object-cover"
                loading="lazy"
              />
            ))}
          </div>
        )}
        {message.content && (
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        )}
        {/* Show which model generated this response */}
        {!isUser && (message as any).model && (
          <div className="flex items-center gap-1.5 mt-1.5 mb-1">
            <div className={`w-1.5 h-1.5 rounded-full ${
              (message as any).model.provider === 'openai-compatible' ? 'bg-green-400' :
              (message as any).model.provider === 'groq' ? 'bg-purple-400' :
              (message as any).model.provider === 'gemini' ? 'bg-blue-400' :
              (message as any).model.provider === 'phone' ? 'bg-orange-400' :
              'bg-slate-400'
            }`} />
            <span className="text-[10px] text-slate-500 font-medium">
              {(message as any).model.displayName || (message as any).model.model}
            </span>
          </div>
        )}
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

function FileBrowser({
  files,
  loading,
  error,
  onRefresh,
  onView,
  onDownload,
}: {
  files: FileEntry[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onView: (entry: FileEntry) => void;
  onDownload: (entry: FileEntry) => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-1 pb-2">
        <span className="text-xs font-medium text-[#94a3b8]">Sandbox Files</span>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="rounded p-1 text-[#64748b] transition-colors hover:bg-[#1e293b] hover:text-white disabled:opacity-50"
          aria-label="Refresh files"
          title="Refresh"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={18} className="animate-spin text-[#64748b]" />
        </div>
      ) : error ? (
        <div className="px-3 py-6 text-center text-xs text-red-400">{error}</div>
      ) : files.length === 0 ? (
        <div className="px-3 py-8 text-center text-xs text-[#64748b]">
          No files in sandbox
        </div>
      ) : (
        <ul className="space-y-0.5">
          {files.map((f) => (
            <li key={f.name}>
              <div className="group flex items-center gap-2 rounded-lg px-2 py-2 transition-colors hover:bg-[#13131f]">
                {f.type === 'directory' ? (
                  <Folder size={14} className="shrink-0 text-amber-400" />
                ) : (
                  <FileIcon size={14} className="shrink-0 text-[#64748b]" />
                )}
                <button
                  onClick={() => onView(f)}
                  disabled={f.type !== 'file'}
                  className="min-w-0 flex-1 text-left disabled:cursor-default"
                >
                  <span className="block truncate text-xs text-[#cbd5e1]">
                    {f.name}
                  </span>
                  {f.size !== undefined && (
                    <span className="text-[10px] text-[#64748b]">
                      {formatFileSize(f.size)}
                    </span>
                  )}
                </button>
                {f.type === 'file' && (
                  <button
                    onClick={() => onDownload(f)}
                    className="shrink-0 rounded p-1 text-[#64748b] opacity-0 transition-opacity hover:bg-[#1e293b] hover:text-indigo-400 focus:opacity-100 group-hover:opacity-100"
                    aria-label={`Download ${f.name}`}
                    title="Download"
                  >
                    <Download size={13} />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
