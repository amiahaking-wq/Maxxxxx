/**
 * WelcomeScreen — shown when no messages.
 * Uses proactive suggestions from the backend (Feature #24) when available,
 * falls back to static suggestions.
 */
import { useEffect, useState } from 'react';
import { Globe, Code, Bot, MessageSquare } from 'lucide-react';
import { getAuthHeaders } from '../lib/auth.js';

const API_BASE = import.meta.env.VITE_API_URL || window.location.origin;

const FALLBACK_SUGGESTIONS = [
  { icon: Globe, title: 'Browse the web', subtitle: 'Research anything online', prompt: 'Search the web for the latest tech news' },
  { icon: Code, title: 'Write code', subtitle: 'Build apps, scripts, tools', prompt: 'Build a snake game in HTML that I can play' },
  { icon: Bot, title: 'Automate a task', subtitle: 'Let MAX do the work', prompt: 'Check the open issues in my GitHub repo' },
  { icon: MessageSquare, title: 'Answer questions', subtitle: 'Ask me anything', prompt: 'Explain how async/await works in JavaScript' },
];

export default function WelcomeScreen({ onSuggestionClick }) {
  const [suggestions, setSuggestions] = useState(FALLBACK_SUGGESTIONS);

  useEffect(() => {
    // Fetch proactive suggestions from backend
    fetch(`${API_BASE}/api/suggestions`, { headers: getAuthHeaders() })
      .then(r => r.json())
      .then(data => {
        if (data.suggestions && data.suggestions.length > 0) {
          // Map backend suggestions to the format we need
          const mapped = data.suggestions.map(s => ({
            icon: s.icon === '🎮' ? Code : s.icon === '🔍' ? Globe : s.icon === '🔄' ? Bot : MessageSquare,
            title: s.title,
            subtitle: s.prompt?.substring(0, 50) + (s.prompt?.length > 50 ? '...' : ''),
            prompt: s.prompt
          }));
          setSuggestions(mapped);
        }
      })
      .catch(() => {});
  }, []);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
      {/* Logo */}
      <div className="w-16 h-16 rounded-full bg-[#FF6B35] flex items-center justify-center text-white font-bold text-2xl mb-4">M</div>

      {/* Title */}
      <h1 className="text-2xl font-semibold text-[#ececec] mb-1">MAX</h1>
      <p className="text-[#666] text-sm mb-8">Your autonomous AI agent</p>

      {/* Suggestion cards */}
      <div className="grid grid-cols-2 gap-2.5 w-full max-w-lg">
        {suggestions.map((s, i) => {
          const Icon = s.icon;
          return (
            <button
              key={i}
              onClick={() => onSuggestionClick && onSuggestionClick(s.prompt)}
              className="flex flex-col items-start gap-1.5 p-4 bg-[#1e1e1e] border border-[#2a2a2a] rounded-xl hover:bg-[#252525] hover:border-[#FF6B35]/20 transition-all text-left group"
            >
              <Icon size={20} className="text-[#FF6B35] group-hover:scale-110 transition-transform" />
              <div>
                <div className="text-sm font-medium text-[#ececec]">{s.title}</div>
                <div className="text-xs text-[#666]">{s.subtitle}</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
