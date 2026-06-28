---
description: Structured bug diagnosis and resolution — no code changes until root cause is confirmed
---

# Structured Bug Fix

Phased approach: diagnose fully before touching any code.

## Phase 1: Gather Context (read-only)

Ask the user for:
1. **Error message or symptom** — exact text, console error, or screenshot description
2. **Reproduction steps** — what actions trigger it
3. **Mode** — PLAIN or RICH, or both
4. **Suspected area** — editor, sidebar, API, sanitizer, auth, or unknown

If the user already provided some of this, skip asking for what's already known.

---

## Phase 2: Trace the Full Data Flow

Work through the project's architecture layers systematically. Follow the data — do not stop at the first suspicious file.

### Data flow layers:

**Client action path:**
```
User interaction (page.tsx state: notes, activeNoteId, mobileView)
  → Component prop callback (onSelectNote / onCreateNote / onDelete)
  → noteApi call (src/lib/api-client.ts)
  → API route (src/app/api/notes/ or src/app/api/notes/[id]/)
  → Prisma query (src/lib/db.ts singleton)
  → SQLite (prisma/dev.db or /app/data/notes.db in Docker)
  → serializeNote() (src/lib/serialize.ts) → response JSON
  → Component state update → re-render
```

**Paste / sanitizer path:**
```
Paste event (EditorCanvas.tsx handlePaste / textarea onPaste)
  → clipboard image → resizeImageToDataURL() → insertContentAt()
  → clipboard HTML  → sanitizeHTML() (src/lib/sanitizer/index.ts)
      Layer 1: strip DANGEROUS_TAGS (config.ts)
      Layer 2: TAG_NORMALIZE_MAP (normalize.ts)
      Layer 3: table/media downgrade
  → clipboard text  → wrapPlainText()
  → editor.commands.insertContent() / setPlainContent()
  → triggerSave() debounce → persistChange() → noteApi.update()
```

**Auth path:**
```
Request → middleware.ts (Edge Runtime, HMAC-SHA256 JWT check)
  → Public paths: /login, /api/auth/* — bypass
  → Protected: verify plaindock_session cookie
  → API route → verifyToken() (src/lib/auth.ts, server-only)
```

### Cross-cutting concerns to always check:
- **Server-only boundary**: `db.ts`, `auth.ts`, `serialize.ts` import `server-only` — never imported from `'use client'` files or Edge middleware
- **Stale closures in `useEditor`**: `handlePaste` and `onUpdate` capture `note` at mount time — use refs (`syncedNoteIdRef`, `currentModeRef`, `plainContentRef`) for values that must stay current
- **Request queue**: `requestQueue` ref in EditorCanvas chains saves sequentially — concurrent saves must go through it
- **Mode guard**: operations that differ by mode (`PLAIN` / `RICH`) must check `note.mode` or `currentModeRef.current`, not stale closure values
- **Serialization**: Prisma returns `Date` objects; API responses must go through `serializeNote()` before returning JSON
- **`params` is a Promise**: Next.js 16 route params — always `await params` before destructuring

### Read files at each relevant layer

Use codegraph_explore / Grep / Read to trace the actual code. Do not assume — verify each hop.

---

## Phase 3: Present Diagnosis — Wait for Confirmation

Before writing a single line of code, present:

```
## Diagnosis

**Root cause**: <one sentence>

**Evidence**:
- <file:line> — <what it shows>
- <file:line> — <what it shows>

**Files that need changes**:
1. `path/to/file.ts` — <what needs to change and why>
2. `path/to/file.ts` — <what needs to change and why>
...

**No code has been changed yet. Confirm to proceed.**
```

Do not proceed to Phase 4 until the user confirms.

---

## Phase 4: Implement the Fix

Apply changes to **all** identified files — not just the most obvious one.

Checklist before marking done:
- [ ] Every file from the diagnosis has been addressed
- [ ] No hardcoded secrets or fallback values for `JWT_SECRET` / `APP_PASSWORD`
- [ ] No new `any` types introduced unless unavoidable (cast with a local type instead)
- [ ] `serializeNote()` called before returning any Prisma note to the client
- [ ] New API routes follow conventions: `await params`, `NextResponse.json()`, correct status codes
- [ ] Sanitizer changes go through the 3-layer pipeline — do not bypass layers
- [ ] Image paste guards: check `syncedNoteIdRef` and `currentModeRef` for async operations
- [ ] No `server-only` modules imported from client components

---

## Phase 5: Verify

Run all three checks — they must all pass before closing:

```bash
npm run lint
npm run format:check
npm run typecheck
```

If Prettier fails, run `npx prettier --write src/` then re-check. Report results. If any check fails, fix before closing.

---

## Key Pitfalls (learned from this project)

- **Stale `note` closure in `useEditor`** — `handlePaste` / `onUpdate` capture `note` at mount and never update. Use `syncedNoteIdRef.current` (not `note.id`) to get the current note identity inside async callbacks.
- **`currentModeRef` before the early-return guard** — the note-sync effect has an early return when note ID hasn't changed; `currentModeRef.current = note.mode` must come BEFORE that guard or mode-only changes won't update the ref.
- **Image base64 round-trip** — Tiptap's Image extension does not accept `data:` URLs by default; `allowBase64: true` must be set or images disappear on `setContent()`.
- **`insertContentAt` vs `setImage`** — `setImage` always uses the live selection; for async inserts, capture `view.state.selection.from` synchronously and use `insertContentAt(pos, ...)`.
- **`overflow-hidden` clips absolutely-positioned children** — sidebar toggle button at `-right-3` is clipped when the aside has both `w-0` and `overflow-hidden`. Move `overflow-hidden` to the inner content div only.
- **`nodeToText` leaf nodes** — `hardBreak` has no `content` array and hits the `return ''` branch; it must be handled explicitly as `'\n'` before the empty-content guard.
- **`params` is a Promise in Next.js 16** — `const { id } = await params`, not `params.id` directly.
- **Sanitizer layer order matters** — normalization (Layer 2) runs before structure downgrade (Layer 3); adding a tag to `ALLOWED_TAGS` without considering the downgrade layer may still strip it.

---

**Architecture reference**: `CLAUDE.md` and `.claude/rules/`
**API conventions**: `.claude/rules/api.md`
**Sanitizer rules**: `.claude/rules/sanitizer.md`
**Styling conventions**: `.claude/rules/styling.md`
**Shared types**: `src/types.ts`
**Sanitizer config**: `src/lib/sanitizer/config.ts`
