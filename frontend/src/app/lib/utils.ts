import { clsx, type ClassValue } from 'clsx';

/**
 * Merge class names conditionally.
 * Usage: cn('base', condition && 'extra', { 'active': isActive })
 */
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

/**
 * Format a relative time string (e.g., "2h ago", "just now").
 */
export function formatRelativeTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay === 1) return 'yesterday';
  if (diffDay < 7) return `${diffDay}d ago`;
  return d.toLocaleDateString();
}

/**
 * Group conversations by date bucket (Today / Yesterday / Previous 7 Days / Previous 30 Days / Older).
 */
export function groupConversationsByDate<T extends { updatedAt: string }>(
  conversations: T[]
): { label: string; items: T[] }[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const sevenDaysAgo = new Date(today.getTime() - 7 * 86400000);
  const thirtyDaysAgo = new Date(today.getTime() - 30 * 86400000);

  const buckets: { label: string; items: T[] }[] = [
    { label: 'Today', items: [] },
    { label: 'Yesterday', items: [] },
    { label: 'Previous 7 Days', items: [] },
    { label: 'Previous 30 Days', items: [] },
    { label: 'Older', items: [] },
  ];

  for (const conv of conversations) {
    const d = new Date(conv.updatedAt);
    if (d >= today) buckets[0].items.push(conv);
    else if (d >= yesterday) buckets[1].items.push(conv);
    else if (d >= sevenDaysAgo) buckets[2].items.push(conv);
    else if (d >= thirtyDaysAgo) buckets[3].items.push(conv);
    else buckets[4].items.push(conv);
  }

  return buckets.filter(b => b.items.length > 0);
}
