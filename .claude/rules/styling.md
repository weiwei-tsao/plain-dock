# Design System, Theme & Tailwind Conventions

## Tailwind Setup

- Tailwind CSS v4 via PostCSS plugin (`@tailwindcss/postcss`) — not CDN, not `tailwind.config`.
- Imported as `@import "tailwindcss"` in `src/app/globals.css`.
- Custom styles (scrollbar, ProseMirror/Tiptap) also live in `globals.css`.

## Color Palette (Dark Theme Only)

No light mode — dark theme throughout.

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
- PLAIN mode editor: `font-mono text-sm text-zinc-400 leading-relaxed`
- Note titles: `text-xl font-medium text-zinc-100`

## Tiptap / ProseMirror Styles

- All ProseMirror styles live in `src/app/globals.css` — not inline or in component files.
- Editor content area uses `prose prose-invert max-w-none` Tailwind typography classes.
- Inline code: `#a78bfa` (purple) on `#1a1a1a` background.
- Code blocks: `#0f0f0f` background, monospace.
- Blockquotes: `border-left: 3px solid #3f3f46`, italic, `#a1a1aa` text.
