import { useNexusStore } from '@/store/nexusStore';
import {
  MessageSquare,
  Image,
  Film,
  Music,
  Terminal,
  GitBranch,
  FileCode,
  Sparkles,
  Zap,
  Shield,
} from 'lucide-react';

export function WelcomeScreen() {
  const { setActiveView, toggleSidebar } = useNexusStore();

  const quickActions = [
    { icon: MessageSquare, label: 'AI Chat', view: 'chat' as const, desc: 'Chat with AI assistants', color: '#6c5ce7' },
    { icon: FileCode, label: 'New File', action: () => {}, desc: 'Create a new file', color: '#00cec9' },
    { icon: Image, label: 'Image Studio', view: 'image' as const, desc: 'Edit & generate images', color: '#fd79a8' },
    { icon: Film, label: 'Video Studio', view: 'video' as const, desc: 'Edit videos & motion graphics', color: '#e17055' },
    { icon: Music, label: 'Audio Studio', view: 'audio' as const, desc: 'Edit audio & sound design', color: '#00b894' },
    { icon: Terminal, label: 'Terminal', view: 'terminal' as const, desc: 'Command line interface', color: '#636e72' },
    { icon: GitBranch, label: 'Git', view: 'git' as const, desc: 'Source control management', color: '#e84393' },
  ];

  const recentFiles = [
    'src/components/App.tsx',
    'src/store/nexusStore.ts',
    'src/components/IDE/CodeEditor.tsx',
    'package.json',
  ];

  const handleQuickAction = (action: typeof quickActions[0]) => {
    if ('view' in action && action.view) {
      setActiveView(action.view);
      toggleSidebar();
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center bg-[#0f0f1a] overflow-auto">
      <div className="max-w-2xl w-full px-8 py-12">
        {/* Logo & Title */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-[#6c5ce7] to-[#a855f7] mb-4 shadow-lg shadow-[#6c5ce7]/20">
            <Sparkles size={32} className="text-white" />
          </div>
          <h1 className="text-3xl font-bold text-[#e0e0e0] mb-2">Welcome to NEXUS</h1>
          <p className="text-[#6b6b8d] text-sm">
            Neural Execution & Unified Studio — Your AI-powered creative environment
          </p>
        </div>

        {/* Quick Actions */}
        <div className="mb-10">
          <h2 className="text-xs font-semibold text-[#6b6b8d] uppercase tracking-wider mb-3">Quick Actions</h2>
          <div className="grid grid-cols-2 gap-2">
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.label}
                  onClick={() => handleQuickAction(action)}
                  className="flex items-center gap-3 p-3 rounded-lg bg-[#1a1a2e] border border-[#2a2a3e] hover:border-[#3a3a4e] hover:bg-[#20203a] transition-all group text-left"
                >
                  <div
                    className="w-8 h-8 rounded-md flex items-center justify-center shrink-0"
                    style={{ backgroundColor: `${action.color}15` }}
                  >
                    <Icon size={16} style={{ color: action.color }} />
                  </div>
                  <div>
                    <div className="text-[#e0e0e0] text-sm font-medium">{action.label}</div>
                    <div className="text-[#6b6b8d] text-xs">{action.desc}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Recent Files */}
        <div className="mb-10">
          <h2 className="text-xs font-semibold text-[#6b6b8d] uppercase tracking-wider mb-3">Recent Files</h2>
          <div className="space-y-1">
            {recentFiles.map((file) => (
              <button
                key={file}
                className="w-full flex items-center gap-3 p-2.5 rounded-lg bg-[#1a1a2e] border border-[#2a2a3e] hover:border-[#3a3a4e] hover:bg-[#20203a] transition-all text-left group"
              >
                <FileCode size={16} className="text-[#00cec9]" />
                <span className="text-[#a0a0c0] text-sm group-hover:text-[#e0e0e0] transition-colors">{file}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Features */}
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center p-4 rounded-lg bg-[#1a1a2e] border border-[#2a2a3e]">
            <Zap size={20} className="text-[#fdcb6e] mx-auto mb-2" />
            <div className="text-[#e0e0e0] text-xs font-medium">Lightning Fast</div>
            <div className="text-[#6b6b8d] text-xs mt-1">Built for speed</div>
          </div>
          <div className="text-center p-4 rounded-lg bg-[#1a1a2e] border border-[#2a2a3e]">
            <Shield size={20} className="text-[#00cec9] mx-auto mb-2" />
            <div className="text-[#e0e0e0] text-xs font-medium">Privacy First</div>
            <div className="text-[#6b6b8d] text-xs mt-1">Local processing</div>
          </div>
          <div className="text-center p-4 rounded-lg bg-[#1a1a2e] border border-[#2a2a3e]">
            <Sparkles size={20} className="text-[#6c5ce7] mx-auto mb-2" />
            <div className="text-[#e0e0e0] text-xs font-medium">AI Powered</div>
            <div className="text-[#6b6b8d] text-xs mt-1">Smart assistance</div>
          </div>
        </div>
      </div>
    </div>
  );
}
