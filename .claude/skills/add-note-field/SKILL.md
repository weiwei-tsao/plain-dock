---
name: add-note-field
description: End-to-end guide for adding a new field to the Note model — touches 6 files across schema, types, API, serialization, API client, and UI.
---

Adding a field to `Note` is the most common extension task. It spans the full stack. Follow every step — missing one causes type errors or silent data loss.

## File Touch Map

```
prisma/schema.prisma          ← define the field
src/types.ts                  ← add to Note interface and optionally NotePayload
src/lib/serialize.ts          ← only if field needs transformation
src/app/api/notes/route.ts    ← list endpoint (omit from SELECT if heavy)
src/app/api/notes/[id]/route.ts ← detail + PUT (accept new field in body)
src/lib/api-client.ts         ← update NotePayload sent on PUT/POST
UI components                 ← display or edit the new field
```

---

## Step 1 — Schema

`prisma/schema.prisma` → add field to the `Note` model with a default so existing rows are not broken:

```prisma
model Note {
  // existing fields...
  newField  String  @default("")
}
```

Then run the full migration workflow:

```bash
npx prisma migrate dev --name add-<field-name>-to-note
npx prisma generate
```

---

## Step 2 — TypeScript Types

`src/types.ts`:

```ts
export interface Note {
  // existing fields...
  newField: string;
}

export interface NotePayload {
  // existing fields...
  newField?: string;   // add only if clients should write this field
}
```

Skip adding to `NotePayload` if the field is server-managed (auto-computed, admin-only, etc.).

---

## Step 3 — Serialization

`src/lib/serialize.ts` — only needed if the field requires transformation:

- `Date` → ISO string: add `.toISOString()` conversion
- Enum mapping: convert Prisma enum to the `NoteMode` type
- Primitive fields (`String`, `Boolean`, `Int`, `Float`) pass through automatically — no change needed

---

## Step 4 — List API Route

`src/app/api/notes/route.ts` (GET):

If the field is large (e.g., long text), add it to the `omit` option so the list endpoint stays lightweight:

```ts
const notes = await prisma.note.findMany({
  omit: { content: true, newField: true },  // omit heavy fields
  orderBy: [{ isPinned: 'desc' }, { updatedAt: 'desc' }],
});
```

If the field is small (boolean, short string), no change needed — it will be included automatically.

---

## Step 5 — Detail + Update API Route

`src/app/api/notes/[id]/route.ts`:

**GET** — no change needed; `findUnique` returns all fields.

**PUT** — destructure the new field from `body` and include it in the `data` object:

```ts
const { title, content, textContent, mode, isPinned, newField } = body;

const note = await prisma.note.update({
  where: { id },
  data: {
    // existing spread...
    ...(newField !== undefined && { newField }),
  },
});
```

---

## Step 6 — API Client

`src/lib/api-client.ts`:

If `NotePayload` was updated to include the new field, verify that the `update()` call passes it through. The client sends whatever is in the `NotePayload` — no manual mapping needed if the interface is correct.

---

## Step 7 — UI

Update components as needed:

- **Display only** — read `note.newField` directly in `EditorCanvas.tsx` or `Sidebar.tsx`
- **Editable** — add local state + `triggerSave` / `persistChange` call following the existing pattern in `EditorCanvas.tsx`
- **Sidebar list** — only add if needed for search or display; keep list items lightweight

---

## Step 8 — Verify

```bash
npm run typecheck
npm run lint
```

Common failure points:
- `NotePayload` updated but `api-client.ts` not passing the field in the PUT body
- New field in `Note` interface but not returned by `serializeNote` (if you added a transform)
- PUT handler not including the new field in the Prisma `data` object

---

## Step 9 — Commit

This change usually warrants two commits (schema separate from UI):

```
chore(db): add <field-name> field to Note model
feat(<scope>): surface <field-name> in <component>
```

Use `/git-commit` for each.
