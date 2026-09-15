# Task 9 Report: Delete Tiptap, Sanitizer, and Dead Code

**Status:** DONE

**Commit:** `0cecd94` - chore(editor): remove Tiptap, lowlight, markdown-it, and the HTML sanitizer

---

## Step 1: Verification Grep Results

All grep commands confirmed zero references in active code (matches only in files to be deleted):

```bash
# GREP 1: from '@/lib/sanitizer' or lib/sanitizer
grep -rn "from '@/lib/sanitizer'\|lib/sanitizer" src/ e2e/
# Result: (no matches)

# GREP 2: SearchHighlight
grep -rn "SearchHighlight" src/components/editor/EditorCanvas.tsx
# Result: (no matches)

# GREP 3: @tiptap, lowlight, markdown-it
grep -rn "@tiptap\|lowlight\|markdown-it" src/ --include="*.ts" --include="*.tsx"
# Results (only in files being deleted):
src/components/editor/SearchHighlight.ts:1:import { Extension } from '@tiptap/core';
src/components/editor/SearchHighlight.ts:2:import type { EditorState } from '@tiptap/pm/state';
src/components/editor/SearchHighlight.ts:3:import { Plugin, PluginKey } from '@tiptap/pm/state';
src/components/editor/SearchHighlight.ts:4:import { Decoration, DecorationSet } from '@tiptap/pm/view';
src/components/editor/SearchHighlight.ts:5:import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
src/components/editor/SearchHighlight.ts:8:declare module '@tiptap/core' {
src/lib/sanitizer/markdown.ts:1:import MarkdownIt from 'markdown-it';
```

Confirms: **SAFE TO DELETE** — no imports outside of the files being removed.

---

## Step 2: Files Deleted

Using `git rm`, deleted:

- `src/lib/sanitizer/config.ts`
- `src/lib/sanitizer/index.test.ts`
- `src/lib/sanitizer/index.ts`
- `src/lib/sanitizer/markdown.ts`
- `src/lib/sanitizer/normalize.ts`
- `src/components/editor/SearchHighlight.ts`

Total: 6 files, 1 directory removed.

---

## Step 3 & 4: Dependency Removal & npm install

**Removed from `package.json` dependencies:**
- `@tiptap/extension-code-block-lowlight` (^2.27.2)
- `@tiptap/extension-image` (^2.27.2)
- `@tiptap/extension-link` (^2.27.2)
- `@tiptap/extension-table` (^2.27.2)
- `@tiptap/extension-table-cell` (^2.27.2)
- `@tiptap/extension-table-header` (^2.27.2)
- `@tiptap/extension-table-row` (^2.27.2)
- `@tiptap/extension-underline` (^2.27.2)
- `@tiptap/react` (^2.27.2)
- `@tiptap/starter-kit` (^2.27.2)
- `lowlight` (^3.3.0)
- `markdown-it` (^15.0.1)

**Removed from `package.json` devDependencies:**
- `@types/markdown-it` (^14.2.0)

**npm install result:**
```
removed 79 packages, and audited 353 packages in 3s
```

All dependencies cleanly uninstalled. No conflicts.

---

## Step 5: Full Verification Suite

### typecheck
```
✓ npm run typecheck
> tsc --noEmit
(no output = success)
```

### lint (src/ only)
```
✓ npm run lint -- src/
> eslint src/
ESLint: No issues found
```

### format:check
```
✓ npm run format:check
> prettier --check "src/**/*.{ts,tsx,css}"
All matched files use Prettier code style!
```

### test
```
✓ npm test
> vitest run

 RUN  v3.2.7

 ✓ src/lib/note-title.test.ts (6 tests) 2ms
 ✓ src/lib/markdown/formatting.test.ts (8 tests) 3ms
 ✓ src/lib/markdown/text-projection.test.ts (9 tests) 1ms
 ✓ src/lib/markdown/terminal-table.test.ts (8 tests) 2ms
 ✓ src/lib/markdown/find-matches.test.ts (4 tests) 3ms
 ✓ src/lib/search-highlight.test.tsx (13 tests) 11ms
 ✓ scripts/sync-turso-to-docker.test.mjs (9 tests) 14ms

 Test Files  7 passed (7)
      Tests  57 passed (57)
```

### build
```
✓ npm run build
> next build

▲ Next.js 16.1.6 (Turbopack)
✓ Compiled successfully in 2.1s
✓ Generating static pages using 9 workers (9/9) in 123.2ms
(full output in log)
```

---

## Additional Changes

**`src/lib/markdown/terminal-table.test.ts`**: Removed the final test case (`'generated markdown renders as a real table'`) that imported `markdownToHtml` from the deleted sanitizer module. This test was verifying markdown-it rendering behavior, which is no longer needed after the CodeMirror migration.

---

## Fix round (post-review)

Test removal was safe because:

1. **No remaining Markdown-to-HTML renderers in src/** — Grep confirms zero usage of `markdownToHtml`, `MarkdownIt`, `marked`, `remark`, or `unified` anywhere in the application. The entire HTML rendering pathway the deleted test validated no longer exists in the app.

2. **EditorCanvas.tsx's paste handler inserts Markdown directly** — The `handlePasteText()` function in EditorCanvas.tsx uses `detectTerminalTable()` to detect terminal tables and returns the generated Markdown (`| Repo | Status |` format) as a raw text string, which is inserted directly into the CodeMirror editor as plain text. The Markdown is never rendered to HTML anywhere in the application now.

3. **Remaining 8 tests still pin exact output format** — The remaining test cases in terminal-table.test.ts all use strict string assertions (`assert.equal()`) to verify that `detectTerminalTable()` produces correctly-formatted pipe-table syntax (`| Repo | Status |`, `| --- | --- |`, etc.). The property that matters to the app — that the generator emits well-formed Markdown table syntax — remains fully tested without requiring external HTML rendering validation.

---

## Summary

- **Deleted:** 6 source files (sanitizer pipeline + SearchHighlight)
- **Removed dependencies:** 12 packages (11 @tiptap/*, lowlight, markdown-it, @types/markdown-it)
- **Test files cleaned:** 1 test case removed from terminal-table.test.ts
- **Verification:** All checks pass (typecheck ✓, lint ✓, format ✓, test ✓, build ✓)
- **git commit:** `0cecd94`

No concerns. Migration clean.
