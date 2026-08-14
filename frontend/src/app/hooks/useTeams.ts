'use client';
import { useState, useEffect, useCallback } from 'react';
import { Team } from '@/app/lib/types';

export function useTeams() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('max_token') : null;
      const res = await fetch('/api/teams', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setTeams(data.teams || []);
      }
    } catch {}
    setLoading(false);
  }, []);

  const create = useCallback(async (name: string, description?: string): Promise<Team | null> => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('max_token') : null;
      const res = await fetch('/api/teams', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ name, description }),
      });
      if (!res.ok) throw new Error('Failed to create team');
      const data = await res.json();
      await refresh();
      return data.team;
    } catch {
      return null;
    }
  }, [refresh]);

  const remove = useCallback(async (id: string): Promise<boolean> => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('max_token') : null;
      const res = await fetch(`/api/teams/${id}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) return false;
      await refresh();
      return true;
    } catch {
      return false;
    }
  }, [refresh]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { teams, loading, refresh, create, remove };
}
