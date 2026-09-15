# Markdown-Native RICH Mode

## Problem

RICH mode is built on Tiptap/ProseMirror with `Note.content` storing HTML.
This forces `EditorCanvas.tsx` to juggle four representations of the same
document (Tiptap HTML, ProseMirror JSON, flattened plain text, exported
Markdown) plus a 3-layer HTML sanitizer (`src/lib/sanitizer/`) whose entire
purpose is keeping pasted/stored HTML safe for the ProseMirror schema. This
is the source of recurring editing bugs and an editing feel that doesn't
match typing Markdown directly.

## Core Invariant

```
content     = canonical Markdown / plain-text source (same field for both modes)
textContent = human-readable text projection (search / preview / title fallback)
mode        = presentation only (highlighted CodeMirror vs. plain textarea)
```

`mode` no longer determines how `content` is serialized. Switching modes is
a lossless, non-destructive operation.

```
                         Note
                          │
                ┌─────────┴─────────┐
                │                   │
            content             textContent
        canonical Markdown      display/search text
                │                   │
                │             sidebar preview,
                │             search, title fallback,
                │             empty-note check
                │
        ┌───────┴───────┐
        │               │
      RICH            PLAIN
   CodeMirror         textarea
   + syntax highlight
   + toolbar
```

`Note.content` / `Note.textContent` / `Note.mode` schema fields are
unchanged (`prisma/schema.prisma`) — this is a behavior change, not a schema
migration.

## Why `textContent` stays a separate projection

`textContent` is not a spare field — it is load-bearing today:

- `NotesList.tsx:28` — `note.title || deriveTitleFromText(note.textContent)`
- `NotesList.tsx:29` — sidebar preview text
- `NotesList.tsx:91` — search filter
- `app/api/notes/[id]/route.ts:61` — server-side title fallback on save
- `app/page.tsx:268` — empty-note-on-navigate-away deletion check

If `textContent` became the raw Markdown string, a note starting with
`## Shopping List` would show the title `"## Shopping List"` verbatim in the
sidebar and derived-title flows — a real, visible regression, not a
cosmetic one.

