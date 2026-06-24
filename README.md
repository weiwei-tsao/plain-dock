# PlainDock

A self-hosted, minimalist dual-mode note-taking app. Each note operates in **Plain Text** or **Rich Text** mode, with a 3-layer HTML sanitization pipeline that cleans pasted content for safe, consistent formatting. Fully responsive across phone, tablet, and desktop.

[中文文档](README.zh.md)

## Features

- **Dual-mode editing** — switch between plain text (`<textarea>`) and rich text (Tiptap) per note; switching to plain strips formatting with a confirmation
- **3-layer paste sanitization** — security stripping → tag normalization → structure downgrade (tables to text, media to placeholders)
- **Auto-save** — 1-second debounced saves with a sequential request queue to prevent race conditions
- **Pin & search** — pin notes to the top; search filters by title and text content simultaneously
- **Copy options** — copy as plain text or rich HTML to clipboard
- **Mobile-responsive** — stacked single-panel layout on phones (< 768px), narrower sidebar on tablet (768–1023px), full layout on desktop (1024px+)
- **Collapsible sidebar** — collapse/expand on tablet and desktop; hidden on phone via back-button navigation
- **Password-protected** — single shared password with JWT session cookies (httpOnly, 30-day expiry)
- **Edge middleware** — lightweight JWT expiry check in Edge Runtime; full HMAC-SHA256 verification in API routes
- **SQLite storage** — persistent data via Prisma with WAL mode; no external database required
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
   > `DATABASE_URL` is not needed — it is hardcoded in `docker-compose.yml`.

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
              └── notes/      CRUD + full note detail

Client Components (src/components/)
  ├── Sidebar                 Note list, search, pin indicators
  └── editor/
        ├── EditorCanvas      Dual-mode editor, auto-save, paste handling
        └── RichToolbar       Tiptap formatting toolbar

Server Libraries (src/lib/)
  ├── db.ts                   Prisma singleton (server-only)
  ├── auth.ts                 JWT sign/verify (server-only)
  ├── serialize.ts            Prisma → client type conversion (server-only)
  └── sanitizer/              3-layer HTML sanitization pipeline (client-side)

Middleware (src/middleware.ts)
  └── Edge Runtime — JWT structure + expiry check on every request
```

## Tech Stack

- **Next.js 16** — App Router, Turbopack, standalone output
- **React 19** + **TypeScript** (strict)
- **Prisma** + **SQLite** (WAL mode)
- **Tailwind CSS v4** (PostCSS plugin, no config file)
- **Tiptap** — rich text editor with StarterKit + Underline extension
- **Lucide React** — icons
- **jsonwebtoken** — JWT signing and verification
