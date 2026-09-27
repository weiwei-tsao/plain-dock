# PlainDock

A self-hosted, minimalist Markdown note-taking app. Every note is edited in one CodeMirror Markdown editor with an Edit/Preview toggle and a heading outline, and is stored as canonical Markdown. Pasted content is always inserted as plain text; clipboard HTML is intentionally ignored. Fully responsive across phone, tablet, and desktop.

[中文文档](README.zh.md)

## Features

- **Markdown editor with preview** — a CodeMirror 6 Markdown editor with a formatting toolbar and an Edit/Preview toggle; Preview renders the unsaved draft (raw HTML in notes is shown as text) and a heading outline jumps to sections
- **Folders** — organize notes into folders alongside "All Notes"; create, rename, and delete folders inline (deleting a folder moves its notes back to All Notes)
- **Plain-text paste** — pasted content is always inserted as plain text; clipboard HTML is intentionally ignored
- **Auto-save** — 1-second debounced saves with a sequential request queue to prevent race conditions
- **Pin & search** — pin notes to the top; search filters by title and text content simultaneously
- **Copy & download** — copy a note's Markdown to the clipboard; download it as a `.md` file with the title as an `# H1` heading
- **Tabs & links** — each tab keeps its folder/note in the URL, so reloads restore it; right-click (or Cmd/Ctrl/middle-click) a note or folder to open it in a new tab; lists refresh when you switch back to a window
- **Responsive three-pane layout** — Folders | Notes | Editor on desktop (1024px+) with resizable panes whose widths are remembered and a collapsible folder pane; Notes + Editor on tablet (768–1023px) with folders as an overlay; a stacked Notes → Folders → Editor flow on phones (< 768px)
- **Password-protected** — single shared password with JWT session cookies (httpOnly, 30-day expiry)
- **Edge middleware** — verifies the session JWT's HMAC-SHA256 signature and expiry on every request in Edge Runtime (Web Crypto API)
- **SQLite-compatible storage** - local/Docker use file SQLite; Vercel can use Turso/libSQL
- **Docker-ready** — multi-stage Dockerfile with standalone Next.js output; migrations run automatically on container start

## Getting Started

**Prerequisites:** Node.js 20+

1. Install dependencies:
   ```bash
   npm install
   ```

2. Set up environment variables in `.env`:
   ```
   DATABASE_URL="file:./dev.db"
   APP_PASSWORD="your-password"
   JWT_SECRET="your-secret"
   ```
   This local path uses file-backed SQLite. `TURSO_AUTH_TOKEN` is not needed unless `DATABASE_URL` points to Turso/libSQL.

   > Prisma CLI reads `.env` by default. If you use `.env.local`, add `--env-file .env.local` to Prisma commands. Both files are gitignored.

3. Run the initial database migration:
   ```bash
   npx prisma migrate dev
   ```

4. Start the dev server:
   ```bash
   npm run dev
   ```
   Open `http://localhost:3000`.

## Docker Deployment

1. Create a `.env` file with your secrets:
   ```
   APP_PASSWORD="your-password"
   JWT_SECRET="your-secret"
   ```
   > `DATABASE_URL` is not needed for Docker - it is hardcoded in `docker-compose.yml` as `file:/app/data/notes.db`.

2. Build and start:
   ```bash
   docker compose up -d
   ```

3. Open `http://localhost:3000`.

**Subsequent commands:**

| Command | Description |
|---------|-------------|
| `docker compose down` | Stop the container |
| `docker compose up -d --build` | Rebuild after code changes |
| `docker compose logs -f` | Stream container logs |

Data is persisted to `./data/notes.db` on the host via a volume mount — safe across restarts and rebuilds. Migrations run automatically on every container start.

Docker Compose generates the container name from the project and service name. If an older PlainDock container created by a previous version still owns the fixed name `plaindock`, `docker compose up -d` may fail with `container name "/plaindock" is already in use`. Inspect and remove that stale container before starting:

```bash
docker ps -a --filter "name=^/plaindock$"
docker rm -f plaindock
docker compose up -d
```

Removing the stale container does not delete `./data/notes.db`.

### Manual Docker Sync from Turso

To replace the local Docker SQLite data with a snapshot from the online Turso database, add the Turso sync settings to `.env`:

```env
TURSO_DATABASE_URL="libsql://your-db.turso.io"
TURSO_AUTH_TOKEN="your-token"
```

Then stop the app container and run the manual sync command:

