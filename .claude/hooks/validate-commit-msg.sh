#!/bin/bash
# PreToolUse hook: Validate git commit message format
# Expected format: type(scope): description
# Only fires on Bash commands containing "git commit"

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

# Skip if not a git commit command
if ! echo "$COMMAND" | grep -q 'git commit'; then
  exit 0
fi

# Extract commit message from -m flag
# Handles: git commit -m "msg", git commit -m 'msg', git commit -m "$(cat <<'EOF'...EOF)"
MSG=$(echo "$COMMAND" | grep -oP '(?<=-m\s)["\x27]([^"\x27]*)["\x27]' | head -1 | sed "s/^[\"']//;s/[\"']$//")

# Also handle heredoc style: git commit -m "$(cat <<'EOF'\n...\nEOF\n)"
if [ -z "$MSG" ]; then
  MSG=$(echo "$COMMAND" | grep -oP '(?<=-m\s)"\$\(cat <<.*?EOF\n)(.*?)(?=\n.*?EOF)' | head -1)
fi

# If we can't extract the message, skip validation (don't block interactive commits)
if [ -z "$MSG" ]; then
  exit 0
fi

# Validate format: type(scope): description
# First line must match the pattern
FIRST_LINE=$(echo "$MSG" | head -1)
VALID_TYPES="feat|fix|refactor|docs|style|chore|test"
VALID_SCOPES="api|auth|db|editor|sidebar|sanitizer|docker|config"
PATTERN="^($VALID_TYPES)\(($VALID_SCOPES)\): .+"

if ! echo "$FIRST_LINE" | grep -qE "$PATTERN"; then
  # Output JSON to deny the action with feedback
  jq -n \
    --arg reason "Commit message does not match required format: type(scope): description

Valid types: feat, fix, refactor, docs, style, chore, test
Valid scopes: api, auth, db, editor, sidebar, sanitizer, docker, config

Example: feat(api): add note export endpoint

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

exit 0
