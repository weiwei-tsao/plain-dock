#!/bin/bash
# PostToolUse hook: Check that 'use client' files don't import server-only modules
# Fires after Edit or Write on .ts/.tsx files

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

# Skip if not a TypeScript file
case "$FILE_PATH" in
  *.ts|*.tsx) ;;
  *) exit 0 ;;
esac

# Skip if file doesn't exist
if [ ! -f "$FILE_PATH" ]; then
  exit 0
fi

# Skip if file is not a client component
if ! grep -q "'use client'" "$FILE_PATH" 2>/dev/null; then
  exit 0
fi

# Check for server-only module imports
SERVER_MODULES="@/lib/db|@/lib/auth|@/lib/serialize"
VIOLATIONS=$(grep -nE "from ['\"]($SERVER_MODULES)['\"]" "$FILE_PATH" 2>/dev/null)

if [ -n "$VIOLATIONS" ]; then
  echo "{\"systemMessage\": \"Server-only import violation in $FILE_PATH:\\n$VIOLATIONS\\n\\nFiles with 'use client' must not import @/lib/db, @/lib/auth, or @/lib/serialize (they use server-only). Use @/lib/api-client instead.\"}"
fi

exit 0