```bash
docker compose down
npm run docker:sync-from-turso
docker compose up -d
```

The command reads `.env`, prepares `./data/notes.db`, backs up any existing database to `./data/backups/` including SQLite WAL sidecar files when present, then replaces local Docker `Folder` and `Note` rows with the Turso snapshot.

For Docker-only hosts, rebuild the image and run the same script inside a one-off container:

```bash
docker compose build
docker compose down
docker compose run --rm plaindock node scripts/sync-turso-to-docker.mjs
docker compose up -d
```

## Vercel Deployment with Turso

Vercel serverless functions cannot persist writes to a local SQLite file. Use Turso/libSQL for Vercel while keeping the Prisma schema on SQLite.

1. Create a Turso database, copy its `libsql://` URL, and create an auth token.

2. Set Vercel environment variables:
   ```env
   DATABASE_URL="libsql://your-db.turso.io"
   TURSO_AUTH_TOKEN="your-token"
   APP_PASSWORD="your-password"
   JWT_SECRET="your-secret"
   ```

3. Apply the Prisma migration SQL files to Turso manually with Turso CLI or the Turso dashboard SQL console. For a fresh database, apply the migration files in timestamp order:
   ```bash
   turso db shell your-database < prisma/migrations/20260214025810_init/migration.sql
   turso db shell your-database < prisma/migrations/20260628035117_empty_title_default/migration.sql
   turso db shell your-database < prisma/migrations/20260719031554_add_note_folders/migration.sql
   ```
   Apply any future `prisma/migrations/*/migration.sql` files the same way before deploying code that depends on them.

4. Deploy to Vercel.

For existing local SQLite data, back up the database first, import it with Turso CLI tooling, verify the remote `Note` rows, then apply any schema migration SQL files that are not already represented in the imported database. Do not rely on Vercel's filesystem for note persistence.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server with Turbopack on port 3000 |
| `npm run build` | Production build |
| `npm run start` | Start production server on port 3000 |
| `npm run lint` | ESLint check |
| `npm run lint:fix` | ESLint auto-fix |
| `npm run format` | Prettier format |
| `npm run format:check` | Prettier check (no write) |
| `npm run docker:sync-from-turso` | Manually replace Docker SQLite data with a backed-up Turso snapshot |
| `npm test` | Run the Vitest test suite |
| `npm run test:watch` | Run Vitest in watch mode |
| `npm run test:e2e` | Run the Playwright E2E suite (setup in `e2e/README.md`) |
| `npm run typecheck` | TypeScript type check |
| `npx prisma migrate dev` | Create and apply database migrations |
| `npx prisma studio` | Browse the database via GUI |

## Architecture

```
Browser
  └── Next.js App Router (src/app/)
        ├── /login            Login page
        ├── /                 Main editor page
        └── /api/
              ├── auth/       Login · Logout
              ├── notes/      CRUD + full note detail
              └── folders/    List with counts · create · rename · delete

Client Components (src/components/)
  ├── sidebar/
  │     ├── FolderSidebar     All Notes + folders, inline create/rename/delete
  │     ├── NotesList         Note list, search, pin indicators, pull-to-refresh
  │     └── ResizeHandle      Draggable divider between panes
  └── editor/
        ├── EditorCanvas      Editor shell: Edit/Preview toggle, auto-save, paste handling, note actions
        ├── MarkdownEditor    CodeMirror 6 wrapper
        ├── MarkdownPreview   Preview pane (sole HTML rendering boundary) + MarkdownOutline
        └── RichToolbar       Markdown formatting toolbar

Server Libraries (src/lib/)
  ├── db.ts                   Prisma singleton; file SQLite or Turso/libSQL by DATABASE_URL
  ├── auth.ts                 JWT sign/verify (server-only)
  ├── serialize.ts            Prisma → client type conversion (server-only)
  └── markdown/               Shared Markdown functions (paste detection, plain-text projection, formatting, search, preview HTML)

Middleware (src/middleware.ts)
  └── Edge Runtime — JWT HMAC-SHA256 signature + expiry check on every request
```

## Tech Stack

- **Next.js 16** — App Router, Turbopack, standalone output
- **React 19** + **TypeScript** (strict)
- **Prisma** + **SQLite/libSQL** (file SQLite locally/in Docker, Turso on Vercel)
- **Tailwind CSS v4** (PostCSS plugin, no config file)
- **CodeMirror 6** — Markdown editor with syntax highlighting
- **Lucide React** — icons
- **jsonwebtoken** — JWT signing and verification
