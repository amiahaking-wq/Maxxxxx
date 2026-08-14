'use client';
import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

interface CodeBlockProps {
  language: string | null;
  children: React.ReactNode;
  rawCode: string;
}

export function CodeBlock({ language, children, rawCode }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(rawCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API may fail in non-secure contexts — fallback
      const ta = document.createElement('textarea');
      ta.value = rawCode;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {}
      document.body.removeChild(ta);
    }
  };

  return (
    <div className="my-3 overflow-hidden rounded-lg border border-cg-border bg-[#0d1117]">
      {/* Header bar */}
      <div className="flex items-center justify-between border-b border-white/5 bg-[#161b22] px-3 py-1.5">
        <span className="text-xs text-gray-400">{language || 'text'}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 rounded px-2 py-0.5 text-xs text-gray-400 hover:bg-white/5 hover:text-gray-200"
          aria-label="Copy code"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3" /> Copied
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" /> Copy
            </>
          )}
        </button>
      </div>
      {/* Code body — rehype-highlight has already added hljs spans */}
      <pre className="overflow-x-auto p-3 text-[13px] leading-relaxed">
        <code className={`hljs ${language ? `language-${language}` : ''}`}>{children}</code>
      </pre>
    </div>
  );
}
