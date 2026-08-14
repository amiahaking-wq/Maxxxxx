'use client';
import { useApp } from './AppProvider';
import { cn } from '@/app/lib/utils';
import { SidebarHeader } from './SidebarHeader';
import { ConversationList } from './ConversationList';
import { SidebarFooter } from './SidebarFooter';
import { MyGptsPanel } from './MyGptsPanel';
import { TeamsPanel } from './TeamsPanel';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';
import { PenSquare, Search, X } from 'lucide-react';
import { ConversationListContainer } from './ConversationListContainer';
import { useState } from 'react';

export function Sidebar() {
  const { sidebarCollapsed, mobileSidebarOpen, setMobileSidebarOpen } = useApp();
  const [gptsOpen, setGptsOpen] = useState(false);
  const [teamsOpen, setTeamsOpen] = useState(false);

  return (
    <>
      {/* Mobile drawer */}
      <div
        className={cn(
          'fixed inset-y-0 left-0 z-40 w-[260px] transform border-r border-cg-border bg-cg-sidebar transition-transform duration-200 md:hidden',
          mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <SidebarContent onOpenGpts={() => setGptsOpen(true)} onOpenTeams={() => setTeamsOpen(true)} />
        <button
          onClick={() => setMobileSidebarOpen(false)}
          className="absolute right-3 top-3 rounded-md p-1 text-cg-muted hover:bg-cg-hover hover:text-cg-text"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Desktop sidebar */}
      <aside
        className={cn(
          'hidden md:flex md:flex-col md:border-r md:border-cg-border md:bg-cg-sidebar md:transition-all md:duration-200',
          sidebarCollapsed ? 'md:w-0 md:overflow-hidden' : 'md:w-[260px]'
        )}
      >
        <SidebarContent onOpenGpts={() => setGptsOpen(true)} onOpenTeams={() => setTeamsOpen(true)} />
      </aside>

      <MyGptsPanel open={gptsOpen} onClose={() => setGptsOpen(false)} />
      <TeamsPanel open={teamsOpen} onClose={() => setTeamsOpen(false)} />
    </>
  );
}

function SidebarContent({ onOpenGpts, onOpenTeams }: { onOpenGpts: () => void; onOpenTeams: () => void }) {
  const { sidebarCollapsed, toggleSidebar, setCurrentConversationId, searchQuery, setSearchQuery, conversations } = useApp();

  const handleNewChat = async () => {
    const newId = await conversations.create('New Chat');
    if (newId) setCurrentConversationId(newId);
    else setCurrentConversationId(null);
  };

  return (
    <div className="flex h-full flex-col">
      <SidebarHeader collapsed={sidebarCollapsed} onToggle={toggleSidebar} />

      <WorkspaceSwitcher />

      <div className="px-2 py-2">
        <button
          onClick={handleNewChat}
          className="flex w-full items-center justify-between rounded-lg border border-cg-border px-3 py-2.5 text-sm font-medium text-cg-text hover:bg-cg-hover"
        >
          <span className="flex items-center gap-2">
            <PenSquare className="h-4 w-4" />
            New chat
          </span>
        </button>
      </div>

      <div className="px-2 pb-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cg-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search chats"
            className="w-full rounded-lg border border-cg-border bg-transparent py-2 pl-9 pr-3 text-sm text-cg-text placeholder:text-cg-muted focus:border-cg-accent focus:outline-none focus:ring-1 focus:ring-cg-accent"
          />
        </div>
      </div>

      <ConversationListContainer />

      <SidebarFooter onOpenGpts={onOpenGpts} onOpenTeams={onOpenTeams} />
    </div>
  );
}
