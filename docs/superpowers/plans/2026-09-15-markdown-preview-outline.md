# Markdown Preview with Outline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Requirements revision — 2026-09-16; execution remains paused for requirements alignment.** The user confirmed a writing-first workflow and preservation of undo/redo history, cursor/selection, and editing scroll position across Edit → Preview → Edit for the current note. The design spec's “Preserve the writing session across Preview” section supersedes this plan's original unmount-on-toggle approach. Task 12's toggle/lifecycle steps (especially Step 9's conditional editor mount) must be revised, and Task 13 must cover the new browser acceptance checks, before this plan is dispatched. The code examples below are not yet an executable plan for the revised requirement.

**Goal:** Replace the PLAIN/RICH editor toggle with a single Markdown editor plus a Preview view that renders the note's Markdown as HTML with a heading-based outline on the left.

**Architecture:** A new pure module (`src/lib/markdown/render-html.ts`) parses Markdown with `@lezer/markdown` (GFM-configured) and walks the resulting syntax tree once to produce both an HTML string and a heading list, escaping all text/attributes and allowlisting link/image URL schemes as it goes. `EditorCanvas` drops its PLAIN `<textarea>` branch entirely and gains a local, ephemeral `previewMode` flag. The current note's CodeMirror editor stays mounted but hidden during Preview; a new `MarkdownPreview` component owns rendering and wraps a new `MarkdownOutline` component (click-to-scroll heading list).

**Tech Stack:** Next.js/React/TypeScript, `@lezer/markdown` + `@lezer/common` (promoted from transitive to direct dependencies, versions already resolved in the lockfile), Vitest.

**Spec:** `docs/superpowers/specs/2026-09-15-markdown-preview-outline-design.md`

## Global Constraints

