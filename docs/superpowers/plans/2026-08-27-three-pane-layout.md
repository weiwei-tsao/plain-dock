# Three-Pane macOS Notes-Style Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current two-pane (combined Folder+Notes sidebar | Editor) layout with a three-pane, macOS Notes-style layout — Folder Sidebar | Notes List | Note Editor — with independently resizable, persisted desktop panes, a narrow-desktop auto-collapse + overlay, and a new three-level mobile navigation stack (Folders → Notes List → Note Editor).

**Architecture:** Split the existing `src/components/sidebar/Sidebar.tsx` into two focused components (`FolderSidebar`, `NotesList`) plus a new reusable `ResizeHandle`. `src/app/page.tsx` gains layout state (pane widths, collapse/overlay flags, viewport tier, mobile navigation state) and renders one of three branches (mobile / tablet / desktop) built from these three components plus the existing `EditorCanvas`.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript (strict), Tailwind CSS v4, native Pointer Events for resize (no new dependency), `localStorage` for layout persistence (first use in this codebase).

**Spec:** `docs/superpowers/specs/2026-08-27-three-pane-layout-design.md`

## Global Constraints

- No test runner is configured in this repo (per `CLAUDE.md`). "Verify" steps below mean `npm run typecheck`, `npm run lint`, `npm run format:check`, and manual checks against the dev server — not automated test files.
- Path alias `@/*` maps to `./src/*` — always use `@/` imports, never relative paths.
- Every new component file starts with `'use client'`.
- Type components with `React.FC<Props>` and an explicit `interface` for props (per `.claude/rules/components.md`).
- Import icons individually from `lucide-react`, never the whole package.
- Dark theme only — reuse existing tokens (`zinc-800` borders, `zinc-900` backgrounds, `indigo-400`/`indigo-500` accents). No new custom CSS.
- Commit messages: `type(scope): description`, imperative mood, ≤ 12 words, scope `sidebar` for every task in this plan (per `.claude/rules/git.md`).
- Folder pane: default 220px, clamp 180–320px. Notes pane: default 320px, clamp 260–480px. Editor: `min-w-[420px]`, `flex-1`.
- Desktop/tablet boundary: viewport `< 1024px` (matches the existing Tailwind `lg` tier). Tablet/mobile boundary: viewport `< 768px` (matches the existing Tailwind `md` tier).
- Implementation refinement beyond the spec: the "toggle folder sidebar" control lives solely in `NotesList`'s header (one button, one `onToggleFolders` callback) rather than also living on `FolderSidebar` itself — this follows directly from the spec's "collapsed removes the sidebar entirely" rule (there's nothing on-screen to click if `FolderSidebar` itself is unmounted) and avoids two redundant toggle controls.

---

## File Structure

- **Create** `src/lib/layout-storage.ts` — width/breakpoint constants, `clamp()`, `localStorage` read/write for persisted layout.
- **Create** `src/components/sidebar/ResizeHandle.tsx` — draggable vertical divider (Pointer Events).
- **Create** `src/components/sidebar/FolderSidebar.tsx` — folder list + CRUD, extracted from `Sidebar.tsx`. Two render variants: `pane` (desktop/tablet) and `mobile-fullscreen`.
- **Create** `src/components/sidebar/NotesList.tsx` — search + pull-to-refresh + note list, extracted from `Sidebar.tsx`. Owns the single folder-toggle button.
- **Modify** `src/app/page.tsx` — full rewrite of the layout state and render tree; wires the three components above plus `EditorCanvas`.
- **Delete** `src/components/sidebar/Sidebar.tsx` — superseded by `FolderSidebar` + `NotesList`.

---

### Task 1: Layout constants & persistence utility

**Files:**
- Create: `src/lib/layout-storage.ts`

**Interfaces:**
- Produces: `FOLDER_WIDTH_MIN/MAX/DEFAULT`, `NOTES_WIDTH_MIN/MAX/DEFAULT` (numbers), `clamp(value: number, min: number, max: number): number`, `getLayout(): StoredLayout | null`, `saveLayout(layout: StoredLayout): void`, where `StoredLayout = { folderWidth: number; notesWidth: number; folderCollapsed: boolean }`.

- [ ] **Step 1: Write the file**

```ts
// src/lib/layout-storage.ts

export const FOLDER_WIDTH_MIN = 180;
export const FOLDER_WIDTH_MAX = 320;
export const FOLDER_WIDTH_DEFAULT = 220;

export const NOTES_WIDTH_MIN = 260;
export const NOTES_WIDTH_MAX = 480;
export const NOTES_WIDTH_DEFAULT = 320;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export interface StoredLayout {
  folderWidth: number;
  notesWidth: number;
  folderCollapsed: boolean;
}

const STORAGE_KEY = 'plaindock:layout';

export function getLayout(): StoredLayout | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      typeof parsed.folderWidth !== 'number' ||
      typeof parsed.notesWidth !== 'number' ||
      typeof parsed.folderCollapsed !== 'boolean'
    ) {
      return null;
    }
    return {
      folderWidth: clamp(parsed.folderWidth, FOLDER_WIDTH_MIN, FOLDER_WIDTH_MAX),
      notesWidth: clamp(parsed.notesWidth, NOTES_WIDTH_MIN, NOTES_WIDTH_MAX),
      folderCollapsed: parsed.folderCollapsed,
    };
  } catch {
    return null;
  }
}

export function saveLayout(layout: StoredLayout): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
  } catch {
    // quota exceeded, private browsing, etc. — layout just won't persist
  }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run typecheck`
Expected: no errors. (No standalone runtime check here — this module has no automated test runner to exercise it against, and `getLayout`/`saveLayout` touch `localStorage`, which only exists in the browser. Functional verification happens in Task 5 once `page.tsx` calls these in the running app.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/layout-storage.ts
git commit -m "feat(sidebar): add resizable-pane layout persistence utility"
```

---

### Task 2: ResizeHandle component

**Files:**
- Create: `src/components/sidebar/ResizeHandle.tsx`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `ResizeHandle` (default export), `interface ResizeHandleProps { onResize: (deltaX: number) => void }`.

- [ ] **Step 1: Write the file**

```tsx
'use client';

import React, { useCallback, useRef } from 'react';

interface ResizeHandleProps {
  onResize: (deltaX: number) => void;
}

const ResizeHandle: React.FC<ResizeHandleProps> = ({ onResize }) => {
  const lastX = useRef(0);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      lastX.current = e.clientX;
      e.currentTarget.setPointerCapture(e.pointerId);

      const handleMove = (moveEvent: PointerEvent) => {
        const delta = moveEvent.clientX - lastX.current;
        lastX.current = moveEvent.clientX;
        onResize(delta);
      };

      const handleUp = () => {
        window.removeEventListener('pointermove', handleMove);
        window.removeEventListener('pointerup', handleUp);
      };

      window.addEventListener('pointermove', handleMove);
      window.addEventListener('pointerup', handleUp);
    },
    [onResize],
  );

  return (
    <div
      onPointerDown={handlePointerDown}
      className="w-1 shrink-0 cursor-col-resize bg-zinc-800 transition-colors hover:bg-indigo-500/40 active:bg-indigo-500/60"
      role="separator"
      aria-orientation="vertical"
    />
  );
};

