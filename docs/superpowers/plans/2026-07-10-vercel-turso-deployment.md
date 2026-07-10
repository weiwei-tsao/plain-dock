# Vercel Turso Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Turso/libSQL runtime path for Vercel while preserving local file SQLite and Docker file SQLite.

**Architecture:** Keep `prisma/schema.prisma` on SQLite and keep the existing `Note` model/migrations. `src/lib/db.ts` remains the single Prisma singleton export, but it chooses between normal Prisma SQLite and Prisma's libSQL adapter based on `DATABASE_URL`. Documentation explains the three supported deployment modes and keeps Turso migrations manual.

**Tech Stack:** Next.js 16, Prisma 6.19, SQLite, Turso/libSQL, `@prisma/adapter-libsql`, TypeScript strict.

---

## File Structure

- Modify: `package.json`
  - Add Turso/libSQL runtime dependency through `npm install`.
- Modify: `package-lock.json`
  - Updated by `npm install @prisma/adapter-libsql`.
- Modify: `src/lib/db.ts`
  - Centralized Prisma runtime connection selection.
  - Preserve local/Docker SQLite behavior.
  - Add Turso/libSQL adapter path.
- Modify: `README.md`
  - Document local SQLite, Docker SQLite, and Vercel Turso setup.
- Modify: `README.zh.md`
  - Mirror deployment docs in Chinese.
- Modify: `CLAUDE.md`
  - Update environment-variable and deployment guidance for future agents.

## Global Constraints

- Do not change `prisma/schema.prisma`.
- Do not change existing migration SQL files.
- Do not change API route behavior.
- Do not make Docker use Turso by default.
- Do not add Vercel build-time automatic migrations.
- Turso migrations remain an operator task: apply `prisma/migrations/*/migration.sql` files with Turso CLI or the Turso dashboard SQL console.
- There is no test runner configured in this repo. Verification is static checks, build, and manual runtime checks.

---

### Task 1: Add Turso Dependency

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Install libSQL adapter dependency**

Run:

```bash
npm install @prisma/adapter-libsql@6.19.2
```

Expected:
- `package.json` gains an exact `@prisma/adapter-libsql` entry under `dependencies`.
- `package-lock.json` updates with the resolved dependency tree.
- The transitive `@libsql/client` version is owned by the adapter package.

If the command fails because the sandbox blocks registry access, rerun the same command with escalated permissions.

- [ ] **Step 2: Verify dependency install**

Run:

```bash
npm run typecheck
```

Expected:
- PASS with `tsc --noEmit`.
- No code imports the new dependency yet, so this verifies the install did not break generated Prisma types.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(db): add turso prisma dependency"
```

---

### Task 2: Add Runtime Prisma Connection Selection

**Files:**
- Modify: `src/lib/db.ts`

- [ ] **Step 1: Replace `src/lib/db.ts` with the provider-selecting singleton**

Replace the entire current file:

```ts
import 'server-only';
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma || new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

// Enable WAL mode for better concurrent read/write performance
prisma.$executeRawUnsafe('PRAGMA journal_mode = WAL;').catch(() => {});
```

with:

```ts
import 'server-only';
import { PrismaClient } from '@prisma/client';
import { PrismaLibSQL } from '@prisma/adapter-libsql';

const databaseUrl = process.env.DATABASE_URL ?? '';
const isLibSqlUrl = databaseUrl.startsWith('libsql://') || databaseUrl.startsWith('https://');

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrismaClient() {
  if (!isLibSqlUrl) {
    return new PrismaClient();
  }

  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!authToken) {
    throw new Error('TURSO_AUTH_TOKEN is required when DATABASE_URL uses libSQL/Turso.');
  }

  const adapter = new PrismaLibSQL({
    url: databaseUrl,
    authToken,
  });

  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma || createPrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

// Enable WAL mode for local file-backed SQLite. Turso/libSQL is remote and does not use this pragma.
if (!isLibSqlUrl) {
  prisma.$executeRawUnsafe('PRAGMA journal_mode = WAL;').catch(() => {});
}
```

Important implementation note: if TypeScript reports that the adapter class name differs after dependency installation, inspect the installed package types in `node_modules/@prisma/adapter-libsql` and adjust only the import/class name. Keep the runtime behavior and error handling exactly as described in this task.

- [ ] **Step 2: Verify local SQLite type safety**

Run:

```bash
npm run typecheck
```

Expected:
- PASS with `tsc --noEmit`.

- [ ] **Step 3: Verify Turso missing-token failure is explicit**

Run:

```bash
DATABASE_URL="libsql://example.turso.io" TURSO_AUTH_TOKEN="" npm run typecheck
```

Expected:
- PASS, because typecheck does not execute `src/lib/db.ts`.

Then run:

```bash
DATABASE_URL="libsql://example.turso.io" TURSO_AUTH_TOKEN="" npm run build
```

Expected:
- Build may fail when Next.js evaluates server modules.
- If it fails, the error must include `TURSO_AUTH_TOKEN is required when DATABASE_URL uses libSQL/Turso.`.
- If it does not evaluate the DB module during build and therefore passes, continue; runtime API requests will still surface the explicit error.

- [ ] **Step 4: Verify local SQLite build path**

Run:

```bash
DATABASE_URL="file:./dev.db" npm run build
```

Expected:
- PASS.
- Any existing framework warning about `middleware`/`proxy` is unrelated to this task.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db.ts
git commit -m "feat(db): support turso libsql runtime"
```

