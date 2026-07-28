/**
 * Sidebar — Claude-style dark sidebar.
 * 280px on desktop, full-screen overlay on mobile.
 */
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Settings, X, MessageSquare, Trash2, Edit2, Check } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || window.location.origin;

export default function Sidebar({ open, onClose, currentSessionId, onSwitchSession, onNewChat, onOpenSettings, onLogout, user }) {
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
      if (r.ok) {
        const d = await r.json();
        if (d.success) setConversations(d.conversations || []);
      }
    } catch (e) {} finally { setLoading(false); }
  }, []);

  useEffect(() => { if (open) loadConversations(); }, [open, loadConversations]);

  const handleNewChat = () => { onNewChat && onNewChat(); onClose && onClose(); };
  const handleSwitch = (c) => {
    if (onSwitchSession) onSwitchSession(c.id);
    else navigate(`/chat/${c.id}`);
    onClose && onClose();
  };

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    if (!confirm('Delete this conversation?')) return;
    try { await fetch(`${API_BASE}/api/conversations/${id}?userId=web_user`, { method: 'DELETE' }); setConversations(p => p.filter(c => c.id !== id)); } catch (e) {}
  };

  const handleRenameStart = (e, c) => { e.stopPropagation(); setEditingId(c.id); setEditingTitle(c.title || ''); };
  const handleRenameSave = async (e, c) => {
    e.stopPropagation();
    if (!editingTitle.trim()) { setEditingId(null); return; }
    try { await fetch(`${API_BASE}/api/conversations/${c.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: 'web_user', title: editingTitle.trim() }) }); setConversations(p => p.map(x => x.id === c.id ? { ...x, title: editingTitle.trim() } : x)); } catch (e) {} setEditingId(null);
  };

  const filtered = conversations.filter(c => !search || (c.title || '').toLowerCase().includes(search.toLowerCase()));

  // Group conversations by date
  const grouped = {};
  filtered.forEach(c => {
    const date = c.updated_at ? new Date(c.updated_at) : new Date();
    const today = new Date();
    const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
    let group;
    if (date.toDateString() === today.toDateString()) group = 'Today';
    else if (date.toDateString() === yesterday.toDateString()) group = 'Yesterday';
    else group = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    if (!grouped[group]) grouped[group] = [];
    grouped[group].push(c);
  });

  if (!open) return null;

  return (
    <>
      {/* Backdrop on mobile */}
      <div className="fixed inset-0 z-40 bg-black/60 md:hidden" onClick={onClose} />

      {/* Sidebar */}
      <div className="fixed left-0 top-0 bottom-0 z-50 w-[280px] bg-[#171717] border-r border-[#2a2a2a] flex flex-col">
        {/* Top: Logo + New Chat */}
        <div className="p-3 border-b border-[#2a2a2a]">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-[#FF6B35] flex items-center justify-center text-white font-bold text-sm">M</div>
              <span className="text-[#ececec] font-semibold text-sm">MAX</span>
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-[#2a2a2a] rounded-lg text-[#666] md:hidden"><X size={18} /></button>
          </div>
          <button onClick={handleNewChat} className="w-full flex items-center gap-2 px-3 py-2 bg-[#212121] hover:bg-[#2a2a2a] text-[#ececec] rounded-lg text-sm font-medium transition-colors">
            <Plus size={16} /> New Chat
          </button>
        </div>

        {/* Search */}
        <div className="p-3 border-b border-[#2a2a2a]">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#666] w-3.5 h-3.5" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search conversations..." className="w-full pl-8 pr-3 py-1.5 bg-[#212121] border border-[#2a2a2a] rounded-lg text-xs text-[#ececec] placeholder-[#666] focus:outline-none focus:border-[#FF6B35]/50" />
          </div>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {loading ? (
            <div className="text-center py-8 text-[#666] text-xs">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 px-4">
              <MessageSquare size={24} className="mx-auto text-[#333] mb-2" />
              <p className="text-[#666] text-xs">{search ? 'No matches' : 'No conversations yet'}</p>
            </div>
          ) : (
            Object.entries(grouped).map(([group, convs]) => (
              <div key={group} className="mb-3">
                <div className="px-2 py-1 text-[10px] font-semibold text-[#555] uppercase tracking-wider">{group}</div>
                {convs.map(c => {
                  const isActive = c.id === currentSessionId;
                  const isEditing = editingId === c.id;
                  return (
                    <div key={c.id} onClick={() => !isEditing && handleSwitch(c)} className={`group flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer transition-colors ${isActive ? 'bg-[#212121]' : 'hover:bg-[#1e1e1e]'}`}>
                      <MessageSquare size={13} className={`flex-shrink-0 ${isActive ? 'text-[#FF6B35]' : 'text-[#555]'}`} />
                      <div className="flex-1 min-w-0">
                        {isEditing ? (
                          <input type="text" value={editingTitle} onChange={(e) => setEditingTitle(e.target.value)} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.key === 'Enter' && handleRenameSave(e, c)} className="w-full px-1.5 py-0.5 bg-[#2a2a2a] border border-[#FF6B35] rounded text-xs text-white focus:outline-none" autoFocus />
                        ) : (
                          <div className={`text-xs truncate ${isActive ? 'text-[#ececec]' : 'text-[#999]'}`}>{c.title || 'Untitled'}</div>
                        )}
                      </div>
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        {isEditing ? (
                          <button onClick={(e) => handleRenameSave(e, c)} className="p-1 hover:bg-[#2a2a2a] rounded text-green-400"><Check size={12} /></button>
                        ) : (
                          <>
                            <button onClick={(e) => handleRenameStart(e, c)} className="p-1 hover:bg-[#2a2a2a] rounded text-[#666]"><Edit2 size={11} /></button>
                            <button onClick={(e) => handleDelete(e, c.id)} className="p-1 hover:bg-[#2a2a2a] rounded text-red-400"><Trash2 size={11} /></button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Bottom: User + Settings + Logout */}
        <div className="p-3 border-t border-[#2a2a2a]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-[#FF6B35]/20 text-[#FF6B35] flex items-center justify-center font-bold text-sm">{(user?.name || user?.email || 'U')[0].toUpperCase()}</div>
            <div className="flex-1 min-w-0">
              <div className="text-xs text-[#ececec] font-medium truncate">{user?.name || user?.email || 'User'}</div>
              <div className="text-[10px] text-[#666] truncate">{user?.email || ''}</div>
            </div>
            <button onClick={onOpenSettings} className="p-2 hover:bg-[#2a2a2a] rounded-lg text-[#666] hover:text-[#ececec]"><Settings size={16} /></button>
            {onLogout && (
              <button onClick={onLogout} className="p-2 hover:bg-[#2a2a2a] rounded-lg text-[#666] hover:text-red-400" title="Sign out">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
