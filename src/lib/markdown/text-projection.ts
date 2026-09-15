/**
 * Best-effort, regex-based Markdown -> plain text projection. Not a full
 * parser — feeds textContent (search / sidebar preview / title fallback),
 * which tolerates approximation. See spec's "Alternatives Considered" for
 * why this isn't a Lezer-parse-tree-based implementation.
 */
export function markdownToPlainText(markdown: string): string {
  return markdown
    .split('\n')
    .map((line) =>
      line
        .replace(/^(?:>\s?)+/, '')
        .replace(/^#{1,6}\s+/, '')
        .replace(/^\s*(?:[-*+]|\d+\.)\s+/, ''),
    )
    .join('\n')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '[image: $1]')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*\*|___)(.+?)\1/g, '$2')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(\*|_)(.+?)\1/g, '$2')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/`([^`]+)`/g, '$1');
}