---

### Task 3: Document Vercel Turso Deployment In English

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update the feature list storage bullet**

In `README.md`, replace this feature bullet:

```md
- **SQLite storage** - persistent data via Prisma with WAL mode; no external database required
```

with:

```md
- **SQLite-compatible storage** - local/Docker use file SQLite; Vercel can use Turso/libSQL
```

- [ ] **Step 2: Update Getting Started environment text**

In `README.md`, under `## Getting Started`, keep the current local `.env` example but add this paragraph immediately after it:

```md
This local path uses file-backed SQLite. `TURSO_AUTH_TOKEN` is not needed unless `DATABASE_URL` points to Turso/libSQL.
```

- [ ] **Step 3: Replace Docker database note**

In `README.md`, under `## Docker Deployment`, replace:

```md
> `DATABASE_URL` is not needed - it is hardcoded in `docker-compose.yml`.
```

with:

```md
> `DATABASE_URL` is not needed for Docker - it is hardcoded in `docker-compose.yml` as `file:/app/data/notes.db`.
```

- [ ] **Step 4: Add a Vercel deployment section**

In `README.md`, insert this section after the Docker Deployment section and before `## Scripts`:

````md
## Vercel Deployment with Turso

Vercel serverless functions cannot persist writes to a local SQLite file. Use Turso/libSQL for Vercel while keeping the Prisma schema on SQLite.

1. Create a Turso database and auth token.

2. Set Vercel environment variables:
   ```env
   DATABASE_URL="libsql://your-db.turso.io"
   TURSO_AUTH_TOKEN="your-token"
   APP_PASSWORD="your-password"
   JWT_SECRET="your-secret"
   ```

3. Apply the Prisma migration SQL files to Turso manually with Turso CLI or the Turso dashboard SQL console. For a fresh database, apply the migration files in timestamp order:
   ```bash
   turso db shell your-database < prisma/migrations/20260214025810_init/migration.sql
   turso db shell your-database < prisma/migrations/20260628035117_empty_title_default/migration.sql
   ```
   Apply any future `prisma/migrations/*/migration.sql` files the same way before deploying code that depends on them.

4. Deploy to Vercel.

For existing local SQLite data, back up the database first, import it with Turso CLI tooling, verify the remote `Note` rows, then apply any schema migration SQL files that are not already represented in the imported database. Do not rely on Vercel's filesystem for note persistence.
````

- [ ] **Step 5: Update Architecture server library description**

In `README.md`, replace:

```md
  │     ├── db.ts                   Prisma singleton (server-only)
```

with:

```md
  │     ├── db.ts                   Prisma singleton; file SQLite or Turso/libSQL by DATABASE_URL
```

- [ ] **Step 7: Update Tech Stack bullet**

In `README.md`, replace:

```md
- **Prisma** + **SQLite** (WAL mode)
```

with:

```md
- **Prisma** + **SQLite/libSQL** (file SQLite locally/in Docker, Turso on Vercel)
```

- [ ] **Step 8: Verify docs formatting**

Run:

```bash
npm run format:check
```

Expected:
- PASS. This repo's formatter only checks `src/**/*`, so README formatting is verified by visual inspection.

- [ ] **Step 9: Commit**

```bash
git add README.md
git commit -m "docs(db): explain vercel turso deployment"
```

---

### Task 4: Document Vercel Turso Deployment In Chinese

**Files:**
- Modify: `README.zh.md`

- [ ] **Step 1: Update the Chinese feature storage bullet**

In `README.zh.md`, replace the existing SQLite storage feature bullet with:

```md
- **SQLite 兼容存储** - 本地和 Docker 使用文件 SQLite；Vercel 可使用 Turso/libSQL
```

- [ ] **Step 2: Add local Turso token note**

In `README.zh.md`, under the local `.env` example in the getting-started section, add:

```md
这是本地文件 SQLite 路径。只有当 `DATABASE_URL` 指向 Turso/libSQL 时才需要 `TURSO_AUTH_TOKEN`。
```

- [ ] **Step 3: Clarify Docker database note**

In `README.zh.md`, under Docker deployment, replace the existing note that says `DATABASE_URL` is configured by Docker Compose with:

