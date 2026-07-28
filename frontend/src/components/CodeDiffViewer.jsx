/**
 * Code Diff Viewer (Feature #14)
 *
 * Renders a side-by-side diff of two code snippets with syntax highlighting.
 * Used to show file edits made by the agent.
 */
import { useMemo } from 'react';

export default function CodeDiffViewer({ oldCode, newCode, filename, language = 'text' }) {
  const diff = useMemo(() => computeDiff(oldCode || '', newCode || ''), [oldCode, newCode]);

  return (
    <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 bg-[#212121] border-b border-[#2a2a2a] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs text-[#FF6B35] font-mono">{filename || 'file'}</span>
          <span className="text-[10px] text-[#666]">{language}</span>
        </div>
        <div className="text-[10px] text-[#666]">
          +{diff.added} -{diff.removed}
        </div>
      </div>

      {/* Diff body */}
      <div className="font-mono text-xs overflow-x-auto">
        {diff.lines.map((line, i) => {
          let bg = '';
          let textColor = '#999';
          let prefix = ' ';
          if (line.type === 'added') { bg = 'bg-green-950/30'; textColor = '#6ee7b7'; prefix = '+'; }
          else if (line.type === 'removed') { bg = 'bg-red-950/30'; textColor = '#fca5a5'; prefix = '-'; }
          else if (line.type === 'context') { bg = ''; textColor = '#888'; prefix = ' '; }
          else if (line.type === 'hunk') { bg = 'bg-[#2a2a2a]'; textColor = '#666'; prefix = '@'; }

          return (
            <div key={i} className={`flex ${bg}`}>
              <span className="px-2 select-none" style={{ color: textColor }}>{prefix}</span>
              <pre className="flex-1 px-2 whitespace-pre-wrap break-all" style={{ color: textColor }}>{line.text || ' '}</pre>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Simple line-based diff (LCS algorithm).
 */
function computeDiff(oldText, newText) {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');

  // Build LCS table
  const m = oldLines.length;
  const n = newLines.length;
  const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (oldLines[i] === newLines[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  // Backtrack to build diff
  const lines = [];
  let i = 0, j = 0;
  let added = 0, removed = 0;
  while (i < m && j < n) {
    if (oldLines[i] === newLines[j]) {
      lines.push({ type: 'context', text: oldLines[i] });
      i++; j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      lines.push({ type: 'removed', text: oldLines[i] });
      removed++;
      i++;
    } else {
      lines.push({ type: 'added', text: newLines[j] });
      added++;
      j++;
    }
  }
  while (i < m) {
    lines.push({ type: 'removed', text: oldLines[i] });
    removed++;
    i++;
  }
  while (j < n) {
    lines.push({ type: 'added', text: newLines[j] });
    added++;
    j++;
  }

  return { lines, added, removed };
}
