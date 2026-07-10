# Merge Export Buttons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the separate `.txt` and `.md` export controls with one Download control whose menu lets the user select the target format.

**Architecture:** Keep the existing export conversion and download handlers unchanged. Add one UI state flag for the export-format menu, close it alongside the existing overflow menu where needed, and replace duplicate export buttons in `EditorCanvas.tsx` with a single export trigger plus format choices.

**Tech Stack:** React 19, Next.js 16 client component, Tiptap export helpers already in `EditorCanvas.tsx`, lucide-react `Download` icon, Tailwind CSS utility classes. No new dependency.

---

## File Structure

- Modify: `src/components/editor/EditorCanvas.tsx`
  - Owns the existing export handlers (`handleExportTxt`, `handleExportMd`) and header controls.
  - Add `showExportMenu` state next to the existing `showOverflowMenu` state.
  - Replace the two mobile overflow export rows with one expandable Export row and two format menu items.
  - Replace the two tablet/desktop export buttons with one Download button and a small dropdown menu.

## Constraints

- Do not change `sanitizeFilename`, `downloadTextFile`, `nodeToText`, `nodeToMarkdown`, `handleExportTxt`, or `handleExportMd`; this is a UI consolidation only.
- Both formats remain available for both `NoteMode.PLAIN` and `NoteMode.RICH`.
- On mobile, the format choices live inside the existing overflow menu.
- On tablet/desktop, one Download button opens a format menu positioned under that button.
- The outside-click layers must close menus without leaving stale open state.
- No new tests are currently configured in this repo. Verification uses `npm run typecheck`, `npm run lint`, `npm run format:check`, and manual browser checks.

---

### Task 1: Add Export Menu State

**Files:**
- Modify: `src/components/editor/EditorCanvas.tsx`

- [ ] **Step 1: Add the state flag**

Find the current header/menu state block near the top of `EditorCanvas`:

```tsx
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showModeConfirm, setShowModeConfirm] = useState(false);
  const [modeConfirmHasImages, setModeConfirmHasImages] = useState(false);
  const [showOverflowMenu, setShowOverflowMenu] = useState(false);
```

Replace it with:

```tsx
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showModeConfirm, setShowModeConfirm] = useState(false);
  const [modeConfirmHasImages, setModeConfirmHasImages] = useState(false);
  const [showOverflowMenu, setShowOverflowMenu] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
```

- [ ] **Step 2: Run typecheck to verify the new state compiles**

Run:

```bash
npm run typecheck
```

Expected: PASS. `showExportMenu` may be unused until Task 2; if TypeScript or ESLint complains about unused state in this repo, continue to Task 2 before running the full verification command.

- [ ] **Step 3: Commit**

```bash
git add src/components/editor/EditorCanvas.tsx
git commit -m "refactor(editor): track export menu state"
```

---

### Task 2: Merge Mobile Export Rows Into One Expandable Menu

**Files:**
- Modify: `src/components/editor/EditorCanvas.tsx`

- [ ] **Step 1: Update the mobile overflow trigger to reset nested export state when closing**

Find the mobile overflow trigger:

```tsx
              <button
                onClick={() => setShowOverflowMenu((v) => !v)}
                className="rounded-lg p-2.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-white"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
```

Replace it with:

```tsx
              <button
                onClick={() => {
                  setShowOverflowMenu((v) => {
                    if (v) setShowExportMenu(false);
                    return !v;
                  });
                }}
                className="rounded-lg p-2.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-white"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
```

- [ ] **Step 2: Update the mobile outside-click layer to close both menus**

Find:

```tsx
                  <div className="fixed inset-0 z-40" onClick={() => setShowOverflowMenu(false)} />
```

Replace it with:

```tsx
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => {
                      setShowOverflowMenu(false);
                      setShowExportMenu(false);
                    }}
                  />
```

- [ ] **Step 3: Replace the two mobile export buttons with one expandable Export row**

Find this block inside the mobile overflow menu:

