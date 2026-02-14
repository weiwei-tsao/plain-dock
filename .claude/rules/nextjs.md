# Next.js Patterns & Shared Architecture

## App Router

- Uses Next.js 16 App Router with `src/` directory.
- Dev server: Turbopack (`next dev --turbopack`).
- Production: `output: 'standalone'` in `next.config.ts` for Docker deployment.
- Pages are in `src/app/`, API routes in `src/app/api/`.

## Path Alias

- `@/*` maps to `./src/*` (configured in `tsconfig.json`).
- Always use `@/` imports — never relative paths like `../../lib/`.

## Server vs Client Boundary

- Mark client components with `'use client'` directive at the top of the file.
- Server-only modules import `server-only` to prevent accidental client bundling:
  - `src/lib/db.ts` — Prisma client
  - `src/lib/auth.ts` — JWT sign/verify
  - `src/lib/serialize.ts` — Prisma-to-client type conversion
- Never import `server-only` modules from `'use client'` files — use API routes as the boundary.
- Client-side data fetching goes through `src/lib/api-client.ts` (`noteApi`).

## Shared Types (`src/types.ts`)

- Used by both server (API routes, serialize) and client (components, api-client).
- `NoteMode` enum: `PLAIN`, `RICH`
- `Note` interface: full note shape with ISO string dates
- `NotePayload`: write payload for create/update
- `SaveState`: `'IDLE' | 'SAVING' | 'SAVED' | 'FAILED'`
- Keep this file free of server-only or client-only imports.

## Constants Organization

- **Cross-cutting constants** → `src/lib/constants.ts` (safe for all runtimes: Edge, Node, client)
  - Currently: `COOKIE_NAME`, `MAX_AGE`
- **Feature-scoped constants** → in the relevant feature's config file
  - Sanitizer: `src/lib/sanitizer/config.ts` (`ALLOWED_TAGS`, `DANGEROUS_TAGS`, etc.)
- New constants: place in `constants.ts` if used across features, otherwise in the feature's own config.

## Environment Variables

- `DATABASE_URL` — Prisma connection string
- `APP_PASSWORD` — login password
- `JWT_SECRET` — JWT signing secret
- Set in `.env.local` for development (gitignored).
- Access via `process.env.*` — only available server-side in Next.js by default.
