# Markdown Preview with Outline (retires the PLAIN/RICH toggle)

## Summary

**Product intent (confirmed 2026-09-16):** Writing Markdown is the primary workflow. Preview lets the writer check the current draft's formatting and read long notes with heading navigation, then continue writing where they left off. Notes open in Edit; Preview renders the current in-memory content, including changes awaiting autosave.

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
- No editor-state persistence across a page reload or switching away from the current note. State preservation below applies to Edit/Preview round-trips within the currently open note.
- Reference-style link destination lookup is outside this renderer's scope. Reference definitions render as nothing; a reference usage without an inline URL preserves its visible label without emitting a dead anchor. Bare GFM URLs remain visible text.

## Preserve the writing session across Preview

**Confirmed 2026-09-16:** Edit → Preview → Edit must preserve the current note's undo/redo history, cursor position, selection, and editor scroll position. This replaces the original proposal to discard editor-local state on every toggle.

Keep the current note's `MarkdownEditor` and its `EditorView` mounted while Preview is visible. Hide the editor and exclude it from keyboard navigation and the accessibility tree; keep its state in memory. Preview has its own scroll container, so reading or following an outline entry does not change the saved editing position. On returning to Edit, restore the editor's scrolling after it becomes visible and has measured its layout. Retaining the React component alone is not sufficient evidence that browser scrolling is preserved.

This approach keeps CodeMirror's existing state together. Destroying and reconstructing the editor from an explicit state snapshot is an alternative, but adds lifecycle and scroll-restoration work without a product benefit here. Retaining a mounted editor uses memory while previewing; only the current note's editor is retained, not a cache of editors for previously opened notes.

Switching notes still starts in Edit with a fresh editor for the selected note. Key the editor-session boundary by the note ID so a new CodeMirror instance cannot initialize from the previous note's local content before an effect synchronizes it. The toggle does not convert content, change `Note.mode`, or cancel pending autosave. A pending image paste for the same note can complete against the retained editor and update Preview; the existing note-identity guard must still prevent insertion into a different note, including completion after the old editor session unmounts.

### Preview reading position

**Option B, confirmed 2026-09-16:** The first Preview of the currently open note starts at the top. Subsequent visits to Preview restore its last reading scroll position, independently of the editor's scroll position and cursor. Both manual scrolling and outline navigation update that reading position. Returning to Edit and changing the draft does not reset it; if the new rendered document is shorter, clamp the saved offset to the available scroll range. This is scroll-offset restoration, not semantic anchoring to a paragraph after edits.

The reading position lives only in memory for the currently open note. Switching away from that note or reloading the page clears it, so the next first Preview starts at the top. No database or browser-storage persistence and no automatic jump to the editor's current section are required.

`EditorCanvas` retains the preview scroll offset across `MarkdownPreview` mounts and resets it on note changes. `MarkdownPreview` reports scroll changes and restores the supplied offset after rendering and layout; image loading must not cause a premature clamp to discard a restorable position. Preview remains responsible for its own DOM and scrolling, while `EditorCanvas` holds the per-note-open value.

## Inline code editing and approved colors

**Confirmed 2026-09-16:** In Edit, show inline-code backtick delimiters when the cursor is inside the code span or a selection intersects it; hide them otherwise. This is a display-only change: stored Markdown, clipboard source text, exports, and undo history retain the delimiters. Reveal both delimiters so the user can edit the complete syntax. Recognize actual parsed inline-code spans, including multi-backtick delimiters; do not hide literal backticks inside code content or extend this behavior to fenced-code blocks. Preview renders inline code without its Markdown delimiters.

The user approved the shared [color guidelines](2026-09-16-markdown-color-guidelines.md) on 2026-09-16: **Content is neutral, structure is indigo, literals are amber.** They are binding for editor and preview, including exact tokens, contrast checks, and acceptance cases. Body/list prose uses `#D4D4D8`; headings use `#F4F4F5`; only list markers use indigo. Inline and block code share `md.code-text = #FCD34D`. Keep `md.secondary` and `md.syntax` separate even though both start at `#A1A1AA`. Assess the brightness of large code blocks after implementation rather than preemptively splitting code colors. The implementation scope includes editor decorations and theme changes as well as preview work; revise the plan before execution.

## `Note.mode`: frozen, not removed

`EditorCanvas`'s `triggerSave()` already does `const mode = updates.mode ?? note.mode;` — it never needs a caller to supply `mode` explicitly. Removing `handleSwitchMode()` and its two toggle buttons is sufficient to freeze the field: every save simply carries the note's existing `mode` forward unchanged. No changes needed to `schema.prisma`, `types.ts`, API routes, or `serialize.ts`. `NoteMode` stays defined; a future migration (if ever needed) is a separate, independently-scoped change.

