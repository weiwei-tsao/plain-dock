# Component Organization & Reusable Patterns

## Directory Structure

- Components live in `src/components/{feature}/` grouped by feature area:
  - `editor/` — EditorCanvas, RichToolbar
  - `sidebar/` — Sidebar
- If a UI primitive is used within a single feature, keep it in that feature's file (e.g. `ToolbarButton`, `Divider` in `RichToolbar.tsx`).
- If a primitive is reused across 2+ feature folders, promote it to `src/components/ui/`.

## Component Conventions

- All components use the `'use client'` directive.
- Type components with `React.FC<Props>` and define an explicit `interface` for props.
- Use `import type` for type-only imports (enforced by ESLint `consistent-type-imports` rule).
- Icons: import individually from `lucide-react` — never import the entire package.

## State Patterns

- Page-level state (note list, active note, search query) lives in `src/app/page.tsx` and is passed down as props.
- Component-local UI state (save status, local title input) stays in the component.
- No global state library — props and local state only.

## Auto-Save Pattern (EditorCanvas)

- 1-second debounce via `setTimeout` ref (`saveTimeoutRef`).
- Sequential request queue (`requestQueue` ref) chains `.then()` to prevent concurrent writes racing.
- Save state indicator: `IDLE` → `SAVING` → `SAVED` (2s) → `IDLE`, or `FAILED` on error.
- `triggerSave()` for debounced saves (typing); `persistChange()` for immediate saves (pin, mode switch).

## Note Content Loading

- The sidebar list uses lightweight note objects (no `content` field).
- Full note content is fetched on selection via `noteApi.get(id)` — stored in separate `activeNote` state.
