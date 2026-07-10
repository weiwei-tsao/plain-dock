# Note Export (.txt / .md) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user download any note as a `.txt` or `.md` file, for both PLAIN and RICH notes, from the editor's existing overflow menu (phone) and action bar (desktop).

**Architecture:** Entirely client-side, entirely inside `src/components/editor/EditorCanvas.tsx`. Two new top-level pure helpers (`sanitizeFilename`, `downloadTextFile`) plus a new `nodeToMarkdown()` function that walks the same Tiptap JSON tree (`TiptapNode`) that the existing `nodeToText()` already walks. Two new click handlers (`handleExportTxt`, `handleExportMd`) each build the right string per note mode and call `downloadTextFile`. Four new buttons total (txt+md × phone menu+desktop bar), styled after the existing Copy Plain/Copy HTML buttons.

**Tech Stack:** React 19 (`'use client'` component), Tiptap 2.27 (`editor.getJSON()`), native browser `Blob`/`URL.createObjectURL` for the download — no new dependency.

## Global Constraints

- No test runner is configured in this repo (see project `CLAUDE.md`). Verification for every task is `npm run typecheck && npm run lint && npm run format:check`, plus a manual check in `npm run dev` — there are no `*.test.ts` files to add.
- No new npm dependency — spec explicitly rules out a markdown library (`docs/superpowers/specs/2026-07-09-note-export-design.md`, "Out of Scope").
- No API route or schema change — export reads state already present in the client (`plainContentRef.current` / live `editor` instance).
- Filenames: `${sanitizeFilename(localTitle)}.txt` or `.md`. `sanitizeFilename` replaces only the filesystem-illegal characters `\ / : * ? " < > |` with `-`; case, spaces, and non-ASCII (e.g. Chinese) are preserved as-is; falls back to `'untitled'` only when the result is empty.
- Icon: lucide-react `Download`, imported individually alongside the other icons already imported in `EditorCanvas.tsx` (existing project convention — never import the whole package).
- Image nodes in RICH notes always render as `[image: alt]` in exported text — never embed the base64 `src`.

---

### Task 1: Export as .txt (helpers + wiring, both modes)

**Files:**
- Modify: `src/components/editor/EditorCanvas.tsx`

**Interfaces:**
- Consumes: existing `nodeToText(node: TiptapNode): string` (unchanged, already defined at line ~70), existing `plainContentRef.current: string`, existing `localTitle: string` state, existing `editor?.getJSON()`.
- Produces (used by Task 2):
  - `function sanitizeFilename(title: string): string`
  - `function downloadTextFile(filename: string, content: string): void`
  - `const handleExportTxt: () => void` (component-scoped, reads `note.mode`/`editor`/`localTitle`)

- [ ] **Step 1: Add the `Download` icon import**

In `src/components/editor/EditorCanvas.tsx`, the icon import block currently reads (around line 22):

```ts
import {
  Pin,
  Trash2,
  Copy,
  FileCode,
  Type,
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  MoreHorizontal,
} from 'lucide-react';
```

Change to:

```ts
import {
  Pin,
  Trash2,
  Copy,
  Download,
  FileCode,
  Type,
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  MoreHorizontal,
} from 'lucide-react';
```

- [ ] **Step 2: Add `sanitizeFilename` and `downloadTextFile` helpers**

Immediately after the existing `nodeToText` function (it currently ends at line ~80 with a closing `}` right before `interface EditorCanvasProps`), insert:

```ts
function sanitizeFilename(title: string): string {
  const cleaned = title.trim().replace(/[\\/:*?"<>|]/g, '-');
  return cleaned || 'untitled';
}

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

So the file now reads (abbreviated):

```ts
function nodeToText(node: TiptapNode): string {
  // ...unchanged...
}

