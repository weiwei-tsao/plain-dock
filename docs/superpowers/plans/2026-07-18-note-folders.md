# Note Folders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apple Notes–style flat folders: an "All Notes" view plus user-created folders that notes can be filed into, per `docs/superpowers/specs/2026-07-18-note-folders-design.md`.

**Architecture:** New `Folder` model related to `Note.folderId` (nullable, `onDelete: SetNull`). New `api/folders` CRUD routes; notes routes accept `folderId` with three-state semantics (omitted / null / string). Client filters notes by an `activeFolderId` in the sidebar; the editor moves notes via a `{ folderId }`-only partial update.

**Tech Stack:** Next.js 16 App Router, Prisma + SQLite, React 19, TypeScript strict, Tailwind v4, lucide-react.

## Global Constraints

- **No test runner exists in this project** (per CLAUDE.md). Verification per task = `npm run typecheck` + `npm run lint`, curl against the dev server for API tasks, and browser checks for UI tasks. Do NOT add a test framework.
- TypeScript strict; `import type` for type-only imports (ESLint-enforced); `@/*` path alias, never relative `../../`.
- Icons imported individually from `lucide-react`.
- API errors: `NextResponse.json({ error: string }, { status })`. `params` is a Promise — always `await params`.
- All Prisma results serialized via `@/lib/serialize` before returning.
- Dark theme Tailwind classes only (see `.claude/rules/styling.md`). Active row: `bg-zinc-800 text-white`; inactive: `text-zinc-400 hover:bg-zinc-900`.
- Commits: Conventional Commits, description ≤ 12 words, imperative, lowercase. Run `npm run format && npm run typecheck && npm run lint` before every commit.
- The auto-save payload built in `triggerSave` (EditorCanvas) must NEVER include `folderId`; a folder move must send ONLY `{ folderId }`.
- Deployment note (no code): after merge, the new migration SQL must be applied to Turso manually, in timestamp order (Task 7 documents this).

## Dev-Server Verification Setup (used by Tasks 3–6)

Run the dev server in one terminal: `npm run dev`. Authenticate curl once:

```bash
PASS=$(grep '^APP_PASSWORD=' .env | cut -d= -f2- | tr -d '"')
curl -s -c /tmp/pd-cookies -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' -d "{\"password\":\"$PASS\"}"
```

Expected: `{"success":true}`. All later curl commands pass `-b /tmp/pd-cookies`.

---

### Task 1: Schema — Folder model and Note.folderId

**Files:**
- Modify: `prisma/schema.prisma`
- Generated: `prisma/migrations/<timestamp>_add_note_folders/migration.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: Prisma models `Folder { id, name, createdAt, updatedAt, notes }` and `Note.folderId: String?` with `onDelete: SetNull`. Later tasks use `prisma.folder.*` and `note.folderId`.

- [ ] **Step 1: Add the Folder model and relation**

Replace the full contents of `prisma/schema.prisma` with:

```prisma
datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model Note {
  id          String   @id @default(cuid())
  title       String   @default("")
  content     String   @default("")
  textContent String   @default("")
  mode        String   @default("PLAIN")
  isPinned    Boolean  @default(false)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  folderId    String?
  folder      Folder?  @relation(fields: [folderId], references: [id], onDelete: SetNull)
}

model Folder {
  id        String   @id @default(cuid())
  name      String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  notes     Note[]
}
```

- [ ] **Step 2: Create and apply the migration**

Run: `npx prisma migrate dev --name add_note_folders`
Expected: "Your database is now in sync with your schema" and "Generated Prisma Client". A new directory `prisma/migrations/<timestamp>_add_note_folders/` appears.

- [ ] **Step 3: Verify the schema landed**

Run: `sqlite3 prisma/dev.db ".schema Folder"`
Expected: a `CREATE TABLE "Folder"` statement.

Run: `sqlite3 prisma/dev.db ".schema Note" | grep -i folder`
Expected: `"folderId" TEXT` and a foreign key with `ON DELETE SET NULL`.

- [ ] **Step 4: Quality gate**

Run: `npm run typecheck && npm run lint`
Expected: both pass (the spread in `serializeNote` carries the new column without type changes).

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "chore(db): add folder model and note folder relation"
```

