# Empty Note Mode Switch Save State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent an empty newly-created note from showing `SAVED` when switching from Plain mode to Rich mode, while preserving normal save feedback for notes with a title or content.

**Architecture:** Keep the persistence path in `EditorCanvas.tsx`, but add an explicit UI-state option to `persistChange` so callers can choose whether a successful update should surface `SAVING`/`SAVED`. Use that option only for the empty-note Plain→Rich mode switch. The API payload can still persist the mode/content normalization, but the save indicator will represent meaningful user content saves.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Tiptap rich editor, Tailwind CSS v4. This repository has no test runner configured; verification uses `npm run format:check`, `npm run typecheck`, `npm run lint`, and browser checks.

## Global Constraints

- Modify only `src/components/editor/EditorCanvas.tsx`.
- Do not add a test framework.
- Preserve the existing 1s debounced save behavior for title/content edits.
- Preserve the existing sequential request queue in `requestQueue`.
- Preserve mode persistence: after switching an empty note to Rich mode and reloading before leaving the note, it may still load as Rich.
- The visible save state should remain meaningful: `SAVED` means a title/content/pin/folder update was surfaced to the user, not that an empty note's internal representation changed.
- Existing folder move behavior must continue sending only `{ folderId }`.

---

## File Structure

- Modify: `src/components/editor/EditorCanvas.tsx`
  - Extend `persistChange` with optional UI feedback settings.
  - Add a small local helper to detect an empty draft state.
  - Use silent persistence for empty Plain→Rich mode switching only.

---

### Task 1: Silent Persistence for Empty Plain-to-Rich Switch

**Files:**
- Modify: `src/components/editor/EditorCanvas.tsx:315-404`

**Interfaces:**
- Consumes:
  - `persistChange(payload: Partial<NotePayload>)`
  - `localTitle: string`
  - `plainContentRef.current: string`
  - `wrapPlainText(text: string): string`
  - `getNoteTextContent(html: string): string`
- Produces:
  - `persistChange(payload: Partial<NotePayload>, options?: { showSaveState?: boolean }): void`
  - `hasMeaningfulDraftContent(): boolean`

- [ ] **Step 1: Update `persistChange` to accept UI feedback options**

Change the current function signature and save-state writes from:

```ts
  const persistChange = useCallback(
    (payload: Partial<NotePayload>) => {
      setSaveState('SAVING');
      requestQueue.current = requestQueue.current.then(async () => {
        try {
          const updated = await noteApi.update(note.id, payload);
          onUpdate(updated);
          setLocalTitle(updated.title);
          setSaveState('SAVED');
          setTimeout(() => setSaveState('IDLE'), 2000);
        } catch {
          setSaveState('FAILED');
        }
      });
    },
    [note.id, onUpdate],
  );
```

to:

```ts
  const persistChange = useCallback(
    (payload: Partial<NotePayload>, options: { showSaveState?: boolean } = {}) => {
      const showSaveState = options.showSaveState ?? true;
      if (showSaveState) setSaveState('SAVING');

      requestQueue.current = requestQueue.current.then(async () => {
        try {
          const updated = await noteApi.update(note.id, payload);
          onUpdate(updated);
          setLocalTitle(updated.title);

          if (showSaveState) {
            setSaveState('SAVED');
            setTimeout(() => setSaveState('IDLE'), 2000);
          }
        } catch {
          if (showSaveState) setSaveState('FAILED');
        }
      });
    },
    [note.id, onUpdate],
  );
```

Rationale: `persistChange` remains the single queueing/persistence path, but individual callers can suppress save-state UI when the update is internal bookkeeping.

- [ ] **Step 2: Add an explicit empty-draft helper**

Add this helper after `handleMoveToFolder` and before `handleSwitchMode`:

```ts
  const hasMeaningfulDraftContent = () =>
    localTitle.trim() !== '' || plainContentRef.current.trim() !== '';
```

Rationale: this matches the existing empty-note cleanup policy in `src/app/page.tsx`, which treats empty title plus empty text content as disposable.

- [ ] **Step 3: Make empty Plain→Rich mode switching silent**

Change the Plain→Rich branch inside `handleSwitchMode` from:

```ts
    } else {
      const richHTML = wrapPlainText(plainContentRef.current);
      editor?.commands.setContent(richHTML);
      persistChange({
        content: richHTML,
        textContent: getNoteTextContent(richHTML),
        mode: NoteMode.RICH,
      });
    }
```

to:

```ts
    } else {
      const richHTML = wrapPlainText(plainContentRef.current);
      editor?.commands.setContent(richHTML);
      persistChange(
        {
          content: richHTML,
          textContent: getNoteTextContent(richHTML),
          mode: NoteMode.RICH,
        },
        { showSaveState: hasMeaningfulDraftContent() },
      );
    }
```

Expected behavior:
- Empty title and empty content: update can persist, but no `SAVING` or `SAVED` indicator appears.
- Non-empty title or non-empty content: existing `SAVING` then `SAVED` indicator still appears.

- [ ] **Step 4: Run static verification**

Run:

```bash
npm run format:check
npm run typecheck
npm run lint
```

Expected:
- `format:check` passes or reports only the touched file needing formatting.
- `typecheck` passes with no TypeScript errors.
- `lint` passes with no ESLint errors.

If `format:check` fails because of the touched file, run:

```bash
npm run format
npm run format:check
npm run typecheck
npm run lint
```

Expected: all pass.

- [ ] **Step 5: Browser verification**

Run the app:

```bash
npm run dev
```

Manual checks at `http://localhost:3000`:

- Create a new note.
- Do not type in the title or body.
- Click the mode button to switch from `PLAIN` to `RICH`.
- Expected: the editor switches to Rich mode and does not show `SAVING`, `SAVED`, the green check, or the `SAVED` label.
- Create another new note.
- Type a title only, leave the body empty, then switch from `PLAIN` to `RICH`.
- Expected: `SAVING` then `SAVED` appears.
- Create another new note.
- Type body content only, leave the title empty, then switch from `PLAIN` to `RICH`.
- Expected: `SAVING` then `SAVED` appears.
- In a non-empty note, switch modes and verify content still persists after reload.

- [ ] **Step 6: Commit**

```bash
git add src/components/editor/EditorCanvas.tsx
git commit -m "fix(editor): hide saved state for empty mode switch"
```

---

## Self-Review

- Spec coverage: issue #22 is covered by silent save-state behavior for empty new notes; non-empty notes still show save feedback.
- Placeholder scan: no placeholders remain.
- Type consistency: `persistChange` keeps existing callers valid because the new options parameter is optional.
