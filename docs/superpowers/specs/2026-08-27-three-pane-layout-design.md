# Three-Pane macOS Notes-Style Layout

## Summary

Replace the current two-pane layout (combined Folder+Notes sidebar | Editor) with a three-pane, macOS Notes-style layout: **Folder Sidebar | Notes List | Note Editor**. Desktop panes are independently resizable and persist their widths. On narrow desktop windows the Folder Sidebar auto-collapses to a two-pane layout. On mobile, replace the current two-state (`list`/`editor`) stack with three-level navigation: **Folders → Notes List → Note Editor**, with Notes List as the default/home view.

Data model is unchanged — this is purely a layout/navigation restructure. `Folder → Note` remains the only real hierarchy; the third pane is just the detail view of the currently selected note, not a new data layer.

## Component Architecture

Split the current `src/components/sidebar/Sidebar.tsx` into three components:

### `src/components/sidebar/FolderSidebar.tsx`
Extracted from the folder section of the current `Sidebar.tsx` (lines ~186–278 and the toggle button at ~339–345). Responsibilities: render "All Notes" + folder list with counts, inline create/rename, delete with `ConfirmDialog`, error `Toast`.

```ts
interface FolderSidebarProps {
  notes: Note[];
  folders: Folder[];
  activeFolderId: string | null;
  onSelectFolder: (id: string | null) => void;
  onCreateFolder: (name: string) => Promise<void>;
  onRenameFolder: (id: string, name: string) => Promise<void>;
  onDeleteFolder: (id: string) => Promise<void>;
  // Desktop pane mode (default): renders inline with its own width + edge toggle chevron.
  // Mobile full-screen mode: renders full width with a header back button instead.
  variant: 'pane' | 'mobile-fullscreen';
  onBack?: () => void; // used only when variant === 'mobile-fullscreen'
}
```

The desktop edge toggle chevron (currently lines 340–345) moves here and only renders when `variant === 'pane'`.

### `src/components/sidebar/NotesList.tsx`
Extracted from the notes-list section of the current `Sidebar.tsx` (search input, pull-to-refresh gesture handling, note list rendering — lines ~172–184 and ~280–336). Filtering/sorting logic (`folderNotes`, `filteredNotes`) moves here unchanged.

```ts
interface NotesListProps {
  notes: Note[];
  activeFolderId: string | null;
  activeFolderName: string; // "All Notes" or the folder's name, for mobile header label
  activeNoteId: string | null;
  onSelectNote: (id: string) => void;
  onCreateNote: () => void;
  searchQuery: string;
  onSearch: (q: string) => void;
  onRefresh: () => Promise<void>;
  // Mobile only: shows a folder-nav button in the header
  onOpenFolders?: () => void;
}
```

`Sidebar.tsx` is deleted; `page.tsx` imports `FolderSidebar` and `NotesList` directly.

### `src/components/sidebar/ResizeHandle.tsx`
New. A thin (`w-1`) draggable vertical divider.

```ts
interface ResizeHandleProps {
  onResize: (deltaX: number) => void;
}
```

Implementation: `onPointerDown` captures the pointer and starting X; a `pointermove` listener (added to `window` for the drag duration, removed on `pointerup`) computes `deltaX` since the last move and calls `onResize`. No new dependency — native Pointer Events cover drag, capture, and touch uniformly.

## Desktop Layout & State

New state in `page.tsx`, replacing `isSidebarOpen`:

```ts
const [folderWidth, setFolderWidth] = useState(220);     // clamp 180–320
const [notesWidth, setNotesWidth] = useState(320);        // clamp 260–480
const [folderCollapsed, setFolderCollapsed] = useState(false); // manual toggle
```

Layout (desktop, `≥ 1024px`, three-pane):

```
<FolderSidebar variant="pane" style={{ width: folderCollapsed ? 0 : folderWidth }} />
<ResizeHandle onResize={(dx) => setFolderWidth(clamp(folderWidth + dx, 180, 320))} />
<NotesList style={{ width: notesWidth }} />
<ResizeHandle onResize={(dx) => setNotesWidth(clamp(notesWidth + dx, 260, 480))} />
<EditorCanvas className="flex-1 min-w-[420px]" />
```

When `folderCollapsed` is true, `FolderSidebar` and its adjacent `ResizeHandle` are not rendered (per spec: "collapsed state removes the sidebar entirely rather than shrinking it below its minimum width"). The Editor's `flex-1` means resizing either handle never changes total app width — the editor simply absorbs or gives up the difference.

### Narrow-desktop auto-collapse (`768px–1023px`)

A `viewportWidth < 1024` check (via a `useEffect` + `resize` listener, or `matchMedia('(min-width: 1024px)')`) forces two-pane mode: Folder Sidebar hidden by default, Notes List + Editor shown side by side at their existing widths.

