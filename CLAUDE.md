# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is PlainDock

PlainDock is a minimalist dual-mode text sanitizer and note-taking app. Notes can operate in PLAIN (plain text) or RICH (semantic HTML via Tiptap) mode. It features a 3-layer HTML sanitization pipeline (security → normalization → structure downgrade) and persists all data to localStorage.

## Development Commands

- `npm run dev` — Start dev server on port 3000
- `npm run build` — Production build via Vite
- `npm run preview` — Preview production build

No test runner or linter is configured.

## Architecture

**Stack:** React 19 + TypeScript, Vite, Tailwind CSS (loaded via CDN in index.html), Tiptap rich text editor, Lucide icons.

**Path alias:** `@/*` maps to the project root (configured in both tsconfig.json and vite.config.ts).

**Key modules:**

- `App.tsx` — Root component. Manages auth state, note list, active note selection. Gates everything behind a `Login` screen (token stored in `localStorage`).
- `components/EditorCanvas.tsx` — The main editor. Handles dual-mode editing (Tiptap for RICH, textarea for PLAIN), auto-save with 1s debounce, sequential save queue (`requestQueue`), paste sanitization, mode switching, and clipboard copy (plain + rich).
- `components/Sidebar.tsx` — Note list with search filtering, pin indicators, collapsible panel.
- `components/Login.tsx` — Simple password gate; accepts any non-empty password in current implementation.
- `services/noteService.ts` — CRUD layer over `localStorage` (`plaindock_notes` key). All methods are async (returns Promises) despite being synchronous under the hood. Notes sorted by pinned status then updatedAt.
- `lib/sanitizer.ts` — 3-layer HTML sanitization: (1) strip dangerous elements, (2) normalize tags (`div→p`, `b→strong`, `i→em`), (3) downgrade structures (tables→tab-separated text, media→placeholders). Also exports `wrapPlainText` (text→HTML paragraphs) and `getNoteTextContent` (HTML→plain text).
- `types.ts` — Shared types: `Note`, `NotePayload`, `NoteMode` enum (PLAIN/RICH), `SaveState`.

**Environment:** `GEMINI_API_KEY` can be set in `.env.local` and is exposed as `process.env.API_KEY` and `process.env.GEMINI_API_KEY` via Vite's `define` config (not currently used in the app code).

**Styling:** Tailwind is loaded from CDN (`<script src="https://cdn.tailwindcss.com">`), not as a build dependency. Custom Tiptap/ProseMirror styles are in `index.html <style>` block. Dark theme throughout (black/zinc palette with indigo accents).
