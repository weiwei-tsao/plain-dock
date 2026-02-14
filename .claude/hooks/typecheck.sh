#!/bin/bash
# PostToolUse hook (async): Run TypeScript type check after file edits
# Only fires for .ts/.tsx files under src/

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

# Skip if not a TypeScript file in src/
case "$FILE_PATH" in
  */src/*.ts|*/src/*.tsx) ;;
  *) exit 0 ;;
esac

# Run type check
cd "$CLAUDE_PROJECT_DIR" || exit 0
OUTPUT=$(npm run typecheck 2>&1)
EXIT_CODE=$?

if [ $EXIT_CODE -ne 0 ]; then
  # Trim output to avoid overly long messages
  TRIMMED=$(echo "$OUTPUT" | head -30)
  echo "{\"systemMessage\": \"TypeScript errors detected:\\n$TRIMMED\"}"
fi

exit 0
