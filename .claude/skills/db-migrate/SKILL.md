---
name: db-migrate
description: Full Prisma schema change workflow — edit schema, create migration, regenerate client, sync TypeScript types, verify.
---

Run when any change is made to `prisma/schema.prisma`. Follow every step in order; skipping steps leads to type drift or broken migrations.

## 1. Edit the Schema

File: `prisma/schema.prisma`

- Add, rename, or remove fields on the `Note` model.
- Set sensible defaults for new fields so existing rows are not broken:
  ```prisma
  newField  String  @default("")
  newFlag   Boolean @default(false)
  ```
- Never remove `@updatedAt` from `updatedAt` — it is managed by Prisma automatically.

## 2. Create and Apply the Migration

```bash
npx prisma migrate dev --name <short-slug>
```

- `<short-slug>` should describe the change in kebab-case: `add-tags-field`, `remove-legacy-column`.
- This command creates a new file under `prisma/migrations/` and applies it to `prisma/dev.db`.
- If the migration requires destructive changes (column drop, type change), Prisma will prompt — read the warning before accepting.

## 3. Regenerate the Prisma Client

```bash
npx prisma generate
```

- Always run this after `migrate dev`, even though `migrate dev` may run it automatically — the explicit call guarantees the client is up to date.

## 4. Sync TypeScript Types

Open `src/types.ts` and update:

**`Note` interface** — add or remove the field to match the schema:
```ts
export interface Note {
  // ... existing fields
  newField: string;   // add if new
}
```

**`NotePayload`** — add the field only if clients should be able to write it:
```ts
export interface NotePayload {
  // ... existing fields
  newField?: string;  // optional if not always required
}
```

If the field is internal (e.g., auto-computed server-side), do **not** add it to `NotePayload`.

## 5. Update Serialization if Needed

File: `src/lib/serialize.ts`

- Required only if the new field needs transformation (e.g., `Date` → ISO string, enum mapping).
- `createdAt` / `updatedAt` are already handled — don't re-serialize them.
- For primitive fields (`String`, `Boolean`, `Int`) Prisma returns them directly — no change needed.

## 6. Verify

```bash
npm run typecheck
```

All type errors must be zero before proceeding. Common failures after a schema change:
- `NotePayload` missing a new required field in an API route body
- `serializeNote` return type not matching the updated `Note` interface
- API route spreading `body` without including the new field in the `data` object

## 7. Commit

Use `/git-commit` with scope `db`:
```
chore(db): add <field-name> field to Note model
```
