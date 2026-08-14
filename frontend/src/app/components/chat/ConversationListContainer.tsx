'use client';
import { useState, useEffect } from 'react';
import { ConversationList } from './ConversationList';
import { useApp } from './AppProvider';
import { Conversation } from '@/app/lib/types';

export function ConversationListContainer() {
  const {
    searchQuery,
    currentConversationId,
    setCurrentConversationId,
    conversations,
    activeWorkspace,
  } = useApp();

  // If a team workspace is active, load team conversations instead
  const [teamConversations, setTeamConversations] = useState<Conversation[]>([]);
  const [teamLoading, setTeamLoading] = useState(false);

  useEffect(() => {
    if (!activeWorkspace) {
      setTeamConversations([]);
      return;
    }
    setTeamLoading(true);
    const token = typeof window !== 'undefined' ? localStorage.getItem('max_token') : null;
    fetch(`/api/teams/${activeWorkspace.id}/conversations`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => r.json())
      .then(data => {
        const mapped: Conversation[] = (data.conversations || []).map((c: any) => ({
          id: c.conversationId,
          title: c.conversationTitle || 'Shared conversation',
          updatedAt: c.updatedAt || c.createdAt,
        }));
        setTeamConversations(mapped);
      })
      .catch(() => setTeamConversations([]))
      .finally(() => setTeamLoading(false));
  }, [activeWorkspace]);

  if (activeWorkspace) {
    // Team workspace view
    const filtered = teamConversations.filter(c =>
      c.title.toLowerCase().includes(searchQuery.toLowerCase())
    );
    return (
      <ConversationList
        conversations={filtered}
        currentId={currentConversationId}
        onSelect={setCurrentConversationId}
        loading={teamLoading}
      />
    );
  }

  // Personal workspace view (default)
  const { conversations: list, rename, remove, loading } = conversations;
  const filtered = list.filter(c =>
    c.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <ConversationList
      conversations={filtered}
      currentId={currentConversationId}
      onSelect={setCurrentConversationId}
      onRename={(id, newTitle) => rename(id, newTitle)}
      onDelete={(id) => remove(id)}
      loading={loading}
    />
  );
}
