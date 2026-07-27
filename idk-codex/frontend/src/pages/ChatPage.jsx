/**
 * ChatPage — Mobile-first consumer chat experience.
 *
 * Header layout (fits ALL phones):
 *   [☰ menu] [───── MAX ─────] [⚙ settings]
 *
 * The model picker, files button, share button, etc. are in the menu drawer
 * or settings drawer — NOT in the header bar. This guarantees no overflow
 * on small screens.
 *
 * Features: streaming tokens, artifacts (file cards + preview), IndexedDB
 * file persistence, sidebar chat history, settings with connectors,
 * confirmation dialog for destructive actions, image upload, no Enter-to-send.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Menu, Settings, Send, Square, Paperclip, Camera, Share2,
  Folder, ChevronDown, MessageSquare, Plus
} from 'lucide-react';
import { useWebSocket } from '../hooks/useWebSocket';
import { saveFile, downloadFile, listFiles } from '../lib/fileStore';
import ArtifactCard from '../components/Artifact/ArtifactCard';
import ArtifactPreview from '../components/Artifact/ArtifactPreview';
import FilesPanel from '../components/Artifact/FilesPanel';
import Sidebar from '../components/Sidebar';
import SettingsDrawer from '../components/SettingsDrawer';
import ConfirmationDialog from '../components/ConfirmationDialog';

const API_BASE = import.meta.env.VITE_API_URL || window.location.origin;

const QUICK_MODELS = [
  { id: 'openrouter-gpt-oss-20b', name: 'GPT-OSS 20B', badge: 'free', model: 'openai/gpt-oss-20b:free' },
  { id: 'openrouter-gpt-oss-120b', name: 'GPT-OSS 120B', badge: 'free', model: 'openai/gpt-oss-120b:free' },
  { id: 'openrouter-deepseek', name: 'DeepSeek V3', badge: 'paid', model: 'deepseek/deepseek-chat' },
  { id: 'openrouter-llama', name: 'Llama 3.3 70B', badge: 'paid', model: 'meta-llama/llama-3.3-70b-instruct' },
  { id: 'groq-llama-70b', name: 'Llama 3.3 (Groq)', badge: 'fast', model: 'llama-3.3-70b-versatile' }
];

export default function ChatPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();

  const [conversationId, setConversationId] = useState(sessionId || null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [currentModel, setCurrentModel] = useState(() => localStorage.getItem('max_model') || 'groq-llama-70b');
  const [apiModels, setApiModels] = useState([]);  // ALL models from API
  const [showSidebar, setShowSidebar] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showFiles, setShowFiles] = useState(false);
  const [devMode, setDevMode] = useState(() => localStorage.getItem('max_mode') === 'dev');
  const [attachedImages, setAttachedImages] = useState([]);
  const [progress, setProgress] = useState(null);
  const [sessionFiles, setSessionFiles] = useState([]);
  const [previewFile, setPreviewFile] = useState(null);
  const [pendingConfirmation, setPendingConfirmation] = useState(null);

  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  const {
    connected, isReconnecting, token, message, progress: wsProgress,
    fileCreated, confirmation
  } = useWebSocket(conversationId);

  // Fetch ALL models from the API on mount — includes Phone/Termux, Groq, Gemini, etc.
  useEffect(() => {
    fetch(`${API_BASE}/api/config/models`)
      .then(r => r.json())
      .then(d => {
        if (d.models && d.models.length > 0) {
          setApiModels(d.models);
          const saved = localStorage.getItem('max_model');
          if (!saved || !d.models.find(m => m.id === saved)) {
            const groq = d.models.find(m => m.id === 'groq-llama-70b');
            setCurrentModel(groq ? groq.id : d.models[0].id);
          }
        }
      })
      .catch(() => {});
  }, []);

  // ===== WebSocket event handlers =====

  // Streaming tokens
  useEffect(() => {
    if (!token) return;
    if (token.type === 'start') { setIsStreaming(true); setStreamingText(''); }
    else if (token.type === 'token') { setStreamingText(prev => prev + token.text); }
    else if (token.type === 'done') {
      const t = setTimeout(() => {
        setStreamingText(prev => {
          if (prev && prev.length > 0) {
            setMessages(mp => [...mp, { id: Date.now(), role: 'assistant', content: prev, timestamp: new Date().toISOString() }]);
          }
          return '';
        });
        setIsStreaming(false);
      }, 500);
      return () => clearTimeout(t);
    }
  }, [token]);

  // Final assembled message
  useEffect(() => {
    if (!message) return;
    // CRITICAL: Ignore 'streaming_start' messages — they have empty content and
    // would prematurely end the loading state. Only process actual responses.
    if (message.type === 'streaming_start') return;
    if (message.role === 'assistant' && (message.conversationId === conversationId || !message.conversationId)) {
      // Don't add empty messages
      if (!message.content || message.content.trim().length === 0) return;
      // Check if we already have this content from streaming
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last && last.role === 'assistant' && last.content === message.content) return prev;
        return [...prev, { id: Date.now(), role: 'assistant', content: message.content, timestamp: message.timestamp || new Date().toISOString(), filesModified: message.filesModified || [] }];
      });
      setIsStreaming(false);
      setStreamingText('');
    }
  }, [message, conversationId]);

  // Progress (tool calls)
  useEffect(() => {
    if (wsProgress) {
      setProgress(wsProgress);
      if (wsProgress.status === 'complete') {
        const t = setTimeout(() => setProgress(null), 2000);
        return () => clearTimeout(t);
      }
    }
  }, [wsProgress]);

  // File created events → save to IndexedDB + attach artifact card
  useEffect(() => {
    if (!fileCreated || !conversationId) return;
    if (fileCreated.sessionId && fileCreated.sessionId !== conversationId) return;
    saveFile({ sessionId: conversationId, path: fileCreated.path, content: fileCreated.content, language: fileCreated.language, tool: fileCreated.tool })
      .then(() => listFiles(conversationId).then(setSessionFiles).catch(() => {}))
      .catch(() => {});
    setMessages(prev => {
      if (prev.length === 0) return prev;
      const lastIdx = prev.length - 1;
      const last = prev[lastIdx];
      if (last.role !== 'assistant') {
        return [...prev, { id: Date.now(), role: 'assistant', content: 'I created a file:', timestamp: new Date().toISOString(), artifacts: [fileCreated] }];
      }
      const artifacts = last.artifacts || [];
      if (artifacts.find(a => a.path === fileCreated.path)) return prev;
      const updated = { ...last, artifacts: [...artifacts, fileCreated] };
      const next = [...prev]; next[lastIdx] = updated; return next;
    });
  }, [fileCreated, conversationId]);

  // Confirmation required (permission guard)
  useEffect(() => {
    if (confirmation) setPendingConfirmation(confirmation);
  }, [confirmation]);

  // Auto-scroll
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, streamingText, progress]);

  // Load session files on mount
  useEffect(() => { if (conversationId) listFiles(conversationId).then(setSessionFiles).catch(() => {}); }, [conversationId]);

  // Save preferences
  useEffect(() => { localStorage.setItem('max_mode', devMode ? 'dev' : 'simple'); }, [devMode]);
  useEffect(() => {
    localStorage.setItem('max_model', currentModel);
    if (conversationId) fetch(`${API_BASE}/api/config/model`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: currentModel, userId: 'web_user' }) }).catch(() => {});
  }, [currentModel, conversationId]);

  // Initialize or load conversation
  useEffect(() => {
    if (!sessionId) { createConversation(); }
    else { setConversationId(sessionId); loadConversation(sessionId); }
  }, [sessionId]);

  async function createConversation() {
    try {
      const r = await fetch(`${API_BASE}/api/conversations`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: 'web_user', platform: 'web', title: 'New Chat' }) });
      const data = await r.json();
      if (data.success) { setConversationId(data.conversation.id); setMessages([]); window.history.replaceState({}, '', `/chat/${data.conversation.id}`); }
    } catch (e) { console.error('Failed to create conversation:', e); }
  }

  async function loadConversation(id) {
    try {
      const r = await fetch(`${API_BASE}/api/conversations/${id}?userId=web_user`);
      const data = await r.json();
      if (data.success && data.conversation) {
        setConversationId(id);
        setMessages((data.conversation.messages || []).map(m => ({ id: m.id || Date.now() + Math.random(), role: m.role, content: m.content, timestamp: m.created_at || m.timestamp || new Date().toISOString(), filesModified: m.metadata?.filesModified || [] })));
      }
    } catch (e) { console.error('Failed to load conversation:', e); }
  }

  const handleSend = async () => {
    if (!input.trim() || isStreaming || !conversationId) return;
    const text = input.trim();
    const userMsg = { id: Date.now(), role: 'user', content: text, timestamp: new Date().toISOString(), images: attachedImages.length > 0 ? attachedImages : undefined };
    setMessages(prev => [...prev, userMsg]);
    setInput(''); setIsStreaming(true); setStreamingText('');
    const body = { message: text, userId: 'web_user' };
    if (attachedImages.length > 0) body.images = attachedImages;
    try {
      const r = await fetch(`${API_BASE}/api/conversations/${conversationId}/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error('Failed to send');
    } catch (e) {
      setMessages(prev => [...prev, { id: Date.now(), role: 'assistant', content: 'Error: ' + e.message, timestamp: new Date().toISOString() }]);
      setIsStreaming(false);
    }
    setAttachedImages([]);
  };

  const handleStop = async () => {
    if (!conversationId) return;
    try { await fetch(`${API_BASE}/api/agent/cancel/${conversationId}`, { method: 'POST' }); } catch (e) {}
    setIsStreaming(false);
    if (streamingText) { setMessages(prev => [...prev, { id: Date.now(), role: 'assistant', content: streamingText + '\n\n_(stopped)_', timestamp: new Date().toISOString() }]); setStreamingText(''); }
  };

  const handleImageSelect = (e) => {
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;
      const reader = new FileReader();
      reader.onload = () => setAttachedImages(prev => [...prev, reader.result]);
      reader.readAsDataURL(file);
    }
    e.target.value = '';
  };

  const handleShare = async () => {
    const url = `${window.location.origin}/?room=${conversationId}`;
    try { if (navigator.share) await navigator.share({ title: 'MAX Chat', url }); else { await navigator.clipboard.writeText(url); alert('Share link copied'); } } catch (e) {}
  };

  const handleNewChat = () => { setShowSidebar(false); setMessages([]); setConversationId(null); navigate('/chat'); setTimeout(() => createConversation(), 100); };

  const handleOpenArtifact = useCallback((file) => { setPreviewFile({ ...file, sessionId: file.sessionId || conversationId, content: file.content || '' }); }, [conversationId]);
  const handleDownloadArtifact = useCallback(async (file) => { await downloadFile(file.sessionId || conversationId, file.path); }, [conversationId]);

  const handleOpenServerFile = useCallback(async (file) => {
    if (file.content) { setPreviewFile({ ...file, sessionId: conversationId }); return; }
    try {
      const r = await fetch(`${API_BASE}/api/files/sandbox/${encodeURIComponent(file.path)}`);
      if (r.ok) { const data = await r.json(); if (data.success && data.content) { await saveFile({ sessionId: conversationId, path: file.path, content: data.content, language: file.language }); setPreviewFile({ ...file, sessionId: conversationId, content: data.content }); return; } }
    } catch (e) {}
    setPreviewFile({ ...file, sessionId: conversationId, content: '' });
  }, [conversationId]);

  const formatTime = (ts) => { try { return new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } };

  const renderContent = (content) => {
    if (!content) return null;
    const parts = [];
    const regex = /```(\w*)\n?([\s\S]*?)```/g;
    let lastIdx = 0, match, i = 0;
    while ((match = regex.exec(content)) !== null) {
      if (match.index > lastIdx) parts.push(<p key={`t-${i}`} className="whitespace-pre-wrap">{content.slice(lastIdx, match.index)}</p>);
      parts.push(<pre key={`c-${i}`} className="bg-gray-900 text-gray-100 p-2.5 rounded-lg overflow-x-auto my-2 text-xs"><code>{match[2]}</code></pre>);
      lastIdx = match.index + match[0].length; i++;
    }
    if (lastIdx < content.length) parts.push(<p key="t-last" className="whitespace-pre-wrap">{content.slice(lastIdx)}</p>);
    return parts.length > 0 ? parts : <p className="whitespace-pre-wrap">{content}</p>;
  };

  const currentModelObj = QUICK_MODELS.find(m => m.id === currentModel) || QUICK_MODELS[0];

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-gray-100">
      {/* ===== HEADER — compact, fits all phones ===== */}
      <div className="flex items-center justify-between px-2 py-2 border-b border-gray-800 bg-gray-900/95 backdrop-blur sticky top-0 z-10">
        {/* Left: hamburger menu */}
        <button onClick={() => setShowSidebar(true)} className="p-2.5 hover:bg-gray-800 rounded-lg transition-colors flex-shrink-0" title="Chat history">
          <Menu size={20} />
        </button>

        {/* Center: model dropdown + connection dot */}
        <div className="flex-1 flex items-center justify-center gap-2 min-w-0">
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${connected ? 'bg-green-500' : 'bg-red-500'} ${isReconnecting ? 'animate-pulse' : ''}`} />
          <select
            value={currentModel}
            onChange={(e) => setCurrentModel(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500 max-w-[160px] truncate"
            title="Select model"
          >
            {apiModels.length === 0 ? (
              <option>Loading models...</option>
            ) : (
              apiModels.map(m => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.provider})
                </option>
              ))
            )}
          </select>
          {sessionFiles.length > 0 && (
            <button onClick={() => setShowFiles(true)} className="relative p-1.5 hover:bg-gray-800 rounded flex-shrink-0" title="Files">
              <Folder size={16} />
              <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-blue-500 text-white text-[9px] rounded-full flex items-center justify-center font-bold">{sessionFiles.length > 9 ? '9+' : sessionFiles.length}</span>
            </button>
          )}
        </div>

        {/* Right: settings */}
        <button onClick={() => setShowSettings(true)} className="p-2.5 hover:bg-gray-800 rounded-lg transition-colors flex-shrink-0" title="Settings">
          <Settings size={20} />
        </button>
      </div>

      {/* ===== Messages Area ===== */}
      <div className="flex-1 overflow-y-auto px-3 py-4 max-w-3xl mx-auto w-full">
        {messages.length === 0 && !streamingText && (
          <div className="text-center py-12">
            <div className="inline-block p-4 bg-gray-900 rounded-full mb-4"><MessageSquare size={32} className="text-gray-500" /></div>
            <h2 className="text-xl font-semibold mb-2">How can I help you?</h2>
            <p className="text-gray-500 text-sm mb-6">Ask me to build something, or just chat.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-left">
              {['Build a snake game in HTML', 'Write a Python script to rename files', 'Create a landing page for a coffee shop', 'Explain how async/await works'].map(s => (
                <button key={s} onClick={() => setInput(s)} className="p-3 bg-gray-900 hover:bg-gray-800 border border-gray-800 rounded-lg text-sm transition-colors">{s}</button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, idx) => (
          <div key={msg.id || idx} className={`flex mb-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[88%] ${msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-900 text-gray-100'} rounded-2xl px-3.5 py-2.5`}>
              {msg.images && msg.images.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">{msg.images.map((img, i) => <img key={i} src={img} alt={`upload-${i}`} className="w-16 h-16 object-cover rounded-lg" />)}</div>
              )}
              {msg.content && <div className="text-sm leading-relaxed">{renderContent(msg.content)}</div>}
              {msg.artifacts && msg.artifacts.length > 0 && (
                <div className="mt-2">{msg.artifacts.map((art, aidx) => <ArtifactCard key={aidx} file={art} onOpen={handleOpenArtifact} onDownload={handleDownloadArtifact} />)}</div>
              )}
              {msg.filesModified && msg.filesModified.length > 0 && !msg.artifacts && (
                <div className="mt-2 pt-2 border-t border-gray-800 text-xs text-gray-400">Files: {msg.filesModified.join(', ')}</div>
              )}
              <div className={`text-[10px] mt-1 ${msg.role === 'user' ? 'text-blue-200' : 'text-gray-500'}`}>{formatTime(msg.timestamp)}</div>
            </div>
          </div>
        ))}

        {streamingText && (
          <div className="flex mb-3 justify-start">
            <div className="max-w-[88%] bg-gray-900 text-gray-100 rounded-2xl px-3.5 py-2.5">
              <div className="text-sm leading-relaxed whitespace-pre-wrap">{streamingText}<span className="inline-block w-1.5 h-4 bg-gray-400 ml-0.5 animate-pulse" /></div>
            </div>
          </div>
        )}

        {isStreaming && !streamingText && (
          <div className="flex mb-3 justify-start">
            <div className="bg-gray-900 text-gray-100 rounded-2xl px-3.5 py-2.5">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        {progress && (
          <div className="flex justify-center mb-3">
            <div className="px-3 py-1.5 bg-gray-900 border border-gray-800 rounded-full text-xs text-gray-400 flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
              {progress.tool ? `Running: ${progress.tool}` : progress.status || 'working...'}
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* ===== Attached images ===== */}
      {attachedImages.length > 0 && (
        <div className="px-3 pb-1 max-w-3xl mx-auto w-full flex gap-2 flex-wrap">
          {attachedImages.map((img, i) => (
            <div key={i} className="relative">
              <img src={img} alt={`attach-${i}`} className="w-14 h-14 object-cover rounded-lg" />
              <button onClick={() => setAttachedImages(prev => prev.filter((_, idx) => idx !== i))} className="absolute -top-1 -right-1 w-5 h-5 bg-red-600 text-white rounded-full flex items-center justify-center text-xs">×</button>
            </div>
          ))}
        </div>
      )}

      {/* ===== Input Area ===== */}
      <div className="border-t border-gray-800 bg-gray-900/95 backdrop-blur px-2 py-2 sticky bottom-0">
        <div className="max-w-3xl mx-auto flex items-end gap-1.5">
          <button onClick={() => fileInputRef.current?.click()} className="p-2 hover:bg-gray-800 rounded-lg transition-colors text-gray-400 flex-shrink-0" title="Attach"><Paperclip size={18} /></button>
          <button onClick={() => cameraInputRef.current?.click()} className="p-2 hover:bg-gray-800 rounded-lg transition-colors text-gray-400 flex-shrink-0" title="Camera"><Camera size={18} /></button>
          <button onClick={handleShare} className="p-2 hover:bg-gray-800 rounded-lg transition-colors text-gray-400 flex-shrink-0" title="Share"><Share2 size={18} /></button>
          <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleImageSelect} className="hidden" />
          <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={handleImageSelect} className="hidden" />
          <textarea value={input} onChange={(e) => setInput(e.target.value)} placeholder="Type a message..." rows={1} className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-xl text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none max-h-32 text-sm" style={{ minHeight: '40px' }} />
          {isStreaming ? (
            <button onClick={handleStop} className="p-2 bg-red-600 hover:bg-red-700 text-white rounded-xl transition-colors flex-shrink-0" title="Stop"><Square size={18} /></button>
          ) : (
            <button onClick={handleSend} disabled={!input.trim() || !conversationId} className="p-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-xl transition-colors flex-shrink-0" title="Send"><Send size={18} /></button>
          )}
        </div>
      </div>

      {/* ===== Drawers & Modals ===== */}
      <Sidebar open={showSidebar} onClose={() => setShowSidebar(false)} currentSessionId={conversationId} onSwitchSession={(id) => navigate(`/chat/${id}`)} onNewChat={handleNewChat} />
      <SettingsDrawer open={showSettings} onClose={() => setShowSettings(false)} devMode={devMode} setDevMode={setDevMode} currentModel={currentModel} setCurrentModel={setCurrentModel} models={apiModels.length > 0 ? apiModels : QUICK_MODELS} />
      <FilesPanel sessionId={conversationId} open={showFiles} onClose={() => setShowFiles(false)} onOpenFile={(file) => { setShowFiles(false); handleOpenServerFile(file); }} />
      {previewFile && <ArtifactPreview file={previewFile} onClose={() => setPreviewFile(null)} onDownload={handleDownloadArtifact} />}
      {pendingConfirmation && <ConfirmationDialog confirmation={pendingConfirmation} onResolved={() => setPendingConfirmation(null)} />}
    </div>
  );
}
