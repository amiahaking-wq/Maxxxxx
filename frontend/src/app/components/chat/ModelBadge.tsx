export function ModelBadge({ provider, model }: { provider?: string; model?: string }) {
  if (!provider || !model) return null;
  return (
    <div className="mt-2 flex items-center justify-end">
      <span className="inline-flex items-center rounded-full bg-gray-800/80 border border-gray-700 px-2.5 py-0.5 text-[10px] text-gray-400 font-mono">
        {provider} • {model}
      </span>
    </div>
  );
}
