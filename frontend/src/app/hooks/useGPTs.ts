'use client';
import { useState, useEffect, useCallback } from 'react';
import { CustomGPT } from '@/app/lib/types';

export function useGPTs() {
  const [gpts, setGpts] = useState<CustomGPT[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('max_token') : null;
      const res = await fetch('/api/gpts', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setGpts(data.gpts || []);
      }
    } catch {}
    setLoading(false);
  }, []);

  const create = useCallback(async (gpt: Partial<CustomGPT>): Promise<CustomGPT | null> => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('max_token') : null;
      const res = await fetch('/api/gpts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(gpt),
      });
      if (!res.ok) throw new Error('Failed to create GPT');
      const data = await res.json();
      await refresh();
      return data.gpt;
    } catch {
      return null;
    }
  }, [refresh]);

  const update = useCallback(async (id: string, updates: Partial<CustomGPT>): Promise<CustomGPT | null> => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('max_token') : null;
      const res = await fetch(`/api/gpts/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error('Failed to update GPT');
      const data = await res.json();
      await refresh();
      return data.gpt;
    } catch {
      return null;
    }
  }, [refresh]);

  const remove = useCallback(async (id: string): Promise<boolean> => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('max_token') : null;
      const res = await fetch(`/api/gpts/${id}`, {
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

  return { gpts, loading, refresh, create, update, remove };
}
