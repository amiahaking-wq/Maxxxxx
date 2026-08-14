'use client';
import { Lightbulb, Database, Code, Sparkles } from 'lucide-react';

interface Props {
  onSuggestionClick: (text: string) => void;
}

const SUGGESTIONS = [
  { icon: Lightbulb, label: 'Give me ideas', subtitle: 'for a new project', color: 'text-amber-500' },
  { icon: Database, label: 'Synthesize', subtitle: 'my data', color: 'text-blue-500' },
  { icon: Code, label: 'Code', subtitle: 'a React component', color: 'text-green-500' },
  { icon: Sparkles, label: 'Surprise me', subtitle: 'with something fun', color: 'text-purple-500' },
];

export function EmptyState({ onSuggestionClick }: Props) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-4">
      <div className="mb-8 flex h-14 w-14 items-center justify-center rounded-2xl bg-cg-accent text-2xl font-bold text-white">
        M
      </div>
      <h1 className="mb-2 text-2xl font-semibold text-cg-text">How can I help you today?</h1>
      <p className="mb-8 text-sm text-cg-muted">Ask me anything — coding, writing, analysis, and more.</p>

      <div className="grid w-full max-w-2xl grid-cols-2 gap-3 md:grid-cols-4">
        {SUGGESTIONS.map((s, i) => (
          <button
            key={i}
            onClick={() => onSuggestionClick(`${s.label} ${s.subtitle}`)}
            className="flex flex-col items-start gap-2 rounded-2xl border border-cg-border p-3 text-left hover:bg-cg-hover"
          >
            <s.icon className={`h-5 w-5 ${s.color}`} />
            <div>
              <div className="text-sm font-medium text-cg-text">{s.label}</div>
              <div className="text-xs text-cg-muted">{s.subtitle}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
