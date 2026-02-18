# Docker & Dockerfile Patterns

## Multi-Stage Build Overview

Three stages: `deps` → `builder` → `runner`.

- **deps**: installs all npm packages (including devDeps) and runs `prisma generate`
- **builder**: copies deps, runs `prisma migrate deploy` against a temp db, runs `next build`, then deletes the temp db
- **runner**: minimal production image using Next.js standalone output

## Key Constraints

### `public/` directory must exist
Next.js does not create `public/` automatically. The Dockerfile copies it unconditionally — if the directory is missing, the build fails with `not found`. The `public/.gitkeep` file keeps it tracked in git.

### Don't use `npx` in the runner
`npx` cannot reliably resolve binaries in the standalone runner environment. Use direct `node` invocation instead:
```
node ./node_modules/prisma/build/index.js migrate deploy
```
The bin entry for the `prisma` package is `build/index.js` (confirmed in `prisma/package.json`).

### Copy full `node_modules` from `deps` for the Prisma CLI
Next.js standalone output only bundles what the **app** needs at runtime — it does not include the Prisma CLI or its dependency tree (`effect`, `c12`, `empathic`, `deepmerge-ts`, etc.). Because `prisma` is a devDependency, it won't be in any production-only install either.

The runner copies the complete `node_modules` from the `deps` stage:
```dockerfile
COPY --from=deps /app/node_modules ./node_modules
```
Do **not** try to cherry-pick individual Prisma packages — the CLI dep tree is deep and will break with `MODULE_NOT_FOUND` errors.

## Startup Command

```dockerfile
CMD ["sh", "-c", "node ./node_modules/prisma/build/index.js migrate deploy && node server.js"]
```

Migrations run against the volume-mounted database (`/app/data/notes.db`) every time the container starts. This is intentional — it's a no-op if no new migrations exist.

## Data Persistence

- Database volume: `./data/notes.db` on the host → `/app/data/notes.db` in the container
- `DATABASE_URL` is hardcoded in `docker-compose.yml` as `file:/app/data/notes.db`
- `/app/data` is created and chowned to `nextjs` during the image build (`RUN mkdir -p /app/data && chown nextjs:nodejs /app/data`)
