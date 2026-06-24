# Git Commit & Branching Conventions

## Commit Message Format

```
type(scope): description
```

- **type**: `feat`, `fix`, `refactor`, `docs`, `style`, `chore`, `test`
- **scope**: matches project areas — `api`, `auth`, `db`, `editor`, `sidebar`, `sanitizer`, `docker`, `config`
- **description**: imperative mood, lowercase, no period at end, **≤ 12 words**

Examples:
```
feat(api): add note export endpoint
fix(editor): prevent race condition on rapid saves
refactor(sanitizer): extract tag normalization to separate module
docs(config): update env variable documentation
style(sidebar): adjust search input border radius
chore(db): add prisma migration for tags field
```

## Commit Scope

- Keep commits atomic — one logical change per commit.
- Separate refactors from feature changes.
- Schema migrations get their own commit.

## Pre-Commit Quality Checks

Before committing, ensure all checks pass:
- `npm run lint` — ESLint (enforced via hooks)
- `npm run format:check` — Prettier formatting
- `npm run typecheck` — TypeScript type check (enforced via hooks)

## Files to Never Commit

- `.env.local` and any `.env.*` files (except `.env.example`)
- Database files: `*.db`, `*.db-journal`, `*.db-shm`, `*.db-wal`
- `data/` directory (Docker volume mount)
- `node_modules/`
- `.next/` build output
- `next-env.d.ts` (auto-generated)
- `tsconfig.tsbuildinfo` (TypeScript incremental build cache)
