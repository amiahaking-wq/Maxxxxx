'use client';
import { ConversationList } from './ConversationList';
import { useApp } from './AppProvider';

const MOCK_CONVERSATIONS = [
  { id: '1', title: 'How to center a div', updatedAt: new Date(Date.now() - 1000 * 60 * 30).toISOString() },
  { id: '2', title: 'React useEffect cleanup', updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString() },
  { id: '3', title: 'TypeScript generics help', updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 26).toISOString() },
  { id: '4', title: 'SQL join optimization', updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3).toISOString() },
  { id: '5', title: 'Old project — Docker setup', updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 45).toISOString() },
];

export function ConversationListContainer() {
  const { searchQuery, currentConversationId, setCurrentConversationId } = useApp();

  const filtered = MOCK_CONVERSATIONS.filter(c =>
    c.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <ConversationList
      conversations={filtered}
      currentId={currentConversationId}
      onSelect={setCurrentConversationId}
    />
  );
}
