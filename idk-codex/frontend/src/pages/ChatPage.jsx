/**
 * ChatPage — Unified consumer chat experience
 *
 * Features:
 *  - Streaming token rendering (token event from WebSocket)
 *  - Stop button (cancels running agent task)
 *  - Image upload (camera + gallery on mobile)
 *  - Model picker (switches mid-chat without context loss)
 *  - Simple / Developer mode toggle (Developer exposes file tree + terminal)
 *  - Multiplayer share link
 *  - No Enter-to-send (button only) per user spec
 *  - Claude-style artifacts: file_created events → ArtifactCard → ArtifactPreview
 *  - IndexedDB file persistence: files survive restarts, work offline, on phone + PC
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Send, Square, Paperclip, Camera, Code2, MessageSquare,
  Share2, Settings, X, ChevronDown, Image as ImageIcon, Folder
} from 'lucide-react';
import { useWebSocket } from '../hooks/useWebSocket';
import { saveFile, downloadFile, listFiles } from '../lib/fileStore';
import ArtifactCard from '../components/Artifact/ArtifactCard';
import ArtifactPreview from '../components/Artifact/ArtifactPreview';
import FilesPanel from '../components/Artifact/FilesPanel';

const API_BASE = import.meta.env.VITE_API_URL || window.location.origin;

// Quick model picker — ordered by what's KNOWN to work right now.
// gpt-oss-20b:free is the most reliable free OpenRouter model.
const QUICK_MODELS = [
  { id: 'openrouter-gpt-oss-20b', name: 'GPT-OSS 20B',     badge: 'free',  model: 'openai/gpt-oss-20b:free' },
  { id: 'openrouter-gpt-oss-120b', name: 'GPT-OSS 120B',    badge: 'free',  model: 'openai/gpt-oss-120b:free' },
  { id: 'openrouter-deepseek', name: 'DeepSeek V3',         badge: 'paid',  model: 'deepseek/deepseek-chat' },
  { id: 'openrouter-llama',  name: 'Llama 3.3 70B',         badge: 'paid',  model: 'meta-llama/llama-3.3-70b-instruct' },
  { id: 'groq-llama-70b',    name: 'Llama 3.3 70B (Groq)',  badge: 'fast',  model: 'llama-3.3-70b-versatile' }
];

export default function ChatPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();

  const [conversationId, setConversationId] = useState(sessionId || null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [currentModel, setCurrentModel] = useState(() => localStorage.getItem('max_model') || 'openrouter-gpt-oss-20b');
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [devMode, setDevMode] = useState(() => localStorage.getItem('max_mode') === 'dev');
  const [attachedImages, setAttachedImages] = useState([]);
  const [progress, setProgress] = useState(null);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  const {
    connected, isReconnecting, token, message, progress: wsProgress,
    fileCreated, subscribe: wsSubscribe, joinRoom
  } = useWebSocket(conversationId);

  // Artifact state
  const [sessionFiles, setSessionFiles] = useState([]);  // files for the current session (for badge count)
  const [showFilesPanel, setShowFilesPanel] = useState(false);
  const [previewFile, setPreviewFile] = useState(null);

  // Listen for file_created events from the WebSocket.
  // Each event contains { path, content, language, tool, size }.
  // We save it to IndexedDB and attach an ArtifactCard to the most recent
  // assistant message.
  useEffect(() => {
    if (!fileCreated || !conversationId) return;
    if (fileCreated.sessionId && fileCreated.sessionId !== conversationId) return;

    // Save to IndexedDB
    saveFile({
      sessionId: conversationId,
      path: fileCreated.path,
      content: fileCreated.content,
      language: fileCreated.language,
      tool: fileCreated.tool
    }).then(() => {
      // Update the session file count badge
      listFiles(conversationId).then(setSessionFiles).catch(() => {});
    }).catch(err => console.error('saveFile failed:', err));

    // Attach the file as an artifact to the most recent assistant message
    setMessages(prev => {
      if (prev.length === 0) return prev;
      const lastIdx = prev.length - 1;
      const last = prev[lastIdx];
      // Only attach to assistant messages (or system messages from the agent)
      if (last.role !== 'assistant' && last.role !== 'system') {
        // If the last message is the user's, add a placeholder assistant message with the artifact
        return [...prev, {
          id: Date.now() + Math.random(),
          role: 'assistant',
          content: 'I created a file:',
          timestamp: new Date().toISOString(),
          artifacts: [fileCreated]
        }];
      }
      const artifacts = last.artifacts || [];
      // Avoid duplicates by path
      if (artifacts.find(a => a.path === fileCreated.path)) return prev;
      const updated = { ...last, artifacts: [...artifacts, fileCreated] };
      const next = [...prev];
      next[lastIdx] = updated;
      return next;
    });
  }, [fileCreated, conversationId]);

  // Load files for the current session on mount (so badge count is correct
  // and previously-saved artifacts show up)
  useEffect(() => {
    if (conversationId) {
      listFiles(conversationId).then(setSessionFiles).catch(() => {});
    }
  }, [conversationId]);

  const handleOpenArtifact = useCallback((file) => {
    // Make sure the file has sessionId + content for the preview
    setPreviewFile({
      ...file,
      sessionId: file.sessionId || conversationId,
      content: file.content || ''  // may be empty for server-only files; preview handles that
    });
  }, [conversationId]);

  const handleDownloadArtifact = useCallback(async (file) => {
    await downloadFile(file.sessionId || conversationId, file.path);
  }, [conversationId]);

  // If user clicks a server-only file (no content locally), fetch it from the server first
  const handleOpenServerFile = useCallback(async (file) => {
    if (file.content) {
      setPreviewFile({ ...file, sessionId: conversationId });
      return;
    }
    try {
      const r = await fetch(`${API_BASE}/api/files/sandbox/${encodeURIComponent(file.path)}`);
      if (r.ok) {
        const data = await r.json();
        if (data.success && data.content) {
          // Save to IndexedDB for next time
          await saveFile({
            sessionId: conversationId,
            path: file.path,
            content: data.content,
            language: file.language
          });
          setPreviewFile({
            ...file,
            sessionId: conversationId,
            content: data.content
          });
          return;
        }
      }
    } catch (e) { /* fall through */ }
    // Fallback: open with empty content (code tab will show empty)
    setPreviewFile({ ...file, sessionId: conversationId, content: '' });
  }, [conversationId]);

  // Listen for new messages from the WebSocket (final assembled message)
  useEffect(() => {
    if (!message) return;
    if (message.role === 'assistant' && message.conversationId === conversationId) {
      // The streaming text already showed this; just clear streaming state
      setIsStreaming(false);
      setStreamingText('');
      setMessages(prev => [...prev, {
        id: Date.now(),
        role: 'assistant',
        content: message.content,
        timestamp: message.timestamp || new Date().toISOString(),
        filesModified: message.filesModified || []
      }]);
    } else if (message.role === 'user' && message.conversationId === conversationId) {
      // echo of our own message — skip, we already added it
    } else if (message.role === 'assistant') {
      // task-complete message from agent
      setMessages(prev => [...prev, {
        id: Date.now(),
        role: 'assistant',
        content: message.content,
        timestamp: message.timestamp || new Date().toISOString(),
        filesModified: message.filesModified || []
      }]);
      setIsStreaming(false);
      setStreamingText('');
    }
  }, [message, conversationId]);

  // Listen for streaming tokens
  useEffect(() => {
    if (!token) return;
    if (token.type === 'start') {
      setIsStreaming(true);
      setStreamingText('');
    } else if (token.type === 'token') {
      setStreamingText(prev => prev + token.text);
    } else if (token.type === 'done') {
      // Don't clear here — the final 'message' event will finalize it
      // If no message event comes (e.g. chat mode), finalize after 500ms
      const t = setTimeout(() => {
        setStreamingText(prev => {
          if (prev && !messages.find(m => m.content === prev)) {
            setMessages(mp => [...mp, {
              id: Date.now(),
              role: 'assistant',
              content: prev,
              timestamp: new Date().toISOString()
            }]);
          }
          return '';
        });
        setIsStreaming(false);
      }, 800);
      return () => clearTimeout(t);
    }
  }, [token, messages]);

  // Listen for progress (tool calls, iteration counts)
  useEffect(() => {
    if (wsProgress) setProgress(wsProgress);
    if (wsProgress?.status === 'complete' || wsProgress?.status === 'tool_result') {
      // Progress is a transient UI hint; let it fade
      const t = setTimeout(() => setProgress(null), 2000);
      return () => clearTimeout(t);
    }
  }, [wsProgress]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText, progress]);

  // Load conversation if sessionId in URL
  useEffect(() => {
    if (!sessionId) {
      // No session in URL — create one
      createConversation();
    } else {
      setConversationId(sessionId);
      loadConversation(sessionId);
    }
  }, [sessionId]);

  // If URL has ?room=<id>, join the multiplayer room
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomId = params.get('room');
    if (roomId && connected) {
      joinRoom(roomId, 'Viewer-' + Math.floor(Math.random() * 1000));
    }
  }, [connected]);

  // Save dev mode preference
  useEffect(() => {
    localStorage.setItem('max_mode', devMode ? 'dev' : 'simple');
  }, [devMode]);

  // Save model preference
  useEffect(() => {
    localStorage.setItem('max_model', currentModel);
    // Tell the backend to switch — this preserves chat history
    if (conversationId) {
      fetch(`${API_BASE}/api/config/model`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: currentModel, userId: 'web_user' })
      }).catch(() => {});
    }
  }, [currentModel, conversationId]);

  async function createConversation() {
    try {
      const r = await fetch(`${API_BASE}/api/conversations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'web_user', platform: 'web', title: 'New Chat' })
      });
      const data = await r.json();
      if (data.success) {
        setConversationId(data.conversation.id);
        setMessages([]);
        // Replace URL without reloading
        window.history.replaceState({}, '', `/chat/${data.conversation.id}`);
      }
    } catch (e) {
      console.error('Failed to create conversation:', e);
    }
  }

  async function loadConversation(id) {
    try {
      const r = await fetch(`${API_BASE}/api/conversations/${id}?userId=web_user`);
      const data = await r.json();
      if (data.success && data.conversation) {
        setConversationId(id);
        setMessages((data.conversation.messages || []).map(m => ({
          id: m.id || Date.now() + Math.random(),
          role: m.role,
          content: m.content,
          timestamp: m.created_at || m.timestamp || new Date().toISOString(),
          filesModified: m.metadata?.filesModified || []
        })));
      }
    } catch (e) {
      console.error('Failed to load conversation:', e);
    }
  }

  const handleSend = async () => {
    if (!input.trim() || isStreaming || !conversationId) return;

    const text = input.trim();
    const userMsg = {
      id: Date.now(),
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
      images: attachedImages.length > 0 ? attachedImages : undefined
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsStreaming(true);
    setStreamingText('');

    // Build message body — include images as base64 if any
    const body = { message: text, userId: 'web_user' };
    if (attachedImages.length > 0) {
      body.images = attachedImages;
    }

    try {
      const r = await fetch(`${API_BASE}/api/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await r.json();
      if (!r.ok) {
        throw new Error(data.error || 'Failed to send message');
      }
      // Intent comes back in data.intent: 'chat' or 'task'
      // Streaming will start via WebSocket token events
    } catch (e) {
      console.error('Send failed:', e);
      setMessages(prev => [...prev, {
        id: Date.now(),
        role: 'assistant',
        content: 'Sorry, something went wrong: ' + e.message,
        timestamp: new Date().toISOString()
      }]);
      setIsStreaming(false);
    }

    setAttachedImages([]);
  };

  const handleStop = async () => {
    if (!conversationId) return;
    try {
      await fetch(`${API_BASE}/api/agent/cancel/${conversationId}`, { method: 'POST' });
    } catch (e) { /* ignore */ }
    setIsStreaming(false);
    if (streamingText) {
      setMessages(prev => [...prev, {
        id: Date.now(),
        role: 'assistant',
        content: streamingText + '\n\n_(stopped by user)_',
        timestamp: new Date().toISOString()
      }]);
      setStreamingText('');
    }
  };

  const handleImageSelect = (e) => {
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;
      const reader = new FileReader();
      reader.onload = () => {
        setAttachedImages(prev => [...prev, reader.result]);
      };
      reader.readAsDataURL(file);
    }
    // Reset input so the same file can be selected again
    e.target.value = '';
  };

  const handleShare = async () => {
    const url = `${window.location.origin}/?room=${conversationId}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'MAX Chat', url });
      } else {
        await navigator.clipboard.writeText(url);
        alert('Share link copied: ' + url);
      }
    } catch (e) { /* user cancelled */ }
  };

  const handleNewChat = () => {
    setShowMenu(false);
    navigate('/chat');
    createConversation();
  };

  const formatTime = (ts) => {
    try {
      return new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    } catch (e) { return ''; }
  };

  const renderContent = (content) => {
    // Render code blocks with syntax highlighting (basic)
    const parts = [];
    const regex = /```(\w*)\n?([\s\S]*?)```/g;
    let lastIdx = 0;
    let match;
    let i = 0;
    while ((match = regex.exec(content)) !== null) {
      if (match.index > lastIdx) {
        parts.push(<p key={`t-${i}`} className="whitespace-pre-wrap">{content.slice(lastIdx, match.index)}</p>);
      }
      parts.push(
        <pre key={`c-${i}`} className="bg-gray-900 text-gray-100 p-3 rounded-lg overflow-x-auto my-2 text-sm">
          <code>{match[2]}</code>
        </pre>
      );
      lastIdx = match.index + match[0].length;
      i++;
    }
    if (lastIdx < content.length) {
      parts.push(<p key="t-last" className="whitespace-pre-wrap">{content.slice(lastIdx)}</p>);
    }
    return parts.length > 0 ? parts : <p className="whitespace-pre-wrap">{content}</p>;
  };

  const currentModelObj = QUICK_MODELS.find(m => m.id === currentModel) || QUICK_MODELS[0];

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-gray-100">
      {/* ===== Header ===== */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 bg-gray-900/80 backdrop-blur sticky top-0 z-10">
        <button
          onClick={() => navigate('/')}
          className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
        >
          <ArrowLeft size={20} />
        </button>

        <div className="flex-1 flex items-center justify-center gap-2">
          <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'} ${isReconnecting ? 'animate-pulse' : ''}`} />

          {/* Files button — shows count badge */}
          <button
            onClick={() => setShowFilesPanel(true)}
            className="relative flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors text-sm"
            title="View files"
          >
            <Folder size={16} />
            {sessionFiles.length > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-blue-500 text-white text-xs rounded-full flex items-center justify-center font-bold">
                {sessionFiles.length > 9 ? '9+' : sessionFiles.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setShowModelPicker(!showModelPicker)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors text-sm"
          >
            <span className="font-medium">{currentModelObj.name}</span>
            <span className={`text-xs px-1.5 py-0.5 rounded ${currentModelObj.badge === 'free' ? 'bg-green-900 text-green-300' : 'bg-yellow-900 text-yellow-300'}`}>
              {currentModelObj.badge}
            </span>
            <ChevronDown size={14} />
          </button>
        </div>

        <button
          onClick={() => setShowMenu(!showMenu)}
          className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
        >
          <Settings size={20} />
        </button>
      </div>

      {/* ===== Model Picker Dropdown ===== */}
      {showModelPicker && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 bg-gray-900 border border-gray-800 rounded-lg shadow-xl py-2 min-w-[260px] z-20">
          {QUICK_MODELS.map(m => (
            <button
              key={m.id}
              onClick={() => { setCurrentModel(m.id); setShowModelPicker(false); }}
              className={`w-full flex items-center justify-between px-4 py-2 hover:bg-gray-800 transition-colors text-sm ${currentModel === m.id ? 'bg-gray-800' : ''}`}
            >
              <span>{m.name}</span>
              <span className={`text-xs px-1.5 py-0.5 rounded ${m.badge === 'free' ? 'bg-green-900 text-green-300' : 'bg-yellow-900 text-yellow-300'}`}>
                {m.badge}
              </span>
            </button>
          ))}
          <div className="border-t border-gray-800 mt-2 pt-2 px-4">
            <p className="text-xs text-gray-500">Switching models preserves your chat history.</p>
          </div>
        </div>
      )}

      {/* ===== Menu Dropdown ===== */}
      {showMenu && (
        <div className="absolute top-14 right-4 bg-gray-900 border border-gray-800 rounded-lg shadow-xl py-2 min-w-[200px] z-20">
          <button
            onClick={handleNewChat}
            className="w-full flex items-center gap-2 px-4 py-2 hover:bg-gray-800 transition-colors text-sm text-left"
          >
            <MessageSquare size={16} /> New Chat
          </button>
          <button
            onClick={handleShare}
            className="w-full flex items-center gap-2 px-4 py-2 hover:bg-gray-800 transition-colors text-sm text-left"
          >
            <Share2 size={16} /> Share Chat
          </button>
          <button
            onClick={() => setDevMode(!devMode)}
            className="w-full flex items-center gap-2 px-4 py-2 hover:bg-gray-800 transition-colors text-sm text-left"
          >
            <Code2 size={16} /> {devMode ? 'Simple Mode' : 'Developer Mode'}
          </button>
          {devMode && (
            <button
              onClick={() => navigate('/dev')}
              className="w-full flex items-center gap-2 px-4 py-2 hover:bg-gray-800 transition-colors text-sm text-left text-gray-400"
            >
              <Code2 size={16} /> Open Dashboard
            </button>
          )}
          <div className="border-t border-gray-800 mt-2 pt-2 px-4">
            <p className="text-xs text-gray-500">{devMode ? 'Developer mode exposes the file tree, terminal, and runtime dashboard.' : 'Simple mode is a clean chat interface. Switch to Developer mode for full agent control.'}</p>
          </div>
        </div>
      )}

      {/* ===== Messages Area ===== */}
      <div className="flex-1 overflow-y-auto px-4 py-4 max-w-3xl mx-auto w-full">
        {messages.length === 0 && !streamingText && (
          <div className="text-center py-12">
            <div className="inline-block p-4 bg-gray-900 rounded-full mb-4">
              <MessageSquare size={32} className="text-gray-500" />
            </div>
            <h2 className="text-xl font-semibold mb-2">How can I help you today?</h2>
            <p className="text-gray-500 text-sm">Ask me to build something, or just chat.</p>
            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-2 text-left">
              {['Build a snake game in HTML', 'Write a Python script to rename files', 'Create a landing page for a coffee shop', 'Explain how async/await works'].map(s => (
                <button
                  key={s}
                  onClick={() => setInput(s)}
                  className="p-3 bg-gray-900 hover:bg-gray-800 border border-gray-800 rounded-lg text-sm transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, idx) => (
          <div
            key={msg.id || idx}
            className={`flex mb-4 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div className={`max-w-[90%] ${msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-900 text-gray-100'} rounded-2xl px-4 py-3`}>
              {msg.images && msg.images.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {msg.images.map((img, i) => (
                    <img key={i} src={img} alt={`upload-${i}`} className="w-20 h-20 object-cover rounded-lg" />
                  ))}
                </div>
              )}
              {msg.content && (
                <div className="text-sm leading-relaxed">{renderContent(msg.content)}</div>
              )}

              {/* Artifact cards — Claude-style file previews */}
              {msg.artifacts && msg.artifacts.length > 0 && (
                <div className="mt-2">
                  {msg.artifacts.map((art, aidx) => (
                    <ArtifactCard
                      key={aidx}
                      file={art}
                      onOpen={handleOpenArtifact}
                      onDownload={handleDownloadArtifact}
                    />
                  ))}
                </div>
              )}

              {msg.filesModified && msg.filesModified.length > 0 && !msg.artifacts && (
                <div className="mt-2 pt-2 border-t border-gray-800 text-xs text-gray-400">
                  Files: {msg.filesModified.join(', ')}
                </div>
              )}
              <div className={`text-xs mt-1 ${msg.role === 'user' ? 'text-blue-200' : 'text-gray-500'}`}>
                {formatTime(msg.timestamp)}
              </div>
            </div>
          </div>
        ))}

        {/* Streaming text */}
        {streamingText && (
          <div className="flex mb-4 justify-start">
            <div className="max-w-[85%] bg-gray-900 text-gray-100 rounded-2xl px-4 py-3">
              <div className="text-sm leading-relaxed whitespace-pre-wrap">
                {streamingText}
                <span className="inline-block w-1.5 h-4 bg-gray-400 ml-0.5 animate-pulse" />
              </div>
            </div>
          </div>
        )}

        {/* Loading indicator (no streaming text yet) */}
        {isStreaming && !streamingText && (
          <div className="flex mb-4 justify-start">
            <div className="bg-gray-900 text-gray-100 rounded-2xl px-4 py-3">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        {/* Progress indicator (tool calls, iterations) */}
        {progress && (
          <div className="flex justify-center mb-4">
            <div className="px-3 py-1.5 bg-gray-900 border border-gray-800 rounded-full text-xs text-gray-400 flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
              {progress.tool ? `Running: ${progress.tool}` : progress.status || 'working...'}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ===== Attached images preview ===== */}
      {attachedImages.length > 0 && (
        <div className="px-4 pb-2 max-w-3xl mx-auto w-full flex gap-2 flex-wrap">
          {attachedImages.map((img, i) => (
            <div key={i} className="relative">
              <img src={img} alt={`attach-${i}`} className="w-16 h-16 object-cover rounded-lg" />
              <button
                onClick={() => setAttachedImages(prev => prev.filter((_, idx) => idx !== i))}
                className="absolute -top-1 -right-1 w-5 h-5 bg-red-600 text-white rounded-full flex items-center justify-center text-xs"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ===== Input Area ===== */}
      <div className="border-t border-gray-800 bg-gray-900/80 backdrop-blur px-4 py-3 sticky bottom-0">
        <div className="max-w-3xl mx-auto flex items-end gap-2">
          {/* Attach button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-2.5 hover:bg-gray-800 rounded-lg transition-colors text-gray-400"
            title="Attach image"
          >
            <Paperclip size={20} />
          </button>

          {/* Camera button (mobile) */}
          <button
            onClick={() => cameraInputRef.current?.click()}
            className="p-2.5 hover:bg-gray-800 rounded-lg transition-colors text-gray-400"
            title="Take photo"
          >
            <Camera size={20} />
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleImageSelect}
            className="hidden"
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleImageSelect}
            className="hidden"
          />

          {/* Text input — NO Enter-to-send, button only */}
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message..."
            rows={1}
            className="flex-1 px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none max-h-32"
            style={{ minHeight: '44px' }}
          />

          {/* Send / Stop button */}
          {isStreaming ? (
            <button
              onClick={handleStop}
              className="p-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl transition-colors"
              title="Stop"
            >
              <Square size={20} />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!input.trim() || !conversationId}
              className="p-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-xl transition-colors"
              title="Send"
            >
              <Send size={20} />
            </button>
          )}
        </div>
      </div>

      {/* ===== Files Panel (drawer) ===== */}
      <FilesPanel
        sessionId={conversationId}
        open={showFilesPanel}
        onClose={() => setShowFilesPanel(false)}
        onOpenFile={(file) => {
          setShowFilesPanel(false);
          handleOpenServerFile(file);
        }}
      />

      {/* ===== Artifact Preview modal ===== */}
      {previewFile && (
        <ArtifactPreview
          file={previewFile}
          onClose={() => setPreviewFile(null)}
          onDownload={handleDownloadArtifact}
        />
      )}
    </div>
  );
}