export default ResizeHandle;
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run typecheck`
Expected: no errors. Functional drag behavior is verified in Task 5 once it's wired into `page.tsx` and can be dragged in a browser.

- [ ] **Step 3: Commit**

```bash
git add src/components/sidebar/ResizeHandle.tsx
git commit -m "feat(sidebar): add draggable pane resize handle"
```

---

### Task 3: FolderSidebar component

**Files:**
- Create: `src/components/sidebar/FolderSidebar.tsx`
- Reference (for extraction, do not modify yet): `src/components/sidebar/Sidebar.tsx`

**Interfaces:**
- Consumes: `Folder`, `Note` from `@/types`; `ConfirmDialog` from `@/components/ui/ConfirmDialog`; `Toast` from `@/components/ui/Toast`; `PlainDockIcon` from `@/components/ui/PlainDockIcon`.
- Produces: `FolderSidebar` (default export), `interface FolderSidebarProps` with `notes: Note[]`, `folders: Folder[]`, `activeFolderId: string | null`, `onSelectFolder: (id: string | null) => void`, `onCreateFolder: (name: string) => Promise<void>`, `onRenameFolder: (id: string, name: string) => Promise<void>`, `onDeleteFolder: (id: string) => Promise<void>`, `variant: 'pane' | 'mobile-fullscreen'`, `onBack?: () => void`.

- [ ] **Step 1: Write the file**

```tsx
'use client';

import React, { useState } from 'react';
import type { Folder, Note } from '@/types';
import { ChevronLeft, Folder as FolderIcon, FolderPlus, Pencil, Trash2 } from 'lucide-react';
import PlainDockIcon from '@/components/ui/PlainDockIcon';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import Toast from '@/components/ui/Toast';

interface FolderSidebarProps {
  notes: Note[];
  folders: Folder[];
  activeFolderId: string | null;
  onSelectFolder: (id: string | null) => void;
  onCreateFolder: (name: string) => Promise<void>;
  onRenameFolder: (id: string, name: string) => Promise<void>;
  onDeleteFolder: (id: string) => Promise<void>;
  variant: 'pane' | 'mobile-fullscreen';
  onBack?: () => void;
}

