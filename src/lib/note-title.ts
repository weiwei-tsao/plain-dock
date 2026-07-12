// Title policy: if the user typed a title, use it; if a note has content but no
// title, the first 20 characters of its text content become its title.
// Pure function — safe for both server routes and client components.
export const DERIVED_TITLE_MAX_CHARS = 20;

export function deriveTitleFromText(text: string): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  // Array.from splits by code point so the cap can't cut an emoji in half
  return Array.from(collapsed).slice(0, DERIVED_TITLE_MAX_CHARS).join('');
}
