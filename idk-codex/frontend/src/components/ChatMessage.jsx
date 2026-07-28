/**
 * ChatMessage — renders user and assistant messages.
 * Tool calls show as collapsible cards.
 */
import { useState } from 'react';
import { ChevronDown, ChevronRight, Loader2, CheckCircle2, XCircle, FileCode } from 'lucide-react';

export default function ChatMessage({ msg, isStreaming }) {
  const [expandedTools, setExpandedTools] = useState({});

  const isUser = msg.role === 'user';
  const isAssistant = msg.role === 'assistant';

  const renderContent = (content) => {
    if (!content) return null;
    const parts = [];
    const regex = /```(\w*)\n?([\s\S]*?)```/g;
    let lastIdx = 0, match, i = 0;
    while ((match = regex.exec(content)) !== null) {
      if (match.index > lastIdx) parts.push(<span key={`t-${i}`} className="whitespace-pre-wrap">{content.slice(lastIdx, match.index)}</span>);
      parts.push(
        <pre key={`c-${i}`} className="bg-[#0d0d0d] text-[#e0e0e0] p-3 rounded-lg overflow-x-auto my-2 text-xs border border-[#2a2a2a]">
          <code>{match[2]}</code>
        </pre>
      );
      lastIdx = match.index + match[0].length; i++;
    }
    if (lastIdx < content.length) parts.push(<span key="t-last" className="whitespace-pre-wrap">{content.slice(lastIdx)}</span>);
    return parts.length > 0 ? parts : <span className="whitespace-pre-wrap">{content}</span>;
  };

  const toggleTool = (idx) => setExpandedTools(prev => ({ ...prev, [idx]: !prev[idx] }));

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'} mb-4`}>
      {/* Avatar */}
      {isAssistant && (
        <div className="flex-shrink-0 w-7 h-7 rounded-full bg-[#FF6B35] flex items-center justify-center text-white font-bold text-xs mt-0.5">M</div>
      )}

      {/* Message bubble */}
      <div className={`max-w-[85%] ${isUser ? 'text-right' : 'text-left'}`}>
        {/* Content */}
        {msg.content && (
          <div className={`text-sm leading-relaxed text-[#ececec] ${isUser ? 'text-right' : ''}`}>
            {renderContent(msg.content)}
            {isStreaming && isAssistant && <span className="inline-block w-1.5 h-4 bg-[#FF6B35] ml-0.5 animate-pulse rounded-sm" />}
          </div>
        )}

        {/* Tool call cards */}
        {msg.artifacts && msg.artifacts.length > 0 && (
          <div className="mt-2 space-y-1.5">
            {msg.artifacts.map((art, i) => (
              <div key={i} className="bg-[#1e1e1e] border border-[#2a2a2a] rounded-lg overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-[#252525]" onClick={() => toggleTool(`art-${i}`)}>
                  <FileCode size={14} className="text-[#FF6B35] flex-shrink-0" />
                  <span className="text-xs text-[#ccc] flex-1 truncate">{art.path}</span>
                  <span className="text-[10px] text-[#666] uppercase">{art.language}</span>
                  {expandedTools[`art-${i}`] ? <ChevronDown size={12} className="text-[#666]" /> : <ChevronRight size={12} className="text-[#666]" />}
                </div>
                {expandedTools[`art-${i}`] && (
                  <div className="px-3 pb-2">
                    <pre className="text-[10px] text-[#999] bg-[#0d0d0d] p-2 rounded max-h-48 overflow-auto"><code>{art.content?.substring(0, 2000)}</code></pre>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Files modified */}
        {msg.filesModified && msg.filesModified.length > 0 && !msg.artifacts && (
          <div className="mt-1.5 text-[10px] text-[#666]">Files: {msg.filesModified.join(', ')}</div>
        )}

        {/* Timestamp */}
        {msg.timestamp && (
          <div className={`text-[10px] text-[#555] mt-1 ${isUser ? 'text-right' : ''}`}>
            {new Date(msg.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * ToolCallCard — shows a running/completed tool call.
 */
export function ToolCallCard({ tool, status, result, onClick }) {
  const [expanded, setExpanded] = useState(false);
  const Icon = status === 'running' ? Loader2 : status === 'done' ? CheckCircle2 : XCircle;
  const color = status === 'running' ? 'text-[#FF6B35]' : status === 'done' ? 'text-green-500' : 'text-red-500';

  return (
    <div className="bg-[#1e1e1e] border border-[#2a2a2a] rounded-lg overflow-hidden my-1.5">
      <div className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-[#252525]" onClick={() => { setExpanded(!expanded); onClick && onClick(); }}>
        <Icon size={14} className={`${color} ${status === 'running' ? 'animate-spin' : ''} flex-shrink-0`} />
        <span className="text-xs text-[#ccc] font-mono">{tool}</span>
        <span className={`text-[10px] ${color}`}>{status}</span>
      </div>
      {expanded && result && (
        <div className="px-3 pb-2">
          <pre className="text-[10px] text-[#999] bg-[#0d0d0d] p-2 rounded max-h-32 overflow-auto"><code>{String(result).substring(0, 1000)}</code></pre>
        </div>
      )}
    </div>
  );
}