function sanitizeFilename(title: string): string {
  const cleaned = title.trim().replace(/[\\/:*?"<>|]/g, '-');
  return cleaned || 'untitled';
}

function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

interface EditorCanvasProps {
  // ...unchanged...
```

- [ ] **Step 3: Add `handleExportTxt`**

Find the end of the existing `copyToClipboard` function (currently ends around line 334 with `};`, immediately followed by the `statsText` computation). Insert the new handler between them:

```ts
  const copyToClipboard = async (isHTML: boolean = false) => {
    // ...unchanged, ends with:
  };

  const handleExportTxt = () => {
    const text =
      note.mode === NoteMode.RICH
        ? nodeToText((editor?.getJSON() ?? {}) as TiptapNode)
        : plainContentRef.current;
    downloadTextFile(`${sanitizeFilename(localTitle)}.txt`, text);
  };

  const statsText =
    note.mode === NoteMode.RICH ? (editor?.getText({ blockSeparator: '' }) ?? '') : plainContent;
```

- [ ] **Step 4: Wire the phone overflow-menu button**

In the overflow menu block, find where the Copy HTML conditional closes and the delete divider begins (currently lines ~419-431):

```tsx
                    {note.mode === NoteMode.RICH && (
                      <button
                        onClick={() => {
                          copyToClipboard(true);
                          setShowOverflowMenu(false);
                        }}
                        className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
                      >
                        <Copy className="h-4 w-4" />
                        Copy HTML
                      </button>
                    )}
                    <div className="my-1 border-t border-zinc-800" />
```

Insert a new button between the `)}` and the divider:

```tsx
                    {note.mode === NoteMode.RICH && (
                      <button
                        onClick={() => {
                          copyToClipboard(true);
                          setShowOverflowMenu(false);
                        }}
                        className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
                      >
                        <Copy className="h-4 w-4" />
                        Copy HTML
                      </button>
                    )}
                    <button
                      onClick={() => {
                        handleExportTxt();
                        setShowOverflowMenu(false);
                      }}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
                    >
                      <Download className="h-4 w-4" />
                      Export .txt
                    </button>
                    <div className="my-1 border-t border-zinc-800" />
```

- [ ] **Step 5: Wire the desktop action-bar button**

In the desktop action bar, find where the Copy Rich (HTML) conditional closes, before the Delete button (currently lines ~496-509):

```tsx
            {note.mode === NoteMode.RICH && (
              <button
                onClick={() => copyToClipboard(true)}
                className="flex items-center gap-1.5 rounded-lg p-2 text-zinc-500 transition-all hover:bg-indigo-400/10 hover:text-indigo-400"
                title="Copy Rich (HTML)"
              >
                <Copy className="h-4 w-4" />
                <span className="rounded-sm border border-current px-1 text-[9px] font-black">
                  HTML
                </span>
              </button>
            )}

            <button
              onClick={() => setShowDeleteConfirm(true)}
```

Insert a new button between the `)}` and the blank line before Delete:

```tsx
            {note.mode === NoteMode.RICH && (
              <button
                onClick={() => copyToClipboard(true)}
                className="flex items-center gap-1.5 rounded-lg p-2 text-zinc-500 transition-all hover:bg-indigo-400/10 hover:text-indigo-400"
                title="Copy Rich (HTML)"
              >
                <Copy className="h-4 w-4" />
                <span className="rounded-sm border border-current px-1 text-[9px] font-black">
                  HTML
                </span>
              </button>
            )}

            <button
              onClick={handleExportTxt}
              className="flex items-center gap-1.5 rounded-lg p-2 text-zinc-500 transition-all hover:bg-zinc-800 hover:text-white"
              title="Export as .txt"
            >
              <Download className="h-4 w-4" />
              <span className="rounded-sm border border-current px-1 text-[9px] font-black">
                TXT
              </span>
            </button>

            <button
              onClick={() => setShowDeleteConfirm(true)}