---

### Task 2: Types, serializer, and API client

**Files:**
- Modify: `src/types.ts`
- Modify: `src/lib/serialize.ts`
- Modify: `src/lib/api-client.ts`

**Interfaces:**
- Consumes: Prisma `Folder` model from Task 1.
- Produces:
  - `Folder` interface: `{ id: string; name: string; noteCount: number; createdAt: string; updatedAt: string }`
  - `Note.folderId: string | null`; `NotePayload.folderId?: string | null`
  - `serializeFolder(folder: PrismaFolder & { _count: { notes: number } }): Folder`
  - `folderApi.list(): Promise<Folder[]>`, `folderApi.create(name: string): Promise<Folder>`, `folderApi.rename(id: string, name: string): Promise<Folder>`, `folderApi.remove(id: string): Promise<void>`
  - `noteApi.create(folderId?: string | null)`, `noteApi.update(id, payload: Partial<NotePayload>)`

- [ ] **Step 1: Extend `src/types.ts`**

Add `folderId: string | null;` to `Note` (after `isPinned`), `folderId?: string | null;` to `NotePayload` (after `isPinned`), and append:

```ts
export interface Folder {
  id: string;
  name: string;
  noteCount: number;
  createdAt: string;
  updatedAt: string;
}
```

- [ ] **Step 2: Add `serializeFolder` to `src/lib/serialize.ts`**

```ts
import type { Folder as PrismaFolder } from '@prisma/client';
import type { Folder } from '@/types';

export function serializeFolder(folder: PrismaFolder & { _count: { notes: number } }): Folder {
  return {
    id: folder.id,
    name: folder.name,
    noteCount: folder._count.notes,
    createdAt: folder.createdAt.toISOString(),
    updatedAt: folder.updatedAt.toISOString(),
  };
}
```

(Merge the imports with the existing ones: `import type { Note as PrismaNote, Folder as PrismaFolder } from '@prisma/client';` etc.)

- [ ] **Step 3: Extend `src/lib/api-client.ts`**

Change the import to `import type { Folder, Note, NotePayload } from '@/types';`. Replace `noteApi.create` and `noteApi.update` with:

```ts
  async create(folderId?: string | null): Promise<Note> {
    return request<Note>('/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(folderId ? { folderId } : {}),
    });
  },

  async update(id: string, payload: Partial<NotePayload>): Promise<Note> {
    return request<Note>(`/api/notes/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  },
