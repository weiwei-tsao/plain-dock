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

// Backslash-escape only characters that would change how a plain title renders as a
// heading (closing `#`, emphasis, code, links, HTML, strikethrough, entities).
function escapeHeadingText(text: string): string {
  return text.replace(/[\\`*_[\]<>#~&]/g, '\\$&');
}

// Markdown file for download: prepend the title as an H1 unless it adds nothing —
// no title, a title derived from the body, or a body that already opens with it.
export function markdownWithTitle(title: string, content: string): string {
  const t = title.trim();
  if (!t || t === deriveTitleFromText(markdownToPlainText(content)).trim()) return content;
  // ponytail: regex check of the opening heading (ATX or setext, inline marks stripped),
  // not a full parse — keeps the Markdown parser out of this server-shared module.
  // Drop leading blank lines only: first-line indentation matters (4+ spaces is a code block).
  const [first, second = ''] = content.replace(/^(?:[ \t]*\n)+/, '').split('\n', 2);
  const isAtx = /^ {0,3}#{1,6}\s/.test(first);
  const isSetext = /^ {0,3}\S/.test(first) && /^ {0,3}(?:=+|-+)\s*$/.test(second);
  const headingText = markdownToPlainText(first.trim().replace(/\s+#+$/, '')).trim();
  if ((isAtx || isSetext) && headingText === t) return content;
  return `# ${escapeHeadingText(t)}\n\n${content}`;
}