```

- [ ] **Step 6: Verify**

Run: `npm run typecheck && npm run lint && npm run format:check`
Expected: all three pass with no errors.

Run: `npm run dev`, open the app in a browser.
- Open a PLAIN note with some text, phone-width viewport (or resize below 768px): open the overflow (`⋯`) menu, click "Export .txt". Confirm a file named `<title>.txt` (or `untitled.txt` if title is empty) downloads containing the raw note text.
- Widen to desktop width: click the new Download/TXT button in the action bar for the same note. Confirm same result.
- Open a RICH note with a couple of paragraphs and a heading. Export .txt both ways (phone menu, desktop bar). Confirm the downloaded file contains the note's text with paragraph breaks (via `nodeToText`), no HTML tags.

- [ ] **Step 7: Commit**

```bash
git add src/components/editor/EditorCanvas.tsx
git commit -m "$(cat <<'EOF'
feat(editor): add export as .txt for any note
EOF
)"
```

---

### Task 2: Export as .md (Markdown conversion + wiring, both modes)

**Files:**
- Modify: `src/components/editor/EditorCanvas.tsx`

**Interfaces:**
- Consumes: `TiptapNode` type (Task 1's file, defined at line ~62), `sanitizeFilename`, `downloadTextFile`, `handleExportTxt`'s sibling pattern, `plainContentRef.current`, `localTitle`, `editor?.getJSON()` — all from Task 1.
- Produces: `function nodeToMarkdown(node: TiptapNode): string`, `const handleExportMd: () => void`. Nothing later depends on these (this is the last task).

- [ ] **Step 1: Extend `TiptapNode` with a `marks` field**

The existing type (currently around line 62) reads:

```ts
type TiptapNode = {
  type?: string;
  text?: string;
  content?: TiptapNode[];
  attrs?: Record<string, unknown>;
};
```

Change to:

```ts
type TiptapMark = { type: string; attrs?: Record<string, unknown> };

type TiptapNode = {
  type?: string;
  text?: string;
  content?: TiptapNode[];
  attrs?: Record<string, unknown>;
  marks?: TiptapMark[];
};
```

(`nodeToText` ignores `marks` entirely — plain-text extraction was never supposed to carry formatting — so this addition doesn't change its behavior; TypeScript will still accept the existing calls unchanged since the field is optional.)

- [ ] **Step 2: Add `applyMarks` and `nodeToMarkdown`**

Immediately after `nodeToText` (which ends at line ~80, right before the `sanitizeFilename` function added in Task 1), insert:

```ts
function applyMarks(text: string, marks: TiptapMark[] = []): string {
  const wrappers: Array<[string, (s: string) => string]> = [
    ['code', (s) => `\`${s}\``],
    ['strike', (s) => `~~${s}~~`],
    ['italic', (s) => `_${s}_`],
    ['bold', (s) => `**${s}**`],
    ['underline', (s) => `<u>${s}</u>`],
  ];
  let result = text;
  for (const [type, wrap] of wrappers) {
    if (marks.some((m) => m.type === type)) result = wrap(result);
  }
  const link = marks.find((m) => m.type === 'link');
  const href = link?.attrs?.href;
  if (typeof href === 'string') {
    result = `[${result}](${href})`;
  }
  return result;
}

function nodeToMarkdown(node: TiptapNode): string {
  if (node.type === 'image') {
    const alt = node.attrs?.alt as string | undefined;
    return `[image: ${alt || 'embedded-image.webp'}]`;
  }
  if (node.type === 'text') return applyMarks(node.text ?? '', node.marks);
  if (node.type === 'hardBreak') return '\n';

  const inner = (node.content ?? []).map(nodeToMarkdown);

  switch (node.type) {
    case 'heading': {
      const level = (node.attrs?.level as number | undefined) ?? 1;
      return `${'#'.repeat(level)} ${inner.join('')}\n\n`;
    }
    case 'paragraph':
      return `${inner.join('')}\n\n`;
    case 'codeBlock':
      return `\`\`\`\n${inner.join('')}\n\`\`\`\n\n`;
    case 'blockquote':
      return (
        inner
          .join('')
          .trimEnd()
          .split('\n')
          .map((line) => `> ${line}`)
          .join('\n') + '\n\n'
      );
    case 'bulletList':
      return (node.content ?? []).map((li) => `- ${nodeToMarkdown(li).trim()}`).join('\n') + '\n\n';
    case 'orderedList':
      return (
        (node.content ?? [])
          .map((li, i) => `${i + 1}. ${nodeToMarkdown(li).trim()}`)
          .join('\n') + '\n\n'
      );
    case 'listItem':
      return inner.join('');
    default:
      return inner.join('');
  }
}
```

- [ ] **Step 3: Add `handleExportMd`**

Right after `handleExportTxt` (added in Task 1, just before the `statsText` computation):

```ts
  const handleExportTxt = () => {
    // ...unchanged from Task 1...
  };

  const handleExportMd = () => {
    const text =
      note.mode === NoteMode.RICH
        ? nodeToMarkdown((editor?.getJSON() ?? {}) as TiptapNode).trim()
        : plainContentRef.current;
    downloadTextFile(`${sanitizeFilename(localTitle)}.md`, text);
  };

  const statsText =
    note.mode === NoteMode.RICH ? (editor?.getText({ blockSeparator: '' }) ?? '') : plainContent;
