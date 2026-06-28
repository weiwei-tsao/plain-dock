# Fix Skill Bootstrap Prompt

Paste this prompt into Claude Code in any new repo to generate a customized fix skill.

---

## Prompt

```
Read CLAUDE.md (and any files it references, e.g. .claude/rules/) to understand this repo's
architecture, then generate a customized `.claude/skills/fix/SKILL.md` for this project.

Base the structure on this 5-phase template:

  Phase 1 — Gather Context (ask for: symptom, repro steps, environment, suspected area)
  Phase 2 — Trace the Full Data Flow (map the actual layers in THIS repo)
  Phase 3 — Present Diagnosis and wait for confirmation before writing any code
  Phase 4 — Implement the Fix with a project-specific checklist
  Phase 5 — Verify using this project's quality gate commands

For each section, replace the eldercare/plain-dock specifics with THIS repo's equivalents:

Phase 2 — Data flow layers:
  - Map the actual request/response path from UI action to DB and back
  - List the exact file paths at each hop (components, API layer, service/resolver, ORM, DB)
  - Identify cross-cutting concerns unique to this stack (auth middleware, caching, queues,
    i18n, feature flags, soft delete, serialization boundaries, stale closures, etc.)

Phase 4 checklist — include only checks that apply:
  - Server/client boundary violations (if applicable)
  - Missing auth/permission guards
  - Serialization steps before returning data
  - Type safety (no new `any`)
  - Hardcoded secrets or env var fallbacks
  - Any project-specific invariants from CLAUDE.md

Phase 5 — use the exact commands from CLAUDE.md (lint, typecheck, test runner, etc.)

Key Pitfalls section — populate from:
  - Actual bugs fixed in git log (git log --oneline -30)
  - Known footguns documented in CLAUDE.md or rules files
  - Any "never do X" patterns in the codebase comments

Reference links at the bottom — point to:
  - Architecture doc (CLAUDE.md)
  - Type definitions
  - Auth/permission helpers
  - Any shared config or constants file

Write the result to `.claude/skills/fix/SKILL.md`.
Use the frontmatter: `description: Structured bug diagnosis and resolution — no code changes until root cause is confirmed`
```

---

## Notes

- The prompt is intentionally high-level so Claude derives specifics from the actual repo rather than hallucinating
- Run it after CLAUDE.md exists and has meaningful content — the richer the CLAUDE.md, the better the output
- After generation, manually review the Key Pitfalls section and add any known footguns not in git history
- Re-run the prompt (or edit the skill directly) after major architectural changes
