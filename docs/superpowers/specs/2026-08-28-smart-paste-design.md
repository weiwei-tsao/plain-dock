# Smart Paste: GFM Tables, Terminal Tables, Markdown-Aware Plain-Text Paste

## Context

RICH-mode paste currently loses structure when content comes from developer
tools (VS Code, terminals, Claude Code, chat UIs):

- Pasted GFM tables (`| a | b |`) arrive as HTML from most sources, but
  `sanitizeHTML`'s Layer 3 "structure downgrade" flattens `<table>` into
  tab-separated `<p>` text — the table never renders as a table.
- Tiptap has no table extension installed, so even if a `<table>` survived
  sanitization, the editor schema couldn't represent it.
- Pasted `text/plain` never gets Markdown-interpreted. `**bold**`, `- list`,
  `# heading`, and pipe tables all land as literal characters.
- Terminal box-drawing tables (`┌─┬─┐...`) and ASCII grid tables
  (`+---+---+`) are neither valid HTML nor valid Markdown — they always
  land as broken, misaligned text today.
- HTML paste from VS Code/terminal apps that emit one `<div>`/`<p>` per
  source line turns blank lines into runs of empty paragraphs, which
  nothing currently collapses.

## Goals

1. A GFM pipe table pasted (as HTML or as raw Markdown text) renders as a
   real `<table>` in the editor, with inline formatting (bold/italic/code/
   links) preserved inside cells.
2. Terminal box-drawing / ASCII grid tables are detected on paste:
   reliably-parseable ones become real tables; unparseable ones are wrapped
   in a fenced code block instead of arriving as misaligned text.
3. Plain-text paste (`text/plain`) is interpreted as Markdown (bold,
   italic, code, headings, lists, tables, links) rather than inserted
   as literal characters.
4. Runs of blank lines from HTML paste (VS Code/terminal per-line HTML)
   collapse instead of leaving walls of empty paragraphs.

## Non-goals

- Making Markdown the canonical storage format. RICH mode's source of
  truth stays Tiptap HTML (`note.content`); Markdown export
  (`nodeToMarkdown`) is unaffected and unrelated to this change.
- Task lists (`- [ ] foo`), colspan/rowspan, or any table feature outside
  plain GFM pipe tables (GFM tables have no merged cells, so none of this
  is needed for the stated goal).
- Detecting a terminal table embedded inside a larger mixed paste. Only
  whole-clipboard detection is in scope; a paste that's mostly prose with
  a table fragment in the middle is not covered.
- Changes to PLAIN mode's paste handling, or to the PLAIN→RICH mode-switch
  conversion (`wrapPlainText`, used by `handleSwitchMode`) — both are
  unrelated to the paste path and stay as-is.

## Architecture

Two new pure-logic modules, one dependency, and edits to the existing
sanitizer and paste handler. HTML remains the wire/storage format
end-to-end; Markdown text is only ever an intermediate representation
converted to HTML before it touches Tiptap.

```
Clipboard
   │
   ├─ image/*           → existing resizeImageToDataURL path (unchanged)
   │
   ├─ text/html present?
   │       │
   │       ├─ no  ─────────────────────────────┐
   │       │                                    │
   │       └─ yes, but has no <table> AND       │
   │          text/plain's markdown pipeline    │
   │          resolves to a real <table>        │
   │          → prefer the text/plain result    │
   │          (terminal/markdown table beats     │
   │           a lossy per-line HTML dump)       │
   │       │                                    │
   │       └─ yes, and neither condition above ─┤
   │          applies → use html as-is           │
   │                                              ▼
   │                                    text/plain path:
   │                                    terminalTable.detect(text)
   │                                      ├─ 'table' → markdown table string
   │                                      ├─ 'code'  → fenced ```text block
   │                                      └─ 'none'  → text unchanged
   │                                              │
   │                                    markdownToHtml(...) [markdown-it]
   │                                              │
   ▼                                              ▼
sanitizeHTML(html)  ◄────────────────────────────┘
(strip danger, normalize tags, allow table tags —
 security/allowlist semantics only, unchanged contract)
   │
   ▼
collapseEmptyParagraphs(clean)   ← paste-only step, NOT part of
   │                                sanitizeHTML's contract
   ▼
