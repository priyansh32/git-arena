#!/usr/bin/env bash
set -euo pipefail

cd /workspace
git init
git config user.email "arena@gitarena.dev"
git config user.name "Git Arena"

echo "# Production App" > README.md
echo "module.exports = {};" > app.js
git add . && git commit -m "Initial commit"
git branch -M main

echo "more features" >> app.js
git add . && git commit -m "feat: add core features"
