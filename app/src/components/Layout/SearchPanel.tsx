import { useState } from 'react';
import { Search, Replace, FileCode } from 'lucide-react';

export function SearchPanel() {
  const [query, setQuery] = useState('');
  const [replace, setReplace] = useState('');
  const [showReplace, setShowReplace] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [regex, setRegex] = useState(false);

  const mockResults = query ? [
    { file: 'src/components/App.tsx', line: 12, content: 'const [state, setState] = useState', matches: 3 },
    { file: 'src/store/store.ts', line: 45, content: 'export const useStore = create', matches: 1 },
    { file: 'src/hooks/useAuth.ts', line: 8, content: 'const [user, setUser] = useState', matches: 2 },
  ] : [];

  return (
    <div className="flex flex-col h-full bg-[#0f0f1a]">
      <div className="h-10 flex items-center px-3 border-b border-[#2a2a3e]">
        <span className="text-xs font-semibold text-[#e0e0e0] uppercase tracking-wider">Search</span>
      </div>
      <div className="p-3 space-y-2">
        <div className="relative">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#6b6b8d]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search across files..."
            className="w-full bg-[#1a1a2e] border border-[#2a2a3e] rounded-md pl-8 pr-3 py-1.5 text-xs text-[#e0e0e0] placeholder-[#4a4a6a] outline-none focus:border-[#6c5ce7] transition-colors"
          />
        </div>
        {showReplace && (
          <div className="relative">
            <Replace size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#6b6b8d]" />
            <input
              value={replace}
              onChange={(e) => setReplace(e.target.value)}
              placeholder="Replace with..."
              className="w-full bg-[#1a1a2e] border border-[#2a2a3e] rounded-md pl-8 pr-3 py-1.5 text-xs text-[#e0e0e0] placeholder-[#4a4a6a] outline-none focus:border-[#6c5ce7] transition-colors"
            />
          </div>
        )}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowReplace(!showReplace)}
            className="text-[10px] text-[#6c5ce7] hover:underline"
          >
            {showReplace ? 'Hide Replace' : 'Show Replace'}
          </button>
          <div className="flex gap-1 ml-auto">
            <button
              onClick={() => setCaseSensitive(!caseSensitive)}
              className={`px-1.5 py-0.5 rounded text-[9px] border ${caseSensitive ? 'bg-[#6c5ce7]/20 border-[#6c5ce7] text-[#6c5ce7]' : 'border-[#2a2a3e] text-[#6b6b8d]'}`}
            >
              Aa
            </button>
            <button
              onClick={() => setWholeWord(!wholeWord)}
              className={`px-1.5 py-0.5 rounded text-[9px] border ${wholeWord ? 'bg-[#6c5ce7]/20 border-[#6c5ce7] text-[#6c5ce7]' : 'border-[#2a2a3e] text-[#6b6b8d]'}`}
            >
              Ab|
            </button>
            <button
              onClick={() => setRegex(!regex)}
              className={`px-1.5 py-0.5 rounded text-[9px] border ${regex ? 'bg-[#6c5ce7]/20 border-[#6c5ce7] text-[#6c5ce7]' : 'border-[#2a2a3e] text-[#6b6b8d]'}`}
            >
              .*
            </button>
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {query && (
          <div className="px-3 pb-2">
            <div className="text-[10px] text-[#6b6b8d] mb-2">{mockResults.length} results in {mockResults.length} files</div>
            {mockResults.map((result, idx) => (
              <div key={idx} className="mb-2">
                <div className="flex items-center gap-1.5 mb-1">
                  <FileCode size={12} className="text-[#00cec9]" />
                  <span className="text-[11px] text-[#e0e0e0]">{result.file}</span>
                  <span className="text-[9px] text-[#6b6b8d]">{result.matches} matches</span>
                </div>
                <div className="ml-5 pl-2 border-l border-[#2a2a3e]">
                  <div className="text-[10px] text-[#a0a0c0] font-mono hover:bg-[#1e1e32] px-1.5 py-0.5 rounded cursor-pointer">
                    <span className="text-[#6b6b8d] mr-2">{result.line}:</span>
                    {result.content.split(new RegExp(`(${query})`, caseSensitive ? 'g' : 'gi')).map((part, i) =>
                      part.toLowerCase() === query.toLowerCase() ? (
                        <span key={i} className="bg-[#6c5ce7]/30 text-[#e0e0e0]">{part}</span>
                      ) : (
                        <span key={i}>{part}</span>
                      )
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