`textContent` is computed by a new pure function, `markdownToPlainText()`,
replacing the old HTML-based `getNoteTextContent()`. It is a regex-based
best-effort strip (heading markers, `** __ ~~` `` ` ``, `> ` blockquote
prefix, list markers, `[text](url)` → `text`, `![alt](src)` →
`[image: alt]`) — not a full Markdown parser. It doesn't need to be exact
(it only feeds search/preview/title), and a regex approach avoids running a
second parse pass over the document (CodeMirror's own Lezer parse is not
reused for this — see Alternatives Considered).

## Editor

Tiptap and all `@tiptap/*` packages, plus `lowlight` (used only for
Tiptap's code-block syntax highlighting), are removed. New dependency:
CodeMirror 6 (`@codemirror/state`, `@codemirror/view`, `@codemirror/language`,
`@codemirror/commands`, `@codemirror/lang-markdown`).

A new `src/components/editor/MarkdownEditor.tsx` replaces the
`<EditorContent editor={editor} />` branch in `EditorCanvas.tsx`. It owns
the CodeMirror instance and exposes what `EditorCanvas` currently gets from
Tiptap: current value, onChange, focus, current selection (for toolbar
actions and search-jump), and programmatic insert-at-selection (for pasted
images).

A `HighlightStyle` is defined to match the project's dark-only zinc/indigo
palette (`.claude/rules/styling.md`) — not a stock CodeMirror theme.

PLAIN mode's `<textarea>` is untouched.

## Mode switching

Both editors read and write the same canonical `content`; switching mode
changes only the active editor presentation — there is no copy or
conversion step:

- Delete `nodeToText`, `nodeToMarkdown`, `applyMarks`, `BLOCK_NODE_TYPES`
  (EditorCanvas.tsx:91–174).
- Delete the switch-to-plain confirmation dialog (`showModeConfirm`,
  `modeConfirmHasImages`) — nothing is lost by switching, so there is
  nothing to confirm.
- Word/character counting collapses to one plain-string implementation
  shared by both modes (today it's two different `editor.getText()` calls
  with different block separators plus a separate plain-string path).

## Paste

**All textual paste enters PlainDock as plain text. Clipboard HTML is
intentionally ignored.**

```
text/plain
   ↓
detectTerminalTable()
   ├─ table → Markdown table syntax
   ├─ code  → fenced code block
   └─ none  → inserted unchanged
```

`detectTerminalTable` (`src/lib/sanitizer/terminalTable.ts`) is kept as-is
(pure text logic, unrelated to HTML) and moves to `src/lib/markdown/`.
Everything else in `src/lib/sanitizer/` is deleted: `sanitizeHTML`,
`collapseEmptyParagraphs`, `wrapPlainText`, `config.ts` (`ALLOWED_TAGS`/
`ALLOWED_STYLES`/`DANGEROUS_TAGS`), `normalize.ts`, `markdown.ts`. The
`markdown-it` dependency is removed with it — confirmed via grep to be used
only by `sanitizer/markdown.ts`.

Pasted images: unchanged pipeline (`resizeImageToDataURL` → WebP data URL),
only the insertion syntax changes, from a Tiptap image node to
`![filename](data:image/webp;base64,...)` inserted at the cursor. This does
not introduce base64 into the data layer — it was already embedded in
stored HTML `<img src="data:...">`. The one new risk is CodeMirror-specific:
a very long single line (the data URI) can be slower to
parse/highlight than normal text. Mitigated by a manual smoke test with a
handful of real embedded images before shipping, not by an architecture
change (attachment storage is explicitly out of scope for this project).

## Toolbar (`RichToolbar`)

Reduced to what makes sense without a rendered view (no Live Preview in
v1): bold, italic, strikethrough, inline code, H1, H2, bullet list, ordered
list, blockquote, fenced code block. **Underline and Clear Formatting are
both dropped in v1**, for related reasons:

- Underline: inserting bare `<u></u>` tags with zero visual feedback in a
  non-rendering editor reads as broken; it comes back when Live Preview
  (v2) can actually render it.
- Clear Formatting: on a structured ProseMirror selection, "clear
  formatting" is well-defined (`unsetAllMarks()`). On a raw text selection
  it isn't — `markdownToPlainText("hello")` does nothing if the user
  selected only the word inside `**hello**`, and a partial selection like
  `**hel` has no clean semantics without reaching outside the selection to
  find the matching marker. Rather than ship a rule that only "sort of"
  clears formatting depending on exactly what's selected, it's dropped
  until there's a concrete need for it.

Toolbar logic becomes pure functions, decoupled from any CodeMirror
transaction API, taking/returning `(text, selectionStart, selectionEnd)`:

```ts
toggleInlineMark(text, sel, marker)      // ** _ ~~ `
toggleLinePrefix(text, sel, prefix)      // # ## - 1. >
toggleCodeBlock(text, sel)
```

`MarkdownEditor.tsx` translates these pure-function results into CodeMirror
transactions; `RichToolbar.tsx` never touches CodeMirror directly.

## Search highlighting

The custom Tiptap `SearchHighlight` extension (ProseMirror decorations +
`getFirstMatchPos` + manual `domAtPos`/`scrollIntoView`) is replaced by a
CodeMirror `ViewPlugin` doing the same thing: highlight all matches and jump
to the first match when `searchQuery` or the active note changes, without
re-jumping on ordinary document edits. This is a straightforward port — no
behavior change.

## Export / Copy

Preserves the existing product contract by picking the right source per
action instead of collapsing everything to raw Markdown:

| Action | Source |
|---|---|
| Export `.md` | `content` (raw Markdown) |
| Export `.txt` | `textContent` (projection) |
| Copy Plain | `textContent` (projection) |

This keeps "Copy Plain strips formatting" and "Export Text is plain" true
without reintroducing a second document model — `textContent` was already
being computed for other reasons.

## Migration

Existing RICH notes have HTML in `content`. One-off script,
`scripts/migrate-rich-html-to-markdown.mjs`, following the existing
`sync-turso-to-docker.mjs` backup convention:

```
default: --dry-run (no writes)
--write: perform the migration
for each RICH note: HTML → Markdown, parsed with jsdom (already a
  devDependency)
recompute textContent via the new markdownToPlainText() for consistency
output: converted / skipped / failed counts
```

**Conversion scope is the actual RICH storage schema, not the sanitizer's
`ALLOWED_TAGS` allowlist.** Those are not the same set: `Image.configure({
allowBase64: true })` lets the editor insert an image node directly (via
the clipboard-image paste branch, which never goes through
`sanitizeHTML`), and `onUpdate` saves `ed.getHTML()` straight to `content`
with no sanitizer pass at save time either. So existing RICH notes can
legitimately contain `<img src="data:...">` even though `img` was never in
`ALLOWED_TAGS`. The migration must handle it as an explicit case —
`<img src="..." alt="...">` → `![alt](src)`, base64 data URIs preserved
as-is — or it silently drops images on conversion.

Backup differs by environment and must not be described as one mechanism:

- **Local dev / Docker (file SQLite):** before `--write`, copy the database
  file plus its `-wal`/`-shm` sidecars where present — the same convention
  `sync-turso-to-docker.mjs` already uses.
- **Turso (remote libSQL):** there is no local file to copy. Before running
  `--write` against a `libsql://`/Turso `DATABASE_URL`, require an
  independent backup — e.g. `turso db shell <database> .dump > backup.sql`
  — and treat its absence as a hard stop, not a warning.

Not designed as idempotent or safe to run repeatedly against live traffic —
it's a one-time cutover, run once per environment (local dev SQLite,
Docker SQLite, Turso — the three real data paths documented in
`CLAUDE.md`), verified manually, then deleted from the repo. No migration
marker/versioning is needed for a script with this lifecycle.

## Testing

- `src/lib/markdown/text-projection.test.ts` — `markdownToPlainText()`
- `src/lib/markdown/formatting.test.ts` — `toggleInlineMark`,
  `toggleLinePrefix`, `toggleCodeBlock`
- `src/lib/markdown/terminal-table.test.ts` — moved from
  `sanitizer/terminalTable.test.mjs`, unchanged
- Delete `src/lib/sanitizer/index.test.ts` (tests the deleted HTML pipeline)
- Migration script conversion function: fixture-based tests covering each
  `ALLOWED_TAGS` element plus the `<img>` special case (including a
  base64 `data:` src), since that function is the one place this refactor
  touches real user data
- Playwright e2e (`e2e/`): RICH-mode specs currently assume ProseMirror DOM
  structure and must be updated for CodeMirror's DOM — typing, autosave,
  search highlight, toolbar, paste (terminal table, image), mode switch
- Manual smoke test: open a handful of real notes with embedded images to
  confirm no CodeMirror long-line slowdown

## Documentation follow-up (not part of this spec's implementation, but must not be forgotten)

- `.claude/rules/sanitizer.md` describes the 3-layer pipeline being deleted
  — needs rewriting or removal
- `CLAUDE.md`'s "Sanitizer" architecture section needs updating
- `/extend-sanitizer` skill becomes stale and should be removed or reworked
- `CLAUDE.md`'s file list (`src/lib/sanitizer/*`) needs updating to point at
  the new `src/lib/markdown/*` module

## Alternatives Considered

**`textContent` via CodeMirror's Lezer parse tree** instead of regex: more
correct (won't strip `**` found inside an inline code span), but means
parsing the document twice — once live in the editor, once standalone on
save — to serve a field whose only consumers (search, sidebar preview,
title fallback) tolerate an approximate projection. Rejected as
unnecessary complexity for the accuracy gained.

**Keep clipboard-HTML → Markdown conversion** (e.g. via `turndown`) instead
of plain-text-only paste: preserves "paste from a webpage keeps its
formatting." Rejected — the entire point of this refactor is eliminating
the HTML-handling complexity that caused the original bugs; reintroducing
an HTML→Markdown conversion step with its own edge cases undoes that.