```tsx
                    <button
                      onClick={() => {
                        handleExportTxt();
                        setShowOverflowMenu(false);
                      }}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
                    >
                      <Download className="h-4 w-4" />
                      Export .txt
                    </button>
                    <button
                      onClick={() => {
                        handleExportMd();
                        setShowOverflowMenu(false);
                      }}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
                    >
                      <Download className="h-4 w-4" />
                      Export .md
                    </button>
```

Replace it with:

```tsx
                    <button
                      onClick={() => setShowExportMenu((v) => !v)}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
                    >
                      <Download className="h-4 w-4" />
                      Export
                    </button>
                    {showExportMenu && (
                      <div className="border-y border-zinc-800 bg-black/20 py-1">
                        <button
                          onClick={() => {
                            handleExportTxt();
                            setShowExportMenu(false);
                            setShowOverflowMenu(false);
                          }}
                          className="flex w-full items-center justify-between px-11 py-2 text-sm text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
                        >
                          <span>Text</span>
                          <span className="rounded-sm border border-current px-1 text-[9px] font-black">
                            TXT
                          </span>
                        </button>
                        <button
                          onClick={() => {
                            handleExportMd();
                            setShowExportMenu(false);
                            setShowOverflowMenu(false);
                          }}
                          className="flex w-full items-center justify-between px-11 py-2 text-sm text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
                        >
                          <span>Markdown</span>
                          <span className="rounded-sm border border-current px-1 text-[9px] font-black">
                            MD
                          </span>
                        </button>
                      </div>
                    )}
```

- [ ] **Step 4: Update the mobile Delete action to close export state too**

Find the mobile Delete menu button:

```tsx
                    <button
                      onClick={() => {
                        setShowDeleteConfirm(true);
                        setShowOverflowMenu(false);
                      }}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-red-400 transition-colors hover:bg-red-400/10"
                    >
```

Replace it with:

```tsx
                    <button
                      onClick={() => {
                        setShowDeleteConfirm(true);
                        setShowExportMenu(false);
                        setShowOverflowMenu(false);
                      }}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-red-400 transition-colors hover:bg-red-400/10"
                    >
```

- [ ] **Step 5: Verify mobile behavior**

Run:

```bash
npm run typecheck
```

Expected: PASS.

Manual check with `npm run dev`:

- At a mobile-width viewport, open a note.
- Tap the overflow button.
- Confirm there is one `Export` row, not separate `Export .txt` and `Export .md` rows.
- Tap `Export`; confirm `Text` and `Markdown` choices appear.
- Tap `Text`; confirm a `.txt` file downloads and the overflow menu closes.
- Open again, tap `Export`, tap `Markdown`; confirm a `.md` file downloads and the overflow menu closes.
- Open again, tap outside the menu; confirm both the overflow menu and export choices close.

- [ ] **Step 6: Commit**

```bash
git add src/components/editor/EditorCanvas.tsx
git commit -m "refactor(editor): merge mobile export actions"
```

---

### Task 3: Merge Desktop Export Buttons Into One Dropdown

**Files:**
- Modify: `src/components/editor/EditorCanvas.tsx`

- [ ] **Step 1: Replace the two desktop export buttons with one menu trigger**

Find this desktop action-bar block:

```tsx
            <button
              onClick={handleExportTxt}
              className="flex items-center gap-1.5 rounded-lg p-2 text-zinc-500 transition-all hover:bg-zinc-800 hover:text-white"
              title="Export as .txt"
            >
              <Download className="h-4 w-4" />
              <span className="rounded-sm border border-current px-1 text-[9px] font-black">
                TXT
              </span>
            </button>

            <button
              onClick={handleExportMd}
              className="flex items-center gap-1.5 rounded-lg p-2 text-zinc-500 transition-all hover:bg-zinc-800 hover:text-white"
              title="Export as .md"
            >
              <Download className="h-4 w-4" />
              <span className="rounded-sm border border-current px-1 text-[9px] font-black">
                MD
              </span>
            </button>
```

