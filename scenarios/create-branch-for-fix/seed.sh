#!/usr/bin/env bash
set -euo pipefail

cd /workspace
git init
git config user.email "arena@gitarena.dev"
git config user.name "Git Arena"

cat > README.md <<'EOF'
# GitArnea

A small project for git practice.
EOF
git add README.md && git commit -m "Initial commit"
git branch -M main

echo "module.exports = {};" > app.js
git add app.js && git commit -m "chore: add app scaffold"

# Oracle: main must not move in this scenario
git update-ref refs/gitarena/oracles/create-branch-main "$(git rev-parse main)"
