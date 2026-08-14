'use client';
import { ConversationList } from './ConversationList';
import { useApp } from './AppProvider';

export function ConversationListContainer() {
  const {
    searchQuery,
    currentConversationId,
    setCurrentConversationId,
    conversations,
  } = useApp();

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
