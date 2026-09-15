import { indexOfCI } from '@/lib/search-highlight';

export interface MatchRange {
  from: number;
  to: number;
}

export function findMatchRanges(text: string, query: string): MatchRange[] {
  if (!query) return [];
  const ranges: MatchRange[] = [];
  let idx = indexOfCI(text, query);
  while (idx !== -1) {
    ranges.push({ from: idx, to: idx + query.length });
    idx = indexOfCI(text, query, idx + query.length);
  }
  return ranges;
}
