# Smart Paste Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make RICH-mode paste GFM-table-aware, terminal-table-aware, and Markdown-aware for plain text, without changing what `note.content` stores (still Tiptap HTML).

**Architecture:** One conversion funnel — Markdown text (whether it started as raw clipboard text, a converted terminal table, or a code-fence fallback) always goes through `markdown-it` to HTML, and every HTML string (whether from the clipboard's `text/html` entry or from that conversion) always goes through the existing `sanitizeHTML` allowlist before `editor.commands.insertContent`. No second parser, no second editor-insertion path.

**Tech Stack:** Next.js 16 / React 19 / TypeScript strict, Tiptap 2.27.x, `markdown-it`, Node's built-in `node --test` runner (no test framework — matches `scripts/sync-turso-to-docker.test.mjs` convention). Node 24 in this environment strips TypeScript types natively, so `node --test` can `import` a `.ts` file directly — confirmed by a throwaway smoke test during design (`node --test` on a `.ts` module worked with no loader flags).

**Spec:** `docs/superpowers/specs/2026-08-28-smart-paste-design.md`

## Global Constraints

- HTML stays the RICH-mode source of truth (`note.content`). Markdown is only ever an intermediate string, converted to HTML before it touches Tiptap — never stored, never round-tripped back out except via the existing unrelated `nodeToMarkdown` export feature.
- New `@tiptap/extension-table*` packages are pinned to `^2.27.2`, matching every other `@tiptap/*` dependency already in `package.json`.
- `markdown-it` is constructed with `{ html: false, linkify: true }`. `html: false` is a security boundary (untrusted `text/plain` must never be interpreted as literal HTML) — never set it to `true`.
- No colspan/rowspan attribute preservation, no task-list plugin, no sub-region/mixed-content terminal-table detection. All explicitly out of scope per the spec's Non-goals section.
- `sanitizeHTML`'s existing contract (security stripping + tag/style allowlist) does not change semantics. Blank-line collapsing is a separate, explicitly-called function (`collapseEmptyParagraphs`), never folded into `sanitizeHTML` itself.
- Terminal table detection (`detectTerminalTable`) operates on the whole pasted text only.
- Before every commit: `npm run lint`, `npm run typecheck`, `npm run format:check` must all pass (per `.claude/rules/git.md`).
- Sanitizer's public surface is `src/lib/sanitizer/index.ts` (the barrel) — new modules (`markdown.ts`, `terminalTable.ts`) are re-exported from there; consumers outside `src/lib/sanitizer/` import from `@/lib/sanitizer`, never reach into the sibling files directly.

---

### Task 1: `markdown-it` dependency and `markdownToHtml` wrapper

**Files:**
- Create: `src/lib/sanitizer/markdown.ts`
- Modify: `src/lib/sanitizer/index.ts` (add re-export)
- Modify: `package.json` (new dependency, via `npm install`)

**Interfaces:**
- Produces: `markdownToHtml(text: string): string`, exported from both `src/lib/sanitizer/markdown.ts` and re-exported via `src/lib/sanitizer/index.ts`.

- [ ] **Step 1: Install `markdown-it`**

Run:
```bash
npm install markdown-it
npm install --save-dev @types/markdown-it
```

This lets `npm install` resolve and pin the actual current version in `package.json`/`package-lock.json` — don't hand-write a version number.

- [ ] **Step 2: Create the wrapper module**

Create `src/lib/sanitizer/markdown.ts`:

```ts
import MarkdownIt from 'markdown-it';

// html:false is a security boundary — pasted text/plain is untrusted and must
// never be interpreted as literal HTML. linkify:true auto-links bare URLs;
// sanitizeHTML's existing http/mailto allowlist on <a href> still applies
// after this, so it's not a bypass.
const md = new MarkdownIt('default', { html: false, linkify: true });

export function markdownToHtml(text: string): string {
  return md.render(text);
}
```

- [ ] **Step 3: Re-export from the sanitizer barrel**

In `src/lib/sanitizer/index.ts`, add near the top (after the existing imports, before `sanitizeHTML`):

```ts
export { markdownToHtml } from './markdown';
```

- [ ] **Step 4: Typecheck**

Run:
```bash
npm run typecheck
```
Expected: no errors mentioning `markdown.ts` or `index.ts`.

- [ ] **Step 5: Lint and format**

Run:
```bash
npm run lint
npm run format:check
```
Expected: both pass. If `format:check` fails, run `npm run format` and re-check.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/lib/sanitizer/markdown.ts src/lib/sanitizer/index.ts
git commit -m "feat(sanitizer): add markdown-it wrapper for markdown-to-html"
```

---

### Task 2: `detectTerminalTable` (TDD)

**Files:**
- Create: `src/lib/sanitizer/terminalTable.ts`
- Create: `src/lib/sanitizer/terminalTable.test.mjs`
- Modify: `src/lib/sanitizer/index.ts` (add re-export)
- Modify: `package.json` (add `test:sanitizer` script)

**Interfaces:**
- Produces:
  ```ts
  export type TerminalTableResult =
    | { type: 'table'; markdown: string }
    | { type: 'code' }
    | { type: 'none' };

  export function detectTerminalTable(text: string): TerminalTableResult;
  ```
  Exported from `src/lib/sanitizer/terminalTable.ts` and re-exported via `src/lib/sanitizer/index.ts`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/sanitizer/terminalTable.test.mjs`:

```js
import assert from 'node:assert/strict';
import test from 'node:test';

import { detectTerminalTable } from './terminalTable.ts';

test('detects a Unicode box-drawing table', () => {
  const input = [
    '┌──────────────┬──────────┐',
    '│ Repo         │ Status   │',
    '├──────────────┼──────────┤',
    '│ pub-api      │ clean    │',
    '│ pub-web      │ dirty    │',
    '└──────────────┴──────────┘',
  ].join('\n');

  const result = detectTerminalTable(input);
  assert.equal(result.type, 'table');
  assert.equal(
    result.markdown,
    ['| Repo | Status |', '| --- | --- |', '| pub-api | clean |', '| pub-web | dirty |'].join(
      '\n',
    ),
  );
});

test('detects an ASCII grid table', () => {
  const input = [
    '+------+--------+',
    '| Repo | Status |',
    '+------+--------+',
    '| api  | clean  |',
    '+------+--------+',
  ].join('\n');

  const result = detectTerminalTable(input);
  assert.equal(result.type, 'table');
  assert.equal(result.markdown, ['| Repo | Status |', '| --- | --- |', '| api | clean |'].join('\n'));
});

test('escapes literal pipe characters inside box-drawing cell text', () => {
  const input = [
    '┌──────┬──────────┐',
    '│ Repo │ Status   │',
    '├──────┼──────────┤',
    '│ api  │ ok | warn│',
    '└──────┴──────────┘',
  ].join('\n');

  const result = detectTerminalTable(input);
  assert.equal(result.type, 'table');
  assert.match(result.markdown, /ok \\\| warn/);
});

test('falls back to code when column counts are inconsistent', () => {
  const input = [
    '┌──────┬──────────┐',
    '│ Repo │ Status   │',
    '├──────┼──────────┤',
    '│ api  │ clean │ extra │',
    '└──────┴──────────┘',
  ].join('\n');

  assert.deepEqual(detectTerminalTable(input), { type: 'code' });
});

test('falls back to code when there are borders but only one content row', () => {
  const input = ['┌──────┬──────────┐', '│ Repo │ Status   │', '└──────┴──────────┘'].join('\n');

  assert.deepEqual(detectTerminalTable(input), { type: 'code' });
});

test('returns none for plain prose', () => {
  const input = 'Just a normal paragraph about deploying the api service today.';
  assert.deepEqual(detectTerminalTable(input), { type: 'none' });
});

test('returns none for empty input', () => {
  assert.deepEqual(detectTerminalTable(''), { type: 'none' });
  assert.deepEqual(detectTerminalTable('   \n  \n'), { type: 'none' });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test src/lib/sanitizer/terminalTable.test.mjs`
Expected: FAIL — `Cannot find module './terminalTable.ts'` (file doesn't exist yet).

- [ ] **Step 3: Implement `terminalTable.ts`**

Create `src/lib/sanitizer/terminalTable.ts`:

```ts
export type TerminalTableResult =
  | { type: 'table'; markdown: string }
  | { type: 'code' }
  | { type: 'none' };

const BOX_CHARS = '┌┬┐├┼┤└┴┘│─╭╮╰╯╔╗╚╝╠╣╦╩║═';
const BOX_CHAR_SET = new Set(BOX_CHARS.split(''));

function isBoxBorderLine(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed === '') return false;
  return Array.from(trimmed).every((ch) => BOX_CHAR_SET.has(ch));
}

function isBoxContentLine(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.length >= 2 && trimmed.startsWith('│') && trimmed.endsWith('│');
}

function isAsciiBorderLine(line: string): boolean {
  return /^\+[-+]+\+$/.test(line.trim());
}

function isAsciiContentLine(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.length >= 2 && trimmed.startsWith('|') && trimmed.endsWith('|');
}

function splitCells(line: string, delimiter: '│' | '|'): string[] {
  const trimmed = line.trim();
  const inner = trimmed.slice(1, -1);
  return inner.split(delimiter).map((cell) => cell.trim());
}

function escapePipes(cell: string): string {
  return cell.replace(/\|/g, '\\|');
}

function buildMarkdownTable(rows: string[][]): string {
  const [header, ...body] = rows;
  const colCount = header.length;
  const headerLine = `| ${header.map(escapePipes).join(' | ')} |`;
  const alignLine = `| ${Array(colCount).fill('---').join(' | ')} |`;
  const bodyLines = body.map((row) => `| ${row.map(escapePipes).join(' | ')} |`);
  return [headerLine, alignLine, ...bodyLines].join('\n');
}

export function detectTerminalTable(text: string): TerminalTableResult {
  const lines = text.split('\n');
  const nonBlankLines = lines.filter((l) => l.trim() !== '');
  if (nonBlankLines.length === 0) return { type: 'none' };

  const boxBorderCount = nonBlankLines.filter(isBoxBorderLine).length;
  const boxContentCount = nonBlankLines.filter(isBoxContentLine).length;
  const asciiBorderCount = nonBlankLines.filter(isAsciiBorderLine).length;
  const asciiContentCount = nonBlankLines.filter(isAsciiContentLine).length;

  const boxTotal = boxBorderCount + boxContentCount;
  const asciiTotal = asciiBorderCount + asciiContentCount;
  const useBox = boxTotal >= asciiTotal;

  const borderCount = useBox ? boxBorderCount : asciiBorderCount;
  const contentCount = useBox ? boxContentCount : asciiContentCount;
  const total = useBox ? boxTotal : asciiTotal;

  if (borderCount === 0 || total / nonBlankLines.length < 0.5) return { type: 'none' };
  if (contentCount < 2) return { type: 'code' };

  const delimiter = useBox ? '│' : '|';
  const contentLines = nonBlankLines.filter((l) => (useBox ? isBoxContentLine(l) : isAsciiContentLine(l)));
  const rows = contentLines.map((line) => splitCells(line, delimiter));
  const colCount = rows[0].length;
  const consistent = colCount >= 2 && rows.every((row) => row.length === colCount);

  if (!consistent) return { type: 'code' };

  return { type: 'table', markdown: buildMarkdownTable(rows) };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test src/lib/sanitizer/terminalTable.test.mjs`
Expected: all 8 tests PASS.

- [ ] **Step 5: Re-export from the sanitizer barrel**

In `src/lib/sanitizer/index.ts`, next to the `markdownToHtml` re-export added in Task 1:

```ts
export { detectTerminalTable } from './terminalTable';
export type { TerminalTableResult } from './terminalTable';
```

- [ ] **Step 6: Add the `test:sanitizer` npm script**

In `package.json`'s `"scripts"`, add (near `"test:sync"`):

```json
"test:sanitizer": "node --test src/lib/sanitizer/terminalTable.test.mjs",
```

Run: `npm run test:sanitizer`
Expected: same 8 tests PASS.

- [ ] **Step 7: Typecheck, lint, format**

Run:
```bash
npm run typecheck
npm run lint
npm run format:check
```
Expected: all pass (run `npm run format` first if `format:check` fails).

- [ ] **Step 8: Commit**

```bash
git add src/lib/sanitizer/terminalTable.ts src/lib/sanitizer/terminalTable.test.mjs src/lib/sanitizer/index.ts package.json
git commit -m "feat(sanitizer): detect terminal box/ASCII tables on paste"
```

---

### Task 3: Sanitizer table pass-through and paste-scoped blank-line collapse

**Files:**
- Modify: `src/lib/sanitizer/config.ts`
- Modify: `src/lib/sanitizer/index.ts`

**Interfaces:**
- Consumes: none (pure DOM/string logic).
- Produces: `collapseEmptyParagraphs(html: string): string`, exported from `src/lib/sanitizer/index.ts`. `ALLOWED_TAGS` now includes `table`, `thead`, `tbody`, `tr`, `th`, `td`.

- [ ] **Step 1: Allow table tags**

In `src/lib/sanitizer/config.ts`, change:

```ts
export const ALLOWED_TAGS = [
  'p',
  'br',
  'strong',
  'em',
  'u',
  's',
  'ul',
  'ol',
  'li',
  'pre',
  'code',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'a',
  'span',
];
```

to:

```ts
export const ALLOWED_TAGS = [
  'p',
  'br',
  'strong',
  'em',
  'u',
  's',
  'ul',
  'ol',
  'li',
  'pre',
  'code',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'a',
  'span',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
];
```

- [ ] **Step 2: Remove the table structure-downgrade block**

In `src/lib/sanitizer/index.ts`, delete this block entirely (currently between the code-block whitespace normalization and the media downgrade):

```ts
  // Layer 3: Structure Downgrade — Tables
  doc.querySelectorAll('table').forEach((table) => {
    const rows = Array.from(table.querySelectorAll('tr'));
    rows.forEach((tr) => {
      const p = doc.createElement('p');
      const cells = Array.from(tr.querySelectorAll('td, th')).map(
        (cell) => cell.textContent?.trim() || '',
      );
      p.textContent = cells.join('\t');
      tr.replaceWith(p);
    });
    table.replaceWith(...Array.from(table.childNodes));
  });

```

The `// Layer 3: Structure Downgrade — Media` block right after it stays untouched.

- [ ] **Step 3: Update the file header comment**

Change:

```ts
/**
 * PlainDock Sanitization Engine
 * Implementation based on PRD v1.7 Section 2.2.A
 *
 * 3-layer pipeline:
 *   1. Security defense (strip dangerous elements)
 *   2. Consistency normalization (semantic tag alignment)
 *   3. Structure downgrade (tables, media → text)
 */
```

to:

```ts
/**
 * PlainDock Sanitization Engine
 * Implementation based on PRD v1.7 Section 2.2.A, with one deliberate
 * deviation: tables are no longer downgraded to text — see
 * docs/superpowers/specs/2026-08-28-smart-paste-design.md.
 *
 * 3-layer pipeline:
 *   1. Security defense (strip dangerous elements)
 *   2. Consistency normalization (semantic tag alignment)
 *   3. Structure downgrade (media → text; tables now pass through as an
 *      allowed structure instead)
 */
```

- [ ] **Step 4: Add `collapseEmptyParagraphs`**

In `src/lib/sanitizer/index.ts`, add this new exported function directly after `sanitizeHTML`'s closing brace (before `escapeHTML`). This is paste-only normalization, deliberately kept out of `sanitizeHTML` itself so that function's contract (security + allowlist) doesn't change meaning for any future caller:

```ts
// Paste-only normalization — NOT part of sanitizeHTML's contract. Collapses
// runs of empty paragraphs (from per-line HTML sources like VS Code/terminal
// clipboard exports) down to at most one, and drops a lone leading/trailing
// empty paragraph entirely. A single empty paragraph *between* content is
// left alone — it may be intentional spacing.
export function collapseEmptyParagraphs(html: string): string {
  if (!html || html.trim() === '') return html;

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  const isEmptyParagraph = (el: Element): boolean =>
    el.tagName.toLowerCase() === 'p' &&
    (el.textContent ?? '').trim() === '' &&
    Array.from(el.childNodes).every(
      (child) => child.nodeName.toLowerCase() === 'br' || child.nodeType === Node.TEXT_NODE,
    );

  let previousWasEmpty = false;
  for (const el of Array.from(doc.body.children)) {
    const isEmpty = isEmptyParagraph(el);
    if (isEmpty && previousWasEmpty) {
      el.remove();
      continue;
    }
    previousWasEmpty = isEmpty;
  }

  const remaining = Array.from(doc.body.children);
  if (remaining.length > 0 && isEmptyParagraph(remaining[0])) {
    remaining[0].remove();
  }
  const afterLeading = Array.from(doc.body.children);
  if (afterLeading.length > 0 && isEmptyParagraph(afterLeading[afterLeading.length - 1])) {
    afterLeading[afterLeading.length - 1].remove();
  }

  return doc.body.innerHTML;
}
```

- [ ] **Step 5: Typecheck, lint, format**

Run:
```bash
npm run typecheck
npm run lint
npm run format:check
```
Expected: all pass.

- [ ] **Step 6: Manual verification**

No automated test here — `sanitizeHTML`/`collapseEmptyParagraphs` depend on browser `DOMParser`, matching this file's existing (untested) convention. Verified in Task 5's manual pass once the paste handler wires everything together — don't skip that step.

- [ ] **Step 7: Commit**

```bash
git add src/lib/sanitizer/config.ts src/lib/sanitizer/index.ts
git commit -m "fix(sanitizer): allow tables through, add paste blank-line collapse"
```

---

### Task 4: Tiptap table extensions and CSS

**Files:**
- Modify: `src/components/editor/EditorCanvas.tsx` (imports + `useEditor` extensions array only — paste handler stays untouched until Task 5)
- Modify: `src/app/globals.css`
- Modify: `package.json` (new dependencies, via `npm install`)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `Table`, `TableRow`, `TableHeader`, `TableCell` registered as Tiptap extensions — later tasks don't call these directly, but Task 5's `handlePaste` output (a `<table>` in the inserted HTML) depends on the editor schema accepting it, which this task provides.

- [ ] **Step 1: Install the table extensions**

Run:
```bash
npm install @tiptap/extension-table@^2.27.2 @tiptap/extension-table-row@^2.27.2 @tiptap/extension-table-header@^2.27.2 @tiptap/extension-table-cell@^2.27.2
```

- [ ] **Step 2: Register the extensions**

In `src/components/editor/EditorCanvas.tsx`, add imports after the existing Tiptap extension imports (`Underline`, `Image`):

```ts
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';
```

Then in the `useEditor` call, change:

```ts
  const editor = useEditor({
    extensions: [StarterKit, Underline, Image.configure({ allowBase64: true })],
```

to:

```ts
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Image.configure({ allowBase64: true }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
    ],
```

- [ ] **Step 3: Add table CSS**

In `src/app/globals.css`, add this block after the existing `.ProseMirror img.ProseMirror-selectednode` rule at the end of the file:

```css
.ProseMirror .tableWrapper {
  overflow-x: auto;
  margin: 1rem 0;
}
.ProseMirror table {
  border-collapse: collapse;
  border: 1px solid #27272a;
}
.ProseMirror th,
.ProseMirror td {
  border: 1px solid #27272a;
  padding: 0.5rem 0.75rem;
  text-align: left;
  vertical-align: top;
}
.ProseMirror th {
  background: #18181b;
  color: #fff;
  font-weight: bold;
}
.ProseMirror td {
  color: #d1d1d1;
}
```

No `table-layout: fixed` and no forced `width: 100%` — columns stay content-sized and `.tableWrapper` scrolls horizontally instead of squeezing columns.

- [ ] **Step 4: Typecheck, lint, format, build**

Run:
```bash
npm run typecheck
npm run lint
npm run format:check
npm run build
```
Expected: all pass. `npm run build` in particular confirms the new Tiptap extensions resolve and bundle correctly.

- [ ] **Step 5: Manual verification**

Run `npm run dev`, open a RICH-mode note, and paste a table copied from a GitHub Markdown file (its clipboard `text/html` contains a real `<table>`) or from a spreadsheet. Confirm:
- It renders as an actual bordered table, not flattened text.
- A table wider than the pane scrolls horizontally inside itself (drag the browser narrower) instead of squeezing every column unreadably thin.

- [ ] **Step 6: Commit**

```bash
git add src/components/editor/EditorCanvas.tsx src/app/globals.css package.json package-lock.json
git commit -m "feat(editor): add Tiptap table extensions and table styling"
```

---

### Task 5: Rewrite the paste handler

**Files:**
- Modify: `src/components/editor/EditorCanvas.tsx`

**Interfaces:**
- Consumes: `sanitizeHTML`, `collapseEmptyParagraphs`, `markdownToHtml`, `detectTerminalTable` (all from `@/lib/sanitizer`, produced by Tasks 1–3); Tiptap table schema (Task 4).
- Produces: nothing new for later tasks — this is the final integration point.

- [ ] **Step 1: Update the sanitizer import**

In `src/components/editor/EditorCanvas.tsx`, change:

```ts
import { sanitizeHTML, wrapPlainText, getNoteTextContent } from '@/lib/sanitizer';
```

to:

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

- [ ] **Step 2: Add the `textToCleanHtml` helper**

Add this module-level function near the other module-level helpers at the top of the file (e.g. right after `resizeImageToDataURL`):

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

- [ ] **Step 3: Rewrite the paste branches**

Inside `handlePaste`, change:

```ts
        const html = event.clipboardData?.getData('text/html');
        const text = event.clipboardData?.getData('text/plain');

        if (html && html.trim() !== '') {
          const clean = sanitizeHTML(html);
          editor.commands.insertContent(clean);
          return true;
        } else if (text) {
          const clean = wrapPlainText(text);
          editor.commands.insertContent(clean);
          return true;
        }
        return false;
```

to:

```ts
        const html = event.clipboardData?.getData('text/html');
        const text = event.clipboardData?.getData('text/plain');

        if (html && html.trim() !== '') {
          // HTML is normally the richer representation (links, inline marks,
          // structure) and wins by default — UNLESS it has no real table of
          // its own while the plain-text entry resolves to one. That case
          // means the source's HTML was a lossy per-line dump (common from
          // VS Code/terminal HTML clipboard exports) while text/plain still
          // carries a parseable terminal/Markdown table — prefer the table.
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
        return false;
```

`wrapPlainText` stays imported and used elsewhere in this file (`handleSwitchMode`'s PLAIN→RICH conversion) — don't remove the import.

- [ ] **Step 4: Typecheck, lint, format, build**

Run:
```bash
npm run typecheck
npm run lint
npm run format:check
npm run build
```
Expected: all pass.

- [ ] **Step 5: Manual verification**

Run `npm run dev`, open a RICH-mode note, and check each of these paste scenarios:

1. **GFM table as HTML** — copy a Markdown table from a GitHub file view or rendered chat UI, paste it. Expect: real `<table>`, inline formatting inside cells (if any) preserved.
2. **GFM table as plain text** — copy raw Markdown table syntax as plain text (e.g. from a `.md` file in a plain-text editor with no HTML clipboard entry — or `pbcopy < table.md` on macOS) and paste. Expect: real `<table>`.
3. **Terminal box-drawing table** — run something that prints a box-drawing table (e.g. `docker compose ps` in a terminal that box-draws, or manually construct one), copy as plain text, paste. Expect: real `<table>`, columns aligned correctly, no stray box-drawing characters left in the text.
4. **Malformed/ambiguous table-like text** — paste plain text with box-drawing-ish characters but inconsistent columns. Expect: a fenced/monospace code block, not garbled misaligned text.
5. **Plain-text Markdown syntax** — paste plain text containing `**bold**`, `- a list item`, and `# A Heading`. Expect: rendered as bold text, a bullet list, and a heading — not literal asterisks/hyphens/hashes.
6. **Blank-line collapse** — copy a code snippet with several blank lines between blocks from VS Code (its HTML clipboard export is typically one `<div>`/`<span>` per line), paste it. Expect: blank-line runs collapse to a single blank line, not a wall of empty lines.
7. **HTML-vs-text priority** — construct a scenario where `text/html` has no `<table>` (e.g. copy terminal output where the terminal app only emits a syntax-highlighted per-line HTML dump) but `text/plain` is a clean box-drawing table. Expect: the table wins over the flattened HTML. (If your terminal app doesn't emit `text/html` at all, this naturally falls into the plain-text-only path and scenario 3 already covers it — that's fine, the priority logic only matters when both entries are present.)

- [ ] **Step 6: Commit**

```bash
git add src/components/editor/EditorCanvas.tsx
git commit -m "feat(editor): make paste GFM/terminal-table and Markdown aware"
```

---

## Plan Self-Review Notes

- **Spec coverage:** Goals 1–4 map to Tasks 1–5 (table rendering: Tasks 1,2,4,5; terminal detection: Task 2; Markdown-aware plain text: Tasks 1,5; blank-line collapse: Task 3,5). All three review-round changes (HTML-vs-text priority, paste-scoped blank-line collapse, content-sized table CSS) are reflected in Tasks 3–5. Non-goals (Markdown-as-canonical, colspan/rowspan, task lists, mixed-content sub-region detection, PLAIN-mode/mode-switch changes) are respected — no task touches `wrapPlainText`'s existing callers or PLAIN mode.
- **Type consistency:** `TerminalTableResult`'s three variants (`'table' | 'code' | 'none'`) are used identically in `terminalTable.ts` (Task 2) and consumed identically in `textToCleanHtml` (Task 5). `markdownToHtml(text: string): string` and `collapseEmptyParagraphs(html: string): string` signatures match between definition and call sites across tasks.
- **No placeholders:** every step has literal code or literal shell commands; no "add error handling" or "similar to Task N" shortcuts.
