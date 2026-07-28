/**
 * SettingsPanel — full-screen settings modal.
 * Tabs: Profile | Agent | Permissions | Memory | Knowledge | Connectors | About
 *
 * Knowledge: add/list/delete documents in the RAG knowledge base
 * Connectors: save API keys / OAuth credentials to the encrypted vault
 *             (so users don't need to set Railway env vars)
 */
import { useState, useEffect } from 'react';
import { X, User, Bot, Shield, Brain, BookOpen, Plug, Info, Save, Trash2, Plus, Check, ExternalLink, Eye, EyeOff } from 'lucide-react';
import { getAuthHeaders } from '../lib/auth.js';

const API_BASE = import.meta.env.VITE_API_URL || window.location.origin;

const TABS = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'agent', label: 'Agent', icon: Bot },
  { id: 'permissions', label: 'Permissions', icon: Shield },
  { id: 'memory', label: 'Memory', icon: Brain },
  { id: 'knowledge', label: 'Knowledge', icon: BookOpen },
  { id: 'connectors', label: 'Connectors', icon: Plug },
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

  // Knowledge state
  const [knowledgeDocs, setKnowledgeDocs] = useState([]);
  const [newDoc, setNewDoc] = useState({ title: '', content: '', type: 'document' });

  // Connectors state
  const [vaultServices, setVaultServices] = useState({});
  const [savedCreds, setSavedCreds] = useState([]);
  const [editingService, setEditingService] = useState(null);
  const [credFields, setCredFields] = useState({});
  const [showSecrets, setShowSecrets] = useState({});

  useEffect(() => {
    if (open) {
      loadProfile();
      loadPermissions();
      loadMemories();
      loadAuditLog();
      loadTelegramStatus();
      loadKnowledge();
      loadVaultServices();
      loadSavedCreds();
    }
  }, [open]);

  const loadProfile = async () => {
    try {
      const r = await fetch(`${API_BASE}/api/user/profile?userId=web_user`, { headers: getAuthHeaders() });
      if (r.ok) { const d = await r.json(); if (d.profile) setProfile({ ...profile, ...d.profile }); }
    } catch (e) {}
  };

  const loadPermissions = async () => {
    try {
      const r = await fetch(`${API_BASE}/api/permissions?userId=web_user`, { headers: getAuthHeaders() });
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
      const r = await fetch(`${API_BASE}/api/memory?userId=web_user`, { headers: getAuthHeaders() });
      if (r.ok) { const d = await r.json(); setMemories(d.memories || []); }
    } catch (e) {}
  };

  const loadAuditLog = async () => {
    try {
      const r = await fetch(`${API_BASE}/api/permissions/audit?userId=web_user&limit=10`, { headers: getAuthHeaders() });
      if (r.ok) { const d = await r.json(); setAuditLog(d.auditLog || []); }
    } catch (e) {}
  };

  const loadTelegramStatus = async () => {
    try {
      const r = await fetch(`${API_BASE}/api/auth/telegram-status`, { headers: getAuthHeaders() });
      if (r.ok) { const d = await r.json(); setTgStatus(d); }
    } catch (e) {}
  };

  const loadKnowledge = async () => {
    try {
      const r = await fetch(`${API_BASE}/api/knowledge`, { headers: getAuthHeaders() });
      if (r.ok) { const d = await r.json(); setKnowledgeDocs(d.docs || []); }
    } catch (e) {}
  };

  const loadVaultServices = async () => {
    try {
      const r = await fetch(`${API_BASE}/api/vault/services`, { headers: getAuthHeaders() });
      if (r.ok) { const d = await r.json(); setVaultServices(d.services || {}); }
    } catch (e) {}
  };

  const loadSavedCreds = async () => {
    try {
      const r = await fetch(`${API_BASE}/api/vault`, { headers: getAuthHeaders() });
      if (r.ok) { const d = await r.json(); setSavedCreds(d.credentials || []); }
    } catch (e) {}
  };

  const generateTelegramCode = async () => {
    try {
      const r = await fetch(`${API_BASE}/api/auth/link-telegram`, { method: 'POST', headers: getAuthHeaders() });
      if (r.ok) { const d = await r.json(); setTgCode(d.code); }
    } catch (e) {}
  };

  const unlinkTelegram = async () => {
    try {
      await fetch(`${API_BASE}/api/auth/unlink-telegram`, { method: 'POST', headers: getAuthHeaders() });
      setTgStatus({ linked: false });
      setTgCode(null);
    } catch (e) {}
  };

  const saveProfile = async () => {
    setSaving(true);
    try {
      await fetch(`${API_BASE}/api/user/profile`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ userId: 'web_user', ...profile })
      });
    } catch (e) {} finally { setSaving(false); }
  };

  const togglePermission = async (permId) => {
    const newValue = !permissions[permId];
    setPermissions(prev => ({ ...prev, [permId]: newValue }));
    try {
      await fetch(`${API_BASE}/api/permissions/${newValue ? 'grant' : 'revoke'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'web_user', permission: permId })
      });
    } catch (e) {}
  };

  const saveMemory = async () => {
    if (!newMemory.key || !newMemory.value) return;
    try {
      await fetch(`${API_BASE}/api/memory`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ userId: 'web_user', key: newMemory.key, value: newMemory.value })
      });
      setNewMemory({ key: '', value: '' });
      loadMemories();
    } catch (e) {}
  };

  const deleteMemory = async (key) => {
    try {
      await fetch(`${API_BASE}/api/memory/${key}?userId=web_user`, { method: 'DELETE', headers: getAuthHeaders() });
      loadMemories();
    } catch (e) {}
  };

  const saveKnowledge = async () => {
    if (!newDoc.title || !newDoc.content) return;
    try {
      const r = await fetch(`${API_BASE}/api/knowledge`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(newDoc)
      });
      if (r.ok) {
        setNewDoc({ title: '', content: '', type: 'document' });
        loadKnowledge();
      }
    } catch (e) {}
  };

  const deleteKnowledge = async (id) => {
    try {
      await fetch(`${API_BASE}/api/knowledge/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
      loadKnowledge();
    } catch (e) {}
  };

  const startEditCreds = (serviceName) => {
    setEditingService(serviceName);
    setCredFields({});
  };

  const saveCreds = async (serviceName) => {
    try {
      const r = await fetch(`${API_BASE}/api/vault`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ service_name: serviceName, ...credFields })
      });
      if (r.ok) {
        setEditingService(null);
        setCredFields({});
        loadSavedCreds();
      }
    } catch (e) {}
  };

  const deleteCreds = async (serviceName) => {
    if (!confirm(`Delete credentials for ${serviceName}?`)) return;
    try {
      await fetch(`${API_BASE}/api/vault/${serviceName}`, { method: 'DELETE', headers: getAuthHeaders() });
      loadSavedCreds();
    } catch (e) {}
  };

  const isCredSaved = (serviceName) => savedCreds.some(c => c.service_name === serviceName);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-2" onClick={onClose}>
      <div className="bg-[#171717] border border-[#2a2a2a] rounded-2xl w-full max-w-2xl h-full max-h-[90vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#2a2a2a] flex-shrink-0">
          <h2 className="text-[#ececec] font-semibold text-sm">Settings</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-[#2a2a2a] rounded-lg text-[#666]"><X size={18} /></button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-4 py-2 border-b border-[#2a2a2a] overflow-x-auto flex-shrink-0">
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
                  <option>English</option><option>Hausa</option><option>Yoruba</option><option>Igbo</option><option>French</option><option>Spanish</option><option>Arabic</option><option>Chinese</option>
                </select>
              </div>
              <button onClick={saveProfile} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-[#FF6B35] hover:bg-[#e55a24] disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"><Save size={14} /> {saving ? 'Saving...' : 'Save Profile'}</button>

              {/* Telegram Linking */}
              <div className="pt-4 border-t border-[#2a2a2a]">
                <label className="block text-xs text-[#666] mb-2">Telegram Account</label>
                {tgStatus?.linked ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 p-2.5 bg-green-950/30 border border-green-900 rounded-lg">
                      <Check size={14} className="text-green-400" />
                      <span className="text-green-400 text-sm">Linked to @{tgStatus.telegramUsername}</span>
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
                        Link Telegram Account
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
                <p className="text-[10px] text-[#555] mt-1">Smart routing will pick the best model for each task type if you select "Auto".</p>
              </div>
              <div>
                <label className="block text-xs text-[#666] mb-1.5">Mode</label>
                <div className="flex gap-2">
                  <button className="flex-1 px-3 py-2 bg-[#FF6B35]/20 text-[#FF6B35] border border-[#FF6B35]/30 rounded-lg text-sm font-medium">Simple</button>
                  <button onClick={() => window.location.href = '/dev'} className="flex-1 px-3 py-2 bg-[#212121] text-[#666] hover:text-[#999] border border-[#2a2a2a] rounded-lg text-sm font-medium">Developer</button>
                </div>
              </div>
              <div className="pt-4 border-t border-[#2a2a2a]">
                <label className="block text-xs text-[#666] mb-2">Agent Behavior</label>
                <p className="text-xs text-[#999] leading-relaxed">
                  MAX uses a model-agnostic ReAct harness: every task runs through a Think→Act→Observe loop
                  with hybrid LLM calling (function calling when supported, ReAct text format otherwise).
                  The agent has 20+ tools (bash, write_file, web_search, browser, memory, knowledge, credentials)
                  and automatically retries transient failures.
                </p>
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

          {tab === 'knowledge' && (
            <div className="space-y-3">
              <div className="text-xs text-[#666]">
                Knowledge base documents ({knowledgeDocs.length}).
                MAX uses these to answer questions about your business, policies, products, etc.
              </div>

              {/* Add new document */}
              <div className="p-3 bg-[#212121] border border-[#2a2a2a] rounded-lg space-y-2">
                <div className="text-xs text-[#999] font-medium">Add Document</div>
                <input value={newDoc.title} onChange={(e) => setNewDoc({ ...newDoc, title: e.target.value })} placeholder="Title (e.g. Return Policy)" className="w-full px-2.5 py-1.5 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg text-xs text-[#ececec] placeholder-[#555] focus:outline-none" />
                <select value={newDoc.type} onChange={(e) => setNewDoc({ ...newDoc, type: e.target.value })} className="w-full px-2.5 py-1.5 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg text-xs text-[#ececec] focus:outline-none">
                  <option value="document">Document</option>
                  <option value="policy">Policy</option>
                  <option value="faq">FAQ</option>
                  <option value="product_catalog">Product Catalog</option>
                  <option value="procedure">Procedure</option>
                </select>
                <textarea value={newDoc.content} onChange={(e) => setNewDoc({ ...newDoc, content: e.target.value })} placeholder="Full content..." rows={4} className="w-full px-2.5 py-1.5 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg text-xs text-[#ececec] placeholder-[#555] focus:outline-none resize-none" />
                <button onClick={saveKnowledge} disabled={!newDoc.title || !newDoc.content} className="flex items-center gap-1.5 px-3 py-1.5 bg-[#FF6B35] hover:bg-[#e55a24] disabled:opacity-30 text-white rounded-lg text-xs font-medium"><Plus size={12} /> Add to Knowledge Base</button>
              </div>

              {/* List existing */}
              {knowledgeDocs.length === 0 ? (
                <div className="text-center py-8 text-[#555] text-sm">No documents yet</div>
              ) : (
                <div className="space-y-1.5">
                  {knowledgeDocs.map((d, i) => (
                    <div key={i} className="flex items-start gap-2 p-2.5 bg-[#212121] border border-[#2a2a2a] rounded-lg">
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-[#ccc] font-medium">{d.title}</div>
                        <div className="text-[10px] text-[#666] mt-0.5 line-clamp-2">{d.content?.substring(0, 150)}...</div>
                        <div className="text-[10px] text-[#555] mt-1">{d.content_type || 'document'} · {d.created_at ? String(d.created_at).split('T')[0] : ''}</div>
                      </div>
                      <button onClick={() => deleteKnowledge(d.id)} className="p-1 hover:bg-[#2a2a2a] rounded text-red-400"><Trash2 size={12} /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'connectors' && (
            <div className="space-y-3">
              <div className="text-xs text-[#666]">
                Save API keys and OAuth credentials in the encrypted vault. MAX uses these at runtime — no Railway env vars needed.
              </div>

              {Object.entries(vaultServices).length === 0 ? (
                <div className="text-center py-8 text-[#555] text-sm">Loading services...</div>
              ) : (
                <div className="space-y-2">
                  {Object.entries(vaultServices).map(([key, svc]) => {
                    const saved = isCredSaved(key);
                    const isEditing = editingService === key;
                    return (
                      <div key={key} className="p-3 bg-[#212121] border border-[#2a2a2a] rounded-lg">
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-[#ccc] font-medium">{svc.name}</span>
                            {saved && <span className="flex items-center gap-1 text-[10px] text-green-400"><Check size={10} /> Saved</span>}
                          </div>
                          <div className="flex items-center gap-1">
                            <a href={svc.docs} target="_blank" rel="noreferrer" className="text-[#666] hover:text-[#FF6B35] p-1" title="Get credentials"><ExternalLink size={12} /></a>
                            {saved && !isEditing && (
                              <button onClick={() => deleteCreds(key)} className="text-red-400 hover:bg-red-950/30 p-1 rounded" title="Delete"><Trash2 size={12} /></button>
                            )}
                          </div>
                        </div>
                        <p className="text-[10px] text-[#666] mb-2">{svc.description}</p>

                        {isEditing ? (
                          <div className="space-y-2">
                            {svc.fields.map(field => (
                              <div key={field.key}>
                                <label className="block text-[10px] text-[#999] mb-0.5">{field.label}{field.required && ' *'}</label>
                                <div className="relative">
                                  <input
                                    type={showSecrets[`${key}.${field.key}`] ? 'text' : field.type === 'password' ? 'password' : 'text'}
                                    value={credFields[field.key] || ''}
                                    onChange={(e) => setCredFields({ ...credFields, [field.key]: e.target.value })}
                                    placeholder={field.placeholder}
                                    className="w-full px-2.5 py-1.5 pr-8 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg text-xs text-[#ececec] placeholder-[#555] focus:outline-none"
                                  />
                                  {field.type === 'password' && (
                                    <button
                                      onClick={() => setShowSecrets({ ...showSecrets, [`${key}.${field.key}`]: !showSecrets[`${key}.${field.key}`] })}
                                      className="absolute right-2 top-1/2 -translate-y-1/2 text-[#666] hover:text-[#999]"
                                    >
                                      {showSecrets[`${key}.${field.key}`] ? <EyeOff size={12} /> : <Eye size={12} />}
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))}
                            <div className="flex gap-2">
                              <button onClick={() => saveCreds(key)} className="px-3 py-1.5 bg-[#FF6B35] hover:bg-[#e55a24] text-white rounded-lg text-xs font-medium">Save</button>
                              <button onClick={() => { setEditingService(null); setCredFields({}); }} className="px-3 py-1.5 bg-[#2a2a2a] hover:bg-[#333] text-[#ccc] rounded-lg text-xs">Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <button onClick={() => startEditCreds(key)} className="text-xs text-[#FF6B35] hover:underline">
                            {saved ? 'Update credentials' : 'Add credentials'}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {tab === 'about' && (
            <div className="space-y-4">
              <div>
                <div className="text-sm text-[#ccc] font-medium">MAX AI Agent v3.0</div>
                <div className="text-xs text-[#666] mt-1">Production-grade autonomous agent platform. Model-agnostic ReAct harness with 20+ tools.</div>
              </div>
              <a href="https://github.com/amiahaking-wq/Maxxxxx" target="_blank" rel="noreferrer" className="text-xs text-[#FF6B35] hover:underline flex items-center gap-1"><ExternalLink size={12} /> View source on GitHub</a>
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
                        {log.was_destructive === 1 && <span className="text-yellow-500">!</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="pt-4 border-t border-[#2a2a2a] space-y-1 text-[10px] text-[#555]">
                <div>• 25-tool ReAct loop with hybrid LLM calling</div>
                <div>• AES-256-GCM encrypted credential vault</div>
                <div>• RAG knowledge base (Supabase pgvector)</div>
                <div>• PWA installable with push notifications</div>
                <div>• Telegram bot with safe-send (no Markdown crashes)</div>
                <div>• File upload + image vision + PDF extraction</div>
                <div>• Auto-retry on transient tool failures</div>
                <div>• Smart model routing (task-based selection)</div>
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
