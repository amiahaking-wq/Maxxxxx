import {
  Files,
  Search,
  GitBranch,
  Blocks,
  MessageSquare,
  Image,
  Film,
  Music,
  Terminal,
  Settings,
} from 'lucide-react';
import { useNexusStore } from '@/store/nexusStore';
import type { ViewType } from '@/types';
import { cn } from '@/lib/utils';

const activities: { id: ViewType; icon: React.ElementType; label: string }[] = [
  { id: 'explorer', icon: Files, label: 'Explorer' },
  { id: 'search', icon: Search, label: 'Search' },
  { id: 'git', icon: GitBranch, label: 'Source Control' },
  { id: 'extensions', icon: Blocks, label: 'Extensions' },
  { id: 'chat', icon: MessageSquare, label: 'AI Chat' },
  { id: 'image', icon: Image, label: 'Image Studio' },
  { id: 'video', icon: Film, label: 'Video Studio' },
  { id: 'audio', icon: Music, label: 'Audio Studio' },
  { id: 'terminal', icon: Terminal, label: 'Terminal' },
];

export function ActivityBar() {
  const { activeView, setActiveView, sidebarVisible, toggleSidebar } = useNexusStore();

  const handleClick = (view: ViewType) => {
    if (activeView === view) {
      toggleSidebar();
    } else {
      setActiveView(view);
      if (!sidebarVisible) toggleSidebar();
    }
  };

  return (
    <div className="w-12 bg-[#1a1a2e] border-r border-[#2a2a3e] flex flex-col items-center py-2 z-50">
      <div className="flex-1 flex flex-col gap-1">
        {activities.map((activity) => {
          const Icon = activity.icon;
          const isActive = activeView === activity.id && sidebarVisible;
          return (
            <button
              key={activity.id}
              onClick={() => handleClick(activity.id)}
              className={cn(
                'relative w-10 h-10 flex items-center justify-center rounded-md transition-all duration-150 group',
                isActive
                  ? 'text-[#6c5ce7] bg-[#6c5ce7]/10'
                  : 'text-[#6b6b8d] hover:text-[#a0a0c0] hover:bg-[#2a2a3e]'
              )}
              title={activity.label}
            >
              <Icon size={22} strokeWidth={1.8} />
              {isActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-6 bg-[#6c5ce7] rounded-r-full" />
              )}
              <div className="absolute left-full ml-2 px-2 py-1 bg-[#2a2a3e] text-[#e0e0e0] text-xs rounded-md opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 border border-[#3a3a4e] shadow-lg transition-opacity">
                {activity.label}
              </div>
            </button>
          );
        })}
      </div>
      <div className="pb-2">
        <button
          onClick={() => handleClick('settings')}
          className={cn(
            'w-10 h-10 flex items-center justify-center rounded-md transition-all duration-150 group',
            activeView === 'settings' && sidebarVisible
              ? 'text-[#6c5ce7] bg-[#6c5ce7]/10'
              : 'text-[#6b6b8d] hover:text-[#a0a0c0] hover:bg-[#2a2a3e]'
          )}
          title="Settings"
        >
          <Settings size={20} strokeWidth={1.8} />
        </button>
      </div>
    </div>
  );
}
