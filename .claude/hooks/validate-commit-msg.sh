#!/bin/bash
# PreToolUse hook: Validate git commit message format and word count
# Expected format: type(scope): description  (description ≤ 12 words)
# Only fires on Bash commands containing "git commit"

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

# Skip if not a git commit command
if ! echo "$COMMAND" | grep -q 'git commit'; then
  exit 0
fi

# Extract commit message from -m flag
# Handles: git commit -m "msg", git commit -m 'msg'
MSG=$(echo "$COMMAND" | grep -oP '(?<=-m\s)["\x27]([^"\x27]*)["\x27]' | head -1 | sed "s/^[\"']//;s/[\"']$//")

# Also handle heredoc style: git commit -m "$(cat <<'EOF'\n...\nEOF\n)"
if [ -z "$MSG" ]; then
  MSG=$(echo "$COMMAND" | grep -oP '(?<=-m\s)"\$\(cat <<.*?EOF\n)(.*?)(?=\n.*?EOF)' | head -1)
fi

# If we can't extract the message, skip validation (don't block interactive commits)
if [ -z "$MSG" ]; then
  exit 0
fi

FIRST_LINE=$(echo "$MSG" | head -1)
VALID_TYPES="feat|fix|refactor|docs|style|chore|test|perf|revert"
VALID_SCOPES="api|auth|db|editor|sidebar|sanitizer|docker|config|ui|responsive"
# Allow optional ! for breaking changes: feat(api)!: description
PATTERN="^($VALID_TYPES)\(($VALID_SCOPES)\)!?: .+"

# --- Check 1: format ---
if ! echo "$FIRST_LINE" | grep -qE "$PATTERN"; then
  jq -n \
    --arg reason "Commit message format invalid.

Required: type(scope): description

Valid types:  feat, fix, refactor, docs, style, chore, test, perf, revert
Valid scopes: api, auth, db, editor, sidebar, sanitizer, docker, config, ui, responsive
Breaking:     append ! before colon → feat(api)!: remove endpoint

Got: $FIRST_LINE" \
    '{
      "hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "deny",
        "permissionDecisionReason": $reason
      }
    }'
  exit 0
fi

# --- Check 2: description ≤ 12 words ---
# Extract description: everything after "type(scope): " or "type(scope)!: "
DESCRIPTION=$(echo "$FIRST_LINE" | sed 's/^[^:]*: //')
WORD_COUNT=$(echo "$DESCRIPTION" | wc -w | tr -d ' ')

if [ "$WORD_COUNT" -gt 12 ]; then
  jq -n \
    --arg reason "Commit description too long: $WORD_COUNT words (max 12).

Description: \"$DESCRIPTION\"

Shorten by cutting filler words (a, the, new, now) or split into two commits." \
    '{
      "hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "deny",
        "permissionDecisionReason": $reason
      }
    }'
  exit 0
fi

exit 0
