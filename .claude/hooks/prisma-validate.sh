#!/bin/bash
# PostToolUse hook: Validate Prisma schema after edits
# Only fires when schema.prisma is modified

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

# Skip if not the Prisma schema file
case "$FILE_PATH" in
  */prisma/schema.prisma) ;;
  *) exit 0 ;;
esac

# Run prisma validate
cd "$CLAUDE_PROJECT_DIR" || exit 0
OUTPUT=$(npx prisma validate 2>&1)
EXIT_CODE=$?

if [ $EXIT_CODE -ne 0 ]; then
  echo "{\"systemMessage\": \"Prisma schema validation failed:\\n$OUTPUT\"}"
fi

exit 0
