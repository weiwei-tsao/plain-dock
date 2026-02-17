# PlainDock

A self-hosted, minimalist dual-mode note-taking app. Each note operates in **Plain Text** or **Rich Text** mode, with a 3-layer HTML sanitization pipeline that cleans pasted content for safe, consistent formatting.

## Features

- **Dual-mode editing** — switch between plain text and rich text (Tiptap) per note
- **3-layer sanitization** — security stripping, tag normalization, and structure downgrade on paste
- **Auto-save** — 1-second debounced saves with sequential request queue
- **Pin & search** — pin important notes to the top, search by title or content
- **Copy options** — copy as plain text or rich HTML to clipboard
- **Password-protected** — single shared password with JWT session cookies
- **SQLite storage** — persistent data via Prisma, no external database required
- **Docker-ready** — multi-stage Dockerfile with standalone Next.js output

## Getting Started

**Prerequisites:** Node.js 20+

1. Install dependencies:
   ```
   npm install
   ```
2. Set up environment variables in `.env`:
   ```
   DATABASE_URL="file:./dev.db"
   APP_PASSWORD="your-password"
   JWT_SECRET="your-secret"
   ```
   **Note:** Prisma CLI reads `.env` by default. If you use `.env.local`, add the `--env-file .env.local` flag to Prisma commands. Both files are gitignored.

3. Run the initial database migration:
   ```
   npx prisma migrate dev
   ```
4. Start the dev server:
   ```
   npm run dev
   ```
   The app runs at `http://localhost:3000`.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server (Turbopack) on port 3000 |
| `npm run build` | Production build |
| `npm run start` | Start production server on port 3000 |
| `npm run lint` | ESLint check |
| `npm run lint:fix` | ESLint auto-fix |
| `npm run format` | Prettier format |
| `npm run format:check` | Prettier check (no write) |
| `npm run typecheck` | TypeScript type check |
| `npx prisma migrate dev` | Create/apply database migrations |
| `npx prisma studio` | Browse the database via GUI |

## Docker Deployment

1. Create a `.env` file with your secrets:
   ```
   APP_PASSWORD="your-password"
   JWT_SECRET="your-secret"
   ```
2. Build and start the container:
   ```bash
   docker compose up -d
   ```
3. The app runs at `http://localhost:3000`.

**Notes:**
- SQLite data is persisted to `./data` on the host via a volume mount — safe across restarts and rebuilds.
- The container runs migrations automatically on startup.
- To stop: `docker compose down`
- To rebuild after code changes: `docker compose up -d --build`

## Tech Stack

- Next.js 16 (App Router, Turbopack)
- React 19 + TypeScript
- Prisma + SQLite
- Tailwind CSS v4
- Tiptap (rich text editor)
- Lucide React (icons)
