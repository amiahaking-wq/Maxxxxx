'use client';
import { useRef, useState, useEffect, useCallback } from 'react';

interface UseAutoScrollReturn {
  containerRef: React.RefObject<HTMLDivElement | null>;
  isPinned: boolean;
  scrollToBottom: (opts?: { behavior?: 'smooth' | 'auto' }) => void;
  userScrolledUp: boolean;
}

/**
 * Auto-scroll hook that matches ChatGPT's behavior:
 * - Sticks to bottom while streaming
 * - Pauses when user scrolls up
 * - Shows a "scroll to bottom" button when not pinned
 */
export function useAutoScroll(deps: unknown[]): UseAutoScrollReturn {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPinned, setIsPinned] = useState(true);
  const [userScrolledUp, setUserScrolledUp] = useState(false);

  // Detect scroll position
  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - (el.scrollTop + el.clientHeight);
    const pinned = distanceFromBottom < 32;
    setIsPinned(pinned);
    if (pinned) {
      setUserScrolledUp(false);
    }
  }, []);

  // Listen to scroll events
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  // Detect when user scrolls UP (away from bottom)
  const lastScrollTop = useRef(0);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onScroll = () => {
      const goingUp = el.scrollTop < lastScrollTop.current;
      const distanceFromBottom = el.scrollHeight - (el.scrollTop + el.clientHeight);
      if (goingUp && distanceFromBottom > 100) {
        setUserScrolledUp(true);
      }
      lastScrollTop.current = el.scrollTop;
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  const scrollToBottom = useCallback((opts?: { behavior?: 'smooth' | 'auto' }) => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTo({
      top: el.scrollHeight,
      behavior: opts?.behavior || 'auto',
    });
    setUserScrolledUp(false);
    setIsPinned(true);
  }, []);

  // Auto-scroll when deps change (new messages, streaming text) — only if pinned
  useEffect(() => {
    if (!userScrolledUp) {
      scrollToBottom({ behavior: 'auto' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { containerRef, isPinned, scrollToBottom, userScrolledUp };
}