## State: `previewMode`

Ephemeral local state in `EditorCanvas`, reset alongside the existing note-sync effect (the one guarded by `syncedNoteIdRef`) — not lifted to `page.tsx`, since it's UI state of *the currently open note's editor*, not app-level state:

```ts
const [previewMode, setPreviewMode] = useState(false);

useEffect(() => {
  if (syncedNoteIdRef.current === note.id) return;
  syncedNoteIdRef.current = note.id;
  setContent(note.content);
  contentRef.current = note.content;
  setLocalTitle(note.title);
  setSaveState('IDLE');
  setPreviewMode(false); // always open a note in Edit
  ...
}, [note.id, note.title, note.content, autoFocus, onAutoFocusHandled]);
```

## Component architecture

```
EditorCanvas
├── Header
│   └── Preview/Edit toggle button (replaces the old mode-switch button)
├── RichToolbar          ← rendered only when !previewMode
└── body
    ├── MarkdownEditor    ← always mounted for the current note; hidden in Preview
    └── MarkdownPreview   ← previewMode
        ├── MarkdownOutline
        └── rendered HTML body
```

`EditorCanvas` changes:
- Delete the `<textarea>` branch, `textareaRef`, the auto-resize effect, the PLAIN paste-image handler branch, and every `note.mode === NoteMode.PLAIN/RICH` conditional except the ones needed to freeze `mode` on save.
- Delete `handleSwitchMode` and both mode-switch buttons (mobile + desktop). Replace with a Preview/Edit toggle (`Eye`/`Pencil` icons from `lucide-react`) that flips local `previewMode` — no `persistChange` call, since this is not saved state.
- `RichToolbar` render condition changes from `note.mode === NoteMode.RICH` to `!previewMode`.
- Editor body keeps `<MarkdownEditor>` mounted in a stable position with the current note's key. Its wrapper is hidden in Preview; `<MarkdownPreview>` is shown alongside it only in Preview, receiving current `content`, the saved preview scroll offset, and a scroll-position callback. Toggling must not replace or re-key the editor or its scroll container.
- Footer badge that currently shows `{note.mode}` switches to reflect `previewMode` (`EDIT` / `PREVIEW`) purely as a display label — word/char counts are unaffected (already computed from `content` via `markdownToPlainText`, independent of view).

`EditorCanvas` does **not** know about HTML, headings, slugs, or GFM — it controls visibility and editing-position restoration, and passes `content` through. `MarkdownPreview` owns parsing:

```ts
// MarkdownPreview.tsx
const { html, headings } = useMemo(() => renderMarkdown(content), [content]);
```

### `MarkdownPreview.tsx` (new)

