---
name: deploy
description: Pre-deploy quality gate followed by Docker build and container launch. Stops on any failure.
---

Run before every deployment. The gate must be fully green before touching Docker.

## 1. Quality Gate

Run all checks. **Stop on first failure** — do not proceed to Docker with broken code.

```bash
npm run lint
npm run format:check
npm run typecheck
npm run build
```

Report each result clearly. If any fails, show the error output and stop.

> `npm run build` catches errors that `typecheck` misses (e.g., missing `'use client'` on components using browser APIs, invalid server/client boundary crossings).

---

## 2. Check the Environment File

Verify `.env` exists at the project root and contains both required secrets:

```bash
grep -q "APP_PASSWORD" .env && grep -q "JWT_SECRET" .env && echo "OK" || echo "MISSING SECRETS"
```

- `DATABASE_URL` is **not** required in `.env` for Docker — it is hardcoded in `docker-compose.yml` as `file:/app/data/notes.db`.
- If either secret is missing, stop and prompt the user to add it before proceeding.

---

## 3. Docker Build and Launch

```bash
docker compose down
docker compose up -d --build
```

- `down` first ensures a clean restart and avoids port conflicts.
- `--build` forces a rebuild of the image — required after any code change.
- The container runs migrations automatically on startup (`prisma migrate deploy` in `CMD`).

---

## 4. Verify the Container

```bash
docker compose ps
docker compose logs --tail=30
```

Look for:
- Container status: `Up` (not `Exited`)
- Log lines confirming migration applied: `All migrations have been successfully applied` or `No pending migrations`
- No `Error` or `Cannot find module` lines in the log

---

## 5. Smoke Test

Open `http://localhost:3000` (or the configured host). Confirm:
- Login page loads
- Login with `APP_PASSWORD` succeeds
- Note list and editor are functional

---

## Failure Reference

| Symptom | Likely cause |
|---------|--------------|
| `Cannot find module '.../prisma/build/index.js'` | `node_modules` not copied in runner stage — see `docker.md` |
| Container exits immediately | Check `docker compose logs` for migration error or missing env var |
| `MODULE_NOT_FOUND` for Prisma deps | Cherry-picked Prisma packages in runner — must copy full `node_modules` |
| Port already in use | Another process on port 3000 — run `lsof -i :3000` |
| Login fails with correct password | `APP_PASSWORD` mismatch between `.env` and what was used to hash — rebuild container |
