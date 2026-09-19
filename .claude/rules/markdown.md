# Markdown Module Rules (`src/lib/markdown/`)

## Overview

`Note.content` is canonical Markdown for every note. `Note.mode` is a frozen
compatibility field carried through saves unchanged; it no longer selects an
editor. Edit always uses CodeMirror. Preview renders escaped HTML through the
single `MarkdownPreview.tsx` boundary; raw note HTML is displayed as text.

## Module Contents

- `terminal-table.ts` — `detectTerminalTable(text)`: recognizes tab/box/ASCII
  bordered tables and code-like pasted text, used by the paste handler in
  `EditorCanvas.tsx` to turn a terminal/spreadsheet paste into a proper
  Markdown table or fenced code block.
- `text-projection.ts` — `markdownToPlainText(markdown)`: best-effort,
  regex-based Markdown -> plain text used for `Note.textContent` (sidebar
  preview, search, title fallback), Copy Plain, and Export `.txt`. Not a
  full parser — approximate results are fine for these consumers.
- `formatting.ts` — `toggleInlineMark`, `toggleLinePrefix`, `wrapCodeBlock`:
  pure functions taking `(text, selection, marker/prefix)` and returning
  `{ text, selection }`, used by `RichToolbar.tsx` via `MarkdownEditor`'s
  `applyFormatting`.
- `find-matches.ts` — `findMatchRanges(text, query)`: case-insensitive match
  positions, used by `MarkdownEditor`'s CodeMirror search-highlight
  extension (`src/components/editor/markdown-search-highlight.ts`).
- `render-html.ts` — parser-backed, GFM-aware Markdown-to-HTML rendering plus
  semantic heading extraction. It is the only source permitted to supply HTML
  to `MarkdownPreview.tsx`.

## Adding a new toolbar action

Add a new pure function to `formatting.ts` (or a new marker/prefix argument
to an existing one) with its own unit test, then wire a button in
`RichToolbar.tsx` that calls it through `EditorCanvas.tsx`'s
`applyFormatting`. Never have `RichToolbar` touch the CodeMirror instance
directly.

## `Note.content` invariant

`content` is the same canonical Markdown/plain-text string for every note.
`mode` is a frozen compatibility field carried through saves unchanged; it no
longer selects an editor or changes how `content` is interpreted.
