'use client';
import { createContext, useContext, useState, ReactNode, useCallback } from 'react';
import { useConversations } from '@/app/hooks/useConversations';
import { CustomGPT } from '@/app/lib/types';

interface AppState {
  // Sidebar
  sidebarCollapsed: boolean;
  // Mobile sidebar drawer
  mobileSidebarOpen: boolean;
  // Current conversation
  currentConversationId: string | null;
  // Search
  searchQuery: string;
  // Conversations
  conversations: ReturnType<typeof useConversations>;
  // Active GPT (when using a custom GPT)
  activeGpt: CustomGPT | null;
}

interface AppActions {
  toggleSidebar: () => void;
  setSidebarCollapsed: (v: boolean) => void;
  setMobileSidebarOpen: (v: boolean) => void;
  setCurrentConversationId: (id: string | null) => void;
  setSearchQuery: (q: string) => void;
  setActiveGpt: (gpt: CustomGPT | null) => void;
}

const AppContext = createContext<(AppState & AppActions) | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeGpt, setActiveGpt] = useState<CustomGPT | null>(null);
  const conversations = useConversations();

  const toggleSidebar = useCallback(() => setSidebarCollapsed(v => !v), []);

  return (
    <AppContext.Provider value={{
      sidebarCollapsed,
      mobileSidebarOpen,
      currentConversationId,
      searchQuery,
      conversations,
      activeGpt,
      toggleSidebar,
      setSidebarCollapsed,
      setMobileSidebarOpen,
      setCurrentConversationId,
      setSearchQuery,
      setActiveGpt,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
