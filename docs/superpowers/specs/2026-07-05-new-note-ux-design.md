# New Note UX: Auto-Focus Editor + "Untitled" Title Display

**Date:** 2026-07-05
**Status:** Approved

## Problem

When a user creates a new note, two small UX gaps exist:

1. The cursor does not land in the content area — the user has to click into the editor body before typing.
2. An untitled note's title field looks blank while typing content, which is inconsistent with the sidebar (which already displays "Untitled" as a fallback for empty titles).

## Scope

This is a small, targeted UX change touching three files. No database schema or migration changes.

## Design

### 1. Title storage — unchanged

`title` continues to default to `""` in the DB (`prisma/schema.prisma`, `POST /api/notes`). No changes here. "Untitled" remains a **display-only** convention, never a stored value. This keeps the existing empty-note cleanup logic valid (see below).

### 2. Sidebar list — no change needed

`src/components/sidebar/Sidebar.tsx:154` already renders `note.title || 'Untitled'`. This already satisfies "notes with no title show as Untitled in the list."

### 3. Editor title input placeholder

`src/components/editor/EditorCanvas.tsx:344` — change the title `<input>`'s placeholder text from `"Note Title"` to `"Untitled"`. This makes the empty title field visually consistent with the sidebar's fallback text (both show "Untitled") without changing the underlying stored value or how typing behaves — it's a standard HTML placeholder, so the first keystroke just starts the real title normally.

### 4. Empty-note cleanup — unchanged

`src/app/page.tsx`'s `cleanupEmptyNote` keeps its existing condition:
```ts
if (title.trim() === '' && textContent.trim() === '') {
  // delete
}
```
This remains meaningful and correct because `title` is never silently defaulted to a non-empty value — it only becomes non-empty when the user actually types into it.

**Behavior this produces:**
- Note created, no title typed, no content typed, user navigates away → deleted (both conditions empty).
- Note created, lots of content typed, no title typed, user navigates away → kept (content is non-empty), sidebar shows "Untitled", editor title field shows the "Untitled" placeholder (still logically empty, ready to be typed into).

### 5. Auto-focus editor content on note creation (the one new behavior)

- `src/app/page.tsx`:
  - Add a one-shot boolean state: `const [autoFocusNote, setAutoFocusNote] = useState(false)`.
  - In `handleCreateNote`, right after `setActiveNoteId(newNote.id)`, call `setAutoFocusNote(true)`.
  - Pass `autoFocus={autoFocusNote}` and `onAutoFocusHandled={() => setAutoFocusNote(false)}` to `<EditorCanvas>`.
- `src/components/editor/EditorCanvas.tsx`:
  - Add `autoFocus?: boolean` and `onAutoFocusHandled?: () => void` to `EditorCanvasProps`.
  - Extend the existing note-sync `useEffect` (the one guarded by `syncedNoteIdRef`, which already fires exactly once per note switch) — after syncing content/title for the new note, if `autoFocus` is true:
    - RICH mode: `editor?.commands.focus()`
    - PLAIN mode: `textareaRef.current?.focus()`
    - Then call `onAutoFocusHandled?.()` to clear the parent's flag so it doesn't refire on subsequent re-renders.
  - Only triggers for freshly created notes (via the one-shot flag) — selecting an existing note from the sidebar never steals focus.

## Out of Scope

- No title max-length / input validation change (discussed and deemed low-severity, unrelated to this feature).
- No schema/migration changes.
- No change to focus behavior when merely selecting/switching between existing notes.

## Testing

- Manual: create a new note, confirm cursor lands in the content area (both PLAIN and RICH mode, phone and desktop layouts).
- Manual: create a note, type content only, verify sidebar shows "Untitled" and title field placeholder reads "Untitled".
- Manual: create a note, leave without typing anything, verify it's not persisted (check via sidebar refresh / GET /api/notes).
- Manual: create a note, type a custom title only (no content), leave, verify it is NOT deleted (existing cleanup behavior, unchanged).
