# Markdown Preview with Outline (retires the PLAIN/RICH toggle)

## Summary

`content` is already canonical Markdown/plain-text regardless of `Note.mode` — `markdownToPlainText()` no longer branches on mode, and the only thing PLAIN/RICH still controls is which editor surface (`<textarea>` vs CodeMirror) renders that same string. This change removes that UI-level fork entirely: every note gets one editor (CodeMirror, Markdown-aware), and a new **Preview** view renders the Markdown as HTML with a heading-based outline on the left.

This is the last step of a longer migration:

```
Before:  PLAIN <textarea> ─┐
                            ├─ same canonical Markdown storage
         RICH CodeMirror  ─┘

After:               ┌─ Edit:    CodeMirror
         Markdown ────┤
                       └─ Preview: renderer (this spec)
```

`PLAIN`/`RICH` stops being an active domain concept and becomes a frozen compatibility field (see below).

## Non-goals

- No syntax highlighting in the rendered preview (code blocks render as plain escaped `<pre><code>`).
- No scrollspy / IntersectionObserver-driven "active heading" tracking in the outline — click-to-scroll only.
- No `Note.mode` database migration. The column, `NoteMode` enum, `NotePayload.mode`, and API validation all stay exactly as they are.
- No new UI-selectable view-state persistence. Edit vs. Preview is ephemeral, per-session, per-note-open UI state.

## `Note.mode`: frozen, not removed

`EditorCanvas`'s `triggerSave()` already does `const mode = updates.mode ?? note.mode;` — it never needs a caller to supply `mode` explicitly. Removing `handleSwitchMode()` and its two toggle buttons is sufficient to freeze the field: every save simply carries the note's existing `mode` forward unchanged. No changes needed to `schema.prisma`, `types.ts`, API routes, or `serialize.ts`. `NoteMode` stays defined; a future migration (if ever needed) is a separate, independently-scoped change.

## State: `previewMode`

Ephemeral local state in `EditorCanvas`, reset alongside the existing note-sync effect (the one guarded by `syncedNoteIdRef`) — not lifted to `page.tsx`, since it's UI state of *the currently open note's editor*, not app-level state:

```ts
const [previewMode, setPreviewMode] = useState(false);

useEffect(() => {
  currentModeRef.current = note.mode;
  if (syncedNoteIdRef.current === note.id) return;
  syncedNoteIdRef.current = note.id;
  setContent(note.content);
  contentRef.current = note.content;
  setLocalTitle(note.title);
  setSaveState('IDLE');
  setPreviewMode(false); // always open a note in Edit
  ...
}, [note.id, note.title, note.content, note.mode, autoFocus, onAutoFocusHandled]);
```

## Component architecture

```
EditorCanvas
├── Header
│   └── Preview/Edit toggle button (replaces the old mode-switch button)
├── RichToolbar          ← rendered only when !previewMode
└── body
    ├── MarkdownEditor    ← !previewMode (unchanged; always the RICH-mode editor, now the only one)
    └── MarkdownPreview   ← previewMode
        ├── MarkdownOutline
        └── rendered HTML body
```

`EditorCanvas` changes:
- Delete the `<textarea>` branch, `textareaRef`, the auto-resize effect, the PLAIN paste-image handler branch, and every `note.mode === NoteMode.PLAIN/RICH` conditional except the ones needed to freeze `mode` on save.
- Delete `handleSwitchMode` and both mode-switch buttons (mobile + desktop). Replace with a Preview/Edit toggle (`Eye`/`Pencil` icons from `lucide-react`) that flips local `previewMode` — no `persistChange` call, since this is not saved state.
- `RichToolbar` render condition changes from `note.mode === NoteMode.RICH` to `!previewMode`.
- Editor body renders `<MarkdownEditor>` when `!previewMode`, else `<MarkdownPreview content={content} />`.
- Footer badge that currently shows `{note.mode}` switches to reflect `previewMode` (`EDIT` / `PREVIEW`) purely as a display label — word/char counts are unaffected (already computed from `content` via `markdownToPlainText`, independent of view).

`EditorCanvas` does **not** know about HTML, headings, slugs, or GFM — it only branches on `previewMode` and passes `content` through. `MarkdownPreview` owns parsing:

```ts
// MarkdownPreview.tsx
const { html, headings } = useMemo(() => renderMarkdown(content), [content]);
```

### `MarkdownPreview.tsx` (new)

```ts
interface MarkdownPreviewProps {
  content: string;
}
```

