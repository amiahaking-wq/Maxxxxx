import { useNexusStore } from '@/store/nexusStore';
import {
  Palette,
  Code,
  Bot,
  Save,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export function SettingsPanel() {
  const { settings, updateSettings } = useNexusStore();

  return (
    <div className="flex flex-col h-full bg-[#0f0f1a] overflow-hidden">
      {/* Header */}
      <div className="h-10 flex items-center px-3 border-b border-[#2a2a3e]">
        <span className="text-xs font-semibold text-[#e0e0e0] uppercase tracking-wider">Settings</span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Appearance */}
        <Section title="Appearance" icon={Palette}>
          <div className="space-y-3">
            <div>
              <label className="text-[10px] text-[#6b6b8d] block mb-1">Theme</label>
              <div className="flex gap-2">
                {(['dark', 'light', 'system'] as const).map((theme) => (
                  <button
                    key={theme}
                    onClick={() => updateSettings({ theme })}
                    className={cn(
                      'px-3 py-1.5 rounded text-xs capitalize border transition-all',
                      settings.theme === theme
                        ? 'bg-[#6c5ce7]/20 border-[#6c5ce7] text-[#6c5ce7]'
                        : 'bg-[#1a1a2e] border-[#2a2a3e] text-[#a0a0c0] hover:border-[#3a3a4e]'
                    )}
                  >
                    {theme}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Section>

        {/* Editor */}
        <Section title="Editor" icon={Code}>
          <div className="space-y-3">
            <SettingRow label="Font Size">
              <div className="flex items-center gap-2">
                <input
                  type="range" min={10} max={24} value={settings.fontSize}
                  onChange={(e) => updateSettings({ fontSize: Number(e.target.value) })}
                  className="w-20 accent-[#6c5ce7]"
                />
                <span className="text-[10px] text-[#a0a0c0] w-4">{settings.fontSize}</span>
              </div>
            </SettingRow>
            <SettingRow label="Font Family">
              <select
                value={settings.fontFamily}
                onChange={(e) => updateSettings({ fontFamily: e.target.value })}
                className="bg-[#1a1a2e] border border-[#2a2a3e] rounded px-2 py-1 text-[10px] text-[#e0e0e0] outline-none"
              >
                <option>JetBrains Mono</option>
                <option>Fira Code</option>
                <option>Source Code Pro</option>
                <option>Cascadia Code</option>
              </select>
            </SettingRow>
            <SettingRow label="Tab Size">
              <select
                value={settings.tabSize}
                onChange={(e) => updateSettings({ tabSize: Number(e.target.value) })}
                className="bg-[#1a1a2e] border border-[#2a2a3e] rounded px-2 py-1 text-[10px] text-[#e0e0e0] outline-none"
              >
                <option value={2}>2 spaces</option>
                <option value={4}>4 spaces</option>
                <option value={8}>8 spaces</option>
              </select>
            </SettingRow>
            <ToggleRow label="Word Wrap" value={settings.wordWrap} onChange={(v) => updateSettings({ wordWrap: v })} />
            <ToggleRow label="Minimap" value={settings.minimap} onChange={(v) => updateSettings({ minimap: v })} />
            <ToggleRow label="Line Numbers" value={settings.lineNumbers} onChange={(v) => updateSettings({ lineNumbers: v })} />
          </div>
        </Section>

        {/* AI */}
        <Section title="AI Integration" icon={Bot}>
          <div className="space-y-3">
            <SettingRow label="Provider">
              <select
                value={settings.aiProvider}
                onChange={(e) => updateSettings({ aiProvider: e.target.value as 'openai' | 'anthropic' | 'groq' | 'gemini' })}
                className="bg-[#1a1a2e] border border-[#2a2a3e] rounded px-2 py-1 text-[10px] text-[#e0e0e0] outline-none"
              >
                <option value="groq">Groq</option>
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
                <option value="gemini">Google Gemini</option>
              </select>
            </SettingRow>
            <SettingRow label="Model">
              <select
                value={settings.aiModel}
                onChange={(e) => updateSettings({ aiModel: e.target.value })}
                className="bg-[#1a1a2e] border border-[#2a2a3e] rounded px-2 py-1 text-[10px] text-[#e0e0e0] outline-none"
              >
                <option value="llama-3.1-70b">Llama 3.1 70B</option>
                <option value="llama-3.1-8b">Llama 3.1 8B</option>
                <option value="mixtral-8x7b">Mixtral 8x7B</option>
                <option value="gpt-4">GPT-4</option>
                <option value="claude-3">Claude 3</option>
                <option value="gemini-pro">Gemini Pro</option>
              </select>
            </SettingRow>
            <SettingRow label="API Key">
              <input
                type="password"
                placeholder="Enter API key..."
                className="bg-[#1a1a2e] border border-[#2a2a3e] rounded px-2 py-1 text-[10px] text-[#e0e0e0] placeholder-[#4a4a6a] outline-none w-32"
              />
            </SettingRow>
          </div>
        </Section>

        {/* Files */}
        <Section title="Files" icon={Save}>
          <div className="space-y-3">
            <ToggleRow label="Auto Save" value={settings.autoSave} onChange={(v) => updateSettings({ autoSave: v })} />
            <SettingRow label="Auto Save Interval">
              <div className="flex items-center gap-2">
                <input
                  type="range" min={5000} max={120000} step={5000} value={settings.autoSaveInterval}
                  onChange={(e) => updateSettings({ autoSaveInterval: Number(e.target.value) })}
                  className="w-20 accent-[#6c5ce7]"
                />
                <span className="text-[10px] text-[#a0a0c0]">{settings.autoSaveInterval / 1000}s</span>
              </div>
            </SettingRow>
            <ToggleRow label="Format on Save" value={settings.formatOnSave} onChange={(v) => updateSettings({ formatOnSave: v })} />
          </div>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Icon size={14} className="text-[#6c5ce7]" />
        <h3 className="text-xs font-medium text-[#e0e0e0]">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px] text-[#a0a0c0]">{label}</span>
      {children}
    </div>
  );
}

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px] text-[#a0a0c0]">{label}</span>
      <button
        onClick={() => onChange(!value)}
        className={cn(
          'w-8 h-4 rounded-full transition-all relative',
          value ? 'bg-[#6c5ce7]' : 'bg-[#2a2a3e]'
        )}
      >
        <div
          className={cn(
            'absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all',
            value ? 'left-[18px]' : 'left-0.5'
          )}
        />
      </button>
    </div>
  );
}
