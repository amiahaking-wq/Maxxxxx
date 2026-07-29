'use client';
import { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { Menu, Plus, Mic, Paperclip, Send, X, Check, Loader2, Volume2, ChevronDown, ChevronRight, Settings as SettingsIcon, Folder, Terminal as TerminalIcon, Globe } from 'lucide-react';
import { SettingsPanel } from './SettingsPanel';
import { Sidebar } from './Sidebar';
import { Terminal } from './Terminal';
import { useTranslation } from 'react-i18next';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  toolCalls?: ToolCall[];
  files?: UploadedFile[];
  artifacts?: any[];
  filesModified?: string[];
}

interface ToolCall {
  tool: string;
  args: any;
  status: 'running' | 'done' | 'failed';
  result?: string;
}

interface UploadedFile {
  name: string;
  type: string;
  url: string;
  size?: number;
}

interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
}

interface MainAppProps {
  token: string;
  user: any;
  onLogout: () => void;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://maxxxxx-production.up.railway.app';

// Helper: prefix relative API paths with the backend URL
function apiUrl(path: string): string {
  if (path.startsWith('http')) return path;
  return `${API_BASE}${path}`;
}

export function MainApp({ token, user, onLogout }: MainAppProps) {
  const { t, i18n } = useTranslation('common');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [streamingContent, setStreamingContent] = useState('');
  const [reasoningContent, setReasoningContent] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [toolCalls, setToolCalls] = useState<ToolCall[]>([]);
  const [narration, setNarration] = useState<{ icon: string; description: string; detail: string } | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [models, setModels] = useState<any[]>([]);
  const [currentModel, setCurrentModel] = useState('');
  const socketRef = useRef<Socket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const narrationTimeoutRef = useRef<any>(null);

  const activeConversation = conversations.find(c => c.id === activeId);

  // Connect socket with auth — connects directly to backend
  useEffect(() => {
    // Always use the backend URL for Socket.IO (NOT the frontend proxy — WebSockets can't be proxied)
    const socketUrl = API_BASE || 'https://maxxxxx-production.up.railway.app';
    console.log('[MAX] Connecting Socket.IO to:', socketUrl);
    const socket = io(socketUrl, {
      auth: { token },
      transports: ['polling', 'websocket'],  // polling first — more reliable through Railway proxy
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 2000
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('[MAX] Socket.IO connected:', socket.id);
    });
    socket.on('connect_error', (err: any) => {
      console.error('[MAX] Socket.IO connection error:', err.message);
    });

    socket.on('token', (data: any) => {
      if (data.type === 'start') { setStreamingContent(''); setReasoningContent(''); setIsRunning(true); setToolCalls([]); }
      else if (data.type === 'token') { setStreamingContent(prev => prev + data.text); }
      else if (data.type === 'done') { setIsRunning(false); }
    });

    // Phase 2.4 — agent:stream events (real-time token streaming from the agent)
    socket.on('agent:stream', (data: any) => {
      if (data?.text) {
        setIsRunning(true);
        setStreamingContent(prev => prev + data.text);
      }
    });

    // Phase 2.4 — agent:reasoning events (deepseek-r1 / o1 style thinking)
    socket.on('agent:reasoning', (data: any) => {
      if (data?.text) {
        setReasoningContent(prev => prev + data.text);
      }
    });

    // Phase 2.4 — agent:narration events (tool execution narration toast)
    socket.on('agent:narration', (data: any) => {
      if (!data) return;
      setNarration({
        icon: data.icon || '🛠️',
        description: data.description || `Executing ${data.action}`,
        detail: data.detail || ''
      });
      // Auto-dismiss after 4 seconds
      if (narrationTimeoutRef.current) clearTimeout(narrationTimeoutRef.current);
      narrationTimeoutRef.current = setTimeout(() => setNarration(null), 4000);
    });

    // Phase 6.4 — agent:request_camera events (camera capture request)
    socket.on('agent:request_camera', () => {
      setShowCamera(true);
    });

    socket.on('progress', (data: any) => {
      if (data.status === 'executing_tool') {
        setToolCalls(prev => [...prev, { tool: data.tool, args: data.args, status: 'running' }]);
      } else if (data.status === 'tool_result') {
        setToolCalls(prev => prev.map(tc =>
          tc.tool === data.tool && tc.status === 'running'
            ? { ...tc, status: 'done', result: data.result }
            : tc
        ));
      }
    });

    socket.on('message', (data: any) => {
      if (data.role === 'assistant' && (data.type === 'task_complete' || data.conversationId === activeId)) {
        if (!data.content || data.content.trim().length === 0) return;
        const msg: Message = {
          id: Date.now().toString(),
          role: 'assistant',
          content: data.content,
          timestamp: new Date(),
          filesModified: data.filesModified
        };
        setConversations(prev => prev.map(c =>
          c.id === activeId ? { ...c, messages: [...c.messages, msg], updatedAt: new Date() } : c
        ));
        setStreamingContent('');
        setReasoningContent('');
        setIsRunning(false);
      }
    });

    socket.on('file_created', (data: any) => {
      setConversations(prev => prev.map(c => {
        if (c.id !== activeId) return c;
        const msgs = [...c.messages];
        const last = msgs[msgs.length - 1];
        if (last && last.role === 'assistant') {
          last.artifacts = [...(last.artifacts || []), data];
        }
        return { ...c, messages: msgs };
      }));
    });

    socket.on('confirmation', (data: any) => {
      if (confirm(`MAX wants to: ${data.description}\n\nAllow this action?`)) {
        socket.emit('confirm_action', { confirmationId: data.confirmationId, approved: true });
      } else {
        socket.emit('confirm_action', { confirmationId: data.confirmationId, approved: false });
      }
    });

    return () => {
      socket.disconnect();
      if (narrationTimeoutRef.current) clearTimeout(narrationTimeoutRef.current);
    };
  }, [token, activeId]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeConversation?.messages, streamingContent, reasoningContent, toolCalls]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + 'px';
    }
  }, [input]);

  // Load conversations + models on mount
  useEffect(() => {
    fetchConversations();
    fetchModels();
  }, []);

  async function fetchConversations() {
    try {
      const res = await fetch(apiUrl('/api/conversations'), { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (data.conversations) {
        const convs = data.conversations.map((s: any) => ({
          id: s.id,
          title: s.title || 'New conversation',
          messages: [],
          createdAt: new Date(s.createdAt || s.created_at || Date.now()),
          updatedAt: new Date(s.updatedAt || s.updated_at || Date.now())
        }));
        setConversations(convs);
      }
    } catch {}
  }

  async function fetchModels() {
    try {
      const res = await fetch(apiUrl('/api/config/models'), { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (data.models) {
        setModels(data.models);
        const saved = localStorage.getItem('max_model');
        if (saved && data.models.find((m: any) => m.id === saved)) {
          setCurrentModel(saved);
        } else {
          const def = data.models.find((m: any) => m.default) || data.models[0];
          if (def) setCurrentModel(def.id);
        }
      }
    } catch {}
  }

  async function loadConversation(id: string) {
    try {
      const res = await fetch(apiUrl(`/api/conversations/${id}`), { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (data.success && data.conversation) {
        setConversations(prev => prev.map(c =>
          c.id === id ? { ...c, messages: (data.conversation.messages || []).map((m: any) => ({
            id: m.id || Date.now().toString(),
            role: m.role,
            content: m.content,
            timestamp: new Date(m.createdAt || m.created_at || Date.now()),
            filesModified: m.metadata?.filesModified
          })) } : c
        ));
      }
    } catch {}
  }

  function newConversation() {
    const id = crypto.randomUUID();
    const conv: Conversation = {
      id, title: 'New conversation', messages: [], createdAt: new Date(), updatedAt: new Date()
    };
    setConversations(prev => [conv, ...prev]);
    setActiveId(id);
    setStreamingContent('');
    setToolCalls([]);
    setSidebarOpen(false);
    // Create on backend
    fetch(apiUrl('/api/conversations'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ platform: 'web', title: 'New Conversation' })
    }).then(r => r.json()).then(d => {
      if (d.success) {
        setConversations(prev => prev.map(c => c.id === id ? { ...c, id: d.conversation.id } : c));
        setActiveId(d.conversation.id);
        window.history.replaceState({}, '', `/?c=${d.conversation.id}`);
      }
    }).catch(() => {});
  }

  async function sendMessage() {
    if (!input.trim() && uploadedFiles.length === 0) return;
    if (isRunning) return;

    let currentId = activeId;
    if (!currentId) {
      currentId = crypto.randomUUID();
      const conv: Conversation = {
        id: currentId, title: input.slice(0, 40) || 'New conversation',
        messages: [], createdAt: new Date(), updatedAt: new Date()
      };
      setConversations(prev => [conv, ...prev]);
      setActiveId(currentId);
    }

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
      files: uploadedFiles
    };

    setConversations(prev => prev.map(c =>
      c.id === currentId ? { ...c, messages: [...c.messages, userMsg] } : c
    ));

    // Upload files first
    let uploadedFileNames: string[] = [];
    if (uploadedFiles.length > 0) {
      // Files already uploaded via /api/upload
      uploadedFileNames = uploadedFiles.map(f => f.name);
    }

    const taskInput = input.trim() + (uploadedFileNames.length > 0
      ? `\n\n[Attached files — use read_upload to read them: ${uploadedFileNames.join(', ')}]`
      : '');

    setInput('');
    setUploadedFiles([]);
    setIsRunning(true);
    setToolCalls([]);

    try {
      await fetch(apiUrl(`/api/conversations/${currentId}/messages`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message: taskInput, files: uploadedFiles })
      });
    } catch (err) {
      setIsRunning(false);
      setConversations(prev => prev.map(c =>
        c.id === currentId ? { ...c, messages: [...c.messages, {
          id: Date.now().toString(), role: 'assistant', content: 'Error: ' + (err as Error).message,
          timestamp: new Date()
        }] } : c
      ));
    }
  }

  function toggleVoice() {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Voice input not supported in this browser. Try Chrome or Edge.');
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognitionRef.current = recognition;
    recognition.onresult = (event: any) => {
      let final = '';
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) final += event.results[i][0].transcript;
        else interim += event.results[i][0].transcript;
      }
      setInput(prev => (prev ? prev + ' ' : '') + final + interim);
    };
    recognition.onend = () => setIsListening(false);
    recognition.start();
    setIsListening(true);
  }

  async function handleFileUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    for (const file of Array.from(files)) {
      try {
        // Read as base64 and POST as JSON (matches backend upload.js)
        const reader = new FileReader();
        const base64 = await new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve(String(reader.result).split(',')[1]);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        const res = await fetch(apiUrl('/api/upload'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ filename: file.name, mimeType: file.type, data: base64 })
        });
        const data = await res.json();
        if (data.success) {
          setUploadedFiles(prev => [...prev, {
            name: data.filename, type: data.mimeType, url: data.url, size: data.size
          }]);
        }
      } catch (err) {
        console.error('Upload failed:', err);
      }
    }
  }

  function handleDrag(e: React.DragEvent, over: boolean) {
    e.preventDefault();
    setIsDragging(over);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    handleFileUpload(e.dataTransfer.files);
  }

  async function changeModel(modelId: string) {
    setCurrentModel(modelId);
    localStorage.setItem('max_model', modelId);
    try {
      await fetch(apiUrl('/api/config/model'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ model: modelId })
      });
    } catch {}
  }

  function changeLanguage(lang: string) {
    i18n.changeLanguage(lang);
    localStorage.setItem('max_language', lang);
    setLangMenuOpen(false);
  }

  const messages = activeConversation?.messages || [];
  const LANGUAGES = [
    { code: 'en', name: '🇬🇧 English' },
    { code: 'pidgin', name: '🇳🇬 Pidgin' },
    { code: 'ha', name: '🇳🇬 Hausa' },
    { code: 'yo', name: '🇳🇬 Yoruba' },
    { code: 'fr', name: '🇫🇷 French' }
  ];

  return (
    <div className="flex h-screen bg-[#0f0f0f] overflow-hidden"
      onDragOver={e => handleDrag(e, true)}
      onDragLeave={e => handleDrag(e, false)}
      onDrop={handleDrop}>

      {isDragging && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 border-2 border-dashed border-[#FF6B35]">
          <p className="text-white text-xl font-medium">Drop files here</p>
        </div>
      )}

      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/60 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <Sidebar
        open={sidebarOpen}
        conversations={conversations}
        activeId={activeId}
        user={user}
        onSelect={(id) => { setActiveId(id); setSidebarOpen(false); loadConversation(id); }}
        onNew={newConversation}
        onSettings={() => { setSettingsOpen(true); setSidebarOpen(false); }}
        onLogout={onLogout}
      />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-[#1e1e1e] bg-[#171717]" style={{ paddingTop: 'max(0.625rem, env(safe-area-inset-top))' }}>
          <button onClick={() => setSidebarOpen(true)} className="p-2 hover:bg-[#2a2a2a] rounded-lg text-[#999]">
            <Menu size={18} />
          </button>
          <div className="flex items-center gap-2">
            <span className={`w-1.5 h-1.5 rounded-full ${isRunning ? 'bg-yellow-500 animate-pulse' : 'bg-green-500'}`} />
            <select value={currentModel} onChange={e => changeModel(e.target.value)}
              className="bg-[#212121] border border-[#2a2a2a] rounded-lg px-2 py-1 text-xs text-[#ccc] focus:outline-none max-w-[160px]">
              {models.length === 0 ? <option>Loading...</option> : models.map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
            <div className="relative">
              <button onClick={() => setLangMenuOpen(!langMenuOpen)} className="p-1.5 hover:bg-[#2a2a2a] rounded-lg text-[#999]">
                <Globe size={14} />
              </button>
              {langMenuOpen && (
                <div className="absolute right-0 top-full mt-1 bg-[#212121] border border-[#2a2a2a] rounded-lg py-1 z-50 min-w-[140px]">
                  {LANGUAGES.map(l => (
                    <button key={l.code} onClick={() => changeLanguage(l.code)}
                      className={`block w-full text-left px-3 py-1.5 text-xs ${i18n.language === l.code ? 'text-[#FF6B35] bg-[#FF6B35]/10' : 'text-[#ccc] hover:bg-[#2a2a2a]'}`}>
                      {l.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button onClick={() => setTerminalOpen(true)} className="p-1.5 hover:bg-[#2a2a2a] rounded-lg text-[#999]" title="Terminal">
              <TerminalIcon size={14} />
            </button>
          </div>
          <button onClick={() => setSettingsOpen(true)} className="p-2 hover:bg-[#2a2a2a] rounded-lg text-[#999]">
            <SettingsIcon size={16} />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto">
          {messages.length === 0 && !streamingContent && !reasoningContent ? (
            <WelcomeScreen onSelect={(p) => setInput(p)} />
          ) : (
            <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
              {messages.map(msg => <ChatMessage key={msg.id} message={msg} />)}
              {toolCalls.length > 0 && (
                <div className="space-y-2">
                  {toolCalls.map((tc, i) => <ToolCallCard key={i} toolCall={tc} />)}
                </div>
              )}
              {reasoningContent && (
                <ThinkingBlock content={reasoningContent} />
              )}
              {streamingContent && (
                <div className="flex gap-3">
                  <div className="w-7 h-7 bg-[#FF6B35] rounded-lg flex items-center justify-center flex-shrink-0 mt-1">
                    <span className="text-white font-bold text-xs">M</span>
                  </div>
                  <div className="flex-1 text-[#ececec] text-sm leading-relaxed whitespace-pre-wrap">
                    {streamingContent}
                    <span className="inline-block w-0.5 h-4 bg-[#FF6B35] ml-0.5 animate-pulse" />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input */}
        <div className="p-3 border-t border-[#1e1e1e]" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
          <div className="max-w-3xl mx-auto">
            {uploadedFiles.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {uploadedFiles.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 bg-[#1e1e1e] rounded-lg px-3 py-1.5 text-xs text-[#888]">
                    <Paperclip size={12} />
                    <span>{f.name}</span>
                    <button onClick={() => setUploadedFiles(prev => prev.filter((_, j) => j !== i))}
                      className="text-[#555] hover:text-red-400"><X size={12} /></button>
                  </div>
                ))}
              </div>
            )}

            {isRunning && (
              <div className="flex items-center gap-2 mb-2 text-xs text-[#888]">
                <Loader2 size={12} className="animate-spin text-[#FF6B35]" />
                <span>MAX is working...</span>
                <button onClick={() => {
                  socketRef.current?.emit('stop_task', { sessionId: activeId });
                  setIsRunning(false);
                }} className="text-[#FF6B35] hover:text-[#e05a28] ml-auto">Stop</button>
              </div>
            )}

            <div className="flex items-end gap-2 bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl px-3 py-2 focus-within:border-[#FF6B35]/50">
              <button onClick={() => fileInputRef.current?.click()}
                className="text-[#555] hover:text-[#888] flex-shrink-0 p-1.5">
                <Paperclip size={18} />
              </button>
              <input ref={fileInputRef} type="file" multiple className="hidden"
                onChange={e => handleFileUpload(e.target.files)} />
              <textarea ref={textareaRef} value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                placeholder="Message MAX..." rows={1}
                className="flex-1 bg-transparent text-white placeholder-[#555] resize-none outline-none text-sm leading-relaxed max-h-48 py-1.5" />
              <button onClick={toggleVoice}
                className={`flex-shrink-0 p-1.5 ${isListening ? 'text-[#FF6B35] animate-pulse' : 'text-[#555] hover:text-[#888]'}`}>
                <Mic size={18} />
              </button>
              <button onClick={sendMessage}
                disabled={(!input.trim() && uploadedFiles.length === 0) || isRunning}
                className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
                  input.trim() || uploadedFiles.length > 0
                    ? 'bg-[#FF6B35] text-white hover:bg-[#e05a28]'
                    : 'bg-[#2a2a2a] text-[#555] cursor-not-allowed'
                }`}>
                <Send size={14} />
              </button>
            </div>
            <p className="text-center text-[10px] text-[#333] mt-2">
              MAX can make mistakes. Always verify important results.
            </p>
          </div>
        </div>
      </div>

      {settingsOpen && <SettingsPanel token={token} user={user} onClose={() => setSettingsOpen(false)} models={models} currentModel={currentModel} onModelChange={changeModel} />}
      {terminalOpen && <Terminal token={token} onClose={() => setTerminalOpen(false)} />}

      {/* Phase 2.4 — Narration toast (bottom of page) */}
      {narration && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 max-w-md w-[90%] pointer-events-none">
          <div className="bg-[#1e1e1e] border border-[#FF6B35]/40 rounded-xl px-4 py-3 shadow-lg flex items-center gap-3 animate-[fadeIn_0.2s_ease-in]">
            <span className="text-xl flex-shrink-0">{narration.icon}</span>
            <div className="flex-1 min-w-0">
              <div className="text-sm text-[#ececec] font-medium truncate">{narration.description}</div>
              {narration.detail && (
                <div className="text-xs text-[#888] font-mono truncate mt-0.5">{narration.detail}</div>
              )}
            </div>
            <Loader2 size={14} className="text-[#FF6B35] animate-spin flex-shrink-0" />
          </div>
        </div>
      )}

      {/* Phase 6.4 — Camera capture modal */}
      {showCamera && (
        <CameraCapture
          onClose={() => setShowCamera(false)}
          onCapture={(dataUrl) => {
            socketRef.current?.emit('camera:image', { sessionId: activeId, image: dataUrl });
            setShowCamera(false);
          }}
        />
      )}
    </div>
  );
}

function WelcomeScreen({ onSelect }: { onSelect: (p: string) => void }) {
  const { t } = useTranslation('common');
  const suggestions = [
    { icon: '🌐', title: t('browse_web'), sub: 'Research anything online', prompt: 'Search the web for the latest tech news' },
    { icon: '💻', title: t('write_code'), sub: 'Build apps, scripts, tools', prompt: 'Build a snake game in HTML that I can play' },
    { icon: '📋', title: t('automate'), sub: 'Let MAX do the repetitive work', prompt: 'Check the open issues in my GitHub repo' },
    { icon: '📁', title: t('analyze'), sub: 'Upload and process any file', prompt: 'Analyze the uploaded file and summarize it' },
  ];
  return (
    <div className="flex flex-col items-center justify-center h-full px-4">
      <div className="w-16 h-16 bg-[#FF6B35] rounded-2xl flex items-center justify-center mb-4">
        <span className="text-white font-bold text-3xl">M</span>
      </div>
      <h1 className="text-2xl font-bold text-white mb-1">{t('app_name')}</h1>
      <p className="text-[#888] text-sm mb-8">{t('tagline')}</p>
      <div className="grid grid-cols-2 gap-3 w-full max-w-md">
        {suggestions.map((s, i) => (
          <button key={i} onClick={() => onSelect(s.prompt)}
            className="text-left bg-[#1a1a1a] hover:bg-[#1e1e1e] border border-[#2a2a2a] rounded-xl p-4 transition-colors">
            <div className="text-xl mb-2">{s.icon}</div>
            <div className="text-sm font-medium text-white">{s.title}</div>
            <div className="text-xs text-[#666] mt-0.5">{s.sub}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function ChatMessage({ message }: { message: Message }) {
  const [toolsExpanded, setToolsExpanded] = useState(false);

  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%]">
          {message.files && message.files.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2 justify-end">
              {message.files.map((f, i) => (
                <span key={i} className="text-xs bg-[#1e1e1e] text-[#888] px-2 py-1 rounded-lg">
                  📎 {f.name}
                </span>
              ))}
            </div>
          )}
          <div className="bg-[#1e1e1e] border border-[#2a2a2a] rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm text-[#ececec] whitespace-pre-wrap">
            {message.content}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3">
      <div className="w-7 h-7 bg-[#FF6B35] rounded-lg flex items-center justify-center flex-shrink-0 mt-1">
        <span className="text-white font-bold text-xs">M</span>
      </div>
      <div className="flex-1 min-w-0">
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="mb-3">
            <button onClick={() => setToolsExpanded(!toolsExpanded)}
              className="flex items-center gap-1.5 text-xs text-[#555] hover:text-[#888] mb-1">
              {toolsExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              {message.toolCalls.length} action{message.toolCalls.length !== 1 ? 's' : ''} taken
            </button>
            {toolsExpanded && (
              <div className="space-y-1.5">
                {message.toolCalls.map((tc, i) => <ToolCallCard key={i} toolCall={tc} />)}
              </div>
            )}
          </div>
        )}
        <div className="text-sm text-[#ececec] leading-relaxed whitespace-pre-wrap">
          {message.content}
        </div>
        {message.artifacts && message.artifacts.length > 0 && (
          <div className="mt-3 space-y-2">
            {message.artifacts.map((a, i) => (
              <div key={i} className="bg-[#1e1e1e] border border-[#2a2a2a] rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Folder size={12} className="text-[#FF6B35]" />
                  <code className="text-xs text-[#ccc] font-mono">{a.path}</code>
                </div>
                <div className="text-[10px] text-[#666]">{a.size || a.content?.length || 0} bytes · {a.language}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ToolCallCard({ toolCall }: { toolCall: ToolCall }) {
  const [expanded, setExpanded] = useState(false);
  const icon = toolCall.status === 'running'
    ? <Loader2 size={11} className="animate-spin text-[#FF6B35]" />
    : toolCall.status === 'done'
    ? <Check size={11} className="text-green-400" />
    : <X size={11} className="text-red-400" />;

  return (
    <div className="bg-[#1a1a1a] border border-[#242424] rounded-lg overflow-hidden">
      <button onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[#1e1e1e]">
        {icon}
        <code className="text-xs text-[#888] font-mono">{toolCall.tool}</code>
        <ChevronDown size={11} className={`ml-auto text-[#444] transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>
      {expanded && (
        <div className="px-3 pb-3 space-y-2">
          <div>
            <p className="text-[10px] text-[#444] mb-1 uppercase tracking-wider">Input</p>
            <pre className="text-[11px] text-[#666] font-mono overflow-x-auto">
              {JSON.stringify(toolCall.args, null, 2).slice(0, 500)}
            </pre>
          </div>
          {toolCall.result && (
            <div>
              <p className="text-[10px] text-[#444] mb-1 uppercase tracking-wider">Output</p>
              <pre className="text-[11px] text-[#666] font-mono overflow-x-auto max-h-32">
                {String(toolCall.result).slice(0, 500)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Phase 2.4 — ThinkingBlock: shows reasoning content (deepseek-r1 / o1 style)
// in an amber-colored block above the streaming response.
// ============================================================================
function ThinkingBlock({ content }: { content: string }) {
  const [expanded, setExpanded] = useState(true);
  return (
    <div className="bg-amber-950/30 border border-amber-700/40 rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-amber-900/20"
      >
        <span className="text-amber-400 text-sm">💭</span>
        <span className="text-xs text-amber-300 font-medium">Reasoning</span>
        <ChevronDown size={11} className={`ml-auto text-amber-500/60 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>
      {expanded && (
        <div className="px-3 pb-3">
          <pre className="text-[11px] text-amber-200/80 font-mono whitespace-pre-wrap overflow-x-auto max-h-48 overflow-y-auto">
            {content}
          </pre>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Phase 6.4 — CameraCapture: opens the device camera and lets the user
// capture a photo. Emits the photo back to the server via onCapture.
// ============================================================================
function CameraCapture({ onClose, onCapture }: { onClose: () => void; onCapture: (dataUrl: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    let active = true;
    let localStream: MediaStream | null = null;

    async function startCamera() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          setError('Camera not supported in this browser.');
          return;
        }
        localStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false
        });
        if (!active) {
          localStream.getTracks().forEach(t => t.stop());
          return;
        }
        setStream(localStream);
        if (videoRef.current) {
          videoRef.current.srcObject = localStream;
          await videoRef.current.play().catch(() => {});
        }
      } catch (err: any) {
        setError(err?.message || 'Failed to access camera.');
      }
    }

    startCamera();

    return () => {
      active = false;
      if (localStream) localStream.getTracks().forEach(t => t.stop());
    };
  }, []);

  function capture() {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    onCapture(dataUrl);
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#2a2a2a]">
          <h3 className="text-sm text-white font-medium">Camera Capture</h3>
          <button onClick={onClose} className="text-[#888] hover:text-white">
            <X size={18} />
          </button>
        </div>
        <div className="bg-black relative">
          {error ? (
            <div className="p-8 text-center text-red-400 text-sm">{error}</div>
          ) : (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full max-h-[60vh] object-contain"
            />
          )}
        </div>
        <div className="flex items-center justify-center gap-3 px-4 py-4 border-t border-[#2a2a2a]">
          <button
            onClick={capture}
            disabled={!!error || !stream}
            className="bg-[#FF6B35] hover:bg-[#e05a28] disabled:bg-[#2a2a2a] disabled:text-[#555] text-white px-6 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            Capture Photo
          </button>
          <button
            onClick={onClose}
            className="bg-[#2a2a2a] hover:bg-[#333] text-[#ccc] px-6 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