```md
> Docker 不需要手动设置 `DATABASE_URL`，`docker-compose.yml` 已固定为 `file:/app/data/notes.db`。
```

- [ ] **Step 4: Add Chinese Vercel deployment section**

In `README.zh.md`, insert this section after Docker deployment and before the scripts section:

````md
## Vercel + Turso 部署

Vercel 的 Serverless 函数不能把本地 SQLite 文件当作持久存储。部署到 Vercel 时使用 Turso/libSQL，本地和 Docker 仍然继续使用文件 SQLite。

1. 创建 Turso 数据库和 auth token。

2. 在 Vercel 设置环境变量：
   ```env
   DATABASE_URL="libsql://your-db.turso.io"
   TURSO_AUTH_TOKEN="your-token"
   APP_PASSWORD="你的访问密码"
   JWT_SECRET="你的 JWT 密钥"
   ```

3. 使用 Turso CLI 或 Turso 控制台 SQL Console，把 Prisma 迁移 SQL 文件手动应用到 Turso。新数据库按时间顺序执行：
   ```bash
   turso db shell your-database < prisma/migrations/20260214025810_init/migration.sql
   turso db shell your-database < prisma/migrations/20260628035117_empty_title_default/migration.sql
   ```
   以后每次新增 `prisma/migrations/*/migration.sql` 后，都要先用同样方式应用到 Turso，再部署依赖这些迁移的代码。

4. 部署到 Vercel。

如果要迁移已有的本地 SQLite 数据，请先备份数据库文件，再用 Turso CLI 工具导入数据，确认远程 `Note` 记录无误后，再应用导入数据中尚未包含的迁移 SQL 文件。不要依赖 Vercel 的本地文件系统保存笔记。
````

- [ ] **Step 5: Update Chinese architecture db line**

In `README.zh.md`, replace the `src/lib/db.ts` architecture line with:

```md
  ┃     ├── db.ts                   Prisma 单例；按 DATABASE_URL 使用文件 SQLite 或 Turso/libSQL
```

If the surrounding tree uses a different line-prefix character because of existing encoding, preserve the surrounding indentation style and only replace the description text after `db.ts`.

- [ ] **Step 7: Update Chinese tech stack bullet**

In `README.zh.md`, replace the Prisma/SQLite tech stack bullet with:

```md
- **Prisma** + **SQLite/libSQL** - 本地和 Docker 使用文件 SQLite，Vercel 使用 Turso
```

- [ ] **Step 8: Verify file renders as Markdown**

Run:

```bash
git diff -- README.zh.md
```

Expected:
- The new section is readable Chinese Markdown.
- No unrelated content is rewritten.

- [ ] **Step 9: Commit**

```bash
git add README.zh.md
git commit -m "docs(db): add chinese turso deployment guide"
```

---

### Task 5: Update Agent Guidance

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update environment variable guidance**

In `CLAUDE.md`, replace the current `## Environment Variables` section content with:

```md
## Environment Variables

**Local development** - set all three in `.env` (recommended) or `.env.local` (both gitignored):
- `DATABASE_URL` - Prisma connection string (default: `file:./dev.db`, stored at `prisma/dev.db`)
- `APP_PASSWORD` - Single shared password for login
- `JWT_SECRET` - Secret for signing JWT tokens

**Docker** - only `APP_PASSWORD` and `JWT_SECRET` are needed in `.env`; `DATABASE_URL` is hardcoded in `docker-compose.yml` as `file:/app/data/notes.db`.

**Vercel + Turso** - set all four in Vercel project settings:
- `DATABASE_URL` - Turso/libSQL connection string, e.g. `libsql://your-db.turso.io`
- `TURSO_AUTH_TOKEN` - Turso database auth token
- `APP_PASSWORD` - Single shared password for login
- `JWT_SECRET` - Secret for signing JWT tokens

