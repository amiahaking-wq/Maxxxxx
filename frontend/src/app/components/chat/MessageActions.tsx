'use client';
import { useState } from 'react';
import { Copy, Check, ThumbsUp, ThumbsDown, Volume2, RotateCcw } from 'lucide-react';
import { cn } from '@/app/lib/utils';

interface MessageActionsProps {
  content: string;
  onRegenerate?: () => void;
  feedback?: 'up' | 'down' | null;
  onFeedback?: (f: 'up' | 'down') => void;
}

export function MessageActions({ content, onRegenerate, feedback, onFeedback }: MessageActionsProps) {
  const [copied, setCopied] = useState(false);
  const [reading, setReading] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const handleReadAloud = () => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    if (reading) {
      window.speechSynthesis.cancel();
      setReading(false);
      return;
    }
    // Strip markdown for cleaner speech
    const text = content.replace(/```[\s\S]*?```/g, ' code block ').replace(/[*#`>_~]/g, '');
    const utter = new SpeechSynthesisUtterance(text);
    utter.onend = () => setReading(false);
    utter.onerror = () => setReading(false);
    window.speechSynthesis.speak(utter);
    setReading(true);
  };

  const actions = [
    {
      icon: copied ? Check : Copy,
      label: copied ? 'Copied' : 'Copy',
      onClick: handleCopy,
      active: copied,
    },
    {
      icon: ThumbsUp,
      label: 'Good response',
      onClick: () => onFeedback?.('up'),
      active: feedback === 'up',
    },
    {
      icon: ThumbsDown,
      label: 'Bad response',
      onClick: () => onFeedback?.('down'),
      active: feedback === 'down',
    },
    {
      icon: Volume2,
      label: reading ? 'Stop reading' : 'Read aloud',
      onClick: handleReadAloud,
      active: reading,
    },
  ];

  if (onRegenerate) {
    actions.push({
      icon: RotateCcw,
      label: 'Regenerate',
      onClick: onRegenerate,
      active: false,
    });
  }

  return (
    <div className="mt-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
      {actions.map((a, i) => (
        <button
          key={i}
          onClick={a.onClick}
          className={cn(
            'rounded-md p-1.5 text-cg-muted hover:bg-cg-hover hover:text-cg-text',
            a.active && 'text-cg-accent'
          )}
          aria-label={a.label}
          title={a.label}
        >
          <a.icon className="h-3.5 w-3.5" />
        </button>
      ))}
    </div>
  );
}
