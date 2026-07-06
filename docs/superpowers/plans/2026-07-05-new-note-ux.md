# New Note UX (Auto-Focus + Untitled Placeholder) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a user creates a new note, the cursor lands directly in the content area, and the empty title field visually reads "Untitled" (matching the sidebar's existing fallback) instead of looking blank.

**Architecture:** Two independent, small changes to the existing client-side note-taking UI. No backend, schema, or migration changes — `title` continues to default to `""` in the DB; "Untitled" stays a display-only convention. Auto-focus is implemented as a one-shot flag passed from the page-level state (`src/app/page.tsx`) down into the editor component (`src/components/editor/EditorCanvas.tsx`), consumed inside the editor's existing note-sync effect.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript strict, Tiptap (`@tiptap/react`) for RICH mode, plain `<textarea>` for PLAIN mode.

## Global Constraints

- No test runner is configured in this repo (confirmed via `package.json` — no jest/vitest/playwright). Verification in this plan is manual (dev server + browser) plus the repo's existing mechanical gates: `npm run typecheck`, `npm run lint`, `npm run format:check`.
- Follow `@/*` path alias imports — never relative paths (per `.claude/rules/nextjs.md`).
- Commit messages: `type(scope): description`, imperative, lowercase, ≤ 12 words, no trailing period (per `.claude/rules/git.md`). Use `scope: editor`.
- No schema or migration changes — `title` stays `@default("")` in `prisma/schema.prisma`, unchanged.
- No new dependencies.

---

### Task 1: Change title input placeholder to "Untitled"

**Files:**
- Modify: `src/components/editor/EditorCanvas.tsx:344`

**Interfaces:**
- No new interfaces. Pure text-attribute change on an existing `<input>`.

- [ ] **Step 1: Read the current line to confirm context**

The title `<input>` currently reads (`src/components/editor/EditorCanvas.tsx:340-346`):
```tsx
          <input
            type="text"
            value={localTitle}
            onChange={handleTitleChange}
            placeholder="Note Title"
            className="min-w-0 flex-1 bg-transparent text-lg font-medium text-zinc-100 placeholder-zinc-800 focus:outline-none md:text-xl"
          />
```

- [ ] **Step 2: Change the placeholder text**

Change:
```tsx
            placeholder="Note Title"
```
to:
```tsx
            placeholder="Untitled"
```

- [ ] **Step 3: Manual verification — dev server**

Run: `npm run dev`

In the browser:
1. Log in, create a new note (sidebar "+" or "Create New Note" button).
2. Confirm the title field shows grey "Untitled" placeholder text (not "Note Title").
3. Type some content in the body without touching the title.
4. Confirm the sidebar entry for this note shows "Untitled" as its title.
5. Click into the title field and confirm typing works normally (placeholder disappears, real text is entered, autosaves after ~1s).

Expected: title placeholder reads "Untitled"; sidebar and editor both read "Untitled" for an untouched title; typing behaves normally.

- [ ] **Step 4: Run mechanical checks**

Run: `npm run typecheck && npm run lint && npm run format:check`
Expected: all three pass with no errors (this is a text-only string change, so no type or lint impact is expected).

- [ ] **Step 5: Commit**

```bash
git add src/components/editor/EditorCanvas.tsx
git commit -m "fix(editor): show untitled placeholder in title field"
```

---

### Task 2: Auto-focus editor content on new note creation

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/components/editor/EditorCanvas.tsx`

**Interfaces:**
- Produces (on `EditorCanvasProps`, consumed by `page.tsx`):
  - `autoFocus?: boolean` — when true, the component focuses its content area once (RICH editor or PLAIN textarea) the next time it syncs to a new `note.id`, then calls `onAutoFocusHandled`.
  - `onAutoFocusHandled?: () => void` — called exactly once, right after the auto-focus fires, so the parent can clear its one-shot flag.
- Consumes (in `page.tsx`): no new external interfaces — uses existing `noteApi.create()`, `setActiveNoteId`, `setMobileView` already present in `handleCreateNote`.

- [ ] **Step 1: Add one-shot `autoFocusNote` state in `page.tsx`**

In `src/app/page.tsx`, next to the existing state declarations (around line 21), add:
```tsx
  const [mobileView, setMobileView] = useState<'list' | 'editor'>('list');
  const [autoFocusNote, setAutoFocusNote] = useState(false);
  const editorRef = useRef<EditorCanvasHandle>(null);
```
(Only the `autoFocusNote` line is new — `mobileView` and `editorRef` already exist and are shown for placement context.)

- [ ] **Step 2: Set the flag in `handleCreateNote`**

Change (`src/app/page.tsx:72-79`):
```tsx
  const handleCreateNote = useCallback(async () => {
    await cleanupEmptyNote();
    const newNote = await noteApi.create();
    setNotes((prev) => sortNotes([newNote, ...prev]));
    setActiveNoteId(newNote.id);
    setMobileView('editor');
    loadNotes().catch(() => {});
  }, [cleanupEmptyNote, loadNotes]);
```
to:
```tsx
  const handleCreateNote = useCallback(async () => {
    await cleanupEmptyNote();
    const newNote = await noteApi.create();
    setNotes((prev) => sortNotes([newNote, ...prev]));
    setActiveNoteId(newNote.id);
    setAutoFocusNote(true);
    setMobileView('editor');
    loadNotes().catch(() => {});
  }, [cleanupEmptyNote, loadNotes]);
