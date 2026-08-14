'use client';
import { useState } from 'react';
import { Artifact } from '@/app/lib/types';
import { FileText, Code, Image, File, ChevronDown, Download, Eye } from 'lucide-react';
import { cn } from '@/app/lib/utils';

interface Props {
  artifact: Artifact;
}

export function ArtifactCard({ artifact }: Props) {
  const [expanded, setExpanded] = useState(false);

  const icon = {
    code: Code,
    file: FileText,
    image: Image,
    markdown: FileText,
  }[artifact.type] || File;

  const handleDownload = () => {
    const blob = new Blob([artifact.content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = artifact.title || artifact.path || 'artifact.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mb-2 overflow-hidden rounded-lg border border-cg-border bg-cg-sidebar">
      <div className="flex items-center gap-2 px-3 py-2">
        {artifact.type === 'image' ? (
          <Image className="h-4 w-4 text-cg-muted" />
        ) : (
          <File className="h-4 w-4 text-cg-muted" />
        )}
        <button
          onClick={() => setExpanded(e => !e)}
          className="flex flex-1 items-center gap-1 text-left text-sm text-cg-text hover:text-cg-accent"
        >
          <span className="font-mono">{artifact.title || artifact.path || 'artifact'}</span>
          {artifact.language && (
            <span className="rounded bg-cg-hover px-1.5 py-0.5 text-xs text-cg-muted">{artifact.language}</span>
          )}
        </button>
        <ChevronDown className={cn('h-4 w-4 text-cg-muted transition-transform', expanded && 'rotate-180')} />
        <button
          onClick={handleDownload}
          className="rounded p-1 text-cg-muted hover:bg-cg-hover hover:text-cg-text"
          aria-label="Download"
          title="Download"
        >
          <Download className="h-3.5 w-3.5" />
        </button>
      </div>
      {expanded && (
        <div className="border-t border-cg-border">
          {artifact.type === 'image' && artifact.content ? (
            <img src={artifact.content} alt={artifact.title} className="max-w-full" />
          ) : (
            <pre className="max-h-96 overflow-auto bg-[#0d1117] p-3 text-[13px] leading-relaxed text-[#e6edf3]">
              <code>{artifact.content}</code>
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