```ts
interface MarkdownPreviewProps {
  content: string;
  initialScrollTop: number;
  onScrollPositionChange: (scrollTop: number) => void;
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

`CSS.escape` handles selector-syntax edge cases in generated IDs, including Unicode characters and IDs that begin with a digit. Scope the query to this note's preview container.

## Rendering pipeline (`src/lib/markdown/render-html.ts`, new)

`@lezer/markdown` is already resolved in the lockfile as a transitive dependency of `@codemirror/lang-markdown` (`@lezer/markdown@1.7.2`). It gets promoted to a direct `dependencies` entry at that same pinned version — no new package is actually installed, just a direct declaration of what's already there.

**GFM is required, not optional.** `terminal-table.ts`'s paste handler already converts pasted tables into real GFM pipe-table Markdown (`| a | b |` / `| --- | --- |`) — that's what gets persisted to `content`. Without the GFM extension, Preview would parse that canonical stored Markdown as plain paragraph pipe-text instead of a table. (`MarkdownEditor.tsx` calls `markdown()` with no config, so Edit currently runs on `commonmarkLanguage` — CommonMark only, no GFM — not the GFM-enabled `markdownLanguage` CodeMirror also ships. Changing Edit's parser configuration remains out of scope. That file is now in scope for inline-code decorations and editor lifecycle integration, which do not require adding GFM/Subscript/Superscript/Emoji parsing behavior.)

```ts
import { parser, GFM } from '@lezer/markdown';
const markdownParser = parser.configure(GFM);
```

### Traversal contract

The Lezer tree is a **structural recognizer**, not a ready-made HTML AST, and it is **gap-based**: there is no `Text` node type in `@lezer/markdown`'s node set. Plain text is never a child node — it's whatever lies *between* a node's children (and between a node's start and its first child, and its last child and its end) that isn't covered by any child. For `Hello **world**`, the tree is `Paragraph > Emphasis > (EmphasisMark, EmphasisMark)`, and `Hello ` is not a node at all — it's the source range from `Paragraph.from` to `Emphasis.from` that no child covers.

So every renderer for a container node (`Paragraph`, `Emphasis`, `StrongEmphasis`, `Blockquote`, headings, list items, table cells, etc.) must walk its children in order and **emit the escaped source gap before each child, and after the last child**, not just recurse into children:

```ts
function renderChildren(node: SyntaxNode, source: string): string {
  let out = '';
  let pos = node.from;
  let child = node.firstChild;
  while (child) {
    out += escapeHtml(source.slice(pos, child.from)); // the gap
    out += renderNode(child, source);                  // the child itself
    pos = child.to;
    child = child.nextSibling;
  }
  out += escapeHtml(source.slice(pos, node.to)); // trailing gap
  return out;
}
```

Marker-node renderers (see below) return `''`, so their range is skipped by the child render call but *not* double-counted as a gap (the gap logic only ever looks at the space *between* `pos` and the next child's `.from`, never inside a child's own range).

The rest of the contract:

- **Semantic nodes get an explicit renderer** using the gap-aware `renderChildren` above: `Document` (transparent — render its children/gaps directly, no wrapper element), `Paragraph`, `ATXHeading1`–`ATXHeading6`, `SetextHeading1`/`SetextHeading2`, `Blockquote`, `BulletList`, `OrderedList`, `ListItem`, `Task`, `FencedCode`, `CodeBlock`, `Table`, `TableHeader`, `TableRow`, `TableCell`, `HorizontalRule`, `Emphasis`, `StrongEmphasis`, `Strikethrough`, `InlineCode`, `Link`, `Image`, `Autolink`, `LinkReference`, `HardBreak`, `Escape`, `Entity`. (`Task` is the actual emitted node for a GFM task-list item — `TaskList` is only the name of the parser *extension* object in `@lezer/markdown`'s exports, not a node type that appears in the tree; task items live inside an ordinary `BulletList`.)
- **Syntax marker nodes always render as `''`** (never their source, never a gap-eligible child): `HeaderMark`, `EmphasisMark`, `StrikethroughMark`, `CodeMark`, `CodeInfo`, `LinkMark`, `LinkLabel`, `LinkTitle`, `ListMark`, `QuoteMark`, `TableDelimiter`, `TaskMarker` (its only use is reading checked/unchecked state before returning `''`).
- **`URL` rendering depends on the parent** — inside `Link`/`Image`/`Autolink`, the parent's specialized renderer consumes the destination; the child contributes no duplicate HTML. A standalone GFM URL remains escaped visible text. For semantic text extraction, an `Autolink` URL is its visible label and must be kept; only destination data inside `Link`/`Image` is excluded.
- **`Escape` and `Entity` need semantic decoding, not a source slice**: `\*` must render as `*`, `&amp;` must render as `&` — render their *decoded* character(s), escaped for HTML, not their literal source text (which would print the backslash or re-emit the raw entity spelling).
- **`HTMLBlock` and `HTMLTag`** are always rendered as escaped plain text of their own source range — raw HTML from note content is never passed through, regardless of how well-formed it looks.
- Numeric entities must not crash Preview: replace zero, surrogate values and out-of-range values with U+FFFD rather than passing them to `String.fromCodePoint`. The renderer uses a curated named-entity map; unknown names remain escaped literal source.
- **Any other/unknown node type** falls back to `escapeHtml(source.slice(node.from, node.to))` — escaped plain text of its full range. This is the fail-closed default: an unhandled node degrades to visible text, never to unescaped output. (This must never be `tree.topNode`'s own fallback — `Document` is explicitly handled above specifically so the whole document doesn't hit this branch.)

### `extractText(node)`: semantic text, not source slice

Heading outline labels and slugs must reflect *visible* text, not raw Markdown source. `## Using **CodeMirror** with [Markdown](...)` must produce the outline label `Using CodeMirror with Markdown`, not the literal source with `**`/`[]()` still in it.

`extractText(node)` uses the same gap-aware walk as the HTML renderer — source gaps contribute their literal text, marker children contribute nothing, `Escape`/`Entity` children contribute their decoded character, other semantic children recurse — so heading text and rendered heading HTML content share one traversal contract instead of two parallel implementations that can drift.

### Headings → outline

