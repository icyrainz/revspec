#!/bin/bash
set -e

# Install/sync the revspec Claude Code skill to ~/.claude/skills/revspec/
# Run this after cloning the repo or pulling updates.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_SKILL="$SCRIPT_DIR/../skills/revspec"
LOCAL_SKILL="$HOME/.claude/skills/revspec"

if [ ! -f "$REPO_SKILL/SKILL.md" ]; then
  echo "Error: skill not found at $REPO_SKILL/SKILL.md"
  exit 1
fi

mkdir -p "$LOCAL_SKILL"
cp "$REPO_SKILL/SKILL.md" "$LOCAL_SKILL/SKILL.md"

echo "Installed revspec skill to $LOCAL_SKILL"
echo "Use /revspec in Claude Code to launch spec reviews."
