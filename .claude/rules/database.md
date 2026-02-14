# Prisma & SQLite Patterns

## Prisma Client

- Import the singleton from `@/lib/db` — never instantiate a new `PrismaClient`.
- `db.ts` imports `server-only` — it cannot be used in client components or Edge middleware.
- In development, the client is cached on `globalThis` to survive HMR reloads.

## Schema

- Single `Note` model in `prisma/schema.prisma`.
- SQLite database with WAL mode enabled (set in `db.ts` via `PRAGMA journal_mode = WAL`).
- IDs use `cuid()` default.
- `updatedAt` uses Prisma's `@updatedAt` — automatically set on every update.

## Serialization

- Prisma returns `Date` objects for `createdAt`/`updatedAt`.
- The client `Note` type expects ISO strings.
- Always convert via `serializeNote()` from `@/lib/serialize` before sending to the client.
- `serialize.ts` imports `server-only`.

## Migrations

- Create or apply migrations: `npx prisma migrate dev`.
- Production deployment: `npx prisma migrate deploy` (used in Dockerfile).
- After any schema change, run `npx prisma generate` to update the client (also runs automatically via `postinstall`).

## Database URLs

- Development: `DATABASE_URL="file:./dev.db"` → resolves to `prisma/dev.db`.
- Docker production: `DATABASE_URL="file:/app/data/notes.db"` → persisted via volume mount.
- Database files (`*.db`, `*.db-journal`, `*.db-shm`, `*.db-wal`) are gitignored.
