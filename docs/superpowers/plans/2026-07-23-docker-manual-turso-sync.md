# Docker Manual Turso Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a manual command that replaces the local Docker SQLite data with a Turso snapshot after creating a backup.

**Architecture:** Create a focused sync module under `scripts/` with testable helper functions and a thin CLI entry point. Use Prisma for both source Turso reads and target SQLite writes, and use `prisma migrate deploy` to prepare the target schema before importing.

**Tech Stack:** Node.js 20 ESM, Node built-in test runner, Prisma, `@prisma/adapter-libsql`, Docker SQLite file at `./data/notes.db`.

## Global Constraints

- Docker startup behavior stays unchanged.
- Sync is manually triggered only by `npm run docker:sync-from-turso`.
- Sync direction is Turso to Docker SQLite only.
- Existing Docker data is backed up before replacement.
- The default Docker database path is `./data/notes.db`.
- The command reads `.env`; shell environment variables override `.env`.
- No schema changes.

---

### Task 1: Testable Sync Helpers

**Files:**
- Create: `scripts/sync-turso-to-docker.test.mjs`
- Create: `scripts/sync-turso-to-docker.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `loadEnvFile(cwd, baseEnv)`, `resolveConfig(env, cwd)`, `createBackupIfExists(databasePath, now)`, `runCli()`.

- [ ] **Step 1: Write failing helper tests**

Create `scripts/sync-turso-to-docker.test.mjs` with tests for `.env` loading, missing env vars, default path resolution, and backup creation.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:sync`

Expected: fails because the test command or module does not exist.

- [ ] **Step 3: Add script module and npm test script**

Create `scripts/sync-turso-to-docker.mjs` with helper exports and add:

```json
"test:sync": "node --test scripts/sync-turso-to-docker.test.mjs"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:sync`

Expected: PASS.

### Task 2: Prisma Import Command

**Files:**
- Modify: `scripts/sync-turso-to-docker.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `resolveConfig(env, cwd)`, `createBackupIfExists(databasePath, now)`.
- Produces: CLI command `npm run docker:sync-from-turso`.

- [ ] **Step 1: Add failing CLI-shape test**

Extend tests to assert the package command exists and points to the sync script.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:sync`

Expected: fails because `docker:sync-from-turso` is not defined.

- [ ] **Step 3: Implement Prisma sync**

Implement CLI behavior:

- validate config
- run local `prisma migrate deploy`
- create backup
- read Turso folders and notes
- replace target SQLite data in a transaction
- print counts

- [ ] **Step 4: Run focused tests**

Run: `npm run test:sync`

Expected: PASS.

### Task 3: Documentation And Verification

**Files:**
- Modify: `README.md`
- Modify: `README.zh.md`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: CLI command `npm run docker:sync-from-turso`.

- [ ] **Step 1: Document manual command**

Add Docker sync sections explaining required env vars, backup behavior, and that the command replaces local Docker data.

- [ ] **Step 2: Run quality checks**

Run:

```bash
npm run test:sync
npm run typecheck
npm run lint
```

Expected: all pass.
