import { useState } from 'react';
import { Search, Star, Blocks, Puzzle, Wand2, Image, Film, Music, Terminal, GitBranch, Bot } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Extension {
  id: string;
  name: string;
  description: string;
  author: string;
  version: string;
  downloads: number;
  rating: number;
  icon: React.ElementType;
  installed: boolean;
  category: string;
}

const extensions: Extension[] = [
  { id: '1', name: 'NEXUS AI Chat', description: 'AI-powered coding assistant with multimodal support', author: 'NEXUS Team', version: '2.0.0', downloads: 152000, rating: 4.9, icon: Bot, installed: true, category: 'AI' },
  { id: '2', name: 'Image Studio', description: 'Professional image editing with AI generation', author: 'NEXUS Team', version: '1.5.0', downloads: 98000, rating: 4.8, icon: Image, installed: true, category: 'Creative' },
  { id: '3', name: 'Video Editor', description: 'Timeline-based video editing with effects', author: 'NEXUS Team', version: '1.3.0', downloads: 76000, rating: 4.7, icon: Film, installed: true, category: 'Creative' },
  { id: '4', name: 'Audio Studio', description: 'Waveform editing with effects and mixing', author: 'NEXUS Team', version: '1.2.0', downloads: 54000, rating: 4.6, icon: Music, installed: true, category: 'Creative' },
  { id: '5', name: 'Git Integration', description: 'Full Git workflow management', author: 'NEXUS Team', version: '3.0.0', downloads: 210000, rating: 4.9, icon: GitBranch, installed: true, category: 'Tools' },
  { id: '6', name: 'Terminal Plus', description: 'Enhanced terminal with multiple sessions', author: 'NEXUS Team', version: '2.1.0', downloads: 187000, rating: 4.8, icon: Terminal, installed: true, category: 'Tools' },
  { id: '7', name: 'CodeGen AI', description: 'Advanced code generation and refactoring', author: 'AI Labs', version: '1.8.0', downloads: 89000, rating: 4.7, icon: Wand2, installed: false, category: 'AI' },
  { id: '8', name: 'Motion FX', description: 'Motion graphics and animation effects', author: 'Creative Tools', version: '1.0.0', downloads: 32000, rating: 4.5, icon: Puzzle, installed: false, category: 'Creative' },
  { id: '9', name: 'Block Builder', description: 'Visual component builder', author: 'UI Tools', version: '2.2.0', downloads: 67000, rating: 4.6, icon: Blocks, installed: false, category: 'Tools' },
];

const categories = ['All', 'AI', 'Creative', 'Tools'];

export function ExtensionsPanel() {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');

  const filtered = extensions.filter((ext) => {
    const matchesSearch = ext.name.toLowerCase().includes(search.toLowerCase()) || ext.description.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = activeCategory === 'All' || ext.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="flex flex-col h-full bg-[#0f0f1a]">
      <div className="h-10 flex items-center px-3 border-b border-[#2a2a3e]">
        <span className="text-xs font-semibold text-[#e0e0e0] uppercase tracking-wider">Extensions</span>
      </div>
      <div className="p-3 space-y-2">
        <div className="relative">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#6b6b8d]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search extensions..."
            className="w-full bg-[#1a1a2e] border border-[#2a2a3e] rounded-md pl-8 pr-3 py-1.5 text-xs text-[#e0e0e0] placeholder-[#4a4a6a] outline-none focus:border-[#6c5ce7] transition-colors"
          />
        </div>
        <div className="flex gap-1">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={cn(
                'px-2 py-0.5 rounded text-[10px] transition-all',
                activeCategory === cat
                  ? 'bg-[#6c5ce7]/20 text-[#6c5ce7]'
                  : 'text-[#6b6b8d] hover:text-[#a0a0c0] hover:bg-[#1a1a2e]'
              )}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-1">
        {filtered.map((ext) => {
          const Icon = ext.icon;
          return (
            <div
              key={ext.id}
              className="flex items-start gap-2.5 p-2.5 rounded-lg bg-[#1a1a2e] border border-[#2a2a3e] hover:border-[#3a3a4e] transition-all group"
            >
              <div className="w-8 h-8 rounded-md bg-[#2a2a3e] flex items-center justify-center shrink-0">
                <Icon size={16} className="text-[#6c5ce7]" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium text-[#e0e0e0]">{ext.name}</span>
                  <span className="text-[9px] text-[#6b6b8d]">v{ext.version}</span>
                </div>
                <p className="text-[10px] text-[#6b6b8d] mt-0.5 line-clamp-2">{ext.description}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[9px] text-[#4a4a6a]">{ext.author}</span>
                  <span className="text-[9px] text-[#4a4a6a]">{(ext.downloads / 1000).toFixed(0)}k downloads</span>
                  <div className="flex items-center gap-0.5">
                    <Star size={8} className="text-[#fdcb6e]" />
                    <span className="text-[9px] text-[#fdcb6e]">{ext.rating}</span>
                  </div>
                </div>
              </div>
              <button
                className={cn(
                  'shrink-0 px-2.5 py-1 rounded text-[10px] font-medium transition-all',
                  ext.installed
                    ? 'bg-[#2a2a3e] text-[#6b6b8d] cursor-default'
                    : 'bg-[#6c5ce7] text-white hover:bg-[#5b4dd1]'
                )}
              >
                {ext.installed ? 'Installed' : 'Install'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
