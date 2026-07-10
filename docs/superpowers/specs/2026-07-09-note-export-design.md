# Note Export: .txt and .md Download

**Date:** 2026-07-09
**Status:** Approved

## Problem

There is no way to get a note's content out of PlainDock as a file. Users want to export any note as a plain text (`.txt`) or Markdown (`.md`) file, regardless of the note's PLAIN/RICH mode.

## Scope

Client-side only feature, entirely inside `src/components/editor/EditorCanvas.tsx`. No API route, no schema change, no new dependency.

## Design

### 1. Two export actions, always both available

Every note — PLAIN or RICH — gets two export actions: **Export .txt** and **Export .md**. These are not mode-gated; the *format* is always a choice, independent of the note's editing mode.

UI placement mirrors the existing "Copy Plain" / "Copy HTML" pair:
- Phone: two new rows in the overflow menu (`showOverflowMenu` block), plain-text rows reading "Export .txt" / "Export .md" — same style as the existing "Copy Plain" / "Copy HTML" rows there (icon + text, no badge), positioned after the Copy rows and before the delete divider.
- Tablet/desktop: two new icon buttons in the action bar, lucide `Download` icon each, with a small `TXT` / `MD` badge — same treatment as the existing inline `HTML` badge on the desktop "Copy Rich (HTML)" button (`rounded-sm border border-current px-1 text-[9px] font-black`). Each has a `title` tooltip ("Export as .txt" / "Export as .md") carrying the full label, same pattern as the existing desktop Copy/Delete buttons.

### 2. Content source per (mode × format)

| Mode | Format | Source | Conversion |
|------|--------|--------|------------|
| PLAIN | `.txt` | `plainContentRef.current` | none — raw text |
| PLAIN | `.md` | `plainContentRef.current` | none — identical content, only the extension differs (plain text has no markup to translate) |
| RICH | `.txt` | `editor.getJSON()` | existing `nodeToText()` — unchanged, already used for the RICH→PLAIN mode-switch path |
| RICH | `.md` | `editor.getJSON()` | new `nodeToMarkdown()` — sibling function to `nodeToText()`, same recursive walk over `TiptapNode` |

### 3. `nodeToMarkdown()` — new function next to `nodeToText()`

Node/mark → Markdown mapping (only nodes/marks actually reachable in this editor's schema — StarterKit + Underline + Image):

| Node/mark | Output |
|---|---|
| `paragraph` | text, then a blank line |
| `heading` (level 1–6) | `'#'.repeat(level) + ' ' + text`, then a blank line |
| `bulletList` > `listItem` | `- text` per item, one line each |
| `orderedList` > `listItem` | `1. text`, `2. text`, ... |
| `listItem` nested content | flattened to a single line — no toolbar action produces nested lists/multi-paragraph items in this app, so full CommonMark list-nesting is out of scope |
| `codeBlock` | fenced with `` ``` `` before and after |
| `blockquote` | each inner line prefixed `> ` |
| `hardBreak` | `\n` (single break, not a paragraph split) |
| `image` | `[image: alt]` — same placeholder convention `nodeToText()` already uses; never embeds the base64 `src` |
| mark `bold` | `**text**` |
| mark `italic` | `_text_` |
| mark `strike` | `~~text~~` |
| mark `code` | `` `text` `` |
| mark `underline` | `<u>text</u>` — raw HTML passthrough (Markdown has no native underline syntax; most renderers, e.g. GitHub/Obsidian, support inline HTML passthrough) |
| mark `link` | `[text](href)`, wraps outermost |

Note: this app has no `Color`/`TextStyle` Tiptap extension registered, so colored-span styling (mentioned in the sanitizer's `ALLOWED_STYLES`) does not currently survive into the editor's document model at all — it cannot appear in `editor.getJSON()` today. The HTML-passthrough rule above is written generally (for any mark without native Markdown syntax) so it will apply automatically if color support is ever added, but in practice today the only mark it affects is `underline`.

### 4. Filename

`sanitizeFilename(title: string): string` (new small helper, local to `EditorCanvas.tsx`):
- Trim the title.
- Replace filesystem-illegal characters (`\ / : * ? " < > |`) with `-`.
- Everything else — case, spaces, non-Latin scripts (Chinese, etc.) — is preserved as-is.
- Empty result (empty/whitespace-only title) falls back to `untitled`.

Full filename: `${sanitizeFilename(localTitle)}.${extension}` where extension is `txt` or `md` per the button clicked.

### 5. Download mechanism

Native browser download, no dependency:
```ts
function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
```
Two handlers, `handleExportTxt` and `handleExportMd`, each build the right content per the table in §2 and call `downloadTextFile`.

## Error Handling / Edge Cases

- Blob + anchor-click download of a text blob cannot meaningfully fail in a browser — no try/catch, no toast. This matches how a native file download behaves (silent success, browser shows its own download UI).
- Empty title → `untitled.txt` / `untitled.md`.
- Empty note body → an empty file downloads; not blocked.
- No async gap between reading current state and triggering the download, so switching notes mid-click isn't a race.

## Out of Scope

- No server-side export endpoint — content already lives in the client (`plainContent` / live `editor` state).
- No bulk/multi-note export.
- No new dependency (no `turndown` or similar) — the HTML surface is fully controlled by this app's own sanitizer and Tiptap schema, so a hand-written converter over the known node/mark set is sufficient.
- No nested-list Markdown fidelity (see §3) — not reachable via this app's UI today.
- No embedding of image bytes in the `.md` file — always the `[image: alt]` placeholder.

## Testing

- `npm run typecheck && npm run lint && npm run format:check`.
- Manual, dev server: create a PLAIN note with some text; export `.txt` and `.md`; confirm both download with identical content and the note's title as filename.
- Manual: create a RICH note using bold, italic, underline, strike, an H1 and H2, a bullet list, an ordered list, a code block, a blockquote, a pasted link, and a pasted image. Export `.txt` (via `nodeToText`) and `.md` (via `nodeToMarkdown`); open both files and confirm formatting/placeholders render as designed in §3.
- Manual: note with empty title → confirm downloaded filename is `untitled.txt` / `untitled.md`.
- Manual: note with a Chinese title (e.g. `周会记要`) → confirm filename preserves the Chinese characters.
