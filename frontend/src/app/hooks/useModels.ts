'use client';
import { useState, useEffect, useCallback } from 'react';
import { Model } from '@/app/lib/types';
import { configApi } from '@/app/lib/api';

const STORAGE_KEY = 'max_preferred_model';

export function useModels() {
  const [models, setModels] = useState<Model[]>([]);
  const [preferredModelId, setPreferredModelId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadModels = useCallback(async () => {
    setLoading(true);
    try {
      const res = await configApi.getModels();
      const mapped: Model[] = (res.models || []).map(m => ({
        id: m.id,
        name: m.name,
        provider: m.provider,
        speed: m.speed,
        speedLabel: m.speedLabel,
        description: m.description,
        bestFor: m.bestFor,
        contextWindow: m.contextWindow,
        maxOutputTokens: m.maxOutputTokens,
      }));
      setModels(mapped);
    } catch (e) {
      // Silently fail — model selector will just show "Auto"
      setModels([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const setPreferredModel = useCallback(async (modelId: string) => {
    const model = models.find(m => m.id === modelId);
    setPreferredModelId(modelId);
    try { localStorage.setItem(STORAGE_KEY, modelId); } catch {}
    try {
      await configApi.setModel(modelId, model?.provider);
    } catch {
      // Non-fatal — local state is enough for UI
    }
  }, [models]);

  // Load on mount
  useEffect(() => {
    loadModels();
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setPreferredModelId(stored);
    } catch {}
  }, [loadModels]);

  return { models, preferredModelId, setPreferredModel, loading };
}