Replace it with:

```tsx
            <div className="relative">
              <button
                onClick={() => setShowExportMenu((v) => !v)}
                className="rounded-lg p-2 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-white"
                title="Export"
              >
                <Download className="h-4 w-4" />
              </button>

              {showExportMenu && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setShowExportMenu(false)}
                  />
                  <div className="absolute top-full right-0 z-50 mt-1 w-36 rounded-lg border border-zinc-800 bg-zinc-900 py-1 shadow-xl">
                    <button
                      onClick={() => {
                        handleExportTxt();
                        setShowExportMenu(false);
                      }}
                      className="flex w-full items-center justify-between px-3 py-2 text-sm text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
                    >
                      <span>Text</span>
                      <span className="rounded-sm border border-current px-1 text-[9px] font-black">
                        TXT
                      </span>
                    </button>
                    <button
                      onClick={() => {
                        handleExportMd();
                        setShowExportMenu(false);
                      }}
                      className="flex w-full items-center justify-between px-3 py-2 text-sm text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
                    >
                      <span>Markdown</span>
                      <span className="rounded-sm border border-current px-1 text-[9px] font-black">
                        MD
                      </span>
                    </button>
                  </div>
                </>
              )}
            </div>
```

- [ ] **Step 2: Verify desktop behavior**

Run:

```bash
npm run typecheck
```

Expected: PASS.

Manual check with `npm run dev`:

- At a tablet/desktop-width viewport, confirm there is one Download icon button, not two download buttons with `TXT` and `MD` badges.
- Click the Download button; confirm a menu opens with `Text`/`TXT` and `Markdown`/`MD`.
- Click `Text`; confirm a `.txt` file downloads and the menu closes.
- Click Download again, then `Markdown`; confirm a `.md` file downloads and the menu closes.
- Click Download again, then click outside the dropdown; confirm the menu closes.

- [ ] **Step 3: Commit**

```bash
git add src/components/editor/EditorCanvas.tsx
git commit -m "refactor(editor): merge desktop export buttons"
```

---

### Task 4: Full Verification

**Files:**
- Verify: `src/components/editor/EditorCanvas.tsx`

- [ ] **Step 1: Run static checks**

Run:

```bash
npm run typecheck && npm run lint && npm run format:check
```

Expected: all three pass with no errors.

- [ ] **Step 2: Run manual end-to-end checks**

Run:

```bash
npm run dev
```

Expected: Next.js starts on port `3000`.

Manual checks:

- PLAIN note, mobile viewport: `Export -> Text` downloads `<sanitized-title>.txt` with raw note content.
- PLAIN note, mobile viewport: `Export -> Markdown` downloads `<sanitized-title>.md` with the same raw note content.
- RICH note, mobile viewport: `Export -> Text` downloads `.txt` using the existing plain-text conversion.
- RICH note, mobile viewport: `Export -> Markdown` downloads `.md` using the existing Markdown conversion.
- Repeat the same four checks on tablet/desktop viewport from the single Download dropdown.
- Confirm Copy, Pin, Mode switch, and Delete controls still work and do not leave the export menu open.

- [ ] **Step 3: Format if needed**

If `npm run format:check` fails only because formatting changed, run:

```bash
npm run format
npm run format:check
```

Expected: formatting check passes after `npm run format`.

- [ ] **Step 4: Final commit**

Only if Task 4 caused additional formatting edits:

```bash
git add src/components/editor/EditorCanvas.tsx
git commit -m "style(editor): format merged export menu"
```

If no files changed in Task 4, do not create an empty commit.

---

## Self-Review

- Spec coverage: The plan preserves both export formats and replaces separate download buttons with one export menu on mobile and desktop.
- Placeholder scan: No `TBD`, `TODO`, or undefined helper names remain.
- Type consistency: `showExportMenu`, `setShowExportMenu`, `handleExportTxt`, and `handleExportMd` names are consistent across all tasks.
