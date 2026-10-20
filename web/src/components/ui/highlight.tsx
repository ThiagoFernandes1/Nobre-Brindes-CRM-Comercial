import type { ReactNode } from 'react';
import { highlightRanges } from '@/lib/search';

export function Highlight({ text, query }: { text: string; query: string }) {
  const ranges = query.trim() ? highlightRanges(text, query) : [];
  if (ranges.length === 0) return <>{text}</>;

  const chars = [...text];
  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const [start, end] of ranges) {
    if (start > cursor) parts.push(chars.slice(cursor, start).join(''));
    parts.push(
      <mark key={start} className="rounded-sm bg-amber-200/80 px-0.5 text-inherit">
        {chars.slice(start, end).join('')}
      </mark>,
    );
    cursor = end;
  }
  if (cursor < chars.length) parts.push(chars.slice(cursor).join(''));
  return <>{parts}</>;
}
