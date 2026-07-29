'use client';
import { useState, useEffect } from 'react';
import { X, User, Bot, Shield, Brain, BookOpen, Clock, BarChart3, Info, Save, Trash2, Plus, Check, ExternalLink, Eye, EyeOff, Calendar, Play, Pause, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://maxxxxx-production.up.railway.app';

function apiUrl(path: string): string {
  if (path.startsWith('http')) return path;
  return `${API_BASE}${path}`;
}

const TABS = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'agent', label: 'Agent', icon: Bot },
  { id: 'memory', label: 'Memory', icon: Brain },
  { id: 'knowledge', label: 'Knowledge', icon: BookOpen },
  { id: 'scheduled', label: 'Scheduled', icon: Clock },
  { id: 'teams', label: 'Teams', icon: Users },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { id: 'about', label: 'About', icon: Info },
];

const PERMISSIONS = [
  { id: 'browser_read', label: 'Browse websites (read-only)', default: true },
  { id: 'browser_write', label: 'Click & fill forms on websites', default: false },
  { id: 'file_write', label: 'Write & create files', default: true },
  { id: 'file_delete', label: 'Delete files', default: false },
  { id: 'git_push', label: 'Push code to GitHub', default: false },
];

const SCHEDULE_PRESETS = [
  { id: 'every_morning', label: 'Every morning at 8am', cron: '0 8 * * *' },
  { id: 'every_evening', label: 'Every evening at 8pm', cron: '0 20 * * *' },
  { id: 'every_hour', label: 'Every hour', cron: '0 * * * *' },
  { id: 'every_monday', label: 'Every Monday 9am', cron: '0 9 * * 1' },
  { id: 'every_day', label: 'Every day at 9am', cron: '0 9 * * *' },
];

interface SettingsPanelProps {
  token: string;
  user: any;
  onClose: () => void;
  models: any[];
  currentModel: string;
  onModelChange: (m: string) => void;
}

