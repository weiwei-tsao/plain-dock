// Title policy: if the user typed a title, use it; if a note has content but no
// title, the first 20 characters of its text content become its title.
// Pure function — safe for both server routes and client components.
import { markdownToPlainText } from '@/lib/markdown/text-projection';

export const DERIVED_TITLE_MAX_CHARS = 20;

export function deriveTitleFromText(text: string): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  // Array.from splits by code point so the cap can't cut an emoji in half
  return Array.from(collapsed).slice(0, DERIVED_TITLE_MAX_CHARS).join('');
}

// Markdown file for download: prepend the title as an H1 unless it adds nothing —
// no title, a title derived from the body, or a body that already opens with it.
export function markdownWithTitle(title: string, content: string): string {
  const t = title.trim();
  if (!t || t === deriveTitleFromText(markdownToPlainText(content)).trim()) return content;
  const firstLine = content.trimStart().split('\n', 1)[0];
  const heading = firstLine.match(/^#{1,6}\s+(.*?)(?:\s+#+)?\s*$/);
  if (heading?.[1] === t) return content;
  return `# ${t}\n\n${content}`;
}