const FolderSidebar: React.FC<FolderSidebarProps> = ({
  notes,
  folders,
  activeFolderId,
  onSelectFolder,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  variant,
  onBack,
}) => {
  const [isAddingFolder, setIsAddingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Folder | null>(null);
  const [errorToast, setErrorToast] = useState<string | null>(null);

  const submitNewFolder = async () => {
    const name = newFolderName.trim();
    setIsAddingFolder(false);
    setNewFolderName('');
    if (!name) return;
    try {
      await onCreateFolder(name);
    } catch {
      setErrorToast('Failed to create folder');
      setIsAddingFolder(true);
      setNewFolderName(name);
    }
  };

  const submitRename = async () => {
    const id = editingFolderId;
    const name = editingName.trim();
    setEditingFolderId(null);
    if (!id || !name) return;
    try {
      await onRenameFolder(id, name);
    } catch {
      setErrorToast('Failed to rename folder');
    }
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-black">
      {variant === 'mobile-fullscreen' ? (
        <div className="flex items-center gap-2 border-b border-zinc-800 p-4">
          <button
            onClick={() => onBack?.()}
            className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
          >
            <ChevronLeft className="h-4 w-4" />
            <span>Notes</span>
          </button>
          <span className="flex-1 text-center font-semibold">Folders</span>
          <span className="w-14 shrink-0" />
        </div>
      ) : (
        <div className="flex items-center gap-2 border-b border-zinc-800 p-4">
          <PlainDockIcon className="h-5 w-5 shrink-0 text-indigo-400" />
          <span className="truncate font-semibold">PlainDock</span>
        </div>
      )}

      <div className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
        <button
          onClick={() => onSelectFolder(null)}
          className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors ${
            activeFolderId === null ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:bg-zinc-900'
          }`}
        >
          <FolderIcon className="h-4 w-4 shrink-0 text-zinc-500" />
          <span className="min-w-0 flex-1 truncate text-left">All Notes</span>
          <span className="text-[10px] text-zinc-600">{notes.length}</span>
        </button>

        {folders.map((folder) =>
          editingFolderId === folder.id ? (
            <input
              key={folder.id}
              autoFocus
              value={editingName}
              onChange={(e) => setEditingName(e.target.value)}
              onBlur={submitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitRename();
                if (e.key === 'Escape') setEditingFolderId(null);
              }}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm focus:outline-none"
            />
          ) : (
            <div key={folder.id} className="group relative">
              <button
                onClick={() => onSelectFolder(folder.id)}
                className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 pr-14 text-sm transition-colors md:pr-2 ${
                  activeFolderId === folder.id
                    ? 'bg-zinc-800 text-white'
                    : 'text-zinc-400 hover:bg-zinc-900'
                }`}
              >
                <FolderIcon className="h-4 w-4 shrink-0 text-zinc-500" />
                <span className="min-w-0 flex-1 truncate text-left">{folder.name}</span>
                <span className="hidden text-[10px] text-zinc-600 md:inline md:group-hover:hidden">
                  {notes.filter((n) => n.folderId === folder.id).length}
                </span>
              </button>
              <div className="absolute top-1/2 right-1 flex -translate-y-1/2 items-center gap-0.5 md:hidden md:group-hover:flex">
                <button
                  onClick={() => {
                    setEditingFolderId(folder.id);
                    setEditingName(folder.name);
                  }}
                  className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-white"
                  aria-label={`Rename ${folder.name}`}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => setDeleteTarget(folder)}
                  className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-red-400/10 hover:text-red-400"
                  aria-label={`Delete ${folder.name}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ),
        )}

        {isAddingFolder ? (
          <input
            autoFocus
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onBlur={submitNewFolder}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitNewFolder();
              if (e.key === 'Escape') {
                setIsAddingFolder(false);
                setNewFolderName('');
              }
            }}
            placeholder="Folder name"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm placeholder-zinc-600 focus:outline-none"
          />
        ) : (
          <button
            onClick={() => setIsAddingFolder(true)}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-zinc-600 transition-colors hover:bg-zinc-900 hover:text-zinc-400"
          >
            <FolderPlus className="h-4 w-4 shrink-0" />
            <span>New Folder</span>
          </button>
        )}
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete folder"
        message={`Delete "${deleteTarget?.name}"? Its notes will move to All Notes.`}
        confirmLabel="Delete"
        onConfirm={() => {
          if (deleteTarget) {
            onDeleteFolder(deleteTarget.id).catch(() => setErrorToast('Failed to delete folder'));
          }
          setDeleteTarget(null);
        }}
        onCancel={() => setDeleteTarget(null)}
      />
      <Toast
        open={errorToast !== null}
        message={errorToast ?? ''}
        variant="error"
        onClose={() => setErrorToast(null)}
      />
    </div>
  );
};

export default FolderSidebar;
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run typecheck`
Expected: no errors. This component isn't imported anywhere yet, so functional/visual verification happens in Task 5.

- [ ] **Step 3: Commit**

```bash
git add src/components/sidebar/FolderSidebar.tsx
git commit -m "feat(sidebar): add standalone folder sidebar component"
```

---

### Task 4: NotesList component

**Files:**
- Create: `src/components/sidebar/NotesList.tsx`
- Reference (for extraction, do not modify yet): `src/components/sidebar/Sidebar.tsx`

**Interfaces:**
- Consumes: `Note` from `@/types`; `deriveTitleFromText` from `@/lib/note-title`.
- Produces: `NotesList` (default export), `interface NotesListProps` with `notes: Note[]`, `activeFolderId: string | null`, `activeFolderName: string`, `activeNoteId: string | null`, `onSelectNote: (id: string) => void`, `onCreateNote: () => void`, `searchQuery: string`, `onSearch: (q: string) => void`, `onRefresh: () => Promise<void>`, `onToggleFolders: () => void`.

- [ ] **Step 1: Write the file**

```tsx
'use client';

import React, { useState, useRef, useEffect } from 'react';
import type { Note } from '@/types';
import { Search, Plus, Pin, Loader2, PanelLeft } from 'lucide-react';
import { deriveTitleFromText } from '@/lib/note-title';

interface NotesListProps {
  notes: Note[];
  activeFolderId: string | null;
  activeFolderName: string;
  activeNoteId: string | null;
  onSelectNote: (id: string) => void;
  onCreateNote: () => void;
  searchQuery: string;
  onSearch: (q: string) => void;
  onRefresh: () => Promise<void>;
  onToggleFolders: () => void;
}

const PULL_THRESHOLD = 50;

// Titles are persisted server-side on save (see PUT /api/notes/[id]); deriving
// here is only a fallback for notes stored before that policy existed.
function displayParts(note: Note): { title: string; preview: string } {
  return {
    title: note.title || deriveTitleFromText(note.textContent) || 'Untitled',
    preview: note.textContent,
  };
}

const NotesList: React.FC<NotesListProps> = ({
  notes,
  activeFolderId,
  activeFolderName,
  activeNoteId,
  onSelectNote,
  onCreateNote,
  searchQuery,
  onSearch,
  onRefresh,
  onToggleFolders,
}) => {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullY, setPullY] = useState(0);
  const touchStartY = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);

  // Non-passive listener so we can call preventDefault and block native overscroll
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;

    const onMove = (e: TouchEvent) => {
      if (el.scrollTop > 0) return;
      const dy = e.touches[0].clientY - touchStartY.current;
      if (dy > 0) {
        e.preventDefault();
        setPullY(Math.min(dy * 0.45, 64));
      }
    };

    el.addEventListener('touchmove', onMove, { passive: false });
    return () => el.removeEventListener('touchmove', onMove);
  }, []);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = async () => {
    if (pullY >= PULL_THRESHOLD) {
      setPullY(0);
      setIsRefreshing(true);
      try {
        await onRefresh();
      } finally {
        setIsRefreshing(false);
      }
    } else {
      setPullY(0);
    }
  };

  const folderNotes = activeFolderId ? notes.filter((n) => n.folderId === activeFolderId) : notes;
  const filteredNotes = folderNotes.filter(
    (n) =>
      n.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      n.textContent.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const indicatorHeight = isRefreshing ? 40 : Math.round(pullY * 0.7);
  const spinnerOpacity = Math.min(pullY / PULL_THRESHOLD, 1);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-black">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-zinc-800 p-4">
        <div className="flex min-w-0 items-center gap-2">
          <button
            onClick={onToggleFolders}
            className="shrink-0 rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
            aria-label="Toggle folders"
          >
            <PanelLeft className="h-4 w-4" />
          </button>
          <span className="truncate font-semibold">{activeFolderName}</span>
        </div>
        <button
          onClick={onCreateNote}
          className="shrink-0 rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
          aria-label="New note"
        >
          <Plus className="h-5 w-5" />
        </button>
      </div>

      {/* Search */}
      <div className="px-4 py-3">
        <div className="relative">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => onSearch(e.target.value)}
            className="w-full rounded-md border border-zinc-800 bg-zinc-900 py-2 pr-3 pl-9 text-base transition-colors focus:border-zinc-700 focus:outline-none"
          />
        </div>
      </div>

      {/* Pull-to-refresh indicator */}
      <div
        className="flex items-center justify-center overflow-hidden transition-[height] duration-200"
        style={{ height: indicatorHeight }}
      >
        <Loader2
          className={`h-4 w-4 text-indigo-400 ${isRefreshing ? 'animate-spin' : ''}`}
          style={{ opacity: isRefreshing ? 1 : spinnerOpacity }}
        />
      </div>

      {/* List */}
      <div
        ref={listRef}
        className="flex-1 overflow-y-auto overscroll-contain px-2 pb-4"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {filteredNotes.length === 0 ? (
          <div className="mt-10 text-center text-sm text-zinc-600">No notes found</div>
        ) : (
          <div className="space-y-1">
            {filteredNotes.map((note) => {
              const { title, preview } = displayParts(note);
              return (
                <button
                  key={note.id}
                  onClick={() => onSelectNote(note.id)}
                  className={`group relative w-full rounded-lg p-4 text-left transition-all md:p-3 ${
                    activeNoteId === note.id
                      ? 'bg-zinc-800 text-white'
                      : 'text-zinc-400 hover:bg-zinc-900'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {note.isPinned && <Pin className="h-3 w-3 shrink-0 text-indigo-400" />}
                        <h3 className="truncate text-sm font-medium">{title}</h3>
                      </div>
                      <p className="mt-1 truncate text-xs text-zinc-500">
                        {preview || 'No content...'}
                      </p>
                    </div>
                    <span className="mt-1 shrink-0 text-[10px] text-zinc-600">
                      {new Date(note.updatedAt).toLocaleDateString([], {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default NotesList;
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run typecheck`
Expected: no errors. This component isn't imported anywhere yet, so functional/visual verification happens in Task 5.

- [ ] **Step 3: Commit**

```bash
git add src/components/sidebar/NotesList.tsx
git commit -m "feat(sidebar): add standalone notes list component"
```

---

### Task 5: Rewire page.tsx, remove old Sidebar, full QA

**Files:**
- Modify: `src/app/page.tsx` (full rewrite — replace entire file contents)
- Delete: `src/components/sidebar/Sidebar.tsx`

**Interfaces:**
- Consumes: `FolderSidebar` from Task 3, `NotesList` from Task 4, `ResizeHandle` from Task 2, `getLayout`/`saveLayout`/`clamp`/`FOLDER_WIDTH_*`/`NOTES_WIDTH_*` from Task 1, `EditorCanvas`/`EditorCanvasHandle` (unchanged), `folderApi`/`noteApi` (unchanged), `Folder`/`Note` from `@/types` (unchanged).
- Produces: nothing consumed elsewhere — this is the top-level page.

- [ ] **Step 1: Replace `src/app/page.tsx` with the full new implementation**

```tsx
'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { Folder, Note } from '@/types';
import { folderApi, noteApi } from '@/lib/api-client';
import {
  getLayout,
  saveLayout,
  clamp,
  FOLDER_WIDTH_MIN,
  FOLDER_WIDTH_MAX,
  FOLDER_WIDTH_DEFAULT,
  NOTES_WIDTH_MIN,
  NOTES_WIDTH_MAX,
  NOTES_WIDTH_DEFAULT,
} from '@/lib/layout-storage';

const sortNotes = (list: Note[]): Note[] =>
  [...list].sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
import FolderSidebar from '@/components/sidebar/FolderSidebar';
import NotesList from '@/components/sidebar/NotesList';
import ResizeHandle from '@/components/sidebar/ResizeHandle';
import EditorCanvas, { type EditorCanvasHandle } from '@/components/editor/EditorCanvas';

type ActiveNoteStatus = 'idle' | 'loading' | 'ready' | 'error';
type ViewportTier = 'mobile' | 'tablet' | 'desktop';

const MOBILE_BREAKPOINT = 768;
const DESKTOP_BREAKPOINT = 1024;

function getViewportTier(width: number): ViewportTier {
  if (width < MOBILE_BREAKPOINT) return 'mobile';
  if (width < DESKTOP_BREAKPOINT) return 'tablet';
  return 'desktop';
}

const skeletonLineWidths = ['w-full', 'w-11/12', 'w-4/5', 'w-10/12', 'w-2/3'];

function NoteLoadingState() {
  return (
    <div
      className="flex flex-1 flex-col overflow-hidden"
      role="status"
      aria-live="polite"
      aria-label="Loading note"
    >
      <div className="border-b border-zinc-800/80 px-5 py-4">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
          <div className="h-7 w-48 animate-pulse rounded bg-zinc-800" />
          <div className="flex gap-2">
            <div className="h-8 w-8 animate-pulse rounded bg-zinc-800/80" />
            <div className="h-8 w-8 animate-pulse rounded bg-zinc-800/80" />
            <div className="h-8 w-8 animate-pulse rounded bg-zinc-800/80" />
            <div className="h-8 w-20 animate-pulse rounded bg-zinc-800/80" />
          </div>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-5 py-8">
        <p className="mb-7 text-sm text-zinc-500">Loading note...</p>
        <div className="space-y-4">
          {skeletonLineWidths.map((width) => (
            <div key={width} className={`${width} h-4 animate-pulse rounded bg-zinc-800/80`} />
          ))}
        </div>
      </div>
    </div>
  );
}

interface EditorAreaProps {
  activeNoteStatus: ActiveNoteStatus;
  activeNote: Note | null;
  editorRef: React.RefObject<EditorCanvasHandle | null>;
  onUpdate: (note: Note) => void;
  onDelete: () => void;
  onBack: () => void;
  autoFocus: boolean;
  onAutoFocusHandled: () => void;
  folders: Folder[];
  onRetry: () => void;
  onCreateNote: () => void;
}

function EditorArea({
  activeNoteStatus,
  activeNote,
  editorRef,
  onUpdate,
  onDelete,
  onBack,
  autoFocus,
  onAutoFocusHandled,
  folders,
  onRetry,
  onCreateNote,
}: EditorAreaProps) {
  if (activeNoteStatus === 'loading') return <NoteLoadingState />;

  if (activeNoteStatus === 'error') {
    return (
      <div className="flex flex-1 items-center justify-center px-6 text-zinc-500">
        <div className="text-center">
          <h1 className="mb-2 text-2xl font-light text-zinc-300">Unable to load note</h1>
          <p className="text-sm">The selected note could not be opened.</p>
          <button
            onClick={onRetry}
            className="mt-6 rounded-lg border border-zinc-700 px-4 py-2 text-zinc-300 transition-colors hover:bg-zinc-800"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (activeNote) {
    return (
      <EditorCanvas
        ref={editorRef}
        note={activeNote}
        onUpdate={onUpdate}
        onDelete={onDelete}
        onBack={onBack}
        autoFocus={autoFocus}
        onAutoFocusHandled={onAutoFocusHandled}
        folders={folders}
      />
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center text-zinc-500">
      <div className="text-center">
        <h1 className="mb-2 text-2xl font-light">PlainDock</h1>
        <p className="text-sm">Select or create a note to begin</p>
        <button
          onClick={onCreateNote}
          className="mt-6 rounded-lg border border-zinc-700 px-4 py-2 transition-colors hover:bg-zinc-800"
        >
          Create New Note
        </button>
      </div>
    </div>
  );
}

export default function MainPage() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [activeNote, setActiveNote] = useState<Note | null>(null);
  const [activeNoteStatus, setActiveNoteStatus] = useState<ActiveNoteStatus>('idle');
  const [noteLoadAttempt, setNoteLoadAttempt] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [autoFocusNote, setAutoFocusNote] = useState(false);
  const editorRef = useRef<EditorCanvasHandle>(null);

  // Desktop/tablet pane layout
  const [folderWidth, setFolderWidth] = useState(FOLDER_WIDTH_DEFAULT);
  const [notesWidth, setNotesWidth] = useState(NOTES_WIDTH_DEFAULT);
  const [folderCollapsed, setFolderCollapsed] = useState(false);
  const [folderOverlayOpen, setFolderOverlayOpen] = useState(false);
  const [viewportTier, setViewportTier] = useState<ViewportTier>('desktop');

  // Mobile navigation
  const [mobilePanel, setMobilePanel] = useState<'list' | 'editor'>('list');
  const [showFolders, setShowFolders] = useState(false);

  useEffect(() => {
    const update = () => setViewportTier(getViewportTier(window.innerWidth));
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  useEffect(() => {
    const stored = getLayout();
    if (stored) {
      setFolderWidth(stored.folderWidth);
      setNotesWidth(stored.notesWidth);
      setFolderCollapsed(stored.folderCollapsed);
    }
  }, []);

  useEffect(() => {
    saveLayout({ folderWidth, notesWidth, folderCollapsed });
  }, [folderWidth, notesWidth, folderCollapsed]);

  const loadNotes = useCallback(async () => {
    const data = await noteApi.list();
    setNotes(data);
  }, []);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  const loadFolders = useCallback(async () => {
    const data = await folderApi.list();
    setFolders(data);
  }, []);

  useEffect(() => {
    loadFolders();
  }, [loadFolders]);

  // Fetch full note (with content) when selection changes
  useEffect(() => {
    if (!activeNoteId) {
      setActiveNote(null);
      setActiveNoteStatus('idle');
      return;
    }

    let isCurrentRequest = true;
    setActiveNote(null);
    setActiveNoteStatus('loading');
    noteApi
      .get(activeNoteId)
      .then((note) => {
        if (!isCurrentRequest) return;
        setActiveNote(note);
        setActiveNoteStatus('ready');
      })
      .catch(() => {
        if (!isCurrentRequest) return;
        setActiveNote(null);
        setActiveNoteStatus('error');
      });

    return () => {
      isCurrentRequest = false;
    };
  }, [activeNoteId, noteLoadAttempt]);

  const cleanupEmptyNote = useCallback(async () => {
    if (!activeNote) return;
    const current = editorRef.current?.getCurrentState();
    const title = current?.title ?? activeNote.title;
    const textContent = current?.textContent ?? activeNote.textContent;
    if (title.trim() === '' && textContent.trim() === '') {
      await noteApi.delete(activeNote.id);
      setNotes((prev) => prev.filter((n) => n.id !== activeNote.id));
    }
  }, [activeNote]);

  const handleSelectNote = useCallback(
    async (id: string) => {
      if (id !== activeNoteId) {
        await cleanupEmptyNote();
        setActiveNote(null);
        setActiveNoteStatus('loading');
      }
      setActiveNoteId(id);
      setMobilePanel('editor');
    },
    [activeNoteId, cleanupEmptyNote],
  );

  const handleBack = useCallback(async () => {
    await cleanupEmptyNote();
    setActiveNoteId(null);
    setActiveNote(null);
    setActiveNoteStatus('idle');
    setMobilePanel('list');
  }, [cleanupEmptyNote]);

  const handleCreateNote = useCallback(async () => {
    await cleanupEmptyNote();
    const newNote = await noteApi.create(activeFolderId);
    setNotes((prev) => sortNotes([newNote, ...prev]));
    setActiveNote(null);
    setActiveNoteStatus('loading');
    setActiveNoteId(newNote.id);
    setAutoFocusNote(true);
    setMobilePanel('editor');
    loadNotes().catch(() => {});
  }, [cleanupEmptyNote, loadNotes, activeFolderId]);

  const handleDeleteNote = async (id: string) => {
    await noteApi.delete(id);
    setNotes((prev) => prev.filter((n) => n.id !== id));
    if (activeNoteId === id) {
      setActiveNoteId(null);
      setActiveNote(null);
      setActiveNoteStatus('idle');
      setMobilePanel('list');
    }
  };

  const handleUpdateNoteLocally = (updatedNote: Note) => {
    setNotes((prev) => sortNotes(prev.map((n) => (n.id === updatedNote.id ? updatedNote : n))));
    setActiveNote(updatedNote);
    setActiveNoteStatus('ready');
  };

  const handleRefresh = useCallback(async () => {
    await Promise.all([loadNotes(), loadFolders()]);
    if (activeNoteId) {
      setActiveNote(null);
      setActiveNoteStatus('loading');
      setNoteLoadAttempt((attempt) => attempt + 1);
    }
  }, [loadNotes, loadFolders, activeNoteId]);

  const handleCreateFolder = useCallback(async (name: string) => {
    const folder = await folderApi.create(name);
    setFolders((prev) => [...prev, folder]);
  }, []);

  const handleRenameFolder = useCallback(async (id: string, name: string) => {
    const folder = await folderApi.rename(id, name);
    setFolders((prev) => prev.map((f) => (f.id === id ? folder : f)));
  }, []);

  // Mirrors the DB's ON DELETE SET NULL in client state — no refetch needed
  const handleDeleteFolder = useCallback(
    async (id: string) => {
      await folderApi.remove(id);
      setFolders((prev) => prev.filter((f) => f.id !== id));
      setNotes((prev) => prev.map((n) => (n.folderId === id ? { ...n, folderId: null } : n)));
      setActiveNote((prev) => (prev?.folderId === id ? { ...prev, folderId: null } : prev));
      if (activeFolderId === id) setActiveFolderId(null);
    },
    [activeFolderId],
  );

  const handleRetryNoteLoad = useCallback(() => {
    setActiveNote(null);
    setActiveNoteStatus('loading');
    setNoteLoadAttempt((attempt) => attempt + 1);
  }, []);

  const handleToggleFolders = useCallback(() => {
    if (viewportTier === 'desktop') {
      setFolderCollapsed((v) => !v);
    } else if (viewportTier === 'tablet') {
      setFolderOverlayOpen((v) => !v);
    } else {
      setShowFolders(true);
    }
  }, [viewportTier]);

  const handleSelectFolderMobile = useCallback((id: string | null) => {
    setActiveFolderId(id);
    setShowFolders(false);
  }, []);

  const handleSelectFolderOverlay = useCallback((id: string | null) => {
    setActiveFolderId(id);
    setFolderOverlayOpen(false);
  }, []);

  const activeFolderName = activeFolderId
    ? (folders.find((f) => f.id === activeFolderId)?.name ?? 'All Notes')
    : 'All Notes';

  const folderSidebarProps = {
    notes,
    folders,
    activeFolderId,
    onCreateFolder: handleCreateFolder,
    onRenameFolder: handleRenameFolder,
    onDeleteFolder: handleDeleteFolder,
  };

  const editorAreaProps = {
    activeNoteStatus,
    activeNote,
    editorRef,
    onUpdate: handleUpdateNoteLocally,
    onDelete: () => activeNote && handleDeleteNote(activeNote.id),
    onBack: handleBack,
    autoFocus: autoFocusNote,
    onAutoFocusHandled: () => setAutoFocusNote(false),
    folders,
    onRetry: handleRetryNoteLoad,
    onCreateNote: handleCreateNote,
  };

  const notesListProps = {
    notes,
    activeFolderId,
    activeFolderName,
    activeNoteId,
    onSelectNote: handleSelectNote,
    onCreateNote: handleCreateNote,
    searchQuery,
    onSearch: setSearchQuery,
    onRefresh: handleRefresh,
    onToggleFolders: handleToggleFolders,
  };

  if (viewportTier === 'mobile') {
    return (
      <div className="fixed inset-0 flex overflow-hidden bg-black font-sans text-zinc-100">
        {showFolders ? (
          <FolderSidebar
            {...folderSidebarProps}
            onSelectFolder={handleSelectFolderMobile}
            variant="mobile-fullscreen"
            onBack={() => setShowFolders(false)}
          />
        ) : (
          <>
            <div className={mobilePanel === 'editor' ? 'hidden' : 'contents'}>
              <NotesList {...notesListProps} />
            </div>
            <main
              className={`${mobilePanel === 'list' ? 'hidden' : 'flex'} min-w-0 flex-1 flex-col overflow-hidden bg-zinc-900/30`}
            >
              <EditorArea {...editorAreaProps} />
            </main>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex overflow-hidden bg-black font-sans text-zinc-100">
      {viewportTier === 'desktop' && !folderCollapsed && (
        <>
          <div style={{ width: folderWidth }} className="h-full shrink-0">
            <FolderSidebar {...folderSidebarProps} onSelectFolder={setActiveFolderId} variant="pane" />
          </div>
          <ResizeHandle
            onResize={(dx) => setFolderWidth((w) => clamp(w + dx, FOLDER_WIDTH_MIN, FOLDER_WIDTH_MAX))}
          />
        </>
      )}

      <div style={{ width: notesWidth }} className="relative h-full shrink-0">
        <NotesList {...notesListProps} />
        {viewportTier === 'tablet' && folderOverlayOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setFolderOverlayOpen(false)} />
            <div
              style={{ width: folderWidth }}
              className="absolute top-0 left-0 z-50 h-full border-r border-zinc-800 bg-black shadow-2xl"
            >
              <FolderSidebar
                {...folderSidebarProps}
                onSelectFolder={handleSelectFolderOverlay}
                variant="pane"
              />
            </div>
          </>
        )}
      </div>

      <ResizeHandle
        onResize={(dx) => setNotesWidth((w) => clamp(w + dx, NOTES_WIDTH_MIN, NOTES_WIDTH_MAX))}
      />

      <main className="flex min-w-[420px] flex-1 flex-col overflow-hidden bg-zinc-900/30">
        <EditorArea {...editorAreaProps} />
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Delete the old combined sidebar**

```bash
git rm src/components/sidebar/Sidebar.tsx
```

- [ ] **Step 3: Verify it compiles and lints cleanly**

Run: `npm run typecheck && npm run lint && npm run format:check`
Expected: no errors. If `format:check` fails, run `npm run format` and re-check.

- [ ] **Step 4: Manual QA against the running app**

Run: `npm run dev`, open `http://localhost:3000`.

1. **Desktop (≥1024px window)**: confirm three panes render (Folder | Notes | Editor). Drag both resize handles to their min and max — widths clamp, editor absorbs remaining space, total app width never changes. Click the panel-toggle button in the Notes List header — Folder pane disappears entirely (not just shrinks). Reload the page — the collapsed state and both widths persist.
2. **Narrow desktop (resize window to ~850px)**: Folder pane auto-collapses to a two-pane Notes+Editor layout. Click the toggle button — the Folder Sidebar opens as an overlay on top of the Notes List (Editor doesn't shift). Click the backdrop, or select a folder — overlay closes.
3. **Mobile (resize window to <768px, or use device toolbar)**: app opens directly to Notes List ("All Notes"). Tap the folder-toggle button — full-screen Folders view opens. Select a folder — returns to Notes List, now scoped to that folder. Tap the toggle again, then tap back — returns to Notes List unchanged. Tap a note — Editor opens full-width. Tap back — returns to Notes List. Create a new note — Editor opens with focus; deleting it while empty and going back removes it from the list (existing `cleanupEmptyNote` behavior, unaffected).
4. Confirm folder create/rename/delete still work identically to before, at every tier.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(sidebar): rebuild layout as resizable three-pane view"
```

---

## Self-Review Notes

- **Spec coverage:** Folder/Notes/Editor pane split ✓ (Task 3, 4, page render), resize handles + clamped widths ✓ (Task 2, 5), "removes entirely" collapse ✓ (Task 5 conditional render), persistence ✓ (Task 1, wired in Task 5), narrow-desktop auto-collapse + reachable toggle ✓ (Task 5, called out as the one spec refinement), mobile Folders→NotesList→Editor stack with Notes List as root ✓ (Task 5).
- **Placeholder scan:** no TBD/TODO; every step has literal code or exact manual QA actions.
- **Type consistency:** `NotesListProps`/`FolderSidebarProps` (Tasks 3–4) match the props actually passed in Task 5's `notesListProps`/`folderSidebarProps` objects; `EditorAreaProps` matches `editorAreaProps`; `StoredLayout` (Task 1) matches the object shape passed to `saveLayout` in Task 5.
