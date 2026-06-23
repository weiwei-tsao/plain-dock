# Mobile UX — Responsive Design Plan

## Overview

PlainDock's original layout is desktop-only — a fixed side-by-side split with no responsive breakpoints. This document captures the analysis, implementation plan, and trade-offs for adding a 3-tier responsive design.

## Breakpoints

| Tier    | Tailwind prefix | Width range  |
|---------|-----------------|--------------|
| Phone   | default         | < 768px      |
| Tablet  | `md:`           | 768px–1023px |
| Desktop | `lg:`           | 1024px+      |

Uses Tailwind CSS v4 defaults — no custom breakpoints needed.

## Current State (Pre-implementation)

- No `tailwind.config.ts` — Tailwind v4 via PostCSS plugin only
- No centralized theme or CSS variables; colors are scattered as inline Tailwind classes and hardcoded hex values in `globals.css`
- No responsive breakpoints anywhere in the codebase
- Sidebar is `w-80` (320px) fixed width — occupies most of the screen on phones
- Editor header is a single flex row with 6+ controls — overflows on narrow screens
- RichToolbar buttons are `p-1.5` (~28px) — below the 44px minimum touch target
- Footer shows full note UUID — causes overflow on phone

## Layout per Breakpoint

### Phone (< 768px)
- Stacked navigation: only one panel visible at a time (sidebar list OR editor)
- Sidebar is full-screen when in list view
- `← Notes` back button injected into editor header
- No sidebar collapse toggle (navigation handled by back button)

### Tablet (768px–1023px)
- Side-by-side layout retained
- Sidebar narrower: `w-56` (224px) instead of `w-80`
- Sidebar collapse toggle visible and functional
- Editor header simplified but single-row

### Desktop (1024px+)
- Current layout unchanged
- Sidebar: `w-80`
- Full editor header with all controls visible

## Implementation Plan

### Execution order

1. `RichToolbar.tsx` — self-contained, no prop changes
2. `Sidebar.tsx` — responsive classes only, prop interface unchanged
3. `page.tsx` — adds `mobileView` state and wires `onBack`
4. `EditorCanvas.tsx` — most complex, depends on `onBack` prop from page.tsx

### `RichToolbar.tsx`
- Wrap button row in `overflow-x-auto` on phone, `flex-wrap` on tablet+
- Button padding: `p-2.5 md:p-1.5` to meet 44px tap target on phone
- `flex-nowrap` on phone for single scrollable row

### `Sidebar.tsx`
- Width: `w-full md:w-56 lg:w-80`
- Note items: `p-4 md:p-3`
- Collapse toggle: `hidden md:flex`
- Search placeholder: `Search...` on all breakpoints (remove desktop-only `Cmd + /` hint)

### `page.tsx`
- Add `mobileView: 'list' | 'editor'` state
- On phone: render sidebar OR editor based on `mobileView`; tablet/desktop always show both
- `handleSelectNote` on phone also calls `setMobileView('editor')`
- Pass `onBack={() => setMobileView('list')}` to `EditorCanvas`

### `EditorCanvas.tsx`
- Accept optional `onBack?: () => void` prop
- Phone header: two rows — `[← Notes] [title]` / `[save indicator] [pin] [mode-icon] [⋯]`
- Tablet/desktop header: unchanged single row
- `⋯` menu (phone only): dropdown with Copy Plain, Copy HTML (RICH mode only), Delete — controlled by `useState` boolean
- Save state label: `hidden md:inline` — icon only on phone
- Mode button: icon only on phone, icon + label on tablet/desktop
- Footer: `hidden md:flex`

## Trade-offs

### JS state for phone navigation vs CSS-only

**Chosen:** JS state (`mobileView: 'list' | 'editor'`).

CSS-only (`hidden md:block` on both panels) would be simpler, but you can't inject a back button into the editor header without JS knowing the active view. JS state also enables slide/transition animations later.

**Downside:** Extra re-render on note selection on phone.

---

### `⋯` overflow menu vs bottom sheet

**Chosen:** Dropdown positioned below the button.

Matches existing codebase patterns and requires one `useState`. A bottom sheet would feel more native on iOS/Android but needs a drawer/modal primitive the project doesn't have.

---

### Two-row editor header on phone

**Chosen:** Two rows (title row + actions row).

Costs ~56px vertical space but keeps the title readable. A single-row alternative with a truncated title saves space but makes long titles unreadable — a poor trade for a notes app where the title is prominent.

---

### Horizontal scroll for RichToolbar on phone

**Chosen:** Single scrollable row with `overflow-x-auto`.

Keeps all formatting options accessible without stealing editor space. The alternative — showing only B/I/U with a "+more" toggle — is more discoverable but adds a new UI pattern not used elsewhere. Horizontal scroll is pragmatic; power users will find it.

---

### Sidebar collapse toggle state on phone

**Chosen:** Ignore `isOpen` on phone via CSS.

The existing `isOpen` / `onToggle` state from `page.tsx` drives the sidebar collapse on tablet/desktop. On phone, the sidebar is always full-screen when `mobileView === 'list'`, so `isOpen` is irrelevant. Rather than adding a separate mobile-open state, the sidebar width is `w-full` below `md` regardless of `isOpen`.

**Risk:** If `isOpen` is `false` and the user resizes from desktop to phone, the sidebar would still appear because `w-full` overrides `w-0`. This is the correct behavior.

---

## Notes on Theme / Design Tokens

The project has no centralized theme. Tailwind v4 supports a `@theme` block in `globals.css` to define CSS custom properties as design tokens — this would centralize color and spacing values currently scattered across components. This is a separate refactor from the mobile work and was not in scope here.
