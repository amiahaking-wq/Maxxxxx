'use client';
import { useState, useRef, useEffect } from 'react';
import { useModels } from '@/app/hooks/useModels';
import { ChevronDown, Check } from 'lucide-react';
import { cn } from '@/app/lib/utils';

export function ModelSelector() {
  const { models, preferredModelId, setPreferredModel, loading } = useModels();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const current = models.find(m => m.id === preferredModelId);

  // Group models by provider
  const grouped = models.reduce<Record<string, typeof models>>((acc, m) => {
    (acc[m.provider] = acc[m.provider] || []).push(m);
    return acc;
  }, {});

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1 rounded-md px-2 py-1 text-sm font-medium text-cg-text hover:bg-cg-hover"
      >
        <span>MAX</span>
        {current && <span className="text-cg-muted">{current.name}</span>}
        <ChevronDown className={cn('h-3.5 w-3.5 text-cg-muted transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute left-0 top-9 z-20 w-72 rounded-lg border border-cg-border bg-cg-canvas py-1 shadow-lg">
          {/* Auto / Default option */}
          <button
            onClick={() => { setPreferredModel('auto'); setOpen(false); }}
            className={cn(
              'flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-cg-hover',
              !preferredModelId && 'text-cg-accent'
            )}
          >
            <div>
              <div className="font-medium">Auto (recommended)</div>
              <div className="text-xs text-cg-muted">Automatically picks the best model</div>
            </div>
            {!preferredModelId && <Check className="h-4 w-4" />}
          </button>

          {loading && (
            <div className="px-3 py-2 text-sm text-cg-muted">Loading models...</div>
          )}

          {/* Grouped models */}
          {Object.entries(grouped).map(([provider, providerModels]) => (
            <div key={provider}>
              <div className="border-t border-cg-border px-3 py-1 text-xs font-semibold uppercase text-cg-muted">
                {provider}
              </div>
              {providerModels.map(m => (
                <button
                  key={m.id}
                  onClick={() => { setPreferredModel(m.id); setOpen(false); }}
                  className={cn(
                    'flex w-full items-start justify-between px-3 py-2 text-sm hover:bg-cg-hover',
                    preferredModelId === m.id && 'text-cg-accent'
                  )}
                >
                  <div className="flex-1">
                    <div className="font-medium">
                      {m.speedLabel && <span className="mr-1">{m.speedLabel}</span>}
                      {m.name}
                    </div>
                    {m.description && (
                      <div className="text-xs text-cg-muted">{m.description}</div>
                    )}
                    {m.contextWindow && (
                      <div className="text-xs text-cg-muted">
                        {Math.round(m.contextWindow / 1000)}k context
                      </div>
                    )}
                  </div>
                  {preferredModelId === m.id && <Check className="mt-1 h-4 w-4 flex-shrink-0" />}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
