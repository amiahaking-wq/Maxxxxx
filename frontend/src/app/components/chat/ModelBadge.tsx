export function ModelBadge({ provider, model }: { provider?: string; model?: string }) {
  if (!provider || !model) return null;
  return (
    <div className="mt-2 flex items-center justify-end">
      <span className="rounded-full border border-cg-border bg-cg-sidebar px-2.5 py-0.5 font-mono text-[10px] text-cg-muted">
        {provider} · {model}
      </span>
    </div>
  );
}