export function SettingsPanel({ token, user, onClose, models, currentModel, onModelChange }: SettingsPanelProps) {
  const { t, i18n } = useTranslation('common');
  const [tab, setTab] = useState('profile');
  const [profile, setProfile] = useState({ name: user?.name || '', role: '', company: '', goals: '', language: 'en' });
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [memories, setMemories] = useState<any[]>([]);
  const [newMemory, setNewMemory] = useState({ key: '', value: '' });
  const [knowledgeDocs, setKnowledgeDocs] = useState<any[]>([]);
  const [newDoc, setNewDoc] = useState({ title: '', content: '', type: 'document' });
  const [scheduledTasks, setScheduledTasks] = useState<any[]>([]);
  const [newTask, setNewTask] = useState({ name: '', prompt: '', schedule: '0 9 * * *' });
  const [teams, setTeams] = useState<any[]>([]);
  const [newTeam, setNewTeam] = useState({ name: '', description: '' });
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [inviteResult, setInviteResult] = useState('');
  const [analytics, setAnalytics] = useState<any>(null);
  const [vaultServices, setVaultServices] = useState<any>({});
  const [savedCreds, setSavedCreds] = useState<any[]>([]);
  const [editingService, setEditingService] = useState<string | null>(null);
  const [credFields, setCredFields] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    await Promise.all([
      loadProfile(), loadPermissions(), loadMemories(), loadKnowledge(),
      loadScheduled(), loadTeams(), loadAnalytics(), loadVaultServices(), loadSavedCreds()
    ]);
  }

  async function loadProfile() {
    try {
      const r = await fetch(apiUrl('/api/user/profile'), { headers: { Authorization: `Bearer ${token}` } });
      if (r.ok) { const d = await r.json(); if (d.profile) setProfile(p => ({ ...p, ...d.profile })); }
    } catch {}
  }
  async function loadPermissions() {
    try {
      const r = await fetch(apiUrl('/api/permissions'), { headers: { Authorization: `Bearer ${token}` } });
      if (r.ok) {
        const d = await r.json();
        const perms: Record<string, boolean> = {};
        PERMISSIONS.forEach(p => { perms[p.id] = p.default; });
        (d.permissions || []).forEach((p: any) => { perms[p.permission] = p.is_allowed === 1; });
        setPermissions(perms);
      }
    } catch {}
  }
  async function loadMemories() {
    try {
      const r = await fetch(apiUrl('/api/memory'), { headers: { Authorization: `Bearer ${token}` } });
      if (r.ok) { const d = await r.json(); setMemories(d.memories || []); }
    } catch {}
  }
  async function loadKnowledge() {
    try {
      const r = await fetch(apiUrl('/api/knowledge'), { headers: { Authorization: `Bearer ${token}` } });
      if (r.ok) { const d = await r.json(); setKnowledgeDocs(d.docs || []); }
    } catch {}
  }
  async function loadScheduled() {
    try {
      const r = await fetch(apiUrl('/api/scheduled'), { headers: { Authorization: `Bearer ${token}` } });
      if (r.ok) { const d = await r.json(); setScheduledTasks(d.tasks || []); }
    } catch {}
  }
  async function loadTeams() {
    try {
      const r = await fetch(apiUrl('/api/teams'), { headers: { Authorization: `Bearer ${token}` } });
      if (r.ok) { const d = await r.json(); setTeams(d.teams || []); }
    } catch {}
  }
  async function createTeam() {
    if (!newTeam.name) return;
    try {
      const r = await fetch(apiUrl('/api/teams'), {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(newTeam)
      });
      if (r.ok) { setNewTeam({ name: '', description: '' }); loadTeams(); }
    } catch {}
  }
  async function inviteMember(teamId: string) {
    if (!inviteEmail) return;
    try {
      const r = await fetch(apiUrl(`/api/teams/${teamId}/invite`), {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email: inviteEmail })
      });
      const d = await r.json();
      if (r.ok) {
        setInviteResult(`Invite link: ${window.location.origin}/?join=${d.code}`);
        setInviteEmail('');
      } else {
        setInviteResult(`Error: ${d.error}`);
      }
    } catch (e: any) { setInviteResult(`Error: ${e.message}`); }
  }
  async function acceptInvite(teamId: string) {
    if (!inviteCode) return;
    try {
      const r = await fetch(apiUrl(`/api/teams/${teamId}/accept`), {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ code: inviteCode })
      });
      if (r.ok) { setInviteCode(''); loadTeams(); setInviteResult('Joined team!'); }
    } catch {}
  }
  async function leaveTeam(teamId: string, userId: string) {
    if (!confirm('Leave this team?')) return;
    try {
      await fetch(apiUrl(`/api/teams/${teamId}/members/${userId}`), {
        method: 'DELETE', headers: { Authorization: `Bearer ${token}` }
      });
      loadTeams();
    } catch {}
  }
  async function loadAnalytics() {
    try {
      const r = await fetch(apiUrl('/api/usage'), { headers: { Authorization: `Bearer ${token}` } });
      if (r.ok) { const d = await r.json(); setAnalytics(d); }
    } catch {}
  }
  async function loadVaultServices() {
    try {
      const r = await fetch(apiUrl('/api/vault/services'), { headers: { Authorization: `Bearer ${token}` } });
      if (r.ok) { const d = await r.json(); setVaultServices(d.services || {}); }
    } catch {}
  }
  async function loadSavedCreds() {
    try {
      const r = await fetch(apiUrl('/api/vault'), { headers: { Authorization: `Bearer ${token}` } });
      if (r.ok) { const d = await r.json(); setSavedCreds(d.credentials || []); }
    } catch {}
  }

  async function saveProfile() {
    setSaving(true);
    try {
      await fetch(apiUrl('/api/user/profile'), {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(profile)
      });
    } catch {} finally { setSaving(false); }
  }

  async function togglePermission(id: string) {
    const newValue = !permissions[id];
    setPermissions(p => ({ ...p, [id]: newValue }));
    try {
      await fetch(apiUrl(`/api/permissions/${newValue ? 'grant' : 'revoke'}`), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, permission: id })
      });
    } catch {}
  }

  async function saveMemory() {
    if (!newMemory.key || !newMemory.value) return;
    try {
      await fetch(apiUrl('/api/memory'), {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(newMemory)
      });
      setNewMemory({ key: '', value: '' });
      loadMemories();
    } catch {}
  }
  async function deleteMemory(key: string) {
    try {
      await fetch(apiUrl(`/api/memory/${key}`), { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      loadMemories();
    } catch {}
  }

  async function saveKnowledge() {
    if (!newDoc.title || !newDoc.content) return;
    try {
      await fetch(apiUrl('/api/knowledge'), {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(newDoc)
      });
      setNewDoc({ title: '', content: '', type: 'document' });
      loadKnowledge();
    } catch {}
  }
  async function deleteKnowledge(id: string) {
    try {
      await fetch(apiUrl(`/api/knowledge/${id}`), { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      loadKnowledge();
    } catch {}
  }

  async function saveTask() {
    if (!newTask.name || !newTask.prompt) return;
    try {
      await fetch(apiUrl('/api/scheduled'), {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(newTask)
      });
      setNewTask({ name: '', prompt: '', schedule: '0 9 * * *' });
      loadScheduled();
    } catch {}
  }
  async function toggleTask(id: string, active: boolean) {
    try {
      await fetch(apiUrl(`/api/scheduled/${id}`), {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ active: !active })
      });
      loadScheduled();
    } catch {}
  }
  async function deleteTask(id: string) {
    try {
      await fetch(apiUrl(`/api/scheduled/${id}`), { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      loadScheduled();
    } catch {}
  }

  async function saveCreds(serviceName: string) {
    try {
      await fetch(apiUrl('/api/vault'), {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ service_name: serviceName, ...credFields })
      });
      setEditingService(null);
      setCredFields({});
      loadSavedCreds();
    } catch {}
  }
  async function deleteCreds(serviceName: string) {
    if (!confirm(`Delete credentials for ${serviceName}?`)) return;
    try {
      await fetch(apiUrl(`/api/vault/${serviceName}`), { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      loadSavedCreds();
    } catch {}
  }

  const isCredSaved = (name: string) => savedCreds.some(c => c.service_name === name);

  return (
    <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-2" onClick={onClose}>
      <div className="bg-[#171717] border border-[#2a2a2a] rounded-2xl w-full max-w-2xl h-full max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#2a2a2a] flex-shrink-0">
          <h2 className="text-white font-semibold text-sm">{t('settings')}</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-[#2a2a2a] rounded-lg text-[#666]"><X size={18} /></button>
        </div>

        <div className="flex gap-1 px-4 py-2 border-b border-[#2a2a2a] overflow-x-auto flex-shrink-0">
          {TABS.map(t => {
            const Icon = t.icon;
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${tab === t.id ? 'bg-[#FF6B35]/20 text-[#FF6B35]' : 'text-[#666] hover:text-[#999] hover:bg-[#212121]'}`}>
                <Icon size={14} /> {t.label}
              </button>
            );
          })}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {tab === 'profile' && (
            <div className="space-y-4">
              <Field label="Your Name" value={profile.name} onChange={v => setProfile({ ...profile, name: v })} placeholder="John Doe" />
              <Field label="Role / Job Title" value={profile.role} onChange={v => setProfile({ ...profile, role: v })} placeholder="Software Engineer" />
              <Field label="Company / Business" value={profile.company} onChange={v => setProfile({ ...profile, company: v })} placeholder="Acme Inc" />
              <div>
                <label className="block text-xs text-[#666] mb-1.5">What MAX should know about you</label>
                <textarea value={profile.goals} onChange={e => setProfile({ ...profile, goals: e.target.value })}
                  placeholder="I'm building a fintech startup..." rows={3}
                  className="w-full px-3 py-2 bg-[#212121] border border-[#2a2a2a] rounded-lg text-sm text-white placeholder-[#555] focus:outline-none focus:border-[#FF6B35]/30 resize-none" />
              </div>
              <div>
                <label className="block text-xs text-[#666] mb-1.5">Language</label>
                <select value={profile.language} onChange={e => {
                  const lang = e.target.value;
                  setProfile({ ...profile, language: lang });
                  i18n.changeLanguage(lang);
                  localStorage.setItem('max_language', lang);
                }} className="w-full px-3 py-2 bg-[#212121] border border-[#2a2a2a] rounded-lg text-sm text-white">
                  <option value="en">🇬🇧 English</option>
                  <option value="pidgin">🇳🇬 Pidgin</option>
                  <option value="ha">🇳🇬 Hausa</option>
                  <option value="yo">🇳🇬 Yoruba</option>
                  <option value="fr">🇫🇷 French</option>
                </select>
              </div>
              <button onClick={saveProfile} disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-[#FF6B35] hover:bg-[#e05a28] disabled:opacity-50 text-white rounded-lg text-sm font-medium">
                <Save size={14} /> {saving ? 'Saving...' : 'Save Profile'}
              </button>

              {/* Connectors */}
              <div className="pt-4 border-t border-[#2a2a2a]">
                <label className="block text-xs text-[#666] mb-2">API Keys & Connectors</label>
                <div className="space-y-2">
                  {Object.entries(vaultServices).map(([key, svc]: [string, any]) => {
                    const saved = isCredSaved(key);
                    const isEditing = editingService === key;
                    return (
                      <div key={key} className="p-3 bg-[#212121] border border-[#2a2a2a] rounded-lg">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm text-[#ccc] font-medium">{svc.name}</span>
                          <div className="flex items-center gap-2">
                            {saved && <Check size={12} className="text-green-400" />}
                            <a href={svc.docs} target="_blank" rel="noreferrer" className="text-[#666] hover:text-[#FF6B35]">
                              <ExternalLink size={12} />
                            </a>
                            {saved && !isEditing && (
                              <button onClick={() => deleteCreds(key)} className="text-red-400"><Trash2 size={12} /></button>
                            )}
                          </div>
                        </div>
                        <p className="text-[10px] text-[#666] mb-2">{svc.description}</p>
                        {isEditing ? (
                          <div className="space-y-2">
                            {svc.fields.map((f: any) => (
                              <div key={f.key}>
                                <label className="block text-[10px] text-[#999] mb-0.5">{f.label}{f.required && ' *'}</label>
                                <input type={f.type === 'password' ? 'password' : 'text'}
                                  value={credFields[f.key] || ''}
                                  onChange={e => setCredFields({ ...credFields, [f.key]: e.target.value })}
                                  placeholder={f.placeholder}
                                  className="w-full px-2.5 py-1.5 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg text-xs text-white placeholder-[#555] focus:outline-none" />
                              </div>
                            ))}
                            <div className="flex gap-2">
                              <button onClick={() => saveCreds(key)} className="px-3 py-1.5 bg-[#FF6B35] hover:bg-[#e05a28] text-white rounded-lg text-xs font-medium">Save</button>
                              <button onClick={() => { setEditingService(null); setCredFields({}); }} className="px-3 py-1.5 bg-[#2a2a2a] text-[#ccc] rounded-lg text-xs">Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <button onClick={() => setEditingService(key)} className="text-xs text-[#FF6B35] hover:underline">
                            {saved ? 'Update credentials' : 'Add credentials'}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {tab === 'agent' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-[#666] mb-1.5">Default Model</label>
                <select value={currentModel} onChange={e => onModelChange(e.target.value)}
                  className="w-full px-3 py-2 bg-[#212121] border border-[#2a2a2a] rounded-lg text-sm text-white">
                  {models.map(m => <option key={m.id} value={m.id}>{m.name} ({m.provider})</option>)}
                </select>
                <p className="text-[10px] text-[#555] mt-1">Smart routing will pick the best model per task type if "Auto" selected.</p>
              </div>
              <div>
                <label className="block text-xs text-[#666] mb-1.5">Permissions</label>
                <div className="space-y-2">
                  {PERMISSIONS.map(p => (
                    <div key={p.id} className="flex items-center justify-between p-3 bg-[#212121] border border-[#2a2a2a] rounded-lg">
                      <span className="text-sm text-[#ccc]">{p.label}</span>
                      <button onClick={() => togglePermission(p.id)}
                        className={`relative w-10 h-5 rounded-full transition-colors ${permissions[p.id] ? 'bg-[#FF6B35]' : 'bg-[#2a2a2a]'}`}>
                        <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${permissions[p.id] ? 'translate-x-5' : ''}`} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
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
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-[#ccc] font-mono">{m.key}</div>
                        <div className="text-[10px] text-[#666] truncate">{m.value}</div>
                      </div>
                      <button onClick={() => deleteMemory(m.key)} className="p-1 hover:bg-[#2a2a2a] rounded text-red-400"><Trash2 size={12} /></button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2 pt-2">
                <input value={newMemory.key} onChange={e => setNewMemory({ ...newMemory, key: e.target.value })} placeholder="Key" className="flex-1 px-2.5 py-1.5 bg-[#212121] border border-[#2a2a2a] rounded-lg text-xs text-white" />
                <input value={newMemory.value} onChange={e => setNewMemory({ ...newMemory, value: e.target.value })} placeholder="Value" className="flex-1 px-2.5 py-1.5 bg-[#212121] border border-[#2a2a2a] rounded-lg text-xs text-white" />
                <button onClick={saveMemory} className="p-2 bg-[#FF6B35] hover:bg-[#e05a24] text-white rounded-lg"><Plus size={14} /></button>
              </div>
            </div>
          )}

          {tab === 'knowledge' && (
            <div className="space-y-3">
              <div className="text-xs text-[#666]">Knowledge documents ({knowledgeDocs.length})</div>
              <div className="p-3 bg-[#212121] border border-[#2a2a2a] rounded-lg space-y-2">
                <div className="text-xs text-[#999]">Add Document</div>
                <input value={newDoc.title} onChange={e => setNewDoc({ ...newDoc, title: e.target.value })} placeholder="Title" className="w-full px-2.5 py-1.5 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg text-xs text-white" />
                <select value={newDoc.type} onChange={e => setNewDoc({ ...newDoc, type: e.target.value })} className="w-full px-2.5 py-1.5 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg text-xs text-white">
                  <option value="document">Document</option><option value="policy">Policy</option>
                  <option value="faq">FAQ</option><option value="product_catalog">Product Catalog</option>
                </select>
                <textarea value={newDoc.content} onChange={e => setNewDoc({ ...newDoc, content: e.target.value })} placeholder="Content..." rows={4}
                  className="w-full px-2.5 py-1.5 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg text-xs text-white resize-none" />
                <button onClick={saveKnowledge} disabled={!newDoc.title || !newDoc.content}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#FF6B35] hover:bg-[#e05a24] disabled:opacity-30 text-white rounded-lg text-xs"><Plus size={12} /> Add</button>
              </div>
              {knowledgeDocs.length === 0 ? (
                <div className="text-center py-8 text-[#555] text-sm">No documents yet</div>
              ) : (
                <div className="space-y-1.5">
                  {knowledgeDocs.map((d, i) => (
                    <div key={i} className="flex items-start gap-2 p-2.5 bg-[#212121] border border-[#2a2a2a] rounded-lg">
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-[#ccc] font-medium">{d.title}</div>
                        <div className="text-[10px] text-[#666] mt-0.5 line-clamp-2">{d.content?.substring(0, 150)}...</div>
                      </div>
                      <button onClick={() => deleteKnowledge(d.id)} className="p-1 hover:bg-[#2a2a2a] rounded text-red-400"><Trash2 size={12} /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'scheduled' && (
            <div className="space-y-3">
              <div className="text-xs text-[#666]">Scheduled tasks ({scheduledTasks.length})</div>
              <div className="p-3 bg-[#212121] border border-[#2a2a2a] rounded-lg space-y-2">
                <div className="text-xs text-[#999]">Add Scheduled Task</div>
                <input value={newTask.name} onChange={e => setNewTask({ ...newTask, name: e.target.value })} placeholder="Task name" className="w-full px-2.5 py-1.5 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg text-xs text-white" />
                <textarea value={newTask.prompt} onChange={e => setNewTask({ ...newTask, prompt: e.target.value })} placeholder="What should MAX do?" rows={2}
                  className="w-full px-2.5 py-1.5 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg text-xs text-white resize-none" />
                <select value={newTask.schedule} onChange={e => setNewTask({ ...newTask, schedule: e.target.value })}
                  className="w-full px-2.5 py-1.5 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg text-xs text-white">
                  {SCHEDULE_PRESETS.map(p => <option key={p.id} value={p.cron}>{p.label}</option>)}
                </select>
                <button onClick={saveTask} disabled={!newTask.name || !newTask.prompt}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#FF6B35] hover:bg-[#e05a24] disabled:opacity-30 text-white rounded-lg text-xs"><Plus size={12} /> Schedule Task</button>
              </div>
              {scheduledTasks.length === 0 ? (
                <div className="text-center py-8 text-[#555] text-sm">No scheduled tasks yet</div>
              ) : (
                <div className="space-y-1.5">
                  {scheduledTasks.map((task, i) => (
                    <div key={i} className="flex items-start gap-2 p-2.5 bg-[#212121] border border-[#2a2a2a] rounded-lg">
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-[#ccc] font-medium">{task.name}</div>
                        <div className="text-[10px] text-[#666] mt-0.5 truncate">{task.task_prompt}</div>
                        <div className="text-[10px] text-[#555] mt-1">
                          {task.is_active ? '✅ Active' : '⏸ Paused'} · Last: {task.last_run_at || 'never'}
                        </div>
                      </div>
                      <button onClick={() => toggleTask(task.id, task.is_active)} className="p-1 text-[#FF6B35]">
                        {task.is_active ? <Pause size={12} /> : <Play size={12} />}
                      </button>
                      <button onClick={() => deleteTask(task.id)} className="p-1 text-red-400"><Trash2 size={12} /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'teams' && (
            <div className="space-y-3">
              <div className="text-xs text-[#666]">
                Teams ({teams.length}). Create a team to share conversations + knowledge with members.
              </div>

              {/* Create new team */}
              <div className="p-3 bg-[#212121] border border-[#2a2a2a] rounded-lg space-y-2">
                <div className="text-xs text-[#999]">Create New Team</div>
                <input value={newTeam.name} onChange={e => setNewTeam({ ...newTeam, name: e.target.value })}
                  placeholder="Team name (e.g. Dev Team)" className="w-full px-2.5 py-1.5 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg text-xs text-white" />
                <input value={newTeam.description} onChange={e => setNewTeam({ ...newTeam, description: e.target.value })}
                  placeholder="Description (optional)" className="w-full px-2.5 py-1.5 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg text-xs text-white" />
                <button onClick={createTeam} disabled={!newTeam.name}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#FF6B35] hover:bg-[#e05a24] disabled:opacity-30 text-white rounded-lg text-xs">
                  <Plus size={12} /> Create Team
                </button>
              </div>

              {/* Accept invite */}
              <div className="p-3 bg-[#212121] border border-[#2a2a2a] rounded-lg space-y-2">
                <div className="text-xs text-[#999]">Join Team with Invite Code</div>
                <div className="flex gap-2">
                  <input value={inviteCode} onChange={e => setInviteCode(e.target.value)}
                    placeholder="Paste invite code" className="flex-1 px-2.5 py-1.5 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg text-xs text-white font-mono" />
                  <button onClick={() => teams.length > 0 && acceptInvite(teams[0].id)}
                    disabled={!inviteCode || teams.length === 0}
                    className="px-3 py-1.5 bg-[#FF6B35] hover:bg-[#e05a24] disabled:opacity-30 text-white rounded-lg text-xs">
                    Join
                  </button>
                </div>
                {teams.length === 0 && <p className="text-[10px] text-[#555]">Create a team first, then accept invites.</p>}
              </div>

              {/* Invite result */}
              {inviteResult && (
                <div className="p-2 bg-[#212121] border border-[#2a2a2a] rounded-lg text-xs text-[#FF6B35] break-all">
                  {inviteResult}
                </div>
              )}

              {/* List teams */}
              {teams.length === 0 ? (
                <div className="text-center py-8 text-[#555] text-sm">No teams yet</div>
              ) : (
                <div className="space-y-2">
                  {teams.map((team, i) => (
                    <div key={i} className="p-3 bg-[#212121] border border-[#2a2a2a] rounded-lg">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <Users size={14} className="text-[#FF6B35]" />
                          <span className="text-sm text-white font-medium">{team.name}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                            team.role === 'owner' ? 'bg-[#FF6B35]/20 text-[#FF6B35]' : 'bg-[#2a2a2a] text-[#888]'
                          }`}>{team.role || 'member'}</span>
                        </div>
                        {team.role !== 'owner' && (
                          <button onClick={() => leaveTeam(team.id, user.id)}
                            className="text-xs text-red-400 hover:underline">Leave</button>
                        )}
                      </div>
                      {team.description && <p className="text-[10px] text-[#666] mb-2">{team.description}</p>}

                      {/* Invite member (owner only) */}
                      {team.role === 'owner' && (
                        <div className="flex gap-2 mt-2">
                          <input value={inviteEmail} onChange={e => setInviteEmail(e.target.value)}
                            placeholder="Email to invite" type="email"
                            className="flex-1 px-2 py-1 bg-[#1a1a1a] border border-[#2a2a2a] rounded text-xs text-white" />
                          <button onClick={() => inviteMember(team.id)}
                            disabled={!inviteEmail}
                            className="px-2 py-1 bg-[#FF6B35] hover:bg-[#e05a24] disabled:opacity-30 text-white rounded text-xs">
                            Invite
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'analytics' && (
            <div className="space-y-4">
              {analytics ? (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <StatCard label="Today" value={analytics.stats?.dailyCount || 0} />
                    <StatCard label="This Hour" value={analytics.stats?.hourlyCount || 0} />
                    <StatCard label="This Month" value={analytics.stats?.monthlyCount || 0} />
                    <StatCard label="Tier" value={analytics.tier || 'free'} />
                  </div>
                  <div>
                    <div className="text-xs text-[#666] mb-2">Rate Limits</div>
                    <div className="p-3 bg-[#212121] border border-[#2a2a2a] rounded-lg text-xs text-[#ccc] space-y-1">
                      <div>Hourly: {analytics.limits?.requestsPerHour} requests</div>
                      <div>Daily: {analytics.limits?.requestsPerDay} requests</div>
                      <div>Max iterations/task: {analytics.limits?.maxIterations}</div>
                      <div>Max files/day: {analytics.limits?.maxFilesPerDay}</div>
                    </div>
                  </div>
                  {analytics.stats?.breakdown && Object.keys(analytics.stats.breakdown).length > 0 && (
                    <div>
                      <div className="text-xs text-[#666] mb-2">Event breakdown (today)</div>
                      <div className="space-y-1">
                        {Object.entries(analytics.stats.breakdown).map(([type, count]: [string, any]) => (
                          <div key={type} className="flex justify-between p-2 bg-[#212121] rounded text-xs text-[#ccc]">
                            <span>{type}</span><span>{count}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : <div className="text-center py-8 text-[#555] text-sm">Loading analytics...</div>}
            </div>
          )}

          {tab === 'about' && (
            <div className="space-y-4">
              <div>
                <div className="text-sm text-[#ccc] font-medium">MAX AI Agent v4.0</div>
                <div className="text-xs text-[#666] mt-1">Production-grade autonomous agent platform. Next.js frontend + Express backend.</div>
              </div>
              <a href="https://github.com/amiahaking-wq/Maxxxxx" target="_blank" rel="noreferrer"
                className="text-xs text-[#FF6B35] hover:underline flex items-center gap-1">
                <ExternalLink size={12} /> View source on GitHub
              </a>
              <div className="pt-4 border-t border-[#2a2a2a] space-y-1 text-[10px] text-[#555]">
                <div>• Next.js 14 (App Router) + TypeScript + Tailwind</div>
                <div>• Express + Node.js backend (unchanged)</div>
                <div>• OpenRouter free models (auto-routing)</div>
                <div>• Supabase for persistence + Storage</div>
                <div>• Upstash Redis for rate limiting</div>
                <div>• Multi-language UI (EN/Pidgin/Hausa/Yoruba/FR)</div>
                <div>• Scheduled tasks with node-cron</div>
                <div>• Voice input (Web Speech API)</div>
                <div>• PWA installable with offline shell</div>
                <div>• Computer Use: screenshots + vision + click/type (Phase 11)</div>
                <div>• Graph RAG: Apache AGE + pgvector hybrid search (Phase 12)</div>
                <div>• Multiplayer rooms: create teams, invite members (Phase 13)</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="block text-xs text-[#666] mb-1.5">{label}</label>
      <input type="text" value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full px-3 py-2 bg-[#212121] border border-[#2a2a2a] rounded-lg text-sm text-white placeholder-[#555] focus:outline-none focus:border-[#FF6B35]/30" />
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: any }) {
  return (
    <div className="p-3 bg-[#212121] border border-[#2a2a2a] rounded-lg">
      <div className="text-[10px] text-[#666] uppercase tracking-wider">{label}</div>
      <div className="text-xl font-bold text-white mt-1">{value}</div>
    </div>
  );
}
