# Markdown Preview with Outline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Approved lifecycle requirements — 2026-09-16.** Preserve undo/redo history, cursor/selection, and editing scroll position across Edit → Preview → Edit for the current note. Tasks 10–15 implement the approved color contract, parser-backed decorations, independent preview scroll restoration, and a persistent editor instance; they supersede the archived drafts in git history.

> **Preview position decision — option B, confirmed 2026-09-16.** First Preview starts at the top; later Preview visits within the same note-open session restore the last preview scroll offset. Editing and preview positions are independent. Switching notes or reloading clears the saved position. Tasks 12–14 implement this behavior; Tasks 14–15 verify it.

**Goal:** Replace the PLAIN/RICH editor toggle with a single Markdown editor plus a Preview view that renders the note's Markdown as HTML with a heading-based outline on the left.

> **Editor readability decisions — approved 2026-09-16.** Show inline-code delimiters while the cursor/selection is in the code span and hide them otherwise, without changing Markdown content or undo history. Task 11 adds the editor decorations. The shared color specification in `docs/superpowers/specs/2026-09-16-markdown-color-guidelines.md` is approved and binding. Tasks 10–15 use shared tokens: one amber code token for inline and block code, with separate secondary/syntax tokens. Visual assessment of large code blocks follows implementation.

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
- First Preview starts at the top; subsequent Preview visits restore the last preview scroll offset within the same note-open session. Keep it independent of the editor's position, clamp it when content becomes shorter, and clear it when switching notes or reloading.
- Use the approved color contract in `docs/superpowers/specs/2026-09-16-markdown-color-guidelines.md`: neutral content, indigo structure/links, amber code. Editor and preview share semantic tokens; inline/block code share `md.code-text = #FCD34D`; `md.secondary` and `md.syntax` remain distinct tokens with initial value `#A1A1AA`. No `@tailwindcss/typography` or other new styling dependency — hand-written preview CSS and the CodeMirror theme consume the shared tokens.
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

  it('also reserves generated IDs against naturally suffixed headings', () => {
    const seen = new Map<string, number>();
    expect(_assignHeadingId('Test', seen)).toBe('test');
    expect(_assignHeadingId('Test', seen)).toBe('test-2');
    expect(_assignHeadingId('Test-2', seen)).toBe('test-2-2');
    const reversed = new Map<string, number>();
    expect(_assignHeadingId('Test-2', reversed)).toBe('test-2');
    expect(_assignHeadingId('Test', reversed)).toBe('test');
    expect(_assignHeadingId('Test', reversed)).toBe('test-3');
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
  let count = seen.get(base) ?? 0;
  let id = count === 0 ? base : `${base}-${count + 1}`;
  while (seen.has(id)) {
    count += 1;
    id = `${base}-${count + 1}`;
  }
  seen.set(base, count + 1);
  seen.set(id, 1);
  return id;
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

In `package.json`, in the `"dependencies"` block, insert alphabetically (confirm both versions already resolve using `npm ls @lezer/markdown @lezer/common` before editing; no package version changes are needed):

```json
    "@lezer/common": "1.5.2",
    "@lezer/highlight": "1.2.3",
    "@lezer/markdown": "1.7.2",
```

(`@lezer/highlight` is the existing entry — `@lezer/common` goes immediately before it, `@lezer/markdown` immediately after it, keeping the block alphabetical.)

Run: `npm install --package-lock-only --ignore-scripts --offline --no-audit --no-fund`
Expected: `package-lock.json` updates the root `dependencies` linkage for these two already-resolved packages without changing their resolved versions or running lifecycle scripts. Verify the diff and `npm ls @lezer/markdown @lezer/common`: versions must remain `1.7.2` and `1.5.2`. If local metadata cannot satisfy the offline command, investigate the missing metadata before using a registry-backed install; do not regenerate unrelated lockfile entries.

- [ ] **Step 2: Write the failing tests**

Add to `src/lib/markdown/render-html.test.ts`. Keep Task 2's helper import and tests until Task 6 replaces them with public heading tests; the new cases below exercise `renderMarkdown`:

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
import { parser, GFM } from '@lezer/markdown';
import type { SyntaxNode } from '@lezer/common';

const markdownParser = parser.configure(GFM);
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

  it('replaces invalid Unicode scalar values without crashing Preview', () => {
    for (const entity of ['&#9999999;', '&#x110000;', '&#0;', '&#xD800;']) {
      expect(renderMarkdown(entity).html).toBe('<p>\uFFFD</p>');
    }
    expect(renderMarkdown('&#x1F600; &#65;').html).toBe('<p>😀 A</p>');
  });

  it('renders a hard line break', () => {
    // HardBreak's source range includes the newline; render it exactly once as <br />.
    expect(renderMarkdown('line one  \nline two').html).toBe('<p>line one<br />line two</p>');
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
  if (body.startsWith('#')) {
    const hex = /^#x/i.test(body);
    const code = parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10);
    if (!Number.isInteger(code) || code <= 0 || code > 0x10ffff ||
        (code >= 0xd800 && code <= 0xdfff)) return '\uFFFD';
    return String.fromCodePoint(code);
  }
  return Object.hasOwn(ENTITY_MAP, body) ? ENTITY_MAP[body] : nodeSource;
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
      // A Link/Image's own URL child is hidden destination data,
      // not visible text (e.g. heading "Using [Markdown](url)" extracts to
      // "Using Markdown", not "Using Markdown url"). An Autolink URL
      // or standalone bare URL *is* the visible text and must be retained.
      if (parentName === 'Link' || parentName === 'Image') return '';
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

  it('keeps natural suffixes and generated IDs globally unique', () => {
    const result = renderMarkdown('# Test\n\n# Test\n\n# Test-2');
    expect(result.headings.map((heading) => heading.id)).toEqual(['test', 'test-2', 'test-2-2']);
    expect(result.html).toContain('id="test-2-2"');
    expect(renderMarkdown('# Test-2\n\n# Test\n\n# Test').headings.map((h) => h.id))
      .toEqual(['test-2', 'test', 'test-3']);
  });

  it('retains visible autolink text in outline labels', () => {
    expect(renderMarkdown('# <https://example.com>').headings).toEqual([
      { level: 1, text: 'https://example.com', id: 'https-example-com' },
    ]);
    expect(renderMarkdown('# <hello@example.com>').headings[0].text).toBe('hello@example.com');
  });

  it('preserves all heading levels and punctuation fallback after helper tests are removed', () => {
    expect(renderMarkdown('# !!!\n\n# !!!').headings.map((h) => h.id))
      .toEqual(['section', 'section-2']);
    expect(renderMarkdown('# A\n## B\n### C\n#### D\n##### E\n###### F').headings.map((h) => h.level))
      .toEqual([1, 2, 3, 4, 5, 6]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/markdown/render-html.test.ts`
Expected: FAIL — heading nodes currently hit the unknown-node fallback (raw `# Hello` escaped as text). Step 1 removes the old helper import and tests; no import error is expected.

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
Expected: PASS — all tests in the file, including the public-API replacements for every slug-helper case removed in Step 1.

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

  it('preserves non-default ordered-list start numbers, including zero', () => {
    expect(renderMarkdown('3. third\n4. fourth').html)
      .toBe('<ol start="3"><li> <p>third</p></li>\n<li> <p>fourth</p></li></ol>');
    expect(renderMarkdown('0. zero').html).toBe('<ol start="0"><li> <p>zero</p></li></ol>');
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
      case 'OrderedList': {
        const marker = node.getChild('ListItem')?.getChild('ListMark');
        const start = marker ? parseInt(source.slice(marker.from, marker.to), 10) : 1;
        const attribute = start === 1 ? '' : ` start="${escapeAttribute(String(start))}"`;
        return `<ol${attribute}>${renderChildren(node)}</ol>`;
      }
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

Run: `npm test`
Expected: the renderer tests and existing suite pass before UI work begins.

- [ ] **Step 4: Commit**

```bash
git add src/lib/markdown/render-html.test.ts
git commit -m "test(markdown): pin xss and raw-html security boundary"
```

---


## Task 10: Share semantic colors and style both Markdown surfaces

**Files:** Modify `src/app/globals.css`, replace `src/components/editor/markdown-theme.ts`.
**Interfaces:** CSS custom properties `--md-*` are the only color source. Existing exports `markdownHighlightStyle` and `markdownEditorTheme` remain unchanged. Task 11 emits the `.cm-md-*` classes consumed here. No package changes.

- [ ] **Step 1: Replace `markdown-theme.ts` with this implementation.**

```ts
import { HighlightStyle } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { EditorView } from '@codemirror/view';

export const markdownHighlightStyle = HighlightStyle.define([
  { tag: tags.heading, color: 'var(--md-heading)', fontWeight: 'bold' },
  { tag: tags.strong, color: 'var(--md-heading)', fontWeight: 'bold' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: tags.link, color: 'var(--md-link)', textDecoration: 'underline',
    textDecorationColor: 'var(--md-link)' },
  { tag: tags.url, color: 'var(--md-link)' },
  { tag: tags.quote, color: 'var(--md-secondary)' },
  { tag: tags.processingInstruction, color: 'var(--md-syntax)' },
]);

export const markdownEditorTheme = EditorView.theme({
  '&': { backgroundColor: 'var(--md-canvas)', color: 'var(--md-text)', height: '100%' },
  '.cm-scroller': { overflow: 'auto' },
  '.cm-content': { fontSize: '0.875rem', lineHeight: '1.625', caretColor: 'var(--md-link)' },
  '.cm-gutters': { display: 'none' },
  '&.cm-focused': { outline: 'none' },
  '.cm-md-heading-line': {
    color: 'var(--md-heading)', fontWeight: '700', lineHeight: '1.3',
    paddingTop: '0.8em', paddingBottom: '0.35em',
  },
  '.cm-md-heading-1': { fontSize: '2em' },
  '.cm-md-heading-2': { fontSize: '1.65em' },
  '.cm-md-heading-3': { fontSize: '1.4em' },
  '.cm-md-heading-4': { fontSize: '1.2em' },
  '.cm-md-heading-5, .cm-md-heading-6': { fontSize: '1em' },
  '.cm-md-list-marker': { color: 'var(--md-list-marker) !important' },
  '.cm-md-syntax-mark': { color: 'var(--md-syntax)' },
  '.cm-md-quote-line': {
    color: 'var(--md-secondary)', fontStyle: 'italic',
    borderLeft: '3px solid var(--md-quote-border)', paddingLeft: '1em',
  },
  '.cm-md-inline-code': {
    color: 'var(--md-code-text)', backgroundColor: 'var(--md-code-bg)',
    borderRadius: '0.2em', padding: '0 0.3em',
  },
  '.cm-md-inline-code *': { color: 'var(--md-code-text)' },
  '.cm-md-inline-code .cm-md-code-mark, .cm-md-code-mark': { color: 'var(--md-syntax)' },
  '.cm-md-code-line': {
    color: 'var(--md-code-text)', backgroundColor: 'var(--md-code-bg)', fontStyle: 'normal',
    borderLeft: '1px solid var(--md-border)', borderRight: '1px solid var(--md-border)',
    paddingLeft: '16px', paddingRight: '16px',
  },
  '.cm-md-code-line *': { color: 'var(--md-code-text)' },
  '.cm-md-code-line .cm-md-code-mark': { color: 'var(--md-syntax)' },
  '.cm-md-code-line .cm-md-code-info': { color: 'var(--md-secondary)' },
  '.cm-md-code-first': {
    borderTop: '1px solid var(--md-border)', borderTopLeftRadius: '8px',
    borderTopRightRadius: '8px', paddingTop: '12px',
  },
  '.cm-md-code-last': {
    borderBottom: '1px solid var(--md-border)', borderBottomLeftRadius: '8px',
    borderBottomRightRadius: '8px', paddingBottom: '12px',
  },
  '.cm-search-match, .cm-search-match *': {
    backgroundColor: 'var(--md-search-bg) !important', color: 'var(--md-search-text) !important',
    borderRadius: '0.125rem',
  },
  '.cm-content::selection, .cm-content *::selection': {
    backgroundColor: 'var(--md-selection-bg) !important',
    color: 'var(--md-selection-text) !important',
  },
}, { dark: true });
```

`tags.list` and `tags.monospace` are deliberately absent: list nodes cover prose, and generic monospace highlighting cannot paint blank code lines or distinguish delimiters. CodeMirror selectors stay inside `EditorView.theme`; global CSS contains only shared tokens, surface-level backgrounds, and Preview selectors.

- [ ] **Step 2: Append these shared tokens and preview styles to `globals.css`.** Keep the application's existing styles; replace any existing Markdown-specific purple code rules if present, rather than leaving a competing Markdown palette.

```css
:root {
  --md-canvas: #09090b;
  --md-text: #d4d4d8;
  --md-heading: #f4f4f5;
  --md-secondary: #a1a1aa;
  --md-syntax: #a1a1aa;
  --md-list-marker: #818cf8;
  --md-link: #818cf8;
  --md-code-text: #fcd34d;
  --md-code-bg: #18181b;
  --md-border: #3f3f46;
  --md-quote-border: #52525b;
  --md-selection-bg: #312e81;
  --md-selection-text: #f4f4f5;
  --md-search-bg: #854d0e;
  --md-search-text: #fef3c7;
}
.md-preview, .md-editor-surface {
  color: var(--md-text);
  background: var(--md-canvas);
}
.md-preview { line-height: 1.7; overflow-wrap: anywhere; }
.md-preview :is(h1,h2,h3,h4,h5,h6) {
  color: var(--md-heading); font-weight: 700; line-height: 1.3;
  margin: 1.5em 0 0.6em; scroll-margin-top: 1.5rem;
}
.md-preview h1 { font-size: 2em; }
.md-preview h2 { font-size: 1.65em; }
.md-preview h3 { font-size: 1.4em; }
.md-preview h4 { font-size: 1.2em; }
.md-preview :is(h5,h6) { font-size: 1em; }
.md-preview p { margin: 0.8em 0; }
.md-preview strong { color: var(--md-heading); font-weight: 700; }
.md-preview em { font-style: italic; }
.md-preview del { text-decoration: line-through; }
.md-preview a { color: var(--md-link); text-decoration: underline; text-decoration-color: var(--md-link); }
.md-preview ul { list-style: disc; }
.md-preview ol { list-style: decimal; }
.md-preview :is(ul,ol) { padding-left: 1.6em; margin: 0.8em 0; }
.md-preview li { color: var(--md-text); margin: 0.3em 0; }
.md-preview li::marker { color: var(--md-list-marker); }
.md-preview code {
  color: var(--md-code-text); background: var(--md-code-bg);
  border-radius: 0.2em; padding: 0 0.3em; font-family: var(--font-mono, monospace);
}
.md-preview a code { color: var(--md-code-text); }
.md-preview pre {
  color: var(--md-code-text); background: var(--md-code-bg);
  border: 1px solid var(--md-border); border-radius: 8px;
  padding: 12px 16px; margin: 1em 0; overflow-x: auto;
  white-space: pre; overflow-wrap: normal;
}
.md-preview pre code { padding: 0; border-radius: 0; background: transparent; }
.md-preview blockquote {
  color: var(--md-secondary); border-left: 3px solid var(--md-quote-border);
  padding-left: 1em; margin: 1em 0; font-style: italic;
}
.md-preview table { border-collapse: collapse; display: block; overflow-x: auto; margin: 1em 0; }
.md-preview :is(th,td) { border: 1px solid var(--md-border); padding: 0.5em 0.75em; }
.md-preview th { color: var(--md-heading); font-weight: 700; }
.md-preview img { max-width: 100%; height: auto; }
.md-preview hr { border: 0; border-top: 1px solid var(--md-border); margin: 1.5em 0; }
/* Native selection paints over marks, including nested syntax/search decorations.
   Do not add drawSelection: its background layer cannot override text colors. */
.md-preview::selection, .md-preview *::selection {
  background: var(--md-selection-bg) !important;
  color: var(--md-selection-text) !important;
}
```

- [ ] **Step 3: Verify types and formatting.** Run `npm run lint`, `npm run format:check`, and `npm run typecheck`. If formatting fails, run `npx prettier --write src/components/editor/markdown-theme.ts src/app/globals.css`, then repeat all three checks. Expected: all pass. Do not add unit tests comparing token strings with themselves. Actual computed colors and contrast are exercised in Task 15.
- [ ] **Step 4: Commit.** Run `git add src/app/globals.css src/components/editor/markdown-theme.ts` then `git commit -m "feat(markdown): share semantic colors"`.

## Task 11: Add parser-backed editor decorations with real EditorView tests

**Files:** Create `src/components/editor/markdown-decorations.ts`, `src/components/editor/markdown-decorations.test.ts`; modify `src/components/editor/MarkdownEditor.tsx`.
**Interfaces:** Export `markdownDecorations: Extension`; CommonMark parsing remains `markdown()` unchanged. All replacements are inline and non-atomic: clicking code and normal cursor movement remain possible. `StateField<DecorationSet>` supplies line-affecting decorations directly to the view; do not return block/line-height decorations from a viewport-only view plugin.

- [ ] **Step 1: Add the complete jsdom test file.**

```ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { history, undo, redo } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { markdownDecorations } from './markdown-decorations';

let view: EditorView | undefined;
afterEach(() => { view?.destroy(); document.body.replaceChildren(); });
function mount(doc: string) {
  view = new EditorView({ parent: document.body, state: EditorState.create({
    doc, extensions: [markdown(), history(), markdownDecorations],
  }) });
  return view;
}
describe('Markdown presentation decorations', () => {
  it('decorates heading levels without changing heading syntax', () => {
    const source = '# One\n\n## Two\n\n### Three\n\n#### Four\n\n##### Five\n\n###### Six\n\nSetext\n======';
    const v = mount(source);
    expect(v.dom.querySelectorAll('.cm-md-heading-line')).toHaveLength(7);
    for (let level = 1; level <= 6; level++) {
      expect(v.dom.querySelectorAll(`.cm-md-heading-${level}`)).toHaveLength(level === 1 ? 2 : 1);
    }
    expect(v.state.sliceDoc()).toBe(source);
    expect(v.contentDOM.textContent).toContain('###### Six');
  });
  it('colors only parsed list markers and paints every code line including blanks', () => {
    const v = mount('- prose with `code`\n\n1. next\n\n```js\na\n\nb\n```');
    expect(Array.from(v.dom.querySelectorAll('.cm-md-list-marker'), n => n.textContent)).toEqual(['-', '1.']);
    expect(v.dom.querySelector('.cm-md-list-marker')?.textContent).not.toContain('prose');
    expect(v.dom.querySelectorAll('.cm-md-code-line')).toHaveLength(5);
    expect(v.dom.querySelectorAll('.cm-md-code-first')).toHaveLength(1);
    expect(v.dom.querySelectorAll('.cm-md-code-last')).toHaveLength(1);
    expect(v.dom.querySelector('.cm-md-code-info')?.textContent).toBe('js');
  });
  it('uses a structural border and italic secondary text for every quote line', () => {
    const v = mount('> first\n> second');
    expect(v.dom.querySelectorAll('.cm-md-quote-line')).toHaveLength(2);
    expect(Array.from(v.dom.querySelectorAll('.cm-md-code-mark'), n => n.textContent)).toEqual([]);
  });
  it('paints indented code and nested list code including blank lines', () => {
    const v = mount('    a\n\n    b\n\n- item\n\n  ```\n  c\n\n  d\n  ```');
    expect(v.dom.querySelectorAll('.cm-md-code-line')).toHaveLength(8);
    expect(v.dom.querySelectorAll('.cm-md-code-first')).toHaveLength(2);
    expect(v.dom.querySelectorAll('.cm-md-code-last')).toHaveLength(2);
  });
  it('hides both parsed multi-backtick delimiters, preserves a literal backtick, and reveals on cursor/selection', () => {
    const source = 'x ``a ` b`` end';
    const v = mount(source);
    expect(v.contentDOM.textContent).toBe('x a ` b end');
    expect(v.state.sliceDoc()).toBe(source);
    v.dispatch({ selection: { anchor: 5 } });
    expect(v.contentDOM.textContent).toBe(source);
    expect(Array.from(v.dom.querySelectorAll('.cm-md-code-mark'), n => n.textContent)).toEqual(['``', '``']);
    v.dispatch({ selection: EditorSelection.range(0, 5) });
    expect(v.contentDOM.textContent).toBe(source);
    v.dispatch({ selection: { anchor: source.length } });
    expect(v.contentDOM.textContent).toBe('x a ` b end');
  });
  it('leaves fences and unpaired backticks intact and never changes undo history', () => {
    const v = mount('x `ok` and `unpaired\n\n```\n`literal`\n```');
    const before = v.state.doc.toString();
    v.dispatch({ selection: { anchor: 4 } });
    v.dispatch({ selection: { anchor: 0 } });
    expect(undo(v)).toBe(false);
    expect(v.contentDOM.textContent).toContain('```');
    expect(v.contentDOM.textContent).toContain('`literal`');
    expect(v.contentDOM.textContent).toContain('`unpaired');
    v.dispatch({ changes: { from: 0, insert: 'edit ' } });
    expect(undo(v)).toBe(true);
    expect(v.state.doc.toString()).toBe(before);
    expect(redo(v)).toBe(true);
    expect(v.state.doc.toString()).toBe('edit ' + before);
  });
  it('copies original Markdown through CodeMirror even when code is visually hidden', () => {
    const v = mount('x `code` y');
    // CodeMirror copies the current logical line for an empty selection.
    const copied: Record<string, string> = {};
    const event = new Event('copy', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: {
      clearData() {}, setData(type: string, value: string) { copied[type] = value; },
    } });
    v.contentDOM.dispatchEvent(event);
    expect(copied['text/plain']).toBe('x `code` y');
  });
});
```

- [ ] **Step 2: Run `npm test -- src/components/editor/markdown-decorations.test.ts`.** Expected: module-not-found failure for the new extension.
- [ ] **Step 3: Create the extension.**

```ts
import { type Extension, type Range, StateField, type EditorState } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView } from '@codemirror/view';
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';

function decorations(state: EditorState): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  const mark = (from: number, to: number, className: string) => {
    if (from < to) ranges.push(Decoration.mark({ class: className }).range(from, to));
  };
  // State-field decorations must include offscreen code boundaries. Ask the
  // incremental parser for the complete tree, falling back to its current tree.
  const tree = ensureSyntaxTree(state, state.doc.length, 100) ?? syntaxTree(state);
  tree.iterate({ enter(node) {
    const heading = /^(?:ATX|Setext)Heading([1-6])$/.exec(node.name);
    if (heading) {
      ranges.push(Decoration.line({
        class: `cm-md-heading-line cm-md-heading-${heading[1]}`,
      }).range(state.doc.lineAt(node.from).from));
    }
    if (node.name === 'ListMark') mark(node.from, node.to, 'cm-md-list-marker');
    if (node.name === 'QuoteMark') mark(node.from, node.to, 'cm-md-syntax-mark');
    if (node.name === 'Blockquote') {
      const first = state.doc.lineAt(node.from).number;
      const last = state.doc.lineAt(Math.max(node.from, node.to - 1)).number;
      for (let number = first; number <= last; number++) {
        ranges.push(Decoration.line({ class: 'cm-md-quote-line' }).range(state.doc.line(number).from));
      }
    }
    if (node.name === 'InlineCode') {
      mark(node.from, node.to, 'cm-md-inline-code');
      const revealed = state.selection.ranges.some(range => range.empty
        ? range.from >= node.from && range.from <= node.to
        : range.from < node.to && range.to > node.from);
      for (let child = node.node.firstChild; child; child = child.nextSibling) {
        if (child.name !== 'CodeMark') continue;
        if (revealed) mark(child.from, child.to, 'cm-md-code-mark');
        else ranges.push(Decoration.replace({}).range(child.from, child.to));
      }
      return false;
    }
    if (node.name === 'FencedCode' || node.name === 'CodeBlock') {
      const first = state.doc.lineAt(node.from).number;
      const last = state.doc.lineAt(Math.max(node.from, node.to - 1)).number;
      for (let number = first; number <= last; number++) {
        const classes = ['cm-md-code-line'];
        if (number === first) classes.push('cm-md-code-first');
        if (number === last) classes.push('cm-md-code-last');
        ranges.push(Decoration.line({ class: classes.join(' ') }).range(state.doc.line(number).from));
      }
      for (let child = node.node.firstChild; child; child = child.nextSibling) {
        if (child.name === 'CodeMark') mark(child.from, child.to, 'cm-md-code-mark');
        if (child.name === 'CodeInfo') mark(child.from, child.to, 'cm-md-code-info');
      }
      return false;
    }
  } });
  return Decoration.set(ranges, true);
}

const field = StateField.define<DecorationSet>({
  create: decorations,
  update(value, transaction) {
    return transaction.docChanged || transaction.selection ||
      syntaxTree(transaction.startState) !== syntaxTree(transaction.state)
      ? decorations(transaction.state) : value;
  },
  provide: value => EditorView.decorations.from(value),
});
export const markdownDecorations: Extension = field;
```

- [ ] **Step 4: Integrate the extension in `MarkdownEditor.tsx`.** Add `import { markdownDecorations } from './markdown-decorations';` and insert `markdownDecorations,` immediately after `markdownEditorTheme,` in the extensions array. Do not replace `markdown()` with GFM or add language highlighting.
- [ ] **Step 5: Run `npm test -- src/components/editor/markdown-decorations.test.ts`, `npm run lint`, `npm run format:check`, and `npm run typecheck`.** Expected: seven tests pass, with actual CodeMirror DOM and clipboard handler exercised. jsdom cannot establish click coordinates or native selection colors; Task 15 covers those in Chromium.
- [ ] **Step 6: Commit.** Run `git add src/components/editor/markdown-decorations.ts src/components/editor/markdown-decorations.test.ts src/components/editor/MarkdownEditor.tsx` then `git commit -m "feat(editor): decorate markdown structure"`.

## Task 12: Restore preview offsets without discarding pending image layout

**Files:** Create `src/components/editor/preview-scroll.ts`, `src/components/editor/preview-scroll.test.ts`.
**Interfaces:** `restorePreviewScroll(container: HTMLElement, requested: number, report: (top: number) => void): () => void`. A pending image can temporarily reduce the maximum offset; keep the requested offset until all images settle. Report actual positions on manual scroll and outline navigation; cleanup removes every listener and observer. Every Preview mount gets its own controller.

- [ ] **Step 1: Add these helper tests.**

```ts
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { restorePreviewScroll } from './preview-scroll';
const originalResizeObserver = globalThis.ResizeObserver;
const disconnect = vi.fn();
beforeEach(() => {
  disconnect.mockClear();
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect = () => disconnect();
  } as unknown as typeof ResizeObserver;
});
afterEach(() => {
  globalThis.ResizeObserver = originalResizeObserver;
  document.body.replaceChildren();
});
function fixture(pending = false) {
  const element = document.createElement('div');
  const image = document.createElement('img');
  element.append(image);
  let height = 300;
  Object.defineProperties(element, {
    scrollHeight: { get: () => height }, clientHeight: { value: 100 },
  });
  let complete = !pending;
  Object.defineProperty(image, 'complete', { get: () => complete });
  return { element, image, grow: (next: number) => { height = next; },
    load: () => { complete = true; image.dispatchEvent(new Event('load')); } };
}
describe('preview offset restoration', () => {
  it('starts at zero and clamps completed shorter content', () => {
    const f = fixture(); const report = vi.fn();
    let dispose = restorePreviewScroll(f.element, 0, report);
    expect(f.element.scrollTop).toBe(0); dispose();
    dispose = restorePreviewScroll(f.element, 900, report);
    expect(f.element.scrollTop).toBe(200); expect(report).toHaveBeenLastCalledWith(200);
    dispose();
  });
  it('does not commit a premature clamp before images load', () => {
    const f = fixture(true); const report = vi.fn();
    const dispose = restorePreviewScroll(f.element, 800, report);
    expect(f.element.scrollTop).toBe(200); expect(report).not.toHaveBeenCalled();
    f.element.dispatchEvent(new Event('scroll'));
    expect(report).not.toHaveBeenCalled();
    f.grow(1200); f.load();
    expect(f.element.scrollTop).toBe(800); expect(report).toHaveBeenLastCalledWith(800);
    dispose();
  });
  it.each(['wheel', 'touchstart', 'pointerdown', 'keydown', 'preview-navigation'])(
    '%s cancels pending restoration and subsequent scroll reports the user position', eventName => {
      const f = fixture(true); const report = vi.fn();
      const dispose = restorePreviewScroll(f.element, 800, report);
      f.element.dispatchEvent(new Event(eventName));
      f.element.scrollTop = 70; f.element.dispatchEvent(new Event('scroll'));
      expect(report).toHaveBeenLastCalledWith(70);
      f.grow(1200); f.load(); expect(f.element.scrollTop).toBe(70);
      dispose();
    },
  );
  it('waits for every image to load or fail before committing the restored offset', () => {
    const f = fixture(true); const second = document.createElement('img');
    let secondComplete = false;
    Object.defineProperty(second, 'complete', { get: () => secondComplete });
    f.element.append(second); const report = vi.fn();
    const dispose = restorePreviewScroll(f.element, 800, report);
    f.grow(1200); f.load(); expect(report).not.toHaveBeenCalled();
    secondComplete = true; second.dispatchEvent(new Event('error'));
    expect(f.element.scrollTop).toBe(800); expect(report).toHaveBeenLastCalledWith(800);
    dispose();
  });
  it('settles failed images and ignores late events after unmount', () => {
    const f = fixture(true); const report = vi.fn();
    const dispose = restorePreviewScroll(f.element, 800, report);
    f.image.dispatchEvent(new Event('error'));
    expect(report).toHaveBeenLastCalledWith(200);
    dispose(); report.mockClear(); f.grow(1400); f.load();
    f.element.dispatchEvent(new Event('scroll')); expect(report).not.toHaveBeenCalled();
    expect(disconnect).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run `npm test -- src/components/editor/preview-scroll.test.ts`.** Expected: missing-module failure.
- [ ] **Step 3: Implement the helper.**

```ts
export function restorePreviewScroll(
  container: HTMLElement, requested: number, report: (top: number) => void,
): () => void {
  const images = Array.from(container.querySelectorAll('img'));
  const pending = new Set(images.filter(image => !image.complete));
  let restoring = true;
  let disposed = false;
  let observer: ResizeObserver | undefined;
  const apply = () => {
    if (disposed || !restoring) return;
    const maximum = Math.max(0, container.scrollHeight - container.clientHeight);
    container.scrollTop = Math.min(Math.max(0, requested), maximum);
    if (pending.size === 0) {
      restoring = false;
      report(container.scrollTop);
      observer?.disconnect();
    }
  };
  const cancel = () => { restoring = false; observer?.disconnect(); };
  const scroll = () => { if (!restoring) report(container.scrollTop); };
  const settled = (event: Event) => { pending.delete(event.currentTarget as HTMLImageElement); apply(); };
  images.forEach(image => {
    image.addEventListener('load', settled);
    image.addEventListener('error', settled);
  });
  container.addEventListener('scroll', scroll);
  // Outline dispatches this event before scrolling, including while an image is pending.
  container.addEventListener('preview-navigation', cancel);
  container.addEventListener('wheel', cancel, { passive: true });
  container.addEventListener('touchstart', cancel, { passive: true });
  container.addEventListener('pointerdown', cancel);
  container.addEventListener('keydown', cancel);
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(apply);
    observer.observe(container);
    if (container.firstElementChild) observer.observe(container.firstElementChild);
  }
  apply();
  return () => {
    disposed = true; observer?.disconnect();
    images.forEach(image => {
      image.removeEventListener('load', settled);
      image.removeEventListener('error', settled);
    });
    container.removeEventListener('scroll', scroll);
    container.removeEventListener('preview-navigation', cancel);
    container.removeEventListener('wheel', cancel);
    container.removeEventListener('touchstart', cancel);
    container.removeEventListener('pointerdown', cancel);
    container.removeEventListener('keydown', cancel);
  };
}
```

- [ ] **Step 4: Run `npm test -- src/components/editor/preview-scroll.test.ts`, `npm run lint`, `npm run format:check`, and `npm run typecheck`.** Expected: nine cases pass (the five-event cancellation table expands into five tests). DOM dimensions are explicitly controlled: this tests the restoration policy, not browser layout.
- [ ] **Step 5: Commit.** Run `git add src/components/editor/preview-scroll.ts src/components/editor/preview-scroll.test.ts` then `git commit -m "feat(editor): preserve preview scroll through images"`.

## Task 13: Render Preview and a scoped, responsive outline

**Files:** Create `src/components/editor/MarkdownOutline.tsx`, `src/components/editor/MarkdownPreview.tsx`, `src/components/editor/MarkdownPreview.test.tsx`.
**Interfaces:** Consume `renderMarkdown(content: string): { html: string; headings: Heading[] }` and exported `Heading` from `@/lib/markdown/render-html`. Preview props are exactly `content`, `initialScrollTop`, and `onScrollPositionChange`. Outline receives `headings` and `containerRef: RefObject<HTMLDivElement | null>`. EditorCanvas holds the offset; Preview owns the DOM.

- [ ] **Step 1: Add the component tests.**

```tsx
// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import MarkdownPreview from './MarkdownPreview';
const reactGlobals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const previousActEnvironment = reactGlobals.IS_REACT_ACT_ENVIRONMENT;
const previousCss = globalThis.CSS;
let cleanup = () => {};
beforeEach(() => { reactGlobals.IS_REACT_ACT_ENVIRONMENT = true; });
afterEach(() => {
  cleanup(); cleanup = () => {};
  reactGlobals.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
  Object.defineProperty(globalThis, 'CSS', { configurable: true, value: previousCss });
  document.body.replaceChildren();
});
it('omits outline for heading-free content and rerenders the current draft', async () => {
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host); cleanup = () => { act(() => root.unmount()); host.remove(); };
  const report = vi.fn();
  await act(async () => root.render(<MarkdownPreview content="draft" initialScrollTop={0} onScrollPositionChange={report} />));
  expect(host.querySelector('nav')).toBeNull();
  expect(host.querySelector('.md-preview')?.textContent).toBe('draft');
  await act(async () => root.render(<MarkdownPreview content="# New draft" initialScrollTop={0} onScrollPositionChange={report} />));
  expect(host.querySelector('h1')?.textContent?.trim()).toBe('New draft');
  expect(host.querySelector('nav button')?.textContent).toBe('New draft');
});
it('scopes Unicode outline targets to its own preview', async () => {
  Object.defineProperty(globalThis, 'CSS', { configurable: true, value: { escape: (value: string) => value } });
  const outside = document.createElement('h1'); outside.id = '架构'; document.body.append(outside);
  const wrong = vi.fn(); outside.scrollIntoView = wrong;
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host); cleanup = () => { act(() => root.unmount()); host.remove(); outside.remove(); };
  await act(async () => root.render(<MarkdownPreview content="# 架构" initialScrollTop={0} onScrollPositionChange={() => {}} />));
  const target = host.querySelector('h1')!;
  const order: string[] = [];
  host.querySelector('[data-testid="markdown-preview-scroll"]')!
    .addEventListener('preview-navigation', () => order.push('navigation'));
  target.scrollIntoView = vi.fn(() => order.push('scroll'));
  host.querySelector('button')!.click();
  expect(target.scrollIntoView).toHaveBeenCalledWith({ block: 'start' });
  expect(order).toEqual(['navigation', 'scroll']);
  expect(wrong).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run `npm test -- src/components/editor/MarkdownPreview.test.tsx`.** Expected: missing-module failure.
- [ ] **Step 3: Create `MarkdownOutline.tsx`.**

```tsx
'use client';
import React, { type RefObject } from 'react';
import type { Heading } from '@/lib/markdown/render-html';
interface MarkdownOutlineProps {
  headings: Heading[];
  containerRef: RefObject<HTMLDivElement | null>;
}
const MarkdownOutline: React.FC<MarkdownOutlineProps> = ({ headings, containerRef }) => {
  if (headings.length === 0) return null;
  return <nav aria-label="Markdown outline" className="hidden w-48 shrink-0 overflow-auto border-r border-zinc-800 p-3 md:block">
    <ul className="space-y-1">
      {headings.map(heading => <li key={heading.id}>
        <button type="button" className="w-full rounded px-2 py-1 text-left text-sm text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 focus-visible:outline-2 focus-visible:outline-indigo-400"
          style={{ paddingLeft: `${8 + (heading.level - 1) * 12}px` }}
          onClick={() => {
            const container = containerRef.current;
            container?.dispatchEvent(new Event('preview-navigation'));
            container?.querySelector<HTMLElement>(`#${CSS.escape(heading.id)}`)?.scrollIntoView({ block: 'start' });
          }}>
          {heading.text}
        </button>
      </li>)}
    </ul>
  </nav>;
};
export default MarkdownOutline;
```

- [ ] **Step 4: Create `MarkdownPreview.tsx`.**

```tsx
'use client';
import React, { useLayoutEffect, useMemo, useRef } from 'react';
import { renderMarkdown } from '@/lib/markdown/render-html';
import MarkdownOutline from './MarkdownOutline';
import { restorePreviewScroll } from './preview-scroll';
interface MarkdownPreviewProps {
  content: string;
  initialScrollTop: number;
  onScrollPositionChange: (scrollTop: number) => void;
}
const MarkdownPreview: React.FC<MarkdownPreviewProps> = ({
  content, initialScrollTop, onScrollPositionChange,
}) => {
  const { html, headings } = useMemo(() => renderMarkdown(content), [content]);
  const containerRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef(initialScrollTop);
  const reportRef = useRef(onScrollPositionChange);
  reportRef.current = onScrollPositionChange;
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    return restorePreviewScroll(container, offsetRef.current, top => {
      offsetRef.current = top;
      reportRef.current(top);
    });
  }, [html]);
  return <div className="flex h-full min-h-0 min-w-0 bg-[var(--md-canvas)]">
    <MarkdownOutline headings={headings} containerRef={containerRef} />
    <div ref={containerRef} data-testid="markdown-preview-scroll" tabIndex={0}
      aria-label="Markdown preview" className="min-w-0 flex-1 overflow-auto">
      <article className="md-preview p-6 md:px-10 lg:px-20" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  </div>;
};
export default MarkdownPreview;
```

- [ ] **Step 5: Run `npm test -- src/components/editor/MarkdownPreview.test.tsx src/components/editor/preview-scroll.test.ts`, `npm run lint`, `npm run format:check`, and `npm run typecheck`.** Expected: all focused tests pass; no lint, format, or type errors. Run `rg -n "dangerouslySetInnerHTML" src` and expect exactly one match in `MarkdownPreview.tsx` at the escaped renderer boundary.
- [ ] **Step 6: Commit.** Run `git add src/components/editor/MarkdownOutline.tsx src/components/editor/MarkdownPreview.tsx src/components/editor/MarkdownPreview.test.tsx` then `git commit -m "feat(editor): add markdown preview outline"`.

## Task 14: Retain the current editor while integrating Edit/Preview

**Files:** Modify `src/components/editor/EditorCanvas.tsx`, `src/components/editor/MarkdownEditor.tsx`, `src/app/page.tsx`, `e2e/notes.spec.ts`, `e2e/README.md`, `.claude/rules/markdown.md`; create `src/components/editor/editor-scroll.ts`, `src/components/editor/editor-scroll.test.ts`.
**Interfaces:** Add `getScrollPosition(): { top: number; left: number }` and `restoreScrollPosition(position, afterMeasure?): void` to `MarkdownEditorHandle`. Keep one mounted editor and one mounted outer scroll wrapper per note. Note boundaries reset the complete `EditorCanvas` state via React key at its parent, not by a passive effect that supplies old content to a newly mounted CodeMirror.

- [ ] **Step 1: Add the editor scroll helper test.**

```ts
// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { restoreEditorScroll } from './editor-scroll';
it('restores internal scrolling in CodeMirror measurement write phase', () => {
  const view = new EditorView({ parent: document.body, state: EditorState.create({ doc: 'text' }) });
  let measurement: Parameters<EditorView['requestMeasure']>[0];
  view.requestMeasure = request => { measurement = request; };
  let restored = false;
  restoreEditorScroll(view, { top: 200, left: 30 }, () => { restored = true; });
  expect(view.scrollDOM.scrollTop).toBe(0);
  const measured = measurement!.read(view);
  measurement!.write!(measured, view);
  expect(view.scrollDOM.scrollTop).toBe(200);
  expect(view.scrollDOM.scrollLeft).toBe(30); expect(restored).toBe(true);
  view.destroy(); document.body.replaceChildren();
});
```

- [ ] **Step 2: Run `npm test -- src/components/editor/editor-scroll.test.ts`.** Expected: missing-module failure. Create the helper:

```ts
import type { EditorView } from '@codemirror/view';
export interface EditorScrollPosition { top: number; left: number }
export function restoreEditorScroll(view: EditorView, position: EditorScrollPosition, afterMeasure?: () => void): void {
  view.requestMeasure({
    key: restoreEditorScroll,
    read: () => position,
    write: saved => {
      view.scrollDOM.scrollTop = saved.top;
      view.scrollDOM.scrollLeft = saved.left;
      afterMeasure?.();
    },
  });
}
```

- [ ] **Step 3: Make these exact `MarkdownEditor.tsx` changes.**

```diff
+import { restoreEditorScroll, type EditorScrollPosition } from './editor-scroll';
 export interface MarkdownEditorHandle {
+  getScrollPosition: () => EditorScrollPosition;
+  restoreScrollPosition: (position: EditorScrollPosition, afterMeasure?: () => void) => void;
```

Add these members at the start of the object returned by `useImperativeHandle`:

```ts
getScrollPosition: () => ({
  top: viewRef.current?.scrollDOM.scrollTop ?? 0,
  left: viewRef.current?.scrollDOM.scrollLeft ?? 0,
}),
restoreScrollPosition: (position, afterMeasure) => {
  if (viewRef.current) restoreEditorScroll(viewRef.current, position, afterMeasure);
},
```

Replace `return () => view.destroy();` with:

```ts
return () => { viewRef.current = null; view.destroy(); };
```

Replace the component's final wrapper with:

```tsx
return <div ref={containerRef} className="h-full font-mono text-sm text-[var(--md-text)]" />;
```

- [ ] **Step 4: Ensure the parent resets state before mounting a new note.** In `src/app/page.tsx`, the `EditorArea` branch returning `<EditorCanvas>` must begin:

```tsx
<EditorCanvas
  key={activeNote.id}
  ref={editorRef}
```

All existing remaining props stay as they are. The normal loading path already unmounts the editor, but this key also makes direct ready-note replacement safe. Update the Cmd/Ctrl+K comment to:

```ts
// Cmd/Ctrl+K focuses search. MarkdownEditor does not bind this shortcut.
```

- [ ] **Step 5: Replace the mode-dependent imports, refs and note-sync effect in `EditorCanvas.tsx`.** Import `useLayoutEffect` from React. Replace `import { NoteMode, type SaveState } from '@/types';` with `import type { SaveState } from '@/types';`. Replace lucide imports `FileCode, Type` with `Eye, Pencil`. Add:

```ts
import MarkdownPreview from './MarkdownPreview';
import type { EditorScrollPosition } from './editor-scroll';
```

Delete `textareaRef` and `currentModeRef`. After `markdownEditorRef` add:

```ts
const [previewMode, setPreviewMode] = useState(false);
const editorScrollRef = useRef<HTMLDivElement>(null);
const previewScrollTopRef = useRef(0);
const editScrollRef = useRef<{ outer: EditorScrollPosition; inner: EditorScrollPosition } | null>(null);
const rememberPreviewScroll = useCallback((top: number) => { previewScrollTopRef.current = top; }, []);
const togglePreview = () => {
  if (!previewMode) {
    const outer = editorScrollRef.current;
    editScrollRef.current = {
      outer: { top: outer?.scrollTop ?? 0, left: outer?.scrollLeft ?? 0 },
      inner: markdownEditorRef.current?.getScrollPosition() ?? { top: 0, left: 0 },
    };
  }
  setPreviewMode(value => !value);
};
useLayoutEffect(() => {
  const saved = editScrollRef.current;
  if (previewMode || !saved) return;
  markdownEditorRef.current?.restoreScrollPosition(saved.inner, () => {
    const outer = editorScrollRef.current;
    if (outer) { outer.scrollTop = saved.outer.top; outer.scrollLeft = saved.outer.left; }
  });
}, [previewMode]);
```

Replace the existing note-sync and textarea auto-resize effects (the full region from `// Sync content when switching notes` through the second effect) with:

```ts
useEffect(() => {
  if (syncedNoteIdRef.current === note.id) return;
  syncedNoteIdRef.current = note.id;
  setContent(note.content);
  contentRef.current = note.content;
  setLocalTitle(note.title);
  setSaveState('IDLE');
  setPreviewMode(false);
  previewScrollTopRef.current = 0;
  editScrollRef.current = null;
  if (autoFocus) onAutoFocusHandled?.();
}, [note.id, note.title, note.content, autoFocus, onAutoFocusHandled]);
useEffect(() => () => { syncedNoteIdRef.current = null; }, []);
```

The cleanup invalidates a pending image paste when its note closes. Keep the same-note identity guard in `handlePasteImage`; remove only `if (currentModeRef.current !== NoteMode.RICH) return;`. A same-note paste can now finish in Preview. Do not clear autosave in `togglePreview`.

- [ ] **Step 6: Delete `handleSwitchMode` in full and replace both mode buttons with this JSX.** The surrounding mobile/desktop visibility containers remain. Use the same accessible label in both; only one is visible per viewport.

```tsx
<button type="button" onClick={togglePreview}
  aria-label={previewMode ? 'Edit' : 'Preview'} aria-pressed={previewMode}
  title={previewMode ? 'Edit' : 'Preview'}
  className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-xs font-bold text-zinc-300 hover:bg-zinc-700">
  {previewMode ? <Pencil className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
  <span className="hidden md:inline">{previewMode ? 'Edit' : 'Preview'}</span>
</button>
```

Change the toolbar condition from `note.mode === NoteMode.RICH` to `!previewMode`. Replace the complete existing Editor Body wrapper and both editor branches with:

```tsx
<div className="relative min-h-0 flex-1 overflow-hidden">
  <div ref={editorScrollRef} data-testid="markdown-editor-scroll"
    hidden={previewMode} inert={previewMode} aria-hidden={previewMode}
    className="md-editor-surface h-full overflow-auto p-6 font-mono md:px-10 lg:px-20">
    <MarkdownEditor key={note.id} ref={markdownEditorRef} value={content}
      onChange={val => {
        setContent(val);
        contentRef.current = val;
        triggerSave({ content: val });
      }}
      onPasteText={handlePasteText} onPasteImage={handlePasteImage}
      autoFocus={autoFocus} searchQuery={searchQuery} />
  </div>
  {previewMode && <MarkdownPreview content={content}
    initialScrollTop={previewScrollTopRef.current}
    onScrollPositionChange={rememberPreviewScroll} />}
</div>
```

Replace the footer span containing `{note.mode}` with:

```tsx
<span className="text-zinc-500">{previewMode ? 'PREVIEW' : 'EDIT'}</span>
```

No `NoteMode` checks remain in this component. Existing `note.mode` fields in save payloads remain unchanged. Keep source exports and plain-text projection behavior intact.

- [ ] **Step 7: Migrate the existing CRUD and paste browser tests to CodeMirror.** Add this helper near the imports in `e2e/notes.spec.ts`, replace each `getByPlaceholder('Start typing plain text...')` fill/assertion with it or `.cm-content`, delete the PLAIN/RICH switch test, and keep the HTML/plain-text paste security assertion against the single editor.

```ts
async function setMarkdown(page: Page, markdown: string) {
  const editor = page.locator('.cm-content');
  await editor.click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText(markdown);
}

// CRUD persistence assertion after reload/reselection:
await expect(page.locator('.cm-content')).toContainText(content);

// Paste assertion no longer switches mode first:
const cmContent = page.locator('.cm-content');
await cmContent.click();
await cmContent.evaluate((element) => {
  const clipboard = new DataTransfer();
  clipboard.setData('text/html', '<h2>Hello</h2><script>window.__xss = true;</script>');
  clipboard.setData('text/plain', '## Hello (plain text)');
  element.dispatchEvent(new ClipboardEvent('paste', {
    clipboardData: clipboard, bubbles: true, cancelable: true,
  }));
});
```

Import `type Page` from `@playwright/test`. Use `ControlOrMeta+A`, `ControlOrMeta+Z`, and `ControlOrMeta+Shift+Z` in test bodies instead of branching on Node's platform.

- [ ] **Step 8: Add browser coverage for the retained session and independent Preview position.** Add the following tests to `e2e/notes.spec.ts`; use enough repeated paragraphs to make both surfaces scroll. These assertions cover the current in-memory draft, selection/history retention, editor scrolling, first/subsequent preview offsets, outline navigation, shortening clamp, note-switch reset, and hidden-editor keyboard isolation.

```ts
test('previews the latest draft and retains selection, history, and both scroll positions', async ({ page }) => {
  await createNote(page);
  const markdown = ['# Start', ...Array.from({ length: 80 }, (_, i) => `line ${i}`), '# End'].join('\n\n');
  await setMarkdown(page, markdown);
  const editor = page.locator('.cm-content');
  await editor.click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.insertText(' draft');
  await page.keyboard.down('Shift'); await page.keyboard.press('ArrowLeft'); await page.keyboard.up('Shift');
  const outerScroll = page.getByTestId('markdown-editor-scroll');
  await outerScroll.evaluate(element => { element.scrollTop = 40; });
  await editor.evaluate(element => { element.closest('.cm-scroller')!.scrollTop = 160; });
  const before = await editor.evaluate(element => ({
    scrollTop: element.closest('.cm-scroller')!.scrollTop,
  }));
  const outerBefore = await outerScroll.evaluate(element => element.scrollTop);
  // Layout may put the scroll range in either the wrapper or CodeMirror.
  // Require a real nonzero editing offset and compare both offsets on return.
  expect(Math.max(before.scrollTop, outerBefore)).toBeGreaterThan(0);
  const selected = await page.evaluate(() => getSelection()?.toString());

  await page.getByRole('button', { name: 'Preview' }).click();
  await expect(page.getByRole('article')).toContainText('draft');
  await expect(page.getByTestId('markdown-editor-scroll')).toBeHidden();
  await page.keyboard.insertText('must-not-enter-editor');
  await expect(page.getByRole('article')).not.toContainText('must-not-enter-editor');
  const preview = page.getByTestId('markdown-preview-scroll');
  await expect(preview).toHaveJSProperty('scrollTop', 0);
  await preview.evaluate(element => { element.scrollTop = 240; element.dispatchEvent(new Event('scroll')); });

  await page.getByRole('button', { name: 'Edit' }).click();
  await editor.focus();
  await expect(editor).toContainText('draft');
  await expect.poll(() => page.evaluate(() => getSelection()?.toString())).toBe(selected);
  await expect.poll(() => editor.evaluate(element => element.closest('.cm-scroller')!.scrollTop))
    .toBe(before.scrollTop);
  await expect.poll(() => outerScroll.evaluate(element => element.scrollTop)).toBe(outerBefore);
  await page.keyboard.press('ControlOrMeta+Z'); await expect(editor).not.toContainText('draft');
  await page.keyboard.press('ControlOrMeta+Shift+Z'); await expect(editor).toContainText('draft');
  await page.getByRole('button', { name: 'Preview' }).click();
  await expect.poll(() => preview.evaluate(element => element.scrollTop)).toBe(240);
  await page.getByRole('button', { name: 'End draft' }).click();
  await expect.poll(() => preview.evaluate(element => element.scrollTop)).toBeGreaterThan(240);

  await page.getByRole('button', { name: 'Edit' }).click();
  await setMarkdown(page, '# Short');
  await page.getByRole('button', { name: 'Preview' }).click();
  await expect.poll(() => preview.evaluate(element => element.scrollTop)).toBe(0);
  await deleteActiveNote(page);
});

test('opens another note and reloads in Edit with Preview reset to the top', async ({ page }) => {
  await createNote(page); const first = uniqueName('Preview first');
  await page.getByPlaceholder('Untitled').fill(first);
  const firstContent = '# First\n\n' + 'body\n\n'.repeat(80);
  const firstSaved = waitForContentSave(page, firstContent);
  await setMarkdown(page, firstContent); await firstSaved;
  await page.getByRole('button', { name: 'Preview' }).click();
  await page.getByTestId('markdown-preview-scroll').evaluate(element => {
    element.scrollTop = 300; element.dispatchEvent(new Event('scroll'));
  });
  await createNote(page); const second = uniqueName('Preview second');
  await page.getByPlaceholder('Untitled').fill(second);
  const secondSaved = waitForContentSave(page, '# Second');
  await setMarkdown(page, '# Second'); await secondSaved;
  await expect(page.getByRole('button', { name: 'Preview' })).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: startsWith(first) }).click();
  await expect(page.getByRole('button', { name: 'Preview' })).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: 'Preview' }).click();
  await expect(page.getByTestId('markdown-preview-scroll')).toHaveJSProperty('scrollTop', 0);
  await page.reload(); await page.getByRole('button', { name: startsWith(first) }).click();
  await expect(page.getByRole('button', { name: 'Preview' })).toHaveAttribute('aria-pressed', 'false');
  await deleteActiveNote(page);
  await page.getByRole('button', { name: startsWith(second) }).click();
  await deleteActiveNote(page);
});
```

- [ ] **Step 9: Add real image lifecycle and responsive outline browser tests.** Paste an actual PNG `File`, enter Preview immediately, wait for its data URL image to load, and verify the Markdown remains after returning to Edit. Test the outline at 767px and 768px so the `md` boundary is explicit.

```ts
test('finishes an in-flight image paste while Preview is visible', async ({ page }) => {
  await createNote(page);
  await page.evaluate(() => {
    const NativeImage = window.Image;
    let release: (() => void) | undefined;
    Object.defineProperty(window, 'Image', { configurable: true, value: function Image() {
      const image = new NativeImage();
      Object.defineProperty(image, 'src', { configurable: true, set(value: string) {
        release = () => { image.setAttribute('src', value); };
      } });
      return image;
    } });
    (window as typeof window & { __releaseImageDecode?: () => void }).__releaseImageDecode =
      () => release?.();
  });
  await page.locator('.cm-content').click();
  await page.locator('.cm-content').evaluate((element) => {
    const bytes = Uint8Array.from(atob(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    ), character => character.charCodeAt(0));
    const clipboard = new DataTransfer();
    clipboard.items.add(new File([bytes], 'pixel.png', { type: 'image/png' }));
    element.dispatchEvent(new ClipboardEvent('paste', {
      clipboardData: clipboard, bubbles: true, cancelable: true,
    }));
  });
  await page.getByRole('button', { name: 'Preview' }).click();
  await expect(page.getByRole('article').locator('img')).toHaveCount(0);
  await page.evaluate(() => {
    (window as typeof window & { __releaseImageDecode?: () => void }).__releaseImageDecode?.();
  });
  const image = page.getByRole('article').locator('img[alt="pixel.png"]');
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate(node => (node as HTMLImageElement).complete)).toBe(true);
  await page.getByRole('button', { name: 'Edit' }).click();
  await expect(page.locator('.cm-content')).toContainText('![pixel.png](data:image/webp');
  await deleteActiveNote(page);
});

test('shows the outline from the md breakpoint and never overflows horizontally', async ({ page }) => {
  await createNote(page); await setMarkdown(page, '# One\n\n## Two\n\nbody');
  await page.getByRole('button', { name: 'Preview' }).click();
  const outline = page.getByRole('navigation', { name: 'Markdown outline' });
  await page.setViewportSize({ width: 767, height: 800 }); await expect(outline).toBeHidden();
  await page.setViewportSize({ width: 768, height: 800 }); await expect(outline).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await deleteActiveNote(page);
});
```

- [ ] **Step 10: Update the operational docs to match the shipped contract.** Replace the Scope paragraph in `e2e/README.md` and the opening overview plus module list in `.claude/rules/markdown.md` with these exact statements; retain the existing toolbar and `Note.content` guidance below them.

```md
<!-- e2e/README.md Scope -->
Covers login and note CRUD, the single CodeMirror Markdown editor, Edit/Preview
round-trips, editor and preview state retention, outline navigation, image-paste
completion, responsive outline behavior, plain-text paste handling, folder
workflows, and search. Run stateful scenarios only against the disposable
database described above.

<!-- .claude/rules/markdown.md Overview / module addition -->
`Note.content` is canonical Markdown for every note. `Note.mode` is a frozen
compatibility field carried through saves unchanged; it no longer selects an
editor. Edit always uses CodeMirror. Preview renders escaped HTML through the
single `MarkdownPreview.tsx` boundary; raw note HTML is displayed as text.

- `render-html.ts` — parser-backed, GFM-aware Markdown-to-HTML rendering plus
  semantic heading extraction. It is the only source permitted to supply HTML
  to `MarkdownPreview.tsx`.

Replace the final sentence under `## Note.content invariant` with:

`mode` is a frozen compatibility field carried through saves unchanged; it no
longer selects an editor or changes how `content` is interpreted.
```

- [ ] **Step 11: Run focused checks.** Run `npm test -- src/components/editor`, `npm run lint`, `npm run format:check`, and `npm run typecheck`. Expected: all pass. Then run `APP_PASSWORD="test-password" npm run test:e2e -- e2e/notes.spec.ts` only while the app is connected to the disposable database from `e2e/README.md`. Expected: all notes scenarios pass. These Playwright assertions establish actual browser scroll, image, keyboard, and responsive behavior; do not substitute jsdom results.
- [ ] **Step 12: Commit.** Run `git add src/components/editor/EditorCanvas.tsx src/components/editor/MarkdownEditor.tsx src/components/editor/editor-scroll.ts src/components/editor/editor-scroll.test.ts src/app/page.tsx e2e/notes.spec.ts e2e/README.md .claude/rules/markdown.md` then `git commit -m "feat(editor): retain session across markdown preview"`.

## Task 15: Whole-branch verification and visual acceptance

**Files:** none unless verification exposes a required fix; any fix gets its own atomic commit using `type(scope): lowercase description` with at most 12 words.

- [ ] **Step 1: Run automated checks.** Run `npm run lint && npm run format:check && npm run typecheck && npm test`. Start the app with the disposable database and `APP_PASSWORD` commands copied from `e2e/README.md`, then run `APP_PASSWORD="test-password" npm run test:e2e`; expect every Playwright project to pass. Confirm `rg -n "dangerouslySetInnerHTML" src` returns exactly one match in `src/components/editor/MarkdownPreview.tsx`, and `rg -n "NoteMode|textareaRef|handleSwitchMode|Start typing plain text|PLAIN|RICH" src/components/editor/EditorCanvas.tsx e2e/notes.spec.ts` returns no matches.
- [ ] **Step 2: Create one disposable acceptance note and run browser visual checks through the existing browser workflow.** Use this exact content, then inspect it at 390×844, 768×1024, and 1280×800. Verify Edit/Preview controls, hidden toolbar, outline hidden at 390 and visible at 768/1280, no page-level horizontal overflow, heading hierarchy/spacing, italic quote plus left border in both views, marker-only indigo list styling, amber inline/block code, continuous code-block backgrounds including blank lines, indigo underline around linked amber code, and table borders. Select the search hit `needle` and confirm selection foreground/background wins over the search colors. Record screenshots at all three widths.

````md
# Heading one
## Heading two
### Heading three

> Quoted *secondary* text

- neutral prose with [`linkedCode()`](https://example.com) and needle
  1. nested ordered prose

| Name | Value |
| --- | --- |
| alpha | `inline` |

```text
01 amber
02 amber

04 amber
05 amber
06 amber
07 amber
08 amber
09 amber
10 amber
11 amber
12 amber
13 amber
14 amber
15 amber
16 amber
17 amber
18 amber
19 amber
20 amber
21 amber
22 amber
23 amber
24 amber
25 amber
26 amber
27 amber
28 amber
29 amber
30 amber
```
````
- [ ] **Step 3: Verify state behavior manually.** Confirm first Preview starts at top; subsequent visits restore preview offset; outline navigation updates it; image loading does not erase it; shorter content clamps it; editing position/selection/undo history remains independent; switching notes and reloading reset both view state and preview offset. Confirm content, exports, clipboard, and saved `Note.mode` remain unchanged.
- [ ] **Step 4: Commit only surfaced fixes and update the progress ledger.** For each fix, rerun the focused failing check plus `npm run lint`, `npm run format:check`, and `npm run typecheck`, then create an atomic conventional commit such as `fix(editor): preserve preview offset after image load`. Record each clean task as required by Subagent-Driven Development, then dispatch the final whole-branch review with the merge-base review package.
