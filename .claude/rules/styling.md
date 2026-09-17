# Design System, Theme & Tailwind Conventions

## Tailwind Setup

- Tailwind CSS v4 via PostCSS plugin (`@tailwindcss/postcss`) — not CDN, not `tailwind.config`.
- Imported as `@import "tailwindcss"` in `src/app/globals.css`.
- Custom styles (scrollbar) also live in `globals.css`. CodeMirror editor styles do not — see below.

## Color Palette (Dark Theme Only)

No light mode — dark theme throughout.

The table below governs application chrome. Markdown content follows the approved [Markdown color contract](../../docs/superpowers/specs/2026-09-16-markdown-color-guidelines.md): **Content is neutral, structure is indigo, literals are amber.** That contract supersedes the former purple code and indigo heading styling; runtime adoption is part of the Markdown Preview work.

| Role | Colors |
|------|--------|
| Background | `black`, `zinc-900`, `zinc-900/30`, `zinc-900/50` |
| Borders | `zinc-800`, `zinc-900` |
| Primary text | `zinc-100`, `white` |
| Secondary text | `zinc-400`, `zinc-500` |
| Muted/label text | `zinc-600`, `zinc-700` |
| Accent (active, brand) | `indigo-400`, `indigo-500`, `indigo-600` |
| Success | `green-500` |
| Error/destructive | `red-400`, `red-500` |

## Common UI Patterns

### Buttons
- Icon button: `p-2 rounded-lg transition-colors hover:bg-zinc-800`
- Active/toggle: accent bg at 10% opacity — `bg-indigo-400/10 text-indigo-400`
- Destructive hover: `hover:text-red-400 hover:bg-red-400/10`
- Primary action: `bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl`

### Inputs
- `bg-zinc-900 border border-zinc-800 rounded-md py-2 text-sm focus:outline-none focus:border-zinc-700`
- Login inputs use `rounded-xl` and `focus:ring-2 focus:ring-indigo-500`
- Error state: `border-red-500`

### Dividers
- Vertical: `w-px h-6 bg-zinc-800`
- Horizontal: `border-b border-zinc-800`

### Headers / Sticky Bars
- `bg-black/50 backdrop-blur-md sticky top-0 z-10 border-b border-zinc-800`

### Micro Labels
- `text-[10px] uppercase tracking-wider font-bold text-zinc-600`

### Cards / Panels
- `bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl`

## Typography

- Default: `font-sans`
- Markdown editor: `font-mono text-sm leading-relaxed`; body and list prose use `md.text` (`#D4D4D8`, zinc-300).
- Markdown headings: `md.heading` (`#F4F4F5`, zinc-100), with size, weight, and spacing for hierarchy — not indigo.
- Note titles: `text-xl font-medium text-zinc-100`

## CodeMirror Styles

- CodeMirror-specific selectors belong in `EditorView.theme(...)` and `HighlightStyle.define(...)` inside `src/components/editor/markdown-theme.ts`, not inline or mixed with preview selectors. Editor and preview must reference one shared semantic color source.
- Canvas: `md.canvas` (`#09090B`); body/list prose: `md.text` (`#D4D4D8`).
- List markers only: indigo `#818CF8`. Do not color whole list items through `tags.list` inheritance.
- Links: indigo `#818CF8` with underlines. Code inside a link keeps its amber text and an indigo link underline.
- Inline and block code share `md.code-text` (`#FCD34D`, amber-300) on `md.code-bg` (`#18181B`). Code blocks have continuous backgrounds, padding, borders, and rounded corners. No language-specific rainbow syntax highlighting.
- Keep `md.secondary` and `md.syntax` as distinct tokens even though both initially use `#A1A1AA`. Quotes/language labels and Markdown delimiters have different semantic roles.
- Blockquotes: `3px` left border using `md.quote-border` (`#52525B`), indentation, italic secondary text.
- Selection takes precedence over search highlighting, which takes precedence over ordinary syntax colors; use the exact foreground/background pairs from the color contract.
- Inline-code delimiters appear while the cursor/selection intersects the span and hide otherwise. This is a display-only decoration; stored Markdown and undo history stay intact. Fenced-code markers are outside this hiding behavior.
- Assess amber brightness using a 30-line code block after implementation. If adjustment is warranted, tune the shared code token and recheck contrast; do not split inline/block code into separate colors.
