'use client';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeHighlight from 'rehype-highlight';
import rehypeKatex from 'rehype-katex';
import { CodeBlock } from './CodeBlock';
import { ComponentPropsWithoutRef } from 'react';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export function MarkdownRenderer({ content, className = '' }: MarkdownRendererProps) {
  return (
    <div className={`prose-chat ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[
          [rehypeHighlight, { detect: true, ignoreMissing: true }],
          [rehypeKatex, { strict: false, throwOnError: false }],
        ]}
        components={{
          // Code blocks (fenced) vs inline code
          code({ inline, className: cls, children, ...props }: ComponentPropsWithoutRef<'code'> & { inline?: boolean }) {
            const match = /language-(\w+)/.exec(cls || '');
            const language = match ? match[1] : null;
            const rawCode = String(children).replace(/\n$/, '');

            // Inline code (no language class, or inline flag set by react-markdown v9)
            if (inline || (!cls && !rawCode.includes('\n'))) {
              return <code className={cls} {...props}>{children}</code>;
            }

            // Block code — use our CodeBlock with copy button
            return (
              <CodeBlock language={language} rawCode={rawCode}>
                {children}
              </CodeBlock>
            );
          },
          // Links open in new tab
          a({ href, children, ...props }: ComponentPropsWithoutRef<'a'>) {
            return <a href={href} target="_blank" rel="noreferrer noopener" {...props}>{children}</a>;
          },
          // Tables get a wrapper for horizontal scroll
          table({ children, ...props }: ComponentPropsWithoutRef<'table'>) {
            return (
              <div className="overflow-x-auto">
                <table {...props}>{children}</table>
              </div>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