```

- [ ] **Step 3: Pass the prop and callback to `EditorCanvas`**

Change (`src/app/page.tsx:126-133`):
```tsx
        {activeNote ? (
          <EditorCanvas
            ref={editorRef}
            note={activeNote}
            onUpdate={handleUpdateNoteLocally}
            onDelete={() => handleDeleteNote(activeNote.id)}
            onBack={handleBack}
          />
        ) : (
```
to:
```tsx
        {activeNote ? (
          <EditorCanvas
            ref={editorRef}
            note={activeNote}
            onUpdate={handleUpdateNoteLocally}
            onDelete={() => handleDeleteNote(activeNote.id)}
            onBack={handleBack}
            autoFocus={autoFocusNote}
            onAutoFocusHandled={() => setAutoFocusNote(false)}
          />
        ) : (
```

- [ ] **Step 4: Add the new props to `EditorCanvasProps` in `EditorCanvas.tsx`**

Change (`src/components/editor/EditorCanvas.tsx:82-87`):
```tsx
interface EditorCanvasProps {
  note: Note;
  onUpdate: (note: Note) => void;
  onDelete: () => void;
  onBack?: () => void;
}
```
to:
```tsx
interface EditorCanvasProps {
  note: Note;
  onUpdate: (note: Note) => void;
  onDelete: () => void;
  onBack?: () => void;
  autoFocus?: boolean;
  onAutoFocusHandled?: () => void;
}
```

- [ ] **Step 5: Destructure the new props in the component signature**

Change (`src/components/editor/EditorCanvas.tsx:93-96`):
```tsx
const EditorCanvas = forwardRef<EditorCanvasHandle, EditorCanvasProps>(function EditorCanvas(
  { note, onUpdate, onDelete, onBack },
  ref,
) {
```
to:
```tsx
const EditorCanvas = forwardRef<EditorCanvasHandle, EditorCanvasProps>(function EditorCanvas(
  { note, onUpdate, onDelete, onBack, autoFocus, onAutoFocusHandled },
  ref,
) {
```

- [ ] **Step 6: Extend the note-sync effect to focus on creation**

Change (`src/components/editor/EditorCanvas.tsx:178-189`):
```tsx
  useEffect(() => {
    currentModeRef.current = note.mode;
    if (syncedNoteIdRef.current === note.id) return;
    syncedNoteIdRef.current = note.id;
    if (editor) {
      editor.commands.setContent(note.content, false);
    }
    setLocalTitle(note.title);
    setPlainContent(note.content);
    plainContentRef.current = note.content;
    setSaveState('IDLE');
  }, [note.id, note.title, editor, note.content, note.mode]);
```
to:
```tsx
  useEffect(() => {
    currentModeRef.current = note.mode;
    if (syncedNoteIdRef.current === note.id) return;
    syncedNoteIdRef.current = note.id;
    if (editor) {
      editor.commands.setContent(note.content, false);
    }
    setLocalTitle(note.title);
    setPlainContent(note.content);
    plainContentRef.current = note.content;
    setSaveState('IDLE');
    if (autoFocus) {
      if (note.mode === NoteMode.RICH) {
        editor?.commands.focus();
      } else {
        textareaRef.current?.focus();
      }
      onAutoFocusHandled?.();
    }
  }, [note.id, note.title, editor, note.content, note.mode, autoFocus, onAutoFocusHandled]);
```

**Why this is safe from re-firing:** the `syncedNoteIdRef.current === note.id` guard at the top returns early on every re-render after the first sync for a given `note.id`. Even though `autoFocus` and `onAutoFocusHandled` are in the dependency array (satisfying `react-hooks/exhaustive-deps`) and `onAutoFocusHandled` is a new function identity on every parent render, the guard prevents the focus logic and the callback from running more than once per note.

- [ ] **Step 7: Manual verification — desktop, both modes**

Run: `npm run dev`

In the browser (desktop width ≥ 1024px):
1. Click "Create New Note" (or the sidebar "+"). Confirm the cursor is active in the content textarea immediately (PLAIN mode is the default for new notes) — start typing right away without clicking, and confirm characters appear.
2. Select an *existing* note from the sidebar. Confirm focus is NOT stolen (clicking the sidebar item should not auto-place the cursor in the editor body).
3. Switch the new note to RICH mode, create another new note, and confirm the cursor still lands in the content area (Tiptap editor) on creation.

- [ ] **Step 8: Manual verification — phone width**

In the browser dev tools, set viewport to phone width (< 768px):
1. From the note list view, tap "+" to create a new note.
2. Confirm the view switches to the editor and the cursor/keyboard focus is in the content area.

- [ ] **Step 9: Run mechanical checks**

Run: `npm run typecheck && npm run lint && npm run format:check`
Expected: all three pass with no errors.

- [ ] **Step 10: Commit**

```bash
git add src/app/page.tsx src/components/editor/EditorCanvas.tsx
git commit -m "feat(editor): auto-focus content area on new note creation"
```

---

## Post-Plan Manual Regression Check

After both tasks are complete, do one end-to-end pass combining both behaviors:

1. Create a new note, confirm cursor is in the content area and title placeholder reads "Untitled".
2. Type content only (no title), navigate away, come back — confirm the note persisted and still shows "Untitled" in both sidebar and title field.
3. Create a new note, type nothing at all, navigate away — confirm the note was deleted (not present in the sidebar after refresh).
4. Create a new note, type a custom title only (no content), navigate away — confirm the note is kept (existing cleanup behavior unchanged).
