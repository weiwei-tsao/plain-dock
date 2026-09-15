# Markdown Module Rules (`src/lib/markdown/`)

## Overview

RICH and PLAIN notes both store canonical Markdown/plain-text in
`Note.content`. There is no HTML representation and no sanitizer — pasted
content is always inserted as plain text (clipboard HTML is intentionally
ignored everywhere).

## Module Contents

- `terminal-table.ts` — `detectTerminalTable(text)`: recognizes tab/box/ASCII
  bordered tables and code-like pasted text, used by the paste handler in
  `EditorCanvas.tsx` to turn a terminal/spreadsheet paste into a proper
  Markdown table or fenced code block.
- `text-projection.ts` — `markdownToPlainText(markdown)`: best-effort,
  regex-based Markdown -> plain text used for `Note.textContent` (sidebar
  preview, search, title fallback), Copy Plain, and Export `.txt`. Not a
  full parser — approximate results are fine for these consumers.
- `formatting.ts` — `toggleInlineMark`, `toggleLinePrefix`, `toggleCodeBlock`:
  pure functions taking `(text, selection, marker/prefix)` and returning
  `{ text, selection }`, used by `RichToolbar.tsx` via `MarkdownEditor`'s
  `applyFormatting`.
- `find-matches.ts` — `findMatchRanges(text, query)`: case-insensitive match
  positions, used by `MarkdownEditor`'s CodeMirror search-highlight
  extension (`src/components/editor/markdown-search-highlight.ts`).

## Adding a new toolbar action

Add a new pure function to `formatting.ts` (or a new marker/prefix argument
to an existing one) with its own unit test, then wire a button in
`RichToolbar.tsx` that calls it through `EditorCanvas.tsx`'s
`applyFormatting`. Never have `RichToolbar` touch the CodeMirror instance
directly.

## `Note.content` invariant

`content` is the same Markdown/plain-text string for both modes — `mode`
only selects which editor renders it. Any code touching `content` should
not assume RICH-mode content is HTML.