```

- [ ] **Step 4: Wire the phone overflow-menu button**

Right after the "Export .txt" button added in Task 1 (and still before the delete divider):

```tsx
                    <button
                      onClick={() => {
                        handleExportTxt();
                        setShowOverflowMenu(false);
                      }}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
                    >
                      <Download className="h-4 w-4" />
                      Export .txt
                    </button>
                    <button
                      onClick={() => {
                        handleExportMd();
                        setShowOverflowMenu(false);
                      }}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
                    >
                      <Download className="h-4 w-4" />
                      Export .md
                    </button>
                    <div className="my-1 border-t border-zinc-800" />
```

- [ ] **Step 5: Wire the desktop action-bar button**

Right after the TXT export button added in Task 1, before Delete:

```tsx
            <button
              onClick={handleExportTxt}
              className="flex items-center gap-1.5 rounded-lg p-2 text-zinc-500 transition-all hover:bg-zinc-800 hover:text-white"
              title="Export as .txt"
            >
              <Download className="h-4 w-4" />
              <span className="rounded-sm border border-current px-1 text-[9px] font-black">
                TXT
              </span>
            </button>

            <button
              onClick={handleExportMd}
              className="flex items-center gap-1.5 rounded-lg p-2 text-zinc-500 transition-all hover:bg-zinc-800 hover:text-white"
              title="Export as .md"
            >
              <Download className="h-4 w-4" />
              <span className="rounded-sm border border-current px-1 text-[9px] font-black">
                MD
              </span>
            </button>

            <button
              onClick={() => setShowDeleteConfirm(true)}
```

- [ ] **Step 6: Verify**

Run: `npm run typecheck && npm run lint && npm run format:check`
Expected: all three pass with no errors.

Run: `npm run dev`, open the app in a browser.
- PLAIN note: Export .md, confirm the downloaded `.md` file's content is identical to the `.txt` export from Task 1 (only the filename extension differs).
- RICH note: create one with bold, italic, underline, strikethrough, an H1, an H2, a bullet list (2+ items), an ordered list (2+ items), a code block with 2+ lines, a blockquote, a pasted link, and a pasted image (paste a screenshot). Export .md. Open the file and confirm:
  - `**bold**`, `_italic_`, `<u>underline</u>`, `~~strike~~` all appear correctly
  - Headings render as `#`/`##` lines
  - Bullet/ordered list items appear as `- `/`1. ` lines
  - Code block is fenced with `` ``` ``
  - Blockquote lines are prefixed `> `
  - The link appears as `[text](href)`
  - The pasted image appears as `[image: <filename-or-embedded-image.webp>]`, not as raw base64
- Note with empty title: confirm both `.txt` and `.md` downloads are named `untitled.txt` / `untitled.md`.
- Note with a Chinese title (e.g. `周会记要`): confirm the downloaded filename preserves the Chinese characters (`周会记要.md`).

- [ ] **Step 7: Commit**

```bash
git add src/components/editor/EditorCanvas.tsx
git commit -m "$(cat <<'EOF'
feat(editor): add export as .md with markdown conversion
EOF
)"
```
