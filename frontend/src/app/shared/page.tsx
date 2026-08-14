'use client';
import { Suspense, useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { MarkdownRenderer } from '@/app/components/chat/MarkdownRenderer';
import { Bot, ArrowLeft, Eye } from 'lucide-react';

interface SharedMessage {
  role: string;
  content: string;
  timestamp: string;
}

interface SharedData {
  success: boolean;
  title: string;
  messages: SharedMessage[];
  createdAt: string;
  viewCount: number;
}

function SharedContent() {
  const searchParams = useSearchParams();
  const id = searchParams.get('id');
  const [data, setData] = useState<SharedData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setError('No shared link ID provided');
      setLoading(false);
      return;
    }
    fetch(`/api/shared/view/${id}`)
      .then(res => {
        if (!res.ok) throw new Error('Shared link not found or expired');
        return res.json();
      })
      .then(d => setData(d))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-cg-canvas text-cg-muted">
        Loading shared conversation...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-cg-canvas gap-4">
        <div className="text-xl font-semibold text-cg-text">{error}</div>
        <a href="/" className="rounded-lg bg-cg-accent px-4 py-2 text-sm text-white hover:opacity-90">
          Go to MAX
        </a>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="min-h-screen bg-cg-canvas">
      <header className="sticky top-0 z-10 border-b border-cg-border bg-cg-canvas/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <a href="/" className="flex items-center gap-2 text-sm text-cg-muted hover:text-cg-text">
            <ArrowLeft className="h-4 w-4" /> Back to MAX
          </a>
          <div className="flex items-center gap-1 text-xs text-cg-muted">
            <Eye className="h-3.5 w-3.5" />
            {data.viewCount} view{data.viewCount !== 1 ? 's' : ''}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-6">
        <h1 className="mb-2 text-2xl font-semibold text-cg-text">{data.title}</h1>
        <div className="mb-6 text-xs text-cg-muted">
          Shared on {new Date(data.createdAt).toLocaleString()}
        </div>

        {data.messages.map((msg, i) => (
          <div key={i} className="mb-6">
            {msg.role === 'user' ? (
              <div className="flex justify-end">
                <div className="max-w-[75%] whitespace-pre-wrap break-words rounded-3xl bg-cg-bubble px-4 py-2.5 text-[15px] text-cg-text">
                  {msg.content}
                </div>
              </div>
            ) : (
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-cg-accent text-white">
                    <Bot className="h-4 w-4" />
                  </div>
                  <span className="text-sm font-semibold text-cg-text">MAX</span>
                </div>
                <MarkdownRenderer content={msg.content} />
              </div>
            )}
          </div>
        ))}

        <div className="mt-12 border-t border-cg-border pt-6 text-center">
          <a
            href="/"
            className="inline-flex items-center gap-2 rounded-lg bg-cg-accent px-6 py-2.5 text-sm font-medium text-white hover:opacity-90"
          >
            Try MAX yourself →
          </a>
        </div>
      </div>
    </div>
  );
}

export default function SharedPage() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center bg-cg-canvas text-cg-muted">Loading...</div>}>
      <SharedContent />
    </Suspense>
  );
}
