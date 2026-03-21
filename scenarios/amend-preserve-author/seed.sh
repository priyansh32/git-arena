#!/usr/bin/env bash
set -euo pipefail

cd /workspace
git init
git config user.email "arena@gitarena.dev"
git config user.name "Git Arena"

echo "# App" > README.md
git add . && git commit -m "Initial commit"
git branch -M main

# Commit with the "wrong" author (scenario author), to be amended
echo "v1.0.0: initial release" > RELEASE.md
GIT_AUTHOR_NAME="Jane Doe" \
GIT_AUTHOR_EMAIL="jane@example.com" \
  git add . && \
GIT_AUTHOR_NAME="Jane Doe" \
GIT_AUTHOR_EMAIL="jane@example.com" \
  git commit -m "relase: v1.0.0 notes"  # intentional typo: 'relase'

# CHANGELOG.md was forgotten in the commit
echo "## v1.0.0 — Initial Release" > CHANGELOG.md
