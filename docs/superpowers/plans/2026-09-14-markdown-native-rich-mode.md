# Markdown-Native RICH Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Tiptap/ProseMirror-based RICH mode with a CodeMirror 6 Markdown source editor, making `Note.content` a canonical Markdown/plain-text string for both modes, and delete the HTML sanitizer pipeline this replaces.

**Architecture:** `content` is the same plain-text/Markdown string for RICH and PLAIN; `mode` only picks which editor renders it (CodeMirror with Markdown syntax highlighting vs. a plain `<textarea>`). `textContent` remains a separate, lightweight regex-based projection of `content` used for search/preview/title-fallback, computed by a new `markdownToPlainText()` function. Toolbar actions and search highlighting become pure text functions plus thin CodeMirror glue, replacing ProseMirror commands/extensions.

**Tech Stack:** Next.js 16, React 19, TypeScript strict, CodeMirror 6 (`@codemirror/*`, `@lezer/highlight`), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-14-markdown-native-rich-mode-design.md`

## Global Constraints

- `Note.content` / `Note.textContent` / `Note.mode` schema fields are unchanged — no Prisma migration in this plan.
- `mode` never determines how `content` is serialized; switching modes must not alter `content`.
- `textContent` is computed by `markdownToPlainText()`, never the raw Markdown string.
- Clipboard HTML is intentionally ignored everywhere paste is handled — only `text/plain` is read.
- No new HTML→Markdown conversion library (e.g. `turndown`) is introduced for the live paste path — only the one-off migration script does HTML→Markdown, via `jsdom` (already a devDependency).
- New dependencies, pinned exact versions: `@codemirror/state@6.7.4`, `@codemirror/view@6.43.11`, `@codemirror/language@6.12.4`, `@codemirror/commands@6.11.0`, `@codemirror/lang-markdown@6.5.2`, `@lezer/highlight@1.2.3`.
- Removed dependencies: `@tiptap/extension-code-block-lowlight`, `@tiptap/extension-image`, `@tiptap/extension-link`, `@tiptap/extension-table`, `@tiptap/extension-table-cell`, `@tiptap/extension-table-header`, `@tiptap/extension-table-row`, `@tiptap/extension-underline`, `@tiptap/react`, `@tiptap/starter-kit`, `lowlight`, `markdown-it`, `@types/markdown-it`.
- Migration script (`scripts/migrate-rich-html-to-markdown.mjs`) defaults to dry-run; `--write` is required to mutate; against a Turso `DATABASE_URL` it additionally requires `--turso-backup-confirmed` or it hard-stops.
- RichToolbar drops Underline and Clear Formatting in v1 (see spec's "Toolbar" section for why).

## Implementation clarifications beyond the spec

The spec settles the architecture; these four small decisions were needed to actually write the code and weren't explicit in the spec. Flagging them here rather than deciding silently:

1. **Word/character counts for RICH mode** are computed from `markdownToPlainText(content)`, not raw `content` — otherwise `**` / `#` syntax characters would inflate the count, regressing the old Tiptap behavior (which counted rendered text, not markup).
2. **RICH mode now uses the same `font-mono text-sm text-zinc-400 leading-relaxed` styling as PLAIN mode** (`.claude/rules/styling.md`'s existing PLAIN-mode convention), since both are now source-text editors rather than one being a rendered rich-text canvas.
3. **Toolbar buttons no longer show an active/highlighted state** (the old `editor.isActive('bold')` check). Determining "is the current selection bold" from raw Markdown text has the same partial-selection ambiguity that got Clear Formatting dropped — buttons become stateless action triggers.
4. **`toggleCodeBlock` does not support toggling an existing fence back off** in v1 — it only wraps the current selection in a new fence. A user can delete the ` ``` ` lines by hand, same as any other hand-typed Markdown. Real toggle-off detection is deferred until it's a real pain point.

---

### Task 1: Move terminal-table detection into `src/lib/markdown/`

**Files:**
- Create: `src/lib/markdown/terminal-table.ts`
- Create: `src/lib/markdown/terminal-table.test.ts`
- Delete: `src/lib/sanitizer/terminalTable.ts`
- Delete: `src/lib/sanitizer/terminalTable.test.mjs`
- Modify: `src/components/editor/EditorCanvas.tsx:30` (the `detectTerminalTable` import line)

**Interfaces:**
- Produces: `detectTerminalTable(text: string): TerminalTableResult` where `TerminalTableResult = { type: 'table'; markdown: string } | { type: 'code' } | { type: 'none' }` — used by Task 8.

- [ ] **Step 1: Copy the module unchanged**

Copy the full contents of `src/lib/sanitizer/terminalTable.ts` verbatim to `src/lib/markdown/terminal-table.ts`. No logic changes — this is a pure relocate.

- [ ] **Step 2: Copy and convert the test file**

Copy the full contents of `src/lib/sanitizer/terminalTable.test.mjs` to `src/lib/markdown/terminal-table.test.ts`, changing only the import path to `./terminal-table` and the import statement to standard ESM `import { detectTerminalTable } from './terminal-table';` (matching this project's `.ts` test convention elsewhere, e.g. `src/lib/note-title.test.ts`).

- [ ] **Step 3: Run the moved tests**

Run: `npx vitest run src/lib/markdown/terminal-table.test.ts`
Expected: PASS, same test count as the original `terminalTable.test.mjs` had.

- [ ] **Step 4: Delete the old files**

```bash
git rm src/lib/sanitizer/terminalTable.ts src/lib/sanitizer/terminalTable.test.mjs
```

- [ ] **Step 5: Update the one import site**

In `src/components/editor/EditorCanvas.tsx`, change:

```ts
import {
  sanitizeHTML,
  collapseEmptyParagraphs,
  markdownToHtml,
  detectTerminalTable,
  wrapPlainText,
  getNoteTextContent,
} from '@/lib/sanitizer';
```

to (leave the rest of the sanitizer imports as-is for now — they're still used elsewhere in this file until Task 8):

```ts
import {
  sanitizeHTML,
  collapseEmptyParagraphs,
  markdownToHtml,
  wrapPlainText,
  getNoteTextContent,
} from '@/lib/sanitizer';
import { detectTerminalTable } from '@/lib/markdown/terminal-table';
```

- [ ] **Step 6: Verify the app still builds**

Run: `npm run typecheck && npm run test`
Expected: both PASS (no other file imported `detectTerminalTable` from the old path — confirmed via `grep -rn "detectTerminalTable" src/` before this task).

- [ ] **Step 7: Commit**

```bash
git add src/lib/markdown/terminal-table.ts src/lib/markdown/terminal-table.test.ts src/components/editor/EditorCanvas.tsx
git commit -m "refactor(sanitizer): move terminal-table detection to lib/markdown"
```

---

### Task 2: `markdownToPlainText()` text projection (TDD)

**Files:**
- Create: `src/lib/markdown/text-projection.ts`
- Test: `src/lib/markdown/text-projection.test.ts`

**Interfaces:**
- Produces: `markdownToPlainText(markdown: string): string` — consumed by Task 8 (`textContent`, word/char counts, Copy Plain, Export `.txt`) and Task 10 (migration script, as a duplicated copy — see Task 10).

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/markdown/text-projection.test.ts
import { describe, it, expect } from 'vitest';
import { markdownToPlainText } from './text-projection';

describe('markdownToPlainText', () => {
  it('strips heading markers', () => {
    expect(markdownToPlainText('## Shopping List')).toBe('Shopping List');
  });

  it('strips bullet and ordered list markers', () => {
    expect(markdownToPlainText('- Milk\n1. Eggs')).toBe('Milk\nEggs');
  });

  it('strips bold, italic, and strikethrough delimiters', () => {
    expect(markdownToPlainText('**bold** _italic_ ~~gone~~')).toBe('bold italic gone');
  });

  it('strips inline code backticks but keeps the content', () => {
    expect(markdownToPlainText('run `npm test` now')).toBe('run npm test now');
  });

  it('strips blockquote prefixes', () => {
    expect(markdownToPlainText('> quoted line')).toBe('quoted line');
  });

  it('reduces a link to its label', () => {
    expect(markdownToPlainText('[PlainDock](https://example.com)')).toBe('PlainDock');
  });

  it('reduces an image to an [image: alt] placeholder', () => {
    expect(markdownToPlainText('![screenshot](data:image/webp;base64,AAA)')).toBe(
      '[image: screenshot]',
    );
  });

  it('leaves plain text with no markdown syntax unchanged', () => {
    expect(markdownToPlainText('just plain text')).toBe('just plain text');
  });

  it('returns an empty string for empty input', () => {
    expect(markdownToPlainText('')).toBe('');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/markdown/text-projection.test.ts`
Expected: FAIL — `Cannot find module './text-projection'`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/markdown/text-projection.ts

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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/markdown/text-projection.test.ts`
Expected: PASS, all 9 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/markdown/text-projection.ts src/lib/markdown/text-projection.test.ts
git commit -m "feat(markdown): add markdownToPlainText text projection"
```

---

### Task 3: Toolbar pure functions (TDD)

**Files:**
- Create: `src/lib/markdown/formatting.ts`
- Test: `src/lib/markdown/formatting.test.ts`

**Interfaces:**
- Produces:
  - `interface Selection { start: number; end: number }`
  - `interface FormattingResult { text: string; selection: Selection }`
  - `toggleInlineMark(text: string, sel: Selection, marker: string): FormattingResult`
  - `toggleLinePrefix(text: string, sel: Selection, prefix: string): FormattingResult`
  - `toggleCodeBlock(text: string, sel: Selection): FormattingResult`
  - Consumed by Task 7 (`MarkdownEditorHandle.applyFormatting`) and Task 8 (`RichToolbar`).

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/markdown/formatting.test.ts
import { describe, it, expect } from 'vitest';
import { toggleInlineMark, toggleLinePrefix, toggleCodeBlock } from './formatting';

describe('toggleInlineMark', () => {
  it('wraps a selection that has no marker yet', () => {
    const result = toggleInlineMark('hello world', { start: 0, end: 5 }, '**');
    expect(result.text).toBe('**hello** world');
    expect(result.selection).toEqual({ start: 2, end: 7 });
  });

  it('unwraps a selection already surrounded by the marker', () => {
    const result = toggleInlineMark('**hello** world', { start: 2, end: 7 }, '**');
    expect(result.text).toBe('hello world');
    expect(result.selection).toEqual({ start: 0, end: 5 });
  });

  it('inserts an empty pair at the cursor when the selection is collapsed', () => {
    const result = toggleInlineMark('hello world', { start: 5, end: 5 }, '**');
    expect(result.text).toBe('hello**** world');
    expect(result.selection).toEqual({ start: 7, end: 7 });
  });
});

describe('toggleLinePrefix', () => {
  it('adds a heading marker to a single line', () => {
    const result = toggleLinePrefix('Shopping List', { start: 0, end: 0 }, '# ');
    expect(result.text).toBe('# Shopping List');
  });

  it('removes an existing heading marker (toggle off)', () => {
    const result = toggleLinePrefix('# Shopping List', { start: 2, end: 2 }, '# ');
    expect(result.text).toBe('Shopping List');
  });

  it('adds a bullet marker to every non-empty line in a multi-line selection', () => {
    const text = 'Milk\nEggs';
    const result = toggleLinePrefix(text, { start: 0, end: text.length }, '- ');
    expect(result.text).toBe('- Milk\n- Eggs');
  });

  it('leaves blank lines in the selection untouched', () => {
    const text = 'Milk\n\nEggs';
    const result = toggleLinePrefix(text, { start: 0, end: text.length }, '- ');
    expect(result.text).toBe('- Milk\n\n- Eggs');
  });
});

describe('toggleCodeBlock', () => {
  it('wraps the selected line(s) in a fenced code block', () => {
    const result = toggleCodeBlock('const x = 1;', { start: 0, end: 12 });
    expect(result.text).toBe('```\nconst x = 1;\n```');
    expect(result.selection).toEqual({ start: 4, end: 16 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/markdown/formatting.test.ts`
Expected: FAIL — `Cannot find module './formatting'`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/markdown/formatting.ts

export interface Selection {
  start: number;
  end: number;
}

export interface FormattingResult {
  text: string;
  selection: Selection;
}

export function toggleInlineMark(text: string, sel: Selection, marker: string): FormattingResult {
  const { start, end } = sel;
  const before = text.slice(Math.max(0, start - marker.length), start);
  const after = text.slice(end, end + marker.length);

  if (before === marker && after === marker) {
    const newText =
      text.slice(0, start - marker.length) +
      text.slice(start, end) +
      text.slice(end + marker.length);
    return {
      text: newText,
      selection: { start: start - marker.length, end: end - marker.length },
    };
  }

  const newText = text.slice(0, start) + marker + text.slice(start, end) + marker + text.slice(end);
  return { text: newText, selection: { start: start + marker.length, end: end + marker.length } };
}

function lineBounds(text: string, sel: Selection): { lineStart: number; lineEnd: number } {
  const lineStart = text.lastIndexOf('\n', sel.start - 1) + 1;
  const nextBreak = text.indexOf('\n', sel.end);
  const lineEnd = nextBreak === -1 ? text.length : nextBreak;
  return { lineStart, lineEnd };
}

export function toggleLinePrefix(text: string, sel: Selection, prefix: string): FormattingResult {
  const { lineStart, lineEnd } = lineBounds(text, sel);
  const block = text.slice(lineStart, lineEnd);
  const lines = block.split('\n');
  const nonEmpty = lines.filter((l) => l.trim() !== '');
  const allPrefixed = nonEmpty.length > 0 && nonEmpty.every((l) => l.startsWith(prefix));

  const newLines = lines.map((l) => {
    if (l.trim() === '') return l;
    return allPrefixed ? l.slice(prefix.length) : prefix + l;
  });
  const newBlock = newLines.join('\n');
  const newText = text.slice(0, lineStart) + newBlock + text.slice(lineEnd);
  return { text: newText, selection: { start: lineStart, end: lineStart + newBlock.length } };
}

export function toggleCodeBlock(text: string, sel: Selection): FormattingResult {
  const { lineStart, lineEnd } = lineBounds(text, sel);
  const block = text.slice(lineStart, lineEnd);
  const fenced = '```\n' + block + '\n```';
  const newText = text.slice(0, lineStart) + fenced + text.slice(lineEnd);
  return { text: newText, selection: { start: lineStart + 4, end: lineStart + 4 + block.length } };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/markdown/formatting.test.ts`
Expected: PASS, all 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/markdown/formatting.ts src/lib/markdown/formatting.test.ts
git commit -m "feat(markdown): add pure formatting functions for the rich toolbar"
```

---

### Task 4: Pure `findMatchRanges` search helper (TDD)

**Files:**
- Create: `src/lib/markdown/find-matches.ts`
- Test: `src/lib/markdown/find-matches.test.ts`

**Interfaces:**
- Consumes: `indexOfCI(text: string, query: string, fromIndex?: number): number` from `src/lib/search-highlight.tsx` (existing, unchanged).
- Produces: `interface MatchRange { from: number; to: number }`, `findMatchRanges(text: string, query: string): MatchRange[]` — consumed by Task 5.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/markdown/find-matches.test.ts
import { describe, it, expect } from 'vitest';
import { findMatchRanges } from './find-matches';

describe('findMatchRanges', () => {
  it('returns no ranges for an empty query', () => {
    expect(findMatchRanges('hello world', '')).toEqual([]);
  });

  it('finds a single case-insensitive match', () => {
    expect(findMatchRanges('Hello World', 'world')).toEqual([{ from: 6, to: 11 }]);
  });

  it('finds multiple non-overlapping matches', () => {
    expect(findMatchRanges('cat cat cat', 'cat')).toEqual([
      { from: 0, to: 3 },
      { from: 4, to: 7 },
      { from: 8, to: 11 },
    ]);
  });

  it('returns no ranges when the query is not found', () => {
    expect(findMatchRanges('hello world', 'xyz')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/markdown/find-matches.test.ts`
Expected: FAIL — `Cannot find module './find-matches'`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/markdown/find-matches.ts
import { indexOfCI } from '@/lib/search-highlight';

export interface MatchRange {
  from: number;
  to: number;
}

export function findMatchRanges(text: string, query: string): MatchRange[] {
  if (!query) return [];
  const ranges: MatchRange[] = [];
  let idx = indexOfCI(text, query);
  while (idx !== -1) {
    ranges.push({ from: idx, to: idx + query.length });
    idx = indexOfCI(text, query, idx + query.length);
  }
  return ranges;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/markdown/find-matches.test.ts`
Expected: PASS, all 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/markdown/find-matches.ts src/lib/markdown/find-matches.test.ts
git commit -m "feat(markdown): add pure findMatchRanges search helper"
```

---

### Task 5: Add CodeMirror dependencies

**Files:**
- Modify: `package.json`

**Interfaces:**
- Produces: `@codemirror/state`, `@codemirror/view`, `@codemirror/language`, `@codemirror/commands`, `@codemirror/lang-markdown`, `@lezer/highlight` available to import — consumed by Tasks 6–7.

- [ ] **Step 1: Add the dependencies**

In `package.json`'s `"dependencies"` block, add (keep alphabetical, matching the existing style):

```json
"@codemirror/commands": "6.11.0",
"@codemirror/lang-markdown": "6.5.2",
"@codemirror/language": "6.12.4",
"@codemirror/state": "6.7.4",
"@codemirror/view": "6.43.11",
"@lezer/highlight": "1.2.3",
```

- [ ] **Step 2: Install**

Run: `npm install`
Expected: lockfile updated, no errors.

- [ ] **Step 3: Verify nothing broke**

Run: `npm run typecheck && npm run build`
Expected: both PASS — nothing imports the new packages yet, this only proves the install didn't break the existing build.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(editor): add CodeMirror 6 dependencies"
```

---

### Task 6: Markdown theme and search-highlight extension

**Files:**
- Create: `src/components/editor/markdown-theme.ts`
- Create: `src/components/editor/markdown-search-highlight.ts`

**Interfaces:**
- Consumes: `findMatchRanges` from Task 4.
- Produces:
  - `markdownHighlightStyle: HighlightStyle` and `markdownEditorTheme: Extension` from `markdown-theme.ts`
  - `searchHighlightExtension(query: string): Extension` and `getFirstMatchPos(doc: { toString(): string }, query: string): number | null` from `markdown-search-highlight.ts`
  - Both consumed by Task 7 (`MarkdownEditor.tsx`).

- [ ] **Step 1: Write the theme**

```ts
// src/components/editor/markdown-theme.ts
import { HighlightStyle } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { EditorView } from '@codemirror/view';

// Colors match .claude/rules/styling.md's zinc/indigo dark palette.
export const markdownHighlightStyle = HighlightStyle.define([
  { tag: tags.heading, color: '#a5b4fc', fontWeight: 'bold' }, // indigo-300
  { tag: tags.strong, color: '#f4f4f5', fontWeight: 'bold' }, // zinc-100
  { tag: tags.emphasis, color: '#f4f4f5', fontStyle: 'italic' },
  { tag: tags.strikethrough, color: '#a1a1aa', textDecoration: 'line-through' }, // zinc-400
  { tag: tags.link, color: '#818cf8', textDecoration: 'underline' }, // indigo-400
  { tag: tags.url, color: '#818cf8' },
  { tag: tags.monospace, color: '#a78bfa', backgroundColor: '#1a1a1a' }, // matches globals.css inline code
  { tag: tags.quote, color: '#a1a1aa', fontStyle: 'italic' },
  { tag: tags.list, color: '#818cf8' },
  { tag: tags.processingInstruction, color: '#71717a' }, // zinc-500 — #, -, ``` markers
]);

export const markdownEditorTheme = EditorView.theme(
  {
    '&': { backgroundColor: 'transparent', color: '#a1a1aa', height: '100%' },
    '.cm-content': { fontSize: '0.875rem', lineHeight: '1.625', caretColor: '#818cf8' },
    '.cm-gutters': { display: 'none' },
    '&.cm-focused': { outline: 'none' },
    '.cm-search-match': {
      borderRadius: '0.125rem',
      backgroundColor: 'rgba(129, 140, 248, 0.3)', // indigo-400/30
      color: '#c7d2fe', // indigo-200
    },
  },
  { dark: true },
);
```

- [ ] **Step 2: Write the search-highlight extension**

```ts
// src/components/editor/markdown-search-highlight.ts
import { EditorView, Decoration, type DecorationSet } from '@codemirror/view';
import { StateField, type Extension } from '@codemirror/state';
import { findMatchRanges } from '@/lib/markdown/find-matches';

const matchDecoration = Decoration.mark({ class: 'cm-search-match' });

function buildDecorations(doc: { toString(): string }, query: string): DecorationSet {
  const ranges = findMatchRanges(doc.toString(), query);
  return Decoration.set(ranges.map((r) => matchDecoration.range(r.from, r.to)));
}

export function searchHighlightExtension(query: string): Extension {
  return StateField.define<DecorationSet>({
    create(state) {
      return buildDecorations(state.doc, query);
    },
    update(decorations, tr) {
      if (!tr.docChanged) return decorations;
      return buildDecorations(tr.state.doc, query);
    },
    provide: (f) => EditorView.decorations.from(f),
  });
}

/** Earliest document position among the current matches for `query`, if any. */
export function getFirstMatchPos(doc: { toString(): string }, query: string): number | null {
  const ranges = findMatchRanges(doc.toString(), query);
  return ranges.length > 0 ? ranges[0].from : null;
}
```

- [ ] **Step 3: Verify it compiles**

Run: `npm run typecheck`
Expected: PASS. (No unit test here — this file is thin CodeMirror glue with no branching logic of its own; its behavior is covered by `find-matches.test.ts` for the matching logic and by the Task 11 e2e search test for the wiring.)

- [ ] **Step 4: Commit**

```bash
git add src/components/editor/markdown-theme.ts src/components/editor/markdown-search-highlight.ts
git commit -m "feat(editor): add CodeMirror markdown theme and search highlighting"
```

---

### Task 7: `MarkdownEditor.tsx` component

**Files:**
- Create: `src/components/editor/MarkdownEditor.tsx`

**Interfaces:**
- Consumes: `markdownHighlightStyle`, `markdownEditorTheme` (Task 6), `searchHighlightExtension`, `getFirstMatchPos` (Task 6), `FormattingResult` (Task 3).
- Produces:
  ```ts
  export interface MarkdownEditorHandle {
    focus: () => void;
    getSelection: () => { start: number; end: number };
    applyFormatting: (result: FormattingResult) => void;
    insertAtCursor: (text: string) => void;
  }
  interface MarkdownEditorProps {
    value: string;
    onChange: (value: string) => void;
    onPasteText: (text: string) => string | null;
    onPasteImage: (file: File) => void;
    autoFocus?: boolean;
    searchQuery: string;
  }
  ```
  Consumed by Task 8 (`EditorCanvas.tsx`), mounted with `key={note.id}` so a note switch remounts it with a fresh `EditorState` rather than reusing one instance across notes.

- [ ] **Step 1: Write the component**

```tsx
// src/components/editor/MarkdownEditor.tsx
'use client';

import React, { useEffect, useImperativeHandle, useRef, forwardRef } from 'react';
import { EditorState, Compartment } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { syntaxHighlighting } from '@codemirror/language';
import { markdownHighlightStyle, markdownEditorTheme } from './markdown-theme';
import { searchHighlightExtension, getFirstMatchPos } from './markdown-search-highlight';
import type { FormattingResult } from '@/lib/markdown/formatting';

export interface MarkdownEditorHandle {
  focus: () => void;
  getSelection: () => { start: number; end: number };
  applyFormatting: (result: FormattingResult) => void;
  insertAtCursor: (text: string) => void;
}

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  onPasteText: (text: string) => string | null;
  onPasteImage: (file: File) => void;
  autoFocus?: boolean;
  searchQuery: string;
}

const searchCompartment = new Compartment();

const MarkdownEditor = forwardRef<MarkdownEditorHandle, MarkdownEditorProps>(function MarkdownEditor(
  { value, onChange, onPasteText, onPasteImage, autoFocus, searchQuery },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onPasteTextRef = useRef(onPasteText);
  onPasteTextRef.current = onPasteText;
  const onPasteImageRef = useRef(onPasteImage);
  onPasteImageRef.current = onPasteImage;

  useEffect(() => {
    if (!containerRef.current) return;

    const state = EditorState.create({
      doc: value,
      extensions: [
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        markdown(),
        syntaxHighlighting(markdownHighlightStyle),
        markdownEditorTheme,
        EditorView.lineWrapping,
        searchCompartment.of(searchHighlightExtension(searchQuery)),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChangeRef.current(update.state.doc.toString());
        }),
        EditorView.domEventHandlers({
          paste(event, view) {
            const items = Array.from(event.clipboardData?.items ?? []);
            const imageItem = items.find((item) => item.type.startsWith('image/'));
            if (imageItem) {
              const file = imageItem.getAsFile();
              if (file) {
                event.preventDefault();
                onPasteImageRef.current(file);
                return true;
              }
            }

            const text = event.clipboardData?.getData('text/plain') ?? '';
            const replacement = onPasteTextRef.current(text);
            if (replacement === null) return false;
            event.preventDefault();
            const { from, to } = view.state.selection.main;
            view.dispatch({
              changes: { from, to, insert: replacement },
              selection: { anchor: from + replacement.length },
            });
            return true;
          },
        }),
      ],
    });

    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;
    if (autoFocus) view.focus();
    const pos = getFirstMatchPos(view.state.doc, searchQuery);
    if (pos !== null) view.dispatch({ effects: EditorView.scrollIntoView(pos, { y: 'center' }) });

    return () => view.destroy();
    // One EditorView per mount. EditorCanvas remounts this component with
    // key={note.id} on note switch, so a fresh view always starts with the
    // right `value` baked into EditorState.create — no manual content-sync
    // effect needed (unlike the old Tiptap instance, which was reused across
    // notes behind a syncedNoteIdRef guard).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({ effects: searchCompartment.reconfigure(searchHighlightExtension(searchQuery)) });
    if (!searchQuery) return;
    const pos = getFirstMatchPos(view.state.doc, searchQuery);
    if (pos !== null) view.dispatch({ effects: EditorView.scrollIntoView(pos, { y: 'center' }) });
  }, [searchQuery]);

  useImperativeHandle(ref, () => ({
    focus: () => viewRef.current?.focus(),
    getSelection: () => {
      const sel = viewRef.current?.state.selection.main;
      return { start: sel?.from ?? 0, end: sel?.to ?? 0 };
    },
    applyFormatting: (result) => {
      const view = viewRef.current;
      if (!view) return;
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: result.text },
        selection: { anchor: result.selection.start, head: result.selection.end },
      });
      view.focus();
    },
    insertAtCursor: (text) => {
      const view = viewRef.current;
      if (!view) return;
      const { from, to } = view.state.selection.main;
      view.dispatch({
        changes: { from, to, insert: text },
        selection: { anchor: from + text.length },
      });
    },
  }));

  return <div ref={containerRef} className="h-full font-mono text-sm text-zinc-400" />;
});

export default MarkdownEditor;
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Manual smoke check**

This component has no standalone unit test — a real `EditorView` needs a DOM and is exercised end-to-end once wired into `EditorCanvas.tsx` in Task 8. Defer verification to Task 8's manual check and Task 11's e2e tests. Note this explicitly rather than writing a fake test against an unmounted component.

- [ ] **Step 4: Commit**

```bash
git add src/components/editor/MarkdownEditor.tsx
git commit -m "feat(editor): add CodeMirror-based MarkdownEditor component"
```

---

### Task 8: Wire `MarkdownEditor` and rewritten `RichToolbar` into `EditorCanvas.tsx`

This is the big swap. It must land as one commit (or a tight sequence of sub-commits within this task) because `EditorCanvas.tsx` and `RichToolbar.tsx` are only valid together — `RichToolbar`'s old Tiptap-based props and `EditorCanvas`'s old Tiptap usage are replaced in the same change.

**Files:**
- Modify: `src/components/editor/EditorCanvas.tsx` (extensive — see steps)
- Modify: `src/components/editor/RichToolbar.tsx` (full rewrite)

**Interfaces:**
- Consumes: `MarkdownEditor`, `MarkdownEditorHandle` (Task 7); `toggleInlineMark`, `toggleLinePrefix`, `toggleCodeBlock`, `FormattingResult` (Task 3); `markdownToPlainText` (Task 2); `detectTerminalTable` (Task 1).
- Produces: `EditorCanvasHandle.getCurrentState(): { title: string; textContent: string }` (signature unchanged, consumed by `src/app/page.tsx:267` — no change needed there).

- [ ] **Step 1: Delete the Tiptap-era conversion functions and types**

In `EditorCanvas.tsx`, delete entirely (these were only used to flatten a ProseMirror document, which no longer exists):
- `TiptapMark`, `TiptapNode` types
- `BLOCK_NODE_TYPES`
- `nodeToText()`
- `applyMarks()`
- `nodeToMarkdown()`
- `textToCleanHtml()`
- `lowlight` constant and its import (`createLowlight, common` from `'lowlight'`)

Also delete these now-unused imports: `useEditor, EditorContent` from `'@tiptap/react'`, `StarterKit`, `Underline`, `Image`, `Table`, `TableRow`, `TableHeader`, `TableCell`, `Link`, `CodeBlockLowlight`, `SearchHighlight` (the old Tiptap extension), and `getFirstMatchPos` from the old `'./SearchHighlight'`.

- [ ] **Step 2: Replace the sanitizer import with the new plain-text pipeline**

Replace:

```ts
import {
  sanitizeHTML,
  collapseEmptyParagraphs,
  markdownToHtml,
  wrapPlainText,
  getNoteTextContent,
} from '@/lib/sanitizer';
import { detectTerminalTable } from '@/lib/markdown/terminal-table';
```

with:

```ts
import { detectTerminalTable } from '@/lib/markdown/terminal-table';
import { markdownToPlainText } from '@/lib/markdown/text-projection';
import { toggleInlineMark, toggleLinePrefix, toggleCodeBlock } from '@/lib/markdown/formatting';
import MarkdownEditor, { type MarkdownEditorHandle } from './MarkdownEditor';
```

- [ ] **Step 3: Replace the `plainContent` state with a single `content` state used by both modes**

Rename `plainContent`/`setPlainContent`/`plainContentRef` to `content`/`setContent`/`contentRef` throughout the file (they now hold PLAIN text OR RICH Markdown source — both are the same kind of value). Delete `editor` (the `useEditor(...)` call and its whole config object), `syncedNoteIdRef`'s Tiptap-specific `editor.commands.setContent(...)` call, and `currentModeRef` stays (still needed by the async image-paste guard in Step 6).

The note-switch sync effect (previously lines 344–363) becomes:

```ts
useEffect(() => {
  currentModeRef.current = note.mode;
  if (syncedNoteIdRef.current === note.id) return;
  syncedNoteIdRef.current = note.id;
  setContent(note.content);
  contentRef.current = note.content;
  setLocalTitle(note.title);
  setSaveState('IDLE');
  if (autoFocus) {
    // MarkdownEditor/textarea focus is handled by their own autoFocus prop
    // once note.id changes remount them (MarkdownEditor is keyed by note.id).
    onAutoFocusHandled?.();
  }
}, [note.id, note.title, note.content, note.mode, autoFocus, onAutoFocusHandled]);
```

- [ ] **Step 4: Add a `markdownEditorRef` and delete the old search-highlight effect**

Add:

```ts
const markdownEditorRef = useRef<MarkdownEditorHandle>(null);
```

Delete the old `useEffect` that called `editor.commands.setSearchHighlight(searchQuery)` and manually scrolled via `domAtPos` — `MarkdownEditor` now handles this internally (Task 7), driven by its `searchQuery` prop.

- [ ] **Step 5: Rewrite `triggerSave` to compute `textContent` via the new projection**

Replace:

```ts
const content =
  updates.content ??
  (note.mode === NoteMode.RICH ? editor?.getHTML() : plainContentRef.current) ??
  '';
const payload: NotePayload = {
  title: updates.title ?? localTitle,
  content,
  textContent: getNoteTextContent(content),
  mode: updates.mode ?? note.mode,
  isPinned: updates.isPinned ?? note.isPinned,
};
```

with:

```ts
const newContent = updates.content ?? contentRef.current;
const mode = updates.mode ?? note.mode;
const textContent = mode === NoteMode.RICH ? markdownToPlainText(newContent) : newContent;
const payload: NotePayload = {
  title: updates.title ?? localTitle,
  content: newContent,
  textContent,
  mode,
  isPinned: updates.isPinned ?? note.isPinned,
};
```

- [ ] **Step 6: Rewrite paste handling as `onPasteText`/`onPasteImage` callbacks**

Add these two `useCallback`s (they become `MarkdownEditor` props, replacing the old `handlePaste` inside `useEditor`'s config):

```ts
const handlePasteText = useCallback((text: string): string | null => {
  const detection = detectTerminalTable(text);
  if (detection.type === 'table') return detection.markdown;
  if (detection.type === 'code') return '```text\n' + text + '\n```';
  return null; // let CodeMirror's default plain-text paste handle it
}, []);

const handlePasteImage = useCallback((file: File) => {
  const pasteNoteId = syncedNoteIdRef.current;
  resizeImageToDataURL(file).then((dataUrl) => {
    if (syncedNoteIdRef.current !== pasteNoteId) return;
    if (currentModeRef.current !== NoteMode.RICH) return;
    markdownEditorRef.current?.insertAtCursor(`![${file.name}](${dataUrl})`);
  });
}, []);
```

(`resizeImageToDataURL` is unchanged — keep it as-is.)

- [ ] **Step 7: Rewrite `handleSwitchMode` — delete the confirmation dialog entirely**

Delete `showModeConfirm`, `modeConfirmHasImages` state and the `<ConfirmDialog open={showModeConfirm} ...>` JSX block, and `confirmSwitchToPlain`. Replace `handleSwitchMode` with:

```ts
const handleSwitchMode = () => {
  const newMode = note.mode === NoteMode.RICH ? NoteMode.PLAIN : NoteMode.RICH;
  const textContent = newMode === NoteMode.RICH ? markdownToPlainText(content) : content;
  persistChange({ mode: newMode, content, textContent }, { showProgressAndSuccess: false });
};
```

- [ ] **Step 8: Rewrite `getCurrentState`, `copyToClipboard`, `handleExportTxt`, `handleExportMd`**

```ts
useImperativeHandle(
  ref,
  () => ({
    getCurrentState: () => {
      const textContent = note.mode === NoteMode.RICH ? markdownToPlainText(content) : content;
      return { title: localTitle, textContent };
    },
  }),
  [localTitle, note.mode, content],
);

const copyToClipboard = async () => {
  const textToCopy = note.mode === NoteMode.RICH ? markdownToPlainText(content) : content;
  try {
    await navigator.clipboard.writeText(textToCopy);
    setToast({ message: 'Copied!', variant: 'success' });
  } catch {
    setToast({ message: 'Clipboard access denied.', variant: 'error' });
  }
};

const handleExportTxt = () => {
  const text = note.mode === NoteMode.RICH ? markdownToPlainText(content) : content;
  downloadTextFile(`${sanitizeFilename(localTitle)}.txt`, text);
};

const handleExportMd = () => {
  downloadTextFile(`${sanitizeFilename(localTitle)}.md`, content);
};
```

- [ ] **Step 9: Unify word/character counts**

Replace the two branching `wordCount`/`charCount` computations with:

```ts
const displayText = note.mode === NoteMode.RICH ? markdownToPlainText(content) : content;
const wordCount = countWords(displayText);
const charCount = countCharacters(displayText);
```

- [ ] **Step 10: Add the formatting glue for the toolbar**

```ts
const applyFormatting = useCallback(
  (fn: (text: string, sel: { start: number; end: number }) => FormattingResult) => {
    const editor = markdownEditorRef.current;
    if (!editor) return;
    const sel = editor.getSelection();
    const result = fn(content, sel);
    editor.applyFormatting(result);
    setContent(result.text);
    contentRef.current = result.text;
    triggerSave({ content: result.text });
  },
  [content, triggerSave],
);
```

(Import `FormattingResult` as a type from `@/lib/markdown/formatting` alongside the function imports in Step 2.)

- [ ] **Step 11: Replace the editor body JSX**

Replace:

```tsx
{note.mode === NoteMode.RICH ? (
  <EditorContent editor={editor} className="h-full" />
) : (
  <textarea ...
```

with:

```tsx
{note.mode === NoteMode.RICH ? (
  <MarkdownEditor
    key={note.id}
    ref={markdownEditorRef}
    value={content}
    onChange={(val) => {
      setContent(val);
      contentRef.current = val;
      triggerSave({ content: val });
    }}
    onPasteText={handlePasteText}
    onPasteImage={handlePasteImage}
    autoFocus={autoFocus}
    searchQuery={searchQuery}
  />
) : (
  <textarea
    ref={textareaRef}
    value={content}
    onChange={(e) => {
      const val = e.target.value;
      setContent(val);
      contentRef.current = val;
      triggerSave({ content: val });
    }}
    onPaste={(e) => {
      const items = Array.from(e.clipboardData?.items ?? []);
      const imageItem = items.find((item) => item.type.startsWith('image/'));
      if (imageItem) {
        e.preventDefault();
        const file = imageItem.getAsFile();
        const name = file?.name || 'clipboard-image.png';
        const ta = textareaRef.current;
        if (ta) {
          const start = ta.selectionStart;
          const end = ta.selectionEnd;
          const placeholder = `[image: ${name}]`;
          const newVal = content.slice(0, start) + placeholder + content.slice(end);
          setContent(newVal);
          contentRef.current = newVal;
          triggerSave({ content: newVal });
        }
      }
    }}
    placeholder="Start typing plain text..."
    className="min-h-full w-full resize-none overflow-hidden bg-transparent font-mono text-sm leading-relaxed text-zinc-400 focus:outline-none"
  />
)}
```

Also change the wrapping body `<div>`'s className (previously `` `... ${note.mode === NoteMode.PLAIN ? 'font-mono' : 'font-sans'}` ``) to always use `font-mono` (see "Implementation clarifications" #2):

```tsx
<div className="flex-1 overflow-auto p-6 font-mono transition-colors md:px-10 lg:px-20">
```

- [ ] **Step 12: Update the toolbar render and rewrite `RichToolbar.tsx`**

Change the toolbar render line from:

```tsx
{editor && note.mode === NoteMode.RICH && <RichToolbar editor={editor} />}
```

to:

```tsx
{note.mode === NoteMode.RICH && (
  <RichToolbar
    onToggleInlineMark={(marker) => applyFormatting((text, sel) => toggleInlineMark(text, sel, marker))}
    onToggleLinePrefix={(prefix) => applyFormatting((text, sel) => toggleLinePrefix(text, sel, prefix))}
    onToggleCodeBlock={() => applyFormatting(toggleCodeBlock)}
  />
)}
```

Rewrite `RichToolbar.tsx` in full:

```tsx
// src/components/editor/RichToolbar.tsx
'use client';

import React from 'react';
import { Bold, Italic, Strikethrough, Code, List, ListOrdered, Heading1, Heading2, Quote } from 'lucide-react';

interface RichToolbarProps {
  onToggleInlineMark: (marker: string) => void;
  onToggleLinePrefix: (prefix: string) => void;
  onToggleCodeBlock: () => void;
}

const ToolbarButton: React.FC<{
  onClick: () => void;
  title?: string;
  children: React.ReactNode;
}> = ({ onClick, title, children }) => (
  <button
    onClick={onClick}
    title={title}
    className="rounded p-2.5 text-zinc-400 hover:bg-zinc-800 md:p-1.5"
  >
    {children}
  </button>
);

const Divider = () => <div className="mx-1 h-4 w-px bg-zinc-800" />;

const RichToolbar: React.FC<RichToolbarProps> = ({
  onToggleInlineMark,
  onToggleLinePrefix,
  onToggleCodeBlock,
}) => {
  return (
    <div className="overflow-x-auto border-b border-zinc-800 bg-zinc-900/50">
      <div className="flex flex-nowrap items-center gap-1 p-2 md:flex-wrap">
        <ToolbarButton onClick={() => onToggleInlineMark('**')} title="Bold">
          <Bold className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => onToggleInlineMark('_')} title="Italic">
          <Italic className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => onToggleInlineMark('~~')} title="Strikethrough">
          <Strikethrough className="h-4 w-4" />
        </ToolbarButton>
        <Divider />
        <ToolbarButton onClick={() => onToggleLinePrefix('# ')} title="Heading 1">
          <Heading1 className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => onToggleLinePrefix('## ')} title="Heading 2">
          <Heading2 className="h-4 w-4" />
        </ToolbarButton>
        <Divider />
        <ToolbarButton onClick={() => onToggleLinePrefix('- ')} title="Bullet List">
          <List className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => onToggleLinePrefix('1. ')} title="Ordered List">
          <ListOrdered className="h-4 w-4" />
        </ToolbarButton>
        <Divider />
        <ToolbarButton onClick={onToggleCodeBlock} title="Code Block">
          <Code className="h-4 w-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => onToggleLinePrefix('> ')} title="Blockquote">
          <Quote className="h-4 w-4" />
        </ToolbarButton>
      </div>
    </div>
  );
};

export default RichToolbar;
```

- [ ] **Step 13: Verify build and typecheck**

Run: `npm run typecheck && npm run lint`
Expected: both PASS. `lowlight`, `markdown-it`, and `@tiptap/*` may still show as unused-dependency warnings from tooling that checks `package.json` against imports — that's expected until Task 9 removes them.

- [ ] **Step 14: Manual smoke check**

Run: `npm run dev`, open the app, create a note, switch it to RICH, type Markdown syntax (headings, bold, a list), confirm syntax highlighting renders, confirm the toolbar buttons insert the right syntax, paste an image and confirm it appears as `![name](data:...)`, switch back to PLAIN and confirm the raw Markdown text is shown with no confirmation dialog and no data loss.

- [ ] **Step 15: Commit**

```bash
git add src/components/editor/EditorCanvas.tsx src/components/editor/RichToolbar.tsx
git commit -m "feat(editor): replace Tiptap RICH mode with CodeMirror Markdown editor"
```

---

### Task 9: Delete the old sanitizer, old SearchHighlight, and Tiptap dependencies

**Files:**
- Delete: `src/lib/sanitizer/` (entire directory: `index.ts`, `index.test.ts`, `config.ts`, `normalize.ts`, `markdown.ts`)
- Delete: `src/components/editor/SearchHighlight.ts`
- Modify: `package.json`

**Interfaces:** None — this task only removes now-dead code, verified by Step 1's grep.

- [ ] **Step 1: Confirm nothing still references what's about to be deleted**

Run:
```bash
grep -rn "from '@/lib/sanitizer'\|lib/sanitizer" src/ e2e/
grep -rn "SearchHighlight" src/components/editor/EditorCanvas.tsx
grep -rn "@tiptap\|lowlight\|markdown-it" src/ --include="*.ts" --include="*.tsx"
```
Expected: no matches (Task 8 already removed every reference).

- [ ] **Step 2: Delete the files**

```bash
git rm -r src/lib/sanitizer src/components/editor/SearchHighlight.ts
```

- [ ] **Step 3: Remove the dependencies from `package.json`**

Remove from `"dependencies"`: `@tiptap/extension-code-block-lowlight`, `@tiptap/extension-image`, `@tiptap/extension-link`, `@tiptap/extension-table`, `@tiptap/extension-table-cell`, `@tiptap/extension-table-header`, `@tiptap/extension-table-row`, `@tiptap/extension-underline`, `@tiptap/react`, `@tiptap/starter-kit`, `lowlight`, `markdown-it`.

Remove from `"devDependencies"`: `@types/markdown-it`.

- [ ] **Step 4: Reinstall**

Run: `npm install`
Expected: lockfile updated, removed packages gone from `node_modules`.

- [ ] **Step 5: Full verification**

Run: `npm run typecheck && npm run lint && npm run format:check && npm run test && npm run build`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore(editor): remove Tiptap, lowlight, markdown-it, and the HTML sanitizer"
```

---

### Task 10: Migration script — `htmlToMarkdown` conversion function (TDD)

**Files:**
- Create: `scripts/migrate-rich-html-to-markdown.mjs`
- Test: `scripts/migrate-rich-html-to-markdown.test.mjs`

**Interfaces:**
- Produces: `htmlToMarkdown(html: string): string`, `markdownToPlainTextForMigration(markdown: string): string`, `runMigration(options): Promise<{converted, skipped, failed, total}>` — this task covers the pure conversion function with tests; Step 5 below adds the CLI runner.

- [ ] **Step 1: Write the failing conversion tests**

```js
// scripts/migrate-rich-html-to-markdown.test.mjs
import { describe, it, expect } from 'vitest';
import { htmlToMarkdown } from './migrate-rich-html-to-markdown.mjs';

describe('htmlToMarkdown', () => {
  it('converts headings, bold, italic, and links', () => {
    const html =
      '<h2>Title</h2><p><strong>bold</strong> and <em>italic</em> and <a href="https://example.com">link</a></p>';
    expect(htmlToMarkdown(html)).toBe(
      '## Title\n\n**bold** and _italic_ and [link](https://example.com)',
    );
  });

  it('converts a table to pipe syntax', () => {
    const html = '<table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>';
    expect(htmlToMarkdown(html)).toBe('| A | B |\n| --- | --- |\n| 1 | 2 |');
  });

  it('converts an img tag, preserving a base64 data URI', () => {
    const html = '<img src="data:image/webp;base64,AAA" alt="screenshot">';
    expect(htmlToMarkdown(html)).toBe('![screenshot](data:image/webp;base64,AAA)');
  });

  it('converts underline to the HTML-in-Markdown <u> convention', () => {
    expect(htmlToMarkdown('<p><u>underlined</u></p>')).toBe('<u>underlined</u>');
  });

  it('converts bullet and ordered lists', () => {
    expect(htmlToMarkdown('<ul><li>one</li><li>two</li></ul>')).toBe('- one\n- two');
    expect(htmlToMarkdown('<ol><li>one</li><li>two</li></ol>')).toBe('1. one\n2. two');
  });

  it('converts a code block', () => {
    expect(htmlToMarkdown('<pre><code>const x = 1;</code></pre>')).toBe('```\nconst x = 1;\n```');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run scripts/migrate-rich-html-to-markdown.test.mjs`
Expected: FAIL — `Cannot find module './migrate-rich-html-to-markdown.mjs'`.

- [ ] **Step 3: Write `htmlToMarkdown`**

```js
// scripts/migrate-rich-html-to-markdown.mjs (conversion portion — CLI runner added in Step 5)
import { JSDOM } from 'jsdom';

function inline(node) {
  if (node.nodeType === 3) return node.textContent ?? '';
  const el = node;
  const children = Array.from(el.childNodes).map(inline).join('');
  switch (el.tagName?.toLowerCase()) {
    case 'strong':
      return `**${children}**`;
    case 'em':
      return `_${children}_`;
    case 'u':
      return `<u>${children}</u>`;
    case 's':
      return `~~${children}~~`;
    case 'code':
      return `\`${children}\``;
    case 'a': {
      const href = el.getAttribute('href') ?? '';
      return `[${children}](${href})`;
    }
    case 'img': {
      const src = el.getAttribute('src') ?? '';
      const alt = el.getAttribute('alt') ?? '';
      return `![${alt}](${src})`;
    }
    case 'br':
      return '\n';
    default:
      return children;
  }
}

function block(node) {
  const el = node;
  const tag = el.tagName?.toLowerCase();
  switch (tag) {
    case 'p':
      return inline(el) + '\n\n';
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6': {
      const level = Number(tag[1]);
      return `${'#'.repeat(level)} ${inline(el)}\n\n`;
    }
    case 'blockquote':
      return (
        inline(el)
          .trim()
          .split('\n')
          .map((line) => `> ${line}`)
          .join('\n') + '\n\n'
      );
    case 'ul':
      return Array.from(el.children).map((li) => `- ${inline(li).trim()}`).join('\n') + '\n\n';
    case 'ol':
      return (
        Array.from(el.children)
          .map((li, i) => `${i + 1}. ${inline(li).trim()}`)
          .join('\n') + '\n\n'
      );
    case 'pre':
      return '```\n' + (el.textContent ?? '') + '\n```\n\n';
    case 'hr':
      return '---\n\n';
    case 'table': {
      const rows = Array.from(el.querySelectorAll('tr')).map((tr) =>
        Array.from(tr.children).map((cell) => inline(cell).trim()),
      );
      if (rows.length === 0) return '';
      const [header, ...body] = rows;
      const headerLine = `| ${header.join(' | ')} |`;
      const alignLine = `| ${header.map(() => '---').join(' | ')} |`;
      const bodyLines = body.map((row) => `| ${row.join(' | ')} |`);
      return [headerLine, alignLine, ...bodyLines].join('\n') + '\n\n';
    }
    case 'img': {
      const src = el.getAttribute('src') ?? '';
      const alt = el.getAttribute('alt') ?? '';
      return `![${alt}](${src})\n\n`;
    }
    default:
      return Array.from(el.childNodes)
        .map((child) => (child.nodeType === 1 ? block(child) : inline(child)))
        .join('');
  }
}

export function htmlToMarkdown(html) {
  const dom = new JSDOM(`<body>${html}</body>`);
  const body = dom.window.document.body;
  return Array.from(body.children)
    .map((child) => block(child))
    .join('')
    .trim();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run scripts/migrate-rich-html-to-markdown.test.mjs`
Expected: PASS, all 7 tests.

- [ ] **Step 5: Add `markdownToPlainTextForMigration` and its drift-guard test**

Append to `scripts/migrate-rich-html-to-markdown.mjs`:

```js
// ponytail: duplicated (not imported) from src/lib/markdown/text-projection.ts —
// this script runs as plain .mjs directly under node, outside the TS/path-alias
// build pipeline, and is deleted after the one-time migration anyway. Kept in
// sync by the drift-guard test in this file's test suite.
export function markdownToPlainTextForMigration(markdown) {
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
```

Append to `scripts/migrate-rich-html-to-markdown.test.mjs`:

```js
import { markdownToPlainText } from '../src/lib/markdown/text-projection.ts';
import { markdownToPlainTextForMigration } from './migrate-rich-html-to-markdown.mjs';

describe('markdownToPlainTextForMigration', () => {
  it('stays in sync with the real markdownToPlainText implementation', () => {
    const samples = [
      '## Shopping List\n\n- **Milk**\n- Eggs',
      '> quoted\n\n[link](https://example.com)',
      '![alt](data:image/webp;base64,AAA)',
    ];
    for (const sample of samples) {
      expect(markdownToPlainTextForMigration(sample)).toBe(markdownToPlainText(sample));
    }
  });
});
```

Run: `npx vitest run scripts/migrate-rich-html-to-markdown.test.mjs`
Expected: PASS, all 8 tests.

- [ ] **Step 6: Commit**

```bash
git add scripts/migrate-rich-html-to-markdown.mjs scripts/migrate-rich-html-to-markdown.test.mjs
git commit -m "feat(scripts): add RICH note HTML-to-Markdown conversion"
```

---

### Task 11: Migration script — CLI runner (dry-run, backup, Turso hard-stop)

**Files:**
- Modify: `scripts/migrate-rich-html-to-markdown.mjs` (add the runner)

**Interfaces:**
- Consumes: `createBackupIfExists` (exported, unmodified, from `scripts/sync-turso-to-docker.mjs`), `htmlToMarkdown`, `markdownToPlainTextForMigration` (Task 10).
- Produces: `runMigration(options?: { argv?: string[]; env?: NodeJS.ProcessEnv }): Promise<{ converted: number; skipped: number; failed: number; total: number }>`.

- [ ] **Step 1: Append the runner**

```js
// Append to scripts/migrate-rich-html-to-markdown.mjs
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { PrismaLibSQL } from '@prisma/adapter-libsql';
import { createBackupIfExists } from './sync-turso-to-docker.mjs';

async function migrateRichNotes(prisma, { write }) {
  const notes = await prisma.note.findMany({ where: { mode: 'RICH' } });
  let converted = 0;
  let skipped = 0;
  let failed = 0;

  for (const note of notes) {
    try {
      if (!note.content.trim()) {
        skipped++;
        continue;
      }
      const markdown = htmlToMarkdown(note.content);
      const textContent = markdownToPlainTextForMigration(markdown);
      if (write) {
        await prisma.note.update({
          where: { id: note.id },
          data: { content: markdown, textContent },
        });
      }
      converted++;
    } catch (error) {
      failed++;
      console.error(`Failed to convert note ${note.id}:`, error instanceof Error ? error.message : error);
    }
  }

  return { converted, skipped, failed, total: notes.length };
}

function printUsage() {
  console.log(`
Usage: node scripts/migrate-rich-html-to-markdown.mjs [--write] [--turso-backup-confirmed]

  (no flags)                 Dry run - reports what would change, writes nothing.
  --write                    Perform the migration.
  --turso-backup-confirmed   Required alongside --write when DATABASE_URL points at
                              libsql:// or https:// (Turso). Confirms you have taken
                              an independent backup/export first - there is no local
                              file for this script to copy.
`);
}

export async function runMigration({ argv = process.argv.slice(2), env = process.env } = {}) {
  const write = argv.includes('--write');
  const tursoBackupConfirmed = argv.includes('--turso-backup-confirmed');
  const databaseUrl = env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required.');
  }

  const isTurso = databaseUrl.startsWith('libsql://') || databaseUrl.startsWith('https://');
  const isFileUrl = databaseUrl.startsWith('file:');

  if (write && isTurso && !tursoBackupConfirmed) {
    throw new Error(
      'Refusing to run --write against a Turso DATABASE_URL without --turso-backup-confirmed. ' +
        'Take an independent backup/export of the Turso database first (there is no local file ' +
        'for this script to copy), then re-run with --turso-backup-confirmed.',
    );
  }

  let backupPath = null;
  if (write && isFileUrl) {
    const filePath = path.resolve(databaseUrl.slice('file:'.length));
    backupPath = await createBackupIfExists(filePath);
  }

  const prisma = isTurso
    ? new PrismaClient({ adapter: new PrismaLibSQL({ url: databaseUrl, authToken: env.TURSO_AUTH_TOKEN }) })
    : new PrismaClient();

  try {
    const result = await migrateRichNotes(prisma, { write });
    console.log(
      `Converted: ${result.converted}, skipped (empty): ${result.skipped}, failed: ${result.failed}, total RICH notes: ${result.total}`,
    );
    if (backupPath) console.log(`Backup created: ${backupPath}`);
    if (!write) console.log('Dry run only - re-run with --write to persist changes.');
    return result;
  } finally {
    await prisma.$disconnect();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runMigration().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    printUsage();
    process.exitCode = 1;
  });
}
```

- [ ] **Step 2: Write tests for the CLI guard logic**

```js
// Append to scripts/migrate-rich-html-to-markdown.test.mjs
import { runMigration } from './migrate-rich-html-to-markdown.mjs';

describe('runMigration guard rails', () => {
  it('throws when DATABASE_URL is missing', async () => {
    await expect(runMigration({ argv: [], env: {} })).rejects.toThrow('DATABASE_URL is required');
  });

  it('refuses --write against Turso without --turso-backup-confirmed', async () => {
    await expect(
      runMigration({ argv: ['--write'], env: { DATABASE_URL: 'libsql://example.turso.io' } }),
    ).rejects.toThrow('--turso-backup-confirmed');
  });
});
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `npx vitest run scripts/migrate-rich-html-to-markdown.test.mjs`
Expected: PASS, all 10 tests (8 from Task 10 + 2 new).

- [ ] **Step 4: Add the npm script**

In `package.json`'s `"scripts"` block, add:

```json
"migrate:rich-html-to-markdown": "node scripts/migrate-rich-html-to-markdown.mjs",
```

- [ ] **Step 5: Dry-run against local dev data**

Run: `DATABASE_URL="file:./prisma/dev.db" npm run migrate:rich-html-to-markdown`
Expected: prints converted/skipped/failed counts and "Dry run only" — no writes.

- [ ] **Step 6: Commit**

```bash
git add scripts/migrate-rich-html-to-markdown.mjs scripts/migrate-rich-html-to-markdown.test.mjs package.json
git commit -m "feat(scripts): add migration CLI runner with dry-run and backup guard"
```

---

### Task 12: Update e2e tests

**Files:**
- Modify: `e2e/notes.spec.ts`

**Interfaces:** None (test-only changes).

- [ ] **Step 1: Update the mode-switch test**

In `e2e/notes.spec.ts`, replace the `'switches a note between PLAIN and RICH mode'` test body (currently lines 40–60) with:

```ts
test('switches a note between PLAIN and RICH mode', async ({ page }) => {
  await createNote(page);

  const plainText = 'Some plain text';
  const plainSaved = waitForContentSave(page, plainText);
  await page.getByPlaceholder('Start typing plain text...').fill(plainText);
  await plainSaved;

  await page.getByRole('button', { name: 'PLAIN', exact: true }).click();
  await expect(page.locator('.cm-content')).toContainText(plainText);

  await page.getByRole('button', { name: 'RICH', exact: true }).click();
  await expect(page.getByPlaceholder('Start typing plain text...')).toHaveValue(plainText);

  await deleteActiveNote(page);
});
```

(No more confirmation-dialog step — switching modes is now lossless and instant.)

- [ ] **Step 2: Replace the HTML-sanitization test with a plain-text-paste test**

Replace the `'sanitizes pasted HTML while in RICH mode'` test with:

```ts
test('ignores clipboard HTML and inserts plain text when pasting in RICH mode', async ({ page }) => {
  await createNote(page);
  await page.getByRole('button', { name: 'PLAIN', exact: true }).click();

  const cmContent = page.locator('.cm-content');
  await cmContent.click();
  await cmContent.evaluate((el) => {
    const dataTransfer = new DataTransfer();
    dataTransfer.setData('text/html', '<h2>Hello</h2><script>window.__xss = true;</script>');
    dataTransfer.setData('text/plain', '## Hello (plain text)');
    el.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: dataTransfer, bubbles: true, cancelable: true }),
    );
  });

  await expect(cmContent).toContainText('## Hello (plain text)');
  expect(
    await page.evaluate(() => (window as unknown as { __xss?: boolean }).__xss),
  ).toBeUndefined();

  await deleteActiveNote(page);
});
```

- [ ] **Step 3: Verify no other file needs updating**

Run: `grep -n "ProseMirror\|sanitiz" e2e/*.ts`
Expected: no matches (already confirmed `e2e/search.spec.ts` and `e2e/folders.spec.ts` have no ProseMirror-specific selectors).

- [ ] **Step 4: Run the e2e suite**

Run: `npm run test:e2e`
Expected: PASS. (See `e2e/README.md` for any one-time local setup needed to run Playwright.)

- [ ] **Step 5: Commit**

```bash
git add e2e/notes.spec.ts
git commit -m "test(e2e): update RICH mode tests for CodeMirror and plain-text paste"
```

---

### Task 13: Documentation follow-up

**Files:**
- Delete: `.claude/rules/sanitizer.md`
- Create: `.claude/rules/markdown.md`
- Modify: `CLAUDE.md`
- Delete: `.claude/skills/extend-sanitizer/SKILL.md` (and the now-empty `.claude/skills/extend-sanitizer/` directory)

**Interfaces:** None (documentation-only).

- [ ] **Step 1: Replace `.claude/rules/sanitizer.md` with `.claude/rules/markdown.md`**

```bash
git rm .claude/rules/sanitizer.md
```

Create `.claude/rules/markdown.md`:

```markdown
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
```

- [ ] **Step 2: Update `CLAUDE.md`**

Change the rules-file list:

```
- **Detailed conventions** are in `.claude/rules/` (api, auth, components, database, docker, git, nextjs, sanitizer, styling)
```

to:

```
- **Detailed conventions** are in `.claude/rules/` (api, auth, components, database, docker, git, markdown, nextjs, styling)
```

Remove the `/extend-sanitizer` row from the skills table.

Change:

```
- `src/components/editor/EditorCanvas.tsx` — Dual-mode editor: Tiptap for RICH, `<textarea>` for PLAIN. Auto-saves with 1s debounce and sequential request queue (`requestQueue` ref). Handles paste sanitization, mode switching, pin toggle, clipboard copy (plain + rich HTML). Accepts optional `onBack` prop (used on phones for back navigation). Header is a single row on all screen sizes: back button (phone only) + title + save indicator + pin + mode + overflow menu (phone only) + full action bar (tablet/desktop only).
- `src/components/editor/RichToolbar.tsx` — Formatting toolbar for Tiptap. Horizontally scrollable single row on phone; wraps on tablet/desktop.
```

to:

```
- `src/components/editor/EditorCanvas.tsx` — Dual-mode editor: CodeMirror-based `MarkdownEditor` for RICH, `<textarea>` for PLAIN — both store the same canonical Markdown/plain-text `content`. Auto-saves with 1s debounce and sequential request queue (`requestQueue` ref). Paste is always plain text (clipboard HTML is ignored); mode switching is lossless. Accepts optional `onBack` prop (used on phones for back navigation). Header is a single row on all screen sizes: back button (phone only) + title + save indicator + pin + mode + overflow menu (phone only) + full action bar (tablet/desktop only).
- `src/components/editor/MarkdownEditor.tsx` — CodeMirror 6 wrapper for RICH mode: Markdown syntax highlighting, search highlighting, and an imperative handle (`getSelection`, `applyFormatting`, `insertAtCursor`) used by `RichToolbar` and image paste.
- `src/components/editor/RichToolbar.tsx` — Formatting toolbar for RICH mode, built on pure functions from `src/lib/markdown/formatting.ts` (not a rich-text editor API). Horizontally scrollable single row on phone; wraps on tablet/desktop.
```

In the "What is PlainDock" opening paragraph, change:

```
Each note operates in either PLAIN (plain text) or RICH (semantic HTML via Tiptap) mode. Pasted HTML content goes through a 3-layer sanitization pipeline (security stripping → tag normalization → structure downgrade).
```

to:

```
Each note operates in either PLAIN (plain text) or RICH (Markdown source with syntax highlighting via CodeMirror) mode — both store the same canonical Markdown/plain-text `content`; `mode` only selects the editor. Pasted content is always inserted as plain text; clipboard HTML is intentionally ignored.
```

Replace the "### Sanitizer (`src/lib/sanitizer/`)" section with:

```
### Markdown (`src/lib/markdown/`)

Pure, framework-independent text functions shared by both editor modes:
`terminal-table.ts` (paste-time table/code detection), `text-projection.ts`
(`markdownToPlainText` for `Note.textContent`), `formatting.ts` (toolbar
actions), `find-matches.ts` (search highlighting). See
`.claude/rules/markdown.md`.
```

- [ ] **Step 3: Remove the stale skill**

```bash
git rm -r .claude/skills/extend-sanitizer
```

- [ ] **Step 4: Grep for any remaining stale references**

Run: `grep -rln "sanitizer\|Tiptap\|tiptap" --include="*.md" .claude/ CLAUDE.md docs/ | grep -v "docs/superpowers/specs\|docs/superpowers/plans"`
Expected: no matches outside the spec/plan documents (which correctly describe the old architecture as history).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "docs(editor): update rules and CLAUDE.md for markdown-native rich mode"
```

## Self-Review Notes

- **Spec coverage:** Core invariant (Task 8), editor swap (Tasks 5–8), mode switching (Task 8 Step 7), paste (Task 8 Step 6), toolbar (Tasks 3, 8), sanitizer removal (Task 9), search (Tasks 4, 6), export/copy (Task 8 Step 8), migration (Tasks 10–11), tests (Tasks 1–4, 10–12), documentation follow-up (Task 13) — all spec sections have a task.
- **Type consistency:** `FormattingResult { text, selection }` (Task 3) is used identically in `MarkdownEditorHandle.applyFormatting` (Task 7) and `EditorCanvas`'s `applyFormatting` glue (Task 8 Step 10). `MarkdownEditorHandle` (Task 7) matches its usage via `markdownEditorRef` in Task 8. `detectTerminalTable`'s `TerminalTableResult` (Task 1) matches its usage in Task 8 Step 6.
- **Placeholder scan:** no TBD/TODO; the one "no automated test" case (Task 7, `MarkdownEditor.tsx`) states why and where verification happens instead of skipping silently.