Layout: `flex` row. `MarkdownOutline` (`w-48 shrink-0 border-r border-zinc-800`, `hidden md:block` — hidden on phone width, matching the tablet breakpoint used elsewhere) on the left when `headings.length > 0` (omitted entirely, not just visually collapsed, when there are no headings — a note with no `#` headings shouldn't lose 192px of width). Rendered body (`flex-1 overflow-auto`) on the right, wrapped in a `.md-preview` container and set via `dangerouslySetInnerHTML={{ __html: html }}` — the **only** place in the codebase doing this, and only because `html` is produced by our own escaping renderer (see Security boundary below), never from unprocessed user input.

A `previewRef` on the scroll container is passed down (or the outline is rendered as a sibling inside the same flex row so it can reach the body via a shared ref) so outline clicks can scope their `querySelector` to this note's own preview, not `document` globally.

### `MarkdownOutline.tsx` (new)

```ts
interface MarkdownOutlineProps {
  headings: Heading[]; // { level: 1-6; text: string; id: string }
  containerRef: React.RefObject<HTMLElement>;
}
```

Renders a simple indented list (`paddingLeft` scaled by `level`). On click:

```ts
containerRef.current
  ?.querySelector<HTMLElement>(`#${CSS.escape(id)}`)
  ?.scrollIntoView({ block: 'start' });
```

`CSS.escape` guards against selector-syntax edge cases in generated ids even though the slugger (below) only ever emits `[a-z0-9-]`, so this is a no-cost safety net rather than a load-bearing assumption.

## Rendering pipeline (`src/lib/markdown/render-html.ts`, new)

`@lezer/markdown` is already resolved in the lockfile as a transitive dependency of `@codemirror/lang-markdown` (`@lezer/markdown@1.7.2`). It gets promoted to a direct `dependencies` entry at that same pinned version — no new package is actually installed, just a direct declaration of what's already there.

**GFM is required, not optional.** `terminal-table.ts`'s paste handler already converts pasted tables into real GFM pipe-table Markdown (`| a | b |` / `| --- | --- |`). Rendering without the GFM extension would make pasted tables look correct in Edit (CodeMirror also uses GFM highlighting) but degrade to raw pipe-text in Preview. So:

```ts
import { parser, GFM } from '@lezer/markdown';
const markdownParser = parser.configure(GFM);
```

### Traversal contract

The Lezer tree is a **structural recognizer**, not a ready-made HTML AST — it exposes both semantic block/inline nodes *and* the syntax marker tokens that spell them out (`**` as `EmphasisMark`, `#` as `HeaderMark`, backticks as `CodeMark`, brackets/parens as `LinkMark`, etc). Naively "walking every node and emitting its leaves" double-renders markers and fights parent/child range overlap. The actual contract:

- **Semantic nodes get an explicit renderer** that consumes the node's full source range and recurses only into its semantic children: `Paragraph`, `ATXHeading1`–`ATXHeading6`, `SetextHeading1`/`SetextHeading2`, `Blockquote`, `BulletList`, `OrderedList`, `TaskList`, `ListItem`, `Task`, `FencedCode`, `CodeBlock`, `Table`, `TableHeader`, `TableRow`, `TableCell`, `HorizontalRule`, `Emphasis`, `StrongEmphasis`, `Strikethrough`, `InlineCode`, `Link`, `Image`, `Autolink`, `LinkReference`, `HardBreak`, `Escape`, `Entity`.
- **Syntax marker nodes are never rendered directly** and are skipped by the semantic renderers that own them: `HeaderMark`, `EmphasisMark`, `StrikethroughMark`, `CodeMark`, `CodeInfo`, `LinkMark`, `LinkLabel`, `LinkTitle`, `ListMark`, `QuoteMark`, `TableDelimiter`, `TaskMarker` (consumed only to read its checked/unchecked state, not rendered as text).
- **`URL` nodes are consumed as data, not content** — inside `Link`/`Image`/`Autolink`, the `URL` child's source text becomes the `href`/`src` value (after the scheme check below); it is never recursed into as visible text.
- **`HTMLBlock` and `HTMLTag`** are always rendered as escaped plain text of their own source range — raw HTML from note content is never passed through, regardless of how well-formed it looks.
- **Any other/unknown node type** falls back to `escapeHtml(source.slice(node.from, node.to))` — escaped plain text of its full range. This is the fail-closed default: an unhandled node degrades to visible text, never to unescaped output.

### `extractText(node)`: semantic text, not source slice

Heading outline labels and slugs must reflect *visible* text, not raw Markdown source. `## Using **CodeMirror** with [Markdown](...)` must produce the outline label `Using CodeMirror with Markdown`, not the literal source with `**`/`[]()` still in it.

`extractText(node)` walks the same node using the identical semantic/marker distinction as the HTML renderer (skip marker nodes, recurse into semantic/inline children, concatenate `Text`/`Escape`/`Entity` leaves), so heading text and rendered heading HTML content share one source of truth instead of two parallel implementations that can drift.

### Headings → outline

For each `ATXHeading1`–`6` / `SetextHeading1`/`2` encountered during the single tree traversal:

```ts
interface Heading {
  level: 1 | 2 | 3 | 4 | 5 | 6;
  text: string; // from extractText()
  id: string;   // slug of text, deduped
}
```

Slug: lowercase `text`, strip everything outside `[a-z0-9]`, collapse runs of separators to a single `-`, trim leading/trailing `-`. Collisions within one document get a numeric suffix: `test`, `test-2`, `test-3`. The same `id` is written as the `id` attribute on the corresponding `<h1>`–`<h6>` in the rendered HTML, so outline clicks and in-page anchors share the identical id space.

`renderMarkdown(content)` returns `{ html, headings }` from one parse + one traversal — `MarkdownPreview` is the only caller.

### Security boundary

There is no HTML sanitizer anywhere in this codebase (by design — pasted HTML has always been ignored, so this has never come up). Introducing `dangerouslySetInnerHTML` for the first time means the renderer itself *is* the sanitizer, and "escape the leaf text nodes" alone is not sufficient — link/image danger lives in attribute values (`href`/`src`), not in text content. The full boundary:

| Content class | Rule |
|---|---|
| Text content (paragraph/emphasis/heading text, etc.) | `escapeHtml()` — `&<>"'` entity-escaped |
| HTML attribute values | `escapeAttribute()` — same entity set, applied wherever a value is interpolated into `attr="..."` |
| `<a href>` | Scheme allowlist: `http:`, `https:`, `mailto:`, or scheme-less (relative path / `#fragment`). Anything else (`javascript:`, `vbscript:`, `data:`, unknown schemes) → **do not emit an `<a>` tag at all**; render the link's inner text as plain escaped text instead. |
| `<img src>` | Scheme allowlist: `http:`, `https:`, `data:image/png`, `data:image/jpeg`, `data:image/webp`, `data:image/gif`. Anything else → **do not emit an `<img>` tag**; render the alt text as plain escaped text instead. |
| `HTMLBlock` / `HTMLTag` | Always escaped source text, never interpreted as markup. |
| Unrecognized node types | Escaped source-range text (fail-closed default from the traversal contract above). |

The `data:image/*` allowlist exists specifically because pasted images are a real, exercised feature: `EditorCanvas.handlePasteImage` → `resizeImageToDataURL` → `canvas.toDataURL('image/webp', 0.85)` produces `![filename](data:image/webp;base64,...)`, and Preview must render that image, not strip it.

Scheme parsing: extract the substring before the first `:` (case-insensitive), trim, compare against the allowlist; a URL with no `:` before the first `/` (relative/fragment) is allowed through unchanged.

## Layout & styling

Rendered Markdown elements (`h1`–`h6`, `p`, `code`, `pre`, `blockquote`, `ul`/`ol`/`li`, `table`/`th`/`td`, `a`, `img`, `hr`, `del`, `strong`, `em`) get a small hand-written `.md-preview` CSS block in `globals.css`, styled from the existing zinc/indigo dark palette (`styling.md`). No `@tailwindcss/typography` or other new dependency — this repo already hand-rolls custom styles outside Tailwind utilities for CodeMirror (`markdown-theme.ts`) and the scrollbar (`globals.css`), so this follows the established pattern rather than introducing a new one.

## Testing

`src/lib/markdown/render-html.test.ts`:
- Headings → outline: levels, dedup suffixing (`# Test` × 3 → `test`, `test-2`, `test-3`).
- Heading with inline formatting: `# Hello **world**` and `# Hello world` in the same doc → outline text `Hello world` for both, slugs `hello-world` / `hello-world-2` (pins the semantic-text rule from `extractText`).
- XSS: `<script>alert(1)</script>` in a paragraph renders as escaped text, never executes.
- Raw HTML block passthrough attempt renders as escaped text.
- `[click](javascript:alert(1))` → no `href` attribute containing `javascript:` anywhere in output (asserts the link degrades to plain text).
- GFM table (the exact shape `terminal-table.ts` produces) renders as a `<table>` with the right cell contents.
- Fenced code block: content escaped, no highlighting markup, wrapped in `<pre><code>`.
- Pasted image contract: `![paste](data:image/webp;base64,AAAA)` renders an `<img>` with that `src` preserved (positive case matching the allowlist, paired with the negative `data:` cases already covered by the scheme table).

Manual check after implementation: paste a terminal table and a screenshot into a note, confirm both render correctly in Preview; confirm Edit ⇄ Preview toggle and RichToolbar visibility behave correctly on phone/tablet/desktop widths.

## Files touched

1. `src/lib/markdown/render-html.ts` — new. `renderMarkdown(content): { html, headings }`, `escapeHtml`, `escapeAttribute`, URL scheme checks, slugger, `extractText`.
2. `src/lib/markdown/render-html.test.ts` — new.
3. `src/components/editor/MarkdownPreview.tsx` — new.
4. `src/components/editor/MarkdownOutline.tsx` — new.
5. `src/components/editor/EditorCanvas.tsx` — remove PLAIN branch, mode-switch UI/handler; add `previewMode` state + toggle; conditional render.
6. `src/app/globals.css` — add `.md-preview` styles.
7. `package.json` — promote `@lezer/markdown` from transitive to direct dependency (pinned `1.7.2`, matching the already-resolved lockfile version).
