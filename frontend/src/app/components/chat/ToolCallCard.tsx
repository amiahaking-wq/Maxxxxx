import { ToolCall } from '@/app/lib/types';
import { Loader2, CheckCircle, XCircle, Terminal } from 'lucide-react';

export function ToolCallCard({ toolCall }: { toolCall: ToolCall }) {
  const icons = {
    pending: <Loader2 className="w-4 h-4 animate-spin text-yellow-400" />,
    running: <Loader2 className="w-4 h-4 animate-spin text-blue-400" />,
    success: <CheckCircle className="w-4 h-4 text-green-400" />,
    error: <XCircle className="w-4 h-4 text-red-400" />,
  };
  return (
    <div className="rounded-lg border border-gray-700 bg-gray-900/50 p-3 text-sm">
      <div className="flex items-center gap-2 mb-2">
        <Terminal className="w-4 h-4 text-gray-400" />
        <span className="font-mono text-gray-300">{toolCall.name}</span>
        {icons[toolCall.status]}
      </div>
      {toolCall.arguments && Object.keys(toolCall.arguments).length > 0 && (
        <div className="mb-2 rounded bg-gray-950 p-2 font-mono text-xs text-gray-400 overflow-x-auto">
          <pre>{JSON.stringify(toolCall.arguments, null, 2)}</pre>
        </div>
      )}
      {toolCall.result && (
        <div className="rounded bg-green-950/30 border border-green-900/30 p-2 font-mono text-xs text-green-300 overflow-x-auto">
          <pre>{toolCall.result}</pre>
        </div>
      )}
      {toolCall.error && (
        <div className="rounded bg-red-950/30 border border-red-900/30 p-2 font-mono text-xs text-red-300">
          {toolCall.error}
        </div>
      )}
    </div>
  );
}
