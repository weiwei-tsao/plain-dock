---
name: git-commit
description: Run quality checks, draft a Conventional Commits message with ≤12-word description, and commit staged changes.
---

When invoked, execute the steps below in strict order. Do not skip or reorder.

## 1. Quality Gate

Run all three checks in parallel. If any fails, stop and report the error — do not proceed until all pass.

```bash
npm run lint
npm run format:check
npm run typecheck
```

## 2. Inspect Staged Changes

```bash
git status
git diff --staged
```

- If nothing is staged, stop and tell the user. Offer to show `git diff` so they can decide what to stage.
- If any of the following appear in staged files, **unstage them and warn** before proceeding:
  - `.env.local`, `.env.*` (except `.env.example`)
  - `*.db`, `*.db-journal`, `*.db-shm`, `*.db-wal`, `data/`
  - `node_modules/`, `.next/`, `next-env.d.ts`, `tsconfig.tsbuildinfo`

## 3. Draft the Commit Message

### Format

```
type(scope): description
```

### Types

| Type | When to use |
|------|-------------|
| `feat` | New capability or visible behaviour |
| `fix` | Bug correction |
| `refactor` | Code change with no behaviour change |
| `docs` | Documentation only |
| `style` | Formatting, whitespace, CSS tweaks |
| `chore` | Build, deps, tooling, config |
| `test` | Adding or fixing tests |
| `perf` | Performance improvement |
| `revert` | Reverting a prior commit |

### Scopes (this project)

`api` · `auth` · `db` · `editor` · `sidebar` · `sanitizer` · `docker` · `config` · `ui` · `responsive`

### Description rules

- **≤ 12 words** — count only the words after the colon; type and scope are not counted
- Imperative mood: `add`, `fix`, `remove` — not `added`, `fixes`, `removed`
- Lowercase, no trailing period

### Breaking change

Append `!` before the colon: `feat(api)!: remove content field from list endpoint`

### 12-word examples

```
✓ feat(editor): add back button and overflow menu for mobile        → 9 words
✓ fix(sidebar): hide collapse toggle on phone breakpoint            → 7 words
✓ chore(db): add prisma migration for note tags field               → 8 words
✗ feat(editor): add a new back button to the top of the editor header  → 14 words
```

If the draft exceeds 12 words, cut filler words first (`a`, `the`, `new`, `now`). If still over, consider splitting into two atomic commits.

## 4. Commit

Show the drafted message to the user and get confirmation. Then commit using a HEREDOC:

```bash
git commit -m "$(cat <<'EOF'
type(scope): description
EOF
)"
```
