'use client';
import { ToolCall } from '@/app/lib/types';
import { Loader2, CheckCircle, XCircle, Terminal, Clock } from 'lucide-react';

export function ToolCallCard({ toolCall }: { toolCall: ToolCall }) {
  const icons: Record<ToolCall['status'], React.ReactNode> = {
    pending: <Loader2 className="h-4 w-4 animate-spin text-yellow-500" />,
    running: <Loader2 className="h-4 w-4 animate-spin text-blue-500" />,
    success: <CheckCircle className="h-4 w-4 text-green-500" />,
    error: <XCircle className="h-4 w-4 text-red-500" />,
    pending_approval: <Clock className="h-4 w-4 text-amber-500" />,
  };

  return (
    <div className="mb-2 rounded-lg border border-cg-border bg-cg-sidebar p-3 text-sm">
      <div className="mb-2 flex items-center gap-2">
        <Terminal className="h-4 w-4 text-cg-muted" />
        <span className="font-mono text-cg-text">{toolCall.name}</span>
        {icons[toolCall.status]}
      </div>
      {toolCall.arguments && Object.keys(toolCall.arguments).length > 0 && (
        <div className="mb-2 overflow-x-auto rounded bg-cg-canvas p-2 font-mono text-xs text-cg-muted">
          <pre>{JSON.stringify(toolCall.arguments, null, 2)}</pre>
        </div>
      )}
      {toolCall.result && (
        <div className="overflow-x-auto rounded border border-green-200 bg-green-50 p-2 font-mono text-xs text-green-800 dark:border-green-900 dark:bg-green-950/30 dark:text-green-300">
          <pre>{toolCall.result}</pre>
        </div>
      )}
      {toolCall.error && (
        <div className="rounded border border-red-200 bg-red-50 p-2 font-mono text-xs text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
          {toolCall.error}
        </div>
      )}
    </div>
  );
}
