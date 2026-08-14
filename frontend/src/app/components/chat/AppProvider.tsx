'use client';
import { createContext, useContext, useState, ReactNode, useCallback } from 'react';

interface AppState {
  // Sidebar
  sidebarCollapsed: boolean;
  // Mobile sidebar drawer
  mobileSidebarOpen: boolean;
  // Current conversation
  currentConversationId: string | null;
  // Search
  searchQuery: string;
}

interface AppActions {
  toggleSidebar: () => void;
  setSidebarCollapsed: (v: boolean) => void;
  setMobileSidebarOpen: (v: boolean) => void;
  setCurrentConversationId: (id: string | null) => void;
  setSearchQuery: (q: string) => void;
}

const AppContext = createContext<(AppState & AppActions) | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const toggleSidebar = useCallback(() => setSidebarCollapsed(v => !v), []);

  return (
    <AppContext.Provider value={{
      sidebarCollapsed,
      mobileSidebarOpen,
      currentConversationId,
      searchQuery,
      toggleSidebar,
      setSidebarCollapsed,
      setMobileSidebarOpen,
      setCurrentConversationId,
      setSearchQuery,
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
