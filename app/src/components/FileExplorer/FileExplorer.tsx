import { useState } from 'react';
import { useNexusStore } from '@/store/nexusStore';
import type { FileNode, EditorTab } from '@/types';
import {
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  FileCode,
  FileJson,
  FileType,
  FileImage,
  Film,
  Music,
  FileText,
  Plus,
  FolderPlus,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const fileIconMap: Record<string, { icon: React.ElementType; color: string }> = {
  typescript: { icon: FileCode, color: '#60a5fa' },
  javascript: { icon: FileCode, color: '#fbbf24' },
  json: { icon: FileJson, color: '#fbbf24' },
  css: { icon: FileType, color: '#60a5fa' },
  html: { icon: FileType, color: '#f87171' },
  markdown: { icon: FileText, color: '#a78bfa' },
  image: { icon: FileImage, color: '#f472b6' },
  video: { icon: Film, color: '#f97316' },
  audio: { icon: Music, color: '#22c55e' },
};

export function FileExplorer() {
  const { files, updateFile, openTab } = useNexusStore();

  const toggleFolder = (node: FileNode) => {
    if (node.type === 'folder') {
      updateFile(node.id, { isOpen: !node.isOpen });
    }
  };

  const handleFileClick = (node: FileNode) => {
    if (node.type === 'file' && node.content !== undefined) {
      const tab: EditorTab = {
        id: `tab-${node.id}`,
        fileId: node.id,
        name: node.name,
        language: node.language || 'plaintext',
        content: node.content || '',
        isModified: false,
        isActive: true,
        path: node.path,
      };
      openTab(tab);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="h-10 flex items-center justify-between px-3 border-b border-[#2a2a3e]">
        <span className="text-xs font-semibold text-[#e0e0e0] uppercase tracking-wider">Explorer</span>
        <div className="flex items-center gap-1">
          <button className="p-1 rounded hover:bg-[#2a2a3e] text-[#6b6b8d] hover:text-[#e0e0e0] transition-colors" title="New File">
            <Plus size={14} />
          </button>
          <button className="p-1 rounded hover:bg-[#2a2a3e] text-[#6b6b8d] hover:text-[#e0e0e0] transition-colors" title="New Folder">
            <FolderPlus size={14} />
          </button>
          <button className="p-1 rounded hover:bg-[#2a2a3e] text-[#6b6b8d] hover:text-[#e0e0e0] transition-colors" title="Refresh">
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto py-1">
        {files.map((node) => (
          <TreeNode key={node.id} node={node} depth={0} onToggle={toggleFolder} onFileClick={handleFileClick} />
        ))}
      </div>
    </div>
  );
}

function TreeNode({
  node,
  depth,
  onToggle,
  onFileClick,
}: {
  node: FileNode;
  depth: number;
  onToggle: (node: FileNode) => void;
  onFileClick: (node: FileNode) => void;
}) {
  const [hovered, setHovered] = useState(false);

  const isFolder = node.type === 'folder';
  const config = fileIconMap[node.language || ''] || { icon: FileText, color: '#6b6b8d' };
  const Icon = isFolder ? (node.isOpen ? FolderOpen : Folder) : config.icon;
  const iconColor = isFolder ? (node.isOpen ? '#6c5ce7' : '#6b6b8d') : config.color;

  return (
    <div>
      <div
        className={cn(
          'flex items-center gap-1 px-2 py-1 cursor-pointer select-none transition-colors',
          hovered ? 'bg-[#1e1e32]' : 'transparent'
        )}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={() => (isFolder ? onToggle(node) : onFileClick(node))}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {isFolder ? (
          <span className="w-4 flex items-center justify-center text-[#6b6b8d]">
            {node.isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </span>
        ) : (
          <span className="w-4" />
        )}
        <Icon size={14} style={{ color: iconColor }} className="shrink-0" />
        <span className={cn(
          'text-xs truncate',
          hovered ? 'text-[#e0e0e0]' : 'text-[#a0a0c0]',
          node.isModified && 'italic'
        )}>
          {node.name}
        </span>
        {node.isModified && (
          <span className="w-1.5 h-1.5 rounded-full bg-[#fdcb6e] ml-auto shrink-0" />
        )}
      </div>
      {isFolder && node.isOpen && node.children && (
        <div>
          {node.children.map((child) => (
            <TreeNode key={child.id} node={child} depth={depth + 1} onToggle={onToggle} onFileClick={onFileClick} />
          ))}
        </div>
      )}
    </div>
  );
}
