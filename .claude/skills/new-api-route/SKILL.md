---
name: new-api-route
description: Scaffold a new Next.js App Router API route with all project conventions — params, serialization, error handling, and response patterns.
---

Use when adding a new resource or sub-resource endpoint. The project follows strict patterns from `.claude/rules/api.md` — this skill generates compliant boilerplate.

## Before Writing Code

Answer these questions first:

1. **Is it a collection route or an individual resource route?**
   - Collection: `src/app/api/{resource}/route.ts` — handles `GET` (list) and `POST` (create)
   - Individual: `src/app/api/{resource}/[id]/route.ts` — handles `GET`, `PUT`, `DELETE`

2. **Does the response include a `Note`?**
   - Yes → always wrap the return with `serializeNote()` from `@/lib/serialize`
   - No → return the raw data directly

3. **Does the route accept a body?**
   - Yes → validate required fields, validate `mode` if present

---

## Collection Route Template

`src/app/api/{resource}/route.ts`

```ts
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { serializeNote } from '@/lib/serialize';

// GET /api/{resource}
export async function GET(_request: NextRequest) {
  const items = await prisma.note.findMany({
    omit: { content: true },
    orderBy: [{ isPinned: 'desc' }, { updatedAt: 'desc' }],
  });
  return NextResponse.json(items.map(serializeNote));
}

// POST /api/{resource}
export async function POST(_request: NextRequest) {
  const note = await prisma.note.create({ data: {} });
  return NextResponse.json(serializeNote(note), { status: 201 });
}
```

---

## Individual Resource Route Template

`src/app/api/{resource}/[id]/route.ts`

```ts
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { serializeNote } from '@/lib/serialize';

// GET /api/{resource}/:id
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const note = await prisma.note.findUnique({ where: { id } });
  if (!note) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json(serializeNote(note));
}

// PUT /api/{resource}/:id
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { title, content, textContent, mode, isPinned } = body as {
    title?: string;
    content?: string;
    textContent?: string;
    mode?: string;
    isPinned?: boolean;
  };

  if (mode !== undefined && mode !== 'PLAIN' && mode !== 'RICH') {
    return NextResponse.json({ error: 'Invalid mode. Must be PLAIN or RICH.' }, { status: 400 });
  }

  const existing = await prisma.note.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const note = await prisma.note.update({
    where: { id },
    data: {
      ...(title !== undefined && { title }),
      ...(content !== undefined && { content }),
      ...(textContent !== undefined && { textContent }),
      ...(mode !== undefined && { mode }),
      ...(isPinned !== undefined && { isPinned }),
    },
  });

  return NextResponse.json(serializeNote(note));
}

// DELETE /api/{resource}/:id
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const existing = await prisma.note.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  await prisma.note.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
```

---

## Key Rules (never skip)

| Rule | Why |
|------|-----|
| `const { id } = await params` | `params` is a Promise in Next.js 16 — not awaiting it causes a runtime error |
| Always call `serializeNote()` | Prisma returns `Date` objects; the client `Note` type expects ISO strings |
| Prefix unused request param with `_` | ESLint `no-unused-vars` will fail otherwise: `_request` |
| Validate `mode` if accepted in body | Reject with 400 for anything outside `'PLAIN' \| 'RICH'` |
| Use `{ status: 201 }` for POST creation | 200 is incorrect for resource creation |
| Use `{ error: string }` shape for all errors | Consistent with the existing API surface |

---

## After Scaffolding

1. Run `npm run typecheck` — catches missing imports or wrong return types
2. Run `npm run lint` — catches unused variables and import order
3. Update `src/lib/api-client.ts` if the new route is called from the client
4. Use `/git-commit` with scope `api`
