'use client';
import { MessageSquare, Plus, Settings as SettingsIcon, LogOut, X } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useTranslation } from 'react-i18next';

interface Conversation {
  id: string;
  title: string;
  messages: any[];
  createdAt: Date;
  updatedAt: Date;
}

interface SidebarProps {
  open: boolean;
  conversations: Conversation[];
  activeId: string | null;
  user: any;
  onSelect: (id: string) => void;
  onNew: () => void;
  onSettings: () => void;
  onLogout: () => void;
}

export function Sidebar({ open, conversations, activeId, user, onSelect, onNew, onSettings, onLogout }: SidebarProps) {
  const { t } = useTranslation('common');

  const grouped = {
    Today: conversations.filter(c => new Date(c.updatedAt).toDateString() === new Date().toDateString()),
    Yesterday: conversations.filter(c => {
      const d = new Date(c.updatedAt);
      const y = new Date(); y.setDate(y.getDate() - 1);
      return d.toDateString() === y.toDateString();
    }),
    Older: conversations.filter(c => {
      const d = new Date(c.updatedAt);
      const y = new Date(); y.setDate(y.getDate() - 1);
      return d < y;
    }).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
  };

  return (
    <div className={`fixed md:relative inset-y-0 left-0 z-50 w-64 bg-[#111111] border-r border-[#1e1e1e] flex flex-col transition-transform duration-200 ${open ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
      <div className="flex items-center justify-between p-4 border-b border-[#1e1e1e]">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-[#FF6B35] rounded-md flex items-center justify-center">
            <span className="text-white font-bold text-xs">M</span>
          </div>
          <span className="font-semibold text-white text-sm">MAX</span>
        </div>
        <button onClick={onNew} className="p-1.5 text-[#555] hover:text-white hover:bg-[#1e1e1e] rounded-lg">
          <Plus size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-4">
        {Object.entries(grouped).map(([group, convs]) => (
          convs.length > 0 && (
            <div key={group}>
              <p className="text-[10px] text-[#444] uppercase tracking-wider px-2 mb-1">{group}</p>
              {convs.map(conv => (
                <button key={conv.id} onClick={() => onSelect(conv.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm truncate transition-colors ${
                    conv.id === activeId ? 'bg-[#1e1e1e] text-white' : 'text-[#888] hover:text-white hover:bg-[#1a1a1a]'
                  }`}>
                  {conv.title || 'New conversation'}
                </button>
              ))}
            </div>
          )
        ))}
        {conversations.length === 0 && (
          <div className="text-center py-8 text-[#444] text-xs">No conversations yet</div>
        )}
      </div>

      <div className="p-3 border-t border-[#1e1e1e] space-y-1">
        <button onClick={onSettings}
          className="w-full flex items-center gap-3 px-3 py-2 text-sm text-[#888] hover:text-white hover:bg-[#1e1e1e] rounded-lg">
          <SettingsIcon size={15} /> {t('settings')}
        </button>
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="w-7 h-7 bg-[#FF6B35] rounded-full flex items-center justify-center text-white text-xs font-bold">
            {user?.name?.[0]?.toUpperCase() || 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-white truncate">{user?.name}</p>
            <p className="text-[10px] text-[#555] truncate">{user?.email}</p>
          </div>
          <button onClick={onLogout} className="text-[#555] hover:text-red-400">
            <LogOut size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
