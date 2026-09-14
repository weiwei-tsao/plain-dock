# Playwright E2E Suite

Deterministic, scripted golden-path tests. Not CI-gated (see issue #39) — run
locally on demand.

## Setup

1. Point `DATABASE_URL` at a disposable database, not your everyday `dev.db`
   — tests create and delete their own notes/folders but still write real
   rows and could collide with notes you're actively editing.
2. Start the app against that database with a known `APP_PASSWORD`:
   ```bash
   DATABASE_URL="file:./prisma/e2e.db" APP_PASSWORD="test-password" JWT_SECRET="test-secret" \
     npx prisma migrate deploy
   DATABASE_URL="file:./prisma/e2e.db" APP_PASSWORD="test-password" JWT_SECRET="test-secret" \
     npm run dev
   ```
3. In another terminal, run the suite with the same password:
   ```bash
   APP_PASSWORD="test-password" npm run test:e2e
   ```

Set `PLAYWRIGHT_BASE_URL` if the dev server isn't on `http://localhost:3000`.

## Scope

Covers the golden path only: login, note CRUD, PLAIN/RICH mode switch, paste
sanitization, folder workflows, and search (including the Cmd/Ctrl+K focus
behavior per viewport tier from #40). Visual/exploratory checks that can't be
expressed as a DOM assertion belong to Layer 3 (browser-use), not here.
