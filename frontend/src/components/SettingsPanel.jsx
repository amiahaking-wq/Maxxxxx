/**
 * SettingsPanel — full-screen settings modal.
 * Tabs: Profile | Agent | Permissions | Memory | About
 */
import { useState, useEffect } from 'react';
import { X, User, Bot, Shield, Brain, Info, Save, Trash2, Plus } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || window.location.origin;

const TABS = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'agent', label: 'Agent', icon: Bot },
  { id: 'permissions', label: 'Permissions', icon: Shield },
  { id: 'memory', label: 'Memory', icon: Brain },
  { id: 'about', label: 'About', icon: Info },
];

const PERMISSIONS = [
  { id: 'browser_read', label: 'Browse websites (read-only)', default: true },
  { id: 'browser_write', label: 'Click & fill forms on websites', default: false },
  { id: 'file_read', label: 'Read files in workspace', default: true },
  { id: 'file_write', label: 'Write & create files', default: true },
  { id: 'file_delete', label: 'Delete files', default: false },
  { id: 'credential_use', label: 'Log into accounts using saved credentials', default: false },
  { id: 'git_push', label: 'Push code to GitHub', default: false },
  { id: 'external_api', label: 'Call external APIs (connectors)', default: false },
];

export default function SettingsPanel({ open, onClose, models, currentModel, onModelChange }) {
  const [tab, setTab] = useState('profile');
  const [profile, setProfile] = useState({ name: '', role: '', company: '', goals: '', language: 'English' });
  const [permissions, setPermissions] = useState({});
  const [memories, setMemories] = useState([]);
  const [newMemory, setNewMemory] = useState({ key: '', value: '' });
  const [auditLog, setAuditLog] = useState([]);
  const [saving, setSaving] = useState(false);
  const [tgCode, setTgCode] = useState(null);
  const [tgStatus, setTgStatus] = useState(null);

  useEffect(() => {
    if (open) {
      loadProfile();
      loadPermissions();
      loadMemories();
      loadAuditLog();
      loadTelegramStatus();
    }
  }, [open]);

  const loadProfile = async () => {
    try {
      const r = await fetch(`${API_BASE}/api/user/profile?userId=web_user`);
      if (r.ok) { const d = await r.json(); if (d.profile) setProfile({ ...profile, ...d.profile }); }
    } catch (e) {}
  };

  const loadPermissions = async () => {
    try {
      const r = await fetch(`${API_BASE}/api/permissions?userId=web_user`);
      if (r.ok) {
        const d = await r.json();
        const perms = {};
        PERMISSIONS.forEach(p => { perms[p.id] = p.default; });
        (d.permissions || []).forEach(p => { perms[p.permission] = p.is_allowed === 1; });
        setPermissions(perms);
      }
    } catch (e) {}
  };

  const loadMemories = async () => {
    try {
      const r = await fetch(`${API_BASE}/api/memory?userId=web_user`);
      if (r.ok) { const d = await r.json(); setMemories(d.memories || []); }
    } catch (e) {}
  };

  const loadAuditLog = async () => {
    try {
      const r = await fetch(`${API_BASE}/api/permissions/audit?userId=web_user&limit=10`);
      if (r.ok) { const d = await r.json(); setAuditLog(d.auditLog || []); }
    } catch (e) {}
  };

  const loadTelegramStatus = async () => {
    try {
      const token = localStorage.getItem('max_auth_token');
      const r = await fetch(`${API_BASE}/api/auth/telegram-status`, { headers: { 'Authorization': `Bearer ${token}` } });
      if (r.ok) { const d = await r.json(); setTgStatus(d); }
    } catch (e) {}
  };

  const generateTelegramCode = async () => {
    try {
      const token = localStorage.getItem('max_auth_token');
      const r = await fetch(`${API_BASE}/api/auth/link-telegram`, { method: 'POST', headers: { 'Authorization': `Bearer ${token}` } });
      if (r.ok) { const d = await r.json(); setTgCode(d.code); }
    } catch (e) {}
  };

  const unlinkTelegram = async () => {
    try {
      const token = localStorage.getItem('max_auth_token');
      await fetch(`${API_BASE}/api/auth/unlink-telegram`, { method: 'POST', headers: { 'Authorization': `Bearer ${token}` } });
      setTgStatus({ linked: false });
      setTgCode(null);
    } catch (e) {}
  };

  const saveProfile = async () => {
    setSaving(true);
    try { await fetch(`${API_BASE}/api/user/profile`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: 'web_user', ...profile }) }); } catch (e) {} finally { setSaving(false); }
  };

  const togglePermission = async (permId) => {
    const newValue = !permissions[permId];
    setPermissions(prev => ({ ...prev, [permId]: newValue }));
    try { await fetch(`${API_BASE}/api/permissions/${newValue ? 'grant' : 'revoke'}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: 'web_user', permission: permId }) }); } catch (e) {}
  };

  const saveMemory = async () => {
    if (!newMemory.key || !newMemory.value) return;
    try { await fetch(`${API_BASE}/api/memory`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: 'web_user', key: newMemory.key, value: newMemory.value }) }); setNewMemory({ key: '', value: '' }); loadMemories(); } catch (e) {}
  };

  const deleteMemory = async (key) => {
    try { await fetch(`${API_BASE}/api/memory/${key}?userId=web_user`, { method: 'DELETE' }); loadMemories(); } catch (e) {}
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-2" onClick={onClose}>
      <div className="bg-[#171717] border border-[#2a2a2a] rounded-2xl w-full max-w-2xl h-full max-h-[90vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#2a2a2a]">
          <h2 className="text-[#ececec] font-semibold text-sm">Settings</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-[#2a2a2a] rounded-lg text-[#666]"><X size={18} /></button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-4 py-2 border-b border-[#2a2a2a] overflow-x-auto">
          {TABS.map(t => {
            const Icon = t.icon;
            return (
              <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${tab === t.id ? 'bg-[#FF6B35]/20 text-[#FF6B35]' : 'text-[#666] hover:text-[#999] hover:bg-[#212121]'}`}>
                <Icon size={14} /> {t.label}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {tab === 'profile' && (
            <div className="space-y-4">
              <Field label="Your Name" value={profile.name} onChange={(v) => setProfile({ ...profile, name: v })} placeholder="John Doe" />
              <Field label="Role / Job Title" value={profile.role} onChange={(v) => setProfile({ ...profile, role: v })} placeholder="Software Engineer" />
              <Field label="Company / Business" value={profile.company} onChange={(v) => setProfile({ ...profile, company: v })} placeholder="Acme Inc" />
              <div>
                <label className="block text-xs text-[#666] mb-1.5">What MAX should know about you</label>
                <textarea value={profile.goals} onChange={(e) => setProfile({ ...profile, goals: e.target.value })} placeholder="I'm building a fintech startup in Nigeria..." rows={3} className="w-full px-3 py-2 bg-[#212121] border border-[#2a2a2a] rounded-lg text-sm text-[#ececec] placeholder-[#555] focus:outline-none focus:border-[#FF6B35]/30 resize-none" />
              </div>
              <div>
                <label className="block text-xs text-[#666] mb-1.5">Language</label>
                <select value={profile.language} onChange={(e) => setProfile({ ...profile, language: e.target.value })} className="w-full px-3 py-2 bg-[#212121] border border-[#2a2a2a] rounded-lg text-sm text-[#ececec] focus:outline-none">
                  <option>English</option><option>Hausa</option><option>Yoruba</option><option>Igbo</option><option>French</option>
                </select>
              </div>
              <button onClick={saveProfile} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-[#FF6B35] hover:bg-[#e55a24] disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"><Save size={14} /> {saving ? 'Saving...' : 'Save Profile'}</button>

              {/* Telegram Linking */}
              <div className="pt-4 border-t border-[#2a2a2a]">
                <label className="block text-xs text-[#666] mb-2">Telegram Account</label>
                {tgStatus?.linked ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 p-2.5 bg-green-950/30 border border-green-900 rounded-lg">
                      <span className="text-green-400 text-sm">✅ Linked to @{tgStatus.telegramUsername}</span>
                    </div>
                    <button onClick={unlinkTelegram} className="px-3 py-1.5 text-xs text-red-400 hover:bg-red-950/30 border border-red-900 rounded-lg">Unlink Telegram</button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {tgCode ? (
                      <div className="p-3 bg-[#212121] border border-[#2a2a2a] rounded-lg">
                        <div className="text-xs text-[#999] mb-1">Send this code to @Maxxxxclaww_bot on Telegram:</div>
                        <div className="text-2xl font-mono font-bold text-[#FF6B35] tracking-wider">{tgCode}</div>
                        <div className="text-[10px] text-[#555] mt-1">Expires in 10 minutes</div>
                      </div>
                    ) : (
                      <button onClick={generateTelegramCode} className="flex items-center gap-2 px-3 py-2 bg-[#212121] hover:bg-[#2a2a2a] border border-[#2a2a2a] text-[#ccc] rounded-lg text-sm">
                        🔗 Link Telegram Account
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === 'agent' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-[#666] mb-1.5">Default Model</label>
                <select value={currentModel} onChange={(e) => onModelChange(e.target.value)} className="w-full px-3 py-2 bg-[#212121] border border-[#2a2a2a] rounded-lg text-sm text-[#ececec] focus:outline-none">
                  {(models || []).map(m => <option key={m.id} value={m.id}>{m.name} ({m.provider})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-[#666] mb-1.5">Mode</label>
                <div className="flex gap-2">
                  <button className="flex-1 px-3 py-2 bg-[#FF6B35]/20 text-[#FF6B35] border border-[#FF6B35]/30 rounded-lg text-sm font-medium">Simple</button>
                  <button onClick={() => window.location.href = '/dev'} className="flex-1 px-3 py-2 bg-[#212121] text-[#666] hover:text-[#999] border border-[#2a2a2a] rounded-lg text-sm font-medium">Developer</button>
                </div>
              </div>
            </div>
          )}

          {tab === 'permissions' && (
            <div className="space-y-2">
              {PERMISSIONS.map(p => (
                <div key={p.id} className="flex items-center justify-between p-3 bg-[#212121] border border-[#2a2a2a] rounded-lg">
                  <span className="text-sm text-[#ccc]">{p.label}</span>
                  <button onClick={() => togglePermission(p.id)} className={`relative w-10 h-5 rounded-full transition-colors ${permissions[p.id] ? 'bg-[#FF6B35]' : 'bg-[#2a2a2a]'}`}>
                    <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${permissions[p.id] ? 'translate-x-5' : ''}`} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {tab === 'memory' && (
            <div className="space-y-3">
              <div className="text-xs text-[#666]">Saved memories ({memories.length})</div>
              {memories.length === 0 ? (
                <div className="text-center py-8 text-[#555] text-sm">No memories saved yet</div>
              ) : (
                <div className="space-y-1.5">
                  {memories.map((m, i) => (
                    <div key={i} className="flex items-center gap-2 p-2.5 bg-[#212121] border border-[#2a2a2a] rounded-lg">
                      <div className="flex-1 min-w-0"><div className="text-xs text-[#ccc] font-mono">{m.key}</div><div className="text-[10px] text-[#666] truncate">{m.value}</div></div>
                      <button onClick={() => deleteMemory(m.key)} className="p-1 hover:bg-[#2a2a2a] rounded text-red-400"><Trash2 size={12} /></button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2 pt-2">
                <input value={newMemory.key} onChange={(e) => setNewMemory({ ...newMemory, key: e.target.value })} placeholder="Key" className="flex-1 px-2.5 py-1.5 bg-[#212121] border border-[#2a2a2a] rounded-lg text-xs text-[#ececec] placeholder-[#555] focus:outline-none" />
                <input value={newMemory.value} onChange={(e) => setNewMemory({ ...newMemory, value: e.target.value })} placeholder="Value" className="flex-1 px-2.5 py-1.5 bg-[#212121] border border-[#2a2a2a] rounded-lg text-xs text-[#ececec] placeholder-[#555] focus:outline-none" />
                <button onClick={saveMemory} className="p-2 bg-[#FF6B35] hover:bg-[#e55a24] text-white rounded-lg"><Plus size={14} /></button>
              </div>
            </div>
          )}

          {tab === 'about' && (
            <div className="space-y-4">
              <div className="text-sm text-[#ccc]">MAX AI Agent v2.0</div>
              <a href="https://github.com/amiahaking-wq/Maxxxxx" target="_blank" rel="noreferrer" className="text-xs text-[#FF6B35] hover:underline">View source on GitHub</a>
              <div>
                <div className="text-xs text-[#666] mb-2">Recent Actions (Audit Log)</div>
                {auditLog.length === 0 ? (
                  <div className="text-center py-4 text-[#555] text-xs">No actions logged yet</div>
                ) : (
                  <div className="space-y-1">
                    {auditLog.map((log, i) => (
                      <div key={i} className="flex items-center gap-2 px-2.5 py-1.5 bg-[#212121] rounded text-[10px] text-[#999]">
                        <span className="text-[#666]">{log.timestamp ? new Date(log.timestamp).toLocaleString() : ''}</span>
                        <span className="font-mono text-[#ccc]">{log.tool_name}</span>
                        {log.was_destructive === 1 && <span className="text-yellow-500">⚠</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }) {
  return (
    <div>
      <label className="block text-xs text-[#666] mb-1.5">{label}</label>
      <input type="text" value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full px-3 py-2 bg-[#212121] border border-[#2a2a2a] rounded-lg text-sm text-[#ececec] placeholder-[#555] focus:outline-none focus:border-[#FF6B35]/30" />
    </div>
  );
}
