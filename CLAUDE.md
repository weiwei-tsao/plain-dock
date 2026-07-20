# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is PlainDock

PlainDock is a self-hosted, minimalist dual-mode note-taking app. Each note operates in either PLAIN (plain text) or RICH (semantic HTML via Tiptap) mode. Pasted HTML content goes through a 3-layer sanitization pipeline (security stripping → tag normalization → structure downgrade). Data is persisted through SQLite-compatible storage via Prisma: file SQLite locally/in Docker, Turso/libSQL on Vercel. Authentication uses a single shared password (`APP_PASSWORD` env var) with JWT sessions stored in httpOnly cookies.

## Development Commands

```bash
npm install              # Install deps + auto-runs `prisma generate` via postinstall
npm run dev              # Next.js dev server with Turbopack on port 3000
npm run build            # Production build
npm run start            # Start production server on port 3000
npm run lint             # ESLint check on src/
npm run lint:fix         # ESLint auto-fix
npm run format           # Prettier format src/
npm run format:check     # Prettier check (no write)
npm run typecheck        # TypeScript type check (tsc --noEmit)
npx prisma migrate dev   # Create/apply migrations during development
npx prisma studio        # GUI for browsing the SQLite database
```

No test runner is configured.

## Environment Variables

**Local development** - set all three in `.env` (recommended) or `.env.local` (both gitignored):
- `DATABASE_URL` - Prisma connection string (default: `file:./dev.db`, stored at `prisma/dev.db`)
- `APP_PASSWORD` - Single shared password for login
- `JWT_SECRET` - Secret for signing JWT tokens

**Docker** - only `APP_PASSWORD` and `JWT_SECRET` are needed in `.env`; `DATABASE_URL` is hardcoded in `docker-compose.yml` as `file:/app/data/notes.db`.

**Vercel + Turso** - set all four in Vercel project settings:
- `DATABASE_URL` - Turso/libSQL connection string, e.g. `libsql://your-db.turso.io`
- `TURSO_AUTH_TOKEN` - Turso database auth token
- `APP_PASSWORD` - Single shared password for login
- `JWT_SECRET` - Secret for signing JWT tokens

**Important:** Prisma CLI reads `.env` by default. If using `.env.local`, add `--env-file .env.local` to Prisma commands. Next.js reads both files (with `.env.local` taking precedence). `TURSO_AUTH_TOKEN` is required only when `DATABASE_URL` points to Turso/libSQL.

## Architecture

**Stack:** Next.js 16 (App Router, Turbopack), React 19, TypeScript (strict), Prisma + SQLite/libSQL, Tailwind CSS v4 (PostCSS plugin), Tiptap rich text editor, Lucide icons. Docker-ready with standalone output; Vercel-ready with Turso.

**Path alias:** `@/*` maps to `./src/*`.

**Detailed conventions** are in `.claude/rules/` (api, auth, components, database, docker, git, nextjs, sanitizer, styling) — these are auto-loaded by Claude Code and cover patterns not repeated here.

**Available skills** — invoke with `/skill-name`:

| Skill | When to use |
|-------|-------------|
| `/git-commit` | Stage, validate quality gate, and create a Conventional Commits message (≤ 12 words) |
| `/db-migrate` | Full Prisma schema change workflow — migrate, generate, sync types, verify |
| `/add-note-field` | Add a new field to the Note model across all 6 affected files |
| `/new-api-route` | Scaffold a new API route with all project conventions and boilerplate |
| `/deploy` | Pre-deploy quality gate + Docker build and container launch |
| `/extend-sanitizer` | Add allowed tags, dangerous tags, CSS properties, or tag normalizations to the sanitizer |
| `/create-pr` | Draft a PR title (≤ 12 words) and description (≤ 60 words) against a specified target branch |

### Server-side

- `prisma/schema.prisma` — `Note` and `Folder` models (SQLite). Note fields: id, title, content, textContent, mode, isPinned, folderId, createdAt, updatedAt. Folder fields: id, name, createdAt, updatedAt; `Note.folderId` is nullable with `onDelete: SetNull`.
- `src/lib/db.ts` - Singleton PrismaClient. Uses file SQLite for `DATABASE_URL=file:...` with WAL mode enabled; uses Turso/libSQL adapter for `DATABASE_URL=libsql://...` or `https://...`. Imports `server-only`.
- `src/lib/auth.ts` — JWT sign/verify using `jsonwebtoken`. Imports `server-only`.
- `src/lib/serialize.ts` — Converts Prisma `Note` (with Date fields) to the client `Note` type (with ISO string dates). Imports `server-only`.
- `src/middleware.ts` — Protects all routes except `/login` and `/api/auth`. Runs in Edge Runtime so does lightweight JWT structure+expiry check only (full crypto verification happens in API routes).
- `src/app/api/auth/login/route.ts` — POST: validates `APP_PASSWORD`, sets httpOnly JWT cookie.
- `src/app/api/auth/logout/route.ts` — POST: clears the session cookie.
- `src/app/api/notes/route.ts` — GET: lists notes (content field omitted for lightweight response). POST: creates empty note.
- `src/app/api/notes/[id]/route.ts` — GET: full note with content. PUT: partial update. DELETE.
- `src/app/api/folders/route.ts` — GET: lists folders with note counts (createdAt asc). POST: creates folder.
- `src/app/api/folders/[id]/route.ts` — PUT: rename. DELETE: delete (notes return to All Notes via SetNull).