For each `ATXHeading1`–`6` / `SetextHeading1`/`2` encountered during the single tree traversal:

```ts
interface Heading {
  level: 1 | 2 | 3 | 4 | 5 | 6;
  text: string; // from extractText()
  id: string;   // slug of text, deduped
}
```

Slug must handle non-Latin headings (Chinese, Japanese, etc. are ordinary note content here) — restricting to `[a-z0-9]` would collapse `# 架构设计` and `# 预览模式` to `id=""` and `id="-2"`, producing an invalid `<h1 id="">` anchor and a broken `#` selector at click time. Since the id is written through `escapeAttribute()` on the way into the HTML and read back through `CSS.escape()` on the way into `querySelector` (see `MarkdownOutline.tsx` above), there's no reason to restrict the character set to ASCII — both call sites already handle arbitrary characters safely:

```ts
text
  .toLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, '-') // keep Unicode letters/numbers, everything else is a separator
  .replace(/^-+|-+$/g, '');         // trim leading/trailing '-'
```

`架构设计` → `架构设计`, `Hello 世界` → `hello-世界`. If a heading has no letters or numbers at all (e.g. `# !!!`), the result is empty — fall back to the literal string `section` in that case, before dedup. Collisions within one document (including the empty-heading fallback) get a numeric suffix: `test`, `test-2`, `test-3` / `架构设计`, `架构设计-2` / `section`, `section-2`. The same `id` is written as the `id` attribute on the corresponding `<h1>`–`<h6>` in the rendered HTML, so outline clicks and in-page anchors share the identical id space.

Reserve every emitted heading ID, including generated suffixes. For `# Test`, `# Test`, `# Test-2`, IDs must be `test`, `test-2`, `test-2-2`; for `# Test-2`, `# Test`, `# Test`, IDs must be `test-2`, `test`, `test-3`. Distinct outline entries must never share an anchor.

Ordered lists preserve the first source item's number with an HTML `start` attribute when it differs from 1, including a start of 0.

`renderMarkdown(content)` returns `{ html, headings }` from one parse + one traversal — `MarkdownPreview` is the only caller.

### Security boundary

There is no HTML sanitizer anywhere in this codebase (by design — pasted HTML has always been ignored, so this has never come up). Introducing `dangerouslySetInnerHTML` for the first time means the renderer itself *is* the sanitizer, and "escape the leaf text nodes" alone is not sufficient — link/image danger lives in attribute values (`href`/`src`), not in text content. The full boundary:

| Content class | Rule |
|---|---|
| Text content (paragraph/emphasis/heading text, etc.) | `escapeHtml()` — `&<>` entity-escaped; quotes are safe in text content |
| HTML attribute values | `escapeAttribute()` — additionally escape both quote characters, applied wherever a value is interpolated into `attr="..."` |
| `<a href>` | Scheme allowlist: `http:`, `https:`, `mailto:`, or scheme-less (relative path / `#fragment`). Anything else (`javascript:`, `vbscript:`, `data:`, unknown schemes) → **do not emit an `<a>` tag at all**; render the link's inner text as plain escaped text instead. |
| `<img src>` | Scheme allowlist: `http:`, `https:`, `data:image/png`, `data:image/jpeg`, `data:image/webp`, `data:image/gif`. Anything else → **do not emit an `<img>` tag**; render the alt text as plain escaped text instead. |
| `HTMLBlock` / `HTMLTag` | Always escaped source text, never interpreted as markup. |
| Unrecognized node types | Escaped source-range text (fail-closed default from the traversal contract above). |

The `data:image/*` allowlist exists specifically because pasted images are a real, exercised feature: `EditorCanvas.handlePasteImage` → `resizeImageToDataURL` → `canvas.toDataURL('image/webp', 0.85)` produces `![filename](data:image/webp;base64,...)`, and Preview must render that image, not strip it.

Scheme parsing: extract the substring before the first `:` (case-insensitive), trim, compare against the allowlist; a URL with no `:` before the first `/` (relative/fragment) is allowed through unchanged.

## Layout & styling

Rendered Markdown elements (`h1`–`h6`, `p`, `code`, `pre`, `blockquote`, `ul`/`ol`/`li`, `table`/`th`/`td`, `a`, `img`, `hr`, `del`, `strong`, `em`) get a small hand-written `.md-preview` CSS block in `globals.css`, using the approved zinc/indigo/amber semantic tokens in [the color guidelines](2026-09-16-markdown-color-guidelines.md). CodeMirror and Preview must share their color source; the old purple code and indigo heading colors are superseded. No `@tailwindcss/typography` or other new styling dependency is added. Code containers, spacing, list indentation, and link underlines provide structural cues alongside color.

