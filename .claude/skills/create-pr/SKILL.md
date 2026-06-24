---
name: create-pr
description: Draft a PR title (≤12 words) and description (≤60 words) in English by diffing the current branch against a specified target branch.
---

When invoked, ask the user for the target branch if not provided, then follow the steps below.

## 1. Identify the Target Branch

If the user did not specify a target branch, ask before proceeding:

> Which branch should this PR merge into? (e.g. `dev`, `main`)

## 2. Inspect the Diff

Run both commands to understand the full scope of the PR:

```bash
git log <target>..HEAD --oneline
git diff <target>...HEAD --stat
```

Read the commit list and changed files carefully. Do not rely on the current branch name alone — the diff against the actual target branch determines what belongs in the PR.

## 3. Draft the Title

- **≤ 12 words**
- Starts with an action verb: `Add`, `Fix`, `Refactor`, `Update`, `Remove`
- Covers the primary change — if there are multiple themes, pick the most significant or group them with `and`
- No trailing period

Count words out loud before finalising. If over 12, cut filler words or shorten nouns.

```
✓ Add Claude Code skills, improve commit hooks, and update docs   → 10 words
✓ Implement 3-tier responsive layout for phone tablet and desktop → 9 words
✗ This PR adds a new set of Claude Code skills and also improves the commit hook validation → 18 words
```

## 4. Draft the Description

- **≤ 60 words**
- English, plain prose — no bullet points, no markdown headers
- Lead with the main functional change, then secondary changes
- End with the most minor change (docs, cleanup)

Count words before finalising. If over 60, cut one sentence or merge two into one.

## 5. Output Format

Present the result in this exact format, ready to copy-paste:

---

**Title**

\`\`\`
<title here>
\`\`\`
*(<N> words)*

---

**Description**

\`\`\`
<description here>
\`\`\`
*(<N> words)*

---

Do not submit the PR — output only. If the user wants to submit, they can run:

```bash
gh pr create --base <target> --title "<title>" --body "<description>"
```
