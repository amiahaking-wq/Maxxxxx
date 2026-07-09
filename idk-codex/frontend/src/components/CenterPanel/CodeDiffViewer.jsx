import React from 'react';

export function CodeDiffViewer({ diff }) {
  if (!diff) return null;

  return (
    <div className="code-diff-viewer">
      <pre className="diff-content">{diff}</pre>
    </div>
  );
}
