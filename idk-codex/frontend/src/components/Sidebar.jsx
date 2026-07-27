import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Plus, MessageSquare, Trash2, Edit2, Check, Search, Clock } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || window.location.origin;

export default function Sidebar({ open, onClose, currentSessionId, onSwitchSession, onNewChat }) {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editingTitle, setEditingTitle] = useState('');
  const navigate = useNavigate();

  const loadConversations = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API_BASE}/api/conversations?userId=web_user`);
      if (r.ok) { const data = await r.json(); if (data.success) setConversations(data.conversations || []); }
    } catch (e) {} finally { setLoading(false); }
  }, []);

  useEffect(() => { if (open) loadConversations(); }, [open, loadConversations]);

  const handleNewChat = () => { onNewChat && onNewChat(); onClose && onClose(); };
  const handleSwitch = (conv) => { if (onSwitchSession) onSwitchSession(conv.id); else navigate(`/chat/${conv.id}`); onClose && onClose(); };

  const handleDelete = async (e, convId) => {
    e.stopPropagation();
    if (!confirm('Delete this conversation?')) return;
    try { await fetch(`${API_BASE}/api/conversations/${convId}?userId=web_user`, { method: 'DELETE' }); setConversations(prev => prev.filter(c => c.id !== convId)); } catch (e) {}
  };

  const handleRenameStart = (e, conv) => { e.stopPropagation(); setEditingId(conv.id); setEditingTitle(conv.title || ''); };
  const handleRenameSave = async (e, conv) => {
    e.stopPropagation();
    if (!editingTitle.trim()) { setEditingId(null); return; }
    try { await fetch(`${API_BASE}/api/conversations/${conv.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: 'web_user', title: editingTitle.trim() }) }); setConversations(prev => prev.map(c => c.id === conv.id ? { ...c, title: editingTitle.trim() } : c)); } catch (e) {}
    setEditingId(null);
  };

  const filtered = conversations.filter(c => !search || (c.title || '').toLowerCase().includes(search.toLowerCase()));
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div className="relative bg-gray-950 border-r border-gray-800 w-[85%] max-w-sm h-full flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
          <div className="flex items-center gap-2"><MessageSquare size={20} className="text-blue-400" /><h2 className="font-semibold text-gray-100">Chats</h2><span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded">{conversations.length}</span></div>
          <button onClick={onClose} className="p-2 hover:bg-gray-800 rounded-lg text-gray-400"><X size={18} /></button>
        </div>
        <div className="p-3 border-b border-gray-800">
          <button onClick={handleNewChat} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium"><Plus size={16} /> New Chat</button>
        </div>
        <div className="p-3 border-b border-gray-800">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 w-4 h-4" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search chats..." className="w-full pl-9 pr-3 py-2 bg-gray-900 border border-gray-800 rounded-lg text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="text-center py-8 text-gray-500 text-sm">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 px-4"><Clock size={32} className="mx-auto text-gray-700 mb-2" /><p className="text-gray-500 text-sm">{search ? 'No chats match.' : 'No chats yet.'}</p></div>
          ) : (
            <div className="divide-y divide-gray-900">
              {filtered.map(conv => {
                const isActive = conv.id === currentSessionId;
                const isEditing = editingId === conv.id;
                return (
                  <div key={conv.id} onClick={() => !isEditing && handleSwitch(conv)} className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors group ${isActive ? 'bg-gray-900 border-l-2 border-blue-500' : 'hover:bg-gray-900 border-l-2 border-transparent'}`}>
                    <MessageSquare size={16} className={`flex-shrink-0 ${isActive ? 'text-blue-400' : 'text-gray-500'}`} />
                    <div className="flex-1 min-w-0">
                      {isEditing ? (
                        <input type="text" value={editingTitle} onChange={(e) => setEditingTitle(e.target.value)} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.key === 'Enter' && handleRenameSave(e, conv)} className="w-full px-2 py-1 bg-gray-800 border border-blue-500 rounded text-sm text-white focus:outline-none" autoFocus />
                      ) : (
                        <>
                          <div className={`text-sm truncate ${isActive ? 'text-white font-medium' : 'text-gray-300'}`}>{conv.title || 'Untitled'}</div>
                          <div className="text-xs text-gray-600 mt-0.5">{conv.updated_at ? new Date(conv.updated_at).toLocaleString() : ''}</div>
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {isEditing ? (
                        <button onClick={(e) => handleRenameSave(e, conv)} className="p-1.5 hover:bg-gray-800 rounded text-green-400"><Check size={14} /></button>
                      ) : (
                        <>
                          <button onClick={(e) => handleRenameStart(e, conv)} className="p-1.5 hover:bg-gray-800 rounded text-gray-400"><Edit2 size={14} /></button>
                          <button onClick={(e) => handleDelete(e, conv.id)} className="p-1.5 hover:bg-gray-800 rounded text-red-400"><Trash2 size={14} /></button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="px-4 py-2 border-t border-gray-800 bg-gray-900 text-xs text-gray-500">Chats stored in Supabase — persist forever.</div>
      </div>
    </div>
  );
}
