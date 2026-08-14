'use client';
import { useState, useEffect, useCallback } from 'react';
import { Conversation } from '@/app/lib/types';
import { conversationsApi } from '@/app/lib/api';

export function useConversations() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await conversationsApi.list();
      const mapped: Conversation[] = (res.conversations || []).map(c => ({
        id: c.id,
        title: c.title || 'Untitled',
        updatedAt: c.updated_at,
        createdAt: c.created_at,
        platform: c.platform,
        messageCount: c.message_count,
      }));
      // Sort by updatedAt descending
      mapped.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      setConversations(mapped);
    } catch (e: any) {
      // If the endpoint fails (e.g. no auth), silently start empty
      setError(e.message);
      setConversations([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const create = useCallback(async (title = 'New Chat'): Promise<string | null> => {
    try {
      const res = await conversationsApi.create(title);
      const newConv = res.conversations?.[0] || (res as any).conversation;
      if (newConv?.id) {
        const conv: Conversation = {
          id: newConv.id,
          title: newConv.title || title,
          updatedAt: newConv.updated_at || new Date().toISOString(),
          createdAt: newConv.created_at,
          platform: newConv.platform,
        };
        setConversations(prev => [conv, ...prev]);
        return newConv.id;
      }
      return null;
    } catch (e: any) {
      setError(e.message);
      return null;
    }
  }, []);

  const rename = useCallback(async (id: string, title: string) => {
    // Optimistic update
    setConversations(prev => prev.map(c => c.id === id ? { ...c, title } : c));
    try {
      await conversationsApi.rename(id, title);
    } catch (e: any) {
      // Revert on failure — refresh from server
      refresh();
      setError(e.message);
    }
  }, [refresh]);

  const remove = useCallback(async (id: string) => {
    // Optimistic
    const prev = conversations;
    setConversations(prev => prev.filter(c => c.id !== id));
    try {
      await conversationsApi.delete(id);
    } catch (e: any) {
      setConversations(prev);
      setError(e.message);
    }
  }, [conversations]);

  // Load on mount
  useEffect(() => {
    refresh();
  }, [refresh]);

  return { conversations, loading, error, refresh, create, rename, remove };
}