The manual toggle button (rendered in `NotesList`'s header when `viewportWidth < 1024`, since `FolderSidebar`'s own edge toggle isn't visible when collapsed) still opens the Folder Sidebar — but as an **absolutely-positioned overlay** on top of the Notes List (same width as `folderWidth`, a `shadow-2xl` and a backdrop click-to-close), not as a layout column. This is the one addition beyond the literal request: without it there would be no way to switch folders on a narrow desktop window. Closing the overlay (backdrop click, selecting a folder, or the toggle button again) hides it; it never persists as "open" — `folderCollapsed`-driven overlay visibility is separate transient state (`folderOverlayOpen`), not persisted to localStorage.

## Persistence

New `src/lib/layout-storage.ts`:

```ts
interface StoredLayout {
  folderWidth: number;
  notesWidth: number;
  folderCollapsed: boolean;
}
const STORAGE_KEY = 'plaindock:layout';
function getLayout(): StoredLayout | null { /* localStorage.getItem + JSON.parse, catch → null */ }
function saveLayout(layout: StoredLayout): void { /* JSON.stringify + setItem, catch → no-op */ }
```

`page.tsx` reads this once in a mount-only `useEffect` (avoids SSR/hydration mismatch, since `localStorage` isn't available server-side) and applies any stored values, clamping them to the current min/max in case constraints change in a future release. A second `useEffect` watching `[folderWidth, notesWidth, folderCollapsed]` writes on change (no debounce needed — writes are cheap and infrequent, bounded by drag-frame rate at most).

## Mobile Navigation (`< 768px`)

Replace `mobileView: 'list' | 'editor'` with two independent pieces of state:

```ts
const [mobilePanel, setMobilePanel] = useState<'list' | 'editor'>('list'); // unchanged stacking logic
const [showFolders, setShowFolders] = useState(false); // new
```

- **Notes List is the root.** App boots into `mobilePanel: 'list'`, `showFolders: false`, showing "All Notes".
- Tapping the folder-nav button in `NotesList`'s header (rendered only on mobile, via its `onOpenFolders` prop) sets `showFolders = true`, rendering `<FolderSidebar variant="mobile-fullscreen" onBack={...} />` full-screen, replacing whatever `mobilePanel` shows.
- Selecting a folder in that screen calls `onSelectFolder(id)` (existing handler, unchanged) **and** sets `showFolders = false` — returning to Notes List, now scoped to that folder.
- Pressing back from the Folders screen sets `showFolders = false` without changing `activeFolderId`.
- Note selection/back (`handleSelectNote`, `handleBack`) are **unchanged** — they already correctly drive `mobilePanel` between `'list'` and `'editor'`.
- `showFolders` always takes visual precedence: if true, it's the only thing rendered, regardless of `mobilePanel`.

This reuses 100% of the existing note-level navigation logic (`handleSelectNote`, `handleBack`, `cleanupEmptyNote`) — only the wrapper state name changes (`mobileView` → `mobilePanel`) and one new boolean is layered on top for the Folders screen.

## Rendering Summary (`page.tsx`)

```
viewportWidth >= 1024   → FolderSidebar(pane) | handle | NotesList | handle | Editor
                           (+ FolderSidebar(pane) overlay if folderOverlayOpen, only when auto-collapsed)
768 <= viewportWidth < 1024 → NotesList | Editor  (+ overlay FolderSidebar on toggle)
viewportWidth < 768     → showFolders
                             ? FolderSidebar(mobile-fullscreen)
                             : mobilePanel === 'list' ? NotesList : Editor
```

## Error Handling & Edge Cases

- **Folder deleted while its overlay/mobile screen is open**: unaffected — deletion already updates `folders`/`notes`/`activeFolderId` in `page.tsx` (`handleDeleteFolder`); the Folder Sidebar re-renders from the same list.
- **`localStorage` unavailable or corrupted** (private browsing, quota, malformed JSON): `getLayout()` returns `null`, defaults (220/320/not collapsed) apply — same as first run.
- **Resize dragged past clamp bounds**: `clamp()` caps the value; the handle keeps tracking pointer movement but width stops changing until the pointer moves back within range (standard clamp-while-dragging behavior, no jump).
- **Window resized across the 1024px or 768px boundary while a pane is manually open/closed**: `folderCollapsed` (manual) and `folderOverlayOpen`/`showFolders` (transient) are independent of the viewport-width check, so crossing a boundary just changes which layout branch renders; no state is lost. Crossing from desktop into mobile mode while a folder overlay was open simply closes the overlay (mobile has its own `showFolders`, not shared).

## Testing

No test runner is configured project-wide (per `CLAUDE.md`); this is verified manually via the dev server:
1. Drag both resize handles to their min/max and confirm clamping.
2. Reload and confirm persisted widths + collapsed state restore.
3. Resize the browser window through 1024px and 768px, confirming the pane-count transitions and that total app width never visibly jumps.
4. On narrow desktop (768–1023px), use the toolbar toggle to open/close the folder overlay and confirm it doesn't push the editor.
5. On mobile width, walk the full stack: Notes List → Folders → select a folder → Notes List (scoped) → select a note → Editor → back → back.
