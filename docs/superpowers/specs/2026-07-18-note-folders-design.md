# Note Folders — Design Spec

**Date:** 2026-07-18
**Issue:** [#17 — add note folders to put related into folders](https://github.com/weiwei-tsao/plain-dock/issues/17)

## Goal

Apple Notes–style folders: an "All Notes" view showing every note, plus a flat list of user-created folders that notes can be filed into.

## Data Model

New `Folder` model in `prisma/schema.prisma`:

```prisma
model Folder {
  id        String   @id @default(cuid())
  name      String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  notes     Note[]
}
```

`Note` gains:

```prisma
folderId String?
folder   Folder? @relation(fields: [folderId], references: [id], onDelete: SetNull)
```

- `onDelete: SetNull` — deleting a folder returns its notes to All Notes via a DB constraint; no application code.
- One migration. Production (Turso) applies the migration SQL manually, per the existing deployment workflow.

## API

New routes, following existing conventions (serializers, error shape, `await params`):

- `GET /api/folders` — list folders with per-folder note counts (Prisma `_count`).
- `POST /api/folders` — create folder; body `{ name: string }`, reject empty name with 400.
- `PUT /api/folders/[id]` — rename; body `{ name: string }`.
- `DELETE /api/folders/[id]` — delete folder (notes are un-filed by the DB constraint).

Changes to existing routes:

- `GET /api/notes` — include `folderId` in the lightweight list response.
- `POST /api/notes` — accept optional `folderId` so notes created inside a folder are filed there.
- `PUT /api/notes/[id]` — accept `folderId` (including `null`) to move a note.

Folder filtering happens client-side; the notes list is already fetched in full, so no query params.

## Types & Client API

- `src/types.ts`: `Folder` interface (ISO string dates); `Note` gains `folderId: string | null`; `NotePayload` gains **optional** `folderId?: string | null`.
- `src/lib/serialize.ts`: `serializeFolder()` alongside `serializeNote()`.
- `src/lib/api-client.ts`: `folderApi` with `list / create / rename / remove`.
- `noteApi.update` and `persistChange` widen to `Partial<NotePayload>` so a folder move can send `{ folderId }` alone.

## Client State (`page.tsx`)

- New state: `folders: Folder[]`, `activeFolderId: string | null` (`null` = All Notes).
- Notes passed to the sidebar are filtered by `activeFolderId` before the existing search filter.
- Creating a note while a folder is active files it into that folder.
- Search filters within the currently selected view: in All Notes it searches everything; inside a folder it searches that folder's notes (search runs on the already-filtered list, as today).
- `mobileView` stays two-level (`'list' | 'editor'`) — folders live inside the existing sidebar panel.

## Sidebar UI

Below the search box, above the note list:

- Folder section: **All Notes** (total count) + each folder (name + count). Active row uses the existing `bg-zinc-800 text-white` style.
- "+ New Folder" entry at the end of the section; inline text input to create.
- Hovering a folder row reveals rename (inline input) and delete actions; delete asks for confirmation.

## Editor (`EditorCanvas`)

- A "move to folder" dropdown (Folder icon) in the header action bar listing All Notes + folders.
- Moving goes through the existing `persistChange()` request queue but sends **only** `{ folderId }` — a partial update. `PUT /api/notes/[id]` already applies only the fields present in the body, so a move can never clobber content, and it must not: a full payload built from props would write back stale `note.content` while a debounced content save is pending.
- Conversely, the auto-save payload built in `triggerSave` never includes `folderId`, so a content save queued around a move cannot revert it.

## Out of Scope (YAGNI)

Nested subfolders, drag-and-drop, per-folder search, folder colors/icons, folder ordering beyond creation order.