### Client-side

- `src/app/page.tsx` — Main page (`'use client'`). Holds `notes`, `activeNoteId`, `activeNote`, `isSidebarOpen`, `folders`, `activeFolderId`, and `mobileView` (`'list' | 'editor'`) state. `mobileView` drives the stacked single-panel layout on phones — selecting or creating a note switches to `'editor'`; deleting the active note or pressing the back button returns to `'list'`. On tablet/desktop both panels are always visible via `md:contents`/`md:flex` overrides.
- `src/app/login/page.tsx` — Login form, calls `/api/auth/login`, redirects to `/` on success.
- `src/lib/api-client.ts` — Typed fetch wrapper (`noteApi`) for all `/api/notes` endpoints.
- `src/components/editor/EditorCanvas.tsx` — Dual-mode editor: Tiptap for RICH, `<textarea>` for PLAIN. Auto-saves with 1s debounce and sequential request queue (`requestQueue` ref). Handles paste sanitization, mode switching, pin toggle, clipboard copy (plain + rich HTML). Accepts optional `onBack` prop (used on phones for back navigation). Header is a single row on all screen sizes: back button (phone only) + title + save indicator + pin + mode + overflow menu (phone only) + full action bar (tablet/desktop only).
- `src/components/editor/RichToolbar.tsx` — Formatting toolbar for Tiptap. Horizontally scrollable single row on phone; wraps on tablet/desktop.
- `src/components/sidebar/Sidebar.tsx` — Note list with search filtering, pin indicators. Width is `w-full md:w-56 lg:w-80`. Collapse toggle is hidden on phone (navigation is handled by `mobileView` in `page.tsx`).

### Responsive Design

Three-tier layout using Tailwind CSS v4 defaults — no custom breakpoints:

| Tier    | Prefix | Width     | Layout                                      |
|---------|--------|-----------|---------------------------------------------|
| Phone   | —      | < 768px   | Stacked: sidebar OR editor, one at a time   |
| Tablet  | `md:`  | 768–1023px | Side-by-side; sidebar `w-56`               |
| Desktop | `lg:`  | 1024px+   | Side-by-side; sidebar `w-80`                |

No centralized theme or CSS variables — colors are inline Tailwind classes. ProseMirror/Tiptap styles use hardcoded hex in `globals.css`. The `docs/mobile-ux-responsive-design.md` file captures the full design rationale and trade-offs.

### Sanitizer (`src/lib/sanitizer/`)

Client-side 3-layer HTML sanitization pipeline for pasted content:
1. **Security** (`config.ts` → `DANGEROUS_TAGS`): strips `script`, `style`, `iframe`, `object`, `meta`
2. **Normalization** (`normalize.ts` → `TAG_NORMALIZE_MAP`): `div→p`, `b→strong`, `i→em`
3. **Structure downgrade**: tables→tab-separated `<p>`, media→`[TAG: src]` placeholders

Allowlisted tags and styles defined in `config.ts`.

## Running the App

### Local (without Docker)

```bash
npm install
npx prisma migrate dev   # only needed once, or after schema changes
npm run dev              # dev mode with hot reload
# OR
npm run build && npm run start  # production mode
```

- Requires Node.js installed on the machine.
- Migrations must be run manually.
- Database lives at `prisma/dev.db`.

### Docker

```bash
docker compose up -d           # build image and start container
docker compose down            # stop
docker compose up -d --build   # rebuild after code changes
```

- Requires Docker installed. No Node.js needed on the host.
- Migrations run automatically on container startup.
- Database is persisted to `./data/notes.db` via volume mount.
- `Dockerfile` uses a multi-stage build (deps → build → standalone runner).
- Container auto-restarts on crash (`restart: unless-stopped`).

### Vercel + Turso

```bash
turso db shell your-database < prisma/migrations/20260214025810_init/migration.sql
turso db shell your-database < prisma/migrations/20260628035117_empty_title_default/migration.sql
turso db shell your-database < prisma/migrations/20260719031554_add_note_folders/migration.sql
```

- Requires a Turso database and auth token.
- Set `DATABASE_URL`, `TURSO_AUTH_TOKEN`, `APP_PASSWORD`, and `JWT_SECRET` in Vercel.
- Apply migration SQL files to Turso manually with Turso CLI or the Turso dashboard SQL console.
- Prisma Migrate CLI targets local/Docker SQLite here; do not use `DATABASE_URL=libsql://... prisma migrate deploy`.
- Apply future `prisma/migrations/*/migration.sql` files in timestamp order before deploying code that depends on them.
- Migrations are manual; do not add automatic Vercel build-time migrations unless explicitly requested.
- Vercel cannot persist notes to a local SQLite file.
