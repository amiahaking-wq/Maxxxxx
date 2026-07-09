import { useState } from 'react';
import { useNexusStore } from '@/store/nexusStore';
import {
  GitBranch,
  GitCommit,
  Plus,
  Check,
  RefreshCw,
  FileCode,
  FilePlus,
  FileMinus,
  FileEdit,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Upload,
  Download,
  FolderGit,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export function GitPanel() {
  const { gitBranches, gitCommits, gitStatus, currentBranch, setCurrentBranch } = useNexusStore();
  const [expandedSection, setExpandedSection] = useState<string>('changes');
  const [commitMessage, setCommitMessage] = useState('');

  const toggleSection = (section: string) => {
    setExpandedSection(expandedSection === section ? '' : section);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'added': return <FilePlus size={12} className="text-[#00b894]" />;
      case 'deleted': return <FileMinus size={12} className="text-red-400" />;
      case 'modified': return <FileEdit size={12} className="text-[#fdcb6e]" />;
      default: return <FileCode size={12} className="text-[#6b6b8d]" />;
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#0f0f1a] overflow-hidden">
      {/* Header */}
      <div className="h-10 flex items-center justify-between px-3 border-b border-[#2a2a3e]">
        <span className="text-xs font-semibold text-[#e0e0e0] uppercase tracking-wider">Source Control</span>
        <div className="flex items-center gap-1">
          <button className="p-1 rounded hover:bg-[#2a2a3e] text-[#6b6b8d] hover:text-[#e0e0e0]">
            <RefreshCw size={12} />
          </button>
          <button className="p-1 rounded hover:bg-[#2a2a3e] text-[#6b6b8d] hover:text-[#e0e0e0]">
            <FolderGit size={12} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Branch Selector */}
        <div className="px-3 py-2 border-b border-[#2a2a3e]">
          <div className="flex items-center gap-2 mb-2">
            <GitBranch size={12} className="text-[#6c5ce7]" />
            <select
              value={currentBranch}
              onChange={(e) => setCurrentBranch(e.target.value)}
              className="flex-1 bg-[#1a1a2e] border border-[#2a2a3e] rounded px-2 py-1 text-xs text-[#e0e0e0] outline-none focus:border-[#6c5ce7]"
            >
              {gitBranches.map((b) => (
                <option key={b.name} value={b.name}>
                  {b.name} {b.ahead > 0 ? `(+${b.ahead})` : ''} {b.behind > 0 ? `(-${b.behind})` : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-1">
            <button className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-[#1a1a2e] border border-[#2a2a3e] rounded text-[10px] text-[#a0a0c0] hover:bg-[#2a2a3e] transition-colors">
              <Download size={10} /> Pull
            </button>
            <button className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-[#1a1a2e] border border-[#2a2a3e] rounded text-[10px] text-[#a0a0c0] hover:bg-[#2a2a3e] transition-colors">
              <Upload size={10} /> Push
            </button>
          </div>
        </div>

        {/* Changes Section */}
        <div className="border-b border-[#2a2a3e]">
          <button
            onClick={() => toggleSection('changes')}
            className="w-full flex items-center gap-1 px-3 h-8 text-xs font-medium text-[#e0e0e0] hover:bg-[#1e1e32] transition-colors"
          >
            {expandedSection === 'changes' ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            <span>Changes</span>
            {gitStatus && (
              <span className="ml-auto text-[10px] text-[#6b6b8d]">
                {(gitStatus.staged.length + gitStatus.unstaged.length + gitStatus.untracked.length)} files
              </span>
            )}
          </button>
          {expandedSection === 'changes' && gitStatus && (
            <div className="pb-2">
              {/* Staged */}
              {gitStatus.staged.length > 0 && (
                <>
                  <div className="px-3 py-1 text-[10px] text-[#00b894] font-medium uppercase tracking-wider flex items-center gap-1">
                    <Check size={10} /> Staged
                  </div>
                  {gitStatus.staged.map((file) => (
                    <div key={file.path} className="flex items-center gap-2 px-6 py-1 hover:bg-[#1e1e32] group">
                      {getStatusIcon(file.status)}
                      <span className="text-xs text-[#a0a0c0] flex-1 truncate">{file.path}</span>
                      <span className="text-[10px] text-[#00b894]">+{file.additions}</span>
                      <span className="text-[10px] text-red-400">-{file.deletions}</span>
                    </div>
                  ))}
                </>
              )}
              {/* Unstaged */}
              {gitStatus.unstaged.length > 0 && (
                <>
                  <div className="px-3 py-1 text-[10px] text-[#fdcb6e] font-medium uppercase tracking-wider flex items-center gap-1">
                    <CircleDot size={10} /> Changes
                  </div>
                  {gitStatus.unstaged.map((file) => (
                    <div key={file.path} className="flex items-center gap-2 px-6 py-1 hover:bg-[#1e1e32] group">
                      {getStatusIcon(file.status)}
                      <span className="text-xs text-[#a0a0c0] flex-1 truncate">{file.path}</span>
                      <span className="text-[10px] text-[#00b894]">+{file.additions}</span>
                      <span className="text-[10px] text-red-400">-{file.deletions}</span>
                    </div>
                  ))}
                </>
              )}
              {/* Untracked */}
              {gitStatus.untracked.length > 0 && (
                <>
                  <div className="px-3 py-1 text-[10px] text-[#6b6b8d] font-medium uppercase tracking-wider flex items-center gap-1">
                    <Plus size={10} /> Untracked
                  </div>
                  {gitStatus.untracked.map((path) => (
                    <div key={path} className="flex items-center gap-2 px-6 py-1 hover:bg-[#1e1e32]">
                      <FilePlus size={12} className="text-[#6b6b8d]" />
                      <span className="text-xs text-[#a0a0c0] flex-1 truncate">{path}</span>
                    </div>
                  ))}
                </>
              )}

              {/* Commit Message */}
              <div className="px-3 mt-2 space-y-2">
                <input
                  value={commitMessage}
                  onChange={(e) => setCommitMessage(e.target.value)}
                  placeholder="Commit message..."
                  className="w-full bg-[#1a1a2e] border border-[#2a2a3e] rounded px-2 py-1.5 text-xs text-[#e0e0e0] placeholder-[#4a4a6a] outline-none focus:border-[#6c5ce7]"
                />
                <button
                  disabled={!commitMessage.trim()}
                  className="w-full py-1.5 bg-[#6c5ce7] text-white text-xs rounded hover:bg-[#5b4dd1] disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-1"
                >
                  <GitCommit size={12} /> Commit
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Branches Section */}
        <div className="border-b border-[#2a2a3e]">
          <button
            onClick={() => toggleSection('branches')}
            className="w-full flex items-center gap-1 px-3 h-8 text-xs font-medium text-[#e0e0e0] hover:bg-[#1e1e32] transition-colors"
          >
            {expandedSection === 'branches' ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            <span>Branches</span>
            <span className="ml-auto text-[10px] text-[#6b6b8d]">{gitBranches.length}</span>
          </button>
          {expandedSection === 'branches' && (
            <div className="pb-2 space-y-0.5">
              {gitBranches.map((branch) => (
                <div
                  key={branch.name}
                  onClick={() => setCurrentBranch(branch.name)}
                  className={cn(
                    'flex items-center gap-2 px-6 py-1.5 cursor-pointer transition-colors',
                    branch.isCurrent ? 'bg-[#6c5ce7]/10' : 'hover:bg-[#1e1e32]'
                  )}
                >
                  <GitBranch size={12} className={branch.isCurrent ? 'text-[#6c5ce7]' : 'text-[#6b6b8d]'} />
                  <span className={cn('text-xs flex-1', branch.isCurrent ? 'text-[#e0e0e0] font-medium' : 'text-[#a0a0c0]')}>
                    {branch.name}
                  </span>
                  {branch.ahead > 0 && <span className="text-[10px] text-[#00b894]">↑{branch.ahead}</span>}
                  {branch.behind > 0 && <span className="text-[10px] text-[#fdcb6e]">↓{branch.behind}</span>}
                  {branch.isCurrent && <CircleDot size={10} className="text-[#6c5ce7]" />}
                </div>
              ))}
              <button className="flex items-center gap-2 px-6 py-1.5 text-[10px] text-[#6c5ce7] hover:underline">
                <Plus size={10} /> Create new branch
              </button>
            </div>
          )}
        </div>

        {/* Recent Commits */}
        <div>
          <button
            onClick={() => toggleSection('commits')}
            className="w-full flex items-center gap-1 px-3 h-8 text-xs font-medium text-[#e0e0e0] hover:bg-[#1e1e32] transition-colors"
          >
            {expandedSection === 'commits' ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            <span>Recent Commits</span>
            <span className="ml-auto text-[10px] text-[#6b6b8d]">{gitCommits.length}</span>
          </button>
          {expandedSection === 'commits' && (
            <div className="pb-2 space-y-0.5">
              {gitCommits.map((commit, idx) => (
                <div key={commit.hash} className="flex items-start gap-2 px-6 py-2 hover:bg-[#1e1e32] group">
                  <div className="flex flex-col items-center">
                    <div className="w-2 h-2 rounded-full bg-[#6c5ce7]" />
                    {idx < gitCommits.length - 1 && <div className="w-px h-6 bg-[#2a2a3e] mt-0.5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] text-[#e0e0e0] truncate">{commit.message}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[9px] text-[#6b6b8d]">{commit.hash}</span>
                      <span className="text-[9px] text-[#6b6b8d]">{commit.author}</span>
                      <span className="text-[9px] text-[#4a4a6a]">
                        {new Date(commit.date).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
