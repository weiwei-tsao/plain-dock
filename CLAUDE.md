# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is PlainDock

PlainDock is a self-hosted, minimalist dual-mode note-taking app. Each note operates in either PLAIN (plain text) or RICH (semantic HTML via Tiptap) mode. Pasted HTML content goes through a 3-layer sanitization pipeline (security stripping → tag normalization → structure downgrade). Data is persisted to SQLite via Prisma. Authentication uses a single shared password (`APP_PASSWORD` env var) with JWT sessions stored in httpOnly cookies.

## Development Commands

```bash
npm install          # Install deps + auto-runs `prisma generate` via postinstall
npm run dev          # Next.js dev server with Turbopack on port 3000
npm run build        # Production build
npm run start        # Start production server on port 3000
npx prisma migrate dev   # Create/apply migrations during development
npx prisma studio        # GUI for browsing the SQLite database
```

No test runner or linter is configured.

## Environment Variables

Set in `.env.local` (gitignored):
- `DATABASE_URL` — Prisma connection string (default: `file:./dev.db` → `prisma/dev.db`)
- `APP_PASSWORD` — Single shared password for login
- `JWT_SECRET` — Secret for signing JWT tokens

## Architecture

**Stack:** Next.js 16 (App Router, Turbopack), React 19, TypeScript (strict), Prisma + SQLite, Tailwind CSS v4 (PostCSS plugin), Tiptap rich text editor, Lucide icons. Docker-ready with standalone output.

**Path alias:** `@/*` maps to `./src/*`.

### Server-side

- `prisma/schema.prisma` — Single `Note` model (SQLite). Fields: id, title, content, textContent, mode, isPinned, createdAt, updatedAt.
- `src/lib/db.ts` — Singleton PrismaClient with WAL mode enabled. Imports `server-only`.
- `src/lib/auth.ts` — JWT sign/verify using `jsonwebtoken`. Imports `server-only`.
- `src/lib/serialize.ts` — Converts Prisma `Note` (with Date fields) to the client `Note` type (with ISO string dates). Imports `server-only`.
- `src/middleware.ts` — Protects all routes except `/login` and `/api/auth`. Runs in Edge Runtime so does lightweight JWT structure+expiry check only (full crypto verification happens in API routes).
- `src/app/api/auth/login/route.ts` — POST: validates `APP_PASSWORD`, sets httpOnly JWT cookie.
- `src/app/api/auth/logout/route.ts` — POST: clears the session cookie.
- `src/app/api/notes/route.ts` — GET: lists notes (content field omitted for lightweight response). POST: creates empty note.
- `src/app/api/notes/[id]/route.ts` — GET: full note with content. PUT: partial update. DELETE.

### Client-side

- `src/app/page.tsx` — Main page (`'use client'`). Manages note list state; fetches full note content on selection via separate GET.
- `src/app/login/page.tsx` — Login form, calls `/api/auth/login`, redirects to `/` on success.
- `src/lib/api-client.ts` — Typed fetch wrapper (`noteApi`) for all `/api/notes` endpoints.
- `src/components/editor/EditorCanvas.tsx` — Dual-mode editor: Tiptap for RICH, `<textarea>` for PLAIN. Auto-saves with 1s debounce and sequential request queue (`requestQueue` ref). Handles paste sanitization, mode switching, pin toggle, clipboard copy (plain + rich HTML).
- `src/components/editor/RichToolbar.tsx` — Formatting toolbar for Tiptap (bold, italic, underline, strike, headings, lists, code block, blockquote, clear formatting).
- `src/components/sidebar/Sidebar.tsx` — Note list with search filtering, pin indicators, collapsible panel.

### Sanitizer (`src/lib/sanitizer/`)

Client-side 3-layer HTML sanitization pipeline for pasted content:
1. **Security** (`config.ts` → `DANGEROUS_TAGS`): strips `script`, `style`, `iframe`, `object`, `meta`
2. **Normalization** (`normalize.ts` → `TAG_NORMALIZE_MAP`): `div→p`, `b→strong`, `i→em`
3. **Structure downgrade**: tables→tab-separated `<p>`, media→`[TAG: src]` placeholders

Allowlisted tags and styles defined in `config.ts`.

## Docker Deployment

`Dockerfile` uses multi-stage build (deps → build → standalone runner). `docker-compose.yml` mounts `./data` for persistent SQLite storage. Requires `APP_PASSWORD` and `JWT_SECRET` env vars.
