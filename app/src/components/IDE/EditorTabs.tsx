import { useNexusStore } from '@/store/nexusStore';
import { X, FileCode, FileJson, FileType, FileImage, Film, Music } from 'lucide-react';
import { cn } from '@/lib/utils';

const fileIcons: Record<string, React.ElementType> = {
  typescript: FileCode,
  javascript: FileCode,
  json: FileJson,
  css: FileType,
  html: FileType,
  markdown: FileType,
  image: FileImage,
  video: Film,
  audio: Music,
};

export function EditorTabs() {
  const { tabs, activeTabId, setActiveTab, closeTab } = useNexusStore();

  if (tabs.length === 0) return null;

  return (
    <div className="h-9 bg-[#16162a] flex items-end overflow-x-auto scrollbar-hide border-b border-[#2a2a3e]">
      {tabs.map((tab) => {
        const Icon = fileIcons[tab.language] || FileCode;
        const isActive = tab.id === activeTabId;
        return (
          <div
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'group flex items-center gap-2 px-3 h-8 min-w-[120px] max-w-[200px] cursor-pointer border-r border-[#2a2a3e] transition-all relative',
              isActive
                ? 'bg-[#0f0f1a] text-[#e0e0e0]'
                : 'bg-[#16162a] text-[#6b6b8d] hover:bg-[#1e1e32] hover:text-[#a0a0c0]'
            )}
          >
            {isActive && (
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-[#6c5ce7]" />
            )}
            <Icon size={14} className={cn('shrink-0', isActive ? 'text-[#6c5ce7]' : 'text-[#6b6b8d]')} />
            <span className="text-xs truncate flex-1">{tab.name}</span>
            {tab.isModified && (
              <span className="w-2 h-2 rounded-full bg-[#fdcb6e] shrink-0" />
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                closeTab(tab.id);
              }}
              className={cn(
                'opacity-0 group-hover:opacity-100 hover:bg-[#2a2a3e] rounded p-0.5 transition-all',
                isActive && 'opacity-100'
              )}
            >
              <X size={12} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
