import { useNexusStore } from '@/store/nexusStore';
import { GitBranch, AlertCircle, Check, Loader2, Radio } from 'lucide-react';

export function StatusBar() {
  const { currentBranch, gitStatus, settings, activeView, agentTasks } = useNexusStore();

  const pendingChanges = (gitStatus?.staged.length || 0) + (gitStatus?.unstaged.length || 0);
  const activeTasks = agentTasks.filter((t) => t.status === 'running').length;

  return (
    <div className="h-7 bg-[#6c5ce7] text-white flex items-center px-3 text-xs justify-between select-none z-50">
      <div className="flex items-center gap-4">
        {/* Branch */}
        <div className="flex items-center gap-1.5">
          <GitBranch size={12} />
          <span className="font-medium">{currentBranch}</span>
          {pendingChanges > 0 && (
            <span className="ml-1 bg-white/20 px-1.5 py-0.5 rounded-full text-[10px]">
              {pendingChanges}
            </span>
          )}
        </div>

        {/* Active Tasks */}
        {activeTasks > 0 && (
          <div className="flex items-center gap-1.5">
            <Loader2 size={12} className="animate-spin" />
            <span>{activeTasks} task{activeTasks > 1 ? 's' : ''} running</span>
          </div>
        )}

        {/* Current View */}
        <div className="flex items-center gap-1.5 opacity-70">
          <Radio size={12} />
          <span className="capitalize">{activeView}</span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        {/* Git Status */}
        {gitStatus && (
          <>
            {gitStatus.staged.length > 0 && (
              <div className="flex items-center gap-1">
                <Check size={12} />
                <span>{gitStatus.staged.length} staged</span>
              </div>
            )}
            {gitStatus.unstaged.length > 0 && (
              <div className="flex items-center gap-1">
                <AlertCircle size={12} />
                <span>{gitStatus.unstaged.length} modified</span>
              </div>
            )}
          </>
        )}

        {/* Encoding & Language */}
        <span>UTF-8</span>
        <span>TypeScript</span>

        {/* Cursor Position */}
        <span>Ln 12, Col 34</span>

        {/* AI Provider */}
        <span className="bg-white/20 px-2 py-0.5 rounded capitalize">{settings.aiProvider}</span>
      </div>
    </div>
  );
}
