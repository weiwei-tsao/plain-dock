# API Route Conventions

## Structure

- All API routes live in `src/app/api/` using Next.js App Router Route Handlers.
- Group by resource: `api/notes/route.ts` (collection), `api/notes/[id]/route.ts` (individual).
- Export named functions matching HTTP methods: `GET`, `POST`, `PUT`, `DELETE`.

## Request Handling

- `params` is a `Promise` in Next.js 16 — always `await` it:
  ```ts
  const { id } = await params;
  ```
- Parse request body with `await request.json()`.
- Validate the `mode` field against `'PLAIN' | 'RICH'` — reject with 400 if invalid.

## Response Patterns

- Success: return `NextResponse.json(data)` with appropriate status (200 default, 201 for creation).
- Errors: return `NextResponse.json({ error: string }, { status: number })`.
- Always serialize Prisma notes via `serializeNote()` from `@/lib/serialize` before returning.

## Performance

- The notes list endpoint (`GET /api/notes`) omits the `content` field for lightweight responses — use Prisma's `omit` option.
- Full note content is fetched per-note via `GET /api/notes/[id]`.
