# Docker Manual Turso Sync Design

**Date:** 2026-07-23
**Status:** Approved

## Problem

PlainDock supports two production-like storage modes today:

- Docker uses file-backed SQLite at `./data/notes.db` through the container path `/app/data/notes.db`.
- Vercel uses Turso/libSQL through `DATABASE_URL=libsql://...` and `TURSO_AUTH_TOKEN`.

Issue #26 asks for a way to bring online data into Docker. The requested behavior is not automatic startup sync. It should be a manual option or command that the operator runs intentionally.

## Goals

- Add a manual command that imports the online Turso dataset into the local Docker SQLite database.
- Keep Docker startup unchanged.
- Back up the existing local Docker database before replacing data.
- Keep the sync one-way: Turso to local Docker SQLite.
- Import both `Folder` and `Note` rows.
- Fail clearly when Turso environment variables are missing.
- Document the command in English and Chinese READMEs.

## Non-Goals

- No automatic sync on `docker compose up`.
- No bidirectional sync.
- No conflict resolution or merge strategy.
- No writes back to Turso.
- No new database schema.

## Operator Interface

Add an npm script:

```bash
npm run docker:sync-from-turso
```

Required environment variables:

```env
TURSO_DATABASE_URL="libsql://your-db.turso.io"
TURSO_AUTH_TOKEN="your-token"
```

Optional environment variable:

```env
DOCKER_DATABASE_PATH="./data/notes.db"
```

The command imports into `DOCKER_DATABASE_PATH`, defaulting to the same host file used by `docker-compose.yml`.

The command reads `.env` before validating configuration. Shell environment variables override matching `.env` values.

## Data Flow

1. Validate `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`.
2. Resolve `DOCKER_DATABASE_PATH`, creating its parent directory if needed.
3. If the local database file already exists, copy it to `./data/backups/notes-YYYYMMDD-HHMMSS.db`, including SQLite `-wal` and `-shm` sidecar files when present.
4. Run `prisma migrate deploy` against the local SQLite file so the schema exists.
5. Read all folders and notes from Turso.
6. In a local SQLite transaction, delete existing notes and folders, then insert the Turso folders and notes.
7. Print a concise summary with imported row counts and backup path.

## Replace Semantics

The sync command replaces local Docker data with the online Turso snapshot. This avoids ambiguous merges because the current schema has no per-source versioning, sync cursor, or conflict metadata.

## Safety

The command is manual and destructive to the local Docker dataset, so it must always create a backup before replacing an existing local database. It should not require the Docker container to be running. If Docker is running and writing to the same SQLite file, the operator should stop it first.

The Docker image should include the sync script so operators without a local Node install can run it with `docker compose run --rm plaindock node scripts/sync-turso-to-docker.mjs`.

## Testing

Add focused Node tests around the sync helper logic:

- Missing Turso environment variables fail with clear messages.
- The default Docker database path resolves to `./data/notes.db`.
- An existing database file is backed up under `data/backups`.

Run mechanical checks:

```bash
npm run test:sync
npm run typecheck
npm run lint
```
