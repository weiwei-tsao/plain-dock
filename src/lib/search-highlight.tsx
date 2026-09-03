import React from 'react';

/**
 * Returns `text` unchanged if `query` doesn't match inside it (or is empty).
 * Otherwise returns a window of `radius` characters around the first match,
 * ellipsized on whichever side was trimmed.
 */
export function getContextSnippet(text: string, query: string, radius = 50): string {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;

  const start = Math.max(0, idx - radius);
  const end = Math.min(text.length, idx + query.length + radius);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < text.length ? '…' : '';
  return prefix + text.slice(start, end) + suffix;
}

/** Wraps every case-insensitive occurrence of `query` in `text` with <mark>. */
export function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query) return text;

  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const parts: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < text.length) {
    const idx = lowerText.indexOf(lowerQuery, i);
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