**Important:** Prisma CLI reads `.env` by default. If using `.env.local`, add `--env-file .env.local` to Prisma commands. Next.js reads both files (with `.env.local` taking precedence). `TURSO_AUTH_TOKEN` is required only when `DATABASE_URL` points to Turso/libSQL.
```

- [ ] **Step 2: Update stack summary**

In `CLAUDE.md`, replace:

```md
**Stack:** Next.js 16 (App Router, Turbopack), React 19, TypeScript (strict), Prisma + SQLite, Tailwind CSS v4 (PostCSS plugin), Tiptap rich text editor, Lucide icons. Docker-ready with standalone output.
```

with:

```md
**Stack:** Next.js 16 (App Router, Turbopack), React 19, TypeScript (strict), Prisma + SQLite/libSQL, Tailwind CSS v4 (PostCSS plugin), Tiptap rich text editor, Lucide icons. Docker-ready with standalone output; Vercel-ready with Turso.
```

- [ ] **Step 3: Update server-side `db.ts` guidance**

In `CLAUDE.md`, replace:

```md
- `src/lib/db.ts` - Singleton PrismaClient with WAL mode enabled. Imports `server-only`.
```

with:

```md
- `src/lib/db.ts` - Singleton PrismaClient. Uses file SQLite for `DATABASE_URL=file:...` with WAL mode enabled; uses Turso/libSQL adapter for `DATABASE_URL=libsql://...` or `https://...`. Imports `server-only`.
```

- [ ] **Step 4: Add Vercel running guidance**

In `CLAUDE.md`, after the Docker running section, add:

````md
### Vercel + Turso

```bash
turso db shell your-database < prisma/migrations/20260214025810_init/migration.sql
turso db shell your-database < prisma/migrations/20260628035117_empty_title_default/migration.sql
```

- Requires a Turso database and auth token.
- Set `DATABASE_URL`, `TURSO_AUTH_TOKEN`, `APP_PASSWORD`, and `JWT_SECRET` in Vercel.
- Apply migration SQL files to Turso manually with Turso CLI or the Turso dashboard SQL console.
- Prisma Migrate CLI targets local/Docker SQLite here; do not use `DATABASE_URL=libsql://... prisma migrate deploy`.
- Apply future `prisma/migrations/*/migration.sql` files in timestamp order before deploying code that depends on them.
- Migrations are manual; do not add automatic Vercel build-time migrations unless explicitly requested.
- Vercel cannot persist notes to a local SQLite file.
````

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(config): document turso environment modes"
```

---

### Task 6: Full Verification

**Files:**
- Verify: `package.json`
- Verify: `package-lock.json`
- Verify: `src/lib/db.ts`
- Verify: `README.md`
- Verify: `README.zh.md`
- Verify: `CLAUDE.md`

- [ ] **Step 1: Run static checks**

Run:

```bash
npm run typecheck && npm run lint && npm run format:check
```

Expected:
- PASS for all three commands.

- [ ] **Step 2: Run production build with local SQLite URL**

Run:

```bash
DATABASE_URL="file:./dev.db" npm run build
```

Expected:
- PASS.
- Existing framework warnings are acceptable if they are unrelated to this change.

- [ ] **Step 3: Verify local SQLite startup**

Run:

```bash
DATABASE_URL="file:./dev.db" npm run dev
```

Expected:
- Next.js starts on port 3000.

Manual browser check:
- Log in.
- Load the note list.
- Create a note.
- Edit the note.
- Refresh the page.
- Confirm the note persists.

If the sandbox blocks port binding, rerun `npm run dev` with escalated permissions and document that the first failure was sandbox-related.

- [ ] **Step 4: Verify explicit Turso-token error path**

Run:

```bash
DATABASE_URL="libsql://example.turso.io" TURSO_AUTH_TOKEN="" npm run build
```

Expected:
- Either build passes because the database module is not evaluated during build, or it fails with the explicit `TURSO_AUTH_TOKEN is required when DATABASE_URL uses libSQL/Turso.` message.
- Any other failure should be investigated before continuing.

- [ ] **Step 5: Verify real Turso runtime path if credentials are available**

If the user provides a real Turso database URL and token, first apply migration SQL files with Turso CLI or the Turso dashboard SQL console. Then run:

```bash
DATABASE_URL="libsql://your-db.turso.io" TURSO_AUTH_TOKEN="your-token" npm run build
```

Expected:
- The migration SQL files apply cleanly before the build.
- `npm run build` passes.

If credentials are not available, record that real Turso verification was not run.

- [ ] **Step 6: Verify Docker path if Docker is available**

Run:

```bash
docker compose up -d --build
docker compose logs --tail=80 plaindock
docker compose down
```

Expected:
- Container builds and starts.
- Logs show the app starts successfully after migrations.
- `docker compose down` stops the container.

If Docker is unavailable in the environment, record that Docker verification was not run.

- [ ] **Step 7: Commit any formatting-only changes**

If verification caused formatting-only changes, run:

```bash
git add package.json package-lock.json src/lib/db.ts README.md README.zh.md CLAUDE.md
git commit -m "style(db): format turso deployment changes"
```

If there are no additional changes, do not create an empty commit.

---

## Self-Review

- Spec coverage: Tasks cover dependencies, runtime connection selection, manual migration script, local/Docker/Vercel docs, agent guidance, and verification.
- Placeholder scan: No unfinished-work markers or undefined future work remains. Example values such as `your-db.turso.io` are intentional documentation examples.
- Type consistency: The plan consistently uses `DATABASE_URL`, `TURSO_AUTH_TOKEN`, `isLibSqlUrl`, `createPrismaClient`, and `PrismaLibSQL`.
- Scope check: The plan does not change schema, migrations, API behavior, Docker's default SQLite path, or Vercel build-time migration behavior.
