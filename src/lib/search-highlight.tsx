import React from 'react';

/**
 * Case-insensitive indexOf that stays aligned with `text`'s own indices.
 *
 * `text.toLowerCase()` can change length for characters like Turkish İ
 * (U+0130 → "i̇", 2 code units), so an index found in a fully-lowercased
 * copy doesn't necessarily address the same position in `text`. Comparing
 * per-window instead means every index this returns is always valid to
 * slice directly from the original string.
 */
function indexOfCI(text: string, query: string, fromIndex = 0): number {
  const lowerQuery = query.toLowerCase();
  const qLen = query.length;
  for (let i = fromIndex; i <= text.length - qLen; i++) {
    if (text.slice(i, i + qLen).toLowerCase() === lowerQuery) return i;
  }
  return -1;
}

/**
 * Returns `text` unchanged if `query` doesn't match inside it (or is empty).
 * Otherwise returns a window around the first match, ellipsized on whichever
 * side was trimmed.
 *
 * `before` is deliberately small: the preview renders in a single-line
 * `truncate` (nowrap + ellipsis) container, which clips from the right at
 * whatever the pane's rendered width allows — often well under 50 chars. A
 * large `before` pushes the match itself past that clip point, so it never
 * becomes visible even though it's in the DOM. `after` is generous since
 * the browser's own ellipsis naturally handles trimming it.
 */
export function getContextSnippet(text: string, query: string, before = 15, after = 80): string {
  if (!query) return text;
  const idx = indexOfCI(text, query);
  if (idx === -1) return text;

  const start = Math.max(0, idx - before);
  const end = Math.min(text.length, idx + query.length + after);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < text.length ? '…' : '';
  return prefix + text.slice(start, end) + suffix;
}

/** Wraps every case-insensitive occurrence of `query` in `text` with <mark>. */
export function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query) return text;

  const parts: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < text.length) {
    const idx = indexOfCI(text, query, i);
    if (idx === -1) {
      parts.push(text.slice(i));
      break;
    }
    if (idx > i) parts.push(text.slice(i, idx));
    parts.push(
      <mark key={key++} className="rounded-sm bg-indigo-400/30 text-indigo-200">
        {text.slice(idx, idx + query.length)}
      </mark>,
    );
    i = idx + query.length;
  }

  return parts;
}