```

Append after `noteApi`:

```ts
export const folderApi = {
  async list(): Promise<Folder[]> {
    return request<Folder[]>('/api/folders');
  },

  async create(name: string): Promise<Folder> {
    return request<Folder>('/api/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
  },

  async rename(id: string, name: string): Promise<Folder> {
    return request<Folder>(`/api/folders/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
  },

  async remove(id: string): Promise<void> {
    await request(`/api/folders/${id}`, { method: 'DELETE' });
  },
};
```

- [ ] **Step 4: Quality gate**

Run: `npm run format && npm run typecheck && npm run lint`
Expected: all pass. (`Note.folderId` is satisfied everywhere because notes are only constructed from Prisma spreads.)

- [ ] **Step 5: Commit**

```bash
git add src/types.ts src/lib/serialize.ts src/lib/api-client.ts
git commit -m "feat(api): add folder types, serializer, and client helpers"
```

---

### Task 3: Folder CRUD API routes

**Files:**
- Create: `src/app/api/folders/route.ts`
- Create: `src/app/api/folders/[id]/route.ts`

**Interfaces:**
- Consumes: `prisma` from `@/lib/db`, `serializeFolder` from `@/lib/serialize` (Task 2).
- Produces: `GET /api/folders` (array of serialized folders, `createdAt` asc), `POST /api/folders` (201), `PUT /api/folders/[id]`, `DELETE /api/folders/[id]` (`{ success: true }`).

- [ ] **Step 1: Create `src/app/api/folders/route.ts`**

```ts
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { serializeFolder } from '@/lib/serialize';

const withCount = { _count: { select: { notes: true } } } as const;

// GET /api/folders — List all folders with note counts, oldest first
export async function GET() {
  const folders = await prisma.folder.findMany({
    include: withCount,
    orderBy: { createdAt: 'asc' },
  });
  return NextResponse.json(folders.map(serializeFolder));
}

// POST /api/folders — Create a folder
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const name = (body as { name?: unknown }).name;
  if (typeof name !== 'string' || name.trim() === '') {
    return NextResponse.json({ error: 'Folder name is required' }, { status: 400 });
  }

  const folder = await prisma.folder.create({
    data: { name: name.trim() },
    include: withCount,
  });
  return NextResponse.json(serializeFolder(folder), { status: 201 });
}
```

- [ ] **Step 2: Create `src/app/api/folders/[id]/route.ts`**

```ts
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { serializeFolder } from '@/lib/serialize';

const withCount = { _count: { select: { notes: true } } } as const;

// PUT /api/folders/:id — Rename a folder
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const name = (body as { name?: unknown }).name;
  if (typeof name !== 'string' || name.trim() === '') {
    return NextResponse.json({ error: 'Folder name is required' }, { status: 400 });
  }

  const existing = await prisma.folder.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: 'Folder not found' }, { status: 404 });
  }

  const folder = await prisma.folder.update({
    where: { id },
    data: { name: name.trim() },
    include: withCount,
  });
  return NextResponse.json(serializeFolder(folder));
}

// DELETE /api/folders/:id — Delete a folder; its notes return to All Notes via ON DELETE SET NULL
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const existing = await prisma.folder.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: 'Folder not found' }, { status: 404 });
  }

  await prisma.folder.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
```

- [ ] **Step 3: Verify with curl** (dev server + cookie jar from "Dev-Server Verification Setup")

```bash
curl -s -b /tmp/pd-cookies -X POST http://localhost:3000/api/folders \
  -H 'Content-Type: application/json' -d '{"name":"Work"}'
```
Expected: 201 body with `id`, `name: "Work"`, `noteCount: 0`, ISO dates. Save the id as `FID`.

```bash
curl -s -b /tmp/pd-cookies http://localhost:3000/api/folders
```
Expected: array containing Work.

```bash
curl -s -b /tmp/pd-cookies -X POST http://localhost:3000/api/folders \
  -H 'Content-Type: application/json' -d '{"name":"  "}'
```
Expected: `{"error":"Folder name is required"}` (400).

```bash
curl -s -b /tmp/pd-cookies -X PUT http://localhost:3000/api/folders/$FID \
  -H 'Content-Type: application/json' -d '{"name":"Projects"}'
curl -s -b /tmp/pd-cookies -X PUT http://localhost:3000/api/folders/nonexistent \
  -H 'Content-Type: application/json' -d '{"name":"X"}'
curl -s -b /tmp/pd-cookies -X DELETE http://localhost:3000/api/folders/$FID
```
Expected: renamed folder JSON; `{"error":"Folder not found"}` (404); `{"success":true}`.

- [ ] **Step 4: Quality gate**

Run: `npm run format && npm run typecheck && npm run lint` — all pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/folders
git commit -m "feat(api): add folder crud endpoints"
```

---

### Task 4: Notes API accepts folderId

**Files:**
- Modify: `src/app/api/notes/route.ts` (POST only — GET already includes `folderId` because it omits only `content`)
- Modify: `src/app/api/notes/[id]/route.ts` (PUT only)

**Interfaces:**
- Consumes: `prisma.folder` (Task 1).
- Produces: `POST /api/notes` accepts optional `{ folderId }`; `PUT /api/notes/[id]` accepts `folderId` with three-state semantics (omitted = unchanged, `null` = un-file, string = move; unknown folder → 400 `Folder not found`).

- [ ] **Step 1: Rewrite `POST` in `src/app/api/notes/route.ts`**

Change the top import line to `import type { NextRequest } from 'next/server';` plus the existing `NextResponse` import, and replace `POST`:

```ts
// POST /api/notes — Create a new empty note, optionally inside a folder
export async function POST(request: NextRequest) {
  // Body is optional for backward compatibility — an empty body means no folder
  const body: unknown = await request.json().catch(() => ({}));
  const folderId = (body as { folderId?: unknown }).folderId;

  if (folderId != null) {
    if (typeof folderId !== 'string') {
      return NextResponse.json({ error: 'Invalid folderId' }, { status: 400 });
    }
    const folder = await prisma.folder.findUnique({ where: { id: folderId } });
    if (!folder) {
      return NextResponse.json({ error: 'Folder not found' }, { status: 400 });
    }
  }

  const note = await prisma.note.create({
    data: typeof folderId === 'string' ? { folderId } : {},
  });
  return NextResponse.json(serializeNote(note), { status: 201 });
}
```

- [ ] **Step 2: Extend `PUT` in `src/app/api/notes/[id]/route.ts`**

Change the destructuring line to:

```ts
  const { title, content, textContent, mode, isPinned, folderId } = body;
```

After the mode validation block, add:

```ts
  // folderId three-state: omitted = unchanged, null = move to All Notes, string = move to folder
  if (folderId !== undefined && folderId !== null) {
    if (typeof folderId !== 'string') {
      return NextResponse.json({ error: 'Invalid folderId' }, { status: 400 });
    }
    const folder = await prisma.folder.findUnique({ where: { id: folderId } });
    if (!folder) {
      return NextResponse.json({ error: 'Folder not found' }, { status: 400 });
    }
  }
```

In the `prisma.note.update` data object, add one line after the `isPinned` spread:

```ts
      ...(folderId !== undefined && { folderId }),
```

- [ ] **Step 3: Verify with curl**

```bash
FID=$(curl -s -b /tmp/pd-cookies -X POST http://localhost:3000/api/folders \
  -H 'Content-Type: application/json' -d '{"name":"Inbox"}' | sed -E 's/.*"id":"([^"]+)".*/\1/')
curl -s -b /tmp/pd-cookies -X POST http://localhost:3000/api/notes \
  -H 'Content-Type: application/json' -d "{\"folderId\":\"$FID\"}"
```
Expected: 201 note with `"folderId":"<FID>"`. Save its id as `NID`.

```bash
curl -s -b /tmp/pd-cookies -X POST http://localhost:3000/api/notes
```
Expected: 201 note with `"folderId":null` (empty body still works).

```bash
curl -s -b /tmp/pd-cookies -X PUT http://localhost:3000/api/notes/$NID \
  -H 'Content-Type: application/json' -d '{"folderId":null}'
curl -s -b /tmp/pd-cookies -X PUT http://localhost:3000/api/notes/$NID \
  -H 'Content-Type: application/json' -d '{"folderId":"bogus"}'
curl -s -b /tmp/pd-cookies -X PUT http://localhost:3000/api/notes/$NID \
  -H 'Content-Type: application/json' -d '{"title":"hello"}'
```
Expected: `folderId:null`; `{"error":"Folder not found"}` (400); title updated with `folderId` untouched.

```bash
curl -s -b /tmp/pd-cookies http://localhost:3000/api/notes | head -c 400
```
Expected: list items include `"folderId"`.

Also verify SetNull end-to-end: move `NID` into `$FID`, `DELETE /api/folders/$FID`, then `GET /api/notes/$NID` → `"folderId":null`.

- [ ] **Step 4: Quality gate**

Run: `npm run format && npm run typecheck && npm run lint` — all pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/notes
git commit -m "feat(api): accept folderId on note create and update"
```

---

### Task 5: Sidebar folder navigation + page state

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/components/sidebar/Sidebar.tsx`
- Modify: `docs/superpowers/specs/2026-07-18-note-folders-design.md` (one-line amendment, see Step 1)

**Interfaces:**
- Consumes: `folderApi`, `noteApi.create(folderId)` (Task 2), `Folder` type.
- Produces: `Sidebar` props gain `folders: Folder[]`, `activeFolderId: string | null`, `onSelectFolder(id: string | null)`, `onCreateFolder(name: string): Promise<void>`, `onRenameFolder(id: string, name: string): Promise<void>`, `onDeleteFolder(id: string): Promise<void>`. `page.tsx` holds `folders` + `activeFolderId` state (Task 6 reads `folders` from here).

**Design note (spec amendment):** the spec says the page filters notes before passing them to the sidebar. Filtering instead happens **inside Sidebar** (which already does search filtering) because folder note counts must be derived from the *full* list. Behavior is identical.

- [ ] **Step 1: Amend the spec line**

In `docs/superpowers/specs/2026-07-18-note-folders-design.md`, replace:

```
- Notes passed to the sidebar are filtered by `activeFolderId` before the existing search filter.
```

with:

```
- The sidebar receives the full notes list plus `activeFolderId` and filters by folder before the existing search filter (the full list is needed to derive per-folder counts).
```

- [ ] **Step 2: Add folder state to `src/app/page.tsx`**

Change imports:

```ts
import type { Folder, Note } from '@/types';
import { folderApi, noteApi } from '@/lib/api-client';
```

Inside `MainPage`, after the `notes` state line, add:

```ts
  const [folders, setFolders] = useState<Folder[]>([]);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
```

After `loadNotes`, add:

```ts
  const loadFolders = useCallback(async () => {
    const data = await folderApi.list();
    setFolders(data);
  }, []);

  useEffect(() => {
    loadFolders();
  }, [loadFolders]);
```

In `handleCreateNote`, change `const newNote = await noteApi.create();` to:

```ts
    const newNote = await noteApi.create(activeFolderId);
```

and add `activeFolderId` to its dependency array: `[cleanupEmptyNote, loadNotes, activeFolderId]`.

In `handleRefresh`, change `await loadNotes();` to:

```ts
    await Promise.all([loadNotes(), loadFolders()]);
```

and its dependency array to `[loadNotes, loadFolders, activeNoteId]`.

After `handleRefresh`, add the folder handlers:

```ts
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
```

In the JSX, add the new `Sidebar` props:

```tsx
        <Sidebar
          notes={notes}
          folders={folders}
          activeFolderId={activeFolderId}
          onSelectFolder={setActiveFolderId}
          onCreateFolder={handleCreateFolder}
          onRenameFolder={handleRenameFolder}
          onDeleteFolder={handleDeleteFolder}
          activeNoteId={activeNoteId}
          onSelectNote={handleSelectNote}
          onCreateNote={handleCreateNote}
          searchQuery={searchQuery}
          onSearch={setSearchQuery}
          isOpen={isSidebarOpen}
          onToggle={() => setIsSidebarOpen(!isSidebarOpen)}
          onRefresh={handleRefresh}
        />
```

- [ ] **Step 3: Add the folder section to `src/components/sidebar/Sidebar.tsx`**

Update imports:

```ts
import type { Folder, Note } from '@/types';
import {
  Search,
  Plus,
  Pin,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Folder as FolderIcon,
  FolderPlus,
  Pencil,
  Trash2,
} from 'lucide-react';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
```

Extend `SidebarProps`:

```ts
  folders: Folder[];
  activeFolderId: string | null;
  onSelectFolder: (id: string | null) => void;
  onCreateFolder: (name: string) => Promise<void>;
  onRenameFolder: (id: string, name: string) => Promise<void>;
  onDeleteFolder: (id: string) => Promise<void>;
```

Destructure the six new props in the component signature. Add local state next to `isRefreshing`:

```ts
  const [isAddingFolder, setIsAddingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Folder | null>(null);
```

Add handlers after `handleTouchEnd`:

```ts
  const submitNewFolder = async () => {
    const name = newFolderName.trim();
    setIsAddingFolder(false);
    setNewFolderName('');
    if (name) await onCreateFolder(name);
  };

  const submitRename = async () => {
    const id = editingFolderId;
    const name = editingName.trim();
    setEditingFolderId(null);
    if (id && name) await onRenameFolder(id, name);
  };
```

Change the notes filtering to filter by folder first:

```ts
  const folderNotes = activeFolderId
    ? notes.filter((n) => n.folderId === activeFolderId)
    : notes;
  const filteredNotes = folderNotes.filter(
    (n) =>
      n.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      n.textContent.toLowerCase().includes(searchQuery.toLowerCase()),
  );
```

Insert the folder section in the JSX between the Search `div` and the pull-to-refresh indicator `div`:

```tsx
        {/* Folders */}
        <div className="space-y-0.5 border-b border-zinc-800 px-2 pb-3">
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
                {/* Actions: always visible on phone (no hover), hover-revealed on md+ */}
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
```

Before the closing `</aside>`, add the delete confirmation:

```tsx
      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete folder"
        message={`Delete "${deleteTarget?.name}"? Its notes will move to All Notes.`}
        confirmLabel="Delete"
        onConfirm={() => {
          if (deleteTarget) onDeleteFolder(deleteTarget.id);
          setDeleteTarget(null);
        }}
        onCancel={() => setDeleteTarget(null)}
      />
```

- [ ] **Step 4: Verify in the browser** (`npm run dev`, log in at http://localhost:3000)

- "All Notes" row shows total count and is active by default.
- "New Folder" → type name → Enter creates it; Escape/empty cancels.
- Selecting a folder filters the note list; creating a note while inside it files the note there (check by switching folders).
- Rename via pencil (hover on desktop; visible on a narrow phone viewport) persists after reload.
- Delete shows the ConfirmDialog; after confirm, its notes appear in All Notes, and if the folder was selected the view returns to All Notes.
- Search inside a folder only matches that folder's notes.
- Selecting a folder on a phone viewport stays on the list (no jump to editor).

- [ ] **Step 5: Quality gate and commit**

Run: `npm run format && npm run typecheck && npm run lint` — all pass.

```bash
git add src/app/page.tsx src/components/sidebar/Sidebar.tsx docs/superpowers/specs/2026-07-18-note-folders-design.md
git commit -m "feat(sidebar): add folder navigation and management"
```

---

### Task 6: Editor "move to folder" dropdown

**Files:**
- Modify: `src/components/editor/EditorCanvas.tsx`
- Modify: `src/app/page.tsx` (pass `folders` prop)

**Interfaces:**
- Consumes: `folders` state from `page.tsx` (Task 5), `Partial<NotePayload>` update (Task 2).
- Produces: `EditorCanvasProps` gains `folders: Folder[]`. A move sends `persistChange({ folderId })` — nothing else in the payload.

- [ ] **Step 1: Widen `persistChange` and add the move handler in `EditorCanvas.tsx`**

Change the import to `import type { Folder, Note, NotePayload } from '@/types';` and add `Folder as FolderIcon` to the lucide-react import list.

Change the `persistChange` payload type:

```ts
  const persistChange = useCallback(
    (payload: Partial<NotePayload>) => {
```

Add `folders: Folder[];` to `EditorCanvasProps` and destructure it in the component signature.

Add state next to `showExportMenu`:

```ts
  const [showMoveMenu, setShowMoveMenu] = useState(false);
```

Add the handler after `handleTogglePin`:

```ts
  // Sends ONLY { folderId } — a full payload here could clobber content
  // that a pending debounced save hasn't flushed yet (see design spec).
  const handleMoveToFolder = (folderId: string | null) => {
    setShowMoveMenu(false);
    setShowOverflowMenu(false);
    if (folderId !== note.folderId) persistChange({ folderId });
  };
```

- [ ] **Step 2: Desktop dropdown**

In the tablet/desktop controls (`hidden ... md:flex` div), insert between the Pin button and the mode-switch button:

```tsx
            <div className="relative">
              <button
                onClick={() => setShowMoveMenu((v) => !v)}
                className="rounded-lg p-2 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-white"
                title="Move to folder"
              >
                <FolderIcon className="h-4 w-4" />
              </button>

              {showMoveMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowMoveMenu(false)} />
                  <div className="absolute top-full right-0 z-50 mt-1 max-h-64 w-44 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-900 py-1 shadow-xl">
                    <button
                      onClick={() => handleMoveToFolder(null)}
                      className={`flex w-full items-center px-4 py-2.5 text-sm transition-colors hover:bg-zinc-800 ${
                        note.folderId === null ? 'text-indigo-400' : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      All Notes
                    </button>
                    {folders.map((folder) => (
                      <button
                        key={folder.id}
                        onClick={() => handleMoveToFolder(folder.id)}
                        className={`flex w-full items-center px-4 py-2.5 text-sm transition-colors hover:bg-zinc-800 ${
                          note.folderId === folder.id
                            ? 'text-indigo-400'
                            : 'text-zinc-400 hover:text-white'
                        }`}
                      >
                        <span className="truncate">{folder.name}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
```

- [ ] **Step 3: Phone overflow-menu entry**

The overflow toggle and its backdrop currently reset `showExportMenu`; make them reset `showMoveMenu` too:

```ts
                onClick={() => {
                  setShowOverflowMenu((v) => {
                    if (v) {
                      setShowExportMenu(false);
                      setShowMoveMenu(false);
                    }
                    return !v;
                  });
                }}
```

and on the backdrop:

```ts
                    onClick={() => {
                      setShowOverflowMenu(false);
                      setShowExportMenu(false);
                      setShowMoveMenu(false);
                    }}
```

Inside the overflow dropdown, insert a "Move to" toggle + submenu (same pattern as Export) between the Copy button and the Export button:

```tsx
                    <button
                      onClick={() => setShowMoveMenu((v) => !v)}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
                    >
                      <FolderIcon className="h-4 w-4" />
                      Move to
                    </button>
                    {showMoveMenu && (
                      <div className="max-h-48 overflow-y-auto border-y border-zinc-800 bg-black/20 py-1">
                        <button
                          onClick={() => handleMoveToFolder(null)}
                          className={`flex w-full items-center px-11 py-2 text-sm transition-colors hover:bg-zinc-800 ${
                            note.folderId === null
                              ? 'text-indigo-400'
                              : 'text-zinc-400 hover:text-white'
                          }`}
                        >
                          All Notes
                        </button>
                        {folders.map((folder) => (
                          <button
                            key={folder.id}
                            onClick={() => handleMoveToFolder(folder.id)}
                            className={`flex w-full items-center px-11 py-2 text-sm transition-colors hover:bg-zinc-800 ${
                              note.folderId === folder.id
                                ? 'text-indigo-400'
                                : 'text-zinc-400 hover:text-white'
                            }`}
                          >
                            <span className="truncate">{folder.name}</span>
                          </button>
                        ))}
                      </div>
                    )}
```

- [ ] **Step 4: Pass `folders` from `page.tsx`**

Add `folders={folders}` to the `<EditorCanvas ... />` props.

- [ ] **Step 5: Verify in the browser**

- Desktop: folder button between pin and mode; current location highlighted indigo; moving a note into a folder while "All Notes" is selected keeps it visible; moving it out of the active folder removes it from the list but keeps it open (per spec).
- Race check: type into a note and immediately move it — after ~2s reload the page; the typed content AND the new folder must both be persisted.
- Phone viewport: overflow menu → Move to → submenu works.
- Sidebar counts update immediately after a move (no refresh).

- [ ] **Step 6: Quality gate and commit**

Run: `npm run format && npm run typecheck && npm run lint` — all pass.

```bash
git add src/components/editor/EditorCanvas.tsx src/app/page.tsx
git commit -m "feat(editor): add move to folder dropdown"
```

---

### Task 7: Documentation and deployment notes

**Files:**
- Modify: `CLAUDE.md`
- Modify: `.claude/rules/database.md`

**Interfaces:** none — docs only.

- [ ] **Step 1: Update `CLAUDE.md`**

- In "Server-side", change the schema line to: `prisma/schema.prisma` — `Note` and `Folder` models (SQLite). Note fields: id, title, content, textContent, mode, isPinned, folderId, createdAt, updatedAt. Folder fields: id, name, createdAt, updatedAt; `Note.folderId` is nullable with `onDelete: SetNull`.
- Add the folders API routes to the route list: `src/app/api/folders/route.ts` — GET: lists folders with note counts (createdAt asc). POST: creates folder. `src/app/api/folders/[id]/route.ts` — PUT: rename. DELETE: delete (notes return to All Notes via SetNull).
- In "Vercel + Turso", append the new migration to the `turso db shell` list using the actual generated directory name: `turso db shell your-database < prisma/migrations/<timestamp>_add_note_folders/migration.sql`.
- In the `page.tsx` description, mention the `folders` / `activeFolderId` state alongside the existing state list.

- [ ] **Step 2: Update `.claude/rules/database.md`**

Change "Single `Note` model in `prisma/schema.prisma`." to "`Note` and `Folder` models in `prisma/schema.prisma`; `Note.folderId` is a nullable FK with `onDelete: SetNull`."

- [ ] **Step 3: Full quality gate**

Run: `npm run lint && npm run format:check && npm run typecheck` — all pass.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md .claude/rules/database.md
git commit -m "docs(config): document folder model and deployment migration"
```
