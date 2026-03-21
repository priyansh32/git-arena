#!/usr/bin/env bash
set -euo pipefail

cd /workspace
git init
git config user.email "arena@gitarena.dev"
git config user.name "Git Arena"

echo "stable content" > README.md
git add . && git commit -m "Initial commit"

git checkout HEAD~0  # enter detached HEAD
echo "hotfix line 1" >> README.md
git add . && git commit -m "Hotfix: patch line 1"

echo "hotfix line 2" >> README.md
git add . && git commit -m "Hotfix: patch line 2"

# Leave the user here in detached HEAD with 2 orphaned commits
