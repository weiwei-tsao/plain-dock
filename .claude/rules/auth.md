# Authentication & Middleware Patterns

## Authentication Model

- Single shared password set via `APP_PASSWORD` env var.
- Login: `POST /api/auth/login` validates password, signs JWT, sets httpOnly cookie.
- Logout: `POST /api/auth/logout` clears the session cookie.
- Session stored in httpOnly cookie named `plaindock_session` with 30-day expiry.

## JWT Handling

- Sign and verify tokens using `jsonwebtoken` via `@/lib/auth` (server-only).
- Secret from `JWT_SECRET` env var.
- `signToken()` returns a signed JWT; `verifyToken(token)` returns boolean.

## Middleware (`src/middleware.ts`)

- Runs in Edge Runtime — cannot use `jsonwebtoken` or any Node.js-only module.
- Performs lightweight JWT validation only: structure check (3 parts) + expiry check.
- Full cryptographic verification happens in API route handlers.
- Public paths (no auth required): `/login`, `/api/auth/*`.
- Unauthenticated API requests get `401 JSON`; unauthenticated page requests redirect to `/login`.

## Cookie Settings

- `httpOnly: true` — not accessible from JavaScript.
- `sameSite: 'lax'`.
- `secure: true` in production, `false` on localhost.
- `path: '/'`.

## Server-Only Constraint

- `@/lib/auth` imports `server-only` — never import it from `'use client'` components.
- Client-side auth interactions go through fetch calls to `/api/auth/*`.
