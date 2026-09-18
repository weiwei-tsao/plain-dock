# Playwright E2E Suite

Deterministic, scripted golden-path tests. Not CI-gated (see issue #39) — run
locally on demand.

## Setup

1. Point `DATABASE_URL` at a disposable database, not your everyday `dev.db`
   — tests create and delete their own notes/folders but still write real
   rows and could collide with notes you're actively editing.
2. Start the app against that database with a known `APP_PASSWORD`. Note that
   Prisma resolves a relative `DATABASE_URL` from `prisma/schema.prisma`'s own
   directory, so `file:./e2e.db` here creates `prisma/e2e.db`:
   ```bash
   DATABASE_URL="file:./e2e.db" APP_PASSWORD="test-password" JWT_SECRET="test-secret" \
     npx prisma migrate deploy
   DATABASE_URL="file:./e2e.db" APP_PASSWORD="test-password" JWT_SECRET="test-secret" \
     npm run dev
   ```
3. Install the Playwright browser once, then run the suite with the same
   password:
   ```bash
   npx playwright install chromium
   APP_PASSWORD="test-password" npm run test:e2e
   ```

Set `PLAYWRIGHT_BASE_URL` if the dev server isn't on `http://localhost:3000`.

## Scope

Covers login and note CRUD, the single CodeMirror Markdown editor, Edit/Preview
round-trips, editor and preview state retention, outline navigation, image-paste
completion, responsive outline behavior, plain-text paste handling, folder
workflows, and search. Run stateful scenarios only against the disposable
database described above.