- `Note.mode` / `NoteMode` enum / `NotePayload.mode` / API validation are **not** touched — every save just carries `note.mode` forward unchanged (spec: "`Note.mode`: frozen, not removed").
- No HTML sanitizer library is added. `render-html.ts` **is** the sanitizer: every text node goes through `escapeHtml()`, every attribute through `escapeAttribute()`, and `<a href>` / `<img src>` are scheme-allowlisted before being written out. `dangerouslySetInnerHTML` appears exactly once in the whole codebase, in `MarkdownPreview.tsx`, fed only by this renderer's output.
- GFM is required: `import { parser, GFM } from '@lezer/markdown'; const markdownParser = parser.configure(GFM);` — without it, pasted tables (`terminal-table.ts`'s output) parse as plain pipe-text instead of a table.
- `@lezer/markdown` is pinned to `1.7.2` and `@lezer/common` to `1.5.2` as direct dependencies — both versions are already resolved in the lockfile as transitive deps of `@codemirror/lang-markdown`; this is a `package.json` declaration change, not a new install.
- No syntax highlighting in the rendered preview, no scrollspy in the outline (click-to-scroll only), no new view-state persistence across reloads or switching notes.
- Edit → Preview → Edit must preserve the current note's undo/redo history, cursor position, selection, and editor scroll position. Keep the current editor instance mounted; preview scrolling must not change the editing position. Preview uses current in-memory content, and toggling does not cancel pending autosave.
- Dark zinc/indigo palette only (`.claude/rules/styling.md`), no `@tailwindcss/typography` or other new styling dependency — hand-written CSS in `globals.css`, matching the existing pattern for CodeMirror (`markdown-theme.ts`) and the scrollbar.
- Every renderer code snippet in this plan has been run against the real `@lezer/markdown` parser (not guessed) — the exact HTML strings in the test assertions below are verified output, not predictions.

---

## Task 1: HTML/attribute escaping and URL scheme allowlist

**Files:**
- Create: `src/lib/markdown/render-html.ts`
- Test: `src/lib/markdown/render-html.test.ts`

**Interfaces:**
- Produces: `escapeHtml(text: string): string`, `escapeAttribute(text: string): string`, `isSafeLinkHref(url: string): boolean`, `isSafeImageSrc(url: string): boolean` — all exported, used by every later task in this file.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/markdown/render-html.test.ts
import { describe, it, expect } from 'vitest';
import { escapeHtml, escapeAttribute, isSafeLinkHref, isSafeImageSrc } from './render-html';

describe('escapeHtml', () => {
  it('escapes &, <, >', () => {
    expect(escapeHtml('<script>a & b</script>')).toBe('&lt;script&gt;a &amp; b&lt;/script&gt;');
  });
});

describe('escapeAttribute', () => {
  it('escapes quotes in addition to &, <, >', () => {
    expect(escapeAttribute(`"quoted" & 'single'`)).toBe('&quot;quoted&quot; &amp; &#39;single&#39;');
  });
});

describe('isSafeLinkHref', () => {
  it('allows http, https, mailto, and relative/fragment URLs', () => {
    expect(isSafeLinkHref('http://example.com')).toBe(true);
    expect(isSafeLinkHref('https://example.com')).toBe(true);
    expect(isSafeLinkHref('mailto:a@b.com')).toBe(true);
    expect(isSafeLinkHref('/notes/123')).toBe(true);
    expect(isSafeLinkHref('#section')).toBe(true);
  });

  it('rejects javascript: and vbscript: and data: schemes', () => {
    expect(isSafeLinkHref('javascript:alert(1)')).toBe(false);
    expect(isSafeLinkHref('vbscript:msgbox(1)')).toBe(false);
    expect(isSafeLinkHref('data:text/html,<script>alert(1)</script>')).toBe(false);
  });

  it('rejects a URL containing a control character, even if the scheme regex would otherwise miss it', () => {
    // Browsers strip tab/CR/LF from a URL during their own parsing, so
    // "java<TAB>script:alert(1)" — which our scheme regex fails to
    // recognize as "javascript:" — is still interpreted as exactly that
    // once the browser re-parses the href. Rejecting any URL containing an
    // ASCII control character closes this regardless of what the scheme
    // regex does or doesn't match.
    expect(isSafeLinkHref('java\tscript:alert(1)')).toBe(false);
    expect(isSafeLinkHref('java\nscript:alert(1)')).toBe(false);
  });
});

describe('isSafeImageSrc', () => {
  it('allows http, https, and data:image/{png,jpeg,webp,gif}', () => {
    expect(isSafeImageSrc('https://example.com/x.png')).toBe(true);
    expect(isSafeImageSrc('data:image/webp;base64,AAAA')).toBe(true);
    expect(isSafeImageSrc('data:image/png;base64,AAAA')).toBe(true);
    expect(isSafeImageSrc('data:image/png,AAAA')).toBe(true); // no ;params is still valid
  });

  it('rejects javascript: and non-image data: URIs', () => {
    expect(isSafeImageSrc('javascript:alert(1)')).toBe(false);
    expect(isSafeImageSrc('data:text/html,<script>alert(1)</script>')).toBe(false);
  });

  it('rejects a MIME type that merely starts with an allowed one (boundary check, not prefix check)', () => {
    // "data:image/pngevil,..." must not pass just because the string
    // "data:image/png" is a prefix of it — the character right after the
    // MIME type must be ';' (params) or ',' (payload start), nothing else.
    expect(isSafeImageSrc('data:image/pngevil,AAAA')).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/markdown/render-html.test.ts`
Expected: FAIL — `render-html.ts` doesn't exist yet.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/markdown/render-html.ts

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function escapeAttribute(text: string): string {
  return escapeHtml(text).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ASCII control characters (tab, CR, LF, etc.) are never legitimate inside a
// URL we write into href/src. A browser's own URL parser strips them, so a
// scheme like "java\tscript:" — which the regex below fails to recognize as
// "javascript:" — can still be interpreted as exactly that once the browser
// re-parses the attribute. Rejecting any URL containing one closes that gap
// without depending on the scheme regex alone.
function hasControlChars(url: string): boolean {
  return /[\u0000-\u001F\u007F]/.test(url);
}

function getScheme(url: string): string | null {
  const match = /^([a-z][a-z0-9+.-]*):/i.exec(url.trim());
  return match ? match[1].toLowerCase() : null;
}

const LINK_SCHEMES = new Set(['http', 'https', 'mailto']);
const IMAGE_URL_SCHEMES = new Set(['http', 'https']);
// Matches only at a MIME-type boundary ("data:image/png," or
// "data:image/png;base64,...") — a plain .startsWith("data:image/png")
// check would also pass "data:image/pngevil,...", since that string has
// the allowed prefix too.
const IMAGE_DATA_MIME_RE = /^data:image\/(?:png|jpeg|webp|gif)(?:;[^,]*)?,/i;

// A URL with no scheme (a relative path or #fragment) is allowed through
// unchanged — there is no meaningful attack surface in a scheme-less URL.
export function isSafeLinkHref(url: string): boolean {
  if (hasControlChars(url)) return false;
  const scheme = getScheme(url);
  if (scheme === null) return true;
  return LINK_SCHEMES.has(scheme);
}

export function isSafeImageSrc(url: string): boolean {
  if (hasControlChars(url)) return false;
  const scheme = getScheme(url);
  if (scheme === null) return true;
  if (scheme === 'data') return IMAGE_DATA_MIME_RE.test(url.trim());
  return IMAGE_URL_SCHEMES.has(scheme);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/markdown/render-html.test.ts`
Expected: PASS — all tests in the file (this is the first test task, so just the ones written in this step)

- [ ] **Step 5: Commit**

```bash
git add src/lib/markdown/render-html.ts src/lib/markdown/render-html.test.ts
git commit -m "feat(markdown): add html escaping and url scheme allowlist"
```

---

## Task 2: Heading slug generator

**Files:**
- Modify: `src/lib/markdown/render-html.ts`
- Modify: `src/lib/markdown/render-html.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: an internal (not exported — only used inside this file's own heading renderer in Task 6) `assignHeadingId(text: string, seen: Map<string, number>): string`. Exported temporarily as `_assignHeadingId` for this task's direct tests, since headings can't be produced end-to-end until Task 6 wires up the parser; Task 6 removes the underscore-prefixed export once `renderMarkdown()` exercises it end-to-end.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/markdown/render-html.test.ts`:

```ts
import { _assignHeadingId } from './render-html';

describe('_assignHeadingId', () => {
  it('slugifies ASCII text', () => {
    const seen = new Map<string, number>();
    expect(_assignHeadingId('Hello World', seen)).toBe('hello-world');
  });

  it('preserves non-Latin letters instead of stripping them', () => {
    const seen = new Map<string, number>();
    expect(_assignHeadingId('架构设计', seen)).toBe('架构设计');
    expect(_assignHeadingId('Hello 世界', seen)).toBe('hello-世界');
  });

  it('dedupes repeated slugs with -2, -3 suffixes', () => {
    const seen = new Map<string, number>();
    expect(_assignHeadingId('Test', seen)).toBe('test');
    expect(_assignHeadingId('Test', seen)).toBe('test-2');
    expect(_assignHeadingId('Test', seen)).toBe('test-3');
  });

  it('falls back to "section" when the heading has no letters or numbers', () => {
    const seen = new Map<string, number>();
    expect(_assignHeadingId('!!!', seen)).toBe('section');
    expect(_assignHeadingId('!!!', seen)).toBe('section-2');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/markdown/render-html.test.ts`
Expected: FAIL — `_assignHeadingId` is not exported yet.

- [ ] **Step 3: Write the implementation**

Add to `src/lib/markdown/render-html.ts`:

```ts
function slugifyText(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-') // keep Unicode letters/numbers, everything else is a separator
    .replace(/^-+|-+$/g, ''); // trim leading/trailing '-'
  return slug || 'section';
}

export function _assignHeadingId(text: string, seen: Map<string, number>): string {
  const base = slugifyText(text);
  const count = seen.get(base) ?? 0;
  seen.set(base, count + 1);
  return count === 0 ? base : `${base}-${count + 1}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/markdown/render-html.test.ts`
Expected: PASS — all tests in the file, including the ones from Task 1

- [ ] **Step 5: Commit**

```bash
git add src/lib/markdown/render-html.ts src/lib/markdown/render-html.test.ts
git commit -m "feat(markdown): add unicode-aware heading slug generator"
```

---

## Task 3: Direct dependencies, parser setup, gap-aware core (Document/Paragraph)

This is the foundational task: it establishes the traversal contract every later task extends. Read it carefully even if you're only implementing a later task — every subsequent task's `renderNode` cases plug into the `switch` built here.

**Files:**
- Modify: `package.json`
- Modify: `src/lib/markdown/render-html.ts`
- Modify: `src/lib/markdown/render-html.test.ts`

**Interfaces:**
- Consumes: `escapeHtml` (Task 1).
- Produces: `interface Heading { level: 1|2|3|4|5|6; text: string; id: string }`, `interface RenderResult { html: string; headings: Heading[] }`, `renderMarkdown(content: string): RenderResult` — the public API every later task's cases feed into, and the only thing `MarkdownPreview` (Task 11) calls.

- [ ] **Step 1: Promote `@lezer/markdown` and `@lezer/common` to direct dependencies**

In `package.json`, in the `"dependencies"` block, insert alphabetically (both versions already resolved in the lockfile — confirm with `npm ls @lezer/markdown @lezer/common` before editing, no install should be triggered):

```json
    "@lezer/common": "1.5.2",
    "@lezer/highlight": "1.2.3",
    "@lezer/markdown": "1.7.2",
```

(`@lezer/highlight` is the existing entry — `@lezer/common` goes immediately before it, `@lezer/markdown` immediately after it, keeping the block alphabetical.)

Run: `npm install`
Expected: `package-lock.json` updates only the `dependencies` linkage for these two packages, not their versions (both are already resolved at these exact versions as transitive deps — confirmed above). Whether npm's registry check causes any output isn't a pass/fail signal here; the thing to actually verify is that `@lezer/markdown` and `@lezer/common` still resolve to `1.7.2` and `1.5.2` after the install (`npm ls @lezer/markdown @lezer/common`).

- [ ] **Step 2: Write the failing tests**

Add to `src/lib/markdown/render-html.test.ts` (this replaces the ad-hoc `_assignHeadingId` import test setup — from here on, tests exercise the public `renderMarkdown` API):

```ts
import { renderMarkdown } from './render-html';

describe('renderMarkdown: paragraphs and plain text', () => {
  it('renders a single paragraph', () => {
    const { html, headings } = renderMarkdown('Hello world');
    expect(html).toBe('<p>Hello world</p>');
    expect(headings).toEqual([]);
  });

  it('renders two paragraphs as separate <p> tags, preserving the blank-line gap between them', () => {
    const { html } = renderMarkdown('Hello\n\nWorld');
    expect(html).toBe('<p>Hello</p>\n\n<p>World</p>');
  });

  it('escapes a bare < in plain text so it cannot be read as a tag', () => {
    const { html } = renderMarkdown('a < b');
    expect(html).toBe('<p>a &lt; b</p>');
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/lib/markdown/render-html.test.ts`
Expected: FAIL — `renderMarkdown` is not exported yet.

- [ ] **Step 4: Write the implementation**

Add to the top of `src/lib/markdown/render-html.ts` (below existing imports, there are none yet — this becomes the first import):

```ts
import { parser as baseParser, GFM } from '@lezer/markdown';
import type { SyntaxNode } from '@lezer/common';

const markdownParser = baseParser.configure(GFM);
```

Add below the `_assignHeadingId` function from Task 2:

```ts
export interface Heading {
  level: 1 | 2 | 3 | 4 | 5 | 6;
  text: string;
  id: string;
}

export interface RenderResult {
  html: string;
  headings: Heading[];
}

// Node names that are pure Markdown syntax (markers, delimiters) rather than
// visible content. Consulted by renderNode below and — for the subset that
// can appear inside heading text — by extractText's marker check in Task 6.
// Grown by later tasks as new node categories are wired up; every entry here
// is one @lezer/markdown emits, confirmed by walking real parse trees (see
// the design spec's traversal-contract section) — never guessed.
const MARKER_NODES = new Set<string>([]);

export function renderMarkdown(content: string): RenderResult {
  const source = content;
  const tree = markdownParser.parse(source);
  const headings: Heading[] = [];

  // Lezer's tree has no `Text` node type — plain text is whatever source
  // range lies *between* a node's children (and before the first / after the
  // last) that no child covers. Every container node's content is rendered
  // by walking its children in order and escaping the gap before each one,
  // plus the trailing gap after the last one. See the design spec's
  // "Traversal contract" section for the full rationale.
  function renderChildren(node: SyntaxNode): string {
    let out = '';
    let pos = node.from;
    let child = node.firstChild;
    while (child) {
      out += escapeHtml(source.slice(pos, child.from));
      out += renderNode(child);
      pos = child.to;
      child = child.nextSibling;
    }
    out += escapeHtml(source.slice(pos, node.to));
    return out;
  }

  function renderNode(node: SyntaxNode): string {
    const name = node.type.name;
    if (MARKER_NODES.has(name)) return '';

    switch (name) {
      case 'Document':
        return renderChildren(node);
      case 'Paragraph':
        return `<p>${renderChildren(node)}</p>`;
      // Any node type not explicitly handled falls back to escaped plain
      // text of its own source range. This is the fail-closed default: an
      // unhandled node degrades to visible text, never to unescaped HTML.
      // Document is handled explicitly above specifically so the whole
      // document never falls into this branch.
      default:
        return escapeHtml(source.slice(node.from, node.to));
    }
  }

  const html = renderNode(tree.topNode);
  return { html, headings };
}
```

Note: `renderChildren` and `renderNode` are mutually recursive closures defined inside `renderMarkdown` so they can share `source` and the `headings` array being built up (used starting in Task 6) without threading extra parameters through every call.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/lib/markdown/render-html.test.ts`
Expected: PASS — all tests in the file, including the ones from Tasks 1–2

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/lib/markdown/render-html.ts src/lib/markdown/render-html.test.ts
git commit -m "feat(markdown): add gap-aware markdown-to-html renderer core"
```

---

## Task 4: Inline formatting and code (emphasis, strikethrough, inline/fenced code, escapes, entities)

**Files:**
- Modify: `src/lib/markdown/render-html.ts`
- Modify: `src/lib/markdown/render-html.test.ts`

**Interfaces:**
- Consumes: `renderChildren`, `renderNode`, `MARKER_NODES`, `escapeHtml` (Task 3).
- Produces: no new exports — extends `renderNode`'s switch and `MARKER_NODES`.

- [ ] **Step 1: Write the failing tests**

```ts
describe('renderMarkdown: inline formatting and code', () => {
  it('renders emphasis, strong, and strikethrough', () => {
    expect(renderMarkdown('Hello **world**').html).toBe('<p>Hello <strong>world</strong></p>');
    expect(renderMarkdown('*em*').html).toBe('<p><em>em</em></p>');
    expect(renderMarkdown('~~strike~~').html).toBe('<p><del>strike</del></p>');
  });

  it('renders inline code without interpreting its contents as markdown', () => {
    expect(renderMarkdown('`inline code`').html).toBe('<p><code>inline code</code></p>');
  });

  it('renders a fenced code block, escaped, with no syntax highlighting', () => {
    const { html } = renderMarkdown('```js\nconst x = 1;\nconst y = 2;\n```');
    expect(html).toBe('<pre><code>\nconst x = 1;\nconst y = 2;\n</code></pre>');
  });

  it('decodes a backslash-escaped character to its literal form', () => {
    expect(renderMarkdown('\\* not emphasis').html).toBe('<p>* not emphasis</p>');
  });

  it('decodes a named HTML entity and re-escapes it for safe output', () => {
    expect(renderMarkdown('&amp; entity').html).toBe('<p>&amp; entity</p>');
  });

  it('renders a hard line break', () => {
    expect(renderMarkdown('line one  \nline two').html).toBe('<p>line one<br />\nline two</p>');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/markdown/render-html.test.ts`
Expected: FAIL — `Emphasis`/`InlineCode`/`FencedCode`/etc. all currently hit the unknown-node fallback, which escapes the *whole* node range including its markers (e.g. `**world**` verbatim), not the rendered tag.

- [ ] **Step 3: Write the implementation**

Add these node names to `MARKER_NODES` in `src/lib/markdown/render-html.ts` (replace the empty `new Set<string>([])`):

```ts
const MARKER_NODES = new Set<string>([
  'HeaderMark',
  'EmphasisMark',
  'StrikethroughMark',
  'CodeMark',
  'CodeInfo',
]);
```

Add a decode helper above `renderMarkdown`:

```ts
function decodeEscape(nodeSource: string): string {
  // nodeSource is the full "\X" escape sequence — the visible character is
  // everything after the backslash.
  return nodeSource.slice(1);
}

// A curated subset of commonly-typed named entities — not the full HTML5
// table (~2000 entries). Numeric entities (&#123; / &#x7B;) are fully
// supported below regardless of this map; an unmapped named entity (e.g. an
// obscure one not in this list) falls back to its literal escaped source
// text rather than silently producing something wrong.
const ENTITY_MAP: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00a0',
  copy: '\u00a9',
  reg: '\u00ae',
  trade: '\u2122',
  mdash: '\u2014',
  ndash: '\u2013',
  hellip: '\u2026',
  ldquo: '\u201c',
  rdquo: '\u201d',
  lsquo: '\u2018',
  rsquo: '\u2019',
  deg: '\u00b0',
  euro: '\u20ac',
  pound: '\u00a3',
  cent: '\u00a2',
  yen: '\u00a5',
};

function decodeEntity(nodeSource: string): string {
  // nodeSource is "&name;", "&#123;", or "&#x7B;".
  const body = nodeSource.slice(1, -1);
  if (body.startsWith('#x') || body.startsWith('#X')) {
    const code = parseInt(body.slice(2), 16);
    return Number.isNaN(code) ? nodeSource : String.fromCodePoint(code);
  }
  if (body.startsWith('#')) {
    const code = parseInt(body.slice(1), 10);
    return Number.isNaN(code) ? nodeSource : String.fromCodePoint(code);
  }
  return ENTITY_MAP[body] ?? nodeSource; // unknown named entity: leave source as-is
}
```

Add these cases to `renderNode`'s switch, before the `default:` case:

```ts
      case 'Emphasis':
        return `<em>${renderChildren(node)}</em>`;
      case 'StrongEmphasis':
        return `<strong>${renderChildren(node)}</strong>`;
      case 'Strikethrough':
        return `<del>${renderChildren(node)}</del>`;
      case 'InlineCode':
        return `<code>${renderChildren(node)}</code>`;
      case 'HardBreak':
        return '<br />';
      case 'Escape':
        return escapeHtml(decodeEscape(source.slice(node.from, node.to)));
      case 'Entity':
        return escapeHtml(decodeEntity(source.slice(node.from, node.to)));
      case 'FencedCode':
      case 'CodeBlock':
        return `<pre><code>${renderChildren(node)}</code></pre>`;
      case 'CodeText':
        return escapeHtml(source.slice(node.from, node.to));
```

(`CodeText` needs an explicit case, not just the fallback, because a fenced code block's content is one or more `CodeText` children — the fallback would produce the same escaped output, but leaving it implicit would make it look unhandled to the next reader.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/markdown/render-html.test.ts`
Expected: PASS — all tests in the file, including the ones from Tasks 1–3

- [ ] **Step 5: Commit**

```bash
git add src/lib/markdown/render-html.ts src/lib/markdown/render-html.test.ts
git commit -m "feat(markdown): render inline formatting, code, escapes, entities"
```

---

## Task 5: Links, images, autolinks

**Files:**
- Modify: `src/lib/markdown/render-html.ts`
- Modify: `src/lib/markdown/render-html.test.ts`

**Interfaces:**
- Consumes: `isSafeLinkHref`, `isSafeImageSrc`, `escapeAttribute` (Task 1); `renderChildren`, `renderNode`, `MARKER_NODES` (Task 3).
- Produces: `extractText(node: SyntaxNode): string` (internal to `renderMarkdown`, used by `Image`'s alt text here and by heading text extraction in Task 6).

This task's implementation differs from a naive `node.getChild('URL')` in three ways, each pinned by its own test below — verify each against the real parser output shown in its comment if anything looks surprising while implementing:

1. **Bracketed destinations.** `[x](<https://example.com/a b>)` parses with the `URL` node's range covering `<https://example.com/a b>` *including* the angle brackets — not stripped. Using that raw slice as the href would both mis-detect the scheme (the string starts with `<`, not `h`) and write a broken `<a href="&lt;https://...&gt;">`.
2. **Reference-style link usages have no `URL` child at all.** `[text][label]` produces `Link > LinkMark, ..., LinkLabel` — no `URL` node, because the destination lives in a separate `LinkReference` definition elsewhere (or not at all) that this renderer doesn't resolve. `node.getChild('URL')` returns `null` here, and the earlier draft of this plan treated that as `url = ''`, which `isSafeLinkHref('')` allows through as a scheme-less href — producing a real but pointless `<a href="">text</a>`. That's an implementation accident, not an intended degradation: a missing `URL` child should render as plain text, no `<a>` at all.
3. **A bare, unbracketed URL typed directly in text** (`visit www.example.com today`) is a GFM "extended autolink" — Lezer emits a *standalone* `URL` node as a direct child of the paragraph, not wrapped in `Link`/`Image`/`Autolink` at all. If `URL` is unconditionally treated as marker-only data (as the previous draft of this task did), that text silently disappears from the rendered output — an actual data-loss bug, not just a styling gap. This task keeps such a URL as plain escaped text (not a clickable link — turning `www.` into a real link needs an assumed-scheme policy this feature doesn't need to take on) specifically to stop it vanishing.

- [ ] **Step 1: Write the failing tests**

```ts
describe('renderMarkdown: links and images', () => {
  it('renders a safe link with target=_blank and rel=noopener', () => {
    const { html } = renderMarkdown('[click](https://example.com)');
    expect(html).toBe(
      '<p><a href="https://example.com" target="_blank" rel="noopener noreferrer">click</a></p>',
    );
  });

  it('degrades a javascript: link to plain text — no <a> tag, no href leaks', () => {
    const { html } = renderMarkdown('[click](javascript:alert(1))');
    expect(html).toBe('<p>click</p>');
    expect(html).not.toMatch(/href\s*=\s*["']javascript:/i);
  });

  it('strips angle brackets from a bracketed destination before using it as the href', () => {
    const { html } = renderMarkdown('[x](<https://example.com/a b>)');
    expect(html).toBe(
      '<p><a href="https://example.com/a b" target="_blank" rel="noopener noreferrer">x</a></p>',
    );
  });

  it('rejects a bracketed destination smuggling a control character past the scheme regex', () => {
    // "<java\tscript:alert(1)>" is syntactically a valid CommonMark bracketed
    // destination (the angle-bracket form allows embedded whitespace) — this
    // pins that stripping the brackets does not, on its own, reopen the
    // control-character bypass Task 1's isSafeLinkHref rejects.
    const { html } = renderMarkdown('[x](<java\tscript:alert(1)>)');
    expect(html).toBe('<p>x</p>');
    expect(html).not.toMatch(/href\s*=\s*["']java/i);
  });

  it('renders a pasted data:image/webp image (the paste-image contract)', () => {
    const { html } = renderMarkdown('![paste](data:image/webp;base64,AAAA)');
    expect(html).toBe('<p><img src="data:image/webp;base64,AAAA" alt="paste" /></p>');
  });

  it('degrades a non-allowlisted image src to its alt text, no <img> tag', () => {
    const { html } = renderMarkdown('![bad](javascript:alert(1))');
    expect(html).toBe('<p>bad</p>');
    expect(html).not.toContain('<img');
  });

  it('renders a <url> autolink', () => {
    const { html } = renderMarkdown('auto <https://example.com> link');
    expect(html).toBe(
      '<p>auto <a href="https://example.com" target="_blank" rel="noopener noreferrer">https://example.com</a> link</p>',
    );
  });

  it('renders a <email> autolink with an implicit mailto: scheme', () => {
    const { html } = renderMarkdown('<hello@example.com>');
    expect(html).toBe(
      '<p><a href="mailto:hello@example.com" target="_blank" rel="noopener noreferrer">hello@example.com</a></p>',
    );
  });

  it('renders a reference-style link definition as nothing, and an unresolved usage as plain text (out of scope, not visible prose or a dead <a>)', () => {
    const { html } = renderMarkdown(
      '[ref link][label]\n\n[label]: https://example.com "title"',
    );
    expect(html).toBe('<p>ref link</p>\n\n');
    expect(html).not.toContain('<a');
  });

  it('does not silently drop a bare, unbracketed GFM autolink (e.g. a URL typed without [] or <>)', () => {
    const { html } = renderMarkdown('visit www.example.com today');
    expect(html).toBe('<p>visit www.example.com today</p>');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/markdown/render-html.test.ts`
Expected: FAIL — `Link`/`Image`/`Autolink`/`LinkReference`/standalone `URL` all currently hit the unknown-node fallback (or, for the bare-autolink case once Task 3's `MARKER_NODES` gains entries in later steps, would silently vanish instead of failing loudly — this task adds `URL`'s own case specifically so it never lands in `MARKER_NODES`'s blanket skip).

- [ ] **Step 3: Write the implementation**

Add `'LinkMark', 'LinkLabel', 'LinkTitle'` to `MARKER_NODES` (not `'URL'` — see below):

```ts
const MARKER_NODES = new Set<string>([
  'HeaderMark',
  'EmphasisMark',
  'StrikethroughMark',
  'CodeMark',
  'CodeInfo',
  'LinkMark',
  'LinkLabel',
  'LinkTitle',
]);
```

`URL` is deliberately *not* added here, because its correct handling depends on its parent: consumed as data (contributes nothing to rendered content) when it's a child of `Link`/`Image`/`Autolink`, but rendered as plain visible text when it's a standalone GFM bare-autolink node (see this task's intro). A blanket `MARKER_NODES` entry can't express that distinction, so `URL` gets its own case in the switch below instead, using `node.parent` the same way Task 8's `TableCell` does.

Add `extractUrl`, `extractText`, and `extractChildText` next to `renderChildren` inside `renderMarkdown`:

```ts
  // Strips the CommonMark bracketed-destination syntax (<...>) if present —
  // a URL node's range includes the brackets themselves, not just what's
  // between them.
  function extractUrl(urlNode: SyntaxNode): string {
    const raw = source.slice(urlNode.from, urlNode.to);
    if (raw.startsWith('<') && raw.endsWith('>')) return raw.slice(1, -1);
    return raw;
  }

  // Same gap-walking as renderChildren, but for plain semantic text instead
  // of HTML: used for alt text and (from Task 6) heading outline labels.
  function extractText(node: SyntaxNode): string {
    let out = '';
    let pos = node.from;
    let child = node.firstChild;
    while (child) {
      out += source.slice(pos, child.from);
      out += extractChildText(child);
      pos = child.to;
      child = child.nextSibling;
    }
    out += source.slice(pos, node.to);
    return out;
  }

  function extractChildText(node: SyntaxNode): string {
    const name = node.type.name;
    if (name === 'URL') {
      const parentName = node.parent?.type.name;
      // A Link/Image/Autolink's own URL child is hidden destination data,
      // not visible text (e.g. heading "Using [Markdown](url)" extracts to
      // "Using Markdown", not "Using Markdown url"). A standalone bare
      // autolink URL *is* the visible text.
      if (parentName === 'Link' || parentName === 'Image' || parentName === 'Autolink') return '';
      return extractUrl(node);
    }
    if (MARKER_NODES.has(name)) return '';
    if (name === 'Escape') return decodeEscape(source.slice(node.from, node.to));
    if (name === 'Entity') return decodeEntity(source.slice(node.from, node.to));
    if (name === 'HTMLBlock' || name === 'HTMLTag') return source.slice(node.from, node.to);
    return extractText(node);
  }
```

Add link/image/autolink renderers next to `renderChildren`/`extractText`:

```ts
  function renderLink(node: SyntaxNode): string {
    const urlNode = node.getChild('URL');
    const inner = renderChildren(node);
    // No URL child means either an unsafe/malformed destination that failed
    // to parse into one, or an unresolved reference-style usage ([text][label])
    // — either way, degrade to the visible text with no <a> at all, not an
    // inert href="" anchor.
    if (!urlNode) return inner;
    const url = extractUrl(urlNode);
    if (!isSafeLinkHref(url)) return inner;
    return `<a href="${escapeAttribute(url)}" target="_blank" rel="noopener noreferrer">${inner}</a>`;
  }

  function renderImage(node: SyntaxNode): string {
    const urlNode = node.getChild('URL');
    const alt = extractText(node);
    if (!urlNode) return escapeHtml(alt);
    const url = extractUrl(urlNode);
    if (!isSafeImageSrc(url)) return escapeHtml(alt);
    return `<img src="${escapeAttribute(url)}" alt="${escapeAttribute(alt)}" />`;
  }

  function renderAutolink(node: SyntaxNode): string {
    const urlNode = node.getChild('URL');
    if (!urlNode) return escapeHtml(source.slice(node.from, node.to));
    const rawUrl = extractUrl(urlNode);
    // Lezer only ever emits an Autolink node for CommonMark's <scheme:...>
    // or <email> grammars (never arbitrary <...> text — that falls through
    // as HTMLTag instead, see Task 9's raw-HTML test), so a scheme-less
    // value here is always the email form, which needs an explicit mailto:
    // prefix to be a working link instead of a same-site relative one.
    const url = getScheme(rawUrl) === null ? `mailto:${rawUrl}` : rawUrl;
    if (!isSafeLinkHref(url)) return escapeHtml(rawUrl);
    return `<a href="${escapeAttribute(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(rawUrl)}</a>`;
  }
```

Add these cases to `renderNode`'s switch:

```ts
      case 'Link':
        return renderLink(node);
      case 'Image':
        return renderImage(node);
      case 'Autolink':
        return renderAutolink(node);
      // The reference-style link *definition* line ([label]: url "title") —
      // not visible prose, so it renders as nothing. Resolving reference-
      // style link *usages* ([text][label]) against it is out of scope (see
      // spec); renderLink already degrades an unresolved usage to plain text.
      case 'LinkReference':
        return '';
      case 'URL': {
        const parentName = node.parent?.type.name;
        if (parentName === 'Link' || parentName === 'Image' || parentName === 'Autolink') {
          return ''; // consumed as data by the parent's own renderer, above
        }
        // A bare GFM autolink typed directly in text (e.g. "www.example.com"),
        // not wrapped in Link/Image/Autolink. Kept conservative — rendered as
        // plain escaped text, not a clickable link — since turning it into a
        // real href needs an assumed-scheme policy (e.g. prefixing "www."
        // with "http://") this feature doesn't need to take a position on.
        // What matters here is that it no longer silently disappears.
        return escapeHtml(source.slice(node.from, node.to));
      }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/markdown/render-html.test.ts`
Expected: PASS — all tests in the file, including the ones from Tasks 1–4

- [ ] **Step 5: Commit**

```bash
git add src/lib/markdown/render-html.ts src/lib/markdown/render-html.test.ts
git commit -m "feat(markdown): render links, images, and autolinks with url allowlist"
```

---

## Task 6: Headings, semantic text extraction, outline collection

**Files:**
- Modify: `src/lib/markdown/render-html.ts`
- Modify: `src/lib/markdown/render-html.test.ts`

**Interfaces:**
- Consumes: `extractText` (Task 5), `_assignHeadingId` (Task 2 — this task removes the underscore export since `renderMarkdown` now exercises it end-to-end).
- Produces: populated `headings` array in `RenderResult`, `<h1>`–`<h6>` with `id` attributes in `html`.

- [ ] **Step 1: Write the failing tests**

Replace the Task 2 `_assignHeadingId` describe block in `src/lib/markdown/render-html.test.ts` with tests against the public API (remove the `import { _assignHeadingId } from './render-html';` line too):

```ts
describe('renderMarkdown: headings and outline', () => {
  it('renders an ATX heading with a slug id and collects it into headings', () => {
    const { html, headings } = renderMarkdown('# Hello');
    expect(html).toContain('<h1 id="hello">');
    expect(headings).toEqual([{ level: 1, text: 'Hello', id: 'hello' }]);
  });

  it('extracts semantic (formatting-stripped) text for the outline, not raw source', () => {
    const { headings } = renderMarkdown(
      '## Using **CodeMirror** with [Markdown](https://example.com)',
    );
    expect(headings).toEqual([
      { level: 2, text: 'Using CodeMirror with Markdown', id: 'using-codemirror-with-markdown' },
    ]);
  });

  it('dedupes identical headings with -2/-3 suffixes, across formatting differences', () => {
    const { headings } = renderMarkdown('# Hello **world**\n\n# Hello world');
    expect(headings).toEqual([
      { level: 1, text: 'Hello world', id: 'hello-world' },
      { level: 1, text: 'Hello world', id: 'hello-world-2' },
    ]);
  });

  it('preserves non-Latin heading text and slugs end to end', () => {
    const { headings } = renderMarkdown('# 架构设计\n\n# 架构设计');
    expect(headings).toEqual([
      { level: 1, text: '架构设计', id: '架构设计' },
      { level: 1, text: '架构设计', id: '架构设计-2' },
    ]);
  });

  it('renders a setext (underline-style) heading', () => {
    const { headings } = renderMarkdown('Setext Heading\n===');
    expect(headings).toEqual([{ level: 1, text: 'Setext Heading', id: 'setext-heading' }]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/markdown/render-html.test.ts`
Expected: FAIL — heading nodes currently hit the unknown-node fallback (raw `# Hello` escaped as text), and `_assignHeadingId` is no longer exported so the old import breaks compilation.

- [ ] **Step 3: Write the implementation**

Add a `renderHeading` function next to the other node renderers inside `renderMarkdown`:

```ts
  const seenSlugs = new Map<string, number>();

  function renderHeading(node: SyntaxNode, level: Heading['level']): string {
    // .trim() drops the syntactic space/newline adjacent to the heading
    // marker (e.g. the leading space after "#", or the trailing newline
    // before a setext "===" line) that the gap-based extraction otherwise
    // includes — it's a delimiter, not part of the visible heading text.
    const text = extractText(node).trim();
    const id = _assignHeadingId(text, seenSlugs);
    headings.push({ level, text, id });
    return `<h${level} id="${escapeAttribute(id)}">${renderChildren(node)}</h${level}>`;
  }
```

Add these cases to `renderNode`'s switch:

```ts
      case 'ATXHeading1':
        return renderHeading(node, 1);
      case 'ATXHeading2':
        return renderHeading(node, 2);
      case 'ATXHeading3':
        return renderHeading(node, 3);
      case 'ATXHeading4':
        return renderHeading(node, 4);
      case 'ATXHeading5':
        return renderHeading(node, 5);
      case 'ATXHeading6':
        return renderHeading(node, 6);
      case 'SetextHeading1':
        return renderHeading(node, 1);
      case 'SetextHeading2':
        return renderHeading(node, 2);
```

In `_assignHeadingId`'s declaration, drop the leading underscore and its export marker — it's now purely an internal helper called only from inside `renderMarkdown`'s `renderHeading`:

```ts
function assignHeadingId(text: string, seen: Map<string, number>): string {
```

(rename its one call site in `renderHeading` from `_assignHeadingId` to `assignHeadingId` too.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/markdown/render-html.test.ts`
Expected: PASS — all tests in the file. Step 1 both removed Task 2's 4 `_assignHeadingId` tests (and its import) and added 5 new ones, so the total count moves by +1 relative to Task 5, not by +5.

- [ ] **Step 5: Commit**

```bash
git add src/lib/markdown/render-html.ts src/lib/markdown/render-html.test.ts
git commit -m "feat(markdown): render headings and build the outline list"
```

---

## Task 7: Block containers (blockquote, lists, task lists, horizontal rule)

**Files:**
- Modify: `src/lib/markdown/render-html.ts`
- Modify: `src/lib/markdown/render-html.test.ts`

**Interfaces:**
- Consumes: `renderChildren`, `renderNode`, `MARKER_NODES` (Task 3).
- Produces: no new exports — extends `renderNode`'s switch.

- [ ] **Step 1: Write the failing tests**

```ts
describe('renderMarkdown: blockquotes, lists, task lists, hr', () => {
  it('renders a blockquote', () => {
    const { html } = renderMarkdown('> quote');
    expect(html).toBe('<blockquote> <p>quote</p></blockquote>');
  });

  it('renders a bullet list', () => {
    const { html } = renderMarkdown('- a\n- b');
    expect(html).toBe('<ul><li> <p>a</p></li>\n<li> <p>b</p></li></ul>');
  });

  it('renders an ordered list', () => {
    const { html } = renderMarkdown('1. a\n2. b');
    expect(html).toBe('<ol><li> <p>a</p></li>\n<li> <p>b</p></li></ol>');
  });

  it('renders a GFM task list with checked state', () => {
    const { html } = renderMarkdown('- [ ] todo\n- [x] done');
    expect(html).toBe(
      '<ul><li> <input type="checkbox" disabled /> todo</li>\n' +
        '<li> <input type="checkbox" disabled checked /> done</li></ul>',
    );
  });

  it('renders a horizontal rule', () => {
    expect(renderMarkdown('---').html).toBe('<hr />');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/markdown/render-html.test.ts`
Expected: FAIL — `Blockquote`/`BulletList`/`OrderedList`/`ListItem`/`Task`/`HorizontalRule` all currently hit the unknown-node fallback.

- [ ] **Step 3: Write the implementation**

Add `'ListMark', 'QuoteMark', 'TaskMarker'` to `MARKER_NODES` (note: no `'URL'` here — Task 5 deliberately left it out of this set and gave it its own parent-aware case in the switch instead; do not re-add it):

```ts
const MARKER_NODES = new Set<string>([
  'HeaderMark',
  'EmphasisMark',
  'StrikethroughMark',
  'CodeMark',
  'CodeInfo',
  'LinkMark',
  'LinkLabel',
  'LinkTitle',
  'ListMark',
  'QuoteMark',
  'TaskMarker',
]);
```

(`TaskMarker`'s checked/unchecked state is read directly via `getChild('TaskMarker')` in the `Task` case below, independent of its `''` contribution when generically walked — the two uses don't conflict.)

Add these cases to `renderNode`'s switch:

```ts
      case 'Blockquote':
        return `<blockquote>${renderChildren(node)}</blockquote>`;
      case 'BulletList':
        return `<ul>${renderChildren(node)}</ul>`;
      case 'OrderedList':
        return `<ol>${renderChildren(node)}</ol>`;
      case 'ListItem':
        return `<li>${renderChildren(node)}</li>`;
      // A GFM task item's checkbox is nested one level inside its ListItem
      // (ListItem > ListMark, Task), not a sibling of ListItem — so Task
      // renders only the checkbox + its own content, and lets the
      // surrounding ListItem case supply the <li> wrapper. Rendering a
      // second <li> here would nest <li> inside <li>.
      case 'Task': {
        const marker = node.getChild('TaskMarker');
        const checked = marker ? /x/i.test(source.slice(marker.from, marker.to)) : false;
        return `<input type="checkbox" disabled${checked ? ' checked' : ''} />${renderChildren(node)}`;
      }
      case 'HorizontalRule':
        return '<hr />';
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/markdown/render-html.test.ts`
Expected: PASS — all tests in the file, including the ones from Tasks 1–6

- [ ] **Step 5: Commit**

```bash
git add src/lib/markdown/render-html.ts src/lib/markdown/render-html.test.ts
git commit -m "feat(markdown): render blockquotes, lists, task lists, hr"
```

---

## Task 8: Tables (GFM)

**Files:**
- Modify: `src/lib/markdown/render-html.ts`
- Modify: `src/lib/markdown/render-html.test.ts`

**Interfaces:**
- Consumes: `renderChildren`, `renderNode`, `MARKER_NODES` (Task 3).
- Produces: no new exports — extends `renderNode`'s switch.

- [ ] **Step 1: Write the failing test**

This is the table shape `terminal-table.ts`'s `buildMarkdownTable()` actually produces (`| a | b |` header, `| --- | --- |` alignment row, `| 1 | 2 |` body row — verified by reading `src/lib/markdown/terminal-table.ts`), so this test pins the exact paste → Preview contract, not just generic GFM table support:

```ts
describe('renderMarkdown: GFM tables (terminal-table.ts paste contract)', () => {
  it('renders the exact table shape terminal-table.ts produces', () => {
    const { html } = renderMarkdown('| a | b |\n| --- | --- |\n| 1 | 2 |');
    expect(html).toBe(
      '<table><tr> <th>a</th>  <th>b</th> </tr>\n\n<tr> <td>1</td>  <td>2</td> </tr></table>',
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/markdown/render-html.test.ts`
Expected: FAIL — `Table`/`TableHeader`/`TableRow`/`TableCell` all currently hit the unknown-node fallback.

- [ ] **Step 3: Write the implementation**

Add `'TableDelimiter'` to `MARKER_NODES` (still no `'URL'` — see Task 5/7's note):

```ts
const MARKER_NODES = new Set<string>([
  'HeaderMark',
  'EmphasisMark',
  'StrikethroughMark',
  'CodeMark',
  'CodeInfo',
  'LinkMark',
  'LinkLabel',
  'LinkTitle',
  'ListMark',
  'QuoteMark',
  'TaskMarker',
  'TableDelimiter',
]);
```

(`TableDelimiter` covers both the `|` cell separators within a row and the standalone `| --- | --- |` alignment row between header and body — both are pure syntax, both contribute `''`.)

Add these cases to `renderNode`'s switch:

```ts
      case 'Table':
        return `<table>${renderChildren(node)}</table>`;
      case 'TableHeader':
        return `<tr>${renderChildren(node)}</tr>`;
      case 'TableRow':
        return `<tr>${renderChildren(node)}</tr>`;
      // A flat <table> of <tr> rows (no <thead>/<tbody>) — a TableCell's own
      // node type doesn't say whether it's a header or body cell, so the tag
      // is decided from its parent's type instead of threading extra state
      // through renderChildren.
      case 'TableCell': {
        const tag = node.parent?.type.name === 'TableHeader' ? 'th' : 'td';
        return `<${tag}>${renderChildren(node)}</${tag}>`;
      }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/markdown/render-html.test.ts`
Expected: PASS — all tests in the file, including the ones from Tasks 1–7

- [ ] **Step 5: Commit**

```bash
git add src/lib/markdown/render-html.ts src/lib/markdown/render-html.test.ts
git commit -m "feat(markdown): render gfm tables"
```

---

## Task 9: Security integration tests (XSS, raw HTML, fail-closed fallback)

No new `renderNode` cases — this task only adds tests that exercise the security boundary end-to-end across everything built in Tasks 1–8, matching the spec's "Testing" section directly.

**Files:**
- Modify: `src/lib/markdown/render-html.test.ts`

- [ ] **Step 1: Write the tests**

```ts
describe('renderMarkdown: security boundary', () => {
  it('renders a <script> block as escaped text, never as markup', () => {
    const { html } = renderMarkdown('<script>alert(1)</script>');
    expect(html).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>');
  });

  it('renders inline raw HTML tags as escaped text', () => {
    const { html } = renderMarkdown('<b>bold html</b>');
    expect(html).toBe('<p>&lt;b&gt;bold html&lt;/b&gt;</p>');
    expect(html).not.toContain('<b>');
  });

  it('never lets a javascript: URL reach an href or src attribute, in any position', () => {
    // Checking for the bare substring "javascript:" would be too strong a
    // claim: 'auto <javascript:alert(1)> link' safely degrades to
    // '<p>auto javascript:alert(1) link</p>' — the text is visible and
    // harmless, it's just not inside an attribute. What must never happen
    // is that substring appearing as the value of an href or src.
    const cases = [
      '[click](javascript:alert(1))',
      '![img](javascript:alert(1))',
      'auto <javascript:alert(1)> link',
    ];
    for (const md of cases) {
      const { html } = renderMarkdown(md);
      expect(html).not.toMatch(/(?:href|src)\s*=\s*["']javascript:/i);
    }
  });

  it('rejects the bracketed-destination + control-character composite bypass', () => {
    // "<java\tscript:alert(1)>" is a syntactically valid CommonMark
    // bracketed link destination (Task 5's angle-bracket form allows
    // embedded whitespace) whose scheme our regex only fails to recognize
    // because of the embedded tab. This is the concrete case Task 1's
    // control-character rejection and Task 5's bracket-stripping have to
    // compose correctly to close — see both tasks' comments.
    const { html } = renderMarkdown('[x](<java\tscript:alert(1)>)');
    expect(html).not.toMatch(/href\s*=\s*["']java/i);
  });
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npx vitest run src/lib/markdown/render-html.test.ts`
Expected: PASS — all tests in the file, including the ones from Tasks 1–8. These new tests should already pass given Tasks 1–8; this task is a pure regression net pinning the security contract as one block, not new functionality. If any of these fail, stop and fix the relevant renderer from an earlier task before continuing — do not weaken these assertions.

- [ ] **Step 3: Run the full test suite once**

Run: `npx vitest run src/lib/markdown/render-html.test.ts`
Expected: all tests in the file pass, confirming the renderer module is complete before UI work begins.

- [ ] **Step 4: Commit**

```bash
git add src/lib/markdown/render-html.test.ts
git commit -m "test(markdown): pin xss and raw-html security boundary"
```

---

## Task 10: `MarkdownOutline.tsx`

No unit test — this repo has no component-level test convention (only `src/lib/**/*.ts` pure modules have `.test.ts` files; verify with `find src/components -name "*.test.*"`, expect no results). Correctness is checked manually in Task 13's browser pass.

**Files:**
- Create: `src/components/editor/MarkdownOutline.tsx`

**Interfaces:**
- Consumes: `Heading` type (`src/lib/markdown/render-html.ts`, Task 3/6).
- Produces: default-exported `MarkdownOutline` component, consumed by `MarkdownPreview` (Task 11).

- [ ] **Step 1: Write the component**

```tsx
// src/components/editor/MarkdownOutline.tsx
'use client';

import React from 'react';
import type { Heading } from '@/lib/markdown/render-html';

interface MarkdownOutlineProps {
  headings: Heading[];
  containerRef: React.RefObject<HTMLElement | null>;
}

const MarkdownOutline: React.FC<MarkdownOutlineProps> = ({ headings, containerRef }) => {
  const handleClick = (id: string) => {
    containerRef.current
      ?.querySelector<HTMLElement>(`#${CSS.escape(id)}`)
      ?.scrollIntoView({ block: 'start' });
  };

  return (
    <nav className="hidden w-48 shrink-0 overflow-y-auto border-r border-zinc-800 p-3 md:block">
      <ul className="space-y-1">
        {headings.map((heading) => (
          <li key={heading.id} style={{ paddingLeft: `${(heading.level - 1) * 12}px` }}>
            <button
              onClick={() => handleClick(heading.id)}
              className="w-full truncate rounded px-2 py-1 text-left text-xs text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
              title={heading.text}
            >
              {heading.text}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
};

export default MarkdownOutline;
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS, no errors from the new file.

- [ ] **Step 3: Commit**

```bash
git add src/components/editor/MarkdownOutline.tsx
git commit -m "feat(editor): add markdown outline sidebar component"
```

---

## Task 11: `MarkdownPreview.tsx` and preview styles

**Files:**
- Create: `src/components/editor/MarkdownPreview.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: `renderMarkdown` (`src/lib/markdown/render-html.ts`, Task 3), `MarkdownOutline` (Task 10).
- Produces: default-exported `MarkdownPreview` component with `{ content: string }` props — this is what `EditorCanvas` renders in Task 12.

- [ ] **Step 1: Write the component**

```tsx
// src/components/editor/MarkdownPreview.tsx
'use client';

import React, { useMemo, useRef } from 'react';
import { renderMarkdown } from '@/lib/markdown/render-html';
import MarkdownOutline from './MarkdownOutline';

interface MarkdownPreviewProps {
  content: string;
}

const MarkdownPreview: React.FC<MarkdownPreviewProps> = ({ content }) => {
  const { html, headings } = useMemo(() => renderMarkdown(content), [content]);
  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <div className="flex h-full min-h-0">
      {headings.length > 0 && <MarkdownOutline headings={headings} containerRef={containerRef} />}
      <div
        ref={containerRef}
        className="md-preview flex-1 overflow-auto"
        // html comes from renderMarkdown(), which escapes all text/attribute
        // content and scheme-allowlists link/image URLs before returning —
        // see src/lib/markdown/render-html.ts. This is the only
        // dangerouslySetInnerHTML in the codebase, and only safe because of
        // that renderer's escaping contract.
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
};

export default MarkdownPreview;
```

- [ ] **Step 2: Add preview styles**

Append to `src/app/globals.css`:

```css
/* Rendered Markdown preview — hand-written to match the zinc/indigo dark
   palette (.claude/rules/styling.md), same pattern as the CodeMirror theme
   in markdown-theme.ts. No @tailwindcss/typography dependency. */
.md-preview {
  padding: 1.5rem;
  color: #a1a1aa; /* zinc-400 */
  line-height: 1.7;
}
.md-preview h1,
.md-preview h2,
.md-preview h3,
.md-preview h4,
.md-preview h5,
.md-preview h6 {
  color: #f4f4f5; /* zinc-100 */
  font-weight: 600;
  margin: 1.2em 0 0.5em;
}
.md-preview h1 {
  font-size: 1.5rem;
}
.md-preview h2 {
  font-size: 1.25rem;
}
.md-preview h3 {
  font-size: 1.1rem;
}
.md-preview p {
  margin: 0.75em 0;
}
.md-preview a {
  color: #818cf8; /* indigo-400 */
  text-decoration: underline;
}
.md-preview code {
  color: #a78bfa; /* matches inline code color in markdown-theme.ts */
  background: #1a1a1a;
  border-radius: 0.25rem;
  padding: 0.1em 0.35em;
  font-size: 0.875em;
}
.md-preview pre {
  background: #0f0f0f;
  border-radius: 0.5rem;
  padding: 0.75em 1em;
  overflow-x: auto;
  margin: 0.75em 0;
}
.md-preview pre code {
  background: none;
  padding: 0;
}
.md-preview blockquote {
  border-left: 3px solid #3f3f46;
  padding-left: 1em;
  margin: 0.75em 0;
  font-style: italic;
  color: #a1a1aa;
}
.md-preview ul,
.md-preview ol {
  margin: 0.75em 0;
  padding-left: 1.5em;
}
.md-preview li {
  margin: 0.25em 0;
}
.md-preview table {
  border-collapse: collapse;
  margin: 0.75em 0;
}
.md-preview th,
.md-preview td {
  border: 1px solid #27272a; /* zinc-800 */
  padding: 0.4em 0.75em;
  text-align: left;
}
.md-preview img {
  border-radius: 0.5rem;
  margin: 0.5em 0;
}
.md-preview hr {
  border: none;
  border-top: 1px solid #27272a;
  margin: 1.5em 0;
}
```

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/editor/MarkdownPreview.tsx src/app/globals.css
git commit -m "feat(editor): add markdown preview component and styles"
```

---

## Task 12: Wire Preview into `EditorCanvas`, retire the PLAIN/RICH toggle

This is the integration task — it removes the `<textarea>` branch and mode-switch UI, and wires `MarkdownPreview` in.

**Files:**
- Modify: `src/components/editor/EditorCanvas.tsx`

**Interfaces:**
- Consumes: `MarkdownPreview` (Task 11).
- Produces: `EditorCanvas` no longer imports or references `NoteMode`.

- [ ] **Step 1: Update imports**

In `src/components/editor/EditorCanvas.tsx`, change:

```ts
import type { Folder, Note, NotePayload } from '@/types';
import { NoteMode, type SaveState } from '@/types';
```

to:

```ts
import type { Folder, Note, NotePayload, SaveState } from '@/types';
```

Change the `lucide-react` icon import — remove `FileCode, Type`, add `Eye, Pencil`:

```ts
import {
  Pin,
  Trash2,
  Copy,
  Download,
  Eye,
  Pencil,
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  MoreHorizontal,
  Folder as FolderIcon,
} from 'lucide-react';
```

Add a new import next to the other editor component imports:

```ts
import MarkdownPreview from './MarkdownPreview';
```

- [ ] **Step 2: Replace mode/preview state**

Remove the `textareaRef` declaration and the `currentModeRef` declaration:

```ts
  const textareaRef = useRef<HTMLTextAreaElement>(null);
```
```ts
  const currentModeRef = useRef(note.mode);
```

Add, next to the other `useState` declarations:

```ts
  const [previewMode, setPreviewMode] = useState(false);
```

- [ ] **Step 3: Simplify the note-sync effect**

Replace:

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
      // RICH mode's focus is handled by MarkdownEditor's own autoFocus prop
      // (it remounts per note.id). The textarea isn't remounted, so PLAIN
      // mode needs an explicit focus call here.
      if (note.mode === NoteMode.PLAIN) {
        textareaRef.current?.focus();
      }
      onAutoFocusHandled?.();
    }
  }, [note.id, note.title, note.content, note.mode, autoFocus, onAutoFocusHandled]);

  // Auto-resize textarea to match content height
  useEffect(() => {
    const ta = textareaRef.current;
    if (note.mode === NoteMode.PLAIN && ta) {
      ta.style.height = 'auto';
      ta.style.height = `${ta.scrollHeight}px`;
    }
  }, [content, note.mode]);
```

with:

```ts
  useEffect(() => {
    if (syncedNoteIdRef.current === note.id) return;
    syncedNoteIdRef.current = note.id;
    setContent(note.content);
    contentRef.current = note.content;
    setLocalTitle(note.title);
    setSaveState('IDLE');
    setPreviewMode(false); // always open a note in Edit
    if (autoFocus) {
      // MarkdownEditor's own autoFocus prop handles focus — it remounts
      // per note.id (key={note.id}), so a fresh EditorView always picks
      // this up on its own.
      onAutoFocusHandled?.();
    }
  }, [note.id, note.title, note.content, autoFocus, onAutoFocusHandled]);
```

- [ ] **Step 4: Drop the mode guard from image paste**

Replace:

```ts
  const handlePasteImage = useCallback((file: File) => {
    const pasteNoteId = syncedNoteIdRef.current;
    // Capture the selection synchronously, at paste time — resizing runs
    // async (canvas.toDataURL), during which the user can move the cursor
    // or select other text. Reading the selection only after the resize
    // resolves would insert the image at the wrong, now-current position.
    const pasteRange = markdownEditorRef.current?.getSelection() ?? { start: 0, end: 0 };
    resizeImageToDataURL(file).then((dataUrl) => {
      if (syncedNoteIdRef.current !== pasteNoteId) return;
      if (currentModeRef.current !== NoteMode.RICH) return;
      markdownEditorRef.current?.insertAt(pasteRange, `![${file.name}](${dataUrl})`);
    });
  }, []);
```

with:

```ts
  const handlePasteImage = useCallback((file: File) => {
    const pasteNoteId = syncedNoteIdRef.current;
    // Capture the selection synchronously, at paste time — resizing runs
    // async (canvas.toDataURL), during which the user can move the cursor
    // or select other text. Reading the selection only after the resize
    // resolves would insert the image at the wrong, now-current position.
    const pasteRange = markdownEditorRef.current?.getSelection() ?? { start: 0, end: 0 };
    resizeImageToDataURL(file).then((dataUrl) => {
      if (syncedNoteIdRef.current !== pasteNoteId) return;
      markdownEditorRef.current?.insertAt(pasteRange, `![${file.name}](${dataUrl})`);
    });
  }, []);
```

- [ ] **Step 5: Replace `handleSwitchMode` with a preview toggle**

Replace:

```ts
  const handleSwitchMode = () => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    const newMode = note.mode === NoteMode.RICH ? NoteMode.PLAIN : NoteMode.RICH;
    const textContent = markdownToPlainText(content);
    persistChange(
      { mode: newMode, content, textContent, title: localTitle },
      { showProgressAndSuccess: false },
    );
  };
```

with:

```ts
  const handleTogglePreview = () => setPreviewMode((v) => !v);
```

- [ ] **Step 6: Replace the mobile mode-switch button**

Replace:

```tsx
            <button
              onClick={handleSwitchMode}
              className={`rounded-lg p-2.5 transition-all ${
                note.mode === NoteMode.RICH
                  ? 'bg-indigo-400/10 text-indigo-400'
                  : 'text-zinc-500 hover:bg-zinc-800 hover:text-white'
              }`}
              title="Switch Mode (Cmd+Shift+P)"
              aria-label="Switch mode"
            >
              {note.mode === NoteMode.RICH ? (
                <FileCode className="h-4 w-4" />
              ) : (
                <Type className="h-4 w-4" />
              )}
            </button>
```

with:

```tsx
            <button
              onClick={handleTogglePreview}
              className={`rounded-lg p-2.5 transition-all ${
                previewMode
                  ? 'bg-indigo-400/10 text-indigo-400'
                  : 'text-zinc-500 hover:bg-zinc-800 hover:text-white'
              }`}
              title={previewMode ? 'Edit' : 'Preview'}
              aria-label={previewMode ? 'Switch to edit' : 'Switch to preview'}
              aria-pressed={previewMode}
            >
              {previewMode ? <Pencil className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
```

- [ ] **Step 7: Replace the desktop mode-switch button**

Replace:

```tsx
            <button
              onClick={handleSwitchMode}
              className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-bold shadow-sm transition-all ${
                note.mode === NoteMode.RICH
                  ? 'border-indigo-500 bg-indigo-600 text-white hover:bg-indigo-500'
                  : 'border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
              }`}
              title="Switch Mode (Cmd+Shift+P)"
            >
              {note.mode === NoteMode.RICH ? (
                <FileCode className="h-4 w-4" />
              ) : (
                <Type className="h-4 w-4" />
              )}
              {note.mode}
            </button>
```

with:

```tsx
            <button
              onClick={handleTogglePreview}
              className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-bold shadow-sm transition-all ${
                previewMode
                  ? 'border-indigo-500 bg-indigo-600 text-white hover:bg-indigo-500'
                  : 'border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
              }`}
              title={previewMode ? 'Edit' : 'Preview'}
              aria-pressed={previewMode}
            >
              {previewMode ? <Pencil className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              {previewMode ? 'Edit' : 'Preview'}
            </button>
```

- [ ] **Step 8: Gate `RichToolbar` on `previewMode`**

Replace:

```tsx
      {/* Formatting Toolbar for Rich Mode */}
      {note.mode === NoteMode.RICH && (
```

with:

```tsx
      {/* Formatting Toolbar — hidden while previewing */}
      {!previewMode && (
```

- [ ] **Step 9: Replace the editor body**

Replace:

```tsx
      {/* Editor Body */}
      <div className="flex-1 overflow-auto p-6 font-mono transition-colors md:px-10 lg:px-20">
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
      </div>
```

with:

```tsx
      {/* Editor Body */}
      {/* MarkdownPreview owns its own scrolling, padding, and (via
          .md-preview) typography — nesting it inside the Edit wrapper's
          overflow-auto/p-6/font-mono would produce a second scroll
          container, doubled padding, and monospace bleeding into rendered
          prose. So the two modes get distinct wrappers, not a shared one
          with the mode branching only the content inside it. */}
      {!previewMode ? (
        <div className="flex-1 overflow-auto p-6 font-mono transition-colors md:px-10 lg:px-20">
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
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <MarkdownPreview content={content} />
        </div>
      )}
```

- [ ] **Step 10: Update the footer badge**

Replace:

```tsx
          <span className={note.mode === NoteMode.RICH ? 'text-indigo-500' : 'text-zinc-500'}>
            {note.mode}
          </span>
```

with:

```tsx
          <span className={previewMode ? 'text-indigo-500' : 'text-zinc-500'}>
            {previewMode ? 'PREVIEW' : 'EDIT'}
          </span>
```

- [ ] **Step 11: Run typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS — no leftover references to `NoteMode`, `FileCode`, `Type`, `textareaRef`, `currentModeRef`, or `handleSwitchMode`. If lint flags an unused import or variable, that's a leftover reference — remove it.

Run: `grep -n "NoteMode\|FileCode\|textareaRef\|currentModeRef\|handleSwitchMode" src/components/editor/EditorCanvas.tsx`
Expected: no matches.

- [ ] **Step 12: Commit**

```bash
git add src/components/editor/EditorCanvas.tsx
git commit -m "feat(editor): replace plain/rich toggle with edit/preview"
```

---

## Task 13: Full verification pass

**Files:** none (verification only).

- [ ] **Step 1: Run the full automated suite**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all PASS.

- [ ] **Step 1b: Two cheap invariant greps**

Run: `grep -rn "dangerouslySetInnerHTML" src`
Expected: exactly one match, in `src/components/editor/MarkdownPreview.tsx` — if there's a second one anywhere, something bypassed the renderer's escaping contract.

Run: `grep -nE "NoteMode|textareaRef|handleSwitchMode" src/components/editor/EditorCanvas.tsx`
Expected: no matches — confirms Task 12 fully removed the old mode-toggle machinery rather than leaving a dead branch behind.

- [ ] **Step 2: Manual browser check — start the dev server**

Run: `npm run dev` (background)

- [ ] **Step 3: Manual check — Edit/Preview toggle and RichToolbar visibility**

Open a note. Confirm:
- The editor is CodeMirror by default (no plain-text `<textarea>` anywhere, no PLAIN/RICH button).
- Clicking the header's Preview button (`Eye` icon) switches to Preview; `RichToolbar` disappears; the footer badge reads `PREVIEW`.
- Clicking again (`Pencil` icon) returns to Edit; content is unchanged.
- Switching to a different note and back always opens in Edit (never remembers a prior Preview state).

- [ ] **Step 4: Manual check — outline**

In a note with several `#`/`##` headings (mix of English and, if convenient, Chinese), switch to Preview. Confirm:
- The outline appears on the left (desktop/tablet width), hidden on phone width.
- Clicking an outline entry scrolls the preview to that heading.
- A note with zero headings shows no outline column at all (not an empty blank strip).

- [ ] **Step 5: Manual check — paste contracts**

- Paste a spreadsheet/terminal-style table (or type the equivalent `| a | b |` / `| --- | --- |` / `| 1 | 2 |` Markdown) and confirm it renders as an actual `<table>` in Preview, not raw pipe text.
- Paste a screenshot/image into the editor, confirm it inserts as `![filename](data:image/webp;base64,...)`, then switch to Preview and confirm the image renders.

- [ ] **Step 6: Manual check — responsive widths**

Using the browser's responsive/device toolbar, check phone (<768px), tablet (768–1023px), and desktop (≥1024px) widths: Preview toggle and RichToolbar visibility behave correctly at each, no horizontal overflow in Preview.

- [ ] **Step 7: Stop the dev server**

- [ ] **Step 8: Final commit (only if Step 3–6 surfaced fixes)**

If any manual check required a code fix, commit it separately with a message describing the fix (e.g. `fix(editor): ...`). If everything passed as implemented, there is nothing to commit in this step — Task 12's commit already covers the feature.
