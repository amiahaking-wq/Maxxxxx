'use client';
import { Conversation } from '@/app/lib/types';
import { groupConversationsByDate } from '@/app/lib/utils';
import { ConversationItem } from './ConversationItem';

interface Props {
  conversations: Conversation[];
  currentId: string | null;
  onSelect: (id: string) => void;
  onRename?: (id: string, newTitle: string) => void;
  onDelete?: (id: string) => void;
}

export function ConversationList({ conversations, currentId, onSelect, onRename, onDelete }: Props) {
  if (conversations.length === 0) {
    return (
      <div className="flex-1 px-3 py-8 text-center text-sm text-cg-muted">
        No conversations found
      </div>
    );
  }

  const groups = groupConversationsByDate(conversations);

  return (
    <nav className="flex-1 overflow-y-auto px-2 py-1">
      {groups.map(group => (
        <div key={group.label} className="mb-3">
          <div className="px-3 py-1 text-xs font-semibold text-cg-muted">{group.label}</div>
          {group.items.map(conv => (
            <ConversationItem
              key={conv.id}
              conversation={conv}
              isActive={conv.id === currentId}
              onSelect={() => onSelect(conv.id)}
              onRename={onRename ? (newTitle) => onRename(conv.id, newTitle) : undefined}
              onDelete={onDelete ? () => onDelete(conv.id) : undefined}
            />
          ))}
        </div>
      ))}
    </nav>
  );
}