## Testing

`src/lib/markdown/render-html.test.ts`:
- Headings → outline: levels, dedup suffixing (`# Test` × 3 → `test`, `test-2`, `test-3`).
- Non-Latin heading slugs: `# 架构设计` × 2 → `{ text: '架构设计', id: '架构设计' }`, `{ text: '架构设计', id: '架构设计-2' }` (pins the Unicode-preserving slugger, not an ASCII-only one that would collapse both to `id=""`).
- Heading with inline formatting: `# Hello **world**` and `# Hello world` in the same doc → outline text `Hello world` for both, slugs `hello-world` / `hello-world-2` (pins the semantic-text rule from `extractText`).
- XSS: `<script>alert(1)</script>` in a paragraph renders as escaped text, never executes.
- Raw HTML block passthrough attempt renders as escaped text.
- `[click](javascript:alert(1))` → no `href` attribute containing `javascript:` anywhere in output (asserts the link degrades to plain text).
- GFM table (the exact shape `terminal-table.ts` produces) renders as a `<table>` with the right cell contents.
- Fenced code block: content escaped, no highlighting markup, wrapped in `<pre><code>`.
- Pasted image contract: `![paste](data:image/webp;base64,AAAA)` renders an `<img>` with that `src` preserved (positive case matching the allowlist, paired with the negative `data:` cases already covered by the scheme table).

Manual check after implementation: paste a terminal table and a screenshot into a note, confirm both render correctly in Preview; confirm Edit ⇄ Preview toggle and RichToolbar visibility behave correctly on phone/tablet/desktop widths.

Browser acceptance checks for the writing session:
- Type a distinctive change and immediately open Preview, before the autosave debounce fires: Preview shows the latest draft, and saving still completes.
- In a long note, select text away from the top and record the editor's scroll position. Open Preview, scroll elsewhere or follow an outline entry, then return to Edit: the selection and editing scroll position are preserved. Repeat the round-trip.
- First Preview starts at the top. Scroll down, return to Edit, and reopen Preview: restore the last preview scroll offset. Repeat after navigating with the outline and with images above the saved position; preview and editing offsets remain independent.
- Edit the draft between preview visits: the latest content renders and the saved preview offset is restored, clamped to the new maximum if the note became shorter.
- Switch away and reopen the note, or reload the page: it opens in Edit and its next Preview starts at the top.
- Undo an edit made before entering Preview, then redo it: both operations still work after returning to Edit.
- Keyboard navigation in Preview cannot enter the hidden editor. Returning to Edit exposes the retained editor normally.
- Switch to another note while previewing: it opens in Edit, with its own content and no selection or undo history inherited from the previous note.
- Start an image paste, then open Preview before resizing completes: the image appears in the same note's preview and remains present on return to Edit.
- Run the color guidelines' acceptance cases in both views, including marker-only list coloring, code inside links/lists, selection over search matches, and a 30-line code block for visual assessment of the shared amber token.

## Files touched

1. `src/lib/markdown/render-html.ts` — new. `renderMarkdown(content): { html, headings }`, `escapeHtml`, `escapeAttribute`, URL scheme checks, slugger, `extractText`.
2. `src/lib/markdown/render-html.test.ts` — new.
3. `src/components/editor/MarkdownPreview.tsx` — new.
4. `src/components/editor/MarkdownOutline.tsx` — new.
5. `src/components/editor/EditorCanvas.tsx` — remove PLAIN branch, mode-switch UI/handler; add `previewMode` state + toggle; retain the editor while previewing and restore editing scroll position.
6. `src/app/globals.css` — add `.md-preview` styles.
7. `package.json` — promote `@lezer/markdown` from transitive to direct dependency (pinned `1.7.2`, matching the already-resolved lockfile version).
8. `src/components/editor/MarkdownEditor.tsx` — integrate display-only inline-code decorations and any visibility/measurement handling needed to preserve editor state.
9. `src/components/editor/markdown-theme.ts` — adopt the shared semantic colors, marker-only list coloring, code containers, and selection/search precedence.
10. `src/app/page.tsx` — key the `EditorCanvas` session by note ID so note changes reset local state before creating the editor.
11. `e2e/notes.spec.ts` — migrate existing textarea/mode-switch scenarios to the single Markdown editor and Edit/Preview flow; add focused browser coverage for the new behaviors.

The revised implementation plan must also locate the shared token source and focused decoration tests before dispatching tasks.
