/**
 * ChatPage — Claude-style mobile-first chat interface.
 *
 * Layout:
 *  - Sidebar (left, dark #171717) — chat history, new chat, settings
 *  - Main area — welcome screen or chat messages
 *  - ChatInput (fixed bottom) — orange send button, stop when running
 *
 * Colors match Claude dark theme:
 *  bg: #1a1a1a, sidebar: #171717, cards: #1e1e1e, accent: #FF6B35
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Menu, Folder, Terminal as TerminalIcon, Globe } from 'lucide-react';
import { useWebSocket } from '../hooks/useWebSocket';
import { useViewportHeight } from '../hooks/useViewportHeight';
import { saveFile, downloadFile, listFiles } from '../lib/fileStore';
import { getAuthHeaders } from '../lib/auth.js';
import { t, getLang, setLang, getAvailableLanguages } from '../lib/i18n.js';
import ArtifactCard from '../components/Artifact/ArtifactCard';
import ArtifactPreview from '../components/Artifact/ArtifactPreview';
import FilesPanel from '../components/Artifact/FilesPanel';
import Sidebar from '../components/Sidebar';
import SettingsPanel from '../components/SettingsPanel';
import ChatMessage, { ToolCallCard } from '../components/ChatMessage';
import ChatInput from '../components/ChatInput';
import WelcomeScreen from '../components/WelcomeScreen';
import Terminal from '../components/Terminal';

const API_BASE = import.meta.env.VITE_API_URL || window.location.origin;

export default function ChatPage({ authToken, user, onLogout }) {
  const viewportHeight = useViewportHeight();
  const { sessionId } = useParams();
  const navigate = useNavigate();

  const [conversationId, setConversationId] = useState(sessionId || null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [showSidebar, setShowSidebar] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showFiles, setShowFiles] = useState(false);
  const [showTerminal, setShowTerminal] = useState(false);
  const [showLangMenu, setShowLangMenu] = useState(false);
  const [progress, setProgress] = useState(null);
  const [sessionFiles, setSessionFiles] = useState([]);
  const [previewFile, setPreviewFile] = useState(null);
  const [apiModels, setApiModels] = useState([]);
  const [currentModel, setCurrentModel] = useState(() => localStorage.getItem('max_model') || '');
  const [currentLang, setCurrentLang] = useState(() => getLang());
  const messagesEndRef = useRef(null);

  const { connected, isReconnecting, token, message, progress: wsProgress, fileCreated } = useWebSocket(conversationId);

  // Fetch ALL models from API
  useEffect(() => {
    fetch(`${API_BASE}/api/config/models`, { headers: getAuthHeaders() })
      .then(r => r.json())
      .then(d => {
        if (d.models && d.models.length > 0) {
          setApiModels(d.models);
          const saved = localStorage.getItem('max_model');
          if (!saved || !d.models.find(m => m.id === saved)) {
            const defaultModel = d.models.find(m => m.default) || d.models[0];
            setCurrentModel(defaultModel.id);
          }
        }
      })
      .catch(() => {});
  }, []);

  // Streaming tokens
  useEffect(() => {
    if (!token) return;
    if (token.type === 'start') { setIsStreaming(true); setStreamingText(''); }
    else if (token.type === 'token') { setStreamingText(prev => prev + token.text); }
    else if (token.type === 'done') {
      const t = setTimeout(() => {
        setStreamingText(prev => {
          if (prev && prev.length > 0) setMessages(mp => [...mp, { id: Date.now(), role: 'assistant', content: prev, timestamp: new Date().toISOString() }]);
          return '';
        });
        setIsStreaming(false);
      }, 500);
      return () => clearTimeout(t);
    }
  }, [token]);

  // Final message
  useEffect(() => {
    if (!message) return;
    if (message.type === 'streaming_start') return;
    if (message.role === 'assistant' && (message.conversationId === conversationId || !message.conversationId)) {
      if (!message.content || message.content.trim().length === 0) return;
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last && last.role === 'assistant' && last.content === message.content) return prev;
        return [...prev, { id: Date.now(), role: 'assistant', content: message.content, timestamp: message.timestamp || new Date().toISOString(), filesModified: message.filesModified || [] }];
      });
      setIsStreaming(false); setStreamingText('');

      // Show push notification if tab is not focused
      if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
        try {
          new Notification('MAX', {
            body: message.content.substring(0, 100) + (message.content.length > 100 ? '...' : ''),
            icon: '/icon-192x192.png',
            badge: '/icon-192x192.png',
            tag: 'max-response'
          });
        } catch (e) {}
      }
    }
  }, [message, conversationId]);

  // Progress (tool calls)
  useEffect(() => {
    if (wsProgress) {
      setProgress(wsProgress);
      if (wsProgress.status === 'complete' || wsProgress.status === 'tool_result') {
        const t = setTimeout(() => setProgress(null), 2000);
        return () => clearTimeout(t);
      }
    }
  }, [wsProgress]);

  // File created
  useEffect(() => {
    if (!fileCreated || !conversationId) return;
    if (fileCreated.sessionId && fileCreated.sessionId !== conversationId) return;
    saveFile({ sessionId: conversationId, path: fileCreated.path, content: fileCreated.content, language: fileCreated.language, tool: fileCreated.tool })
      .then(() => listFiles(conversationId).then(setSessionFiles).catch(() => {})).catch(() => {});
    setMessages(prev => {
      if (prev.length === 0) return prev;
      const li = prev.length - 1; const last = prev[li];
      if (last.role !== 'assistant') return [...prev, { id: Date.now(), role: 'assistant', content: '', timestamp: new Date().toISOString(), artifacts: [fileCreated] }];
      const artifacts = last.artifacts || [];
      if (artifacts.find(a => a.path === fileCreated.path)) return prev;
      const updated = { ...last, artifacts: [...artifacts, fileCreated] };
      const next = [...prev]; next[li] = updated; return next;
    });
  }, [fileCreated, conversationId]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, streamingText, progress]);
  useEffect(() => { if (conversationId) listFiles(conversationId).then(setSessionFiles).catch(() => {}); }, [conversationId]);

  // Save model preference
  useEffect(() => {
    if (currentModel) {
      localStorage.setItem('max_model', currentModel);
      if (conversationId) fetch(`${API_BASE}/api/config/model`, { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ model: currentModel }) }).catch(() => {});
    }
  }, [currentModel, conversationId]);

  // Listen for language changes
  useEffect(() => {
    const handler = () => setCurrentLang(getLang());
    window.addEventListener('langchange', handler);
    return () => window.removeEventListener('langchange', handler);
  }, []);

  useEffect(() => { if (!sessionId) { createConversation(); } else { setConversationId(sessionId); loadConversation(sessionId); } }, [sessionId]);

  async function createConversation() {
    try { const r = await fetch(`${API_BASE}/api/conversations`, { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ platform: 'web', title: 'New Chat' }) }); const d = await r.json(); if (d.success) { setConversationId(d.conversation.id); setMessages([]); window.history.replaceState({}, '', `/chat/${d.conversation.id}`); } } catch (e) {}
  }
  async function loadConversation(id) {
    try { const r = await fetch(`${API_BASE}/api/conversations/${id}`, { headers: getAuthHeaders() }); const d = await r.json(); if (d.success && d.conversation) { setConversationId(id); setMessages((d.conversation.messages || []).map(m => ({ id: m.id || Date.now() + Math.random(), role: m.role, content: m.content, timestamp: m.created_at || m.timestamp || new Date().toISOString(), filesModified: m.metadata?.filesModified || [] }))); } } catch (e) {}
  }

  const handleSend = async (pendingFiles = []) => {
    if (!input.trim() || isStreaming || !conversationId) return;
    const text = input.trim();
    setMessages(prev => [...prev, { id: Date.now(), role: 'user', content: text, timestamp: new Date().toISOString(), files: pendingFiles.map(f => ({ name: f.name, size: f.size })) }]);
    setInput(''); setIsStreaming(true); setStreamingText('');

    try {
      // Upload any pending files first
      let uploadedFiles = [];
      if (pendingFiles.length > 0) {
        for (const pf of pendingFiles) {
          try {
            const file = pf.file;
            if (!file) continue;
            const reader = new FileReader();
            const base64 = await new Promise((resolve, reject) => {
              reader.onload = () => resolve(reader.result.split(',')[1]);
              reader.onerror = reject;
              reader.readAsDataURL(file);
            });
            const uploadResp = await fetch(`${API_BASE}/api/upload`, {
              method: 'POST',
              headers: getAuthHeaders(),
              body: JSON.stringify({ filename: pf.name, mimeType: pf.type, data: base64 })
            });
            if (uploadResp.ok) {
              const d = await uploadResp.json();
              uploadedFiles.push({ filename: d.filename, path: d.path, size: d.size, mimeType: d.mimeType });
            }
          } catch (uploadErr) {
            console.error('Upload failed for', pf.name, uploadErr);
          }
        }
      }

      const r = await fetch(`${API_BASE}/api/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ message: text, files: uploadedFiles })
      });
      if (!r.ok) {
        const errText = await r.text().catch(() => 'Unknown error');
        throw new Error(`HTTP ${r.status}: ${errText.substring(0, 200)}`);
      }
    } catch (e) {
      setMessages(prev => [...prev, { id: Date.now(), role: 'assistant', content: 'Error: ' + e.message, timestamp: new Date().toISOString() }]);
      setIsStreaming(false);
    }
  };

  const handleStop = async () => { if (!conversationId) return; try { await fetch(`${API_BASE}/api/agent/cancel/${conversationId}`, { method: 'POST', headers: getAuthHeaders() }); } catch (e) {} setIsStreaming(false); if (streamingText) { setMessages(prev => [...prev, { id: Date.now(), role: 'assistant', content: streamingText + '\n\n_(stopped)_', timestamp: new Date().toISOString() }]); setStreamingText(''); } };

  const handleNewChat = () => { setShowSidebar(false); setMessages([]); setConversationId(null); navigate('/chat'); setTimeout(() => createConversation(), 100); };
  const handleOpenArtifact = useCallback((f) => { setPreviewFile({ ...f, sessionId: f.sessionId || conversationId, content: f.content || '' }); }, [conversationId]);
  const handleDownloadArtifact = useCallback(async (f) => { await downloadFile(f.sessionId || conversationId, f.path); }, [conversationId]);

  const changeLanguage = (lang) => {
    setLang(lang);
    setCurrentLang(lang);
    setShowLangMenu(false);
  };

  return (
    <div className="flex bg-[#1a1a1a] text-[#ececec] overflow-hidden fixed inset-0" style={{ height: `${viewportHeight || window.innerHeight}px` }}>
      {/* Sidebar */}
      <Sidebar open={showSidebar} onClose={() => setShowSidebar(false)} currentSessionId={conversationId} onSwitchSession={(id) => navigate(`/chat/${id}`)} onNewChat={handleNewChat} onOpenSettings={() => { setShowSidebar(false); setShowSettings(true); }} onLogout={onLogout} user={user} />

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0 h-full">
        {/* Header — fixed, with iOS safe area top padding */}
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-[#2a2a2a] bg-[#171717] flex-shrink-0" style={{ paddingTop: 'max(0.625rem, env(safe-area-inset-top))' }}>
          <button onClick={() => setShowSidebar(true)} className="p-2 hover:bg-[#2a2a2a] rounded-lg text-[#999]"><Menu size={18} /></button>
          <div className="flex items-center gap-2">
            <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'} ${isReconnecting ? 'animate-pulse' : ''}`} />
            <select value={currentModel} onChange={(e) => setCurrentModel(e.target.value)} className="bg-[#212121] border border-[#2a2a2a] rounded-lg px-2 py-1 text-xs text-[#ccc] focus:outline-none max-w-[160px]">
              {apiModels.length === 0 ? <option>Loading...</option> : apiModels.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            {/* Language selector */}
            <div className="relative">
              <button onClick={() => setShowLangMenu(!showLangMenu)} className="p-1.5 hover:bg-[#2a2a2a] rounded-lg text-[#999]" title="Language">
                <Globe size={14} />
              </button>
              {showLangMenu && (
                <div className="absolute right-0 top-full mt-1 bg-[#212121] border border-[#2a2a2a] rounded-lg py-1 z-50 min-w-[120px]" onClick={() => setShowLangMenu(false)}>
                  {getAvailableLanguages().map(l => (
                    <button key={l.code} onClick={() => changeLanguage(l.code)} className={`block w-full text-left px-3 py-1 text-xs ${currentLang === l.code ? 'text-[#FF6B35] bg-[#FF6B35]/10' : 'text-[#ccc] hover:bg-[#2a2a2a]'}`}>
                      {l.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {sessionFiles.length > 0 && <button onClick={() => setShowFiles(true)} className="relative p-1.5 hover:bg-[#2a2a2a] rounded-lg text-[#666]"><Folder size={15} /><span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-[#FF6B35] text-white text-[8px] rounded-full flex items-center justify-center font-bold">{sessionFiles.length > 9 ? '9+' : sessionFiles.length}</span></button>}
            <button onClick={() => setShowTerminal(true)} className="p-1.5 hover:bg-[#2a2a2a] rounded-lg text-[#999]" title="Terminal"><TerminalIcon size={14} /></button>
          </div>
          <button onClick={() => setShowSettings(true)} className="p-2 hover:bg-[#2a2a2a] rounded-lg text-[#999] text-xs">⚙</button>
        </div>

        {/* Messages or Welcome */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-4 py-6">
            {messages.length === 0 && !streamingText ? (
              <WelcomeScreen onSuggestionClick={(p) => setInput(p)} />
            ) : (
              <>
                {messages.map((msg, idx) => <ChatMessage key={msg.id || idx} msg={msg} />)}
                {streamingText && <ChatMessage msg={{ role: 'assistant', content: streamingText, timestamp: new Date().toISOString() }} isStreaming={true} />}
                {progress && (
                  <div className="flex justify-center mb-3">
                    <ToolCallCard tool={progress.tool || progress.status || 'working'} status="running" />
                  </div>
                )}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>
        </div>

        {/* Input */}
        <ChatInput value={input} onChange={setInput} onSend={handleSend} onStop={handleStop} isStreaming={isStreaming} disabled={!conversationId} />
      </div>

      {/* Modals & Panels */}
      <FilesPanel sessionId={conversationId} open={showFiles} onClose={() => setShowFiles(false)} onOpenFile={(f) => { setShowFiles(false); handleOpenArtifact(f); }} />
      <SettingsPanel open={showSettings} onClose={() => setShowSettings(false)} models={apiModels} currentModel={currentModel} onModelChange={setCurrentModel} />
      <Terminal open={showTerminal} onClose={() => setShowTerminal(false)} sessionId={conversationId} />
      {previewFile && <ArtifactPreview file={previewFile} onClose={() => setPreviewFile(null)} onDownload={handleDownloadArtifact} />}
    </div>
  );
}