editor.commands.insertContent(clean)
```

### 1. Tiptap table support

Add official extensions, version-pinned to match the existing `@tiptap/*`
deps (`^2.27.2`): `@tiptap/extension-table`, `@tiptap/extension-table-row`,
`@tiptap/extension-table-header`, `@tiptap/extension-table-cell`.
Registered in `EditorCanvas.tsx`'s `useEditor` extensions array alongside
`StarterKit`. `Table` configured non-resizable (`resizable: false` —
resizing wasn't requested; skip it, add if asked).

Tiptap's table NodeView wraps the rendered `<table>` in
`<div class="tableWrapper">` automatically (confirmed against v2.x
behavior). `globals.css` gets a matching block: `.tableWrapper` scrolls
horizontally (`overflow-x: auto`), `table` uses `border-collapse: collapse`
with **no** `table-layout: fixed` and **no** forced `width: 100%` — columns
stay content-sized (`table-layout: auto`, the default) so a table with
long cell content grows to fit and the wrapper scrolls, rather than
compressing every column to fit the pane. Cell/header borders and header
background follow the existing zinc dark palette (`styling.md`),
consistent with how the rest of ProseMirror content is styled in that file
today.

### 2. Sanitizer: table pass-through

`sanitizer/config.ts` — add `table`, `thead`, `tbody`, `tr`, `th`, `td` to
`ALLOWED_TAGS`.

`sanitizer/index.ts` — remove the existing "Layer 3: Structure Downgrade —
Tables" block (currently replaces every `<tr>` with a tab-joined `<p>` and
unwraps the table). This is a deliberate deviation from the PRD v1.7
2.2.A behavior documented in this file's header comment; replace the
comment to say tables are now an allowed structure, not downgraded, and
why (GFM table support requested). Media downgrade (`img`/`video` →
`[TAG: src]` placeholder) is untouched — out of scope.

No colspan/rowspan attribute preservation in Final Cleanup — GFM Markdown
tables have no merged-cell concept, so pasted HTML tables with spans will
lose them same as today. Acceptable per non-goals.

### 3. Blank-line / empty-paragraph collapse

This is paste normalization, not a change to what `sanitizeHTML` means —
`sanitizeHTML`'s contract (security stripping + tag/style allowlisting)
stays exactly as it is today, since other future callers of it shouldn't
inherit a paste-specific opinion about blank lines. New standalone
exported function instead: `collapseEmptyParagraphs(html: string): string`
in `sanitizer/index.ts`, operating on parsed top-level block children —
collapse consecutive "empty" paragraphs (no text content, or only a
`<br>`) into at most one, and drop leading/trailing empty ones entirely.

The paste handler calls it explicitly, after `sanitizeHTML`, on both the
direct HTML-paste path and the markdown-it-generated HTML path — so both
are covered, but by an explicit second step at the call site rather than
folded into `sanitizeHTML` itself.

The plain-text path (`wrapPlainText`, still used for PLAIN→RICH mode
switching) already collapses multi-blank-line runs via its
`/\n\n+/` split and needs no change.

### 4. `markdown-it` integration

New dependency: `markdown-it` (small, no heavy transitive tree, actively
maintained). Its `default` preset already includes GFM-style pipe tables
and strikethrough without extra plugins. Task lists are a plugin
(`markdown-it-task-lists`) — not added, out of scope.

New file `src/lib/sanitizer/markdown.ts`:

```ts
import MarkdownIt from 'markdown-it';

const md = new MarkdownIt('default', { html: false, linkify: true });

export function markdownToHtml(text: string): string {
  return md.render(text);
}
```

`html: false` is a security boundary, not a style choice: `text/plain`
clipboard data is untrusted, so literal `<script>`-looking text must be
escaped as text, never interpreted as real HTML, before it reaches
`sanitizeHTML` (which is defense-in-depth on top, not the only layer).
`linkify: true` auto-links bare URLs; `sanitizeHTML`'s existing
`http`/`mailto` protocol allowlist on `<a href>` still applies afterward.

Table cell content is parsed as inline Markdown by markdown-it's table
rule by default (confirmed design choice — cells keep bold/italic/code/
links, not flattened to plain text).

### 5. Terminal table detection

New file `src/lib/sanitizer/terminalTable.ts`. Exports one function,
operating on the *entire* trimmed pasted text (no sub-region detection):

```ts
type TerminalTableResult =
  | { type: 'table'; markdown: string }
  | { type: 'code' }
  | { type: 'none' };

function detectTerminalTable(text: string): TerminalTableResult;
```

Heuristic:

- Recognize two border/content vocabularies: Unicode box-drawing
  (`┌┬┐├┼┤└┴┘│─╭╮╰╯╔╗╚╝╠╣╦╩║═`) and ASCII grid (`+---+---+` borders,
  `| a | b |` content rows).
- A line is a "border" line if every non-whitespace character belongs to
  the matching border vocabulary. A line is a "content" line if it starts
  and ends with the vocabulary's vertical delimiter (`│` or `|`).
- If at least one border line and two-or-more content lines are found,
  and every content line splits into the same number of delimited cells
  → build a Markdown table string: first content row as header, a
  `| --- | --- |` alignment row, remaining content rows as data. Literal
  `|` characters inside cell text are escaped (`\|`) so they can't break
  the generated table syntax. Return `{ type: 'table', markdown }`.
- If border/content lines are found (so the paste is clearly *trying* to
  be a table — at least 50% of the paste's non-blank lines match a
  border or content pattern) but column counts are inconsistent or
  delimiters don't line up cleanly → return
  `{ type: 'code' }`: the whole original text gets wrapped in a fenced
  ` ```text ` block by the caller before going to `markdownToHtml`, so it
  renders preformatted and monospace instead of misaligned prose. This is
  the documented "safe fallback" — never silently discard or mangle
  content that looks like a table but can't be reliably parsed.
- Otherwise → `{ type: 'none' }`, text is passed to `markdownToHtml`
  unchanged.

### 6. Paste handler changes (`EditorCanvas.tsx`)

Factor the text/plain → HTML conversion into one helper so both branches
below can call it without duplicating the terminal-table/markdown-it
logic:

```ts
function textToCleanHtml(text: string): string {
  const detection = detectTerminalTable(text);
  const markdownSource =
    detection.type === 'table'
      ? detection.markdown
      : detection.type === 'code'
        ? '```text\n' + text + '\n```'
        : text;
  return sanitizeHTML(markdownToHtml(markdownSource));
}
```

`handlePaste` branching changes from "html wins whenever present" to:
prefer the text/plain result when the HTML has no real `<table>` of its
own *and* the text/plain content resolves to one — i.e. a terminal/
Markdown table in the plain-text clipboard entry beats a lossy per-line
HTML dump that never had table structure to begin with. Any other
mix (html has its own table, or text doesn't resolve to one) keeps HTML's
existing priority, since HTML is normally the richer representation
(links, inline marks, structure) and shouldn't be downgraded to text
without a concrete reason:

```ts
if (html && html.trim() !== '') {
  const htmlHasTable = /<table[\s>]/i.test(html);
  let clean = sanitizeHTML(html);

  if (!htmlHasTable && text) {
    const fromText = textToCleanHtml(text);
    if (/<table[\s>]/i.test(fromText)) clean = fromText;
  }

  editor.commands.insertContent(collapseEmptyParagraphs(clean));
  return true;
} else if (text) {
  editor.commands.insertContent(collapseEmptyParagraphs(textToCleanHtml(text)));
  return true;
}
```

## Testing

Following this repo's existing convention (`scripts/sync-turso-to-docker
.test.mjs`, Node's built-in `node --test`, no framework): add
`src/lib/sanitizer/terminalTable.test.mjs` covering box-drawing table →
markdown conversion, ASCII grid → markdown conversion, ambiguous/
inconsistent input → `'code'`, and plain prose → `'none'`. This module has
branches and no DOM dependency, so it's a natural fit for the same
lightweight pattern.

`markdownToHtml` and `sanitizeHTML` depend on `DOMParser`/browser APIs
(`sanitizeHTML` already does today, untested) — no new automated test for
either; verified manually in the browser (paste a GFM table copied from
GitHub, paste a `\`\`\`ls -la\`\`\`` box-drawing table from a terminal,
paste **bold**/- list/# heading plain text from a plain-text source, paste
VS Code code with blank lines).

## New dependencies

- `markdown-it` (dependency)
- `@types/markdown-it` (devDependency, if not bundled)
- `@tiptap/extension-table`, `@tiptap/extension-table-row`,
  `@tiptap/extension-table-header`, `@tiptap/extension-table-cell`
  (dependencies, pinned `^2.27.2`)

## Files touched

- `src/components/editor/EditorCanvas.tsx` — table extensions registered,
  `handlePaste` rewritten (html-vs-text-table priority, shared
  `textToCleanHtml` helper, `collapseEmptyParagraphs` call sites)
- `src/lib/sanitizer/config.ts` — table tags allowlisted
- `src/lib/sanitizer/index.ts` — table downgrade removed, empty-paragraph
  collapse added, header comment updated
- `src/lib/sanitizer/markdown.ts` — new
- `src/lib/sanitizer/terminalTable.ts` — new
- `src/lib/sanitizer/terminalTable.test.mjs` — new
- `src/app/globals.css` — table CSS block
- `package.json` — new deps
