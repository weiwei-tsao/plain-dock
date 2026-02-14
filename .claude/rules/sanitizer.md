# HTML Sanitization Pipeline Rules

## Overview

The sanitizer runs client-side in the browser (uses `DOMParser`). It processes pasted HTML through a strict 3-layer pipeline before inserting into the Tiptap editor.

Located in `src/lib/sanitizer/`.

## 3-Layer Pipeline (strict order)

### Layer 1: Security Defense
- Strips dangerous elements defined in `config.ts` → `DANGEROUS_TAGS`.
- Currently: `script`, `style`, `iframe`, `object`, `meta`.
- All child content of these elements is removed entirely.

### Layer 2: Consistency Normalization
- Maps non-semantic tags to semantic equivalents via `normalize.ts` → `TAG_NORMALIZE_MAP`.
- Currently: `div` → `p`, `b` → `strong`, `i` → `em`.
- Add new mappings to `TAG_NORMALIZE_MAP` — the pipeline applies them automatically.

### Layer 3: Structure Downgrade
- Tables → tab-separated text in `<p>` tags (one `<p>` per row).
- Media (`img`, `video`) → `[TAG: src]` text placeholders.

## Final Cleanup

- Only tags in `ALLOWED_TAGS` survive — all others are flattened (children kept, wrapper removed).
- Only styles in `ALLOWED_STYLES` are preserved (`color`, `background-color`, `text-decoration`).
- Anchor `href` must start with `http` or `mailto`; `target="_blank"` and `rel="noopener noreferrer"` are enforced.

## Extending the Sanitizer

- To allow a new HTML tag: add it to `ALLOWED_TAGS` in `config.ts`.
- To allow a new CSS property: add it to `ALLOWED_STYLES` in `config.ts`.
- To block a new dangerous tag: add it to `DANGEROUS_TAGS` in `config.ts`.
- To add a tag normalization: add an entry to `TAG_NORMALIZE_MAP` in `normalize.ts`.

## Utility Functions

- `sanitizeHTML(rawHTML)` — full pipeline, returns sanitized HTML string.
- `wrapPlainText(text)` — converts plain text to HTML: `\n\n` → new `<p>`, `\n` → `<br>`. Normalizes `\r\n` to `\n`.
- `getNoteTextContent(html)` — strips all HTML, returns plain text content.
