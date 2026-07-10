# Vercel Turso Deployment Design

**Date:** 2026-07-10
**Status:** Approved

## Problem

PlainDock currently persists notes with Prisma backed by a local SQLite file. That works for local development and Docker because the database file lives on a persistent filesystem or a Docker volume. It does not work on Vercel serverless functions because local filesystem writes are temporary and may happen on different function instances.

The goal is to support Vercel deployment without losing note data, while preserving the existing local SQLite and Docker SQLite workflows with the smallest practical code change.

## Goals

- Keep local development using file-backed SQLite.
- Keep Docker deployment using file-backed SQLite at `/app/data/notes.db`.
- Add Vercel support using Turso/libSQL as the remote SQLite-compatible database.
- Keep `prisma/schema.prisma` on `provider = "sqlite"`.
- Keep the existing `Note` table, field types, and migrations.
- Avoid automatic Turso migrations during Vercel build or function startup.
- Keep the change focused on database connection setup, scripts, and documentation.

## Out of Scope

- No switch to PostgreSQL, Neon, or Vercel Postgres.
- No schema redesign.
- No multi-user auth or per-user databases.
- No automated data import inside the application.
- No Docker change to use Turso by default.
- No Vercel build-command migration hook.

## Chosen Approach

Use `DATABASE_URL` to choose the Prisma runtime connection:

- `file:...` means normal Prisma SQLite.
- `libsql://...` or `https://...` means Turso/libSQL through Prisma's libSQL adapter.

This avoids a new `DATABASE_PROVIDER` environment variable and keeps each deployment mode easy to configure.

## Runtime Connection Design

`src/lib/db.ts` continues to export the existing `prisma` singleton. The initialization logic changes from unconditional `new PrismaClient()` to a small branch based on `DATABASE_URL`.

For local and Docker SQLite:

- Use `new PrismaClient()` exactly as today.
- Preserve the development global singleton pattern.
- Continue executing `PRAGMA journal_mode = WAL;`.
- Ignore `TURSO_AUTH_TOKEN`.

For Turso/libSQL:

- Add dependencies:
  - `@prisma/adapter-libsql`
  - `@libsql/client`
- Import `PrismaLibSql` from `@prisma/adapter-libsql`.
- Create the adapter with:
  - `url: process.env.DATABASE_URL`
  - `authToken: process.env.TURSO_AUTH_TOKEN`
- Create Prisma with `new PrismaClient({ adapter })`.
- Do not run `PRAGMA journal_mode = WAL;`, because this is a remote libSQL connection.

`TURSO_AUTH_TOKEN` is required only when `DATABASE_URL` is `libsql://...` or `https://...`. If that token is missing in Turso mode, the app should fail early with an explicit error that names `TURSO_AUTH_TOKEN`.

## Environment Variables

### Local Development

Local development keeps the current `.env` shape:

```env
DATABASE_URL="file:./dev.db"
APP_PASSWORD="your-password"
JWT_SECRET="your-secret"
```

The local setup remains:

```bash
npm install
npx prisma migrate dev
npm run dev
```

### Docker

Docker keeps `docker-compose.yml` as the source of `DATABASE_URL`:

```env
DATABASE_URL=file:/app/data/notes.db
```

The `./data:/app/data` volume continues to persist data. The Dockerfile's container-start `prisma migrate deploy` command remains in place for Docker SQLite.

### Vercel

Vercel uses Turso:

```env
DATABASE_URL=libsql://your-db.turso.io
TURSO_AUTH_TOKEN=your-token
APP_PASSWORD=your-password
JWT_SECRET=your-secret
```

Vercel does not use Docker and does not rely on a local SQLite file. The deployment must not depend on writes to the Vercel function filesystem.

## Migrations

Turso migrations are manual.

Add one npm script:

```json
"db:deploy": "prisma migrate deploy"
```

For a fresh Turso database, run from a local shell with Turso environment variables:

```bash
DATABASE_URL="libsql://your-db.turso.io" TURSO_AUTH_TOKEN="your-token" npm run db:deploy
```

The application code will not run `prisma migrate deploy` on Vercel build or serverless startup. This keeps Vercel deploys predictable and avoids writing to the database as a side effect of every deploy.

## Existing Data Import

Data import is documented as an operator task, not implemented in app code.

For an existing local SQLite database:

1. Back up the current SQLite database file.
2. Export or import the local SQLite data with Turso CLI tooling.
3. Verify the remote Turso database has the expected `Note` rows.
4. Run `npm run db:deploy` against Turso if the migration history needs to be applied or reconciled.
5. Set Vercel environment variables and deploy.

Documentation should separate two paths:

- Fresh Turso database: run migrations, then deploy.
- Existing local data: back up, import data, verify, then run or reconcile migrations.

The exact Turso CLI import command can vary by Turso CLI version, so the docs should point the user to Turso's current import command and avoid embedding app-specific import code.

## Documentation Updates

Update:

- `README.md`
- `README.zh.md`
- `CLAUDE.md`

The docs should explain:

- Local SQLite remains the default development path.
- Docker SQLite remains the self-hosted path.
- Vercel requires Turso/libSQL.
- `DATABASE_URL=file:...` and `DATABASE_URL=libsql://...` choose different runtime connection paths automatically.
- `TURSO_AUTH_TOKEN` is required only for Turso.
- Turso migrations are manual with `npm run db:deploy`.

## Error Handling

- Missing `DATABASE_URL`: let Prisma fail as it does today for SQLite mode, or surface a simple explicit error if needed by the implementation.
- `DATABASE_URL=libsql://...` without `TURSO_AUTH_TOKEN`: throw a clear startup error naming `TURSO_AUTH_TOKEN`.
- `DATABASE_URL=https://...` is treated as Turso/libSQL mode for compatibility with libSQL URL forms.
- WAL pragma errors remain swallowed for local SQLite, matching current behavior.
- WAL pragma is skipped entirely for Turso mode.

## Testing

Mechanical checks:

```bash
npm run typecheck
npm run lint
npm run format:check
npm run build
```

Local SQLite verification:

```bash
DATABASE_URL="file:./dev.db" npm run dev
```

Then log in, list notes, create a note, edit it, refresh, and confirm persistence.

Docker SQLite verification:

```bash
docker compose up -d --build
docker compose logs -f
```

Then verify the app starts, migrations run, and `./data/notes.db` persists data across container restarts.

Turso verification:

```bash
DATABASE_URL="libsql://your-db.turso.io" TURSO_AUTH_TOKEN="your-token" npm run db:deploy
npm run build
```

For Vercel, configure `DATABASE_URL`, `TURSO_AUTH_TOKEN`, `APP_PASSWORD`, and `JWT_SECRET`, then deploy and verify note CRUD persists after redeploy.

## Risks and Trade-offs

- Prisma's libSQL adapter adds a relatively new dependency path compared with plain local SQLite.
- Vercel deployment now depends on Turso availability.
- Manual migrations are an operational step the deployer must remember.
- Keeping Docker SQLite separate from Vercel Turso avoids breaking self-hosting, but means docs must clearly explain the two production paths.

The trade-off is acceptable because it keeps the SQLite mental model, preserves existing local and Docker workflows, and makes the Vercel path persistent with minimal application code changes.
